package expo.modules.usagemonitor

/** Only the current app and a monotonic deadline; never coordinates or event history. */
internal object ScrollGate {
  private var app: String? = null
  private var armedAt = 0L

  @Synchronized fun arm(pkg: String, now: Long) {
    if (app == pkg) return
    app = pkg
    armedAt = now
  }

  @Synchronized fun isArmed() = app != null

  @Synchronized fun clear() { app = null; armedAt = 0L }

  @Synchronized fun consume(pkg: String, eventTime: Long, forward: Boolean): Boolean {
    if (pkg != app || !forward || eventTime <= armedAt) return false
    clear()
    return true
  }

  @Synchronized fun leave(pkg: String) { if (app != pkg) clear() }
}
