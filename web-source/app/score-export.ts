/**
 * Pure score export: a transcription's notes (transcribe.ts's
 * TranscribedNote, or anything with the same three fields) to a Standard
 * MIDI File or a MusicXML document. No DOM, no audio -- both functions take
 * plain data and return bytes/text, so TranscribePanel just hands the
 * result to the same saveOrShareFile() path takes already use.
 */

export type ScoreNote = {
  /** Concert-pitch MIDI number -- what the recording actually sounds, same
   *  basis as TranscribedNote.concertMidi. */
  concertMidi: number;
  startSec: number;
  durationSec: number;
};

// ---------------------------------------------------------------------------
// Standard MIDI File (Format 0, one track)
// ---------------------------------------------------------------------------

/** Ticks per quarter note. A round, generous value -- fine-grained enough
 *  that quantising a note's start/length to the nearest tick never matters
 *  audibly, without needing a bespoke value per tempo. */
const PPQ = 480;

/** Variable-length quantity encoding, the delta-time/meta-length format
 *  every MIDI file event uses: 7 data bits per byte, high bit set on every
 *  byte except the last. */
export function encodeVLQ(value: number): number[] {
  const safe = Math.max(0, Math.floor(value));
  const bytes = [safe & 0x7f];
  let remaining = safe >> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  return bytes;
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}
function uint16BE(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}
function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

type MidiEvent = { tick: number; order: number; bytes: number[] };

/**
 * Renders `notes` (already concert-pitch MIDI numbers -- MIDI files have no
 * notion of a transposing instrument, so callers pass whichever pitch they
 * want to sound) as a Standard MIDI File, Format 0, a single track, at a
 * fixed `tempo` in BPM. Overlapping notes are supported: each note gets its
 * own on/off pair, sorted by tick with note-offs breaking ties before
 * note-ons at the same tick so a legato hand-off doesn't briefly silence
 * the instrument at 0 velocity mid-chord.
 */
export function toMidiFile(notes: ScoreNote[], tempo: number): Uint8Array<ArrayBuffer> {
  const bpm = tempo > 0 ? tempo : 120;
  const secPerQuarter = 60 / bpm;
  const microsecondsPerQuarter = Math.round(1_000_000 * secPerQuarter);

  const events: MidiEvent[] = [];
  let order = 0;
  events.push({
    tick: 0,
    order: order++,
    bytes: [0xff, 0x51, 0x03, (microsecondsPerQuarter >> 16) & 0xff, (microsecondsPerQuarter >> 8) & 0xff, microsecondsPerQuarter & 0xff],
  });
  for (const note of notes) {
    const midi = Math.max(0, Math.min(127, Math.round(note.concertMidi)));
    const startTick = Math.max(0, Math.round((note.startSec / secPerQuarter) * PPQ));
    const endTick = Math.max(startTick + 1, Math.round(((note.startSec + note.durationSec) / secPerQuarter) * PPQ));
    events.push({ tick: startTick, order: order++, bytes: [0x90, midi, 0x64] });
    events.push({ tick: endTick, order: order++, bytes: [0x80, midi, 0x40] });
  }
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] === 0x80 ? -1 : 1) - (b.bytes[0] === 0x80 ? -1 : 1) || a.order - b.order);

  const trackBytes: number[] = [];
  let previousTick = 0;
  for (const event of events) {
    trackBytes.push(...encodeVLQ(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  trackBytes.push(0x00, 0xff, 0x2f, 0x00); // end of track

  const header = [...ascii("MThd"), ...uint32BE(6), ...uint16BE(0), ...uint16BE(1), ...uint16BE(PPQ)];
  const track = [...ascii("MTrk"), ...uint32BE(trackBytes.length), ...trackBytes];
  return new Uint8Array([...header, ...track]);
}

// ---------------------------------------------------------------------------
// MusicXML (partwise, single part)
// ---------------------------------------------------------------------------

export type ScoreClef = "treble" | "bass";

export type MusicXmlOptions = {
  clef: ScoreClef;
  /** A major key's tonic name, spelled the way the export should prefer
   *  ("C", "G", "F", "Bb", "F#", ...). Defaults to "C" (no accidentals) when
   *  omitted, which also determines whether notes spell with sharps or
   *  flats. */
  keySignature?: string;
  instrument: string;
  /** Semitones written pitch sits above concert pitch, this app's own
   *  convention (see instruments.ts) -- 2 for a B-flat instrument, 9 for an
   *  E-flat alto, 0 for a concert-pitch instrument. */
  writtenOffset: number;
  /** BPM used for quantising note starts/lengths to the nearest 16th note.
   *  Defaults to 120 when the caller has no better estimate. */
  tempo?: number;
};

/** MusicXML's <fifths> count for each major key this export accepts, and
 *  whether that key spells with flats (used to pick the note-name table
 *  below). Keys are named the way a player would say them. */
const KEY_FIFTHS: Record<string, { fifths: number; flats: boolean }> = {
  Cb: { fifths: -7, flats: true }, Gb: { fifths: -6, flats: true }, Db: { fifths: -5, flats: true },
  Ab: { fifths: -4, flats: true }, Eb: { fifths: -3, flats: true }, Bb: { fifths: -2, flats: true },
  F: { fifths: -1, flats: true }, C: { fifths: 0, flats: false }, G: { fifths: 1, flats: false },
  D: { fifths: 2, flats: false }, A: { fifths: 3, flats: false }, E: { fifths: 4, flats: false },
  B: { fifths: 5, flats: false }, "F#": { fifths: 6, flats: false }, "C#": { fifths: 7, flats: false },
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

type XmlPitch = { step: string; alter: number; octave: number };

function pitchForMidi(midi: number, flats: boolean): XmlPitch {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1; // MIDI 60 = C4
  const name = (flats ? FLAT_NAMES : SHARP_NAMES)[pc];
  const step = name[0];
  const alter = name.length > 1 ? (name[1] === "#" ? 1 : -1) : 0;
  return { step, alter, octave };
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Standard note-duration decomposition at divisions=4 (a 16th note = 1
 *  division), longest first. A duration longer than a whole note (16) is
 *  covered by repeating the "whole" entry via the greedy loop below. */
const DURATION_TABLE: { ticks: number; type: string; dot: boolean }[] = [
  { ticks: 16, type: "whole", dot: false },
  { ticks: 12, type: "half", dot: true },
  { ticks: 8, type: "half", dot: false },
  { ticks: 6, type: "quarter", dot: true },
  { ticks: 4, type: "quarter", dot: false },
  { ticks: 3, type: "eighth", dot: true },
  { ticks: 2, type: "eighth", dot: false },
  { ticks: 1, type: "16th", dot: false },
];

/** Greedily splits a duration in 16th-note ticks into standard note
 *  lengths, longest first -- the same decomposition any notation editor
 *  applies when a duration isn't a single notatable value on its own. Each
 *  piece becomes its own <note> (no <tie> is emitted joining them back into
 *  one sustained note -- a deliberate simplification: the pitch, timing and
 *  duration are all still exactly represented, just as N adjacent notes of
 *  the same pitch rather than one tied note). */
function splitDurationTicks(ticks: number): { ticks: number; type: string; dot: boolean }[] {
  const pieces: { ticks: number; type: string; dot: boolean }[] = [];
  let remaining = Math.max(1, Math.round(ticks));
  while (remaining > 0) {
    const entry = DURATION_TABLE.find((candidate) => candidate.ticks <= remaining) ?? DURATION_TABLE[DURATION_TABLE.length - 1];
    pieces.push(entry);
    remaining -= entry.ticks;
  }
  return pieces;
}

/**
 * Renders `notes` (concert-pitch MIDI, same as toMidiFile) as a partwise
 * MusicXML document with a single part, quantised to the nearest 16th note
 * at `options.tempo` (or 120bpm if not given). Gaps between notes become
 * rests. A transposing instrument (writtenOffset !== 0) gets a <transpose>
 * element and its notes are written in the written key, not concert pitch.
 */
export function toMusicXml(notes: ScoreNote[], options: MusicXmlOptions): string {
  const bpm = options.tempo && options.tempo > 0 ? options.tempo : 120;
  const secPer16th = 60 / bpm / 4;
  const keyName = options.keySignature && KEY_FIFTHS[options.keySignature] ? options.keySignature : "C";
  const key = KEY_FIFTHS[keyName];

  const sorted = [...notes].sort((a, b) => a.startSec - b.startSec);
  const parts: string[] = [];
  let cursorTicks = 0;
  for (const note of sorted) {
    const startTicks = Math.round(note.startSec / secPer16th);
    const durationTicks = Math.max(1, Math.round(note.durationSec / secPer16th));
    if (startTicks > cursorTicks) {
      for (const piece of splitDurationTicks(startTicks - cursorTicks)) {
        parts.push(`<note><rest/><duration>${piece.ticks}</duration><voice>1</voice><type>${piece.type}</type>${piece.dot ? "<dot/>" : ""}</note>`);
      }
    }
    const writtenMidi = note.concertMidi + options.writtenOffset;
    const pitch = pitchForMidi(writtenMidi, key.flats);
    for (const piece of splitDurationTicks(durationTicks)) {
      parts.push(
        `<note><pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>` +
        `<duration>${piece.ticks}</duration><voice>1</voice><type>${piece.type}</type>${piece.dot ? "<dot/>" : ""}</note>`,
      );
    }
    cursorTicks = Math.max(cursorTicks, startTicks + durationTicks);
  }

  const clefSign = options.clef === "bass" ? "F" : "G";
  const clefLine = options.clef === "bass" ? 4 : 2;
  const transposeXml = options.writtenOffset !== 0
    ? `<transpose><chromatic>${-options.writtenOffset}</chromatic></transpose>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0">` +
    `<part-list><score-part id="P1"><part-name>${xmlEscape(options.instrument)}</part-name></score-part></part-list>` +
    `<part id="P1"><measure number="1">` +
    `<attributes><divisions>4</divisions>` +
    `<key><fifths>${key.fifths}</fifths></key>` +
    `<clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>` +
    transposeXml +
    `</attributes>` +
    parts.join("") +
    `</measure></part>` +
    `</score-partwise>`
  );
}
