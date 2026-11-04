package com.bocal.music.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MiniJsonTest {
    @Test
    fun readsEveryKindOfValue() {
        val value = MiniJson.parse("""{"a":[1,-2.5,3e2],"b":"x\"\\\/\n\u00e9","c":true,"d":false,"e":null,"f":{}}""") as Map<*, *>
        assertEquals(listOf(1.0, -2.5, 300.0), value["a"])
        assertEquals("x\"\\/\n\u00e9", value["b"])
        assertEquals(true, value["c"])
        assertEquals(false, value["d"])
        assertTrue(value.containsKey("e"))
        assertNull(value["e"])
        assertEquals(emptyMap<String, Any?>(), value["f"])
    }

    @Test
    fun keepsSurrogatePairsFromEscapes() {
        assertEquals("\ud83c\udfb7", MiniJson.parse("\"\\ud83c\\udfb7\""))
    }

    @Test
    fun rejectsAnythingThatIsNotExactlyOneJsonValue() {
        val bad = listOf(
            "",
            "{",
            "{\"a\":1,}",
            "[1,]",
            "{'a':1}",
            "{\"a\":1} trailing",
            "NaN",
            "01",
            "1.",
            "-",
            "\"raw\ncontrol\"",
            "{\"a\":1,\"a\":2}",
            "\"\\x\"",
            "1e999",
            "[".repeat(MiniJson.MAX_DEPTH + 2) + "]".repeat(MiniJson.MAX_DEPTH + 2),
        )
        for (text in bad) {
            try {
                MiniJson.parse(text)
                fail("accepted: $text")
            } catch (_: MiniJson.ParseException) {
                // expected
            }
        }
    }

    @Test
    fun acceptsWhitespaceAroundTheValue() {
        assertEquals(listOf(1.0), MiniJson.parse(" \n[ 1 ]\t"))
    }
}
