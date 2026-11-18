package expo.modules.usagemonitor

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent

/** Opt-in metadata only. Never access event.text, event.source or any window hierarchy. */
class ScrollService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val pkg = event.packageName?.toString() ?: return
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      if (OverlayController.isShowing()) {
        // Keep the active learning break locked on top of Home and Recent Apps.
        OverlayController.onWindowChanged(this, pkg)
        return
      }
      // App switches disarm any pending swipe gate when switching away.
      ScrollGate.leave(pkg)
      OverlayController.onWindowChanged(this, pkg)
      return
    }
    if (event.eventType != AccessibilityEvent.TYPE_VIEW_SCROLLED) return
    val cfg = Store.config(this)
    if (!cfg.enabled || !Perms.hasUsageAccess(this) || !MonitorService.running || cfg.paused || cfg.focusUntil > System.currentTimeMillis() ||
      System.currentTimeMillis() < Store.getLong(this, "snoozeUntil") ||
      !Categories.isTargetApp(this, pkg, cfg.monitorAllApps) || OverlayController.isShowing()) return
    // Positive content movement corresponds to an upward feed swipe. Feeds such as
    // ViewPager2 may report zero deltas; fall back to allowing scroll events once armed.
    val forward = if (Build.VERSION.SDK_INT >= 28 && (event.scrollDeltaY != 0 || event.scrollDeltaX != 0)) {
      event.scrollDeltaY > 0
    } else {
      true
    }
    if (!ScrollGate.consume(pkg, event.eventTime, forward)) return
    OverlayController.showQuizOverlay(this, cfg, Categories.label(this, pkg), pkg, 1)
    Store.putLong(this, "lastNudge", System.currentTimeMillis())
  }

  override fun onInterrupt() { ScrollGate.clear(); OverlayController.dismiss(this) }
  override fun onDestroy() { ScrollGate.clear(); OverlayController.dismiss(this); super.onDestroy() }

  companion object {
    fun isEnabled(ctx: Context): Boolean {
      val expected = ComponentName(ctx, ScrollService::class.java)
      val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
      return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
    }
  }
}
