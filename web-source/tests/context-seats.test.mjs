import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT_SEAT_KEYS,
  MAX_SEAT_LABEL_LENGTH,
  WORKSPACE_MODES,
  contextKeyFor,
  contextSeatsFor,
  defaultContextSeat,
  parseContextSeats,
  resolveContextSeat,
  sanitiseContextSeats,
  serialiseContextSeats,
} from "../app/context-seats.ts";
import { INSTRUMENTS } from "../app/instruments.ts";

test("every workspace gives every instrument exactly two distinct, short seats", () => {
  for (const mode of WORKSPACE_MODES) {
    for (const instrument of Object.values(INSTRUMENTS)) {
      const where = `${mode} / ${instrument.id}`;
      const seats = contextSeatsFor(mode, instrument);
      assert.equal(seats.length, 2, `${where}: two seats`);
      assert.notEqual(seats[0].id, seats[1].id, `${where}: seat ids differ`);
      assert.notEqual(seats[0].label, seats[1].label, `${where}: seat labels differ`);
      for (const seat of seats) {
        assert.ok(seat.id.length > 0, `${where}: seat id`);
        assert.ok(seat.label.length > 0 && seat.label.length <= MAX_SEAT_LABEL_LENGTH, `${where}: "${seat.label}" fits the pill`);
        assert.ok(!(seat.section && seat.opens), `${where}: a seat scrolls or opens, not both`);
      }
    }
  }
});

test("the pair is contextual: Tune, Analyze and Lab do not share a pair", () => {
  const alto = INSTRUMENTS["alto-sax"];
  const labels = (mode) => contextSeatsFor(mode, alto).map((seat) => seat.label).join("/");
  const pairs = new Set(WORKSPACE_MODES.map(labels));
  assert.equal(pairs.size, WORKSPACE_MODES.length, "each workspace has its own pair for an alto sax");
  assert.equal(labels("tune"), "Written/Concert");
  assert.equal(labels("analyze"), "Waveform/Spectrum");
  assert.equal(labels("sax"), "Learn/Challenge");
});

test("transposing and non-transposing instruments get different Tune pairs", () => {
  const tune = (id) => contextSeatsFor("tune", INSTRUMENTS[id]).map((seat) => seat.label).join("/");
  for (const instrument of Object.values(INSTRUMENTS)) {
    assert.equal(tune(instrument.id), instrument.writtenOffset !== 0 ? "Written/Concert" : "Tuner/Tone", instrument.id);
  }
});

test("the lab pair follows what each lab really has", () => {
  const lab = (id) => contextSeatsFor("sax", INSTRUMENTS[id]).map((seat) => seat.label).join("/");
  for (const id of ["soprano-sax", "alto-sax", "tenor-sax", "bari-sax"]) assert.equal(lab(id), "Learn/Challenge", id);
  for (const id of ["oboe", "cor-anglais"]) assert.equal(lab(id), "Front/Left", id);
  for (const id of ["flute", "clarinet", "bassoon", "diatonic-harmonica"]) assert.equal(lab(id), "Chart/Tune", id);
  assert.equal(lab("chromatic-harmonica"), "Slide out/Slide in");
  assert.equal(lab("vocal"), "Graph/Warm-ups");
  assert.equal(lab("guitar"), "Tuner/Chords");
});

test("a seat that opens the tuner never claims to be the current view", () => {
  const seats = contextSeatsFor("sax", INSTRUMENTS.flute);
  const opens = seats.filter((seat) => seat.opens);
  assert.deepEqual(opens.map((seat) => seat.opens), ["tune"]);
});

test("the stored map round-trips", () => {
  const map = { pulse: "sequences", analyze: "spectrum", "lab:sax": "challenge", practice: "log" };
  assert.deepEqual(sanitiseContextSeats(serialiseContextSeats(map)), map);
  assert.deepEqual(parseContextSeats(serialiseContextSeats(map)), map);
  assert.equal(parseContextSeats(null), undefined);
  assert.deepEqual(sanitiseContextSeats(serialiseContextSeats({})), {});
});

test("the sanitiser drops unknown keys, non-string values and views a workspace does not have", () => {
  assert.deepEqual(
    sanitiseContextSeats({
      pulse: "sequences",
      nonsense: "metronome",
      analyze: 3,
      practice: null,
      "lab:sax": "orbit",
      "lab:vocal": ["graph"],
      "tune:view": "tone",
    }),
    { pulse: "sequences", "tune:view": "tone" },
  );
  assert.deepEqual(sanitiseContextSeats("{not json"), {});
  assert.deepEqual(sanitiseContextSeats("[]"), {});
  assert.deepEqual(sanitiseContextSeats("null"), {});
  assert.deepEqual(sanitiseContextSeats(undefined), {});
  assert.deepEqual(sanitiseContextSeats(7), {});
  // The analysis workspace can be on a view the pill has no seat for.
  assert.deepEqual(sanitiseContextSeats({ analyze: "harmonics" }), { analyze: "harmonics" });
  // __proto__ is not a workspace.
  assert.deepEqual(sanitiseContextSeats(JSON.parse('{"__proto__":"pulse"}')), {});
});

test("a workspace opens on its left seat unless a valid seat is stored", () => {
  assert.equal(resolveContextSeat("pulse", {}), "metronome");
  assert.equal(resolveContextSeat("pulse", { pulse: "sequences" }), "sequences");
  assert.equal(resolveContextSeat("pulse", { pulse: "bogus" }), "metronome");
  assert.equal(resolveContextSeat("analyze", { analyze: "spectrogram" }), "spectrogram");
  for (const key of CONTEXT_SEAT_KEYS) assert.equal(resolveContextSeat(key, {}), defaultContextSeat(key), key);
});

test("every storable key belongs to a workspace some instrument can reach", () => {
  const reachable = new Set();
  for (const mode of WORKSPACE_MODES) for (const instrument of Object.values(INSTRUMENTS)) reachable.add(contextKeyFor(mode, instrument));
  for (const key of CONTEXT_SEAT_KEYS) assert.ok(reachable.has(key), `${key} is reachable`);
  for (const key of reachable) assert.ok(key === "tune:pitch" || CONTEXT_SEAT_KEYS.includes(key), `${key} can be stored`);
});
