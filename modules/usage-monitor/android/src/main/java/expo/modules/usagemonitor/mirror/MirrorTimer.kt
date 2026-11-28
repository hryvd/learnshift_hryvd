package expo.modules.usagemonitor.mirror

import kotlin.math.ceil

enum class MirrorTriggerMode(val key: String) {
  SMART("smart"),
  TIMER("timer"),
  BOTH("both");

  companion object {
    fun fromKey(raw: String?): MirrorTriggerMode = when (raw) {
      "timer" -> TIMER
      "both" -> BOTH
      else -> SMART
    }
  }
}

enum class MirrorDispatchReason { NONE, SMART, TIMER }

data class MirrorTimerState(
  val activePkg: String? = null,
  val accumulatedMs: Long = 0L,
  val lastActiveAtMs: Long = 0L,
  val lastDispatchAtMs: Long = 0L,
  val paused: Boolean = false,
)

data class MirrorTickInput(
  val nowMs: Long,
  val dtMs: Long,
  val autoEnabled: Boolean,
  val mode: MirrorTriggerMode,
  val timerMinutes: Int,
  val screenAwake: Boolean,
  val inTargetApp: Boolean,
  val activePkg: String?,
  val suppressed: Boolean,
  val riskScore: Float,
)

data class MirrorTickResult(
  val state: MirrorTimerState,
  val shouldDispatch: Boolean,
  val reason: MirrorDispatchReason,
  val remainingSec: Int?,
  val paused: Boolean,
)

/**
 * Pure decision engine for Attention Mirror timer & smart triggers.
 * Exact Kotlin twin of src/services/monitor/mirrorTimer.ts.
 */
object MirrorTimer {
  val ALLOWED_MINUTES = setOf(5, 10, 15, 20, 30)
  const val GAP_RESET_MS = 2 * 60_000L
  const val COOLDOWN_MS = 180_000L
  const val SMART_RISK_THRESHOLD = 0.75f

  fun normalizeMinutes(raw: Int): Int = if (raw in ALLOWED_MINUTES) raw else 15

  private fun calcRemainingSec(mode: MirrorTriggerMode, autoEnabled: Boolean, targetMs: Long, accumulatedMs: Long): Int? {
    if (!autoEnabled || (mode != MirrorTriggerMode.TIMER && mode != MirrorTriggerMode.BOTH)) return null
    val rem = (targetMs - accumulatedMs).coerceAtLeast(0L)
    return ceil(rem / 1000.0).toInt()
  }

  fun step(prev: MirrorTimerState, input: MirrorTickInput): MirrorTickResult {
    val minutes = normalizeMinutes(input.timerMinutes)
    val targetMs = minutes * 60_000L
    val timerEnabled = input.mode == MirrorTriggerMode.TIMER || input.mode == MirrorTriggerMode.BOTH
    val smartEnabled = input.mode == MirrorTriggerMode.SMART || input.mode == MirrorTriggerMode.BOTH

    if (!input.autoEnabled) {
      val reset = prev.copy(activePkg = null, accumulatedMs = 0L, lastActiveAtMs = 0L, paused = false)
      return MirrorTickResult(reset, false, MirrorDispatchReason.NONE, null, false)
    }

    if (!input.screenAwake) {
      val expired = prev.lastActiveAtMs > 0L && input.nowMs - prev.lastActiveAtMs >= GAP_RESET_MS
      val next = if (expired) {
        prev.copy(activePkg = null, accumulatedMs = 0L, lastActiveAtMs = 0L, paused = false)
      } else {
        prev.copy(paused = prev.accumulatedMs > 0L)
      }
      return MirrorTickResult(
        next,
        false,
        MirrorDispatchReason.NONE,
        calcRemainingSec(input.mode, true, targetMs, next.accumulatedMs),
        next.paused,
      )
    }

    if (input.suppressed) {
      val next = prev.copy(
        lastActiveAtMs = if (input.inTargetApp && prev.accumulatedMs > 0L) input.nowMs else prev.lastActiveAtMs,
        paused = prev.accumulatedMs > 0L || input.inTargetApp,
      )
      return MirrorTickResult(
        next,
        false,
        MirrorDispatchReason.NONE,
        calcRemainingSec(input.mode, true, targetMs, next.accumulatedMs),
        next.paused,
      )
    }

    if (!input.inTargetApp || input.activePkg.isNullOrBlank()) {
      val expired = prev.lastActiveAtMs > 0L && input.nowMs - prev.lastActiveAtMs >= GAP_RESET_MS
      val next = if (expired) {
        prev.copy(activePkg = null, accumulatedMs = 0L, lastActiveAtMs = 0L, paused = false)
      } else {
        prev.copy(paused = prev.accumulatedMs > 0L)
      }
      return MirrorTickResult(
        next,
        false,
        MirrorDispatchReason.NONE,
        calcRemainingSec(input.mode, true, targetMs, next.accumulatedMs),
        next.paused,
      )
    }

    val gapReset = prev.lastActiveAtMs > 0L && input.nowMs - prev.lastActiveAtMs >= GAP_RESET_MS
    val baseAccum = if (gapReset) 0L else prev.accumulatedMs
    val dt = input.dtMs.coerceAtLeast(0L)
    val nextAccum = if (timerEnabled) baseAccum + dt else 0L

    val nextState = prev.copy(
      activePkg = input.activePkg,
      accumulatedMs = nextAccum,
      lastActiveAtMs = input.nowMs,
      paused = false,
    )

    val cooldownReady = prev.lastDispatchAtMs == 0L || (input.nowMs - prev.lastDispatchAtMs) >= COOLDOWN_MS
    val timerDue = timerEnabled && nextAccum >= targetMs
    val smartDue = smartEnabled && input.riskScore > SMART_RISK_THRESHOLD

    if (cooldownReady && (timerDue || smartDue)) {
      val reason = if (timerDue) MirrorDispatchReason.TIMER else MirrorDispatchReason.SMART
      return MirrorTickResult(
        nextState,
        true,
        reason,
        calcRemainingSec(input.mode, true, targetMs, nextAccum),
        false,
      )
    }

    return MirrorTickResult(
      nextState,
      false,
      MirrorDispatchReason.NONE,
      calcRemainingSec(input.mode, true, targetMs, nextAccum),
      false,
    )
  }

  fun commitDispatch(state: MirrorTimerState, nowMs: Long): MirrorTimerState = state.copy(
    accumulatedMs = 0L,
    lastActiveAtMs = nowMs,
    lastDispatchAtMs = nowMs,
    paused = false,
  )
}
