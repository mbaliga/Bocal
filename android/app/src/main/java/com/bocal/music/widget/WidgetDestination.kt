package com.bocal.music.widget

/**
 * The places a home-screen widget may open inside the web app. The page keeps
 * the same list (`HOST_DESTINATIONS` in web-source/app/widget-snapshot.ts) and
 * ignores anything else; `widget-snapshot.test.mjs` checks the two agree.
 */
enum class WidgetDestination(val id: String) {
    TUNE("tune"),
    TUNE_TONE("tune:tone"),
    LAB("lab"),
    PULSE("pulse"),
    PULSE_METRONOME("pulse:metronome"),
    PULSE_SEQUENCES("pulse:sequences"),
    PULSE_DRONE("pulse:drone"),
    PRACTICE("practice"),
    PRACTICE_TODAY("practice:today"),
    PRACTICE_LOG("practice:log"),
    PRACTICE_SONGS("practice:songs"),
    ;

    companion object {
        /** The destination named by [raw], or null for anything not on the list. */
        fun parse(raw: String?): WidgetDestination? = entries.firstOrNull { it.id == raw }
    }
}
