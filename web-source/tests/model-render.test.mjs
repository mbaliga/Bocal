import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { launchChromium } from "./browser.mjs";
import { classifyTubeVertices } from "../scripts/segment-model.mjs";
import { classifyOboeBodySubPart, classifySaxBodySubPart } from "../app/model-looks.ts";

const REPLAY_HTML = new URL("./fixtures/model-scale-replay.html", import.meta.url);
const SAX_GLB = new URL("../public/models/saxophone-alto.glb", import.meta.url);
const OBOE_GLB = new URL("../public/models/oboe-howarth-s20c.glb", import.meta.url);

function readGlbJson(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

test("wave 2: Object_2's re-segmentation conserves every triangle and every new node shares the original material", async () => {
  const buffer = await readFile(SAX_GLB);
  const document = readGlbJson(buffer);
  const parentNode = document.nodes.find((n) => n.name === "sax.obj.cleaner.materialmerger.gles");
  const partNodes = ["Object_2_neck", "Object_2_body", "Object_2_bow", "Object_2_bell"].map((name) => {
    const nodeIndex = document.nodes.findIndex((n) => n.name === name);
    assert.ok(nodeIndex >= 0, `${name} node is missing`);
    assert.ok(parentNode.children.includes(nodeIndex), `${name} must stay under the original parent`);
    return document.meshes[document.nodes[nodeIndex].mesh];
  });
  let triCount = 0;
  const originalMaterial = document.materials.findIndex((m) => m.name === "gold_pure_material");
  for (const mesh of partNodes) {
    const primitive = mesh.primitives[0];
    assert.equal(primitive.material, originalMaterial, "every re-segmented part must share Object_2's original material");
    triCount += document.accessors[primitive.indices].count / 3;
  }
  assert.equal(triCount, 5768, "the four parts must add up to Object_2's original 5768 triangles, no more, no less");
  // No standalone "Object_2" node should remain.
  assert.equal(document.nodes.some((n) => n.name === "Object_2"), false);
});

test("wave 2: Oboe_Base_My_Oboe_0's Y split conserves every triangle and shares the original material", async () => {
  const buffer = await readFile(OBOE_GLB);
  const document = readGlbJson(buffer);
  const originalMaterial = document.materials.findIndex((m) => m.name === "My_Oboe");
  let triCount = 0;
  for (const name of ["Oboe_Base_My_Oboe_0_top_joint", "Oboe_Base_My_Oboe_0_lower_joint", "Oboe_Base_My_Oboe_0_bell"]) {
    const nodeIndex = document.nodes.findIndex((n) => n.name === name);
    assert.ok(nodeIndex >= 0, `${name} node is missing`);
    const mesh = document.meshes[document.nodes[nodeIndex].mesh];
    const primitive = mesh.primitives[0];
    assert.equal(primitive.material, originalMaterial);
    triCount += document.accessors[primitive.indices].count / 3;
  }
  assert.equal(triCount, 8382, "the three parts must add up to the original mesh's 8382 triangles");
  assert.equal(document.nodes.some((n) => n.name === "Oboe_Base_My_Oboe_0"), false);
});

test("classifyTubeVertices: a straight tube (no fold) orders neck/body/bow/bell purely by geodesic distance from the tenon", () => {
  // Two parallel rails forming a simple straight strip along z, so the
  // geodesic distance from the z>0.9 "neck" end is just z itself -- a
  // minimal, easy-to-hand-check sanity check for the classifier's basic
  // ordering and triangle-count-preserving contract, independent of the
  // real GLB's geometry (covered separately above).
  const rail = [];
  for (let i = 0; i <= 20; i++) rail.push([-0.05, 0, 1 - i * 0.1], [0.05, 0, 1 - i * 0.1]);
  const indices = [];
  for (let i = 0; i < rail.length / 2 - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const { label, maxGeo, seedCount } = classifyTubeVertices(rail, indices, { neckZ: 0.9, bodyFrac: 0.3, bowFrac: 0.65 });
  assert.ok(seedCount > 0, "must find a tenon boundary ring");
  assert.ok(maxGeo > 0);
  assert.equal(label[0], 0); // z = 1 > neckZ -> neck
  assert.equal(label[1], 0);
  assert.equal(label[rail.length - 2], 3); // z = -1, farthest from the tenon -> bell
  assert.equal(label[rail.length - 1], 3);
  // Labels must be monotonically non-decreasing along this unfolded strip.
  for (let i = 2; i < rail.length; i += 2) assert.ok(label[i] >= label[i - 2]);
});

test("classifySaxBodySubPart and classifyOboeBodySubPart recognise the shipped node names", () => {
  assert.equal(classifySaxBodySubPart("Object_2_neck"), "neck");
  assert.equal(classifySaxBodySubPart("Object_2_body"), "body");
  assert.equal(classifySaxBodySubPart("Object_2_bow"), "bow");
  assert.equal(classifySaxBodySubPart("Object_2_bell"), "bell");
  assert.equal(classifySaxBodySubPart("Object_3"), null);
  assert.equal(classifyOboeBodySubPart("Oboe_Base_My_Oboe_0_top_joint"), "top_joint");
  assert.equal(classifyOboeBodySubPart("Oboe_Base_My_Oboe_0_lower_joint"), "lower_joint");
  assert.equal(classifyOboeBodySubPart("Oboe_Base_My_Oboe_0_bell"), "bell");
  assert.equal(classifyOboeBodySubPart("Static"), null);
});

/**
 * Regression test for the P0 scale bug (3d-customization.md finding 1):
 * the isolated `Oboe` node used to be measured before it was reparented,
 * so `Box3.setFromObject` picked up the still-attached FBX ancestor's
 * 0.01 scale, then `scene.add()` dropped that ancestor and left the model
 * ~87x too large on every axis. This loads both shipped GLBs with the
 * app's real bundled three build in headless Chromium and replays the
 * exact normalisation algorithm now used in ImportedInstrumentCanvas.tsx
 * (scene.attach() before measuring, normalise on the largest extent).
 */
test("both shipped models normalise to 7.1 +/- 0.05 on the largest extent after the fix", async () => {
  const browser = await launchChromium({
    args: ["--allow-file-access-from-files", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(REPLAY_HTML.href);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 20000 });

    const saxBuffer = await readFile(SAX_GLB);
    const saxResult = await page.evaluate(
      ([b64, root]) => window.replayFixedNormalisation(b64, root),
      [saxBuffer.toString("base64"), undefined],
    );
    assert.equal(saxResult.error, undefined, `sax replay threw: ${saxResult.error}`);
    assert.ok(Math.abs(saxResult.largestExtentAfter - 7.1) <= 0.05, `sax normalised extent was ${saxResult.largestExtentAfter}`);

    const oboeBuffer = await readFile(OBOE_GLB);
    const oboeResult = await page.evaluate(
      ([b64, root]) => window.replayFixedNormalisation(b64, root),
      [oboeBuffer.toString("base64"), "Oboe"],
    );
    assert.equal(oboeResult.error, undefined, `oboe replay threw: ${oboeResult.error}`);
    assert.ok(
      Math.abs(oboeResult.largestExtentAfter - 7.1) <= 0.05,
      `oboe normalised extent was ${oboeResult.largestExtentAfter} (pre-fix this was ~710, the stage's yellow-fill bug)`,
    );

    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});
