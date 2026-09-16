// Behavioural checks against the exact bundled Android/web application.
// No DOM removal, production network calls, real microphones or audio uploads.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { launchChromium } from "./browser.mjs";

const html = readFileSync(new URL("../preview-dist/index.html", import.meta.url));
const server = createServer((request, response) => {
  if (request.url === "/" || request.url === "/index.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html);
  } else { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launchChromium();
const wav = Buffer.alloc(44 + 1600);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);
for (let i = 0; i < 800; i++) wav.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 440 * i / 8000)), 44 + i * 2);

async function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("bocal-analysis-takes", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("takes", "readonly");
      const all = tx.objectStore("takes").getAll();
      tx.oncomplete = () => { db.close(); resolve(all.result.map(({ id, name }) => ({ id, name }))); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function eventually(check, message) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message);
}
async function analyze(page) {
  await page.keyboard.press("4");
  await page.getByRole("heading", { name: "See your sound." }).waitFor();
  await eventually(async () => !(await page.getByText("Restoring saved recordings...").count()), "recording restore did not complete");
}
async function deferredMicrophone(page) {
  await page.evaluate(() => {
    window.__stoppedTracks = 0;
    delete window.__resolveMic;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: () => new Promise((resolve) => {
      window.__resolveMic = () => resolve({ getTracks: () => [{ stop: () => { window.__stoppedTracks++; } }] });
    }) });
  });
}
let checks = 0;
try {
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.addInitScript((chosenTheme) => {
      localStorage.setItem("bocal-onboarding-v2", "complete");
      localStorage.setItem("bocal-theme", chosenTheme);
      localStorage.setItem("bocal-instrument", "alto-sax");
    }, theme);
    await page.goto(origin);
    await analyze(page);
    const upload = page.locator('.take-card input[type="file"]');
    await upload.setInputFiles({ name: "test.wav", mimeType: "audio/wav", buffer: wav });
    await eventually(async () => (await stored(page)).length === 1, "import was not committed");
    const name = page.getByRole("textbox", { name: "Take name" });
    await name.fill("Saved regression take");
    await eventually(async () => (await stored(page))[0]?.name === "Saved regression take", "rename was not committed");
    await page.reload(); await analyze(page);
    assert.equal(await name.inputValue(), "Saved regression take"); checks++;

    await page.evaluate(() => { window.bocalHost = {}; });
    await page.locator(".take-actions").getByRole("button", { name: "Download", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "does not support file export" }).waitFor();
    assert.equal((await stored(page)).length, 1); checks++;
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await page.evaluate(() => { delete window.bocalHost; });

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator(".take-actions").getByRole("button", { name: "Delete", exact: true }).click();
    assert.equal((await stored(page)).length, 1); checks++;
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".take-actions").getByRole("button", { name: "Delete", exact: true }).click();
    await eventually(async () => (await stored(page)).length === 0, "confirmed delete did not commit"); checks++;

    await upload.setInputFiles({ name: "not-audio.html", mimeType: "text/html", buffer: Buffer.from("<html>not audio</html>") });
    await page.getByRole("status").filter({ hasText: "not recognised as audio" }).waitFor();
    assert.equal((await stored(page)).length, 0); checks++;

    await deferredMicrophone(page);
    await page.getByRole("button", { name: "Start analysis", exact: true }).click();
    await page.getByRole("button", { name: "Cancel microphone request", exact: true }).waitFor();
    await page.evaluate(() => { window.dispatchEvent(new Event("bocal:host-pause")); window.__resolveMic(); });
    await eventually(async () => await page.evaluate(() => window.__stoppedTracks === 1), "late analyzer stream was not stopped");
    await page.getByRole("button", { name: "Start analysis", exact: true }).waitFor(); checks++;

    await page.keyboard.press("1");
    await deferredMicrophone(page);
    await page.getByRole("button", { name: "Start live tuner", exact: true }).click();
    await page.waitForFunction(() => typeof window.__resolveMic === "function");
    await page.keyboard.press("4");
    await page.evaluate(() => window.__resolveMic());
    await eventually(async () => await page.evaluate(() => window.__stoppedTracks === 1), "late tuner stream was not stopped after navigation"); checks++;

    await page.evaluate(async (bytes) => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("bocal-analysis-takes", 1);
        request.onsuccess = () => {
          const db = request.result; const tx = db.transaction("takes", "readwrite");
          const store = tx.objectStore("takes");
          for (let i = 0; i < 12; i++) store.put({ id: `capacity-${i}`, name: `Kept ${i}`, createdAt: new Date(1700000000000 + i).toISOString(), seconds: 1, mime: "audio/wav", blob: new Blob([new Uint8Array(bytes)], { type: "audio/wav" }) });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onabort = () => { db.close(); reject(tx.error); };
        };
        request.onerror = () => reject(request.error);
      });
    }, [...wav]);
    await page.reload(); await analyze(page);
    assert.equal(await page.locator(".take-list button").count(), 12);
    assert.equal(await page.locator(".take-actions").getByRole("button", { name: "Import", exact: true }).isDisabled(), true);
    await upload.setInputFiles({ name: "overflow.wav", mimeType: "audio/wav", buffer: wav });
    assert.equal((await stored(page)).length, 12); checks++;
    assert.deepEqual(errors, [], `${theme}: unhandled errors`);
    console.log(`PASS ${theme}: persistence, rename, export failure, delete/cancel, invalid import, microphone races, capacity`);
    await context.close();
  }
  console.log(`PASS: ${checks} behavioural reliability checks`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
