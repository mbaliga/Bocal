// The vocal-range finder: a stored lowest and highest note the singer chose to
// record, and the small state machine that captures each one.
//
// The range is the singer's own record of two notes they sang on a given day.
// It is not an assessment of the voice, and nothing in this module labels or
// sorts it. It exists so the graph can scale to the notes the singer actually
// uses and shade them. Pure and DOM-free so the median, the capture rules and
// the storage sanitiser are tested under Node (tests/vocal-range.test.mjs).

import { median } from "./music-math";

/** Notes outside C0..C8 are not something a microphone reading can reasonably produce for a voice. */
export const VOCAL_RANGE_MIN_MIDI = 12;
export const VOCAL_RANGE_MAX_MIDI = 108;

export type VocalRange = {
  /** Lowest recorded note, a whole MIDI number. */
  low: number;
  /** Highest recorded note, a whole MIDI number, always above `low`. */
  high: number;
  /** When the singer saved it, in epoch milliseconds. */
  savedAt: number;
};

function isMidiNote(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= VOCAL_RANGE_MIN_MIDI && value <= VOCAL_RANGE_MAX_MIDI;
}

/** Returns a clean copy of `value` or null when it is not a usable stored range. */
export function sanitizeVocalRange(value: unknown): VocalRange | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { low, high, savedAt } = record;
  if (!isMidiNote(low) || !isMidiNote(high)) return null;
  if (!(low < high)) return null;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt) || savedAt <= 0) return null;
  return { low, high, savedAt };
}

/** Parses a stored string; anything unreadable or malformed is "no range saved". */
export function parseVocalRange(raw: string | null): VocalRange | null {
  if (!raw) return null;
  try {
    return sanitizeVocalRange(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The stored form. Clearing writes "null", which parses back to no range. */
export function serializeVocalRange(range: VocalRange | null): string {
  const clean = range ? sanitizeVocalRange(range) : null;
  return clean ? JSON.stringify({ low: clean.low, high: clean.high, savedAt: clean.savedAt }) : "null";
}

/** "17 semitones" or "1 semitone", for the range card. */
export function semitoneCountLabel(range: Pick<VocalRange, "low" | "high">): string {
  const span = range.high - range.low;
  return `${span} ${span === 1 ? "semitone" : "semitones"}`;
}

/** "1 octave and 5 semitones" style wording of the same span; empty under one semitone. */
export function octaveSpanLabel(range: Pick<VocalRange, "low" | "high">): string {
  const span = range.high - range.low;
  const octaves = Math.floor(span / 12);
  const rest = span % 12;
  const parts: string[] = [];
  if (octaves > 0) parts.push(`${octaves} ${octaves === 1 ? "octave" : "octaves"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "semitone" : "semitones"}`);
  return parts.join(" and ");
}

/** Where a note sits along the range card's scale, 0 at the bottom note and 1 at the top. */
export function barFraction(midi: number, scaleLow: number, scaleHigh: number): number {
  if (!(scaleHigh > scaleLow)) return 0;
  return Math.min(1, Math.max(0, (midi - scaleLow) / (scaleHigh - scaleLow)));
}

export { median };

// -- Capturing one note --------------------------------------------------

/** How long the singer holds a note for it to be recorded. */
export const CAPTURE_HOLD_MS = 2_000;
/** Silence or dropout longer than this restarts the hold. */
export const CAPTURE_MAX_DROPOUT_MS = 300;
/** A reading this far (in semitones) from the held note's median restarts the hold: the voice moved. */
export const CAPTURE_MAX_DRIFT_SEMITONES = 1.5;
/** Fewest locked readings a finished hold may rest on. */
export const CAPTURE_MIN_READINGS = 20;

export type CapturePhase = "waiting" | "holding" | "done";

export type CaptureResult = {
  /** The recorded note: the median of the held readings, rounded to a whole semitone. */
  midi: number;
  /** The unrounded median, for display. */
  pitch: number;
  readings: number;
};

/**
 * Records one note: the median of the locked pitch readings across a
 * continuous two-second hold. Feed it one reading per tuner frame, with
 * `null` for a frame that is not a locked pitch. A long dropout, or a voice
 * that wanders more than a semitone and a half from the note being held,
 * restarts the hold rather than averaging two different notes together.
 */
export class RangeCapture {
  private holdStartMs: number | null = null;
  private lastVoicedMs: number | null = null;
  private readings: number[] = [];
  private result: CaptureResult | null = null;

  get phase(): CapturePhase {
    if (this.result) return "done";
    return this.holdStartMs === null ? "waiting" : "holding";
  }

  /** Progress through the hold, 0 to 1. */
  progress(nowMs: number): number {
    if (this.result) return 1;
    if (this.holdStartMs === null) return 0;
    return Math.min(1, Math.max(0, (nowMs - this.holdStartMs) / CAPTURE_HOLD_MS));
  }

  get captured(): CaptureResult | null {
    return this.result;
  }

  reset() {
    this.holdStartMs = null;
    this.lastVoicedMs = null;
    this.readings = [];
    this.result = null;
  }

  push(tMs: number, pitch: number | null): CaptureResult | null {
    if (this.result) return this.result;
    if (pitch === null || !Number.isFinite(pitch)) {
      if (this.lastVoicedMs !== null && tMs - this.lastVoicedMs > CAPTURE_MAX_DROPOUT_MS) this.restart();
      return null;
    }
    if (this.lastVoicedMs !== null && tMs - this.lastVoicedMs > CAPTURE_MAX_DROPOUT_MS) this.restart();
    if (this.readings.length >= 5 && Math.abs(pitch - median(this.readings)) > CAPTURE_MAX_DRIFT_SEMITONES) this.restart();
    if (this.holdStartMs === null) this.holdStartMs = tMs;
    this.lastVoicedMs = tMs;
    this.readings.push(pitch);
    if (tMs - this.holdStartMs >= CAPTURE_HOLD_MS && this.readings.length >= CAPTURE_MIN_READINGS) {
      const middle = median(this.readings);
      this.result = { midi: Math.round(middle), pitch: middle, readings: this.readings.length };
    }
    return this.result;
  }

  private restart() {
    this.holdStartMs = null;
    this.lastVoicedMs = null;
    this.readings = [];
  }
}

export type RangeStep = "idle" | "low" | "high";

export type RangePair = { low: number; high: number };

/**
 * Combines the two captured notes into a range, or says why it cannot. The
 * second note has to be above the first; if the singer captured them the
 * other way round, nothing is saved and they are asked to redo the second.
 */
export function buildVocalRange(low: number, high: number, savedAt: number): { range: VocalRange | null; reason: "ok" | "order" | "out-of-bounds" } {
  const range = sanitizeVocalRange({ low, high, savedAt });
  if (range) return { range, reason: "ok" };
  if (!(low < high)) return { range: null, reason: "order" };
  return { range: null, reason: "out-of-bounds" };
}
