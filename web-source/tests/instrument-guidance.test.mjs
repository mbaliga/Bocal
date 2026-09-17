import assert from "node:assert/strict";
import test from "node:test";
import { CORRECTION_COPY, INSTRUMENTS } from "../app/instruments.ts";

// Yamaha, Set Up Your First-Year Flutes for Success, note-bending section:
// https://hub.yamaha.com/music-educators/instruments/winds-instruments/first-year-flutes-success/
// Rolling in lowers pitch; rolling out raises it. This is a narrow regression
// check of the UI guidance, not a claim of specialist validation of the charts.
test("a sharp flute is guided inward/lower, not farther outward/sharp", () => {
  const copy = CORRECTION_COPY[INSTRUMENTS.flute.embouchure].sharp;
  assert.match(copy, /slightly in,/);
  assert.match(copy, /ease the air speed/);
  assert.doesNotMatch(copy, /slightly out,/);
});
test("a flat flute is guided outward/higher, not farther inward/flat", () => {
  const copy = CORRECTION_COPY[INSTRUMENTS.flute.embouchure].flat;
  assert.match(copy, /slightly out,/);
  assert.match(copy, /speed the air up/);
  assert.doesNotMatch(copy, /slightly in,/);
});
