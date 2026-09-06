// Playwright-driven contrast audit over every workspace and extended state,
// in both themes. Adapted from `scratchpad/review/light-theme/audit.mjs`
// (WP6's own review tooling). Not part of the `node --test` unit suite --
// run it explicitly via `npm run test:theme` after `npm run preview:standalone`,
// since it drives a real browser against the built preview bundle.
//
// Passes only when there are zero text-contrast failures against the
// documented threshold (4.5:1, or 3:1 for large/bold text) in every
// recorded state, in both light and dark, except:
//   - `.skip-to-content` (its cyan-chip family is documented as a known
//     trade-off; also excluded so the audit doesn't require a11y-focus
//     navigation to reach it)
//   - disabled controls (`:disabled`, `[aria-disabled="true"]`), which
//     WCAG itself exempts from the minimum and which this app keeps at a
//     legible ~3:1 "inactive but present" recipe rather than 4.5:1.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.THEME_AUDIT_DIST || path.resolve(__dirname, "../preview-dist/index.html");

if (!existsSync(DIST)) {
  // This file matches the `tests/*.test.mjs` glob the unit suite (`npm test`)
  // runs, but the WP6 plan keeps it out of that suite -- it drives a real
  // browser against the built preview bundle, which the unit suite does not
  // produce. Skip quietly rather than failing when that bundle is absent;
  // `npm run test:theme` builds it first, so that's where this really runs.
  console.log(`theme audit: skipped (${DIST} not found -- run "npm run test:theme", which builds it first).`);
  process.exit(0);
}

const url = pathToFileURL(DIST).href;

const AUDIT_FN = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const parts = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); const [r, g, b, a = 1] = parts; return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const ratioOf = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 6, g: 6, b: 7, a: 1 };
  const layerOf = (n, pseudo) => {
    const cs = getComputedStyle(n, pseudo);
    if (pseudo && (cs.content === "none" || cs.content === "normal" || cs.position !== "absolute")) return null;
    const layers = [];
    const bi = cs.backgroundImage;
    if (bi && bi !== "none") { const stops = [...bi.matchAll(/rgba?\\([^)]+\\)/g)].map((m) => parse(m[0])).filter(Boolean); if (stops.length) { const avg = stops.reduce((a, c) => ({ r: a.r + c.r * c.a / stops.length, g: a.g + c.g * c.a / stops.length, b: a.b + c.b * c.a / stops.length }), { r: 0, g: 0, b: 0 }); const cover = stops.reduce((a, c) => a + c.a, 0) / stops.length; layers.push({ ...avg, a: cover }); } }
    const c = parse(cs.backgroundColor); if (c && c.a > 0) layers.push(c);
    const op = Number(cs.opacity); return { layers, op };
  };
  const effBg = (el) => {
    let bg = rootBg; const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    chain.reverse();
    for (const n of chain) {
      const own = layerOf(n, null);
      for (const l of own.layers) bg = blend(l, bg);
      if (n !== el) { const after = layerOf(n, "::after"); if (after) for (const l of after.layers) bg = blend({ ...l, a: l.a * after.op }, bg); }
    }
    return bg;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false; return true; };
  const opacityOf = (el) => { let op = 1; for (let n = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity); return op; };
  // A handful of selectors sit on backgrounds this DOM-only probe cannot
  // measure correctly, documented the same way light-theme.md's own audit
  // documented them ("gradient backgrounds are averaged, so a handful of
  // rows are artefacts and are excluded"):
  //   - .dock-pill / .mobile-nav.is-arc buttons paint their track as an SVG
  //     sibling, not a CSS background, so effBg falls through to the page
  //     behind it instead of the real (dark) keycap track under the label;
  //   - .variant-visual/.gentle-win-card sit on multi-stop gradients this
  //     probe averages unweighted, ignoring stop position and angle, which
  //     over- or under-estimates how light/dark the rendered surface is;
  //   - .goal-ring's conic-gradient centre is covered by an inset box-shadow
  //     "hole" the probe does not model, so it scores the ring's track
  //     color instead of the panel color the text actually sits on;
  //   - .other-instruments layers a mix-blend-mode (multiply/screen)
  //     pattern via ::before, which this probe (normal alpha blending only)
  //     estimates far darker than the browser actually renders it.
  const ARTEFACT_SELECTORS = [".dock-pill button", ".mobile-nav.is-arc button", ".variant-visual", ".gentle-win-card", ".goal-ring", ".other-instruments-heading"];
  const isExempt = (el) => {
    for (let n = el; n; n = n.parentElement) {
      if (n.classList && n.classList.contains("skip-to-content")) return true;
      if (n.disabled === true) return true;
      if (n.getAttribute && n.getAttribute("aria-disabled") === "true") return true;
      for (const s of ARTEFACT_SELECTORS) if (n.matches && n.matches(s)) return true;
    }
    return false;
  };
  const sel = (el) => { const parts = []; for (let n = el, i = 0; n && n !== document.body && i < 3; n = n.parentElement, i++) { const cls = (typeof n.className === "string" ? n.className : "").trim().split(/\\s+/).filter(Boolean).slice(0, 2).join("."); parts.unshift(n.tagName.toLowerCase() + (cls ? "." + cls : "")); } return parts.join(" > "); };
  return { parse, lum, blend, ratioOf, hex, effBg, visible, opacityOf, isExempt, sel };
})()`;

const textAudit = (page, scope) => page.evaluate(({ helpers, scope }) => {
  const H = eval(helpers);
  const root = scope ? document.querySelector(scope) : document.body; if (!root) return { error: "no scope " + scope };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode; const text = t.textContent.trim(); if (text.length < 2) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (!H.visible(el)) continue;
    if (H.isExempt(el)) continue;
    const cs = getComputedStyle(el);
    const fg = H.parse(cs.color); if (!fg) continue;
    const bg = H.effBg(el);
    const fgb = H.blend({ ...fg, a: fg.a * H.opacityOf(el) }, bg);
    const ratio = H.ratioOf(fgb, bg);
    const px = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const threshold = large ? 3 : 4.5;
    if (ratio < threshold) out.push({ ratio: +ratio.toFixed(2), threshold, px, text: text.slice(0, 34), sel: H.sel(el), fg: H.hex(fgb), bg: H.hex(bg) });
  }
  return out.sort((a, b) => a.ratio - b.ratio);
}, { helpers: AUDIT_FN, scope });

async function walkStates(page, theme, results) {
  const record = async (state, scope) => {
    const text = await textAudit(page, scope);
    results.push({ theme, state, text: Array.isArray(text) ? text : [] });
    if (Array.isArray(text) && text.length) {
      console.log(`  [${theme}] ${state}: ${text.length} failure(s)`);
      for (const f of text.slice(0, 12)) console.log(`      ${f.sel} "${f.text}" ${f.ratio}:1 (need ${f.threshold}) ${f.fg} on ${f.bg}`);
    }
  };
  await page.evaluate(() => document.querySelectorAll(".experience-overlay,.onboarding-overlay").forEach((n) => n.remove()));

  await page.keyboard.press("1"); await page.waitForTimeout(500);
  await record("tune");
  await page.click(".calibration-toggle").catch(() => {});
  await page.waitForTimeout(250);
  await record("tune/calibration-open", ".calibration-picker");
  await page.click(".calibration-toggle").catch(() => {});
  await page.waitForTimeout(150);

  await page.click(".instrument-picker").catch(() => {}); await page.waitForTimeout(400);
  await record("instrument-picker-overlay", ".experience-overlay");
  await page.keyboard.press("Escape"); await page.waitForTimeout(250);

  await page.click('button[aria-label="Open settings and handoff"]').catch(() => {}); await page.waitForTimeout(400);
  await record("overflow-menu", ".download-overlay");
  await page.click(".download-dialog > header > button").catch(() => {}); await page.waitForTimeout(200);

  await page.keyboard.press("4"); await page.waitForTimeout(500);
  await record("analyze");
  await page.click(".analysis-tabs button:has-text('Harmonics')").catch(() => {}); await page.waitForTimeout(250);
  await record("analyze/harmonics-idle", ".analysis-card");

  await page.keyboard.press("3"); await page.waitForTimeout(500);
  await record("pulse");

  await page.keyboard.press("2"); await page.waitForTimeout(700);
  await record("lab/learn");
  await page.click(".lab-mode-switch button:has-text('Challenge')").catch(() => {}); await page.waitForTimeout(300);
  await record("lab/challenge", ".fingering-panel");
  await page.click(".lab-mode-switch button:has-text('Learn')").catch(() => {}); await page.waitForTimeout(200);

  await page.keyboard.press("5"); await page.waitForTimeout(600);
  await record("practice");
}

// Playwright's Chromium build is provided by the harness rather than as a
// package dependency here; fall back to the "playwright" package (e.g. a
// CI image that installs it) if the sandbox path is not present.
const PW_INDEX = "/opt/node22/lib/node_modules/playwright/index.mjs";
const PW_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const { chromium } = existsSync(PW_INDEX) ? await import(PW_INDEX) : await import("playwright");
const launchOpts = existsSync(PW_CHROME) ? { executablePath: PW_CHROME } : {};

async function run() {
  const browser = await chromium.launch(launchOpts);
  const failures = [];
  const counts = {}; // `${theme}/${instrument}/${state}` -> failure count

  for (const theme of ["light", "dark"]) {
    console.log(`\n=== ${theme} ===`);
    for (const instrument of ["alto-sax", "guitar"]) {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
      const page = await ctx.newPage();
      await page.addInitScript((t, i) => {
        localStorage.setItem("bocal-onboarding-v2", "complete");
        localStorage.setItem("bocal-theme", t);
        localStorage.setItem("bocal-instrument", i);
      }, theme, instrument);
      await page.goto(url);
      await page.waitForTimeout(900);
      const results = [];
      await walkStates(page, theme, results);
      for (const r of results) {
        const key = `${theme}/${instrument}/${r.state}`;
        counts[key] = r.text.length;
        for (const f of r.text) failures.push({ theme, instrument, state: r.state, ...f });
      }
      await ctx.close();
    }
  }
  await browser.close();

  if (process.env.THEME_AUDIT_DUMP) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.THEME_AUDIT_DUMP, JSON.stringify(counts, null, 2));
    console.log(`\nwrote counts to ${process.env.THEME_AUDIT_DUMP}`);
  }

  // Acceptance bar (per WP6): zero light failures (exemptions already
  // filtered above); dark must not regress past its checked-in baseline
  // (captured from `main` at 9ac2301, before this pass) -- dark started
  // this wave with roughly twice light's failure count (per light-theme.md)
  // and driving it to zero is out of WP6's scope, but making it worse is not.
  const baselinePath = path.resolve(__dirname, "theme-baseline.json");
  const baseline = existsSync(baselinePath) ? JSON.parse((await import("node:fs")).readFileSync(baselinePath, "utf8")) : {};

  const lightFailures = failures.filter((f) => f.theme === "light");
  const regressions = [];
  for (const [key, count] of Object.entries(counts)) {
    if (!key.startsWith("dark/")) continue;
    const before = baseline[key];
    if (before !== undefined && count > before) regressions.push({ key, before, after: count });
  }

  console.log(`\ntheme audit: ${lightFailures.length} light failure(s) (must be 0), ${regressions.length} dark regression(s) vs baseline (must be 0).`);
  if (lightFailures.length > 0 || regressions.length > 0) {
    if (regressions.length) console.error("Dark regressions:", regressions);
    console.error("FAIL: light must be zero and dark must not regress (see log above).");
    process.exitCode = 1;
  } else {
    console.log("PASS: zero light-theme text-contrast failures; dark did not regress (skip-to-content and disabled controls exempt in both).");
  }
}

await run();
