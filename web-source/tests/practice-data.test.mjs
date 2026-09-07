import assert from "node:assert/strict";
import test from "node:test";

// practice-data.ts's write helpers touch `window`/`localStorage` guarded by
// `typeof window === "undefined"` checks, so a minimal in-memory stub lets
// the persistence round-trip run under plain Node without a DOM.
function installStorageStub() {
  const store = new Map();
  const events = [];
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  globalThis.window = {
    dispatchEvent: (event) => events.push(event?.type),
  };
  return { store, events };
}
installStorageStub();

const {
  parsePracticeActivities,
  recordPracticeActivity,
  parseSongWishlist,
  addSongWish,
  updateSongWish,
  PRACTICE_ACTIVITY_STORAGE_KEY,
  SONG_WISHLIST_STORAGE_KEY,
} = await import("../app/practice-data.ts");

// ---------------------------------------------------------------------------
// parsePracticeActivities
// ---------------------------------------------------------------------------

test("parsePracticeActivities returns [] for missing, null, or malformed input", () => {
  assert.deepEqual(parsePracticeActivities(null), []);
  assert.deepEqual(parsePracticeActivities(undefined), []);
  assert.deepEqual(parsePracticeActivities(""), []);
  assert.deepEqual(parsePracticeActivities("not json"), []);
  assert.deepEqual(parsePracticeActivities("{}"), []); // object, not an array
  assert.deepEqual(parsePracticeActivities("null"), []);
  assert.deepEqual(parsePracticeActivities("42"), []);
});

test("parsePracticeActivities drops entries missing required fields or with an unknown type", () => {
  const valid = { id: "a1", capturedAt: "2026-01-01T00:00:00.000Z", seconds: 60, type: "tuning" };
  const missingSeconds = { id: "a2", capturedAt: "2026-01-01T00:00:00.000Z", type: "tuning" };
  const badType = { id: "a3", capturedAt: "2026-01-01T00:00:00.000Z", seconds: 10, type: "juggling" };
  const notObject = "just a string";
  const result = parsePracticeActivities(JSON.stringify([valid, missingSeconds, badType, notObject, null]));
  assert.deepEqual(result, [valid]);
});

test("parsePracticeActivities accepts every known activity type", () => {
  const types = ["tuning", "fingering", "rhythm", "chords", "analysis", "repertoire", "session"];
  const entries = types.map((type, i) => ({ id: `id-${i}`, capturedAt: "2026-01-01T00:00:00.000Z", seconds: 1, type }));
  const result = parsePracticeActivities(JSON.stringify(entries));
  assert.equal(result.length, types.length);
});

// ---------------------------------------------------------------------------
// recordPracticeActivity
// ---------------------------------------------------------------------------

test("recordPracticeActivity writes a rounded, clamped entry and dispatches an event", () => {
  const { store, events } = installStorageStub();
  recordPracticeActivity({ type: "rhythm", seconds: 12.6, instrumentId: "alto-sax" });
  const saved = parsePracticeActivities(store.get(PRACTICE_ACTIVITY_STORAGE_KEY));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].seconds, 13); // rounded
  assert.equal(saved[0].type, "rhythm");
  assert.equal(saved[0].instrumentId, "alto-sax");
  assert.equal(typeof saved[0].id, "string");
  assert.ok(events.includes("bocal-practice-activity"));
});

test("recordPracticeActivity clamps negative seconds to zero and prepends newest-first", () => {
  const { store } = installStorageStub();
  recordPracticeActivity({ type: "tuning", seconds: -5 });
  recordPracticeActivity({ type: "chords", seconds: 30 });
  const saved = parsePracticeActivities(store.get(PRACTICE_ACTIVITY_STORAGE_KEY));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].type, "chords"); // most recent first
  assert.equal(saved[1].seconds, 0);
});

test("recordPracticeActivity caps stored history at 360 entries", () => {
  const { store } = installStorageStub();
  for (let i = 0; i < 365; i += 1) {
    recordPracticeActivity({ type: "session", seconds: 1, id: `cap-${i}`, capturedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z` });
  }
  const saved = parsePracticeActivities(store.get(PRACTICE_ACTIVITY_STORAGE_KEY));
  assert.equal(saved.length, 360);
});

// ---------------------------------------------------------------------------
// parseSongWishlist / addSongWish / updateSongWish
// ---------------------------------------------------------------------------

test("parseSongWishlist returns [] for malformed input and filters bad entries", () => {
  assert.deepEqual(parseSongWishlist(null), []);
  assert.deepEqual(parseSongWishlist("{}"), []);
  const valid = { id: "w1", title: "Take Five", addedAt: "2026-01-01T00:00:00.000Z", status: "wishlist" };
  const badStatus = { id: "w2", title: "Bad", addedAt: "2026-01-01T00:00:00.000Z", status: "done" };
  assert.deepEqual(parseSongWishlist(JSON.stringify([valid, badStatus])), [valid]);
});

test("addSongWish trims/collapses whitespace, caps length, and ignores an empty title", () => {
  const { store } = installStorageStub();
  addSongWish("  Take   Five  ");
  addSongWish("");
  addSongWish("   ");
  const saved = parseSongWishlist(store.get(SONG_WISHLIST_STORAGE_KEY));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, "Take Five");
  assert.equal(saved[0].status, "wishlist");
  assert.equal(saved[0].progress, 0);
});

test("addSongWish caps the wishlist at 60 entries", () => {
  const { store } = installStorageStub();
  for (let i = 0; i < 65; i += 1) addSongWish(`Song ${i}`);
  const saved = parseSongWishlist(store.get(SONG_WISHLIST_STORAGE_KEY));
  assert.equal(saved.length, 60);
});

test("updateSongWish patches status/instrument and clamps progress to 0-100", () => {
  const { store } = installStorageStub();
  addSongWish("Autumn Leaves");
  const [{ id }] = parseSongWishlist(store.get(SONG_WISHLIST_STORAGE_KEY));
  updateSongWish(id, { status: "studying", progress: 150 });
  let saved = parseSongWishlist(store.get(SONG_WISHLIST_STORAGE_KEY));
  assert.equal(saved[0].status, "studying");
  assert.equal(saved[0].progress, 100);
  assert.equal(typeof saved[0].updatedAt, "string");

  updateSongWish(id, { progress: -20 });
  saved = parseSongWishlist(store.get(SONG_WISHLIST_STORAGE_KEY));
  assert.equal(saved[0].progress, 0);
});

test("updateSongWish is a no-op for an unknown id", () => {
  const { store } = installStorageStub();
  addSongWish("Blue Bossa");
  const before = store.get(SONG_WISHLIST_STORAGE_KEY);
  updateSongWish("does-not-exist", { status: "studying" });
  const after = store.get(SONG_WISHLIST_STORAGE_KEY);
  assert.deepEqual(JSON.parse(before), JSON.parse(after));
});
