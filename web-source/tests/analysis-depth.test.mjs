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
const transcribeUrl = await transpile("../app/transcribe.ts", "transcribe.ts", { "./pitch-engine": engineUrl });
const harmonicsUrl = await transpile("../app/harmonics.ts", "harmonics.ts");
const { pitchTrackFrames } = await import(transcribeUrl);
const { findHarmonicPeaks } = await import(harmonicsUrl);

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
