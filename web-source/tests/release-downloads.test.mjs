import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

test("the public handoff and verified Android build point to repository-owned source and assets", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const publicDownloads = await readdir(new URL("../public/downloads/", import.meta.url));
  assert.ok(publicDownloads.includes("BOCAL_HANDOFF.md"));
  const handoff = await stat(new URL("../public/downloads/BOCAL_HANDOFF.md", import.meta.url));
  const latestApk = (await readFile(new URL("../debug-apks/latest-debug-apk.txt", import.meta.url), "utf8")).trim();
  const committedApks = (await readdir(new URL("../debug-apks/", import.meta.url))).filter((name) => name.endsWith(".apk"));
  assert.ok(committedApks.includes(latestApk));
  const apk = await stat(new URL(`../debug-apks/${latestApk}`, import.meta.url));
  assert.ok(handoff.size > 10_000);
  assert.ok(apk.size > 5_000_000);
  assert.equal(latestApk, "Bocal-native-debug-0.2.0.apk");
  for (const name of ["alto-sax", "oboe", "tenor-sax", "soprano-sax", "clarinet", "flute", "bassoon"]) {
    const sourceImage = await stat(new URL(`../assets/source/bocal-${name}-cinematic.png`, import.meta.url));
    const webImage = await stat(new URL(`../public/images/bocal-${name}-cinematic.webp`, import.meta.url));
    assert.ok(sourceImage.size > 750_000, `${name} source master is present`);
    assert.ok(webImage.size > 10_000, `${name} optimized image is present`);
  }
  assert.match(page, /\/downloads\/BOCAL_HANDOFF\.md/);
  assert.match(page, /\/downloads\/Bocal-native-debug\.apk/);
  assert.match(page, /Verified debug build/);
  assert.match(page, /Settings & model library/i);
  assert.match(page, /Only models with usable rights and player-checked keywork/i);
});

test("native Android foundation stays local-first", async () => {
  const manifest = await readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
  const engine = await readFile(new URL("../android/app/src/main/java/com/bocal/music/audio/TunerEngine.kt", import.meta.url), "utf8");
  const detector = await readFile(new URL("../android/app/src/main/java/com/bocal/music/audio/YinPitchDetector.kt", import.meta.url), "utf8");
  assert.match(manifest, /RECORD_AUDIO/);
  assert.doesNotMatch(manifest, /uses-permission[^>]+INTERNET/);
  assert.match(engine, /AudioRecord/);
  assert.match(engine, /AUDIOFOCUS_LOSS/);
  assert.match(detector, /class YinPitchDetector/);
});

test("native learning parity slice is implemented rather than described as a placeholder", async () => {
  const app = await readFile(new URL("../android/app/src/main/java/com/bocal/music/ui/BocalApp.kt", import.meta.url), "utf8");
  const lab = await readFile(new URL("../android/app/src/main/java/com/bocal/music/ui/SaxophoneLabScreen.kt", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../android/app/src/main/java/com/bocal/music/ui/BocalNavigation.kt", import.meta.url), "utf8");
  const practice = await readFile(new URL("../android/app/src/main/java/com/bocal/music/data/PracticeRepository.kt", import.meta.url), "utf8");
  assert.match(app, /OnboardingGuide/);
  assert.match(app, /SaxophoneLabScreen/);
  assert.match(lab, /BronzeSaxModel/);
  assert.doesNotMatch(lab, /phantom|hand shape|fake hand/i);
  assert.match(navigation, /NavigationSide\.LEFT/);
  assert.match(app, /NavigationSide\.RIGHT/);
  assert.match(practice, /SharedPreferences|getSharedPreferences/);
});
