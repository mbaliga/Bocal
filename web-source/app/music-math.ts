// Shared pure pitch/number math used across the tuner's engine, display and
// history modules: `hzToMidi`, `midiToHz`, `centsBetween`, `median` and
// `clamp` used to each have several hand-copied implementations (page.tsx,
// pitch-engine.ts, notation.ts, pitch-history-canvas.ts, skill-rating.ts)
// that could quietly drift apart -- one already had a subtly different
// rounding step before this module existed. One implementation now, tested
// once in music-math.test.mjs.
//
// Fixed at A4 = 440Hz. That's deliberate: `hzToMidi`/`midiToHz` are for
// contexts that don't know or care what the player calibrated to (the raw
// pitch tracker, note-name spelling, the history graph). The tuner's
// *calibrated* conversions -- a chosen reference pitch and temperament --
// are a different, intentionally separate concern that stays in tuning.ts;
// see that module's own comment for why it keeps its own math instead of
// importing this one.

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Cents from `fromHz` to `toHz` -- positive when `toHz` is the sharper of the two. */
export function centsBetween(fromHz: number, toHz: number): number {
  return 1200 * Math.log2(toHz / fromHz);
}

/** The middle value of a sorted copy of `values`; 0 for an empty array. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
