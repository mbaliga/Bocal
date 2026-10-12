// Where the play-along drill gets its phrases from. Three sources:
//   * Bocal's own bundled phrases (call-response.ts);
//   * phrases a caller supplies through props (the melody line and the
//     player's own melodies are wired in this way);
//   * the player's saved exercises (exercise-library.ts), where the shape
//     allows it.
//
// Saved exercises carry a pattern, a root, a tempo and a note length rather
// than a list of notes with durations. They are usable because a pattern
// expands to an ordered list of notes, one beat each, at the exercise's tempo.
// Two kinds are left out: the harmonic series, because its partials do not sit
// on equal-tempered notes (the drill judges against equal-tempered pitch), and
// anything that expands to fewer than two notes.

import { BUNDLED_PHRASES, MAX_PHRASE_NOTES, sanitizePhrase, type CallPhrase } from "./call-response";
import type { SavedExercise } from "./exercise-library";
import { exerciseMidis } from "./tone-math";

/** A saved exercise longer than this is cut after this many notes; the drill is a short phrase. */
export const EXERCISE_PHRASE_NOTES = 8;

export const EXERCISE_PHRASE_PREFIX = "exercise:";

/** The phrase a saved exercise stands for, in concert pitch, or null when it cannot stand for one. */
export function exerciseToPhrase(exercise: SavedExercise): CallPhrase | null {
  if (exercise.pattern === "harmonic-series") return null;
  const concertRoot = exercise.rootMidi + exercise.writtenOffset;
  const midis = exerciseMidis(concertRoot, exercise.pattern, {
    intervalSemitones: exercise.leapIntervalSemitones,
    leapRepeats: exercise.leapRepeats,
    skipFundamental: exercise.skipFundamental,
    customNotes: exercise.customNotes,
  }).slice(0, Math.min(EXERCISE_PHRASE_NOTES, MAX_PHRASE_NOTES));
  if (midis.length < 2) return null;
  return sanitizePhrase({
    id: `${EXERCISE_PHRASE_PREFIX}${exercise.id}`,
    name: exercise.name,
    tempoBpm: exercise.tempo,
    notes: midis.map((midi) => ({ midi, beats: 1 })),
  });
}

export type PhraseGroup = { id: "bundled" | "supplied" | "exercises"; label: string; phrases: CallPhrase[] };

/**
 * The phrase picker's groups, empty ones left out. Supplied phrases that
 * repeat an id already present (or have no notes) are dropped so every id in
 * the picker is unique.
 */
export function buildPhraseGroups(supplied: CallPhrase[], exercises: SavedExercise[], suppliedLabel: string): PhraseGroup[] {
  const taken = new Set<string>(BUNDLED_PHRASES.map((phrase) => phrase.id));
  const suppliedPhrases: CallPhrase[] = [];
  for (const phrase of supplied) {
    const clean = sanitizePhrase(phrase);
    if (clean.notes.length === 0 || taken.has(clean.id)) continue;
    taken.add(clean.id);
    suppliedPhrases.push(clean);
  }
  const exercisePhrases: CallPhrase[] = [];
  for (const exercise of exercises) {
    const phrase = exerciseToPhrase(exercise);
    if (!phrase || taken.has(phrase.id)) continue;
    taken.add(phrase.id);
    exercisePhrases.push(phrase);
  }
  const groups: PhraseGroup[] = [{ id: "bundled", label: "Bocal phrases", phrases: BUNDLED_PHRASES }];
  if (suppliedPhrases.length) groups.push({ id: "supplied", label: suppliedLabel, phrases: suppliedPhrases });
  if (exercisePhrases.length) groups.push({ id: "exercises", label: "Saved exercises", phrases: exercisePhrases });
  return groups;
}
