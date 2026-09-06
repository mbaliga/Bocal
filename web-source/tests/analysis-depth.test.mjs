import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function transpile(relativePath, fileName, rewrites = {}) {
  let source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(rewrites)) {
    source = source.replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName,
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

const engineUrl = await transpile("../app/pitch-engine.ts", "pitch-engine.ts");
const tuningUrl = await transpile("../app/tuning.ts", "tuning.ts");
const transcribeUrl = await transpile("../app/transcribe.ts", "transcribe.ts", {
  "./pitch-engine": engineUrl,
  "./tuning": tuningUrl,
});
const harmonicsUrl = await transpile("../app/harmonics.ts", "harmonics.ts");
const toneStatsUrl = await transpile("../app/tone-stats.ts", "tone-stats.ts", { "./transcribe": transcribeUrl });
const { pitchTrackFrames } = await import(transcribeUrl);
const { findHarmonicPeaks, advanceHarmonicSmoothing, decimateLinear, isModulating } = await import(harmonicsUrl);
const { computeToneStats, MIN_SEGMENT_MS } = await import(toneStatsUrl);
const { detectPitchYin } = await import(engineUrl);

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * A direct DFT over just the bins the test needs. Slow in general, fine for
 * the handful of low bins these tests look at -- and it is independent of
 * findHarmonicPeaks itself, which is the point: this stands in for
 * AnalyserNode.getFloatFrequencyData without borrowing any of the code
 * under test.
 */
function magnitudeSpectrumDb(samples, fftSize, maxBin) {
  const windowed = new Float64Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
    windowed[index] = (samples[index] ?? 0) * hann;
  }
  const db = new Float64Array(maxBin + 1);
  for (let bin = 0; bin <= maxBin; bin += 1) {
    let re = 0;
    let im = 0;
    const omega = (-2 * Math.PI * bin) / fftSize;
    for (let index = 0; index < fftSize; index += 1) {
      const angle = omega * index;
      re += windowed[index] * Math.cos(angle);
      im += windowed[index] * Math.sin(angle);
    }
    const magnitude = Math.sqrt(re * re + im * im);
    db[bin] = 20 * Math.log10(Math.max(magnitude, 1e-9));
  }
  return db;
}

test("a partial deliberately detuned by 10 cents is measured at about +10 cents", () => {
  const sampleRate = 16000;
  const fftSize = 2048;
  const f0 = 220;
  // Partial 2 (exact target 440 Hz) rendered 10 cents sharp on purpose.
  const partial2Hz = 440 * 2 ** (10 / 1200);

  const samples = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    const t = index / sampleRate;
    samples[index] =
      0.6 * Math.sin(2 * Math.PI * f0 * t) +
      0.3 * Math.sin(2 * Math.PI * partial2Hz * t) +
      0.15 * Math.sin(2 * Math.PI * (f0 * 3) * t);
  }

  const binHz = sampleRate / fftSize;
  const maxBin = Math.ceil((f0 * 4) / binHz) + 4;
  const spectrum = magnitudeSpectrumDb(samples, fftSize, maxBin);
  const nyquistLimit = sampleRate / 2 * 0.9;

  const peaks = findHarmonicPeaks(spectrum, binHz, f0, 8, nyquistLimit);

  assert.equal(peaks.length, 8);
  assert.ok(peaks[0], "the fundamental itself should be found");
  assert.ok(Math.abs(peaks[0].cents) < 5, `fundamental drifted ${peaks[0].cents} cents`);

  const secondPartial = peaks[1];
  assert.ok(secondPartial, "the second partial should be found");
  assert.ok(
    Math.abs(secondPartial.cents - 10) <= 5,
    `expected the detuned partial near +10 cents, got ${secondPartial.cents}`,
  );

  const thirdPartial = peaks[2];
  assert.ok(thirdPartial, "the third partial should be found");
  assert.ok(Math.abs(thirdPartial.cents) < 5, `third partial drifted ${thirdPartial.cents} cents`);
});

test("a partial above the usable band comes back null instead of a bogus reading", () => {
  const sampleRate = 16000;
  const fftSize = 2048;
  const binHz = sampleRate / fftSize;
  const spectrum = new Float64Array(200).fill(-100);
  const nyquistLimit = (sampleRate / 2) * 0.9; // 7200 Hz
  // A 1000 Hz fundamental puts the 8th partial at 8000 Hz, past the limit.
  const peaks = findHarmonicPeaks(spectrum, binHz, 1000, 8, nyquistLimit);
  assert.notEqual(peaks[6], null); // 7th partial: 7000 Hz, in range even though silent
  assert.equal(peaks[7], null); // 8th partial: 8000 Hz, past the Nyquist-derived limit
});

test("pitchTrackFrames reports a rising midi track with confidence on a clean glide", async () => {
  const RATE = 16000;
  const seconds = 1.2;
  const samples = new Float32Array(Math.round(seconds * RATE));
  const startMidi = 60; // C4
  const endMidi = 72; // C5
  const startHz = midiToHz(startMidi);
  const semitonesPerSec = (endMidi - startMidi) / seconds;
  // A proper exponential sweep: frequency doubles every 12 semitones of
  // elapsed sweep, so f(t) = startHz * 2^(semitonesPerSec * t / 12). Phase is
  // its integral, not hz(t) * t -- using hz(t) * t would step the frequency
  // at every sample rather than glide it, and YIN would see noise instead.
  const phaseAt = (t) => (2 * Math.PI * startHz * 12) / (semitonesPerSec * Math.LN2) *
    (2 ** ((semitonesPerSec * t) / 12) - 1);
  for (let index = 0; index < samples.length; index += 1) {
    const t = index / RATE;
    const phase = phaseAt(t);
    const fade = Math.min(1, index / (0.02 * RATE), (samples.length - index) / (0.02 * RATE));
    samples[index] = 0.25 * fade * Math.sin(phase) + 0.1 * fade * Math.sin(2 * phase);
  }

  const frames = await pitchTrackFrames(samples);
  assert.ok(frames.length > 10, "expected a reasonable number of frames for a 1.2s buffer");

  const voiced = frames.filter((frame) => frame.midi !== null);
  assert.ok(voiced.length > frames.length * 0.5, `expected most of a clean glide to be voiced, got ${voiced.length}/${frames.length}`);

  const firstVoiced = voiced[0];
  const lastVoiced = voiced[voiced.length - 1];
  assert.ok(lastVoiced.midi > firstVoiced.midi, "the track should rise from the first to the last voiced frame");
  assert.ok(lastVoiced.midi - firstVoiced.midi > 6, "the glide should have covered a meaningful part of the octave");

  for (const frame of voiced) {
    assert.ok(frame.confidence > 0.5, `voiced frame at ${frame.timeSec}s had low confidence ${frame.confidence}`);
    assert.ok(Math.abs(frame.cents) <= 60, `voiced frame cents ${frame.cents} outside a semitone`);
  }

  // Monotonically increasing timestamps, HOP apart.
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].timeSec > frames[index - 1].timeSec);
  }
});

test("pitchTrackFrames reports null midi through silence", async () => {
  const RATE = 16000;
  const samples = new Float32Array(RATE); // one second of silence
  const frames = await pitchTrackFrames(samples);
  assert.ok(frames.length > 0);
  assert.ok(frames.every((frame) => frame.midi === null), "silence should never resolve to a pitch");
  assert.ok(frames.every((frame) => frame.cents === 0), "cents is defined as 0 on an unvoiced frame");
});

test("pitchTrackFrames leaves a gap where a steady tone drops into noise", async () => {
  const RATE = 16000;
  const toneSec = 0.5;
  const noiseSec = 0.5;
  const samples = new Float32Array(Math.round((toneSec + noiseSec) * RATE));
  const toneLength = Math.round(toneSec * RATE);
  const hz = midiToHz(67); // G4
  for (let index = 0; index < toneLength; index += 1) {
    const t = index / RATE;
    const fade = Math.min(1, index / (0.01 * RATE), (toneLength - index) / (0.01 * RATE));
    samples[index] = 0.25 * fade * (Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(4 * Math.PI * hz * t));
  }
  let seed = 7;
  for (let index = toneLength; index < samples.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    samples[index] = ((seed / 0x7fffffff) * 2 - 1) * 0.015;
  }

  const frames = await pitchTrackFrames(samples);
  const toneFrames = frames.filter((frame) => frame.timeSec < toneSec - 0.05);
  const noiseFrames = frames.filter((frame) => frame.timeSec > toneSec + 0.05);

  assert.ok(toneFrames.some((frame) => frame.midi !== null && Math.round(frame.midi) === 67), "the tone should be read as G4 somewhere");
  assert.ok(noiseFrames.every((frame) => frame.midi === null), "quiet noise after the tone should not read as a pitch");
});

test("advanceHarmonicSmoothing EMA-smooths toward each new peak and clears dropped partials", () => {
  const peaksA = [{ n: 1, targetHz: 100, measuredHz: 100, cents: 0, level: -10 }, null];
  const stateA = advanceHarmonicSmoothing([null, null], peaksA);
  assert.equal(stateA[0].levelDb, -10);
  assert.equal(stateA[1], null);

  const peaksB = [{ n: 1, targetHz: 100, measuredHz: 100, cents: 0, level: 0 }, null];
  const stateB = advanceHarmonicSmoothing(stateA, peaksB, 0.5);
  assert.equal(stateB[0].levelDb, -5); // halfway from -10 toward 0 at alpha 0.5
  assert.equal(stateB[1], null);
});

test("decimateLinear halves the sample count and preserves a steady tone's period", () => {
  const sampleRate = 16000;
  const hz = 220;
  const samples = new Float32Array(4096);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin((2 * Math.PI * hz * index) / sampleRate);

  const decimated = decimateLinear(samples, 2);
  assert.equal(decimated.length, 2048);
  const decimatedRate = sampleRate / 2;
  const pitch = detectPitchYin(decimated, decimatedRate, 100, 400);
  assert.ok(pitch, "decimated buffer should still yield a pitch");
  assert.ok(Math.abs(pitch.hz - hz) < 2, `expected ~${hz} Hz after decimation, got ${pitch.hz}`);

  assert.equal(decimateLinear(samples, 1), samples, "factor 1 is a no-op");
});

test("isModulating flags a moved fundamental and ignores a steady one", () => {
  assert.equal(isModulating(440, 440), false);
  assert.equal(isModulating(440, 440.2), false, "well under the 4-cent threshold");
  assert.equal(isModulating(440, 445), true, "~20 cents apart should register as modulation");
  assert.equal(isModulating(0, 440), false, "an invalid measurement should never itself flag modulation");
});

test("an exactly harmonic tone (no vibrato) never classifies a partial as off, referenced to measured H1", () => {
  const sampleRate = 48000;
  const fftSize = 8192;
  const f0 = 440;
  const samples = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    const t = index / sampleRate;
    let value = 0;
    for (let n = 1; n <= 8; n += 1) value += (1 / n) * Math.sin(2 * Math.PI * f0 * n * t);
    samples[index] = value * 0.3;
  }
  const binHz = sampleRate / fftSize;
  const maxBin = Math.ceil((f0 * 9) / binHz);
  const spectrum = magnitudeSpectrumDb(samples, fftSize, maxBin);
  const nyquistLimit = (sampleRate / 2) * 0.9;

  const h1 = findHarmonicPeaks(spectrum, binHz, f0, 1, nyquistLimit)[0];
  const peaks = findHarmonicPeaks(spectrum, binHz, h1.measuredHz, 8, nyquistLimit);
  for (const peak of peaks) {
    assert.ok(peak, "every partial up to 8 should be found on an exact harmonic series at 440 Hz");
    assert.ok(Math.abs(peak.cents) < 5, `partial ${peak.n} read ${peak.cents} cents off an exact harmonic series`);
  }

  const firstHalf = detectPitchYin(samples.subarray(0, fftSize / 2), sampleRate, 100, 1500);
  const secondHalf = detectPitchYin(samples.subarray(fftSize / 2), sampleRate, 100, 1500);
  assert.ok(firstHalf && secondHalf);
  assert.equal(isModulating(firstHalf.hz, secondHalf.hz), false, "a steady tone must not be flagged as vibrato");
});

test("computeToneStats reports near-zero mean cents and no vibrato on a steady in-tune segment", () => {
  const hopSec = 256 / 16000;
  const frames = [];
  for (let index = 0; index < 40; index += 1) {
    frames.push({ timeSec: index * hopSec, midi: 69, cents: 0, confidence: 0.9, rms: 0.2 });
  }
  const stats = computeToneStats(frames);
  assert.equal(stats.length, 1);
  assert.ok(Math.abs(stats[0].meanCents) < 1);
  assert.equal(stats[0].stdDevCents, 0);
  assert.equal(stats[0].vibratoRateHz, null);
});

test("computeToneStats detects a ~6 Hz vibrato's rate and drops segments shorter than MIN_SEGMENT_MS", () => {
  const hopMs = (256 / 16000) * 1000;
  const vibratoHz = 6;
  const totalMs = 800;
  const frameCount = Math.round(totalMs / hopMs);
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const t = (index * hopMs) / 1000;
    const cents = 15 * Math.sin(2 * Math.PI * vibratoHz * t);
    frames.push({ timeSec: t, midi: 69, cents, confidence: 0.9, rms: 0.2 });
  }
  const stats = computeToneStats(frames);
  assert.equal(stats.length, 1);
  assert.ok(stats[0].vibratoRateHz !== null, "an 800ms segment with clear oscillation should yield a vibrato rate");
  assert.ok(Math.abs(stats[0].vibratoRateHz - vibratoHz) < 2, `expected ~${vibratoHz} Hz, got ${stats[0].vibratoRateHz}`);

  const shortFrames = frames.slice(0, Math.round((MIN_SEGMENT_MS - 50) / hopMs));
  assert.equal(computeToneStats(shortFrames).length, 0, "a segment shorter than MIN_SEGMENT_MS must be dropped");
});
