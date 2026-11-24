package expo.modules.usagemonitor

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import expo.modules.usagemonitor.mirror.InterventionDispatcher
import expo.modules.usagemonitor.mirror.LearnShiftOfflineDb
import expo.modules.usagemonitor.mirror.OfflineContextCollector
import expo.modules.usagemonitor.mirror.PilotTelemetryRecorder
import expo.modules.usagemonitor.mirror.SentinelBus
import expo.modules.usagemonitor.mirror.SessionRiskScorer
import expo.modules.usagemonitor.mirror.SmartStudyGuardService
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
  private var wakeReceiverRegistered = false
  @Volatile private var resetTickTiming = false

  private val wakeReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_OFF -> {
          ScrollGate.clear()
          if (OverlayController.isGateShowing()) OverlayController.dismiss(this@MonitorService)
          val elapsed = SystemClock.elapsedRealtime()
          val lastAt = SentinelBus.lastInterventionTimeMs
          val delta = elapsed - lastAt
          if (lastAt > 0L && delta in 1L..60_000L) {
            SentinelBus.lastInterventionTimeMs = 0L
            val topic = SentinelBus.lastInterventionTopicTag
            Thread {
              val db = LearnShiftOfflineDb.getInstance(applicationContext)
              db.incrementStoppingPower(topic, 1.5f)
              PilotTelemetryRecorder(db).logSuccessfulScreenOff(delta)
            }.start()
          }
        }
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
          onWakeCallback?.invoke()
          triggerWakeRefresh(syncRemote = true)
        }
      }
    }
  }

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
    if (!wakeReceiverRegistered) {
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
        addAction(Intent.ACTION_SCREEN_OFF)
      }
      runCatching {
        ContextCompat.registerReceiver(this, wakeReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        wakeReceiverRegistered = true
      }
    }
    if (thread == null) {
      thread = HandlerThread("learnshift-monitor").also { it.start() }
      handler = Handler(thread!!.looper)
      tracker = Tracker(this)
      running = true
      handler!!.post(tick)
    } else if (intent?.action == ACTION_REFRESH) {
      triggerWakeRefresh(syncRemote = intent.getBooleanExtra(EXTRA_SYNC_REMOTE, false))
    } else {
      resetTickTiming = true
      ScrollGate.clear()
      if (OverlayController.isGateShowing()) OverlayController.dismiss(this)
      lastIndicator = null
      handler?.removeCallbacks(tick)
      handler?.post(tick)
    }
    return START_STICKY
  }

  private var lastRemoteWakeSyncAt = 0L

  private fun triggerWakeRefresh(syncRemote: Boolean) {
    ScrollGate.clear()
    if (OverlayController.isGateShowing()) OverlayController.dismiss(this)
    activeAccumMs = 0L
    lastTargetPkg = null
    lastIndicator = null
    launchers = null
    Categories.clearCache()
    tracker = Tracker(this)
    resetTickTiming = true
    handler?.removeCallbacks(tick)
    handler?.post(tick)

    val now = System.currentTimeMillis()
    if (syncRemote && now - lastRemoteWakeSyncAt >= 10_000L) {
      lastRemoteWakeSyncAt = now
      val cfg = Store.config(this)
      if (cfg.enabled && cfg.url.isNotEmpty() && cfg.deviceToken.isNotEmpty()) {
        Thread {
          if (Reporter.report(applicationContext, cfg, true)) {
            lastIndicator = null
            handler?.post(tick)
          }
        }.start()
      }
    }
  }

  override fun onDestroy() {
    running = false
    if (wakeReceiverRegistered) {
      runCatching { unregisterReceiver(wakeReceiver) }
      wakeReceiverRegistered = false
    }
    ScrollGate.clear()
    OverlayController.dismiss(this)
    LockdownController.dismiss(this)
    handler?.removeCallbacksAndMessages(null)
    thread?.quitSafely()
    thread = null
    handler = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    val cfg = Store.config(this)
    if (cfg.enabled && Perms.hasUsageAccess(this)) {
      runCatching {
        val restartIntent = Intent(applicationContext, BootReceiver::class.java)
        val pi = PendingIntent.getBroadcast(
          applicationContext,
          1042,
          restartIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 2_000L, pi)
      }
    }
    super.onTaskRemoved(rootIntent)
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
  private var lastActivePkg: String? = null
  private var lastActiveCat: Cat = Cat.OTHER
  private var overlayStudyStartAt: Long = 0L
  private var studySessionStartAt: Long = 0L
  private var lastEffectiveIntervalSec = 180
  private var lastAdaptiveStreak = 0
  private val riskScorer = SessionRiskScorer()
  private val contextCollector by lazy { OfflineContextCollector(this) }
  private val mirrorDispatcher by lazy { InterventionDispatcher(this) }
  private var lastMirrorDispatchAt = 0L

  private fun effectiveBreakIntervalSec(cfg: Config, activeCat: Cat, sessionMin: Double, now: Long): Pair<Int, Int> {
    val baseSec = when {
      cfg.parentBreakIntervalSec > 0 -> cfg.parentBreakIntervalSec
      activeCat == Cat.GAMES && cfg.gamesLimit > 0 -> cfg.gamesLimit * 60
      (activeCat == Cat.SOCIAL || activeCat == Cat.VIDEO) && cfg.scrollLimit > 0 -> cfg.scrollLimit * 60
      else -> cfg.overlayIntervalSec
    }.coerceIn(30, 3600)

    val existingStreak = Store.getInt(this, "distractionStreak")
    val lastBreakAt = Store.getLong(this, "lastDistractingBreakAt")
    val studiedLongEnough = studySessionStartAt > 0L && now - studySessionStartAt >= 2 * 60_000L
    val cooldownExpired = lastBreakAt > 0L && now - lastBreakAt >= maxOf(10 * 60_000L, baseSec * 2_000L)
    if (existingStreak > 0 && (studiedLongEnough || cooldownExpired)) {
      Store.putInt(this, "distractionStreak", 0)
    }

    val streak = Store.getInt(this, "distractionStreak")
    val factors = doubleArrayOf(1.0, 0.75, 0.55, 0.40, 0.30)
    val streakFactor = if (activeCat.distracting && streak > 0) factors[minOf(streak, factors.lastIndex)] else 1.0

    // Adaptive shortening based on both continuous use time and recent scroll cadence.
    val usageFactor = when {
      sessionMin >= 30.0 -> 0.25
      sessionMin >= 20.0 -> 0.40
      sessionMin >= 12.0 -> 0.55
      sessionMin >= 5.0 -> 0.75
      else -> 1.0
    }
    val elapsed = SystemClock.elapsedRealtime()
    val swipes = SentinelBus.snapshotScrollTimestamps(elapsed)
    val vector = riskScorer.buildVector((sessionMin * 60_000.0).toLong(), swipes)
    val scrollFactor = when {
      vector.scrollCadencePerMin >= 25f -> 0.28
      vector.scrollCadencePerMin >= 18f -> 0.45
      vector.scrollCadencePerMin >= 12f -> 0.65
      vector.scrollCadencePerMin >= 8f && vector.dwellVarianceSecSq < 2.0f -> 0.75
      else -> 1.0
    }

    val multiplier = minOf(streakFactor, usageFactor, scrollFactor)
    val floor = minOf(baseSec, if (baseSec <= 45) 30 else 45)
    val effective = if (multiplier < 1.0) maxOf(floor, (baseSec * multiplier).roundToInt()) else baseSec
    lastEffectiveIntervalSec = effective
    lastAdaptiveStreak = if (multiplier < 1.0) maxOf(streak, 1) else 0
    return effective to lastAdaptiveStreak
  }

  /** One detection pass. Returns the delay until the next pass, or -1 to stop. */
  private fun step(): Long {
    val next = decide()
    if (next >= 0) {
      val cfg = Store.config(this)
      val calNow = Calendar.getInstance()
      val clockNow = calNow.get(Calendar.HOUR_OF_DAY) * 60 + calNow.get(Calendar.MINUTE)
      val nowMs = System.currentTimeMillis()
      val seconds = ((lastEffectiveIntervalSec * 1000L - activeAccumMs).coerceAtLeast(0) + 999) / 1000
      val indicator = when {
        LockdownController.isLocked(cfg, clockNow, nowMs) ->
          if (cfg.fil) "Total lockdown · Emergency call lang" else "Total lockdown · Emergency calls only"
        cfg.paused -> if (cfg.fil) "Naka-pause ang learning breaks" else "Learning breaks paused"
        OverlayController.isShowing() -> if (cfg.fil) "Nag-aaral sa LearnShift break" else "Studying in a LearnShift break"
        ScrollGate.isArmed() || OverlayController.isGateShowing() -> if (cfg.fil) "Tapos na ang timer · Mag-swipe pataas para sa break" else "Timer done · Waiting for your next upward swipe"
        lastActivePkg == packageName -> if (cfg.fil) "Nag-aaral sa LearnShift" else "Studying in LearnShift"
        lastActiveCat == Cat.STUDY && lastActivePkg != null -> if (cfg.fil) "Nag-aaral sa ${Categories.label(this, lastActivePkg!!)}" else "Studying in ${Categories.label(this, lastActivePkg!!)}"
        lastTargetPkg != null && lastAdaptiveStreak > 0 ->
          if (cfg.fil) "Mas mabilis na break (${lastAdaptiveStreak}x): ${seconds}s" else "Adaptive break timer: ${seconds}s"
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
    if (resetTickTiming) {
      resetTickTiming = false
      lastTickAt = 0L
    }
    val now = System.currentTimeMillis()
    val live = if (hasUsage) tracker!!.update(now) else Live(null, Cat.OTHER, 0.0, 0)
    val cal = Calendar.getInstance()
    val clock = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val schoolDay = Schedule.schoolDay(cal)
    val locked = LockdownController.isLocked(cfg, clock, now)
    val activePkg = live.pkg
    val mine = activePkg == packageName
    val home = launchers ?: Categories.launchers(this).also { launchers = it }

    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    val screenAwake = power.isInteractive && !keyguard.isKeyguardLocked
    val overlayShowing = OverlayController.isShowing()
    if (overlayShowing) {
      if (overlayStudyStartAt == 0L) overlayStudyStartAt = now
    } else {
      overlayStudyStartAt = 0L
    }

    lastActivePkg = if (screenAwake) activePkg else null
    lastActiveCat = if (screenAwake) live.cat else Cat.OTHER

    val studyingNow = screenAwake && (live.cat == Cat.STUDY || overlayShowing)
    var forceStudyReport = studyingNow && studySessionStartAt > 0L && now - studySessionStartAt >= 5 * 60_000L
    if (studyingNow && studySessionStartAt == 0L) {
      studySessionStartAt = now
    } else if (!studyingNow && studySessionStartAt > 0L) {
      if (now - studySessionStartAt >= 30_000L) forceStudyReport = true
      studySessionStartAt = 0L
    }

    // Only real "free time" apps: never the store, settings or system screens.
    if (activePkg != null && !mine && activePkg !in home && activePkg !in NOT_FREE_TIME && activePkg != lastRecordedUsedPkg) {
      if (runCatching { packageManager.getLaunchIntentForPackage(activePkg) != null }.getOrDefault(false)) {
        lastRecordedUsedPkg = activePkg
        Store.putString(this, "lastUsedPkg", activePkg)
        Store.putString(this, "lastUsedLabel", Categories.label(this, activePkg))
      }
    }

    val liveForReport = when {
      !screenAwake -> Live(null, Cat.OTHER, 0.0, live.unlocksLastHour, 0.0)
      overlayShowing -> Live(packageName, Cat.STUDY, 0.0, live.unlocksLastHour, maxOf(0.0, (now - overlayStudyStartAt) / 60_000.0))
      else -> live
    }
    maybeReport(
      cfg,
      now,
      reportPkg = if (screenAwake) activePkg?.takeIf { it !in home } else null,
      forceSoon = forceStudyReport,
    )
    if (hasUsage) updateLive(cfg, now, liveForReport)

    // 1. Total offline Guardian Lockdown (runs before pause/focus guardrails).
    if (locked) {
      Notifier.cancelCountdown(this)
      Notifier.cancelNudge(this)
      ScrollGate.clear()
      OverlayController.dismiss(this)
      activeAccumMs = 0L
      lastTargetPkg = null
      lastTickAt = now
      if (!screenAwake) return 2_000L
      if (!LockdownController.isEmergencyAllowed(this, activePkg)) {
        if (canOverlay()) {
          LockdownController.show(this, cfg, clock)
        } else {
          openLock()
          if (now - Store.getLong(this, "lastLockNotice") > 60_000L) {
            Notifier.nudge(this, cfg, "lock", "lock", live.cat, 0, clock, 0)
            Store.putLong(this, "lastLockNotice", now)
          }
        }
      }
      if (now - Store.getLong(this, "lastLockEvent") > 30 * 60_000L) {
        record(cfg, "lock", Risk.reasons(clock, live.sessionMin, live.cat, live.unlocksLastHour, schoolDay, true), "locked", clock, 0)
        Store.putLong(this, "lastLockEvent", now)
      }
      return 1_000L
    } else {
      LockdownController.dismiss(this)
    }

    // A sleeping or locked device must not accumulate time or hold audio focus.
    if (!screenAwake || cfg.paused || now < cfg.focusUntil) {
      activeAccumMs = 0L
      lastTargetPkg = null
      lastTickAt = now
      ScrollGate.clear()
      OverlayController.dismiss(this)
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
      lastTargetPkg = null
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

      val (intervalSec, _) = effectiveBreakIntervalSec(cfg, live.cat, live.sessionMin, now)
      val intervalMs = intervalSec * 1000L
      if (activeAccumMs >= intervalMs) {
        activeAccumMs = 0L
        ScrollGate.arm(activePkg, android.os.SystemClock.uptimeMillis())
        if (canOverlay()) {
          val mins = maxOf(1, live.sessionMin.roundToInt())
          OverlayController.armSwipeTrigger(this, cfg, label, activePkg, mins)
        }
      }

      // Option C Attention Mirror auto-shift when behavioral risk exceeds 0.75.
      val mirrorAuto = getSharedPreferences("learnshift_prefs", Context.MODE_PRIVATE)
        .getBoolean("mirror_auto_enabled", false)
      val elapsed = SystemClock.elapsedRealtime()
      if (mirrorAuto && elapsed - lastMirrorDispatchAt >= 180_000L && activePkg != null) {
        val swipes = SentinelBus.snapshotScrollTimestamps(elapsed)
        val vec = riskScorer.buildVector((live.sessionMin * 60_000.0).toLong(), swipes)
        val risk = riskScorer.computeRiskProbability(vec)
        if (risk >= 0.60f) contextCollector.captureSingleGravityReading()
        if (risk > 0.75f && !SmartStudyGuardService.evaluateSingleFrameIfEnabledSync(this)) {
          lastMirrorDispatchAt = elapsed
          val snap = contextCollector.buildSnapshot(vec.scrollCadencePerMin, vec.sessionMinutes, vec.dwellVarianceSecSq)
          val capturedPkg = activePkg
          android.os.Handler(mainLooper).post {
            val tier = mirrorDispatcher.dispatch(capturedPkg, snap)
            SentinelBus.lastInterventionTimeMs = elapsed
            SentinelBus.lastInterventionStrategy = tier
            SentinelBus.lastActivePackage = capturedPkg
          }
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
    // A new app is reported within seconds; an active session refreshes every minute.
    if (!((changed && now - lastAt > 4_000L) || (pkg != null && now - lastAt > 60_000L))) return
    Store.putString(this, "liveKey", key)
    Store.putLong(this, "liveAt", now)
    val body = JSONObject()
      .put("package", pkg ?: JSONObject.NULL)
      .put("label", pkg?.let { if (it == packageName) "LearnShift" else Categories.label(this, it) } ?: JSONObject.NULL)
      .put("category", pkg?.let { Categories.of(this, it).js } ?: JSONObject.NULL)
      .put("session_min", maxOf(0, live.appMin.toInt()))
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

  private fun maybeReport(cfg: Config, now: Long, reportPkg: String? = null, forceSoon: Boolean = false) {
    val last = Store.getLong(this, "lastReport")
    val pending = Store.queue(this).length() > 0
    // Keep guardian minutes and the app list fresh while LearnShift itself is closed:
    // every 5 minutes, within a minute of switching apps, or after a focused study session.
    val switched = reportPkg != null && reportPkg != reportedPkg
    if (now - last > 5 * 60_000L || ((pending || switched) && now - last > 60_000L) || (forceSoon && now - last > 2 * 60_000L)) {
      if (reportPkg != null) reportedPkg = reportPkg
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
    const val ACTION_REFRESH = "expo.modules.usagemonitor.ACTION_REFRESH"
    const val EXTRA_SYNC_REMOTE = "syncRemote"

    @Volatile
    var running = false

    @Volatile
    var onWakeCallback: (() -> Unit)? = null

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

    fun refresh(ctx: Context, syncRemote: Boolean = false) {
      val cfg = Store.config(ctx)
      if (!cfg.enabled || !Perms.hasUsageAccess(ctx)) return
      try {
        val intent = Intent(ctx, MonitorService::class.java).apply {
          action = ACTION_REFRESH
          putExtra(EXTRA_SYNC_REMOTE, syncRemote)
        }
        ContextCompat.startForegroundService(ctx, intent)
      } catch (e: Exception) {
        Log.w(TAG, "could not refresh monitor: ${e.message}")
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
