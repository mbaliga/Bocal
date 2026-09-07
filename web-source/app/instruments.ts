import type { Clef } from "./StaffNote";

export type InstrumentId =
  | "soprano-sax"
  | "alto-sax"
  | "tenor-sax"
  | "bari-sax"
  | "flute"
  | "clarinet"
  | "oboe"
  | "cor-anglais"
  | "bassoon"
  | "guitar";

/**
 * What Bocal can show for an instrument inside the lab.
 *
 * This is gated on assets, not on code. A 3D tab needs a model Bocal is
 * licensed to ship. Everything else in the app (tuner, pulse, analysis,
 * practice logging) needs neither a model nor a chart, so instruments
 * without either asset are fully usable rather than hidden.
 *
 *   "fingering" -- 3D model + interactive fingering trainer (sax family).
 *   "anatomy"   -- 3D model, no fingering content of its own (oboe / cor
 *                  anglais get a fingering chart too, see below, but that's
 *                  layered on top of "anatomy" rather than changing it).
 *   "chart"     -- no 3D model, but a 2D fingering chart (see
 *                  app/fingering-charts/): flute, clarinet, bassoon.
 *   "none"      -- neither. Tuner and practice tools only (guitar).
 *
 * "chart" is a new tier rather than a flag on "anatomy" and "fingering"
 * because a chart is orthogonal to a 3D model: oboe has both an anatomy
 * preview and a chart (see `FINGERING_CHARTS` in app/fingering-charts/,
 * which oboe and cor-anglais appear in despite being "anatomy" tier), while
 * flute, clarinet and bassoon have a chart and nothing else. Overloading
 * "anatomy" to secretly also mean "and maybe a chart" would have made the
 * router's actual behaviour unreadable from this type alone.
 *
 * Every chart shipped is method-book consensus checked against two
 * published references, not a teacher's review -- see the `review` field on
 * each chart in app/fingering-charts/ and the badge it renders as. That is a
 * lower bar than "checked by a teacher," and the UI says so plainly rather
 * than borrowing the confidence a 3D model's finish might otherwise imply.
 */
export type LabTier = "fingering" | "anatomy" | "chart" | "none";

/**
 * The concert-pitch frequency band the live tuner's pitch tracker searches
 * within for this instrument. Every instrument used to share one fixed
 * 120-1600 Hz window (StablePitchTracker's own defaults): a bassoon,
 * baritone or tenor player's low register fell below it and read as silence,
 * and a flutist's A6-C7 fell within it at the *wrong* frequency (half the
 * true one still happened to land inside 120-1600 Hz), so the tracker
 * confidently reported the note an octave low. See tuner.md finding 1 and
 * engineering.md's P0 finding for the measurements. Bounds are generous
 * around each instrument's actual written and concert range so a slightly
 * sharp or flat note, or a written extreme not everyone reaches, still
 * falls inside the search window.
 */
export type FrequencyRange = { minHz: number; maxHz: number };

/**
 * The tuner's sharp/flat coaching copy used to be one fixed pair of phrases
 * ("Ease the jaw pressure..." / "Support the air...") shown to every
 * instrument, including guitar strings and flute's air column, which don't
 * take a jaw or a reed (product.md finding "Tuner coaching copy contradicts
 * the engine and the instrument"). Each embouchure family gets its own pair
 * instead.
 */
export type EmbouchureFamily = "reed" | "air-reed" | "double-reed" | "string";

export const CORRECTION_COPY: Record<EmbouchureFamily, { sharp: string; flat: string }> = {
  reed: {
    sharp: "Ease the jaw pressure on the reed without losing the air.",
    flat: "Support the air and bring the pitch up without biting harder.",
  },
  "air-reed": {
    sharp: "Roll the embouchure hole slightly out, or ease the air speed.",
    flat: "Roll the embouchure hole slightly in, or speed the air up.",
  },
  "double-reed": {
    sharp: "Relax the embouchure pressure on the reed without losing support.",
    flat: "Firm the embouchure slightly and keep the air moving.",
  },
  string: {
    sharp: "Ease the tuning peg or fine tuner to lower the string slightly.",
    flat: "Tighten the tuning peg or fine tuner to raise the string slightly.",
  },
};

export type InstrumentProfile = {
  id: InstrumentId;
  name: string;
  shortName: string;
  family: string;
  /** The key the instrument is built in, as printed on the case. */
  pitchLabel: string;
  /**
   * Semitones from sounding pitch to written pitch. A B-flat tenor sounds a
   * major ninth below what its player reads, so its written note is 14
   * semitones above the concert note the microphone hears.
   */
  writtenOffset: number;
  clef: Clef;
  tunerDescription: string;
  labTier: LabTier;
  labStatus: string;
  /** Concert-pitch search window for the live pitch tracker. See FrequencyRange. */
  range: FrequencyRange;
  /** Which embouchure/technique family this instrument's tuner correction copy should use. */
  embouchure: EmbouchureFamily;
};

export const INSTRUMENTS: Record<InstrumentId, InstrumentProfile> = {
  "soprano-sax": {
    id: "soprano-sax",
    name: "Soprano saxophone",
    shortName: "Soprano",
    family: "Saxophone",
    pitchLabel: "B♭",
    writtenOffset: 2,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the B♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer, shown on the alto 3D model · standard range only",
    range: { minHz: 200, maxHz: 2200 },
    embouchure: "reed",
  },
  "alto-sax": {
    id: "alto-sax",
    name: "Alto saxophone",
    shortName: "Alto sax",
    family: "Saxophone",
    pitchLabel: "E♭",
    writtenOffset: 9,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the E♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer + 3D reference",
    range: { minHz: 130, maxHz: 1800 },
    embouchure: "reed",
  },
  "tenor-sax": {
    id: "tenor-sax",
    name: "Tenor saxophone",
    shortName: "Tenor",
    family: "Saxophone",
    pitchLabel: "B♭",
    writtenOffset: 14,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the B♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer, shown on the alto 3D model · standard range only",
    range: { minHz: 95, maxHz: 1600 },
    embouchure: "reed",
  },
  "bari-sax": {
    id: "bari-sax",
    name: "Baritone saxophone",
    shortName: "Baritone",
    family: "Saxophone",
    pitchLabel: "E♭",
    writtenOffset: 21,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the E♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer, shown on the alto 3D model · standard range only, no low A",
    range: { minHz: 60, maxHz: 1400 },
    embouchure: "reed",
  },
  flute: {
    id: "flute",
    name: "Flute",
    shortName: "Flute",
    family: "Air reed",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "The flute is a concert-pitch instrument, so written and sounding notes match.",
    labTier: "chart",
    labStatus: "Fingering chart · no 3D model yet",
    range: { minHz: 240, maxHz: 2600 },
    embouchure: "air-reed",
  },
  clarinet: {
    id: "clarinet",
    name: "Clarinet",
    shortName: "Clarinet",
    family: "Single reed",
    pitchLabel: "B♭",
    writtenOffset: 2,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the B♭ transposition.",
    labTier: "chart",
    labStatus: "Fingering chart · 3D model not licensed",
    range: { minHz: 140, maxHz: 2200 },
    embouchure: "reed",
  },
  oboe: {
    id: "oboe",
    name: "Oboe",
    shortName: "Oboe",
    family: "Double reed",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "The oboe is a concert-pitch instrument, so written and sounding notes match.",
    labTier: "anatomy",
    labStatus: "3D anatomy preview + fingering chart",
    range: { minHz: 220, maxHz: 2000 },
    embouchure: "double-reed",
  },
  "cor-anglais": {
    id: "cor-anglais",
    name: "Cor anglais",
    shortName: "Cor anglais",
    family: "Double reed",
    pitchLabel: "F",
    // A perfect fifth below written pitch: written C5 (72) sounds concert F4 (65).
    writtenOffset: 7,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the F transposition.",
    labTier: "anatomy",
    labStatus: "3D anatomy preview, shown on the oboe model + oboe fingering chart",
    range: { minHz: 150, maxHz: 1500 },
    embouchure: "double-reed",
  },
  bassoon: {
    id: "bassoon",
    name: "Bassoon",
    shortName: "Bassoon",
    family: "Double reed",
    pitchLabel: "C",
    writtenOffset: 0,
    // Bassoon parts move up to tenor clef in high passages; bass is the clef a
    // student meets first and the one the tuner readout is most useful in.
    clef: "bass",
    tunerDescription: "The bassoon is a concert-pitch instrument, so written and sounding notes match.",
    labTier: "chart",
    labStatus: "Fingering chart · no 3D model yet",
    range: { minHz: 55, maxHz: 1000 },
    embouchure: "double-reed",
  },
  guitar: {
    id: "guitar",
    name: "Guitar",
    shortName: "Guitar",
    family: "Strings",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "Tune each open string, then move straight into a colour-coded chord and listening drill.",
    labTier: "none",
    labStatus: "String tuner + chord player",
    range: { minHz: 75, maxHz: 1400 },
    embouchure: "string",
  },
};

export const INSTRUMENT_ORDER: InstrumentId[] = [
  "alto-sax",
  "tenor-sax",
  "soprano-sax",
  "bari-sax",
  "oboe",
  "cor-anglais",
  "flute",
  "clarinet",
  "bassoon",
  "guitar",
];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && value in INSTRUMENTS;
}
