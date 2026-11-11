// Host-bridge conformance harness (plan item B0.2), label BROWSER-HEADLESS.
//
// Loads the real standalone bundle (web-source/preview-dist/index.html) in
// Chromium with a mock window.bocalHost and checks what the app does against
// ../contract.json. It edits neither the app nor the contract; where the two
// disagree it prints a DISAGREEMENT line and exits non-zero.
//
// The mock is a reference implementation of the contract's rules (sanitising,
// in-flight flag, 32 MiB bound, openExternal validation). Those rules belong to
// the HOST, not the app, so the cases that call the mock directly prove the
// contract is internally consistent and implementable, not that any real host
// obeys it. The cases that drive the app prove what the app sends and how it
// reacts. Nothing here runs a real WebView, Tauri, Capacitor or QtWebEngine.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(path.join(HERE, "..", "contract.json"), "utf8"));
const bundle = process.env.BOCAL_BUNDLE || path.resolve(HERE, "../../../web-source/preview-dist/index.html");
assert.ok(existsSync(bundle), `Build the bundle first (cd web-source && npm run preview:standalone). Missing: ${bundle}`);
const html = readFileSync(bundle);
const limits = contract.limits;
const method = (name) => contract.methods.find((m) => m.name === name);
assert.equal(contract.global, "window.bocalHost");

const server = createServer((request, response) => {
  if (request.url === "/" || request.url === "/index.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html);
  } else { response.writeHead(request.url === "/favicon.ico" ? 204 : 404); response.end(); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}/`;
const executablePath = process.env.BOCAL_CHROMIUM || undefined;
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

// A WAV the app accepts as an import (8 kHz mono, 100 ms of 440 Hz).
const wav = Buffer.alloc(44 + 1600);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);
for (let i = 0; i < 800; i++) wav.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 440 * i / 8000)), 44 + i * 2);

/** Installed before any page script. Serialised by Playwright, so it takes only plain data. */
function installMockHost({ maxBytes, maxName }) {
  const calls = [];
  const state = { pending: false };
  const sanitiseName = (raw) => {
    const cleaned = String(raw).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").slice(0, maxName);
    return cleaned.length ? cleaned : "bocal-export";
  };
  const decodedBytes = (b64) => {
    if (typeof b64 !== "string" || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return -1;
    return (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  };
  const validUrl = (raw) => {
    // WHATWG parsing repairs "https:///x" into host "x", so also check the raw authority.
    const authority = /^https?:\/\/([^/?#]*)/i.exec(String(raw));
    if (!authority || authority[1] === "" || authority[1].startsWith(":")) return false;
    let url;
    try { url = new URL(String(raw)); } catch { return false; }
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" && url.username === "" && url.password === "";
  };
  window.__host = { calls, state };
  window.__finishSave = () => { state.pending = false; };
  window.bocalHost = {
    hostName: "conformance-mock",
    hostVersion: "0",
    setTheme(theme) { calls.push({ fn: "setTheme", theme }); },
    setKeepAwake(on) { calls.push({ fn: "setKeepAwake", on }); },
    saveFile(name, mime, base64) {
      const bytes = decodedBytes(base64);
      const accepted = !state.pending && bytes >= 0 && bytes <= maxBytes;
      calls.push({ fn: "saveFile", rawName: name, name: sanitiseName(name), mime: String(mime), base64, accepted });
      if (accepted) state.pending = true;
      return accepted;
    },
    openExternal(url) { const ok = validUrl(url); calls.push({ fn: "openExternal", url, ok }); return ok; },
  };
}

const results = [];
async function check(name, body) {
  try { await body(); results.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, ok: false, error: String(error?.message || error) }); console.log(`FAIL ${name}\n  ${String(error?.message || error).split("\n").join("\n  ")}`); }
}
async function eventually(check, message) {
  for (let i = 0; i < 60; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 100)); }
  assert.fail(message);
}
async function newPage({ theme = "dark" } = {}) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, permissions: ["microphone"] });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.addInitScript(installMockHost, { maxBytes: limits.saveFileMaxBytes, maxName: limits.saveFileNameMaxChars });
  await page.addInitScript((chosen) => {
    localStorage.setItem("bocal-onboarding-v2", "complete");
    localStorage.setItem("bocal-instrument", "alto-sax");
    localStorage.setItem("bocal-theme", chosen);
    window.__streams = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => { const s = await original(constraints); window.__streams.push(s); return s; };
  }, theme);
  await page.goto(origin);
  await page.locator(".mobile-nav button").first().waitFor({ state: "visible" });
  return { context, page, errors };
}
async function openAnalysis(page) {
  await page.locator(".mobile-nav button").nth(3).click();
  await page.locator(".analysis-layout").waitFor();
  await eventually(async () => !(await page.getByText("Restoring saved recordings...").count()), "recording restore did not complete");
}
const hostCalls = (page, fn) => page.evaluate((f) => window.__host.calls.filter((c) => c.fn === f), fn);
async function importTake(page, takeName) {
  await page.locator('.take-card input[type="file"]').setInputFiles({ name: "fixture.wav", mimeType: "audio/wav", buffer: wav });
  const name = page.getByRole("textbox", { name: "Take name" });
  await name.waitFor();
  await name.fill(takeName);
  await page.waitForTimeout(300);
}
const download = (page) => page.locator(".take-actions").getByRole("button", { name: "Download", exact: true }).click();

try {
  await check("saveFile: one call, sanitised name, base64 decodes to the file's bytes", async () => {
    const { context, page, errors } = await newPage();
    try {
      await openAnalysis(page);
      await importTake(page, "a/b\\c\u0001 take");
      await download(page);
      await eventually(async () => (await hostCalls(page, "saveFile")).length >= 1, "app never called saveFile");
      await page.waitForTimeout(300);
      const calls = await hostCalls(page, "saveFile");
      assert.equal(calls.length, 1, `exactly one saveFile call expected, got ${calls.length}`);
      const [call] = calls;
      assert.equal(call.accepted, true);
      assert.ok(call.name.length > 0 && call.name.length <= limits.saveFileNameMaxChars, "sanitised name length");
      assert.ok(!/[\\/\u0000-\u001f\u007f]/.test(call.name), `sanitised name still has separators or controls: ${JSON.stringify(call.name)}`);
      assert.ok(call.name.endsWith(".wav"), "extension survives sanitising");
      assert.equal(call.mime, "audio/wav");
      assert.deepEqual(Buffer.from(call.base64, "base64"), wav, "base64 payload must decode to the imported file's bytes");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await check("saveFile: a second concurrent save returns false and the app reports it", async () => {
    const { context, page, errors } = await newPage();
    try {
      await openAnalysis(page);
      await importTake(page, "double save");
      await download(page);
      await eventually(async () => (await hostCalls(page, "saveFile")).length === 1, "first save not seen");
      await download(page); // the first is still pending: the mock has not been told it finished
      await eventually(async () => (await hostCalls(page, "saveFile")).length === 2, "second save not seen");
      const calls = await hostCalls(page, "saveFile");
      assert.deepEqual(calls.map((c) => c.accepted), [true, false]);
      await page.getByRole("alert").filter({ hasText: "Export could not start" }).waitFor();
      await page.evaluate(() => window.__finishSave());
      await page.getByRole("button", { name: "Dismiss", exact: true }).click();
      await download(page);
      await eventually(async () => (await hostCalls(page, "saveFile")).length === 3, "save after completion not seen");
      assert.equal((await hostCalls(page, "saveFile"))[2].accepted, true, "a save after the first finished must be accepted");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await check("saveFile: over-limit and invalid base64 are refused by the mock exactly as the contract says", async () => {
    const { context, page } = await newPage();
    try {
      const out = await page.evaluate((max) => {
        const h = window.bocalHost;
        const over = h.saveFile("big.bin", "application/octet-stream", btoa("x").padEnd(Math.ceil(((max + 3) / 3)) * 4, "A"));
        const bad = h.saveFile("bad.bin", "application/octet-stream", "not base64!");
        return { over, bad };
      }, limits.saveFileMaxBytes);
      assert.deepEqual(out, { over: false, bad: false });
    } finally { await context.close(); }
  });

  await check("setTheme: the app only sends light or dark, and a bad value does not throw", async () => {
    const { context, page, errors } = await newPage({ theme: "light" });
    try {
      await eventually(async () => (await hostCalls(page, "setTheme")).length >= 1, "app never called setTheme on load");
      const allowed = method("setTheme").args[0].values;
      const sent = (await hostCalls(page, "setTheme")).map((c) => c.theme);
      assert.ok(sent.every((v) => allowed.includes(v)), `app sent a value outside ${JSON.stringify(allowed)}: ${JSON.stringify(sent)}`);
      assert.equal(sent.at(-1), await page.evaluate(() => document.documentElement.dataset.theme), "last setTheme must match the page theme");
      const threw = await page.evaluate(() => {
        try { window.bocalHost.setTheme("purple"); window.bocalHost.setTheme(undefined); window.bocalHost.setTheme(42); return false; } catch { return true; }
      });
      assert.equal(threw, false, "a host must not throw on an unknown theme value");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await check("openExternal: userinfo, non-http(s) and blank-host URLs are rejected by the mock", async () => {
    const { context, page } = await newPage();
    try {
      const got = await page.evaluate(() => {
        const h = window.bocalHost;
        return {
          userinfo: h.openExternal("https://user:pw@example.com/"),
          userOnly: h.openExternal("https://user@example.com/"),
          ftp: h.openExternal("ftp://example.com/"),
          js: h.openExternal("javascript:alert(1)"),
          blank: h.openExternal("https:///path"),
          ok: h.openExternal("https://example.com/privacy"),
        };
      });
      assert.deepEqual(got, { userinfo: false, userOnly: false, ftp: false, js: false, blank: false, ok: true });
      const note = (await page.evaluate(() => document.documentElement.outerHTML.includes("bocalHost.openExternal")));
      console.log(`NOTE the app does not call openExternal today (source mentions it: ${note}); this case checks the mock only.`);
    } finally { await context.close(); }
  });

  await check("bocal:host-pause: microphone tracks end and keep-awake is released", async () => {
    const { context, page, errors } = await newPage();
    try {
      await page.getByRole("button", { name: "Start live tuner", exact: true }).click();
      await eventually(() => page.evaluate(() => window.__streams.length > 0 && window.__streams.some((s) => s.getTracks().some((t) => t.readyState === "live"))), "no live microphone stream after Start live tuner");
      await eventually(async () => (await hostCalls(page, "setKeepAwake")).some((c) => c.on === true), "keep-awake never taken while listening");
      await page.evaluate(() => window.dispatchEvent(new Event("bocal:host-pause")));
      await eventually(() => page.evaluate(() => window.__streams.every((s) => s.getTracks().every((t) => t.readyState === "ended"))), "microphone tracks still live after bocal:host-pause");
      await eventually(async () => (await hostCalls(page, "setKeepAwake")).at(-1)?.on === false, "keep-awake not released after bocal:host-pause");
      await page.waitForTimeout(500);
      assert.equal(await page.getByRole("button", { name: "Start live tuner", exact: true }).isVisible(), true, "the app must not restart capture by itself");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}
const failed = results.filter((r) => !r.ok);
console.log(`\nBROWSER-HEADLESS host-bridge conformance (bundle ${path.relative(process.cwd(), bundle)}): ${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log("DISAGREEMENT or failure; the contract and the app were not edited. See FAIL lines above."); process.exit(1); }
