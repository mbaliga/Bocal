// The Android home-screen widgets' side of the page, in a real browser with a
// stand-in for the shell's `window.bocalHost`: the page publishes a summary
// with the stored practice data (and nothing a player typed into a label),
// republishes when the weekly goal changes and at once on host pause, and opens
// only allow-listed workspaces a widget asks for, on load and while running.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const preview = await servePreview(path.resolve(HERE, "../preview-dist/index.html"));
const browser = await launchChromium();

try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.addInitScript(() => {
    if (sessionStorage.getItem("widget-bridge-seeded")) return;
    sessionStorage.setItem("widget-bridge-seeded", "1");
    const now = new Date();
    localStorage.setItem("bocal-onboarding-v2", "complete");
    localStorage.setItem("bocal-instrument", "alto-sax");
    localStorage.setItem("bocal-reference-hz", "442");
    localStorage.setItem("bocal-weekly-goal-minutes", "90");
    localStorage.setItem("bocal-practice-activity-v1", JSON.stringify([
      { id: "w1", capturedAt: now.toISOString(), seconds: 600, type: "tuning", label: "SECRET LABEL", notes: ["SECRET NOTE"] },
    ]));
    localStorage.setItem("bocal-song-wishlist-v1", JSON.stringify([
      { id: "s1", title: "Autumn Leaves", addedAt: now.toISOString(), status: "studying", progress: 40 },
    ]));
  });
  await page.addInitScript(() => {
    window.__widgetSnapshots = [];
    window.__openQueue = ["practice:log"];
    window.bocalHost = {
      publishWidgetSnapshot(json) {
        window.__widgetSnapshots.push(json);
        return true;
      },
      takeOpenRequest() {
        return window.__openQueue.shift() ?? "";
      },
    };
  });
  await page.goto(preview.url);

  // A cold start that a widget asked for lands on the practice log.
  await page.locator("#ctx-practice-log").waitFor({ state: "visible", timeout: 15_000 });

  await page.waitForFunction(() => window.__widgetSnapshots.length > 0, null, { timeout: 15_000 });
  const first = JSON.parse(await page.evaluate(() => window.__widgetSnapshots.at(-1)));
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.weeklyGoalMinutes, 90);
  assert.equal(first.instrument.id, "alto-sax");
  assert.equal(first.tuning.referenceHz, 442);
  assert.equal(first.days.length, 7);
  assert.equal(first.days.at(-1).seconds, 600);
  assert.deepEqual(first.recent.map((row) => row.type), ["tuning"]);
  assert.deepEqual(first.songs.studying, [{ title: "Autumn Leaves", progress: 40 }]);
  const everything = await page.evaluate(() => window.__widgetSnapshots.join("\n"));
  assert.doesNotMatch(everything, /SECRET/, "labels and notes never reach the widgets");

  // Changing the weekly goal republishes.
  await page.getByLabel("Weekly target").selectOption("120");
  await page.waitForFunction(() => JSON.parse(window.__widgetSnapshots.at(-1)).weeklyGoalMinutes === 120, null, { timeout: 5_000 });

  // Host pause publishes at once, without waiting for the debounce.
  const before = await page.evaluate(() => window.__widgetSnapshots.length);
  const after = await page.evaluate(() => {
    window.dispatchEvent(new Event("bocal:host-pause"));
    return window.__widgetSnapshots.length;
  });
  assert.equal(after, before + 1);

  // A widget tap while Bocal is open: the shell queues it and fires bocal:host-open.
  await page.evaluate(() => {
    window.__openQueue.push("pulse:drone");
    window.dispatchEvent(new Event("bocal:host-open"));
  });
  await page.locator("#ctx-pulse-drone").waitFor({ state: "visible", timeout: 10_000 });

  // Anything off the list is ignored: the page stays where it is.
  await page.evaluate(() => {
    window.__openQueue.push("javascript:alert(1)");
    window.dispatchEvent(new Event("bocal:host-open"));
  });
  await page.waitForTimeout(300);
  assert.ok(await page.locator("#ctx-pulse-drone").isVisible());

  assert.deepEqual(pageErrors, [], "page errors");
  console.log("PASS widget bridge: publish on load, goal change and host pause; no labels or notes; cold and warm opens; off-list ignored");
} finally {
  await browser.close();
  await preview.close();
}
