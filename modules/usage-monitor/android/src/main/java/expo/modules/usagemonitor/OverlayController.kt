package expo.modules.usagemonitor

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
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
import kotlin.math.abs

/**
 * Draws crisp WHITE floating Nudge Cards and a 3-Card Vertical Swipe-Up Feed
 * overlay directly over real opened third-party apps via WindowManager.
 * Fail-open: any exception removes the overlay rather than trapping the student.
 */
object OverlayController {
  private const val TAG = "LearnShiftOverlay"
  private val mainHandler = Handler(Looper.getMainLooper())
  private var activeView: View? = null
  private var pendingRunnable: Runnable? = null

  private data class NativeQuizItem(
    val tip: String,
    val prompt: String,
    val choices: List<String>,
    val answer: Int,
    val explanation: String,
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

  private fun removeActive(ctx: Context) {
    val v = activeView ?: return
    activeView = null
    val wm = ctx.applicationContext.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
    runCatching { wm.removeViewImmediate(v) }
  }

  fun dismiss(ctx: Context) {
    val appCtx = ctx.applicationContext
    mainHandler.post { removeActive(appCtx) }
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

  private fun quizBankFor(skill: String, fil: Boolean): List<NativeQuizItem> {
    return when (skill) {
      "decimals" -> listOf(
        NativeQuizItem(
          if (fil) "Tip: I-align ang decimal point tulad ng pera (₱2.50 + ₱1.50)." else "Tip: Align decimal points like coins (₱2.50 + ₱1.50).",
          if (fil) "Ano ang 0.5 + 0.25?" else "What is 0.5 + 0.25?",
          listOf("0.75", "0.30", "0.525", "1.0"),
          0,
          if (fil) "0.50 + 0.25 = 0.75." else "Line up tenths and hundredths: 0.50 + 0.25 = 0.75.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Ang 0.8 ay pareho sa 0.80 — ikumpara ang 80 at 75." else "Tip: 0.8 equals 0.80 — compare 80 hundredths vs 75 hundredths.",
          if (fil) "Alin ang mas malaki: 0.8 o 0.75?" else "Which is larger: 0.8 or 0.75?",
          listOf("0.75", "0.8", "Equal", "Neither"),
          1,
          if (fil) "0.8 ay 0.80, mas malaki sa 0.75." else "0.8 is 0.80, which beats 0.75.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Ang pag-multiply sa 10 ay naglilipat ng dot pakanan." else "Tip: Multiplying by 10 shifts the decimal point one step right.",
          "1.2 × 10 = ?",
          listOf("0.12", "12", "1.02", "120"),
          1,
          if (fil) "Lumilipat ang decimal point pakanan nang isang hakbang: 12." else "Decimal point moves one place right -> 12.",
        ),
      )
      "percentages" -> listOf(
        NativeQuizItem(
          if (fil) "Tip: Ang 25% ay kalahati ng kalahati (1/4)." else "Tip: 25% is half of half (divide by 4).",
          if (fil) "Magkano ang 25% ng 80?" else "What is 25% of 80?",
          listOf("15", "20", "25", "40"),
          1,
          if (fil) "25% = 1/4, at 80 ÷ 4 = 20." else "25% is 1/4, and 80 ÷ 4 = 20.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Unahin ang 10% (alisin ang huling zero), tapos i-triple." else "Tip: Find 10% first, then multiply by 3 for 30%.",
          if (fil) "May 30% discount sa ₱100. Magkano ang bawas?" else "A ₱100 item is 30% off. How much do you save?",
          listOf("₱30", "₱70", "₱10", "₱3"),
          0,
          if (fil) "30% ng 100 ay ₱30." else "30% of ₱100 = ₱30 saved.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Kalahati (0.50) sa percent ay 50%." else "Tip: Multiply a decimal by 100 to convert to percent.",
          if (fil) "Ang 0.5 sa percent ay:" else "0.5 as a percent is:",
          listOf("5%", "50%", "0.5%", "500%"),
          1,
          if (fil) "0.5 × 100 = 50%." else "0.5 × 100 = 50%.",
        ),
      )
      "algebraic", "linear" -> listOf(
        NativeQuizItem(
          if (fil) "Tip: Baliktarin ang +5 sa kabilang panig: 12 − 5." else "Tip: Undo +5 on the other side: subtract 5 from 12.",
          "x + 5 = 12 → x = ?",
          listOf("5", "7", "17", "60"),
          1,
          if (fil) "12 − 5 = 7." else "Subtract 5 from both sides: x = 7.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Kung 3x = 18, hatiin sa 3 ang 18." else "Tip: If 3 groups of x equal 18, divide 18 by 3.",
          "3x = 18 → x = ?",
          listOf("3", "6", "15", "21"),
          1,
          if (fil) "18 ÷ 3 = 6." else "Divide both sides by 3: x = 6.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Ipalit ang x = 4 sa 2x + 1." else "Tip: Plug x = 4 into 2(x) first, then add 1.",
          if (fil) "Kapag x = 4, ano ang 2x + 1?" else "When x = 4, what is 2x + 1?",
          listOf("7", "8", "9", "25"),
          2,
          if (fil) "2(4) + 1 = 8 + 1 = 9." else "2(4) + 1 = 9.",
        ),
      )
      else -> listOf(
        NativeQuizItem(
          if (fil) "Tip: Gawing magkapareho ang denominator: 1/2 = 3/6 at 1/3 = 2/6." else "Tip: Match slice sizes first: 1/2 = 3/6 and 1/3 = 2/6.",
          if (fil) "Ano ang 1/2 + 1/3?" else "What is 1/2 + 1/3?",
          listOf("2/5", "5/6", "1/6", "2/6"),
          1,
          if (fil) "3/6 + 2/6 = 5/6." else "With matching sixths: 3/6 + 2/6 = 5/6.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Mas kaunting hati ng buo = mas malaking hiwa." else "Tip: Fewer equal parts of the same whole means bigger pieces.",
          if (fil) "Alin ang mas malaki: 1/3 o 1/4?" else "Which is bigger: 1/3 or 1/4?",
          listOf("1/3", "1/4", "Equal", "Can't tell"),
          0,
          if (fil) "Mas malaki ang 1/3 kaysa 1/4." else "Sharing with 3 gives a larger piece than sharing with 4: 1/3.",
        ),
        NativeQuizItem(
          if (fil) "Tip: Gawing sixths ang 2/3 -> 4/6, tapos idagdag ang 1/6." else "Tip: Turn 2/3 into 4/6 first, then add 1/6.",
          "2/3 + 1/6 = ?",
          listOf("3/9", "5/6", "3/6", "1/2"),
          1,
          if (fil) "4/6 + 1/6 = 5/6." else "4/6 + 1/6 = 5/6.",
        ),
      )
    }
  }

  /** Vertical swipe-up touch container so taps hit choice buttons while upward swipes drag/advance cards. */
  private class SwipeCardContainer(
    ctx: Context,
    private val touchSlop: Int,
    private val onSwipeCommit: () -> Unit,
    private val canSwipeNow: () -> Boolean,
    private val onSwipeBlocked: () -> Unit,
  ) : LinearLayout(ctx) {
    private var downY = 0f
    private var dragging = false
    private val minSwipePx = dp(ctx, 42).toFloat()

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downY = ev.rawY
          dragging = false
        }
        MotionEvent.ACTION_MOVE -> {
          val dy = ev.rawY - downY
          if (dy < -touchSlop && abs(dy) > touchSlop) {
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
          if (dy < -minSwipePx) {
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

  /**
   * White 3-card vertical swipe-up feed overlay drawn over the real opened external app.
   * Answer each card, swipe up to advance, and swipe up on Card 3 to return to the app.
   */
  fun showQuizOverlay(ctx: Context, cfg: Config, appLabel: String, pkg: String?, minutes: Int) {
    val appCtx = ctx.applicationContext
    mainHandler.post {
      if (!canOverlay(appCtx)) return@post
      runCatching {
        removeActive(appCtx)
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val questions = quizBankFor(cfg.rootSkill, cfg.fil)
        var qIndex = 0
        var answered = false
        var transitioning = false

        val root = FrameLayout(appCtx).apply {
          setBackgroundColor(Color.parseColor("#59000000"))
          clipChildren = false
          clipToPadding = false
          setPadding(dp(appCtx, 16), dp(appCtx, 40), dp(appCtx, 16), dp(appCtx, 28))
          isFocusableInTouchMode = true
          requestFocus()
          setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
              removeActive(appCtx)
              true
            } else false
          }
        }

        lateinit var quizCard: SwipeCardContainer
        val stepTxt = TextView(appCtx)
        val tipTxt = TextView(appCtx)
        val promptTxt = TextView(appCtx)
        val choicesCol = LinearLayout(appCtx).apply { orientation = LinearLayout.VERTICAL }
        val feedbackTxt = TextView(appCtx)
        val swipeBar = TextView(appCtx)

        fun updateSwipeBar(blockedHint: Boolean = false) {
          val isLast = qIndex >= questions.size - 1
          when {
            !answered && blockedHint -> {
              swipeBar.background = roundedBox(Color.parseColor("#FFF0E6"), 16, Color.parseColor("#C8400F"), 1, appCtx)
              swipeBar.setTextColor(Color.parseColor("#C8400F"))
              swipeBar.text = if (cfg.fil) "Pumili muna ng sagot bago mag-swipe pataas ↑" else "Pick an answer first, then swipe up ↑"
            }
            !answered -> {
              swipeBar.background = roundedBox(Color.parseColor("#F4F4F6"), 16, Color.parseColor("#E2E2E8"), 1, appCtx)
              swipeBar.setTextColor(Color.parseColor("#68686E"))
              swipeBar.text = if (cfg.fil) "Sagutan ang card, tapos mag-swipe pataas ↑" else "Tap an answer above, then swipe up ↑"
            }
            isLast -> {
              swipeBar.background = roundedBox(Color.parseColor("#E8FAF0"), 16, Color.parseColor("#2FBF5B"), 2, appCtx)
              swipeBar.setTextColor(Color.parseColor("#137A36"))
              swipeBar.text = if (cfg.fil) "✓ Tapos na! I-swipe pataas ↑ para bumalik sa $appLabel" else "✓ Done! Swipe up ↑ to return to $appLabel"
            }
            else -> {
              swipeBar.background = roundedBox(Color.parseColor("#FFF0E6"), 16, Color.parseColor("#C8400F"), 2, appCtx)
              swipeBar.setTextColor(Color.parseColor("#C8400F"))
              swipeBar.text = if (cfg.fil) "↑ I-swipe pataas para sa susunod (${qIndex + 2}/${questions.size})" else "↑ Swipe up for Card ${qIndex + 2} of ${questions.size}"
            }
          }
        }

        lateinit var renderQuestion: () -> Unit

        fun commitSwipeUp() {
          if (transitioning || !answered) return
          val isLast = qIndex >= questions.size - 1
          transitioning = true
          if (isLast) {
            val quietMs = cfg.overlayIntervalSec.coerceIn(10, 3600) * 1000L
            Store.putLong(appCtx, "snoozeUntil", System.currentTimeMillis() + quietMs)
            quizCard.animate()
              .translationY(-dp(appCtx, 380).toFloat())
              .alpha(0f)
              .setDuration(210)
              .setInterpolator(DecelerateInterpolator())
              .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                  removeActive(appCtx)
                }
              })
              .start()
          } else {
            quizCard.animate()
              .translationY(-dp(appCtx, 260).toFloat())
              .alpha(0f)
              .setDuration(170)
              .setInterpolator(DecelerateInterpolator())
              .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                  qIndex += 1
                  renderQuestion()
                  quizCard.animate().setListener(null)
                  quizCard.translationY = dp(appCtx, 180).toFloat()
                  quizCard.alpha = 0f
                  quizCard.animate()
                    .translationY(0f)
                    .alpha(1f)
                    .setDuration(200)
                    .setInterpolator(DecelerateInterpolator())
                    .setListener(object : AnimatorListenerAdapter() {
                      override fun onAnimationEnd(animation: Animator) {
                        transitioning = false
                      }
                    })
                    .start()
                }
              })
              .start()
          }
        }

        val touchSlop = ViewConfiguration.get(appCtx).scaledTouchSlop
        quizCard = SwipeCardContainer(
          appCtx,
          touchSlop,
          onSwipeCommit = { commitSwipeUp() },
          canSwipeNow = { answered },
          onSwipeBlocked = { updateSwipeBar(blockedHint = true) },
        ).apply {
          orientation = LinearLayout.VERTICAL
          background = roundedBox(Color.parseColor("#FFFFFF"), 26, Color.parseColor("#E5E0D8"), 1, appCtx)
          elevation = dp(appCtx, 14).toFloat()
          setPadding(dp(appCtx, 20), dp(appCtx, 16), dp(appCtx, 20), dp(appCtx, 18))
          layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
        }

        // Top drag handle bar (visual feed cue)
        val dragHandle = View(appCtx).apply {
          background = roundedBox(Color.parseColor("#D5D2CA"), 99, ctx = appCtx)
          layoutParams = LinearLayout.LayoutParams(dp(appCtx, 42), dp(appCtx, 4)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            bottomMargin = dp(appCtx, 12)
          }
        }

        val topBar = LinearLayout(appCtx).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(appCtx, 12)
          }
        }

        val brandPill = TextView(appCtx).apply {
          text = "Paty · LearnShift"
          setTextColor(Color.parseColor("#C8400F"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setTypeface(typeface, Typeface.BOLD)
          background = roundedBox(Color.parseColor("#FFF0E6"), 99, ctx = appCtx)
          setPadding(dp(appCtx, 9), dp(appCtx, 4), dp(appCtx, 9), dp(appCtx, 4))
        }

        val appSub = TextView(appCtx).apply {
          text = "  Over $appLabel (${minutes}m)"
          setTextColor(Color.parseColor("#5C5C62"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          setTypeface(typeface, Typeface.BOLD)
          layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        stepTxt.apply {
          setTextColor(Color.parseColor("#111111"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
          setTypeface(typeface, Typeface.BOLD)
          background = roundedBox(Color.parseColor("#F4F4F6"), 99, ctx = appCtx)
          setPadding(dp(appCtx, 9), dp(appCtx, 4), dp(appCtx, 9), dp(appCtx, 4))
        }

        val closeBtn = TextView(appCtx).apply {
          text = "×"
          setTextColor(Color.parseColor("#111111"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
          setTypeface(typeface, Typeface.BOLD)
          gravity = Gravity.CENTER
          background = roundedBox(Color.parseColor("#F4F4F6"), 99, ctx = appCtx)
          setPadding(dp(appCtx, 10), dp(appCtx, 2), dp(appCtx, 10), dp(appCtx, 2))
          layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            leftMargin = dp(appCtx, 8)
          }
          setOnClickListener { removeActive(appCtx) }
        }

        topBar.addView(brandPill)
        topBar.addView(appSub)
        topBar.addView(stepTxt)
        topBar.addView(closeBtn)

        tipTxt.apply {
          setTextColor(Color.parseColor("#44444A"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          background = roundedBox(Color.parseColor("#F8F6F2"), 14, Color.parseColor("#EAE6DD"), 1, appCtx)
          setPadding(dp(appCtx, 12), dp(appCtx, 9), dp(appCtx, 12), dp(appCtx, 9))
          layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(appCtx, 10)
          }
        }

        promptTxt.apply {
          setTextColor(Color.parseColor("#111111"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
          setTypeface(typeface, Typeface.BOLD)
          setPadding(0, dp(appCtx, 2), 0, dp(appCtx, 12))
        }

        feedbackTxt.apply {
          visibility = View.GONE
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
          setPadding(dp(appCtx, 12), dp(appCtx, 10), dp(appCtx, 12), dp(appCtx, 10))
          layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(appCtx, 4)
            bottomMargin = dp(appCtx, 8)
          }
        }

        swipeBar.apply {
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
          setTypeface(typeface, Typeface.BOLD)
          gravity = Gravity.CENTER
          setPadding(dp(appCtx, 14), dp(appCtx, 13), dp(appCtx, 14), dp(appCtx, 13))
          layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(appCtx, 8)
          }
          setOnClickListener {
            if (answered) commitSwipeUp() else updateSwipeBar(blockedHint = true)
          }
        }

        val fullAppLink = TextView(appCtx).apply {
          text = if (cfg.fil) "Buksan sa buong LearnShift app →" else "Open full LearnShift screen →"
          setTextColor(Color.parseColor("#68686E"))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
          gravity = Gravity.CENTER
          setPadding(0, dp(appCtx, 10), 0, 0)
          setOnClickListener {
            removeActive(appCtx)
            openLearnShift(appCtx, "learnshift://feed")
          }
        }

        renderQuestion = {
          val q = questions[qIndex]
          answered = false
          stepTxt.text = "Card ${qIndex + 1}/${questions.size}"
          tipTxt.text = q.tip
          promptTxt.text = q.prompt
          feedbackTxt.visibility = View.GONE
          choicesCol.removeAllViews()
          updateSwipeBar()

          val letters = listOf("A", "B", "C", "D")
          val buttons = mutableListOf<TextView>()
          q.choices.forEachIndexed { idx, opt ->
            val btn = TextView(appCtx).apply {
              text = "${letters.getOrElse(idx) { "" }}   $opt"
              setTextColor(Color.parseColor("#111111"))
              setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
              setTypeface(typeface, Typeface.BOLD)
              background = roundedBox(Color.parseColor("#F4F4F6"), 16, Color.parseColor("#E2E2E8"), 1, appCtx)
              setPadding(dp(appCtx, 14), dp(appCtx, 12), dp(appCtx, 14), dp(appCtx, 12))
              layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(appCtx, 8)
              }
              setOnClickListener {
                if (answered) return@setOnClickListener
                answered = true
                val right = idx == q.answer
                buttons.forEachIndexed { bIdx, b ->
                  when {
                    bIdx == q.answer -> {
                      b.background = roundedBox(Color.parseColor("#2FBF5B"), 16, ctx = appCtx)
                      b.setTextColor(Color.parseColor("#FFFFFF"))
                    }
                    bIdx == idx && !right -> {
                      b.background = roundedBox(Color.parseColor("#E5484D"), 16, ctx = appCtx)
                      b.setTextColor(Color.parseColor("#FFFFFF"))
                    }
                    else -> b.alpha = 0.50f
                  }
                }
                feedbackTxt.visibility = View.VISIBLE
                feedbackTxt.background = roundedBox(
                  Color.parseColor(if (right) "#E8FAF0" else "#FDF0F0"),
                  14,
                  Color.parseColor(if (right) "#2FBF5B" else "#E5484D"),
                  1,
                  appCtx,
                )
                feedbackTxt.setTextColor(Color.parseColor("#111111"))
                feedbackTxt.text = (if (right) "Correct! " else "Not quite — ") + q.explanation
                updateSwipeBar()
              }
            }
            buttons.add(btn)
            choicesCol.addView(btn)
          }
        }

        renderQuestion()

        quizCard.addView(dragHandle)
        quizCard.addView(topBar)
        quizCard.addView(tipTxt)
        quizCard.addView(promptTxt)
        quizCard.addView(choicesCol)
        quizCard.addView(feedbackTxt)
        quizCard.addView(swipeBar)
        quizCard.addView(fullAppLink)
        root.addView(quizCard)

        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.MATCH_PARENT,
          overlayWindowType(),
          WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
          PixelFormat.TRANSLUCENT,
        )
        wm.addView(root, params)
        activeView = root
      }.onFailure {
        Log.w(TAG, "showQuizOverlay failed: ${it.message}")
        removeActive(appCtx)
      }
    }
  }
}
