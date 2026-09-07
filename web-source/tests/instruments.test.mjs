import assert from "node:assert/strict";
import test from "node:test";
import { INSTRUMENTS, INSTRUMENT_ORDER, isInstrumentId } from "../app/instruments.ts";

// NOTE: WP1 (tuner-fidelity) is expected to add a per-instrument tracker
// `range: { minHz, maxHz }` to InstrumentProfile. This file tests the shape
// as it exists today; once that field lands, extend the "every profile has
// the required fields" test below with min/max range assertions (and a
// sanity check that minHz/maxHz bracket the instrument's real playing
// range) rather than replacing this file.

const CLEFS = new Set(["treble", "bass"]);
const LAB_TIERS = new Set(["fingering", "anatomy", "chart", "none"]);

test("INSTRUMENT_ORDER lists every instrument in INSTRUMENTS exactly once", () => {
  const ids = Object.keys(INSTRUMENTS);
  assert.equal(INSTRUMENT_ORDER.length, ids.length);
  assert.deepEqual([...INSTRUMENT_ORDER].sort(), [...ids].sort());
  assert.equal(new Set(INSTRUMENT_ORDER).size, INSTRUMENT_ORDER.length);
});

test("every profile carries a complete, well-typed shape", () => {
  for (const [id, profile] of Object.entries(INSTRUMENTS)) {
    assert.equal(profile.id, id, `${id}: id field matches its key`);
    assert.equal(typeof profile.name, "string");
    assert.equal(typeof profile.shortName, "string");
    assert.equal(typeof profile.family, "string");
    assert.equal(typeof profile.pitchLabel, "string");
    assert.equal(typeof profile.writtenOffset, "number");
    assert.ok(Number.isInteger(profile.writtenOffset), `${id}: writtenOffset is an integer semitone count`);
    assert.ok(CLEFS.has(profile.clef), `${id}: clef is treble or bass`);
    assert.equal(typeof profile.tunerDescription, "string");
    assert.ok(LAB_TIERS.has(profile.labTier), `${id}: labTier is one of the known tiers`);
    assert.equal(typeof profile.labStatus, "string");
  }
});

test("isInstrumentId only accepts real instrument keys", () => {
  for (const id of INSTRUMENT_ORDER) assert.equal(isInstrumentId(id), true);
  assert.equal(isInstrumentId("trombone"), false);
  assert.equal(isInstrumentId(""), false);
  assert.equal(isInstrumentId(42), false);
  assert.equal(isInstrumentId(null), false);
  assert.equal(isInstrumentId(undefined), false);
});

// writtenOffset is semitones from sounding (concert) pitch to written pitch:
// concertMidi + writtenOffset = writtenMidi. These are the known transposition
// conventions for each family, cross-checked against sax-data.test.mjs's
// concert-pitch assertions for the saxophones.
test("writtenOffset matches the known transposition for every transposing instrument", () => {
  assert.equal(INSTRUMENTS["soprano-sax"].writtenOffset, 2); // B♭, sounds a major 2nd below written
  assert.equal(INSTRUMENTS["alto-sax"].writtenOffset, 9); // E♭, sounds a major 6th below written
  assert.equal(INSTRUMENTS["tenor-sax"].writtenOffset, 14); // B♭, sounds a major 9th below written
  assert.equal(INSTRUMENTS["bari-sax"].writtenOffset, 21); // E♭, sounds a major 13th below written
  assert.equal(INSTRUMENTS["clarinet"].writtenOffset, 2); // B♭, sounds a major 2nd below written
  assert.equal(INSTRUMENTS["cor-anglais"].writtenOffset, 7); // F, sounds a perfect 5th below written
});

test("concert-pitch instruments have a zero writtenOffset", () => {
  for (const id of ["flute", "oboe", "bassoon", "guitar"]) {
    assert.equal(INSTRUMENTS[id].writtenOffset, 0, `${id} is a concert-pitch instrument`);
  }
});

test("bassoon reads in bass clef; every other instrument reads in treble", () => {
  assert.equal(INSTRUMENTS.bassoon.clef, "bass");
  for (const id of INSTRUMENT_ORDER) {
    if (id === "bassoon") continue;
    assert.equal(INSTRUMENTS[id].clef, "treble", `${id} reads in treble clef`);
  }
});

test("lab tier reflects which asset each instrument actually ships", () => {
  const saxes = ["soprano-sax", "alto-sax", "tenor-sax", "bari-sax"];
  for (const id of saxes) assert.equal(INSTRUMENTS[id].labTier, "fingering");
  for (const id of ["oboe", "cor-anglais"]) assert.equal(INSTRUMENTS[id].labTier, "anatomy");
  for (const id of ["flute", "clarinet", "bassoon"]) assert.equal(INSTRUMENTS[id].labTier, "chart");
  assert.equal(INSTRUMENTS.guitar.labTier, "none");
});
