import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadSaxData() {
  const sourceUrl = new URL("../app/sax-data.ts", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "sax-data.ts",
    reportDiagnostics: true,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const data = await loadSaxData();

test("modern alto exposes every distinct player touch-piece", () => {
  const ids = data.SAX_KEYS.map((key) => key.id);
  assert.equal(ids.length, 23);
  assert.equal(new Set(ids).size, 23);
  assert.ok(ids.includes("altFsharp"));
  assert.ok(ids.includes("highFsharp"));
  assert.notEqual(ids.indexOf("altFsharp"), ids.indexOf("highFsharp"));
  assert.deepEqual(Object.keys(data.SAX_MECHANICS).sort(), [...ids].sort());
});

test("every mechanism declares real pad motion and known coupled cups", () => {
  const keyIds = new Set(data.SAX_KEYS.map((key) => key.id));
  for (const [id, mechanic] of Object.entries(data.SAX_MECHANICS)) {
    assert.ok(["opens", "closes"].includes(mechanic.cupMotion), `${id} cup motion`);
    assert.ok(mechanic.linkedPads.length > 0, `${id} linked pad output`);
    for (const pad of mechanic.linkedPads) {
      assert.ok(pad.name.length > 0, `${id} pad name`);
      assert.ok(["opens", "closes"].includes(pad.motion), `${id} pad motion`);
    }
    for (const coupledId of mechanic.coupledCupIds ?? []) {
      assert.ok(keyIds.has(coupledId), `${id} coupled cup ${coupledId}`);
    }
  }

  assert.equal(data.SAX_MECHANICS.lowEb.cupMotion, "opens");
  assert.deepEqual(data.SAX_MECHANICS.frontF.coupledCupIds, ["lh1"]);
  assert.deepEqual(data.SAX_MECHANICS.lowB.coupledCupIds, ["lowC"]);
  assert.deepEqual(data.SAX_MECHANICS.lowBb.coupledCupIds, ["lowC", "lowB"]);
});

test("the keyed range is chromatic from written B-flat 3 through F-sharp 6", () => {
  assert.equal(data.ALTO_FINGERINGS.length, 33);
  assert.deepEqual(data.ALTO_FINGERINGS.map((note) => note.midi), Array.from({ length: 33 }, (_, index) => 58 + index));
  assert.equal(data.ALTO_FINGERINGS[0].id, "bb3");
  assert.equal(data.ALTO_FINGERINGS.at(-1).id, "fs6");
  // writtenToConcert no longer assumes alto: the caller must pass the
  // instrument's writtenOffset (see the dedicated per-horn test below).
  for (const note of data.ALTO_FINGERINGS) assert.equal(data.writtenToConcert(note.midi, 9), note.midi - 9);
});

test("SAXOPHONE_FINGERINGS is the map and ALTO_FINGERINGS is a back-compat alias for it", () => {
  assert.equal(data.SAXOPHONE_FINGERINGS, data.ALTO_FINGERINGS);
});

test("written pitch transposes to the correct concert pitch on every saxophone", async () => {
  const instrumentsSource = await readFile(new URL("../app/instruments.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(instrumentsSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "instruments.ts",
    reportDiagnostics: true,
  });
  const { INSTRUMENTS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

  // Written B♭3 (midi 58) is the same grip on every saxophone; only the
  // sounding (concert) pitch differs, by the instrument's writtenOffset.
  const writtenBb3 = 58;
  assert.equal(data.writtenToConcert(writtenBb3, INSTRUMENTS["alto-sax"].writtenOffset), 49); // concert D♭3
  assert.equal(data.writtenToConcert(writtenBb3, INSTRUMENTS["soprano-sax"].writtenOffset), 56); // concert A♭3
  assert.equal(data.writtenToConcert(writtenBb3, INSTRUMENTS["tenor-sax"].writtenOffset), 44); // concert A♭2
  assert.equal(data.writtenToConcert(writtenBb3, INSTRUMENTS["bari-sax"].writtenOffset), 37); // concert D♭2
});

test("all fingering contacts resolve and route ids are unique", () => {
  const keyIds = new Set(data.SAX_KEYS.map((key) => key.id));
  const routeIds = new Set();
  for (const note of data.ALTO_FINGERINGS) {
    assert.ok(!routeIds.has(note.id), `duplicate route ${note.id}`);
    routeIds.add(note.id);
    for (const key of note.keys) assert.ok(keyIds.has(key), `${note.id} uses ${key}`);
    for (const alternate of note.alternates ?? []) {
      assert.ok(!routeIds.has(alternate.id), `duplicate route ${alternate.id}`);
      routeIds.add(alternate.id);
      for (const key of alternate.keys) assert.ok(keyIds.has(key), `${alternate.id} uses ${key}`);
      assert.equal(alternate.keys.includes("altFsharp") && alternate.keys.includes("highFsharp"), false);
    }
  }
});

test("specialist corrections remain encoded", () => {
  const byId = Object.fromEntries(data.ALTO_FINGERINGS.map((note) => [note.id, note]));
  assert.deepEqual(byId.fs4.alternates[0].keys, ["lh1", "lh2", "lh3", "rh1", "altFsharp"]);
  assert.deepEqual(byId.fs5.alternates[0].keys, ["octave", "lh1", "lh2", "lh3", "rh1", "altFsharp"]);
  assert.deepEqual(byId.f6.keys, ["octave", "palmD", "palmEb", "palmF", "sideE"]);
  assert.deepEqual(byId.fs6.keys, ["octave", "frontF", "lh2", "highFsharp"]);
  assert.deepEqual(byId.fs6.alternates[0].keys, ["octave", "palmD", "palmEb", "palmF", "sideE", "highFsharp"]);
  assert.deepEqual(byId.cs5.keys, []);
});
