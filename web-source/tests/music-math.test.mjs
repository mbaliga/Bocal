import assert from "node:assert/strict";
import test from "node:test";
import { centsBetween, clamp, hzToMidi, median, midiToHz } from "../app/music-math.ts";

test("hzToMidi/midiToHz round-trip through A4 = 440Hz", () => {
  assert.equal(hzToMidi(440), 69);
  assert.equal(midiToHz(69), 440);
  assert.ok(Math.abs(hzToMidi(midiToHz(72.37)) - 72.37) < 1e-9);
  // A4 up an octave is 880Hz / MIDI 81.
  assert.equal(hzToMidi(880), 81);
  assert.equal(midiToHz(81), 880);
});

test("centsBetween is positive when the second frequency is sharper, zero for equal, symmetric under swap", () => {
  assert.equal(centsBetween(440, 440), 0);
  assert.ok(centsBetween(440, midiToHz(70)) > 0);
  assert.ok(Math.abs(centsBetween(440, midiToHz(70)) - 100) < 1e-9);
  assert.ok(centsBetween(440, midiToHz(68)) < 0);
  const a = centsBetween(440, 466.16);
  const b = centsBetween(466.16, 440);
  assert.ok(Math.abs(a + b) < 1e-9);
});

test("median matches the textbook definition for odd/even-length and empty arrays", () => {
  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  // Order of the input must not matter.
  assert.equal(median([9, 1, 5, 3, 7]), 5);
});

test("clamp bounds a value into [minimum, maximum] inclusive", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});
