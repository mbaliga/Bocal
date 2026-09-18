import assert from "node:assert/strict";
import test from "node:test";
import { audioImportError, canCreateTake, CaptureRequestGate, KeyedTaskQueue, MAX_IMPORT_BYTES, MAX_TAGS, MAX_TAG_LENGTH, MAX_TAKE_NOTES_LENGTH, sanitizeTags, sanitizeTakeNotes, takeId } from "../app/take-policy.ts";

test("a full take library refuses new capture without evicting anything", () => {
  assert.equal(canCreateTake(11, true, 12), true);
  assert.equal(canCreateTake(12, true, 12), false);
  assert.equal(canCreateTake(13, true, 12), false);
});
test("restoration must finish before new takes can be accepted", () => {
  assert.equal(canCreateTake(0, false, 12), false);
  assert.equal(canCreateTake(0, true, 12), true);
});
test("invalid take counts fail closed", () => {
  for (const count of [-1, NaN, Infinity, 0.5]) assert.equal(canCreateTake(count, true, 12), false);
});
test("audio import limits are checked before decoding or allocating a URL", () => {
  assert.equal(audioImportError({ size: MAX_IMPORT_BYTES, type: "audio/wav", name: "take.wav" }), null);
  assert.match(audioImportError({ size: MAX_IMPORT_BYTES + 1, type: "audio/wav", name: "take.wav" }), /32 MiB/);
  assert.match(audioImportError({ size: 0, type: "audio/wav", name: "take.wav" }), /non-empty/);
});
test("missing MIME accepts an audio extension but not an unrelated file", () => {
  assert.equal(audioImportError({ size: 1, type: "", name: "take.M4A" }), null);
  assert.match(audioImportError({ size: 1, type: "", name: "data.json" }), /not recognised/);
  assert.match(audioImportError({ size: 1, type: "text/html", name: "take.mp3" }), /not recognised/);
});
test("stop invalidates a pending microphone result", () => {
  const gate = new CaptureRequestGate();
  const first = gate.begin();
  assert.equal(gate.accepts(first), true);
  gate.cancel();
  assert.equal(gate.accepts(first), false);
  const next = gate.begin();
  assert.equal(gate.accepts(next), true);
  assert.equal(gate.accepts(first), false);
});
test("a second start invalidates the first start", () => {
  const gate = new CaptureRequestGate();
  const first = gate.begin();
  const next = gate.begin();
  assert.equal(gate.accepts(first), false);
  assert.equal(gate.accepts(next), true);
});
test("create, rename and delete execute in order even when create is delayed", async () => {
  const queue = new KeyedTaskQueue();
  const calls = [];
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const create = queue.run("one", async () => { await blocker; calls.push("create"); });
  const rename = queue.run("one", async () => calls.push("rename"));
  const remove = queue.run("one", async () => calls.push("delete"));
  await Promise.resolve();
  assert.deepEqual(calls, []);
  release();
  await Promise.all([create, rename, remove]);
  assert.deepEqual(calls, ["create", "rename", "delete"]);
});
test("one failed write does not poison subsequent work on that recording", async () => {
  const queue = new KeyedTaskQueue();
  const first = queue.run("one", async () => { throw new Error("quota"); });
  const second = queue.run("one", async () => "retry");
  await assert.rejects(first, /quota/);
  assert.equal(await second, "retry");
});
test("unrelated recordings do not wait for each other's writes", async () => {
  const queue = new KeyedTaskQueue();
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const first = queue.run("one", () => blocker);
  assert.equal(await queue.run("two", async () => 2), 2);
  release();
  await first;
});
test("rapid recording creation does not reuse IDs", () => {
  assert.equal(new Set(Array.from({ length: 1000 }, takeId)).size, 1000);
});
test("sanitizeTags trims, drops empties and caps tag length", () => {
  assert.deepEqual(sanitizeTags(["  warm-up  ", "", "   ", "lesson"]), ["warm-up", "lesson"]);
  const long = "x".repeat(MAX_TAG_LENGTH + 20);
  assert.equal(sanitizeTags([long])[0].length, MAX_TAG_LENGTH);
});
test("sanitizeTags de-duplicates case-insensitively, keeping the first casing", () => {
  assert.deepEqual(sanitizeTags(["Warm-up", "warm-up", "WARM-UP", "lesson"]), ["Warm-up", "lesson"]);
});
test("sanitizeTags caps the number of tags kept", () => {
  const many = Array.from({ length: MAX_TAGS + 10 }, (_, index) => `tag-${index}`);
  assert.equal(sanitizeTags(many).length, MAX_TAGS);
  assert.deepEqual(sanitizeTags(many), many.slice(0, MAX_TAGS));
});
test("sanitizeTags fails closed on non-array or non-string input", () => {
  assert.deepEqual(sanitizeTags(undefined), []);
  assert.deepEqual(sanitizeTags(null), []);
  assert.deepEqual(sanitizeTags("warm-up"), []);
  assert.deepEqual(sanitizeTags([1, null, {}, "ok"]), ["ok"]);
});
test("sanitizeTakeNotes trims to a string and caps length", () => {
  assert.equal(sanitizeTakeNotes(undefined), "");
  assert.equal(sanitizeTakeNotes(null), "");
  assert.equal(sanitizeTakeNotes(42), "");
  assert.equal(sanitizeTakeNotes("a good take"), "a good take");
  assert.equal(sanitizeTakeNotes("x".repeat(MAX_TAKE_NOTES_LENGTH + 50)).length, MAX_TAKE_NOTES_LENGTH);
});
