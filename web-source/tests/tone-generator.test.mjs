import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERVALS,
  intervalById,
  intervalPartnerMidi,
  clampPartnerMidi,
  CHORD_QUALITIES,
  chordMidis,
  chordFrequencies,
  EXERCISE_PATTERNS,
  exerciseMidis,
  exerciseTones,
} from "../app/tone-math.ts";

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

test("every interval m2 through P8 plus P12 and two octaves is offered", () => {
  const ids = INTERVALS.map((interval) => interval.id);
  assert.deepEqual(ids, ["m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7", "P8", "P12", "P15"]);
  assert.equal(intervalById("P8").semitones, 12);
  assert.equal(intervalById("P12").semitones, 19);
  assert.equal(intervalById("P15").semitones, 24);
});

test("interval partner moves above or below the tapped key by the chosen distance", () => {
  const fifth = intervalById("P5").semitones;
  assert.equal(intervalPartnerMidi(60, fifth, "above"), 67); // C4 -> G4
  assert.equal(intervalPartnerMidi(60, fifth, "below"), 53); // C4 -> F3
});

test("interval partner clamps to a note that will actually sound", () => {
  const twoOctaves = intervalById("P15").semitones;
  const partner = intervalPartnerMidi(24, twoOctaves, "below"); // MIDI 0
  assert.equal(partner, 0);
  assert.equal(clampPartnerMidi(partner), 12);
  assert.equal(clampPartnerMidi(40), 40); // already sounding, untouched
});

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

test("every required chord quality is offered with the right tone stack", () => {
  const byId = Object.fromEntries(CHORD_QUALITIES.map((quality) => [quality.id, quality.intervals]));
  assert.deepEqual(byId.major, [0, 4, 7]);
  assert.deepEqual(byId.minor, [0, 3, 7]);
  assert.deepEqual(byId.diminished, [0, 3, 6]);
  assert.deepEqual(byId.augmented, [0, 4, 8]);
  assert.deepEqual(byId.dominant7, [0, 4, 7, 10]);
  assert.deepEqual(byId.major7, [0, 4, 7, 11]);
  assert.deepEqual(byId.minor7, [0, 3, 7, 10]);
  assert.deepEqual(byId.sus4, [0, 5, 7]);
});

test("close voicing stacks the chord immediately above the root; root voicing adds the root an octave down", () => {
  assert.deepEqual(chordMidis(60, "major", "close"), [60, 64, 67]);
  assert.deepEqual(chordMidis(60, "major", "root"), [48, 60, 64, 67]);
});

test("a just-tuned C major triad at A=440 is beat-free: pure 5:4 third and 3:2 fifth", () => {
  // Sourced from the brief: 261.63 / 327.03 / 392.44 Hz.
  const hz = chordFrequencies(60, "major", "close", { referenceHz: 440, temperament: "just", keyPc: 0 });
  assert.equal(hz.length, 3);
  const [root, third, fifth] = hz;
  assert.ok(Math.abs(root - 261.63) < 0.01, `expected root ~261.63, got ${root}`);
  assert.ok(Math.abs(third - 327.03) < 0.01, `expected third ~327.03, got ${third}`);
  assert.ok(Math.abs(fifth - 392.44) < 0.01, `expected fifth ~392.44, got ${fifth}`);

  // The pure ratios themselves, independent of the tabled cents values.
  assert.ok(Math.abs(third / root - 5 / 4) < 0.0005, `expected a pure 5:4 third, got ${third / root}`);
  assert.ok(Math.abs(fifth / root - 3 / 2) < 0.0005, `expected a pure 3:2 fifth, got ${fifth / root}`);
});

test("a just-tuned chord stays beat-free around its own root even when the tuner is calibrated to a different key", () => {
  // The tuner's global key centre is set to G (pc 7); a C major triad tapped
  // under it must still tune around C, not G, to stay beat-free.
  const hz = chordFrequencies(60, "major", "close", { referenceHz: 440, temperament: "just", keyPc: 7 });
  const [root, third, fifth] = hz;
  assert.ok(Math.abs(third / root - 5 / 4) < 0.0005);
  assert.ok(Math.abs(fifth / root - 3 / 2) < 0.0005);
});

test("under equal temperament a chord is plain equal-tempered, unaffected by voicing or key centre", () => {
  const hz = chordFrequencies(60, "minor7", "close", { referenceHz: 440, temperament: "equal", keyPc: 7 });
  const expected = [60, 63, 67, 70].map((midi) => 440 * 2 ** ((midi - 69) / 12));
  hz.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9));
});

test("every chord quality is genuinely beat-free under just intonation, not only major/minor/maj7/sus4", () => {
  const root = 261.6255653005986; // equal-tempered C4 at A=440, exact
  const cases = [
    ["major", [1, 5 / 4, 3 / 2]],
    ["minor", [1, 6 / 5, 3 / 2]],
    ["diminished", [1, 6 / 5, 7 / 5]],
    ["augmented", [1, 5 / 4, 25 / 16]],
    ["dominant7", [1, 5 / 4, 3 / 2, 7 / 4]],
    ["major7", [1, 5 / 4, 3 / 2, 15 / 8]],
    ["minor7", [1, 6 / 5, 3 / 2, 9 / 5]],
    ["sus4", [1, 4 / 3, 3 / 2]],
  ];
  for (const [quality, ratios] of cases) {
    const hz = chordFrequencies(60, quality, "close", { referenceHz: 440, temperament: "just", keyPc: 0 });
    assert.equal(hz.length, ratios.length, `${quality}: wrong tone count`);
    ratios.forEach((ratio, index) => {
      assert.ok(Math.abs(hz[index] / root - ratio) < 1e-9, `${quality}[${index}]: expected ratio ${ratio}, got ${hz[index] / root}`);
    });
  }
});

test("root voicing under just intonation adds the root an exact octave down", () => {
  const close = chordFrequencies(60, "dominant7", "close", { referenceHz: 440, temperament: "just", keyPc: 0 });
  const root = chordFrequencies(60, "dominant7", "root", { referenceHz: 440, temperament: "just", keyPc: 0 });
  assert.equal(root.length, close.length + 1);
  assert.ok(Math.abs(root[0] - close[0] / 2) < 1e-9);
  assert.deepEqual(root.slice(1), close);
});

// ---------------------------------------------------------------------------
// Exercise patterns
// ---------------------------------------------------------------------------

test("every exercise pattern is offered", () => {
  assert.deepEqual(
    EXERCISE_PATTERNS.map((pattern) => pattern.id),
    ["chromatic", "major-scale", "harmonic-series", "interval-leaps"],
  );
});

test("chromatic scale runs every semitone from the root to the octave above", () => {
  assert.deepEqual(exerciseMidis(60, "chromatic"), Array.from({ length: 13 }, (_, i) => 60 + i));
});

test("major scale runs the diatonic degrees from the root to the octave above", () => {
  assert.deepEqual(exerciseMidis(60, "major-scale"), [60, 62, 64, 65, 67, 69, 71, 72]);
});

test("harmonic series from a low B-flat gives the equal-tempered notes nearest partials 1-12", () => {
  // Partials 1-8 sourced from the brief; 9-12 continue the same
  // 12*log2(n)-above-the-root rounding.
  assert.deepEqual(exerciseMidis(46, "harmonic-series"), [46, 58, 65, 70, 74, 77, 80, 82, 84, 86, 88, 89]);
});

test("interval leaps slur between the root and the chosen interval, repeating the requested number of times", () => {
  assert.deepEqual(
    exerciseMidis(60, "interval-leaps", { intervalSemitones: 7, leapRepeats: 3 }),
    [60, 67, 60, 67, 60, 67],
  );
  // Defaults to a perfect 5th, four repeats.
  assert.deepEqual(exerciseMidis(60, "interval-leaps"), [60, 67, 60, 67, 60, 67, 60, 67]);
});

test("harmonic series plays the true rootHz * n frequency, not the rounded equal-tempered note", () => {
  // From a low B-flat (MIDI 46), the true 7th partial should be ~31 cents
  // flat of the equal-tempered note the brief measured it lands nearest to.
  const tuning = { referenceHz: 440, temperament: "equal", keyPc: 0 };
  const tones = exerciseTones(46, "harmonic-series", tuning);
  assert.equal(tones.length, 12);
  const rootHz = 440 * 2 ** ((46 - 69) / 12);
  tones.forEach((tone, index) => {
    const n = index + 1;
    assert.ok(Math.abs(tone.hz - rootHz * n) < 1e-9, `partial ${n}: expected ${rootHz * n}, got ${tone.hz}`);
  });
  const seventh = tones[6];
  assert.ok(Math.abs(seventh.cents - -31.2) < 0.5, `expected 7th partial ~-31.2 cents from its label, got ${seventh.cents}`);
});

test("harmonic series can skip the fundamental", () => {
  const tuning = { referenceHz: 440, temperament: "equal", keyPc: 0 };
  const tones = exerciseTones(60, "harmonic-series", tuning, { skipFundamental: true });
  assert.equal(tones.length, 11);
  const rootHz = 440 * 2 ** ((60 - 69) / 12);
  assert.ok(Math.abs(tones[0].hz - rootHz * 2) < 1e-9); // first tone is now partial 2
});

test("every non-harmonic-series pattern sounds exactly at its labelled note (0 cents)", () => {
  const tuning = { referenceHz: 440, temperament: "equal", keyPc: 0 };
  for (const pattern of ["chromatic", "major-scale", "interval-leaps"]) {
    const tones = exerciseTones(60, pattern, tuning);
    tones.forEach((tone) => assert.equal(tone.cents, 0, `${pattern} should have zero cents deviation`));
  }
});

// ---------------------------------------------------------------------------
// Audio: the start-pop fix, verified with an offline render in headless
// Chromium -- see scratchpad review/tone-generator/measure.mjs, which found
// a 0.986 peak in the first 10ms (a ~30dB pop) against the shipped sequence.
// ---------------------------------------------------------------------------

test("fixed playVoice + rescaleVoices sequence keeps the first 10ms peak below 1.5x the target level", async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs"));
  } catch {
    t.skip("Playwright/Chromium not available in this environment");
    return;
  }
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  try {
    const page = await browser.newPage();
    await page.setContent("<html><body></body></html>");
    const result = await page.evaluate(async () => {
      const sr = 48000;
      const target = 0.12;
      const ctx = new OfflineAudioContext(1, Math.round(sr * 0.5), sr);

      // The fixed sequence from ToneGenerator.tsx's playVoice + rescaleVoices:
      // seed the intrinsic value (not a scheduled event), then cancelAndHold
      // + setTargetAtTime on the very next statement, exactly as rescaleVoices
      // runs synchronously right after a voice is created.
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      osc.connect(gain);
      osc.start();

      // rescaleVoices(), single voice:
      const perOscillator = target / Math.sqrt(1);
      if (typeof gain.gain.cancelAndHoldAtTime === "function") {
        gain.gain.cancelAndHoldAtTime(ctx.currentTime);
      } else {
        gain.gain.cancelScheduledValues(ctx.currentTime);
      }
      gain.gain.setTargetAtTime(perOscillator, ctx.currentTime, 0.035);

      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < Math.round(sr * 0.01); i += 1) peak = Math.max(peak, Math.abs(data[i]));
      return { peak, target };
    });
    assert.ok(
      result.peak < result.target * 1.5,
      `first-10ms peak ${result.peak} should be below 1.5x the target level ${result.target} (was 0.986 vs 0.12 before the fix)`,
    );
  } finally {
    await browser.close();
  }
});
