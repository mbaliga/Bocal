// Saved user exercises for the tone generator's exercise player: a named
// pattern/root/range/tempo/articulation combination the player can save,
// re-open, edit and play back, plus six bundled starting points. Kept
// dependency-free apart from tone-math.ts (the pattern math) and takes-store
// (the same save-file path takes/analysis exports already use) and free of
// React/DOM state so it can be unit tested directly -- see
// tests/exercise-library.test.mjs.
//
// TODO(storage-keys): this key should move into app/storage-keys.ts once
// package A's storage-keys.ts lands (see WAVE2.md "Shared conventions" §6).

import {
  ARPEGGIO_DEGREES,
  EXERCISE_PATTERNS,
  exerciseTones,
  expandPatternAcrossRange,
  SCALE_DEGREES,
  type ExercisePatternId,
  type ExerciseTone,
} from "./tone-math";
import type { TuningOptions } from "./tuning";
import { saveOrShareFile } from "./takes-store";

export const EXERCISE_LIBRARY_STORAGE_KEY = "bocal-exercises-v1";
export const MAX_SAVED_EXERCISES = 40;

export type SavedExercise = {
  id: string;
  name: string;
  pattern: ExercisePatternId;
  /** Written pitch: the note the player reads/fingers, before any transposition. */
  rootMidi: number;
  rangeLowMidi: number;
  rangeHighMidi: number;
  tempo: number;
  /** Fraction of the beat the note actually sounds (matches ToneGenerator's exerciseNoteLength). */
  noteLength: number;
  /** Extra silence, in ms, tacked onto each note's own release before the next note starts -- a deliberate articulation gap on top of note length. */
  articulationGapMs: number;
  loop: boolean;
  /** Semitones from written to concert pitch. 0 for concert pitch / non-transposing. */
  writtenOffset: number;
  /** How far apart (in semitones) each repeated pass sits when the saved range fits more than one -- 12 (an octave) unless a preset asks for something else, like a fifth. */
  repeatStepSemitones: number;
  leapIntervalSemitones?: number;
  leapRepeats?: number;
  skipFundamental?: boolean;
  customNotes?: string[];
  createdAt: string;
  updatedAt: string;
  /** True only for the six bundled presets below -- never persisted, never overwritten in place. */
  builtIn?: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPatternId(value: unknown): value is ExercisePatternId {
  return EXERCISE_PATTERNS.some((pattern) => pattern.id === value);
}

/** Patterns whose saved range meaningfully repeats the pass (a scale, an arpeggio, the chromatic run) -- harmonic-series, interval-leaps and custom already carry their own internal repeat/length, so their range is descriptive only. */
function rangeExpands(pattern: ExercisePatternId): boolean {
  return pattern === "chromatic" || pattern === "major-scale" || pattern in SCALE_DEGREES || pattern in ARPEGGIO_DEGREES;
}

function newExerciseId(): string {
  return `exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drops a corrupt/hand-edited entry entirely rather than guessing at it, mirroring practice-data.ts and PulseView's own sanitizers. */
export function sanitizeExercise(value: unknown): SavedExercise | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SavedExercise> & Record<string, unknown>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
  if (!isPatternId(candidate.pattern)) return null;
  const pattern = candidate.pattern;

  const rootMidi = isFiniteNumber(candidate.rootMidi) ? Math.round(Math.min(127, Math.max(0, candidate.rootMidi))) : 60;
  let rangeLowMidi = isFiniteNumber(candidate.rangeLowMidi) ? Math.round(Math.min(127, Math.max(0, candidate.rangeLowMidi))) : Math.max(0, rootMidi - 12);
  let rangeHighMidi = isFiniteNumber(candidate.rangeHighMidi) ? Math.round(Math.min(127, Math.max(0, candidate.rangeHighMidi))) : Math.min(127, rootMidi + 12);
  if (rangeHighMidi < rangeLowMidi) { const swap = rangeLowMidi; rangeLowMidi = rangeHighMidi; rangeHighMidi = swap; }

  const tempo = isFiniteNumber(candidate.tempo) ? Math.round(Math.min(208, Math.max(30, candidate.tempo))) : 80;
  const noteLength = isFiniteNumber(candidate.noteLength) ? Math.min(1, Math.max(0.2, candidate.noteLength)) : 0.8;
  const articulationGapMs = isFiniteNumber(candidate.articulationGapMs) ? Math.round(Math.min(1000, Math.max(0, candidate.articulationGapMs))) : 0;
  const loop = candidate.loop === true;
  const writtenOffset = isFiniteNumber(candidate.writtenOffset) ? Math.round(Math.min(24, Math.max(-24, candidate.writtenOffset))) : 0;
  const repeatStepSemitones = isFiniteNumber(candidate.repeatStepSemitones) && candidate.repeatStepSemitones >= 1 ? Math.round(Math.min(24, candidate.repeatStepSemitones)) : 12;
  const leapIntervalSemitones = isFiniteNumber(candidate.leapIntervalSemitones) ? Math.round(Math.min(24, Math.max(1, candidate.leapIntervalSemitones))) : undefined;
  const leapRepeats = isFiniteNumber(candidate.leapRepeats) ? Math.round(Math.min(16, Math.max(1, candidate.leapRepeats))) : undefined;
  const skipFundamental = candidate.skipFundamental === true;
  const customNotes = Array.isArray(candidate.customNotes)
    ? candidate.customNotes.filter((note): note is string => typeof note === "string").slice(0, 64)
    : undefined;

  const now = new Date().toISOString();
  const id = typeof candidate.id === "string" && candidate.id ? candidate.id : newExerciseId();
  const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : now;
  const updatedAt = typeof candidate.updatedAt === "string" ? candidate.updatedAt : now;

  return {
    id,
    name: candidate.name.trim().slice(0, 60),
    pattern,
    rootMidi,
    rangeLowMidi,
    rangeHighMidi,
    tempo,
    noteLength,
    articulationGapMs,
    loop,
    writtenOffset,
    repeatStepSemitones,
    ...(pattern === "interval-leaps" && leapIntervalSemitones !== undefined ? { leapIntervalSemitones } : {}),
    ...(pattern === "interval-leaps" && leapRepeats !== undefined ? { leapRepeats } : {}),
    ...(pattern === "harmonic-series" ? { skipFundamental } : {}),
    ...(pattern === "custom" && customNotes && customNotes.length > 0 ? { customNotes } : {}),
    createdAt,
    updatedAt,
    ...(candidate.builtIn === true ? { builtIn: true as const } : {}),
  };
}

export function parseSavedExercises(raw: string | null | undefined): SavedExercise[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => sanitizeExercise(item)).filter((item): item is SavedExercise => item !== null).slice(0, MAX_SAVED_EXERCISES)
      : [];
  } catch {
    return [];
  }
}

export function loadUserExercises(): SavedExercise[] {
  if (typeof window === "undefined") return [];
  try { return parseSavedExercises(localStorage.getItem(EXERCISE_LIBRARY_STORAGE_KEY)); } catch { return []; }
}

export function saveUserExercises(exercises: SavedExercise[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EXERCISE_LIBRARY_STORAGE_KEY, JSON.stringify(exercises.slice(-MAX_SAVED_EXERCISES)));
    window.dispatchEvent(new Event("bocal-exercise-library"));
  } catch {
    // Local exercise storage is optional; the exercise still plays this session.
  }
}

/** Inserts a new exercise or replaces one with the same id, stamping updatedAt. Never lets the built-in flag be forged onto a user-saved entry. */
export function upsertExercise(existing: SavedExercise[], exercise: Omit<SavedExercise, "updatedAt">): SavedExercise[] {
  const stamped: SavedExercise = { ...exercise, builtIn: false, updatedAt: new Date().toISOString() };
  const index = existing.findIndex((item) => item.id === stamped.id);
  const next = index >= 0 ? existing.map((item, position) => (position === index ? stamped : item)) : [...existing, stamped];
  return next.slice(-MAX_SAVED_EXERCISES);
}

export function deleteExercise(existing: SavedExercise[], id: string): SavedExercise[] {
  return existing.filter((item) => item.id !== id);
}

export function newExerciseDraft(): SavedExercise {
  const now = new Date().toISOString();
  return {
    id: newExerciseId(),
    name: "",
    pattern: "major-scale",
    rootMidi: 60,
    rangeLowMidi: 55,
    rangeHighMidi: 79,
    tempo: 80,
    noteLength: 0.8,
    articulationGapMs: 0,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 12,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The full sequence of tones an exercise plays, in concert pitch, ready for
 * the exercise player: the pattern's base pass at the exercise's root
 * (shifted by writtenOffset into concert pitch), then repeated up by
 * `repeatStepSemitones` for as long as it still fits the saved
 * [rangeLowMidi, rangeHighMidi] range -- for the pattern kinds where that
 * makes sense (rangeExpands above). Never returns an empty list: a range too
 * narrow to fit even one repeat still falls back to the single base pass, so
 * a hand-edited or imported exercise can't silently produce nothing to play.
 */
export function resolveExerciseTones(exercise: SavedExercise, tuningOptions: TuningOptions): ExerciseTone[] {
  const concertRoot = exercise.rootMidi + exercise.writtenOffset;
  const base = exerciseTones(concertRoot, exercise.pattern, tuningOptions, {
    intervalSemitones: exercise.leapIntervalSemitones,
    leapRepeats: exercise.leapRepeats,
    skipFundamental: exercise.skipFundamental,
    customNotes: exercise.customNotes,
  });
  if (!rangeExpands(exercise.pattern)) return base;
  const concertLow = exercise.rangeLowMidi + exercise.writtenOffset;
  const concertHigh = exercise.rangeHighMidi + exercise.writtenOffset;
  const expanded = expandPatternAcrossRange(base, concertLow, concertHigh, exercise.repeatStepSemitones);
  return expanded.length > 0 ? expanded : base;
}

// ---------------------------------------------------------------------------
// Six bundled presets -- Bocal's own starting points, not transcribed from
// any method book. Written pitch throughout (writtenOffset 0 = concert).
// ---------------------------------------------------------------------------

const BUILT_IN_STAMP = "2026-09-18T00:00:00.000Z";

function builtIn(exercise: Omit<SavedExercise, "createdAt" | "updatedAt" | "builtIn">): SavedExercise {
  return { ...exercise, createdAt: BUILT_IN_STAMP, updatedAt: BUILT_IN_STAMP, builtIn: true };
}

export const BUILT_IN_EXERCISES: SavedExercise[] = [
  builtIn({
    id: "builtin-long-tones",
    name: "Long tones",
    pattern: "custom",
    customNotes: ["C4", "D4", "E4", "F4", "G4"],
    rootMidi: 60,
    rangeLowMidi: 60,
    rangeHighMidi: 67,
    tempo: 40,
    noteLength: 1,
    articulationGapMs: 700,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 12,
  }),
  builtIn({
    id: "builtin-major-scale-by-fifths",
    name: "Major scale by fifths",
    pattern: "major-scale",
    rootMidi: 60,
    rangeLowMidi: 60,
    rangeHighMidi: 79,
    tempo: 92,
    noteLength: 0.75,
    articulationGapMs: 60,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 7,
  }),
  builtIn({
    id: "builtin-overtone-series",
    name: "Overtone series",
    pattern: "harmonic-series",
    rootMidi: 48,
    rangeLowMidi: 48,
    rangeHighMidi: 96,
    tempo: 50,
    noteLength: 1,
    articulationGapMs: 150,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 12,
    skipFundamental: false,
  }),
  builtIn({
    id: "builtin-interval-leaps",
    name: "Interval leaps",
    pattern: "interval-leaps",
    rootMidi: 60,
    rangeLowMidi: 55,
    rangeHighMidi: 74,
    tempo: 80,
    noteLength: 0.6,
    articulationGapMs: 40,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 12,
    leapIntervalSemitones: 7,
    leapRepeats: 4,
  }),
  builtIn({
    id: "builtin-chromatic-warm-up",
    name: "Chromatic warm-up",
    pattern: "chromatic",
    rootMidi: 60,
    rangeLowMidi: 55,
    rangeHighMidi: 72,
    tempo: 66,
    noteLength: 0.5,
    articulationGapMs: 20,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 12,
  }),
  builtIn({
    id: "builtin-register-slur",
    name: "Register slur",
    pattern: "interval-leaps",
    rootMidi: 55,
    rangeLowMidi: 50,
    rangeHighMidi: 79,
    tempo: 70,
    noteLength: 0.85,
    articulationGapMs: 0,
    loop: true,
    writtenOffset: 0,
    repeatStepSemitones: 12,
    leapIntervalSemitones: 12,
    leapRepeats: 4,
  }),
];

export function allExercises(userExercises: SavedExercise[]): SavedExercise[] {
  return [...BUILT_IN_EXERCISES, ...userExercises];
}

// ---------------------------------------------------------------------------
// Export/import -- through the same save-file path takes/analysis exports
// already use (saveOrShareFile: the OS share sheet where available, a
// download otherwise, never a silent no-op on Android).
// ---------------------------------------------------------------------------

export async function exportExerciseLibrary(userExercises: SavedExercise[]): Promise<void> {
  const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), exercises: userExercises };
  const file = new File([JSON.stringify(payload, null, 2)], "bocal-exercises.json", { type: "application/json" });
  await saveOrShareFile(file);
}

export type ImportExerciseResult = { imported: SavedExercise[]; rejectedCount: number };

/** Accepts either this export's `{schemaVersion, exercises}` shape or a bare array (so a hand-trimmed or older file still imports), and always assigns fresh ids so importing never collides with -- or silently overwrites -- an existing exercise. */
export function importExerciseLibraryJson(raw: string): ImportExerciseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { imported: [], rejectedCount: 0 }; }
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { exercises?: unknown })?.exercises) ? (parsed as { exercises: unknown[] }).exercises : null;
  if (!list) return { imported: [], rejectedCount: 0 };
  const imported = list
    .map((item) => sanitizeExercise(item))
    .filter((item): item is SavedExercise => item !== null)
    .map((item) => ({ ...item, id: newExerciseId(), builtIn: false }));
  return { imported, rejectedCount: list.length - imported.length };
}
