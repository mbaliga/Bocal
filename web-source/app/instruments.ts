import type { Clef } from "./StaffNote";

export type InstrumentId =
  | "soprano-sax"
  | "alto-sax"
  | "tenor-sax"
  | "bari-sax"
  | "flute"
  | "oboe"
  | "bassoon";

/**
 * What Bocal can show for an instrument inside the 3D lab.
 *
 * This is gated on assets, not on code. A lab tab needs a model Bocal is
 * licensed to ship and, for "fingering", a chart that a teacher has actually
 * checked -- publishing a wrong fingering to a beginner is worse than
 * publishing none. Everything else in the app (tuner, pulse, analysis,
 * practice logging) needs neither, so instruments without a model are fully
 * usable rather than hidden.
 */
export type LabTier = "fingering" | "anatomy" | "none";

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
    labTier: "none",
    labStatus: "Tuner and practice tools ready · 3D model not yet licensed",
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
    labTier: "none",
    labStatus: "Tuner and practice tools ready · 3D model not yet licensed",
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
    labTier: "none",
    labStatus: "Tuner and practice tools ready · 3D model not yet licensed",
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
    labTier: "none",
    labStatus: "Tuner and practice tools ready · 3D model not yet licensed",
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
    labStatus: "3D anatomy preview",
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
    labTier: "none",
    labStatus: "Tuner and practice tools ready · 3D model not yet licensed",
  },
};

export const INSTRUMENT_ORDER: InstrumentId[] = [
  "alto-sax",
  "tenor-sax",
  "soprano-sax",
  "bari-sax",
  "oboe",
  "flute",
  "bassoon",
];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && value in INSTRUMENTS;
}
