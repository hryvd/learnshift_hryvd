package expo.modules.usagemonitor.mirror

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File

data class TopicImplicitStat(
  val topicTag: String,
  val alphaInterest: Float = 2.0f,
  val betaInterest: Float = 2.0f,
  val alphaStop: Float = 2.0f,
  val betaStop: Float = 2.0f,
)

data class DecelerationCard(
  val id: Int = 0,
  val topicTag: String,
  val title: String,
  val body: String,
  val badgeLabel: String,
)

data class PilotSessionLog(
  val id: Int = 0,
  val timestampEpochMs: Long,
  val targetAppCategory: String,
  val sessionMinutesBeforeTrigger: Int,
  val tierExecuted: String,
  val timeToScreenOffMs: Long? = null,
)

class LearnShiftOfflineDb private constructor(ctx: Context) :
  SQLiteOpenHelper(ctx.applicationContext, "learnshift_offline.db", null, 1) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE topic_implicit_stats (
        topicTag TEXT PRIMARY KEY,
        alphaInterest REAL NOT NULL DEFAULT 2.0,
        betaInterest REAL NOT NULL DEFAULT 2.0,
        alphaStop REAL NOT NULL DEFAULT 2.0,
        betaStop REAL NOT NULL DEFAULT 2.0
      )
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TABLE deceleration_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topicTag TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        badgeLabel TEXT NOT NULL
      )
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TABLE pilot_session_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestampEpochMs INTEGER NOT NULL,
        targetAppCategory TEXT NOT NULL,
        sessionMinutesBeforeTrigger INTEGER NOT NULL,
        tierExecuted TEXT NOT NULL,
        timeToScreenOffMs INTEGER
      )
      """.trimIndent(),
    )
    seedInitialBank(db)
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  private fun seedInitialBank(db: SQLiteDatabase) {
    val tags = listOf("SOIL_TAXONOMY", "TAX_ACCOUNTING", "PARLIAMENTARY_RULES", "WIND_DOWN_CHORE", "GRADE7_MATH_LOCAL")
    for (tag in tags) {
      db.insertWithOnConflict(
        "topic_implicit_stats",
        null,
        ContentValues().apply { put("topicTag", tag) },
        SQLiteDatabase.CONFLICT_IGNORE,
      )
    }

    val cards = listOf(
      DecelerationCard(
        topicTag = "SOIL_TAXONOMY",
        title = "Soil Horizons: The B-Horizon",
        body = "In USDA Soil Taxonomy, the B-horizon (subsoil) accumulates illuviated silicate clay, iron, aluminum, or humus leached down from the upper A-horizon over centuries.",
        badgeLabel = "Low-Stimulation • Soil Taxonomy",
      ),
      DecelerationCard(
        topicTag = "TAX_ACCOUNTING",
        title = "Straight-Line Depreciation Formula",
        body = "Annual Depreciation Expense equals (Historical Asset Cost minus Estimated Salvage Value) divided by Useful Life in Years under standard accrual accounting rules.",
        badgeLabel = "Low-Stimulation • Accounting",
      ),
      DecelerationCard(
        topicTag = "PARLIAMENTARY_RULES",
        title = "Motion to Lay on the Table",
        body = "Under standard parliamentary procedure, a motion to lay on the table temporarily suspends pending business without debate and requires a simple majority vote.",
        badgeLabel = "Low-Stimulation • Civic Rules",
      ),
      DecelerationCard(
        topicTag = "WIND_DOWN_CHORE",
        title = "10-Second Rest Checklist",
        body = "1. Plug in your charger.\n2. Check tomorrow's morning alarm.\n3. Lower screen brightness and rest your eyes.",
        badgeLabel = "Wind-Down • Micro-Chore",
      ),
      DecelerationCard(
        topicTag = "GRADE7_MATH_LOCAL",
        title = "Jeepney Fare Ratio Check",
        body = "If a Batangas-to-Lipa jeepney travels 24 km in 40 minutes, what is its average rate in kilometers per 10 minutes? (Answer: 6 km per 10 minutes.)",
        badgeLabel = "Quick Brain Reset • Grade 7 Math",
      ),
    )
    for (c in cards) {
      db.insert(
        "deceleration_cards",
        null,
        ContentValues().apply {
          put("topicTag", c.topicTag)
          put("title", c.title)
          put("body", c.body)
          put("badgeLabel", c.badgeLabel)
        },
      )
    }
  }

  fun getAllStats(): List<TopicImplicitStat> {
    val out = ArrayList<TopicImplicitStat>()
    readableDatabase.rawQuery("SELECT topicTag, alphaInterest, betaInterest, alphaStop, betaStop FROM topic_implicit_stats", null).use { c ->
      while (c.moveToNext()) {
        out.add(TopicImplicitStat(c.getString(0), c.getFloat(1), c.getFloat(2), c.getFloat(3), c.getFloat(4)))
      }
    }
    return out
  }

  fun incrementInterest(tag: String, delta: Float) {
    writableDatabase.execSQL("UPDATE topic_implicit_stats SET alphaInterest = alphaInterest + ? WHERE topicTag = ?", arrayOf(delta, tag))
  }

  fun incrementDisinterest(tag: String, delta: Float) {
    writableDatabase.execSQL("UPDATE topic_implicit_stats SET betaInterest = betaInterest + ? WHERE topicTag = ?", arrayOf(delta, tag))
  }

  fun incrementStoppingPower(tag: String, delta: Float) {
    writableDatabase.execSQL("UPDATE topic_implicit_stats SET alphaStop = alphaStop + ? WHERE topicTag = ?", arrayOf(delta, tag))
  }

  fun getCardsByTag(tag: String, limit: Int = 4): List<DecelerationCard> {
    val out = ArrayList<DecelerationCard>()
    readableDatabase.rawQuery(
      "SELECT id, topicTag, title, body, badgeLabel FROM deceleration_cards WHERE topicTag = ? LIMIT ?",
      arrayOf(tag, limit.toString()),
    ).use { c ->
      while (c.moveToNext()) {
        out.add(DecelerationCard(c.getInt(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4)))
      }
    }
    return out
  }

  fun getFallbackCards(limit: Int = 4): List<DecelerationCard> {
    val out = ArrayList<DecelerationCard>()
    readableDatabase.rawQuery(
      "SELECT id, topicTag, title, body, badgeLabel FROM deceleration_cards LIMIT ?",
      arrayOf(limit.toString()),
    ).use { c ->
      while (c.moveToNext()) {
        out.add(DecelerationCard(c.getInt(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4)))
      }
    }
    return out
  }

  fun insertPilotLog(log: PilotSessionLog) {
    writableDatabase.insert(
      "pilot_session_logs",
      null,
      ContentValues().apply {
        put("timestampEpochMs", log.timestampEpochMs)
        put("targetAppCategory", log.targetAppCategory)
        put("sessionMinutesBeforeTrigger", log.sessionMinutesBeforeTrigger)
        put("tierExecuted", log.tierExecuted)
        if (log.timeToScreenOffMs != null) put("timeToScreenOffMs", log.timeToScreenOffMs)
      },
    )
  }

  fun updateLatestScreenOff(ms: Long) {
    writableDatabase.execSQL(
      "UPDATE pilot_session_logs SET timeToScreenOffMs = ? WHERE id = (SELECT MAX(id) FROM pilot_session_logs)",
      arrayOf(ms),
    )
  }

  fun getAllLogs(): List<PilotSessionLog> {
    val out = ArrayList<PilotSessionLog>()
    readableDatabase.rawQuery(
      "SELECT id, timestampEpochMs, targetAppCategory, sessionMinutesBeforeTrigger, tierExecuted, timeToScreenOffMs FROM pilot_session_logs ORDER BY timestampEpochMs ASC",
      null,
    ).use { c ->
      while (c.moveToNext()) {
        out.add(
          PilotSessionLog(
            c.getInt(0),
            c.getLong(1),
            c.getString(2),
            c.getInt(3),
            c.getString(4),
            if (c.isNull(5)) null else c.getLong(5),
          ),
        )
      }
    }
    return out
  }

  companion object {
    @Volatile private var INSTANCE: LearnShiftOfflineDb? = null

    fun getInstance(context: Context): LearnShiftOfflineDb =
      INSTANCE ?: synchronized(this) {
        INSTANCE ?: LearnShiftOfflineDb(context).also { INSTANCE = it }
      }
  }
}

class PilotTelemetryRecorder(private val db: LearnShiftOfflineDb) {
  fun logInterventionTriggered(pkg: String, sessionMinutes: Int, tierExecuted: String) {
    val category = when {
      pkg.contains("musically") || pkg.contains("trill") -> "SHORT_FORM_VIDEO"
      pkg.contains("facebook") || pkg.contains("instagram") -> "SOCIAL_FEED"
      pkg.contains("youtube") -> "VIDEO_PLATFORM"
      else -> "OTHER_ENTERTAINMENT"
    }
    db.insertPilotLog(
      PilotSessionLog(
        timestampEpochMs = System.currentTimeMillis(),
        targetAppCategory = category,
        sessionMinutesBeforeTrigger = sessionMinutes,
        tierExecuted = tierExecuted,
      ),
    )
  }

  fun logSuccessfulScreenOff(timeToScreenOffMs: Long) {
    db.updateLatestScreenOff(timeToScreenOffMs)
  }

  fun exportAnonymizedCsv(context: Context): File {
    val rows = db.getAllLogs()
    val dir = context.getExternalFilesDir(null) ?: context.filesDir
    val outFile = File(dir, "learnshift_pilot_metrics.csv")
    outFile.bufferedWriter().use { writer ->
      writer.write("timestamp_ms,category,session_min_before_trigger,tier_executed,time_to_screen_off_ms\n")
      for (r in rows) {
        writer.write(
          "${r.timestampEpochMs},${r.targetAppCategory},${r.sessionMinutesBeforeTrigger},${r.tierExecuted},${r.timeToScreenOffMs ?: -1}\n",
        )
      }
    }
    return outFile
  }
}
