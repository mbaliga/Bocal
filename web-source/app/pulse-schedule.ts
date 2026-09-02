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

/** Linear per-bar bpm for a ramping segment; plain bpm outside a ramp. Per-bar steps, not a smooth sweep. */
function bpmForBar(segment: PulseSegment, barInSegment: number): number {
  if (segment.rampToBpm === undefined || segment.bars === undefined) return segment.bpm;
  const span = Math.max(1, segment.bars - 1);
  const progress = Math.min(1, barInSegment / span);
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
    const totalBars = segment.bars ?? Infinity;
    const pattern = segment.accentPattern.length > 0 ? segment.accentPattern : defaultAccentPattern(segment.beatsPerBar);
    for (let barInSegment = 0; barInSegment < totalBars; barInSegment += 1) {
      const bpmNow = bpmForBar(segment, barInSegment);
      const secondsPerTick = 60 / bpmNow / segment.subdivision;
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
          when += secondsPerTick;
          index += 1;
        }
      }
      bar += 1;
    }
  }
}
