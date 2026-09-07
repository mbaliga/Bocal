/**
 * Sustained-tone statistics over a take's pitch track.
 *
 * `pitchTrackFrames` (transcribe.ts) already yields a 16 ms-hop
 * `{timeSec, midi, cents, rms}` curve per take; this file turns that into
 * the numbers a player actually wants back after listening to themselves:
 * how centred was each held note, on average, and how much did it wobble.
 *
 * Kept pure and dependency-free so it can be unit tested against synthetic
 * frame sequences without an AudioContext.
 */

import type { PitchTrackFrame } from "./transcribe";

/** A note has to hold for this long before it's a "tone" worth measuring,
 *  not an articulation or a passing note in a scale. */
export const MIN_SEGMENT_MS = 300;
/** Frames per second in a PitchTrackFrame stream (transcribe.ts's HOP/ANALYSIS_RATE). */
const FRAME_HZ = 16000 / 256;

export type ToneSegmentStats = {
  startSec: number;
  endSec: number;
  /** Mean cents-from-target across the segment. */
  meanCents: number;
  /** Median cents-from-target -- less pulled around by a single sour frame. */
  medianCents: number;
  /** Population standard deviation of cents across the segment -- how much
   *  it wandered, independent of which way. */
  stdDevCents: number;
  /** Vibrato modulation rate in Hz, from zero-crossings of the cents curve
   *  after removing its mean (i.e. oscillations around the segment's own
   *  centre, not drift). Null when the segment is too short to estimate one
   *  full cycle. */
  vibratoRateHz: number | null;
  /** Peak-to-peak width of that same detrended curve, in cents. Null under
   *  the same condition as vibratoRateHz. */
  vibratoWidthCents: number | null;
  /** Cents of the note's first ~80ms minus the cents of its steady body --
   *  positive means the attack started sharp of where the note settled.
   *  Null when the segment is too short to separate an attack from a body. */
  attackOffsetCents: number | null;
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[], avg: number) {
  if (values.length === 0) return 0;
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

/** Splits a pitch track into runs of consecutive voiced (midi !== null)
 *  frames on the *same* written note, so a slur from one note to the next
 *  doesn't get averaged into one "tone". */
function voicedSegments(frames: PitchTrackFrame[]): PitchTrackFrame[][] {
  const segments: PitchTrackFrame[][] = [];
  let current: PitchTrackFrame[] = [];
  let currentMidi: number | null = null;
  for (const frame of frames) {
    if (frame.midi === null) {
      if (current.length) segments.push(current);
      current = [];
      currentMidi = null;
      continue;
    }
    if (currentMidi !== null && frame.midi !== currentMidi) {
      segments.push(current);
      current = [];
    }
    current.push(frame);
    currentMidi = frame.midi;
  }
  if (current.length) segments.push(current);
  return segments;
}

/**
 * Zero-crossing based rate estimate: count how many times the detrended
 * curve changes sign, each pair of crossings is one full cycle. Cheap,
 * robust to amplitude, and exactly what "how many times a second did it
 * wobble" means -- no FFT needed for a handful of cycles over a couple of
 * seconds.
 */
function estimateVibrato(cents: number[]): { rateHz: number | null; widthCents: number | null } {
  if (cents.length < 8) return { rateHz: null, widthCents: null };
  const centre = mean(cents);
  const detrended = cents.map((value) => value - centre);
  let crossings = 0;
  for (let index = 1; index < detrended.length; index += 1) {
    if ((detrended[index - 1] < 0 && detrended[index] >= 0) || (detrended[index - 1] > 0 && detrended[index] <= 0)) {
      crossings += 1;
    }
  }
  if (crossings < 2) return { rateHz: null, widthCents: null };
  const durationSec = detrended.length / FRAME_HZ;
  const cycles = crossings / 2;
  const widthCents = Math.max(...detrended) - Math.min(...detrended);
  return { rateHz: cycles / durationSec, widthCents };
}

/** Number of leading frames treated as "the attack" -- about 80ms at the
 *  16ms hop transcribe.ts uses. */
const ATTACK_FRAMES = 5;

export function toneStatsForSegment(segment: PitchTrackFrame[]): ToneSegmentStats | null {
  if (segment.length === 0) return null;
  const durationMs = ((segment[segment.length - 1].timeSec - segment[0].timeSec) * 1000) + (1000 / FRAME_HZ);
  if (durationMs < MIN_SEGMENT_MS) return null;

  const cents = segment.map((frame) => frame.cents);
  const meanCents = mean(cents);
  const medianCents = median(cents);
  const stdDevCents = stdDev(cents, meanCents);
  const { rateHz: vibratoRateHz, widthCents: vibratoWidthCents } = estimateVibrato(cents);

  let attackOffsetCents: number | null = null;
  if (segment.length >= ATTACK_FRAMES * 2) {
    const attack = median(cents.slice(0, ATTACK_FRAMES));
    const body = median(cents.slice(ATTACK_FRAMES));
    attackOffsetCents = Math.round((attack - body) * 10) / 10;
  }

  return {
    startSec: segment[0].timeSec,
    endSec: segment[segment.length - 1].timeSec,
    meanCents: Math.round(meanCents * 10) / 10,
    medianCents: Math.round(medianCents * 10) / 10,
    stdDevCents: Math.round(stdDevCents * 10) / 10,
    vibratoRateHz: vibratoRateHz === null ? null : Math.round(vibratoRateHz * 10) / 10,
    vibratoWidthCents: vibratoWidthCents === null ? null : Math.round(vibratoWidthCents * 10) / 10,
    attackOffsetCents,
  };
}

/** Per-voiced-segment tone statistics for a whole take, segments shorter
 *  than MIN_SEGMENT_MS dropped -- they're articulations, not tones. */
export function computeToneStats(frames: PitchTrackFrame[]): ToneSegmentStats[] {
  return voicedSegments(frames)
    .map(toneStatsForSegment)
    .filter((stat): stat is ToneSegmentStats => stat !== null);
}
