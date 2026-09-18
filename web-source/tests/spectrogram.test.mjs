import assert from "node:assert/strict";
import test from "node:test";
import {
  hzToFraction,
  yForHz,
  hzForY,
  noteTicks,
  magnitudeColor,
  columnIntervalMs,
  SPECTROGRAM_MIN_HZ,
  SPECTROGRAM_MAX_HZ,
} from "../app/spectrogram.ts";

test("hzToFraction is 0 at the floor, 1 at the ceiling, and logarithmic in between", () => {
  assert.equal(hzToFraction(SPECTROGRAM_MIN_HZ), 0);
  assert.equal(hzToFraction(SPECTROGRAM_MAX_HZ), 1);
  // The octave from minHz to 2*minHz should take a fixed fraction of the
  // total log span, independent of which octave -- that's what "log
  // frequency" means for this axis.
  const octave1 = hzToFraction(SPECTROGRAM_MIN_HZ * 2) - hzToFraction(SPECTROGRAM_MIN_HZ);
  const octave2 = hzToFraction(SPECTROGRAM_MIN_HZ * 4) - hzToFraction(SPECTROGRAM_MIN_HZ * 2);
  assert.ok(Math.abs(octave1 - octave2) < 1e-9, `expected equal octave spacing, got ${octave1} vs ${octave2}`);
});

test("hzToFraction clamps outside the range instead of extrapolating", () => {
  assert.equal(hzToFraction(1), 0);
  assert.equal(hzToFraction(SPECTROGRAM_MAX_HZ * 10), 1);
});

test("yForHz puts low frequencies near the bottom and high frequencies near the top", () => {
  const height = 200;
  assert.equal(yForHz(SPECTROGRAM_MIN_HZ, height), height);
  assert.equal(yForHz(SPECTROGRAM_MAX_HZ, height), 0);
  assert.ok(yForHz(220, height) > yForHz(880, height), "a lower pitch should sit further down the axis");
});

test("hzForY is the inverse of yForHz across the range", () => {
  const height = 300;
  for (const hz of [55, 110, 220, 440, 880, 1760, 3520]) {
    const y = yForHz(hz, height);
    const back = hzForY(y, height);
    assert.ok(Math.abs(back - hz) < 0.5, `round-tripped ${hz} Hz through y=${y} as ${back} Hz`);
  }
});

test("hzForY clamps at the canvas edges", () => {
  const height = 100;
  assert.ok(Math.abs(hzForY(0, height) - SPECTROGRAM_MAX_HZ) < 1e-6);
  assert.ok(Math.abs(hzForY(height, height) - SPECTROGRAM_MIN_HZ) < 1e-6);
  assert.ok(Math.abs(hzForY(-50, height) - SPECTROGRAM_MAX_HZ) < 1e-6, "above the top clamps to the ceiling frequency");
  assert.ok(Math.abs(hzForY(height + 50, height) - SPECTROGRAM_MIN_HZ) < 1e-6, "below the bottom clamps to the floor frequency");
});

test("noteTicks returns one rising-midi tick per octave, all named C", () => {
  const ticks = noteTicks(55, 5000);
  assert.ok(ticks.length >= 6, `expected several octaves between 55 and 5000 Hz, got ${ticks.length}`);
  for (const tick of ticks) {
    assert.ok(tick.label.startsWith("C"));
    assert.ok(tick.hz >= 55 && tick.hz <= 5000);
    assert.ok(Math.abs(440 * 2 ** ((tick.midi - 69) / 12) - tick.hz) < 1e-6);
  }
  for (let index = 1; index < ticks.length; index += 1) {
    assert.equal(ticks[index].midi - ticks[index - 1].midi, 12, "consecutive ticks should be exactly an octave apart");
  }
});

test("noteTicks returns nothing for a degenerate or inverted range", () => {
  assert.deepEqual(noteTicks(100, 100), []);
  assert.deepEqual(noteTicks(1000, 100), []);
});

const THEME = { bg: "#0b0b0d", quiet: "#211d46", loud: "#08fed5", ink: "#f5f3eb", muted: "#8a8a86", line: "#3a3a40" };

test("magnitudeColor sits at the background colour at the floor and the loud colour at the ceiling", () => {
  assert.equal(magnitudeColor(-100, THEME, -100, -25), "rgb(11, 11, 13)");
  assert.equal(magnitudeColor(-25, THEME, -100, -25), "rgb(8, 254, 213)");
});

test("magnitudeColor clamps beyond the floor/ceiling instead of extrapolating", () => {
  assert.equal(magnitudeColor(-200, THEME, -100, -25), magnitudeColor(-100, THEME, -100, -25));
  assert.equal(magnitudeColor(0, THEME, -100, -25), magnitudeColor(-25, THEME, -100, -25));
});

test("magnitudeColor is monotonic in perceived brightness as dB rises", () => {
  const brightness = (rgb) => {
    const [r, g, b] = rgb.match(/\d+/g).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const samples = [-100, -80, -60, -40, -25].map((db) => brightness(magnitudeColor(db, THEME, -100, -25)));
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index] >= samples[index - 1] - 1e-6, `brightness should not fall as dB rises: ${samples}`);
  }
});

test("columnIntervalMs widens under reduced motion but never stops updating", () => {
  const normal = columnIntervalMs(false);
  const reduced = columnIntervalMs(true);
  assert.ok(normal > 0 && Number.isFinite(normal));
  assert.ok(reduced > normal, "reduced motion should scroll more slowly, not faster");
});
