package com.bocal.music.widget

import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetTextTest {
    @Test
    fun dropsControlAndDirectionCharactersAndCollapsesSpaces() {
        assertEquals("a b c d", WidgetText.clean("a\u0007b\u2066c\u2069  \t d", 50))
        assertEquals("Blue Bossa", WidgetText.clean("  Blue\u202e Bossa\n", 50))
    }

    @Test
    fun capsByCodePointsWithoutSplittingAPair() {
        assertEquals("\ud83c\udfb7\ud83c\udfb7", WidgetText.clean("\ud83c\udfb7\ud83c\udfb7\ud83c\udfb7", 2))
        assertEquals("abc", WidgetText.clean("abc def", 4))
    }

    @Test
    fun dropsALoneSurrogate() {
        assertEquals("a b", WidgetText.clean("a\ud800b", 10))
    }

    @Test
    fun isolatesUserText() {
        assertEquals("\u2068Shalom\u2069", WidgetText.isolate("Shalom"))
    }
}
