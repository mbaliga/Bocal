package com.bocal.music.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import com.bocal.music.MainActivity
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Wiring between the web app's published summary, the stored copy and the
 * launcher. Updates are pushed: the bridge publishes, the widgets redraw.
 * The only scheduled work is one inexact alarm, at the earlier of just after
 * midnight (when "the last seven days" moves on) and the moment the stored
 * summary turns stale; it is cancelled when no widget is placed.
 */
object BocalWidgets {
    private const val TAG = "BocalWidgets"
    private const val STORE_DIRECTORY = "widgets"
    private const val REQUEST_ROLLOVER = 0

    /** One background thread for every widget update, so draws never overlap or block a caller. */
    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "bocal-widgets").apply { isDaemon = true }
    }

    fun store(context: Context) = WidgetSnapshotStore(File(context.applicationContext.noBackupFilesDir, STORE_DIRECTORY))

    fun providerClass(kind: WidgetKind): Class<out BocalWidgetProvider> = when (kind) {
        WidgetKind.THIS_WEEK -> ThisWeekWidget::class.java
        WidgetKind.TUNE -> TuneWidget::class.java
        WidgetKind.STUDYING -> NowStudyingWidget::class.java
        WidgetKind.LOG -> PracticeLogWidget::class.java
        WidgetKind.PULSE -> PulseWidget::class.java
        WidgetKind.INSTRUMENT -> InstrumentWidget::class.java
    }

    fun widgetIds(context: Context, kind: WidgetKind): IntArray =
        AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, providerClass(kind)))

    /**
     * The bridge's entry point (`bocalHost.publishWidgetSnapshot`). Validates
     * and stores on the calling thread, so the page learns whether the shell
     * accepted it, then redraws in the background.
     */
    fun publish(context: Context, json: String): Boolean {
        val app = context.applicationContext
        if (!store(app).write(json)) return false
        executor.execute { safely { refreshAllNow(app) } }
        return true
    }

    /** Runs [block] off the main thread and finishes the receiver's [result] when done. */
    fun runAsync(result: BroadcastReceiver.PendingResult, block: () -> Unit) {
        executor.execute {
            try {
                safely(block)
            } finally {
                result.finish()
            }
        }
    }

    fun refreshAllNow(context: Context) {
        val state = store(context).read()
        var placed = false
        for (kind in WidgetKind.entries) {
            val ids = widgetIds(context, kind)
            if (ids.isEmpty()) continue
            placed = true
            updateNow(context, kind, ids, state)
        }
        if (placed) scheduleNextRedraw(context, state) else cancelNextRedraw(context)
    }

    /** Redraws [requestedIds] of one kind. Ids that aren't this app's widgets of that kind are ignored. */
    fun updateNow(context: Context, kind: WidgetKind, requestedIds: IntArray, state: WidgetState = store(context).read()) {
        val manager = AppWidgetManager.getInstance(context)
        val owned = widgetIds(context, kind).toSet()
        val store = store(context)
        for (id in requestedIds) {
            if (id !in owned) continue
            try {
                val views = WidgetRenderer.render(context, kind, id, state, store.isTitleHidden(id), manager.getAppWidgetOptions(id))
                manager.updateAppWidget(id, views)
            } catch (e: RuntimeException) {
                Log.w(TAG, "Could not draw a ${kind.name} widget", e)
            }
        }
    }

    /** Arms the one redraw alarm for [WidgetModels.nextRedraw]; setting it again replaces the earlier one. */
    fun scheduleNextRedraw(context: Context, state: WidgetState = store(context).read()) {
        val alarms = context.getSystemService(AlarmManager::class.java) ?: return
        val publishedAt = (state as? WidgetState.Ready)?.snapshot?.publishedAt
        val at = WidgetModels.nextRedraw(Instant.now(), ZoneId.systemDefault(), publishedAt).toEpochMilli()
        // Inexact and not a wake-up: the redraw can wait until the phone is next awake.
        alarms.set(AlarmManager.RTC, at, rolloverIntent(context))
    }

    fun cancelNextRedraw(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(rolloverIntent(context))
    }

    private fun rolloverIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_ROLLOVER,
        Intent(context, WidgetActionReceiver::class.java).setAction(WidgetActionReceiver.ACTION_DAY_ROLLOVER),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** Opens Bocal (explicitly [MainActivity]) on [destination]. */
    fun openIntent(context: Context, widgetId: Int, slot: Int, destination: WidgetDestination): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .putExtra(HostOpenRequests.EXTRA_OPEN, destination.id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            WidgetModels.requestCode(widgetId, slot),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    /** Shows or hides song titles on one "Now studying" widget, through the app's own non-exported receiver. */
    fun toggleTitlesIntent(context: Context, widgetId: Int): PendingIntent = PendingIntent.getBroadcast(
        context,
        WidgetModels.requestCode(widgetId, WidgetModels.SLOT_TOGGLE),
        Intent(context, WidgetActionReceiver::class.java)
            .setAction(WidgetActionReceiver.ACTION_TOGGLE_TITLES)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (e: RuntimeException) {
            // A widget that fails to draw keeps its last picture; the app itself is unaffected.
            Log.w(TAG, "Widget refresh failed", e)
        }
    }
}
