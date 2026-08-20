package com.bocal.music.data

data class InstrumentProfile(
    val id: String,
    val name: String,
    val pitchLabel: String,
    val writtenOffset: Int,
    val readiness: String,
)

object InstrumentCatalog {
    val instruments = listOf(
        InstrumentProfile("alto-sax", "Alto saxophone", "E♭", 9, "Fingering trainer + 3D reference"),
        InstrumentProfile("oboe", "Oboe", "C", 0, "3D anatomy preview"),
    )
}
