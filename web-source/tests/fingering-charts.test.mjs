import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Each chart file only ever imports *types* from sibling files (erased by
// the transpiler below), so it can be loaded standalone the same way
// tests/sax-data.test.mjs loads sax-data.ts -- no real module resolution
// needed for a data: URI import.
async function loadChartModule(name) {
  const sourceUrl = new URL(`../app/fingering-charts/${name}.ts`, import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: `${name}.ts`,
    reportDiagnostics: true,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const flute = await loadChartModule("flute");
const clarinet = await loadChartModule("clarinet");
const oboe = await loadChartModule("oboe");
const bassoon = await loadChartModule("bassoon");

const CHARTS = {
  flute: flute.FLUTE_CHART,
  clarinet: clarinet.CLARINET_CHART,
  oboe: oboe.OBOE_CHART,
  bassoon: bassoon.BASSOON_CHART,
};

test("index.ts wires every chart-tier instrument, including the oboe chart borrowed by cor anglais", async () => {
  const source = await readFile(new URL("../app/fingering-charts/index.ts", import.meta.url), "utf8");
  assert.match(source, /flute: FLUTE_CHART/);
  assert.match(source, /clarinet: CLARINET_CHART/);
  assert.match(source, /bassoon: BASSOON_CHART/);
  assert.match(source, /oboe: OBOE_CHART/);
  assert.match(source, /"cor-anglais": OBOE_CHART/);
});

for (const [name, chart] of Object.entries(CHARTS)) {
  test(`${name} chart: every fingering's key ids exist in the key layout`, () => {
    const keyIds = new Set(chart.keys.map((key) => key.id));
    assert.equal(keyIds.size, chart.keys.length, `${name} has duplicate key ids`);
    for (const fingering of chart.fingerings) {
      for (const id of fingering.keys) assert.ok(keyIds.has(id), `${name} ${fingering.id} uses unknown key ${id}`);
      for (const id of fingering.halfKeys ?? []) {
        assert.ok(keyIds.has(id), `${name} ${fingering.id} half-key ${id} is unknown`);
        assert.ok(!fingering.keys.includes(id), `${name} ${fingering.id} lists ${id} as both pressed and half`);
      }
      for (const alternate of fingering.alternates ?? []) {
        for (const id of alternate.keys) assert.ok(keyIds.has(id), `${name} ${fingering.id} alternate "${alternate.label}" uses unknown key ${id}`);
        for (const id of alternate.halfKeys ?? []) assert.ok(keyIds.has(id), `${name} ${fingering.id} alternate "${alternate.label}" half-key ${id} is unknown`);
      }
    }
  });

  test(`${name} chart: key layout is legible -- at most 24 keys, coordinates in 0-100`, () => {
    assert.ok(chart.keys.length <= 24, `${name} draws ${chart.keys.length} keys`);
    for (const key of chart.keys) {
      assert.ok(key.x >= 0 && key.x <= 100, `${name} key ${key.id} x out of range`);
      assert.ok(key.y >= 0 && key.y <= 100, `${name} key ${key.id} y out of range`);
      assert.ok(["L", "R", "thumb"].includes(key.hand), `${name} key ${key.id} has an unknown hand`);
    }
  });

  test(`${name} chart: writtenMidi is strictly ascending`, () => {
    const midis = chart.fingerings.map((f) => f.writtenMidi);
    for (let i = 1; i < midis.length; i += 1) {
      assert.ok(midis[i] > midis[i - 1], `${name} fingering ${i} (${midis[i]}) does not exceed the previous note (${midis[i - 1]})`);
    }
  });

  test(`${name} chart: fingering ids are unique`, () => {
    const ids = chart.fingerings.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, `${name} has duplicate fingering ids`);
  });

  test(`${name} chart: every fingering has a hint and the chart carries the honesty review string`, () => {
    for (const fingering of chart.fingerings) {
      assert.ok(fingering.hint.length > 0, `${name} ${fingering.id} has no hint`);
    }
    assert.equal(chart.review, "method-book consensus, not yet teacher-reviewed");
  });
}

test("range spans the declared bounds from each file's own header comment", () => {
  // Flute: C4 (60) to C#6 (85).
  assert.equal(CHARTS.flute.fingerings[0].writtenMidi, 60);
  assert.equal(CHARTS.flute.fingerings.at(-1).writtenMidi, 85);
  // Clarinet: E3 (52) to C6 (84).
  assert.equal(CHARTS.clarinet.fingerings[0].writtenMidi, 52);
  assert.equal(CHARTS.clarinet.fingerings.at(-1).writtenMidi, 84);
  // Oboe: Bb3 (58) to F6 (89).
  assert.equal(CHARTS.oboe.fingerings[0].writtenMidi, 58);
  assert.equal(CHARTS.oboe.fingerings.at(-1).writtenMidi, 89);
  // Bassoon: Bb1 (34) to G#4 (68).
  assert.equal(CHARTS.bassoon.fingerings[0].writtenMidi, 34);
  assert.equal(CHARTS.bassoon.fingerings.at(-1).writtenMidi, 68);
});

test("range is fully chromatic (no gaps) for every chart", () => {
  for (const [name, chart] of Object.entries(CHARTS)) {
    const midis = chart.fingerings.map((f) => f.writtenMidi);
    for (let i = 1; i < midis.length; i += 1) {
      assert.equal(midis[i], midis[i - 1] + 1, `${name} skips a semitone between fingering ${i - 1} and ${i}`);
    }
  }
});

test("the flute's universal B-flat alternate is present at both octaves and nowhere else", () => {
  const withAlternates = CHARTS.flute.fingerings.filter((f) => f.alternates?.length);
  assert.deepEqual(withAlternates.map((f) => f.id), ["bb4", "bb5"]);
  for (const fingering of withAlternates) {
    assert.equal(fingering.alternates.length, 1);
    assert.ok(fingering.alternates[0].keys.includes("thumbBb"));
  }
});

test("the oboe and bassoon half-hole notes use halfKeys, not keys, for the half-covered hole", () => {
  const oboeHalfHole = CHARTS.oboe.fingerings.filter((f) => (f.halfKeys ?? []).includes("lh1"));
  assert.ok(oboeHalfHole.length > 0);
  for (const fingering of oboeHalfHole) assert.ok(!fingering.keys.includes("lh1"));

  const bassoonHalfHole = CHARTS.bassoon.fingerings.filter((f) => (f.halfKeys ?? []).includes("lh1"));
  assert.ok(bassoonHalfHole.length > 0);
  for (const fingering of bassoonHalfHole) assert.ok(!fingering.keys.includes("lh1"));
});
