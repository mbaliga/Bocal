// Pure pitch-math for the tone generator's deeper modes: interval partners,
// chord tone stacks (including just-intonation chord tuning), and the note
// sequences behind the exercise player's patterns.
//
// Kept dependency-free apart from tuning.ts and free of React/DOM so it can
// be unit tested directly -- see tests/tone-generator.test.mjs.

import { targetHzFor, type TemperamentId } from "./tuning";

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export type IntervalId = "m2" | "M2" | "m3" | "M3" | "P4" | "TT" | "P5" | "m6" | "M6" | "m7" | "M7" | "P8" | "P12" | "P15";
export type IntervalDirection = "above" | "below";

export type IntervalDef = { id: IntervalId; label: string; semitones: number };

/** m2 through the octave, plus a 12th and two octaves for lip slurs. */
export const INTERVALS: IntervalDef[] = [
  { id: "m2", label: "Minor 2nd", semitones: 1 },
  { id: "M2", label: "Major 2nd", semitones: 2 },
  { id: "m3", label: "Minor 3rd", semitones: 3 },
  { id: "M3", label: "Major 3rd", semitones: 4 },
  { id: "P4", label: "Perfect 4th", semitones: 5 },
  { id: "TT", label: "Tritone", semitones: 6 },
  { id: "P5", label: "Perfect 5th", semitones: 7 },
  { id: "m6", label: "Minor 6th", semitones: 8 },
  { id: "M6", label: "Major 6th", semitones: 9 },
  { id: "m7", label: "Minor 7th", semitones: 10 },
  { id: "M7", label: "Major 7th", semitones: 11 },
  { id: "P8", label: "Octave", semitones: 12 },
  { id: "P12", label: "12th", semitones: 19 },
  { id: "P15", label: "2 octaves", semitones: 24 },
];

export function intervalById(id: IntervalId): IntervalDef {
  return INTERVALS.find((interval) => interval.id === id) ?? INTERVALS[0];
}

/** The MIDI note of the interval partner above or below the tapped key. */
export function intervalPartnerMidi(rootMidi: number, semitones: number, direction: IntervalDirection): number {
  return direction === "above" ? rootMidi + semitones : rootMidi - semitones;
}

/** Lowest MIDI note anything here will actually sound. Below this a
 * synthesized tone is more sub-bass rumble than a pitch a player can match,
 * and it is easy to reach with "Below" plus a two-octave interval from a
 * low root. */
export const MIN_SOUNDING_MIDI = 12;

/** Clamps an interval partner to a note that will actually sound. */
export function clampPartnerMidi(midi: number): number {
  return Math.max(MIN_SOUNDING_MIDI, midi);
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export type ChordQualityId = "major" | "minor" | "diminished" | "augmented" | "dominant7" | "major7" | "minor7" | "sus4";
export type ChordVoicing = "close" | "root";

export type ChordQualityDef = {
  id: ChordQualityId;
  label: string;
  symbol: string;
  intervals: number[];
  /**
   * The exact frequency ratio (over the chord's own root) for each tone in
   * `intervals`, used only when the active temperament is "just". Every
   * ratio here is a low-integer just interval, so under just intonation
   * every quality -- not only major/minor/maj7/sus4 -- comes out genuinely
   * beat-free around its own root; see chordFrequencies.
   */
  justRatios: number[];
};

export const CHORD_QUALITIES: ChordQualityDef[] = [
  { id: "major", label: "Major", symbol: "", intervals: [0, 4, 7], justRatios: [1, 5 / 4, 3 / 2] },
  { id: "minor", label: "Minor", symbol: "m", intervals: [0, 3, 7], justRatios: [1, 6 / 5, 3 / 2] },
  { id: "diminished", label: "Diminished", symbol: "dim", intervals: [0, 3, 6], justRatios: [1, 6 / 5, 7 / 5] },
  { id: "augmented", label: "Augmented", symbol: "aug", intervals: [0, 4, 8], justRatios: [1, 5 / 4, 25 / 16] },
  { id: "dominant7", label: "Dominant 7th", symbol: "7", intervals: [0, 4, 7, 10], justRatios: [1, 5 / 4, 3 / 2, 7 / 4] },
  { id: "major7", label: "Major 7th", symbol: "maj7", intervals: [0, 4, 7, 11], justRatios: [1, 5 / 4, 3 / 2, 15 / 8] },
  { id: "minor7", label: "Minor 7th", symbol: "m7", intervals: [0, 3, 7, 10], justRatios: [1, 6 / 5, 3 / 2, 9 / 5] },
  { id: "sus4", label: "Sus4", symbol: "sus4", intervals: [0, 5, 7], justRatios: [1, 4 / 3, 3 / 2] },
];

export function chordQualityById(id: ChordQualityId): ChordQualityDef {
  return CHORD_QUALITIES.find((quality) => quality.id === id) ?? CHORD_QUALITIES[0];
}

/**
 * MIDI notes for one voicing of a chord built on `rootMidi`. "Close" stacks
 * every tone in the octave immediately above the root, the closest position
 * the chord can be played in. "Root" adds the root again an octave below
 * that -- a doubled bass note under the same close chord -- for a fuller,
 * more grounded spread, the way a wind section pads a chord under a lead.
 */
export function chordMidis(rootMidi: number, quality: ChordQualityId, voicing: ChordVoicing): number[] {
  const close = chordQualityById(quality).intervals.map((semitones) => rootMidi + semitones);
  return voicing === "root" ? [rootMidi - 12, ...close] : close;
}

export type ChordTuningOptions = { referenceHz: number; temperament: TemperamentId; keyPc: number; customCents?: number[] };

/**
 * The frequency for each tone `chordMidis` returns.
 *
 * Under `just` intonation the chord is built directly from `justRatios`
 * stacked over its own root's frequency -- not from the tuner's 12-degree
 * cents table, and not keyed to the tuner's calibrated key centre. That is
 * what makes every quality genuinely beat-free around its own root: each
 * ratio is a low-integer just interval by construction, so a diminished or
 * augmented triad and a dominant/major/minor 7th are exactly as pure over
 * their root as a major triad is, whatever key the tuner itself is
 * calibrated to and whichever root got tapped. Every other temperament --
 * including plain equal, where every degree's offset is zero regardless of
 * key centre -- is untouched and uses the tuner's own calibration exactly as
 * every other pitch in the app does.
 */
export function chordFrequencies(rootMidi: number, quality: ChordQualityId, voicing: ChordVoicing, options: ChordTuningOptions): number[] {
  if (options.temperament === "just") {
    const rootHz = targetHzFor(rootMidi, { referenceHz: options.referenceHz, temperament: "equal", keyPc: 0 });
    const ratios = chordQualityById(quality).justRatios;
    const closeHz = ratios.map((ratio) => rootHz * ratio);
    return voicing === "root" ? [rootHz / 2, ...closeHz] : closeHz;
  }
  const midis = chordMidis(rootMidi, quality, voicing);
  return midis.map((midi) => targetHzFor(midi, options));
}

// ---------------------------------------------------------------------------
// Exercise patterns
// ---------------------------------------------------------------------------

/** Scale/mode patterns -- added for the exercise library (W2-C); each one is
 * a fixed set of root-relative semitone offsets, root to the octave above. */
export type ScalePatternId =
  | "natural-minor" | "harmonic-minor" | "melodic-minor"
  | "dorian" | "phrygian" | "lydian" | "mixolydian" | "locrian"
  | "major-pentatonic" | "minor-pentatonic";

/** Arpeggio patterns -- root-relative semitone offsets through the chord
 * tones, root to the octave above, one octave's worth. */
export type ArpeggioPatternId = "major-arpeggio" | "minor-arpeggio" | "dominant7-arpeggio" | "diminished7-arpeggio" | "augmented-arpeggio";

export type ExercisePatternId = "chromatic" | "major-scale" | "harmonic-series" | "interval-leaps" | ScalePatternId | ArpeggioPatternId | "custom";

export type ExercisePatternDef = { id: ExercisePatternId; label: string; description: string };

/** Root-to-octave semitone offsets for each scale pattern (major-scale and
 * chromatic have their own hand-written cases in exerciseMidis and stay
 * there unchanged, so existing callers/tests are untouched). */
export const SCALE_DEGREES: Record<ScalePatternId, number[]> = {
  "natural-minor": [0, 2, 3, 5, 7, 8, 10, 12],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11, 12],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
  locrian: [0, 1, 3, 5, 6, 8, 10, 12],
  "major-pentatonic": [0, 2, 4, 7, 9, 12],
  "minor-pentatonic": [0, 3, 5, 7, 10, 12],
};

/** Root-to-octave semitone offsets for each arpeggio pattern (chord tones
 * ascending, then the octave to round the phrase off). */
export const ARPEGGIO_DEGREES: Record<ArpeggioPatternId, number[]> = {
  "major-arpeggio": [0, 4, 7, 12],
  "minor-arpeggio": [0, 3, 7, 12],
  "dominant7-arpeggio": [0, 4, 7, 10, 12],
  "diminished7-arpeggio": [0, 3, 6, 9, 12],
  "augmented-arpeggio": [0, 4, 8, 12],
};

const SCALE_LABELS: Record<ScalePatternId, string> = {
  "natural-minor": "Natural minor",
  "harmonic-minor": "Harmonic minor",
  "melodic-minor": "Melodic minor (ascending)",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  locrian: "Locrian",
  "major-pentatonic": "Major pentatonic",
  "minor-pentatonic": "Minor pentatonic",
};

const ARPEGGIO_LABELS: Record<ArpeggioPatternId, string> = {
  "major-arpeggio": "Major arpeggio",
  "minor-arpeggio": "Minor arpeggio",
  "dominant7-arpeggio": "Dominant 7th arpeggio",
  "diminished7-arpeggio": "Diminished 7th arpeggio",
  "augmented-arpeggio": "Augmented arpeggio",
};

export const EXERCISE_PATTERNS: ExercisePatternDef[] = [
  { id: "chromatic", label: "Chromatic scale", description: "Every semitone, root to the octave above." },
  { id: "major-scale", label: "Major scale", description: "The major scale, root to the octave above." },
  { id: "harmonic-series", label: "Harmonic series", description: "Partials 1-8 over the root -- a lip-slur exercise." },
  { id: "interval-leaps", label: "Interval leaps", description: "Slur back and forth between the root and one interval above it." },
  ...(Object.keys(SCALE_DEGREES) as ScalePatternId[]).map((id): ExercisePatternDef => ({ id, label: SCALE_LABELS[id], description: `${SCALE_LABELS[id]}, root to the octave above.` })),
  ...(Object.keys(ARPEGGIO_DEGREES) as ArpeggioPatternId[]).map((id): ExercisePatternDef => ({ id, label: ARPEGGIO_LABELS[id], description: `${ARPEGGIO_LABELS[id]}, root to the octave above.` })),
  { id: "custom", label: "Custom note list", description: "Your own typed sequence of note names, in order." },
];

export type ExercisePatternOptions = {
  /** For interval-leaps: how far the leap reaches. Defaults to a perfect 5th. */
  intervalSemitones?: number;
  /** For interval-leaps: how many times the leap repeats. Defaults to 4. */
  leapRepeats?: number;
  /** For harmonic-series: omit partial 1 (the fundamental) -- useful for a
   * lip-slur exercise that starts on the octave. Defaults to false. */
  skipFundamental?: boolean;
  /** For "custom": the note sequence to play, in order (e.g. ["C4", "E4", "G4", "C5"]). Parsed with parseNoteName; an entry that doesn't parse is dropped. Falls back to [rootMidi] if nothing parses. */
  customNotes?: string[];
};

/**
 * Parses a note name like "C4", "F#5", "Bb3" or "C♯4" into a MIDI number
 * (middle C = C4 = 60, matching notation.ts's octave numbering). Returns
 * null for anything that doesn't parse, so a caller building a custom
 * exercise from free-typed text can drop bad entries instead of crashing.
 */
export function parseNoteName(input: string): number | null {
  const match = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(input.trim());
  if (!match) return null;
  const [, letter, accidental, octaveText] = match;
  const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let pc = base[letter.toLowerCase()];
  if (accidental === "#" || accidental === "♯") pc += 1;
  if (accidental === "b" || accidental === "♭") pc -= 1;
  const octave = Number(octaveText);
  if (!Number.isFinite(octave)) return null;
  return (octave + 1) * 12 + pc;
}

const HARMONIC_SERIES_PARTIALS = 12;

/**
 * One pass of an exercise pattern as MIDI notes, root first.
 *
 * For harmonic-series this is the equal-tempered note *nearest* each
 * partial's true pitch -- useful for labelling a key and for highlighting
 * it, but not what should actually sound; see exerciseTones below for the
 * true `rootHz * n` frequency and its cents deviation from this label.
 */
export function exerciseMidis(rootMidi: number, pattern: ExercisePatternId, options: ExercisePatternOptions = {}): number[] {
  switch (pattern) {
    case "chromatic":
      return Array.from({ length: 13 }, (_, index) => rootMidi + index);
    case "major-scale":
      return [0, 2, 4, 5, 7, 9, 11, 12].map((semitones) => rootMidi + semitones);
    case "harmonic-series": {
      const partials = Array.from({ length: HARMONIC_SERIES_PARTIALS }, (_, index) => index + 1)
        .filter((n) => !(options.skipFundamental && n === 1));
      return partials.map((n) => Math.round(rootMidi + 12 * Math.log2(n)));
    }
    case "interval-leaps": {
      const step = options.intervalSemitones ?? 7;
      const repeats = options.leapRepeats ?? 4;
      const notes: number[] = [];
      for (let i = 0; i < repeats; i += 1) {
        notes.push(rootMidi, rootMidi + step);
      }
      return notes;
    }
    case "custom": {
      const parsed = (options.customNotes ?? []).map(parseNoteName).filter((midi): midi is number => midi !== null);
      return parsed.length > 0 ? parsed : [rootMidi];
    }
    default:
      if (pattern in SCALE_DEGREES) return SCALE_DEGREES[pattern as ScalePatternId].map((semitones) => rootMidi + semitones);
      if (pattern in ARPEGGIO_DEGREES) return ARPEGGIO_DEGREES[pattern as ArpeggioPatternId].map((semitones) => rootMidi + semitones);
      return [rootMidi];
  }
}

/**
 * Repeats `baseTones` (one pass of a pattern, already computed at a starting
 * root) upward by `stepSemitones` at a time -- 12 (a whole octave) unless a
 * caller asks for something else, such as 7 for "the same scale again a
 * fifth higher" -- for as long as every note in the next repetition still
 * fits within [rangeLowMidi, rangeHighMidi], so an exercise's saved range
 * actually shapes how much of it plays rather than being a cosmetic field.
 * The base pass itself is first shifted (up or down, by whole steps) so its
 * lowest note sits at or above rangeLowMidi before repeating upward. Returns
 * [] if the pattern cannot fit in the range at all (e.g. its own span is
 * wider than the range).
 */
export function expandPatternAcrossRange(baseTones: ExerciseTone[], rangeLowMidi: number, rangeHighMidi: number, stepSemitones = 12): ExerciseTone[] {
  if (baseTones.length === 0 || rangeHighMidi < rangeLowMidi || !(stepSemitones > 0)) return [];
  const patternLow = Math.min(...baseTones.map((tone) => tone.midi));
  const initialShift = stepSemitones * Math.ceil((rangeLowMidi - patternLow) / stepSemitones);
  const shiftTone = (tone: ExerciseTone, semitones: number): ExerciseTone => ({ ...tone, midi: tone.midi + semitones, hz: tone.hz * 2 ** (semitones / 12) });
  const result: ExerciseTone[] = [];
  for (let shift = initialShift; ; shift += stepSemitones) {
    const shifted = baseTones.map((tone) => shiftTone(tone, shift));
    if (shifted.some((tone) => tone.midi < rangeLowMidi || tone.midi > rangeHighMidi)) break;
    result.push(...shifted);
  }
  return result;
}

export type ExerciseTone = { midi: number; hz: number; cents: number };

/**
 * One pass of an exercise pattern as actual sounding frequencies plus the
 * nearest equal-tempered label and its cents deviation from that label.
 *
 * Every pattern except harmonic-series sounds exactly at its labelled note
 * (cents 0) -- `targetHzFor` already applies the active temperament. The
 * harmonic series is the one pattern where the *label* is an approximation:
 * partial n truly sits at `rootHz * n`, e.g. from a low B-flat the 7th
 * partial is 815.79 Hz, about 31 cents flat of the A5 an equal-tempered
 * keyboard would call it. Playing the true multiple (rather than the
 * rounded equal-tempered note) is what makes this a faithful lip-slur/
 * overtone exercise instead of an equal-tempered scale in disguise.
 */
export function exerciseTones(
  rootMidi: number,
  pattern: ExercisePatternId,
  tuningOptions: { referenceHz: number; temperament: TemperamentId; keyPc: number; customCents?: number[] },
  options: ExercisePatternOptions = {},
): ExerciseTone[] {
  const midis = exerciseMidis(rootMidi, pattern, options);
  if (pattern !== "harmonic-series") {
    return midis.map((midi) => ({ midi, hz: targetHzFor(midi, tuningOptions), cents: 0 }));
  }
  const rootHz = targetHzFor(rootMidi, tuningOptions);
  const partials = Array.from({ length: HARMONIC_SERIES_PARTIALS }, (_, index) => index + 1)
    .filter((n) => !(options.skipFundamental && n === 1));
  return partials.map((n, index) => {
    const hz = rootHz * n;
    const midi = midis[index];
    const labelHz = targetHzFor(midi, tuningOptions);
    const cents = 1200 * Math.log2(hz / labelHz);
    return { midi, hz, cents };
  });
}
