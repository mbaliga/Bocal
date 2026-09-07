import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

test("the public handoff and Android release gate point to repository-owned source and assets", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const publicDownloads = await readdir(new URL("../public/downloads/", import.meta.url));
  assert.ok(publicDownloads.includes("BOCAL_HANDOFF.md"));
  const handoff = await stat(new URL("../public/downloads/BOCAL_HANDOFF.md", import.meta.url));
  assert.ok(handoff.size > 10_000);
  for (const name of ["alto-sax", "oboe", "tenor-sax", "soprano-sax", "clarinet", "flute", "bassoon"]) {
    const sourceImage = await stat(new URL(`../assets/source/bocal-${name}-cinematic.png`, import.meta.url));
    const webImage = await stat(new URL(`../public/images/bocal-${name}-cinematic.webp`, import.meta.url));
    assert.ok(sourceImage.size > 750_000, `${name} source master is present`);
    assert.ok(webImage.size > 10_000, `${name} optimized image is present`);
  }
  assert.match(page, /\/downloads\/BOCAL_HANDOFF\.md/);
  assert.doesNotMatch(page, /\/downloads\/Bocal-native-debug\.apk/);
  assert.match(page, /Android release promotion is pending/);
  assert.match(page, /Settings & model library/i);
  assert.match(page, /Only models with usable rights and player-checked keywork/i);
});

test("the shipping Android tree (/android) is a hardened, local-first WebView shell", async () => {
  const manifest = await readFile(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  const webAppScreen = await readFile(
    new URL("../../android/app/src/main/java/com/bocal/music/ui/WebAppScreen.kt", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../../android/app/src/main/java/com/bocal/music/ui/LocalAssetWebViewClient.java", import.meta.url),
    "utf8",
  );
  const host = await readFile(
    new URL("../../android/app/src/main/java/com/bocal/music/ui/BocalHost.kt", import.meta.url),
    "utf8",
  );
  assert.match(manifest, /RECORD_AUDIO/);
  assert.doesNotMatch(manifest, /uses-permission[^>]+INTERNET/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(webAppScreen, /appassets\.androidplatform\.net/);
  assert.match(client, /APPASSETS_HOST/);
  assert.match(client, /ACTION_VIEW/); // external http(s) links open in the system browser
  assert.match(webAppScreen, /allowFileAccess = false/);
  assert.match(webAppScreen, /addJavascriptInterface\(BocalHost/);
  assert.match(host, /fun setTheme/);
  assert.match(host, /fun setKeepAwake/);
  assert.match(host, /fun saveFile/);
  assert.match(host, /fun openExternal/);
});

test("no APK is served from the built site, and the legacy 0.2 Android tree is gone", async () => {
  const publicDownloads = await readdir(new URL("../public/downloads/", import.meta.url));
  assert.ok(!publicDownloads.some((name) => name.endsWith(".apk")));
  await assert.rejects(() => stat(new URL("../android/", import.meta.url)));
  await assert.rejects(() => stat(new URL("../debug-apks/", import.meta.url)));
});
