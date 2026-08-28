// Tuner calibration: reference pitch and temperament.
//
// The live tuner used to assume A=440 Hz equal temperament, full stop. Wind
// players tune against other reference pitches all the time -- A=442/443 for
// most European orchestras, A=415 for baroque ensembles pitched a semitone
// low -- and ensemble players sustaining a chord tone want to hear it land on
// a just, Pythagorean or meantone target rather than the equal-tempered one.
// This module is the single source of truth for both: it turns a concert
// MIDI note into the frequency it should sound at, and a measured frequency
// into the note plus cents offset a player should be shown.
//
// Kept separate from pitch-engine.ts and transcribe.ts on purpose. Those
// analyse arbitrary recordings whose reference pitch nobody chose, so they
// stay in raw Hz and equal-tempered MIDI; calibration only makes sense once a
// player has told Bocal what they're tuning to.

export type TemperamentId = "equal" | "just" | "pythagorean" | "meantone";

/**
 * Cents offset from equal temperament, indexed by scale degree (semitones
 * above the key centre). Degree 0 is always 0 -- the key centre itself is
 * untempered relative to the reference pitch in every one of these systems.
 */
export const TEMPERAMENTS: Record<TemperamentId, number[]> = {
  equal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  just: [0, 11.73, 3.91, 15.64, -13.69, -1.96, -9.78, 1.96, 13.69, -15.64, -3.91, -11.73],
  pythagorean: [0, -9.78, 3.91, -5.87, 7.82, -1.96, 11.73, 1.96, -7.82, 5.87, -3.91, 9.78],
  meantone: [0, -23.95, -6.84, 10.26, -13.69, 3.42, -20.53, -3.42, -27.37, -10.26, 6.84, -17.11],
};

export type TemperamentProfile = {
  id: TemperamentId;
  label: string;
  /** Shown under the selector, same voice as NOTATION_SYSTEMS' description. */
  description: string;
  /** True when the key-centre selector has any effect -- false for equal. */
  needsKeyCentre: boolean;
};

export const TEMPERAMENT_PROFILES: Record<TemperamentId, TemperamentProfile> = {
  equal: {
    id: "equal",
    label: "Equal",
    description: "Twelve equal semitones, the default on pianos and most digital tuners.",
    needsKeyCentre: false,
  },
  just: {
    id: "just",
    label: "Just",
    description: "5-limit just intonation around the key centre: pure thirds and fifths in that key.",
    needsKeyCentre: true,
  },
  pythagorean: {
    id: "pythagorean",
    label: "Pythagorean",
    description: "Stacked pure fifths around the key centre, with a wide major third.",
    needsKeyCentre: true,
  },
  meantone: {
    id: "meantone",
    label: "Meantone",
    description: "Quarter-comma meantone around the key centre: smooth thirds, narrow fifths.",
    needsKeyCentre: true,
  },
};

export const TEMPERAMENT_ORDER: TemperamentId[] = ["equal", "just", "pythagorean", "meantone"];

export const REFERENCE_HZ_MIN = 415;
export const REFERENCE_HZ_MAX = 466;
export const REFERENCE_HZ_STEP = 0.5;
export const REFERENCE_HZ_DEFAULT = 440;

export type TuningOptions = {
  /** Frequency of concert A4 (MIDI 69), in Hz. */
  referenceHz: number;
  temperament: TemperamentId;
  /** Pitch class (0 = C … 11 = B) the temperament is centred on. */
  keyPc: number;
};

export type TuningReading = {
  concertMidi: number;
  cents: number;
};

/**
 * The frequency `concertMidi` should sound at under the given calibration:
 * the equal-tempered frequency against `referenceHz`, shifted by the active
 * temperament's cents offset for that note's scale degree above the key
 * centre.
 */
export function targetHzFor(concertMidi: number, options: TuningOptions): number {
  const equalHz = options.referenceHz * 2 ** ((concertMidi - 69) / 12);
  const degree = (((concertMidi - options.keyPc) % 12) + 12) % 12;
  const offsetCents = TEMPERAMENTS[options.temperament][degree];
  return equalHz * 2 ** (offsetCents / 1200);
}

/**
 * The note and cents offset a measured frequency should be read as. Starts
 * from the nearest note under plain equal temperament, then also checks the
 * neighbours a semitone either side against their *temperament-adjusted*
 * targets and keeps whichever is closest. Equal-tempered nearest-neighbour
 * alone isn't enough once a temperament is active: meantone's degrees swing
 * as far as -27 cents, more than a quarter of a semitone, which can put the
 * true nearest target on the other side of what looks like the boundary.
 */
export function readingFor(hz: number, options: TuningOptions): TuningReading {
  const equalNearest = Math.round(69 + 12 * Math.log2(hz / options.referenceHz));
  let best: TuningReading | null = null;
  for (const candidate of [equalNearest - 1, equalNearest, equalNearest + 1]) {
    const target = targetHzFor(candidate, options);
    const cents = 1200 * Math.log2(hz / target);
    if (best === null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { concertMidi: candidate, cents };
    }
  }
  const settled = best ?? { concertMidi: equalNearest, cents: 0 };
  return { concertMidi: settled.concertMidi, cents: Math.round(settled.cents) };
}
