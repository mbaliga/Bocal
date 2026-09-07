import assert from "node:assert/strict";
import test from "node:test";
import {
  spellingFor,
  noteName,
  octaveOf,
  octaveLabel,
  fullNoteLabel,
  midiFromFrequency,
  frequencyFromMidi,
  NOTATION_SYSTEMS,
  NOTATION_ORDER,
  TONIC_CHOICES,
} from "../app/notation.ts";

test("western note names run the full chromatic scale from C", () => {
  const names = Array.from({ length: 12 }, (_, pc) => noteName(60 + pc, "western"));
  assert.deepEqual(names, ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]);
});

test("solfège is fixed-do: Do is always C regardless of tonic", () => {
  assert.equal(noteName(60, "solfege"), "Do");
  assert.equal(noteName(60, "solfege", 7), "Do"); // tonic argument ignored
  assert.equal(noteName(64, "solfege"), "Mi");
});

test("sargam is movable: Sa follows the chosen tonic pitch class", () => {
  assert.equal(noteName(60, "sargam", 0), "Sa"); // Sa = C
  assert.equal(noteName(67, "sargam", 0), "Pa"); // G is Pa when Sa = C
  assert.equal(noteName(67, "sargam", 7), "Sa"); // Sa = G
  assert.equal(noteName(69, "sargam", 7), "Re"); // A is Re when Sa = G
});

test("sargam komal degrees are lowercase, shuddha capitalised", () => {
  assert.equal(noteName(61, "sargam", 0), "re"); // Db, komal Re
  assert.equal(noteName(62, "sargam", 0), "Re"); // D, shuddha Re
});

test("staff system falls back to western letter names as a string", () => {
  assert.equal(noteName(60, "staff"), "C");
});

test("spellingFor gives the wind-method-book letter/accidental for every pitch class", () => {
  assert.deepEqual(spellingFor(60), { letter: 0, accidental: 0 }); // C
  assert.deepEqual(spellingFor(61), { letter: 0, accidental: 1 }); // C#
  assert.deepEqual(spellingFor(63), { letter: 2, accidental: -1 }); // Eb (spelled flat, not D#)
  assert.deepEqual(spellingFor(70), { letter: 6, accidental: -1 }); // Bb (spelled flat, not A#)
});

test("spellingFor wraps negative and large midi numbers into one octave", () => {
  assert.deepEqual(spellingFor(-1), spellingFor(11));
  assert.deepEqual(spellingFor(120), spellingFor(0));
});

test("octaveOf places middle C at octave 4", () => {
  assert.equal(octaveOf(60), 4);
  assert.equal(octaveOf(72), 5);
  assert.equal(octaveOf(48), 3);
});

test("octaveLabel counts western octaves from C but sargam octaves from the tonic", () => {
  assert.equal(octaveLabel(60, "western"), "4");
  assert.equal(octaveLabel(72, "sargam", 0), octaveOf(72).toString());
  // Sa = G4 (67): the octave number increments an octave above the tonic, not at C.
  const base = octaveLabel(67, "sargam", 67);
  assert.equal(octaveLabel(79, "sargam", 67), String(Number(base) + 1));
});

test("fullNoteLabel concatenates name and octave", () => {
  assert.equal(fullNoteLabel(63, "western"), "E♭4");
  assert.equal(fullNoteLabel(60, "sargam", 0), "Sa4");
});

test("midiFromFrequency and frequencyFromMidi round-trip at A440", () => {
  assert.equal(frequencyFromMidi(69), 440);
  assert.ok(Math.abs(midiFromFrequency(440) - 69) < 1e-9);
  assert.ok(Math.abs(midiFromFrequency(frequencyFromMidi(64)) - 64) < 1e-9);
});

test("every notation system is registered with a label and needsTonic flag, in NOTATION_ORDER", () => {
  assert.deepEqual(new Set(NOTATION_ORDER), new Set(Object.keys(NOTATION_SYSTEMS)));
  for (const id of NOTATION_ORDER) {
    const profile = NOTATION_SYSTEMS[id];
    assert.equal(profile.id, id);
    assert.equal(typeof profile.label, "string");
    assert.equal(typeof profile.description, "string");
    assert.equal(typeof profile.needsTonic, "boolean");
  }
  assert.equal(NOTATION_SYSTEMS.sargam.needsTonic, true);
  assert.equal(NOTATION_SYSTEMS.western.needsTonic, false);
});

test("TONIC_CHOICES lists all 12 pitch classes with western names", () => {
  assert.equal(TONIC_CHOICES.length, 12);
  assert.deepEqual(TONIC_CHOICES.map((choice) => choice.pc), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(TONIC_CHOICES[0].name, "C");
});
