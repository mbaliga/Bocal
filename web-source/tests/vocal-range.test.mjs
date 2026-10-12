import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTURE_HOLD_MS,
  RangeCapture,
  VOCAL_RANGE_MAX_MIDI,
  VOCAL_RANGE_MIN_MIDI,
  barFraction,
  buildVocalRange,
  median,
  octaveSpanLabel,
  parseVocalRange,
  sanitizeVocalRange,
  semitoneCountLabel,
  serializeVocalRange,
} from "../app/vocal-range.ts";
import { VOCAL_RANGE_KEY } from "../app/storage-keys.ts";

test("the storage key is the versioned constant", () => {
  assert.equal(VOCAL_RANGE_KEY, "bocal-vocal-range-v1");
});

test("median of an odd, even and empty list", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
  assert.equal(median([5, 5, 5, 90]), 5);
});

test("sanitiser keeps a good range and returns a clean copy", () => {
  const stored = { low: 45, high: 69, savedAt: 1_760_000_000_000, extra: "ignored" };
  const clean = sanitizeVocalRange(stored);
  assert.deepEqual(clean, { low: 45, high: 69, savedAt: 1_760_000_000_000 });
  assert.notEqual(clean, stored);
});

test("sanitiser rejects garbage", () => {
  const good = { low: 45, high: 69, savedAt: 1 };
  const bad = [
    null, undefined, "range", 42, true, [], [45, 69],
    {}, { low: 45 }, { high: 69, savedAt: 1 },
    { ...good, low: 45.5 }, { ...good, high: 69.2 },
    { ...good, low: "45" }, { ...good, high: null },
    { ...good, low: 69, high: 45 }, { ...good, low: 60, high: 60 },
    { ...good, low: VOCAL_RANGE_MIN_MIDI - 1 }, { ...good, high: VOCAL_RANGE_MAX_MIDI + 1 },
    { ...good, low: Number.NaN }, { ...good, high: Number.POSITIVE_INFINITY },
    { ...good, savedAt: 0 }, { ...good, savedAt: -5 }, { ...good, savedAt: "yesterday" }, { ...good, savedAt: Number.NaN },
    { low: 45, high: 69 },
  ];
  for (const value of bad) assert.equal(sanitizeVocalRange(value), null, `should reject ${JSON.stringify(value)}`);
});

test("stored strings that are not JSON, or not a range, mean no range", () => {
  for (const raw of [null, "", "not json", "{", "[]", "null", "42", '"x"', '{"low":70,"high":50,"savedAt":1}', '{"low":1,"high":2,"savedAt":1}']) {
    assert.equal(parseVocalRange(raw), null, `should reject ${raw}`);
  }
});

test("persistence round trip through a storage that only holds strings", () => {
  const storage = new Map();
  const range = { low: 43, high: 74, savedAt: 1_760_123_456_789 };
  storage.set(VOCAL_RANGE_KEY, serializeVocalRange(range));
  assert.equal(typeof storage.get(VOCAL_RANGE_KEY), "string");
  assert.deepEqual(parseVocalRange(storage.get(VOCAL_RANGE_KEY)), range);
  // Clearing writes a value that reads back as no range.
  storage.set(VOCAL_RANGE_KEY, serializeVocalRange(null));
  assert.equal(parseVocalRange(storage.get(VOCAL_RANGE_KEY)), null);
  // An unusable range is never written as if it were good.
  assert.equal(serializeVocalRange({ low: 70, high: 40, savedAt: 1 }), "null");
});

test("building a range needs the second note above the first", () => {
  assert.deepEqual(buildVocalRange(48, 72, 5), { range: { low: 48, high: 72, savedAt: 5 }, reason: "ok" });
  assert.equal(buildVocalRange(72, 48, 5).reason, "order");
  assert.equal(buildVocalRange(60, 60, 5).reason, "order");
  assert.equal(buildVocalRange(48, 200, 5).reason, "out-of-bounds");
});

test("labels for the range card", () => {
  assert.equal(semitoneCountLabel({ low: 48, high: 65 }), "17 semitones");
  assert.equal(semitoneCountLabel({ low: 48, high: 49 }), "1 semitone");
  assert.equal(octaveSpanLabel({ low: 48, high: 65 }), "1 octave and 5 semitones");
  assert.equal(octaveSpanLabel({ low: 48, high: 72 }), "2 octaves");
  assert.equal(octaveSpanLabel({ low: 48, high: 50 }), "2 semitones");
  assert.equal(barFraction(60, 36, 84), 0.5);
  assert.equal(barFraction(10, 36, 84), 0);
  assert.equal(barFraction(100, 36, 84), 1);
});

// Feeds a capture one reading every 30 ms.
function feed(capture, startMs, durationMs, pitchAt) {
  let result = null;
  for (let t = startMs; t <= startMs + durationMs; t += 30) result = capture.push(t, pitchAt(t));
  return result;
}

test("a two second steady hold records the median of the readings, rounded to a note", () => {
  const capture = new RangeCapture();
  assert.equal(capture.phase, "waiting");
  // Mostly 47.4 with a few stray high readings: the median ignores them.
  const result = feed(capture, 0, CAPTURE_HOLD_MS + 60, (t) => (t % 300 === 0 ? 48.9 : 47.4));
  assert.ok(result);
  assert.equal(result.midi, 47);
  assert.ok(Math.abs(result.pitch - 47.4) < 1e-9);
  assert.equal(capture.phase, "done");
  assert.equal(capture.progress(5000), 1);
});

test("progress runs from 0 to 1 across the hold", () => {
  const capture = new RangeCapture();
  capture.push(1000, 60);
  assert.equal(capture.phase, "holding");
  assert.equal(capture.progress(1000), 0);
  assert.equal(capture.progress(2000), 0.5);
  assert.equal(capture.progress(9000), 1);
});

test("nothing is recorded before two seconds have passed", () => {
  const capture = new RangeCapture();
  assert.equal(feed(capture, 0, 1800, () => 55), null);
  assert.equal(capture.captured, null);
});

test("a dropout longer than 300 ms restarts the hold", () => {
  const capture = new RangeCapture();
  feed(capture, 0, 1500, () => 55);
  for (let t = 1530; t < 2100; t += 30) capture.push(t, null);
  assert.equal(capture.phase, "waiting");
  // 1.5 s more is still not two seconds from the restart.
  assert.equal(feed(capture, 2100, 1500, () => 55), null);
  assert.ok(feed(capture, 3630, 700, () => 55));
});

test("a short flicker under 300 ms does not restart the hold", () => {
  const capture = new RangeCapture();
  feed(capture, 0, 900, () => 55);
  capture.push(930, null);
  capture.push(960, null);
  assert.ok(feed(capture, 990, 1500, () => 55));
});

test("wandering more than a semitone and a half restarts the hold instead of averaging two notes", () => {
  const capture = new RangeCapture();
  feed(capture, 0, 1500, () => 50);
  assert.equal(feed(capture, 1530, 1000, () => 53), null, "the new note starts its own two seconds");
  const result = feed(capture, 2560, 1500, () => 53);
  assert.equal(result.midi, 53);
});

test("a finished capture stays finished until reset", () => {
  const capture = new RangeCapture();
  const first = feed(capture, 0, 2200, () => 50);
  assert.equal(first.midi, 50);
  assert.equal(capture.push(9000, 70).midi, 50);
  capture.reset();
  assert.equal(capture.phase, "waiting");
  assert.equal(capture.captured, null);
});
