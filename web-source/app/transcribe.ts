import { detectPitchYin, frameRms } from "./pitch-engine";

/**
 * Offline note transcription for an uploaded recording.
 *
 * What this does and does not do, stated plainly because the difference
 * matters to anyone relying on the output:
 *
 *   It transcribes ONE line at a time. A solo take, a melody, a practice
 *   recording of a single player -- those work. A full band, a piano
 *   accompaniment, a track with chords, or a melody over backing will not
 *   come out right, because the pitch detector underneath finds a single
 *   fundamental per frame by design. Polyphonic transcription is an open
 *   research problem, not a setting we forgot to turn on.
 *
 *   Rather than quietly returning nonsense for a chord, the analysis reports
 *   how much of the recording it could actually hear as a single clean line,
 *   and the UI says so before showing notes.
 *
 * The work runs in slices with a yield between them instead of in a worker.
 * The app has three build targets -- the Cloudflare RSC build, the Vite
 * preview build and the single-file offline bundle -- and a worker behaves
 * differently in each. Slicing keeps one code path that is responsive
 * everywhere, at the cost of some throughput.
 */

/** Everything is analysed at this rate. Woodwind fundamentals top out well
 *  below the Nyquist limit, and decimating from 44.1k cuts YIN's inner loop
 *  by roughly an order of magnitude. */
const ANALYSIS_RATE = 16000;
const WINDOW = 1024; // 64 ms
const HOP = 256; // 16 ms
const MIN_HZ = 55; // below the bottom of a baritone sax in concert pitch
const MAX_HZ = 2100;
const MIN_CONFIDENCE = 0.55;
/** Notes shorter than this are detector chatter, not something a player did. */
const MIN_NOTE_MS = 80;
/** A gap this short inside a note is a tongued articulation, not a note end. */
const MAX_GAP_FRAMES = 4;
/** Frames of a different pitch tolerated before accepting a genuine change. */
const MAX_GLITCH_FRAMES = 2;
export const MAX_INPUT_SECONDS = 300;

export type TranscribedNote = {
  /** Concert-pitch MIDI number, i.e. what the recording actually sounds. */
  concertMidi: number;
  startSec: number;
  durationSec: number;
  /** Mean deviation from equal temperament across the note, in cents. */
  cents: number;
  confidence: number;
};

export type TranscriptionResult = {
  notes: TranscribedNote[];
  durationSec: number;
  /** Share of audible frames that resolved to one clean pitch, 0 to 1. */
  clarity: number;
  /**
   * True when the recording is loud but mostly unpitched to the detector,
   * which is what chords, several instruments at once, or heavy noise look
   * like from here.
   */
  likelyPolyphonic: boolean;
};

export type TranscribeProgress = (fraction: number) => void;

/**
 * Decode to mono at ANALYSIS_RATE. OfflineAudioContext resamples during
 * decode, which is both faster and better than anything we would hand-roll;
 * if a browser hands back a different rate anyway, fall back to linear
 * decimation so the pipeline still gets what it expects.
 */
export async function decodeToAnalysisBuffer(file: ArrayBuffer): Promise<Float32Array> {
  const OfflineCtor =
    typeof OfflineAudioContext !== "undefined"
      ? OfflineAudioContext
      : (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineCtor) throw new Error("This browser cannot decode audio files.");

  const context = new OfflineCtor(1, 1, ANALYSIS_RATE);
  const decoded = await context.decodeAudioData(file);

  // Downmix. Averaging the channels is right for a stereo recording of one
  // player; it also cancels anything hard-panned out of phase, which is rare
  // enough in a practice take to be worth the simplicity.
  const channels = decoded.numberOfChannels;
  const source = new Float32Array(decoded.length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let index = 0; index < decoded.length; index += 1) source[index] += data[index] / channels;
  }

  if (Math.abs(decoded.sampleRate - ANALYSIS_RATE) < 1) return source;

  const ratio = decoded.sampleRate / ANALYSIS_RATE;
  const outLength = Math.floor(source.length / ratio);
  const out = new Float32Array(outLength);
  for (let index = 0; index < outLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const right = Math.min(left + 1, source.length - 1);
    out[index] = source[left] * (1 - fraction) + source[right] * fraction;
  }
  return out;
}

type Frame = { midi: number | null; confidence: number; rms: number; support: number };

/**
 * Energy at one frequency, via Goertzel over a Hann-windowed frame. Cheaper
 * than an FFT when only a handful of bins are wanted, and the window matters:
 * without it, a strong partial leaks across the spectrum and swamps the quiet
 * bins this check exists to measure.
 */
function binPower(buffer: Float32Array, sampleRate: number, hz: number) {
  const omega = (2 * Math.PI * hz) / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let beforePrevious = 0;
  const length = buffer.length;
  for (let index = 0; index < length; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    const current = buffer[index] * hann + coefficient * previous - beforePrevious;
    beforePrevious = previous;
    previous = current;
  }
  return previous * previous + beforePrevious * beforePrevious - coefficient * previous * beforePrevious;
}

/**
 * How much of the harmonic energy actually sits on the claimed fundamental and
 * its octave, as a fraction of the energy across the whole harmonic series.
 *
 * This is the guard against residue pitch, and it is not a corner case. A C
 * major triad is genuinely periodic two octaves below its root -- 262, 330 and
 * 392 Hz all complete a cycle together at about 65 Hz -- so YIN reports C2 with
 * near-total confidence and is, strictly, right. It is also useless: nobody
 * played a C2. What separates that from a real low note is where the energy
 * lives. A bassoon on a low C puts most of its power in the first two
 * harmonics; the triad puts none there at all, because there is no 65 Hz
 * component in the sound, only in its period.
 */
function harmonicSupport(buffer: Float32Array, sampleRate: number, f0: number) {
  const nyquist = sampleRate / 2;
  const maxHarmonic = Math.min(8, Math.floor((nyquist * 0.9) / f0));
  if (maxHarmonic < 3) return 1;
  let low = 0;
  let total = 0;
  for (let harmonic = 1; harmonic <= maxHarmonic; harmonic += 1) {
    const power = binPower(buffer, sampleRate, f0 * harmonic);
    total += power;
    if (harmonic <= 2) low += power;
  }
  return total > 0 ? low / total : 1;
}

/** Below this, the "fundamental" is an artefact of several notes at once. */
const MIN_HARMONIC_SUPPORT = 0.1;

function percentile(sorted: number[], fraction: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))];
}

function medianOf(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

/**
 * A running median over the pitch track. YIN's characteristic failure is a
 * single frame landing an octave out; a five-frame median removes those
 * without rounding off a real note change, which lasts far longer than one
 * frame at a 16 ms hop.
 */
function smoothPitchTrack(frames: Frame[]) {
  const width = 2;
  return frames.map((frame, index) => {
    if (frame.midi === null) return frame;
    const neighbours: number[] = [];
    for (let offset = -width; offset <= width; offset += 1) {
      const candidate = frames[index + offset];
      if (candidate?.midi != null) neighbours.push(candidate.midi);
    }
    return { ...frame, midi: neighbours.length >= 3 ? medianOf(neighbours) : frame.midi };
  });
}

export async function transcribeBuffer(
  samples: Float32Array,
  onProgress?: TranscribeProgress,
): Promise<TranscriptionResult> {
  const durationSec = samples.length / ANALYSIS_RATE;
  const frameCount = Math.max(0, Math.floor((samples.length - WINDOW) / HOP) + 1);
  const frames: Frame[] = new Array(frameCount);

  // Analysed in slices with a yield between them so the tab keeps painting
  // and the progress bar is honest rather than decorative.
  const SLICE = 96;
  for (let start = 0; start < frameCount; start += SLICE) {
    const end = Math.min(frameCount, start + SLICE);
    for (let index = start; index < end; index += 1) {
      const window = samples.subarray(index * HOP, index * HOP + WINDOW);
      const rms = frameRms(window);
      const candidate = detectPitchYin(window, ANALYSIS_RATE, MIN_HZ, MAX_HZ);
      frames[index] = {
        midi: candidate ? 69 + 12 * Math.log2(candidate.hz / 440) : null,
        confidence: candidate?.confidence ?? 0,
        rms,
        support: candidate ? harmonicSupport(window, ANALYSIS_RATE, candidate.hz) : 0,
      };
    }
    onProgress?.(end / Math.max(frameCount, 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (frameCount === 0) {
    return { notes: [], durationSec, clarity: 0, likelyPolyphonic: false };
  }

  // The noise floor is taken from the recording itself. A phone memo in a
  // practice room and a close-miked studio take have wildly different floors,
  // and a fixed threshold gets one of them wrong.
  //
  // The floor estimate is only trustworthy when there is silence to measure.
  // A continuous solo -- a scale, a long-tone study, anything played straight
  // through -- has almost none, and a low percentile then lands on playing
  // rather than on room tone. Clamping the floor-derived term to a fraction of
  // the peak keeps a dense recording from gating itself into silence.
  const sortedRms = frames.map((frame) => frame.rms).sort((left, right) => left - right);
  const floor = percentile(sortedRms, 0.1);
  const peak = percentile(sortedRms, 0.95);
  const gate = Math.max(0.004, peak * 0.05, Math.min(floor * 2.5, peak * 0.25));

  const smoothed = smoothPitchTrack(frames);
  const isSinglePitch = (frame: Frame) =>
    frame.midi !== null && frame.confidence >= MIN_CONFIDENCE && frame.support >= MIN_HARMONIC_SUPPORT;

  const audible = smoothed.filter((frame) => frame.rms >= gate);
  const voiced = audible.filter(isSinglePitch);
  const clarity = audible.length === 0 ? 0 : voiced.length / audible.length;

  // Two different tells, and a recording only needs one. Either the sound is
  // loud but never settles on a pitch at all (an ensemble, or noise), or it
  // settles confidently on a fundamental that carries no energy -- the residue
  // pitch of a chord.
  const residueFrames = audible.filter(
    (frame) => frame.midi !== null && frame.confidence >= MIN_CONFIDENCE && frame.support < MIN_HARMONIC_SUPPORT,
  ).length;
  const likelyPolyphonic =
    audible.length >= frameCount * 0.25 &&
    (clarity < 0.45 || residueFrames >= audible.length * 0.3);

  const notes: TranscribedNote[] = [];
  let currentMidi: number | null = null;
  let currentStart = 0;
  let currentSamples: number[] = [];
  let currentConfidence: number[] = [];
  let gapFrames = 0;
  let glitchFrames = 0;
  let pendingMidi: number | null = null;
  let pendingStartIndex = 0;

  const closeNote = (endIndex: number) => {
    if (currentMidi === null) return;
    const startSec = (currentStart * HOP) / ANALYSIS_RATE;
    const durationOfNote = ((endIndex - currentStart) * HOP) / ANALYSIS_RATE;
    if (durationOfNote * 1000 >= MIN_NOTE_MS && currentSamples.length > 0) {
      const meanMidi = medianOf(currentSamples);
      notes.push({
        concertMidi: currentMidi,
        startSec: Number(startSec.toFixed(3)),
        durationSec: Number(durationOfNote.toFixed(3)),
        cents: Math.round((meanMidi - currentMidi) * 100),
        confidence: Number(medianOf(currentConfidence).toFixed(2)),
      });
    }
    currentMidi = null;
    currentSamples = [];
    currentConfidence = [];
  };

  for (let index = 0; index < smoothed.length; index += 1) {
    const frame = smoothed[index];
    const isVoiced = isSinglePitch(frame) && frame.rms >= gate;

    if (!isVoiced) {
      if (currentMidi !== null) {
        gapFrames += 1;
        if (gapFrames > MAX_GAP_FRAMES) closeNote(index - gapFrames);
      }
      glitchFrames = 0;
      pendingMidi = null;
      continue;
    }

    gapFrames = 0;
    const rounded = Math.round(frame.midi as number);

    if (currentMidi === null) {
      currentMidi = rounded;
      currentStart = index;
      currentSamples = [frame.midi as number];
      currentConfidence = [frame.confidence];
      glitchFrames = 0;
      pendingMidi = null;
      continue;
    }

    if (rounded === currentMidi) {
      currentSamples.push(frame.midi as number);
      currentConfidence.push(frame.confidence);
      glitchFrames = 0;
      pendingMidi = null;
      continue;
    }

    // A different pitch has to hold for a couple of frames before it counts.
    // One frame of disagreement is usually the attack transient of the note
    // we are already in, or a slide through a neighbour on the way somewhere.
    if (pendingMidi !== rounded) {
      pendingMidi = rounded;
      pendingStartIndex = index;
      glitchFrames = 1;
      continue;
    }
    glitchFrames += 1;
    if (glitchFrames <= MAX_GLITCH_FRAMES) continue;

    closeNote(pendingStartIndex);
    currentMidi = rounded;
    currentStart = pendingStartIndex;
    currentSamples = [frame.midi as number];
    currentConfidence = [frame.confidence];
    glitchFrames = 0;
    pendingMidi = null;
  }
  closeNote(smoothed.length - gapFrames);

  return { notes, durationSec, clarity: Number(clarity.toFixed(2)), likelyPolyphonic };
}

export async function transcribeFile(file: File, onProgress?: TranscribeProgress): Promise<TranscriptionResult> {
  const bytes = await file.arrayBuffer();
  const samples = await decodeToAnalysisBuffer(bytes);
  if (samples.length / ANALYSIS_RATE > MAX_INPUT_SECONDS) {
    throw new Error(
      `That recording is longer than ${Math.round(MAX_INPUT_SECONDS / 60)} minutes. Trim it to the passage you want and try again.`,
    );
  }
  return transcribeBuffer(samples, onProgress);
}
