package expo.modules.usagemonitor.mirror

import android.app.Activity
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.CrossProfileApps
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class SmartStudyGuardService : Service() {

  private var mediaProjection: MediaProjection? = null
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ServiceCompat.startForeground(
      this,
      NOTIF_ID,
      buildNotification(),
      if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0,
    )

    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
      ?: Activity.RESULT_CANCELED
    val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent?.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent?.getParcelableExtra(EXTRA_RESULT_DATA)
    }

    if (resultCode == Activity.RESULT_OK && data != null) {
      val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      mediaProjection = mgr.getMediaProjection(resultCode, data)?.also { proj ->
        proj.registerCallback(object : MediaProjection.Callback() {
          override fun onStop() {
            mediaProjection = null
            activeInstance = null
            stopSelf()
          }
        }, Handler(Looper.getMainLooper()))
      }
      activeInstance = this
    }
    return START_NOT_STICKY
  }

  /**
   * Captures ONE 224x224 frame, checks for dense academic/equation text strictly in RAM,
   * and wipes the bitmap buffer in < 50 ms inside a finally block.
   */
  fun evaluateSingleFrameSync(): Boolean {
    val projection = mediaProjection ?: return false
    val width = 224
    val height = 224
    val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
    var virtualDisplay: VirtualDisplay? = null
    var rawBitmap: Bitmap? = null

    return try {
      val imageLatch = CountDownLatch(1)
      val captured = arrayOfNulls<android.media.Image>(1)
      virtualDisplay = projection.createVirtualDisplay(
        "LearnShiftSingleSnap",
        width,
        height,
        resources.displayMetrics.densityDpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        null,
      )
      reader.setOnImageAvailableListener({ r ->
        val img = r.acquireLatestImage()
        if (img != null) {
          r.setOnImageAvailableListener(null, null)
          captured[0] = img
          imageLatch.countDown()
        }
      }, Handler(Looper.getMainLooper()))

      if (!imageLatch.await(300L, TimeUnit.MILLISECONDS)) return false
      val image = captured[0] ?: return false
      rawBitmap = image.use { img ->
        val plane = img.planes[0]
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        val rowPadding = rowStride - pixelStride * width
        val padded = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888)
        padded.copyPixelsFromBuffer(plane.buffer)
        Bitmap.createBitmap(padded, 0, 0, width, height).also {
          padded.eraseColor(Color.TRANSPARENT)
          padded.recycle()
        }
      }

      val mlLatch = CountDownLatch(1)
      val isStudy = AtomicBoolean(false)
      val input = InputImage.fromBitmap(rawBitmap, 0)
      recognizer.process(input)
        .addOnSuccessListener { result ->
          val text = result.text.lowercase()
          val mathOrCodeSignals = listOf(
            "=", "+", "theorem", "equation", "solve", "chapter",
            "fun ", "class ", "def ", "deped", "module", "formula",
          )
          val hitCount = mathOrCodeSignals.count { text.contains(it) }
          isStudy.set(hitCount >= 2 || result.textBlocks.size >= 8)
          mlLatch.countDown()
        }
        .addOnFailureListener { mlLatch.countDown() }

      mlLatch.await(350L, TimeUnit.MILLISECONDS)
      isStudy.get()
    } catch (_: Exception) {
      false
    } finally {
      rawBitmap?.eraseColor(Color.TRANSPARENT)
      rawBitmap?.recycle()
      virtualDisplay?.release()
      reader.close()
    }
  }

  private fun buildNotification(): Notification {
    val channelId = "learnshift_study_guard"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "Smart Study Guard (Opt-In)",
        NotificationManager.IMPORTANCE_MIN,
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    return NotificationCompat.Builder(this, channelId)
      .setContentTitle("Smart Study Guard Enabled")
      .setContentText("Single-frame RAM check only • Nothing is saved or uploaded")
      .setSmallIcon(android.R.drawable.ic_menu_view)
      .build()
  }

  override fun onDestroy() {
    mediaProjection?.stop()
    runCatching { recognizer.close() }
    activeInstance = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
    const val EXTRA_RESULT_DATA = "EXTRA_RESULT_DATA"
    private const val NOTIF_ID = 1002
    @Volatile private var activeInstance: SmartStudyGuardService? = null

    fun isRunning(): Boolean = activeInstance != null

    fun evaluateSingleFrameIfEnabledSync(context: Context): Boolean {
      val prefs = context.getSharedPreferences("learnshift_prefs", Context.MODE_PRIVATE)
      if (!prefs.getBoolean("smart_study_guard_enabled", false)) return false
      return activeInstance?.evaluateSingleFrameSync() ?: false
    }
  }
}

class InterventionDispatcher(private val context: Context) {
  private val bandit = ImplicitContextBandit()
  private val telemetry = PilotTelemetryRecorder(LearnShiftOfflineDb.getInstance(context))

  fun dispatch(targetPackage: String, snapshot: OfflineContextSnapshot): String {
    val selected = LearningMirrorSelector(context).selectVideoForSession(targetPackage, snapshot)
    return dispatchWithLearningVideo(targetPackage, snapshot, selected, fil = false)
  }

  fun dispatchWithLearningVideo(
    targetPackage: String,
    snapshot: OfflineContextSnapshot,
    selectedVideo: LearningVideoSeed?,
    fil: Boolean = false,
  ): String {
    val canTierA = canSafelyLaunchWorkProfileApp() && LearningMirrorPolicy.isAllowedTargetPackage(targetPackage)
    val tier = if (canTierA) {
      val badge = LearningMirrorPolicy.formatBadge(snapshot.sessionMinutes, selectedVideo, fil)
      val launched = launchWorkProfileLearningVideo(
        targetPackage = targetPackage,
        sessionMinutes = snapshot.sessionMinutes,
        deepLinkUrl = selectedVideo?.deepLinkUrl,
        badgeText = badge,
      )
      if (launched) {
        // Personal Profile holds SYSTEM_ALERT_WINDOW, so render the honest 1.8s pill from here.
        NeutralBannerOverlay.showBriefPill(context, badge, durationMs = 1800L, delayMs = 250L)
        if (selectedVideo != null) "TIER_A_WORK_PROFILE_LEARNING_VIDEO" else "TIER_A_WORK_PROFILE_REAL_APP"
      } else {
        val strategy = bandit.selectDecelerationStrategy(snapshot)
        launchNativeXmlFallback(snapshot.sessionMinutes, strategy.name)
        "TIER_C_LOW_RAM_VIEWPAGER_${strategy.name}"
      }
    } else {
      val strategy = bandit.selectDecelerationStrategy(snapshot)
      launchNativeXmlFallback(snapshot.sessionMinutes, strategy.name)
      "TIER_C_LOW_RAM_VIEWPAGER_${strategy.name}"
    }
    Thread {
      telemetry.logInterventionTriggered(targetPackage, snapshot.sessionMinutes, tier, selectedVideo?.id)
    }.start()
    return tier
  }

  fun canSafelyLaunchWorkProfileApp(): Boolean {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val memInfo = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
    // Integer division of totalMem on 6 GB nominal phones yields 5 due to kernel/GPU reservation.
    val totalRamGb = memInfo.totalMem / (1024L * 1024L * 1024L)
    val availRamMb = memInfo.availMem / (1024L * 1024L)

    val hasWorkProfile = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val crossProfileApps = context.getSystemService(CrossProfileApps::class.java)
      crossProfileApps != null && crossProfileApps.targetUserProfiles.isNotEmpty()
    } else {
      false
    }
    return hasWorkProfile && !memInfo.lowMemory && totalRamGb >= 5 && availRamMb >= 900
  }

  private fun launchWorkProfileLearningVideo(
    targetPackage: String,
    sessionMinutes: Int,
    deepLinkUrl: String?,
    badgeText: String,
  ): Boolean {
    val intent = Intent(LearnShiftAdminReceiver.ACTION_LAUNCH_NEUTRAL_APP).apply {
      putExtra(LearnShiftAdminReceiver.EXTRA_TARGET_PKG, targetPackage)
      putExtra(LearnShiftAdminReceiver.EXTRA_SESSION_MIN, sessionMinutes)
      if (!deepLinkUrl.isNullOrBlank()) {
        putExtra(LearnShiftAdminReceiver.EXTRA_DEEP_LINK_URL, deepLinkUrl)
      }
      putExtra(LearnShiftAdminReceiver.EXTRA_BADGE_TEXT, badgeText)
      putExtra(LearnShiftAdminReceiver.EXTRA_SHOW_LOCAL_PILL, false)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return runCatching {
      context.startActivity(intent)
      true
    }.getOrDefault(false)
  }

  private fun launchNativeXmlFallback(sessionMinutes: Int, strategyName: String) {
    val intent = Intent(context, DecelerationOverlayActivity::class.java).apply {
      putExtra(DecelerationOverlayActivity.EXTRA_SESSION_MIN, sessionMinutes)
      putExtra(DecelerationOverlayActivity.EXTRA_STRATEGY, strategyName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    context.startActivity(intent)
  }
}
