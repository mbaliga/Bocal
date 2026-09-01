import type { Clef } from "./StaffNote";

export type InstrumentId =
  | "soprano-sax"
  | "alto-sax"
  | "tenor-sax"
  | "bari-sax"
  | "flute"
  | "oboe"
  | "bassoon"
  | "violin"
  | "viola"
  | "cello"
  | "double-bass"
  | "guitar"
  | "bass-guitar"
  | "harp"
  | "trumpet-bb"
  | "horn-f"
  | "trombone"
  | "tuba-concert"
  | "piano"
  | "organ-synth"
  | "mallet-percussion"
  | "voice-concert"
  | "electronic-audio";

/**
 * A picker grouping, not an assertion that every instrument in the group has
 * the same notation or technique. Individual selectable profiles below carry
 * the transposition and primary-clef data Bocal actually uses.
 */
export type InstrumentGroupId =
  | "woodwinds"
  | "bowed-strings"
  | "fretted-strings"
  | "brass"
  | "keyboards"
  | "percussion"
  | "voice"
  | "electronic";

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
  group: InstrumentGroupId;
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

export type InstrumentGroup = {
  id: InstrumentGroupId;
  name: string;
  /** A short line for the picker; it is deliberately not an instructional claim. */
  summary: string;
};

/**
 * These labels are the source of truth for Bocal's picker categories. The
 * profile selection itself remains at instrument level because, for example,
 * a violin and a double bass have different staff/transposition conventions.
 */
export const INSTRUMENT_GROUPS: Record<InstrumentGroupId, InstrumentGroup> = {
  woodwinds: { id: "woodwinds", name: "Woodwinds", summary: "Reeds, flutes and saxophones" },
  "bowed-strings": { id: "bowed-strings", name: "Bowed strings", summary: "Violin · viola · cello · bass" },
  "fretted-strings": { id: "fretted-strings", name: "Fretted & plucked", summary: "Guitar · bass guitar · harp" },
  brass: { id: "brass", name: "Brass", summary: "Trumpet · horn · trombone · tuba" },
  keyboards: { id: "keyboards", name: "Keyboards", summary: "Piano · organ · synthesizer" },
  percussion: { id: "percussion", name: "Percussion", summary: "Pitched mallet instruments" },
  voice: { id: "voice", name: "Voice", summary: "Concert-pitch vocal tuning" },
  electronic: { id: "electronic", name: "Electronic audio", summary: "Speaker or amp through the microphone" },
};

export const INSTRUMENTS: Record<InstrumentId, InstrumentProfile> = {
  "soprano-sax": {
    id: "soprano-sax",
    name: "Soprano saxophone",
    shortName: "Soprano",
    group: "woodwinds",
    family: "Saxophone",
    pitchLabel: "B♭",
    writtenOffset: 2,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the B♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer, shown on the alto 3D model · standard range only",
  },
  "alto-sax": {
    id: "alto-sax",
    name: "Alto saxophone",
    shortName: "Alto sax",
    group: "woodwinds",
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
    group: "woodwinds",
    family: "Saxophone",
    pitchLabel: "B♭",
    writtenOffset: 14,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the B♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer, shown on the alto 3D model · standard range only",
  },
  "bari-sax": {
    id: "bari-sax",
    name: "Baritone saxophone",
    shortName: "Baritone",
    group: "woodwinds",
    family: "Saxophone",
    pitchLabel: "E♭",
    writtenOffset: 21,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the E♭ transposition.",
    labTier: "fingering",
    labStatus: "Fingering trainer, shown on the alto 3D model · standard range only, no low A",
  },
  flute: {
    id: "flute",
    name: "Flute",
    shortName: "Flute",
    group: "woodwinds",
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
    group: "woodwinds",
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
    group: "woodwinds",
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
  // The profiles below intentionally stop at the musical facts Bocal can use
  // today: concert/written pitch and a primary notation clef. They do not
  // supply fingering, setup, range, or technique guidance. Standard-score
  // conventions used here: B-flat trumpet is +2, F horn is +7, guitar and
  // double bass are written one octave above sounding pitch, and orchestral
  // trombone/tuba bass-clef parts are concert pitch. Variants (for example
  // C trumpet, brass-band treble-clef low brass, scordatura, or alternate
  // tunings) need their own reviewed profile rather than a silent guess.
  violin: {
    id: "violin",
    name: "Violin",
    shortName: "Violin",
    group: "bowed-strings",
    family: "Bowed strings",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "The violin is shown at concert pitch. Bocal does not infer strings, positions or bowing.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no 3D fingering instruction",
  },
  viola: {
    id: "viola",
    name: "Viola",
    shortName: "Viola",
    group: "bowed-strings",
    family: "Bowed strings",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "alto",
    tunerDescription: "The viola is shown at concert pitch with an alto-clef staff option. Bocal does not infer strings, positions or bowing.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no 3D fingering instruction",
  },
  cello: {
    id: "cello",
    name: "Cello",
    shortName: "Cello",
    group: "bowed-strings",
    family: "Bowed strings",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "bass",
    tunerDescription: "The cello is shown at concert pitch with a bass-clef staff option. Higher tenor/treble passages remain a future notation refinement.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no 3D fingering instruction",
  },
  "double-bass": {
    id: "double-bass",
    name: "Double bass",
    shortName: "Bass",
    group: "bowed-strings",
    family: "Bowed strings",
    pitchLabel: "C · 8vb",
    writtenOffset: 12,
    clef: "bass",
    tunerDescription: "Double-bass parts are written one octave above the sounding pitch. Bocal applies that octave and does not infer strings or positions.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no 3D fingering instruction",
  },
  guitar: {
    id: "guitar",
    name: "Guitar",
    shortName: "Guitar",
    group: "fretted-strings",
    family: "Fretted strings",
    pitchLabel: "C · 8vb",
    writtenOffset: 12,
    clef: "treble",
    tunerDescription: "Standard guitar notation sounds one octave below written pitch. Bocal applies that octave; it does not choose a tuning or fretboard position.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no fretboard or 3D fingering instruction",
  },
  "bass-guitar": {
    id: "bass-guitar",
    name: "Bass guitar",
    shortName: "Bass gtr",
    group: "fretted-strings",
    family: "Fretted strings",
    pitchLabel: "C · 8vb",
    writtenOffset: 12,
    clef: "bass",
    tunerDescription: "Bass-guitar notation normally sounds one octave below written pitch. Bocal applies that octave; it does not choose a tuning or fretboard position.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no fretboard or 3D fingering instruction",
  },
  harp: {
    id: "harp",
    name: "Pedal harp",
    shortName: "Harp",
    group: "fretted-strings",
    family: "Plucked strings",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "The harp is shown at concert pitch. Bocal’s compact staff is single-clef; pedal settings and grand-staff notation are not modelled.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no pedal map or 3D fingering instruction",
  },
  "trumpet-bb": {
    id: "trumpet-bb",
    name: "B♭ trumpet",
    shortName: "Trumpet",
    group: "brass",
    family: "Brass",
    pitchLabel: "B♭",
    writtenOffset: 2,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the standard B♭ trumpet transposition; C and piccolo trumpets need separate profiles.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no valve chart or 3D fingering instruction",
  },
  "horn-f": {
    id: "horn-f",
    name: "Horn in F",
    shortName: "Horn in F",
    group: "brass",
    family: "Brass",
    pitchLabel: "F",
    writtenOffset: 7,
    clef: "treble",
    tunerDescription: "Your written note is shown first. Bocal handles the standard F-horn transposition; historical and alternate horn parts need separate profiles.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no valve chart or 3D fingering instruction",
  },
  trombone: {
    id: "trombone",
    name: "Trombone",
    shortName: "Trombone",
    group: "brass",
    family: "Brass",
    pitchLabel: "Concert bass clef",
    writtenOffset: 0,
    clef: "bass",
    tunerDescription: "This profile uses standard concert-pitch bass-clef trombone notation. Treble-clef brass-band notation needs a separate profile.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no slide-position or 3D instruction",
  },
  "tuba-concert": {
    id: "tuba-concert",
    name: "Tuba",
    shortName: "Tuba",
    group: "brass",
    family: "Brass",
    pitchLabel: "Concert bass clef",
    writtenOffset: 0,
    clef: "bass",
    tunerDescription: "This profile uses standard concert-pitch bass-clef tuba notation. Treble-clef brass-band notation needs a separate profile.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no valve chart or 3D fingering instruction",
  },
  piano: {
    id: "piano",
    name: "Piano",
    shortName: "Piano",
    group: "keyboards",
    family: "Keyboards",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "Piano is shown at concert pitch. The compact staff is a single-note treble display; grand-staff engraving is not yet implemented.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no keyboard visualization or 3D instruction",
  },
  "organ-synth": {
    id: "organ-synth",
    name: "Organ / synthesizer",
    shortName: "Keys",
    group: "keyboards",
    family: "Keyboards",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "The profile reads acoustic output at concert pitch. It does not receive MIDI or inspect an instrument’s internal tuning.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no MIDI input, keyboard visualization or 3D instruction",
  },
  "mallet-percussion": {
    id: "mallet-percussion",
    name: "Pitched percussion",
    shortName: "Mallets",
    group: "percussion",
    family: "Percussion",
    pitchLabel: "C",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "For pitched mallet instruments only, shown at concert pitch. Unpitched drums and cymbals do not have a note target in this tuner.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready for pitched instruments · no sticking or 3D instruction",
  },
  "voice-concert": {
    id: "voice-concert",
    name: "Voice",
    shortName: "Voice",
    group: "voice",
    family: "Voice",
    pitchLabel: "Concert pitch",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "Voice is shown at concert pitch. Bocal measures pitch only; it does not diagnose register, vowel, breath or vocal health.",
    labTier: "none",
    labStatus: "Tuner, pulse and local analysis ready · no vocal-technique or 3D instruction",
  },
  "electronic-audio": {
    id: "electronic-audio",
    name: "Electronic audio",
    shortName: "Electronic",
    group: "electronic",
    family: "Electronic instruments",
    pitchLabel: "Concert pitch",
    writtenOffset: 0,
    clef: "treble",
    tunerDescription: "Bocal listens to a speaker or amp through the microphone at concert pitch. MIDI device input is not implemented.",
    labTier: "none",
    labStatus: "Audio tuner, pulse and local analysis ready · no MIDI input or 3D instruction",
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
  "violin",
  "viola",
  "cello",
  "double-bass",
  "guitar",
  "bass-guitar",
  "harp",
  "trumpet-bb",
  "horn-f",
  "trombone",
  "tuba-concert",
  "piano",
  "organ-synth",
  "mallet-percussion",
  "voice-concert",
  "electronic-audio",
];

export function instrumentsInGroup(group: InstrumentGroupId): InstrumentProfile[] {
  return INSTRUMENT_ORDER
    .map((id) => INSTRUMENTS[id])
    .filter((profile) => profile.group === group);
}

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && value in INSTRUMENTS;
}
