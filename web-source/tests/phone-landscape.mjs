import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const reportDir = path.resolve(HERE, "../../qa/reports/browser");
mkdirSync(reportDir, { recursive: true });
const preview = await servePreview(path.resolve(HERE, "../preview-dist/index.html"));
const browser = await launchChromium();
const results = [];
try {
  for (const size of [{ width: 915, height: 412 }, { width: 640, height: 360 }]) {
    for (const side of ["left", "right"]) for (const theme of ["dark", "light"]) {
      const label = `${size.width}x${size.height}-${side}-${theme}`;
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      try {
        await page.addInitScript(({ side, theme }) => {
          localStorage.setItem("bocal-onboarding-v2", "complete");
          localStorage.setItem("bocal-instrument", "alto-sax");
          localStorage.setItem("bocal-theme", theme);
          localStorage.setItem("bocal-navigation-side", side);
        }, { side, theme });
        await page.goto(preview.url);
        await page.locator(`.app-shell.nav-${side}`).waitFor();
        const nav = page.locator(".mobile-nav");
        await nav.getByRole("button").first().waitFor();
        const bounds = await nav.boundingBox();
        assert.ok(bounds.height > bounds.width * 2, `${label}: dock is not vertical`);
        assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= size.height + 1, `${label}: dock clips vertically`);
        if (side === "left") assert.ok(bounds.x < size.width / 4, `${label}: not on left edge`);
        else assert.ok(bounds.x > size.width * 3 / 4, `${label}: not on right edge`);
        let previousY = -Infinity;
        for (let index = 0; index < 5; index++) {
          const button = nav.getByRole("button").nth(index);
          const box = await button.boundingBox();
          assert.ok(box.width >= 43 && box.height >= 43, `${label}: undersized touch target ${index + 1}`);
          assert.ok(box.y > previousY, `${label}: workspace order reversed`);
          previousY = box.y;
          await button.click();
          await page.waitForFunction((index) => document.querySelectorAll(".mobile-nav button")[index]?.getAttribute("aria-current") === "page", index);
          assert.equal(await button.getAttribute("aria-current"), "page");
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 1, `${label}: workspace ${index + 1} overflows by ${overflow}px`);
        }
        await nav.getByRole("button").first().click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(reportDir, `phone-side-${label}.png`) });
        assert.deepEqual(pageErrors, [], `${label}: page errors`);
        results.push({ label, status: "pass", workspaces: 5 });
        console.log(`PASS ${label}: side, bounds, reading order, touch targets and all five workspaces`);
      } catch (error) {
        results.push({ label, status: "fail", error: String(error) });
        await page.screenshot({ path: path.join(reportDir, `phone-side-${label}-failure.png`) }).catch(() => undefined);
        console.error(`FAIL ${label}: ${error}`);
      } finally { await context.close(); }
    }
  }
  assert.equal(results.filter((result) => result.status === "fail").length, 0, "phone-landscape navigation acceptance failed");
} finally {
  writeFileSync(path.join(reportDir, "phone-landscape.json"), JSON.stringify({ sourceSha: process.env.GITHUB_SHA ?? null, results }, null, 2));
  await browser.close();
  await preview.close();
}
