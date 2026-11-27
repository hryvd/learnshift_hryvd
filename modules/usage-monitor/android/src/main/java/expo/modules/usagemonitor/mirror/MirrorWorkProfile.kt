package expo.modules.usagemonitor.mirror

import android.app.Activity
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.CrossProfileApps
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.UserManager
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast

class LearnShiftAdminReceiver : DeviceAdminReceiver() {
  override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val adminComponent = getComponentName(context)
    dpm.setProfileName(adminComponent, "LearnShift Neutral Space")
    dpm.setProfileEnabled(adminComponent)

    // Enable WorkBridgeActivity strictly inside the isolated Work Profile so
    // Personal Profile intents route directly across profiles without a chooser.
    WorkProfileOnboardingManager.setWorkBridgeEnabled(context, enabled = true)

    val crossProfileFilter = IntentFilter(ACTION_LAUNCH_NEUTRAL_APP).apply {
      addCategory(Intent.CATEGORY_DEFAULT)
    }
    dpm.addCrossProfileIntentFilter(
      adminComponent,
      crossProfileFilter,
      DevicePolicyManager.FLAG_PARENT_CAN_ACCESS_MANAGED,
    )
  }

  companion object {
    const val ACTION_LAUNCH_NEUTRAL_APP = "com.learnshift.ACTION_LAUNCH_NEUTRAL_APP"
    const val EXTRA_TARGET_PKG = "EXTRA_TARGET_PKG"
    const val EXTRA_SESSION_MIN = "EXTRA_SESSION_MIN"
    const val EXTRA_DEEP_LINK_URL = "EXTRA_DEEP_LINK_URL"
    const val EXTRA_BADGE_TEXT = "EXTRA_BADGE_TEXT"
    const val EXTRA_SHOW_LOCAL_PILL = "EXTRA_SHOW_LOCAL_PILL"

    fun getComponentName(context: Context): ComponentName =
      ComponentName(context.applicationContext, LearnShiftAdminReceiver::class.java)
  }
}

enum class WorkProfileStatus {
  ACTIVE_AND_READY,
  CAN_PROVISION,
  BLOCKED_EXISTING_OR_UNSUPPORTED,
}

class WorkProfileOnboardingManager(private val context: Context) {
  fun checkStatus(): WorkProfileStatus {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val crossProfileApps = context.getSystemService(CrossProfileApps::class.java)
      if (crossProfileApps != null && crossProfileApps.targetUserProfiles.isNotEmpty()) {
        return WorkProfileStatus.ACTIVE_AND_READY
      }
    }
    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    val allowed = runCatching {
      dpm.isProvisioningAllowed(DevicePolicyManager.ACTION_PROVISION_MANAGED_PROFILE)
    }.getOrDefault(false)
    return if (allowed) WorkProfileStatus.CAN_PROVISION else WorkProfileStatus.BLOCKED_EXISTING_OR_UNSUPPORTED
  }

  fun launchProvisioningWizard(activity: Activity, requestCode: Int): Boolean {
    if (checkStatus() != WorkProfileStatus.CAN_PROVISION) return false
    val intent = Intent(DevicePolicyManager.ACTION_PROVISION_MANAGED_PROFILE).apply {
      putExtra(
        DevicePolicyManager.EXTRA_PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME,
        LearnShiftAdminReceiver.getComponentName(context),
      )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        putExtra(DevicePolicyManager.EXTRA_PROVISIONING_SKIP_ENCRYPTION, true)
      }
    }
    @Suppress("DEPRECATION")
    activity.startActivityForResult(intent, requestCode)
    return true
  }

  companion object {
    fun isRunningInsideWorkProfile(context: Context): Boolean {
      val appCtx = context.applicationContext
      val dpm = appCtx.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      if (dpm != null && runCatching { dpm.isProfileOwnerApp(appCtx.packageName) }.getOrDefault(false)) {
        return true
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val um = appCtx.getSystemService(Context.USER_SERVICE) as? UserManager
        if (um != null && runCatching { um.isManagedProfile }.getOrDefault(false)) {
          return true
        }
      }
      return false
    }

    fun setWorkBridgeEnabled(context: Context, enabled: Boolean) {
      runCatching {
        val appCtx = context.applicationContext
        val component = ComponentName(appCtx, WorkBridgeActivity::class.java)
        val desired = if (enabled) {
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        val current = appCtx.packageManager.getComponentEnabledSetting(component)
        if (current != desired) {
          appCtx.packageManager.setComponentEnabledSetting(component, desired, PackageManager.DONT_KILL_APP)
        }
      }
    }

    fun ensureBridgeEnabledState(context: Context) {
      setWorkBridgeEnabled(context, enabled = isRunningInsideWorkProfile(context))
    }
  }
}

object NeutralBannerOverlay {
  fun showBriefPill(context: Context, message: String, durationMs: Long = 1800L, delayMs: Long = 0L) {
    val appCtx = context.applicationContext
    val mainHandler = Handler(Looper.getMainLooper())
    val showTask = Runnable {
      if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(appCtx)) {
        Toast.makeText(appCtx, message, Toast.LENGTH_SHORT).show()
        return@Runnable
      }
      val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val pill = TextView(appCtx).apply {
        text = message
        setTextColor(Color.WHITE)
        textSize = 13f
        setPadding(40, 20, 40, 20)
        background = GradientDrawable().apply {
          setColor(Color.parseColor("#E6121212"))
          cornerRadius = 48f
          setStroke(2, Color.parseColor("#44FFFFFF"))
        }
      }
      val type = if (Build.VERSION.SDK_INT >= 26) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }
      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        type,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        y = 110
      }
      try {
        wm.addView(pill, params)
        mainHandler.postDelayed({ runCatching { wm.removeViewImmediate(pill) } }, durationMs)
      } catch (_: Exception) {
        Toast.makeText(appCtx, message, Toast.LENGTH_SHORT).show()
      }
    }
    if (delayMs > 0L) {
      mainHandler.postDelayed(showTask, delayMs)
    } else {
      mainHandler.post(showTask)
    }
  }
}

class WorkBridgeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val rawTargetPkg = intent.getStringExtra(LearnShiftAdminReceiver.EXTRA_TARGET_PKG)
    val sessionMin = intent.getIntExtra(LearnShiftAdminReceiver.EXTRA_SESSION_MIN, 20)
    val rawDeepLink = intent.getStringExtra(EXTRA_DEEP_LINK_URL)
    val badgeText = intent.getStringExtra(EXTRA_BADGE_TEXT)?.takeIf { it.isNotBlank() }
      ?: "${sessionMin.coerceAtLeast(1)}m break · Learning Feed Mode"
    val showLocalPill = intent.getBooleanExtra(LearnShiftAdminReceiver.EXTRA_SHOW_LOCAL_PILL, true)

    if (rawTargetPkg.isNullOrBlank() || !LearningMirrorPolicy.isAllowedTargetPackage(rawTargetPkg)) {
      finish()
      return
    }

    // Reject untrusted or non-HTTPS URLs passed to this exported cross-profile bridge.
    val safeDeepLink = rawDeepLink?.trim()?.takeIf { LearningMirrorPolicy.isAllowedDeepLink(it) }
    val resolvedPkg = resolveInstalledPackage(rawTargetPkg)

    // Priority 1: Open the real Work-Profile app directly onto the curated learning video or creator page.
    val launchedDirectVideo = if (safeDeepLink != null && resolvedPkg != null) {
      val videoIntent = Intent(Intent.ACTION_VIEW, Uri.parse(safeDeepLink)).apply {
        setPackage(resolvedPkg)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      runCatching {
        if (videoIntent.resolveActivity(packageManager) != null) {
          startActivity(videoIntent)
          true
        } else {
          false
        }
      }.getOrDefault(false)
    } else {
      false
    }

    // Priority 2: Launch the installed Work-Profile app's seeded learning home feed.
    val launchedAppHome = if (!launchedDirectVideo && resolvedPkg != null) {
      val homeIntent = packageManager.getLaunchIntentForPackage(resolvedPkg)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      homeIntent != null && runCatching {
        startActivity(homeIntent)
        true
      }.getOrDefault(false)
    } else {
      false
    }

    // Priority 3: Open the allowlisted learning URL in the isolated Work-Profile browser.
    val launchedWorkBrowser = if (!launchedDirectVideo && !launchedAppHome && safeDeepLink != null) {
      val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(safeDeepLink)).apply {
        addCategory(Intent.CATEGORY_BROWSABLE)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      runCatching {
        val resolved = webIntent.resolveActivity(packageManager)
        if (resolved != null && resolved.packageName != packageName) {
          startActivity(webIntent)
          true
        } else {
          false
        }
      }.getOrDefault(false)
    } else {
      false
    }

    // Priority 4: Never fail open back to Personal-Profile doomscrolling — show Tier C Deceleration Deck.
    if (!launchedDirectVideo && !launchedAppHome && !launchedWorkBrowser) {
      val fallbackIntent = Intent(this, DecelerationOverlayActivity::class.java).apply {
        putExtra(DecelerationOverlayActivity.EXTRA_SESSION_MIN, sessionMin)
        putExtra(DecelerationOverlayActivity.EXTRA_STRATEGY, DecelerationStrategy.ANTI_FEED.name)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      runCatching { startActivity(fallbackIntent) }
    }

    if (showLocalPill) {
      NeutralBannerOverlay.showBriefPill(applicationContext, badgeText)
    }
    finish()
  }

  private fun resolveInstalledPackage(requestedPkg: String): String? {
    for (candidate in LearningMirrorPolicy.packageCandidatesFor(requestedPkg)) {
      if (packageManager.getLaunchIntentForPackage(candidate) != null) return candidate
    }
    return null
  }

  companion object {
    const val EXTRA_DEEP_LINK_URL = LearnShiftAdminReceiver.EXTRA_DEEP_LINK_URL
    const val EXTRA_BADGE_TEXT = LearnShiftAdminReceiver.EXTRA_BADGE_TEXT
  }
}

data class NeutralSeedPrompt(
  val label: String,
  val youtubeSearchUrl: String,
  val tiktokSearchUrl: String,
)

object NeutralSeedManager {
  val defaultSeeds = listOf(
    NeutralSeedPrompt(
      label = "Tax & Accounting Lectures",
      youtubeSearchUrl = "https://m.youtube.com/results?search_query=basic+accounting+depreciation+lecture",
      tiktokSearchUrl = "https://www.tiktok.com/search?q=accounting%20rules%20lecture",
    ),
    NeutralSeedPrompt(
      label = "Soil Taxonomy & Geology",
      youtubeSearchUrl = "https://m.youtube.com/results?search_query=usda+soil+taxonomy+horizons",
      tiktokSearchUrl = "https://www.tiktok.com/search?q=soil%20taxonomy%20geology",
    ),
    NeutralSeedPrompt(
      label = "Slow Train Cab Views",
      youtubeSearchUrl = "https://m.youtube.com/results?search_query=slow+train+cab+view+no+talking",
      tiktokSearchUrl = "https://www.tiktok.com/search?q=slow%20train%20cab%20view",
    ),
  )

  fun openSeedInWorkBrowser(context: Context, url: String) {
    if (!LearningMirrorPolicy.isAllowedDeepLink(url)) return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(intent) }
  }

  /**
   * Opens a curated creator/video inside the isolated Work-Profile app when active
   * (supporting the 1-Minute Onboarding Seed Ritual), or falls back to opening the
   * HTTPS URL directly on devices without a Work Profile.
   */
  fun openLearningSeed(
    context: Context,
    targetPackage: String,
    url: String,
    badgeText: String,
  ): Boolean {
    if (!LearningMirrorPolicy.isAllowedDeepLink(url)) return false
    val status = WorkProfileOnboardingManager(context).checkStatus()
    if (status == WorkProfileStatus.ACTIVE_AND_READY && LearningMirrorPolicy.isAllowedTargetPackage(targetPackage)) {
      val crossIntent = Intent(LearnShiftAdminReceiver.ACTION_LAUNCH_NEUTRAL_APP).apply {
        putExtra(LearnShiftAdminReceiver.EXTRA_TARGET_PKG, targetPackage)
        putExtra(LearnShiftAdminReceiver.EXTRA_SESSION_MIN, 1)
        putExtra(LearnShiftAdminReceiver.EXTRA_DEEP_LINK_URL, url)
        putExtra(LearnShiftAdminReceiver.EXTRA_BADGE_TEXT, badgeText)
        putExtra(LearnShiftAdminReceiver.EXTRA_SHOW_LOCAL_PILL, false)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val routed = runCatching {
        context.startActivity(crossIntent)
        true
      }.getOrDefault(false)
      if (routed) {
        NeutralBannerOverlay.showBriefPill(context, badgeText, delayMs = 250L)
        return true
      }
    }
    val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return runCatching {
      context.startActivity(fallback)
      true
    }.getOrDefault(false)
  }
}

object OemBatteryHardening {
  fun openOemAutostartIfPresent(context: Context) {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val oemIntent = when {
      manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco") ->
        Intent().setComponent(
          ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        )
      manufacturer.contains("oppo") || manufacturer.contains("realme") ->
        Intent().setComponent(
          ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        )
      manufacturer.contains("vivo") ->
        Intent().setComponent(
          ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
        )
      else -> null
    }
    val launched = oemIntent?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(it) }.isSuccess
    } ?: false
    if (!launched) {
      val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(fallback)
    }
  }
}
