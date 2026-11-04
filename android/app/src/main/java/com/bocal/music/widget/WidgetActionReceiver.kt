package com.bocal.music.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The widgets' own actions, reachable only through Bocal's immutable pending
 * intents (the receiver is not exported): show or hide song titles on one
 * "Now studying" widget, and the timed redraw (just after midnight, or when the stored summary turns stale).
 */
class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        when (intent.action) {
            ACTION_TOGGLE_TITLES -> {
                val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
                val result = goAsync()
                BocalWidgets.runAsync(result) {
                    // Only a "Now studying" widget this app actually owns can be toggled.
                    if (widgetId in BocalWidgets.widgetIds(app, WidgetKind.STUDYING)) {
                        val store = BocalWidgets.store(app)
                        store.setTitleHidden(widgetId, !store.isTitleHidden(widgetId))
                        BocalWidgets.updateNow(app, WidgetKind.STUDYING, intArrayOf(widgetId))
                    }
                }
            }
            ACTION_DAY_ROLLOVER -> {
                val result = goAsync()
                BocalWidgets.runAsync(result) { BocalWidgets.refreshAllNow(app) }
            }
        }
    }

    companion object {
        const val ACTION_TOGGLE_TITLES = "com.bocal.music.widget.TOGGLE_TITLES"
        const val ACTION_DAY_ROLLOVER = "com.bocal.music.widget.DAY_ROLLOVER"
    }
}
