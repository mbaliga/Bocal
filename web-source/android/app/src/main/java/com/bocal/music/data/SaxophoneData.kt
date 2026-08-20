package com.bocal.music.data

data class SaxKey(
    val id: String,
    val shortLabel: String,
    val name: String,
    val hand: String,
    val finger: String,
    val x: Float,
    val y: Float,
    val z: Float,
)

data class SaxRoute(
    val id: String,
    val label: String,
    val keys: List<String>,
    val hint: String,
    val useWhen: String? = null,
)

data class SaxFingering(
    val id: String,
    val note: String,
    val octave: Int,
    val midi: Int,
    val level: String,
    val primary: SaxRoute,
    val alternates: List<SaxRoute> = emptyList(),
) {
    val writtenName: String get() = "$note$octave"
    val concertName: String get() = midiName(midi - 9)
    val routes: List<SaxRoute> get() = listOf(primary) + alternates
}

private val mainStack = listOf("lh1", "lh2", "lh3", "rh1", "rh2", "rh3")
private fun oct(keys: List<String>) = listOf("octave") + keys

private fun fingering(
    id: String,
    note: String,
    octave: Int,
    midi: Int,
    level: String,
    keys: List<String>,
    hint: String,
    primaryLabel: String = "Primary",
    alternates: List<SaxRoute> = emptyList(),
) = SaxFingering(
    id = id,
    note = note,
    octave = octave,
    midi = midi,
    level = level,
    primary = SaxRoute("$id-primary", primaryLabel, keys, hint),
    alternates = alternates,
)

fun midiName(midi: Int): String {
    val names = listOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")
    val pitchClass = ((midi % 12) + 12) % 12
    return "${names[pitchClass]}${midi / 12 - 1}"
}

object SaxophoneData {
    val keys = listOf(
        SaxKey("octave", "Oct", "Octave lever", "Left", "Thumb", -0.16f, 1.82f, -0.43f),
        SaxKey("frontF", "F↑", "Front F touch", "Left", "Index", -0.27f, 2.40f, 0.40f),
        SaxKey("lh1", "1", "B pearl", "Left", "Index", -0.19f, 2.08f, 0.45f),
        SaxKey("bis", "Bis", "Bis B♭ pearl", "Left", "Index edge", 0.15f, 1.82f, 0.46f),
        SaxKey("lh2", "2", "A pearl", "Left", "Middle", -0.18f, 1.47f, 0.47f),
        SaxKey("lh3", "3", "G pearl", "Left", "Ring", -0.16f, 0.84f, 0.48f),
        SaxKey("palmD", "D", "High D palm touch", "Left", "Palm", -0.48f, 2.18f, 0.07f),
        SaxKey("palmEb", "E♭", "High E♭ palm touch", "Left", "Palm", -0.53f, 1.68f, 0.06f),
        SaxKey("palmF", "F", "High F palm touch", "Left", "Palm", -0.54f, 1.18f, 0.05f),
        SaxKey("gsharp", "G♯", "G♯ touch", "Left", "Pinky", -0.56f, 0.42f, 0.24f),
        SaxKey("lowCsharp", "C♯", "Low C♯ roller", "Left", "Pinky", -0.64f, 0.12f, 0.20f),
        SaxKey("lowB", "B", "Low B roller", "Left", "Pinky", -0.66f, -0.20f, 0.17f),
        SaxKey("lowBb", "B♭", "Low B♭ touch", "Left", "Pinky", -0.61f, -0.52f, 0.13f),
        SaxKey("rh1", "1", "F pearl", "Right", "Index", 0.20f, 0.18f, 0.48f),
        SaxKey("rh2", "2", "E pearl", "Right", "Middle", 0.20f, -0.46f, 0.49f),
        SaxKey("rh3", "3", "D pearl", "Right", "Ring", 0.20f, -1.09f, 0.50f),
        SaxKey("sideC", "C", "Side C touch", "Right", "Index side", 0.57f, 0.48f, 0.20f),
        SaxKey("sideBb", "B♭", "Side B♭ touch", "Right", "Index side", 0.59f, 0.04f, 0.18f),
        SaxKey("highFsharp", "F♯↑", "High F♯ touch", "Right", "Middle side", 0.61f, -0.66f, 0.15f),
        SaxKey("altFsharp", "F♯", "Alternate F♯ touch", "Right", "Ring side", 0.57f, -1.29f, 0.16f),
        SaxKey("sideE", "E↑", "High E side touch", "Right", "Index side", 0.54f, 0.91f, 0.16f),
        SaxKey("lowC", "C", "Low C roller", "Right", "Pinky", 0.57f, -1.42f, 0.23f),
        SaxKey("lowEb", "E♭", "Low E♭ roller", "Right", "Pinky", 0.60f, -1.74f, 0.18f),
    )

    val keysById = keys.associateBy { it.id }

    val fingerings = listOf(
        fingering("bb3", "B♭", 3, 58, "Low", mainStack + "lowBb", "All six main fingers, then roll the left pinky to low B♭."),
        fingering("b3", "B", 3, 59, "Low", mainStack + "lowB", "All six main fingers with the left-pinky low B key."),
        fingering("c4", "C", 4, 60, "Low", mainStack + "lowC", "All six main fingers with the right-pinky low C key."),
        fingering("cs4", "C♯", 4, 61, "Low", mainStack + "lowCsharp", "All six main fingers with the left-pinky low C♯ key."),
        fingering("d4", "D", 4, 62, "Low", mainStack, "Close the six main pearl keys. Keep both pinkies relaxed."),
        fingering("eb4", "E♭", 4, 63, "Low", mainStack + "lowEb", "Six main keys plus the right-pinky E♭ key."),
        fingering("e4", "E", 4, 64, "Middle", listOf("lh1", "lh2", "lh3", "rh1", "rh2"), "Lift the right ring finger; keep the other five main keys closed."),
        fingering("f4", "F", 4, 65, "Middle", listOf("lh1", "lh2", "lh3", "rh1"), "Left hand down, plus the right index finger."),
        fingering(
            "fs4", "F♯", 4, 66, "Middle", listOf("lh1", "lh2", "lh3", "rh2"),
            "Left hand down, plus the right middle finger.", "Regular F♯",
            listOf(SaxRoute("fork-fs4", "Alternate / fork F♯", listOf("lh1", "lh2", "lh3", "rh1", "altFsharp"), "Keep the left-hand stack and right-index F pearl down, then add the separate alternate F♯ touch.", "Useful for F–F♯ trills and selected chromatic connections.")),
        ),
        fingering("g4", "G", 4, 67, "Middle", listOf("lh1", "lh2", "lh3"), "Only the three left-hand main keys."),
        fingering("gs4", "A♭", 4, 68, "Middle", listOf("lh1", "lh2", "lh3", "gsharp"), "Finger G and add the left-pinky G♯ key."),
        fingering("a4", "A", 4, 69, "Middle", listOf("lh1", "lh2"), "Left index and middle fingers. Keep the ring finger hovering close."),
        fingering(
            "bb4", "B♭", 4, 70, "Middle", listOf("lh1", "bis"), "Use the left index to cover B and the small bis key together.", "Bis B♭",
            listOf(SaxRoute("side-bb4", "Side B♭", listOf("lh1", "sideBb"), "Hold the B pearl with the left index and open the side B♭ vent with the right index side.", "Often cleaner beside B natural or in B–B♭ trills.")),
        ),
        fingering("b4", "B", 4, 71, "Middle", listOf("lh1"), "Left index finger only."),
        fingering(
            "c5", "C", 5, 72, "Middle", listOf("lh2"), "Left middle finger only; the index finger floats above B.", "Regular C",
            listOf(SaxRoute("side-c5", "Side C", listOf("lh1", "sideC"), "Hold B with the left index and open the side C vent with the right index side.", "Useful for B–C trills and selected colour or intonation choices.")),
        ),
        fingering("cs5", "C♯", 5, 73, "Middle", emptyList(), "Open fingering. Keep every finger curved and close to its key."),
        fingering("d5", "D", 5, 74, "Upper", oct(mainStack), "Six main fingers plus the left-thumb octave key."),
        fingering("eb5", "E♭", 5, 75, "Upper", oct(mainStack + "lowEb"), "Upper D fingering plus the right-pinky E♭ key."),
        fingering("e5", "E", 5, 76, "Upper", oct(listOf("lh1", "lh2", "lh3", "rh1", "rh2")), "Octave key with the five main fingers used for middle E."),
        fingering("f5", "F", 5, 77, "Upper", oct(listOf("lh1", "lh2", "lh3", "rh1")), "Octave key, left hand down, right index."),
        fingering(
            "fs5", "F♯", 5, 78, "Upper", oct(listOf("lh1", "lh2", "lh3", "rh2")), "Octave key, left hand down, right middle.", "Regular F♯",
            listOf(SaxRoute("fork-fs5", "Alternate / fork F♯", oct(listOf("lh1", "lh2", "lh3", "rh1", "altFsharp")), "Keep the octave, left-hand stack and right-index F pearl down, then add the alternate F♯ touch.", "Useful for F–F♯ trills and selected chromatic connections.")),
        ),
        fingering("g5", "G", 5, 79, "Upper", oct(listOf("lh1", "lh2", "lh3")), "Octave key plus the three left-hand main keys."),
        fingering("gs5", "A♭", 5, 80, "Upper", oct(listOf("lh1", "lh2", "lh3", "gsharp")), "Upper G with the left-pinky G♯ key."),
        fingering("a5", "A", 5, 81, "Upper", oct(listOf("lh1", "lh2")), "Octave key with left index and middle fingers."),
        fingering(
            "bb5", "B♭", 5, 82, "Upper", oct(listOf("lh1", "bis")), "Octave key with the B and bis keys under the left index.", "Bis B♭",
            listOf(SaxRoute("side-bb5", "Side B♭", oct(listOf("lh1", "sideBb")), "Add the octave lever to the B-plus-side-B♭ fingering.", "Often cleaner beside upper B natural or for a B–B♭ trill.")),
        ),
        fingering("b5", "B", 5, 83, "Upper", oct(listOf("lh1")), "Octave key and left index finger."),
        fingering(
            "c6", "C", 6, 84, "Upper", oct(listOf("lh2")), "Octave key and left middle finger.", "Regular C",
            listOf(SaxRoute("side-c6", "Side C", oct(listOf("lh1", "sideC")), "Hold the octave and B controls, then open the side C vent.", "Useful for B–C trills and selected colour or intonation choices.")),
        ),
        fingering("cs6", "C♯", 6, 85, "Upper", listOf("octave"), "Octave key only; keep the main stack open and relaxed."),
        fingering("d6", "D", 6, 86, "Upper", listOf("octave", "palmD"), "Octave key plus the first left-hand palm key."),
        fingering("eb6", "E♭", 6, 87, "Upper", listOf("octave", "palmD", "palmEb"), "Octave key plus the first two left-hand palm keys."),
        fingering(
            "e6", "E", 6, 88, "Upper", listOf("octave", "palmD", "palmEb", "sideE"), "Octave and D/E♭ palm keys, then add the upper right-hand side key.", "Palm E",
            listOf(SaxRoute("front-e6", "Front E", listOf("octave", "frontF", "lh2", "lh3"), "Press octave, front F, A and G touch-pieces. The linkage supplies the B-pad state.", "A useful bridge toward the upper register; voicing and intonation need practice.")),
        ),
        fingering(
            "f6", "F", 6, 89, "Upper", listOf("octave", "palmD", "palmEb", "palmF", "sideE"), "Octave, all three left-hand palm keys and the upper right-hand E side touch.", "Palm F",
            listOf(SaxRoute("front-f6", "Front F", listOf("octave", "frontF", "lh2"), "Press octave, front F and the A pearl. The linkage closes the required B pad.", "Useful for leaps and as a bridge to front-fingering altissimo.")),
        ),
        fingering(
            "fs6", "F♯", 6, 90, "Upper", listOf("octave", "frontF", "lh2", "highFsharp"), "Build front F with the A pearl, then add the separate keyed high-F♯ touch.", "Front F + high F♯",
            listOf(SaxRoute("palm-fs6", "Palm route", listOf("octave", "palmD", "palmEb", "palmF", "sideE", "highFsharp"), "Use the complete palm-F fingering and add the keyed high-F♯ touch.", "Useful when approaching from palm D, E♭, E or F.")),
        ),
    )
}
