package expo.modules.usagemonitor

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Locale

/**
 * Full-screen offline guardian lockdown overlay.
 *
 * Covers the screen whenever scheduled Guardian Lock or instant Total Lockdown
 * is active, traps Back/Home/Recents key events inside the focused overlay
 * window, pauses background media, and provides direct access strictly to
 * emergency calling (`EmergencyDialer` / `ACTION_DIAL tel:911`).
 */
object LockdownController {
  private val main = Handler(Looper.getMainLooper())
  private var overlayView: View? = null
  private var statusView: TextView? = null
  private var subtitleView: TextView? = null
  private var guardianView: TextView? = null
  private var wakeView: TextView? = null
  private var titleView: TextView? = null
  private var hintView: TextView? = null
  private var emergencyBtn: TextView? = null
  private var lastEmergencyGraceClearAt = 0L

  @Volatile
  private var emergencyGraceUntil = 0L

  private val EMERGENCY_PACKAGES = setOf(
    "com.android.phone",
    "com.android.server.telecom",
    "com.android.emergency",
    "com.google.android.dialer",
    "com.samsung.android.dialer",
    "com.android.dialer",
    "com.sec.android.app.emergency",
    "com.coloros.phonemanager",
    "com.oplus.dialer",
    "com.miui.securitycenter",
    "com.android.incallui",
    "com.samsung.android.incallui",
  )

  fun isLocked(cfg: Config, clock: Int, now: Long): Boolean {
    if (now <= cfg.unlockUntil) return false
    if (cfg.lockNow) return true
    return cfg.lockEnabled && Schedule.inWindow(clock, cfg.lockStart, cfg.lockEnd)
  }

  fun isShowing(): Boolean = overlayView != null

  fun isEmergencyGraceActive(now: Long = System.currentTimeMillis()): Boolean =
    now < emergencyGraceUntil

  fun isEmergencyAllowed(ctx: Context, pkg: String?): Boolean {
    val now = System.currentTimeMillis()
    if (pkg.isNullOrBlank()) return now < emergencyGraceUntil
    val lower = pkg.lowercase(Locale.ROOT)
    val defaultDialer = runCatching {
      val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
      tm?.defaultDialerPackage?.lowercase(Locale.ROOT)
    }.getOrNull()

    val isDialer = lower in EMERGENCY_PACKAGES ||
      (defaultDialer != null && lower == defaultDialer) ||
      lower.contains("emergency") ||
      lower.contains("incallui") ||
      lower.contains("telecom") ||
      lower.endsWith(".dialer") ||
      lower == ctx.packageName.lowercase(Locale.ROOT) && now < emergencyGraceUntil

    if (isDialer) return true

    // Leaving dialer for any non-emergency app immediately revokes emergency grace.
    if (now < emergencyGraceUntil && now - lastEmergencyGraceClearAt > 300L) {
      emergencyGraceUntil = 0L
      lastEmergencyGraceClearAt = now
    }
    return false
  }

  fun show(ctx: Context, cfg: Config, clock: Int) {
    if (!Settings.canDrawOverlays(ctx)) return
    OverlayController.pauseMediaForLockdown(ctx)
    val appCtx = ctx.applicationContext
    main.post {
      val existing = overlayView
      if (existing != null) {
        updateContent(appCtx, cfg, clock)
        return@post
      }
      val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return@post
      val view = buildView(appCtx, cfg, clock)
      val lp = createLayoutParams()
      val attached = runCatching {
        wm.addView(view, lp)
        overlayView = view
      }.isSuccess
      if (!attached) {
        overlayView = null
      }
    }
  }

  fun enforce(ctx: Context, cfg: Config, clock: Int) {
    show(ctx, cfg, clock)
    val view = overlayView ?: return
    val appCtx = ctx.applicationContext
    main.post {
      val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return@post
      if (view.parent == null) {
        runCatching { wm.addView(view, createLayoutParams()) }
      } else {
        runCatching { wm.updateViewLayout(view, createLayoutParams()) }
        view.requestFocus()
      }
      updateContent(appCtx, cfg, clock)
    }
  }

  fun dismiss(ctx: Context) {
    val appCtx = ctx.applicationContext
    main.post { dismissNow(appCtx) }
  }

  fun dismissNow(ctx: Context) {
    val v = overlayView ?: return
    overlayView = null
    titleView = null
    subtitleView = null
    guardianView = null
    wakeView = null
    statusView = null
    hintView = null
    emergencyBtn = null
    val wm = ctx.applicationContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    runCatching { wm.removeViewImmediate(v) }
  }

  private fun createLayoutParams(): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    @Suppress("DEPRECATION")
    val flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
      WindowManager.LayoutParams.FLAG_SECURE
    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      flags,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.CENTER
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
  }

  private fun buildView(ctx: Context, cfg: Config, clock: Int): View {
    val dp = ctx.resources.displayMetrics.density
    fun d(v: Int): Int = (v * dp).toInt()

    val root = object : FrameLayout(ctx) {
      override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        return when (event.keyCode) {
          KeyEvent.KEYCODE_BACK,
          KeyEvent.KEYCODE_HOME,
          KeyEvent.KEYCODE_APP_SWITCH,
          KeyEvent.KEYCODE_MENU,
          KeyEvent.KEYCODE_SEARCH -> true
          else -> super.dispatchKeyEvent(event)
        }
      }
    }
    root.setBackgroundColor(Color.parseColor("#0D1526"))
    root.isFocusable = true
    root.isFocusableInTouchMode = true
    root.isClickable = true
    @Suppress("DEPRECATION")
    root.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
        View.SYSTEM_UI_FLAG_FULLSCREEN or
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      )

    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(d(26), d(32), d(26), d(28))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#162238"))
        cornerRadius = dp * 28f
        setStroke(d(1), Color.parseColor("#2A3D5E"))
      }
    }

    val badge = TextView(ctx).apply {
      text = "LEARNSHIFT GUARDIAN LOCK"
      textSize = 11f
      typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
      setTextColor(Color.parseColor("#9CC2FF"))
      letterSpacing = 0.08f
      setPadding(d(14), d(6), d(14), d(6))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#1F3354"))
        cornerRadius = dp * 999f
      }
    }

    val title = TextView(ctx).apply {
      textSize = 26f
      typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
      setTextColor(Color.parseColor("#F5F8FF"))
      gravity = Gravity.CENTER
      setPadding(0, d(18), 0, d(8))
    }
    titleView = title

    val subtitle = TextView(ctx).apply {
      textSize = 15f
      setTextColor(Color.parseColor("#C7D4EC"))
      gravity = Gravity.CENTER
      setLineSpacing(dp * 4f, 1f)
      setPadding(0, 0, 0, d(16))
    }
    subtitleView = subtitle

    val guardian = TextView(ctx).apply {
      textSize = 13f
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      setTextColor(Color.parseColor("#E6EEFC"))
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, d(6))
    }
    guardianView = guardian

    val wake = TextView(ctx).apply {
      textSize = 13f
      setTextColor(Color.parseColor("#90A5C8"))
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, d(18))
    }
    wakeView = wake

    val status = TextView(ctx).apply {
      textSize = 12f
      setTextColor(Color.parseColor("#7D94BA"))
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, d(18))
    }
    statusView = status

    val emergency = TextView(ctx).apply {
      textSize = 16f
      typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setPadding(d(22), d(15), d(22), d(15))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#D9383A"))
        cornerRadius = dp * 18f
      }
      isClickable = true
      setOnClickListener { openEmergencyDialer(ctx) }
    }
    emergencyBtn = emergency

    val hint = TextView(ctx).apply {
      textSize = 12f
      setTextColor(Color.parseColor("#8FA3C7"))
      gravity = Gravity.CENTER
      setLineSpacing(dp * 3f, 1f)
      setPadding(0, d(16), 0, 0)
    }
    hintView = hint

    card.addView(badge)
    card.addView(title)
    card.addView(subtitle)
    card.addView(guardian)
    card.addView(wake)
    card.addView(status)
    card.addView(
      emergency,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ),
    )
    card.addView(hint)

    val cardLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER,
    ).apply {
      setMargins(d(22), d(24), d(22), d(24))
    }
    root.addView(card, cardLp)

    updateContent(ctx, cfg, clock)
    root.requestFocus()
    return root
  }

  private fun updateContent(ctx: Context, cfg: Config, clock: Int) {
    val isFil = cfg.lang == "fil"
    titleView?.text = if (isFil) "Naka-Lockdown" else "Total Lockdown"
    subtitleView?.text = if (isFil) {
      "Nakasarado muna ang lahat ng app, navigation, at notification—kahit offline. Mga emergency call lang ang puwede."
    } else {
      "All apps, navigation, and notifications are paused—even while offline. Only emergency calls are permitted."
    }
    val gName = cfg.guardianName.ifBlank { if (isFil) "Magulang" else "Guardian" }
    guardianView?.text = if (isFil) "Itinakda ni: $gName" else "Set by $gName"
    wakeView?.text = when {
      cfg.lockNow -> if (isFil) {
        "Mananatiling naka-lock hanggang alisin ng magulang."
      } else {
        "Stays locked until your guardian turns off Lockdown."
      }
      else -> if (isFil) {
        "Magbubukas ulit nang ${formatClock(cfg.lockEnd)}"
      } else {
        "Scheduled until ${formatClock(cfg.lockEnd)}"
      }
    }
    statusView?.text = if (isFil) {
      "Kasalukuyang oras: ${formatClock(clock)}"
    } else {
      "Device time: ${formatClock(clock)}"
    }
    emergencyBtn?.text = if (isFil) "Tawag Pang-Emergency" else "Emergency Call"
    hintView?.text = if (isFil) {
      "Hindi kailangan ng internet para mapanatiling naka-lock ang device."
    } else {
      "Device lockdown remains enforced offline until lifted."
    }
  }

  private fun formatClock(min: Int): String {
    val m = ((min % 1440) + 1440) % 1440
    val h24 = m / 60
    val mm = m % 60
    val ampm = if (h24 >= 12) "PM" else "AM"
    val h12 = when (h24 % 12) {
      0 -> 12
      else -> h24 % 12
    }
    return String.format(Locale.US, "%d:%02d %s", h12, mm, ampm)
  }

  private fun openEmergencyDialer(ctx: Context) {
    emergencyGraceUntil = System.currentTimeMillis() + 60_000L
    dismissNow(ctx)

    val emergencyIntent = Intent("com.android.phone.EmergencyDialer.DIAL").apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val launchedEmergency = runCatching {
      ctx.startActivity(emergencyIntent)
    }.isSuccess
    if (launchedEmergency) return

    val fallback = Intent(Intent.ACTION_DIAL).apply {
      data = Uri.parse("tel:911")
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    runCatching { ctx.startActivity(fallback) }
  }
}
