import assert from 'node:assert/strict';
import test from 'node:test';
import { centerNoteInStrip } from '../app/horizontal-scroll.ts';
function fixture({ scrollLeft = 0, left = 400, itemWidth = 40, viewportLeft = 10, viewportWidth = 200, border = 0 } = {}) {
  const strip = { scrollLeft, scrollTop: 37, clientLeft: border, clientWidth: viewportWidth, getBoundingClientRect: () => ({ left: viewportLeft }) };
  const note = { parentElement: strip, getBoundingClientRect: () => ({ left, width: itemWidth }), scrollIntoView() { assert.fail('must not scroll ancestors'); } };
  return { note, strip };
}
test('selection centers horizontally without scrolling the page or strip vertically', () => {
  const { note, strip } = fixture();
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, 310);
  assert.equal(strip.scrollTop, 37);
});
test('already-scrolled strips use a relative screen-space delta', () => {
  const { note, strip } = fixture({ scrollLeft: 100 });
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, 410);
});
test('an already-centered note stays put', () => {
  const { note, strip } = fixture({ scrollLeft: 100, left: 90 });
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, 100);
});
test('negative RTL offsets remain valid', () => {
  const { note, strip } = fixture({ scrollLeft: -100, left: -60 });
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, -250);
});
test('strip border is excluded from its content center', () => {
  const { note, strip } = fixture({ left: 92, border: 2 });
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, 0);
});
test('hidden strips and absent/unmounted notes are harmless', () => {
  centerNoteInStrip(null);
  centerNoteInStrip({ parentElement: null });
  const { note, strip } = fixture({ viewportWidth: 0 });
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, 0);
});
test('invalid geometry cannot poison scroll state', () => {
  const { note, strip } = fixture({ left: NaN });
  centerNoteInStrip(note);
  assert.equal(strip.scrollLeft, 0);
});
