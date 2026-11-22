package expo.modules.usagemonitor

import android.app.Service
import android.app.KeyguardManager
import android.os.PowerManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt

/**
 * The doomscroll detector. Every few seconds it reads which app is in front,
 * scores the session with the same risk model as the app, and — within
 * guardrails and cooldowns — posts a study nudge, a wind-down, or brings up
 * the guardian lock. Everything it decides is reported to the server.
 */
class MonitorService : Service() {
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var tracker: Tracker? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val cfg = Store.config(this)
    Notifier.channels(this)
    Notifier.cancelCountdown(this)
    Notifier.cancelNudge(this)
    try {
      ServiceCompat.startForeground(
        this,
        Notifier.MONITOR_ID,
        Notifier.monitor(this, cfg),
        if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
      )
    } catch (e: Exception) {
      Log.w(TAG, "could not start in foreground: ${e.message}")
      stopSelf()
      return START_NOT_STICKY
    }
    if (thread == null) {
      thread = HandlerThread("learnshift-monitor").also { it.start() }
      handler = Handler(thread!!.looper)
      tracker = Tracker(this)
      running = true
      handler!!.post(tick)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    ScrollGate.clear()
    OverlayController.dismiss(this)
    handler?.removeCallbacksAndMessages(null)
    thread?.quitSafely()
    thread = null
    handler = null
    super.onDestroy()
  }

  private val tick: Runnable = object : Runnable {
    override fun run() {
      val next = try {
        step()
      } catch (e: Exception) {
        Log.w(TAG, "tick failed: ${e.message}")
        30_000L
      }
      if (next < 0) {
        stopSelf()
        return
      }
      handler?.postDelayed(this, next)
    }
  }

  private var launchers: Set<String>? = null
  private var activeAccumMs = 0L
  private var lastTickAt = 0L
  private var lastTargetPkg: String? = null
  private var lastRecordedUsedPkg: String? = null
  private var lastIndicator: String? = null

  /** One detection pass. Returns the delay until the next pass, or -1 to stop. */
  private fun step(): Long {
    val next = decide()
    if (next >= 0) {
      val cfg = Store.config(this)
      val seconds = ((cfg.overlayIntervalSec * 1000L - activeAccumMs).coerceAtLeast(0) + 999) / 1000
      val indicator = when {
        cfg.paused -> if (cfg.fil) "Naka-pause ang learning breaks" else "Learning breaks paused"
        OverlayController.isShowing() -> if (cfg.fil) "Kasalukuyang learning break" else "Learning break in progress"
        ScrollGate.isArmed() || OverlayController.isGateShowing() -> if (cfg.fil) "Tapos na ang timer · Mag-swipe pataas para sa break" else "Timer done · Waiting for your next upward swipe"
        lastTargetPkg != null -> if (cfg.fil) "Susunod na learning break: ${seconds}s" else "Next learning break: ${seconds}s"
        else -> if (cfg.fil) "Maghihintay sa suportadong app" else "Waiting for a supported app"
      }
      if (indicator != lastIndicator) {
        lastIndicator = indicator
        runCatching {
          val manager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
          manager.notify(Notifier.MONITOR_ID, Notifier.monitor(this, cfg, indicator))
        }
      }
    }
    return next
  }

  private fun decide(): Long {
    val cfg = Store.config(this)
    val hasUsage = Perms.hasUsageAccess(this)
    if (!cfg.enabled || !hasUsage) return -1
    val now = System.currentTimeMillis()
    val live = if (hasUsage) tracker!!.update(now) else Live(null, Cat.OTHER, 0.0, 0)
    val cal = Calendar.getInstance()
    val clock = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val schoolDay = Schedule.schoolDay(cal)
    val lockWindow = cfg.lockEnabled && Schedule.inWindow(clock, cfg.lockStart, cfg.lockEnd)
    val locked = lockWindow && now > cfg.unlockUntil
    val activePkg = live.pkg
    val mine = activePkg == packageName
    val home = launchers ?: Categories.launchers(this).also { launchers = it }

    // Only real "free time" apps: never the store, settings or system screens.
    if (activePkg != null && !mine && activePkg !in home && activePkg !in NOT_FREE_TIME && activePkg != lastRecordedUsedPkg) {
      if (runCatching { packageManager.getLaunchIntentForPackage(activePkg) != null }.getOrDefault(false)) {
        lastRecordedUsedPkg = activePkg
        Store.putString(this, "lastUsedPkg", activePkg)
        Store.putString(this, "lastUsedLabel", Categories.label(this, activePkg))
      }
    }

    maybeReport(cfg, now, activePkg?.takeIf { !mine && it !in home })
    if (hasUsage) updateLive(cfg, now, live)

    // A sleeping or locked device must not accumulate time or hold audio focus.
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (!power.isInteractive || keyguard.isKeyguardLocked || cfg.paused || now < cfg.focusUntil) {
      activeAccumMs = 0L
      lastTargetPkg = null
      lastTickAt = now
      ScrollGate.clear()
      OverlayController.dismiss(this)
      return 2_000L
    }

    // 1. Guardian lock: a blocked app in front during lock hours.
    if (locked && live.cat.distracting && !mine) {
      ScrollGate.clear()
      OverlayController.dismiss(this)
      if (canOverlay()) openLock()
      else if (now - Store.getLong(this, "lastLockNotice") > 60_000L) {
        Notifier.nudge(this, cfg, "lock", "lock", live.cat, 0, clock, 0)
        Store.putLong(this, "lastLockNotice", now)
      }
      if (now - Store.getLong(this, "lastLockEvent") > 30 * 60_000L) {
        record(cfg, "lock", Risk.reasons(clock, live.sessionMin, live.cat, live.unlocksLastHour, schoolDay, true), "locked", clock, 0)
        Store.putLong(this, "lastLockEvent", now)
      }
      return 2_000L
    }

    val idle = 2_000L
    if (OverlayController.isShowing()) {
      lastTickAt = now
      return idle
    }

    // 2. Guardrails: paused, focusing, or currently inside LearnShift itself.
    if (cfg.paused || now < cfg.focusUntil || mine) {
      activeAccumMs = 0L
      ScrollGate.clear()
      if (OverlayController.isGateShowing()) OverlayController.dismiss(this)
      lastTickAt = now
      return idle
    }

    // 3. Active external target app monitoring using configured overlayIntervalSec.
    if (activePkg != null && Categories.isTargetApp(this, activePkg, cfg.monitorAllApps)) {
      if (OverlayController.isGateShowing() && activePkg == lastTargetPkg) {
        lastTickAt = now
        return idle
      }
      if (now < Store.getLong(this, "snoozeUntil")) {
        activeAccumMs = 0L
        ScrollGate.clear()
        if (OverlayController.isGateShowing()) OverlayController.dismiss(this)
        lastTickAt = now
        return idle
      }
      val label = Categories.label(this, activePkg)

      val dt = if (lastTickAt > 0L) (now - lastTickAt).coerceIn(500L, 5_000L) else 2_000L
      lastTickAt = now
      if (activePkg != lastTargetPkg) {
        ScrollGate.clear()
        if (OverlayController.isGateShowing()) OverlayController.dismiss(this)
        lastTargetPkg = activePkg
        activeAccumMs = dt
      } else {
        activeAccumMs += dt
      }

      val intervalMs = cfg.overlayIntervalSec.coerceIn(10, 3600) * 1000L
      if (activeAccumMs >= intervalMs) {
        activeAccumMs = 0L
        ScrollGate.arm(activePkg, android.os.SystemClock.uptimeMillis())
        if (canOverlay()) {
          val mins = maxOf(1, live.sessionMin.roundToInt())
          OverlayController.armSwipeTrigger(this, cfg, label, activePkg, mins)
        }
      }
    } else {
      ScrollGate.clear()
      if (OverlayController.isGateShowing()) OverlayController.dismiss(this)
      activeAccumMs = 0L
      lastTargetPkg = null
      lastTickAt = now
    }
    return idle
  }

  /** Tells the guardian which app is in front now (throttled). */
  private fun updateLive(cfg: Config, now: Long, live: Live) {
    val home = launchers ?: Categories.launchers(this).also { launchers = it }
    val pkg = live.pkg?.takeIf { it !in home }
    val key = pkg ?: "-"
    val lastAt = Store.getLong(this, "liveAt")
    val changed = key != Store.getString(this, "liveKey")
    // A new app is reported within seconds; a long session every 2 minutes.
    if (!((changed && now - lastAt > 8_000L) || (pkg != null && now - lastAt > 120_000L))) return
    Store.putString(this, "liveKey", key)
    Store.putLong(this, "liveAt", now)
    val body = JSONObject()
      .put("package", pkg ?: JSONObject.NULL)
      .put("label", pkg?.let { Categories.label(this, it) } ?: JSONObject.NULL)
      .put("category", pkg?.let { Categories.of(this, it).js } ?: JSONObject.NULL)
      .put("session_min", live.sessionMin.roundToInt())
      .put("screen_on", pkg != null)
    Thread { Reporter.live(this, cfg, body) }.start()
  }

  private fun record(cfg: Config, level: String, reasons: org.json.JSONArray, response: String, clock: Int, late: Int): String {
    val id = "mon-${System.currentTimeMillis().toString(36)}"
    Store.enqueue(
      this,
      JSONObject()
        .put("client_id", id)
        .put("at", iso(System.currentTimeMillis()))
        .put("level", level)
        .put("reasons", reasons)
        .put("response", response)
        .put("clock", clock)
        .put("late", late),
    )
    return id
  }

  /** Foreground app at the last usage report; a switch sends fresh per-app minutes. */
  private var reportedPkg: String? = null

  private fun maybeReport(cfg: Config, now: Long, activePkg: String? = null) {
    val last = Store.getLong(this, "lastReport")
    val pending = Store.queue(this).length() > 0
    // Keep guardian minutes and the app list fresh while LearnShift itself is closed:
    // every 5 minutes, and within a minute of switching apps.
    val switched = activePkg != null && activePkg != reportedPkg
    if (now - last > 5 * 60_000L || ((pending || switched) && now - last > 60_000L)) {
      if (activePkg != null) reportedPkg = activePkg
      Store.putLong(this, "lastReport", now) // avoid hammering while offline
      Thread { Reporter.report(this, cfg, true) }.start()
    }
  }

  private fun reportSoon(cfg: Config) {
    Thread { Reporter.report(this, cfg, false) }.start()
  }

  private fun nudgesToday(now: Long): Int {
    val day = Days.key(Calendar.getInstance().apply { timeInMillis = now })
    return if (Store.getString(this, "nudgeDay") == day) Store.getLong(this, "nudgeCount").toInt() else 0
  }

  private fun countNudge(now: Long) {
    val day = Days.key(Calendar.getInstance().apply { timeInMillis = now })
    val n = nudgesToday(now)
    Store.putString(this, "nudgeDay", day)
    Store.putLong(this, "nudgeCount", (n + 1).toLong())
  }

  private fun canOverlay() = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this)

  private fun openLock() {
    try {
      startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse("learnshift://lock")).apply {
          setPackage(packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        },
      )
    } catch (e: Exception) {
      Log.w(TAG, "could not open lock: ${e.message}")
    }
  }

  companion object {
    private const val TAG = "LearnShiftMonitor"

    @Volatile
    var running = false

    fun iso(t: Long): String =
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(t))

    fun start(ctx: Context) {
      val cfg = Store.config(ctx)
      if (!cfg.enabled || !Perms.hasUsageAccess(ctx)) return
      try {
        ContextCompat.startForegroundService(ctx, Intent(ctx, MonitorService::class.java))
      } catch (e: Exception) {
        Log.w(TAG, "could not start monitor: ${e.message}")
      }
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, MonitorService::class.java))
    }
  }
}

/** Restarts the monitor after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    MonitorService.start(ctx)
  }
}

/** "5 more min" on a check-in: snooze, and remember the answer. */
class NudgeActionReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action != Notifier.ACTION_SNOOZE) return
    Store.putLong(ctx, "snoozeUntil", System.currentTimeMillis() + 5 * 60_000L)
    // Next nudge may come right after the snooze ends.
    Store.putLong(ctx, "lastNudge", 0L)
    Store.putLong(ctx, "lastLimitNudge", 0L)
    intent.getStringExtra("id")?.let { id ->
      val e = Store.findEvent(ctx, id)
      if (e != null) Store.enqueue(ctx, JSONObject(e.toString()).put("response", "snoozed"))
    }
    Notifier.cancelNudge(ctx)
  }
}

/** Apps a finished break must never "return" the student to. */
internal val NOT_FREE_TIME = setOf(
  "com.android.vending",
  "com.android.settings",
  "com.android.systemui",
  "com.google.android.packageinstaller",
  "com.android.packageinstaller",
  "com.android.permissioncontroller",
  "com.google.android.permissioncontroller",
)
