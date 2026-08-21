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

// transcribe.ts imports the pitch engine by relative path, which a data: URL
// cannot resolve. Inline the engine as its own data URL and point the import
// at it, so the module under test is the real source rather than a copy.
const engineUrl = await transpile("../app/pitch-engine.ts", "pitch-engine.ts");
const transcribeUrl = await transpile("../app/transcribe.ts", "transcribe.ts", { "./pitch-engine": engineUrl });
const { transcribeBuffer } = await import(transcribeUrl);

const RATE = 16000;

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Synthesise a monophonic line with a few harmonics and a short attack/release
 * envelope, which is roughly what a wind instrument hands the detector.
 */
function renderMelody(events, { gapSec = 0.06, noise = 0 } = {}) {
  const totalSec = events.reduce((sum, event) => sum + event.seconds + gapSec, 0.2);
  const samples = new Float32Array(Math.round(totalSec * RATE));
  let cursor = Math.round(0.1 * RATE);
  const placed = [];
  for (const event of events) {
    const length = Math.round(event.seconds * RATE);
    const hz = midiToHz(event.midi);
    placed.push({ midi: event.midi, startSec: cursor / RATE, durationSec: event.seconds });
    for (let index = 0; index < length; index += 1) {
      const t = index / RATE;
      const fade = Math.min(1, index / (0.01 * RATE), (length - index) / (0.01 * RATE));
      const value =
        Math.sin(2 * Math.PI * hz * t) +
        0.42 * Math.sin(4 * Math.PI * hz * t) +
        0.19 * Math.sin(6 * Math.PI * hz * t);
      samples[cursor + index] = 0.22 * fade * value;
    }
    cursor += length + Math.round(gapSec * RATE);
  }
  if (noise > 0) {
    let seed = 12345;
    for (let index = 0; index < samples.length; index += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      samples[index] += ((seed / 0x7fffffff) * 2 - 1) * noise;
    }
  }
  return { samples, placed };
}

test("a clean monophonic line comes back as the notes that were played", async () => {
  const events = [
    { midi: 69, seconds: 0.5 }, // A4
    { midi: 72, seconds: 0.4 }, // C5
    { midi: 74, seconds: 0.45 }, // D5
    { midi: 67, seconds: 0.5 }, // G4
    { midi: 60, seconds: 0.6 }, // C4
  ];
  const { samples, placed } = renderMelody(events);
  const result = await transcribeBuffer(samples);

  assert.deepEqual(
    result.notes.map((note) => note.concertMidi),
    events.map((event) => event.midi),
  );
  assert.ok(result.clarity > 0.8, `expected a clean line, got clarity ${result.clarity}`);
  assert.equal(result.likelyPolyphonic, false);

  result.notes.forEach((note, index) => {
    assert.ok(
      Math.abs(note.startSec - placed[index].startSec) < 0.06,
      `note ${index} started at ${note.startSec}, expected near ${placed[index].startSec}`,
    );
    assert.ok(
      Math.abs(note.durationSec - placed[index].durationSec) < 0.09,
      `note ${index} lasted ${note.durationSec}, expected near ${placed[index].durationSec}`,
    );
    assert.ok(Math.abs(note.cents) <= 12, `note ${index} drifted ${note.cents} cents`);
  });
});

test("a note played sharp is reported at its nearest pitch with the offset kept", async () => {
  // 30 cents sharp of A4: still an A, but the deviation must survive so a
  // player can see the recording is not at concert A=440.
  const hz = midiToHz(69) * 2 ** (30 / 1200);
  const length = Math.round(0.8 * RATE);
  const samples = new Float32Array(length + RATE * 0.2);
  for (let index = 0; index < length; index += 1) {
    const t = index / RATE;
    const fade = Math.min(1, index / (0.01 * RATE), (length - index) / (0.01 * RATE));
    samples[index + 1600] = 0.22 * fade * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(4 * Math.PI * hz * t));
  }
  const result = await transcribeBuffer(samples);
  assert.equal(result.notes.length, 1);
  assert.equal(result.notes[0].concertMidi, 69);
  assert.ok(Math.abs(result.notes[0].cents - 30) <= 10, `reported ${result.notes[0].cents} cents`);
});

test("detector chatter and silence do not become notes", async () => {
  const samples = new Float32Array(RATE * 2);
  let seed = 99;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    samples[index] = ((seed / 0x7fffffff) * 2 - 1) * 0.02;
  }
  const result = await transcribeBuffer(samples);
  assert.equal(result.notes.length, 0);
});

test("a chord is flagged rather than transcribed as a wrong single line", async () => {
  // A sustained C major triad. Any single-f0 detector will either wander or
  // report low confidence; what must not happen is a confident wrong answer.
  const length = RATE * 2;
  const samples = new Float32Array(length);
  const chord = [60, 64, 67].map(midiToHz);
  for (let index = 0; index < length; index += 1) {
    const t = index / RATE;
    let value = 0;
    for (const hz of chord) value += Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(4 * Math.PI * hz * t);
    samples[index] = 0.12 * value;
  }
  const result = await transcribeBuffer(samples);
  const confidentlyWrong = result.notes.some(
    (note) => note.durationSec > 0.5 && ![60, 64, 67].includes(note.concertMidi),
  );
  assert.equal(confidentlyWrong, false, `chord produced a confident wrong note: ${JSON.stringify(result.notes)}`);
  assert.equal(result.likelyPolyphonic, true, "a sustained triad must be flagged as polyphonic");
});

test("a short recording still reports its duration", async () => {
  const result = await transcribeBuffer(new Float32Array(RATE));
  assert.ok(Math.abs(result.durationSec - 1) < 0.01);
});
