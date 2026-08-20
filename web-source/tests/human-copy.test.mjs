import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SURFACES = [
  "../app/page.tsx",
  "../app/InstrumentExperience.tsx",
  "../app/SaxophoneLab.tsx",
  "../app/OboeLab.tsx",
  "../app/PracticeTools.tsx",
  "../app/AnalysisView.tsx",
];

test("customer-facing copy avoids the old synthetic product language", async () => {
  const copy = (await Promise.all(SURFACES.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  for (const phrase of [
    "Signal truth",
    "Instrument truth",
    "Measured here. Never guessed.",
    "Read the encoding literally.",
    "What it does not claim",
    "Start with the instrument, not a dashboard.",
    "One score, with every input visible.",
    "Time, without friction.",
    "no guilt mechanics",
    "hand guide",
    "see the grip",
  ]) {
    assert.doesNotMatch(copy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("instrument selection and working cards use the cinematic image set", async () => {
  const experience = await readFile(new URL("../app/InstrumentExperience.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const name of ["alto-sax", "oboe", "tenor-sax", "soprano-sax", "clarinet", "flute", "bassoon"]) {
    assert.match(experience + styles, new RegExp(`bocal-${name}-cinematic\\.webp`));
  }
  for (const card of ["insight-card", "today-strip", "analysis-card", "metronome-card", "skill-rating-card", "focus-plan", "equipment-card"]) {
    assert.match(styles, new RegExp(`\\.${card}`));
  }
});
