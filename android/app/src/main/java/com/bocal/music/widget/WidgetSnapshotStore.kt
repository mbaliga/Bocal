package com.bocal.music.widget

import java.io.File
import java.io.IOException

/**
 * The widgets' copy of the practice summary, and which "Now studying" widgets
 * show song titles. Titles are typed in by the player, so every widget
 * withholds them until the user taps its eye to show them. The app passes `File(noBackupFilesDir, "widgets")`, so
 * none of it reaches Android backup (the manifest also sets
 * `allowBackup="false"`). Writes go to a temporary file first and are then
 * renamed, so a reader sees the old summary or the new one, never half of one.
 */
class WidgetSnapshotStore(private val directory: File) {
    private val snapshotFile = File(directory, SNAPSHOT_FILE)
    private val shownFile = File(directory, SHOWN_TITLES_FILE)

    /** Validates [json] and keeps it. False (and nothing changes) when the page sent something off-spec. */
    fun write(json: String): Boolean {
        WidgetSnapshotParser.parse(json) ?: return false
        return synchronized(LOCK) { writeAtomically(snapshotFile, json) }
    }

    fun read(): WidgetState {
        val text = synchronized(LOCK) {
            if (!snapshotFile.exists()) return WidgetState.FirstRun
            try {
                snapshotFile.readText(Charsets.UTF_8)
            } catch (_: IOException) {
                return WidgetState.Unreadable
            }
        }
        return WidgetSnapshotParser.parse(text)?.let { WidgetState.Ready(it) } ?: WidgetState.Unreadable
    }

    /** True unless the user has asked this widget to show song titles; also true when the setting can't be read. */
    fun isTitleHidden(widgetId: Int): Boolean = synchronized(LOCK) { widgetId !in readShown() }

    fun setTitleHidden(widgetId: Int, hidden: Boolean): Boolean = synchronized(LOCK) {
        val ids = readShown().toMutableSet()
        if (hidden) ids -= widgetId else ids += widgetId
        writeShown(ids)
    }

    /** Forgets per-widget settings for widgets the user removed. */
    fun forget(widgetIds: IntArray): Boolean = synchronized(LOCK) {
        val ids = readShown()
        val kept = ids - widgetIds.toSet()
        if (kept.size == ids.size) true else writeShown(kept)
    }

    private fun readShown(): Set<Int> = try {
        if (shownFile.exists()) shownFile.readLines(Charsets.UTF_8).mapNotNull { it.trim().toIntOrNull() }.toSet() else emptySet()
    } catch (_: IOException) {
        emptySet()
    }

    private fun writeShown(ids: Set<Int>): Boolean = writeAtomically(shownFile, ids.sorted().joinToString("\n"))

    private fun writeAtomically(target: File, text: String): Boolean = try {
        if (!directory.isDirectory && !directory.mkdirs()) throw IOException("cannot create $directory")
        val temp = File(directory, "${target.name}.tmp")
        temp.writeText(text, Charsets.UTF_8)
        if (!temp.renameTo(target)) {
            temp.delete()
            throw IOException("cannot replace $target")
        }
        true
    } catch (_: IOException) {
        false
    }

    companion object {
        const val SNAPSHOT_FILE = "snapshot.json"
        const val SHOWN_TITLES_FILE = "shown-titles.txt"

        /** One lock for every store instance: the bridge thread and widget receivers share the same files. */
        private val LOCK = Any()
    }
}
