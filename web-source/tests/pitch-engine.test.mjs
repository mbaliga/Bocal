import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../app/pitch-engine.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "pitch-engine.ts",
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const pitch = await loadModule();
const sampleRate = 48_000;

function sineFrame(hz, amplitude = 0.16, phase = 0, length = 4096) {
  return Float32Array.from({ length }, (_, index) => {
    const t = (index + phase) / sampleRate;
    return amplitude * (
      Math.sin(2 * Math.PI * hz * t) +
      0.22 * Math.sin(2 * Math.PI * hz * 2 * t) +
      0.08 * Math.sin(2 * Math.PI * hz * 3 * t)
    );
  });
}

function centsBetween(actual, expected) {
  return 1200 * Math.log2(actual / expected);
}

test("silence and low room noise never invent a pitch", () => {
  const tracker = new pitch.StablePitchTracker({ calibrationMs: 0 });
  let seed = 42;
  const noise = Float32Array.from({ length: 4096 }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return ((seed / 0xffffffff) * 2 - 1) * 0.002;
  });
  for (let index = 0; index < 20; index += 1) {
    const frame = index % 2 ? noise : new Float32Array(4096);
    const reading = tracker.process(frame, sampleRate, index * 34);
    assert.equal(reading.hz, null);
    assert.equal(reading.accepted, false);
  }
});

test("a sustained A4 earns a stable lock instead of updating on every frame", () => {
  const tracker = new pitch.StablePitchTracker({ calibrationMs: 0 });
  let reading;
  for (let index = 0; index < 8; index += 1) {
    reading = tracker.process(sineFrame(440, 0.16, index * 211), sampleRate, index * 34);
  }
  assert.equal(reading.state, "locked");
  assert.equal(reading.accepted, true);
  assert.ok(Math.abs(centsBetween(reading.hz, 440)) < 1, `${reading.hz} Hz`);
  assert.ok(reading.confidence > 0.9);
});

test("a new note must persist before replacing the current lock", () => {
  const tracker = new pitch.StablePitchTracker({ calibrationMs: 0, acquireFrames: 3, switchFrames: 3 });
  for (let index = 0; index < 5; index += 1) {
    tracker.process(sineFrame(440, 0.17, index * 163), sampleRate, index * 34);
  }
  const oneFrame = tracker.process(sineFrame(466.1638, 0.17, 11), sampleRate, 200);
  assert.equal(oneFrame.state, "holding");
  assert.ok(Math.abs(centsBetween(oneFrame.hz, 440)) < 2);
  tracker.process(sineFrame(466.1638, 0.17, 177), sampleRate, 234);
  const switched = tracker.process(sineFrame(466.1638, 0.17, 349), sampleRate, 268);
  assert.equal(switched.state, "locked");
  assert.ok(Math.abs(centsBetween(switched.hz, 466.1638)) < 2);
});

test("brief dropouts hold the trusted note, then clear it", () => {
  const tracker = new pitch.StablePitchTracker({ calibrationMs: 0, holdMs: 550, clearMs: 1200 });
  for (let index = 0; index < 5; index += 1) {
    tracker.process(sineFrame(440), sampleRate, index * 34);
  }
  const held = tracker.process(new Float32Array(4096), sampleRate, 500);
  assert.equal(held.state, "holding");
  assert.ok(held.hz);
  const silent = tracker.process(new Float32Array(4096), sampleRate, 800);
  assert.equal(silent.state, "silence");
  assert.equal(silent.hz, null);
  const reacquiring = tracker.process(sineFrame(440), sampleRate, 834);
  assert.equal(reacquiring.state, "acquiring");
  assert.equal(reacquiring.hz, null);
  const cleared = tracker.process(new Float32Array(4096), sampleRate, 1500);
  assert.equal(cleared.state, "silence");
  assert.equal(cleared.hz, null);
});
