package com.bocal.music.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

class WidgetModelsTest {
    private val utc: ZoneId = ZoneOffset.UTC
    private val publishedDay = LocalDate.of(2026, 11, 4)

    @Test
    fun sizeClassesFollowTheLauncherSize() {
        // The platform's reference sizes (dp) for common cell spans, portrait and landscape.
        assertEquals(SizeClass.SMALL, SizeClass.forSize(130f, 102f)) // 2x1 portrait
        assertEquals(SizeClass.SMALL, SizeClass.forSize(130f, 220f)) // 2x2 portrait: too narrow for medium
        assertEquals(SizeClass.SMALL, SizeClass.forSize(203f, 102f)) // 3x1 portrait
        assertEquals(SizeClass.SMALL, SizeClass.forSize(276f, 102f)) // 4x1 portrait: one row only fits the summary
        assertEquals(SizeClass.SMALL, SizeClass.forSize(557f, 51f)) // 4x1 landscape
        assertEquals(SizeClass.SMALL, SizeClass.forSize(554f, 117f)) // 4x2 landscape: the medium layouts need about 140 dp
        assertEquals(SizeClass.MEDIUM, SizeClass.forSize(203f, 220f)) // 3x2 portrait: too narrow for large
        assertEquals(SizeClass.MEDIUM, SizeClass.forSize(557f, 184f)) // 4x3 landscape: the large layouts need about 210 dp
        assertEquals(SizeClass.LARGE, SizeClass.forSize(276f, 220f)) // 4x2 portrait
        assertEquals(SizeClass.LARGE, SizeClass.forSize(276f, 337f)) // 4x3 portrait
        assertEquals(SizeClass.LARGE, SizeClass.forSize(400f, 400f))
        // Just under each threshold falls back a class.
        assertEquals(SizeClass.SMALL, SizeClass.forSize(250f, 139f))
        assertEquals(SizeClass.MEDIUM, SizeClass.forSize(250f, 209f))
        assertEquals(SizeClass.MEDIUM, SizeClass.forSize(249f, 300f))
    }

    @Test
    fun aLauncherThatReportsNoSizeGetsTheDefault() {
        assertEquals(SizeClass.LARGE, SizeClass.forReportedSize(0, 0, SizeClass.LARGE))
        assertEquals(SizeClass.SMALL, SizeClass.forReportedSize(110, 0, SizeClass.SMALL))
        assertEquals(SizeClass.SMALL, SizeClass.forReportedSize(260, 120, SizeClass.LARGE))
        assertEquals(SizeClass.MEDIUM, SizeClass.forReportedSize(260, 150, SizeClass.SMALL))
    }

    @Test
    fun belowAndroid12EachOrientationGetsItsOwnLayout() {
        // OPTION_APPWIDGET_MIN_WIDTH / MIN_HEIGHT / MAX_WIDTH / MAX_HEIGHT as a launcher reports a 4x2 widget:
        // portrait is MIN_WIDTH x MAX_HEIGHT, landscape MAX_WIDTH x MIN_HEIGHT.
        assertEquals(Orientations(portrait = SizeClass.LARGE, landscape = SizeClass.SMALL), SizeClass.forOrientations(276, 117, 557, 220, SizeClass.SMALL))
        // 4x3: large upright, medium on its side.
        assertEquals(Orientations(portrait = SizeClass.LARGE, landscape = SizeClass.MEDIUM), SizeClass.forOrientations(276, 184, 557, 337, SizeClass.SMALL))
        // One row: the summary both ways.
        assertEquals(Orientations(SizeClass.SMALL, SizeClass.SMALL), SizeClass.forOrientations(276, 51, 557, 102, SizeClass.LARGE))
        // Nothing reported: the provider's default both ways; half reported: the default only where a value is missing.
        assertEquals(Orientations(SizeClass.MEDIUM, SizeClass.MEDIUM), SizeClass.forOrientations(0, 0, 0, 0, SizeClass.MEDIUM))
        assertEquals(Orientations(portrait = SizeClass.LARGE, landscape = SizeClass.MEDIUM), SizeClass.forOrientations(276, 0, 0, 220, SizeClass.MEDIUM))
    }

    @Test
    fun theSizeMapKeysAreTheSameThresholdsForSizePicks() {
        for (size in SizeClass.entries) assertEquals(size, SizeClass.forSize(size.minWidthDp, size.minHeightDp))
        // Each class's key fits inside the next one's, so the launcher's "largest that fits" pick is well defined.
        SizeClass.entries.zipWithNext().forEach { (smaller, larger) ->
            assertTrue(smaller.minWidthDp <= larger.minWidthDp && smaller.minHeightDp <= larger.minHeightDp)
        }
    }

    @Test
    fun defaultSizesMatchTheProviderXml() {
        for (kind in WidgetKind.entries) {
            val (minWidth, minHeight) = ProviderXml.minSize(kind)
            assertEquals("$kind minWidth x minHeight in widget_*_info.xml", WidgetModels.declaredMinSize(kind), minWidth to minHeight)
            assertEquals(kind.name, SizeClass.forSize(minWidth.toFloat(), minHeight.toFloat()), WidgetModels.defaultSize(kind))
        }
        // The fallback never picks a layout taller than the widget is guaranteed to be.
        assertEquals(SizeClass.SMALL, WidgetModels.defaultSize(WidgetKind.TUNE))
        assertEquals(SizeClass.SMALL, WidgetModels.defaultSize(WidgetKind.THIS_WEEK))
        assertEquals(SizeClass.MEDIUM, WidgetModels.defaultSize(WidgetKind.LOG))
    }

    @Test
    fun durationsAreWordedLikeThePracticeScreen() {
        assertEquals(DurationLabel.None, WidgetMath.durationLabel(0))
        assertEquals(DurationLabel.UnderAMinute, WidgetMath.durationLabel(29))
        assertEquals(DurationLabel.Minutes(1), WidgetMath.durationLabel(30))
        assertEquals(DurationLabel.Minutes(12), WidgetMath.durationLabel(720))
        assertEquals(DurationLabel.HoursMinutes(1, 5), WidgetMath.durationLabel(3900))
    }

    @Test
    fun goalPercentRoundsHalfUpAndCapsAt100() {
        assertEquals(70, WidgetMath.goalPercent(42, 60))
        assertEquals(1, WidgetMath.goalPercent(1, 200))
        assertEquals(100, WidgetMath.goalPercent(90, 60))
        assertEquals(100, WidgetMath.goalPercent(5, 0))
    }

    @Test
    fun theWeekOnThePublishDayMatchesTheGoalRing() {
        val week = WidgetModels.week(contractSnapshot(), publishedDay)
        // 600 + 1500 + 180 + 480 + 720 seconds = 58 minutes.
        assertEquals(58, week.minutes)
        assertEquals(60, week.goalMinutes)
        assertEquals(97, week.percent)
        assertFalse(week.goalMet)
        assertEquals(5, week.activeDays)
        assertEquals(LocalDate.of(2026, 10, 29), week.days.first().date)
        assertEquals(publishedDay, week.days.last().date)
        assertEquals(12, week.days.last().minutes)
        assertEquals(25, week.timerMinutes)
    }

    @Test
    fun theWeekMovesOnWithoutANewSnapshot() {
        // Three days later nothing new has been logged (practice is only logged inside Bocal),
        // and the days that fell out of the window no longer count.
        val week = WidgetModels.week(contractSnapshot(), publishedDay.plusDays(3))
        assertEquals(LocalDate.of(2026, 11, 1), week.days.first().date)
        assertEquals(LocalDate.of(2026, 11, 7), week.days.last().date)
        assertEquals(23, week.minutes)
        assertEquals(3, week.activeDays)
        val muchLater = WidgetModels.week(contractSnapshot(), publishedDay.plusDays(30))
        assertEquals(0, muchLater.minutes)
        assertEquals(0, muchLater.activeDays)
    }

    @Test
    fun dayBarsShareOneScaleAndPractisedDaysAlwaysShow() {
        val days = listOf(
            DayMinutes(publishedDay.minusDays(2), 0, practised = true),
            DayMinutes(publishedDay.minusDays(1), 0, practised = false),
            DayMinutes(publishedDay, 12, practised = true),
        )
        val (max, bars) = WidgetModels.dayBars(days)
        assertEquals(24, max)
        assertEquals(listOf(1, 0, 12), bars)
        val (bigMax, bigBars) = WidgetModels.dayBars(listOf(DayMinutes(publishedDay, 90, practised = true)))
        assertEquals(90, bigMax)
        assertEquals(listOf(90), bigBars)
    }

    @Test
    fun pulseCountsOnlyRhythmSecondsInTheWindow() {
        val pulse = WidgetModels.pulse(contractSnapshot(), publishedDay)
        assertEquals(480L, pulse.seconds)
        assertEquals(Instant.parse("2026-11-03T18:05:00Z"), pulse.lastPulseAt)
        assertEquals(0L, WidgetModels.pulse(contractSnapshot(), publishedDay.plusDays(7)).seconds)
    }

    @Test
    fun freshnessSaysWhenTheSummaryIsOld() {
        val published = Instant.parse("2026-11-04T12:00:00Z")
        assertEquals(Freshness(sameDay = true, stale = false), WidgetModels.freshness(published, published.plusSeconds(3600), utc))
        assertEquals(Freshness(sameDay = false, stale = false), WidgetModels.freshness(published, Instant.parse("2026-11-05T09:00:00Z"), utc))
        assertEquals(Freshness(sameDay = false, stale = true), WidgetModels.freshness(published, Instant.parse("2026-11-05T12:00:01Z"), utc))
    }

    @Test
    fun theLogShowsOneThreeOrFiveNewestRows() {
        val snapshot = contractSnapshot()
        assertEquals(1, WidgetModels.log(snapshot, SizeClass.SMALL).size)
        assertEquals(3, WidgetModels.log(snapshot, SizeClass.MEDIUM).size)
        val large = WidgetModels.log(snapshot, SizeClass.LARGE)
        assertEquals(5, large.size)
        assertEquals(large.sortedByDescending { it.capturedAt }, large)
    }

    @Test
    fun studyingShowsSongsOrSaysWhyNot() {
        val snapshot = contractSnapshot()
        val medium = WidgetModels.studying(snapshot, SizeClass.MEDIUM, titlesHidden = false) as StudyingContent.Studying
        assertEquals(listOf(StudyingSong("Autumn Leaves", 40)), medium.songs)
        assertEquals(1, medium.moreStudying)
        val large = WidgetModels.studying(snapshot, SizeClass.LARGE, titlesHidden = true) as StudyingContent.Studying
        assertEquals(2, large.songs.size)
        assertEquals(0, large.moreStudying)
        assertTrue(large.titlesHidden)

        val wishlistOnly = snapshot.copy(songs = Songs(emptyList(), 0, 3))
        assertEquals(StudyingContent.WishlistOnly(3), WidgetModels.studying(wishlistOnly, SizeClass.SMALL, false))
        val empty = snapshot.copy(songs = Songs(emptyList(), 0, 0))
        assertEquals(StudyingContent.Empty, WidgetModels.studying(empty, SizeClass.LARGE, false))
    }

    @Test
    fun everyWidgetOpensSomewhereOnTheAllowList() {
        for (kind in WidgetKind.entries) {
            val destination = WidgetModels.primaryDestination(kind)
            assertEquals(destination, WidgetDestination.parse(destination.id))
        }
        assertEquals(WidgetDestination.TUNE, WidgetModels.primaryDestination(WidgetKind.TUNE))
        assertEquals(WidgetDestination.PRACTICE_LOG, WidgetModels.primaryDestination(WidgetKind.LOG))
    }

    @Test
    fun requestCodesNeverCollideAcrossWidgetsAndSlots() {
        val codes = (1..50).flatMap { id -> (0..7).map { slot -> WidgetModels.requestCode(id, slot) } }
        assertEquals(codes.size, codes.toSet().size)
    }

    @Test(expected = IllegalArgumentException::class)
    fun aSlotOutOfRangeIsABug() {
        WidgetModels.requestCode(1, 8)
    }

    @Test
    fun referencePitchShowsADecimalOnlyWhenItHasOne() {
        assertEquals("440", WidgetMath.formatHz(440.0, Locale.US))
        assertEquals("442.5", WidgetMath.formatHz(442.5, Locale.US))
        assertEquals("442,5", WidgetMath.formatHz(442.5, Locale.GERMANY))
        assertEquals("441", WidgetMath.formatHz(440.96, Locale.US))
    }

    @Test
    fun transpositionIsWordedFromTheOffset() {
        assertEquals(Transposition.Concert, Transposition.of(0))
        assertEquals(Transposition.WrittenAbove(9), Transposition.of(9))
        assertEquals(Transposition.WrittenBelow(12), Transposition.of(-12))
    }

    @Test
    fun theNextRedrawIsJustAfterLocalMidnight() {
        val zone = ZoneId.of("Europe/London")
        val next = WidgetModels.nextDayBoundary(Instant.parse("2026-11-04T23:30:00Z"), zone)
        assertEquals(Instant.parse("2026-11-05T00:01:00Z"), next)
    }

    @Test
    fun theNextRedrawAlsoCatchesTheMomentTheSummaryTurnsStale() {
        // Published Monday 00:30: stale from Tuesday 00:30, which comes before Wednesday's midnight.
        val published = Instant.parse("2026-11-02T00:30:00Z")
        val tuesdayMorning = Instant.parse("2026-11-03T00:05:00Z")
        assertEquals(Instant.parse("2026-11-03T00:31:00Z"), WidgetModels.nextRedraw(tuesdayMorning, utc, published))
        // Monday evening: midnight comes first.
        assertEquals(Instant.parse("2026-11-03T00:01:00Z"), WidgetModels.nextRedraw(Instant.parse("2026-11-02T20:00:00Z"), utc, published))
        // Once stale, only midnight is left.
        assertEquals(Instant.parse("2026-11-04T00:01:00Z"), WidgetModels.nextRedraw(Instant.parse("2026-11-03T09:00:00Z"), utc, published))
        // Nothing stored: midnight.
        assertEquals(Instant.parse("2026-11-04T00:01:00Z"), WidgetModels.nextRedraw(Instant.parse("2026-11-03T09:00:00Z"), utc, null))
        // At the boundary the summary really is stale.
        assertTrue(WidgetModels.freshness(published, WidgetModels.staleBoundary(published), utc).stale)
    }
}
