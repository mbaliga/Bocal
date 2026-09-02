// Pitch history ring buffer for the tuner's live history graph (the
// cents-vs-time line and its staff-mode alternative).
//
// Kept as a plain, framework- and DOM-free module on purpose: the sampling
// loop in page.tsx pushes into it every ~30ms (the tuner's existing analysis
// cadence, not a new timer) and it has to stay out of React state so that
// doesn't trigger a re-render on every frame. Being DOM-free also means the
// buffer and the stable-segment logic below are unit-testable under Node
// without a canvas or a browser -- see tests/pitch-history.test.mjs. The
// canvas drawing itself lives in pitch-history-canvas.ts, which does need a
// DOM and stays untested at that layer.

export type PitchHistorySample = {
  /** Capture time, in the same clock as `performance.now()`. */
  tMs: number;
  /** Cents deviation from the locked target; null marks an unvoiced gap. */
  cents: number | null;
  /**
   * The note being displayed at this sample (already transposed for the
   * instrument, i.e. the written pitch a player reads) -- null alongside
   * `cents` for a gap.
   */
  midi: number | null;
};

/**
 * Fixed-capacity FIFO of the most recent samples. A plain array trimmed from
 * the front on overflow is fast enough at the sizes this app uses (a few
 * hundred samples for a ~10s window at a 30ms sampling cadence) and keeps
 * the read side a simple, ordered oldest-to-newest list for the canvas and
 * the tests to walk.
 */
export class PitchHistoryBuffer {
  private readonly capacity: number;
  private samples: PitchHistorySample[] = [];

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  push(sample: PitchHistorySample) {
    this.samples.push(sample);
    if (this.samples.length > this.capacity) {
      this.samples.splice(0, this.samples.length - this.capacity);
    }
  }

  clear() {
    this.samples = [];
  }

  /** A fresh, ordered copy -- safe for a caller to keep or mutate. */
  toArray(): PitchHistorySample[] {
    return this.samples.slice();
  }

  get length() {
    return this.samples.length;
  }

  getCapacity() {
    return this.capacity;
  }
}

/**
 * A run of consecutive same-note samples long enough to draw as one notehead
 * in staff mode, mirroring the way TE's Note Staff settles onto a note only
 * once it has actually held rather than redrawing on every frame.
 */
export type StableSegment = {
  midi: number;
  /** Index into the sample array the run starts at (inclusive). */
  startIndex: number;
  /** Index into the sample array the run ends at (inclusive). */
  endIndex: number;
  count: number;
  /** Mean cents deviation across the run, for sharp/flat shading. */
  meanCents: number;
};

export const MIN_STABLE_SEGMENT_FRAMES = 5;

/**
 * Groups consecutive samples that share the same `midi` into segments, and
 * keeps only the runs at least `minFrames` long -- a couple of stray frames
 * at a transition shouldn't paint their own notehead. A gap (null midi, from
 * an unvoiced frame) always ends the current run without starting a new one;
 * a note change ends a run even without a gap between the two notes.
 */
export function detectStableSegments(
  samples: PitchHistorySample[],
  minFrames: number = MIN_STABLE_SEGMENT_FRAMES,
): StableSegment[] {
  const segments: StableSegment[] = [];
  let runStart = -1;
  let runMidi: number | null = null;
  let runCentsSum = 0;
  let runCount = 0;

  const flush = (endIndex: number) => {
    if (runMidi !== null && runCount >= minFrames) {
      segments.push({
        midi: runMidi,
        startIndex: runStart,
        endIndex,
        count: runCount,
        meanCents: runCentsSum / runCount,
      });
    }
    runStart = -1;
    runMidi = null;
    runCentsSum = 0;
    runCount = 0;
  };

  samples.forEach((sample, index) => {
    if (sample.midi === null || sample.cents === null) {
      flush(index - 1);
      return;
    }
    if (sample.midi !== runMidi) {
      flush(index - 1);
      runStart = index;
      runMidi = sample.midi;
    }
    runCentsSum += sample.cents;
    runCount += 1;
  });
  flush(samples.length - 1);
  return segments;
}
