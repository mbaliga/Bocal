// Honesty assertions for W2-D (fingering-depth). See the shared
// tests/product-truth.test.mjs and tests/human-copy.test.mjs for the
// project-wide versions of these checks; this file only covers claims this
// wave's package introduced or is responsible for keeping honest.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BASSOON_CHART } from "../app/fingering-charts/bassoon.ts";
import { OBOE_CHART } from "../app/fingering-charts/oboe.ts";
import { SAXOPHONE_CHART } from "../app/fingering-charts/saxophone.ts";
import { SAXOPHONE_FINGERINGS } from "../app/sax-data.ts";

// Every one of these is fine when negated ("not checked by a teacher" is
// the honest disclosure every chart carries) -- only a bare, unnegated
// claim would be an overclaim, so each phrase is checked with a negative
// lookbehind for "not " immediately before it.
const FORBIDDEN_OVERCLAIMS = [
  "teacher-approved",
  "teacher approved",
  "confirmed by a teacher",
  "verified by a teacher",
  "reviewed by a teacher",
  "checked by a teacher",
  "checked by an oboe specialist",
];

test("no fingering-chart or sax-data file claims teacher review it does not have", async () => {
  const files = [
    "../app/fingering-charts/flute.ts",
    "../app/fingering-charts/clarinet.ts",
    "../app/fingering-charts/oboe.ts",
    "../app/fingering-charts/bassoon.ts",
    "../app/fingering-charts/saxophone.ts",
    "../app/fingering-charts/index.ts",
    "../app/sax-data.ts",
    "../app/SaxophoneLab.tsx",
    "../app/FingeringChart.tsx",
  ];
  const source = (await Promise.all(files.map((f) => readFile(new URL(f, import.meta.url), "utf8")))).join("\n").toLowerCase();
  for (const phrase of FORBIDDEN_OVERCLAIMS) {
    let from = 0;
    for (;;) {
      const at = source.indexOf(phrase, from);
      if (at === -1) break;
      const before = source.slice(Math.max(0, at - 24), at);
      assert.match(before, /\b(not|never|nobody has)\b[^.]*$/, `found an overclaim: "${phrase}" (context: "...${before}${phrase}...")`);
      from = at + phrase.length;
    }
  }
  // The one honest form these files use instead ("not yet teacher-reviewed").
  assert.match(source, /not yet teacher-reviewed/);
});

test("the bassoon chart still stops at G#4 -- the brief's E-flat-5 target was not reachable with two-source confirmation, and this file does not silently claim it was", async () => {
  assert.equal(BASSOON_CHART.fingerings.at(-1).writtenMidi, 68);
  const source = await readFile(new URL("../app/fingering-charts/bassoon.ts", import.meta.url), "utf8");
  // The file must keep explaining why, not just silently stop short.
  assert.match(source, /flick/i);
  assert.match(source, /alternate.*chart/i);
});

test("the cor anglais borrowed chart still drops written Bb3, and carries no override layer beyond that range filter", async () => {
  const source = await readFile(new URL("../app/fingering-charts/index.ts", import.meta.url), "utf8");
  assert.match(source, /writtenMidi >= 59/);
  // Every fingering the cor anglais chart shows must be the exact same
  // object the oboe chart uses -- no per-note override layer was added,
  // because the three English-horn-specific alternates found on WFG
  // (ob_alt_2.html, ob_alt_3.html: Bb5 and B#5/C6) could not be confirmed
  // against a second source. See the W2-D report for what was found and
  // left out.
  const { FINGERING_CHARTS } = await import("../app/fingering-charts/index.ts");
  const centerAnglaisChart = FINGERING_CHARTS["cor-anglais"];
  const oboeById = new Map(OBOE_CHART.fingerings.map((f) => [f.id, f]));
  assert.ok(centerAnglaisChart.fingerings.length > 0);
  for (const fingering of centerAnglaisChart.fingerings) {
    assert.equal(fingering, oboeById.get(fingering.id), `${fingering.id} should be the oboe chart's own object, not a copy`);
  }
});

test("baritone's low A is scoped to bari-sax only, and the sax lab's copy about it matches what the code actually does", async () => {
  const a3 = SAXOPHONE_FINGERINGS.find((f) => f.id === "a3");
  assert.deepEqual(a3.instrument, ["bari-sax"]);
  assert.ok(!SAXOPHONE_CHART.fingerings.some((f) => f.id === "a3"), "a3 must not appear in the shared 2D chart");
  const lab = await readFile(new URL("../app/SaxophoneLab.tsx", import.meta.url), "utf8");
  assert.match(lab, /alto('s| model| \(the 3D model\)).{0,20}no (low A key|such key)/i);
  assert.match(lab, /SAX_3D_KEYS = SAX_KEYS\.filter\(\(key\) => key\.id !== "lowA"\)/);
});

test("every altissimo fingering and alternate in the generated sax chart is badged, and nothing else is", async () => {
  const bySaxId = new Map(SAXOPHONE_FINGERINGS.map((note) => [note.id, note]));
  for (const fingering of SAXOPHONE_CHART.fingerings) {
    const isAltissimo = bySaxId.get(fingering.id).level === "Altissimo";
    assert.equal(!!fingering.badge, isAltissimo, `${fingering.id} badge should match its altissimo status`);
  }
});

test("the flute chart's own honesty comment names both sources it now confirms the third octave against", async () => {
  const source = await readFile(new URL("../app/fingering-charts/flute.ts", import.meta.url), "utf8");
  assert.match(source, /fl_bas_3\.html/);
  assert.match(source, /flutetunes\.com/);
  assert.match(source, /C7, the brief's full target/);
});
