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

test("the keyed range is chromatic from written B-flat 3 through altissimo C7", () => {
  assert.equal(data.ALTO_FINGERINGS.length, 39);
  assert.deepEqual(data.ALTO_FINGERINGS.map((note) => note.midi), Array.from({ length: 39 }, (_, index) => 58 + index));
  assert.equal(data.ALTO_FINGERINGS[0].id, "bb3");
  assert.equal(data.ALTO_FINGERINGS.at(-1).id, "c7");
  // The written range now reaches at least midi 96 (C7), the top of the
  // altissimo block added alongside the standard B♭3-F♯6 range.
  assert.ok(data.ALTO_FINGERINGS.at(-1).midi >= 96);
  // writtenToConcert no longer assumes alto: the caller must pass the
  // instrument's writtenOffset (see the dedicated per-horn test below).
  for (const note of data.ALTO_FINGERINGS) assert.equal(data.writtenToConcert(note.midi, 9), note.midi - 9);
});

test("primary-list midi values are strictly increasing and unique", () => {
  const midis = data.ALTO_FINGERINGS.map((note) => note.midi);
  assert.equal(new Set(midis).size, midis.length);
  for (let index = 1; index < midis.length; index += 1) {
    assert.ok(midis[index] > midis[index - 1], `midi should increase at index ${index}`);
  }
});

test("every Altissimo entry, and every fingering/trill it or the rest of the chart newly introduces as an alternate, is flagged review: unverified where expected", () => {
  const altissimoIds = new Set(["g6", "gs6", "a6", "bb6", "b6", "c7"]);
  for (const note of data.ALTO_FINGERINGS) {
    if (altissimoIds.has(note.id)) {
      assert.equal(note.level, "Altissimo", `${note.id} should be level Altissimo`);
      assert.equal(note.review, "unverified", `${note.id} should be review: unverified`);
      for (const alternate of note.alternates ?? []) {
        assert.equal(alternate.review, "unverified", `${note.id}/${alternate.id} should be review: unverified`);
      }
    } else {
      assert.notEqual(note.level, "Altissimo", `${note.id} should not be level Altissimo`);
    }
  }
  // The long B♭ (1+1) alternates are new, non-altissimo additions and must
  // also carry the flag.
  const byId = Object.fromEntries(data.ALTO_FINGERINGS.map((note) => [note.id, note]));
  assert.equal(byId.bb4.alternates.find((alternate) => alternate.id === "long-bb4").review, "unverified");
  assert.equal(byId.bb5.alternates.find((alternate) => alternate.id === "long-bb5").review, "unverified");
  // Untouched standard-range entries and alternates stay unflagged.
  assert.equal(byId.fs4.review, undefined);
  assert.equal(byId.bb4.alternates.find((alternate) => alternate.id === "side-bb4").review, undefined);
});

test("altissimo fingerings never duplicate the exact key combination of another entry", () => {
  const seen = new Map();
  for (const note of data.ALTO_FINGERINGS) {
    for (const choice of [{ id: note.id, keys: note.keys }, ...(note.alternates ?? [])]) {
      const signature = [...choice.keys].sort().join(",");
      const existing = seen.get(signature);
      assert.ok(!existing, `${choice.id} duplicates the key combination already used by ${existing}`);
      seen.set(signature, choice.id);
    }
  }
});

test("trill entries reference real keys and existing fingering ids", () => {
  const keyIds = new Set(data.SAX_KEYS.map((key) => key.id));
  const routeIds = new Set(data.ALTO_FINGERINGS.map((note) => note.id));
  let trillCount = 0;
  for (const note of data.ALTO_FINGERINGS) {
    for (const trill of note.trills ?? []) {
      trillCount += 1;
      assert.ok(routeIds.has(trill.from), `trill.from ${trill.from} is a real fingering id`);
      assert.ok(routeIds.has(trill.to), `trill.to ${trill.to} is a real fingering id`);
      assert.equal(trill.from, note.id);
      for (const key of trill.keys) assert.ok(keyIds.has(key), `trill ${trill.from}->${trill.to} uses ${key}`);
    }
  }
  assert.ok(trillCount >= 3, "expected at least the B-C, F-G and C-D trills");
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

  // The cor anglais is in F, sounding a perfect fifth below written pitch:
  // written C5 (72) sounds concert F4 (65).
  assert.equal(data.writtenToConcert(72, INSTRUMENTS["cor-anglais"].writtenOffset), 65);

  // The clarinet is in B♭ like soprano and tenor sax, sounding a major
  // second below written pitch: written C5 (72) sounds concert B♭4 (70).
  assert.equal(data.writtenToConcert(72, INSTRUMENTS["clarinet"].writtenOffset), 70);
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
    for (const trill of note.trills ?? []) {
      for (const key of trill.keys) assert.ok(keyIds.has(key), `${note.id} trill to ${trill.to} uses ${key}`);
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
