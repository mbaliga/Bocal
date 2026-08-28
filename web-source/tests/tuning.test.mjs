import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../app/tuning.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "tuning.ts",
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { targetHzFor, readingFor, TEMPERAMENTS } = await loadModule();

const equalAt440 = { referenceHz: 440, temperament: "equal", keyPc: 0 };

test("equal temperament at 440 puts A4 exactly at 440 with 0 cents", () => {
  assert.equal(targetHzFor(69, equalAt440), 440);
  const reading = readingFor(440, equalAt440);
  assert.equal(reading.concertMidi, 69);
  assert.equal(reading.cents, 0);
});

test("raising the reference to 442 moves A4's target and reads a 440 Hz tone flat", () => {
  const at442 = { referenceHz: 442, temperament: "equal", keyPc: 0 };
  assert.equal(targetHzFor(69, at442), 442);
  const reading = readingFor(440, at442);
  assert.equal(reading.concertMidi, 69);
  // 1200*log2(440/442) ~= -7.85 cents.
  assert.ok(Math.abs(reading.cents - -8) <= 1, `expected roughly -8 cents, got ${reading.cents}`);
});

test("just intonation in the key of C shifts the major third and fifth by the tabled amount", () => {
  const justInC = { referenceHz: 440, temperament: "just", keyPc: 0 };

  const eThirdHz = targetHzFor(64, justInC); // E4, the major third above C
  const eEqualHz = 440 * 2 ** ((64 - 69) / 12);
  const thirdCents = 1200 * Math.log2(eThirdHz / eEqualHz);
  assert.ok(Math.abs(thirdCents - -13.69) < 0.05, `expected -13.69 cents, got ${thirdCents}`);
  assert.ok(Math.abs(thirdCents - TEMPERAMENTS.just[4]) < 1e-9);

  const gFifthHz = targetHzFor(67, justInC); // G4, the fifth above C
  const gEqualHz = 440 * 2 ** ((67 - 69) / 12);
  const fifthCents = 1200 * Math.log2(gFifthHz / gEqualHz);
  assert.ok(Math.abs(fifthCents - 1.96) < 0.05, `expected +1.96 cents, got ${fifthCents}`);
  assert.ok(Math.abs(fifthCents - TEMPERAMENTS.just[7]) < 1e-9);
});

test("a tone exactly at a temperament-adjusted target reads 0 cents", () => {
  const meantoneInC = { referenceHz: 440, temperament: "meantone", keyPc: 0 };
  for (const midi of [60, 61, 64, 68, 71]) {
    const target = targetHzFor(midi, meantoneInC);
    const reading = readingFor(target, meantoneInC);
    assert.equal(reading.concertMidi, midi, `midi ${midi}: expected exact target to read back as itself`);
    assert.equal(reading.cents, 0, `midi ${midi}: expected exact target to read 0 cents`);
  }
});

test("nearest-note selection crosses a semitone boundary correctly under meantone", () => {
  // Meantone's flattest degree (G#/Ab, index 8) sits 27.37 cents below its
  // equal-tempered spot -- big enough that a tone sitting just inside the
  // *equal*-tempered boundary between two notes can still be genuinely
  // closer to the temperament-adjusted target of the neighbour. Plain
  // equal-tempered nearest-neighbour picking would stop at midi 68 and
  // report it wildly (~76 cents) sharp; the real nearest target is midi 69,
  // only ~41 cents away.
  const meantoneInC = { referenceHz: 440, temperament: "meantone", keyPc: 0 };
  const equal68 = 440 * 2 ** ((68 - 69) / 12);
  const hz = equal68 * 2 ** (49 / 1200); // 49 cents above equal-tempered G#4, so plain equal-rounding picks 68.

  const reading = readingFor(hz, meantoneInC);
  assert.equal(reading.concertMidi, 69, `expected the boundary tone to resolve to A4, got midi ${reading.concertMidi}`);
  assert.ok(Math.abs(reading.cents - -41) <= 1, `expected roughly -41 cents, got ${reading.cents}`);
});
