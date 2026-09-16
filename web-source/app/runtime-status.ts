/** Local-only failure reporting. Never sends recordings, filenames or errors to a server. */
export const RUNTIME_STATUS_EVENT = "bocal:runtime-status";
export type RuntimeStatus = { message: string; sequence: number };
let latest: RuntimeStatus | null = null;
let sequence = 0;
export function getRuntimeStatus(): RuntimeStatus | null { return latest; }
export function reportRuntimeStatus(message: string): void {
  latest = { message, sequence: ++sequence };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUNTIME_STATUS_EVENT));
}
export function clearRuntimeStatus(): void {
  latest = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RUNTIME_STATUS_EVENT));
}
