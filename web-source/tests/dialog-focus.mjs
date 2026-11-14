// Modal dialogs must behave as modals: focus moves in, Tab stays in, the page
// behind is inert, Escape closes and focus returns to the opener.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(HERE, "../preview-dist/index.html");
assert.ok(existsSync(html), "Build preview:standalone before browser tests.");
const preview = await servePreview(html);
const browser = await launchChromium();

const CASES = [
  { name: "instrument picker", trigger: '[aria-label="Choose instrument"]', overlay: ".experience-overlay" },
  { name: "settings", trigger: '[aria-label="Open settings and handoff"]', overlay: ".download-overlay" },
];

try {
  for (const size of [{ width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.addInitScript(() => {
      localStorage.setItem("bocal-onboarding-v2", "complete");
      localStorage.setItem("bocal-instrument", "alto-sax");
    });
    await page.goto(preview.url);
    await page.locator(".app-shell").waitFor();
    await page.waitForTimeout(300);
    for (const { name, trigger, overlay } of CASES) {
      const label = `${name} @${size.width}`;
      const opener = page.locator(trigger).first();
      await opener.focus();
      await opener.click();
      await page.locator(`${overlay} [role="dialog"]`).waitFor();
      const inside = () => page.evaluate((sel) => !!document.activeElement?.closest(sel), overlay);
      assert.ok(await inside(), `${label}: focus must move inside the dialog on open`);
      const inertInfo = await page.evaluate((sel) => {
        const o = document.querySelector(sel);
        const inert = (el) => !!el.closest("[inert]");
        return {
          overlayInert: inert(o),
          rail: inert(document.querySelector(".side-rail")),
          topBar: inert(document.querySelector(".top-bar")),
          trigger: inert(document.querySelector('[aria-label="Choose instrument"]')),
        };
      }, overlay);
      assert.equal(inertInfo.overlayInert, false, `${label}: dialog itself must not be inert`);
      assert.ok(inertInfo.rail && inertInfo.topBar && inertInfo.trigger, `${label}: background must be inert ${JSON.stringify(inertInfo)}`);
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await inside(), `${label}: Tab #${i + 1} left the dialog`);
      }
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press("Shift+Tab");
        assert.ok(await inside(), `${label}: Shift+Tab #${i + 1} left the dialog`);
      }
      await page.keyboard.press("Escape");
      await page.locator(overlay).waitFor({ state: "detached" });
      assert.equal(await page.locator("[inert]").count(), 0, `${label}: inert must be removed on close`);
      const returned = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), trigger);
      assert.ok(returned, `${label}: focus must return to the opener`);
    }
    await context.close();
  }
  console.log("dialog focus: picker and settings are modal at phone and desktop widths.");
} finally {
  await browser.close();
  await preview.close();
}
