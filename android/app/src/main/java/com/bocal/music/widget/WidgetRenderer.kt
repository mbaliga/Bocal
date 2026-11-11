package com.bocal.music.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.text.format.DateUtils
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import androidx.annotation.LayoutRes
import androidx.annotation.StringRes
import com.bocal.music.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.TextStyle
import java.util.Date
import java.util.Locale

/**
 * Draws one widget as [RemoteViews]. On Android 12+ it hands the launcher
 * all three sizes at once (the launcher picks as the user resizes, without
 * waking Bocal); below that it draws the size the launcher reports for each
 * orientation, and the launcher swaps them when the phone turns.
 * Every number comes from [WidgetModels]; this file only words and places it.
 *
 * The clickable root carries no content description of its own, so TalkBack
 * reads the text actually drawn (the review badge, the as-of and stale lines,
 * each log row, a title or "Song title hidden"). Pads and the eye toggle are
 * separate tap targets with their own descriptions.
 */
object WidgetRenderer {
    fun render(
        context: Context,
        kind: WidgetKind,
        widgetId: Int,
        state: WidgetState,
        titlesHidden: Boolean,
        options: Bundle?,
    ): RemoteViews {
        val env = Env(context, widgetId, Instant.now(), ZoneId.systemDefault())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val sizes = SizeClass.entries.associate { size ->
                SizeF(size.minWidthDp, size.minHeightDp) to draw(env, kind, state, titlesHidden, size)
            }
            return RemoteViews(sizes)
        }
        val sizes = SizeClass.forOrientations(
            minWidthDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0,
            minHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) ?: 0,
            maxWidthDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH) ?: 0,
            maxHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0,
            fallback = WidgetModels.defaultSize(kind),
        )
        val portrait = draw(env, kind, state, titlesHidden, sizes.portrait)
        if (sizes.landscape == sizes.portrait) return portrait
        return RemoteViews(draw(env, kind, state, titlesHidden, sizes.landscape), portrait)
    }

    private fun draw(env: Env, kind: WidgetKind, state: WidgetState, titlesHidden: Boolean, size: SizeClass): RemoteViews = when (state) {
        WidgetState.FirstRun -> message(env, kind, size, R.string.widget_first_run_title, R.string.widget_first_run_body)
        WidgetState.Unreadable -> message(env, kind, size, R.string.widget_error_title, R.string.widget_error_body)
        is WidgetState.Ready -> when (kind) {
            WidgetKind.THIS_WEEK -> week(env, state.snapshot, size)
            WidgetKind.TUNE -> tune(env, state.snapshot, size)
            WidgetKind.STUDYING -> studying(env, state.snapshot, size, titlesHidden)
            WidgetKind.LOG -> log(env, state.snapshot, size)
            WidgetKind.PULSE -> pulse(env, state.snapshot, size)
            WidgetKind.INSTRUMENT -> instrument(env, state.snapshot, size)
        }
    }

    private fun message(env: Env, kind: WidgetKind, size: SizeClass, @StringRes title: Int, @StringRes body: Int): RemoteViews =
        env.views(R.layout.widget_message).apply {
            setTextViewText(R.id.widget_kicker, env.string(nameOf(kind)))
            setTextViewText(R.id.widget_title, env.string(title))
            setTextViewText(R.id.widget_body, env.string(body))
            setViewVisibility(R.id.widget_body, if (size == SizeClass.SMALL) View.GONE else View.VISIBLE)
            env.openOnTap(this, WidgetModels.primaryDestination(kind))
        }

    private fun week(env: Env, snapshot: WidgetSnapshot, size: SizeClass): RemoteViews {
        val week = WidgetModels.week(snapshot, env.today)
        val freshness = WidgetModels.freshness(snapshot.publishedAt, env.now, env.zone)
        val asOf = env.asOf(snapshot.publishedAt, freshness)
        if (size == SizeClass.SMALL) {
            return env.views(R.layout.widget_week_small).apply {
                setTextViewText(R.id.widget_value, env.string(R.string.widget_week_small, week.minutes, week.goalMinutes))
                // "42 / 60 min" would be read as "42 slash 60"; TalkBack gets it in words.
                setContentDescription(
                    R.id.widget_value,
                    env.context.resources.getQuantityString(R.plurals.widget_week_value_description, week.goalMinutes, week.minutes, week.goalMinutes),
                )
                setProgressBar(R.id.widget_progress, 100, week.percent, false)
                val meta = when {
                    freshness.stale -> asOf
                    week.goalMet -> env.string(R.string.widget_week_goal_met)
                    else -> env.string(R.string.widget_week_name)
                }
                setTextViewText(R.id.widget_meta, meta)
                env.openOnTap(this, WidgetDestination.PRACTICE)
            }
        }
        val layout = if (size == SizeClass.LARGE) R.layout.widget_week_large else R.layout.widget_week_medium
        return env.views(layout).apply {
            setTextViewText(R.id.widget_value, week.minutes.toString())
            setTextViewText(R.id.widget_goal, env.string(R.string.widget_week_of_goal, week.goalMinutes))
            setProgressBar(R.id.widget_progress, 100, week.percent, false)
            val progress = if (week.goalMet) env.string(R.string.widget_week_goal_met) else env.string(R.string.widget_week_percent, week.percent)
            val days = env.context.resources.getQuantityString(R.plurals.widget_week_active_days, week.activeDays, week.activeDays)
            setTextViewText(R.id.widget_caption, env.string(R.string.widget_join, progress, days))
            if (size == SizeClass.LARGE) {
                val (max, bars) = WidgetModels.dayBars(week.days)
                week.days.forEachIndexed { index, day ->
                    setProgressBar(DAY_BARS[index], max, bars[index], false)
                    setTextViewText(DAY_LABELS[index], day.date.dayOfWeek.getDisplayName(TextStyle.NARROW, env.locale))
                }
                setContentDescription(
                    R.id.widget_chart,
                    week.days.joinToString(", ") { day ->
                        env.string(R.string.widget_week_day, day.date.dayOfWeek.getDisplayName(TextStyle.FULL, env.locale), env.duration(day.minutes * 60L))
                    },
                )
                val footer = if (week.timerMinutes > 0) {
                    env.string(R.string.widget_join, env.string(R.string.widget_week_timer, env.duration(week.timerMinutes * 60L)), asOf)
                } else {
                    asOf
                }
                setTextViewText(R.id.widget_footer, footer)
            } else {
                setTextViewText(R.id.widget_footer, asOf)
            }
            env.openOnTap(this, WidgetDestination.PRACTICE)
        }
    }

    private fun tune(env: Env, snapshot: WidgetSnapshot, size: SizeClass): RemoteViews {
        val instrument = snapshot.instrument
        val hz = WidgetMath.formatHz(snapshot.tuning.referenceHz, env.locale)
        if (size == SizeClass.SMALL) {
            return env.views(R.layout.widget_tune_small).apply {
                setTextViewText(R.id.widget_title, instrument.shortName)
                setTextViewText(R.id.widget_body, env.string(R.string.widget_tune_reference_short, hz))
                env.openOnTap(this, WidgetDestination.TUNE)
            }
        }
        val layout = if (size == SizeClass.LARGE) R.layout.widget_tune_large else R.layout.widget_tune_medium
        return env.views(layout).apply {
            setTextViewText(R.id.widget_title, instrument.name)
            setTextViewText(
                R.id.widget_body,
                env.string(
                    R.string.widget_join,
                    env.string(R.string.widget_tune_reference, hz),
                    env.string(R.string.widget_tune_temperament, snapshot.tuning.temperament),
                ),
            )
            setTextViewText(R.id.widget_meta, env.transposition(instrument))
            if (size == SizeClass.LARGE) {
                setTextViewText(R.id.widget_footer, env.string(R.string.widget_tune_mic))
                env.pad(this, R.id.pad_1, 1, WidgetDestination.TUNE, env.string(R.string.widget_pad_tuner_description))
                env.pad(this, R.id.pad_2, 2, WidgetDestination.TUNE_TONE, env.string(R.string.widget_pad_tone_description))
                setTextViewText(R.id.pad_3, instrument.labLabel)
                env.pad(this, R.id.pad_3, 3, WidgetDestination.LAB, env.string(R.string.widget_pad_lab_description, instrument.labLabel))
            }
            env.openOnTap(this, WidgetDestination.TUNE)
        }
    }

    private fun studying(env: Env, snapshot: WidgetSnapshot, size: SizeClass, titlesHidden: Boolean): RemoteViews {
        val layout = when (size) {
            SizeClass.SMALL -> R.layout.widget_studying_small
            SizeClass.MEDIUM -> R.layout.widget_studying_medium
            SizeClass.LARGE -> R.layout.widget_studying_large
        }
        val views = env.views(layout)
        val content = WidgetModels.studying(snapshot, size, titlesHidden)
        val freshness = WidgetModels.freshness(snapshot.publishedAt, env.now, env.zone)
        val asOf = env.asOf(snapshot.publishedAt, freshness)
        // Titles show only on a widget the user has told to show them; a small widget (no eye) follows that setting.
        fun title(song: StudyingSong) = if (titlesHidden) env.string(R.string.widget_studying_hidden) else WidgetText.isolate(song.title)
        val showToggle = size != SizeClass.SMALL && content is StudyingContent.Studying
        if (size != SizeClass.SMALL) {
            views.setViewVisibility(R.id.widget_toggle, if (showToggle) View.VISIBLE else View.GONE)
            if (showToggle) {
                views.setImageViewResource(R.id.widget_toggle, if (titlesHidden) R.drawable.widget_icon_eye_off else R.drawable.widget_icon_eye)
                views.setContentDescription(R.id.widget_toggle, env.string(if (titlesHidden) R.string.widget_studying_show else R.string.widget_studying_hide))
                views.setOnClickPendingIntent(R.id.widget_toggle, BocalWidgets.toggleTitlesIntent(env.context, env.widgetId))
            }
        }
        when (content) {
            StudyingContent.Empty, is StudyingContent.WishlistOnly -> {
                val (heading, body) = if (content is StudyingContent.WishlistOnly) {
                    env.string(R.string.widget_studying_none_title) to
                        env.context.resources.getQuantityString(R.plurals.widget_studying_wishlist, content.wishlistCount, content.wishlistCount)
                } else {
                    env.string(R.string.widget_studying_empty_title) to env.string(R.string.widget_studying_empty_body)
                }
                views.setTextViewText(R.id.widget_title, heading)
                views.setTextViewText(R.id.widget_meta, if (freshness.stale && size != SizeClass.LARGE) asOf else body)
                if (size == SizeClass.LARGE) SONG_ROWS.forEach { views.setViewVisibility(it.row, View.GONE) } else views.setViewVisibility(R.id.widget_progress, View.GONE)
            }
            is StudyingContent.Studying -> {
                val first = content.songs.first()
                val extras = buildList {
                    if (content.moreStudying > 0) add(env.context.resources.getQuantityString(R.plurals.widget_studying_more, content.moreStudying, content.moreStudying))
                    if (size == SizeClass.LARGE && content.wishlistCount > 0) {
                        add(env.context.resources.getQuantityString(R.plurals.widget_studying_wishlist, content.wishlistCount, content.wishlistCount))
                    }
                }
                if (size == SizeClass.LARGE) {
                    views.setViewVisibility(R.id.widget_title, View.GONE)
                    SONG_ROWS.forEachIndexed { index, row ->
                        val song = content.songs.getOrNull(index)
                        views.setViewVisibility(row.row, if (song == null) View.GONE else View.VISIBLE)
                        if (song != null) {
                            views.setTextViewText(row.title, title(song))
                            views.setTextViewText(row.percent, env.string(R.string.widget_studying_percent, song.progress))
                            views.setProgressBar(row.bar, 100, song.progress, false)
                            views.setContentDescription(row.row, env.string(R.string.widget_studying_row, title(song), song.progress))
                        }
                    }
                    views.setTextViewText(R.id.widget_meta, extras.reduceOrNull { left, right -> env.string(R.string.widget_join, left, right) } ?: "")
                } else {
                    views.setTextViewText(R.id.widget_title, title(first))
                    views.setProgressBar(R.id.widget_progress, 100, first.progress, false)
                    val marked = env.string(R.string.widget_studying_marked, first.progress)
                    val meta = when {
                        // No room for an as-of line at these sizes: once the summary is old, that is what the line says.
                        freshness.stale -> asOf
                        size == SizeClass.MEDIUM && extras.isNotEmpty() -> env.string(R.string.widget_join, marked, extras.first())
                        else -> marked
                    }
                    views.setTextViewText(R.id.widget_meta, meta)
                }
            }
        }
        if (size == SizeClass.LARGE) views.setTextViewText(R.id.widget_footer, asOf)
        env.openOnTap(views, WidgetDestination.PRACTICE_SONGS)
        return views
    }

    private fun log(env: Env, snapshot: WidgetSnapshot, size: SizeClass): RemoteViews {
        val rows = WidgetModels.log(snapshot, size)
        if (size == SizeClass.SMALL) {
            return env.views(R.layout.widget_log_small).apply {
                val row = rows.firstOrNull()
                if (row == null) {
                    setTextViewText(R.id.widget_title, env.string(R.string.widget_log_name))
                    setTextViewText(R.id.widget_meta, env.string(R.string.widget_log_empty_short))
                } else {
                    setTextViewText(R.id.widget_title, env.string(R.string.widget_join, env.activity(row.type), env.duration(row.seconds)))
                    setTextViewText(R.id.widget_meta, env.moment(row.capturedAt))
                }
                env.openOnTap(this, WidgetDestination.PRACTICE_LOG)
            }
        }
        val layout = if (size == SizeClass.LARGE) R.layout.widget_log_large else R.layout.widget_log_medium
        val slots = LOG_ROWS.take(WidgetModels.logRowsFor(size))
        return env.views(layout).apply {
            setViewVisibility(R.id.widget_body, if (rows.isEmpty()) View.VISIBLE else View.GONE)
            setTextViewText(R.id.widget_body, env.string(R.string.widget_log_empty))
            slots.forEachIndexed { index, slot ->
                val row = rows.getOrNull(index)
                setViewVisibility(slot.row, if (row == null) View.GONE else View.VISIBLE)
                if (row != null) {
                    val type = env.activity(row.type)
                    val length = env.duration(row.seconds)
                    val time = env.moment(row.capturedAt)
                    setTextViewText(slot.type, type)
                    setTextViewText(slot.length, length)
                    setTextViewText(slot.time, time)
                    setContentDescription(slot.row, env.string(R.string.widget_log_row, type, length, time))
                }
            }
            val freshness = WidgetModels.freshness(snapshot.publishedAt, env.now, env.zone)
            setTextViewText(R.id.widget_footer, env.string(R.string.widget_log_footer, env.asOf(snapshot.publishedAt, freshness)))
            env.openOnTap(this, WidgetDestination.PRACTICE_LOG)
        }
    }

    private fun pulse(env: Env, snapshot: WidgetSnapshot, size: SizeClass): RemoteViews {
        val pulse = WidgetModels.pulse(snapshot, env.today)
        val week = env.string(R.string.widget_pulse_week, env.duration(pulse.seconds))
        val freshness = WidgetModels.freshness(snapshot.publishedAt, env.now, env.zone)
        val asOf = env.asOf(snapshot.publishedAt, freshness)
        if (size == SizeClass.SMALL) {
            return env.views(R.layout.widget_pulse_small).apply {
                // No room for an as-of line: once the summary is old, the stale line replaces the minutes.
                setTextViewText(R.id.widget_meta, if (freshness.stale) asOf else week)
                env.openOnTap(this, WidgetDestination.PULSE_METRONOME)
            }
        }
        val layout = if (size == SizeClass.LARGE) R.layout.widget_pulse_large else R.layout.widget_pulse_medium
        return env.views(layout).apply {
            setTextViewText(R.id.widget_body, week)
            setTextViewText(R.id.widget_footer, asOf)
            env.pad(this, R.id.pad_1, 1, WidgetDestination.PULSE_METRONOME, env.string(R.string.widget_pad_metronome_description))
            env.pad(this, R.id.pad_2, 2, WidgetDestination.PULSE_SEQUENCES, env.string(R.string.widget_pad_sequences_description))
            if (size == SizeClass.LARGE) {
                val last = pulse.lastPulseAt
                setTextViewText(R.id.widget_meta, if (last == null) env.string(R.string.widget_pulse_none) else env.string(R.string.widget_pulse_last, env.moment(last)))
                env.pad(this, R.id.pad_3, 3, WidgetDestination.PULSE_DRONE, env.string(R.string.widget_pad_drone_description))
                env.pad(this, R.id.pad_4, 4, WidgetDestination.TUNE, env.string(R.string.widget_pad_tuner_description))
            }
            env.openOnTap(this, WidgetDestination.PULSE_METRONOME)
        }
    }

    private fun instrument(env: Env, snapshot: WidgetSnapshot, size: SizeClass): RemoteViews {
        val instrument = snapshot.instrument
        if (size == SizeClass.SMALL) {
            return env.views(R.layout.widget_instrument_small).apply {
                setTextViewText(R.id.widget_title, instrument.name)
                // The review badge is never dropped; at this size it is worded short.
                val meta = if (instrument.review != null) env.string(R.string.widget_instrument_review_short) else instrument.labLabel
                setTextViewText(R.id.widget_meta, meta)
                env.openOnTap(this, WidgetDestination.LAB)
            }
        }
        val layout = if (size == SizeClass.LARGE) R.layout.widget_instrument_large else R.layout.widget_instrument_medium
        return env.views(layout).apply {
            setTextViewText(R.id.widget_kicker, instrument.family)
            setTextViewText(R.id.widget_title, instrument.name)
            setTextViewText(R.id.widget_body, env.string(R.string.widget_instrument_lab, instrument.labLabel, instrument.labStatus))
            val review = instrument.review
            setViewVisibility(R.id.widget_meta, if (review == null) View.GONE else View.VISIBLE)
            if (review != null) setTextViewText(R.id.widget_meta, env.string(R.string.widget_instrument_review, review))
            if (size == SizeClass.LARGE) {
                setTextViewText(R.id.widget_footer, env.transposition(instrument))
                setTextViewText(R.id.pad_1, instrument.labLabel)
                env.pad(this, R.id.pad_1, 1, WidgetDestination.LAB, env.string(R.string.widget_pad_lab_description, instrument.labLabel))
                env.pad(this, R.id.pad_2, 2, WidgetDestination.TUNE, env.string(R.string.widget_pad_tuner_description))
            }
            env.openOnTap(this, WidgetDestination.LAB)
        }
    }

    private fun nameOf(kind: WidgetKind): Int = when (kind) {
        WidgetKind.THIS_WEEK -> R.string.widget_week_name
        WidgetKind.TUNE -> R.string.widget_tune_name
        WidgetKind.STUDYING -> R.string.widget_studying_name
        WidgetKind.LOG -> R.string.widget_log_name
        WidgetKind.PULSE -> R.string.widget_pulse_name
        WidgetKind.INSTRUMENT -> R.string.widget_instrument_name
    }

    /** Per-draw context: the widget, the clock and the wording helpers. */
    private class Env(val context: Context, val widgetId: Int, val now: Instant, val zone: ZoneId) {
        val locale: Locale = context.resources.configuration.locales[0] ?: Locale.getDefault()
        val today: LocalDate = now.atZone(zone).toLocalDate()

        fun views(@LayoutRes layout: Int) = RemoteViews(context.packageName, layout)

        fun string(@StringRes id: Int, vararg args: Any): String = context.getString(id, *args)

        /**
         * The whole widget opens [destination]. Deliberately no content
         * description on the root: TalkBack then reads every line drawn inside it.
         */
        fun openOnTap(views: RemoteViews, destination: WidgetDestination) {
            views.setOnClickPendingIntent(android.R.id.background, BocalWidgets.openIntent(context, widgetId, WidgetModels.SLOT_ROOT, destination))
        }

        fun pad(views: RemoteViews, id: Int, slot: Int, destination: WidgetDestination, description: String) {
            views.setOnClickPendingIntent(id, BocalWidgets.openIntent(context, widgetId, slot, destination))
            views.setContentDescription(id, description)
        }

        fun duration(seconds: Long): String = when (val label = WidgetMath.durationLabel(seconds)) {
            DurationLabel.None -> string(R.string.widget_duration_none)
            DurationLabel.UnderAMinute -> string(R.string.widget_duration_under_minute)
            is DurationLabel.Minutes -> string(R.string.widget_duration_minutes, label.minutes)
            is DurationLabel.HoursMinutes -> string(R.string.widget_duration_hours_minutes, label.hours, label.minutes)
        }

        fun activity(type: ActivityType): String = string(
            when (type) {
                ActivityType.TUNING -> R.string.widget_activity_tuning
                ActivityType.FINGERING -> R.string.widget_activity_fingering
                ActivityType.RHYTHM -> R.string.widget_activity_rhythm
                ActivityType.CHORDS -> R.string.widget_activity_chords
                ActivityType.ANALYSIS -> R.string.widget_activity_analysis
                ActivityType.REPERTOIRE -> R.string.widget_activity_repertoire
                ActivityType.SESSION -> R.string.widget_activity_session
                ActivityType.VOCAL -> R.string.widget_activity_vocal
            },
        )

        fun transposition(instrument: InstrumentInfo): String = when (val t = Transposition.of(instrument.writtenOffset)) {
            Transposition.Concert -> string(R.string.widget_tune_concert)
            is Transposition.WrittenAbove ->
                context.resources.getQuantityString(R.plurals.widget_tune_written_above, t.semitones, instrument.pitchLabel, t.semitones)
            is Transposition.WrittenBelow ->
                context.resources.getQuantityString(R.plurals.widget_tune_written_below, t.semitones, instrument.pitchLabel, t.semitones)
        }

        /** The time for today, otherwise the date (the user's 12/24-hour setting and locale). */
        fun moment(instant: Instant): String =
            if (instant.atZone(zone).toLocalDate() == today) time(instant) else date(instant)

        fun asOf(publishedAt: Instant, freshness: Freshness): String = when {
            freshness.stale -> string(R.string.widget_stale, date(publishedAt))
            freshness.sameDay -> string(R.string.widget_as_of, time(publishedAt))
            else -> string(R.string.widget_as_of, date(publishedAt))
        }

        private fun time(instant: Instant): String = DateFormat.getTimeFormat(context).format(Date(instant.toEpochMilli()))

        private fun date(instant: Instant): String = DateUtils.formatDateTime(
            context,
            instant.toEpochMilli(),
            DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_NO_YEAR or DateUtils.FORMAT_ABBREV_MONTH,
        )
    }

    private class LogRow(val row: Int, val type: Int, val length: Int, val time: Int)

    private class SongRow(val row: Int, val title: Int, val percent: Int, val bar: Int)

    private val DAY_BARS = intArrayOf(R.id.day_bar_0, R.id.day_bar_1, R.id.day_bar_2, R.id.day_bar_3, R.id.day_bar_4, R.id.day_bar_5, R.id.day_bar_6)
    private val DAY_LABELS = intArrayOf(R.id.day_label_0, R.id.day_label_1, R.id.day_label_2, R.id.day_label_3, R.id.day_label_4, R.id.day_label_5, R.id.day_label_6)
    private val LOG_ROWS = listOf(
        LogRow(R.id.row_1, R.id.row_1_type, R.id.row_1_length, R.id.row_1_time),
        LogRow(R.id.row_2, R.id.row_2_type, R.id.row_2_length, R.id.row_2_time),
        LogRow(R.id.row_3, R.id.row_3_type, R.id.row_3_length, R.id.row_3_time),
        LogRow(R.id.row_4, R.id.row_4_type, R.id.row_4_length, R.id.row_4_time),
        LogRow(R.id.row_5, R.id.row_5_type, R.id.row_5_length, R.id.row_5_time),
    )
    private val SONG_ROWS = listOf(
        SongRow(R.id.song_1, R.id.song_1_title, R.id.song_1_percent, R.id.song_1_bar),
        SongRow(R.id.song_2, R.id.song_2_title, R.id.song_2_percent, R.id.song_2_bar),
        SongRow(R.id.song_3, R.id.song_3_title, R.id.song_3_percent, R.id.song_3_bar),
    )
}
