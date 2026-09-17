import assert from "node:assert/strict";
import test from "node:test";
import { CORRECTION_COPY, INSTRUMENTS } from "../app/instruments.ts";

// Source-checked direction, not a substitute for specialist review of the
// complete coaching/fingering curriculum. Yamaha's note-bending explanation:
// https://hub.yamaha.com/music-educators/instruments/winds-instruments/first-year-flutes-success/
// Inward roll lowers pitch; outward roll raises pitch.
const flute = CORRECTION_COPY[INSTRUMENTS.flute.embouchure];

test("a sharp flute receives inward, not outward, roll guidance", () => {
  assert.match(flute.sharp, /\b(?:in|inward)\b/i);
  assert.doesNotMatch(flute.sharp, /\b(?:out|outward)\b/i);
});
test("a flat flute receives outward, not inward, roll guidance", () => {
  assert.match(flute.flat, /\b(?:out|outward)\b/i);
  assert.doesNotMatch(flute.flat, /\b(?:in|inward)\b/i);
});
test("flute guidance remains separate from reed and jaw-pressure instructions", () => {
  assert.equal(INSTRUMENTS.flute.embouchure, "air-reed");
  assert.doesNotMatch(`${flute.sharp} ${flute.flat}`, /\b(?:jaw|bite|biting)\b/i);
});
