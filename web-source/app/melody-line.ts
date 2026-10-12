// Target melodies for the Vocal stage, and the arithmetic that sets a sung
// line beside them.
//
// A melody here is a short list of notes, each with a length in beats, at a
// tempo. Bocal plays it as reference tones, draws every note as a band on the
// pitch graph, and afterwards reports, for each note, where the singer's
// pitch sat on average and for how long it stayed inside the band. That is
// all it reports. It is pitch information only: nothing here looks at timing
// (when a note was started or left), at technique, or at tone, and nothing
// turns the figures into a mark.
//
// Pure and DOM-free so the sanitiser and the statistics are tested under Node
// (tests/melody-line.test.mjs). The player and editor are MelodyTarget.tsx.
//
// Time convention: the same clock as the graph's frames, `performance.now()`
// milliseconds. `melodySegments` takes the moment the first note begins on
// that clock; `noteStatistics` takes frames stamped on it.

import { clamp } from "./music-math";
import type { PitchHistorySample } from "./pitch-history";
import { fitPitchView, samplePitch, type PitchView } from "./vocal-graph";

// -- Types and bounds ---------------------------------------------------------

export type MelodyNote = {
  /** A whole MIDI note, MELODY_MIDI_MIN..MELODY_MIDI_MAX. */
  midi: number;
  /** Length in beats, MELODY_BEATS_MIN..MELODY_BEATS_MAX, in steps of a quarter beat. */
  beats: number;
};

export type Melody = {
  id: string;
  name: string;
  tempoBpm: number;
  notes: MelodyNote[];
  /** "bundled" melodies are Bocal's own exercises and are never stored; "user" ones are the singer's. */
  source: "bundled" | "user";
};

export const MELODY_MIN_NOTES = 1;
export const MELODY_MAX_NOTES = 64;
export const MELODY_MIDI_MIN = 24;
export const MELODY_MIDI_MAX = 96;
export const MELODY_BEATS_MIN = 0.25;
export const MELODY_BEATS_MAX = 16;
export const MELODY_TEMPO_MIN = 30;
export const MELODY_TEMPO_MAX = 240;
export const MELODY_NAME_MAX = 40;
export const MELODY_ID_MAX = 64;
/** Most melodies kept on the device; a list longer than this is cut when it is read. */
export const MAX_USER_MELODIES = 24;
export const DEFAULT_MELODY_TEMPO = 72;
export const DEFAULT_NEW_NOTE_BEATS = 1;

// -- Bundled melodies ---------------------------------------------------------

const A3 = 57;

/**
 * Bocal's own short exercises, written for this app and not taken from any
 * song. They sit around A3 so they start in a middle voice's easy range; the
 * player can move any melody to start on another note.
 */
export const BUNDLED_MELODIES: readonly Melody[] = [
  {
    id: "bundled-five-note-scale",
    name: "Five-note scale",
    tempoBpm: 72,
    source: "bundled",
    notes: [A3, A3 + 2, A3 + 4, A3 + 5, A3 + 7].map((midi, index) => ({ midi, beats: index === 4 ? 2 : 1 })),
  },
  {
    id: "bundled-arpeggio",
    name: "Arpeggio",
    tempoBpm: 76,
    source: "bundled",
    notes: [0, 4, 7, 12, 7, 4, 0].map((step, index) => ({ midi: A3 + step, beats: index === 6 ? 2 : 1 })),
  },
  {
    id: "bundled-octave-leap",
    name: "Octave leap",
    tempoBpm: 60,
    source: "bundled",
    notes: [{ midi: A3, beats: 2 }, { midi: A3 + 12, beats: 2 }, { midi: A3, beats: 2 }],
  },
  {
    // A glide cannot be set as a target for each instant, so the siren is two long notes
    // with the slide between them left to the singer.
    id: "bundled-siren",
    name: "Siren",
    tempoBpm: 48,
    source: "bundled",
    notes: [{ midi: A3, beats: 4 }, { midi: A3 + 7, beats: 4 }],
  },
  {
    id: "bundled-descending-fifth",
    name: "Descending fifth",
    tempoBpm: 72,
    source: "bundled",
    notes: [7, 5, 4, 2, 0].map((step, index) => ({ midi: A3 + step, beats: index === 4 ? 2 : 1 })),
  },
  {
    id: "bundled-sustained-third",
    name: "Sustained third",
    tempoBpm: 56,
    source: "bundled",
    notes: [{ midi: A3, beats: 4 }, { midi: A3 + 4, beats: 4 }],
  },
];

// -- Sanitising and storage ------------------------------------------------------

function wholeInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(Math.round(value), min, max);
}

function snapBeats(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(Math.round(value * 4) / 4, MELODY_BEATS_MIN, MELODY_BEATS_MAX);
}

export function sanitiseNote(value: unknown): MelodyNote | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const midi = wholeInRange(record.midi, MELODY_MIDI_MIN, MELODY_MIDI_MAX);
  const beats = snapBeats(record.beats);
  if (midi === null || beats === null) return null;
  return { midi, beats };
}

/**
 * A clean copy of one stored melody, or null when it is not a melody at all.
 * Numbers outside their bounds are brought to the nearest bound; a note that
 * is not a note is dropped; a melody left with no notes is dropped. Whatever
 * `source` the record claims, a melody read from storage is the singer's own.
 */
export function sanitiseMelody(value: unknown): Melody | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, MELODY_ID_MAX) : "";
  if (!id) return null;
  const tempo = wholeInRange(record.tempoBpm, MELODY_TEMPO_MIN, MELODY_TEMPO_MAX);
  if (tempo === null) return null;
  if (!Array.isArray(record.notes)) return null;
  const notes: MelodyNote[] = [];
  for (const entry of record.notes) {
    const note = sanitiseNote(entry);
    if (note) notes.push(note);
    if (notes.length >= MELODY_MAX_NOTES) break;
  }
  if (notes.length < MELODY_MIN_NOTES) return null;
  const name = typeof record.name === "string" ? record.name.trim().slice(0, MELODY_NAME_MAX) : "";
  return { id, name: name || "My melody", tempoBpm: tempo, notes, source: "user" };
}

/** A clean list from whatever was stored: not an array is an empty list, bad entries and repeated ids are dropped. */
export function sanitiseMelodies(value: unknown): Melody[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const melodies: Melody[] = [];
  for (const entry of value) {
    const melody = sanitiseMelody(entry);
    if (!melody || seen.has(melody.id)) continue;
    seen.add(melody.id);
    melodies.push(melody);
    if (melodies.length >= MAX_USER_MELODIES) break;
  }
  return melodies;
}

/** The stored form: only the singer's own melodies, in the sanitised shape. Bundled melodies are never written. */
export function serialiseMelodies(melodies: readonly Melody[]): string {
  const own = melodies.filter((melody) => melody.source === "user");
  return JSON.stringify(sanitiseMelodies(own).map(({ id, name, tempoBpm, notes }) => ({ id, name, tempoBpm, notes })));
}

/** Parses a stored string. Unreadable JSON is "nothing saved yet" rather than an error. */
export function parseMelodies(raw: string | null): Melody[] {
  if (!raw) return [];
  try {
    return sanitiseMelodies(JSON.parse(raw));
  } catch {
    return [];
  }
}

let idCounter = 0;
/** A fresh id for a melody the singer makes. Not derived from the clock alone so two saves in one millisecond differ. */
export function newMelodyId(nowMs: number = Date.now()): string {
  idCounter += 1;
  return `user-${nowMs.toString(36)}-${idCounter.toString(36)}`;
}

// -- Timing -----------------------------------------------------------------------

export type MelodySegment = {
  index: number;
  midi: number;
  beats: number;
  /** When the note begins, on the graph's clock (milliseconds). */
  startMs: number;
  /** When the note ends; the next note begins at this moment. */
  endMs: number;
};

/** Milliseconds in one beat at `tempoBpm`. */
export function beatMs(tempoBpm: number): number {
  return 60_000 / clamp(tempoBpm, MELODY_TEMPO_MIN, MELODY_TEMPO_MAX);
}

/** The whole melody's length in milliseconds. */
export function melodyDurationMs(melody: Pick<Melody, "tempoBpm" | "notes">): number {
  let beats = 0;
  for (const note of melody.notes) beats += note.beats;
  return beats * beatMs(melody.tempoBpm);
}

/** Lays the melody's notes end to end from `startTime` (milliseconds on the graph's clock). */
export function melodySegments(melody: Pick<Melody, "tempoBpm" | "notes">, startTime: number): MelodySegment[] {
  const perBeat = beatMs(melody.tempoBpm);
  const segments: MelodySegment[] = [];
  let cursor = startTime;
  melody.notes.forEach((note, index) => {
    const endMs = cursor + note.beats * perBeat;
    segments.push({ index, midi: note.midi, beats: note.beats, startMs: cursor, endMs });
    cursor = endMs;
  });
  return segments;
}

/** The note sounding at `tMs`, or -1 before the first note and after the last. */
export function segmentIndexAt(segments: readonly MelodySegment[], tMs: number): number {
  for (const segment of segments) {
    if (tMs >= segment.startMs && tMs < segment.endMs) return segment.index;
  }
  return -1;
}

/** The same melody with every note moved so the first one lands on `firstMidi`; notes stay inside the allowed bounds. */
export function startMelodyOn<T extends Pick<Melody, "notes">>(melody: T, firstMidi: number): T {
  const first = melody.notes[0];
  if (!first) return melody;
  const shift = Math.round(firstMidi) - first.midi;
  if (shift === 0) return melody;
  return { ...melody, notes: melody.notes.map((note) => ({ ...note, midi: clamp(note.midi + shift, MELODY_MIDI_MIN, MELODY_MIDI_MAX) })) };
}

/**
 * The pitch axis for a pass: `base` when every note sits comfortably inside
 * it, otherwise `base` widened just enough to hold them with two semitones
 * either side.
 */
export function melodyPitchView(segments: readonly MelodySegment[], base: PitchView): PitchView {
  if (segments.length === 0) return base;
  let low = Infinity;
  let high = -Infinity;
  for (const segment of segments) {
    low = Math.min(low, segment.midi);
    high = Math.max(high, segment.midi);
  }
  if (low - 1 >= base.lo && high + 1 <= base.hi) return base;
  return fitPitchView(Math.min(base.lo, low - 2), Math.max(base.hi, high + 2));
}

// -- What was sung against each note ------------------------------------------------

/** A frame stands for no more than this long, so a gap in the readings is not counted as singing. */
export const MAX_FRAME_MS = 100;

export type NoteStatistic = {
  index: number;
  midi: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Milliseconds of the note during which a pitch was heard. */
  voicedMs: number;
  /** Milliseconds of the note spent within the band around its pitch. */
  inBandMs: number;
  /** `inBandMs` as a fraction of the whole note, 0 to 1. */
  inBandFraction: number;
  /** Time-weighted mean of the sung pitch's distance from the note, in cents (positive is above the note); null when no pitch was heard. */
  meanCents: number | null;
};

/**
 * Sets the frames a pass collected beside its segments. For each note:
 * how long a pitch was heard, how long it stayed within `bandCents` of the
 * note, and the average distance in cents while it was heard.
 *
 * A voiced frame stands for the time until the next frame, but never for more
 * than MAX_FRAME_MS, and only the part of that span inside the note counts. An
 * unvoiced frame (no pitch) adds nothing and ends the span before it, so a
 * note that was never sung returns `meanCents: null` and zero time. This says
 * nothing about when the note was started or left, or how it sounded.
 */
export function noteStatistics(
  segments: readonly MelodySegment[],
  frames: readonly PitchHistorySample[],
  bandCents: number,
): NoteStatistic[] {
  const band = Math.max(0, bandCents);
  return segments.map((segment) => {
    const durationMs = segment.endMs - segment.startMs;
    let voicedMs = 0;
    let inBandMs = 0;
    let centsTimeSum = 0;
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const pitch = samplePitch(frame);
      if (pitch === null) continue;
      const next = index + 1 < frames.length ? frames[index + 1].tMs : Infinity;
      const frameEnd = frame.tMs + Math.min(MAX_FRAME_MS, Math.max(0, next - frame.tMs));
      const overlap = Math.min(segment.endMs, frameEnd) - Math.max(segment.startMs, frame.tMs);
      if (!(overlap > 0)) continue;
      const cents = (pitch - segment.midi) * 100;
      voicedMs += overlap;
      centsTimeSum += cents * overlap;
      if (Math.abs(cents) <= band) inBandMs += overlap;
    }
    return {
      index: segment.index,
      midi: segment.midi,
      startMs: segment.startMs,
      endMs: segment.endMs,
      durationMs,
      voicedMs,
      inBandMs,
      inBandFraction: durationMs > 0 ? inBandMs / durationMs : 0,
      meanCents: voicedMs > 0 ? centsTimeSum / voicedMs : null,
    };
  });
}
