// Play-along: a teacher's "repeat after me" drill. A short phrase sounds, a
// one-beat count-in follows, then Bocal listens to the singer or player and
// says which of the phrase's notes it heard, in order.
//
// This file is the whole of the drill's logic and nothing else: no DOM, no
// audio, no React, no timers. The component (CallAndResponse.tsx) feeds the
// numbers computed here to the AudioContext clock and hands the pitch frames
// it collected back to `scoreAttempt`. Everything is exercised under Node by
// tests/call-response.test.mjs.
//
// What the drill judges, and what it does not
//   * Pitch and order. Each expected note is matched, in order, to a steady
//     note the player produced. Timing is never judged: a note may start
//     early, late, or be held longer than written.
//   * The thresholds (lenient, standard, strict) are Bocal's own choices of a
//     pitch band and a share of notes to match. They are not taken from an
//     exam board or a teaching method.
//   * Pitch is judged in concert pitch (what sounds), because that is what
//     the microphone hears. A transposing instrument is shown the phrase in
//     written pitch; `transposePhrase` does that conversion both ways.
//   * The outcome is "matched" or "not yet". It is never a mark.

import type { Melody } from "./melody-line";
import { median } from "./music-math";
import { detectStableSegments, type PitchHistorySample } from "./pitch-history";

/**
 * A phrase to repeat: the melody line's shape (`melody-line.ts`) without its
 * `source` tag, so a bundled or user melody is a phrase as it is. `midi` is
 * concert pitch (what sounds); `beats` is each note's length in beats.
 */
export type CallPhrase = Pick<Melody, "id" | "name" | "tempoBpm" | "notes">;

// -- Thresholds -------------------------------------------------------------------

export type ThresholdId = "lenient" | "standard" | "strict";

export const THRESHOLD_IDS: ThresholdId[] = ["lenient", "standard", "strict"];

type ThresholdDef = { label: string; bandCents: number; passFraction: number };

/** Bocal's own settings: how close a note must be, and what share of the notes must be matched. */
export const THRESHOLDS: Record<ThresholdId, ThresholdDef> = {
  lenient: { label: "Lenient", bandCents: 25, passFraction: 0.6 },
  standard: { label: "Standard", bandCents: 15, passFraction: 0.8 },
  strict: { label: "Strict", bandCents: 8, passFraction: 1 },
};

export const DEFAULT_THRESHOLD: ThresholdId = "standard";

/** Half-width, in cents, of the band a note must sit inside to be matched. */
export function thresholdBand(threshold: ThresholdId): number {
  return THRESHOLDS[threshold].bandCents;
}

/** Share of the phrase's notes that must be matched for the attempt to count as matched. */
export function passFraction(threshold: ThresholdId): number {
  return THRESHOLDS[threshold].passFraction;
}

/** How many notes must be matched out of `total`; the tiny epsilon keeps 5 x 0.6 from rounding up to 4. */
export function notesNeeded(total: number, threshold: ThresholdId): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(1, Math.ceil(total * passFraction(threshold) - 1e-9)));
}

export function isThresholdId(value: unknown): value is ThresholdId {
  return value === "lenient" || value === "standard" || value === "strict";
}

/** A note counts only if the player held it for at least this share of the written length. */
export const MIN_HOLD_FRACTION = 0.6;
/** A held note interrupted for less than this (a dropped frame or two) is still one note. */
export const MERGE_GAP_MS = 120;
/** Frame spacing assumed when a recording is too short to measure one. The tuner samples about every 30 ms. */
export const DEFAULT_FRAME_MS = 30;

// -- Repeats ----------------------------------------------------------------------

export const MIN_TRIES = 1;
export const MAX_TRIES = 5;
export const DEFAULT_TRIES = 3;

export function clampTries(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TRIES;
  return Math.min(MAX_TRIES, Math.max(MIN_TRIES, Math.round(value)));
}

// -- Phrases ----------------------------------------------------------------------

export const MIN_TEMPO_BPM = 30;
export const MAX_TEMPO_BPM = 240;
export const MAX_PHRASE_NOTES = 16;

/** Three phrases of Bocal's own, in concert pitch, so the drill works before any other source is wired in. */
export const BUNDLED_PHRASES: CallPhrase[] = [
  {
    id: "call-five-note-scale",
    name: "Five-note scale",
    tempoBpm: 72,
    notes: [60, 62, 64, 65, 67].map((midi) => ({ midi, beats: 1 })),
  },
  {
    id: "call-arpeggio",
    name: "Arpeggio",
    tempoBpm: 76,
    notes: [
      { midi: 60, beats: 1 },
      { midi: 64, beats: 1 },
      { midi: 67, beats: 1 },
      { midi: 64, beats: 1 },
      { midi: 60, beats: 2 },
    ],
  },
  {
    id: "call-descending-fifth",
    name: "Descending fifth",
    tempoBpm: 72,
    notes: [
      { midi: 67, beats: 1 },
      { midi: 65, beats: 1 },
      { midi: 64, beats: 1 },
      { midi: 62, beats: 1 },
      { midi: 60, beats: 2 },
    ],
  },
];

/** Keeps a phrase playable: sane tempo, a bounded count of notes, whole MIDI numbers, beats between a quarter and eight. */
export function sanitizePhrase(phrase: CallPhrase): CallPhrase {
  const tempoBpm = Number.isFinite(phrase.tempoBpm)
    ? Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, phrase.tempoBpm))
    : 80;
  const notes = phrase.notes
    .filter((note) => Number.isFinite(note.midi))
    .slice(0, MAX_PHRASE_NOTES)
    .map((note) => ({
      midi: Math.round(Math.min(127, Math.max(0, note.midi))),
      beats: Number.isFinite(note.beats) ? Math.min(8, Math.max(0.25, note.beats)) : 1,
    }));
  return { id: phrase.id, name: phrase.name, tempoBpm, notes };
}

/**
 * Moves every note by `semitones`. Phrases are stored in concert pitch, so
 * `transposePhrase(phrase, instrument.writtenOffset)` is the phrase as the
 * player reads it (alto sax +9, clarinet +2) and
 * `transposePhrase(written, -instrument.writtenOffset)` brings it back.
 */
export function transposePhrase(phrase: CallPhrase, semitones: number): CallPhrase {
  const shift = Math.round(semitones);
  return { ...phrase, notes: phrase.notes.map((note) => ({ midi: note.midi + shift, beats: note.beats })) };
}

/**
 * The whole-octave shift (in semitones) that seats a phrase inside
 * [lowMidi, highMidi], preferring the seat nearest the lower middle of the
 * range, where most players are comfortable. 0 when the phrase already fits
 * or no octave shift can make it fit.
 */
export function octaveShiftToFit(phrase: CallPhrase, lowMidi: number, highMidi: number): number {
  if (phrase.notes.length === 0 || !(highMidi > lowMidi)) return 0;
  const midis = phrase.notes.map((note) => note.midi);
  const lowest = Math.min(...midis);
  const highest = Math.max(...midis);
  const target = lowMidi + (highMidi - lowMidi) * 0.4;
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let octaves = -4; octaves <= 4; octaves += 1) {
    const shift = octaves * 12;
    if (lowest + shift < lowMidi || highest + shift > highMidi) continue;
    const distance = Math.abs((lowest + highest) / 2 + shift - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = shift;
    }
  }
  return best === null ? 0 : best;
}

// -- Timing -----------------------------------------------------------------------

/** The listening window is the phrase length times this. */
export const LISTEN_FACTOR = 1.5;
/** Each note sounds for this share of its slot, so two equal notes in a row are two notes. */
export const SOUNDING_FRACTION = 0.9;

export type PhraseTiming = {
  beatSec: number;
  /** Each note's slot, in seconds from the start of the phrase. */
  notes: { startSec: number; durationSec: number; soundingSec: number }[];
  phraseSec: number;
  /** One beat of silence after the phrase, then it is the player's turn. */
  countInSec: number;
  /** When listening opens, from the start of the phrase. */
  listenStartSec: number;
  /** How long it listens. */
  listenSec: number;
  /** When the whole round is over, from the start of the phrase. */
  endSec: number;
};

export function phraseTiming(phrase: CallPhrase): PhraseTiming {
  const safe = sanitizePhrase(phrase);
  const beatSec = 60 / safe.tempoBpm;
  let cursor = 0;
  const notes = safe.notes.map((note) => {
    const durationSec = note.beats * beatSec;
    const entry = { startSec: cursor, durationSec, soundingSec: durationSec * SOUNDING_FRACTION };
    cursor += durationSec;
    return entry;
  });
  const phraseSec = cursor;
  const countInSec = beatSec;
  const listenStartSec = phraseSec + countInSec;
  const listenSec = phraseSec * LISTEN_FACTOR;
  return { beatSec, notes, phraseSec, countInSec, listenStartSec, listenSec, endSec: listenStartSec + listenSec };
}

export type RoundPhase = "phrase" | "count-in" | "listen" | "done";

/** Where a round is `elapsedSec` after its phrase began, and which written note is sounding then. */
export function phaseAt(timing: PhraseTiming, elapsedSec: number): { phase: RoundPhase; noteIndex: number | null } {
  if (elapsedSec < timing.phraseSec) {
    let noteIndex: number | null = null;
    for (let index = 0; index < timing.notes.length; index += 1) {
      if (elapsedSec >= timing.notes[index].startSec) noteIndex = index;
    }
    return { phase: "phrase", noteIndex };
  }
  if (elapsedSec < timing.listenStartSec) return { phase: "count-in", noteIndex: null };
  if (elapsedSec < timing.endSec) return { phase: "listen", noteIndex: null };
  return { phase: "done", noteIndex: null };
}

// -- Scoring ----------------------------------------------------------------------

/** One steady note the player produced. Pitches are concert-pitch MIDI numbers. */
export type AttemptNote = {
  /** Nearest semitone. */
  midi: number;
  /** Fractional MIDI pitch: the semitone plus the median cents. */
  pitch: number;
  startIndex: number;
  endIndex: number;
  startMs: number;
  endMs: number;
  /** Frames that carried a pitch. */
  count: number;
};

function framePitch(sample: PitchHistorySample): number | null {
  if (sample.midi === null || sample.cents === null) return null;
  return sample.midi + sample.cents / 100;
}

/** The spacing between readings, measured from the recording itself. */
export function frameIntervalMs(frames: PitchHistorySample[]): number {
  const gaps: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const gap = frames[index].tMs - frames[index - 1].tMs;
    if (gap > 0 && gap < 200) gaps.push(gap);
  }
  return gaps.length ? median(gaps) : DEFAULT_FRAME_MS;
}

/**
 * Cuts the listened frames into steady notes with the same stable-segment
 * detection the Tune view's staff uses (a run of at least five readings on
 * one semitone), then joins two runs on the same semitone that were only
 * split by a very short dropout.
 */
export function segmentAttempt(frames: PitchHistorySample[]): AttemptNote[] {
  const runs = detectStableSegments(frames);
  const merged: { midi: number; startIndex: number; endIndex: number }[] = [];
  for (const run of runs) {
    const last = merged.length ? merged[merged.length - 1] : null;
    if (last && last.midi === run.midi && frames[run.startIndex].tMs - frames[last.endIndex].tMs <= MERGE_GAP_MS) {
      last.endIndex = run.endIndex;
    } else {
      merged.push({ midi: run.midi, startIndex: run.startIndex, endIndex: run.endIndex });
    }
  }
  return merged.map((run) => {
    const cents: number[] = [];
    for (let index = run.startIndex; index <= run.endIndex; index += 1) {
      const sample = frames[index];
      if (sample.midi === run.midi && sample.cents !== null) cents.push(sample.cents);
    }
    return {
      midi: run.midi,
      pitch: run.midi + (cents.length ? median(cents) : 0) / 100,
      startIndex: run.startIndex,
      endIndex: run.endIndex,
      startMs: frames[run.startIndex].tMs,
      endMs: frames[run.endIndex].tMs,
      count: cents.length,
    };
  });
}

export type NoteVerdict = "matched" | "missed" | "octave";

export type NoteResult = {
  index: number;
  /** The expected note, concert pitch. */
  midi: number;
  verdict: NoteVerdict;
  /** Index into `ScoreResult.heard` of the note this was matched to, or null. */
  heardIndex: number | null;
  /** How far the matched note sat from the expected pitch, in cents (sharp positive), or null. */
  centsOff: number | null;
};

export type ScoreResult = {
  threshold: ThresholdId;
  bandCents: number;
  passFraction: number;
  notes: NoteResult[];
  heard: AttemptNote[];
  matched: number;
  total: number;
  needed: number;
  fraction: number;
  passed: boolean;
};

type Candidate = { deviation: number; inBandMs: number };

/** How far (cents) a heard note sits from `expectedMidi`, and how long its frames stayed inside the band. */
function measure(frames: PitchHistorySample[], note: AttemptNote, expectedMidi: number, band: number, frameMs: number): Candidate {
  let inBand = 0;
  for (let index = note.startIndex; index <= note.endIndex; index += 1) {
    const pitch = framePitch(frames[index]);
    if (pitch !== null && Math.abs((pitch - expectedMidi) * 100) <= band) inBand += 1;
  }
  return { deviation: (note.pitch - expectedMidi) * 100, inBandMs: inBand * frameMs };
}

/**
 * Scores one attempt. `frames` are the pitch readings heard during the
 * listening window, in concert pitch (`midi` + `cents` on each sample). The
 * phrase's notes are matched in order, greedily, to the steady notes found in
 * the frames:
 *   - a note is matched when the heard note's median pitch is inside the band
 *     of the expected pitch and it stayed inside the band for at least 60% of
 *     the written length;
 *   - an expected note with no such heard note is a miss, and later notes
 *     look for theirs after the last one that matched;
 *   - heard notes that match nothing are ignored;
 *   - the right note an octave out is a miss (marked "octave" so the screen
 *     can say so).
 * The attempt counts as matched when the share of matched notes reaches the
 * threshold's pass fraction. Timing is never looked at.
 */
export function scoreAttempt(phrase: CallPhrase, frames: PitchHistorySample[], threshold: ThresholdId): ScoreResult {
  const safe = sanitizePhrase(phrase);
  const band = thresholdBand(threshold);
  const heard = segmentAttempt(frames);
  const frameMs = frameIntervalMs(frames);
  const beatMs = (60 / safe.tempoBpm) * 1000;

  let cursor = 0;
  const notes: NoteResult[] = safe.notes.map((expected, index) => {
    const neededMs = expected.beats * beatMs * MIN_HOLD_FRACTION;
    let octaveAt: number | null = null;
    for (let at = cursor; at < heard.length; at += 1) {
      const exact = measure(frames, heard[at], expected.midi, band, frameMs);
      if (Math.abs(exact.deviation) <= band && exact.inBandMs >= neededMs) {
        cursor = at + 1;
        return { index, midi: expected.midi, verdict: "matched" as const, heardIndex: at, centsOff: exact.deviation };
      }
      if (octaveAt === null) {
        for (const octaves of [-2, -1, 1, 2]) {
          const shifted = measure(frames, heard[at], expected.midi + octaves * 12, band, frameMs);
          if (Math.abs(shifted.deviation) <= band && shifted.inBandMs >= neededMs) {
            octaveAt = at;
            break;
          }
        }
      }
    }
    if (octaveAt !== null) {
      cursor = octaveAt + 1;
      return { index, midi: expected.midi, verdict: "octave" as const, heardIndex: octaveAt, centsOff: null };
    }
    return { index, midi: expected.midi, verdict: "missed" as const, heardIndex: null, centsOff: null };
  });

  const total = notes.length;
  const matched = notes.filter((note) => note.verdict === "matched").length;
  const needed = notesNeeded(total, threshold);
  return {
    threshold,
    bandCents: band,
    passFraction: passFraction(threshold),
    notes,
    heard,
    matched,
    total,
    needed,
    fraction: total ? matched / total : 0,
    passed: total > 0 && matched >= needed,
  };
}

// -- The round's state machine ----------------------------------------------------

export type CallState = "idle" | "playing" | "listening" | "scored";

export type CallMachine = {
  state: CallState;
  /** Which phrase in the list is current. */
  phraseIndex: number;
  /** 1-based count of rounds begun on this phrase; 0 before the first. */
  attempt: number;
  /** Whether the latest scored round matched; null until one is scored. */
  matched: boolean | null;
};

export type CallConfig = {
  phraseCount: number;
  /** Rounds offered per phrase before auto-advance moves on. */
  tries: number;
  autoAdvance: boolean;
};

export type CallEvent =
  | { type: "start" }
  | { type: "phraseEnded" }
  | { type: "listenEnded"; matched: boolean }
  | { type: "again" }
  | { type: "next" }
  | { type: "choose"; phraseIndex: number }
  | { type: "cancel" };

export const INITIAL_MACHINE: CallMachine = { state: "idle", phraseIndex: 0, attempt: 0, matched: null };

/**
 * idle -> playing -> listening -> scored -> (again: playing | next: playing on
 * the following phrase). Events that make no sense in the current state leave
 * the machine as it was, so a late timer or a double tap cannot corrupt it.
 * `cancel` drops any round in flight back to idle; choosing another phrase
 * does the same and resets the attempt count.
 */
export function nextState(machine: CallMachine, event: CallEvent, config: CallConfig): CallMachine {
  const count = Math.max(1, config.phraseCount);
  switch (event.type) {
    case "start":
      if (machine.state !== "idle") return machine;
      return { ...machine, state: "playing", attempt: machine.attempt + 1, matched: null };
    case "phraseEnded":
      return machine.state === "playing" ? { ...machine, state: "listening" } : machine;
    case "listenEnded":
      return machine.state === "listening" ? { ...machine, state: "scored", matched: event.matched } : machine;
    case "again":
      if (machine.state !== "scored") return machine;
      return { ...machine, state: "playing", attempt: machine.attempt + 1, matched: null };
    case "next":
      if (machine.state !== "scored") return machine;
      return { state: "playing", phraseIndex: (machine.phraseIndex + 1) % count, attempt: 1, matched: null };
    case "choose":
      return { state: "idle", phraseIndex: Math.min(count - 1, Math.max(0, Math.round(event.phraseIndex))), attempt: 0, matched: null };
    case "cancel": {
      if (machine.state === "idle") return machine;
      // A round that never reached its result does not count as an attempt.
      const finished = machine.state === "scored";
      return { ...machine, state: "idle", attempt: finished ? machine.attempt : Math.max(0, machine.attempt - 1), matched: null };
    }
    default:
      return machine;
  }
}

export type AutoAction = "advance" | "repeat" | "wait";

/**
 * What a hands-free drill does once a round is scored. With auto-advance off
 * the player decides. With it on, a matched round moves to the next phrase;
 * an unmatched one is repeated until the tries for that phrase are used, and
 * then the drill moves on.
 */
export function autoActionAfterResult(machine: CallMachine, config: CallConfig): AutoAction {
  if (machine.state !== "scored" || !config.autoAdvance) return "wait";
  if (machine.matched) return "advance";
  return machine.attempt < config.tries ? "repeat" : "advance";
}

// -- Saved settings -----------------------------------------------------------------

export type CallSettings = {
  threshold: ThresholdId;
  autoAdvance: boolean;
  /** Rounds offered per phrase when auto-advance is on. */
  tries: number;
  /** The phrase last chosen; "" until one is. */
  phraseId: string;
  /** Whole octaves the phrase is moved from where it is written, -1, 0 or 1. */
  octave: -1 | 0 | 1;
};

export const DEFAULT_CALL_SETTINGS: CallSettings = {
  threshold: DEFAULT_THRESHOLD,
  autoAdvance: false,
  tries: DEFAULT_TRIES,
  phraseId: "",
  octave: 0,
};

/** Reads saved settings, keeping the default for anything missing or out of range; undefined when nothing is saved. */
export function parseCallSettings(raw: string | null): CallSettings | undefined {
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof CallSettings, unknown>> | null;
    if (!value || typeof value !== "object") return undefined;
    return {
      threshold: isThresholdId(value.threshold) ? value.threshold : DEFAULT_CALL_SETTINGS.threshold,
      autoAdvance: value.autoAdvance === true,
      tries: clampTries(Number(value.tries)),
      phraseId: typeof value.phraseId === "string" ? value.phraseId.slice(0, 80) : "",
      octave: value.octave === -1 || value.octave === 1 ? value.octave : 0,
    };
  } catch {
    return undefined;
  }
}

export function serializeCallSettings(settings: CallSettings): string {
  return JSON.stringify(settings);
}

// -- Names the screen uses ----------------------------------------------------------
//
// The play-along screen talks about a round being "matched" or "not yet" and
// never about marks, so it imports these names rather than the ones above.

export type RoundResult = ScoreResult;

/** `scoreAttempt` under the name the screen uses. */
export function judgeRound(phrase: CallPhrase, frames: PitchHistorySample[], threshold: ThresholdId): RoundResult {
  return scoreAttempt(phrase, frames, threshold);
}

/**
 * Whether the tuner's message means the microphone could not start. The tuner
 * also uses that message for "Waiting for microphone permission", which is
 * progress, not a failure.
 */
export function micRequestFailed(message: string): boolean {
  const text = message.trim();
  return text !== "" && !/^waiting for microphone/i.test(text);
}

/** A round has finished and its result is on screen. */
export function showsResult(machine: CallMachine): boolean {
  return machine.state === "scored";
}

/** A round is under way: the phrase or the listening window is open. */
export function isRoundOpen(machine: CallMachine): boolean {
  return machine.state === "playing" || machine.state === "listening";
}

/** A one-line summary of a scored round, in the drill's own words. */
export function resultSummary(result: ScoreResult): string {
  const noun = result.total === 1 ? "note" : "notes";
  const head = `${result.matched} of ${result.total} ${noun} matched`;
  if (result.passed) return `${head}. Matched.`;
  const octaves = result.notes.filter((note) => note.verdict === "octave").length;
  const tail = octaves > 0 ? ` ${octaves === 1 ? "One note was" : `${octaves} notes were`} the right note in another octave.` : "";
  return `${head}; ${result.needed} needed at ${THRESHOLDS[result.threshold].label.toLowerCase()}. Not yet.${tail}`;
}
