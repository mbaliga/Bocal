import assert from "node:assert/strict";
import test from "node:test";
import { encodeVLQ, toMidiFile, toMusicXml } from "../app/score-export.ts";

test("encodeVLQ matches the Standard MIDI File spec's worked examples", () => {
  assert.deepEqual(encodeVLQ(0), [0x00]);
  assert.deepEqual(encodeVLQ(64), [0x40]);
  assert.deepEqual(encodeVLQ(127), [0x7f]);
  assert.deepEqual(encodeVLQ(128), [0x81, 0x00]);
  assert.deepEqual(encodeVLQ(8192), [0xc0, 0x00]);
  assert.deepEqual(encodeVLQ(16383), [0xff, 0x7f]);
  assert.deepEqual(encodeVLQ(2097151), [0xff, 0xff, 0x7f]);
});

/** Minimal Standard MIDI File Format-0 reader, independent of toMidiFile's
 *  own internals, so the test actually checks the bytes mean what they
 *  should rather than re-asserting how the encoder happened to write them. */
function readMidiFile(bytes) {
  const text = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  assert.equal(text(0, 4), "MThd");
  const headerLength = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  assert.equal(headerLength, 6);
  const format = (bytes[8] << 8) | bytes[9];
  const ntrks = (bytes[10] << 8) | bytes[11];
  const division = (bytes[12] << 8) | bytes[13];
  let cursor = 14;
  assert.equal(text(cursor, 4), "MTrk");
  cursor += 4;
  const trackLength = (bytes[cursor] << 24) | (bytes[cursor + 1] << 16) | (bytes[cursor + 2] << 8) | bytes[cursor + 3];
  cursor += 4;
  const trackEnd = cursor + trackLength;

  const readVLQ = () => {
    let value = 0;
    for (;;) {
      const byte = bytes[cursor++];
      value = (value << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };

  let tick = 0;
  const noteOns = [];
  const noteOffs = [];
  let tempoMicroseconds = null;
  let endOfTrackAt = null;
  while (cursor < trackEnd) {
    tick += readVLQ();
    const status = bytes[cursor++];
    if (status === 0xff) {
      const metaType = bytes[cursor++];
      const length = readVLQ();
      const payload = bytes.slice(cursor, cursor + length);
      cursor += length;
      if (metaType === 0x51) tempoMicroseconds = (payload[0] << 16) | (payload[1] << 8) | payload[2];
      if (metaType === 0x2f) endOfTrackAt = tick;
    } else if ((status & 0xf0) === 0x90) {
      const note = bytes[cursor++];
      const velocity = bytes[cursor++];
      noteOns.push({ tick, note, velocity });
    } else if ((status & 0xf0) === 0x80) {
      const note = bytes[cursor++];
      const velocity = bytes[cursor++];
      noteOffs.push({ tick, note, velocity });
    } else {
      throw new Error(`unexpected status byte 0x${status.toString(16)} at ${cursor - 1}`);
    }
  }
  assert.equal(cursor, trackEnd, "track chunk length must match its actual content");
  return { format, ntrks, division, tempoMicroseconds, endOfTrackAt, noteOns, noteOffs };
}

test("toMidiFile encodes a correct header, tempo and note on/off pairs", () => {
  const notes = [
    { concertMidi: 60, startSec: 0, durationSec: 0.5 },
    { concertMidi: 64, startSec: 0.5, durationSec: 0.5 },
  ];
  const bytes = Array.from(toMidiFile(notes, 120));
  const parsed = readMidiFile(bytes);

  assert.equal(parsed.format, 0);
  assert.equal(parsed.ntrks, 1);
  assert.equal(parsed.division, 480, "480 ticks per quarter note");
  assert.equal(parsed.tempoMicroseconds, 500000, "120 BPM is 500000 microseconds per quarter note");
  assert.ok(parsed.endOfTrackAt !== null, "must contain an end-of-track meta event");

  assert.equal(parsed.noteOns.length, 2);
  assert.equal(parsed.noteOffs.length, 2);
  assert.deepEqual(parsed.noteOns.map((event) => event.note), [60, 64]);
  assert.deepEqual(parsed.noteOns.map((event) => event.tick), [0, 480], "second note starts one quarter note in");
  assert.deepEqual(parsed.noteOffs.map((event) => event.tick), [480, 960]);
  assert.ok(parsed.noteOns.every((event) => event.velocity > 0));
  for (const off of parsed.noteOffs) assert.equal(off.velocity, 0x40, "note-off velocity is fixed, not zero");
});

test("toMidiFile falls back to a sane tempo instead of dividing by zero", () => {
  const bytes = Array.from(toMidiFile([{ concertMidi: 60, startSec: 0, durationSec: 1 }], 0));
  const parsed = readMidiFile(bytes);
  assert.ok(parsed.tempoMicroseconds > 0);
});

test("toMidiFile clamps MIDI numbers outside the 7-bit range", () => {
  const bytes = Array.from(toMidiFile([{ concertMidi: 200, startSec: 0, durationSec: 0.1 }], 120));
  const parsed = readMidiFile(bytes);
  assert.equal(parsed.noteOns[0].note, 127);
});

/** Checks every start tag is matched by a same-named end tag, in order --
 *  enough to catch a malformed generator without pulling in an XML parser
 *  dependency for one test file. */
function assertWellFormedXml(xml) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  const body = xml.replace(/<\?xml[^?]*\?>/, "").replace(/<!DOCTYPE[^>]*>/, "");
  const stack = [];
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)[^>]*?(\/?)>/g;
  let match;
  while ((match = tagPattern.exec(body))) {
    const [, closing, name, selfClosing] = match;
    if (closing) {
      const expected = stack.pop();
      assert.equal(expected, name, `mismatched closing tag </${name}>, expected </${expected}>`);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], "every opened tag must be closed");
}

test("toMusicXml produces a well-formed document with one <pitch> per note and no transpose for a concert-pitch instrument", () => {
  const notes = [
    { concertMidi: 60, startSec: 0, durationSec: 0.5 },
    { concertMidi: 62, startSec: 0.5, durationSec: 0.5 },
  ];
  const xml = toMusicXml(notes, { clef: "treble", instrument: "Flute", writtenOffset: 0, tempo: 120 });
  assertWellFormedXml(xml);
  assert.equal((xml.match(/<pitch>/g) ?? []).length, 2);
  assert.doesNotMatch(xml, /<transpose>/);
  assert.doesNotMatch(xml, /<rest\/>/, "back-to-back notes should not insert a rest between them");
});

test("toMusicXml adds a <transpose> element for a transposing instrument, sign matching written-vs-concert convention", () => {
  const notes = [{ concertMidi: 60, startSec: 0, durationSec: 1 }];
  // A B-flat instrument: writtenOffset 2 means written = concert + 2, so
  // MusicXML's chromatic (added to written to reach sounding) is -2.
  const xml = toMusicXml(notes, { clef: "treble", instrument: "Clarinet in Bb", writtenOffset: 2, tempo: 120 });
  assertWellFormedXml(xml);
  assert.match(xml, /<transpose><chromatic>-2<\/chromatic><\/transpose>/);
});

test("toMusicXml fills a gap between notes with a rest", () => {
  const notes = [{ concertMidi: 60, startSec: 0.25, durationSec: 0.25 }];
  const xml = toMusicXml(notes, { clef: "treble", instrument: "Oboe", writtenOffset: 0, tempo: 120 });
  assertWellFormedXml(xml);
  assert.match(xml, /<rest\/>/);
  assert.equal((xml.match(/<pitch>/g) ?? []).length, 1);
});

test("toMusicXml spells a sharp key in sharps and a flat key in flats for the same pitch class", () => {
  // MIDI 61 = C#/Db.
  const sharpXml = toMusicXml([{ concertMidi: 61, startSec: 0, durationSec: 1 }], { clef: "treble", instrument: "Oboe", writtenOffset: 0, keySignature: "D", tempo: 120 });
  const flatXml = toMusicXml([{ concertMidi: 61, startSec: 0, durationSec: 1 }], { clef: "treble", instrument: "Oboe", writtenOffset: 0, keySignature: "Bb", tempo: 120 });
  assert.match(sharpXml, /<step>C<\/step><alter>1<\/alter>/);
  assert.match(flatXml, /<step>D<\/step><alter>-1<\/alter>/);
});

test("toMusicXml writes fifths matching the requested key signature", () => {
  const xml = toMusicXml([{ concertMidi: 60, startSec: 0, durationSec: 1 }], { clef: "treble", instrument: "Oboe", writtenOffset: 0, keySignature: "Eb" });
  assert.match(xml, /<fifths>-3<\/fifths>/);
});

test("toMusicXml uses a bass clef sign and line when asked", () => {
  const xml = toMusicXml([{ concertMidi: 45, startSec: 0, durationSec: 1 }], { clef: "bass", instrument: "Bassoon", writtenOffset: 0 });
  assert.match(xml, /<clef><sign>F<\/sign><line>4<\/line><\/clef>/);
});
