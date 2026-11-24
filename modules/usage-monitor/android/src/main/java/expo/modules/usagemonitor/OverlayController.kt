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
    val visual: org.json.JSONObject? = null,
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

  internal fun pauseMediaForLockdown(ctx: Context) {
    pauseMedia(ctx)
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
    if (completed && wasQuiz) {
      if (overlayPkg != null && Categories.of(ctx, overlayPkg).distracting) {
        val nextStreak = minOf(5, Store.getInt(ctx, "distractionStreak") + 1)
        Store.putInt(ctx, "distractionStreak", nextStreak)
        Store.putLong(ctx, "lastDistractingBreakAt", System.currentTimeMillis())
      }
      val now = System.currentTimeMillis()
      val day = Days.key(java.util.Calendar.getInstance())
      Store.recordBreak(ctx, day, 1)
      Store.enqueue(
        ctx,
        org.json.JSONObject()
          .put("client_id", "brk-${now.toString(36)}")
          .put("at", MonitorService.iso(now))
          .put("level", "break")
          .put("reasons", JSONArray())
          .put("response", "took"),
      )
      val appCtx = ctx.applicationContext
      Thread { Reporter.report(appCtx, Store.config(appCtx), true) }.start()
    }
    if (completed || wasQuiz) {
      Store.putLong(ctx, "snoozeUntil", System.currentTimeMillis() + 3_000L)
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

  /**
   * Three questions for the student's grade and subject. Reads only that grade's asset, prefers questions not
   * seen yet (remembered per grade+subject, starting over once all were shown), and shuffles the choices.
   */
  private fun localBank(ctx: Context, cfg: Config): List<NativeQuizItem> = runCatching {
    val bank = JSONArray(ctx.assets.open("learnshift-questions-g${cfg.grade}.json").bufferedReader().use { it.readText() })
    val pool = (0 until bank.length()).mapNotNull { i ->
      val q = bank.getJSONObject(i)
      if (q.optInt("grade") != cfg.grade || (cfg.subject != "mixed" && q.optString("subject") != cfg.subject)) return@mapNotNull null
      val choices = q.getJSONArray("options")
      val answer = q.getInt("answer")
      if (choices.length() != 4 || answer !in 0..3) return@mapNotNull null
<<<<<<< HEAD
      NativeQuizItem(
        "",
        q.getString("prompt"),
        (0..3).map { choices.getString(it) },
        answer,
        q.getString("explanation"),
        q.getString("topic"),
        q.optJSONObject("visual"),
      )
    }.shuffled().take(3)
=======
      q
    }
    val prefs = ctx.applicationContext.getSharedPreferences("learnshift_seen_questions", Context.MODE_PRIVATE)
    val key = "g${cfg.grade}:${cfg.subject}"
    val ids = pool.map { it.optString("id") }.toSet()
    var seen = (prefs.getString(key, "") ?: "").split(',').filter { it in ids }.toMutableSet()
    val fresh = pool.filter { it.optString("id") !in seen }
    val picked = if (fresh.size >= 3) {
      fresh.shuffled().take(3)
    } else {
      // Every question was shown: start a new cycle, finishing the unseen ones first.
      seen = mutableSetOf()
      (fresh.shuffled() + pool.filter { it !in fresh }.shuffled()).take(3)
    }
    seen.addAll(picked.map { it.optString("id") })
    prefs.edit().putString(key, seen.joinToString(",")).apply()
    picked.map { q ->
      val choices = q.getJSONArray("options")
      val order = (0..3).shuffled()
      NativeQuizItem(
        "",
        q.getString("prompt"),
        order.map { choices.getString(it) },
        order.indexOf(q.getInt("answer")),
        q.getString("explanation"),
        q.getString("topic"),
        q.optJSONObject("visual"),
      )
    }
>>>>>>> origin/main
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
    private val minSwipePx = dp(ctx, 32).toFloat()

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
   * Full-screen learning sheet. It glides up over the app, fits the visual,
   * question, and 4 options onto a single page, and advances when swiping up
   * after answering. Media playback stays paused until the break finishes.
   */
  fun showQuizOverlay(ctx: Context, cfg: Config, @Suppress("UNUSED_PARAMETER") appLabel: String, pkg: String?, @Suppress("UNUSED_PARAMETER") minutes: Int) {
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
        val ink = Color.parseColor("#17352F")
        val green = Color.parseColor("#146B50")
        val accent = Color.parseColor("#A83D16")
        val paper = Color.parseColor("#F3F8F3")
        val screenH = appCtx.resources.displayMetrics.heightPixels.toFloat()
        val touchSlop = ViewConfiguration.get(appCtx).scaledTouchSlop
        fun label(value: String, size: Float = 15f) = TextView(appCtx).apply {
          text = value
          setTextColor(ink)
          setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        }
        fun choiceBtn(value: String, description: String, onClick: () -> Unit) = label(value, 14f).apply {
          contentDescription = description
          gravity = Gravity.CENTER_VERTICAL
          minHeight = dp(appCtx, 44)
          isFocusable = true
          background = roundedBox(Color.WHITE, 14, Color.parseColor("#CCDCCF"), 1, appCtx)
          setPadding(dp(appCtx, 12), dp(appCtx, 10), dp(appCtx, 12), dp(appCtx, 10))
          setOnClickListener { onClick() }
        }
        lateinit var card: SwipeCardContainer
        lateinit var render: () -> Unit
        val swipeCue = label(
          if (cfg.fil) "↑  Mag-swipe pataas kapag tapos na" else "↑  Swipe up when finished",
          14f,
        ).apply {
          gravity = Gravity.CENTER
          setTypeface(typeface, Typeface.BOLD)
          setTextColor(Color.parseColor("#50675F"))
          background = roundedBox(Color.parseColor("#E8EFE9"), 999, ctx = appCtx)
          setPadding(dp(appCtx, 16), dp(appCtx, 9), dp(appCtx, 16), dp(appCtx, 9))
          alpha = 0.48f
        }
        val root = FrameLayout(appCtx).apply {
          isFocusableInTouchMode = true
          hideSystemBars(this)
          // The break is finished only by answering, so Back, Home, and Recent Apps are locked.
          setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_HOME ||
              keyCode == KeyEvent.KEYCODE_APP_SWITCH || keyCode == KeyEvent.KEYCODE_MENU) {
              if (event.action == KeyEvent.ACTION_DOWN) {
                swipeCue.text = lockNavNotice(appCtx)
                swipeCue.alpha = 1f
              }
              true
            } else {
              false
            }
          }
          setOnApplyWindowInsetsListener { _, insets ->
            @Suppress("DEPRECATION")
            card.setPadding(
              dp(appCtx, 18) + insets.systemWindowInsetLeft,
              dp(appCtx, 10) + insets.systemWindowInsetTop,
              dp(appCtx, 18) + insets.systemWindowInsetRight,
              dp(appCtx, 12) + insets.systemWindowInsetBottom,
            )
            insets
          }
        }
        val scrim = View(appCtx).apply { setBackgroundColor(Color.BLACK); alpha = 0f }
        root.addView(scrim, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val scroll = ScrollView(appCtx).apply {
          isFillViewport = true
          isVerticalScrollBarEnabled = false
        }
        val overline = label("", 11f).apply {
          setTextColor(green)
          setTypeface(typeface, Typeface.BOLD)
        }
        val topic = label("", 17f).apply {
          setTypeface(typeface, Typeface.BOLD)
          maxLines = 1
        }
        val progressBar = LinearLayout(appCtx).apply {
          orientation = LinearLayout.HORIZONTAL
        }
        val visualView = QuestionVisualView(appCtx)
        val prompt = label("", 19f).apply {
          setTypeface(typeface, Typeface.BOLD)
          setPadding(0, dp(appCtx, 6), 0, dp(appCtx, 10))
        }
        val choices = LinearLayout(appCtx).apply { orientation = LinearLayout.VERTICAL }
        val explanation = label("", 13f).apply {
          visibility = View.GONE
          accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
          background = roundedBox(Color.parseColor("#E1EEDF"), 12, ctx = appCtx)
          setPadding(dp(appCtx, 12), dp(appCtx, 9), dp(appCtx, 12), dp(appCtx, 9))
        }

        /** Visual, question text, and choices rise in softly. */
        fun reveal(baseDelay: Long) {
          val items = mutableListOf<View>()
          if (visualView.visibility == View.VISIBLE) items.add(visualView)
          items.add(prompt)
          for (i in 0 until choices.childCount) items.add(choices.getChildAt(i))
          items.forEachIndexed { i, v ->
            v.animate().cancel()
            v.alpha = 0f
            v.translationY = dp(appCtx, 18).toFloat()
            v.animate().alpha(1f).translationY(0f).setDuration(320)
              .setStartDelay(baseDelay + 45L * i).setInterpolator(glide).start()
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
                card.animate().translationY(0f).alpha(1f).setDuration(380).setInterpolator(glide)
                  .withEndAction { transitioning = false }.start()
                reveal(60L)
              }
            }).start()
        }

        val content = LinearLayout(appCtx).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(0, dp(appCtx, 6), 0, dp(appCtx, 6))
          addView(
            visualView,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
              bottomMargin = dp(appCtx, 6)
            },
          )
          addView(prompt)
          addView(choices)
          addView(
            explanation,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(appCtx, 8)
            },
          )
        }
        scroll.addView(content)

        card = SwipeCardContainer(
          appCtx,
          touchSlop,
          { advance() },
          { answered && !transitioning && (!scroll.canScrollVertically(1) || content.height <= scroll.height + dp(appCtx, 8)) },
          { },
        ).apply {
          orientation = LinearLayout.VERTICAL
          background = sheetBox(paper, appCtx)
          setPadding(dp(appCtx, 18), dp(appCtx, 10), dp(appCtx, 18), dp(appCtx, 12))
          layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        }
        val handleWrap = LinearLayout(appCtx).apply {
          orientation = LinearLayout.VERTICAL
          gravity = Gravity.CENTER_HORIZONTAL
          setPadding(0, 0, 0, dp(appCtx, 6))
        }
        val handle = View(appCtx).apply {
          background = roundedBox(Color.parseColor("#C8D8CC"), 99, ctx = appCtx)
        }
        handleWrap.addView(handle, LinearLayout.LayoutParams(dp(appCtx, 36), dp(appCtx, 4)))
        card.addView(handleWrap)

        val heading = LinearLayout(appCtx).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(0, 0, 0, dp(appCtx, 6))
        }
        val titles = LinearLayout(appCtx).apply {
          orientation = LinearLayout.VERTICAL
          addView(overline)
          addView(topic)
        }
        val helpBtn = label("?", 15f).apply {
          contentDescription = if (cfg.fil) "Tulong" else "Help"
          gravity = Gravity.CENTER
          setTypeface(typeface, Typeface.BOLD)
          setTextColor(green)
          background = roundedBox(Color.parseColor("#E1EEDF"), 999, ctx = appCtx)
          setOnClickListener {
            val q = questions[qIndex]
            if (explanation.visibility == View.VISIBLE) {
              explanation.visibility = View.GONE
            } else {
              explanation.text = if (answered) q.explanation else q.tip.ifBlank {
                if (cfg.fil) "Basahin ang tanong o tingnan ang larawan bago pumili."
                else "Look closely at the question and picture, then pick an answer."
              }
              explanation.visibility = View.VISIBLE
            }
          }
        }
        heading.addView(titles, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        heading.addView(helpBtn, LinearLayout.LayoutParams(dp(appCtx, 36), dp(appCtx, 36)))
        card.addView(heading)

        card.addView(
          progressBar,
          LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(appCtx, 6)
          },
        )
        card.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        var cueDownY = 0f
        swipeCue.setOnTouchListener { _, event ->
          when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
              cueDownY = event.rawY
              true
            }
            MotionEvent.ACTION_UP -> {
              if (event.rawY - cueDownY < -dp(appCtx, 28)) advance()
              true
            }
            else -> false
          }
        }
        val swipeCueWrap = FrameLayout(appCtx).apply {
          setPadding(0, dp(appCtx, 6), 0, dp(appCtx, 4))
          addView(
            swipeCue,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER),
          )
        }
        card.addView(swipeCueWrap, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        render = {
          answered = false
          val q = questions[qIndex]
          overline.text = "LEARNSHIFT · GRADE ${cfg.grade} · ${qIndex + 1}/${questions.size}"
          topic.text = q.topic
          progressBar.removeAllViews()
          for (i in questions.indices) {
            val seg = View(appCtx).apply {
              background = roundedBox(
                Color.parseColor(if (i <= qIndex) "#146B50" else "#D6E3D8"),
                99,
                ctx = appCtx,
              )
            }
            val lp = LinearLayout.LayoutParams(0, dp(appCtx, 4), 1f)
            if (i < questions.lastIndex) lp.marginEnd = dp(appCtx, 4)
            progressBar.addView(seg, lp)
          }
          visualView.setVisual(q.visual)
          prompt.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (q.visual != null) 18f else 20f)
          prompt.text = q.prompt
          explanation.visibility = View.GONE
          choices.removeAllViews()
          swipeCue.text = if (cfg.fil) "↑  Mag-swipe pataas kapag tapos na" else "↑  Swipe up when finished"
          swipeCue.setTextColor(Color.parseColor("#50675F"))
          swipeCue.background = roundedBox(Color.parseColor("#E8EFE9"), 999, ctx = appCtx)
          swipeCue.alpha = 0.48f
          scroll.scrollTo(0, 0)

          val buttons = mutableListOf<TextView>()
          val useGrid = q.choices.all { it.length <= 14 }
          q.choices.forEachIndexed { idx, choice ->
            val btn = choiceBtn("${('A'.code + idx).toChar()}   $choice", choice) {
              if (!answered) {
                answered = true
                buttons.forEachIndexed { n, view ->
                  if (n == q.answer) {
                    view.text = "✓  ${q.choices[n]}"
                    view.background = roundedBox(Color.parseColor("#DEEFE3"), 14, green, 2, appCtx)
                  } else if (n == idx) {
                    view.text = "✕  ${q.choices[n]}"
                    view.background = roundedBox(Color.parseColor("#FFF4DB"), 14, Color.parseColor("#936B28"), 2, appCtx)
                  }
                }
                explanation.text = (if (idx == q.answer) "✓ " else "Heto kung bakit / Let's learn: ") + q.explanation
                explanation.visibility = View.VISIBLE
                explanation.alpha = 0f
                explanation.animate().alpha(1f).setDuration(220).start()
                swipeCue.text = if (cfg.fil) "↑  Mag-swipe pataas kapag tapos na" else "↑  Swipe up when finished"
                swipeCue.setTextColor(green)
                swipeCue.background = roundedBox(Color.parseColor("#DCEFE2"), 999, green, 1, appCtx)
                swipeCue.animate().alpha(1f).setDuration(200).start()
              }
            }
            buttons.add(btn)
          }

          if (useGrid) {
            for (rowIdx in 0..1) {
              val row = LinearLayout(appCtx).apply { orientation = LinearLayout.HORIZONTAL }
              for (colIdx in 0..1) {
                val idx = rowIdx * 2 + colIdx
                val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                if (colIdx == 0) lp.marginEnd = dp(appCtx, 8)
                row.addView(buttons[idx], lp)
              }
              choices.addView(
                row,
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                  if (rowIdx == 0) bottomMargin = dp(appCtx, 8)
                },
              )
            }
          } else {
            buttons.forEachIndexed { idx, btn ->
              choices.addView(
                btn,
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                  if (idx < buttons.lastIndex) bottomMargin = dp(appCtx, 8)
                },
              )
            }
          }
        }
        render()
        root.addView(card)
        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.MATCH_PARENT,
          overlayWindowType(),
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_SECURE,
          PixelFormat.TRANSLUCENT,
        )
        // Pause playback silently while the break sheet is open.
        pauseMedia(appCtx)
        wm.addView(root, params)
        activeView = root
        quizShowing = true
        statusHintView = swipeCue
        activePackage = pkg
        Store.putLong(appCtx, "lastNudge", System.currentTimeMillis())
        hideSystemBars(root)
        root.requestFocus()
        root.requestApplyInsets()
        // Entrance: the sheet glides up over the app while the app dims behind it.
        card.translationY = screenH
        reveal(180L)
        scrim.animate().alpha(0.5f).setDuration(380).start()
        card.animate().translationY(0f).setDuration(520).setInterpolator(glide).withEndAction {
          if (activeView === root) {
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
