package expo.modules.usagemonitor.mirror

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2

/**
 * Low-RAM (< 25 MB) 60 FPS GPU-composited ViewPager2 Deceleration Deck fallback.
 * Executes ANTI_FEED, SENSORY_DECAY, KINETIC_FRICTION, and DEJA_VU_LOOP.
 */
class DecelerationOverlayActivity : AppCompatActivity() {

  private lateinit var pager: ViewPager2
  private val bandit = ImplicitContextBandit()
  private var cards: List<DecelerationCard> = emptyList()
  private var currentPos = 0
  private var cardEnterTimeMs = 0L
  private var lastTouchY = 0f

  private val mainFont: Typeface by lazy {
    runCatching { Typeface.createFromAsset(assets, "fonts/Bungee-Regular.ttf") }.getOrNull()
      ?: Typeface.DEFAULT_BOLD
  }
  private val secondaryFont: Typeface by lazy {
    runCatching { Typeface.createFromAsset(assets, "fonts/Poppins-Bold.ttf") }.getOrNull()
      ?: Typeface.DEFAULT_BOLD
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#CC121212")) }
    pager = ViewPager2(this).apply {
      orientation = ViewPager2.ORIENTATION_VERTICAL
      offscreenPageLimit = 1
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
    }

    val sessionMin = intent.getIntExtra(EXTRA_SESSION_MIN, 20)
    val strategyName = intent.getStringExtra(EXTRA_STRATEGY) ?: DecelerationStrategy.ANTI_FEED.name
    val strategy = runCatching { DecelerationStrategy.valueOf(strategyName) }.getOrDefault(DecelerationStrategy.ANTI_FEED)

    val pill = TextView(this).apply {
      text = "$sessionMin min scroll break • Low-Stim Mode (${strategy.name.lowercase().replace('_', ' ')})"
      typeface = secondaryFont
      setTextColor(Color.parseColor("#E0E0E0"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      setPadding(36, 18, 36, 18)
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#E61E1E1E"))
        cornerRadius = 999f
      }
    }
    val pillLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.TOP or Gravity.CENTER_HORIZONTAL,
    ).apply { topMargin = 110 }

    root.addView(pager)
    root.addView(pill, pillLp)
    setContentView(root)

    val screenHeight = resources.displayMetrics.heightPixels.toFloat()
    root.translationY = screenHeight
    Choreographer.getInstance().postFrameCallback {
      root.animate().translationY(0f).setDuration(260L).start()
    }

    Thread {
      val db = LearnShiftOfflineDb.getInstance(this)
      val stats = db.getAllStats()
      val chosenTag = bandit.selectTopicTag(stats, forStudyHook = false)
      SentinelBus.lastInterventionTopicTag = chosenTag
      val base = db.getCardsByTag(chosenTag, 3).ifEmpty { db.getFallbackCards(3) }
      val built = buildDeckForStrategy(base, strategy)
      runOnUiThread {
        cards = built
        setupPager(strategy)
      }
    }.start()
  }

  private fun buildDeckForStrategy(
    base: List<DecelerationCard>,
    strategy: DecelerationStrategy,
  ): List<DecelerationCard> {
    val hardStop = DecelerationCard(
      topicTag = "WIND_DOWN_CHORE",
      title = "End of Stack",
      body = "Good place to rest your eyes and step away from the feed.",
      badgeLabel = "Finite Stop",
    )
    return when (strategy) {
      DecelerationStrategy.DEJA_VU_LOOP -> {
        val pair = base.take(2)
        pair + pair + hardStop
      }
      else -> base + hardStop
    }
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun setupPager(strategy: DecelerationStrategy) {
    pager.adapter = DecelerationCardAdapter(cards, mainFont, secondaryFont) { finishAndGoHome() }
    cardEnterTimeMs = SystemClock.elapsedRealtime()

    pager.setPageTransformer { page, _ ->
      when (strategy) {
        DecelerationStrategy.SENSORY_DECAY -> applyMonochromeDecay(page, currentPos)
        DecelerationStrategy.DEJA_VU_LOOP -> {
          page.alpha = (1.0f - (currentPos * 0.12f)).coerceAtLeast(0.55f)
        }
        else -> page.alpha = 1.0f
      }
    }

    if (strategy == DecelerationStrategy.KINETIC_FRICTION) {
      pager.isUserInputEnabled = false
      pager.setOnTouchListener { _, event ->
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            lastTouchY = event.y
            pager.beginFakeDrag()
            true
          }
          MotionEvent.ACTION_MOVE -> {
            val dy = (event.y - lastTouchY) * 0.35f
            lastTouchY = event.y
            pager.fakeDragBy(dy)
            true
          }
          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
            pager.endFakeDrag()
            true
          }
          else -> false
        }
      }
    }

    pager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
      override fun onPageSelected(position: Int) {
        val now = SystemClock.elapsedRealtime()
        val dwellMs = now - cardEnterTimeMs
        if (currentPos in cards.indices) {
          recordImplicitDwell(cards[currentPos].topicTag, dwellMs)
        }
        currentPos = position
        cardEnterTimeMs = now
      }
    })
  }

  private fun applyMonochromeDecay(page: View, index: Int) {
    val saturation = (0.6f - (index * 0.3f)).coerceAtLeast(0f)
    val paint = Paint().apply {
      colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation) })
    }
    page.setLayerType(View.LAYER_TYPE_HARDWARE, paint)
    page.alpha = (0.95f - (index * 0.1f)).coerceAtLeast(0.65f)
  }

  private fun recordImplicitDwell(topicTag: String, dwellMs: Long) {
    Thread {
      val db = LearnShiftOfflineDb.getInstance(this)
      when {
        dwellMs < 1200L -> db.incrementDisinterest(topicTag, 1.0f)
        dwellMs in 4000L..25_000L -> db.incrementInterest(topicTag, 1.0f)
      }
    }.start()
  }

  private fun finishAndGoHome() {
    moveTaskToBack(true)
    finish()
  }

  private class DecelerationCardAdapter(
    private val items: List<DecelerationCard>,
    private val mainFont: Typeface,
    private val secondaryFont: Typeface,
    private val onExitClicked: () -> Unit,
  ) : RecyclerView.Adapter<DecelerationCardAdapter.CardHolder>() {

    class CardHolder(
      root: LinearLayout,
      val badge: TextView,
      val title: TextView,
      val body: TextView,
      val closeBtn: Button,
    ) : RecyclerView.ViewHolder(root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CardHolder {
      val ctx = parent.context
      val layout = LinearLayout(ctx).apply {
        layoutParams = ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT,
        )
        setBackgroundColor(Color.parseColor("#121212"))
        gravity = Gravity.CENTER
        orientation = LinearLayout.VERTICAL
        setPadding(72, 72, 72, 72)
      }
      val badge = TextView(ctx).apply {
        typeface = secondaryFont
        setTextColor(Color.parseColor("#9E9E9E"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
      }
      val title = TextView(ctx).apply {
        typeface = mainFont
        setTextColor(Color.parseColor("#F5F5F5"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        gravity = Gravity.CENTER
      }
      val titleLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { topMargin = 32 }
      val body = TextView(ctx).apply {
        typeface = secondaryFont
        setTextColor(Color.parseColor("#CCCCCC"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        gravity = Gravity.CENTER
        setLineSpacing(12f, 1.15f)
      }
      val bodyLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { topMargin = 40 }
      val closeBtn = Button(ctx).apply {
        text = "Rest Eyes & Exit"
        typeface = secondaryFont
        visibility = View.GONE
      }
      val btnLp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ).apply { topMargin = 72 }

      layout.addView(badge)
      layout.addView(title, titleLp)
      layout.addView(body, bodyLp)
      layout.addView(closeBtn, btnLp)
      return CardHolder(layout, badge, title, body, closeBtn)
    }

    override fun onBindViewHolder(holder: CardHolder, position: Int) {
      val item = items[position]
      holder.badge.text = item.badgeLabel
      holder.title.text = item.title
      holder.body.text = item.body
      val isLast = position == items.lastIndex
      holder.closeBtn.visibility = if (isLast) View.VISIBLE else View.GONE
      holder.closeBtn.setOnClickListener { onExitClicked() }
    }

    override fun getItemCount(): Int = items.size
  }

  companion object {
    const val EXTRA_SESSION_MIN = "EXTRA_SESSION_MIN"
    const val EXTRA_STRATEGY = "EXTRA_STRATEGY"
  }
}
