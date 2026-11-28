package expo.modules.usagemonitor.mirror

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.provider.Settings
import java.util.Calendar
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.random.Random

object SentinelBus {
  private val scrollTimestampsMs = CopyOnWriteArrayList<Long>()

  @Volatile var lastActivePackage: String = ""
  @Volatile var lastInterventionTimeMs: Long = 0L
  @Volatile var lastInterventionTopicTag: String = "WORK_PROFILE_NEUTRAL"
  @Volatile var lastInterventionStrategy: String = "WORK_PROFILE_REAL_APP"
  @Volatile var lastInterventionVideoId: String = ""
  @Volatile var lastInterventionVideoTitle: String = ""
  @Volatile var timerRemainingSec: Int? = null
  @Volatile var timerPaused: Boolean = false

  fun recordScrollEvent(timestampMs: Long) {
    scrollTimestampsMs.add(timestampMs)
    val cutoff = timestampMs - 60_000L
    scrollTimestampsMs.removeIf { it < cutoff }
  }

  fun snapshotScrollTimestamps(nowMs: Long): List<Long> {
    val cutoff = nowMs - 60_000L
    scrollTimestampsMs.removeIf { it < cutoff }
    return scrollTimestampsMs.toList()
  }

  fun clearScrollWindow() {
    scrollTimestampsMs.clear()
  }
}

data class BehavioralVector(
  val sessionMinutes: Int,
  val scrollCadencePerMin: Float,
  val dwellVarianceSecSq: Float,
  val hourOfDay: Int,
)

class SessionRiskScorer {
  fun buildVector(sessionDurationMs: Long, swipeTimestampsMs: List<Long>): BehavioralVector {
    val sessionMinutes = (sessionDurationMs / 60_000L).toInt().coerceAtLeast(0)
    val cadencePerMin = swipeTimestampsMs.size.toFloat()
    val dwellVariance = if (swipeTimestampsMs.size >= 3) {
      val intervalsSec = swipeTimestampsMs.zipWithNext { a, b -> (b - a) / 1000.0 }
      val mean = intervalsSec.average()
      intervalsSec.map { (it - mean).pow(2) }.average().toFloat()
    } else {
      5.0f
    }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return BehavioralVector(sessionMinutes, cadencePerMin, dwellVariance, hour)
  }

  fun computeRiskProbability(v: BehavioralVector): Float {
    val isLateNight = if (v.hourOfDay >= 22 || v.hourOfDay <= 4) 1.0f else 0.0f
    val restlessFlick = if (v.scrollCadencePerMin >= 18f) 1.0f else (v.scrollCadencePerMin / 18f)
    val zombieTrance = if (v.sessionMinutes >= 20 && v.dwellVarianceSecSq < 2.0f) 1.0f else 0.0f

    val logit = -3.1f +
      (0.11f * v.sessionMinutes) +
      (1.45f * restlessFlick) +
      (0.95f * zombieTrance) +
      (1.15f * isLateNight)

    return (1.0 / (1.0 + exp(-logit.toDouble()))).toFloat()
  }
}

enum class DoomscrollPosture { SUPINE_BEDTIME, DESK_UPRIGHT }
enum class DecelerationStrategy { ANTI_FEED, SENSORY_DECAY, DEJA_VU_LOOP, KINETIC_FRICTION }

data class OfflineContextSnapshot(
  val hourOfDay: Int,
  val scrollCadencePerMin: Float,
  val sessionMinutes: Int,
  val dwellVariance: Float,
  val screenBrightness: Int,
  val isAudioPlaying: Boolean,
  val posture: DoomscrollPosture,
)

class OfflineContextCollector(private val context: Context) {
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  @Volatile private var lastGravityY: Float = 8.0f
  @Volatile private var lastGravityZ: Float = 4.0f

  fun captureSingleGravityReading() {
    val gravitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: return
    val listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        lastGravityY = event.values[1]
        lastGravityZ = event.values[2]
        sensorManager.unregisterListener(this)
      }
      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }
    sensorManager.registerListener(listener, gravitySensor, SensorManager.SENSOR_DELAY_NORMAL)
  }

  fun buildSnapshot(cadencePerMin: Float, sessionMin: Int, dwellVar: Float): OfflineContextSnapshot {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val brightness = runCatching {
      Settings.System.getInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128)
    }.getOrDefault(128)
    val isLyingDown = lastGravityZ < -2.0f || (abs(lastGravityY) < 2.5f && hour >= 21)
    val posture = if (isLyingDown && (hour >= 21 || hour <= 5)) {
      DoomscrollPosture.SUPINE_BEDTIME
    } else {
      DoomscrollPosture.DESK_UPRIGHT
    }

    return OfflineContextSnapshot(
      hourOfDay = hour,
      scrollCadencePerMin = cadencePerMin,
      sessionMinutes = sessionMin,
      dwellVariance = dwellVar,
      screenBrightness = brightness,
      isAudioPlaying = audioManager.isMusicActive,
      posture = posture,
    )
  }
}

class ImplicitContextBandit {
  fun selectDecelerationStrategy(ctx: OfflineContextSnapshot): DecelerationStrategy = when {
    ctx.posture == DoomscrollPosture.SUPINE_BEDTIME || ctx.screenBrightness < 45 ->
      DecelerationStrategy.SENSORY_DECAY
    ctx.scrollCadencePerMin > 22f ->
      DecelerationStrategy.KINETIC_FRICTION
    ctx.sessionMinutes >= 30 && ctx.dwellVariance < 1.5f ->
      DecelerationStrategy.DEJA_VU_LOOP
    else ->
      DecelerationStrategy.ANTI_FEED
  }

  fun selectTopicTag(stats: List<TopicImplicitStat>, forStudyHook: Boolean): String {
    if (stats.isEmpty()) return "SOIL_TAXONOMY"
    return if (forStudyHook) {
      stats.maxByOrNull { sampleBeta(it.alphaInterest, it.betaInterest) }!!.topicTag
    } else {
      stats.maxByOrNull { s ->
        val interest = sampleBeta(s.alphaInterest, s.betaInterest)
        val stopPower = sampleBeta(s.alphaStop, s.betaStop)
        (1.0f - interest) * 0.6f + (stopPower * 0.4f)
      }!!.topicTag
    }
  }

  private fun sampleBeta(alpha: Float, beta: Float): Float {
    val u = Random.nextFloat().coerceIn(0.001f, 0.999f)
    val mean = alpha / (alpha + beta)
    val noise = (u - 0.5f) / sqrt(alpha + beta)
    return (mean + noise).coerceIn(0f, 1f)
  }
}
