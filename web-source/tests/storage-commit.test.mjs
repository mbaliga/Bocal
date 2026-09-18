import assert from "node:assert/strict";
import test from "node:test";
import { runStoreTransaction } from "../app/idb-transaction.ts";
import { isStoredTake, extensionForMime, putStoredTake, saveOrShareFile, setStoredTakeDetails } from "../app/takes-store.ts";
import { getRuntimeStatus, clearRuntimeStatus } from "../app/runtime-status.ts";

function fixture() {
  const tx = { objectStore: () => ({}), abort() { this.onabort?.(); } };
  const db = { transaction: () => tx };
  return { tx, db };
}

test("write does not report success before the transaction completes", async () => {
  const { db, tx } = fixture();
  let settled = false;
  const promise = runStoreTransaction(db, "takes", "readwrite", (_, result) => result(42)).then((result) => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  tx.oncomplete();
  assert.equal(await promise, 42);
});
test("abort after request success rejects instead of reporting saved", async () => {
  const { db, tx } = fixture();
  const promise = runStoreTransaction(db, "takes", "readwrite", (_, result) => result(true));
  tx.error = new DOMException("Disk full", "QuotaExceededError");
  tx.onabort();
  await assert.rejects(promise, { name: "QuotaExceededError" });
});
test("explicit abort without an error rejects", async () => {
  const { db, tx } = fixture();
  const promise = runStoreTransaction(db, "takes", "readwrite", () => {});
  tx.onabort();
  await assert.rejects(promise, /aborted/);
});
test("synchronous enqueue errors abort the transaction", async () => {
  const { db, tx } = fixture();
  let aborted = false;
  tx.abort = () => { aborted = true; };
  await assert.rejects(runStoreTransaction(db, "takes", "readwrite", () => { throw new Error("bad enqueue"); }), /bad enqueue/);
  assert.equal(aborted, true);
});
test("database transaction creation errors reject", async () => {
  const db = { transaction() { throw new Error("database closed"); } };
  await assert.rejects(runStoreTransaction(db, "takes", "readonly", () => {}), /database closed/);
});
test("request error does not pretend to commit or suppress automatic abort", async () => {
  const { db, tx } = fixture();
  const promise = runStoreTransaction(db, "takes", "readwrite", () => {});
  let prevented = false;
  tx.onerror({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  tx.onabort();
  await assert.rejects(promise);
});
const take = { id: "one", name: "Take", createdAt: "2026-09-17T00:00:00Z", seconds: 2, mime: "audio/webm", blob: new Blob(["audio"]) };
for (const [label, value] of Object.entries({ missing: null, badDate: { ...take, createdAt: "invalid" }, negative: { ...take, seconds: -1 }, infinite: { ...take, seconds: Infinity }, noBlob: { ...take, blob: {} }, noId: { ...take, id: "" } })) {
  test(`invalid stored metadata is rejected: ${label}`, () => assert.equal(isStoredTake(value), false));
}
test("valid saved take is accepted", () => assert.equal(isStoredTake(take), true));
test("tags and notes are optional on a stored take", () => {
  assert.equal(isStoredTake({ ...take, tags: ["lesson", "warm-up"], notes: "felt good" }), true);
  assert.equal(isStoredTake({ ...take, tags: undefined, notes: undefined }), true);
});
test("setStoredTakeDetails reports failure when storage is unavailable", async () => {
  const original = globalThis.indexedDB;
  try {
    delete globalThis.indexedDB;
    clearRuntimeStatus();
    assert.equal(await setStoredTakeDetails("one", { tags: ["lesson"] }), false);
    assert.match(getRuntimeStatus().message, /Tags and notes/);
  } finally { if (original !== undefined) globalThis.indexedDB = original; }
});
test("storage unavailable returns false and a visible failure message", async () => {
  const original = globalThis.indexedDB;
  try {
    delete globalThis.indexedDB;
    clearRuntimeStatus();
    assert.equal(await putStoredTake(take), false);
    assert.match(getRuntimeStatus().message, /not saved/);
  } finally { if (original !== undefined) globalThis.indexedDB = original; }
});
for (const [mime, extension] of [["audio/mp4", "m4a"], ["audio/mpeg", "mp3"], ["audio/ogg;codecs=opus", "ogg"], ["audio/wav", "wav"], ["audio/flac", "flac"], ["audio/aac", "aac"], ["audio/webm", "webm"]]) {
  test(`export extension follows container: ${mime}`, () => assert.equal(extensionForMime(mime), extension));
}
test("Android without save bridge reports failure without a blob fallback", async () => {
  const original = globalThis.window;
  try {
    globalThis.window = { bocalHost: {}, dispatchEvent() {} };
    await saveOrShareFile(new File(["x"], "take.webm", { type: "audio/webm" }));
    assert.match(getRuntimeStatus().message, /does not support file export/);
  } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
});
test("oversized Android export is rejected before base64 allocation", async () => {
  const original = globalThis.window;
  try {
    globalThis.window = { bocalHost: { saveFile() { assert.fail("must not transfer"); } }, dispatchEvent() {} };
    await saveOrShareFile({ size: 32 * 1024 * 1024 + 1 });
    assert.match(getRuntimeStatus().message, /32 MiB/);
  } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
});
