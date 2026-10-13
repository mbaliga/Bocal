// The one door between the play-along drill (CallAndResponse.tsx) and the
// tuner. The tuner (useTuner) owns the workspace's single AudioContext and the
// microphone; the drill is mounted in three different places (Tune, Vocal and
// the sax lab's Learn mode) and only one of them has the tuner's values to
// hand. So the tuner publishes what the drill needs here, and the drill reads
// it back, rather than a second AudioContext or a second microphone being
// opened for it.
//
// No DOM, no React and no audio in this file: it is a small shared cell plus
// the types both sides agree on.

import type { InstrumentId } from "./instruments";
import type { VocalGraphSource } from "./vocal-graph";

/** One sound to schedule, in seconds from the start of the phrase. */
export type PhraseTone = {
  midi: number;
  startSec: number;
  durationSec: number;
  /** A short, quiet tick instead of a held tone: the count-in. */
  kind?: "note" | "click";
};

/** The audio clock and the performance clock read at the same instant. */
export type ClockSnapshot = { audioSec: number; perfMs: number };

export type CallHost = {
  /** The tuner is listening (the microphone is on). */
  listening: boolean;
  micMessage: string;
  /** Starts the tuner. Calling it while listening would stop it, so callers only use it when `listening` is false. */
  onListen: () => void;
  /** The tuner's pitch frames: a ring buffer stamped with `performance.now()`. */
  graph: VocalGraphSource;
  /** The instrument the tuner is set to. */
  instrumentId: InstrumentId;
  /**
   * Semitones the buffer's `midi` sits above concert pitch. The buffer holds
   * written pitch unless the Calibration readout is set to concert, so for an
   * alto sax set to written this is 9 and for concert or non-transposing it is 0.
   */
  bufferOffset: number;
  /**
   * Schedules every tone on the shared AudioContext clock, all relative to one
   * start time a little ahead of now. Resolves with that start time (audio
   * clock, seconds) or null if nothing could be scheduled.
   */
  schedulePhrase: (tones: PhraseTone[]) => Promise<{ startTime: number } | null>;
  /** Silences anything `schedulePhrase` scheduled that has not finished. */
  stopPhrase: () => void;
  /** Both clocks read together, or null when there is no AudioContext yet. */
  clock: () => ClockSnapshot | null;
};

type Listener = () => void;

let current: CallHost | null = null;
const listeners = new Set<Listener>();

export function publishCallHost(host: CallHost | null): void {
  if (current === host) return;
  current = host;
  listeners.forEach((listener) => listener());
}

export function getCallHost(): CallHost | null {
  return current;
}

export function subscribeCallHost(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
