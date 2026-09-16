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
