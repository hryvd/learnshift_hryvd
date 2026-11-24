package expo.modules.usagemonitor.mirror

import android.app.Activity
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.CrossProfileApps
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
}

object NeutralBannerOverlay {
  fun showBriefPill(context: Context, message: String, durationMs: Long = 1800L) {
    val appCtx = context.applicationContext
    if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(appCtx)) {
      Handler(Looper.getMainLooper()).post { Toast.makeText(appCtx, message, Toast.LENGTH_SHORT).show() }
      return
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
    val mainHandler = Handler(Looper.getMainLooper())
    mainHandler.post {
      try {
        wm.addView(pill, params)
        mainHandler.postDelayed({ runCatching { wm.removeViewImmediate(pill) } }, durationMs)
      } catch (_: Exception) {
        Toast.makeText(appCtx, message, Toast.LENGTH_SHORT).show()
      }
    }
  }
}

class WorkBridgeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val targetPkg = intent.getStringExtra(LearnShiftAdminReceiver.EXTRA_TARGET_PKG)
    val sessionMin = intent.getIntExtra(LearnShiftAdminReceiver.EXTRA_SESSION_MIN, 20)
    if (targetPkg.isNullOrBlank()) {
      finish()
      return
    }
    val launchIntent = packageManager.getLaunchIntentForPackage(targetPkg)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    if (launchIntent != null) {
      startActivity(launchIntent)
      NeutralBannerOverlay.showBriefPill(applicationContext, "$sessionMin min scroll break • Neutral Feed Mode")
    } else {
      NeutralBannerOverlay.showBriefPill(
        applicationContext,
        "Install target app in LearnShift Neutral Space to enable real-app mode",
      )
    }
    finish()
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
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
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
