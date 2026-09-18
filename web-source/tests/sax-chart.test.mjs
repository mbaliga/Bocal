import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SAXOPHONE_CHART } from "../app/fingering-charts/saxophone.ts";
import { SAXOPHONE_FINGERINGS, SAX_KEYS } from "../app/sax-data.ts";

// This chart is a generator over sax-data.ts, not a second copy of the
// fingering data -- these tests check the mapping, not the musical content
// itself (sax-data.test.mjs already checks that against its cited sources).

test("the sax chart draws every SAX_KEYS touch-piece and stays within the chart legibility limit", () => {
  const chartIds = SAXOPHONE_CHART.keys.map((key) => key.id);
  assert.equal(new Set(chartIds).size, chartIds.length, "duplicate key ids");
  assert.deepEqual([...chartIds].sort(), SAX_KEYS.map((key) => key.id).sort());
  assert.ok(SAXOPHONE_CHART.keys.length <= 24, `sax chart draws ${SAXOPHONE_CHART.keys.length} keys`);
  for (const key of SAXOPHONE_CHART.keys) {
    assert.ok(key.x >= 0 && key.x <= 100, `${key.id} x out of range`);
    assert.ok(key.y >= 0 && key.y <= 100, `${key.id} y out of range`);
    assert.ok(["L", "R", "thumb"].includes(key.hand), `${key.id} has an unknown hand`);
  }
});

test("every fingering and alternate's key ids resolve in the chart's own key layout", () => {
  const keyIds = new Set(SAXOPHONE_CHART.keys.map((key) => key.id));
  for (const fingering of SAXOPHONE_CHART.fingerings) {
    for (const id of fingering.keys) assert.ok(keyIds.has(id), `${fingering.id} uses unknown key ${id}`);
    for (const alternate of fingering.alternates ?? []) {
      for (const id of alternate.keys) assert.ok(keyIds.has(id), `${fingering.id} alternate "${alternate.label}" uses unknown key ${id}`);
    }
  }
});

test("the chart carries every non-baritone-scoped fingering from sax-data.ts, in the same order", () => {
  const shared = SAXOPHONE_FINGERINGS.filter((note) => !note.instrument);
  assert.equal(SAXOPHONE_CHART.fingerings.length, shared.length);
  assert.deepEqual(SAXOPHONE_CHART.fingerings.map((f) => f.id), shared.map((f) => f.id));
  assert.deepEqual(SAXOPHONE_CHART.fingerings.map((f) => f.writtenMidi), shared.map((f) => f.midi));
});

test("baritone's scoped low A3 does not leak into the shared chart", () => {
  assert.ok(!SAXOPHONE_CHART.fingerings.some((f) => f.id === "a3"), "a3 should not appear in the shared sax chart");
});

test("writtenMidi is strictly ascending", () => {
  const midis = SAXOPHONE_CHART.fingerings.map((f) => f.writtenMidi);
  for (let i = 1; i < midis.length; i += 1) assert.ok(midis[i] > midis[i - 1]);
});

test("altissimo entries and their unverified alternates carry the badge; the standard range does not", () => {
  const bySaxId = new Map(SAXOPHONE_FINGERINGS.map((note) => [note.id, note]));
  for (const fingering of SAXOPHONE_CHART.fingerings) {
    const source = bySaxId.get(fingering.id);
    const expected = source.level === "Altissimo" ? "Unverified" : undefined;
    assert.equal(fingering.badge, expected, `${fingering.id} badge should be ${expected}`);
    for (const [index, alternate] of (fingering.alternates ?? []).entries()) {
      const sourceAlt = source.alternates[index];
      const expectedAlt = sourceAlt.review === "unverified" ? "Unverified" : undefined;
      assert.equal(alternate.badge, expectedAlt, `${fingering.id}/${alternate.label} badge should be ${expectedAlt}`);
    }
  }
  // Spot-check specific notes on both sides of the line.
  assert.equal(SAXOPHONE_CHART.fingerings.find((f) => f.id === "fs4").badge, undefined);
  assert.equal(SAXOPHONE_CHART.fingerings.find((f) => f.id === "g6").badge, "Unverified");
  assert.equal(SAXOPHONE_CHART.fingerings.find((f) => f.id === "bb4").alternates.find((a) => a.label === "Long B♭ (1+1)").badge, "Unverified");
});

test("the chart is registered for every saxophone size", async () => {
  const source = await readFile(new URL("../app/fingering-charts/index.ts", import.meta.url), "utf8");
  for (const id of ["soprano-sax", "alto-sax", "tenor-sax", "bari-sax"]) {
    assert.match(source, new RegExp(`"${id}": SAXOPHONE_CHART`), `${id} should be wired to SAXOPHONE_CHART`);
  }
});

test("the chart carries the same honesty review string as every other chart", () => {
  assert.equal(SAXOPHONE_CHART.review, "method-book consensus, not yet teacher-reviewed");
});

test("fingering ids are unique", () => {
  const ids = SAXOPHONE_CHART.fingerings.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});
