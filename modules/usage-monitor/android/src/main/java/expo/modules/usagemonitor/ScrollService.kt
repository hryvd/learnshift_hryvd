package expo.modules.usagemonitor

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat
import expo.modules.usagemonitor.mirror.SentinelBus
import java.util.Calendar

/** Opt-in metadata only. Never access event.text, event.source or any window hierarchy. */
class ScrollService : AccessibilityService() {
  private var wakeReceiverRegistered = false
  private var lastServiceKickAt = 0L
  private var lastSentinelScrollAt = 0L

  private val wakeReceiver = object : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
          ScrollGate.clear()
          if (OverlayController.isGateShowing()) OverlayController.dismiss(ctx)
          MonitorService.refresh(ctx, syncRemote = true)
        }
      }
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    if (!wakeReceiverRegistered) {
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
      runCatching {
        ContextCompat.registerReceiver(this, wakeReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        wakeReceiverRegistered = true
      }
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val pkg = event.packageName?.toString() ?: return
    val cfg = Store.config(this)
    val now = System.currentTimeMillis()
    if (cfg.enabled && Perms.hasUsageAccess(this) && !MonitorService.running && now - lastServiceKickAt > 15_000L) {
      lastServiceKickAt = now
      MonitorService.start(this)
    }
    val cal = Calendar.getInstance()
    val clock = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    if (LockdownController.isLocked(cfg, clock, now)) {
      if (!LockdownController.isEmergencyAllowed(this, pkg)) {
        if (pkg == "com.android.systemui" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
        }
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
          LockdownController.enforce(this, cfg, clock)
        }
      }
      return
    }
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
    val isTarget = Categories.isTargetApp(this, pkg, cfg.monitorAllApps)
    if (isTarget) {
      val elapsed = SystemClock.elapsedRealtime()
      if (elapsed - lastSentinelScrollAt >= 300L) {
        lastSentinelScrollAt = elapsed
        SentinelBus.recordScrollEvent(elapsed)
      }
    }
    if (!cfg.enabled || !Perms.hasUsageAccess(this) || !MonitorService.running || cfg.paused || cfg.focusUntil > now ||
      now < Store.getLong(this, "snoozeUntil") ||
      !isTarget || OverlayController.isShowing()) return
    // Positive content movement corresponds to an upward feed swipe. Feeds such as
    // ViewPager2 may report zero deltas; fall back to allowing scroll events once armed.
    val forward = if (Build.VERSION.SDK_INT >= 28 && (event.scrollDeltaY != 0 || event.scrollDeltaX != 0)) {
      event.scrollDeltaY > 0
    } else {
      true
    }
    if (!ScrollGate.consume(pkg, event.eventTime, forward)) return
    OverlayController.showQuizOverlay(this, cfg, Categories.label(this, pkg), pkg, 1)
    Store.putLong(this, "lastNudge", now)
  }

  override fun onInterrupt() { ScrollGate.clear(); OverlayController.dismiss(this) }
  override fun onDestroy() {
    if (wakeReceiverRegistered) {
      runCatching { unregisterReceiver(wakeReceiver) }
      wakeReceiverRegistered = false
    }
    ScrollGate.clear()
    OverlayController.dismiss(this)
    LockdownController.dismiss(this)
    super.onDestroy()
  }

  companion object {
    fun isEnabled(ctx: Context): Boolean {
      val expected = ComponentName(ctx, ScrollService::class.java)
      val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
      return enabled.split(':').any { ComponentName.unflattenFromString(it) == expected }
    }
  }
}
