// The summary the web app hands the Android shell for its home-screen
// widgets (app/widget-snapshot.ts). Pinned here: the seven-day window matches
// the Practice screen's, nothing a player typed into a label, note or coach
// plan rides along, and only allow-listed workspaces can be opened.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contractInput } from "./fixtures/widget-snapshot-input.mjs";

// The contract fixture is written in UTC; every other test here uses local
// dates built with the Date constructor, which hold in any zone.
process.env.TZ = "UTC";

const {
  buildWidgetSnapshot,
  hostDestination,
  HOST_DESTINATION_IDS,
  plainText,
  readWidgetStorage,
  sanitiseWeeklyGoal,
  widgetWindow,
  WIDGET_SNAPSHOT_SCHEMA_VERSION,
} = await import("../app/widget-snapshot.ts");

// Local noon on 4 November 2026, so every "days ago" below stays inside one local day.
const NOW = new Date(2026, 10, 4, 12, 0, 0);
const daysAgo = (days, hour = 10) => new Date(2026, 10, 4 - days, hour, 30, 0).toISOString();

function input(overrides = {}) {
  return {
    now: NOW,
    activities: [],
    sessions: [],
    songs: [],
    weeklyGoalMinutes: 60,
    instrumentId: "alto-sax",
    labLabel: "Lab",
    referenceHz: 440,
    temperament: "Equal",
    ...overrides,
  };
}

test("the window is today and the six days before it, oldest first", () => {
  const window = widgetWindow(NOW);
  assert.equal(window.length, 7);
  assert.equal(window[0], "2026-10-29");
  assert.equal(window[6], "2026-11-04");
});

test("minutes are bucketed per local day; Pulse and the session timer are kept apart", () => {
  const snapshot = buildWidgetSnapshot(input({
    activities: [
      { id: "a", capturedAt: daysAgo(0), seconds: 600, type: "tuning" },
      { id: "b", capturedAt: daysAgo(0, 11), seconds: 300.4, type: "rhythm" },
      { id: "c", capturedAt: daysAgo(3), seconds: 120, type: "rhythm" },
      { id: "d", capturedAt: daysAgo(7), seconds: 999, type: "tuning" },
      { id: "e", capturedAt: "not a date", seconds: 50, type: "tuning" },
      { id: "f", capturedAt: daysAgo(1), seconds: -40, type: "vocal" },
    ],
    sessions: [{ date: daysAgo(0), seconds: 1500 }, { date: daysAgo(10), seconds: 900 }],
  }));
  assert.equal(snapshot.schemaVersion, WIDGET_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.publishedAt, NOW.getTime());
  const today = snapshot.days.at(-1);
  assert.deepEqual(today, { date: "2026-11-04", seconds: 900, pulseSeconds: 300, timerSeconds: 1500 });
  assert.deepEqual(snapshot.days.find((day) => day.date === "2026-11-01"), { date: "2026-11-01", seconds: 120, pulseSeconds: 120, timerSeconds: 0 });
  assert.equal(snapshot.days.find((day) => day.date === "2026-11-03").seconds, 0, "negative seconds count as zero");
  assert.equal(snapshot.days.reduce((sum, day) => sum + day.seconds, 0), 1020, "eight days ago and undated rows stay out");
});

test("recent rows are newest first and carry type, length and time only", () => {
  const activities = Array.from({ length: 8 }, (_, index) => ({
    id: `row-${index}`,
    capturedAt: daysAgo(index),
    seconds: 60 * (index + 1),
    type: index === 2 ? "rhythm" : "tuning",
    label: "My teacher Ana's assignment",
    notes: ["A4", "B4"],
    instrumentId: "alto-sax",
  }));
  const snapshot = buildWidgetSnapshot(input({ activities: activities.reverse() }));
  assert.equal(snapshot.recent.length, 5);
  assert.deepEqual(Object.keys(snapshot.recent[0]).sort(), ["capturedAt", "seconds", "type"]);
  assert.equal(snapshot.recent[0].capturedAt, Date.parse(daysAgo(0)));
  assert.equal(snapshot.lastPulseAt, Date.parse(daysAgo(2)));
  const json = JSON.stringify(snapshot);
  assert.doesNotMatch(json, /Ana/);
  assert.doesNotMatch(json, /"notes"/);
});

test("no Pulse activity means no last-Pulse time", () => {
  assert.equal(buildWidgetSnapshot(input()).lastPulseAt, null);
});

test("songs: the most recently touched Studying titles, cleaned, with counts", () => {
  const snapshot = buildWidgetSnapshot(input({
    songs: [
      { id: "1", title: "Autumn Leaves", addedAt: daysAgo(9), updatedAt: daysAgo(4), status: "studying", progress: 40 },
      { id: "2", title: "  Blue\u202e Bossa\n", addedAt: daysAgo(8), updatedAt: daysAgo(1), status: "studying", progress: 140 },
      { id: "3", title: "Wish", addedAt: daysAgo(2), status: "wishlist", progress: 0 },
      { id: "4", title: "Old", addedAt: daysAgo(30), status: "studying" },
      { id: "5", title: "Fourth", addedAt: daysAgo(31), status: "studying", progress: 5 },
    ],
  }));
  assert.deepEqual(snapshot.songs.studying, [
    { title: "Blue Bossa", progress: 100 },
    { title: "Autumn Leaves", progress: 40 },
    { title: "Old", progress: 0 },
  ]);
  assert.equal(snapshot.songs.studyingCount, 4);
  assert.equal(snapshot.songs.wishlistCount, 1);
});

test("instrument and tuning come from the app's own sources, with the chart's review badge", () => {
  const alto = buildWidgetSnapshot(input());
  assert.equal(alto.instrument.name, "Alto saxophone");
  assert.equal(alto.instrument.pitchLabel, "E\u266d");
  assert.equal(alto.instrument.writtenOffset, 9);
  assert.equal(alto.instrument.labLabel, "Lab");
  assert.equal(alto.instrument.review, "Method-book consensus, not yet teacher-reviewed");
  assert.deepEqual(alto.tuning, { referenceHz: 440, temperament: "Equal" });

  const harp = buildWidgetSnapshot(input({ instrumentId: "diatonic-harmonica", labLabel: "Chart" }));
  assert.match(harp.instrument.review, /computed, not teacher-reviewed/);

  for (const instrumentId of ["guitar", "vocal"]) {
    assert.equal(buildWidgetSnapshot(input({ instrumentId })).instrument.review, null, `${instrumentId} has no chart badge to carry`);
  }

  assert.equal(buildWidgetSnapshot(input({ referenceHz: 9000 })).tuning.referenceHz, 440, "an out-of-range A4 falls back to the default");
  assert.equal(buildWidgetSnapshot(input({ referenceHz: 442 })).tuning.referenceHz, 442);
});

test("the weekly goal reads like the Practice screen's, with its default for junk", () => {
  assert.equal(sanitiseWeeklyGoal(null), 60);
  assert.equal(sanitiseWeeklyGoal("90"), 90);
  assert.equal(sanitiseWeeklyGoal("banana"), 60);
  assert.equal(sanitiseWeeklyGoal("0"), 60);
  assert.equal(sanitiseWeeklyGoal("-30"), 60);
});

test("storage is read key by key, and a throwing key does not blank the rest", () => {
  const values = new Map([
    ["bocal-practice-activity-v1", JSON.stringify([{ id: "x", capturedAt: daysAgo(0), seconds: 60, type: "tuning" }])],
    ["bocal-weekly-goal-minutes", "120"],
  ]);
  const read = readWidgetStorage({
    getItem(key) {
      if (key === "bocal-song-wishlist-v1") throw new Error("blocked");
      return values.get(key) ?? null;
    },
  });
  assert.equal(read.activities.length, 1);
  assert.deepEqual(read.songs, []);
  assert.deepEqual(read.sessions, []);
  assert.equal(read.weeklyGoalMinutes, 120);
});

test("plain text drops control and direction-override characters and caps the length", () => {
  assert.equal(plainText("a\u0007b\u2066c\u2069  d", 20), "a b c d");
  assert.equal(plainText("x".repeat(30), 10), "x".repeat(10));
  assert.equal(plainText("\ud83c\udfb7\ud83c\udfb7\ud83c\udfb7", 2), "\ud83c\udfb7\ud83c\udfb7", "never splits a surrogate pair");
});

test("only allow-listed workspaces can be opened from a widget", () => {
  assert.deepEqual(hostDestination("practice:log"), { mode: "practice", seat: "log", section: "ctx-practice-log" });
  assert.deepEqual(hostDestination("tune"), { mode: "tune" });
  assert.equal(hostDestination("javascript:alert(1)"), null);
  assert.equal(hostDestination("__proto__"), null);
  assert.equal(hostDestination(""), null);
  assert.equal(hostDestination(undefined), null);
  assert.ok(HOST_DESTINATION_IDS.includes("pulse:drone"));
});

test("every widget destination's section exists in the app, and the Android shell lists the same ids", async () => {
  const sources = await Promise.all(["PulseView.tsx", "PracticeTools.tsx", "ToneGenerator.tsx"].map((name) => readFile(new URL(`../app/${name}`, import.meta.url), "utf8")));
  for (const id of HOST_DESTINATION_IDS) {
    const section = hostDestination(id).section;
    if (section) assert.ok(sources.some((source) => source.includes(`id="${section}"`)), `${id} scrolls to #${section}, which must exist`);
  }
  const native = await readFile(new URL("../../android/app/src/main/java/com/bocal/music/widget/WidgetDestination.kt", import.meta.url), "utf8");
  const nativeIds = [...native.matchAll(/\("([a-z:]+)"\)/g)].map((match) => match[1]).sort();
  assert.deepEqual(nativeIds, [...HOST_DESTINATION_IDS].sort());
});

test("the page publishes the snapshot and the session timer and goal announce their changes", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const practice = await readFile(new URL("../app/PracticeTools.tsx", import.meta.url), "utf8");
  assert.match(page, /useWidgetSnapshotPublisher\(/);
  assert.match(page, /new Event\(SESSIONS_EVENT\)/);
  assert.match(page, /takeOpenRequest/);
  assert.match(practice, /new Event\(WEEKLY_GOAL_EVENT\)/);
});

test("the snapshot matches the contract fixture the Android tests parse", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../android/app/src/test/resources/widget-snapshot-v1.json", import.meta.url), "utf8"));
  assert.deepEqual(buildWidgetSnapshot(contractInput()), fixture);
});
