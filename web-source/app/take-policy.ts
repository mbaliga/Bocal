/** Pure recording safeguards, shared by the UI and regression tests. */
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 10 * 60;
export const RECORDING_STOP_BYTES = 24 * 1024 * 1024;

export function canCreateTake(count: number, ready: boolean, limit: number): boolean {
  return ready && Number.isInteger(count) && count >= 0 && count < limit;
}

export function audioImportError(file: { size: number; type: string; name: string }): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "Choose a non-empty audio file.";
  if (file.size > MAX_IMPORT_BYTES) return "Choose an audio file smaller than 32 MiB.";
  if (!file.type.startsWith("audio/") && !(file.type === "" && /\.(wav|mp3|m4a|mp4|ogg|oga|opus|webm|flac|aac)$/i.test(file.name))) {
    return "This file is not recognised as audio. Choose a WAV, MP3, M4A, Ogg, WebM, FLAC or AAC recording.";
  }
  return null;
}

export function takeId(): string {
  return `take-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** Longest a single tag may be, and the most tags a take keeps -- generous
 *  for "warm-up", "audition rep", a piece title, but bounded so a stray
 *  paste can't blow up the stored record or the filter chips it renders as. */
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS = 8;
export const MAX_TAKE_NOTES_LENGTH = 500;

/**
 * Cleans a take's free-text tags for storage: trims, drops empties and
 * duplicates (case-insensitively, keeping the first casing seen), caps
 * length per tag and count overall. Pure so both the UI and the IndexedDB
 * read path (a record edited by a future app version, or corrupted) can
 * run the same rule rather than trusting whatever is already on disk.
 */
export function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(trimmed);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/** Cleans a take's free-text notes field the same way: a string, trimmed,
 *  length-capped, anything else (missing, wrong type) becomes "". */
export function sanitizeTakeNotes(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TAKE_NOTES_LENGTH) : "";
}

/** Invalidates delayed microphone promises after stop, navigation or backgrounding. */
export class CaptureRequestGate {
  private generation = 0;
  begin(): number { return ++this.generation; }
  cancel(): void { this.generation += 1; }
  accepts(ticket: number): boolean { return ticket === this.generation; }
}

/** Preserve write order per recording, including writes that are still opening IndexedDB.
 * In particular: create -> rename -> delete must never resurrect a deleted recording.
 */
export class KeyedTaskQueue {
  private pending = new Map<string, Promise<void>>();
  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();
    const result = previous.then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.pending.set(key, settled);
    void settled.then(() => { if (this.pending.get(key) === settled) this.pending.delete(key); });
    return result;
  }
}
