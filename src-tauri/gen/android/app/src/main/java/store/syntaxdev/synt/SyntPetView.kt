package store.syntaxdev.synt

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.View
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

/**
 * The floating Synt: a dark Dynamic-Island pill with the red cube and the two
 * white tick eyes from the web canvas, drawn natively so it costs one view and
 * no WebView.
 *
 * The eyes are the state display, exactly like the island: tall while
 * listening, orbiting while thinking, pulsing while speaking, smiling arcs
 * when happy, flat dashes asleep.
 */
class SyntPetView(context: Context) : View(context) {

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val eye = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = 0xFFFFFFFF.toInt()
    strokeCap = Paint.Cap.ROUND
  }
  private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    textSize = dp(12f)
    color = 0xFFF7F8FA.toInt()
  }
  private val path = Path()
  private val rect = RectF()

  private var mood = "idle"
  private var label = "Synt"
  private var moodAt = 0f
  private val startedAt = System.nanoTime()
  private var blinkStart = -10f
  private var nextBlink = 3.4f

  init {
    setLayerType(LAYER_TYPE_SOFTWARE, null)
  }

  fun setMood(value: String) {
    if (value == mood) return
    mood = value
    moodAt = seconds()
    if (value == "happy") nextBlink = seconds() + 4f
    invalidate()
  }

  fun setLabel(value: String) {
    val clean = value.ifBlank { "Synt" }
    if (clean == label) return
    label = clean
    invalidate()
  }

  private fun seconds(): Float = (System.nanoTime() - startedAt) / 1_000_000_000f
  private fun dp(value: Float): Float = value * resources.displayMetrics.density

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(dp(150f).toInt(), dp(44f).toInt())
  }

  private fun openAmount(now: Float): Float {
    if (mood == "sleeping") return 0f
    if (now > nextBlink) {
      blinkStart = now
      nextBlink = now + 2.4f + (Math.random() * 3.4f).toFloat()
    }
    if (blinkStart < 0f) return 1f
    val k = (now - blinkStart) / 0.15f
    if (k >= 1f) {
      blinkStart = -1f
      return 1f
    }
    return if (k < 0.5f) 1f - k * 1.84f else 0.08f + (k - 0.5f) * 1.84f
  }

  override fun onDraw(canvas: Canvas) {
    val now = seconds()
    val t = now
    val w = width.toFloat()
    val h = height.toFloat()

    // ── The pill ──────────────────────────────────────────────────────────
    val pillH = dp(40f)
    val top = (h - pillH) / 2f
    fill.reset()
    fill.isAntiAlias = true
    fill.style = Paint.Style.FILL
    fill.color = 0xF20A0A0D.toInt()
    rect.set(0f, top, w, top + pillH)
    canvas.drawRoundRect(rect, pillH / 2f, pillH / 2f, fill)

    fill.style = Paint.Style.STROKE
    fill.strokeWidth = dp(0.8f)
    fill.color = 0x1FFFFFFF
    canvas.drawRoundRect(rect, pillH / 2f, pillH / 2f, fill)
    fill.style = Paint.Style.FILL

    // ── Acting ────────────────────────────────────────────────────────────
    val s = dp(18f)
    val dx = s * 0.26f
    val dy = s * 0.23f
    val bob = sin(t * 1.35f) * s * 0.015f
    val age = now - moodAt
    val hop = if (mood == "happy" && age < 1.5f) -Math.abs(sin(age * Math.PI.toFloat() * 1.5f)) * s * 0.3f * exp(-age * 2.6f) else 0f
    val squash = if (mood == "happy" && age < 1.5f) sin(age * Math.PI.toFloat() * 3f) * exp(-age * 3.4f) else 0f

    val cx = dp(23f)
    val cy = h / 2f + bob + hop
    val ox = cx - (s + dx) / 2f
    val oy = cy - (s + dy) / 2f

    canvas.save()
    canvas.translate(cx, cy)
    canvas.scale(1f + squash * 0.06f, 1f - squash * 0.07f)
    canvas.translate(-cx, -cy)

    // Top face.
    path.reset()
    path.moveTo(ox, oy + dy)
    path.lineTo(ox + s, oy + dy)
    path.lineTo(ox + s + dx, oy)
    path.lineTo(ox + dx, oy)
    path.close()
    fill.color = 0xFFFF4B3F.toInt()
    canvas.drawPath(path, fill)

    // Right face.
    path.reset()
    path.moveTo(ox + s, oy + dy)
    path.lineTo(ox + s + dx, oy)
    path.lineTo(ox + s + dx, oy + s)
    path.lineTo(ox + s, oy + s + dy)
    path.close()
    fill.color = 0xFF9C0D14.toInt()
    canvas.drawPath(path, fill)

    // Front face.
    fill.color = 0xFFEE232B.toInt()
    rect.set(ox, oy + dy, ox + s, oy + s + dy)
    canvas.drawRoundRect(rect, s * 0.16f, s * 0.16f, fill)

    drawEyes(canvas, ox, oy, s, dy, t, openAmount(now))
    canvas.restore()

    // ── Label ─────────────────────────────────────────────────────────────
    val baseline = h / 2f - (text.descent() + text.ascent()) / 2f
    canvas.drawText(label, dp(42f), baseline, text)

    postInvalidateOnAnimation()
  }

  private fun drawEyes(canvas: Canvas, ox: Float, oy: Float, s: Float, dy: Float, t: Float, open: Float) {
    val faceY = oy + dy + s * 0.47f
    val spread = s * if (mood == "listening") 0.215f else 0.2f
    val baseLen = s * 0.17f
    val baseThick = s * 0.088f
    val angle = 0.3f

    for (i in 0..1) {
      val side = if (i == 0) -1f else 1f
      val x = ox + s / 2f + side * spread
      var y = faceY

      if (mood == "happy") {
        eye.strokeWidth = s * 0.058f
        rect.set(x - s * 0.09f, y - s * 0.06f, x + s * 0.09f, y + s * 0.12f)
        canvas.drawArc(rect, 200f, 140f, false, eye)
        continue
      }

      var length = baseLen
      var thickness = baseThick
      var tilt = angle
      var alpha = 1f

      when (mood) {
        "sleeping" -> {
          length = s * 0.15f
          thickness = s * 0.05f
          tilt = 0f
          alpha = 0.5f
        }
        "listening" -> {
          tilt = 0.02f + sin(t * 2.1f + i * 0.35f) * 0.03f
          length = baseLen * (1.1f + sin(t * 2.4f + i * 0.8f) * 0.08f)
          y += sin(t * 2.4f + i * 0.8f) * s * 0.008f
        }
        "speaking" -> {
          val pulse = 0.82f + Math.abs(sin(t * 7.5f + i * 1.9f)) * 0.4f
          length = baseLen * pulse
          thickness = baseThick * (0.92f + Math.abs(sin(t * 7.5f + i * 1.9f)) * 0.18f)
          tilt = angle * 0.8f
        }
        "thinking" -> {
          tilt = angle + sin(t * 1.7f + i * 1.4f) * 0.22f
          length = baseLen * 0.92f
        }
      }

      length *= maxOf(0.22f, open)
      if (open < 0.4f) thickness *= 0.7f
      eye.strokeWidth = thickness
      eye.alpha = (255 * alpha).toInt()

      canvas.save()
      canvas.translate(x, y)
      canvas.rotate(tilt * 57.29578f)
      canvas.drawLine(0f, -length / 2f, 0f, length / 2f, eye)
      canvas.restore()
      eye.alpha = 255

      if (mood == "thinking") {
        val orbit = t * 2.6f + i * Math.PI.toFloat()
        fill.color = 0x8CFFFFFF.toInt()
        canvas.drawCircle(x + cos(orbit) * s * 0.085f, y + sin(orbit) * s * 0.055f, s * 0.017f, fill)
      }
    }
  }
}
