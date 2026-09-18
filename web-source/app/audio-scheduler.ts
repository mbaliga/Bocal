/**
 * The shared lookahead scheduler loop behind the metronome (PulseView) and
 * the tone generator's exercise player (ToneGenerator). Both need the same
 * pattern: audio is scheduled on the AudioContext clock, not on
 * setTimeout/setInterval, because a plain timer callback is only accurate to
 * a handful of milliseconds and drifts steadily under load -- exactly the
 * tool a player is using to judge whether *they* are drifting. A plain timer
 * wakes often (every SCHEDULER_TICK_MS) and, on each wake, queues every
 * event due in the next `scheduleAhead` seconds at its exact audio-clock
 * time; only the on-screen visuals (a beat dot, a highlighted key) ride a
 * plain timer directly, where a few milliseconds of jitter is invisible.
 *
 * Nothing in this file touches AudioContext, the DOM, or React -- callers
 * supply their own clock, their own tick generator(s), and their own "play
 * this" callback. Exercised directly by tests/audio-scheduler.test.mjs with
 * a fake clock and injected timer functions.
 */

/** How far ahead of the audio clock events are queued while the tab/workspace is visible. */
export const SCHEDULE_AHEAD_SECONDS = 0.12;
/** Raised look-ahead for a hidden tab, where a throttled timer still needs to keep the queue full. */
export const SCHEDULE_AHEAD_HIDDEN_SECONDS = 1.5;
/** How often the scheduler wakes to top up the queue. */
export const SCHEDULER_TICK_MS = 25;

/** Anything a scheduled tick generator yields: an audio-clock time to fire at, plus whatever payload the caller needs. */
export type Timed = { when: number };

/**
 * Pulls every value a tick generator has ready before `horizon` (an absolute
 * audio-clock time), calling `onDue` for each in order, and returns the
 * generator's next not-yet-due result (or its finished result) so the caller
 * can resume from exactly where this call left off on the next wake. This is
 * the `while (next.when < now + ahead)` loop shared by every tick source in
 * the app: the metronome's main click generator, its polyrhythm generator,
 * and the exercise player's note generator all drain through this same
 * function instead of each hand-rolling the same while loop.
 */
export function drainDueTicks<T extends Timed>(
  iterator: Generator<T, void, void>,
  pending: IteratorResult<T, void>,
  horizon: number,
  onDue: (value: T) => void,
): IteratorResult<T, void> {
  let current = pending;
  while (!current.done && current.value.when < horizon) {
    onDue(current.value);
    current = iterator.next();
  }
  return current;
}

export type LookaheadSchedulerOptions = {
  /** The AudioContext clock (or a fake, in tests): typically `() => context.currentTime`. Currently unused by the loop itself (callers read it inside `onWake`), but kept on the options so a caller's intent is explicit and tests can assert against the same clock the scheduler was given. */
  now: () => number;
  /**
   * Called on every wake with the current schedule-ahead window (seconds);
   * queue everything due before `now() + scheduleAhead` (typically via one
   * or more `drainDueTicks` calls) and optionally return a new
   * schedule-ahead value to use for the *next* wake. Returning nothing keeps
   * the window unchanged.
   */
  onWake: (scheduleAhead: number) => number | void;
  /** Milliseconds between wakes. Defaults to SCHEDULER_TICK_MS. */
  intervalMs?: number;
  /** The schedule-ahead window on the very first wake. Defaults to SCHEDULE_AHEAD_SECONDS. */
  initialScheduleAhead?: number;
  /** Injectable timer functions so tests can drive this with a fake clock instead of real wall time. Default to the real window timers. */
  setIntervalFn?: (handler: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
};

export type LookaheadScheduler = {
  /** Stops future wakes. Idempotent. */
  stop: () => void;
};

/**
 * Starts the wake-on-interval loop: calls `onWake` immediately (so the first
 * batch of events is queued without waiting a full tick), then every
 * `intervalMs` after that, until `stop()` is called.
 */
export function startLookaheadScheduler(options: LookaheadSchedulerOptions): LookaheadScheduler {
  const intervalMs = options.intervalMs ?? SCHEDULER_TICK_MS;
  const setIntervalFn = options.setIntervalFn ?? ((handler: () => void, ms: number) => window.setInterval(handler, ms) as unknown as number);
  const clearIntervalFn = options.clearIntervalFn ?? ((id: number) => window.clearInterval(id));
  let scheduleAhead = options.initialScheduleAhead ?? SCHEDULE_AHEAD_SECONDS;
  let stopped = false;

  const wake = () => {
    if (stopped) return;
    const next = options.onWake(scheduleAhead);
    if (typeof next === "number") scheduleAhead = next;
  };

  wake();
  const timerId = setIntervalFn(wake, intervalMs);
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearIntervalFn(timerId);
    },
  };
}
