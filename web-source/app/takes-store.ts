import "./native-bridge";
import { runStoreTransaction } from "./idb-transaction";
import { reportRuntimeStatus } from "./runtime-status";
import { sanitizeTags, sanitizeTakeNotes } from "./take-policy";

const DB_NAME = "bocal-analysis-takes";
const DB_VERSION = 1;
const STORE = "takes";
export const MAX_TAKES = 12;
export const MAX_NATIVE_EXPORT_BYTES = 32 * 1024 * 1024;
export type StoredTake = {
  id: string;
  name: string;
  createdAt: string;
  seconds: number;
  mime: string;
  blob: Blob;
  /** Free-text labels the player attaches for their own sorting/filtering,
   *  e.g. "warm-up", "lesson", a piece title. Sanitised on write and on
   *  every read (see isStoredTake), so an older record without them, or one
   *  a future version wrote differently, still comes back valid. */
  tags?: string[];
  /** A short free-text note about the take. Same sanitise-on-read rule. */
  notes?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error("Recording storage did not respond. Close other Bocal tabs and retry.")), 10000);
    function fail(error: unknown) {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onblocked = () => fail(new Error("Recording storage is blocked by another Bocal tab."));
      request.onerror = () => fail(request.error ?? new Error("Could not open recording storage."));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true; clearTimeout(timer);
        db.onversionchange = () => db.close();
        resolve(db);
      };
    } catch (error) { fail(error); }
  });
}
async function withStore<T>(mode: IDBTransactionMode, enqueue: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDb();
  try { return await runStoreTransaction<T>(db, STORE, mode, enqueue); }
  finally { db.close(); }
}
export function isStoredTake(value: unknown): value is StoredTake {
  if (!value || typeof value !== "object") return false;
  const take = value as Partial<StoredTake>;
  return typeof take.id === "string" && take.id.length > 0 && typeof take.name === "string" && typeof take.mime === "string" &&
    typeof take.createdAt === "string" && Number.isFinite(Date.parse(take.createdAt)) &&
    typeof take.seconds === "number" && Number.isFinite(take.seconds) && take.seconds >= 0 && take.blob instanceof Blob;
}
/** Sanitises a validated record's free-text fields on the way out of storage,
 *  so a record from an older Bocal version (no tags/notes at all) or one
 *  edited outside the app still comes back within the same bounds the write
 *  path enforces, rather than trusting the disk copy as-is. */
function normalizeStoredTake(take: StoredTake): StoredTake {
  return { ...take, tags: sanitizeTags(take.tags), notes: sanitizeTakeNotes(take.notes) };
}
export async function listStoredTakes(): Promise<StoredTake[]> {
  try {
    const all = await withStore<unknown[]>("readonly", (store, result) => {
      const request = store.getAll(); request.onsuccess = () => result(request.result);
    });
    const valid = all.filter(isStoredTake).map(normalizeStoredTake);
    if (valid.length !== all.length) reportRuntimeStatus("Some saved recordings could not be read. They have not been deleted.");
    return valid.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  } catch {
    reportRuntimeStatus("Recording storage is unavailable. New takes may be session-only; export them before closing Bocal.");
    return [];
  }
}
export async function putStoredTake(take: StoredTake): Promise<boolean> {
  try {
    if (!isStoredTake(take)) throw new Error("Invalid recording metadata.");
    await withStore<void>("readwrite", (store) => { store.put(normalizeStoredTake(take)); });
    return true;
  } catch {
    reportRuntimeStatus("This recording was not saved to device storage. Export it before closing Bocal, then check free space.");
    return false;
  }
}
export async function deleteStoredTake(id: string): Promise<boolean> {
  try { await withStore<void>("readwrite", (store) => { store.delete(id); }); return true; }
  catch { reportRuntimeStatus("The recording could not be deleted from storage. It has been kept in your library; please retry."); return false; }
}
export async function renameStoredTake(id: string, name: string): Promise<boolean> {
  try {
    const found = await withStore<boolean>("readwrite", (store, result) => {
      const request = store.get(id);
      request.onsuccess = () => {
        result(Boolean(request.result));
        if (request.result) store.put({ ...request.result, name: name.slice(0, 60) });
      };
    });
    if (!found) reportRuntimeStatus("This recording is no longer in storage. Export the session copy before closing Bocal.");
    return found;
  } catch { reportRuntimeStatus("The new recording name could not be saved. Please retry before closing Bocal."); return false; }
}
/** Updates a take's tags and/or notes in place, same in-storage-record
 *  pattern as renameStoredTake. Either field may be omitted to leave it
 *  unchanged; both are sanitised before being written. */
export async function setStoredTakeDetails(id: string, details: { tags?: string[]; notes?: string }): Promise<boolean> {
  try {
    const found = await withStore<boolean>("readwrite", (store, result) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const existing = request.result as StoredTake | undefined;
        result(Boolean(existing));
        if (!existing) return;
        const next: StoredTake = { ...existing };
        if (details.tags !== undefined) next.tags = sanitizeTags(details.tags);
        if (details.notes !== undefined) next.notes = sanitizeTakeNotes(details.notes);
        store.put(next);
      };
    });
    if (!found) reportRuntimeStatus("This recording is no longer in storage. Export the session copy before closing Bocal.");
    return found;
  } catch { reportRuntimeStatus("Tags and notes could not be saved. Please retry before closing Bocal."); return false; }
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Could not encode the export.")); else resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the export."));
    reader.onabort = () => reject(new Error("Export cancelled.")); reader.readAsDataURL(blob);
  });
}
/** Native acceptance is not disk completion. The system picker reports the final result.
 * Never use a blob-download fallback in Android: that path is a silent no-op.
 */
export async function saveOrShareFile(file: File): Promise<void> {
  try {
    const host = typeof window !== "undefined" ? window.bocalHost : undefined;
    if (host) {
      if (!host.saveFile) throw new Error("This Android build does not support file export. Update Bocal and retry.");
      if (file.size > MAX_NATIVE_EXPORT_BYTES) throw new Error("This export exceeds the 32 MiB Android transfer limit. Use a shorter recording.");
      const base64 = await blobToBase64(file);
      if (!host.saveFile(file.name, file.type || "application/octet-stream", base64)) throw new Error("Export could not start. Finish any open save dialog, then retry.");
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a"); link.href = url; link.download = file.name; link.style.display = "none";
    try { document.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } catch (error) { reportRuntimeStatus(error instanceof Error ? error.message : "Export failed. Your original recording has not been deleted."); }
}
export function extensionForMime(mime: string): string {
  const type = mime.toLowerCase();
  if (type.includes("mp4") || type.includes("m4a")) return "m4a";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("flac")) return "flac";
  if (type.includes("aac")) return "aac";
  return "webm";
}
