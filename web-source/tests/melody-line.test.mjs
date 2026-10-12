import assert from "node:assert/strict";
import test from "node:test";
import {
  BUNDLED_MELODIES,
  MAX_FRAME_MS,
  MAX_USER_MELODIES,
  MELODY_BEATS_MAX,
  MELODY_BEATS_MIN,
  MELODY_MAX_NOTES,
  MELODY_MIDI_MAX,
  MELODY_MIDI_MIN,
  MELODY_NAME_MAX,
  MELODY_TEMPO_MAX,
  MELODY_TEMPO_MIN,
  beatMs,
  melodyDurationMs,
  melodyPitchView,
  melodySegments,
  newMelodyId,
  noteStatistics,
  parseMelodies,
  sanitiseMelodies,
  sanitiseMelody,
  segmentIndexAt,
  serialiseMelodies,
  startMelodyOn,
} from "../app/melody-line.ts";
import { takePitchView } from "../app/vocal-graph.ts";

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);

const userMelody = (overrides = {}) => ({
  id: "user-a",
  name: "Warm up",
  tempoBpm: 90,
  notes: [{ midi: 55, beats: 1 }, { midi: 59, beats: 0.5 }, { midi: 62, beats: 2 }],
  source: "user",
  ...overrides,
});

// -- Storage -----------------------------------------------------------------------

test("a melody list survives a write and a read unchanged", () => {
  const melodies = [userMelody(), userMelody({ id: "user-b", name: "Low hum", tempoBpm: 50, notes: [{ midi: 40, beats: 8 }] })];
  const raw = serialiseMelodies(melodies);
  assert.deepEqual(parseMelodies(raw), melodies);
  assert.deepEqual(sanitiseMelodies(JSON.parse(raw)), melodies);
});

test("bundled melodies are never written to storage", () => {
  const raw = serialiseMelodies([...BUNDLED_MELODIES, userMelody()]);
  assert.deepEqual(parseMelodies(raw).map((melody) => melody.id), ["user-a"]);
  assert.equal(serialiseMelodies(BUNDLED_MELODIES), "[]");
});

test("the sanitiser rejects what is not a melody", () => {
  for (const garbage of [null, undefined, 7, "melody", [], {}, true]) assert.deepEqual(sanitiseMelodies(garbage), []);
  const entries = [
    null,
    "x",
    42,
    [],
    {},
    { name: "no id", tempoBpm: 80, notes: [{ midi: 60, beats: 1 }] },
    { id: "  ", tempoBpm: 80, notes: [{ midi: 60, beats: 1 }] },
    { id: "no-tempo", notes: [{ midi: 60, beats: 1 }] },
    { id: "bad-tempo", tempoBpm: "fast", notes: [{ midi: 60, beats: 1 }] },
    { id: "nan-tempo", tempoBpm: NaN, notes: [{ midi: 60, beats: 1 }] },
    { id: "no-notes", tempoBpm: 80 },
    { id: "notes-not-array", tempoBpm: 80, notes: "C4" },
    { id: "empty-notes", tempoBpm: 80, notes: [] },
    { id: "all-bad-notes", tempoBpm: 80, notes: [null, "C4", { midi: "60", beats: 1 }, { midi: 60 }, { beats: 1 }, { midi: Infinity, beats: 1 }] },
    { id: "ok", tempoBpm: 80, notes: [{ midi: 60, beats: 1 }] },
  ];
  assert.deepEqual(sanitiseMelodies(entries).map((melody) => melody.id), ["ok"]);
});

test("unreadable stored text is nothing saved, not an error", () => {
  for (const raw of [null, "", "not json", "{", "{\"a\":1}", "null", "\"x\""]) assert.deepEqual(parseMelodies(raw), []);
});

test("the sanitiser clamps numbers to the documented bounds", () => {
  const melody = sanitiseMelody({
    id: "clamp",
    name: "x",
    tempoBpm: 9999,
    notes: [{ midi: 3, beats: 0.01 }, { midi: 200, beats: 99 }, { midi: 60.4, beats: 1.3 }, { midi: -50, beats: -2 }],
  });
  assert.equal(melody.tempoBpm, MELODY_TEMPO_MAX);
  assert.deepEqual(melody.notes, [
    { midi: MELODY_MIDI_MIN, beats: MELODY_BEATS_MIN },
    { midi: MELODY_MIDI_MAX, beats: MELODY_BEATS_MAX },
    { midi: 60, beats: 1.25 },
    { midi: MELODY_MIDI_MIN, beats: MELODY_BEATS_MIN },
  ]);
  assert.equal(sanitiseMelody({ id: "slow", tempoBpm: 1, notes: [{ midi: 60, beats: 1 }] }).tempoBpm, MELODY_TEMPO_MIN);
  assert.equal(sanitiseMelody({ id: "frac", tempoBpm: 90.6, notes: [{ midi: 60, beats: 1 }] }).tempoBpm, 91);
});

test("the sanitiser limits note count, name length, list length and repeated ids", () => {
  const many = Array.from({ length: 200 }, (_, index) => ({ midi: 40 + (index % 30), beats: 1 }));
  assert.equal(sanitiseMelody({ id: "long", tempoBpm: 80, notes: many }).notes.length, MELODY_MAX_NOTES);
  const named = sanitiseMelody({ id: "named", tempoBpm: 80, name: `  ${"n".repeat(300)}  `, notes: [{ midi: 60, beats: 1 }] });
  assert.equal(named.name.length, MELODY_NAME_MAX);
  assert.equal(sanitiseMelody({ id: "blank", tempoBpm: 80, name: "   ", notes: [{ midi: 60, beats: 1 }] }).name, "My melody");
  assert.equal(sanitiseMelody({ id: "i".repeat(200), tempoBpm: 80, notes: [{ midi: 60, beats: 1 }] }).id.length, 64);
  const lots = Array.from({ length: 60 }, (_, index) => userMelody({ id: `m${index}` }));
  assert.equal(sanitiseMelodies(lots).length, MAX_USER_MELODIES);
  assert.equal(sanitiseMelodies([userMelody(), userMelody({ name: "second with the same id" })]).length, 1);
});

test("whatever source a stored record claims, it reads back as the singer's own", () => {
  assert.equal(sanitiseMelody({ ...userMelody(), source: "bundled" }).source, "user");
  assert.equal(sanitiseMelody({ ...userMelody(), source: undefined }).source, "user");
});

test("new melody ids are distinct even within one millisecond", () => {
  assert.notEqual(newMelodyId(1000), newMelodyId(1000));
});

// -- Bundled melodies ---------------------------------------------------------------

test("Bocal ships six melodies of its own, all within the editor's bounds", () => {
  assert.equal(BUNDLED_MELODIES.length, 6);
  assert.deepEqual(BUNDLED_MELODIES.map((melody) => melody.name), ["Five-note scale", "Arpeggio", "Octave leap", "Siren", "Descending fifth", "Sustained third"]);
  const ids = new Set();
  for (const melody of BUNDLED_MELODIES) {
    assert.equal(melody.source, "bundled");
    assert.ok(!ids.has(melody.id));
    ids.add(melody.id);
    // The same bounds a melody the singer makes is held to.
    const checked = sanitiseMelody(melody);
    assert.deepEqual({ ...checked, source: "bundled" }, melody, `${melody.name} sits inside the bounds`);
  }
  const siren = BUNDLED_MELODIES.find((melody) => melody.name === "Siren");
  assert.equal(siren.notes.length, 2, "the siren is two long notes");
  assert.ok(siren.notes.every((note) => note.beats >= 4));
});

// -- Timing -------------------------------------------------------------------------

test("segments lay the notes end to end from the start time", () => {
  const melody = { tempoBpm: 60, notes: [{ midi: 60, beats: 1 }, { midi: 62, beats: 2 }, { midi: 64, beats: 0.5 }] };
  const segments = melodySegments(melody, 5000);
  assert.deepEqual(segments, [
    { index: 0, midi: 60, beats: 1, startMs: 5000, endMs: 6000 },
    { index: 1, midi: 62, beats: 2, startMs: 6000, endMs: 8000 },
    { index: 2, midi: 64, beats: 0.5, startMs: 8000, endMs: 8500 },
  ]);
});

test("the same melody takes half the time at 120 bpm as at 60", () => {
  const notes = [{ midi: 60, beats: 1 }, { midi: 62, beats: 2 }];
  const slow = melodySegments({ tempoBpm: 60, notes }, 0);
  const fast = melodySegments({ tempoBpm: 120, notes }, 0);
  near(beatMs(60), 1000);
  near(beatMs(120), 500);
  assert.deepEqual(slow.map((segment) => [segment.startMs, segment.endMs]), [[0, 1000], [1000, 3000]]);
  assert.deepEqual(fast.map((segment) => [segment.startMs, segment.endMs]), [[0, 500], [500, 1500]]);
  near(melodyDurationMs({ tempoBpm: 60, notes }), 3000);
  near(melodyDurationMs({ tempoBpm: 120, notes }), 1500);
});

test("each segment ends where the next begins, and a fractional start time carries through", () => {
  const segments = melodySegments(BUNDLED_MELODIES[1], 123.456);
  for (let index = 1; index < segments.length; index += 1) near(segments[index].startMs, segments[index - 1].endMs);
  near(segments[0].startMs, 123.456);
  near(segments[segments.length - 1].endMs - segments[0].startMs, melodyDurationMs(BUNDLED_MELODIES[1]));
});

test("an out-of-range tempo is held to the bounds rather than dividing by zero", () => {
  near(beatMs(0), 60000 / MELODY_TEMPO_MIN);
  near(beatMs(100000), 60000 / MELODY_TEMPO_MAX);
});

test("the note sounding at a moment is found, and none before or after", () => {
  const segments = melodySegments({ tempoBpm: 60, notes: [{ midi: 60, beats: 1 }, { midi: 62, beats: 1 }] }, 1000);
  assert.equal(segmentIndexAt(segments, 999), -1);
  assert.equal(segmentIndexAt(segments, 1000), 0);
  assert.equal(segmentIndexAt(segments, 1999.9), 0);
  assert.equal(segmentIndexAt(segments, 2000), 1);
  assert.equal(segmentIndexAt(segments, 3000), -1);
});

test("moving a melody keeps its shape and stays inside the bounds", () => {
  const moved = startMelodyOn(BUNDLED_MELODIES[0], 48);
  assert.equal(moved.notes[0].midi, 48);
  assert.deepEqual(moved.notes.map((note) => note.midi - 48), BUNDLED_MELODIES[0].notes.map((note) => note.midi - BUNDLED_MELODIES[0].notes[0].midi));
  assert.deepEqual(moved.notes.map((note) => note.beats), BUNDLED_MELODIES[0].notes.map((note) => note.beats));
  assert.equal(startMelodyOn(BUNDLED_MELODIES[0], 57), BUNDLED_MELODIES[0]);
  const high = startMelodyOn(BUNDLED_MELODIES[1], 95);
  assert.ok(high.notes.every((note) => note.midi <= MELODY_MIDI_MAX));
});

test("the pitch axis widens only when a melody does not fit the graph's own", () => {
  const base = { lo: 36, hi: 84 };
  const inside = melodySegments({ tempoBpm: 60, notes: [{ midi: 50, beats: 1 }, { midi: 70, beats: 1 }] }, 0);
  assert.equal(melodyPitchView(inside, base), base);
  const above = melodySegments({ tempoBpm: 60, notes: [{ midi: 50, beats: 1 }, { midi: 90, beats: 1 }] }, 0);
  const widened = melodyPitchView(above, base);
  assert.ok(widened.hi >= 92 && widened.lo <= 36);
  assert.equal(melodyPitchView([], base), base);
});

test("a take's pitch axis comes from the stored range, or from the take's own notes", () => {
  const withRange = takePitchView({ low: 45, high: 69 }, [50, 60]);
  assert.ok(withRange.lo < 45 && withRange.hi > 69);
  const widened = takePitchView({ low: 45, high: 69 }, [40, 80]);
  assert.ok(widened.lo <= 38 && widened.hi >= 82);
  const own = takePitchView(null, [57.2, 62.9]);
  assert.ok(own.lo < 57 && own.hi > 63 && own.hi - own.lo < 24, "a short take is not squeezed into a four-octave axis");
  assert.deepEqual(takePitchView(null, []), { lo: 36, hi: 84 });
  assert.ok(takePitchView(null, [60]).hi - takePitchView(null, [60]).lo >= 6);
});

// -- What was sung -------------------------------------------------------------------

/** Frames every `stepMs` from `fromMs` up to (not including) `toMs`, at `midi` plus `cents`, or unvoiced when midi is null. */
function frames(fromMs, toMs, midi, cents = 0, stepMs = 20) {
  const out = [];
  for (let t = fromMs; t < toMs; t += stepMs) out.push({ tMs: t, midi, cents: midi === null ? null : cents, locked: midi !== null });
  return out;
}

test("per-note figures on synthetic frames, including a note that was never sung", () => {
  const melody = { tempoBpm: 60, notes: [{ midi: 60, beats: 1 }, { midi: 64, beats: 1 }, { midi: 67, beats: 2 }] };
  const segments = melodySegments(melody, 10_000);
  const sung = [
    ...frames(9_000, 10_000, 60, 0), // before the melody: ignored
    ...frames(10_000, 11_000, 60, 10), // note 1: steady, 10 cents above
    ...frames(11_000, 12_000, null), // note 2: no pitch heard
    ...frames(12_000, 13_000, 67, 0), // note 3, first half: on the note
    ...frames(13_000, 14_000, 67, 50), // note 3, second half: 50 cents above
    ...frames(14_000, 15_000, 72, 0), // after the melody: ignored
  ];
  const stats = noteStatistics(segments, sung, 25);
  assert.equal(stats.length, 3);

  near(stats[0].durationMs, 1000);
  near(stats[0].voicedMs, 1000);
  near(stats[0].inBandMs, 1000);
  near(stats[0].inBandFraction, 1);
  near(stats[0].meanCents, 10);

  assert.equal(stats[1].midi, 64);
  near(stats[1].voicedMs, 0);
  near(stats[1].inBandMs, 0);
  near(stats[1].inBandFraction, 0);
  assert.equal(stats[1].meanCents, null, "an unvoiced note has no average");

  near(stats[2].durationMs, 2000);
  near(stats[2].voicedMs, 2000);
  near(stats[2].inBandMs, 1000);
  near(stats[2].inBandFraction, 0.5);
  near(stats[2].meanCents, 25);
});

test("the band is the distance from the note, so a sharp and a flat stretch both fall outside it", () => {
  const segments = melodySegments({ tempoBpm: 60, notes: [{ midi: 60, beats: 2 }] }, 0);
  const sung = [...frames(0, 1000, 60, -40), ...frames(1000, 2000, 60, 20)];
  const [stat] = noteStatistics(segments, sung, 25);
  near(stat.inBandMs, 1000, 1e-6);
  near(stat.meanCents, -10);
  const [wide] = noteStatistics(segments, sung, 50);
  near(wide.inBandMs, 2000);
  const [none] = noteStatistics(segments, sung, 5);
  near(none.inBandMs, 0);
});

test("pitch is read as note plus cents, so a reading on a neighbouring note still counts against this one", () => {
  const segments = melodySegments({ tempoBpm: 60, notes: [{ midi: 60, beats: 1 }] }, 0);
  // 59.8 is "C4 minus 20 cents" or "B3 plus 80 cents"; either way it is 20 cents below the target.
  const [stat] = noteStatistics(segments, frames(0, 1000, 60, -20), 25);
  near(stat.meanCents, -20);
  const [neighbour] = noteStatistics(segments, frames(0, 1000, 59, 80), 25);
  near(neighbour.meanCents, -20);
  near(neighbour.inBandMs, 1000);
});

test("a gap in the readings is not counted as singing", () => {
  const segments = melodySegments({ tempoBpm: 60, notes: [{ midi: 60, beats: 2 }] }, 0);
  // One reading, then nothing for a second, then another.
  const sung = [{ tMs: 100, midi: 60, cents: 0 }, { tMs: 1100, midi: 60, cents: 0 }];
  const [stat] = noteStatistics(segments, sung, 25);
  near(stat.voicedMs, 2 * MAX_FRAME_MS);
});

test("a reading is only credited for the part of it that falls inside the note", () => {
  const segments = melodySegments({ tempoBpm: 60, notes: [{ midi: 60, beats: 1 }, { midi: 62, beats: 1 }] }, 0);
  // A single reading 40 ms before the boundary, standing for 100 ms: 40 ms to note 1, 60 ms to note 2.
  const sung = [{ tMs: 960, midi: 61, cents: 0 }];
  const [first, second] = noteStatistics(segments, sung, 25);
  near(first.voicedMs, 40);
  near(second.voicedMs, 60);
  near(first.meanCents, 100);
  near(second.meanCents, -100);
});

test("no frames at all gives every note zero time and no average", () => {
  const segments = melodySegments(BUNDLED_MELODIES[4], 0);
  const stats = noteStatistics(segments, [], 25);
  assert.equal(stats.length, BUNDLED_MELODIES[4].notes.length);
  for (const stat of stats) {
    assert.equal(stat.voicedMs, 0);
    assert.equal(stat.meanCents, null);
  }
  assert.deepEqual(noteStatistics([], frames(0, 100, 60), 25), []);
});

test("the statistics carry no field that reads as a mark", () => {
  const [stat] = noteStatistics(melodySegments(BUNDLED_MELODIES[0], 0), frames(0, 500, 57), 25);
  assert.deepEqual(Object.keys(stat).sort(), ["durationMs", "endMs", "inBandFraction", "inBandMs", "index", "meanCents", "midi", "startMs", "voicedMs"]);
});
