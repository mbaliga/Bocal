/** Reveal a selected note without scrolling any ancestor (including the page).
 * scrollIntoView also moved the oboe's below-model chart vertically into view,
 * so simply entering that lab skipped its cinematic model stage.
 */
export function centerNoteInStrip(note: HTMLButtonElement | null): void {
  const strip = note?.parentElement;
  if (!note || !strip || strip.clientWidth <= 0) return;
  const item = note.getBoundingClientRect();
  const viewport = strip.getBoundingClientRect();
  const delta = item.left + item.width / 2 - (viewport.left + strip.clientLeft + strip.clientWidth / 2);
  if (!Number.isFinite(delta)) return;
  // Assign only this strip's horizontal position. Browser bounds naturally
  // clamp it at either end, including negative scrollLeft in an RTL strip.
  strip.scrollLeft += delta;
}
