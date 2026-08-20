package com.bocal.music.data

import android.content.Context

enum class NavigationSide { LEFT, RIGHT }

class AppPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("bocal-settings", Context.MODE_PRIVATE)

    fun hasFinishedOnboarding(): Boolean = preferences.getBoolean(ONBOARDING_COMPLETE, false)

    fun setOnboardingComplete(complete: Boolean) {
        preferences.edit().putBoolean(ONBOARDING_COMPLETE, complete).apply()
    }

    fun navigationSide(): NavigationSide = runCatching {
        NavigationSide.valueOf(preferences.getString(NAVIGATION_SIDE, NavigationSide.LEFT.name)!!)
    }.getOrDefault(NavigationSide.LEFT)

    fun setNavigationSide(side: NavigationSide) {
        preferences.edit().putString(NAVIGATION_SIDE, side.name).apply()
    }

    companion object {
        private const val ONBOARDING_COMPLETE = "onboarding-complete-v2"
        private const val NAVIGATION_SIDE = "landscape-navigation-side"
    }
}
