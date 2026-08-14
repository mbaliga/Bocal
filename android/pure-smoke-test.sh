#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

if ! command -v kotlinc >/dev/null 2>&1; then
  echo "kotlinc is unavailable; run Gradle unit tests instead."
  exit 2
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

cat > "$work_dir/Main.kt" <<'KOTLIN'
import com.bocal.music.audio.PitchMath
import com.bocal.music.audio.PitchStabilizer
import com.bocal.music.audio.YinPitchDetector
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

private fun close(actual: Float, expected: Float, tolerance: Float, label: String) {
    check(abs(actual - expected) <= tolerance) { "$label expected=$expected actual=$actual" }
}

fun main() {
    val detector = YinPitchDetector(48_000)
    listOf(220f, 440f, 880f).forEach { hz ->
        val frame = FloatArray(4_096) { i -> sin(2.0 * PI * hz * i / 48_000.0).toFloat() }
        val result = detector.detect(frame) ?: error("No YIN result for $hz Hz")
        close(result.frequencyHz, hz, 1.0f, "YIN $hz")
        check(result.confidence > 0.85f)
    }

    val a4 = PitchMath.from(YinPitchDetector.Result(440f, 0.99f), 440f, 0) ?: error("No A4 reading")
    check(a4.writtenNote == "A" && a4.writtenOctave == 4)
    check(abs(a4.cents) < 0.01f)

    val c4 = PitchMath.frequencyForMidi(60)
    val eb = PitchMath.from(YinPitchDetector.Result(c4, 0.99f), 440f, 9) ?: error("No E-flat reading")
    check(eb.concertNote == "C" && eb.concertOctave == 4)
    check(eb.writtenNote == "A" && eb.writtenOctave == 4)

    val bb = PitchMath.from(YinPitchDetector.Result(c4, 0.99f), 440f, 2) ?: error("No B-flat reading")
    check(bb.writtenNote == "D" && bb.writtenOctave == 4)

    val stabilizer = PitchStabilizer(requiredFrames = 3)
    val input = YinPitchDetector.Result(440f, 0.95f)
    check(stabilizer.update(input, 0L) == null)
    check(stabilizer.update(input, 10_000_000L) == null)
    check(stabilizer.update(input, 20_000_000L) != null)
    check(stabilizer.update(null, 200_000_000L) != null)
    check(stabilizer.update(null, 500_000_000L) == null)

    println("PASS: YIN, pitch/transposition math, and stable-note gating")
}
KOTLIN

kotlinc \
  app/src/main/java/com/bocal/music/audio/YinPitchDetector.kt \
  app/src/main/java/com/bocal/music/audio/PitchMath.kt \
  app/src/main/java/com/bocal/music/audio/PitchStabilizer.kt \
  "$work_dir/Main.kt" \
  -include-runtime -d "$work_dir/bocal-pure-tests.jar"

java -jar "$work_dir/bocal-pure-tests.jar"
