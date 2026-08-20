package com.bocal.music.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class FormatDurationTest {
    @Test
    fun `formats short and long sessions`() {
        assertEquals("00:00", formatDuration(0))
        assertEquals("01:05", formatDuration(65))
        assertEquals("1:01:01", formatDuration(3_661))
    }

    @Test
    fun `negative duration is clamped`() {
        assertEquals("00:00", formatDuration(-4))
    }
}
