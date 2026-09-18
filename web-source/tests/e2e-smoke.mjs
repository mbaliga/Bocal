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
  for (const theme of ["dark", "light"]) for (const instrumentId of ["alto-sax", "clarinet", "oboe"]) for (const size of sizes) {
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
  // Manual target-note lock: pick any note via the secondary "Target"
  // control (works without a live reading), confirm the badge appears and
  // the picker keeps showing the locked note, then release it -- both
  // themes.
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
} finally {
  await browser.close();
  await preview.close();
  writeFileSync(path.join(evidence, "results.json"), JSON.stringify({ results, errors }, null, 2));
}
assert.deepEqual(errors, [], "Browser acceptance failures");
console.log(`${results.length} browser scenarios passed, including fresh onboarding.`);
