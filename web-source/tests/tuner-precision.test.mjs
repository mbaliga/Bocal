// Cents-to-tenths (tuner.md's "still missing" precision gap) and the dBFS
// level meter's pure math.
import assert from "node:assert/strict";
import test from "node:test";
import { formatCents, LEVEL_FLOOR_DBFS, rmsToDbfs } from "../app/useTuner.ts";
import { readingFor } from "../app/tuning.ts";

const equalAt440 = { referenceHz: 440, temperament: "equal", keyPc: 0 };

test("readingFor keeps whole-cent `cents` for existing callers but adds tenths-precision centsTenths", () => {
  // A4 + 3.4 cents: whole-cent rounding can't tell this apart from +3 or
  // +3.9, but the ±2¢ (Ultra) precision setting needs to.
  const hz = 440 * 2 ** (3.4 / 1200);
  const reading = readingFor(hz, equalAt440);
  assert.equal(reading.concertMidi, 69);
  assert.equal(reading.cents, 3);
  assert.ok(Math.abs(reading.centsTenths - 3.4) < 0.05, `expected ~3.4, got ${reading.centsTenths}`);
});

test("centsTenths rounds to the nearest tenth, not an arbitrary float", () => {
  const hz = 440 * 2 ** (3.44 / 1200);
  const reading = readingFor(hz, equalAt440);
  assert.equal(reading.centsTenths, 3.4);
  const hz2 = 440 * 2 ** (3.46 / 1200);
  const reading2 = readingFor(hz2, equalAt440);
  assert.equal(reading2.centsTenths, 3.5);
});

test("formatCents shows whole cents at standard/fine precision", () => {
  assert.equal(formatCents(3.4, "standard"), "3");
  assert.equal(formatCents(-7.8, "fine"), "-8");
  assert.equal(formatCents(0, "standard"), "0");
});

test("formatCents shows one decimal only at Ultra (±2¢) precision", () => {
  assert.equal(formatCents(3.4, "ultra"), "3.4");
  assert.equal(formatCents(-1.25, "ultra"), "-1.3");
  assert.equal(formatCents(0, "ultra"), "0.0");
});

test("rmsToDbfs: 0dBFS at full scale, floored rather than -Infinity at silence", () => {
  assert.equal(rmsToDbfs(1), 0);
  assert.equal(rmsToDbfs(0), LEVEL_FLOOR_DBFS);
  assert.equal(rmsToDbfs(1e-12), LEVEL_FLOOR_DBFS);
  // Halving amplitude is -6.02dBFS.
  assert.ok(Math.abs(rmsToDbfs(0.5) - -6.02) < 0.01, `expected ~-6.02, got ${rmsToDbfs(0.5)}`);
});

test("rmsToDbfs is monotonic: louder input never reads a lower level", () => {
  const levels = [0, 0.001, 0.01, 0.1, 0.5, 1].map(rmsToDbfs);
  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] >= levels[index - 1], `${levels[index - 1]} -> ${levels[index]} should not decrease`);
  }
});
