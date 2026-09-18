import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { schedulePulse, schedulePolyrhythm, defaultAccentPattern, resizeAccentPattern, cycleBeatMark, seededUnit } from "../app/pulse-schedule.ts";

function take(iterator, count) {
  const ticks = [];
  for (let i = 0; i < count; i += 1) {
    const { value, done } = iterator.next();
    assert.equal(done, false, `generator ended early after ${i} ticks`);
    ticks.push(value);
  }
  return ticks;
}

const plainSegment = (overrides = {}) => ({
  bpm: 120,
  beatsPerBar: 4,
  subdivision: 1,
  voice: "pure",
  countInBars: 0,
  muteEveryBars: 0,
  accentPattern: defaultAccentPattern(4),
  ...overrides,
});

test("constant 120 BPM 4/4 gives ticks 0.5 s apart", () => {
  const plan = { segments: [plainSegment()], loop: false };
  const iterator = schedulePulse(plan, 10);
  const ticks = take(iterator, 8);
  for (let i = 1; i < ticks.length; i += 1) {
    assert.ok(Math.abs(ticks[i].when - ticks[i - 1].when - 0.5) < 1e-9, `tick ${i} spacing off: ${ticks[i].when - ticks[i - 1].when}`);
  }
  assert.equal(ticks[0].when, 10);
  ticks.forEach((tick) => assert.equal(tick.bpmNow, 120));
});

test("linear ramp 60->120 over 4 bars of 4/4: bar 1 at 1.0 s spacing, bar 4 at ~0.5 s, no drift", () => {
  const segment = plainSegment({ bpm: 60, rampToBpm: 120, bars: 4 });
  const plan = { segments: [segment], loop: false };
  const startTime = 5;
  const iterator = schedulePulse(plan, startTime);
  // 4 bars * 4 beats/bar = 16 ticks for the ramp itself, plus a few into the held tail.
  const ticks = take(iterator, 20);

  const bar1 = ticks.filter((tick) => tick.bar === 0);
  const bar4 = ticks.filter((tick) => tick.bar === 3);
  assert.equal(bar1.length, 4);
  assert.equal(bar4.length, 4);

  for (let i = 1; i < bar1.length; i += 1) {
    assert.ok(Math.abs(bar1[i].when - bar1[i - 1].when - 1.0) < 1e-9, "bar 1 should be spaced 1.0s apart at 60 BPM");
  }
  for (let i = 1; i < bar4.length; i += 1) {
    assert.ok(Math.abs(bar4[i].when - bar4[i - 1].when - 0.5) < 1e-9, "bar 4 should be spaced 0.5s apart at 120 BPM");
  }
  assert.equal(bar1[0].bpmNow, 60);
  assert.equal(bar4[0].bpmNow, 120);

  // No drift: total elapsed time across the 4 ramp bars equals the exact sum
  // of each bar's own duration (4 beats at that bar's bpm), computed
  // independently of the generator's running "when" clock.
  const bpmPerBar = [0, 1, 2, 3].map((bar) => 60 + (120 - 60) * (bar / 3));
  const expectedBarDurations = bpmPerBar.map((bpm) => 4 * (60 / bpm));
  const expectedTotal = expectedBarDurations.reduce((sum, seconds) => sum + seconds, 0);
  const rampEndWhen = ticks.find((tick) => tick.bar === 4)?.when ?? ticks[15].when + 0.5;
  assert.ok(Math.abs(rampEndWhen - startTime - expectedTotal) < 1e-9, `expected no drift: got ${rampEndWhen - startTime}, wanted ${expectedTotal}`);

  // After the ramp completes it holds the end tempo rather than reverting or stopping.
  const held = ticks.filter((tick) => tick.bar >= 4);
  assert.ok(held.length > 0, "expected ticks past the ramp's 4 bars");
  held.forEach((tick) => assert.equal(tick.bpmNow, 120, "should hold the end tempo after the ramp completes"));
});

test("accent pattern [accent, normal, silent, normal] is honoured", () => {
  const pattern = ["accent", "normal", "silent", "normal"];
  const segment = plainSegment({ accentPattern: pattern, bpm: 240 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 4);

  assert.equal(ticks[0].accent, true);
  assert.equal(ticks[0].silent, false);
  assert.equal(ticks[1].accent, false);
  assert.equal(ticks[1].silent, false);
  assert.equal(ticks[2].accent, false);
  assert.equal(ticks[2].silent, true, "a silent beat must not play audio");
  assert.equal(ticks[3].accent, false);
  assert.equal(ticks[3].silent, false);
  // Silent beats still advance the visual dot: they carry a real beat index, not a gap.
  assert.deepEqual(ticks.map((t) => t.beat), [0, 1, 2, 3]);
});

test("cycleBeatMark and resizeAccentPattern behave as the tap-to-cycle UI expects", () => {
  assert.equal(cycleBeatMark("normal"), "accent");
  assert.equal(cycleBeatMark("accent"), "silent");
  assert.equal(cycleBeatMark("silent"), "normal");

  assert.deepEqual(resizeAccentPattern(["accent", "normal"], 4), ["accent", "normal", "normal", "normal"]);
  assert.deepEqual(resizeAccentPattern(["accent", "normal", "normal", "silent"], 2), ["accent", "normal"]);
});

test("a two-preset sequence switches meter at the bar boundary without a time discontinuity", () => {
  const stepA = plainSegment({ bpm: 100, beatsPerBar: 4, bars: 2, label: "A" });
  const stepB = plainSegment({ bpm: 100, beatsPerBar: 3, label: "B" }); // plays until stopped
  const plan = { segments: [stepA, stepB], loop: false };
  const startTime = 2;
  const ticks = take(schedulePulse(plan, startTime), 4 * 2 + 3 * 2); // 2 bars of 4 + 2 bars of 3

  const stepATicks = ticks.filter((t) => t.segmentIndex === 0);
  const stepBTicks = ticks.filter((t) => t.segmentIndex === 1);
  assert.equal(stepATicks.length, 8);
  assert.equal(stepBTicks.length, 6);
  assert.equal(stepATicks[0].label, "A");
  assert.equal(stepBTicks[0].label, "B");
  stepBTicks.forEach((t) => assert.equal(t.beatsPerBar, 3));

  // The bar count keeps counting from the start of the run rather than resetting.
  assert.equal(stepATicks[stepATicks.length - 1].bar, 1);
  assert.equal(stepBTicks[0].bar, 2);

  // Seamless handoff: the first tick of step B lands exactly one secondsPerTick
  // after the last tick of step A, at 100 BPM (0.6s/tick) -- no gap, no overlap.
  const secondsPerTick = 60 / 100 / 1;
  const lastA = stepATicks[stepATicks.length - 1];
  const firstB = stepBTicks[0];
  assert.ok(Math.abs(firstB.when - lastA.when - secondsPerTick) < 1e-9, "expected a seamless, gap-free handoff between sequence steps");

  // And the whole run's timing is exactly startTime + elapsed ticks * secondsPerTick
  // (both steps run at the same bpm here, so this also proves no phase reset happened).
  ticks.forEach((tick, i) => {
    assert.ok(Math.abs(tick.when - (startTime + i * secondsPerTick)) < 1e-9, `tick ${i} drifted from the expected audio-clock time`);
  });
});

test("looping sequence restarts from the first segment", () => {
  const stepA = plainSegment({ bpm: 120, beatsPerBar: 2, bars: 1, label: "A" });
  const stepB = plainSegment({ bpm: 120, beatsPerBar: 2, bars: 1, label: "B" });
  const plan = { segments: [stepA, stepB], loop: true };
  const ticks = take(schedulePulse(plan, 0), 2 + 2 + 2); // A, B, then A again

  assert.deepEqual(ticks.map((t) => t.label), ["A", "A", "B", "B", "A", "A"]);
  assert.deepEqual(ticks.map((t) => t.segmentIndex), [0, 0, 1, 1, 0, 0]);
});

test("a ramp holds the start tempo during count-in bars, then ramps only over the bars actually played", () => {
  // 1 bar count-in, then a ramp from 60->120 over 4 bars.
  const segment = plainSegment({ bpm: 60, rampToBpm: 120, bars: 5, countInBars: 1 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 4 * 5);

  const byBar = (bar) => ticks.filter((t) => t.bar === bar);
  assert.ok(byBar(0).every((t) => t.countIn && t.bpmNow === 60), "count-in bar should hold the start tempo, not already be ramping");
  assert.equal(byBar(1)[0].bpmNow, 60, "the first played bar starts the ramp at the start tempo");
  assert.equal(byBar(4)[0].bpmNow, 120, "the ramp still reaches its end tempo over its own 4 bars");
});

test("count-in ticks carry tick.countIn so the UI can play a distinct voice and show a readout", () => {
  const segment = plainSegment({ beatsPerBar: 4, countInBars: 2 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 4 * 3);
  assert.ok(ticks.slice(0, 8).every((t) => t.countIn), "first two bars are count-in");
  assert.ok(ticks.slice(8).every((t) => !t.countIn), "third bar is not count-in");
});

test("swing at subdivision 2 keeps the beat's total duration exact while reshaping the two eighths", () => {
  const segment = plainSegment({ beatsPerBar: 1, subdivision: 2, bpm: 120, swingRatio: 0.67 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 4); // 2 beats worth
  const beatSeconds = 60 / 120;
  assert.ok(Math.abs((ticks[1].when - ticks[0].when) - beatSeconds * 0.67) < 1e-9, "first eighth should take the swung fraction of the beat");
  assert.ok(Math.abs((ticks[2].when - ticks[1].when) - beatSeconds * 0.33) < 1e-9, "second eighth should take the remaining fraction");
  assert.ok(Math.abs((ticks[2].when - ticks[0].when) - beatSeconds) < 1e-9, "swing must not drift the next beat's time");
});

test("an invalid segment (zero beatsPerBar/subdivision/bpm) throws instead of hanging the generator", () => {
  const plan = { segments: [plainSegment({ beatsPerBar: 0 })], loop: false };
  assert.throws(() => take(schedulePulse(plan, 0), 1));
  const plan2 = { segments: [plainSegment({ subdivision: 0 })], loop: false };
  assert.throws(() => take(schedulePulse(plan2, 0), 1));
  const plan3 = { segments: [plainSegment({ bpm: 0 })], loop: false };
  assert.throws(() => take(schedulePulse(plan3, 0), 1));
});

test("schedulePolyrhythm divides each bar into N equal, drift-free parts independent of the main meter", () => {
  const iterator = schedulePolyrhythm(3, { beats: 2, voice: "beep" }, 0, () => 120);
  const ticks = take(iterator, 4); // 2 bars
  const barSeconds = (60 / 120) * 3;
  assert.ok(Math.abs(ticks[0].when - 0) < 1e-9);
  assert.ok(Math.abs(ticks[1].when - barSeconds / 2) < 1e-9);
  assert.ok(Math.abs(ticks[2].when - barSeconds) < 1e-9, "second bar starts exactly one bar later, no drift");
  assert.ok(Math.abs(ticks[3].when - (barSeconds + barSeconds / 2)) < 1e-9);
});

test("silent-bar drill mutes whole bars after count-in, independent of the accent pattern", () => {
  const segment = plainSegment({ beatsPerBar: 2, countInBars: 1, muteEveryBars: 2 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 2 * 6); // 6 bars

  const byBar = (bar) => ticks.filter((t) => t.bar === bar);
  assert.ok(byBar(0).every((t) => t.countIn && !t.mutedBar), "count-in bar should never be muted");
  // bars after count-in: bar-countIn+1 -> 1,2,3,4,5 ; muted every 2nd -> bars 2 and 4 (0-indexed) are muted
  assert.ok(byBar(2).every((t) => t.mutedBar && t.silent));
  assert.ok(byBar(4).every((t) => t.mutedBar && t.silent));
  assert.ok(byBar(1).every((t) => !t.mutedBar));
  assert.ok(byBar(3).every((t) => !t.mutedBar));
});

// ---------------------------------------------------------------------------
// Gap trainer (N bars on, M bars off) and random beat drops -- W2-C
// ---------------------------------------------------------------------------

test("gap trainer rests gapRestBars after every gapPlayBars, independent of the accent pattern, and the beat dot keeps advancing", () => {
  const segment = plainSegment({ beatsPerBar: 2, gapPlayBars: 2, gapRestBars: 1 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 2 * 6); // 6 bars: on on off on on off

  const byBar = (bar) => ticks.filter((t) => t.bar === bar);
  [0, 1, 3, 4].forEach((bar) => assert.ok(byBar(bar).every((t) => !t.gapResting && !t.silent), `bar ${bar} should be playing`));
  [2, 5].forEach((bar) => assert.ok(byBar(bar).every((t) => t.gapResting && t.silent), `bar ${bar} should be resting`));
  // The beat index still advances through a rest bar -- it isn't a gap in the count.
  assert.deepEqual(byBar(2).map((t) => t.beat), [0, 1]);
});

test("gap trainer never rests during count-in, and starts its cycle right after it", () => {
  const segment = plainSegment({ beatsPerBar: 1, countInBars: 1, gapPlayBars: 1, gapRestBars: 1 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 1 * 5); // count-in, then on off on off

  const byBar = (bar) => ticks.filter((t) => t.bar === bar);
  assert.ok(byBar(0).every((t) => t.countIn && !t.gapResting), "count-in bar must never rest");
  assert.ok(byBar(1).every((t) => !t.gapResting), "first bar after count-in plays");
  assert.ok(byBar(2).every((t) => t.gapResting), "second bar after count-in rests");
  assert.ok(byBar(3).every((t) => !t.gapResting), "cycle repeats: third bar plays");
});

test("gapPlayBars/gapRestBars require both to be positive; either 0/undefined disables the drill", () => {
  const onlyPlay = plainSegment({ beatsPerBar: 1, gapPlayBars: 2 });
  const onlyRest = plainSegment({ beatsPerBar: 1, gapRestBars: 2 });
  for (const segment of [onlyPlay, onlyRest]) {
    const ticks = take(schedulePulse({ segments: [segment], loop: false }, 0), 8);
    assert.ok(ticks.every((t) => !t.gapResting), "an incomplete gap configuration must never rest a bar");
  }
});

test("seededUnit is deterministic and produces roughly uniform draws across a large sample", () => {
  assert.equal(seededUnit(42, 7), seededUnit(42, 7), "same seed+index must always draw the same value");
  assert.notEqual(seededUnit(42, 7), seededUnit(42, 8), "different indices should (almost always) differ");
  assert.notEqual(seededUnit(42, 7), seededUnit(43, 7), "different seeds should (almost always) differ");
  const draws = Array.from({ length: 5000 }, (_, i) => seededUnit(1, i));
  draws.forEach((value) => assert.ok(value >= 0 && value < 1, `draw out of [0,1): ${value}`));
  const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `expected a roughly uniform mean near 0.5, got ${mean}`);
});

test("random beat drops are seeded and repeatable: the same preset drops the exact same beats every time", () => {
  const segment = plainSegment({ beatsPerBar: 4, dropProbability: 0.4, dropSeed: 1234 });
  const plan = { segments: [segment], loop: false };
  const runA = take(schedulePulse(plan, 0), 4 * 10).map((t) => t.dropped);
  const runB = take(schedulePulse({ segments: [{ ...segment }], loop: false }, 100 /* different startTime */), 4 * 10).map((t) => t.dropped);
  assert.deepEqual(runA, runB, "the same seed must drop the exact same beats regardless of startTime");
  assert.ok(runA.some(Boolean), "expected at least one dropped beat across 40 beats at p=0.4");
  assert.ok(runA.some((v) => !v), "expected at least one non-dropped beat across 40 beats at p=0.4");
});

test("a different seed drops a different pattern of beats at the same probability", () => {
  const base = plainSegment({ beatsPerBar: 4, dropProbability: 0.4 });
  const seedA = take(schedulePulse({ segments: [{ ...base, dropSeed: 1 }], loop: false }, 0), 4 * 20).map((t) => t.dropped);
  const seedB = take(schedulePulse({ segments: [{ ...base, dropSeed: 2 }], loop: false }, 0), 4 * 20).map((t) => t.dropped);
  assert.notDeepEqual(seedA, seedB, "different seeds should produce a different drop pattern");
});

test("dropped beats never fire during count-in and a dropped beat silences every subdivision tick within it", () => {
  const segment = plainSegment({ beatsPerBar: 2, subdivision: 2, countInBars: 2, dropProbability: 1 /* always drop once not counting in */, dropSeed: 5 });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 0), 2 * 2 * 4); // 2 count-in bars + 2 played bars, subdivision 2
  const countInTicks = ticks.filter((t) => t.countIn);
  const playedTicks = ticks.filter((t) => !t.countIn);
  assert.ok(countInTicks.every((t) => !t.dropped && !t.silent), "count-in ticks must never be dropped");
  assert.ok(playedTicks.every((t) => t.dropped && t.silent), "p=1 drops every played beat, both subdivision ticks");
});

test("gap trainer and random drops compose with a tempo ramp: timing stays drift-free and dropped/resting states apply on top of the ramp's own bpm", () => {
  const segment = plainSegment({
    beatsPerBar: 2,
    bpm: 60,
    rampToBpm: 120,
    bars: 6,
    gapPlayBars: 2,
    gapRestBars: 1,
    dropProbability: 0.3,
    dropSeed: 9,
  });
  const plan = { segments: [segment], loop: false };
  const ticks = take(schedulePulse(plan, 10), 2 * 6);
  // No drift: exact per-tick spacing still derives purely from bpmNow at each tick.
  for (let i = 1; i < ticks.length; i += 1) {
    const expectedGap = 60 / ticks[i - 1].bpmNow;
    assert.ok(Math.abs(ticks[i].when - ticks[i - 1].when - expectedGap) < 1e-9, `tick ${i} drifted under a ramp with gap/drops active`);
  }
  // The ramp itself still runs (bpm increases bar to bar).
  assert.ok(ticks[ticks.length - 1].bpmNow > ticks[0].bpmNow, "ramp should still progress with gap/drops layered on top");
  // The gap trainer's rest bar (bar index 2, the third bar) is still silent regardless of the ramp's bpm at that point.
  const restBarTicks = ticks.filter((t) => t.bar === 2);
  assert.ok(restBarTicks.every((t) => t.gapResting && t.silent));
});

test("gap trainer and random drops compose with a preset sequence: each step's gap/drop settings apply independently and the bar count keeps advancing across the handoff", () => {
  const stepA = plainSegment({ beatsPerBar: 2, bars: 3, gapPlayBars: 1, gapRestBars: 1, label: "A" });
  const stepB = plainSegment({ beatsPerBar: 2, bars: 2, dropProbability: 1, dropSeed: 3, label: "B" });
  const plan = { segments: [stepA, stepB], loop: false };
  const ticks = take(schedulePulse(plan, 0), 2 * 3 + 2 * 2);

  const stepATicks = ticks.filter((t) => t.segmentIndex === 0);
  const stepBTicks = ticks.filter((t) => t.segmentIndex === 1);
  // Step A: bars 0,1,2 relative to the step -> play, rest, play.
  assert.ok(stepATicks.filter((t) => t.barInSegment === 1).every((t) => t.gapResting));
  assert.ok(stepATicks.filter((t) => t.barInSegment !== 1).every((t) => !t.gapResting));
  assert.ok(stepATicks.every((t) => !t.dropped), "step A has no drop probability configured");
  // Step B: every beat drops (p=1), and step B never rests via the gap trainer (not configured there).
  assert.ok(stepBTicks.every((t) => t.dropped && !t.gapResting));
  // The run-wide bar counter keeps advancing across the step boundary rather than resetting.
  assert.equal(stepBTicks[0].bar, 3);
});

test("PracticeTools no longer ships a fixed brand equipment record as if it were the player's own data", async () => {
  const source = await readFile(new URL("../app/PracticeTools.tsx", import.meta.url), "utf8");
  assert.ok(!source.includes("<strong>Vandoren"), "Vandoren Traditional must not be hard-coded as the player's reed");
  assert.ok(!source.includes("<strong>Yamaha"), "Yamaha 4C must not be hard-coded as the player's mouthpiece");
  assert.ok(source.includes("EQUIPMENT_LOG_KEY"), "expected a real, player-editable equipment log to replace it");
});
