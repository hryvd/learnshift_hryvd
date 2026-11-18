package expo.modules.usagemonitor

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

/** Settings the app pushes down (bedtime, lock, language, server details). */
data class Config(
  val enabled: Boolean,
  val url: String,
  val key: String,
  val deviceToken: String,
  val lang: String,
  val bedtimeStart: Int,
  val bedtimeEnd: Int,
  val bedtimeDays: String,
  val lockEnabled: Boolean,
  val lockStart: Int,
  val lockEnd: Int,
  val unlockUntil: Long,
  val paused: Boolean,
  val focusUntil: Long,
  val rootSkill: String,
  val rootSkillName: String,
  val guardianName: String,
  /** Guardian limits in minutes of non-stop use (0 = off). */
  val scrollLimit: Int,
  val gamesLimit: Int,
  /** How often (seconds) cross-app overlays appear while another app is open. */
  val overlayIntervalSec: Int,
  /** Watch all non-study installed apps instead of only preset categories. */
  val monitorAllApps: Boolean,
  val grade: Int,
  val subject: String,
) {
  val fil get() = lang == "fil"

  companion object {
    fun from(o: JSONObject) = Config(
      enabled = o.optBoolean("enabled", false),
      url = o.optString("url", ""),
      key = o.optString("key", ""),
      deviceToken = o.optString("deviceToken", ""),
      lang = o.optString("lang", "en"),
      bedtimeStart = o.optInt("bedtimeStart", 1320),
      bedtimeEnd = o.optInt("bedtimeEnd", 360),
      bedtimeDays = o.optString("bedtimeDays", "school"),
      lockEnabled = o.optBoolean("lockEnabled", false),
      lockStart = o.optInt("lockStart", 1320),
      lockEnd = o.optInt("lockEnd", 360),
      unlockUntil = o.optLong("unlockUntil", 0L),
      paused = o.optBoolean("paused", false),
      focusUntil = o.optLong("focusUntil", 0L),
      rootSkill = o.optString("rootSkill", "fractions"),
      rootSkillName = o.optString("rootSkillName", "Fractions"),
      guardianName = o.optString("guardianName", ""),
      scrollLimit = o.optInt("scrollLimit", 0),
      gamesLimit = o.optInt("gamesLimit", 0),
      overlayIntervalSec = o.optInt("overlayIntervalSec", 15).coerceIn(10, 3600),
      monitorAllApps = o.optBoolean("monitorAllApps", false),
      grade = o.optInt("grade", 1).coerceIn(1, 10),
      subject = o.optString("subject", "mixed"),
    )
  }
}

/** Small persistent state: config, cooldowns and the outgoing event queue. */
object Store {
  private const val PREFS = "learnshift_monitor"

  private fun prefs(ctx: Context): SharedPreferences =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private const val CONFIG_KEY = "config_encrypted"
  private const val KEY_ALIAS = "learnshift_monitor_config"

  private fun encryptionKey(): SecretKey {
    val keys = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keys.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }

  @Synchronized
  fun config(ctx: Context): Config = runCatching {
    val prefs = prefs(ctx)
    val encoded = prefs.getString(CONFIG_KEY, null)
    val json = if (encoded != null) {
      val parts = encoded.split(':', limit = 2)
      require(parts.size == 2)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
      String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    } else {
      // Upgrade old installations before returning their credentials to the monitor.
      val legacy = prefs.getString("config", "{}") ?: "{}"
      if (prefs.contains("config")) saveConfig(ctx, legacy)
      legacy
    }
    Config.from(JSONObject(json))
  }.getOrElse { Config.from(JSONObject()) } // Unavailable keys disable monitoring/reporting.

  @Synchronized
  fun saveConfig(ctx: Context, json: String) {
    JSONObject(json) // reject malformed configuration before replacing anything
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
    val encrypted = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
      Base64.encodeToString(cipher.doFinal(json.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    check(prefs(ctx).edit().putString(CONFIG_KEY, encrypted).remove("config").commit())
  }

  fun getLong(ctx: Context, key: String, def: Long = 0L) = prefs(ctx).getLong(key, def)
  fun putLong(ctx: Context, key: String, v: Long) = prefs(ctx).edit().putLong(key, v).apply()
  fun getString(ctx: Context, key: String) = prefs(ctx).getString(key, null)
  fun putString(ctx: Context, key: String, v: String) = prefs(ctx).edit().putString(key, v).apply()

  // ── Event queue (nudges waiting to be reported) ──

  @Synchronized
  fun queue(ctx: Context): JSONArray =
    runCatching { JSONArray(prefs(ctx).getString("queue", "[]") ?: "[]") }.getOrDefault(JSONArray())

  /** Adds or replaces an event by client_id. Keeps the newest 100. */
  @Synchronized
  fun enqueue(ctx: Context, ev: JSONObject) {
    val q = queue(ctx)
    val out = JSONArray()
    val id = ev.optString("client_id")
    for (i in 0 until q.length()) {
      val e = q.optJSONObject(i) ?: continue
      if (e.optString("client_id") != id) out.put(e)
    }
    out.put(ev)
    val trimmed = JSONArray()
    val start = maxOf(0, out.length() - 100)
    for (i in start until out.length()) trimmed.put(out.get(i))
    prefs(ctx).edit().putString("queue", trimmed.toString()).apply()
  }

  @Synchronized
  fun findEvent(ctx: Context, id: String): JSONObject? {
    val q = queue(ctx)
    for (i in 0 until q.length()) {
      val e = q.optJSONObject(i) ?: continue
      if (e.optString("client_id") == id) return e
    }
    return null
  }

  /** Drops events that were sent, unless they changed since (e.g. a later snooze). */
  @Synchronized
  fun removeSent(ctx: Context, sent: Map<String, String>) {
    val q = queue(ctx)
    val out = JSONArray()
    for (i in 0 until q.length()) {
      val e = q.optJSONObject(i) ?: continue
      if (sent[e.optString("client_id")] != e.toString()) out.put(e)
    }
    prefs(ctx).edit().putString("queue", out.toString()).apply()
  }
}
