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

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export type ChordQualityId = "major" | "minor" | "diminished" | "augmented" | "dominant7" | "major7" | "minor7" | "sus4";
export type ChordVoicing = "close" | "root";

export type ChordQualityDef = { id: ChordQualityId; label: string; symbol: string; intervals: number[] };

export const CHORD_QUALITIES: ChordQualityDef[] = [
  { id: "major", label: "Major", symbol: "", intervals: [0, 4, 7] },
  { id: "minor", label: "Minor", symbol: "m", intervals: [0, 3, 7] },
  { id: "diminished", label: "Diminished", symbol: "dim", intervals: [0, 3, 6] },
  { id: "augmented", label: "Augmented", symbol: "aug", intervals: [0, 4, 8] },
  { id: "dominant7", label: "Dominant 7th", symbol: "7", intervals: [0, 4, 7, 10] },
  { id: "major7", label: "Major 7th", symbol: "maj7", intervals: [0, 4, 7, 11] },
  { id: "minor7", label: "Minor 7th", symbol: "m7", intervals: [0, 3, 7, 10] },
  { id: "sus4", label: "Sus4", symbol: "sus4", intervals: [0, 5, 7] },
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

export type ChordTuningOptions = { referenceHz: number; temperament: TemperamentId; keyPc: number };

/**
 * The frequency for each tone `chordMidis` returns.
 *
 * Under `just` intonation the chord's own root -- not the tuner's globally
 * calibrated key centre -- becomes the key centre for the lookup. That is
 * what makes the chord genuinely beat-free: tuning.ts's just cents table
 * gives a pure 5:4 third and 3:2 fifth *relative to whatever note is degree
 * 0*, so a C major triad only comes out beat-free if C is degree 0 for that
 * lookup, whatever key the tuner itself is calibrated to. Every other
 * temperament -- including plain equal, where every degree's offset is zero
 * regardless of key centre -- is untouched and uses the tuner's own
 * calibration exactly as every other pitch in the app does.
 */
export function chordFrequencies(rootMidi: number, quality: ChordQualityId, voicing: ChordVoicing, options: ChordTuningOptions): number[] {
  const midis = chordMidis(rootMidi, quality, voicing);
  const keyPc = options.temperament === "just" ? (((rootMidi % 12) + 12) % 12) : options.keyPc;
  return midis.map((midi) => targetHzFor(midi, { referenceHz: options.referenceHz, temperament: options.temperament, keyPc }));
}

// ---------------------------------------------------------------------------
// Exercise patterns
// ---------------------------------------------------------------------------

export type ExercisePatternId = "chromatic" | "major-scale" | "harmonic-series" | "interval-leaps";

export type ExercisePatternDef = { id: ExercisePatternId; label: string; description: string };

export const EXERCISE_PATTERNS: ExercisePatternDef[] = [
  { id: "chromatic", label: "Chromatic scale", description: "Every semitone, root to the octave above." },
  { id: "major-scale", label: "Major scale", description: "The major scale, root to the octave above." },
  { id: "harmonic-series", label: "Harmonic series", description: "Partials 1-8 over the root -- a lip-slur exercise." },
  { id: "interval-leaps", label: "Interval leaps", description: "Slur back and forth between the root and one interval above it." },
];

export type ExercisePatternOptions = {
  /** For interval-leaps: how far the leap reaches. Defaults to a perfect 5th. */
  intervalSemitones?: number;
  /** For interval-leaps: how many times the leap repeats. Defaults to 4. */
  leapRepeats?: number;
};

/**
 * One pass of an exercise pattern as MIDI notes, root first.
 *
 * The harmonic series uses the equal-tempered note nearest each partial's
 * true pitch: partial n sits 12*log2(n) semitones above the fundamental, and
 * rounding that to the nearest semitone is what turns "the notes a resonant
 * tube actually produces" into nameable pitches a player can find on a
 * keyboard laid out in semitones. From MIDI 46 (the low B♭ a saxophone lip
 * slur often starts from) partials 1-8 land on 46, 58, 65, 70, 74, 77, 80, 82.
 */
export function exerciseMidis(rootMidi: number, pattern: ExercisePatternId, options: ExercisePatternOptions = {}): number[] {
  switch (pattern) {
    case "chromatic":
      return Array.from({ length: 13 }, (_, index) => rootMidi + index);
    case "major-scale":
      return [0, 2, 4, 5, 7, 9, 11, 12].map((semitones) => rootMidi + semitones);
    case "harmonic-series":
      return Array.from({ length: 8 }, (_, index) => Math.round(rootMidi + 12 * Math.log2(index + 1)));
    case "interval-leaps": {
      const step = options.intervalSemitones ?? 7;
      const repeats = options.leapRepeats ?? 4;
      const notes: number[] = [];
      for (let i = 0; i < repeats; i += 1) {
        notes.push(rootMidi, rootMidi + step);
      }
      return notes;
    }
    default:
      return [rootMidi];
  }
}
