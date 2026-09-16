// Real Chromium/IndexedDB and fake-device capture integration tests.
// These check application behaviour, not physical microphone accuracy.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.resolve(root, "../qa/reports/browser");
mkdirSync(reportDir, { recursive: true });
const html = readFileSync(path.join(root, "preview-dist/index.html"));
const server = createServer((request, response) => {
  if (request.url === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html); }
  else if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); }
  else { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchChromium({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const results = [];

function wavFixture() {
  const sampleRate = 16000;
  const samples = 3200;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * 440 * i / sampleRate)), 44 + i * 2);
  return bytes;
}

async function newPage(instrument = "alto-sax", theme = "light", viewport = { width: 412, height: 915 }) {
  const context = await browser.newContext({ viewport, permissions: ["microphone"], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.addInitScript(({ instrument, theme }) => {
    localStorage.setItem("bocal-onboarding-v2", "complete");
    localStorage.setItem("bocal-instrument", instrument);
    localStorage.setItem("bocal-theme", theme);
    window.__captureStreams = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      window.__captureStreams.push(stream);
      return stream;
    };
  }, { instrument, theme });
  await page.goto(url);
  await page.locator(".mobile-nav button").first().waitFor({ state: "attached" });
  return { context, page, errors };
}
async function analyze(page) {
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("4");
  await page.locator(".analysis-layout").waitFor();
  await page.waitForFunction(() => !document.body.textContent.includes("Restoring saved recordings..."));
}
async function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("bocal-analysis-takes", 1);
    request.onerror = () => reject(request.error?.message);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("takes", "readonly");
      let values;
      tx.objectStore("takes").getAll().onsuccess = (event) => { values = event.target.result.map(({ id, name, blob }) => ({ id, name, bytes: blob.size })); };
      tx.oncomplete = () => { db.close(); resolve(values); };
      tx.onabort = () => { db.close(); reject(tx.error?.message); };
    };
  }));
}
async function eventually(check, message) {
  const deadline = Date.now() + 10000;
  do { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
  assert.fail(message);
}
async function check(name, run) {
  try { await run(); results.push({ name, status: "passed" }); console.log(`ok - ${name}`); }
  catch (error) { results.push({ name, status: "failed", error: String(error) }); console.error(`not ok - ${name}: ${error}`); }
}

try {
  await check("recording import, durable rename, reload, download and confirmed deletion", async () => {
    const { context, page, errors } = await newPage();
    try {
      await analyze(page);
      const input = page.locator('.take-card input[type="file"]');
      await input.setInputFiles({ name: "fixture.wav", mimeType: "audio/wav", buffer: wavFixture() });
      await eventually(async () => (await stored(page)).length === 1, "import was not committed");
      await page.getByLabel("Take name", { exact: true }).fill("Kept safely");
      await eventually(async () => (await stored(page))[0]?.name === "Kept safely", "rename was not committed");
      await page.reload(); await analyze(page);
      assert.equal(await page.getByLabel("Take name", { exact: true }).inputValue(), "Kept safely");
      const download = page.waitForEvent("download");
      await page.locator(".take-actions").getByRole("button", { name: "Download", exact: true }).click();
      const file = await download;
      assert.equal(file.suggestedFilename(), "Kept safely.wav");
      assert.deepEqual(readFileSync(await file.path()), wavFixture());
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.locator(".take-actions").getByRole("button", { name: "Delete", exact: true }).click();
      assert.equal((await stored(page)).length, 1, "cancelled deletion must preserve the take");
      await input.setInputFiles({ name: "not-audio.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") });
      assert.equal((await stored(page)).length, 1);
      await page.getByText("This file is not recognised as audio.", { exact: false }).waitFor();
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator(".take-actions").getByRole("button", { name: "Delete", exact: true }).click();
      await eventually(async () => (await stored(page)).length === 0, "confirmed deletion was not committed");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await check("full library refuses an additional take without evicting a recording", async () => {
    const { context, page, errors } = await newPage();
    try {
      await analyze(page);
      for (let i = 0; i < 12; i++) {
        await page.locator('.take-card input[type="file"]').setInputFiles({ name: `keep-${i}.wav`, mimeType: "audio/wav", buffer: wavFixture() });
        await eventually(async () => (await stored(page)).length === i + 1, `take ${i} did not persist`);
      }
      const before = (await stored(page)).map((take) => take.id).sort();
      assert.equal(await page.locator(".take-actions").getByRole("button", { name: "Import", exact: true }).isDisabled(), true);
      await page.locator('.take-card input[type="file"]').setInputFiles({ name: "overflow.wav", mimeType: "audio/wav", buffer: wavFixture() });
      assert.deepEqual((await stored(page)).map((take) => take.id).sort(), before);
      await page.reload(); await analyze(page);
      assert.equal(await page.locator(".take-list button").count(), 12);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await check("host pause finishes a fake-device recording and releases capture", async () => {
    const { context, page, errors } = await newPage();
    try {
      await analyze(page);
      await page.getByRole("button", { name: "Start analysis", exact: true }).click();
      await page.getByRole("button", { name: "Stop analysis", exact: true }).waitFor();
      await page.getByRole("button", { name: "Record take", exact: true }).click();
      await page.waitForTimeout(750);
      await page.evaluate(() => window.dispatchEvent(new Event("bocal:host-pause")));
      await page.getByRole("button", { name: "Start analysis", exact: true }).waitFor();
      await eventually(async () => (await stored(page)).some((take) => take.bytes > 0), "interrupted recording was not preserved");
      assert.equal(await page.evaluate(() => window.__captureStreams.length > 0 && window.__captureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))), true);
      await page.reload(); await analyze(page);
      assert.equal(await page.getByRole("button", { name: "Start analysis", exact: true }).isVisible(), true);
      assert.equal((await stored(page)).length, 1);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await check("cancelled microphone request cannot restart capture when permission resolves late", async () => {
    const { context, page, errors } = await newPage();
    try {
      await analyze(page);
      await page.evaluate(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (constraints) => new Promise((resolve, reject) => {
          window.__releaseMic = () => original(constraints).then(resolve, reject);
        });
      });
      await page.getByRole("button", { name: "Start analysis", exact: true }).click();
      await page.getByRole("button", { name: "Cancel microphone request", exact: true }).click();
      await page.evaluate(() => window.__releaseMic());
      await eventually(() => page.evaluate(() => window.__captureStreams.length > 0 && window.__captureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended"))), "late microphone stream was not stopped");
      assert.equal(await page.getByRole("button", { name: "Start analysis", exact: true }).isVisible(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  const profiles = [
    { name: "compact-light", instrument: "alto-sax", theme: "light", viewport: { width: 360, height: 740 } },
    { name: "landscape-dark", instrument: "oboe", theme: "dark", viewport: { width: 915, height: 412 } },
    { name: "tablet-light", instrument: "flute", theme: "light", viewport: { width: 1280, height: 800 } },
  ];
  for (const profile of profiles) await check(`five-workspace layout ${profile.name}`, async () => {
    const { context, page, errors } = await newPage(profile.instrument, profile.theme, profile.viewport);
    try {
      for (let index = 0; index < 5; index++) {
        await page.keyboard.press(String(index + 1));
        await page.waitForFunction((index) => document.querySelectorAll(".mobile-nav button")[index]?.getAttribute("aria-current") === "page", index);
        await page.waitForTimeout(350);
        assert.ok((await page.locator("main").innerText()).trim().length > 80, "workspace is blank");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${profile.name} workspace ${index + 1}: overflow ${overflow}px`);
        await page.screenshot({ path: path.join(reportDir, `${profile.name}-${index + 1}.png`) });
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
} finally {
  writeFileSync(path.join(reportDir, "production-smoke.json"), JSON.stringify({ sourceSha: process.env.GITHUB_SHA ?? null, physicalDevice: false, audioSource: "Chromium fake capture device", results }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
if (results.some((result) => result.status !== "passed")) process.exitCode = 1;
