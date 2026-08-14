package com.bocal.music.data

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.bocal.music.BuildConfig
import java.io.File
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

object BocalBundleExporter {
    private const val MIME_TYPE = "application/vnd.bocal.bundle+json"

    fun createPracticeShareIntent(
        context: Context,
        sessions: List<PracticeSession>,
    ): Intent {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val exportFile = File(exportDir, "bocal-practice-${System.currentTimeMillis()}.bocalbundle")
        exportFile.writeText(createPracticePayload(sessions))

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.files",
            exportFile,
        )

        return Intent(Intent.ACTION_SEND).apply {
            type = MIME_TYPE
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    fun createPracticePayload(sessions: List<PracticeSession>): String {
        val array = JSONArray()
        sessions.forEach { session ->
            array.put(
                JSONObject()
                    .put("startedAt", session.startedAt)
                    .put("seconds", session.seconds)
                    .put("instrument", session.instrument)
                    .put("inTunePercent", session.inTunePercent ?: JSONObject.NULL),
            )
        }

        return JSONObject()
            .put("schemaVersion", 1)
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("exportedAt", Instant.now().toString())
            .put("timezone", java.time.ZoneId.systemDefault().id)
            .put("transpositionConvention", "written-pitch semitone offset above concert")
            .put("attachments", JSONArray())
            .put("sessions", array)
            .toString(2)
    }
}
