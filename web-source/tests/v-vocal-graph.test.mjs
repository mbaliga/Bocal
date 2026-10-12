// Package V-A: the Vocal graph, hold/review, range finder and warm-up feedback.
// Source-level guards for the things a person reading the screen is promised:
// honest copy, the three mount slots for later packages, and the wiring.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const VOCAL_SOURCES = [
  "../app/VocalStudio.tsx",
  "../app/VocalPitchGraph.tsx",
  "../app/vocal-graph.ts",
  "../app/vocal-graph-canvas.ts",
  "../app/vocal-range.ts",
  "../app/vocal-warmups.ts",
];

// Comments are the author's notes, not what a singer reads.
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("Vocal copy makes no claim of health, correctness, marks, grades, voice types or classification", async () => {
  for (const path of VOCAL_SOURCES) {
    const source = withoutComments(await read(path));
    for (const word of ["healthy", "correct", "score", "grade", "voice type", "classif"]) {
      assert.doesNotMatch(source, new RegExp(word, "i"), `${path} must not contain "${word}"`);
    }
  }
});

test("the range finder says the range is the one the singer chose to record", async () => {
  const studio = await read("../app/VocalStudio.tsx");
  assert.match(studio, /the range you chose to record/);
  assert.match(studio, /does not label or rank your voice/);
  assert.match(studio, /not a vocal-health measure/);
});

test("the three mount slots for later packages exist in VocalStudio and render nothing", async () => {
  const studio = await read("../app/VocalStudio.tsx");
  for (const slot of ["V-B: takes", "V-B: melody", "V-C: play-along"]) {
    assert.match(studio, new RegExp(`\\{/\\* ${slot} \\*/\\}`), `missing slot ${slot}`);
    assert.equal(studio.split(`{/* ${slot} */}`).length, 2, `slot ${slot} must appear exactly once`);
  }
});

test("vocal.css is imported by the Vocal workspace and globals.css does not carry the new rules", async () => {
  const studio = await read("../app/VocalStudio.tsx");
  const css = await read("../app/styles/vocal.css");
  const globals = await read("../app/globals.css");
  assert.match(studio, /import "\.\/styles\/vocal\.css";/);
  assert.match(css, /\.vocal-stage \{/);
  assert.match(css, /--vg-in:/);
  assert.doesNotMatch(globals, /vocal-stage|vocal-graph|--vg-/);
});

test("the graph is wired to the tuner's loop and keeps per-frame data out of React state", async () => {
  const graph = await read("../app/VocalPitchGraph.tsx");
  const tuner = await read("../app/useTuner.ts");
  const page = await read("../app/page.tsx");
  assert.match(tuner, /vocalGraph: vocalChannel\.source/);
  assert.match(tuner, /vocalChannel\.publish\(vocalSample\)/);
  assert.match(tuner, /VOCAL_HISTORY_MS = 120_000/);
  assert.match(graph, /source\.subscribe\(/);
  assert.match(graph, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(graph, /onPointerDown/);
  assert.match(graph, /setPointerCapture/);
  assert.match(graph, /prefers-reduced-motion: reduce/);
  // Hold and Live are real controls.
  assert.match(graph, /<Pause size=\{15\} \/> Hold/);
  assert.match(graph, /<Radio size=\{15\} \/> Live/);
  // No per-frame setState: the frame listener never calls a state setter.
  const listener = graph.slice(graph.indexOf("source.subscribe("), graph.indexOf("// Repaint once when anything"));
  assert.doesNotMatch(listener, /set[A-Z]\w*\(/);
  assert.match(page, /graph=\{tuner\.vocalGraph\}/);
  // One AudioContext per workspace: the graph and studio never construct their own.
  for (const path of VOCAL_SOURCES) assert.doesNotMatch(await read(path), /new AudioContext|new webkitAudioContext/);
});

test("the persisted range key is declared once, in storage-keys", async () => {
  const keys = await read("../app/storage-keys.ts");
  const studio = await read("../app/VocalStudio.tsx");
  assert.match(keys, /export const VOCAL_RANGE_KEY = "bocal-vocal-range-v1";/);
  assert.match(studio, /VOCAL_RANGE_KEY/);
  assert.doesNotMatch(studio, /localStorage/);
});

test("the new code stays inside what the Android WebView floor (Chrome 69) can run", async () => {
  for (const path of [...VOCAL_SOURCES, "../app/useTuner.ts"]) {
    const source = withoutComments(await read(path));
    assert.doesNotMatch(source, /\.at\(\s*-?\d+\s*\)/, `${path}: Array.prototype.at`);
    assert.doesNotMatch(source, /Object\.hasOwn\(/, `${path}: Object.hasOwn`);
    assert.doesNotMatch(source, /\?\?=|\|\|=|&&=/, `${path}: logical assignment`);
    assert.doesNotMatch(source, /\.replaceAll\(|\.findLast\(|structuredClone\(|\.toSorted\(/, `${path}: newer array/string API`);
  }
});

test("the warm-up cards keep their original text and the manual completion toggle", async () => {
  const studio = await read("../app/VocalStudio.tsx");
  for (const line of [
    "Choose a comfortable note, sing “ah” or “oo”, and keep the sound easy and even for four slow counts.",
    "Slide between two easy pitches. Stay in a comfortable range and stop if your voice feels strained.",
    "Take a quiet breath, begin without a hard push, then leave a little space before trying again.",
  ]) assert.ok(studio.includes(line), `missing warm-up text: ${line}`);
  assert.match(studio, /className=\{`vocal-studio-card \$\{isComplete \? "is-complete" : ""\}`\}/);
  assert.match(studio, /aria-pressed=\{isComplete\}/);
  assert.match(studio, /type: "vocal"/);
});
