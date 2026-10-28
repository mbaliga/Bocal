// Real-browser tap-target audit. On a touch screen (412x915 and 360x740,
// pointer: coarse) every visible interactive element on every workspace, in
// both themes, for four instruments, must have an effective hit area of at
// least 44x44 CSS px (WCAG 2.5.5 / Material). "Effective" means the element's
// own box, or the box extended by padding or a pseudo-element: we probe
// elementFromPoint 22 px either side of the centre and require the point to
// resolve to the element or one of its descendants.
// Run `npm run preview:standalone` first.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";
import { servePreview } from "./preview-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = path.resolve(HERE, "../preview-dist/index.html");
assert.ok(existsSync(html), "Build preview:standalone before browser tests.");

const MIN = 44;
const HALF = 21.9; // 22 px with sub-pixel rounding slack
// Exemptions, each with its reason. Anything not listed here must reach 44 px.
const EXEMPT = [
  { name: "skip link (.skip-to-content)", reason: "visually hidden until keyboard focus, where it grows to a full-size target" },
  { name: "elements inside <canvas>", reason: "the 3D/graph canvas is one pointer surface, not a set of buttons" },
  { name: "visually hidden native inputs (1x1 clip)", reason: "not on screen; the visible <label> that operates them is audited instead" },
  { name: "input[type=range]", reason: "the thumb is the target; checked instead: input height >= 32 and track hit area >= 44 via padding" },
  { name: "inline text links inside paragraphs", reason: "WCAG 2.5.8: only >= 24 px height is required" },
];

const SELECTOR = [
  "button", "a[href]", "select", "input:not([type=hidden])", "summary", "textarea",
  "[role=button]", "[role=tab]", "[role=radio]", "[role=checkbox]", "[role=switch]", ".beat-dot",
].join(",");

const viewports = [{ width: 412, height: 915 }, { width: 360, height: 740 }];
const instruments = ["alto-sax", "vocal", "flute", "diatonic-harmonica"];
const themes = ["dark", "light"];

function collect(args) {
  const { selector, min, half } = args;
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const text = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 28);
    const parentCls = !cls && el.parentElement && typeof el.parentElement.className === "string" ? el.parentElement.className.trim().split(/\s+/)[0] : "";
    return `${parentCls ? "." + parentCls + " > " : ""}${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${text}"`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      if (n.hasAttribute("inert")) return false;
    }
    return true;
  };
  const resolves = (el, x, y) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return "offscreen";
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === el || el.contains(hit))) return "";
    if (hit && el.labels && [...el.labels].some((l) => l === hit || l.contains(hit))) return "";
    return hit ? `covered by ${describe(hit)}` : "no element";
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(selector)) {
    if (el.matches(".skip-to-content") || el.closest("canvas")) continue;
    if (!visible(el)) continue;
    {
      const hr = el.getBoundingClientRect();
      if (hr.width <= 2 && hr.height <= 2 && !(el.labels && el.labels[0] && visible(el.labels[0]))) continue;
    }
    // A visually hidden native checkbox/radio is operated through its label.
    let target = el;
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      const label = el.labels && el.labels[0];
      // The wrapping <label> is the tappable target for a checkbox/radio.
      if (label && visible(label)) target = label;
    }
    if (seen.has(target)) continue;
    seen.add(target);
    target.scrollIntoView({ block: "center", inline: "center" });
    const r = target.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const row = { el: describe(target), w: Math.round(r.width), h: Math.round(r.height), reasons: [] };
    const isRange = el.tagName === "INPUT" && el.type === "range";
    const para = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, dd");
    if (para) {
      if (r.height < 24) row.reasons.push(`inline link ${Math.round(r.height)}px tall (< 24)`);
    } else {
      if (isRange && r.height < 32) row.reasons.push(`range input ${Math.round(r.height)}px tall (< 32)`);
      // An axis that is already >= 44 px (43.5 allows for sub-pixel layout)
      // needs no help; a shorter axis must be extended by padding or a
      // pseudo-element, which we verify by hit-testing 22 px either side.
      const probes = [];
      if (r.width < min - 0.5) probes.push([cx - half, cy, "left"], [cx + half, cy, "right"]);
      if (r.height < min - 0.5) probes.push([cx, cy - half, "top"], [cx, cy + half, "bottom"]);
      for (const [x, y, side] of probes) {
        const why = resolves(target, x, y);
        if (why) row.reasons.push(`${side}: ${why}`);
      }
    }
    if (row.reasons.length) out.push({ ...row, reasons: [...new Set(row.reasons)].join("; ") });
  }
  return out;
}

const preview = await servePreview(html);
const browser = await launchChromium();
const failures = [];
const pageErrors = [];
let audited = 0;
const seenKeys = new Set();
try {
  for (const viewport of viewports) {
    for (const theme of themes) for (const instrument of instruments) {
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      await page.addInitScript(({ theme, instrument }) => {
        try {
          localStorage.setItem("bocal-onboarding-v2", "complete");
          localStorage.setItem("bocal-theme", theme);
          localStorage.setItem("bocal-instrument", instrument);
        } catch { /* storage unavailable: audit whatever renders */ }
      }, { theme, instrument });
      await page.goto(preview.url);
      await page.locator(".app-shell").waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true, "touch context must report pointer: coarse");
      for (let digit = 1; digit <= 5; digit++) {
        await page.locator(`.mobile-nav button[aria-keyshortcuts="${digit}"]`).click();
        await page.waitForTimeout(digit === 2 ? 3500 : 400);
        const views = ["first"];
        if (await page.locator(".dock-pill button").count() === 2) views.push("second");
        for (const view of views) {
          if (view === "second") {
            const idle = page.locator('.dock-pill button[aria-pressed="false"]');
            if (await idle.count() === 0) continue;
            await idle.first().click();
            await page.waitForTimeout(digit === 2 ? 1500 : 400);
          }
          const label = `${viewport.width}px ${theme} ${instrument} ws${digit}.${view}`;
          const found = await page.evaluate(collect, { selector: SELECTOR, min: MIN, half: HALF });
          audited++;
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          if (overflow > 0) failures.push({ where: label, el: "(page)", size: "", reasons: `horizontal page overflow ${overflow}px` });
          for (const f of found) {
            const key = `${viewport.width}|${theme}|${instrument}|${f.el}|${f.w}x${f.h}|${f.reasons}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            failures.push({ where: label, el: f.el, size: `${f.w}x${f.h}`, reasons: f.reasons });
          }
          if (view === "second") {
            await page.locator('.dock-pill button[aria-pressed="false"]').first().click().catch(() => undefined);
            await page.waitForTimeout(200);
          }
        }
      }
      await context.close();
    }
  }
} finally { await browser.close(); await preview.close(); }

console.log("Exempt from the 44 px rule:");
for (const e of EXEMPT) console.log(`  - ${e.name}: ${e.reason}`);
console.log(`Audited ${audited} screens.`);
if (failures.length) {
  // Group identical findings across themes/instruments/viewports for a readable table.
  const groups = new Map();
  for (const f of failures) {
    const key = `${f.el}|${f.size}|${f.reasons}`;
    const g = groups.get(key) || { el: f.el, size: f.size, reasons: f.reasons, count: 0, first: f.where };
    g.count++;
    groups.set(key, g);
  }
  console.log(`\n${failures.length} tap-target failure(s), ${groups.size} distinct:`);
  console.table([...groups.values()].slice(0, 400));
  if (process.env.TAP_REPORT) (await import("node:fs")).writeFileSync(process.env.TAP_REPORT, JSON.stringify(failures, null, 1));
}
assert.deepEqual(pageErrors, [], "page errors");
assert.equal(failures.length, 0, `${failures.length} tap targets below 44 px`);
console.log("All touch controls have a 44 px hit area.");
