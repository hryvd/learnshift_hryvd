package expo.modules.usagemonitor.mirror

import android.content.Context
import org.json.JSONArray
import java.util.zip.CRC32

/**
 * Loads the offline curated learning video catalog from Android assets into
 * LearnShiftOfflineDb. Tracks a byte checksum so future catalog expansions
 * upsert seamlessly without resetting per-video LRU rotation history.
 */
object LearningSeedAssetLoader {
  private const val ASSET_FILE = "learning_video_seeds.json"
  private const val PREFS_NAME = "learnshift_prefs"
  private const val PREF_CATALOG_SIG = "learning_video_catalog_sig"

  @Synchronized
  fun ensureSeeded(context: Context, db: LearnShiftOfflineDb): Int {
    val appCtx = context.applicationContext
    val bytes = runCatching {
      appCtx.assets.open(ASSET_FILE).use { it.readBytes() }
    }.getOrNull() ?: return db.countLearningSeeds()

    val crc = CRC32().apply { update(bytes) }
    val signature = "${crc.value}:${bytes.size}"
    val prefs = appCtx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val existingCount = db.countLearningSeeds()
    if (existingCount > 0 && prefs.getString(PREF_CATALOG_SIG, null) == signature) {
      return existingCount
    }

    val parsed = ArrayList<LearningVideoSeed>()
    runCatching {
      val array = JSONArray(String(bytes, Charsets.UTF_8))
      for (i in 0 until array.length()) {
        val obj = array.optJSONObject(i) ?: continue
        val deepLinkUrl = obj.optString("deepLinkUrl", "").trim()
        if (!LearningMirrorPolicy.isAllowedDeepLink(deepLinkUrl)) continue
        val id = obj.optString("id", "").trim()
        val pkg = obj.optString("androidPackage", "").trim()
        if (id.isEmpty() || pkg.isEmpty()) continue
        parsed.add(
          LearningVideoSeed(
            id = id,
            platform = obj.optString("platform", "YOUTUBE"),
            androidPackage = pkg,
            creatorName = obj.optString("creatorName", ""),
            titleOrTopic = obj.optString("titleOrTopic", ""),
            subjectTag = obj.optString("subjectTag", "GRADE7_MATH"),
            depedCompetency = obj.optString("depedCompetency", ""),
            pacingMode = obj.optString("pacingMode", "ACTIVE_LEARNING_HOOK"),
            language = obj.optString("language", "English"),
            durationSeconds = obj.optInt("durationSeconds", 60),
            deepLinkUrl = deepLinkUrl,
            whyThisAppearedBadge = obj.optString("whyThisAppearedBadge", "Learning Feed"),
          ),
        )
      }
    }

    if (parsed.isNotEmpty()) {
      db.upsertLearningSeeds(parsed)
      prefs.edit().putString(PREF_CATALOG_SIG, signature).apply()
    }
    return db.countLearningSeeds()
  }
}
