package expo.modules.usagemonitor
fun main() {
  ScrollGate.clear()
  check(!ScrollGate.consume("video", 100L, true))
  ScrollGate.arm("video", 100L)
  check(ScrollGate.isArmed())
  check(!ScrollGate.consume("video", 100L, true)) // queued before arm
  check(!ScrollGate.consume("other", 101L, true))
  check(!ScrollGate.consume("video", 101L, false))
  ScrollGate.arm("video", 120L) // rearming cannot postpone a ready break
  check(ScrollGate.consume("video", 110L, true))
  check(!ScrollGate.consume("video", 130L, true)) // consume once
  ScrollGate.arm("video", 200L)
  ScrollGate.leave("other")
  check(!ScrollGate.isArmed())
  ScrollGate.arm("video", 300L)
  ScrollGate.clear()
  check(!ScrollGate.consume("video", 400L, true))
  println("PASS: native timer gate; no automatic display, rejects stale/reverse/other-app events, consumes once, clears on switch.")
}
