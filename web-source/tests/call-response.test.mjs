// The play-along drill's logic: thresholds, timing, the state machine, and
// how an attempt is matched to a phrase. Pure, so it runs under plain Node
// with synthetic pitch frames and no microphone.
import assert from "node:assert/strict";
import test from "node:test";

// exercise-library.ts (pulled in by call-response-sources.ts) guards its
// storage use behind `typeof window`, and takes-store.ts only touches
// window/File inside function bodies this suite never calls.
globalThis.localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
globalThis.window = { dispatchEvent: () => true, bocalHost: undefined };

const {
  BUNDLED_PHRASES,
  DEFAULT_CALL_SETTINGS,
  INITIAL_MACHINE,
  LISTEN_FACTOR,
  THRESHOLDS,
  autoActionAfterResult,
  isRoundOpen,
  micRequestFailed,
  nextState,
  notesNeeded,
  octaveShiftToFit,
  parseCallSettings,
  passFraction,
  phaseAt,
  phraseTiming,
  resultSummary,
  sanitizePhrase,
  scoreAttempt,
  segmentAttempt,
  serializeCallSettings,
  showsResult,
  thresholdBand,
  transposePhrase,
} = await import("../app/call-response.ts");
const { INSTRUMENTS } = await import("../app/instruments.ts");
const { BUILT_IN_EXERCISES } = await import("../app/exercise-library.ts");
const { buildPhraseGroups, exerciseToPhrase } = await import("../app/call-response-sources.ts");

const FRAME_MS = 30;

/** A pitch (fractional MIDI) as the tuner reports it: nearest semitone plus cents. */
const pitch = (value) => ({ midi: Math.round(value), cents: (value - Math.round(value)) * 100 });

/**
 * Frames for a performance: `{ p, ms }` is a steady note of pitch `p` for `ms`
 * milliseconds, `{ gap: ms }` is silence. Readings arrive every 30 ms.
 */
function perform(parts, startMs = 5000) {
  const frames = [];
  let t = startMs;
  for (const part of parts) {
    const count = Math.round((part.ms || part.gap) / FRAME_MS);
    for (let i = 0; i < count; i += 1) {
      frames.push(part.gap ? { tMs: t, midi: null, cents: null } : { tMs: t, ...pitch(part.p) });
      t += FRAME_MS;
    }
  }
  return frames;
}

/** Sings each pitch for 800 ms with 200 ms between, which is plenty of a 1-beat note at 60 bpm. */
const sing = (pitches, hold = 800) => perform(pitches.flatMap((p) => [{ p, ms: hold }, { gap: 200 }]));

// A five-note phrase at 60 bpm: one second per note, so a note needs 600 ms held.
const PHRASE = {
  id: "t-scale",
  name: "Test scale",
  tempoBpm: 60,
  notes: [60, 62, 64, 65, 67].map((midi) => ({ midi, beats: 1 })),
};
const NOTES = [60, 62, 64, 65, 67];

// -- Threshold arithmetic -----------------------------------------------------------

test("the three thresholds are Bocal's own bands and pass fractions", () => {
  assert.deepEqual(["lenient", "standard", "strict"].map(thresholdBand), [25, 15, 8]);
  assert.deepEqual(["lenient", "standard", "strict"].map(passFraction), [0.6, 0.8, 1]);
  assert.equal(THRESHOLDS.lenient.label, "Lenient");
});

test("notesNeeded rounds up and never reads 5 x 0.6 as four", () => {
  assert.equal(notesNeeded(5, "lenient"), 3);
  assert.equal(notesNeeded(5, "standard"), 4);
  assert.equal(notesNeeded(5, "strict"), 5);
  assert.equal(notesNeeded(3, "standard"), 3);
  assert.equal(notesNeeded(10, "standard"), 8);
  assert.equal(notesNeeded(10, "lenient"), 6);
  assert.equal(notesNeeded(1, "lenient"), 1);
  assert.equal(notesNeeded(0, "strict"), 0);
});

test("a note a little out of tune passes a wide band and fails a narrow one", () => {
  const at = (cents) => sing(NOTES.map((n) => n + cents / 100));
  // +20 cents: inside lenient (25), outside standard (15).
  assert.equal(scoreAttempt(PHRASE, at(20), "lenient").passed, true);
  assert.equal(scoreAttempt(PHRASE, at(20), "standard").passed, false);
  // +10 cents: inside standard, outside strict (8).
  assert.equal(scoreAttempt(PHRASE, at(10), "standard").passed, true);
  assert.equal(scoreAttempt(PHRASE, at(10), "strict").passed, false);
  // -6 cents: inside every band, and flat counts the same as sharp.
  assert.equal(scoreAttempt(PHRASE, at(-6), "strict").passed, true);
  assert.equal(scoreAttempt(PHRASE, at(-20), "lenient").passed, true);
  assert.equal(scoreAttempt(PHRASE, at(-20), "standard").passed, false);
});

// -- Timing -------------------------------------------------------------------------

test("the round is the phrase, one beat of count-in, then phrase length x 1.5 of listening", () => {
  const timing = phraseTiming(PHRASE);
  assert.equal(timing.beatSec, 1);
  assert.equal(timing.phraseSec, 5);
  assert.equal(timing.countInSec, 1);
  assert.equal(timing.listenStartSec, 6);
  assert.equal(LISTEN_FACTOR, 1.5);
  assert.equal(timing.listenSec, 7.5);
  assert.equal(timing.endSec, 13.5);
  assert.deepEqual(timing.notes.map((note) => note.startSec), [0, 1, 2, 3, 4]);
  assert.ok(timing.notes.every((note) => note.soundingSec < note.durationSec), "equal notes in a row stay separate notes");
});

test("timing follows tempo and beats", () => {
  const timing = phraseTiming({ ...PHRASE, tempoBpm: 120, notes: [{ midi: 60, beats: 2 }, { midi: 62, beats: 1 }] });
  assert.equal(timing.beatSec, 0.5);
  assert.equal(timing.phraseSec, 1.5);
  assert.equal(timing.listenStartSec, 2);
  assert.equal(timing.listenSec, 2.25);
  assert.deepEqual(timing.notes.map((note) => note.durationSec), [1, 0.5]);
});

test("phaseAt names the phase and the sounding note", () => {
  const timing = phraseTiming(PHRASE);
  assert.deepEqual(phaseAt(timing, -0.2), { phase: "phrase", noteIndex: null });
  assert.deepEqual(phaseAt(timing, 0.5), { phase: "phrase", noteIndex: 0 });
  assert.deepEqual(phaseAt(timing, 3.2), { phase: "phrase", noteIndex: 3 });
  assert.deepEqual(phaseAt(timing, 5.5), { phase: "count-in", noteIndex: null });
  assert.deepEqual(phaseAt(timing, 6), { phase: "listen", noteIndex: null });
  assert.deepEqual(phaseAt(timing, 13.49), { phase: "listen", noteIndex: null });
  assert.deepEqual(phaseAt(timing, 13.5), { phase: "done", noteIndex: null });
});

test("a phrase with a silly tempo or length is made playable", () => {
  const clean = sanitizePhrase({ id: "x", name: "x", tempoBpm: 5000, notes: Array.from({ length: 40 }, () => ({ midi: 60.4, beats: 99 })) });
  assert.equal(clean.tempoBpm, 240);
  assert.equal(clean.notes.length, 16);
  assert.equal(clean.notes[0].midi, 60);
  assert.equal(clean.notes[0].beats, 8);
});

// -- The state machine ----------------------------------------------------------------

const CONFIG = { phraseCount: 3, tries: 3, autoAdvance: false };

test("a round runs idle, playing, listening, scored", () => {
  let machine = INITIAL_MACHINE;
  assert.equal(machine.state, "idle");
  machine = nextState(machine, { type: "start" }, CONFIG);
  assert.deepEqual([machine.state, machine.attempt], ["playing", 1]);
  assert.equal(isRoundOpen(machine), true);
  machine = nextState(machine, { type: "phraseEnded" }, CONFIG);
  assert.equal(machine.state, "listening");
  machine = nextState(machine, { type: "listenEnded", matched: true }, CONFIG);
  assert.deepEqual([machine.state, machine.matched], ["scored", true]);
  assert.equal(showsResult(machine), true);
  assert.equal(isRoundOpen(machine), false);
});

test("again repeats the phrase and counts the try; next moves on and starts over", () => {
  const scored = { state: "scored", phraseIndex: 1, attempt: 2, matched: false };
  const again = nextState(scored, { type: "again" }, CONFIG);
  assert.deepEqual(again, { state: "playing", phraseIndex: 1, attempt: 3, matched: null });
  const next = nextState(scored, { type: "next" }, CONFIG);
  assert.deepEqual(next, { state: "playing", phraseIndex: 2, attempt: 1, matched: null });
  const wrapped = nextState({ ...scored, phraseIndex: 2 }, { type: "next" }, CONFIG);
  assert.equal(wrapped.phraseIndex, 0, "after the last phrase it goes back to the first");
});

test("events that do not fit the state change nothing", () => {
  assert.equal(nextState(INITIAL_MACHINE, { type: "phraseEnded" }, CONFIG), INITIAL_MACHINE);
  assert.equal(nextState(INITIAL_MACHINE, { type: "listenEnded", matched: true }, CONFIG), INITIAL_MACHINE);
  assert.equal(nextState(INITIAL_MACHINE, { type: "again" }, CONFIG), INITIAL_MACHINE);
  assert.equal(nextState(INITIAL_MACHINE, { type: "next" }, CONFIG), INITIAL_MACHINE);
  const playing = nextState(INITIAL_MACHINE, { type: "start" }, CONFIG);
  assert.equal(nextState(playing, { type: "start" }, CONFIG), playing, "a double tap on Start is ignored");
  assert.equal(nextState(playing, { type: "listenEnded", matched: true }, CONFIG), playing, "cannot be marked before listening opens");
  assert.equal(nextState(playing, { type: "again" }, CONFIG), playing);
});

test("cancel drops a round in flight without counting it, and choosing a phrase resets", () => {
  const playing = nextState(INITIAL_MACHINE, { type: "start" }, CONFIG);
  assert.deepEqual(nextState(playing, { type: "cancel" }, CONFIG), { ...INITIAL_MACHINE, state: "idle", attempt: 0 });
  const scored = { state: "scored", phraseIndex: 0, attempt: 2, matched: true };
  assert.equal(nextState(scored, { type: "cancel" }, CONFIG).attempt, 2, "a finished round still counts");
  assert.deepEqual(nextState(scored, { type: "choose", phraseIndex: 2 }, CONFIG), { state: "idle", phraseIndex: 2, attempt: 0, matched: null });
  assert.equal(nextState(scored, { type: "choose", phraseIndex: 99 }, CONFIG).phraseIndex, 2, "clamped to the last phrase");
});

test("auto-advance: matched moves on, not yet repeats until the tries run out", () => {
  const auto = { ...CONFIG, autoAdvance: true };
  assert.equal(autoActionAfterResult({ state: "scored", phraseIndex: 0, attempt: 1, matched: true }, auto), "advance");
  assert.equal(autoActionAfterResult({ state: "scored", phraseIndex: 0, attempt: 1, matched: false }, auto), "repeat");
  assert.equal(autoActionAfterResult({ state: "scored", phraseIndex: 0, attempt: 2, matched: false }, auto), "repeat");
  assert.equal(autoActionAfterResult({ state: "scored", phraseIndex: 0, attempt: 3, matched: false }, auto), "advance");
  assert.equal(autoActionAfterResult({ state: "scored", phraseIndex: 0, attempt: 1, matched: true }, CONFIG), "wait", "off means the player decides");
  assert.equal(autoActionAfterResult({ state: "listening", phraseIndex: 0, attempt: 1, matched: null }, auto), "wait");
});

// -- Matching an attempt to a phrase ----------------------------------------------------

test("singing the phrase in tune matches every note", () => {
  const result = scoreAttempt(PHRASE, sing(NOTES), "strict");
  assert.equal(result.matched, 5);
  assert.equal(result.total, 5);
  assert.equal(result.passed, true);
  assert.ok(result.notes.every((note) => note.verdict === "matched"));
  assert.deepEqual(result.notes.map((note) => note.heardIndex), [0, 1, 2, 3, 4]);
});

test("silence, or a different tune, does not match", () => {
  const silent = scoreAttempt(PHRASE, perform([{ gap: 3000 }]), "lenient");
  assert.equal(silent.matched, 0);
  assert.equal(silent.passed, false);
  assert.equal(scoreAttempt(PHRASE, [], "lenient").passed, false);
  const wrong = scoreAttempt(PHRASE, sing([61, 63, 66, 68, 70]), "lenient");
  assert.equal(wrong.matched, 0);
  assert.equal(wrong.passed, false);
});

test("a missed note is a miss and the notes after it still find theirs", () => {
  // 60 62 _ 65 67: the 64 is never sung.
  const result = scoreAttempt(PHRASE, sing([60, 62, 65, 67]), "standard");
  assert.deepEqual(result.notes.map((note) => note.verdict), ["matched", "matched", "missed", "matched", "matched"]);
  assert.equal(result.matched, 4);
  assert.equal(result.passed, true, "4 of 5 meets the standard 80%");
  assert.equal(scoreAttempt(PHRASE, sing([60, 62, 65, 67]), "strict").passed, false, "strict wants all five");
});

test("notes out of order are not matched in the wrong place", () => {
  // 60 64 62 65 67: the 62 and the 64 swap.
  const swapped = scoreAttempt(PHRASE, sing([60, 64, 62, 65, 67]), "standard");
  assert.deepEqual(swapped.notes.map((note) => note.verdict), ["matched", "matched", "missed", "matched", "matched"]);
  assert.equal(swapped.matched, 4);
  assert.equal(scoreAttempt(PHRASE, sing([60, 64, 62, 65, 67]), "strict").passed, false);
  // The whole phrase backwards finds only one note in order.
  const reversed = scoreAttempt(PHRASE, sing([67, 65, 64, 62, 60]), "lenient");
  assert.equal(reversed.matched, 1);
  assert.equal(reversed.passed, false);
});

test("the right note in the wrong octave is rejected, and said to be an octave off", () => {
  const down = scoreAttempt(PHRASE, sing(NOTES.map((n) => n - 12)), "lenient");
  assert.equal(down.matched, 0);
  assert.equal(down.passed, false);
  assert.ok(down.notes.every((note) => note.verdict === "octave"));
  const up = scoreAttempt(PHRASE, sing(NOTES.map((n) => n + 12)), "lenient");
  assert.ok(up.notes.every((note) => note.verdict === "octave"));
  // One note an octave low among good ones: that note alone is the miss.
  const one = scoreAttempt(PHRASE, sing([60, 62, 52, 65, 67]), "standard");
  assert.deepEqual(one.notes.map((note) => note.verdict), ["matched", "matched", "octave", "matched", "matched"]);
  assert.equal(one.passed, true);
  assert.match(resultSummary(down), /another octave/);
});

test("an extra sung note is ignored", () => {
  const extra = scoreAttempt(PHRASE, sing([60, 62, 70, 64, 65, 67]), "strict");
  assert.equal(extra.matched, 5);
  assert.equal(extra.passed, true);
  assert.equal(extra.heard.length, 6);
  const leading = scoreAttempt(PHRASE, sing([55, 60, 62, 64, 65, 67]), "strict");
  assert.equal(leading.passed, true, "a note sung before the phrase does not spoil it");
});

test("a note held for less than 60% of its written length is not matched", () => {
  // 1 beat at 60 bpm is 1000 ms; 600 ms is the shortest that counts.
  const short = perform([{ p: 60, ms: 480 }, { gap: 200 }, { p: 62, ms: 800 }, { gap: 200 }, { p: 64, ms: 800 }, { gap: 200 }, { p: 65, ms: 800 }, { gap: 200 }, { p: 67, ms: 800 }]);
  const result = scoreAttempt(PHRASE, short, "strict");
  assert.equal(result.notes[0].verdict, "missed");
  assert.equal(result.matched, 4);
  const enough = perform([{ p: 60, ms: 660 }, { gap: 200 }, ...[62, 64, 65, 67].flatMap((p) => [{ p, ms: 800 }, { gap: 200 }])]);
  assert.equal(scoreAttempt(PHRASE, enough, "strict").passed, true);
});

test("timing is never judged: late, early, rushed, dragged or held long all match", () => {
  const late = perform([{ gap: 2500 }, ...NOTES.flatMap((p) => [{ p, ms: 800 }, { gap: 200 }])]);
  const rushed = perform(NOTES.flatMap((p) => [{ p, ms: 700 }, { gap: 30 }]));
  const dragged = perform(NOTES.flatMap((p) => [{ p, ms: 1800 }, { gap: 900 }]));
  const uneven = perform([{ p: 60, ms: 3000 }, { gap: 100 }, { p: 62, ms: 650 }, { gap: 1500 }, { p: 64, ms: 900 }, { gap: 60 }, { p: 65, ms: 2000 }, { gap: 300 }, { p: 67, ms: 700 }]);
  for (const frames of [late, rushed, dragged, uneven]) {
    assert.equal(scoreAttempt(PHRASE, frames, "strict").passed, true);
  }
});

test("a held note with a one-frame dropout is still one note", () => {
  const frames = perform([{ p: 60, ms: 420 }, { gap: 60 }, { p: 60, ms: 420 }]);
  const heard = segmentAttempt(frames);
  assert.equal(heard.length, 1);
  assert.equal(heard[0].midi, 60);
  // A real pause between two notes of the same pitch is two notes.
  assert.equal(segmentAttempt(perform([{ p: 60, ms: 420 }, { gap: 300 }, { p: 60, ms: 420 }])).length, 2);
});

test("a stray run shorter than the stable-note minimum is not a note", () => {
  const frames = perform([{ p: 60, ms: 90 }, { gap: 300 }, { p: 62, ms: 600 }]);
  const heard = segmentAttempt(frames);
  assert.deepEqual(heard.map((note) => note.midi), [62]);
});

test("a matched note reports how far off it sat", () => {
  const result = scoreAttempt(PHRASE, sing(NOTES.map((n) => n + 0.12)), "standard");
  for (const note of result.notes) assert.ok(Math.abs(note.centsOff - 12) < 0.5, `centsOff ${note.centsOff}`);
});

test("the summary says matched or not yet, and what was needed", () => {
  const pass = resultSummary(scoreAttempt(PHRASE, sing(NOTES), "standard"));
  assert.match(pass, /5 of 5 notes matched\. Matched\./);
  const fail = resultSummary(scoreAttempt(PHRASE, sing([60, 62]), "standard"));
  assert.match(fail, /2 of 5 notes matched; 4 needed at standard\. Not yet\./);
  assert.doesNotMatch(pass + fail, /score|grade|mark/i);
});

test("every bundled phrase can be matched by singing it", () => {
  assert.equal(BUNDLED_PHRASES.length, 3);
  assert.deepEqual(BUNDLED_PHRASES.map((phrase) => phrase.name), ["Five-note scale", "Arpeggio", "Descending fifth"]);
  for (const phrase of BUNDLED_PHRASES) {
    const beatMs = (60 / phrase.tempoBpm) * 1000;
    const frames = perform(phrase.notes.flatMap((note) => [{ p: note.midi, ms: Math.round(note.beats * beatMs * 0.9) }, { gap: 150 }]));
    assert.equal(scoreAttempt(phrase, frames, "strict").passed, true, phrase.name);
  }
});

// -- Transposition ---------------------------------------------------------------------

test("an alto sax reads the phrase nine semitones up, a clarinet two", () => {
  assert.equal(INSTRUMENTS["alto-sax"].writtenOffset, 9);
  assert.equal(INSTRUMENTS.clarinet.writtenOffset, 2);
  const alto = transposePhrase(PHRASE, INSTRUMENTS["alto-sax"].writtenOffset);
  assert.deepEqual(alto.notes.map((note) => note.midi), [69, 71, 73, 74, 76]);
  const clarinet = transposePhrase(PHRASE, INSTRUMENTS.clarinet.writtenOffset);
  assert.deepEqual(clarinet.notes.map((note) => note.midi), [62, 64, 66, 67, 69]);
  assert.deepEqual(alto.notes.map((note) => note.beats), PHRASE.notes.map((note) => note.beats));
  assert.equal(alto.tempoBpm, PHRASE.tempoBpm);
  assert.equal(alto.id, PHRASE.id);
});

test("written and concert pitch round-trip for every instrument", () => {
  for (const instrument of Object.values(INSTRUMENTS)) {
    const written = transposePhrase(PHRASE, instrument.writtenOffset);
    const concert = transposePhrase(written, -instrument.writtenOffset);
    assert.deepEqual(concert, PHRASE, instrument.id);
  }
  assert.deepEqual(transposePhrase(PHRASE, 0), PHRASE, "voice, flute, harmonica and guitar are not moved");
  assert.notEqual(transposePhrase(PHRASE, 9), PHRASE, "a new phrase, not the same object");
  assert.equal(PHRASE.notes[0].midi, 60, "the original is left alone");
});

test("a phrase is judged in concert pitch: the sounding note is what the microphone hears", () => {
  // An alto player reads A4 for the concert C4 the microphone hears.
  const written = transposePhrase(PHRASE, 9);
  assert.equal(written.notes[0].midi, 69);
  assert.equal(scoreAttempt(PHRASE, sing(NOTES), "strict").passed, true);
  // The same frames judged against the written phrase are an octave-and-a-bit off.
  assert.equal(scoreAttempt(written, sing(NOTES), "lenient").passed, false);
});

test("octaveShiftToFit seats a phrase inside an instrument's range, a whole octave at a time", () => {
  assert.equal(octaveShiftToFit(PHRASE, 40, 90) % 12, 0);
  const high = octaveShiftToFit(PHRASE, 72, 100);
  assert.ok(high > 0 && high % 12 === 0);
  const seated = transposePhrase(PHRASE, high).notes.map((note) => note.midi);
  assert.ok(Math.min(...seated) >= 72 && Math.max(...seated) <= 100);
  const low = octaveShiftToFit(PHRASE, 30, 63);
  assert.ok(low < 0);
  assert.equal(octaveShiftToFit(PHRASE, 60, 61), 0, "a range too narrow to hold it leaves it alone");
});

test("a waiting-for-permission message is progress, anything else is a failed start", () => {
  assert.equal(micRequestFailed(""), false);
  assert.equal(micRequestFailed("Waiting for microphone permission. Tap the tuner button again to cancel."), false);
  assert.equal(micRequestFailed("Microphone permission is needed for live tuning."), true);
  assert.equal(micRequestFailed("No microphone was found on this device."), true);
});

// -- Saved settings --------------------------------------------------------------------

test("settings round-trip and bad values fall back to the defaults", () => {
  const custom = { threshold: "strict", autoAdvance: true, tries: 4, phraseId: "call-arpeggio", octave: -1 };
  assert.deepEqual(parseCallSettings(serializeCallSettings(custom)), custom);
  assert.equal(parseCallSettings(null), undefined);
  assert.equal(parseCallSettings("not json"), undefined);
  assert.equal(parseCallSettings("7"), undefined);
  assert.deepEqual(parseCallSettings(JSON.stringify({ threshold: "brutal", tries: 99, octave: 5, autoAdvance: "yes" })), {
    ...DEFAULT_CALL_SETTINGS,
    tries: 5,
  });
});

// -- Phrase sources ----------------------------------------------------------------------

test("saved exercises become phrases, one beat a note at the exercise's tempo", () => {
  const longTones = BUILT_IN_EXERCISES.find((exercise) => exercise.id === "builtin-long-tones");
  const phrase = exerciseToPhrase(longTones);
  assert.equal(phrase.id, "exercise:builtin-long-tones");
  assert.equal(phrase.name, "Long tones");
  assert.equal(phrase.tempoBpm, 40);
  assert.deepEqual(phrase.notes.map((note) => note.midi), [60, 62, 64, 65, 67]);
  const scale = exerciseToPhrase(BUILT_IN_EXERCISES.find((exercise) => exercise.id === "builtin-major-scale-by-fifths"));
  assert.equal(scale.notes.length, 8, "a long pattern is cut to eight notes");
  assert.equal(scale.notes[0].midi, 60);
});

test("a saved exercise is placed exactly where the exercise player places it (root plus its offset)", () => {
  const exercise = { ...BUILT_IN_EXERCISES.find((item) => item.id === "builtin-major-scale-by-fifths"), rootMidi: 69, writtenOffset: 9 };
  assert.equal(exerciseToPhrase(exercise).notes[0].midi, 78);
});

test("the harmonic series is not offered, because its partials are not equal-tempered notes", () => {
  const series = BUILT_IN_EXERCISES.find((exercise) => exercise.pattern === "harmonic-series");
  assert.equal(exerciseToPhrase(series), null);
});

test("phrase groups: bundled first, supplied next, then saved exercises, with unique ids", () => {
  const supplied = [
    { id: "melody-1", name: "Melody one", tempoBpm: 90, notes: [{ midi: 67, beats: 1 }, { midi: 69, beats: 2 }] },
    { id: "call-arpeggio", name: "A clash with a bundled id", tempoBpm: 90, notes: [{ midi: 60, beats: 1 }] },
    { id: "empty", name: "No notes", tempoBpm: 90, notes: [] },
  ];
  const groups = buildPhraseGroups(supplied, BUILT_IN_EXERCISES, "Melodies");
  assert.deepEqual(groups.map((group) => group.id), ["bundled", "supplied", "exercises"]);
  assert.deepEqual(groups[1].phrases.map((phrase) => phrase.id), ["melody-1"]);
  assert.equal(groups[1].label, "Melodies");
  const ids = groups.flatMap((group) => group.phrases.map((phrase) => phrase.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(groups[2].phrases.every((phrase) => phrase.id.startsWith("exercise:")));
  assert.deepEqual(buildPhraseGroups([], [], "Melodies").map((group) => group.id), ["bundled"]);
});
