// Real-browser regression for two failures seen on a device build:
//  (1) the arc-nav "Practice" pill floating detached from the bottom arc,
//  (2) the instrument picker opening as a blank sheet.
// Run `npm run preview:standalone` first. Screenshots go to $SCREENSHOT_DIR
// (default qa/reports/browser-matrix).
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(HERE, "../preview-dist/index.html");
assert.ok(existsSync(html), "Build preview:standalone before browser tests.");
const shots = process.env.SCREENSHOT_DIR || path.resolve(HERE, "../../qa/reports/browser-matrix");
mkdirSync(shots, { recursive: true });
const preview = await servePreview(html);
const browser = await launchChromium();
const failures = [];
let checks = 0;
try {
  for (const theme of ["dark", "light"]) for (const instrumentId of ["alto-sax", "vocal"]) {
    const label = `${instrumentId}-${theme}`;
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    try {
      await page.addInitScript(({ theme, instrumentId }) => {
        localStorage.setItem("bocal-onboarding-v2", "complete");
        localStorage.setItem("bocal-theme", theme);
        localStorage.setItem("bocal-instrument", instrumentId);
      }, { theme, instrumentId });
      await page.goto(preview.url);
      await page.locator(".app-shell").waitFor();
      await page.waitForTimeout(300);
      const pairs = {};
      for (let digit = 1; digit <= 5; digit++) {
        await page.locator(`.mobile-nav button[aria-keyshortcuts="${digit}"]`).click();
        await page.waitForTimeout(digit === 2 ? 500 : 200);
        const geo = await page.evaluate(() => {
          const nav = document.querySelector(".mobile-nav").getBoundingClientRect();
          const buttons = [...document.querySelectorAll(".mobile-nav button")].map((b) => b.getBoundingClientRect());
          return { nav: nav.toJSON(), buttons: buttons.map((r) => r.toJSON()) };
        });
        assert.equal(geo.buttons.length, 5, `${label} ws${digit}: expected 5 .mobile-nav buttons, got ${geo.buttons.length}`);
        for (const [i, r] of geo.buttons.entries()) {
          assert.ok(r.width > 0 && r.height > 0, `${label} ws${digit}: nav button ${i + 1} has no size`);
          // The seats ride an arc and are tilted up to 9.6deg, and the active
          // pill widens, so the rotated bounding box may overhang the nav
          // container by a few px; a detached pill is hundreds of px away.
          const slack = 6;
          assert.ok(r.left >= geo.nav.left - slack && r.right <= geo.nav.right + slack && r.top >= geo.nav.top - slack && r.bottom <= geo.nav.bottom + slack,
            `${label} ws${digit}: nav button ${i + 1} is outside .mobile-nav (${JSON.stringify(r)} vs ${JSON.stringify(geo.nav)})`);
        }
        // The upper pill is a two-seat view switch for this workspace: both
        // seats sit inside the pill box, and the pair is contextual.
        const pillGeo = await page.evaluate(() => {
          const pill = document.querySelector(".dock-pill").getBoundingClientRect();
          const seats = [...document.querySelectorAll(".dock-pill button")];
          return { pill: pill.toJSON(), labels: seats.map((b) => b.textContent.trim()), rects: seats.map((b) => b.getBoundingClientRect().toJSON()), pressed: seats.map((b) => b.getAttribute("aria-pressed")) };
        });
        assert.equal(pillGeo.labels.length, 2, `${label} ws${digit}: the pill has exactly 2 buttons, got ${pillGeo.labels.length}`);
        for (const [i, r] of pillGeo.rects.entries()) {
          assert.ok(r.width > 0 && r.height > 0, `${label} ws${digit}: pill seat ${i + 1} has no size`);
          assert.ok(r.left >= pillGeo.pill.left - 2 && r.right <= pillGeo.pill.right + 2 && r.top >= pillGeo.pill.top - 4 && r.bottom <= pillGeo.pill.bottom + 4,
            `${label} ws${digit}: pill seat ${i + 1} (${pillGeo.labels[i]}) is outside the pill (${JSON.stringify(r)} vs ${JSON.stringify(pillGeo.pill)})`);
        }
        assert.ok(pillGeo.pressed.every((value) => value === "true" || value === "false"), `${label} ws${digit}: pill seats are toggle buttons`);
        pairs[digit] = pillGeo.labels.join(" / ");
        assert.equal(await page.locator(".mobile-nav .arc-shape > path").count(), 4, `${label} ws${digit}: arc path count`);
        assert.equal(await page.locator(".dock-pill .pill-track > path").count(), 2, `${label} ws${digit}: pill path count`);
        checks++;
        if (digit === 5) await page.screenshot({ path: path.join(shots, `nav-practice-${label}.png`) });
      }
      // Contextual: Analyze (4) and Lab (2) do not repeat the Tune (1) pair.
      assert.notEqual(pairs[4], pairs[1], `${label}: Analyze pair repeats the Tune pair (${pairs[4]})`);
      assert.notEqual(pairs[2], pairs[1], `${label}: Lab pair repeats the Tune pair (${pairs[2]})`);
      assert.equal(new Set(Object.values(pairs)).size, 5, `${label}: every workspace has its own pair (${JSON.stringify(pairs)})`);
      checks++;
      await page.getByRole("button", { name: "Choose instrument", exact: true }).click();
      await page.locator(".experience-overlay").waitFor();
      await page.waitForTimeout(300);
      const gallery = await page.evaluate(() => ({
        sections: [...document.querySelectorAll(".experience-overlay .instrument-gallery-section")].map((s) => ({ title: s.querySelector(".instrument-gallery-heading")?.textContent ?? "", h: s.getBoundingClientRect().height })),
        cards: [...document.querySelectorAll(".experience-overlay .instrument-panel")].map((c) => c.getBoundingClientRect().height),
      }));
      const titles = gallery.sections.map((s) => s.title).join("|");
      assert.match(titles, /Woodwinds/, `${label}: Woodwinds section missing (${titles})`);
      assert.match(titles, /Strings/, `${label}: Strings section missing (${titles})`);
      assert.ok(gallery.sections.every((s) => s.h > 0), `${label}: a gallery section has zero height`);
      assert.ok(gallery.cards.length >= 10 && gallery.cards.every((h) => h > 0), `${label}: gallery cards missing or zero-height (${gallery.cards.length})`);
      await page.screenshot({ path: path.join(shots, `picker-${label}.png`) });
      assert.deepEqual(errs, [], `${label}: page errors`);
      checks++;
      console.log(`PASS ${label}`);
    } catch (e) {
      failures.push(`${label}: ${e.message}`);
      await page.screenshot({ path: path.join(shots, `nav-picker-${label}-failure.png`) }).catch(() => undefined);
    } finally { await context.close(); }
  }
} finally { await browser.close(); await preview.close(); }
assert.deepEqual(failures, [], "nav/picker geometry failures");
console.log(`${checks} nav/picker geometry checks passed.`);
