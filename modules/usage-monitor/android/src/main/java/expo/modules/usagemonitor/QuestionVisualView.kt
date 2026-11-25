package expo.modules.usagemonitor

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.View
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Offline vector canvas illustrations for lower-grade break questions
 * (counting, shapes, clocks, fractions, bar charts, grids, and objects).
 */
class QuestionVisualView(ctx: Context) : View(ctx) {
  private var spec: JSONObject? = null
  private val density = ctx.resources.displayMetrics.density
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    typeface = runCatching { Typeface.createFromAsset(ctx.assets, "fonts/Poppins-Bold.ttf") }.getOrNull()
      ?: Typeface.create("sans-serif-medium", Typeface.BOLD)
  }

  private val ink = Color.parseColor("#17352F")
  private val accent = Color.parseColor("#146B50")
  private val warm = Color.parseColor("#C86D2D")
  private val gold = Color.parseColor("#E9AE35")
  private val sky = Color.parseColor("#4C8BD6")
  private val coral = Color.parseColor("#D95B5B")
  private val soft = Color.parseColor("#DCE9DE")

  init {
    background = GradientDrawable().apply {
      setColor(soft)
      cornerRadius = dp(16f)
    }
    visibility = GONE
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    contentDescription = "Question illustration"
  }

  private fun dp(v: Float): Float =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val w = MeasureSpec.getSize(widthMeasureSpec)
    val h = dp(104f).toInt()
    setMeasuredDimension(w, h)
  }

  fun setVisual(visual: JSONObject?) {
    spec = visual
    visibility = if (visual == null) GONE else VISIBLE
    if (visual != null) invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val v = spec ?: return
    if (width <= 0 || height <= 0) return
    runCatching {
      canvas.save()
      val sx = width / 260f
      val sy = height / 112f
      val scale = min(sx, sy)
      val ox = (width - 260f * scale) / 2f
      val oy = (height - 112f * scale) / 2f
      canvas.translate(ox, oy)
      canvas.scale(scale, scale)
      when (v.optString("kind")) {
        "count" -> drawCount(canvas, v)
        "shape" -> drawShape(canvas, v)
        "clock" -> drawClock(canvas, v)
        "fraction" -> drawFraction(canvas, v)
        "bars" -> drawBars(canvas, v)
        "grid" -> drawGrid(canvas, v)
        "scene" -> drawScene(canvas, v.optString("id"), v.optBoolean("hideEast", false))
      }
      canvas.restore()
    }
  }

  private fun drawCountIcon(c: Canvas, item: String, cx: Float, cy: Float, crossed: Boolean) {
    val alpha = if (crossed) 115 else 255
    when (item) {
      "star" -> {
        val p = Path()
        val pts = floatArrayOf(
          cx, cy - 9f, cx + 2.8f, cy - 3f, cx + 9f, cy - 2.5f,
          cx + 4.3f, cy + 1.8f, cx + 5.6f, cy + 8.5f, cx, cy + 5f,
          cx - 5.6f, cy + 8.5f, cx - 4.3f, cy + 1.8f, cx - 9f, cy - 2.5f,
          cx - 2.8f, cy - 3f,
        )
        p.moveTo(pts[0], pts[1])
        var i = 2
        while (i < pts.size) {
          p.lineTo(pts[i], pts[i + 1])
          i += 2
        }
        p.close()
        fillPaint.color = gold
        fillPaint.alpha = alpha
        c.drawPath(p, fillPaint)
        strokePaint.color = warm
        strokePaint.strokeWidth = 1.4f
        c.drawPath(p, strokePaint)
      }
      "pencil" -> {
        fillPaint.color = gold
        fillPaint.alpha = alpha
        c.drawRoundRect(cx - 3.5f, cy - 9f, cx + 3.5f, cy + 5f, 1.5f, 1.5f, fillPaint)
        fillPaint.color = coral
        fillPaint.alpha = alpha
        c.drawRect(cx - 3.5f, cy - 12f, cx + 3.5f, cy - 9f, fillPaint)
        val tip = Path().apply {
          moveTo(cx - 3.5f, cy + 5f)
          lineTo(cx + 3.5f, cy + 5f)
          lineTo(cx, cy + 11f)
          close()
        }
        fillPaint.color = Color.parseColor("#F4D3AF")
        c.drawPath(tip, fillPaint)
      }
      "banana" -> {
        val p = Path().apply {
          moveTo(cx - 8f, cy + 4f)
          quadTo(cx, cy + 11f, cx + 9f, cy - 5f)
          quadTo(cx + 4f, cy - 9f, cx - 5f, cy - 1f)
          close()
        }
        fillPaint.color = Color.parseColor("#F5CE3E")
        fillPaint.alpha = alpha
        c.drawPath(p, fillPaint)
        strokePaint.color = warm
        strokePaint.strokeWidth = 1.4f
        c.drawPath(p, strokePaint)
      }
      "cookie" -> {
        fillPaint.color = Color.parseColor("#D99B5E")
        fillPaint.alpha = alpha
        c.drawCircle(cx, cy, 9f, fillPaint)
        fillPaint.color = Color.parseColor("#5C381C")
        c.drawCircle(cx - 3f, cy - 2f, 1.5f, fillPaint)
        c.drawCircle(cx + 3f, cy + 2f, 1.5f, fillPaint)
        c.drawCircle(cx + 2f, cy - 3.5f, 1.3f, fillPaint)
      }
      "marble" -> {
        fillPaint.color = sky
        fillPaint.alpha = alpha
        c.drawCircle(cx, cy, 7.5f, fillPaint)
        fillPaint.color = Color.WHITE
        fillPaint.alpha = (alpha * 0.7f).toInt()
        c.drawCircle(cx - 2.3f, cy - 2.3f, 2f, fillPaint)
      }
      "block" -> {
        fillPaint.color = accent
        fillPaint.alpha = alpha
        c.drawRoundRect(cx - 5.5f, cy - 5.5f, cx + 5.5f, cy + 5.5f, 2f, 2f, fillPaint)
      }
      else -> {
        fillPaint.color = coral
        fillPaint.alpha = alpha
        c.drawCircle(cx, cy + 1f, 8.5f, fillPaint)
      }
    }
    fillPaint.alpha = 255
    if (crossed) {
      strokePaint.color = coral
      strokePaint.strokeWidth = 2.6f
      c.drawLine(cx - 9f, cy - 9f, cx + 9f, cy + 9f, strokePaint)
    }
  }

  private fun drawCount(c: Canvas, v: JSONObject) {
    val item = v.optString("item", "star")
    val count = v.optInt("count", 1)
    val addCount = v.optInt("addCount", 0)
    val crossOut = v.optInt("crossOut", 0)
    val groupSize = v.optInt("groupSize", 0)
    val askNext = v.optBoolean("askNext", false)

    if (groupSize > 1 && count >= 10 && item == "block") {
      val tens = count / groupSize
      val ones = count % groupSize
      for (g in 0 until tens) {
        fillPaint.color = Color.parseColor("#E4EFE7")
        c.drawRoundRect(52f + g * 24f, 18f, 70f + g * 24f, 94f, 5f, 5f, fillPaint)
        strokePaint.color = accent
        strokePaint.strokeWidth = 1.5f
        c.drawRoundRect(52f + g * 24f, 18f, 70f + g * 24f, 94f, 5f, 5f, strokePaint)
        fillPaint.color = accent
        for (k in 0 until 10) {
          c.drawRect(56f + g * 24f, 22f + k * 7f, 66f + g * 24f, 27f + k * 7f, fillPaint)
        }
      }
      fillPaint.color = gold
      for (k in 0 until ones) {
        val col = k % 2
        val row = k / 2
        c.drawRoundRect(124f + col * 18f, 24f + row * 18f, 137f + col * 18f, 37f + row * 18f, 3f, 3f, fillPaint)
      }
      return
    }

    if (groupSize > 1 && count <= 12) {
      val groups = ceil(count.toFloat() / groupSize).toInt()
      val gw = min(72f, 224f / groups)
      val startX = (260f - groups * gw - (groups - 1) * 8f) / 2f
      for (g in 0 until groups) {
        val gx = startX + g * (gw + 8f)
        val inGroup = min(groupSize, count - g * groupSize)
        fillPaint.color = Color.WHITE
        c.drawRoundRect(gx, 20f, gx + gw, 92f, 14f, 14f, fillPaint)
        strokePaint.color = Color.parseColor("#BBD1C3")
        strokePaint.strokeWidth = 1.8f
        c.drawRoundRect(gx, 20f, gx + gw, 92f, 14f, 14f, strokePaint)
        val cols = if (inGroup <= 2) inGroup else 2
        for (j in 0 until inGroup) {
          val col = j % cols
          val row = j / cols
          val px = gx + if (cols == 1) gw / 2f else gw * if (col == 0) 0.34f else 0.68f
          val py = if (inGroup <= 2) 56f else 42f + row * 26f
          drawCountIcon(c, item, px, py, false)
        }
      }
      return
    }

    if (addCount > 0) {
      val totalW = (count + addCount) * 24f + 26f
      val x0 = maxOf(16f, (260f - totalW) / 2f + 12f)
      for (i in 0 until count) drawCountIcon(c, item, x0 + i * 24f, 56f, false)
      textPaint.color = accent
      textPaint.textSize = 22f
      c.drawText("+", x0 + count * 24f + 2f, 62f, textPaint)
      for (i in 0 until addCount) drawCountIcon(c, item, x0 + count * 24f + 24f + i * 24f, 56f, false)
      return
    }

    val cols = if (count <= 5) count else min(5, ceil(count / 2f).toInt())
    val rows = ceil(count.toFloat() / cols).toInt()
    val gapX = 28f
    val gapY = 30f
    val startX = (260f - (cols - 1) * gapX) / 2f - if (askNext) 18f else 0f
    val startY = if (rows == 1) 56f else 38f
    for (i in 0 until count) {
      val col = i % cols
      val row = i / cols
      drawCountIcon(c, item, startX + col * gapX, startY + row * gapY, crossOut > 0 && i >= count - crossOut)
    }
    if (askNext) {
      fillPaint.color = Color.WHITE
      c.drawRoundRect(208f, 38f, 240f, 72f, 10f, 10f, fillPaint)
      strokePaint.color = accent
      strokePaint.strokeWidth = 2f
      c.drawRoundRect(208f, 38f, 240f, 72f, 10f, 10f, strokePaint)
      textPaint.color = accent
      textPaint.textSize = 18f
      c.drawText("?", 224f, 61f, textPaint)
    }
  }

  private fun drawShape(c: Canvas, v: JSONObject) {
    when (v.optString("shape")) {
      "triangle" -> {
        val p = Path().apply {
          moveTo(130f, 18f)
          lineTo(82f, 92f)
          lineTo(178f, 92f)
          close()
        }
        fillPaint.color = Color.parseColor("#FBE5B6")
        c.drawPath(p, fillPaint)
        strokePaint.color = warm
        strokePaint.strokeWidth = 3f
        c.drawPath(p, strokePaint)
      }
      "square" -> {
        fillPaint.color = Color.parseColor("#DCEFE2")
        c.drawRoundRect(96f, 20f, 164f, 88f, 6f, 6f, fillPaint)
        strokePaint.color = accent
        strokePaint.strokeWidth = 3f
        c.drawRoundRect(96f, 20f, 164f, 88f, 6f, 6f, strokePaint)
        val label = v.optString("sideLabel")
        if (label.isNotBlank()) {
          textPaint.color = ink
          textPaint.textSize = 13f
          c.drawText(label, 130f, 104f, textPaint)
        }
      }
      "rectangle" -> {
        fillPaint.color = Color.parseColor("#DCE8F8")
        c.drawRoundRect(72f, 28f, 188f, 84f, 6f, 6f, fillPaint)
        strokePaint.color = sky
        strokePaint.strokeWidth = 3f
        c.drawRoundRect(72f, 28f, 188f, 84f, 6f, 6f, strokePaint)
      }
      "circle" -> {
        fillPaint.color = Color.parseColor("#FADCDC")
        c.drawCircle(130f, 56f, 36f, fillPaint)
        strokePaint.color = coral
        strokePaint.strokeWidth = 3f
        c.drawCircle(130f, 56f, 36f, strokePaint)
      }
      "right_angle" -> {
        strokePaint.color = ink
        strokePaint.strokeWidth = 4f
        c.drawLine(96f, 22f, 96f, 88f, strokePaint)
        c.drawLine(96f, 88f, 176f, 88f, strokePaint)
        strokePaint.color = accent
        strokePaint.strokeWidth = 2.4f
        c.drawRect(96f, 70f, 114f, 88f, strokePaint)
        strokePaint.color = warm
        strokePaint.pathEffect = DashPathEffect(floatArrayOf(4f, 4f), 0f)
        c.drawArc(RectF(54f, 46f, 138f, 130f), -90f, 90f, false, strokePaint)
        strokePaint.pathEffect = null
      }
    }
  }

  private fun drawClock(c: Canvas, v: JSONObject) {
    val hour = v.optDouble("hour", 3.0)
    val minute = v.optDouble("minute", 0.0)
    val cx = 130f
    val cy = 56f
    val r = 42f
    fillPaint.color = Color.WHITE
    c.drawCircle(cx, cy, r, fillPaint)
    strokePaint.color = ink
    strokePaint.strokeWidth = 3f
    c.drawCircle(cx, cy, r, strokePaint)
    for (i in 0 until 12) {
      val a = Math.toRadians((i * 30 - 90).toDouble())
      strokePaint.color = if (i % 3 == 0) ink else Color.parseColor("#99A8A1")
      strokePaint.strokeWidth = if (i % 3 == 0) 2f else 1.2f
      c.drawLine(
        (cx + (r - 6) * cos(a)).toFloat(),
        (cy + (r - 6) * sin(a)).toFloat(),
        (cx + (r - 2) * cos(a)).toFloat(),
        (cy + (r - 2) * sin(a)).toFloat(),
        strokePaint,
      )
    }
    textPaint.color = ink
    textPaint.textSize = 10f
    c.drawText("12", cx, cy - 24f, textPaint)
    c.drawText("3", cx + 28f, cy + 4f, textPaint)
    c.drawText("6", cx, cy + 32f, textPaint)
    c.drawText("9", cx - 28f, cy + 4f, textPaint)

    val hA = Math.toRadians(((hour % 12) + minute / 60.0) * 30.0 - 90.0)
    val mA = Math.toRadians(minute * 6.0 - 90.0)
    strokePaint.color = ink
    strokePaint.strokeWidth = 3.6f
    c.drawLine(cx, cy, (cx + 21f * cos(hA)).toFloat(), (cy + 21f * sin(hA)).toFloat(), strokePaint)
    strokePaint.color = accent
    strokePaint.strokeWidth = 2.5f
    c.drawLine(cx, cy, (cx + 31f * cos(mA)).toFloat(), (cy + 31f * sin(mA)).toFloat(), strokePaint)
    fillPaint.color = warm
    c.drawCircle(cx, cy, 3.5f, fillPaint)
  }

  private fun drawFraction(c: Canvas, v: JSONObject) {
    val parts = maxOf(2, v.optInt("parts", 2))
    val filled = v.optInt("filled", 1).coerceIn(0, parts)
    val style = v.optString("style", "pie")
    val compareParts = v.optInt("compareParts", 0)
    if (style == "bar" || compareParts > 0) {
      val rows = if (compareParts > 0) {
        listOf(Triple(parts, filled, 24f to accent), Triple(compareParts, v.optInt("compareFilled", 1), 64f to warm))
      } else {
        listOf(Triple(parts, filled, 40f to accent))
      }
      rows.forEach { (p, f, yCol) ->
        val (y, col) = yCol
        val sw = 180f / maxOf(1, p)
        for (i in 0 until p) {
          fillPaint.color = if (i < f) col else Color.WHITE
          c.drawRoundRect(40f + i * sw, y, 40f + (i + 1) * sw - 3f, y + 28f, 5f, 5f, fillPaint)
          strokePaint.color = Color.parseColor("#B8C9BE")
          strokePaint.strokeWidth = 1.5f
          c.drawRoundRect(40f + i * sw, y, 40f + (i + 1) * sw - 3f, y + 28f, 5f, 5f, strokePaint)
        }
      }
      return
    }
    val rect = RectF(90f, 16f, 170f, 96f)
    val sweep = 360f / parts
    for (i in 0 until parts) {
      fillPaint.color = if (i < filled) accent else Color.WHITE
      c.drawArc(rect, -90f + i * sweep, sweep, true, fillPaint)
      strokePaint.color = ink
      strokePaint.strokeWidth = 2f
      c.drawArc(rect, -90f + i * sweep, sweep, true, strokePaint)
    }
  }

  private fun drawBars(c: Canvas, v: JSONObject) {
    val arr = v.optJSONArray("items") ?: return
    val count = arr.length()
    if (count == 0) return
    var maxVal = 1f
    for (i in 0 until count) {
      maxVal = maxOf(maxVal, arr.getJSONObject(i).optDouble("value", 1.0).toFloat())
    }
    val bw = 38f
    val gap = 24f
    val startX = (260f - count * bw - (count - 1) * gap) / 2f
    val baseY = 86f
    strokePaint.color = ink
    strokePaint.strokeWidth = 2f
    c.drawLine(26f, baseY, 234f, baseY, strokePaint)
    for (i in 0 until count) {
      val it = arr.getJSONObject(i)
      val valNum = it.optInt("value", 0)
      val h = maxOf(10f, (valNum / maxVal) * 56f)
      val x = startX + i * (bw + gap)
      fillPaint.color = if (i == 1) warm else accent
      c.drawRoundRect(x, baseY - h, x + bw, baseY, 6f, 6f, fillPaint)
      textPaint.color = ink
      textPaint.textSize = 11f
      c.drawText(valNum.toString(), x + bw / 2f, baseY - h - 5f, textPaint)
      c.drawText(it.optString("label"), x + bw / 2f, baseY + 16f, textPaint)
    }
  }

  private fun drawGrid(c: Canvas, v: JSONObject) {
    val rows = maxOf(1, v.optInt("rows", 3))
    val cols = maxOf(1, v.optInt("cols", 4))
    val cell = min(156f / cols, 72f / rows)
    val w = cols * cell
    val h = rows * cell
    val x0 = (260f - w) / 2f
    val y0 = (112f - h) / 2f - 4f
    fillPaint.color = Color.parseColor("#DCEFE2")
    c.drawRect(x0, y0, x0 + w, y0 + h, fillPaint)
    strokePaint.color = accent
    strokePaint.strokeWidth = 2f
    c.drawRect(x0, y0, x0 + w, y0 + h, strokePaint)
    strokePaint.strokeWidth = 1.2f
    for (i in 1 until cols) c.drawLine(x0 + i * cell, y0, x0 + i * cell, y0 + h, strokePaint)
    for (i in 1 until rows) c.drawLine(x0, y0 + i * cell, x0 + w, y0 + i * cell, strokePaint)
    val colLabel = v.optString("colLabel")
    val rowLabel = v.optString("rowLabel")
    textPaint.color = ink
    textPaint.textSize = 12f
    if (colLabel.isNotBlank()) {
      textPaint.textAlign = Paint.Align.CENTER
      c.drawText(colLabel, 130f, y0 + h + 16f, textPaint)
    }
    if (rowLabel.isNotBlank()) {
      textPaint.textAlign = Paint.Align.RIGHT
      c.drawText(rowLabel, x0 - 8f, y0 + h / 2f + 4f, textPaint)
      textPaint.textAlign = Paint.Align.CENTER
    }
  }

  private fun drawScene(c: Canvas, id: String, hideEast: Boolean) {
    when (id) {
      "eye" -> {
        val p = Path().apply {
          moveTo(72f, 56f)
          quadTo(130f, 20f, 188f, 56f)
          quadTo(130f, 92f, 72f, 56f)
          close()
        }
        fillPaint.color = Color.WHITE
        c.drawPath(p, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 3f
        c.drawPath(p, strokePaint)
        fillPaint.color = sky
        c.drawCircle(130f, 56f, 18f, fillPaint)
        fillPaint.color = ink
        c.drawCircle(130f, 56f, 8f, fillPaint)
        fillPaint.color = Color.WHITE
        c.drawCircle(125f, 51f, 3.5f, fillPaint)
      }
      "ear" -> {
        val p = Path().apply {
          moveTo(114f, 34f)
          cubicTo(132f, 16f, 164f, 28f, 160f, 54f)
          cubicTo(157f, 74f, 146f, 90f, 128f, 88f)
          cubicTo(118f, 86f, 116f, 74f, 124f, 70f)
        }
        fillPaint.color = Color.parseColor("#F4C59C")
        c.drawPath(p, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 3f
        c.drawPath(p, strokePaint)
        strokePaint.color = accent
        strokePaint.strokeWidth = 2.4f
        c.drawArc(RectF(72f, 40f, 98f, 72f), 130f, 100f, false, strokePaint)
        c.drawArc(RectF(60f, 32f, 92f, 80f), 130f, 100f, false, strokePaint)
      }
      "butterfly" -> {
        val left = Path().apply {
          moveTo(126f, 52f)
          cubicTo(92f, 20f, 74f, 40f, 94f, 58f)
          cubicTo(78f, 74f, 96f, 92f, 126f, 64f)
          close()
        }
        val right = Path().apply {
          moveTo(134f, 52f)
          cubicTo(168f, 20f, 186f, 40f, 166f, 58f)
          cubicTo(182f, 74f, 164f, 92f, 134f, 64f)
          close()
        }
        fillPaint.color = Color.parseColor("#F29E4C")
        c.drawPath(left, fillPaint)
        c.drawPath(right, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2f
        c.drawPath(left, strokePaint)
        c.drawPath(right, strokePaint)
        fillPaint.color = Color.parseColor("#FFF2B2")
        c.drawCircle(103f, 46f, 5f, fillPaint)
        c.drawCircle(157f, 46f, 5f, fillPaint)
        fillPaint.color = ink
        c.drawRoundRect(127f, 36f, 133f, 78f, 3f, 3f, fillPaint)
      }
      "dog" -> {
        fillPaint.color = Color.parseColor("#9D6838")
        c.drawOval(RectF(92f, 42f, 112f, 72f), fillPaint)
        c.drawOval(RectF(148f, 42f, 168f, 72f), fillPaint)
        fillPaint.color = Color.parseColor("#D59A62")
        c.drawCircle(130f, 58f, 26f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.4f
        c.drawCircle(130f, 58f, 26f, strokePaint)
        fillPaint.color = ink
        c.drawCircle(120f, 53f, 3.5f, fillPaint)
        c.drawCircle(140f, 53f, 3.5f, fillPaint)
        c.drawCircle(130f, 66f, 4.5f, fillPaint)
      }
      "cat" -> {
        val ears = Path().apply {
          moveTo(106f, 44f); lineTo(102f, 22f); lineTo(122f, 36f); close()
          moveTo(154f, 44f); lineTo(158f, 22f); lineTo(138f, 36f); close()
        }
        fillPaint.color = Color.parseColor("#F3BA69")
        c.drawPath(ears, fillPaint)
        c.drawCircle(130f, 60f, 25f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.2f
        c.drawPath(ears, strokePaint)
        c.drawCircle(130f, 60f, 25f, strokePaint)
        fillPaint.color = ink
        c.drawCircle(120f, 56f, 3.2f, fillPaint)
        c.drawCircle(140f, 56f, 3.2f, fillPaint)
        fillPaint.color = coral
        c.drawCircle(130f, 65f, 3.5f, fillPaint)
      }
      "fish" -> {
        val tail = Path().apply {
          moveTo(164f, 56f); lineTo(188f, 38f); lineTo(188f, 74f); close()
        }
        fillPaint.color = Color.parseColor("#F28C5E")
        c.drawPath(tail, fillPaint)
        fillPaint.color = Color.parseColor("#5CB6E5")
        c.drawOval(RectF(84f, 34f, 166f, 78f), fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.2f
        c.drawOval(RectF(84f, 34f, 166f, 78f), strokePaint)
        fillPaint.color = Color.WHITE
        c.drawCircle(104f, 52f, 3.5f, fillPaint)
        fillPaint.color = ink
        c.drawCircle(104f, 52f, 1.8f, fillPaint)
      }
      "chicken" -> {
        fillPaint.color = Color.parseColor("#FFF1C9")
        c.drawOval(RectF(100f, 48f, 158f, 84f), fillPaint)
        c.drawCircle(144f, 46f, 13f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.2f
        c.drawOval(RectF(100f, 48f, 158f, 84f), strokePaint)
        fillPaint.color = coral
        c.drawCircle(142f, 31f, 5f, fillPaint)
        c.drawCircle(148f, 33f, 4f, fillPaint)
        fillPaint.color = gold
        val beak = Path().apply { moveTo(156f, 46f); lineTo(168f, 50f); lineTo(156f, 54f); close() }
        c.drawPath(beak, fillPaint)
        fillPaint.color = ink
        c.drawCircle(147f, 44f, 2.5f, fillPaint)
        strokePaint.color = warm
        c.drawLine(124f, 84f, 124f, 95f, strokePaint)
        c.drawLine(138f, 84f, 138f, 95f, strokePaint)
      }
      "plant" -> {
        fillPaint.color = Color.parseColor("#8D6344")
        c.drawRoundRect(74f, 66f, 186f, 92f, 8f, 8f, fillPaint)
        strokePaint.color = accent
        strokePaint.strokeWidth = 4f
        c.drawLine(130f, 66f, 130f, 30f, strokePaint)
        fillPaint.color = Color.parseColor("#46A56B")
        c.drawOval(RectF(104f, 32f, 130f, 48f), fillPaint)
        c.drawOval(RectF(130f, 28f, 156f, 44f), fillPaint)
        strokePaint.color = Color.parseColor("#EED6B5")
        strokePaint.strokeWidth = 2.2f
        c.drawLine(130f, 66f, 108f, 86f, strokePaint)
        c.drawLine(130f, 66f, 130f, 88f, strokePaint)
        c.drawLine(130f, 66f, 152f, 86f, strokePaint)
      }
      "flower" -> {
        strokePaint.color = accent
        strokePaint.strokeWidth = 4f
        c.drawLine(130f, 52f, 130f, 96f, strokePaint)
        fillPaint.color = Color.parseColor("#F2798F")
        c.drawCircle(130f, 26f, 11f, fillPaint)
        c.drawCircle(146f, 38f, 11f, fillPaint)
        c.drawCircle(140f, 56f, 11f, fillPaint)
        c.drawCircle(120f, 56f, 11f, fillPaint)
        c.drawCircle(114f, 38f, 11f, fillPaint)
        fillPaint.color = gold
        c.drawCircle(130f, 42f, 10f, fillPaint)
      }
      "sun" -> {
        strokePaint.color = warm
        strokePaint.strokeWidth = 3.5f
        for (i in 0 until 8) {
          val a = Math.toRadians(i * 45.0)
          c.drawLine(
            (130 + 28 * cos(a)).toFloat(), (56 + 28 * sin(a)).toFloat(),
            (130 + 40 * cos(a)).toFloat(), (56 + 40 * sin(a)).toFloat(), strokePaint,
          )
        }
        fillPaint.color = gold
        c.drawCircle(130f, 56f, 22f, fillPaint)
      }
      "rain_cloud" -> {
        fillPaint.color = Color.parseColor("#8CA5C0")
        c.drawCircle(106f, 48f, 18f, fillPaint)
        c.drawCircle(130f, 38f, 22f, fillPaint)
        c.drawCircle(154f, 48f, 17f, fillPaint)
        c.drawRoundRect(96f, 48f, 164f, 66f, 9f, 9f, fillPaint)
        strokePaint.color = sky
        strokePaint.strokeWidth = 3f
        c.drawLine(104f, 74f, 99f, 88f, strokePaint)
        c.drawLine(122f, 74f, 117f, 90f, strokePaint)
        c.drawLine(140f, 74f, 135f, 88f, strokePaint)
        c.drawLine(156f, 74f, 151f, 88f, strokePaint)
      }
      "ball" -> {
        fillPaint.color = coral
        c.drawCircle(130f, 56f, 30f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.5f
        c.drawCircle(130f, 56f, 30f, strokePaint)
        strokePaint.color = Color.WHITE
        c.drawArc(RectF(98f, 34f, 124f, 78f), -50f, 100f, false, strokePaint)
        c.drawArc(RectF(136f, 34f, 162f, 78f), 130f, 100f, false, strokePaint)
      }
      "ball_under_table" -> {
        fillPaint.color = Color.parseColor("#8D6344")
        c.drawRoundRect(76f, 32f, 184f, 44f, 4f, 4f, fillPaint)
        fillPaint.color = Color.parseColor("#6F4C32")
        c.drawRect(86f, 44f, 96f, 90f, fillPaint)
        c.drawRect(164f, 44f, 174f, 90f, fillPaint)
        fillPaint.color = coral
        c.drawCircle(130f, 76f, 13f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2f
        c.drawCircle(130f, 76f, 13f, strokePaint)
      }
      "books" -> {
        fillPaint.color = sky; c.drawRoundRect(82f, 66f, 178f, 84f, 4f, 4f, fillPaint)
        fillPaint.color = accent; c.drawRoundRect(88f, 46f, 176f, 64f, 4f, 4f, fillPaint)
        fillPaint.color = warm; c.drawRoundRect(92f, 26f, 174f, 44f, 4f, 4f, fillPaint)
      }
      "ruler" -> {
        fillPaint.color = Color.parseColor("#F9D56E")
        c.drawRoundRect(48f, 36f, 212f, 74f, 6f, 6f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.2f
        c.drawRoundRect(48f, 36f, 212f, 74f, 6f, 6f, strokePaint)
        for (i in 0 until 9) {
          c.drawLine(66f + i * 16f, 36f, 66f + i * 16f, if (i % 2 == 0) 54f else 47f, strokePaint)
        }
      }
      "thermometer" -> {
        fillPaint.color = Color.WHITE
        c.drawRoundRect(122f, 14f, 138f, 76f, 8f, 8f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.2f
        c.drawRoundRect(122f, 14f, 138f, 76f, 8f, 8f, strokePaint)
        fillPaint.color = coral
        c.drawCircle(130f, 82f, 14f, fillPaint)
        c.drawRoundRect(127f, 34f, 133f, 78f, 3f, 3f, fillPaint)
      }
      "magnet" -> {
        strokePaint.color = coral
        strokePaint.strokeWidth = 14f
        c.drawArc(RectF(104f, 36f, 156f, 88f), 0f, 180f, false, strokePaint)
        c.drawLine(104f, 34f, 104f, 64f, strokePaint)
        c.drawLine(156f, 34f, 156f, 64f, strokePaint)
        fillPaint.color = Color.parseColor("#CBD5E1")
        c.drawRect(97f, 24f, 111f, 38f, fillPaint)
        c.drawRect(149f, 24f, 163f, 38f, fillPaint)
      }
      "compass" -> {
        fillPaint.color = Color.WHITE
        c.drawCircle(130f, 56f, 38f, fillPaint)
        strokePaint.color = ink
        strokePaint.strokeWidth = 2.2f
        c.drawCircle(130f, 56f, 38f, strokePaint)
        strokePaint.color = accent
        c.drawLine(130f, 32f, 130f, 80f, strokePaint)
        c.drawLine(106f, 56f, 154f, 56f, strokePaint)
        textPaint.color = ink; textPaint.textSize = 12f
        c.drawText("N", 130f, 28f, textPaint)
        c.drawText("S", 130f, 92f, textPaint)
        c.drawText("W", 98f, 60f, textPaint)
        textPaint.color = if (hideEast) warm else ink
        c.drawText(if (hideEast) "?" else "E", 162f, 60f, textPaint)
      }
      "wash_hands" -> {
        strokePaint.color = sky
        strokePaint.strokeWidth = 6f
        c.drawLine(96f, 34f, 126f, 34f, strokePaint)
        c.drawLine(126f, 34f, 126f, 44f, strokePaint)
        strokePaint.strokeWidth = 3f
        c.drawLine(116f, 48f, 116f, 68f, strokePaint)
        fillPaint.color = Color.parseColor("#F4C59C")
        c.drawCircle(116f, 78f, 11f, fillPaint)
        c.drawCircle(136f, 78f, 11f, fillPaint)
        fillPaint.color = Color.WHITE
        c.drawCircle(126f, 66f, 5f, fillPaint)
        c.drawCircle(138f, 63f, 4f, fillPaint)
      }
      "school" -> {
        val roof = Path().apply { moveTo(84f, 48f); lineTo(130f, 18f); lineTo(176f, 48f); close() }
        fillPaint.color = coral; c.drawPath(roof, fillPaint)
        fillPaint.color = Color.parseColor("#FFF2CE")
        c.drawRoundRect(92f, 48f, 168f, 92f, 4f, 4f, fillPaint)
        fillPaint.color = Color.parseColor("#8D6344")
        c.drawRect(122f, 66f, 138f, 92f, fillPaint)
        fillPaint.color = sky
        c.drawRect(154f, 14f, 168f, 23f, fillPaint)
      }
      "firefighter" -> {
        fillPaint.color = Color.parseColor("#F4C59C"); c.drawCircle(114f, 60f, 18f, fillPaint)
        fillPaint.color = coral; c.drawArc(RectF(92f, 28f, 136f, 64f), 180f, 180f, true, fillPaint)
        fillPaint.color = gold; c.drawRoundRect(106f, 32f, 122f, 42f, 3f, 3f, fillPaint)
        strokePaint.color = sky; strokePaint.strokeWidth = 4f
        c.drawLine(134f, 68f, 164f, 58f, strokePaint)
        fillPaint.color = warm; c.drawOval(RectF(166f, 42f, 184f, 70f), fillPaint)
      }
      "rice_field" -> {
        fillPaint.color = Color.parseColor("#8CC46E"); c.drawRoundRect(48f, 68f, 212f, 92f, 6f, 6f, fillPaint)
        strokePaint.color = gold; strokePaint.strokeWidth = 3f
        for (x in listOf(84f, 114f, 144f, 174f)) c.drawLine(x, 72f, x + 12f, 32f, strokePaint)
        fillPaint.color = gold; c.drawCircle(68f, 30f, 10f, fillPaint)
      }
      "red_bag" -> {
        strokePaint.color = ink; strokePaint.strokeWidth = 4f
        c.drawArc(RectF(114f, 20f, 146f, 48f), 180f, 180f, false, strokePaint)
        fillPaint.color = coral; c.drawRoundRect(100f, 34f, 160f, 88f, 12f, 12f, fillPaint)
        fillPaint.color = Color.parseColor("#B83B3B"); c.drawRoundRect(112f, 54f, 148f, 76f, 6f, 6f, fillPaint)
      }
      "banana" -> {
        val p = Path().apply {
          moveTo(84f, 66f)
          cubicTo(106f, 90f, 156f, 80f, 174f, 30f)
          lineTo(156f, 36f)
          cubicTo(142f, 64f, 114f, 72f, 90f, 56f)
          close()
        }
        fillPaint.color = Color.parseColor("#F5CE3E"); c.drawPath(p, fillPaint)
        strokePaint.color = warm; strokePaint.strokeWidth = 2.5f; c.drawPath(p, strokePaint)
      }
    }
  }
}
