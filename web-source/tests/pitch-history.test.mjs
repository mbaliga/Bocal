import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../app/pitch-history.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "pitch-history.ts",
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { PitchHistoryBuffer, detectStableSegments, MIN_STABLE_SEGMENT_FRAMES } = await loadModule();

test("pushes samples in order and reports length", () => {
  const buffer = new PitchHistoryBuffer(5);
  for (let i = 0; i < 3; i += 1) buffer.push({ tMs: i, cents: i, midi: 60 });
  assert.equal(buffer.length, 3);
  assert.deepEqual(buffer.toArray().map((sample) => sample.tMs), [0, 1, 2]);
});

test("oldest sample drops once capacity is exceeded", () => {
  const buffer = new PitchHistoryBuffer(4);
  for (let i = 0; i < 10; i += 1) buffer.push({ tMs: i, cents: i, midi: 60 });
  assert.equal(buffer.length, 4);
  assert.deepEqual(buffer.toArray().map((sample) => sample.tMs), [6, 7, 8, 9]);
});

test("pushing well past capacity still leaves exactly `capacity` newest samples", () => {
  const buffer = new PitchHistoryBuffer(10);
  for (let i = 0; i < 237; i += 1) buffer.push({ tMs: i, cents: 0, midi: 60 });
  assert.equal(buffer.length, 10);
  assert.deepEqual(buffer.toArray().map((sample) => sample.tMs), [227, 228, 229, 230, 231, 232, 233, 234, 235, 236]);
});

test("unvoiced frames are preserved as gaps, not dropped or coalesced", () => {
  const buffer = new PitchHistoryBuffer(10);
  buffer.push({ tMs: 0, cents: 3, midi: 60 });
  buffer.push({ tMs: 1, cents: null, midi: null });
  buffer.push({ tMs: 2, cents: null, midi: null });
  buffer.push({ tMs: 3, cents: -1, midi: 60 });
  const values = buffer.toArray();
  assert.equal(values.length, 4);
  assert.equal(values[1].cents, null);
  assert.equal(values[1].midi, null);
  assert.equal(values[2].cents, null);
  assert.equal(values[3].cents, -1);
});

test("clear empties the buffer", () => {
  const buffer = new PitchHistoryBuffer(5);
  buffer.push({ tMs: 0, cents: 0, midi: 60 });
  buffer.push({ tMs: 1, cents: 0, midi: 60 });
  buffer.clear();
  assert.equal(buffer.length, 0);
  assert.deepEqual(buffer.toArray(), []);
});

test("stable-segment detection groups >= MIN_STABLE_SEGMENT_FRAMES consecutive same-midi frames", () => {
  const samples = [
    ...Array.from({ length: 6 }, (_, i) => ({ tMs: i, cents: 1, midi: 60 })),
    { tMs: 6, cents: null, midi: null },
    ...Array.from({ length: 3 }, (_, i) => ({ tMs: 7 + i, cents: 2, midi: 62 })), // too short: dropped
    ...Array.from({ length: 8 }, (_, i) => ({ tMs: 10 + i, cents: -2, midi: 64 })),
  ];
  const segments = detectStableSegments(samples);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].midi, 60);
  assert.equal(segments[0].count, 6);
  assert.equal(segments[0].startIndex, 0);
  assert.equal(segments[0].endIndex, 5);
  assert.equal(segments[1].midi, 64);
  assert.equal(segments[1].count, 8);
  assert.ok(segments.every((segment) => segment.count >= MIN_STABLE_SEGMENT_FRAMES));
});

test("a note change ends a run even without a gap between the two notes", () => {
  const samples = [
    ...Array.from({ length: 5 }, (_, i) => ({ tMs: i, cents: 0, midi: 60 })),
    ...Array.from({ length: 5 }, (_, i) => ({ tMs: 5 + i, cents: 0, midi: 61 })),
  ];
  const segments = detectStableSegments(samples);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].endIndex, 4);
  assert.equal(segments[1].startIndex, 5);
});

test("meanCents averages the run's cents deviation", () => {
  const samples = [0, 2, 4, 6, 8].map((cents, i) => ({ tMs: i, cents, midi: 67 }));
  const segments = detectStableSegments(samples);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].meanCents, 4);
});

test("an empty or entirely-unvoiced buffer produces no segments", () => {
  assert.deepEqual(detectStableSegments([]), []);
  const silence = Array.from({ length: 20 }, (_, i) => ({ tMs: i, cents: null, midi: null }));
  assert.deepEqual(detectStableSegments(silence), []);
});

test("a custom minFrames threshold is honoured", () => {
  const samples = Array.from({ length: 3 }, (_, i) => ({ tMs: i, cents: 0, midi: 60 }));
  assert.equal(detectStableSegments(samples).length, 0, "default threshold (5) should drop a 3-frame run");
  assert.equal(detectStableSegments(samples, 3).length, 1, "a lowered threshold should keep the same 3-frame run");
});
