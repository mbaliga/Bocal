import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// tone-math.ts imports from tuning.ts, so (unlike tuning.test.mjs, whose
// module has no imports of its own) a single data: URI won't resolve the
// relative specifier. Both get transpiled into a real temp directory instead,
// so Node's normal relative-import resolution just works.
async function loadToneMath() {
  const dir = await mkdtemp(path.join(tmpdir(), "bocal-tone-math-"));
  for (const name of ["tuning", "tone-math"]) {
    const source = await readFile(new URL(`../app/${name}.ts`, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: `${name}.ts`,
    });
    await writeFile(path.join(dir, `${name}.mjs`), outputText.replace('from "./tuning"', 'from "./tuning.mjs"'));
  }
  return import(`file://${path.join(dir, "tone-math.mjs")}`);
}

const {
  INTERVALS,
  intervalById,
  intervalPartnerMidi,
  CHORD_QUALITIES,
  chordMidis,
  chordFrequencies,
  EXERCISE_PATTERNS,
  exerciseMidis,
} = await loadToneMath();

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

test("every interval m2 through P8 plus P12 and two octaves is offered", () => {
  const ids = INTERVALS.map((interval) => interval.id);
  assert.deepEqual(ids, ["m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7", "P8", "P12", "P15"]);
  assert.equal(intervalById("P8").semitones, 12);
  assert.equal(intervalById("P12").semitones, 19);
  assert.equal(intervalById("P15").semitones, 24);
});

test("interval partner moves above or below the tapped key by the chosen distance", () => {
  const fifth = intervalById("P5").semitones;
  assert.equal(intervalPartnerMidi(60, fifth, "above"), 67); // C4 -> G4
  assert.equal(intervalPartnerMidi(60, fifth, "below"), 53); // C4 -> F3
});

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

test("every required chord quality is offered with the right tone stack", () => {
  const byId = Object.fromEntries(CHORD_QUALITIES.map((quality) => [quality.id, quality.intervals]));
  assert.deepEqual(byId.major, [0, 4, 7]);
  assert.deepEqual(byId.minor, [0, 3, 7]);
  assert.deepEqual(byId.diminished, [0, 3, 6]);
  assert.deepEqual(byId.augmented, [0, 4, 8]);
  assert.deepEqual(byId.dominant7, [0, 4, 7, 10]);
  assert.deepEqual(byId.major7, [0, 4, 7, 11]);
  assert.deepEqual(byId.minor7, [0, 3, 7, 10]);
  assert.deepEqual(byId.sus4, [0, 5, 7]);
});

test("close voicing stacks the chord immediately above the root; root voicing adds the root an octave down", () => {
  assert.deepEqual(chordMidis(60, "major", "close"), [60, 64, 67]);
  assert.deepEqual(chordMidis(60, "major", "root"), [48, 60, 64, 67]);
});

test("a just-tuned C major triad at A=440 is beat-free: pure 5:4 third and 3:2 fifth", () => {
  // Sourced from the brief: 261.63 / 327.03 / 392.44 Hz.
  const hz = chordFrequencies(60, "major", "close", { referenceHz: 440, temperament: "just", keyPc: 0 });
  assert.equal(hz.length, 3);
  const [root, third, fifth] = hz;
  assert.ok(Math.abs(root - 261.63) < 0.01, `expected root ~261.63, got ${root}`);
  assert.ok(Math.abs(third - 327.03) < 0.01, `expected third ~327.03, got ${third}`);
  assert.ok(Math.abs(fifth - 392.44) < 0.01, `expected fifth ~392.44, got ${fifth}`);

  // The pure ratios themselves, independent of the tabled cents values.
  assert.ok(Math.abs(third / root - 5 / 4) < 0.0005, `expected a pure 5:4 third, got ${third / root}`);
  assert.ok(Math.abs(fifth / root - 3 / 2) < 0.0005, `expected a pure 3:2 fifth, got ${fifth / root}`);
});

test("a just-tuned chord stays beat-free around its own root even when the tuner is calibrated to a different key", () => {
  // The tuner's global key centre is set to G (pc 7); a C major triad tapped
  // under it must still tune around C, not G, to stay beat-free.
  const hz = chordFrequencies(60, "major", "close", { referenceHz: 440, temperament: "just", keyPc: 7 });
  const [root, third, fifth] = hz;
  assert.ok(Math.abs(third / root - 5 / 4) < 0.0005);
  assert.ok(Math.abs(fifth / root - 3 / 2) < 0.0005);
});

test("under equal temperament a chord is plain equal-tempered, unaffected by voicing or key centre", () => {
  const hz = chordFrequencies(60, "minor7", "close", { referenceHz: 440, temperament: "equal", keyPc: 7 });
  const expected = [60, 63, 67, 70].map((midi) => 440 * 2 ** ((midi - 69) / 12));
  hz.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9));
});

// ---------------------------------------------------------------------------
// Exercise patterns
// ---------------------------------------------------------------------------

test("every exercise pattern is offered", () => {
  assert.deepEqual(
    EXERCISE_PATTERNS.map((pattern) => pattern.id),
    ["chromatic", "major-scale", "harmonic-series", "interval-leaps"],
  );
});

test("chromatic scale runs every semitone from the root to the octave above", () => {
  assert.deepEqual(exerciseMidis(60, "chromatic"), Array.from({ length: 13 }, (_, i) => 60 + i));
});

test("major scale runs the diatonic degrees from the root to the octave above", () => {
  assert.deepEqual(exerciseMidis(60, "major-scale"), [60, 62, 64, 65, 67, 69, 71, 72]);
});

test("harmonic series from a low B-flat gives the equal-tempered notes nearest partials 1-8", () => {
  // Sourced from the brief.
  assert.deepEqual(exerciseMidis(46, "harmonic-series"), [46, 58, 65, 70, 74, 77, 80, 82]);
});

test("interval leaps slur between the root and the chosen interval, repeating the requested number of times", () => {
  assert.deepEqual(
    exerciseMidis(60, "interval-leaps", { intervalSemitones: 7, leapRepeats: 3 }),
    [60, 67, 60, 67, 60, 67],
  );
  // Defaults to a perfect 5th, four repeats.
  assert.deepEqual(exerciseMidis(60, "interval-leaps"), [60, 67, 60, 67, 60, 67, 60, 67]);
});
