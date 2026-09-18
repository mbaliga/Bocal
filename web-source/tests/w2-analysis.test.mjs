// Product-truth assertions for W2-B (analysis-depth-3), kept in their own
// file per WAVE2.md's shared conventions rather than editing the existing
// tests/product-truth.test.mjs, to keep merges clean.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("score export copy admits it quantises at a fixed grid rather than a detected tempo", async () => {
  const source = await readFile(new URL("../app/TranscribePanel.tsx", import.meta.url), "utf8");
  assert.match(source, /Bocal does not detect tempo/);
  assert.match(source, /Export MIDI/);
  assert.match(source, /Export MusicXML/);
});

test("score-export.ts never claims a detected tempo -- toMusicXml's tempo is caller-supplied, with an honest fixed fallback", async () => {
  const source = await readFile(new URL("../app/score-export.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /detect(ed|ing)? tempo/i, "score-export.ts itself must not claim tempo detection it doesn't do");
  assert.match(source, /Defaults to 120/);
});

test("the spectrogram mode's copy describes what the colour means rather than grading tone", async () => {
  const source = await readFile(new URL("../app/AnalysisView.tsx", import.meta.url), "utf8");
  assert.match(source, /Spectrogram/);
  assert.match(source, /Brighter colour means more energy/);
  // The spectrogram's own explanatory paragraph -- not the whole file, which
  // legitimately says "grade" elsewhere for the harmonics view -- must not
  // claim to grade tone quality, only to show what's audible.
  const spectrogramParagraph = source.match(/Brighter colour means more energy[^"]*/)?.[0] ?? "";
  assert.ok(spectrogramParagraph.length > 0, "expected to find the spectrogram's explanatory paragraph");
  assert.doesNotMatch(spectrogramParagraph, /grade/i);
});

test("A/B compare never claims accuracy the overlay analysis doesn't have -- the difference row is plain arithmetic, not a verdict", async () => {
  const source = await readFile(new URL("../app/TakePitchTrace.tsx", import.meta.url), "utf8");
  assert.match(source, /overlayTakeId/);
  assert.match(source, /take-compare-diff/);
  assert.doesNotMatch(source, /better|worse|winner/i);
});

test("take tags and notes are sanitised on both write and read, not trusted from storage as-is", async () => {
  const store = await readFile(new URL("../app/takes-store.ts", import.meta.url), "utf8");
  assert.match(store, /normalizeStoredTake/);
  assert.match(store, /sanitizeTags\(take\.tags\)/);
  assert.match(store, /sanitizeTakeNotes\(take\.notes\)/);
});
