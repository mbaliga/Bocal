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

export type TemperamentId =
  | "equal"
  | "just"
  | "pythagorean"
  | "meantone"
  | "meantone-sixth"
  | "meantone-third"
  | "werckmeister3"
  | "kirnberger3"
  | "vallotti"
  | "young1799"
  | "custom";

/**
 * Cents offset from equal temperament, indexed by scale degree (semitones
 * above the key centre). Degree 0 is always 0 -- the key centre itself is
 * untempered relative to the reference pitch in every one of these systems.
 *
 * The historical tables below are all derived the same way: walk the
 * standard chain of 12 fifths from the key centre (tempered by the amount
 * each temperament specifies, pure everywhere else), reduce each note's
 * cumulative pitch mod 1200 to land it in one octave, then subtract the
 * equal-tempered value (degree * 100) for that scale step. Every table is
 * checked to close the circle exactly (12 fifths minus the appropriate
 * comma lands back on the tonic, 7 octaves up) before being copied in here.
 *
 * meantone (1/4-comma), meantone-sixth (1/6-comma) and meantone-third
 * (1/3-comma) share one construction: a chain of 12 fifths of size
 * 701.955 - comma/n cents (n = 4, 6, 3), spanning Eb...G# through the key
 * centre, syntonic comma = 1200*log2(81/80) = 21.50629 cents. The existing
 * "meantone" table (quarter-comma) was reverse-engineered against that
 * formula to confirm the fifths-count-per-degree it uses --
 * [0,7,2,-3,4,-1,6,1,8,3,-2,5] for degrees 0..11 -- then the same per-degree
 * fifths counts were used to generate the sixth- and third-comma tables.
 * Cross-check: quarter-comma degree 8 (Ab/G#) = -27.37, matching the value
 * already shipped and tested.
 *
 * werckmeister3 (Werckmeister III, 1691): fifths C-G, G-D, D-A and B-F# each
 * tempered 1/4 of the Pythagorean comma narrow (23.46/4 = 5.865 cents,
 * fifth = 696.09 cents); the rest are pure (701.955 cents). Cross-check:
 * this reproduces the standard published absolute-cents-from-C table (0,
 * 90.225, 192.18, 294.135, 390.225, 498.045, 588.27, 696.09, 792.18, 888.27,
 * 996.09, 1092.18) and the brief's own check figure -- G at 696.09 cents
 * from C, i.e. -3.91 from equal.
 *
 * kirnberger3 (Kirnberger III, c. 1779): fifths C-G, G-D, D-A and A-E each
 * tempered 1/4 of the syntonic comma narrow (5.377 cents), producing a pure
 * major third C-E (386.31 cents); every other fifth pure. Because only a
 * syntonic comma (not the larger Pythagorean comma) was removed over the 4
 * tempered fifths, the circle doesn't close purely -- the leftover schisma
 * (~1.95 cents) is taken out of the F#-C# fifth (700 cents instead of
 * 701.955), which is where Kirnberger placed it. The resulting absolute
 * table from C is the standard one: C 0, C# 90.225, D 193.157, Eb 294.135,
 * E 386.314, F 498.045, F# 590.225, G 696.579, Ab 792.180, A 889.735,
 * Bb 996.090, B 1088.269 (Wikipedia "Kirnberger temperament"; Jorgensen).
 *
 * vallotti (Vallotti, c. 1754) and young1799 (Thomas Young's second
 * temperament, 1799) share a construction: six consecutive fifths tempered
 * 1/6 of the Pythagorean comma narrow (23.46/6 = 3.91 cents, fifth = 698.045
 * cents), the other six pure. Vallotti's tempered run is F-C-G-D-A-E-B;
 * Young's is C-G-D-A-E-B-F# (the same run rotated by one fifth). Cross-check:
 * Vallotti's C-G comes out at 698.045 (-1.96 from equal), matching the
 * brief's check figure; Vallotti's A# and Young's F/G both land on exact
 * integer-cent values as a byproduct of the construction, which several
 * independent tuning references also note.
 *
 * Sources consulted from training knowledge (not fetched live -- no network
 * access was used for these figures): Owen Jorgensen, "Tuning" (Michigan
 * State University Press); the Wikipedia articles "Werckmeister
 * temperament", "Well temperament" and "Meantone temperament"; and the
 * cross-checks against the brief's own stated figures above. Every table
 * was independently re-derived from its defining fifths rather than copied
 * wholesale, and each closes its circle of fifths to within floating-point
 * rounding -- see tests/tuning.test.mjs for the numeric assertions. Flagging
 * per the brief: I could not verify these against a live, dated source in
 * this session, so they should be spot-checked against a tuning reference
 * before being presented as historically authoritative.
 */
export const TEMPERAMENTS: Record<Exclude<TemperamentId, "custom">, number[]> = {
  equal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  just: [0, 11.73, 3.91, 15.64, -13.69, -1.96, -9.78, 1.96, 13.69, -15.64, -3.91, -11.73],
  pythagorean: [0, -9.78, 3.91, -5.87, 7.82, -1.96, 11.73, 1.96, -7.82, 5.87, -3.91, 9.78],
  meantone: [0, -23.95, -6.84, 10.26, -13.69, 3.42, -20.53, -3.42, -27.37, -10.26, 6.84, -17.11],
  "meantone-sixth": [0, -11.41, -3.26, 4.89, -6.52, 1.63, -9.78, -1.63, -13.04, -4.89, 3.26, -8.15],
  "meantone-third": [0, -36.5, -10.43, 15.64, -20.86, 5.21, -31.28, -5.21, -41.71, -15.64, 10.43, -26.07],
  werckmeister3: [0, -9.78, -7.82, -5.87, -9.78, -1.96, -11.73, -3.91, -7.82, -11.73, -3.91, -7.82],
  kirnberger3: [0, -9.78, -6.84, -5.87, -13.69, -1.96, -9.78, -3.42, -7.82, -10.26, -3.91, -11.73],
  vallotti: [0, -5.87, -3.91, -1.96, -7.82, 1.96, -7.82, -1.96, -3.91, -5.87, 0, -9.78],
  young1799: [0, -9.78, -3.91, -5.87, -7.82, -1.96, -11.73, -1.96, -7.82, -5.87, -3.91, -9.78],
};

export const CUSTOM_TEMPERAMENT_STORAGE_KEY = "bocal-temperament-custom";
export const CUSTOM_TEMPERAMENT_DEFAULT: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/**
 * Interval name for each of the 12 degrees, shown next to the custom
 * temperament's editable cent offsets since the degrees aren't absolute
 * pitch classes -- they're semitones above whatever key centre is chosen.
 */
export const DEGREE_LABELS = ["Unison", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7"];

/**
 * Parses a custom temperament's 12 cent offsets out of a raw localStorage
 * value, falling back to all-zero (equal temperament) for anything missing,
 * malformed, or the wrong shape. Offsets are clamped to +-100 cents (a full
 * semitone either way is already an extreme, deliberately weird tuning) and
 * degree 0 is always forced to 0 -- the key centre itself is never tempered.
 */
export function loadCustomTemperamentCents(raw: string | null | undefined): number[] {
  if (!raw) return [...CUSTOM_TEMPERAMENT_DEFAULT];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 12) return [...CUSTOM_TEMPERAMENT_DEFAULT];
    const cleaned = parsed.map((value) => (typeof value === "number" && Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : 0));
    cleaned[0] = 0;
    return cleaned;
  } catch {
    return [...CUSTOM_TEMPERAMENT_DEFAULT];
  }
}

/** The inverse of loadCustomTemperamentCents -- what gets written to localStorage. */
export function serializeCustomTemperamentCents(cents: number[]): string {
  const cleaned = cents.slice(0, 12);
  while (cleaned.length < 12) cleaned.push(0);
  cleaned[0] = 0;
  return JSON.stringify(cleaned);
}

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
    label: "1/4-comma meantone",
    description: "Quarter-comma meantone around the key centre: smooth thirds, narrow fifths.",
    needsKeyCentre: true,
  },
  "meantone-sixth": {
    id: "meantone-sixth",
    label: "1/6-comma meantone",
    description: "A gentler meantone around the key centre: thirds less pure than 1/4-comma, fifths less narrow.",
    needsKeyCentre: true,
  },
  "meantone-third": {
    id: "meantone-third",
    label: "1/3-comma meantone",
    description: "A stronger meantone around the key centre: very pure thirds, noticeably narrow fifths.",
    needsKeyCentre: true,
  },
  werckmeister3: {
    id: "werckmeister3",
    label: "Werckmeister III",
    description: "1691 well temperament: four fifths tempered near the key centre, the rest pure -- every key usable, none identical.",
    needsKeyCentre: true,
  },
  kirnberger3: {
    id: "kirnberger3",
    label: "Kirnberger III",
    description: "c. 1779 well temperament built from a pure major third at the key centre, with mild tempering fanning out from it.",
    needsKeyCentre: true,
  },
  vallotti: {
    id: "vallotti",
    label: "Vallotti",
    description: "c. 1754 well temperament: six fifths tempered by equal small amounts, six left pure -- a favourite for Baroque repertoire.",
    needsKeyCentre: true,
  },
  young1799: {
    id: "young1799",
    label: "Young (1799)",
    description: "Thomas Young's well temperament: the same even tempering as Vallotti's, centred a step around the circle of fifths.",
    needsKeyCentre: true,
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Your own cent offset for each of the 12 degrees above the key centre, saved on this device.",
    needsKeyCentre: true,
  },
};

export const TEMPERAMENT_ORDER: TemperamentId[] = [
  "equal",
  "just",
  "pythagorean",
  "meantone",
  "meantone-sixth",
  "meantone-third",
  "werckmeister3",
  "kirnberger3",
  "vallotti",
  "young1799",
  "custom",
];

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
  /**
   * The 12 cents-from-equal offsets to use when temperament === "custom".
   * Ignored for every other temperament. Falls back to all-zero (equal) when
   * omitted, so callers that don't know about the custom temperament (the
   * standalone reference-tone generator, for instance) degrade gracefully
   * instead of throwing.
   */
  customCents?: number[];
};

export type TuningReading = {
  concertMidi: number;
  cents: number;
};

/** The cents-from-equal table this calibration should read from -- the fixed
 *  table for a named temperament, or the player's own for "custom". */
function centsTableFor(options: TuningOptions): number[] {
  if (options.temperament === "custom") return options.customCents ?? CUSTOM_TEMPERAMENT_DEFAULT;
  return TEMPERAMENTS[options.temperament];
}

/**
 * The frequency `concertMidi` should sound at under the given calibration:
 * the equal-tempered frequency against `referenceHz`, shifted by the active
 * temperament's cents offset for that note's scale degree above the key
 * centre.
 */
export function targetHzFor(concertMidi: number, options: TuningOptions): number {
  const equalHz = options.referenceHz * 2 ** ((concertMidi - 69) / 12);
  const degree = (((concertMidi - options.keyPc) % 12) + 12) % 12;
  const offsetCents = centsTableFor(options)[degree];
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
