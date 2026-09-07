// One place that knows how to get a headless Chromium for the browser-driven
// tests. Locally the sandbox ships Playwright globally with its browsers under
// /opt/pw-browsers; on CI the `playwright` devDependency plus
// `npx playwright install --with-deps chromium` provide the same thing.
import { existsSync } from "node:fs";

const LOCAL_PLAYWRIGHT = "/opt/node22/lib/node_modules/playwright/index.mjs";
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export async function loadPlaywright() {
  if (existsSync(LOCAL_PLAYWRIGHT)) return import(LOCAL_PLAYWRIGHT);
  return import("playwright");
}

export async function launchChromium(options = {}) {
  const { chromium } = await loadPlaywright();
  const executablePath = process.env.BOCAL_CHROMIUM || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), ...options });
}
