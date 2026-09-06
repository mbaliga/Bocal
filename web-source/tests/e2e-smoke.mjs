// Playwright smoke test against the standalone preview build.
//
// Run `npm run preview:standalone` first (this script does not build), then
// `npm run test:e2e`. It loads preview-dist/index.html, walks all five
// workspaces for three instruments in both themes, and asserts there are no
// console/page errors and no horizontal overflow -- the minimum a browser
// can tell us that a `node --test` run over pure TS modules cannot.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_HTML = path.join(HERE, "..", "preview-dist", "index.html");

if (!existsSync(PREVIEW_HTML)) {
  console.error(`Preview build not found at ${PREVIEW_HTML}. Run "npm run preview:standalone" first.`);
  process.exit(1);
}
const PREVIEW_URL = `file://${PREVIEW_HTML}`;

const INSTRUMENTS = ["alto-sax", "clarinet", "oboe"];
const THEMES = ["dark", "light"];
const WORKSPACE_COUNT = 5;

async function removeOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".experience-overlay, .onboarding-overlay").forEach((el) => el.remove());
  });
}

async function checkNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  assert.ok(overflow <= 1, `${label}: horizontal overflow of ${overflow}px`);
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const failures = [];

  try {
    for (const theme of THEMES) {
      for (const instrumentId of INSTRUMENTS) {
        const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
        const page = await context.newPage();
        const label = `${instrumentId} / ${theme}`;
        const pageErrors = [];
        const consoleErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });

        await page.addInitScript(
          ({ instrumentId, theme }) => {
            try {
              localStorage.setItem("bocal-onboarding-v2", "complete");
              localStorage.setItem("bocal-theme", theme);
              localStorage.setItem("bocal-instrument", instrumentId);
            } catch {
              // localStorage unavailable; the page falls back to its defaults.
            }
          },
          { instrumentId, theme },
        );

        await page.goto(PREVIEW_URL, { waitUntil: "load" });
        await removeOverlays(page);
        await page.waitForTimeout(150);

        try {
          // Arc nav must survive every package's edits: exactly two paths.
          const dockPaths = await page.locator(".dock-pill svg path").count();
          assert.equal(dockPaths, 2, `${label}: expected 2 .dock-pill svg path elements, got ${dockPaths}`);

          await checkNoHorizontalOverflow(page, `${label} (workspace 1)`);

          for (let workspace = 1; workspace <= WORKSPACE_COUNT; workspace += 1) {
            await page.keyboard.press(String(workspace));
            await page.waitForTimeout(200);
            await removeOverlays(page);
            await checkNoHorizontalOverflow(page, `${label} (workspace ${workspace})`);
          }

          assert.deepEqual(pageErrors, [], `${label}: uncaught page errors: ${pageErrors.join("; ")}`);
          if (consoleErrors.length > 0) {
            throw new Error(`${label}: console errors: ${consoleErrors.join("; ")}`);
          }
          console.log(`ok - ${label}`);
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`\nAll ${THEMES.length * INSTRUMENTS.length} instrument/theme combinations passed, workspaces 1-${WORKSPACE_COUNT}.`);
}

await run();
