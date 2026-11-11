package com.bocal.music.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

/** The snapshot as the web app builds it: web-source/tests/widget-snapshot.test.mjs checks it matches the builder. */
fun contractSnapshotJson(): String =
    requireNotNull(WidgetSnapshotParserTest::class.java.classLoader?.getResource("widget-snapshot-v1.json")) { "fixture missing" }.readText()

fun contractSnapshot(): WidgetSnapshot = requireNotNull(WidgetSnapshotParser.parse(contractSnapshotJson()))

class WidgetSnapshotParserTest {
    @Test
    fun readsTheContractFixture() {
        val snapshot = contractSnapshot()
        assertEquals(Instant.parse("2026-11-04T12:00:00Z"), snapshot.publishedAt)
        assertEquals(60, snapshot.weeklyGoalMinutes)
        assertEquals(7, snapshot.days.size)
        assertEquals(LocalDate.of(2026, 10, 29), snapshot.days.first().date)
        assertEquals(DayTotal(LocalDate.of(2026, 11, 4), 720, 0, 1500), snapshot.days.last())
        assertEquals(5, snapshot.recent.size)
        assertEquals(ActivityType.TUNING, snapshot.recent.first().type)
        assertEquals(Instant.parse("2026-11-03T18:05:00Z"), snapshot.lastPulseAt)
        assertEquals("Alto saxophone", snapshot.instrument.name)
        assertEquals("E\u266d", snapshot.instrument.pitchLabel)
        assertEquals(9, snapshot.instrument.writtenOffset)
        assertEquals("Method-book consensus, not yet teacher-reviewed", snapshot.instrument.review)
        assertEquals(TuningInfo(442.0, "Equal"), snapshot.tuning)
        assertEquals(listOf(StudyingSong("Autumn Leaves", 40), StudyingSong("Blue Bossa", 15)), snapshot.songs.studying)
        assertEquals(1, snapshot.songs.wishlistCount)
    }

    @Test
    fun rejectsAnotherSchemaVersion() {
        assertNull(WidgetSnapshotParser.parse(contractSnapshotJson().replace("\"schemaVersion\": 1", "\"schemaVersion\": 2")))
    }

    @Test
    fun rejectsMissingOrMistypedParts() {
        val json = contractSnapshotJson()
        val broken = listOf(
            json.replace("\"weeklyGoalMinutes\": 60", "\"weeklyGoalMinutes\": 0"),
            json.replace("\"weeklyGoalMinutes\": 60", "\"weeklyGoalMinutes\": 60.5"),
            json.replace("\"date\": \"2026-10-30\"", "\"date\": \"2026-10-29\""),
            json.replace("\"date\": \"2026-10-30\"", "\"date\": \"yesterday\""),
            json.replace("\"referenceHz\": 442", "\"referenceHz\": 90000"),
            json.replace("\"id\": \"alto-sax\"", "\"id\": \"../../etc\""),
            json.replace("\"name\": \"Alto saxophone\"", "\"name\": \"   \""),
            json.replace("\"publishedAt\": 1793793600000", "\"publishedAt\": 12"),
            json.replace("\"tuning\": {", "\"tuning\": [], \"x\": {"),
            "[]",
            "not json",
        )
        broken.forEachIndexed { index, text -> assertNull("case $index", WidgetSnapshotParser.parse(text)) }
        assertNull(WidgetSnapshotParser.parse(null))
    }

    @Test
    fun rejectsOversizedPayloads() {
        val padded = contractSnapshotJson().replaceFirst("{", "{\"padding\":\"" + "x".repeat(WidgetSnapshotParser.MAX_JSON_CHARS) + "\",")
        assertNull(WidgetSnapshotParser.parse(padded))
    }

    @Test
    fun skipsUnknownActivityTypesAndIgnoresUnknownFields() {
        val json = contractSnapshotJson()
            .replace("\"type\": \"analysis\"", "\"type\": \"juggling\"")
            .replaceFirst("{", "{\"addedLater\": {\"x\": 1},")
        val snapshot = assertNotNullSnapshot(json)
        assertEquals(4, snapshot.recent.size)
        assertEquals(false, snapshot.recent.any { it.capturedAt == Instant.ofEpochMilli(1793604600000) })
    }

    @Test
    fun cleansTextAndClampsNumbers() {
        val json = contractSnapshotJson()
            .replace("\"title\": \"Autumn Leaves\"", "\"title\": \"Autumn\\u202e  Leaves\\n\"")
            .replace("\"progress\": 40", "\"progress\": 140")
            .replace("\"seconds\": 1500,\n      \"pulseSeconds\"", "\"seconds\": -5,\n      \"pulseSeconds\"")
        val snapshot = assertNotNullSnapshot(json)
        assertEquals(StudyingSong("Autumn Leaves", 100), snapshot.songs.studying.first())
        assertEquals(0L, snapshot.days.first { it.date == LocalDate.of(2026, 10, 31) }.seconds)
    }

    @Test
    fun aSongWithNoVisibleTitleIsDropped() {
        val snapshot = assertNotNullSnapshot(contractSnapshotJson().replace("\"title\": \"Blue Bossa\"", "\"title\": \"\\u200f \\u0007\""))
        assertEquals(listOf(StudyingSong("Autumn Leaves", 40)), snapshot.songs.studying)
        assertEquals(2, snapshot.songs.studyingCount)
    }

    @Test
    fun anInstrumentWithoutAChartHasNoReviewBadge() {
        val snapshot = assertNotNullSnapshot(
            contractSnapshotJson().replace("\"review\": \"Method-book consensus, not yet teacher-reviewed\"", "\"review\": null"),
        )
        assertNull(snapshot.instrument.review)
    }

    private fun assertNotNullSnapshot(json: String): WidgetSnapshot {
        val snapshot = WidgetSnapshotParser.parse(json)
        assertNotNull(snapshot)
        return snapshot!!
    }
}
