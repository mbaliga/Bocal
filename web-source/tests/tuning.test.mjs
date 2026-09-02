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

const {
  targetHzFor,
  readingFor,
  TEMPERAMENTS,
  TEMPERAMENT_ORDER,
  loadCustomTemperamentCents,
  serializeCustomTemperamentCents,
} = await loadModule();

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

// --- New temperament tables ------------------------------------------------

const NEW_TEMPERAMENTS = [
  "meantone-sixth",
  "meantone-third",
  "werckmeister3",
  "kirnberger3",
  "vallotti",
  "young1799",
];

test("every temperament table (built-in and newly added) has 12 entries with a 0 tonic offset", () => {
  for (const id of Object.keys(TEMPERAMENTS)) {
    const table = TEMPERAMENTS[id];
    assert.equal(table.length, 12, `${id}: expected 12 entries, got ${table.length}`);
    assert.equal(table[0], 0, `${id}: expected the tonic (degree 0) to read 0 cents from equal`);
  }
});

test("TEMPERAMENT_ORDER lists every named temperament plus custom, each with a table or the custom slot", () => {
  for (const id of TEMPERAMENT_ORDER) {
    if (id === "custom") continue;
    assert.ok(id in TEMPERAMENTS, `${id} is listed in TEMPERAMENT_ORDER but has no cents table`);
  }
  for (const id of NEW_TEMPERAMENTS) assert.ok(TEMPERAMENT_ORDER.includes(id), `${id} missing from TEMPERAMENT_ORDER`);
});

test("Werckmeister III in the key of C puts G at 696.09 cents from C (-3.91 from equal)", () => {
  const werckmeisterInC = { referenceHz: 440, temperament: "werckmeister3", keyPc: 0 };
  const gHz = targetHzFor(67, werckmeisterInC); // G4, the fifth above C
  const gEqualHz = 440 * 2 ** ((67 - 69) / 12);
  const gCents = 1200 * Math.log2(gHz / gEqualHz);
  assert.ok(Math.abs(gCents - -3.91) < 0.05, `expected -3.91 cents, got ${gCents}`);
  assert.ok(Math.abs(TEMPERAMENTS.werckmeister3[7] - -3.91) < 0.01);
  // Absolute cents from C (i.e. what a tuning reference tabulates): 700 - 3.91 = 696.09.
  assert.ok(Math.abs(700 + TEMPERAMENTS.werckmeister3[7] - 696.09) < 0.01);
});

test("Vallotti's C-G fifth is 698.04 cents (-1.96 from equal)", () => {
  const vallottiInC = { referenceHz: 440, temperament: "vallotti", keyPc: 0 };
  const gHz = targetHzFor(67, vallottiInC);
  const gEqualHz = 440 * 2 ** ((67 - 69) / 12);
  const gCents = 1200 * Math.log2(gHz / gEqualHz);
  assert.ok(Math.abs(gCents - -1.96) < 0.05, `expected -1.96 cents, got ${gCents}`);
  assert.ok(Math.abs(TEMPERAMENTS.vallotti[7] - -1.96) < 0.01);
  assert.ok(Math.abs(700 + TEMPERAMENTS.vallotti[7] - 698.04) < 0.01);
});

test("Kirnberger III has a pure C-E third and puts the schisma on the F#-C# fifth", () => {
  const k = TEMPERAMENTS.kirnberger3;
  // Four 1/4-syntonic-comma fifths C-G-D-A-E give a pure 5:4 third: 386.31 cents from C.
  assert.ok(Math.abs(400 + k[4] - 386.31) < 0.01, `expected E at 386.31 cents from C, got ${400 + k[4]}`);
  // F#-C# is the fifth that absorbs the leftover schisma: exactly 700 cents wide.
  const fSharp = 600 + k[6];
  const cSharp = 100 + k[1] + 1200;
  assert.ok(Math.abs(cSharp - fSharp - 700) < 0.01, `expected a 700-cent F#-C# fifth, got ${cSharp - fSharp}`);
  // Every other untempered fifth is pure (701.955): F-C, Bb-F, Eb-Bb, Ab-Eb, C#-Ab.
  const absolute = k.map((offset, degree) => degree * 100 + offset);
  const fifth = (from, to) => ((absolute[to] - absolute[from]) % 1200 + 1200) % 1200;
  for (const [from, to] of [[5, 0], [10, 5], [3, 10], [8, 3], [1, 8]]) {
    assert.ok(Math.abs(fifth(from, to) - 701.955) < 0.01, `fifth ${from}->${to} should be pure, got ${fifth(from, to)}`);
  }
});

test("a tone exactly at a Kirnberger III / Young (1799) target reads 0 cents", () => {
  for (const id of ["kirnberger3", "young1799", "meantone-sixth", "meantone-third"]) {
    const options = { referenceHz: 440, temperament: id, keyPc: 0 };
    for (const midi of [60, 62, 64, 67, 69]) {
      const target = targetHzFor(midi, options);
      const reading = readingFor(target, options);
      assert.equal(reading.concertMidi, midi, `${id} midi ${midi}: expected exact target to read back as itself`);
      assert.equal(reading.cents, 0, `${id} midi ${midi}: expected exact target to read 0 cents`);
    }
  }
});

// --- Custom temperament persistence ----------------------------------------

test("loadCustomTemperamentCents falls back to all-zero for missing or malformed input", () => {
  assert.deepEqual(loadCustomTemperamentCents(null), new Array(12).fill(0));
  assert.deepEqual(loadCustomTemperamentCents(undefined), new Array(12).fill(0));
  assert.deepEqual(loadCustomTemperamentCents("not json"), new Array(12).fill(0));
  assert.deepEqual(loadCustomTemperamentCents(JSON.stringify([1, 2, 3])), new Array(12).fill(0));
});

test("custom temperament cents round-trip through the persistence helpers", () => {
  const original = [0, -10, -8, -6, -10, -2, -12, -4, -8, -12, -4, -8];
  const serialized = serializeCustomTemperamentCents(original);
  const restored = loadCustomTemperamentCents(serialized);
  assert.deepEqual(restored, original);
});

test("custom temperament persistence clamps extreme values and always zeros the tonic", () => {
  const serialized = serializeCustomTemperamentCents([37, 500, -500, 12.5, 0, 0, 0, 0, 0, 0, 0, 0]);
  const restored = loadCustomTemperamentCents(serialized);
  assert.equal(restored[0], 0, "the tonic must always read 0, even if a caller tries to set it");
  assert.equal(restored[1], 100, "values are clamped to +100 cents");
  assert.equal(restored[2], -100, "values are clamped to -100 cents");
  assert.equal(restored[3], 12.5);
});

test("readingFor works against a custom temperament passed via customCents", () => {
  const custom = { referenceHz: 440, temperament: "custom", keyPc: 0, customCents: [0, 0, 0, 0, -14, 0, 0, 2, 0, 0, 0, 0] };
  const eHz = targetHzFor(64, custom); // E4
  const eEqualHz = 440 * 2 ** ((64 - 69) / 12);
  const eCents = 1200 * Math.log2(eHz / eEqualHz);
  assert.ok(Math.abs(eCents - -14) < 0.01, `expected the custom -14 cent offset to apply, got ${eCents}`);
});
