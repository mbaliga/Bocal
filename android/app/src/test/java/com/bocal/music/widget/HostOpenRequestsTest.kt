package com.bocal.music.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostOpenRequestsTest {
    @Test
    fun aRequestIsHandedOverOnce() {
        val requests = HostOpenRequests()
        assertTrue(requests.offer("practice:log"))
        assertEquals("practice:log", requests.take())
        assertEquals("", requests.take())
    }

    @Test
    fun theNewestRequestWins() {
        val requests = HostOpenRequests()
        requests.offer("tune")
        requests.offer("pulse:drone")
        assertEquals("pulse:drone", requests.take())
    }

    @Test
    fun anythingOffTheListIsIgnoredAndNobodyIsWoken() {
        val requests = HostOpenRequests()
        var woken = 0
        requests.onRequest = { woken++ }
        for (raw in listOf(null, "", "javascript:alert(1)", "https://example.com", "TUNE", "practice:log ")) {
            assertFalse(raw.toString(), requests.offer(raw))
        }
        assertEquals(0, woken)
        assertEquals("", requests.take())
        assertTrue(requests.offer("lab"))
        assertEquals(1, woken)
    }

    @Test
    fun everyDestinationRoundTrips() {
        for (destination in WidgetDestination.entries) assertEquals(destination, WidgetDestination.parse(destination.id))
    }
}
