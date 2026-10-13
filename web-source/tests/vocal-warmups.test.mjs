import assert from "node:assert/strict";
import test from "node:test";
import {
  GLIDE_DURATION_MS,
  GLIDE_LEAD_MS,
  ONSET_SILENCE_MS,
  OnsetDetector,
  SUSTAIN_FILL_MS,
  SUSTAIN_MIN_BAND_CENTS,
  SustainMeter,
  glidePath,
  glidePitchAt,
  glideRunning,
  makeGlideAttempt,
  sustainBandCents,
} from "../app/vocal-warmups.ts";

const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);

test("the sustain band follows Precision but is never tighter than 10 cents", () => {
  assert.equal(SUSTAIN_MIN_BAND_CENTS, 10);
  assert.equal(sustainBandCents(2), 10);
  assert.equal(sustainBandCents(5), 10);
  assert.equal(sustainBandCents(10), 10);
  assert.equal(sustainBandCents(25), 25);
});

test("the sustain ring fills while the pitch is inside the band and is full after four seconds", () => {
  const meter = new SustainMeter();
  for (let t = 0; t <= SUSTAIN_FILL_MS + 30; t += 30) meter.push(t, 57.03, 57, 10);
  assert.equal(meter.fill, 1);
  assert.equal(meter.reached, true);
  assert.ok(meter.inBandMs >= SUSTAIN_FILL_MS);
});

test("outside the band the ring eases back at half speed and unvoiced frames count as outside", () => {
  const meter = new SustainMeter();
  for (let t = 0; t <= 2000; t += 20) meter.push(t, 57, 57, 10);
  const full = meter.fill;
  assert.ok(full > 0.45 && full < 0.55);
  for (let t = 2020; t <= 3020; t += 20) meter.push(t, 58, 57, 10);
  near(meter.fill, full - 0.125, 0.03);
  const before = meter.fill;
  for (let t = 3040; t <= 3540; t += 20) meter.push(t, null, 57, 10);
  assert.ok(meter.fill < before);
  for (let t = 3560; t <= 30_000; t += 20) meter.push(t, null, 57, 10);
  assert.equal(meter.fill, 0);
  assert.equal(meter.reached, false, "never filled, so never reached");
});

test("a stalled frame does not jump the ring", () => {
  const meter = new SustainMeter();
  meter.push(0, 57, 57, 10);
  meter.push(60_000, 57, 57, 10);
  assert.ok(meter.fill < 0.05);
});

test("reset empties the ring", () => {
  const meter = new SustainMeter();
  for (let t = 0; t <= 5000; t += 30) meter.push(t, 57, 57, 10);
  meter.reset();
  assert.equal(meter.fill, 0);
  assert.equal(meter.reached, false);
  assert.equal(meter.inBandMs, 0);
});

test("a glide path is a siren: it starts on the first note, peaks on the second at the midpoint and returns", () => {
  const attempt = makeGlideAttempt(10_000, 55, 62);
  assert.equal(attempt.startMs, 10_000 + GLIDE_LEAD_MS);
  assert.equal(attempt.durationMs, GLIDE_DURATION_MS);
  near(glidePitchAt(attempt, attempt.startMs), 55);
  near(glidePitchAt(attempt, attempt.startMs + attempt.durationMs / 2), 62);
  near(glidePitchAt(attempt, attempt.startMs + attempt.durationMs), 55, 1e-9);
  assert.equal(glidePitchAt(attempt, attempt.startMs - 1), null);
  assert.equal(glidePitchAt(attempt, attempt.startMs + attempt.durationMs + 1), null);
  const quarter = glidePitchAt(attempt, attempt.startMs + attempt.durationMs / 4);
  near(quarter, 58.5, 1e-9);
});

test("the glide view is fixed for the attempt and releases after the tail", () => {
  const attempt = makeGlideAttempt(10_000, 55, 62);
  assert.equal(attempt.view.endMs, attempt.releaseMs);
  assert.equal(attempt.view.endMs - attempt.view.windowMs, 10_000);
  assert.equal(glideRunning(attempt, 12_000), true);
  assert.equal(glideRunning(attempt, attempt.releaseMs), false);
  assert.equal(glideRunning(null, 0), false);
  const points = glidePath(attempt, 8);
  assert.equal(points.length, 9);
  assert.equal(points[0].tMs, attempt.startMs);
  assert.equal(points[8].tMs, attempt.startMs + attempt.durationMs);
});

test("a descending siren works the same way", () => {
  const attempt = makeGlideAttempt(0, 64, 52);
  near(glidePitchAt(attempt, attempt.startMs + attempt.durationMs / 2), 52);
});

test("an attack is the first voiced frame after at least 300 ms of silence", () => {
  assert.equal(ONSET_SILENCE_MS, 300);
  const detector = new OnsetDetector();
  // Starts in silence, then a note.
  for (let t = 0; t < 360; t += 30) assert.equal(detector.push(t, null), null);
  const first = detector.push(360, 55.1);
  assert.deepEqual(first, { tMs: 360, pitch: 55.1 });
  // The note continues: no more onsets.
  for (let t = 390; t < 1000; t += 30) assert.equal(detector.push(t, 55), null);
  // A 240 ms breath is not enough.
  for (let t = 1000; t < 1240; t += 30) detector.push(t, null);
  assert.equal(detector.push(1240, 55), null);
  // 330 ms is.
  for (let t = 1270; t < 1600; t += 30) detector.push(t, null);
  const second = detector.push(1600, 56);
  assert.deepEqual(second, { tMs: 1600, pitch: 56 });
});

test("a voiced frame with no history is not an attack, but a long hole in the frames is", () => {
  const detector = new OnsetDetector();
  assert.equal(detector.push(0, 60), null);
  assert.equal(detector.push(30, 60), null);
  assert.deepEqual(detector.push(1000, 60), { tMs: 1000, pitch: 60 });
  detector.reset();
  assert.equal(detector.push(5000, 60), null);
});
