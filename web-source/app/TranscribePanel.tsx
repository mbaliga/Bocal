"use client";

import { AlertTriangle, FileAudio, LockKeyhole, Play, Share2, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InstrumentProfile } from "./instruments";
import { frequencyFromMidi, fullNoteLabel, type NotationSystem } from "./notation";
import StaffNote from "./StaffNote";
import { MAX_INPUT_SECONDS, transcribeFile, type TranscriptionResult } from "./transcribe";

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Note starts carry a tenth of a second. Whole seconds are useless here -- at
 * any ordinary tempo several notes share one, and the list then reads as if
 * they had been played together.
 */
function formatCue(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

export function TranscribePanel({
  instrument,
  notation,
  saTonic,
}: {
  instrument: InstrumentProfile;
  notation: NotationSystem;
  saTonic: number;
}) {
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const stopPlayback = useCallback(() => {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const runTranscription = async (file: File) => {
    stopPlayback();
    setFileName(file.name);
    setError("");
    setResult(null);
    setProgress(0);
    setBusy(true);
    try {
      setResult(await transcribeFile(file, setProgress));
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "That file could not be decoded. Try an m4a, mp3, wav or ogg recording.",
      );
    } finally {
      setBusy(false);
    }
  };

  const playBack = () => {
    if (!result || result.notes.length === 0) return;
    if (playing) {
      stopPlayback();
      return;
    }
    const context = new AudioContext();
    contextRef.current = context;
    const base = context.currentTime + 0.08;
    for (const note of result.notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      // Triangle rather than sine: enough upper partials that the pitch reads
      // clearly on a phone speaker, without sounding like a test tone.
      oscillator.type = "triangle";
      oscillator.frequency.value = frequencyFromMidi(note.concertMidi);
      const start = base + note.startSec;
      const end = start + Math.max(0.08, note.durationSec);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
      gain.gain.setValueAtTime(0.16, Math.max(start + 0.02, end - 0.04));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
    const last = result.notes[result.notes.length - 1];
    setPlaying(true);
    stopTimerRef.current = window.setTimeout(
      stopPlayback,
      (last.startSec + last.durationSec + 0.4) * 1000,
    );
  };

  const shareNotes = () => {
    if (!result) return;
    const lines = result.notes.map(
      (note) =>
        `${formatCue(note.startSec)}  ${fullNoteLabel(note.concertMidi + instrument.writtenOffset, notation, saTonic)}` +
        `  ${note.durationSec.toFixed(2)}s`,
    );
    const header =
      `${fileName || "Recording"} · transcribed by Bocal\n` +
      `${result.notes.length} notes · written for ${instrument.name.toLowerCase()}\n\n`;
    const file = new File([header + lines.join("\n") + "\n"], "bocal-transcription.txt", { type: "text/plain" });
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: "Bocal transcription" }).catch(() => undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="transcribe-panel">
      <div className="list-card-head">
        <div>
          <span className="card-kicker"><FileAudio size={14} /> Transcribe a recording</span>
          <h2>Turn a recording into notes.</h2>
        </div>
      </div>

      <p className="transcribe-scope">
        Bocal follows <strong>one line at a time</strong>. A solo take, a melody or a phrase you want to learn
        by ear will come out; a full mix, a piano part or anything with chords will not, because reading
        several notes at once is a different and unsolved problem. Bocal tells you which one it heard rather
        than guessing.
      </p>

      <label className="transcribe-drop">
        <input
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void runTranscription(file);
          }}
        />
        <span className="transcribe-drop-label">
          {busy ? "Listening…" : fileName || "Choose an audio file"}
        </span>
        <small>Up to {Math.round(MAX_INPUT_SECONDS / 60)} minutes · mp3, m4a, wav, ogg or flac</small>
      </label>

      {busy && (
        <div className="transcribe-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
          <span>{Math.round(progress * 100)}%</span>
        </div>
      )}

      {error && <p className="error-copy">{error}</p>}

      {result && !busy && (
        <div className="transcribe-result">
          {result.likelyPolyphonic && (
            <p className="transcribe-warning">
              <AlertTriangle size={15} />
              This recording sounds like more than one note at a time. What is below is Bocal&rsquo;s best single
              line through it and should not be trusted as the actual part.
            </p>
          )}

          {result.notes.length === 0 ? (
            <p className="transcribe-empty">
              No sustained pitches came through. That usually means the recording is very quiet, very noisy, or
              mostly percussion.
            </p>
          ) : (
            <>
              <div className="transcribe-summary">
                <div><strong>{result.notes.length}</strong><span>notes</span></div>
                <div><strong>{formatSeconds(result.durationSec)}</strong><span>length</span></div>
                <div><strong>{Math.round(result.clarity * 100)}%</strong><span>heard as one line</span></div>
              </div>

              <div className="transcribe-actions">
                <button className="button secondary" onClick={playBack}>
                  {playing ? <Square size={15} /> : <Play size={15} />} {playing ? "Stop" : "Play the notes back"}
                </button>
                <button className="button secondary" onClick={shareNotes}>
                  <Share2 size={15} /> Share the notes
                </button>
              </div>

              <ol className="transcribe-notes">
                {result.notes.map((note, index) => {
                  const writtenMidi = note.concertMidi + instrument.writtenOffset;
                  return (
                    <li key={`${note.startSec}-${index}`}>
                      <span className="transcribe-time">{formatCue(note.startSec)}</span>
                      {notation === "staff" ? (
                        <StaffNote midi={writtenMidi} clef={instrument.clef} height={62} title={fullNoteLabel(writtenMidi, "western")} />
                      ) : (
                        <strong>{fullNoteLabel(writtenMidi, notation, saTonic)}</strong>
                      )}
                      <span className="transcribe-length">{note.durationSec.toFixed(2)}s</span>
                      <span className={`transcribe-cents ${Math.abs(note.cents) > 20 ? "is-off" : ""}`}>
                        {note.cents > 0 ? "+" : ""}{note.cents}¢
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="transcribe-foot">
                Shown as {instrument.name.toLowerCase()} players read them
                {instrument.writtenOffset === 0 ? " (concert pitch)" : `, transposed for ${instrument.pitchLabel}`}.
              </p>
            </>
          )}
        </div>
      )}

      <p className="local-note"><LockKeyhole size={13} /> The file is decoded on this device and never uploaded.</p>
    </section>
  );
}
