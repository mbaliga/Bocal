package com.bocal.music.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class PracticeSession(
    val startedAt: String,
    val seconds: Int,
    val instrument: String,
    val inTunePercent: Int?,
)

class PracticeStore(context: Context) {
    private val preferences = context.getSharedPreferences("bocal.practice.v1", Context.MODE_PRIVATE)

    fun addSession(session: PracticeSession) {
        val sessions = JSONArray(preferences.getString(SESSIONS, "[]"))
        val updated = JSONArray().put(
            JSONObject()
                .put("startedAt", session.startedAt)
                .put("seconds", session.seconds)
                .put("instrument", session.instrument)
                .put("inTunePercent", session.inTunePercent ?: JSONObject.NULL),
        )
        for (index in 0 until minOf(sessions.length(), 99)) updated.put(sessions.get(index))
        preferences.edit().putString(SESSIONS, updated.toString()).apply()
    }

    fun sessions(): List<PracticeSession> {
        val source = runCatching { JSONArray(preferences.getString(SESSIONS, "[]")) }.getOrDefault(JSONArray())
        return buildList {
            for (index in 0 until source.length()) {
                val item = source.optJSONObject(index) ?: continue
                add(
                    PracticeSession(
                        startedAt = item.optString("startedAt", Instant.EPOCH.toString()),
                        seconds = item.optInt("seconds"),
                        instrument = item.optString("instrument", "Alto saxophone"),
                        inTunePercent = if (item.isNull("inTunePercent")) null else item.optInt("inTunePercent"),
                    ),
                )
            }
        }
    }

    fun lessonNote(): String = preferences.getString(LESSON, "") ?: ""
    fun saveLessonNote(value: String) = preferences.edit().putString(LESSON, value).apply()
    fun clearSessions() = preferences.edit().remove(SESSIONS).apply()

    companion object {
        private const val SESSIONS = "sessions"
        private const val LESSON = "lesson"
    }
}
