import assert from "node:assert/strict";
import test from "node:test";
import { drainDueTicks, startLookaheadScheduler, SCHEDULE_AHEAD_SECONDS, SCHEDULER_TICK_MS } from "../app/audio-scheduler.ts";

// ---------------------------------------------------------------------------
// drainDueTicks
// ---------------------------------------------------------------------------

function* ticksAt(times) {
  for (const when of times) yield { when };
}

test("drainDueTicks pulls every value due before the horizon and leaves the generator at the first later one", () => {
  const iterator = ticksAt([0, 1, 2, 3, 4]);
  const seen = [];
  const pending = drainDueTicks(iterator, iterator.next(), 2.5, (value) => seen.push(value.when));
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(pending.done, false);
  assert.equal(pending.value.when, 3);
});

test("drainDueTicks resumes exactly where a previous call left off", () => {
  const iterator = ticksAt([0, 1, 2, 3, 4]);
  const seen = [];
  let pending = iterator.next();
  pending = drainDueTicks(iterator, pending, 1.5, (value) => seen.push(value.when));
  pending = drainDueTicks(iterator, pending, 3.5, (value) => seen.push(value.when));
  assert.deepEqual(seen, [0, 1, 2, 3]);
  assert.equal(pending.value.when, 4);
});

test("drainDueTicks on an exhausted generator returns done without calling onDue", () => {
  const iterator = ticksAt([0]);
  let pending = iterator.next();
  pending = drainDueTicks(iterator, pending, 1, () => {});
  assert.equal(pending.done, true);
  let calls = 0;
  pending = drainDueTicks(iterator, pending, 100, () => { calls += 1; });
  assert.equal(pending.done, true);
  assert.equal(calls, 0);
});

test("drainDueTicks with nothing due yet leaves the generator untouched and never calls onDue", () => {
  const iterator = ticksAt([5, 6]);
  const pending = drainDueTicks(iterator, iterator.next(), 1, () => assert.fail("should not fire before its time"));
  assert.equal(pending.value.when, 5);
});

// ---------------------------------------------------------------------------
// startLookaheadScheduler, driven by a fake clock and a manually-fired timer
// ---------------------------------------------------------------------------

/** A tiny fake `setInterval`/`clearInterval` pair: `fire()` invokes the
 * handler synchronously instead of waiting on real wall-clock time, so the
 * scheduler's wake-on-interval behaviour can be tested deterministically. */
function fakeTimer() {
  let handler = null;
  let intervalMs = null;
  let cleared = false;
  return {
    setIntervalFn: (h, ms) => { handler = h; intervalMs = ms; return 1; },
    clearIntervalFn: (id) => { assert.equal(id, 1); cleared = true; },
    fire: () => { if (!cleared && handler) handler(); },
    intervalMs: () => intervalMs,
    isCleared: () => cleared,
  };
}

test("startLookaheadScheduler wakes once immediately, then once per fired interval", () => {
  const timer = fakeTimer();
  let wakes = 0;
  startLookaheadScheduler({
    now: () => 0,
    onWake: () => { wakes += 1; },
    setIntervalFn: timer.setIntervalFn,
    clearIntervalFn: timer.clearIntervalFn,
  });
  assert.equal(wakes, 1, "the first wake fires synchronously, without waiting for the interval");
  timer.fire();
  timer.fire();
  assert.equal(wakes, 3);
  assert.equal(timer.intervalMs(), SCHEDULER_TICK_MS, "defaults to the shared tick interval");
});

test("startLookaheadScheduler uses the default schedule-ahead on the first wake, then whatever onWake returns", () => {
  const timer = fakeTimer();
  const seen = [];
  startLookaheadScheduler({
    now: () => 0,
    onWake: (scheduleAhead) => {
      seen.push(scheduleAhead);
      return scheduleAhead === SCHEDULE_AHEAD_SECONDS ? 9 : undefined;
    },
    setIntervalFn: timer.setIntervalFn,
    clearIntervalFn: timer.clearIntervalFn,
  });
  timer.fire();
  timer.fire();
  assert.deepEqual(seen, [SCHEDULE_AHEAD_SECONDS, 9, 9], "a returned value sticks until onWake changes it again");
});

test("startLookaheadScheduler honours a custom initial schedule-ahead and interval", () => {
  const timer = fakeTimer();
  const seen = [];
  startLookaheadScheduler({
    now: () => 0,
    onWake: (scheduleAhead) => { seen.push(scheduleAhead); },
    initialScheduleAhead: 1.5,
    intervalMs: 50,
    setIntervalFn: timer.setIntervalFn,
    clearIntervalFn: timer.clearIntervalFn,
  });
  assert.deepEqual(seen, [1.5]);
  assert.equal(timer.intervalMs(), 50);
});

test("stop() clears the interval and further fires are inert", () => {
  const timer = fakeTimer();
  let wakes = 0;
  const scheduler = startLookaheadScheduler({
    now: () => 0,
    onWake: () => { wakes += 1; },
    setIntervalFn: timer.setIntervalFn,
    clearIntervalFn: timer.clearIntervalFn,
  });
  scheduler.stop();
  assert.equal(timer.isCleared(), true);
  timer.fire(); // the fake timer itself doesn't enforce clearing, so this simulates a stray callback
  assert.equal(wakes, 1, "onWake must not run again once stopped, even if a stray callback still fires");
  scheduler.stop(); // idempotent
});

test("a full metronome-shaped run: a fake clock advancing across fires drains exactly the ticks due each time, with no gaps or repeats", () => {
  // Simulates PulseView's own use: a tick generator at 120 BPM (0.5s/beat)
  // starting at t=0, drained through drainDueTicks inside onWake, with a fake
  // clock that advances by a fixed step each time the timer fires.
  function* metronomeTicks() {
    let when = 0;
    for (;;) { yield { when }; when += 0.5; }
  }
  const timer = fakeTimer();
  let clock = 0;
  const iterator = metronomeTicks();
  let pending = iterator.next();
  const firedAt = [];
  startLookaheadScheduler({
    now: () => clock,
    onWake: (scheduleAhead) => {
      pending = drainDueTicks(iterator, pending, clock + scheduleAhead, (tick) => firedAt.push(tick.when));
    },
    setIntervalFn: timer.setIntervalFn,
    clearIntervalFn: timer.clearIntervalFn,
  });
  // First wake at clock=0 with the default 0.12s window queues only tick 0.
  assert.deepEqual(firedAt, [0]);
  clock = 0.6; timer.fire(); // now due: 0.5
  clock = 1.1; timer.fire(); // now due: 1.0
  clock = 2.0; timer.fire(); // now due: 1.5, 2.0 (2.0 itself is within the 0.12s window: 2.0 < 2.0+0.12)
  assert.deepEqual(firedAt, [0, 0.5, 1.0, 1.5, 2.0]);
});
