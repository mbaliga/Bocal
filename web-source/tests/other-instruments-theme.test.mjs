import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the wider instrument gallery is rich discovery, not an unsafe instrument selector", async () => {
  const experience = await readFile(new URL("../app/InstrumentExperience.tsx", import.meta.url), "utf8");
  const otherCollection = experience.match(/const OTHER_INSTRUMENTS:[\s\S]*?\n\];/);

  assert.ok(otherCollection, "other instrument collection is declared");
  assert.match(experience, /Woodwinds/);
  assert.match(experience, /Other Instruments/);
  assert.doesNotMatch(otherCollection[0], /availableId/);
  for (const family of ["Bowed strings", "Fretted & plucked", "Brass", "Keyboards", "Percussion", "Voice", "Electronic & MIDI"]) {
    assert.match(otherCollection[0], new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(experience, /InstrumentId until each profile has a validated musical contract/);
});

test("appearance is persisted before paint and has semantic material tokens", async () => {
  const [page, layout, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const THEME_STORAGE_KEY = "bocal-theme"/);
  assert.match(page, /Switch to \$\{theme === "dark" \? "light" : "dark"\} appearance/);
  assert.match(page, /Appearance/);
  assert.match(layout, /themeBootstrap/);
  assert.match(layout, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(styles, /html\[data-theme="light"\]/);
  assert.match(styles, /--bocal-material-page/);
  assert.match(styles, /Light is a material inversion, not a colour inversion/);
});
