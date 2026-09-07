import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const REPLAY_HTML = new URL("./fixtures/model-scale-replay.html", import.meta.url);
const SAX_GLB = new URL("../public/models/saxophone-alto.glb", import.meta.url);
const OBOE_GLB = new URL("../public/models/oboe-howarth-s20c.glb", import.meta.url);

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
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
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
