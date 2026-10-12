import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(HERE, "../preview-dist/index.html");
assert.ok(existsSync(html), "Build preview:standalone before browser tests.");
const evidence = path.resolve(HERE, "../../qa/reports/browser-matrix");
mkdirSync(evidence, { recursive: true });
const preview = await servePreview(html);
const browser = await launchChromium();
const results = [];
const errors = [];
const sizes = [
  { name: "small-phone", width: 360, height: 800 },
  { name: "tall-phone", width: 412, height: 915 },
  { name: "landscape-phone", width: 915, height: 412 },
  { name: "tablet", width: 1280, height: 800 },
];
try {
  for (const theme of ["dark", "light"]) for (const instrumentId of ["alto-sax", "clarinet", "oboe", "vocal"]) for (const size of sizes) {
    const label = `${instrumentId}-${theme}-${size.name}`;
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
    try {
      await page.addInitScript(({ theme, instrumentId }) => {
        localStorage.setItem("bocal-onboarding-v2", "complete");
        localStorage.setItem("bocal-theme", theme);
        localStorage.setItem("bocal-instrument", instrumentId);
      }, { theme, instrumentId });
      await page.goto(preview.url);
      await page.locator(".app-shell").waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.locator(".onboarding-overlay").count(), 0, "Onboarding should remain completed, not be removed by a test");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      const navSelector = await page.locator(".mobile-nav").isVisible() ? ".mobile-nav" : ".rail-nav";
      for (let digit = 1; digit <= 5; digit++) {
        const selector = `${navSelector} button[aria-keyshortcuts="${digit}"]`;
        const button = page.locator(selector);
        assert.ok(await button.isVisible(), `${label}: navigation ${digit} must be visible`);
        const rect = await button.boundingBox();
        assert.ok(rect && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= size.width + 1 && rect.y + rect.height <= size.height + 1, `${label}: navigation ${digit} is clipped`);
        await button.click();
        await page.waitForFunction(s => document.querySelector(s)?.getAttribute("aria-current") === "page", selector);
        await page.waitForTimeout(digit === 2 ? 500 : 150);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1), `${label}: horizontal overflow in workspace ${digit}`);
        if (size.width < 681 || size.height <= 520) {
          assert.equal(await page.locator(".mobile-nav .arc-shape > path").count(), 4, "The persistent four-layer navigation arc is missing");
          // .dock-pill is rendered unconditionally in .mobile-dock, outside the
          // per-mode switch, so check it on every workspace, not just Tune.
          assert.equal(await page.locator(".dock-pill .pill-track > path").count(), 2, "The Tune instrument-switch arc is missing");
        }
      }
      if (instrumentId === "vocal" && size.name === "tall-phone") {
        // Vocal warm-up: start, pause, finish and confirm it was logged.
        await page.keyboard.press("2");
        await page.getByRole("heading", { name: "Three easy steps" }).waitFor();
        // V-A: the pitch graph's Hold freezes it for review and Live snaps back.
        const graph = page.locator(".vocal-graph");
        await graph.waitFor();
        const canvasSize = await page.locator(".vocal-graph-canvas").boundingBox();
        assert.ok(canvasSize && canvasSize.width > 200 && canvasSize.height > 150, "the pitch graph canvas has a real size");
        assert.equal(await page.getByRole("button", { name: "Back to live graph" }).isDisabled(), true, "Live is idle until the graph is held");
        await page.getByRole("button", { name: "Hold", exact: true }).click();
        await page.locator(".vocal-graph.is-held").waitFor();
        assert.equal(await page.getByRole("button", { name: "Hold", exact: true }).getAttribute("aria-pressed"), "true");
        await page.getByRole("button", { name: "Show less time" }).click();
        await page.getByRole("button", { name: "Back to live graph" }).click();
        await page.waitForFunction(() => !document.querySelector(".vocal-graph.is-held"));
        assert.equal(await page.getByRole("button", { name: "Hold", exact: true }).getAttribute("aria-pressed"), "false");
        await page.locator(".vocal-studio-card").first().click();
        await page.getByRole("button", { name: "Start warm-up" }).click();
        await page.waitForFunction(() => document.querySelector(".vocal-routine-clock strong")?.textContent !== "0:00");
        await page.getByRole("button", { name: "Pause" }).click();
        await page.getByRole("button", { name: "Finish & save" }).click();
        await page.waitForFunction(() => {
          const entries = JSON.parse(localStorage.getItem("bocal-practice-activity-v1") || "[]");
          return entries.some((entry) => entry.type === "vocal" && entry.instrumentId === "vocal");
        });
        // V-B: the melody editor. Audio is muted in headless Chromium, so this
        // asserts on the screen. Notes come from the picker and from a tap on
        // the graph's note names, and the melody is kept under its own key.
        await page.getByRole("heading", { name: "Sing along to a melody" }).waitFor();
        assert.equal(await page.locator(".vocal-melody-choice").count(), 6, "Bocal's six own melodies are listed");
        assert.equal(await page.locator('.vocal-melody-tag[data-source="bundled"]').count(), 6);
        await page.getByRole("button", { name: "New melody" }).click();
        await page.getByRole("group", { name: "Melody editor" }).waitFor();
        await page.getByRole("button", { name: "Add note" }).click();
        await page.getByLabel("Next note").selectOption("62");
        await page.getByRole("button", { name: "Add note" }).click();
        await page.locator(".vocal-graph-canvas").click({ position: { x: 20, y: 120 } });
        await page.waitForFunction(() => document.querySelectorAll(".vocal-melody-notes.is-editing li").length === 3);
        await page.getByRole("button", { name: "Remove note 3" }).click();
        assert.equal(await page.locator(".vocal-melody-notes.is-editing li").count(), 2);
        await page.getByLabel("Name", { exact: true }).fill("Two notes");
        await page.getByRole("button", { name: "Save melody" }).click();
        await page.locator('.vocal-melody-tag[data-source="user"]').waitFor();
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("bocal-vocal-melodies-v1") || "[]"));
        assert.equal(stored.length, 1, "the melody is stored on this device");
        assert.equal(stored[0].name, "Two notes");
        assert.equal(stored[0].notes.length, 2);
        assert.equal(stored[0].source, undefined, "only the singer's own melody is written, in the stored shape");
        // A bundled melody plays a pass: the notes are scheduled, the bands go up, and the pass ends by itself.
        await page.locator(".vocal-melody-choice").filter({ hasText: "Five-note scale" }).click();
        await page.getByRole("button", { name: "Play pass" }).click();
        await page.getByText("Playing. Sing along to the bands on the graph.").waitFor();
        await page.getByRole("button", { name: "Stop pass" }).waitFor();
        await page.waitForFunction(() => document.querySelectorAll(".vocal-melody-notes li.is-current").length === 1);
        await page.getByRole("button", { name: "Clear pass" }).waitFor({ timeout: 20000 });
        assert.match(await page.locator(".vocal-melody-status").innerText(), /microphone was off/);
        assert.equal(await page.locator(".vocal-melody-results").count(), 0, "with the microphone off there is nothing to report per note");
        await page.getByRole("button", { name: "Clear pass" }).click();
        await page.getByRole("button", { name: "Play pass" }).waitFor();
      }
      assert.deepEqual(pageErrors, [], `${label}: browser errors`);
      if (instrumentId === "alto-sax") await page.screenshot({ path: path.join(evidence, `${label}.png`) });
      results.push({ label, passed: true, workspaces: 5 });
      console.log(`PASS ${label}: five real navigation clicks`);
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      results.push({ label, passed: false, error: error.message });
      await page.screenshot({ path: path.join(evidence, `${label}-failure.png`) }).catch(() => undefined);
    } finally { await context.close(); }
  }
  // Exercise a genuinely fresh installation using the guide's real controls.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(preview.url);
    const guide = page.getByRole("dialog", { name: "Pick the instrument you’re playing." });
    await guide.waitFor();
    await guide.getByRole("button", { name: "Use this instrument" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Enter Bocal" }).click();
    assert.equal(await page.locator(".onboarding-overlay").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("bocal-onboarding-v2")), "complete");
    await page.reload();
    await page.locator(".app-shell").waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".onboarding-overlay").count(), 0);
    results.push({ label: "fresh-onboarding-and-reload", passed: true });
  } catch (error) { errors.push(`fresh onboarding: ${error.message}`); }
  finally { await context.close(); }
  // Tuner readout depth (target lock, written/concert toggle, dBFS meter):
  // pick any note via the secondary "Target" control (works without a live
  // reading), confirm the badge appears and the picker keeps showing the
  // locked note, that toggling written/concert doesn't disturb the lock,
  // that the level meter renders and labels itself in dBFS, then release
  // the lock -- both themes.
  for (const theme of ["dark", "light"]) {
    const label = `target-lock-${theme}`;
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.addInitScript((t) => {
        localStorage.setItem("bocal-onboarding-v2", "complete");
        localStorage.setItem("bocal-theme", t);
      }, theme);
      await page.goto(preview.url);
      await page.locator(".app-shell").waitFor();
      // dBFS level meter renders and labels itself honestly.
      const meter = page.locator(".tracker-diagnostics [role='meter']");
      await meter.waitFor();
      assert.match(await meter.getAttribute("aria-valuetext"), /decibels full scale/, `${label}: level meter labels itself in dBFS`);
      assert.match((await page.locator(".tracker-diagnostics").innerText()), /dBFS/, `${label}: level meter shows a dBFS reading`);

      const picker = page.locator(".target-lock-picker select");
      await picker.waitFor();
      const optionValue = await picker.locator("option").nth(1).getAttribute("value");
      await picker.selectOption(optionValue);
      const badge = page.locator(".target-lock-badge");
      await badge.waitFor();
      assert.equal(await picker.inputValue(), optionValue, `${label}: picker keeps showing the locked note`);
      const lockedBadgeText = await badge.innerText();
      // Toggling Calibration > Readout (written/concert) must not disturb
      // the lock -- it only changes which pitch space the note *name*
      // reads in, not which physical note is locked.
      await page.locator(".calibration-toggle").click();
      const concertRadio = page.getByRole("radio", { name: "Concert" });
      if (await concertRadio.isVisible()) {
        await concertRadio.click();
        await page.getByRole("radio", { name: "Written" }).click();
      }
      await page.locator(".calibration-toggle").click();
      assert.equal(await badge.innerText(), lockedBadgeText, `${label}: the readout target stays put across the written/concert toggle`);
      await badge.click();
      await page.waitForTimeout(150);
      assert.equal(await page.locator(".target-lock-badge").count(), 0, `${label}: releasing drops the badge`);
      assert.equal(await picker.inputValue(), "", `${label}: picker returns to Off after release`);
      results.push({ label, passed: true });
    } catch (error) { errors.push(`${label}: ${error.message}`); }
    finally { await context.close(); }
  }
  // V-B with a fake microphone (Chromium's own test device): record vocal
  // takes, see them listed with a pitch trace, lay one over the other, rename,
  // keep them in the shared library, delete one, then sing a melody pass with
  // the microphone on and read the per-note figures.
  const fakeMicBrowser = await launchChromium({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    const label = "vocal-takes-and-melody-fake-microphone";
    const context = await fakeMicBrowser.newContext({ viewport: { width: 412, height: 915 }, permissions: ["microphone"] });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    try {
      await page.addInitScript(() => {
        localStorage.setItem("bocal-onboarding-v2", "complete");
        localStorage.setItem("bocal-theme", "dark");
        localStorage.setItem("bocal-instrument", "vocal");
      });
      await page.goto(preview.url);
      await page.locator(".app-shell").waitFor();
      await page.keyboard.press("2");
      await page.getByRole("heading", { name: "Record a take and listen back" }).waitFor();
      await page.waitForFunction(() => !/Restoring/.test(document.querySelector(".vocal-takes-status")?.textContent || ""));
      const record = page.getByRole("button", { name: "Record take" });
      for (const _take of [1, 2]) {
        await record.click();
        await page.locator(".vocal-takes-clock", { hasText: "Recording" }).waitFor();
        await page.waitForTimeout(1800);
        await page.getByRole("button", { name: "Finish take" }).click();
        await page.getByText("Take saved on this device").waitFor();
      }
      assert.equal(await page.locator(".vocal-take-list li").count(), 2, "both takes are listed");
      const kinds = await page.evaluate(() => new Promise((resolve, reject) => {
        const open = indexedDB.open("bocal-analysis-takes", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction("takes", "readonly").objectStore("takes").getAll();
          request.onsuccess = () => resolve(request.result.map((take) => take.kind));
        };
      }));
      assert.deepEqual(kinds, ["vocal", "vocal"], "vocal takes are stored with kind vocal");
      await page.waitForFunction(() => !document.querySelector(".vocal-take-detail .take-pitch-progress"), undefined, { timeout: 30000 });
      assert.ok(await page.locator(".vocal-take-detail .take-pitch-trace canvas").isVisible(), "the take's pitch trace is drawn");
      await page.getByLabel("Name", { exact: true }).fill("Morning take");
      await page.getByLabel("Compare with").selectOption({ index: 1 });
      await page.getByRole("button", { name: "By first note" }).waitFor();
      // Reloading keeps the takes and the rename: they were committed.
      await page.waitForTimeout(400);
      await page.reload();
      await page.locator(".app-shell").waitFor();
      await page.keyboard.press("2");
      await page.locator(".vocal-take-list li").first().waitFor();
      assert.equal(await page.locator(".vocal-take-list li").count(), 2, "takes survive a reload");
      assert.ok((await page.locator(".vocal-take-list").innerText()).includes("Morning take"), "the rename survives a reload");
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll(".vocal-take-list li").length === 1);
      // A melody pass with the microphone on reports a figure set per note.
      await page.getByRole("button", { name: "Start microphone" }).click();
      await page.getByRole("button", { name: "Stop microphone" }).waitFor();
      await page.locator(".vocal-melody-choice").filter({ hasText: "Octave leap" }).click();
      await page.getByRole("button", { name: "Play pass" }).click();
      await page.getByRole("button", { name: "Clear pass" }).waitFor({ timeout: 25000 });
      assert.equal(await page.locator(".vocal-melody-results li").count(), 3, "one row per note");
      assert.match(await page.locator(".vocal-melody-results").innerText(), /say nothing about timing, technique or tone/);
      assert.deepEqual(pageErrors, [], `${label}: browser errors`);
      results.push({ label, passed: true });
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
      await page.screenshot({ path: path.join(evidence, `${label}-failure.png`) }).catch(() => undefined);
    } finally { await context.close(); }
  } finally { await fakeMicBrowser.close(); }
} finally {
  await browser.close();
  await preview.close();
  writeFileSync(path.join(evidence, "results.json"), JSON.stringify({ results, errors }, null, 2));
}
assert.deepEqual(errors, [], "Browser acceptance failures");
console.log(`${results.length} browser scenarios passed, including fresh onboarding.`);
