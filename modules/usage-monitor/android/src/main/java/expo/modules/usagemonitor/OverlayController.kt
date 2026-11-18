package expo.modules.usagemonitor

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.ScrollView
import org.json.JSONArray
import kotlin.math.abs

/**
 * Draws an opaque full-screen learning feed over a supported foreground app.
 * Media focus is held only for the visible feed, and released on every exit.
 * Fail-open: any exception removes the overlay rather than trapping the student.
 */
object OverlayController {
  private const val TAG = "LearnShiftOverlay"
  private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile private var activeView: View? = null
  private var activePackage: String? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { }
  private var pendingRunnable: Runnable? = null

  private data class NativeQuizItem(
    val tip: String,
    val prompt: String,
    val choices: List<String>,
    val answer: Int,
    val explanation: String,
    val topic: String = "Learning break",
  )

  fun canOverlay(ctx: Context): Boolean = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)

  fun isShowing(): Boolean = activeView != null

  private fun dp(ctx: Context, v: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), ctx.resources.displayMetrics).toInt()

  @Suppress("DEPRECATION")
  private fun overlayWindowType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else WindowManager.LayoutParams.TYPE_PHONE

  private fun roundedBox(
    fillColor: Int,
    radiusDp: Int,
    strokeColor: Int = Color.TRANSPARENT,
    strokeDp: Int = 0,
    ctx: Context,
  ): GradientDrawable = GradientDrawable().apply {
    setColor(fillColor)
    cornerRadius = dp(ctx, radiusDp).toFloat()
    if (strokeDp > 0) setStroke(dp(ctx, strokeDp), strokeColor)
  }

  private fun openLearnShift(ctx: Context, url: String) {
    runCatching {
      ctx.startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
          setPackage(ctx.packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        },
      )
    }.onFailure { Log.w(TAG, "could not open LearnShift: ${it.message}") }
  }

  /** A temporary focus loss asks cooperating players to pause, never just duck. */
  @Suppress("DEPRECATION")
  private fun pauseMedia(ctx: Context): Boolean {
    // Apps targeting Android 15+ need foreground eligibility to request focus.
    if (Build.VERSION.SDK_INT >= 35 && !MonitorService.running) return false
    val manager = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audioManager = manager
    return runCatching {
      val result = if (Build.VERSION.SDK_INT >= 26) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
          .setAcceptsDelayedFocusGain(false)
          .setOnAudioFocusChangeListener(focusListener, mainHandler).build()
        focusRequest = request
        manager.requestAudioFocus(request)
      } else manager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }.getOrDefault(false)
  }

  @Suppress("DEPRECATION")
  private fun releaseMedia() {
    val manager = audioManager
    val request = focusRequest
    audioManager = null
    focusRequest = null
    runCatching {
      if (Build.VERSION.SDK_INT >= 26 && request != null) manager?.abandonAudioFocusRequest(request)
      else manager?.abandonAudioFocus(focusListener)
    }
  }

  private fun removeActive(ctx: Context) {
    releaseMedia()
    val v = activeView ?: return
    activeView = null
    activePackage = null
    v.animate().cancel()
    val wm = ctx.applicationContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    runCatching { wm.removeViewImmediate(v) }
    Store.putLong(ctx, "snoozeUntil", System.currentTimeMillis() + Store.config(ctx).overlayIntervalSec * 1000L)
  }

  fun dismiss(ctx: Context) {
    val appCtx = ctx.applicationContext
    mainHandler.post {
      pendingRunnable?.let { mainHandler.removeCallbacks(it) }
      pendingRunnable = null
      removeActive(appCtx)
    }
  }

  fun onWindowChanged(ctx: Context, pkg: String) {
    mainHandler.post {
      if (activeView != null && pkg != ctx.packageName && pkg != activePackage) removeActive(ctx)
    }
  }

  fun scheduleOverlay(
    ctx: Context,
    cfg: Config,
    appLabel: String,
    pkg: String?,
    minutes: Int,
    mode: String,
    delayMs: Long,
  ) {
    val appCtx = ctx.applicationContext
    pendingRunnable?.let { mainHandler.removeCallbacks(it) }
    val task = Runnable {
      if (mode == "pill") showNudgePill(appCtx, cfg, appLabel, pkg, minutes)
      else showQuizOverlay(appCtx, cfg, appLabel, pkg, minutes)
    }
    pendingRunnable = task
    mainHandler.postDelayed(task, delayMs.coerceAtLeast(0L))
  }

  /** Clean white floating check-in card over the opened app. */
  fun showNudgePill(ctx: Context, cfg: Config, appLabel: String, pkg: String?, minutes: Int) {
    val appCtx = ctx.applicationContext
    mainHandler.post {
      if (!canOverlay(appCtx)) return@post
      runCatching {
        removeActive(appCtx)
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val container = FrameLayout(appCtx).apply {
          setPadding(dp(appCtx, 14), 0, dp(appCtx, 14), 0)
        }

        val card = LinearLayout(appCtx).apply {
          orientation = LinearLayout.VERTICAL
          background = roundedBox(
            Color.parseColor("#FFFFFF"),
            22,
            Color.parseColor("#E5E0D8"),
            1,
            appCtx,
          )
          elevation = dp(appCtx, 10).toFloat()
          setPadding(dp(appCtx, 16), dp(appCtx, 14), dp(appCtx, 16), dp(appCtx, 14))
        }

        val header = LinearLayout(appCtx).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
        }

        val badge = TextView(appCtx).apply {
          text = "Paty · LearnShift"
          setTextColor(Color.parseColor("#C8400F"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setTypeface(typeface, Typeface.BOLD)
          background = roundedBox(Color.parseColor("#FFF0E6"), 99, ctx = appCtx)
          setPadding(dp(appCtx, 9), dp(appCtx, 4), dp(appCtx, 9), dp(appCtx, 4))
        }

        val title = TextView(appCtx).apply {
          text = "  $appLabel · ${minutes}m active"
          setTextColor(Color.parseColor("#111111"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
          setTypeface(typeface, Typeface.BOLD)
          layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val closeBtn = TextView(appCtx).apply {
          text = "×"
          setTextColor(Color.parseColor("#111111"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
          setTypeface(typeface, Typeface.BOLD)
          gravity = Gravity.CENTER
          background = roundedBox(Color.parseColor("#F4F4F6"), 99, ctx = appCtx)
          setPadding(dp(appCtx, 10), dp(appCtx, 2), dp(appCtx, 10), dp(appCtx, 2))
          setOnClickListener { removeActive(appCtx) }
        }

        header.addView(badge)
        header.addView(title)
        header.addView(closeBtn)

        val subtitle = TextView(appCtx).apply {
          text = if (cfg.fil) {
            "May mabilis na 3-card feed si Paty sa ibabaw ng $appLabel. I-swipe pataas pagkatapos."
          } else {
            "Quick 3-card ${cfg.rootSkillName} reset over $appLabel — swipe up when done."
          }
          setTextColor(Color.parseColor("#5C5C62"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          setPadding(0, dp(appCtx, 8), 0, dp(appCtx, 12))
        }

        val actions = LinearLayout(appCtx).apply {
          orientation = LinearLayout.HORIZONTAL
        }

        val startQuizBtn = TextView(appCtx).apply {
          text = if (cfg.fil) "Buksan ang Feed" else "Open White Feed"
          setTextColor(Color.parseColor("#FFFFFF"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          setTypeface(typeface, Typeface.BOLD)
          gravity = Gravity.CENTER
          background = roundedBox(Color.parseColor("#C8400F"), 99, ctx = appCtx)
          setPadding(dp(appCtx, 14), dp(appCtx, 10), dp(appCtx, 14), dp(appCtx, 10))
          layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            rightMargin = dp(appCtx, 8)
          }
          setOnClickListener { showQuizOverlay(appCtx, cfg, appLabel, pkg, minutes) }
        }

        val openAppBtn = TextView(appCtx).apply {
          text = if (cfg.fil) "Buong App" else "LearnShift App"
          setTextColor(Color.parseColor("#111111"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          setTypeface(typeface, Typeface.BOLD)
          gravity = Gravity.CENTER
          background = roundedBox(Color.parseColor("#F4F4F6"), 99, Color.parseColor("#E2E2E8"), 1, appCtx)
          setPadding(dp(appCtx, 12), dp(appCtx, 10), dp(appCtx, 12), dp(appCtx, 10))
          setOnClickListener {
            removeActive(appCtx)
            val encodedPkg = Uri.encode(pkg ?: "")
            openLearnShift(appCtx, "learnshift://feed?app=$encodedPkg")
          }
        }

        actions.addView(startQuizBtn)
        actions.addView(openAppBtn)
        card.addView(header)
        card.addView(subtitle)
        card.addView(actions)
        container.addView(card)

        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          overlayWindowType(),
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
          PixelFormat.TRANSLUCENT,
        ).apply {
          gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
          y = dp(appCtx, 42)
        }
        wm.addView(container, params)
        activeView = container
      }.onFailure {
        Log.w(TAG, "showNudgePill failed: ${it.message}")
        removeActive(appCtx)
      }
    }
  }

  private fun localBank(ctx: Context, cfg: Config): List<NativeQuizItem> = runCatching {
    val bank = JSONArray(ctx.assets.open("learnshift-questions.json").bufferedReader().use { it.readText() })
    (0 until bank.length()).mapNotNull { i ->
      val q = bank.getJSONObject(i)
      if (q.optInt("grade") != cfg.grade || (cfg.subject != "mixed" && q.optString("subject") != cfg.subject)) return@mapNotNull null
      val choices = q.getJSONArray("options")
      val answer = q.getInt("answer")
      if (choices.length() != 4 || answer !in 0..3) return@mapNotNull null
      NativeQuizItem("", q.getString("prompt"), (0..3).map { choices.getString(it) }, answer,
        q.getString("explanation"), q.getString("topic"))
    }.shuffled().take(3)
  }.getOrDefault(emptyList())

  /** Vertical swipe-up touch container so taps hit choice buttons while upward swipes drag/advance cards. */
  private class SwipeCardContainer(
    ctx: Context,
    private val touchSlop: Int,
    private val onSwipeCommit: () -> Unit,
    private val canSwipeNow: () -> Boolean,
    private val onSwipeBlocked: () -> Unit,
  ) : LinearLayout(ctx) {
    private var downY = 0f
    private var downX = 0f
    private var dragging = false
    private val minSwipePx = dp(ctx, 42).toFloat()

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downY = ev.rawY
          downX = ev.rawX
          dragging = false
        }
        MotionEvent.ACTION_MOVE -> {
          val dy = ev.rawY - downY
          if (dy < -touchSlop && abs(dy) > abs(ev.rawX - downX) && canSwipeNow()) {
            dragging = true
            return true
          }
        }
      }
      return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_MOVE -> {
          val dy = (event.rawY - downY).coerceAtMost(0f)
          translationY = dy * 0.65f
          alpha = (1f + dy / (dp(context, 420).toFloat())).coerceIn(0.6f, 1f)
          return true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          val dy = event.rawY - downY
          if (event.actionMasked == MotionEvent.ACTION_UP && dy < -minSwipePx) {
            if (canSwipeNow()) {
              onSwipeCommit()
            } else {
              animate().translationY(0f).alpha(1f).setDuration(180).start()
              onSwipeBlocked()
            }
          } else {
            animate().translationY(0f).alpha(1f).setDuration(180).start()
          }
          dragging = false
          return true
        }
      }
      return super.onTouchEvent(event)
    }
  }

  /** Full-screen learning feed; an explicit swipe or accessible Next action advances. */
  fun showQuizOverlay(ctx: Context, cfg: Config, appLabel: String, pkg: String?, minutes: Int) {
    val appCtx = ctx.applicationContext
    mainHandler.post {
      if (!canOverlay(appCtx)) return@post
      runCatching {
        removeActive(appCtx)
        ScrollGate.clear()
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val questions = localBank(appCtx, cfg)
        if (questions.isEmpty()) return@post
        var qIndex = 0
        var answered = false
        var transitioning = false
        val ink = Color.parseColor("#172B31")
        val accent = Color.parseColor("#A83D16")
        val paper = Color.parseColor("#FFF9F1")
        fun label(value: String, size: Float = 16f) = TextView(appCtx).apply {
          text = value
          setTextColor(ink)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        }
        fun action(value: String, description: String, onClick: () -> Unit) = label(value, 14f).apply {
          contentDescription = description
          gravity = Gravity.CENTER
          minHeight = dp(appCtx, 52)
          minWidth = dp(appCtx, 52)
          isFocusable = true
          background = roundedBox(Color.WHITE, 16, Color.parseColor("#DED9CF"), 1, appCtx)
          setOnClickListener { onClick() }
        }
        val root = FrameLayout(appCtx).apply {
          setBackgroundColor(paper)
          isFocusableInTouchMode = true
          setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
              removeActive(appCtx); true
            } else false
          }
          setOnApplyWindowInsetsListener { view, insets ->
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
              insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
          }
        }
        lateinit var card: SwipeCardContainer
        lateinit var render: () -> Unit
        val scroll = ScrollView(appCtx).apply { isFillViewport = true }
        val topic = label("", 18f).apply { setTypeface(typeface, Typeface.BOLD) }
        val progress = label("", 13f)
        val prompt = label("", 25f).apply { setTypeface(typeface, Typeface.BOLD); setPadding(0, dp(appCtx, 20), 0, dp(appCtx, 20)) }
        val choices = LinearLayout(appCtx).apply { orientation = LinearLayout.VERTICAL }
        val explanation = label("", 16f).apply {
          visibility = View.GONE
          accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
          setPadding(0, dp(appCtx, 16), 0, dp(appCtx, 16))
        }
        val next = label("", 16f).apply {
          gravity = Gravity.CENTER
          minHeight = dp(appCtx, 56)
          isFocusable = true
          setTypeface(typeface, Typeface.BOLD)
          setTextColor(Color.WHITE)
          background = roundedBox(accent, 18, ctx = appCtx)
        }
        fun advance() {
          if (!answered || transitioning) return
          transitioning = true
          card.animate().translationY(-root.height.toFloat()).setDuration(220)
            .setListener(object : AnimatorListenerAdapter() {
              override fun onAnimationEnd(animation: Animator) {
                if (activeView !== root) return
                if (qIndex == questions.lastIndex) { removeActive(appCtx); return }
                qIndex++
                render()
                card.animate().setListener(null)
                card.alpha = 1f
                card.translationY = root.height.toFloat()
                card.animate().translationY(0f).setDuration(240).setInterpolator(DecelerateInterpolator())
                  .withEndAction { transitioning = false }.start()
              }
            }).start()
        }
        card = SwipeCardContainer(appCtx, ViewConfiguration.get(appCtx).scaledTouchSlop,
          { advance() }, { answered && !transitioning && !scroll.canScrollVertically(1) }, { }).apply {
          orientation = LinearLayout.VERTICAL
          setBackgroundColor(paper)
          setPadding(dp(appCtx, 20), dp(appCtx, 16), dp(appCtx, 20), dp(appCtx, 16))
          layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        }
        val heading = LinearLayout(appCtx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val titles = LinearLayout(appCtx).apply { orientation = LinearLayout.VERTICAL; addView(label("LEARN SHIFT · GRADE ${cfg.grade}", 11f)); addView(topic); addView(progress) }
        heading.addView(titles, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        heading.addView(action("✕", "Close learning break") { removeActive(appCtx) })
        card.addView(heading)
        val body = LinearLayout(appCtx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val content = LinearLayout(appCtx).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(0, dp(appCtx, 12), dp(appCtx, 12), dp(appCtx, 12))
          addView(prompt); addView(choices); addView(explanation)
        }
        scroll.addView(content)
        body.addView(scroll, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
        val rail = LinearLayout(appCtx).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER }
        rail.addView(action("?\nHelp", "Show a hint") {
          val q = questions[qIndex]
          explanation.text = if (answered) q.explanation else q.tip.ifBlank {
            if (cfg.fil) "Basahin ang tanong. Suriin ang bawat sagot. Puwede kang magkamali." else "Read the question. Try each choice. It is okay to make a mistake."
          }
          explanation.visibility = View.VISIBLE
        })
        rail.addView(action("↑\nNext", "Next question after answering") { advance() },
          LinearLayout.LayoutParams(dp(appCtx, 56), dp(appCtx, 60)).apply { topMargin = dp(appCtx, 12) })
        body.addView(rail, LinearLayout.LayoutParams(dp(appCtx, 56), LinearLayout.LayoutParams.WRAP_CONTENT))
        card.addView(body, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        val mediaStatus = label("", 12f).apply { setPadding(0, dp(appCtx, 8), 0, dp(appCtx, 8)) }
        card.addView(mediaStatus)
        card.addView(label(if (cfg.fil) "Kaunting aral. Walang pagmamadali." else "A little learning. Take your time.", 15f))
        next.setOnClickListener { advance() }
        card.addView(next, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(appCtx, 12) })
        render = {
          answered = false
          topic.text = questions[qIndex].topic
          progress.text = "${qIndex + 1} / ${questions.size} · $appLabel"
          prompt.text = questions[qIndex].prompt
          explanation.visibility = View.GONE
          choices.removeAllViews()
          next.text = if (cfg.fil) "Pumili ng sagot" else "Choose an answer"
          next.isEnabled = false
          next.alpha = 0.55f
          scroll.scrollTo(0, 0)
          val q = questions[qIndex]
          val buttons = mutableListOf<TextView>()
          q.choices.forEachIndexed { index, choice ->
            val button = action("${('A'.code + index).toChar()}   $choice", choice) {
              if (!answered) {
                answered = true
                buttons.forEachIndexed { n, view ->
                  if (n == q.answer) {
                    view.text = "✓  ${q.choices[n]}"
                    view.background = roundedBox(Color.parseColor("#D9F3DE"), 16, Color.parseColor("#25723B"), 2, appCtx)
                  } else if (n == index) {
                    view.text = "Try again next time · ${q.choices[n]}"
                    view.background = roundedBox(Color.parseColor("#FBE5D7"), 16, accent, 2, appCtx)
                  }
                }
                explanation.text = (if (index == q.answer) "✓ " else "Let's learn: ") + q.explanation
                explanation.visibility = View.VISIBLE
                next.text = if (qIndex == questions.lastIndex) "↑  Return to $appLabel" else "↑  Swipe up or tap Next"
                next.isEnabled = true
                next.alpha = 1f
              }
            }.apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(appCtx, 14), dp(appCtx, 12), dp(appCtx, 14), dp(appCtx, 12)) }
            buttons.add(button)
            choices.addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(appCtx, 10) })
          }
        }
        render()
        root.addView(card)
        val params = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
          overlayWindowType(), WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_SECURE,
          PixelFormat.OPAQUE)
        wm.addView(root, params)
        activeView = root
        activePackage = pkg
        root.requestFocus()
        root.requestApplyInsets()
        val paused = pauseMedia(appCtx)
        mediaStatus.text = if (paused) "Media pause requested · resumes when supported" else "Pause your video if it is still playing"
        card.translationY = appCtx.resources.displayMetrics.heightPixels.toFloat()
        card.animate().translationY(0f).setDuration(280).setInterpolator(DecelerateInterpolator()).start()
      }.onFailure {
        Log.w(TAG, "Could not display learning break")
        removeActive(appCtx)
      }
    }
  }
}
