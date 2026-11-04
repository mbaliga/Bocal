package com.bocal.music.widget

import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * The practice summary the web app hands the shell through
 * `bocalHost.publishWidgetSnapshot` (built by web-source/app/widget-snapshot.ts).
 * It holds only what a home screen may show: per-day minutes, the newest log
 * rows by type and length, the instrument, A4 and the songs marked Studying.
 */
data class WidgetSnapshot(
    val publishedAt: Instant,
    val weeklyGoalMinutes: Int,
    val days: List<DayTotal>,
    val recent: List<RecentActivity>,
    val lastPulseAt: Instant?,
    val instrument: InstrumentInfo,
    val tuning: TuningInfo,
    val songs: Songs,
)

data class DayTotal(val date: LocalDate, val seconds: Long, val pulseSeconds: Long, val timerSeconds: Long)

data class RecentActivity(val type: ActivityType, val seconds: Long, val capturedAt: Instant)

data class InstrumentInfo(
    val id: String,
    val name: String,
    val shortName: String,
    val family: String,
    val pitchLabel: String,
    val writtenOffset: Int,
    val labLabel: String,
    val labStatus: String,
    /** The chart's own review badge text, or null when the instrument has no chart. */
    val review: String?,
)

data class TuningInfo(val referenceHz: Double, val temperament: String)

data class StudyingSong(val title: String, val progress: Int)

data class Songs(val studying: List<StudyingSong>, val studyingCount: Int, val wishlistCount: Int)

/** The practice log's activity types, as `PracticeActivityType` in web-source/app/practice-data.ts. */
enum class ActivityType(val code: String) {
    TUNING("tuning"),
    FINGERING("fingering"),
    RHYTHM("rhythm"),
    CHORDS("chords"),
    ANALYSIS("analysis"),
    REPERTOIRE("repertoire"),
    SESSION("session"),
    VOCAL("vocal"),
    ;

    companion object {
        fun parse(code: Any?): ActivityType? = entries.firstOrNull { it.code == code }
    }
}

/** Text that came from the page, made safe for one line of a home-screen widget. */
object WidgetText {
    /** True for characters that must never reach a widget: controls, and the invisible format and direction marks. */
    private fun isHidden(codePoint: Int): Boolean {
        val type = Character.getType(codePoint)
        return type == Character.CONTROL.toInt() ||
            type == Character.FORMAT.toInt() ||
            type == Character.LINE_SEPARATOR.toInt() ||
            type == Character.PARAGRAPH_SEPARATOR.toInt() ||
            type == Character.SURROGATE.toInt()
    }

    /** No hidden characters, single spaces, trimmed, at most [max] code points (never half a surrogate pair). */
    fun clean(raw: String, max: Int): String {
        val visible = StringBuilder(raw.length)
        var index = 0
        while (index < raw.length) {
            val codePoint = raw.codePointAt(index)
            index += Character.charCount(codePoint)
            if (isHidden(codePoint) || Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)) {
                visible.append(' ')
            } else {
                visible.appendCodePoint(codePoint)
            }
        }
        val collapsed = visible.toString().trim().replace(Regex(" +"), " ")
        if (collapsed.codePointCount(0, collapsed.length) <= max) return collapsed
        return collapsed.substring(0, collapsed.offsetByCodePoints(0, max)).trimEnd()
    }

    /** Wraps text the user typed in first-strong isolates, so a right-to-left title can't reorder the words around it. */
    fun isolate(text: String): String = "\u2068$text\u2069"
}

/**
 * Reads and validates a snapshot. Anything off-spec rejects the whole
 * snapshot (null), so the widgets keep showing the last good one rather than
 * a half-read one; numbers are clamped to sane ranges and text is cleaned.
 */
object WidgetSnapshotParser {
    const val SCHEMA_VERSION = 1
    const val MAX_JSON_CHARS = 64 * 1024
    const val MAX_DAYS = 14
    const val MAX_RECENT = 5
    const val MAX_SONGS = 3

    /** 1 January 2000 to 1 January 2200: a timestamp outside this is a bug, not a practice session. */
    private const val EARLIEST_MILLIS = 946_684_800_000L
    private const val LATEST_MILLIS = 7_258_118_400_000L
    private const val MAX_SECONDS = 10_000_000L
    private val INSTRUMENT_ID = Regex("[a-z][a-z-]{0,39}")

    private class Invalid(message: String) : Exception(message)

    fun parse(json: String?): WidgetSnapshot? {
        if (json == null || json.length > MAX_JSON_CHARS) return null
        return try {
            read(MiniJson.parse(json))
        } catch (_: MiniJson.ParseException) {
            null
        } catch (_: Invalid) {
            null
        }
    }

    private fun read(root: Any?): WidgetSnapshot {
        val obj = root.asObject("snapshot")
        if (obj["schemaVersion"].asNumber("schemaVersion") != SCHEMA_VERSION.toDouble()) throw Invalid("schemaVersion")
        val daysRaw = obj["days"].asList("days")
        if (daysRaw.isEmpty() || daysRaw.size > MAX_DAYS) throw Invalid("days")
        val days = daysRaw.map { readDay(it.asObject("day")) }
        if (days.map { it.date }.toSet().size != days.size) throw Invalid("duplicate day")
        val recent = obj["recent"].asList("recent").take(MAX_RECENT * 4).mapNotNull { readRecent(it.asObject("recent row")) }.take(MAX_RECENT)
        val lastPulse = obj["lastPulseAt"]
        return WidgetSnapshot(
            publishedAt = obj["publishedAt"].asInstant("publishedAt"),
            weeklyGoalMinutes = obj["weeklyGoalMinutes"].asWhole("weeklyGoalMinutes", 1, 10_080),
            days = days.sortedBy { it.date },
            recent = recent,
            lastPulseAt = if (lastPulse == null) null else lastPulse.asInstant("lastPulseAt"),
            instrument = readInstrument(obj["instrument"].asObject("instrument")),
            tuning = readTuning(obj["tuning"].asObject("tuning")),
            songs = readSongs(obj["songs"].asObject("songs")),
        )
    }

    private fun readDay(day: Map<String, Any?>): DayTotal {
        val date = try {
            LocalDate.parse(day["date"].asString("date"))
        } catch (_: DateTimeParseException) {
            throw Invalid("date")
        }
        return DayTotal(
            date = date,
            seconds = day["seconds"].asSeconds("seconds"),
            pulseSeconds = day["pulseSeconds"].asSeconds("pulseSeconds"),
            timerSeconds = day["timerSeconds"].asSeconds("timerSeconds"),
        )
    }

    /** An unknown activity type is skipped, not fatal: a newer page may log a type this shell has no word for. */
    private fun readRecent(row: Map<String, Any?>): RecentActivity? {
        val type = ActivityType.parse(row["type"]) ?: return null
        return RecentActivity(type, row["seconds"].asSeconds("seconds"), row["capturedAt"].asInstant("capturedAt"))
    }

    private fun readInstrument(raw: Map<String, Any?>): InstrumentInfo {
        val id = raw["id"].asString("id")
        if (!INSTRUMENT_ID.matches(id)) throw Invalid("instrument id")
        val review = raw["review"]
        return InstrumentInfo(
            id = id,
            name = raw["name"].asText("name", 60),
            shortName = raw["shortName"].asText("shortName", 30),
            family = raw["family"].asText("family", 30),
            pitchLabel = raw["pitchLabel"].asText("pitchLabel", 8),
            writtenOffset = raw["writtenOffset"].asWhole("writtenOffset", -48, 48),
            labLabel = raw["labLabel"].asText("labLabel", 20),
            labStatus = raw["labStatus"].asText("labStatus", 120),
            review = if (review == null) null else review.asText("review", 120),
        )
    }

    private fun readTuning(raw: Map<String, Any?>): TuningInfo {
        val hz = raw["referenceHz"].asNumber("referenceHz")
        if (hz < 300.0 || hz > 600.0) throw Invalid("referenceHz")
        return TuningInfo(hz, raw["temperament"].asText("temperament", 40))
    }

    private fun readSongs(raw: Map<String, Any?>): Songs {
        val studying = raw["studying"].asList("studying").take(MAX_SONGS * 4).mapNotNull { entry ->
            val song = entry.asObject("song")
            val title = WidgetText.clean(song["title"].asString("title"), 100)
            if (title.isEmpty()) null else StudyingSong(title, song["progress"].asNumber("progress").coerceIn(0.0, 100.0).let { Math.round(it).toInt() })
        }.take(MAX_SONGS)
        val studyingCount = raw["studyingCount"].asWhole("studyingCount", 0, 10_000)
        return Songs(
            studying = studying,
            studyingCount = maxOf(studyingCount, studying.size),
            wishlistCount = raw["wishlistCount"].asWhole("wishlistCount", 0, 10_000),
        )
    }

    @Suppress("UNCHECKED_CAST")
    private fun Any?.asObject(name: String): Map<String, Any?> = this as? Map<String, Any?> ?: throw Invalid(name)

    private fun Any?.asList(name: String): List<Any?> = this as? List<Any?> ?: throw Invalid(name)

    private fun Any?.asString(name: String): String = this as? String ?: throw Invalid(name)

    private fun Any?.asNumber(name: String): Double = (this as? Double)?.takeIf { it.isFinite() } ?: throw Invalid(name)

    private fun Any?.asText(name: String, max: Int): String {
        val text = WidgetText.clean(asString(name), max)
        if (text.isEmpty()) throw Invalid(name)
        return text
    }

    private fun Any?.asWhole(name: String, min: Int, max: Int): Int {
        val value = asNumber(name)
        if (value != Math.rint(value) || value < min || value > max) throw Invalid(name)
        return value.toInt()
    }

    private fun Any?.asSeconds(name: String): Long = Math.round(asNumber(name).coerceIn(0.0, MAX_SECONDS.toDouble()))

    private fun Any?.asInstant(name: String): Instant {
        val millis = asNumber(name)
        if (millis < EARLIEST_MILLIS || millis > LATEST_MILLIS) throw Invalid(name)
        return Instant.ofEpochMilli(millis.toLong())
    }
}
