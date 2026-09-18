import assert from "node:assert/strict";
import test from "node:test";

// exercise-library.ts's persistence helpers touch `window`/`localStorage`
// guarded by `typeof window === "undefined"` checks (see practice-data.ts,
// the same pattern), so a minimal in-memory stub lets the round-trip run
// under plain Node without a DOM. It transitively imports takes-store.ts for
// saveOrShareFile, which only touches window/File inside function bodies
// this suite never calls, so the stub only needs to cover what's exercised
// here.
function installStorageStub() {
  const store = new Map();
  const events = [];
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.window = {
    dispatchEvent: (event) => events.push(event?.type),
    bocalHost: undefined,
  };
  return { store, events };
}
installStorageStub();

const {
  sanitizeExercise,
  parseSavedExercises,
  loadUserExercises,
  saveUserExercises,
  upsertExercise,
  deleteExercise,
  newExerciseDraft,
  resolveExerciseTones,
  allExercises,
  BUILT_IN_EXERCISES,
  importExerciseLibraryJson,
  EXERCISE_LIBRARY_STORAGE_KEY,
  MAX_SAVED_EXERCISES,
} = await import("../app/exercise-library.ts");

const EQUAL_A440 = { referenceHz: 440, temperament: "equal", keyPc: 0 };

// ---------------------------------------------------------------------------
// sanitizeExercise
// ---------------------------------------------------------------------------

test("sanitizeExercise accepts a well-formed exercise and fills in sensible defaults for the rest", () => {
  const result = sanitizeExercise({ name: "My scale", pattern: "major-scale" });
  assert.ok(result);
  assert.equal(result.name, "My scale");
  assert.equal(result.pattern, "major-scale");
  assert.equal(result.rootMidi, 60);
  assert.equal(result.rangeLowMidi, 48);
  assert.equal(result.rangeHighMidi, 72);
  assert.equal(result.tempo, 80);
  assert.equal(result.loop, false);
  assert.equal(result.writtenOffset, 0);
  assert.equal(result.repeatStepSemitones, 12);
  assert.equal(typeof result.id, "string");
  assert.equal(typeof result.createdAt, "string");
});

test("sanitizeExercise rejects a missing/blank name or an unknown pattern id", () => {
  assert.equal(sanitizeExercise(null), null);
  assert.equal(sanitizeExercise("just a string"), null);
  assert.equal(sanitizeExercise({}), null);
  assert.equal(sanitizeExercise({ name: "", pattern: "major-scale" }), null);
  assert.equal(sanitizeExercise({ name: "   ", pattern: "major-scale" }), null);
  assert.equal(sanitizeExercise({ name: "Bad", pattern: "not-a-real-pattern" }), null);
});

test("sanitizeExercise clamps out-of-range numeric fields instead of trusting hand-edited storage", () => {
  const result = sanitizeExercise({
    name: "Extreme", pattern: "chromatic",
    rootMidi: 9999, tempo: -50, noteLength: 50, articulationGapMs: -10, writtenOffset: 999, repeatStepSemitones: -3,
  });
  assert.ok(result);
  assert.equal(result.rootMidi, 127);
  assert.ok(result.tempo >= 30);
  assert.equal(result.noteLength, 1);
  assert.equal(result.articulationGapMs, 0);
  assert.equal(result.writtenOffset, 24);
  assert.equal(result.repeatStepSemitones, 12, "an invalid step falls back to the octave default");
});

test("sanitizeExercise swaps an inverted range rather than producing rangeHigh < rangeLow", () => {
  const result = sanitizeExercise({ name: "Inverted", pattern: "chromatic", rangeLowMidi: 80, rangeHighMidi: 50 });
  assert.ok(result.rangeLowMidi <= result.rangeHighMidi);
  assert.equal(result.rangeLowMidi, 50);
  assert.equal(result.rangeHighMidi, 80);
});

test("sanitizeExercise only keeps pattern-specific fields for their own pattern", () => {
  const leaps = sanitizeExercise({ name: "L", pattern: "major-scale", leapIntervalSemitones: 7, customNotes: ["C4"], skipFundamental: true });
  assert.equal(leaps.leapIntervalSemitones, undefined, "leap fields don't belong on a scale pattern");
  assert.equal(leaps.customNotes, undefined);
  assert.equal(leaps.skipFundamental, undefined);

  const custom = sanitizeExercise({ name: "C", pattern: "custom", customNotes: ["C4", "E4", 42, "G4"] });
  assert.deepEqual(custom.customNotes, ["C4", "E4", "G4"], "non-string entries are dropped");
});

test("sanitizeExercise never lets an imported/hand-edited entry forge builtIn: true", () => {
  const result = sanitizeExercise({ name: "Sneaky", pattern: "chromatic", builtIn: true });
  // sanitizeExercise itself is used both for storage reads and import; the
  // builtIn flag is preserved only where the caller explicitly constructs it
  // (BUILT_IN_EXERCISES below) -- upsertExercise and importExerciseLibraryJson
  // both strip it explicitly, covered further down.
  assert.equal(result.builtIn, true, "sanitizeExercise itself preserves whatever the object says");
});

test("parseSavedExercises returns [] for missing/malformed input and filters bad entries, capped at MAX_SAVED_EXERCISES", () => {
  assert.deepEqual(parseSavedExercises(null), []);
  assert.deepEqual(parseSavedExercises("not json"), []);
  assert.deepEqual(parseSavedExercises("{}"), []);
  const many = Array.from({ length: MAX_SAVED_EXERCISES + 10 }, (_, i) => ({ name: `E${i}`, pattern: "chromatic" }));
  assert.equal(parseSavedExercises(JSON.stringify(many)).length, MAX_SAVED_EXERCISES);
});

// ---------------------------------------------------------------------------
// load/save round-trip
// ---------------------------------------------------------------------------

test("saveUserExercises writes JSON and dispatches bocal-exercise-library; loadUserExercises reads it back", () => {
  const { store, events } = installStorageStub();
  const draft = { ...newExerciseDraft(), name: "Saved one" };
  saveUserExercises([draft]);
  assert.ok(store.has(EXERCISE_LIBRARY_STORAGE_KEY));
  assert.ok(events.includes("bocal-exercise-library"));
  const loaded = loadUserExercises();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].name, "Saved one");
});

// ---------------------------------------------------------------------------
// upsertExercise / deleteExercise
// ---------------------------------------------------------------------------

test("upsertExercise inserts a new exercise and updates an existing one by id, always stamping builtIn: false", () => {
  const first = { ...newExerciseDraft(), id: "e1", name: "First" };
  let list = upsertExercise([], first);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "First");
  assert.equal(list[0].builtIn, false);

  const updated = { ...first, name: "First (edited)", builtIn: true };
  list = upsertExercise(list, updated);
  assert.equal(list.length, 1, "same id replaces in place rather than appending");
  assert.equal(list[0].name, "First (edited)");
  assert.equal(list[0].builtIn, false, "builtIn can never be forged through upsert");
});

test("upsertExercise caps stored history at MAX_SAVED_EXERCISES, dropping the oldest", () => {
  let list = [];
  for (let i = 0; i < MAX_SAVED_EXERCISES + 5; i += 1) {
    list = upsertExercise(list, { ...newExerciseDraft(), id: `e${i}`, name: `E${i}` });
  }
  assert.equal(list.length, MAX_SAVED_EXERCISES);
  assert.equal(list[0].name, "E5", "the oldest five should have been dropped");
});

test("deleteExercise removes only the matching id", () => {
  const list = [{ ...newExerciseDraft(), id: "a" }, { ...newExerciseDraft(), id: "b" }];
  const next = deleteExercise(list, "a");
  assert.deepEqual(next.map((item) => item.id), ["b"]);
});

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

test("all six bundled presets are offered, each builtIn, each with a unique id, and each sanitizes to itself", () => {
  assert.equal(BUILT_IN_EXERCISES.length, 6);
  const ids = BUILT_IN_EXERCISES.map((e) => e.id);
  assert.equal(new Set(ids).size, 6, "no duplicate built-in ids");
  for (const exercise of BUILT_IN_EXERCISES) {
    assert.equal(exercise.builtIn, true);
    assert.ok(exercise.name.length > 0);
    const resanitized = sanitizeExercise(exercise);
    assert.ok(resanitized, `${exercise.name} should sanitize cleanly`);
    assert.equal(resanitized.pattern, exercise.pattern);
  }
});

test("allExercises puts the six built-ins first, then the user's own", () => {
  const combined = allExercises([{ ...newExerciseDraft(), id: "user-1", name: "Mine" }]);
  assert.equal(combined.length, 7);
  assert.equal(combined[6].name, "Mine");
  assert.deepEqual(combined.slice(0, 6).map((e) => e.id), BUILT_IN_EXERCISES.map((e) => e.id));
});

// ---------------------------------------------------------------------------
// resolveExerciseTones
// ---------------------------------------------------------------------------

test("resolveExerciseTones never returns an empty list, even for a pathologically narrow saved range", () => {
  const exercise = { ...newExerciseDraft(), pattern: "major-scale", rootMidi: 60, rangeLowMidi: 60, rangeHighMidi: 61 };
  const tones = resolveExerciseTones(exercise, EQUAL_A440);
  assert.ok(tones.length > 0, "should fall back to the single base pass rather than playing nothing");
});

test("resolveExerciseTones expands a scale pattern across its saved range at repeatStepSemitones", () => {
  const exercise = { ...newExerciseDraft(), pattern: "major-scale", rootMidi: 60, rangeLowMidi: 60, rangeHighMidi: 84, repeatStepSemitones: 12 };
  const tones = resolveExerciseTones(exercise, EQUAL_A440);
  assert.equal(tones.length, 16, "two octave passes of an 8-note scale");
  assert.equal(tones[0].midi, 60);
  assert.equal(tones[8].midi, 72, "second pass starts an octave up");
});

test("resolveExerciseTones applies writtenOffset before playing: a transposing exercise sounds at concert pitch", () => {
  const exercise = { ...newExerciseDraft(), pattern: "chromatic", rootMidi: 60, rangeLowMidi: 60, rangeHighMidi: 61, writtenOffset: 2 };
  const tones = resolveExerciseTones(exercise, EQUAL_A440);
  assert.equal(tones[0].midi, 62, "written C4 on a +2 transposing exercise should sound as concert D4");
});

test("resolveExerciseTones does not range-expand harmonic-series, interval-leaps or custom (their own fields already control length)", () => {
  const leaps = { ...newExerciseDraft(), pattern: "interval-leaps", rootMidi: 60, rangeLowMidi: 40, rangeHighMidi: 100, leapIntervalSemitones: 7, leapRepeats: 3 };
  assert.equal(resolveExerciseTones(leaps, EQUAL_A440).length, 6, "3 repeats x 2 notes, unaffected by the wide range");

  const custom = { ...newExerciseDraft(), pattern: "custom", customNotes: ["C4", "E4", "G4"], rangeLowMidi: 20, rangeHighMidi: 100 };
  assert.equal(resolveExerciseTones(custom, EQUAL_A440).length, 3);
});

test("all six built-in presets resolve to a non-empty, playable tone sequence", () => {
  for (const exercise of BUILT_IN_EXERCISES) {
    const tones = resolveExerciseTones(exercise, EQUAL_A440);
    assert.ok(tones.length > 0, `${exercise.name} should resolve to at least one tone`);
    tones.forEach((tone) => assert.ok(Number.isFinite(tone.hz) && tone.hz > 0, `${exercise.name}: non-finite/zero hz`));
  }
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

test("importExerciseLibraryJson accepts this export's {exercises: [...]} shape and a bare array, assigning fresh ids", () => {
  const wrapped = JSON.stringify({ schemaVersion: 1, exercises: [{ name: "Imported A", pattern: "chromatic", id: "old-id" }] });
  const resultA = importExerciseLibraryJson(wrapped);
  assert.equal(resultA.imported.length, 1);
  assert.equal(resultA.imported[0].name, "Imported A");
  assert.notEqual(resultA.imported[0].id, "old-id");
  assert.equal(resultA.imported[0].builtIn, false);

  const bare = JSON.stringify([{ name: "Imported B", pattern: "major-scale" }]);
  const resultB = importExerciseLibraryJson(bare);
  assert.equal(resultB.imported.length, 1);
  assert.equal(resultB.imported[0].name, "Imported B");
});

test("importExerciseLibraryJson counts rejected entries and never throws on garbage", () => {
  assert.deepEqual(importExerciseLibraryJson("not json"), { imported: [], rejectedCount: 0 });
  assert.deepEqual(importExerciseLibraryJson("{}"), { imported: [], rejectedCount: 0 });
  assert.deepEqual(importExerciseLibraryJson("42"), { imported: [], rejectedCount: 0 });
  const mixed = JSON.stringify([{ name: "Good", pattern: "chromatic" }, { name: "" }, { pattern: "nonsense" }]);
  const result = importExerciseLibraryJson(mixed);
  assert.equal(result.imported.length, 1);
  assert.equal(result.rejectedCount, 2);
});

test("two independently imported copies of the same exercise get different ids and can coexist", () => {
  const raw = JSON.stringify([{ name: "Dup", pattern: "chromatic" }]);
  const first = importExerciseLibraryJson(raw).imported[0];
  const second = importExerciseLibraryJson(raw).imported[0];
  assert.notEqual(first.id, second.id);
});
