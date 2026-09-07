/**
 * Pure scheduling arithmetic for the Pulse metronome.
 *
 * PulseView (in PracticeTools.tsx) turns its live settings -- bpm, meter,
 * subdivision, accents, an optional tempo ramp, an optional chain of preset
 * segments -- into a PulsePlan and hands it to schedulePulse() together with
 * the audio-clock time the run started. schedulePulse() is a plain
 * generator: it carries a single "when" clock forward tick by tick,
 * deriving each tick's audio time from the *previous* tick's time plus the
 * current bar's seconds-per-tick, rather than from `startTime + index *
 * secondsPerTick`. That is what lets the bpm change bar-to-bar (a ramp) or
 * the whole segment change bar-to-bar (a preset sequence) without a restart
 * or a phase jump: the caller never needs to recompute "when" from scratch,
 * only keep pulling the next tick.
 *
 * Nothing in this file touches the DOM, AudioContext, or React -- it is
 * exercised directly by tests/metronome-depth.test.mjs.
 */

export type ClickVoice = "pure" | "wood" | "beep" | "clave";

/** A beat's accent state: silenced beats still advance the visual dot. */
export type BeatMark = "normal" | "accent" | "silent";

/** One leg of a run: either the whole thing (a plain preset) or one step of a preset sequence. */
export type PulseSegment = {
  bpm: number;
  beatsPerBar: number;
  subdivision: number;
  voice: ClickVoice;
  countInBars: number;
  muteEveryBars: number;
  /** Cycles if shorter than beatsPerBar; falls back to accent-on-beat-one if empty. */
  accentPattern: BeatMark[];
  /** Bars this segment plays before the plan advances. Omit for "plays until stopped". */
  bars?: number;
  /** When set with a finite `bars`, bpm steps linearly from `bpm` to this value, one new tempo per bar. */
  rampToBpm?: number;
  /**
   * Fraction of the beat the first eighth note takes when subdivision is 2
   * (0.5 = straight, up to ~0.75 = a hard triplet swing). Ignored otherwise.
   */
  swingRatio?: number;
  /** Carried through to each tick for a "now playing" readout. */
  label?: string;
};

export type PulsePlan = {
  segments: PulseSegment[];
  /** Restart from segments[0] after the last one finishes, instead of holding its end state. */
  loop: boolean;
};

export type ScheduledTick = {
  /** Absolute tick index from the start of the run (subdivision ticks included). */
  index: number;
  /** Audio-clock time this tick fires at, in seconds. */
  when: number;
  segmentIndex: number;
  /** Bar index from the start of the run (not reset per segment). */
  bar: number;
  /** Bar index within the current segment (resets to 0 when a segment starts). */
  barInSegment: number;
  beat: number;
  subTick: number;
  accent: boolean;
  /** True if this beat's mark is "silent" or the whole bar is muted by the silent-bar drill. */
  silent: boolean;
  countIn: boolean;
  mutedBar: boolean;
  /** The bpm this tick's bar is actually playing at -- moves bar to bar during a ramp. */
  bpmNow: number;
  beatsPerBar: number;
  subdivision: number;
  voice: ClickVoice;
  label?: string;
};

/** Accent on beat one, everything else plain -- the metronome's long-standing default. */
export function defaultAccentPattern(beatsPerBar: number): BeatMark[] {
  return Array.from({ length: Math.max(1, beatsPerBar) }, (_, index) => (index === 0 ? "accent" : "normal"));
}

/** Keeps a saved pattern usable after the meter changes: trims or pads with "normal" beats. */
export function resizeAccentPattern(pattern: BeatMark[], beatsPerBar: number): BeatMark[] {
  const size = Math.max(1, beatsPerBar);
  if (pattern.length === size) return pattern;
  if (pattern.length > size) return pattern.slice(0, size);
  return [...pattern, ...Array.from({ length: size - pattern.length }, (): BeatMark => "normal")];
}

/** Tapping a beat square: normal -> accent -> silent -> normal. */
export function cycleBeatMark(mark: BeatMark): BeatMark {
  return mark === "normal" ? "accent" : mark === "accent" ? "silent" : "normal";
}

/**
 * Linear per-bar bpm for a ramping segment; plain bpm outside a ramp, and
 * plain (start) bpm during count-in bars -- a ramp only spans the bars the
 * player actually plays over, so a 2-bar count-in ahead of a 4-bar ramp
 * doesn't burn ramp progress before the player has come in.
 */
function bpmForBar(segment: PulseSegment, barInSegment: number): number {
  if (segment.rampToBpm === undefined || segment.bars === undefined) return segment.bpm;
  const rampBar = barInSegment - segment.countInBars;
  if (rampBar < 0) return segment.bpm;
  const rampBars = Math.max(1, segment.bars - segment.countInBars);
  const span = Math.max(1, rampBars - 1);
  const progress = Math.min(1, rampBar / span);
  return segment.bpm + (segment.rampToBpm - segment.bpm) * progress;
}

/**
 * Yields each segment in play order, forever. A non-looping plan holds on a
 * frozen copy of the last segment once it's done -- bars cleared so it plays
 * until stopped, bpm resolved to wherever a ramp ended -- which is how "hold
 * the end tempo" and "keep the last preset's settings" fall out of the same
 * rule instead of being special-cased.
 */
function* segmentTimeline(plan: PulsePlan): Generator<{ segment: PulseSegment; segmentIndex: number }> {
  if (plan.segments.length === 0) throw new Error("PulsePlan needs at least one segment");
  for (;;) {
    for (let index = 0; index < plan.segments.length; index += 1) {
      yield { segment: plan.segments[index], segmentIndex: index };
    }
    if (plan.loop) continue;
    const lastIndex = plan.segments.length - 1;
    const last = plan.segments[lastIndex];
    const held: PulseSegment = {
      ...last,
      bars: undefined,
      bpm: bpmForBar(last, Math.max(0, (last.bars ?? 1) - 1)),
      rampToBpm: undefined,
    };
    for (;;) yield { segment: held, segmentIndex: lastIndex };
  }
}

/**
 * The scheduler's tick generator. `when` starts at `startTime` and only ever
 * moves forward by the current bar's exact seconds-per-tick -- it is never
 * recomputed as `startTime + index * secondsPerTick`, so a bpm or meter
 * change mid-run (a ramp bar, a sequence step) never produces a gap or an
 * overlap in the audio-clock timeline.
 */
export function* schedulePulse(plan: PulsePlan, startTime: number): Generator<ScheduledTick, void, void> {
  let when = startTime;
  let index = 0;
  let bar = 0;
  for (const { segment, segmentIndex } of segmentTimeline(plan)) {
    // A saved preset with a corrupted or hand-edited beatsPerBar/subdivision
    // (0, negative, NaN) must never reach the inner loops below: at 0 beats
    // per bar or 0 subticks the `for` loops never advance `bar`/`barInSegment`
    // and this generator spins forever with nothing to show for it, hanging
    // whatever calls .next() on it. Treat it as silently unplayable instead.
    if (!(segment.beatsPerBar > 0) || !(segment.subdivision > 0) || !(segment.bpm > 0)) {
      throw new Error(`PulseSegment has an invalid beatsPerBar/subdivision/bpm: ${JSON.stringify({ beatsPerBar: segment.beatsPerBar, subdivision: segment.subdivision, bpm: segment.bpm })}`);
    }
    const totalBars = segment.bars ?? Infinity;
    const pattern = segment.accentPattern.length > 0 ? segment.accentPattern : defaultAccentPattern(segment.beatsPerBar);
    for (let barInSegment = 0; barInSegment < totalBars; barInSegment += 1) {
      const bpmNow = bpmForBar(segment, barInSegment);
      const beatSeconds = 60 / bpmNow;
      const secondsPerTick = beatSeconds / segment.subdivision;
      const countIn = barInSegment < segment.countInBars;
      const mutedBar = segment.muteEveryBars > 0 && !countIn && (barInSegment - segment.countInBars + 1) % segment.muteEveryBars === 0;
      for (let beat = 0; beat < segment.beatsPerBar; beat += 1) {
        const mark = pattern[beat % pattern.length];
        for (let subTick = 0; subTick < segment.subdivision; subTick += 1) {
          yield {
            index,
            when,
            segmentIndex,
            bar,
            barInSegment,
            beat,
            subTick,
            accent: subTick === 0 && mark === "accent",
            silent: mark === "silent" || mutedBar,
            countIn,
            mutedBar,
            bpmNow,
            beatsPerBar: segment.beatsPerBar,
            subdivision: segment.subdivision,
            voice: segment.voice,
            label: segment.label,
          };
          // Swing only reshapes a pair of eighth notes (subdivision 2): the
          // first eighth takes `swingRatio` of the beat, the second takes the
          // rest, and the two deltas still sum to exactly one beat, so the
          // next beat lands on time regardless of the ratio chosen.
          const ratio = segment.swingRatio;
          if (segment.subdivision === 2 && ratio !== undefined && ratio !== 0.5) {
            const clamped = Math.min(0.75, Math.max(0.5, ratio));
            when += subTick === 0 ? beatSeconds * clamped : beatSeconds * (1 - clamped);
          } else {
            when += secondsPerTick;
          }
          index += 1;
        }
      }
      bar += 1;
    }
  }
}

/** A second, independent click voice used for a polyrhythm drill. */
export type PolyrhythmVoice = { beats: number; voice: ClickVoice };

export type PolyrhythmTick = { when: number; index: number; voice: ClickVoice };

/**
 * Yields evenly-spaced ticks for a second voice that divides the *same bar
 * duration* as the main pulse into `poly.beats` equal parts, independent of
 * the main pulse's own beatsPerBar -- the classic "N against M" cross-rhythm
 * feel (e.g. a 3-beat bar with a 2-beat second voice sounds "3 against 2").
 * `bpmNow` is read once per bar so a live tempo change is picked up at the
 * next bar boundary, the same rule schedulePulse follows.
 */
export function* schedulePolyrhythm(mainBeatsPerBar: number, poly: PolyrhythmVoice, startTime: number, bpmNow: () => number): Generator<PolyrhythmTick, void, void> {
  if (!(mainBeatsPerBar > 0) || !(poly.beats > 0)) throw new Error("schedulePolyrhythm needs a positive beat count on both voices");
  let when = startTime;
  let index = 0;
  for (;;) {
    const bpm = bpmNow();
    const barSeconds = (60 / (bpm > 0 ? bpm : 1)) * mainBeatsPerBar;
    const step = barSeconds / poly.beats;
    for (let i = 0; i < poly.beats; i += 1) {
      yield { when: when + i * step, index, voice: poly.voice };
      index += 1;
    }
    when += barSeconds;
  }
}
