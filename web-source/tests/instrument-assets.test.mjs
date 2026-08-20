import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("v1 ships optimized commercial-use saxophone and oboe references", async () => {
  const sax = await stat(new URL("../public/models/saxophone-alto.glb", import.meta.url));
  const oboe = await stat(new URL("../public/models/oboe-howarth-s20c.glb", import.meta.url));
  assert.ok(sax.size > 1_000_000 && sax.size < 2_500_000);
  assert.ok(oboe.size > 1_000_000 && oboe.size < 3_000_000);
});

test("instrument scope, learning readiness, and licenses stay explicit", async () => {
  const profiles = await readFile(new URL("../app/instruments.ts", import.meta.url), "utf8");
  const attribution = await readFile(new URL("../public/models/ATTRIBUTION.md", import.meta.url), "utf8");
  const oboeLab = await readFile(new URL("../app/OboeLab.tsx", import.meta.url), "utf8");
  assert.match(profiles, /Fingering trainer \+ 3D reference/);
  assert.match(profiles, /3D anatomy preview/);
  assert.match(attribution, /ANDRIANIAINAToky/);
  assert.match(attribution, /WarderiiK/);
  assert.match(attribution, /CC BY 4\.0/g);
  assert.match(oboeLab, /Note-to-key maps, alternate fingerings and pad motion still need review/);
});

test("oboe preview isolates one authored finish and orbiting cannot remount the renderer", async () => {
  const oboeLab = await readFile(new URL("../app/OboeLab.tsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../app/ImportedInstrumentCanvas.tsx", import.meta.url), "utf8");
  const glb = await readFile(new URL("../public/models/oboe-howarth-s20c.glb", import.meta.url));
  const jsonLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  assert.match(oboeLab, /isolateRootName="Oboe"/);
  assert.match(canvas, /EMPTY_FINGERING_MARKERS/);
  assert.doesNotMatch(canvas, /fingeringMarkers = \[\]/);
  assert.match(canvas, /moved <= 6/);
  assert.deepEqual(document.nodes[2].children, [3]);
  assert.equal(document.nodes[3].name, "Oboe");
});
