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

test("native Android foundation stays local-first", async () => {
  // android/ at repository root is the release app. web-source/android is an
  // older companion project and must never be used as build evidence.
  const manifest = await readFile(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  const engine = await readFile(new URL("../../android/app/src/main/java/com/bocal/music/audio/TunerEngine.kt", import.meta.url), "utf8");
  const detector = await readFile(new URL("../../android/app/src/main/java/com/bocal/music/audio/YinPitchDetector.kt", import.meta.url), "utf8");
  assert.match(manifest, /RECORD_AUDIO/);
  assert.match(manifest, /android:icon="@mipmap\/ic_bocal"/);
  assert.doesNotMatch(manifest, /uses-permission[^>]+INTERNET/);
  for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const icon = await stat(new URL(`../../android/app/src/main/res/mipmap-${density}/ic_bocal.png`, import.meta.url));
    assert.ok(icon.size > 1_000, `${density} Bocal launcher icon is present`);
  }
  assert.match(engine, /AudioRecord/);
  assert.match(engine, /AudioRecord\.ERROR_DEAD_OBJECT/);
  assert.match(detector, /class YinPitchDetector/);
});

test("release Android shell loads the bundled Bocal web application", async () => {
  const shell = await readFile(new URL("../../android/app/src/main/java/com/bocal/music/ui/WebAppScreen.kt", import.meta.url), "utf8");
  const bundle = await stat(new URL("../../android/app/src/main/assets/www/app.html", import.meta.url));
  assert.match(shell, /WebViewAssetLoader/);
  assert.match(shell, /https:\/\/appassets\.androidplatform\.net\/assets\/www\/app\.html/);
  assert.match(shell, /RESOURCE_AUDIO_CAPTURE/);
  assert.ok(bundle.size > 1_000_000, "the self-contained release web bundle is present");
});
