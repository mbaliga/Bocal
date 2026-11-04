package com.bocal.music.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class WidgetSnapshotStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private fun store() = WidgetSnapshotStore(File(folder.root, "widgets"))

    @Test
    fun nothingPublishedYetIsTheFirstRunState() {
        assertEquals(WidgetState.FirstRun, store().read())
    }

    @Test
    fun aValidSnapshotIsKeptAndReadBack() {
        val store = store()
        assertTrue(store.write(contractSnapshotJson()))
        assertEquals(WidgetState.Ready(contractSnapshot()), store.read())
        // Only the snapshot itself is left behind: no temporary file.
        assertEquals(listOf(WidgetSnapshotStore.SNAPSHOT_FILE), File(folder.root, "widgets").list()!!.sorted())
    }

    @Test
    fun anInvalidSnapshotIsRefusedAndTheLastGoodOneKept() {
        val store = store()
        assertTrue(store.write(contractSnapshotJson()))
        assertFalse(store.write("{\"schemaVersion\": 1}"))
        assertFalse(store.write("not json"))
        assertEquals(WidgetState.Ready(contractSnapshot()), store.read())
    }

    @Test
    fun aDamagedFileIsTheUnreadableState() {
        val directory = File(folder.root, "widgets").apply { mkdirs() }
        File(directory, WidgetSnapshotStore.SNAPSHOT_FILE).writeText("{\"half\": ")
        assertEquals(WidgetState.Unreadable, store().read())
    }

    @Test
    fun songTitlesAreWithheldUntilAWidgetIsToldToShowThem() {
        val store = store()
        // Titles are typed by the player, so a new widget withholds them.
        assertTrue(store.isTitleHidden(7))
        assertTrue(store.setTitleHidden(7, false))
        assertTrue(store.setTitleHidden(9, false))
        assertFalse(store.isTitleHidden(7))
        assertTrue(store().isTitleHidden(8))
        assertTrue(store.setTitleHidden(7, true))
        assertTrue(store.isTitleHidden(7))
        // Removing a widget forgets its choice: a widget that later gets the same id starts withheld.
        assertTrue(store.forget(intArrayOf(9)))
        assertTrue(store().isTitleHidden(9))
    }

    @Test
    fun anUnreadableSettingWithholdsTitles() {
        val directory = File(folder.root, "widgets").apply { mkdirs() }
        // A directory where the settings file should be: it can't be read, and titles stay hidden.
        File(directory, WidgetSnapshotStore.SHOWN_TITLES_FILE).mkdirs()
        assertTrue(store().isTitleHidden(7))
    }
}
