import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../app/pulse-schedule.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: "pulse-schedule.ts",
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { schedulePulse, defaultAccentPattern, resizeAccentPattern, cycleBeatMark } = await loadModule();

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
