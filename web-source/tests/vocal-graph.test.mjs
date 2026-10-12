import assert from "node:assert/strict";
import test from "node:test";
import { PitchHistoryBuffer } from "../app/pitch-history.ts";
import {
  DEFAULT_MIDI_HIGH,
  DEFAULT_MIDI_LOW,
  DEFAULT_WINDOW_MS,
  HEAD_LEAD_FRACTION,
  MAX_PITCH_SPAN,
  MAX_WINDOW_MS,
  MIN_PITCH_SPAN,
  MIN_WINDOW_MS,
  centsClass,
  clampEndMs,
  clampWindowMs,
  createVocalChannel,
  defaultPitchView,
  fitPitchView,
  formatAgo,
  formatSignedCents,
  liveEndMs,
  midiToY,
  panPitch,
  panTime,
  pinchAxis,
  pinchFactor,
  pitchTicks,
  samplePitch,
  splitIntoRuns,
  splitPitch,
  timeTickStepSeconds,
  timeToX,
  wheelZoomFactor,
  xToTime,
  yToMidi,
  zoomPitch,
  zoomTime,
} from "../app/vocal-graph.ts";

const BOX = { left: 50, top: 10, width: 400, height: 240 };
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
const voiced = (tMs, midi, cents = 0) => ({ tMs, midi, cents });
const gap = (tMs) => ({ tMs, midi: null, cents: null });

test("the default pitch axis is C2 to C6", () => {
  assert.deepEqual(defaultPitchView(null), { lo: 36, hi: 84 });
  assert.equal(DEFAULT_MIDI_LOW, 36);
  assert.equal(DEFAULT_MIDI_HIGH, 84);
});

test("midi to y puts the top note at the top of the plot and the bottom note at the bottom", () => {
  const view = { lo: 36, hi: 84 };
  near(midiToY(84, view, BOX), BOX.top);
  near(midiToY(36, view, BOX), BOX.top + BOX.height);
  near(midiToY(60, view, BOX), BOX.top + BOX.height / 2);
  // Higher pitch is always a smaller y.
  assert.ok(midiToY(61, view, BOX) < midiToY(60, view, BOX));
});

test("midi to y and back is lossless", () => {
  const view = { lo: 40.5, hi: 71.25 };
  for (const midi of [40.5, 47, 55.3, 71.25]) near(yToMidi(midiToY(midi, view, BOX), view, BOX), midi, 1e-9);
});

test("time to x puts the window's right edge at the plot's right edge", () => {
  const time = { endMs: 100_000, windowMs: 30_000 };
  near(timeToX(100_000, time, BOX), BOX.left + BOX.width);
  near(timeToX(70_000, time, BOX), BOX.left);
  near(timeToX(85_000, time, BOX), BOX.left + BOX.width / 2);
  for (const t of [70_000, 81_234, 100_000]) near(xToTime(timeToX(t, time, BOX), time, BOX), t, 1e-6);
});

test("a live view leaves a small empty lead to the right of the newest reading", () => {
  const end = liveEndMs(10_000, 30_000);
  near(end, 10_000 + 30_000 * HEAD_LEAD_FRACTION);
  const x = timeToX(10_000, { endMs: end, windowMs: 30_000 }, BOX);
  near(x, BOX.left + BOX.width * (1 - HEAD_LEAD_FRACTION));
});

test("time zoom is clamped to 5 s and 120 s", () => {
  assert.equal(MIN_WINDOW_MS, 5_000);
  assert.equal(MAX_WINDOW_MS, 120_000);
  assert.equal(DEFAULT_WINDOW_MS, 30_000);
  assert.equal(clampWindowMs(1), 5_000);
  assert.equal(clampWindowMs(10_000_000), 120_000);
  assert.equal(clampWindowMs(Number.NaN), DEFAULT_WINDOW_MS);
  const bounds = { oldestMs: 0, latestMs: 200_000 };
  const start = { endMs: 150_000, windowMs: 30_000 };
  let zoomed = start;
  for (let i = 0; i < 20; i += 1) zoomed = zoomTime(zoomed, 2, 0.5, bounds);
  assert.equal(zoomed.windowMs, MIN_WINDOW_MS);
  for (let i = 0; i < 20; i += 1) zoomed = zoomTime(zoomed, 0.5, 0.5, bounds);
  assert.equal(zoomed.windowMs, MAX_WINDOW_MS);
});

test("zooming time keeps the moment under the anchor under the same pixel", () => {
  const bounds = { oldestMs: 0, latestMs: 400_000 };
  const time = { endMs: 200_000, windowMs: 40_000 };
  for (const anchor of [0, 0.25, 0.5, 0.9]) {
    const before = xToTime(BOX.left + BOX.width * anchor, time, BOX);
    const zoomed = zoomTime(time, 2, anchor, bounds);
    near(zoomed.windowMs, 20_000);
    near(xToTime(BOX.left + BOX.width * anchor, zoomed, BOX), before, 1e-6);
  }
  assert.deepEqual(zoomTime(time, 0, 0.5, bounds), time);
  assert.deepEqual(zoomTime(time, Number.NaN, 0.5, bounds), time);
});

test("panning time moves with the finger and stays inside the recorded data", () => {
  const bounds = { oldestMs: 10_000, latestMs: 100_000 };
  const live = { endMs: liveEndMs(100_000, 30_000), windowMs: 30_000 };
  // Dragging right looks further back.
  const back = panTime(live, 100, BOX.width, bounds);
  assert.ok(back.endMs < live.endMs);
  near(back.endMs, live.endMs - 0.25 * 30_000, 1e-6);
  // Dragging left past the live edge is refused.
  assert.equal(panTime(live, -500, BOX.width, bounds).endMs, live.endMs);
  // Dragging right forever stops a quarter window past the oldest reading.
  const oldest = panTime(live, 1e9, BOX.width, bounds);
  near(oldest.endMs, 10_000 + 30_000 * 0.25, 1e-6);
  assert.equal(oldest.windowMs, 30_000);
  assert.equal(panTime(live, 10, 0, bounds), live);
});

test("clampEndMs copes with data shorter than the window", () => {
  const bounds = { oldestMs: 90_000, latestMs: 95_000 };
  const end = clampEndMs(0, 30_000, bounds);
  assert.ok(end <= liveEndMs(95_000, 30_000));
  assert.ok(end >= 90_000);
});

test("pitch zoom is clamped and keeps its anchor note put", () => {
  const view = { lo: 36, hi: 84 };
  let zoomed = view;
  for (let i = 0; i < 20; i += 1) zoomed = zoomPitch(zoomed, 2, 0.5);
  near(zoomed.hi - zoomed.lo, MIN_PITCH_SPAN);
  for (let i = 0; i < 20; i += 1) zoomed = zoomPitch(zoomed, 0.5, 0.5);
  near(zoomed.hi - zoomed.lo, MAX_PITCH_SPAN);
  assert.ok(zoomed.lo >= 0 && zoomed.hi <= 127);
  const anchored = zoomPitch({ lo: 40, hi: 80 }, 2, 0.25);
  near(anchored.lo + 0.25 * (anchored.hi - anchored.lo), 50);
  assert.deepEqual(zoomPitch(view, 0, 0.5), view);
});

test("panning pitch down reveals higher notes and never leaves the MIDI range", () => {
  const view = { lo: 48, hi: 72 };
  const up = panPitch(view, 120, 240);
  assert.ok(up.lo > view.lo);
  near(up.hi - up.lo, 24);
  const top = panPitch(view, 1e9, 240);
  assert.equal(top.hi, 127);
  const bottom = panPitch(view, -1e9, 240);
  assert.equal(bottom.lo, 0);
  assert.deepEqual(fitPitchView(-10, 5), { lo: 0, hi: 15 });
  assert.deepEqual(fitPitchView(-10, -8), { lo: 0, hi: MIN_PITCH_SPAN });
  assert.deepEqual(fitPitchView(120, 140), { lo: 107, hi: 127 });
});

test("a stored range scales the graph to it with a margin", () => {
  const view = defaultPitchView({ low: 52, high: 69 });
  assert.ok(view.lo < 52 && view.hi > 69);
  assert.ok(52 - view.lo >= 3 && view.hi - 69 >= 3);
  assert.ok(view.hi - view.lo < 48, "narrower than the C2-C6 default");
  const wide = defaultPitchView({ low: 36, high: 84 });
  assert.ok(wide.hi - wide.lo > 48);
});

test("pinch and wheel helpers", () => {
  assert.equal(pinchFactor(100, 200), 2);
  assert.equal(pinchFactor(0, 200), 1);
  assert.equal(pinchAxis(120, 10), "time");
  assert.equal(pinchAxis(10, 120), "pitch");
  assert.equal(pinchAxis(100, 100), "time");
  assert.ok(wheelZoomFactor(-100) > 1);
  assert.ok(wheelZoomFactor(100) < 1);
  assert.ok(wheelZoomFactor(-1e6) <= 2 && wheelZoomFactor(1e6) >= 0.5);
});

test("unvoiced samples break the line into separate runs", () => {
  const samples = [
    voiced(0, 60), voiced(30, 60), voiced(60, 60),
    gap(90), gap(120),
    voiced(150, 62), voiced(180, 62),
  ];
  const runs = splitIntoRuns(samples);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].map((p) => p.tMs), [0, 30, 60]);
  assert.deepEqual(runs[1].map((p) => p.tMs), [150, 180]);
});

test("a long time gap or a detector octave slip also breaks the line, and a lone point is dropped", () => {
  const timeGap = splitIntoRuns([voiced(0, 60), voiced(30, 60), voiced(400, 60), voiced(430, 60)]);
  assert.equal(timeGap.length, 2);
  const slip = splitIntoRuns([voiced(0, 60), voiced(30, 60), voiced(60, 72), voiced(90, 72), voiced(120, 72)]);
  assert.equal(slip.length, 2);
  assert.deepEqual(slip[1].map((p) => p.tMs), [60, 90, 120]);
  assert.equal(splitIntoRuns([voiced(0, 60), gap(30), voiced(60, 62), gap(90)]).length, 0);
  assert.equal(splitIntoRuns([]).length, 0);
  // A slide of two semitones in one frame stays joined.
  assert.equal(splitIntoRuns([voiced(0, 60), voiced(30, 62)]).length, 1);
});

test("sample pitch is the nearest note plus its cents, and splitting reverses it", () => {
  near(samplePitch(voiced(0, 60, 25)), 60.25);
  near(samplePitch(voiced(0, 60, -40)), 59.6);
  assert.equal(samplePitch(gap(0)), null);
  const { midi, cents } = splitPitch(60.25);
  assert.equal(midi, 60);
  near(cents, 25, 1e-9);
  assert.equal(splitPitch(59.6).midi, 60);
});

test("line colour bands follow the tuner's tolerance rules", () => {
  assert.equal(centsClass(0, 5), "in");
  assert.equal(centsClass(-5, 5), "in");
  assert.equal(centsClass(5.1, 5), "near");
  assert.equal(centsClass(-15, 5), "near");
  assert.equal(centsClass(15.1, 5), "off");
});

test("ticks: every C is a heavy labelled line, semitone guides appear with room, labels thin out when cramped", () => {
  const full = pitchTicks({ lo: 36, hi: 84 }, 480);
  assert.equal(full.length, 49);
  const octaves = full.filter((tick) => tick.octave);
  assert.deepEqual(octaves.map((tick) => tick.midi), [36, 48, 60, 72, 84]);
  assert.ok(octaves.every((tick) => tick.labelled && tick.guide));
  const labelled = (ticks) => ticks.filter((tick) => tick.labelled).length;
  const roomy = pitchTicks({ lo: 55, hi: 67 }, 480);
  assert.equal(labelled(roomy), roomy.length, "every semitone is named when there is room");
  assert.ok(labelled(full) < labelled(roomy) * 4);
  const cramped = pitchTicks({ lo: 12, hi: 108 }, 200);
  const crampedLabels = cramped.filter((tick) => tick.labelled).map((tick) => tick.midi % 12);
  assert.ok(crampedLabels.every((pc) => pc === 0), "only Cs are named when cramped");
  assert.ok(cramped.filter((tick) => tick.guide).every((tick) => tick.octave), "no semitone guides when cramped");
  assert.ok(full.some((tick) => tick.guide && !tick.octave), "semitone guides appear in the default view");
});

test("time ticks pick a readable step and format as time ago", () => {
  assert.equal(timeTickStepSeconds(30_000), 5);
  assert.equal(timeTickStepSeconds(5_000), 1);
  assert.equal(timeTickStepSeconds(120_000), 30);
  assert.equal(formatAgo(0), "now");
  assert.equal(formatAgo(10), "-10 s");
  assert.equal(formatAgo(90), "-1:30");
  assert.equal(formatSignedCents(4.4), "+4");
  assert.equal(formatSignedCents(-12.6), "−13");
  assert.equal(formatSignedCents(0.2), "0");
});

test("the history buffer can hand back a time slice without copying everything", () => {
  const buffer = new PitchHistoryBuffer(100);
  assert.equal(buffer.oldestMs, null);
  assert.equal(buffer.latestMs, null);
  for (let i = 0; i < 50; i += 1) buffer.push(voiced(i * 30, 60));
  assert.equal(buffer.oldestMs, 0);
  assert.equal(buffer.latestMs, 1470);
  assert.deepEqual(buffer.between(300, 390).map((s) => s.tMs), [300, 330, 360, 390]);
  assert.equal(buffer.between(2000, 3000).length, 0);
  assert.equal(buffer.between(-100, 1e9).length, 50);
});

test("the vocal channel holds two minutes of frames and tells every listener, even after one throws", () => {
  const capacity = Math.ceil(120_000 / 30) + 200;
  const channel = createVocalChannel(capacity);
  assert.equal(channel.source.buffer.getCapacity(), capacity);
  assert.ok(capacity * 30 >= 120_000, "capacity covers the 2 minute maximum window");
  const seen = [];
  const stop = channel.source.subscribe((sample) => seen.push(sample.tMs));
  channel.source.subscribe(() => { throw new Error("painter bug"); });
  channel.publish(voiced(0, 60));
  channel.publish(voiced(30, 61));
  assert.deepEqual(seen, [0, 30]);
  assert.equal(channel.source.buffer.length, 2);
  stop();
  channel.publish(voiced(60, 62));
  assert.deepEqual(seen, [0, 30]);
  channel.source.clear();
  assert.equal(channel.source.buffer.length, 0);
});
