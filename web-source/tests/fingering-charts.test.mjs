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
  assert.match(source, /"cor-anglais": CENTER_ANGLAIS_CHART/);
});

test("index.ts trims the borrowed oboe chart to the cor anglais's actual written range (no low Bb)", async () => {
  const source = await readFile(new URL("../app/fingering-charts/index.ts", import.meta.url), "utf8");
  assert.match(source, /writtenMidi >= 59/, "cor anglais should filter out written Bb3 (58); the instrument's range starts at B3 (59)");
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

// Fixtures transcribed directly from the Woodwind Fingering Guide's
// text-coded fingering tables (wfg.woodwind.org), fetched 2026-09-06:
//   flute:    fl_bas_1.html (B3-C#2/first octave), fl_bas_2.html (second octave)
//   clarinet: cl_bas_1.html (chalumeau), cl_bas_2.html (clarion)
//   oboe:     ob_bas_1.html, ob_bas_2.html, ob_bas_3.html
//   bassoon:  basn_bas_1.html, basn_bas_2.html, basn_bas_3.html, basn_fing.html
// Every entry lists the pressed key ids (`keys`) and half-covered key ids
// (`halfKeys`) as they appear in the chart data below -- this is the
// mechanical translation of each source's text code (T/W/thumb letters,
// LH123, RH123, half-hole/quarter-hole marks, named side and pinky keys)
// into the ids this file's `keys` layout uses. A future edit to a
// fingering's `keys`/`halfKeys` that silently diverges from the source will
// fail here instead of shipping unnoticed.
const WFG_FIXTURES = {
  flute: {
    c4: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "lowC"],
    cs4: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "csharp"],
    d4: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"],
    eb4: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "eb"],
    e4: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "eb"],
    f4: ["thumb", "lh1", "lh2", "lh3", "rh1", "eb"],
    fs4: ["thumb", "lh1", "lh2", "lh3", "rh3", "eb"],
    g4: ["thumb", "lh1", "lh2", "lh3", "eb"],
    gs4: ["thumb", "lh1", "lh2", "lh3", "gsharp", "eb"],
    a4: ["thumb", "lh1", "lh2", "eb"],
    bb4: ["thumb", "lh1", "rh1", "eb"],
    b4: ["thumb", "lh1", "eb"],
    c5: ["lh1", "eb"],
    cs5: ["eb"],
    d5: ["thumb", "lh2", "lh3", "rh1", "rh2", "rh3"],
    eb5: ["thumb", "lh2", "lh3", "rh1", "rh2", "rh3", "eb"],
    e5: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "eb"],
    f5: ["thumb", "lh1", "lh2", "lh3", "rh1", "eb"],
    fs5: ["thumb", "lh1", "lh2", "lh3", "rh3", "eb"],
    g5: ["thumb", "lh1", "lh2", "lh3", "eb"],
    gs5: ["thumb", "lh1", "lh2", "lh3", "gsharp", "eb"],
    a5: ["thumb", "lh1", "lh2", "eb"],
    bb5: ["thumb", "lh1", "rh1", "eb"],
    b5: ["thumb", "lh1", "eb"],
    c6: ["lh1", "eb"],
    cs6: ["eb"],
  },
  clarinet: {
    e3: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyE"],
    f3: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyF"],
    fs3: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyFs"],
    g3: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"],
    gs3: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGs"],
    a3: ["thumb", "lh1", "lh2", "lh3", "rh1", "rh2"],
    bb3: ["thumb", "lh1", "lh2", "lh3", "rh1"],
    b3: ["thumb", "lh1", "lh2", "lh3", "rh2"],
    c4: ["thumb", "lh1", "lh2", "lh3"],
    cs4: ["thumb", "lh1", "lh2", "lh3", "lhPinkyCs"],
    d4: ["thumb", "lh1", "lh2"],
    eb4: ["thumb", "lh1", "lh2", "rhSide4"],
    e4: ["thumb", "lh1"],
    f4: ["thumb"],
    fs4: ["lh1"],
    g4: [],
    gs4: ["lhSideGsharp"],
    a4: ["lhSideA"],
    bb4: ["register", "lhSideA"],
    b4: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyE"],
    c5: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyF"],
    cs5: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyFs"],
    d5: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"],
    eb5: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGs"],
    e5: ["register", "thumb", "lh1", "lh2", "lh3", "rh1", "rh2"],
    f5: ["register", "thumb", "lh1", "lh2", "lh3", "rh1"],
    fs5: ["register", "thumb", "lh1", "lh2", "lh3", "rh2"],
    g5: ["register", "thumb", "lh1", "lh2", "lh3"],
    gs5: ["register", "thumb", "lh1", "lh2", "lh3", "lhPinkyCs"],
    a5: ["register", "thumb", "lh1", "lh2"],
    bb5: ["register", "thumb", "lh1", "lh2", "rhSide4"],
    b5: ["register", "thumb", "lh1"],
    c6: ["register", "thumb"],
  },
  oboe: {
    bb3: { keys: ["lh1", "lh2", "lh3", "lhBb", "rh1", "rh2", "rh3", "rhC"] },
    b3: { keys: ["lh1", "lh2", "lh3", "lhB", "rh1", "rh2", "rh3", "rhC"] },
    c4: { keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhC"] },
    cs4: { keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhCsharp"] },
    d4: { keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3"] },
    eb4: { keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhEb"] },
    e4: { keys: ["lh1", "lh2", "lh3", "rh1", "rh2"] },
    f4: { keys: ["lh1", "lh2", "lh3", "rh1", "rh2", "fRes"] },
    fs4: { keys: ["lh1", "lh2", "lh3", "rh1"] },
    g4: { keys: ["lh1", "lh2", "lh3"] },
    gs4: { keys: ["lh1", "lh2", "lh3", "lhGsharp"] },
    a4: { keys: ["lh1", "lh2"] },
    bb4: { keys: ["lh1", "lh2", "rh1"] },
    b4: { keys: ["lh1"] },
    c5: { keys: ["lh1", "rh1"] },
    cs5: { halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rh2", "rh3", "rhCsharp"] },
    d5: { halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rh2", "rh3"] },
    eb5: { halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh1", "rh2", "rh3", "rhEb"] },
    e5: { keys: ["octave1", "lh1", "lh2", "lh3", "rh1", "rh2"] },
    f5: { keys: ["octave1", "lh1", "lh2", "lh3", "rh1", "rh2", "fRes"] },
    fs5: { keys: ["octave1", "lh1", "lh2", "lh3", "rh1"] },
    g5: { keys: ["octave1", "lh1", "lh2", "lh3"] },
    gs5: { keys: ["octave1", "lh1", "lh2", "lh3", "lhGsharp"] },
    a5: { keys: ["octave2", "lh1", "lh2"] },
    bb5: { keys: ["octave2", "lh1", "lh2", "rh1"] },
    b5: { keys: ["octave2", "lh1"] },
    c6: { keys: ["octave2", "lh1", "rh1"] },
    cs6: { keys: ["lh2", "lh3", "rh1", "rhC"] },
    d6: { halfKeys: ["lh1"], keys: ["lh2", "lh3", "rhC"] },
    eb6: { halfKeys: ["lh1"], keys: ["lh2", "lh3", "rh2", "rh3", "rhEb"] },
    e6: { halfKeys: ["lh1"], keys: ["octave1", "lh2", "lh3", "lhGsharp", "lhEb", "rh2", "rh3"] },
    f6: { halfKeys: ["lh1"], keys: ["octave1", "lh2", "lhGsharp", "lhEb", "rh2", "rh3"] },
  },
  bassoon: {
    bb1: ["thumbBb", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    b1: ["thumbB", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    c2: ["thumbC", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    cs2: ["thumbC", "thumbD", "lhPinkyCs", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    d2: ["thumbD", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    eb2: ["thumbD", "lhPinkyEb", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    e2: ["whisper", "lh1", "lh2", "lh3", "rhThumbE", "rh1", "rh2", "rh3", "rhPinkyF"],
    f2: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyF"],
    fs2: ["whisper", "lh1", "lh2", "lh3", "rhThumbFsharp", "rh1", "rh2", "rh3", "rhPinkyF"],
    g2: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3"],
    gs2: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGsharp"],
    a2: ["whisper", "lh1", "lh2", "lh3", "rh1", "rh2"],
    bb2: ["whisper", "lh1", "lh2", "lh3", "rhThumbBb", "rh1", "rh2"],
    b2: ["whisper", "lh1", "lh2", "lh3", "rh1"],
    c3: ["whisper", "lh1", "lh2", "lh3"],
    cs3: ["whisper", "thumbCsharp", "thumbD", "lh1", "lh2", "lh3"],
    d3: ["whisper", "lh1", "lh2"],
    eb3: ["whisper", "lh1", "lh3"],
    e3: ["whisper", "lh1"],
    f3: ["whisper"],
    fs3: { halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "rhThumbFsharp", "rh1", "rh2", "rh3", "rhPinkyF"] },
    g3: { halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "lhPinkyEb", "rh1", "rh2", "rh3"] },
    gs3: { halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "rh1", "rh2", "rh3", "rhPinkyGsharp"] },
    a3: ["lh1", "lh2", "lh3", "rh1", "rh2"],
    bb3: ["lh1", "lh2", "lh3", "rhThumbBb", "rh1", "rh2"],
    b3: ["lh1", "lh2", "lh3", "rh1"],
    c4: ["lh1", "lh2", "lh3"],
    cs4: ["thumbCsharp", "thumbD", "lh1", "lh2", "lh3"],
    d4: ["lh1", "lh2"],
    eb4: ["lh1", "lh2", "rh1", "rh2", "rh3"],
    e4: ["lh1", "lh3", "lhPinkyEb", "rh1", "rh2", "rh3"],
    f4: ["lh1", "lh3", "lhPinkyEb", "rh1", "rh2"],
    fs4: ["lh2", "lh3", "lhPinkyEb", "rhThumbBb", "rh1", "rh2"],
    g4: { halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "lhPinkyEb", "rh1", "rhPinkyF"] },
    gs4: { halfKeys: ["lh1"], keys: ["whisper", "lh2", "lh3", "lhPinkyEb", "rh3"] },
  },
};

for (const [name, fixtures] of Object.entries(WFG_FIXTURES)) {
  test(`${name} chart matches the Woodwind Fingering Guide fixture for every transcribed note`, () => {
    const chart = CHARTS[name];
    const byId = new Map(chart.fingerings.map((f) => [f.id, f]));
    for (const [id, expected] of Object.entries(fixtures)) {
      const fingering = byId.get(id);
      assert.ok(fingering, `${name} has no fingering with id ${id}`);
      const expectedKeys = Array.isArray(expected) ? expected : expected.keys;
      const expectedHalf = Array.isArray(expected) ? [] : (expected.halfKeys ?? []);
      assert.deepEqual(
        [...fingering.keys].sort(),
        [...expectedKeys].sort(),
        `${name} ${id} keys diverge from the WFG fixture`,
      );
      assert.deepEqual(
        [...(fingering.halfKeys ?? [])].sort(),
        [...expectedHalf].sort(),
        `${name} ${id} halfKeys diverge from the WFG fixture`,
      );
    }
  });
}

test("the oboe and bassoon half-hole notes use halfKeys, not keys, for the half-covered hole", () => {
  const oboeHalfHole = CHARTS.oboe.fingerings.filter((f) => (f.halfKeys ?? []).includes("lh1"));
  assert.ok(oboeHalfHole.length > 0);
  for (const fingering of oboeHalfHole) assert.ok(!fingering.keys.includes("lh1"));

  const bassoonHalfHole = CHARTS.bassoon.fingerings.filter((f) => (f.halfKeys ?? []).includes("lh1"));
  assert.ok(bassoonHalfHole.length > 0);
  for (const fingering of bassoonHalfHole) assert.ok(!fingering.keys.includes("lh1"));
});
