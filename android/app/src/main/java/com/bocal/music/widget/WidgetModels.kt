package com.bocal.music.widget

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale
import kotlin.math.floor

/** Bocal's home-screen widgets. Each one has its own provider class and its own layouts. */
enum class WidgetKind {
    THIS_WEEK,
    TUNE,
    STUDYING,
    LOG,
    PULSE,
    INSTRUMENT,
}

/**
 * The three layouts every widget has. Each class applies from its minimum
 * size up; on Android 12+ these are the keys of the size map the launcher
 * picks from, and below that [forSize] picks from the reported widget size.
 *
 * The minimum heights are the natural heights of the tallest layout of that
 * class at font scale 1.0 (12 dp padding top and bottom, 48 dp pads), so a
 * layout is only chosen where it fits. A widget one row tall (about 102 dp in
 * portrait) therefore gets the small single summary, and a 4x2 widget in
 * portrait (about 276 x 220 dp) gets the large layout.
 */
enum class SizeClass(val minWidthDp: Float, val minHeightDp: Float) {
    /** About 2x1 or 2x2 cells, or one row of any width: one tappable summary, no extra controls. */
    SMALL(40f, 40f),

    /** About 3x2 cells, or 4x2 and 4x3 in landscape. */
    MEDIUM(200f, 140f),

    /** About 4x2 cells in portrait, or taller. */
    LARGE(250f, 210f),
    ;

    companion object {
        fun forSize(widthDp: Float, heightDp: Float): SizeClass = when {
            widthDp >= LARGE.minWidthDp && heightDp >= LARGE.minHeightDp -> LARGE
            widthDp >= MEDIUM.minWidthDp && heightDp >= MEDIUM.minHeightDp -> MEDIUM
            else -> SMALL
        }

        /** Below Android 12 a launcher may report no size at all; then the provider's default size is assumed. */
        fun forReportedSize(widthDp: Int, heightDp: Int, fallback: SizeClass): SizeClass =
            if (widthDp <= 0 || heightDp <= 0) fallback else forSize(widthDp.toFloat(), heightDp.toFloat())

        /**
         * Below Android 12, the layouts for each orientation from the launcher's
         * reported options. `MIN_WIDTH` and `MAX_HEIGHT` are the portrait size,
         * `MAX_WIDTH` and `MIN_HEIGHT` the landscape one (the platform's own
         * guidance), so a 4x2 widget in portrait is not drawn for its landscape height.
         */
        fun forOrientations(minWidthDp: Int, minHeightDp: Int, maxWidthDp: Int, maxHeightDp: Int, fallback: SizeClass): Orientations =
            Orientations(
                portrait = forReportedSize(minWidthDp, maxHeightDp, fallback),
                landscape = forReportedSize(maxWidthDp, minHeightDp, fallback),
            )
    }
}

/** The layout for each orientation, below Android 12 (the launcher swaps them without waking Bocal). */
data class Orientations(val portrait: SizeClass, val landscape: SizeClass)

/** A length of practice, worded like the Practice screen's `minuteLabel`. */
sealed interface DurationLabel {
    data object None : DurationLabel

    data object UnderAMinute : DurationLabel

    data class Minutes(val minutes: Int) : DurationLabel

    data class HoursMinutes(val hours: Int, val minutes: Int) : DurationLabel
}

object WidgetMath {
    /** `Math.round(seconds / 60)` as the web app does it, for non-negative seconds. */
    fun roundedMinutes(seconds: Long): Int = ((maxOf(0L, seconds) + 30L) / 60L).toInt()

    fun durationLabel(seconds: Long): DurationLabel {
        if (seconds <= 0) return DurationLabel.None
        val minutes = roundedMinutes(seconds)
        return when {
            minutes < 1 -> DurationLabel.UnderAMinute
            minutes < 60 -> DurationLabel.Minutes(minutes)
            else -> DurationLabel.HoursMinutes(minutes / 60, minutes % 60)
        }
    }

    /** Today and the six days before it, oldest first: the Practice screen's "this week". */
    fun window(today: LocalDate): List<LocalDate> = (6L downTo 0L).map { today.minusDays(it) }

    /** The goal ring's percentage: `min(100, round(minutes / max(1, goal) * 100))`. */
    fun goalPercent(minutes: Int, goalMinutes: Int): Int =
        minOf(100, floor(minutes.toDouble() / maxOf(1, goalMinutes) * 100.0 + 0.5).toInt())

    /** "440" or "442.5": a reference pitch with a decimal only when it has one. */
    fun formatHz(hz: Double, locale: Locale): String {
        val tenths = Math.round(hz * 10.0)
        return if (tenths % 10L == 0L) String.format(locale, "%d", tenths / 10L) else String.format(locale, "%.1f", tenths / 10.0)
    }
}

data class DayMinutes(val date: LocalDate, val minutes: Int, val practised: Boolean)

data class WeekSummary(
    val minutes: Int,
    val goalMinutes: Int,
    val percent: Int,
    val goalMet: Boolean,
    val activeDays: Int,
    val days: List<DayMinutes>,
    val timerMinutes: Int,
)

data class PulseSummary(val seconds: Long, val lastPulseAt: Instant?)

/**
 * How current a snapshot is. Bocal only publishes while it runs, so every
 * widget that can lapse prints when its data was taken; past a day it says so.
 */
data class Freshness(val sameDay: Boolean, val stale: Boolean)

sealed interface StudyingContent {
    /** Nothing saved in the repertoire card at all. */
    data object Empty : StudyingContent

    /** Songs on the wishlist, none marked Studying. */
    data class WishlistOnly(val wishlistCount: Int) : StudyingContent

    data class Studying(
        val songs: List<StudyingSong>,
        val moreStudying: Int,
        val wishlistCount: Int,
        val titlesHidden: Boolean,
    ) : StudyingContent
}

/** How an instrument's written notes sit against concert pitch. */
sealed interface Transposition {
    data object Concert : Transposition

    data class WrittenAbove(val semitones: Int) : Transposition

    data class WrittenBelow(val semitones: Int) : Transposition

    companion object {
        fun of(writtenOffset: Int): Transposition = when {
            writtenOffset > 0 -> WrittenAbove(writtenOffset)
            writtenOffset < 0 -> WrittenBelow(-writtenOffset)
            else -> Concert
        }
    }
}

/** What a widget can draw: nothing published yet, a stored summary that can't be read, or a summary. */
sealed interface WidgetState {
    data object FirstRun : WidgetState

    data object Unreadable : WidgetState

    data class Ready(val snapshot: WidgetSnapshot) : WidgetState
}

object WidgetModels {
    const val STALE_AFTER_HOURS = 24L

    /**
     * Minutes over the seven days ending [today], recomputed from per-day
     * totals, so a widget drawn days after Bocal was last opened shows the
     * right window (with nothing logged since, which is the truth: practice
     * is only logged inside Bocal).
     */
    fun week(snapshot: WidgetSnapshot, today: LocalDate): WeekSummary {
        val byDate = snapshot.days.associateBy { it.date }
        val window = WidgetMath.window(today)
        val inWindow = window.mapNotNull { byDate[it] }
        val minutes = WidgetMath.roundedMinutes(inWindow.sumOf { it.seconds })
        val goal = snapshot.weeklyGoalMinutes
        return WeekSummary(
            minutes = minutes,
            goalMinutes = goal,
            percent = WidgetMath.goalPercent(minutes, goal),
            goalMet = minutes >= goal,
            activeDays = inWindow.count { it.seconds > 0 },
            days = window.map { date ->
                val seconds = byDate[date]?.seconds ?: 0L
                DayMinutes(date, WidgetMath.roundedMinutes(seconds), seconds > 0)
            },
            timerMinutes = WidgetMath.roundedMinutes(inWindow.sumOf { it.timerSeconds }),
        )
    }

    fun pulse(snapshot: WidgetSnapshot, today: LocalDate): PulseSummary {
        val window = WidgetMath.window(today).toSet()
        val seconds = snapshot.days.filter { it.date in window }.sumOf { it.pulseSeconds }
        return PulseSummary(seconds, snapshot.lastPulseAt)
    }

    fun freshness(publishedAt: Instant, now: Instant, zone: ZoneId): Freshness = Freshness(
        sameDay = publishedAt.atZone(zone).toLocalDate() == now.atZone(zone).toLocalDate(),
        stale = Duration.between(publishedAt, now) > Duration.ofHours(STALE_AFTER_HOURS),
    )

    /**
     * `android:minWidth` x `android:minHeight` in each provider's
     * `res/xml/widget_*_info.xml`, in dp. A unit test reads the XML and checks
     * these, so the two cannot drift apart.
     */
    fun declaredMinSize(kind: WidgetKind): Pair<Int, Int> = when (kind) {
        WidgetKind.TUNE -> 110 to 110
        WidgetKind.LOG -> 250 to 180
        WidgetKind.THIS_WEEK, WidgetKind.STUDYING, WidgetKind.PULSE, WidgetKind.INSTRUMENT -> 250 to 110
    }

    /**
     * The layout for an old launcher that reports no size: the one that fits
     * the provider's declared minimum, which the widget always has at its
     * default size. Never a layout that might be clipped.
     */
    fun defaultSize(kind: WidgetKind): SizeClass {
        val (width, height) = declaredMinSize(kind)
        return SizeClass.forSize(width.toFloat(), height.toFloat())
    }

    /** Where a tap on the widget itself lands. */
    fun primaryDestination(kind: WidgetKind): WidgetDestination = when (kind) {
        WidgetKind.THIS_WEEK -> WidgetDestination.PRACTICE
        WidgetKind.TUNE -> WidgetDestination.TUNE
        WidgetKind.STUDYING -> WidgetDestination.PRACTICE_SONGS
        WidgetKind.LOG -> WidgetDestination.PRACTICE_LOG
        WidgetKind.PULSE -> WidgetDestination.PULSE_METRONOME
        WidgetKind.INSTRUMENT -> WidgetDestination.LAB
    }

    /** Pending-intent slots per widget: the widget itself, up to four pads, and the title toggle. */
    const val SLOT_ROOT = 0
    const val SLOT_TOGGLE = 5
    private const val SLOTS = 8

    /** A request code no other widget or slot shares, so one widget's pending intent never replaces another's. */
    fun requestCode(widgetId: Int, slot: Int): Int {
        require(slot in 0 until SLOTS) { "slot $slot" }
        return widgetId * SLOTS + slot
    }

    /**
     * The seven bars of "This week", as progress against a shared maximum.
     * The scale never drops below 24 minutes (as on the Practice screen), so
     * one short day doesn't fill the chart, and a day with any practice at all
     * shows at least a sliver.
     */
    fun dayBars(days: List<DayMinutes>): Pair<Int, List<Int>> {
        val max = maxOf(24, days.maxOfOrNull { it.minutes } ?: 0)
        val sliver = maxOf(1, max / 25)
        return max to days.map { if (it.practised) maxOf(it.minutes, sliver) else 0 }
    }

    /** How many rows a list widget shows at each size: one, three, five. */
    fun logRowsFor(size: SizeClass): Int = when (size) {
        SizeClass.SMALL -> 1
        SizeClass.MEDIUM -> 3
        SizeClass.LARGE -> 5
    }

    fun songsFor(size: SizeClass): Int = if (size == SizeClass.LARGE) 3 else 1

    fun log(snapshot: WidgetSnapshot, size: SizeClass): List<RecentActivity> =
        snapshot.recent.sortedByDescending { it.capturedAt }.take(logRowsFor(size))

    fun studying(snapshot: WidgetSnapshot, size: SizeClass, titlesHidden: Boolean): StudyingContent {
        val songs = snapshot.songs
        if (songs.studying.isEmpty()) {
            return if (songs.wishlistCount > 0) StudyingContent.WishlistOnly(songs.wishlistCount) else StudyingContent.Empty
        }
        val shown = songs.studying.take(songsFor(size))
        return StudyingContent.Studying(
            songs = shown,
            moreStudying = maxOf(0, songs.studyingCount - shown.size),
            wishlistCount = songs.wishlistCount,
            titlesHidden = titlesHidden,
        )
    }

    /** The midnight after [now] in [zone], plus a minute's margin: when "this week" next moves. */
    fun nextDayBoundary(now: Instant, zone: ZoneId): Instant =
        now.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().plusSeconds(60)

    /** When a summary published at [publishedAt] turns stale (see [freshness]), plus a minute's margin. */
    fun staleBoundary(publishedAt: Instant): Instant =
        publishedAt.plus(Duration.ofHours(STALE_AFTER_HOURS)).plusSeconds(60)

    /**
     * When the widgets next need a redraw with no new data: the earlier of
     * the next local midnight ("the last seven days" and the as-of wording
     * move on) and the moment the stored summary turns stale, once that is
     * still ahead. [publishedAt] is null when nothing readable is stored.
     */
    fun nextRedraw(now: Instant, zone: ZoneId, publishedAt: Instant?): Instant {
        val midnight = nextDayBoundary(now, zone)
        val stale = publishedAt?.let { staleBoundary(it) }
        return if (stale != null && stale.isAfter(now) && stale.isBefore(midnight)) stale else midnight
    }
}
