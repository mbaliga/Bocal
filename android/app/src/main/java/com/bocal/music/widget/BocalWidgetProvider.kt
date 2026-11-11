package com.bocal.music.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Shared behaviour of Bocal's six widget providers. Each draws from the
 * stored summary off the main thread (`goAsync`), redraws itself when the
 * launcher resizes it (below Android 12 the layout is picked from the size it
 * reports), and when the clock, time zone or language changes.
 */
abstract class BocalWidgetProvider(private val kind: WidgetKind) : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_LOCALE_CHANGED,
            -> {
                val ids = BocalWidgets.widgetIds(context, kind)
                if (ids.isNotEmpty()) update(context, ids)
            }
            else -> super.onReceive(context, intent)
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        update(context, appWidgetIds)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        update(context, intArrayOf(appWidgetId))
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        BocalWidgets.store(context).forget(appWidgetIds)
    }

    override fun onDisabled(context: Context) {
        // The last widget of this kind is gone; drop the timed redraw if no other kind is placed either.
        // (A newly placed widget arms it from onUpdate, which the launcher sends right after placing it.)
        val anyPlaced = WidgetKind.entries.any { BocalWidgets.widgetIds(context, it).isNotEmpty() }
        if (!anyPlaced) BocalWidgets.cancelNextRedraw(context)
    }

    private fun update(context: Context, ids: IntArray) {
        val app = context.applicationContext
        val result = goAsync()
        BocalWidgets.runAsync(result) {
            val state = BocalWidgets.store(app).read()
            BocalWidgets.updateNow(app, kind, ids, state)
            BocalWidgets.scheduleNextRedraw(app, state)
        }
    }
}

/** "This week": practice minutes over the last seven days against the weekly goal (progress). */
class ThisWeekWidget : BocalWidgetProvider(WidgetKind.THIS_WEEK)

/** "Tune": the instrument and its A4, one tap from the tuner (card). */
class TuneWidget : BocalWidgetProvider(WidgetKind.TUNE)

/** "Now studying": the songs marked Studying and their marked progress (card / list). */
class NowStudyingWidget : BocalWidgetProvider(WidgetKind.STUDYING)

/** "Practice log": the newest logged sessions (list). */
class PracticeLogWidget : BocalWidgetProvider(WidgetKind.LOG)

/** "Pulse": metronome, sequences and drone shortcuts, with this week's Pulse minutes (pads). */
class PulseWidget : BocalWidgetProvider(WidgetKind.PULSE)

/** "Instrument": the instrument, its lab and its chart's review badge (card). */
class InstrumentWidget : BocalWidgetProvider(WidgetKind.INSTRUMENT)
