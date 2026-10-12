"use client";

import { Download, FileAudio, Mic, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { INSTRUMENTS } from "./instruments";
import type { NotationSystem } from "./notation";
import { recordPracticeActivity } from "./practice-data";
import { TUNING_KEYS } from "./storage-keys";
import { deleteStoredTake, extensionForMime, listStoredTakes, MAX_TAKES, putStoredTake, renameStoredTake, saveOrShareFile, type StoredTake } from "./takes-store";
import { canCreateTake, CaptureRequestGate, KeyedTaskQueue, MAX_RECORDING_SECONDS, RECORDING_STOP_BYTES, takeId } from "./take-policy";
import { forgetTakeAnalysis, TakePitchTrace, type TakeOverlayAlign } from "./TakePitchTrace";
import { REFERENCE_HZ_DEFAULT, REFERENCE_HZ_MAX, REFERENCE_HZ_MIN, TEMPERAMENT_PROFILES, type TemperamentId, type TuningOptions } from "./tuning";
import type { VocalRange } from "./vocal-range";
import "./styles/analysis.css";

type VocalTake = StoredTake & { url: string };

const VOCAL = INSTRUMENTS.vocal;

// The same calibration the Analyze view reads, so a take's pitch trace is set
// against the reference pitch and temperament the singer was tuning to.
// Read-only: nothing here writes these keys.
function readTuningOptions(): TuningOptions {
  const fallback: TuningOptions = { referenceHz: REFERENCE_HZ_DEFAULT, temperament: "equal", keyPc: 0 };
  if (typeof window === "undefined") return fallback;
  try {
    const savedHz = Number(window.localStorage.getItem(TUNING_KEYS.referenceHz));
    const referenceHz = Number.isFinite(savedHz) && savedHz >= REFERENCE_HZ_MIN && savedHz <= REFERENCE_HZ_MAX ? savedHz : fallback.referenceHz;
    const savedTemperament = window.localStorage.getItem(TUNING_KEYS.temperament);
    const hasTemperament = savedTemperament ? Object.prototype.hasOwnProperty.call(TEMPERAMENT_PROFILES, savedTemperament) : false;
    const temperament: TemperamentId = savedTemperament && hasTemperament ? savedTemperament as TemperamentId : "equal";
    const savedKeyPc = Number(window.localStorage.getItem(TUNING_KEYS.keyPc));
    return { referenceHz, temperament, keyPc: Number.isInteger(savedKeyPc) && savedKeyPc >= 0 && savedKeyPc < 12 ? savedKeyPc : 0 };
  } catch { return fallback; }
}

function formatLength(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.toLocaleDateString([], { day: "numeric", month: "short" })}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function exportName(take: StoredTake) {
  const base = take.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "bocal-vocal-take";
  return `${base}.${extensionForMime(take.mime)}`;
}

export type VocalTakesProps = {
  /** Whether the stage's microphone (the tuner) is running; only used to say what the graph can show while recording. */
  listening: boolean;
  notation: NotationSystem;
  saTonic: number;
  range: VocalRange | null;
  /** Half-width, in cents, of the colour band the stage graph uses. */
  toleranceCents: number;
};

/**
 * Saved vocal takes. Recording follows the Analyze recorder's rules exactly
 * (the same capture gate, the same 12-take library that never evicts, writes
 * that only count as saved once the transaction commits) and stores the take
 * with `kind: "vocal"`. Playback shows the take's own pitch line, read by the
 * same offline analysis Analyze uses, on the Vocal graph's pitch scale, and a
 * second vocal take can be laid over it. Nothing here rates a take.
 */
export function VocalTakes({ listening, notation, saTonic, range, toleranceCents }: VocalTakesProps) {
  const mountedRef = useRef(true);
  const gateRef = useRef(new CaptureRequestGate());
  const requestingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const libraryReadyRef = useRef(false);
  const allTakesRef = useRef<StoredTake[]>([]);
  const takesRef = useRef<VocalTake[]>([]);
  const persistedIdsRef = useRef(new Set<string>());
  const writesRef = useRef(new KeyedTaskQueue());
  const deletingRef = useRef(new Set<string>());
  const urlsRef = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tuningOptions] = useState<TuningOptions>(readTuningOptions);

  const [takes, setTakes] = useState<VocalTake[]>([]);
  const [totalTakes, setTotalTakes] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [align, setAlign] = useState<TakeOverlayAlign>("start");
  const [libraryReady, setLibraryReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const makeUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    return url;
  };

  const stopRecording = useCallback(() => {
    gateRef.current.cancel();
    requestingRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (mountedRef.current) setFinishing(true);
      try { recorder.stop(); } catch { /* onstop settles whatever was received */ }
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    audioRef.current?.pause();
    if (mountedRef.current) {
      setRequesting(false);
      setRecording(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const onHidden = () => { if (document.hidden) stopRecording(); };
    window.addEventListener("bocal:host-pause", stopRecording);
    window.addEventListener("pagehide", stopRecording);
    document.addEventListener("visibilitychange", onHidden);
    const urls = urlsRef.current;
    return () => {
      mountedRef.current = false;
      window.removeEventListener("bocal:host-pause", stopRecording);
      window.removeEventListener("pagehide", stopRecording);
      document.removeEventListener("visibilitychange", onHidden);
      stopRecording();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [stopRecording]);

  // Restore the shared library. Every take counts toward the 12-take limit;
  // only the ones recorded here (kind "vocal") are listed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await listStoredTakes();
      if (cancelled) return;
      const known = new Set(allTakesRef.current.map((take) => take.id));
      const fresh = stored.filter((take) => !known.has(take.id));
      fresh.forEach((take) => persistedIdsRef.current.add(take.id));
      allTakesRef.current = allTakesRef.current.concat(fresh);
      const restored = fresh
        .filter((take) => take.kind === "vocal")
        .map((take) => ({ ...take, url: makeUrl(take.blob) }));
      const combined = takesRef.current.concat(restored).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      takesRef.current = combined;
      setTakes(combined);
      setTotalTakes(allTakesRef.current.length);
      setSelectedId((current) => current || (combined[0] ? combined[0].id : null));
      libraryReadyRef.current = true;
      setLibraryReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Never evicts. The capacity gate runs before recording starts; a take that
  // is already finishing is kept even if something else filled the library.
  const addTake = useCallback((stored: StoredTake) => {
    allTakesRef.current = [stored].concat(allTakesRef.current);
    if (mountedRef.current) {
      const withUrl = { ...stored, url: makeUrl(stored.blob) };
      const next = [withUrl].concat(takesRef.current);
      takesRef.current = next;
      setTakes(next);
      setTotalTakes(allTakesRef.current.length);
      setSelectedId(stored.id);
      setMessage("Saving the take to this device…");
    }
    void writesRef.current.run(stored.id, async () => {
      const saved = await putStoredTake(stored);
      if (saved) persistedIdsRef.current.add(stored.id);
      if (mountedRef.current) setMessage(saved ? "Take saved on this device. Export anything you want a separate copy of." : "This take is session-only. Export it before leaving this screen.");
      return saved;
    });
  }, []);

  const startRecording = async () => {
    if (recorderRef.current || requestingRef.current) return;
    if (!canCreateTake(allTakesRef.current.length, libraryReadyRef.current, MAX_TAKES)) {
      setMessage(libraryReadyRef.current
        ? "Your take library is full. Export and delete a take before recording another. Nothing has been removed."
        : "Restoring saved takes. Try again once they have loaded.");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("Recording is not available in this browser.");
      return;
    }
    const ticket = gateRef.current.begin();
    requestingRef.current = true;
    setRequesting(true);
    setMessage("");
    let stream: MediaStream | null = null;
    const stillCurrent = () => mountedRef.current && gateRef.current.accepts(ticket) && !document.hidden;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } });
      if (!stillCurrent()) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (!canCreateTake(allTakesRef.current.length, libraryReadyRef.current, MAX_TAKES)) {
        stream.getTracks().forEach((track) => track.stop());
        setMessage("Your take library is full. Export and delete a take before recording another. Nothing has been removed.");
        return;
      }
      const activeStream = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(activeStream, { ...(preferredType ? { mimeType: preferredType } : {}), audioBitsPerSecond: 128000 });
      const chunks: Blob[] = [];
      let bytes = 0;
      const startedAt = performance.now();
      const finishAtLimit = () => {
        if (recorder.state === "inactive") return;
        if (mountedRef.current) { setFinishing(true); setRecording(false); setMessage("Recording limit reached. Finishing this take without removing any earlier one."); }
        recorder.stop();
      };
      // Only the on-screen clock rides this timer; the recording itself is the browser's.
      const timer = window.setInterval(() => {
        const elapsed = Math.floor((performance.now() - startedAt) / 1000);
        if (mountedRef.current) setSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) finishAtLimit();
      }, 250);
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes >= RECORDING_STOP_BYTES) finishAtLimit();
      };
      recorder.onerror = () => {
        if (mountedRef.current) setMessage("Recording was interrupted. Whatever was received is kept as a take.");
        finishAtLimit();
      };
      recorder.onstop = () => {
        window.clearInterval(timer);
        activeStream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === activeStream) streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
        const duration = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size > 0) {
          const now = new Date();
          addTake({
            id: takeId(),
            kind: "vocal",
            name: `Vocal take ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            createdAt: now.toISOString(),
            seconds: duration,
            mime,
            blob,
          });
          recordPracticeActivity({ type: "vocal", seconds: duration, instrumentId: "vocal", label: "Recorded vocal take" });
        } else if (mountedRef.current) setMessage("No audio was recorded. Nothing was added or removed.");
        if (mountedRef.current) { setSeconds(duration); setRecording(false); setFinishing(false); }
      };
      try { recorder.start(250); } catch (error) { window.clearInterval(timer); throw error; }
      streamRef.current = activeStream;
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (stillCurrent()) {
        const name = error instanceof DOMException ? error.name : "";
        setMessage(name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access, then record again."
          : name === "NotFoundError"
            ? "No microphone was found."
            : "Recording could not start. Check whether another app is using the microphone, then retry.");
      }
    } finally {
      if (gateRef.current.accepts(ticket)) {
        requestingRef.current = false;
        if (mountedRef.current) setRequesting(false);
      }
    }
  };

  const toggleRecording = () => {
    if (recording || requesting) stopRecording();
    else void startRecording();
  };

  const removeTake = async (id: string) => {
    if (deletingRef.current.has(id)) return;
    const take = takesRef.current.find((item) => item.id === id);
    if (!take || !window.confirm(`Delete “${take.name}” from Bocal? Export a copy first if you want to keep it.`)) return;
    deletingRef.current.add(id);
    setDeletingIds(Array.from(deletingRef.current));
    const removed = await writesRef.current.run(id, async () => !persistedIdsRef.current.has(id) || await deleteStoredTake(id));
    if (removed) {
      persistedIdsRef.current.delete(id);
      URL.revokeObjectURL(take.url);
      urlsRef.current.delete(take.url);
      forgetTakeAnalysis(id);
      allTakesRef.current = allTakesRef.current.filter((item) => item.id !== id);
      const next = takesRef.current.filter((item) => item.id !== id);
      takesRef.current = next;
      if (mountedRef.current) {
        setTakes(next);
        setTotalTakes(allTakesRef.current.length);
        setSelectedId((current) => (current === id ? (next[0] ? next[0].id : null) : current));
        setCompareId((current) => (current === id ? null : current));
        setMessage("Take deleted from Bocal.");
      }
    }
    deletingRef.current.delete(id);
    if (mountedRef.current) setDeletingIds(Array.from(deletingRef.current));
  };

  const renameTake = (id: string, name: string) => {
    if (deletingRef.current.has(id)) return;
    const trimmed = name.slice(0, 60);
    const next = takesRef.current.map((take) => (take.id === id ? { ...take, name: trimmed } : take));
    takesRef.current = next;
    allTakesRef.current = allTakesRef.current.map((take) => (take.id === id ? { ...take, name: trimmed } : take));
    setTakes(next);
    void writesRef.current.run(id, async () => { if (persistedIdsRef.current.has(id)) await renameStoredTake(id, trimmed); });
  };

  const exportTake = (take: VocalTake) => {
    void saveOrShareFile(new File([take.blob], exportName(take), { type: take.mime }));
  };

  const selected = takes.find((take) => take.id === selectedId) || takes[0] || null;
  const compare = compareId && selected && compareId !== selected.id ? takes.find((take) => take.id === compareId) || null : null;
  const full = libraryReady && totalTakes >= MAX_TAKES;
  const otherTakes = Math.max(0, totalTakes - takes.length);
  const busy = requesting || finishing;

  return (
    <section className="vocal-takes" aria-labelledby="vocal-takes-title">
      <header className="vocal-takes-head">
        <div>
          <span className="card-kicker"><FileAudio size={15} /> Vocal takes · saved on this device</span>
          <h2 id="vocal-takes-title">Record a take and listen back</h2>
          <p>
            Record your singing, then play it back with its own pitch line drawn over the sound. Pick a second take to lay its line over the first.
            The line is read from the recording after the fact, so a quiet or breathy stretch can show as a gap. It shows what was sung; it does not rate it.
            Takes stay on this device unless you export them.
          </p>
        </div>
        <div className="vocal-takes-record">
          <button type="button" className={`button ${recording ? "secondary" : "primary"}`} onClick={toggleRecording} disabled={!libraryReady || finishing || (!recording && !requesting && full)}>
            {recording || requesting ? <Square size={14} /> : <Mic size={14} />}
            {finishing ? "Finishing take…" : recording ? "Finish take" : requesting ? "Cancel" : "Record take"}
          </button>
          <span className="vocal-takes-clock" aria-live="off">{recording ? `Recording ${formatLength(seconds)}` : requesting ? "Waiting for the microphone" : "Ready"}</span>
        </div>
      </header>

      <p className="vocal-takes-note">
        {listening ? "The microphone above is on, so the graph draws your line while you record." : "Start the microphone above if you want to watch the graph while you record; the take records either way."}
        {" "}Takes stop after 10 minutes. {totalTakes} of {MAX_TAKES} take slots are used{otherTakes > 0 ? `, ${otherTakes} of them by instrument takes from Analyze` : ""}; Bocal never removes a take on its own.
      </p>
      <p className="vocal-takes-status" role="status" aria-live="polite">{!libraryReady ? "Restoring saved takes…" : full && !recording && !message ? "Your take library is full. Export and delete a take to make room." : message}</p>

      {libraryReady && takes.length === 0 && !busy && (
        <p className="vocal-takes-empty">No vocal takes yet. Press Record take, sing, then Finish take.</p>
      )}

      {selected && (
        <div className="vocal-take-view">
          <ul className="vocal-take-list" aria-label="Vocal takes">
            {takes.map((take) => (
              <li key={take.id}>
                <button type="button" className={take.id === selected.id ? "is-active" : ""} aria-pressed={take.id === selected.id} onClick={() => setSelectedId(take.id)}>
                  <strong>{take.name || "Untitled take"}</strong>
                  <small>{formatWhen(take.createdAt)} · {formatLength(take.seconds)}</small>
                </button>
              </li>
            ))}
          </ul>

          <div className="vocal-take-detail">
            <label className="vocal-field" htmlFor="vocal-take-name">
              <span>Name</span>
              <input id="vocal-take-name" type="text" value={selected.name} maxLength={60} disabled={deletingIds.indexOf(selected.id) >= 0} onChange={(event) => renameTake(selected.id, event.target.value)} />
            </label>
            <TakePitchTrace
              key={selected.id}
              takeId={selected.id}
              audioUrl={selected.url}
              instrument={VOCAL}
              notation={notation}
              saTonic={saTonic}
              audioRef={audioRef}
              tuningOptions={tuningOptions}
              overlayTakeId={compare ? compare.id : undefined}
              overlayAudioUrl={compare ? compare.url : undefined}
              overlayLabel={compare ? compare.name : undefined}
              overlayAlign={align}
              vocal={{ range, toleranceCents }}
            />
            <audio ref={audioRef} className="vocal-take-audio" controls src={selected.url} aria-label={`Playback of ${selected.name}`} />
            <div className="vocal-take-tools">
              {takes.length > 1 && (
                <label className="vocal-field" htmlFor="vocal-take-compare">
                  <span>Compare with</span>
                  <select id="vocal-take-compare" value={compare ? compare.id : ""} onChange={(event) => setCompareId(event.target.value || null)}>
                    <option value="">None</option>
                    {takes.filter((take) => take.id !== selected.id).map((take) => <option key={take.id} value={take.id}>{take.name}</option>)}
                  </select>
                </label>
              )}
              {compare && (
                <span className="compare-align-toggle" role="group" aria-label="Align the compared take by">
                  <button type="button" className={align === "start" ? "is-active" : ""} onClick={() => setAlign("start")}>By start</button>
                  <button type="button" className={align === "first-voiced" ? "is-active" : ""} onClick={() => setAlign("first-voiced")}>By first note</button>
                </span>
              )}
              <div className="vocal-live-buttons">
                <button type="button" className="button secondary" onClick={() => exportTake(selected)}><Download size={14} /> Export</button>
                <button type="button" className="button secondary" disabled={deletingIds.indexOf(selected.id) >= 0} onClick={() => void removeTake(selected.id)}>
                  <Trash2 size={14} /> {deletingIds.indexOf(selected.id) >= 0 ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
