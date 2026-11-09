import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HARMONICA_CHARTS } from "../app/fingering-charts/index.ts";
import { INSTRUMENTS, INSTRUMENT_ORDER, CORRECTION_COPY } from "../app/instruments.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("both harmonicas are registered in the chart index with the exact badge text", async () => {
  assert.ok(HARMONICA_CHARTS["diatonic-harmonica"]);
  assert.ok(HARMONICA_CHARTS["chromatic-harmonica"]);
  assert.equal(HARMONICA_CHARTS["diatonic-harmonica"].review, "Standard Richter layout, computed, not teacher-reviewed.");
  for (const chart of Object.values(HARMONICA_CHARTS)) {
    assert.match(chart.review, /computed, not teacher-reviewed\.$/);
    assert.match(chart.caveat, /Bend availability varies by harp and player/);
  }
  const index = await read("../app/fingering-charts/index.ts");
  assert.match(index, /"diatonic-harmonica": DIATONIC_HARMONICA_CHART/);
  assert.match(index, /"chromatic-harmonica": CHROMATIC_HARMONICA_CHART/);
});

test("the chart view renders the badge and the caveat from the chart data, never a hand-typed claim", async () => {
  const view = await read("../app/HarmonicaChart.tsx");
  assert.match(view, /chart-review-badge[^\n]*\{chart\.review\}/);
  assert.match(view, /\{chart\.caveat\}/);
  assert.doesNotMatch(view, /teacher-reviewed(?!\.)/i, "no copy elsewhere should imply a review happened");
  assert.doesNotMatch(view, /verified by|checked by a teacher|guaranteed/i);
});

test("overblows and overdraws are labelled unverified wherever they are shown", async () => {
  const harmonica = await read("../app/fingering-charts/harmonica.ts");
  const view = await read("../app/HarmonicaChart.tsx");
  assert.match(harmonica, /advanced: true, unverified: true/);
  assert.match(view, /Overblows and overdraws \(advanced, unverified\)/);
  assert.match(view, /<ShieldAlert size=\{13\} \/> Unverified/);
  // The advanced rows are opt-in: off by default.
  assert.match(view, /useState\(false\);\s*\n\s*const \[slideIn/);
});

test("the profiles appear in the picker data, in the order the picker lists them", () => {
  for (const id of ["diatonic-harmonica", "chromatic-harmonica"]) {
    assert.ok(INSTRUMENT_ORDER.includes(id), `${id} is in INSTRUMENT_ORDER`);
    assert.equal(INSTRUMENTS[id].family, "Free reed");
    assert.equal(INSTRUMENTS[id].embouchure, "free-reed");
    assert.match(INSTRUMENTS[id].labStatus, /not teacher-reviewed/);
  }
  assert.ok(INSTRUMENT_ORDER.length >= 10);
  assert.ok(CORRECTION_COPY["free-reed"].sharp.length > 0 && CORRECTION_COPY["free-reed"].flat.length > 0);
  // No jaw, reed-biting or lip advice for an instrument that has none of those.
  const copy = `${CORRECTION_COPY["free-reed"].sharp} ${CORRECTION_COPY["free-reed"].flat}`;
  assert.doesNotMatch(copy, /jaw|bite|biting|lip|embouchure hole/i);
});

test("the harmonica gallery cards use the project's own instrument-only image", async () => {
  const experience = await read("../app/InstrumentExperience.tsx");
  const block = experience.match(/const FREE_REED_GALLERY_INSTRUMENTS:[\s\S]*?\n\];/);
  assert.ok(block, "FREE_REED_GALLERY_INSTRUMENTS must exist");
  assert.equal((block[0].match(/availableId: "/g) ?? []).length, 2);
  // Both cards share the one image added with the gallery imagery change; it has no brand lettering.
  assert.equal((block[0].match(/image: "\/images\/bocal-mouth-organ-cinematic\.jpg"/g) ?? []).length, 2);
  assert.match(block[0], /availableId: "diatonic-harmonica"/);
  assert.match(block[0], /availableId: "chromatic-harmonica"/);
  assert.match(block[0], /not teacher-reviewed/);
  // The picker and the onboarding deck both list the section, and the learn step has harmonica copy.
  assert.equal((experience.match(/items=\{FREE_REED_GALLERY_INSTRUMENTS\}/g) ?? []).length, 2);
  assert.match(experience, /harmonica: \{\s*\n\s*title: "See which hole to play/);
});

test("the one harmonica image is bundled, is not a third-party asset, and no harmonica model was added", async () => {
  const { readdir, stat } = await import("node:fs/promises");
  const images = await readdir(new URL("../public/images/", import.meta.url));
  const models = await readdir(new URL("../public/models/", import.meta.url));
  assert.deepEqual(images.filter((name) => /harmonica|mouth-?organ/i.test(name)), ["bocal-mouth-organ-cinematic.jpg"]);
  assert.ok((await stat(new URL("../public/images/bocal-mouth-organ-cinematic.jpg", import.meta.url))).size > 10_000);
  assert.deepEqual(models.filter((name) => /harmonica|mouth-?organ/i.test(name)), []);
  const credits = await read("../public/images/ATTRIBUTION.md");
  assert.match(credits, /bocal-mouth-organ-cinematic\.jpg/);
  assert.match(credits, /original to Bocal/i);
});

test("the key is persisted under a -v1 storage constant and read through the sanitiser", async () => {
  const keys = await read("../app/storage-keys.ts");
  const view = await read("../app/HarmonicaChart.tsx");
  assert.match(keys, /export const HARMONICA_KEY_STORAGE_KEY = "bocal-harmonica-key-v1"/);
  assert.match(view, /usePersistedSetting<HarmonicaKeyId>\(HARMONICA_KEY_STORAGE_KEY, parseKey/);
  assert.match(view, /sanitiseHarmonicaKey\(raw\)/);
});

test("hear-it uses the audio clock and the tuner link is wired through the single routing edit", async () => {
  const view = await read("../app/HarmonicaChart.tsx");
  const page = await read("../app/page.tsx");
  assert.match(view, /context\.currentTime/);
  assert.match(view, /oscillator\.start\(now\)/);
  assert.doesNotMatch(view.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /setTimeout|setInterval/);
  assert.equal((page.match(/<HarmonicaChart /g) ?? []).length, 1);
  assert.match(page, /instrument\.labTier === "harmonica"\s*\n\s*\? <HarmonicaChart[^\n]*reading=\{tuner\.reading/);
});

test("harmonica copy is wired wherever other tiers have copy", async () => {
  const tuner = await read("../app/TunerView.tsx");
  const page = await read("../app/page.tsx");
  assert.match(tuner, /labTier === "harmonica"/);
  assert.match(page, /labTier === "harmonica"\) return "Chart"/);
  assert.match(page, /labTier === "harmonica" \? <Columns4/);
});

test("the docs list both harmonicas with the caveat and answer the naming question", async () => {
  const current = await read("../../docs/CURRENT_STATE.md");
  const handoff = await read("../../docs/BOCAL_HANDOFF.md");
  for (const doc of [current, handoff]) {
    assert.match(doc, /Diatonic harmonica/);
    assert.match(doc, /Chromatic harmonica/);
    assert.match(doc, /computed, not teacher-reviewed/);
  }
  assert.match(handoff + current, /"harmonica" is the standard English name, "mouth organ" is the informal name, and it is a free reed wind instrument/);
});
