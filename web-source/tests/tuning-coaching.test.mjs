import assert from 'node:assert/strict';
import test from 'node:test';
import { CORRECTION_COPY, INSTRUMENTS } from '../app/instruments.ts';

// Yamaha's note-bending reference: inward lowers pitch; outward raises it.
// https://hub.yamaha.com/music-educators/instruments/winds-instruments/first-year-flutes-success/
// Check the actual instruction rather than merely checking that copy exists.
test('sharp flute guidance pairs an inward adjustment with easing air speed', () => {
  const instruction = CORRECTION_COPY[INSTRUMENTS.flute.embouchure].sharp;
  assert.match(instruction, /slightly in/);
  assert.match(instruction, /ease the air speed/);
  assert.doesNotMatch(instruction, /slightly out/);
});
test('flat flute guidance pairs an outward adjustment with increased air speed', () => {
  const instruction = CORRECTION_COPY[INSTRUMENTS.flute.embouchure].flat;
  assert.match(instruction, /slightly out/);
  assert.match(instruction, /speed the air up/);
  assert.doesNotMatch(instruction, /slightly in/);
});
