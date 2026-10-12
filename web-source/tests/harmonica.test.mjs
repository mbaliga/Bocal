import assert from "node:assert/strict";
import test from "node:test";
import {
  bendCountsByHole,
  buildDiatonicHarmonicaChart,
  CHROMATIC_HARMONICA_CHART,
  DEFAULT_HARMONICA_KEY,
  describeHarmonicaNote,
  HARMONICA_CAVEAT,
  HARMONICA_KEYS,
  HARMONICA_REVIEW,
  harmonicaKeyOffset,
  harmonicaRangeHz,
  playableMidis,
  routesForMidi,
  sanitiseHarmonicaKey,
} from "../app/fingering-charts/harmonica.ts";
import { INSTRUMENTS } from "../app/instruments.ts";

// Published tables the generated charts are checked against (fetched 2026-10-12):
//   - Wikipedia, "Richter-tuned harmonica"
//     (https://en.wikipedia.org/wiki/Richter-tuned_harmonica): holes 1-10 of the
//     C layout, blow C E G C E G C E G C and draw D G B D F A B D F A.
//   - Wikipedia, "Harmonica" (https://en.wikipedia.org/wiki/Harmonica): the
//     same layout in G major, blow G B D G B D G B D G and draw
//     A D F# A C E F# A C E, and the 12-hole chromatic's C4 to C#7 range with
//     hole 12 slide-out blow C, slide-in blow C#, slide-out draw B.
// Note names below are spelled the way those tables spell them (sharps only).
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nameOf = (midi) => NAMES[midi % 12];
const plain = (chart, breath) => Array.from({ length: chart.holes }, (_, index) => chart.notes.find((n) => n.hole === index + 1 && n.breath === breath && n.bend === 0 && !n.advanced && !n.slide));

test("the C Richter chart matches the published blow and draw rows, hole by hole", () => {
  const chart = buildDiatonicHarmonicaChart("c");
  assert.deepEqual(plain(chart, "blow").map((n) => nameOf(n.midi)), ["C", "E", "G", "C", "E", "G", "C", "E", "G", "C"]);
  assert.deepEqual(plain(chart, "draw").map((n) => nameOf(n.midi)), ["D", "G", "B", "D", "F", "A", "B", "D", "F", "A"]);
  // C4 to C7 on the blow row, D4 to A6 on the draw row.
  assert.deepEqual(plain(chart, "blow").map((n) => n.midi), [60, 64, 67, 72, 76, 79, 84, 88, 91, 96]);
  assert.deepEqual(plain(chart, "draw").map((n) => n.midi), [62, 67, 71, 74, 77, 81, 83, 86, 89, 93]);
});

test("the G Richter chart matches the published G major layout", () => {
  const chart = buildDiatonicHarmonicaChart("g");
  assert.deepEqual(plain(chart, "blow").map((n) => nameOf(n.midi)), ["G", "B", "D", "G", "B", "D", "G", "B", "D", "G"]);
  assert.deepEqual(plain(chart, "draw").map((n) => nameOf(n.midi)), ["A", "D", "F#", "A", "C", "E", "F#", "A", "C", "E"]);
  // A standard G harp starts on G3.
  assert.equal(plain(chart, "blow")[0].midi, 55);
});

test("bend counts per hole are 1,2,3,1,0,1,0,1,1,2 on every key", () => {
  for (const key of HARMONICA_KEYS) {
    assert.deepEqual(bendCountsByHole(buildDiatonicHarmonicaChart(key.id)), [1, 2, 3, 1, 0, 1, 0, 1, 1, 2], key.id);
  }
});

test("draw bends sit on holes 1-6, blow bends on holes 7-10, and no bend reaches the other reed's note", () => {
  const chart = buildDiatonicHarmonicaChart("c");
  for (const note of chart.notes.filter((n) => n.bend > 0)) {
    if (note.breath === "draw") assert.ok(note.hole <= 6, `draw bend on hole ${note.hole}`);
    else assert.ok(note.hole >= 8, `blow bend on hole ${note.hole}`);
    assert.ok(note.bend >= 1 && note.bend <= 3);
  }
  const hole3 = chart.notes.filter((n) => n.hole === 3 && n.breath === "draw").sort((a, b) => a.bend - b.bend).map((n) => nameOf(n.midi));
  assert.deepEqual(hole3, ["B", "A#", "A", "G#"], "hole 3 draw bends down to one semitone above the blow G");
  const hole10 = chart.notes.filter((n) => n.hole === 10 && n.breath === "blow" && !n.advanced).sort((a, b) => a.bend - b.bend).map((n) => nameOf(n.midi));
  assert.deepEqual(hole10, ["C", "B", "A#"], "hole 10 blow bends down to one semitone above the draw A");
});

test("overblows (1,4,5,6) and overdraws (7,9,10) exist, are advanced and are flagged unverified", () => {
  const chart = buildDiatonicHarmonicaChart("c");
  const advanced = chart.notes.filter((n) => n.advanced);
  assert.deepEqual(advanced.filter((n) => n.technique === "overblow").map((n) => n.hole).sort((a, b) => a - b), [1, 4, 5, 6]);
  assert.deepEqual(advanced.filter((n) => n.technique === "overdraw").map((n) => n.hole).sort((a, b) => a - b), [7, 9, 10]);
  for (const note of advanced) assert.equal(note.unverified, true, `${note.id} must be marked unverified`);
  for (const note of chart.notes.filter((n) => !n.advanced)) assert.ok(!note.unverified, `${note.id} is not an advanced note`);
  assert.match(describeHarmonicaNote(advanced[0]), /unverified/);
});

test("every note maps to a hole, a breath and a bend of 0 to 3", () => {
  for (const chart of [buildDiatonicHarmonicaChart("c"), CHROMATIC_HARMONICA_CHART]) {
    for (const note of chart.notes) {
      assert.ok(Number.isInteger(note.hole) && note.hole >= 1 && note.hole <= chart.holes);
      assert.ok(note.breath === "blow" || note.breath === "draw");
      assert.ok([0, 1, 2, 3].includes(note.bend));
      assert.ok(Number.isInteger(note.midi));
    }
    assert.equal(new Set(chart.notes.map((n) => n.id)).size, chart.notes.length, "note ids are unique");
  }
});

test("a key shift moves every note by the key's semitone offset", () => {
  const base = buildDiatonicHarmonicaChart("c");
  assert.equal(HARMONICA_KEYS.length, 12);
  assert.equal(new Set(HARMONICA_KEYS.map((k) => k.offset)).size, 12, "twelve distinct semitone offsets");
  for (const key of HARMONICA_KEYS) {
    const shifted = buildDiatonicHarmonicaChart(key.id);
    assert.equal(shifted.notes.length, base.notes.length);
    const byId = new Map(shifted.notes.map((n) => [n.id, n]));
    for (const note of base.notes) {
      const moved = byId.get(note.id);
      assert.equal(moved.midi, note.midi + key.offset, `${key.id} ${note.id}`);
      assert.equal(moved.hole, note.hole);
      assert.equal(moved.breath, note.breath);
      assert.equal(moved.bend, note.bend);
    }
  }
  assert.equal(harmonicaKeyOffset("c"), 0);
  assert.equal(harmonicaKeyOffset("d"), 2);
  assert.equal(harmonicaKeyOffset("g"), -5);
});

test("the key sanitiser only ever returns one of the twelve keys, defaulting to C", () => {
  assert.equal(DEFAULT_HARMONICA_KEY, "c");
  assert.equal(sanitiseHarmonicaKey("fs"), "fs");
  assert.equal(sanitiseHarmonicaKey(" G "), "g");
  for (const bad of [null, undefined, 3, "", "h", "C#", "__proto__", "constructor", {}, []]) {
    assert.equal(sanitiseHarmonicaKey(bad), "c", String(bad));
  }
});

test("transposition offsets are zero: both harmonicas are concert-pitch", () => {
  assert.equal(INSTRUMENTS["diatonic-harmonica"].writtenOffset, 0);
  assert.equal(INSTRUMENTS["chromatic-harmonica"].writtenOffset, 0);
  assert.equal(INSTRUMENTS["diatonic-harmonica"].labTier, "harmonica");
  assert.equal(INSTRUMENTS["chromatic-harmonica"].labTier, "harmonica");
  assert.equal(INSTRUMENTS["diatonic-harmonica"].family, INSTRUMENTS["chromatic-harmonica"].family);
});

test("chromatic: 12 holes in groups of four, blow C E G C and draw D F A B, slide-in a semitone up", () => {
  const chart = CHROMATIC_HARMONICA_CHART;
  assert.equal(chart.holes, 12);
  const out = (breath) => Array.from({ length: 12 }, (_, i) => chart.notes.find((n) => n.hole === i + 1 && n.breath === breath && !n.slide));
  assert.deepEqual(out("blow").map((n) => nameOf(n.midi)), ["C", "E", "G", "C", "C", "E", "G", "C", "C", "E", "G", "C"]);
  assert.deepEqual(out("draw").map((n) => nameOf(n.midi)), ["D", "F", "A", "B", "D", "F", "A", "B", "D", "F", "A", "B"]);
  assert.equal(out("blow")[0].midi, 60);
  for (const hole of out("blow").concat(out("draw"))) {
    const slid = chart.notes.find((n) => n.hole === hole.hole && n.breath === hole.breath && n.slide);
    assert.equal(slid.midi, hole.midi + 1, `hole ${hole.hole} ${hole.breath} slide-in`);
    assert.equal(slid.bend, 0);
  }
  // Hole 12, as published: slide-out blow C, slide-in blow C#, slide-out draw B.
  const h12 = chart.notes.filter((n) => n.hole === 12);
  assert.deepEqual(h12.filter((n) => n.breath === "blow").map((n) => [nameOf(n.midi), Boolean(n.slide)]), [["C", false], ["C#", true]]);
  assert.equal(nameOf(h12.find((n) => n.breath === "draw" && !n.slide).midi), "B");
  assert.equal(chart.notes.filter((n) => n.advanced).length, 0, "no overblows are charted for the chromatic");
});

test("chromatic: no gaps from C4 up to the top note the layout reaches (C#7), and the tuner window covers D7", () => {
  const midis = playableMidis(CHROMATIC_HARMONICA_CHART);
  assert.equal(midis[0], 60);
  assert.equal(midis[midis.length - 1], 97);
  for (let i = 1; i < midis.length; i += 1) assert.equal(midis[i], midis[i - 1] + 1, `gap after ${midis[i - 1]}`);
  const { minHz, maxHz } = INSTRUMENTS["chromatic-harmonica"].range;
  assert.ok(minHz < 261.6 && maxHz > 2349.3, "window brackets C4 to D7");
  assert.ok(maxHz > 2217.5, "and the top C#7 with margin");
});

test("diatonic tracker windows bracket the chart for their key, and the profile window covers every key", () => {
  const profile = INSTRUMENTS["diatonic-harmonica"].range;
  for (const key of HARMONICA_KEYS) {
    const chart = buildDiatonicHarmonicaChart(key.id);
    const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const plainNotes = chart.notes.filter((n) => !n.advanced);
    const low = Math.min(...plainNotes.map((n) => hz(n.midi)));
    const high = Math.max(...plainNotes.map((n) => hz(n.midi)));
    const window = harmonicaRangeHz("diatonic-harmonica", key.id);
    assert.ok(window.minHz <= low && window.maxHz >= high, `${key.id} window ${JSON.stringify(window)} vs ${low}-${high}`);
    assert.ok(profile.minHz <= low && profile.maxHz >= high, `profile window covers key ${key.id}`);
  }
  assert.equal(harmonicaRangeHz("diatonic-harmonica", "c").minHz <= 261, true);
});

test("a pitch reachable several ways lists plain notes before bends and overblows, and can hide the advanced ones", () => {
  const chart = buildDiatonicHarmonicaChart("c");
  // G4 is hole 3 blow and hole 2 draw; both are plain notes.
  assert.deepEqual(routesForMidi(chart, 67).map((n) => n.id).sort(), ["2d0", "3b0"]);
  // Eb4 is only reachable as the hole 1 overblow.
  assert.deepEqual(routesForMidi(chart, 63, true).map((n) => n.id), ["1ob"]);
  assert.deepEqual(routesForMidi(chart, 63, false), []);
  assert.ok(playableMidis(chart, true).length > playableMidis(chart, false).length);
  for (const midi of playableMidis(chart, true)) {
    const bends = routesForMidi(chart, midi, true).map((n) => (n.advanced ? 9 : n.bend));
    assert.deepEqual(bends, [...bends].sort((x, y) => x - y), "plain, then bends, then advanced");
  }
});

test("the badge and caveat carry the honest wording", () => {
  assert.equal(HARMONICA_REVIEW, "Standard Richter layout, computed, not teacher-reviewed.");
  assert.match(HARMONICA_CAVEAT, /Bend availability varies by harp and player/);
  assert.equal(buildDiatonicHarmonicaChart("c").review, HARMONICA_REVIEW);
  assert.match(CHROMATIC_HARMONICA_CHART.review, /computed, not teacher-reviewed\.$/);
  assert.match(CHROMATIC_HARMONICA_CHART.caveat, /Bend availability varies by harp and player/);
});
