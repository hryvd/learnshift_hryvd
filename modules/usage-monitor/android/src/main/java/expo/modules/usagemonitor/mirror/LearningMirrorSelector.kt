package expo.modules.usagemonitor.mirror

import android.content.Context
import android.net.Uri
import expo.modules.usagemonitor.Config
import expo.modules.usagemonitor.Schedule
import expo.modules.usagemonitor.Store
import java.util.Calendar
import java.util.Locale

/**
 * Shared security allowlists, regional/Lite package normalization, and
 * transparent badge formatting for Option C Learning Video Mirror.
 */
object LearningMirrorPolicy {
  const val PKG_YOUTUBE = "com.google.android.youtube"
  const val PKG_TIKTOK = "com.zhiliaoapp.musically"
  const val PKG_TIKTOK_ASIA = "com.ss.android.ugc.trill"
  const val PKG_TIKTOK_LITE = "com.zhiliaoapp.musically.go"
  const val PKG_FACEBOOK = "com.facebook.katana"
  const val PKG_FACEBOOK_LITE = "com.facebook.lite"
  const val PKG_INSTAGRAM = "com.instagram.android"
  const val PKG_INSTAGRAM_LITE = "com.instagram.lite"

  private val ALLOWED_HOSTS = setOf(
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.tiktok.com",
    "tiktok.com",
    "m.tiktok.com",
    "www.facebook.com",
    "facebook.com",
    "m.facebook.com",
    "www.instagram.com",
    "instagram.com",
  )

  private val REDUNDANT_BADGE_PREFIX = Regex("^scroll\\s*break\\s*[•·-]\\s*", RegexOption.IGNORE_CASE)

  fun normalizePackageName(pkg: String?): String? = when (pkg?.trim()) {
    PKG_YOUTUBE -> PKG_YOUTUBE
    PKG_TIKTOK, PKG_TIKTOK_ASIA, PKG_TIKTOK_LITE -> PKG_TIKTOK
    PKG_FACEBOOK, PKG_FACEBOOK_LITE -> PKG_FACEBOOK
    PKG_INSTAGRAM, PKG_INSTAGRAM_LITE -> PKG_INSTAGRAM
    else -> null
  }

  fun isAllowedTargetPackage(pkg: String?): Boolean = normalizePackageName(pkg) != null

  fun packageCandidatesFor(requestedPkg: String): List<String> = when (normalizePackageName(requestedPkg)) {
    PKG_TIKTOK -> listOf(requestedPkg, PKG_TIKTOK, PKG_TIKTOK_ASIA, PKG_TIKTOK_LITE).distinct()
    PKG_FACEBOOK -> listOf(requestedPkg, PKG_FACEBOOK, PKG_FACEBOOK_LITE).distinct()
    PKG_INSTAGRAM -> listOf(requestedPkg, PKG_INSTAGRAM, PKG_INSTAGRAM_LITE).distinct()
    PKG_YOUTUBE -> listOf(PKG_YOUTUBE)
    else -> listOf(requestedPkg)
  }

  fun isAllowedDeepLink(url: String?): Boolean {
    if (url.isNullOrBlank()) return false
    val uri = runCatching { Uri.parse(url.trim()) }.getOrNull() ?: return false
    val scheme = uri.scheme?.lowercase(Locale.US) ?: return false
    val host = uri.host?.lowercase(Locale.US) ?: return false
    return scheme == "https" && host in ALLOWED_HOSTS
  }

  fun mapSubjectToSeedTag(subject: String?): String? = when (subject?.lowercase(Locale.US)) {
    "math" -> "GRADE7_MATH"
    "science" -> "SCIENCE"
    "english" -> "ENGLISH"
    "araling-panlipunan" -> "PH_HISTORY"
    else -> null
  }

  fun formatBadge(sessionMinutes: Int, video: LearningVideoSeed?, fil: Boolean = false): String {
    val mins = sessionMinutes.coerceAtLeast(1)
    val prefix = if (fil) "${mins}m pahinga" else "${mins}m break"
    val cleaned = video?.whyThisAppearedBadge?.trim()
      ?.replace(REDUNDANT_BADGE_PREFIX, "")
      ?.trim()
      .orEmpty()
    val suffix = cleaned.ifEmpty { "Learning Feed Mode" }
    return "$prefix · $suffix"
  }
}

/**
 * Selects a verified, offline-cached learning video or educational creator page
 * matching the exact foreground platform the student is scrolling, adapted to
 * bedtime/posture, session duration, subject preference, and LRU rotation.
 */
class LearningMirrorSelector(
  private val context: Context,
  private val db: LearnShiftOfflineDb = LearnShiftOfflineDb.getInstance(context),
) {
  fun ensureCatalogSeeded(): Int = LearningSeedAssetLoader.ensureSeeded(context, db)

  fun selectVideoForSession(
    activeForegroundPackage: String,
    snapshot: OfflineContextSnapshot,
    cfg: Config? = null,
  ): LearningVideoSeed? {
    val canonicalPkg = LearningMirrorPolicy.normalizePackageName(activeForegroundPackage) ?: return null
    LearningSeedAssetLoader.ensureSeeded(context, db)

    val effectiveCfg = cfg ?: Store.config(context)
    val cal = Calendar.getInstance()
    val clock = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    val inConfiguredBedtime =
      Schedule.inWindow(clock, effectiveCfg.bedtimeStart, effectiveCfg.bedtimeEnd) &&
        Schedule.bedtimeApplies(effectiveCfg, clock)

    val desiredMode = when {
      snapshot.posture == DoomscrollPosture.SUPINE_BEDTIME ||
        inConfiguredBedtime ||
        snapshot.hourOfDay >= 22 ||
        snapshot.hourOfDay <= 4 -> "LOW_STIM_DECELERATION"
      snapshot.sessionMinutes >= 35 -> "DEEP_LESSON"
      else -> "ACTIVE_LEARNING_HOOK"
    }

    val preferredSubject = LearningMirrorPolicy.mapSubjectToSeedTag(effectiveCfg.subject)
    val chosen = db.getNextLearningVideo(canonicalPkg, desiredMode, preferredSubject)
      ?: db.getNextLearningVideoAnyMode(canonicalPkg, preferredSubject)

    if (chosen != null) {
      db.markLearningVideoShown(chosen.id, System.currentTimeMillis())
    }
    return chosen
  }
}
