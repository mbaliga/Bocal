package com.bocal.music.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class PracticeSession(
    val id: Long,
    val startedAtMs: Long,
    val durationSeconds: Int,
    val focus: String,
    val notes: String,
)

class PracticeRepository(context: Context) {
    private val preferences = context.getSharedPreferences("bocal-practice", Context.MODE_PRIVATE)

    fun sessions(): List<PracticeSession> {
        val source = preferences.getString(SESSIONS, "[]") ?: "[]"
        return runCatching {
            val array = JSONArray(source)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.getJSONObject(index)
                    add(
                        PracticeSession(
                            id = item.getLong("id"),
                            startedAtMs = item.getLong("startedAtMs"),
                            durationSeconds = item.getInt("durationSeconds"),
                            focus = item.optString("focus"),
                            notes = item.optString("notes"),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun finishSession(durationSeconds: Int, focus: String, notes: String): PracticeSession {
        val now = System.currentTimeMillis()
        val session = PracticeSession(
            id = now,
            startedAtMs = activeStartMs().takeIf { it > 0L } ?: now - durationSeconds * 1_000L,
            durationSeconds = durationSeconds.coerceAtLeast(1),
            focus = focus.trim().ifBlank { "General practice" },
            notes = notes.trim(),
        )
        val updated = (listOf(session) + sessions()).take(MAX_SESSIONS)
        val array = JSONArray()
        updated.forEach { item ->
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("startedAtMs", item.startedAtMs)
                    .put("durationSeconds", item.durationSeconds)
                    .put("focus", item.focus)
                    .put("notes", item.notes),
            )
        }
        preferences.edit().putString(SESSIONS, array.toString()).remove(ACTIVE_START).apply()
        return session
    }

    fun startSession(nowMs: Long = System.currentTimeMillis()) {
        preferences.edit().putLong(ACTIVE_START, nowMs).apply()
    }

    fun cancelSession() {
        preferences.edit().remove(ACTIVE_START).apply()
    }

    fun activeStartMs(): Long = preferences.getLong(ACTIVE_START, 0L)

    fun totalSeconds(): Int = sessions().sumOf { it.durationSeconds }

    companion object {
        private const val SESSIONS = "sessions-v1"
        private const val ACTIVE_START = "active-session-start"
        private const val MAX_SESSIONS = 50
    }
}
