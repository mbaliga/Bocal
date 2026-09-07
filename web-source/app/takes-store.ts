import "./native-bridge";
/**
 * IndexedDB-backed storage for Analyze takes.
 *
 * Takes used to live only in a useState array with object URLs pointing at
 * in-memory blobs: a reload, a backgrounded tab getting discarded, or the
 * Android WebView's onRenderProcessGone recreating the WebView all lost
 * every recording. IndexedDB survives all three.
 */

const DB_NAME = "bocal-analysis-takes";
const DB_VERSION = 1;
const STORE = "takes";
export const MAX_TAKES = 12;

export type StoredTake = {
  id: string;
  name: string;
  createdAt: string;
  seconds: number;
  /** The recorder's or imported file's MIME type, used both for playback
   *  and to give a downloaded file the right extension. */
  mime: string;
  blob: Blob;
};

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the takes database."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Takes database request failed."));
    });
  } finally {
    db.close();
  }
}

/** All stored takes, newest first. Returns [] (rather than throwing) when
 *  IndexedDB is unavailable -- Safari private mode and some embedded
 *  WebViews -- so a take still records for the session, it just won't
 *  survive a reload. */
export async function listStoredTakes(): Promise<StoredTake[]> {
  if (!hasIndexedDb()) return [];
  try {
    const all = await withStore<StoredTake[]>("readonly", (store) => store.getAll());
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function putStoredTake(take: StoredTake): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    await withStore("readwrite", (store) => store.put(take));
    return true;
  } catch {
    return false;
  }
}

export async function deleteStoredTake(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await withStore("readwrite", (store) => store.delete(id));
  } catch {
    // Nothing useful to do with a failed delete of a take the UI already
    // dropped from its own list.
  }
}

export async function renameStoredTake(id: string, name: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const existing = await withStore<StoredTake | undefined>("readonly", (store) => store.get(id));
    if (!existing) return;
    await withStore("readwrite", (store) => store.put({ ...existing, name }));
  } catch {
    // Best-effort; the in-memory name still updates in the UI either way.
  }
}

/** Extension to give a downloaded/exported take, derived from its MIME type
 *  rather than hard-coded to .webm -- an imported MP3 or an iOS m4a
 *  recording should keep its real container. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
}

/** Hands a file to the Android host's native save path when the WebView
 *  bridge is present (blob: downloads and Web Share are silently swallowed
 *  in the WebView -- see analysis.md); falls back to the ordinary
 *  anchor-download path everywhere else. */
export async function saveOrShareFile(file: File) {
  const host = typeof window !== "undefined" ? window.bocalHost : undefined;
  if (host?.saveFile) {
    try {
      const base64 = await blobToBase64(file);
      if (host.saveFile(file.name, file.type || "application/octet-stream", base64)) return;
    } catch {
      // Fall through to the anchor path below.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
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
