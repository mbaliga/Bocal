// Live feedback for the three Vocal warm-up steps. All of it is arithmetic on
// the pitch the tuner is already reporting; none of it judges the singing.
//
//   * Sustain: a ring that fills while the pitch sits inside a band around a
//     chosen note, and eases back when it leaves.
//   * Glide: a sine-shaped siren path between two chosen notes that the
//     singer's line is drawn over.
//   * Start cleanly: a tick wherever a sound begins after a short silence.
//
// Pure and DOM-free so the rules are tested under Node
// (tests/vocal-warmups.test.mjs).

import type { TimeView } from "./vocal-graph";

// -- Sustain ---------------------------------------------------------------

/** The existing warm-up text asks for four slow counts; one count is about a second. */
export const SUSTAIN_FILL_MS = 4_000;
/** Voices move more than an instrument does, so the band is never tighter than this. */
export const SUSTAIN_MIN_BAND_CENTS = 10;
/** The ring empties at this fraction of the speed it fills, so a wobble costs little. */
export const SUSTAIN_DRAIN_RATIO = 0.5;
/** Longest gap between frames that is counted as continuous time. */
const MAX_FRAME_DT_MS = 100;

/** The band half-width in cents: the tuner's Precision tolerance, but never under SUSTAIN_MIN_BAND_CENTS. */
export function sustainBandCents(precisionToleranceCents: number): number {
  return Math.max(SUSTAIN_MIN_BAND_CENTS, precisionToleranceCents);
}

export class SustainMeter {
  /** Ring fill, 0 to 1. */
  fill = 0;
  /** Milliseconds spent inside the band since the last reset. */
  inBandMs = 0;
  /** True once the ring has been filled; stays true until reset. */
  reached = false;
  private lastMs: number | null = null;

  reset() {
    this.fill = 0;
    this.inBandMs = 0;
    this.reached = false;
    this.lastMs = null;
  }

  /** `pitch` is the continuous MIDI pitch, or null when nothing is voiced. */
  push(tMs: number, pitch: number | null, targetMidi: number, bandCents: number) {
    const dt = this.lastMs === null ? 0 : Math.min(Math.max(tMs - this.lastMs, 0), MAX_FRAME_DT_MS);
    this.lastMs = tMs;
    const inBand = pitch !== null && Math.abs(pitch - targetMidi) * 100 <= bandCents;
    if (inBand) {
      this.inBandMs += dt;
      this.fill = Math.min(1, this.fill + dt / SUSTAIN_FILL_MS);
      if (this.fill >= 1) this.reached = true;
    } else {
      this.fill = Math.max(0, this.fill - (dt / SUSTAIN_FILL_MS) * SUSTAIN_DRAIN_RATIO);
    }
  }
}

// -- Glide -----------------------------------------------------------------

export const GLIDE_DURATION_MS = 8_000;
export const GLIDE_LEAD_MS = 1_500;
export const GLIDE_TAIL_MS = 800;

export type GlideAttempt = {
  fromMidi: number;
  toMidi: number;
  /** When the path begins (a short lead-in after the button press). */
  startMs: number;
  durationMs: number;
  /** The fixed time window the graph shows while the attempt runs. */
  view: TimeView;
  /** When the view is released back to the scrolling graph. */
  releaseMs: number;
};

/** A one-way-and-back siren: starts on `fromMidi`, reaches `toMidi` halfway, returns. */
export function makeGlideAttempt(
  nowMs: number,
  fromMidi: number,
  toMidi: number,
  durationMs: number = GLIDE_DURATION_MS,
): GlideAttempt {
  const startMs = nowMs + GLIDE_LEAD_MS;
  const endMs = startMs + durationMs;
  const releaseMs = endMs + GLIDE_TAIL_MS;
  return {
    fromMidi,
    toMidi,
    startMs,
    durationMs,
    releaseMs,
    view: { endMs: releaseMs, windowMs: releaseMs - nowMs },
  };
}

/** The path's pitch at time `tMs`, or null before it starts and after it ends. */
export function glidePitchAt(attempt: GlideAttempt, tMs: number): number | null {
  const u = (tMs - attempt.startMs) / attempt.durationMs;
  if (u < 0 || u > 1) return null;
  return attempt.fromMidi + (attempt.toMidi - attempt.fromMidi) * ((1 - Math.cos(2 * Math.PI * u)) / 2);
}

/** Points along the path for drawing; both ends are included. */
export function glidePath(attempt: GlideAttempt, steps = 64): { tMs: number; pitch: number }[] {
  const points: { tMs: number; pitch: number }[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const tMs = attempt.startMs + (attempt.durationMs * index) / steps;
    points.push({ tMs, pitch: glidePitchAt(attempt, tMs) as number });
  }
  return points;
}

export function glideRunning(attempt: GlideAttempt | null, nowMs: number): attempt is GlideAttempt {
  return attempt !== null && nowMs < attempt.releaseMs;
}

// -- Start cleanly -----------------------------------------------------------

/** Silence of at least this long before a voiced frame makes that frame an attack. */
export const ONSET_SILENCE_MS = 300;

export type Onset = {
  tMs: number;
  /** Continuous MIDI pitch of the first voiced frame. */
  pitch: number;
};

export class OnsetDetector {
  private silentSince: number | null = null;
  private lastVoicedMs: number | null = null;

  reset() {
    this.silentSince = null;
    this.lastVoicedMs = null;
  }

  /** Returns an onset when this frame is the first voiced one after at least ONSET_SILENCE_MS of silence. */
  push(tMs: number, pitch: number | null): Onset | null {
    if (pitch === null) {
      if (this.silentSince === null) this.silentSince = tMs;
      return null;
    }
    const silenceStart = this.silentSince !== null
      ? this.silentSince
      : this.lastVoicedMs;
    const isAttack = silenceStart !== null && tMs - silenceStart >= ONSET_SILENCE_MS;
    this.silentSince = null;
    this.lastVoicedMs = tMs;
    return isAttack ? { tMs, pitch } : null;
  }
}
