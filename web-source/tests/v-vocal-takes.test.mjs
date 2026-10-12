// Package V-B: saved vocal takes and target-melody feedback.
// Source-level guards for what a singer is promised on screen, the mount
// slots, the storage rules, and the audio-clock rule.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUNDLED_MELODIES } from "../app/melody-line.ts";
import { sanitizeTakeKind } from "../app/take-policy.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const NEW_SOURCES = ["../app/VocalTakes.tsx", "../app/MelodyTarget.tsx", "../app/melody-line.ts"];

// Comments are the author's notes, not what a singer reads.
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("the takes and melody copy makes no claim of health, correctness, marks, grades, voice types or classification", async () => {
  for (const path of NEW_SOURCES) {
    const source = withoutComments(await read(path));
    for (const word of ["healthy", "correct", "score", "grade", "voice type", "classif"]) {
      assert.doesNotMatch(source, new RegExp(word, "i"), `${path} must not contain "${word}"`);
    }
  }
});

test("both V-B slots are filled and the V-C slot carries the play-along drill", async () => {
  const studio = await read("../app/VocalStudio.tsx");
  assert.match(studio, /\{\/\* V-B: takes \*\/\}\s*<VocalTakes\b/);
  assert.match(studio, /\{\/\* V-B: melody \*\/\}\s*<MelodyTarget\b/);
  assert.equal(studio.split("{/* V-C: play-along */}").length, 2, "the V-C slot appears exactly once, verbatim");
  assert.match(studio, /\{\/\* V-C: play-along \*\/\}\s*<CallAndResponse\b/, "the play-along drill fills the V-C slot");
  assert.match(studio, /import \{ VocalTakes \} from "\.\/VocalTakes";/);
  assert.match(studio, /import \{ MelodyTarget, type PlayReference \} from "\.\/MelodyTarget";/);
});

test("the six bundled melodies are labelled as Bocal's own and carry source bundled", async () => {
  assert.equal(BUNDLED_MELODIES.length, 6);
  for (const melody of BUNDLED_MELODIES) assert.equal(melody.source, "bundled", melody.name);
  const player = await read("../app/MelodyTarget.tsx");
  assert.match(player, /Bocal’s own exercise/);
  const melodyLine = await read("../app/melody-line.ts");
  assert.equal((melodyLine.match(/source: "bundled",/g) || []).length, 6);
  for (const name of ["Five-note scale", "Arpeggio", "Octave leap", "Siren", "Descending fifth", "Sustained third"]) {
    assert.ok(melodyLine.includes(`name: "${name}"`), `missing bundled melody ${name}`);
  }
});

test("vocal.css carries the V-B header and globals.css is untouched by it", async () => {
  const css = await read("../app/styles/vocal.css");
  const globals = await read("../app/globals.css");
  assert.match(css, /\/\* V-B: takes and melody targets \*\//);
  assert.match(css, /\.vocal-takes,/);
  assert.match(css, /\.vocal-melody-results/);
  assert.doesNotMatch(globals, /vocal-takes|vocal-melody|vocal-take-/);
});

test("the melody feedback says it is pitch only and makes no timing or technique judgement", async () => {
  const player = await read("../app/MelodyTarget.tsx");
  assert.match(player, /pitch information only/);
  assert.match(player, /does not judge your timing, your technique or how the notes sound/);
  assert.match(player, /say nothing about timing, technique or tone/);
  assert.match(player, /not a mark/);
  const takes = await read("../app/VocalTakes.tsx");
  assert.match(takes, /it does not rate it/);
});

test("the melody is played on the AudioContext clock and no timer decides when a note sounds", async () => {
  const player = withoutComments(await read("../app/MelodyTarget.tsx"));
  const melodyLine = withoutComments(await read("../app/melody-line.ts"));
  const takes = withoutComments(await read("../app/VocalTakes.tsx"));
  for (const [path, source] of [["MelodyTarget.tsx", player], ["melody-line.ts", melodyLine]]) {
    assert.doesNotMatch(source, /setTimeout|setInterval/, `${path} must not use a timer for audio`);
    assert.doesNotMatch(source, /new AudioContext|new webkitAudioContext/, `${path} must not open an AudioContext`);
  }
  assert.doesNotMatch(takes, /new AudioContext|new webkitAudioContext/);
  const tuner = withoutComments(await read("../app/useTuner.ts"));
  const sequence = tuner.slice(tuner.indexOf("const playReferenceSequence"), tuner.indexOf("const playReferenceTone"));
  assert.ok(sequence.length > 200, "found the sequence scheduler");
  assert.match(sequence, /oscillator\.start\(begin\)/);
  assert.match(sequence, /oscillator\.stop\(end\)/);
  assert.match(sequence, /audioContext\.currentTime \+ SEQUENCE_SAFETY_SECONDS/);
  assert.doesNotMatch(sequence, /setTimeout|setInterval/);
  assert.match(sequence, /audioContextRef\.current/, "it shares the tuner's one AudioContext");
});

test("user melodies are stored under the declared key and only through the sanitiser", async () => {
  const keys = await read("../app/storage-keys.ts");
  const player = await read("../app/MelodyTarget.tsx");
  assert.match(keys, /export const VOCAL_MELODIES_KEY = "bocal-vocal-melodies-v1";/);
  assert.match(player, /usePersistedSetting<Melody\[\]>\(VOCAL_MELODIES_KEY, parseMelodies, \[\], serialiseMelodies\)/);
  assert.doesNotMatch(player, /localStorage/);
});

test("vocal takes use the Analyze capture gate and the shared library, and never evict", async () => {
  const takes = await read("../app/VocalTakes.tsx");
  const store = await read("../app/takes-store.ts");
  const policy = await read("../app/take-policy.ts");
  for (const name of ["canCreateTake", "CaptureRequestGate", "KeyedTaskQueue", "MAX_TAKES", "putStoredTake", "listStoredTakes", "saveOrShareFile", "extensionForMime", "forgetTakeAnalysis"]) {
    assert.ok(takes.includes(name), `VocalTakes uses ${name}`);
  }
  assert.match(takes, /kind: "vocal"/);
  assert.match(takes, /canCreateTake\(allTakesRef\.current\.length, libraryReadyRef\.current, MAX_TAKES\)/);
  // The only delete is the person's own, after a confirmation, and it is queued behind earlier writes to that take.
  assert.equal(takes.split("deleteStoredTake(").length, 2, "one delete call");
  assert.match(takes, /window\.confirm\(`Delete/);
  assert.match(takes, /writesRef\.current\.run\(id, async \(\) => !persistedIdsRef\.current\.has\(id\) \|\| await deleteStoredTake\(id\)\)/);
  assert.match(takes, /if \(removed\)/);
  // The kind is part of the stored take and is cleaned on the way in and out.
  assert.match(store, /kind\?: TakeKind;/);
  assert.match(store, /sanitizeTakeKind\(storedKind\)/);
  assert.match(policy, /export function sanitizeTakeKind/);
  assert.equal(sanitizeTakeKind("vocal"), "vocal");
  for (const other of [undefined, null, "instrument", "Vocal", 1, {}, []]) assert.equal(sanitizeTakeKind(other), undefined);
  assert.match(store, /export const MAX_TAKES = 12;/);
});

test("the take pitch line reuses the Analyze analysis and the live graph's scaling, behind a presentation prop", async () => {
  const trace = await read("../app/TakePitchTrace.tsx");
  const takes = await read("../app/VocalTakes.tsx");
  assert.match(trace, /export type TakeVocalView =/);
  assert.match(trace, /vocal\?: TakeVocalView;/);
  assert.match(trace, /takePitchView\(/);
  assert.match(trace, /pitchTicks\(/);
  assert.match(trace, /pitchTrackFrames\(/);
  assert.match(takes, /<TakePitchTrace/);
  assert.match(takes, /overlayTakeId=\{compare \? compare\.id : undefined\}/);
  assert.match(takes, /vocal=\{\{ range, toleranceCents \}\}/);
});

test("the Analyze workspace is untouched by the vocal presentation", async () => {
  const analysis = await read("../app/AnalysisView.tsx");
  assert.doesNotMatch(analysis, /vocal=\{|kind: "vocal"|VocalTakes|MelodyTarget/);
  // An instrument take (no `vocal` prop) still takes the original paths.
  const trace = await read("../app/TakePitchTrace.tsx");
  assert.match(trace, /colorForCents\(frame\.cents\)/);
  assert.match(trace, /Math\.min\(\.\.\.writtenMidis\) - 2/);
  assert.match(trace, /\{!isVocal && analysis\.stats\.length > 0 && \(/);
});

test("the graph draws a melody pass as bands and pins its time window, and old overlays still work", async () => {
  const canvas = await read("../app/vocal-graph-canvas.ts");
  const graph = await read("../app/VocalPitchGraph.tsx");
  assert.match(canvas, /export type MelodyOverlay =/);
  assert.match(canvas, /melody\?: MelodyOverlay \| null;/);
  assert.match(canvas, /EMPTY_OVERLAY: GraphOverlay = \{ sustain: null, glide: null, onsets: \[\], capturedLow: null, melody: null \}/);
  assert.match(graph, /overlay\.melody && overlay\.melody\.view/);
  assert.match(graph, /basePitchView\(/);
});

test("the stage hands graph taps to the melody editor only while it is open", async () => {
  const studio = await read("../app/VocalStudio.tsx");
  const player = await read("../app/MelodyTarget.tsx");
  assert.match(studio, /onPickNote=\{pickNote\}/);
  assert.match(studio, /melodyPick && melodyPick\(midi\)/);
  assert.match(player, /pickNoteRef\.current = \(midi: number\) =>/);
  assert.match(player, /return \(\) => \{ pickNoteRef\.current = null; \};/);
});

test("the new code stays inside what the Android WebView floor (Chrome 69) can run", async () => {
  for (const path of [...NEW_SOURCES, "../app/takes-store.ts", "../app/take-policy.ts", "../app/TakePitchTrace.tsx", "../app/useTuner.ts", "../app/vocal-graph-canvas.ts"]) {
    const source = withoutComments(await read(path));
    assert.doesNotMatch(source, /\.at\(\s*-?\d+\s*\)/, `${path}: Array.prototype.at`);
    assert.doesNotMatch(source, /Object\.hasOwn\(/, `${path}: Object.hasOwn`);
    assert.doesNotMatch(source, /\?\?=|\|\|=|&&=/, `${path}: logical assignment`);
    assert.doesNotMatch(source, /\.replaceAll\(|\.findLast\(|structuredClone\(|\.toSorted\(|Object\.fromEntries\(/, `${path}: newer array/string/object API`);
  }
});

test("the tuner's single-note reference tone still works and a sequence is capped", async () => {
  const tuner = await read("../app/useTuner.ts");
  assert.match(tuner, /MAX_REFERENCE_SEQUENCE_TONES = 64/);
  assert.match(tuner, /if \(typeof request !== "number"\) return playReferenceSequence\(request\);/);
  assert.match(tuner, /sequenceStopRef\.current\?\.\(\);\s*tunerGateRef\.current\.cancel\(\);/);
  const page = await read("../app/page.tsx");
  assert.match(page, /playReference=\{tuner\.playReference\}/);
  assert.match(page, /onReference=\{\(\) => tuner\.playReference\(\)\}/);
});
