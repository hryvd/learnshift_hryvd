package expo.modules.usagemonitor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class UsageMonitorModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private var wakeReceiverRegistered = false

  private val wakeReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_ON || intent.action == Intent.ACTION_USER_PRESENT) {
        MonitorService.refresh(context, syncRemote = true)
        runCatching { sendEvent("onWakeRefresh", mapOf("at" to System.currentTimeMillis())) }
      }
    }
  }

  private fun launch(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val activity = appContext.currentActivity
    if (activity != null) activity.startActivity(intent) else ctx.startActivity(intent)
  }

  override fun definition() = ModuleDefinition {
    Name("UsageMonitor")
    Events("onWakeRefresh")

    OnCreate {
      MonitorService.onWakeCallback = {
        runCatching { sendEvent("onWakeRefresh", mapOf("at" to System.currentTimeMillis())) }
      }
      if (!wakeReceiverRegistered) {
        val filter = IntentFilter().apply {
          addAction(Intent.ACTION_SCREEN_ON)
          addAction(Intent.ACTION_USER_PRESENT)
        }
        runCatching {
          ContextCompat.registerReceiver(ctx, wakeReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
          wakeReceiverRegistered = true
        }
      }
    }

    OnDestroy {
      MonitorService.onWakeCallback = null
      if (wakeReceiverRegistered) {
        runCatching { ctx.unregisterReceiver(wakeReceiver) }
        wakeReceiverRegistered = false
      }
    }

    val pendingFilePromise = java.util.concurrent.atomic.AtomicReference<expo.modules.kotlin.Promise?>(null)
    val pickModuleFileReq = 4107

    OnActivityResult { _, payload ->
      if (payload.requestCode != pickModuleFileReq) return@OnActivityResult
      val promise = pendingFilePromise.getAndSet(null) ?: return@OnActivityResult
      if (payload.resultCode != android.app.Activity.RESULT_OK) {
        promise.resolve(null)
        return@OnActivityResult
      }
      val uri = payload.data?.data
      if (uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      try {
        var displayName = "module.txt"
        ctx.contentResolver.query(
          uri,
          arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
          null,
          null,
          null,
        )?.use { cursor ->
          if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0) {
              val n = cursor.getString(idx)
              if (!n.isNullOrBlank()) displayName = n
            }
          }
        }
        val bytes = ctx.contentResolver.openInputStream(uri)?.use { stream ->
          val buf = java.io.ByteArrayOutputStream()
          val chunk = ByteArray(4096)
          var total = 0
          while (total < 120_000) {
            val read = stream.read(chunk, 0, minOf(chunk.size, 120_000 - total))
            if (read <= 0) break
            buf.write(chunk, 0, read)
            total += read
          }
          buf.toByteArray()
        } ?: ByteArray(0)

        if (bytes.isEmpty()) {
          promise.resolve(mapOf("error" to "File is empty."))
          return@OnActivityResult
        }
        var controlCount = 0
        for (b in bytes) {
          val v = b.toInt() and 0xFF
          if (v == 0) {
            promise.resolve(mapOf("error" to "Binary files cannot be read directly. Please choose a .txt, .md, .csv, or .html file, or paste text."))
            return@OnActivityResult
          }
          if (v < 0x09 || (v in 0x0E..0x1F)) controlCount++
        }
        if (controlCount > bytes.size / 10) {
          promise.resolve(mapOf("error" to "Unsupported binary file format. Please choose a .txt, .md, .csv, or .html file."))
          return@OnActivityResult
        }
        val rawText = String(bytes, Charsets.UTF_8)
        val trimmed = if (rawText.length > 10_000) rawText.substring(0, 10_000) else rawText
        promise.resolve(mapOf("name" to displayName, "text" to trimmed))
      } catch (e: Exception) {
        promise.resolve(mapOf("error" to (e.message ?: "Failed to read selected file.")))
      }
    }

    AsyncFunction("pickModuleFile") { promise: expo.modules.kotlin.Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(mapOf("error" to "No active screen available to open file picker."))
        return@AsyncFunction
      }
      pendingFilePromise.getAndSet(promise)?.resolve(null)
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(
          Intent.EXTRA_MIME_TYPES,
          arrayOf("text/plain", "text/markdown", "text/csv", "text/html", "*/*"),
        )
      }
      try {
        activity.startActivityForResult(intent, pickModuleFileReq)
      } catch (e: Exception) {
        pendingFilePromise.set(null)
        promise.resolve(mapOf("error" to (e.message ?: "Unable to open document picker.")))
      }
    }

    Function("hasUsageAccess") { Perms.hasUsageAccess(ctx) }

    Function("openUsageAccessSettings") {
      // Some phones open straight to LearnShift's switch with the package URI.
      try {
        launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
      } catch (_: Exception) {
        launch(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
      }
    }

    Function("hasScrollAccess") { ScrollService.isEnabled(ctx) }
    Function("openScrollSettings") { launch(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }

    Function("canDrawOverlays") { Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx) }

    Function("openOverlaySettings") {
      launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")))
    }

    Function("isIgnoringBatteryOptimizations") {
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    Function("openBatterySettings") {
      try {
        @Suppress("BatteryLife")
        launch(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}")))
      } catch (_: Exception) {
        launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
    }

    Function("openAppSettings") {
      launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
    }

    Function("deviceBrand") { "${Build.MANUFACTURER}".lowercase() }

    /** True when break reminders can actually pop up on this phone. */
    Function("notificationsEnabled") { Notifier.breaksEnabled(ctx) }

    Function("openNotificationSettings") {
      try {
        launch(
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName),
        )
      } catch (_: Exception) {
        launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
      }
    }

    /** Saves the config and starts or stops the background monitor to match. */
    Function("configure") { json: String ->
      ScrollGate.clear()
      OverlayController.dismiss(ctx)
      Categories.clearCache()
      if (!JSONObject(json).optBoolean("enabled", false)) MonitorService.stop(ctx)
      Store.saveConfig(ctx, json)
      Store.putString(ctx, "watchedPkg", "")
      val cfg = Store.config(ctx)
      val canWatch = cfg.enabled && Perms.hasUsageAccess(ctx)
      if (canWatch) MonitorService.refresh(ctx, syncRemote = false) else {
        MonitorService.stop(ctx)
        LockdownController.dismiss(ctx)
      }
      MonitorService.running || canWatch
    }

    Function("isRunning") { MonitorService.running }

    /** The session happening right now (for the Home screen's live gauge and risk chip). */
    AsyncFunction("getLive") {
      if (!Perms.hasUsageAccess(ctx)) return@AsyncFunction null
      val live = Tracker(ctx).update(System.currentTimeMillis())
      mapOf(
        "category" to live.cat.js,
        "sessionMinutes" to live.sessionMin,
        "unlocksLastHour" to live.unlocksLastHour,
      )
    }

    /** Daily totals, today first. */
    AsyncFunction("getDays") { count: Int ->
      if (!Perms.hasUsageAccess(ctx)) {
        val todayDay = Days.key(java.util.Calendar.getInstance())
        val b = Store.breaksForDay(ctx, todayDay)
        val st = Store.studyBonusForDay(ctx, todayDay)
        return@AsyncFunction if (b > 0 || st > 0) {
          listOf(
            mapOf(
              "day" to todayDay,
              "total" to 0,
              "video" to 0,
              "social" to 0,
              "games" to 0,
              "study" to st,
              "breaks" to b,
              "late" to 0,
              "sessions" to 0,
              "unlocks" to 0,
              "offAt" to null,
            ),
          )
        } else {
          emptyList<Map<String, Any?>>()
        }
      }
      val cfg = Store.config(ctx)
      (0 until count.coerceIn(1, 14)).map { d ->
        val s = Days.summary(ctx, d, cfg)
        mapOf(
          "day" to s.day,
          "total" to s.total,
          "video" to s.video,
          "social" to s.social,
          "games" to s.games,
          "study" to (s.study + Store.studyBonusForDay(ctx, s.day)),
          "breaks" to Store.breaksForDay(ctx, s.day),
          "late" to s.late,
          "sessions" to s.sessions,
          "unlocks" to s.unlocks,
          "offAt" to s.offAt,
        )
      }
    }

    /** Sends queued events and today's totals now. */
    AsyncFunction("reportNow") {
      Reporter.report(ctx, Store.config(ctx), true)
    }

    /** Debug info for the in-app status screen. */
    Function("status") {
      val q = Store.queue(ctx)
      mapOf(
        "running" to MonitorService.running,
        "queued" to q.length(),
        "lastReport" to Store.getLong(ctx, "lastReport"),
        "lastNudge" to Store.getLong(ctx, "lastNudge"),
        "lastNotifyFailed" to Store.getLong(ctx, "lastNotifyFailed"),
        "notifications" to Notifier.breaksEnabled(ctx),
        "scrollAccess" to ScrollService.isEnabled(ctx),
        "awaitingSwipe" to ScrollGate.isArmed(),
      )
    }

    /** Shows a real learning-card overlay if overlay permission is enabled (no nudges). */
    Function("testNudge") { _: String ->
      if (!OverlayController.canOverlay(ctx)) return@Function false
      val cfg = Store.config(ctx)
      val label = Store.getString(ctx, "lastUsedLabel")?.takeIf { it.isNotBlank() } ?: "App"
      val pkg = Store.getString(ctx, "lastUsedPkg")?.takeIf { it.isNotBlank() }
      OverlayController.scheduleOverlay(ctx, cfg, label, pkg, 1, "quiz", 500L)
      true
    }

    /** Schedules a real white swipe-up feed card overlay over any active app. */
    Function("showOverlayNow") { appLabel: String, mode: String, delayMs: Int ->
      if (!OverlayController.canOverlay(ctx)) return@Function false
      MonitorService.start(ctx)
      val cfg = Store.config(ctx)
      val pkg = Store.getString(ctx, "lastUsedPkg")?.takeIf { it.isNotBlank() }
      OverlayController.scheduleOverlay(ctx, cfg, appLabel, pkg, 1, mode, delayMs.toLong())
      true
    }

    /** Returns directly to the last external app the student was using, or moves LearnShift to the background. */
    Function("returnToLastApp") {
      val targetPkg = Store.getString(ctx, "lastUsedPkg")?.takeIf { it.isNotBlank() }
        ?: Store.getString(ctx, "watchedPkg")?.takeIf { it.isNotBlank() }
        ?: runCatching { Tracker(ctx).update(System.currentTimeMillis()).pkg }.getOrNull()
      if (!targetPkg.isNullOrBlank() && targetPkg != ctx.packageName && targetPkg !in NOT_FREE_TIME) {
        val intent = ctx.packageManager.getLaunchIntentForPackage(targetPkg)
        if (intent != null) {
          val started = runCatching {
            launch(intent)
            true
          }.getOrDefault(false)
          if (started) return@Function true
        }
      }
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.moveTaskToBack(true)
        return@Function true
      }
      false
    }

    /** Label of the most recent external app being used (e.g. "TikTok", "YouTube"). */
    Function("lastUsedApp") {
      Store.getString(ctx, "lastUsedLabel") ?: ""
    }

    /** Launches a real installed app (or mobile web fallback) and arms a floating LearnShift overlay over it. */
    Function("launchProtectedApp") { pkg: String, appLabel: String, delaySeconds: Int ->
      val candidates = when (pkg) {
        "com.zhiliaoapp.musically" -> listOf(pkg, "com.ss.android.ugc.trill", "com.zhiliaoapp.musically.go")
        "com.facebook.katana" -> listOf(pkg, "com.facebook.lite")
        "com.instagram.android" -> listOf(pkg, "com.instagram.lite")
        "com.twitter.android" -> listOf(pkg)
        else -> listOf(pkg)
      }
      var resolvedPkg: String? = null
      var launchIntent: Intent? = null
      for (c in candidates) {
        val intent = ctx.packageManager.getLaunchIntentForPackage(c)
        if (intent != null) {
          resolvedPkg = c
          launchIntent = intent
          break
        }
      }
      if (launchIntent == null) {
        val url = when {
          pkg.contains("musically") -> "https://www.tiktok.com"
          pkg.contains("youtube") -> "https://m.youtube.com"
          pkg.contains("instagram") -> "https://www.instagram.com"
          pkg.contains("facebook") -> "https://m.facebook.com"
          pkg.contains("twitter") -> "https://x.com"
          pkg.contains("mobile.legends") -> "https://m.mobilelegends.com"
          else -> "https://www.google.com"
        }
        launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        resolvedPkg = "com.android.chrome"
      }
      val started = runCatching {
        launch(launchIntent)
        true
      }.getOrDefault(false)
      if (!started) return@Function false

      val finalPkg = resolvedPkg ?: pkg
      Store.putString(ctx, "watchedPkg", finalPkg)
      Store.putString(ctx, "lastUsedPkg", finalPkg)
      Store.putString(ctx, "lastUsedLabel", appLabel)
      Store.putLong(ctx, "watchedAt", System.currentTimeMillis())
      MonitorService.start(ctx)

      // Monitoring uses fresh foreground usage events; a delayed launcher task
      // must not arm a stale app after the student switches elsewhere.

      true
    }

    /** Opens Android Default Home App settings so LearnShift can act as the phone's launcher. */
    Function("openHomeSettings") {
      try {
        launch(Intent(Settings.ACTION_HOME_SETTINGS))
      } catch (_: Exception) {
        launch(Intent(Settings.ACTION_SETTINGS))
      }
    }

    Function("lastConfig") {
      val cfg = Store.config(ctx)
      JSONObject().put("enabled", cfg.enabled).put("grade", cfg.grade)
        .put("subject", cfg.subject).put("overlayIntervalSec", cfg.overlayIntervalSec).toString()
    }
  }
}
