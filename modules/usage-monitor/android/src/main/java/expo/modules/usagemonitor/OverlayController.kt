package expo.modules.usagemonitor

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import kotlin.math.abs

/**
 * Draws an opaque full-screen learning feed over a supported foreground app.
 * The sheet has no close control: the student answers the questions, then swipes
 * up to return. Playing media is paused when the sheet appears and resumed only
 * when the break is completed. Fail-open: any exception removes the overlay
 * rather than trapping the student, and leaving the app (Home, app switch,
 * screen lock) always removes it.
 */
object OverlayController {
  private const val TAG = "LearnShiftOverlay"
  private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile private var activeView: View? = null
  @Volatile private var quizShowing = false
  @Volatile private var statusHintView: TextView? = null
  private var activePackage: String? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var pausedByUs = false
  private val focusListener = AudioManager.OnAudioFocusChangeListener { }
  private var pendingRunnable: Runnable? = null

  /** Fast start, long soft landing: the sheet glides in like it has weight. */
  private val glide = PathInterpolator(0.16f, 1f, 0.3f, 1f)

  private data class NativeQuizItem(
    val tip: String,
    val prompt: String,
    val choices: List<String>,
    val answer: Int,
    val explanation: String,
    val topic: String = "Learning break",
  )

  fun canOverlay(ctx: Context): Boolean = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)

  fun isShowing(): Boolean = quizShowing

  fun isGateShowing(): Boolean = activeView != null && !quizShowing

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

  /** A sheet with rounded top corners, used while it slides over the app. */
  private fun sheetBox(fillColor: Int, ctx: Context): GradientDrawable = GradientDrawable().apply {
    setColor(fillColor)
    val r = dp(ctx, 28).toFloat()
    cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
  }

  private fun sendMediaKey(manager: AudioManager, key: Int) {
    val now = SystemClock.uptimeMillis()
    runCatching {
      manager.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, key, 0))
      manager.dispatchMediaKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, key, 0))
    }
  }

  /**
   * Pauses whatever is playing: a standard media Pause key for the active
   * session, plus a transient audio-focus request so cooperating players stay
   * quiet. Returns true when media was playing and a pause was sent.
   */
  @Suppress("DEPRECATION")
  private fun pauseMedia(ctx: Context): Boolean {
    val manager = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audioManager = manager
    val wasPlaying = runCatching { manager.isMusicActive }.getOrDefault(false)
    if (wasPlaying) {
      sendMediaKey(manager, KeyEvent.KEYCODE_MEDIA_PAUSE)
      pausedByUs = true
    }
    // Apps targeting Android 15+ need foreground eligibility to request focus.
    if (Build.VERSION.SDK_INT >= 35 && !MonitorService.running) return wasPlaying
    runCatching {
      if (Build.VERSION.SDK_INT >= 26) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
          .setAcceptsDelayedFocusGain(false)
          .setOnAudioFocusChangeListener(focusListener, mainHandler).build()
        focusRequest = request
        manager.requestAudioFocus(request)
      } else manager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
    return wasPlaying
  }

  /** Releases focus; resumes playback only if we paused it and the break was completed. */
  @Suppress("DEPRECATION")
  private fun releaseMedia(resume: Boolean = false) {
    val manager = audioManager
    val request = focusRequest
    val resumeNow = resume && pausedByUs
    audioManager = null
    focusRequest = null
    pausedByUs = false
    runCatching {
      if (Build.VERSION.SDK_INT >= 26 && request != null) manager?.abandonAudioFocusRequest(request)
      else manager?.abandonAudioFocus(focusListener)
    }
    if (resumeNow && manager != null) {
      mainHandler.postDelayed({ if (activeView == null) sendMediaKey(manager, KeyEvent.KEYCODE_MEDIA_PLAY) }, 320L)
    }
  }

  private fun returnToExternalApp(ctx: Context, pkg: String?) {
    if (pkg.isNullOrBlank() || pkg == ctx.packageName) return
    val intent = ctx.packageManager.getLaunchIntentForPackage(pkg) ?: return
    intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { ctx.startActivity(intent) }
  }

  private fun lockNavNotice(ctx: Context): String =
    if (Store.config(ctx).fil) "🔒 Tapusin muna ang mga tanong — naka-lock ang Home at Recent Apps."
    else "🔒 Answer the questions first — Home and Recent Apps are locked."

  @Suppress("DEPRECATION")
  private fun hideSystemBars(view: View) {
    view.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_FULLSCREEN
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    )
  }

  private fun removeActive(ctx: Context, completed: Boolean = false) {
    val overlayPkg = activePackage
    val wasQuiz = quizShowing
    releaseMedia(completed)
    quizShowing = false
    statusHintView = null
    val v = activeView ?: return
    activeView = null
    activePackage = null
    v.animate().cancel()
    val wm = ctx.applicationContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    runCatching { wm.removeViewImmediate(v) }
    if (completed || wasQuiz) {
      Store.putLong(ctx, "snoozeUntil", System.currentTimeMillis() + Store.config(ctx).overlayIntervalSec * 1000L)
    }
    if (completed) {
      val targetPkg = overlayPkg ?: Store.getString(ctx, "lastUsedPkg")
      returnToExternalApp(ctx, targetPkg)
    }
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
    val appCtx = ctx.applicationContext
    mainHandler.post {
      val root = activeView ?: return@post
      if (quizShowing) {
        if (pkg != appCtx.packageName && pkg != activePackage) {
          root.requestFocus()
          hideSystemBars(root)
          statusHintView?.text = lockNavNotice(appCtx)
        }
        return@post
      }
      if (pkg != appCtx.packageName && pkg != activePackage) removeActive(appCtx)
    }
  }

  /**
   * Arms an invisible swipe gate over the active app after the timer ends.
   * Nothing appears automatically: the learning sheet slides up only when the
   * user performs their next upward swipe.
   */
  fun armSwipeTrigger(ctx: Context, cfg: Config, appLabel: String, pkg: String?, minutes: Int) {
    val appCtx = ctx.applicationContext
    mainHandler.post {
      if (!canOverlay(appCtx) || quizShowing || activeView != null) return@post
      runCatching {
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val touchSlop = ViewConfiguration.get(appCtx).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var triggered = false

        val gateView = FrameLayout(appCtx).apply {
          setBackgroundColor(Color.TRANSPARENT)
          setOnTouchListener { _, event ->
            if (triggered) return@setOnTouchListener true
            when (event.actionMasked) {
              MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                true
              }
              MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP -> {
                val dy = event.rawY - downY
                val dx = event.rawX - downX
                if (dy < -touchSlop && abs(dy) > abs(dx)) {
                  triggered = true
                  ScrollGate.clear()
                  showQuizOverlay(appCtx, cfg, appLabel, pkg, minutes)
                  return@setOnTouchListener true
                }
                false
              }
              else -> false
            }
          }
        }

        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.MATCH_PARENT,
          overlayWindowType(),
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
          PixelFormat.TRANSLUCENT,
        )
        wm.addView(gateView, params)
        activeView = gateView
        quizShowing = false
        activePackage = pkg
      }.onFailure {
        Log.w(TAG, "Could not arm swipe trigger")
        removeActive(appCtx)
      }
    }
  }

  fun scheduleOverlay(
    ctx: Context,
    cfg: Config,
    appLabel: String,
    pkg: String?,
    minutes: Int,
    @Suppress("UNUSED_PARAMETER") mode: String,
    delayMs: Long,
  ) {
    val appCtx = ctx.applicationContext
    pendingRunnable?.let { mainHandler.removeCallbacks(it) }
    val task = Runnable {
      showQuizOverlay(appCtx, cfg, appLabel, pkg, minutes)
    }
    pendingRunnable = task
    mainHandler.postDelayed(task, delayMs.coerceAtLeast(0L))
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

    private fun settle() {
      animate().translationY(0f).alpha(1f).setDuration(320).setInterpolator(glide).start()
    }

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
            animate().cancel()
            return true
          }
        }
      }
      return false
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_MOVE -> {
          // The sheet follows the finger with a little resistance, like a real page.
          val dy = (event.rawY - downY).coerceAtMost(0f)
          translationY = dy * 0.7f
          alpha = (1f + dy / (dp(context, 520).toFloat())).coerceIn(0.7f, 1f)
          return true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          val dy = event.rawY - downY
          if (event.actionMasked == MotionEvent.ACTION_UP && dy < -minSwipePx) {
            if (canSwipeNow()) {
              onSwipeCommit()
            } else {
              settle()
              onSwipeBlocked()
            }
          } else {
            settle()
          }
          dragging = false
          return true
        }
      }
      return super.onTouchEvent(event)
    }
  }

  /**
   * Full-screen learning sheet. It glides up over the app, the questions rise in
   * one by one, and it can only be finished by answering: there is no close
   * control and Back is ignored. Swiping up (or Next) after an answer moves on;
   * on the last question the sheet slides away and playback resumes.
   */
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
        var transitioning = true // locked until the entrance finishes
        val ink = Color.parseColor("#172B31")
        val accent = Color.parseColor("#A83D16")
        val paper = Color.parseColor("#FFF9F1")
        val screenH = appCtx.resources.displayMetrics.heightPixels.toFloat()
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
        lateinit var card: SwipeCardContainer
        lateinit var render: () -> Unit
        val footerHint = label(
          if (cfg.fil) "Sagutan ang mga tanong para makabalik. Walang pagmamadali."
          else "Answer the questions to continue. Take your time.",
          15f,
        )
        val root = FrameLayout(appCtx).apply {
          isFocusableInTouchMode = true
          hideSystemBars(this)
          // The break is finished only by answering, so Back, Home, and Recent Apps are locked.
          setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_HOME ||
              keyCode == KeyEvent.KEYCODE_APP_SWITCH || keyCode == KeyEvent.KEYCODE_MENU) {
              if (event.action == KeyEvent.ACTION_DOWN) footerHint.text = lockNavNotice(appCtx)
              true
            } else {
              false
            }
          }
          setOnApplyWindowInsetsListener { _, insets ->
            @Suppress("DEPRECATION")
            card.setPadding(dp(appCtx, 20) + insets.systemWindowInsetLeft, dp(appCtx, 16) + insets.systemWindowInsetTop,
              dp(appCtx, 20) + insets.systemWindowInsetRight, dp(appCtx, 16) + insets.systemWindowInsetBottom)
            insets
          }
        }
        val scrim = View(appCtx).apply { setBackgroundColor(Color.BLACK); alpha = 0f }
        root.addView(scrim, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
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

        /** Question text and choices rise in one after another. */
        fun reveal(baseDelay: Long) {
          val items = mutableListOf<View>(prompt)
          for (i in 0 until choices.childCount) items.add(choices.getChildAt(i))
          items.forEachIndexed { i, v ->
            v.animate().cancel()
            v.alpha = 0f
            v.translationY = dp(appCtx, 22).toFloat()
            v.animate().alpha(1f).translationY(0f).setDuration(360)
              .setStartDelay(baseDelay + 60L * i).setInterpolator(glide).start()
          }
        }

        fun advance() {
          if (!answered || transitioning) return
          transitioning = true
          card.animate().cancel()
          if (qIndex == questions.lastIndex) {
            // Finished: the sheet lifts away and the app is revealed underneath.
            card.background = sheetBox(paper, appCtx)
            root.setBackgroundColor(Color.TRANSPARENT)
            scrim.visibility = View.VISIBLE
            scrim.alpha = 0.45f
            scrim.animate().alpha(0f).setDuration(420).start()
            card.animate().translationY(-screenH).setDuration(440).setInterpolator(AccelerateInterpolator(1.5f))
              .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                  if (activeView === root) removeActive(appCtx, completed = true)
                }
              }).start()
            return
          }
          card.animate().translationY(-dp(appCtx, 120).toFloat()).alpha(0f).setDuration(190)
            .setInterpolator(AccelerateInterpolator(1.3f))
            .setListener(object : AnimatorListenerAdapter() {
              override fun onAnimationEnd(animation: Animator) {
                if (activeView !== root) return
                qIndex++
                render()
                card.animate().setListener(null)
                card.translationY = dp(appCtx, 140).toFloat()
                card.alpha = 0f
                card.animate().translationY(0f).alpha(1f).setDuration(400).setInterpolator(glide)
                  .withEndAction { transitioning = false }.start()
                reveal(70L)
              }
            }).start()
        }
        card = SwipeCardContainer(appCtx, ViewConfiguration.get(appCtx).scaledTouchSlop,
          { advance() }, { answered && !transitioning && !scroll.canScrollVertically(1) }, { }).apply {
          orientation = LinearLayout.VERTICAL
          background = sheetBox(paper, appCtx)
          setPadding(dp(appCtx, 20), dp(appCtx, 12), dp(appCtx, 20), dp(appCtx, 16))
          layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        }
        val handleWrap = LinearLayout(appCtx).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_HORIZONTAL
          setPadding(0, 0, 0, dp(appCtx, 10))
        }
        val handle = View(appCtx).apply {
          background = roundedBox(Color.parseColor("#D5CFC4"), 99, ctx = appCtx)
        }
        handleWrap.addView(handle, LinearLayout.LayoutParams(dp(appCtx, 36), dp(appCtx, 5)))
        card.addView(handleWrap)
        val heading = LinearLayout(appCtx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val titles = LinearLayout(appCtx).apply { orientation = LinearLayout.VERTICAL; addView(label("LEARN SHIFT · GRADE ${cfg.grade}", 11f)); addView(topic); addView(progress) }
        heading.addView(titles, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
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
        val mediaStatus = label("", 12f).apply {
          setTextColor(Color.parseColor("#4E5D58"))
          setTypeface(typeface, Typeface.BOLD)
          background = roundedBox(Color.parseColor("#EFEAE1"), 12, ctx = appCtx)
          setPadding(dp(appCtx, 12), dp(appCtx, 7), dp(appCtx, 12), dp(appCtx, 7))
        }
        card.addView(mediaStatus, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(appCtx, 8) })
        card.addView(footerHint)
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
                explanation.alpha = 0f
                explanation.animate().alpha(1f).setDuration(260).start()
                next.text = if (qIndex == questions.lastIndex) {
                  if (cfg.fil) "↑  Balik sa free time · $appLabel" else "↑  Back to free time · $appLabel"
                } else {
                  if (cfg.fil) "↑  Mag-swipe pataas o i-tap ang Susunod" else "↑  Swipe up or tap Next"
                }
                next.isEnabled = true
                next.animate().alpha(1f).setDuration(220).start()
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
          PixelFormat.TRANSLUCENT)
        // Pause playback first so the sound stops as the sheet starts to move.
        val paused = pauseMedia(appCtx)
        wm.addView(root, params)
        activeView = root
        quizShowing = true
        statusHintView = footerHint
        activePackage = pkg
        Store.putLong(appCtx, "lastNudge", System.currentTimeMillis())
        hideSystemBars(root)
        root.requestFocus()
        root.requestApplyInsets()
        mediaStatus.text = when {
          paused && cfg.fil -> "⏸  Naka-pause ang video sa $appLabel · magpapatuloy pagkatapos"
          paused -> "⏸  Video paused in $appLabel · resumes when you finish"
          cfg.fil -> "Walang tumutugtog na media"
          else -> "No video playing"
        }
        // Some players ignore the pause key; say so honestly instead of claiming success.
        if (paused) {
          mainHandler.postDelayed({
            if (activeView === root && runCatching { audioManager?.isMusicActive }.getOrNull() == true) {
              mediaStatus.text = if (cfg.fil) "Pakipause ang video kung tumutugtog pa" else "Pause your video if it is still playing"
            }
          }, 900L)
        }
        // Entrance: the sheet glides up over the app while the app dims behind it.
        card.translationY = screenH
        reveal(180L)
        scrim.animate().alpha(0.5f).setDuration(380).start()
        card.animate().translationY(0f).setDuration(520).setInterpolator(glide).withEndAction {
          if (activeView === root) {
            // Fully covering the screen now: switch to a flat sheet and drop the dim layer.
            card.background = null
            card.setBackgroundColor(paper)
            root.setBackgroundColor(paper)
            scrim.visibility = View.GONE
            transitioning = false
          }
        }.start()
      }.onFailure {
        Log.w(TAG, "Could not display learning break")
        removeActive(appCtx)
      }
    }
  }
}
