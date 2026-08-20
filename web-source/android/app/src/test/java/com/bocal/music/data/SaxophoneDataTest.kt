package com.bocal.music.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SaxophoneDataTest {
    @Test
    fun `published range is continuous from low Bb to keyed F sharp`() {
        assertEquals((58..90).toList(), SaxophoneData.fingerings.map { it.midi })
        assertEquals(33, SaxophoneData.fingerings.size)
    }

    @Test
    fun `every fingering target resolves to a declared semantic key`() {
        val knownKeys = SaxophoneData.keys.map { it.id }.toSet()
        SaxophoneData.fingerings.flatMap { it.routes }.forEach { route ->
            assertTrue("Unknown key in ${route.id}: ${route.keys - knownKeys}", knownKeys.containsAll(route.keys))
        }
    }

    @Test
    fun `middle A uses left index and middle and transposes to concert C`() {
        val a4 = SaxophoneData.fingerings.single { it.id == "a4" }
        assertEquals(listOf("lh1", "lh2"), a4.primary.keys)
        assertEquals("C4", a4.concertName)
    }

    @Test
    fun `semantic identifiers are unique`() {
        assertEquals(SaxophoneData.keys.size, SaxophoneData.keys.map { it.id }.toSet().size)
        val routes = SaxophoneData.fingerings.flatMap { it.routes }
        assertEquals(routes.size, routes.map { it.id }.toSet().size)
    }
}
