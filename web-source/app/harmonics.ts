/**
 * Pure per-partial spectral peak search for the live Harmonics view.
 *
 * Kept separate from AnalysisView so the maths -- window the target, find
 * the peak bin, parabolic-interpolate for a sub-bin frequency, convert to
 * cents against the exact harmonic -- can be tested against a synthetic
 * spectrum without an AnalyserNode, which only exists in a browser.
 * AnalysisView calls this with the dB array it gets from
 * analyser.getFloatFrequencyData(); a test can hand it a spectrum built by
 * any other means and check the same numbers come out.
 */

export type HarmonicPeak = {
  n: number;
  /** The exact harmonic target, n * f0, in Hz. */
  targetHz: number;
  /** Sub-bin-interpolated measured frequency, in Hz. */
  measuredHz: number;
  /** 1200 * log2(measuredHz / targetHz). */
  cents: number;
  /** Raw magnitude at the interpolated peak, in whatever unit the spectrum
   *  used (dB, if that's what was passed in). Not normalised against the
   *  other partials -- the caller does that once all partials are in hand. */
  level: number;
};

/**
 * Finds the first `harmonicCount` partials of `f0Hz` in `spectrum`, a
 * magnitude array with `binHz` Hz between consecutive entries (spectrum[0]
 * is 0 Hz, as getFloatFrequencyData returns it). A partial whose target
 * exceeds `nyquistLimitHz` is left out of the result rather than measured
 * against a target that was never going to be there.
 */
export function findHarmonicPeaks(
  spectrum: ArrayLike<number>,
  binHz: number,
  f0Hz: number,
  harmonicCount: number,
  nyquistLimitHz: number,
): (HarmonicPeak | null)[] {
  const results: (HarmonicPeak | null)[] = [];
  for (let n = 1; n <= harmonicCount; n += 1) {
    const targetHz = f0Hz * n;
    if (targetHz > nyquistLimitHz || binHz <= 0) {
      results.push(null);
      continue;
    }

    // +/-3% of the target. At a low fundamental this can be narrower than a
    // single bin; clamping still leaves the bin nearest the target in the
    // search, and the parabolic interpolation below recovers sub-bin
    // precision from its neighbours regardless of how wide the window was.
    const loBin = Math.max(1, Math.min(spectrum.length - 3, Math.floor((targetHz * 0.97) / binHz)));
    const hiBin = Math.max(loBin, Math.min(spectrum.length - 2, Math.ceil((targetHz * 1.03) / binHz)));

    let peakBin = loBin;
    let peakValue = spectrum[loBin];
    for (let bin = loBin; bin <= hiBin; bin += 1) {
      if (spectrum[bin] > peakValue) {
        peakValue = spectrum[bin];
        peakBin = bin;
      }
    }

    const left = spectrum[peakBin - 1];
    const center = spectrum[peakBin];
    const right = spectrum[peakBin + 1];
    const denominator = left - 2 * center + right;
    const subBin = Math.abs(denominator) > 1e-9 ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator)) : 0;
    const measuredHz = (peakBin + subBin) * binHz;

    results.push({ n, targetHz, measuredHz, cents: 1200 * Math.log2(measuredHz / targetHz), level: peakValue });
  }
  return results;
}

/**
 * EMA smoothing for the live harmonics bars, moved here from AnalysisView so
 * it is testable against a synthetic peak sequence without an AnalyserNode.
 * `null` at an index means that partial dropped out this frame; the smoothed
 * value for it is cleared rather than held, matching the old inline
 * behaviour of AnalysisView's harmonicsSmoothRef.
 */
export type HarmonicSmoothEntry = { levelDb: number; cents: number } | null;

export function advanceHarmonicSmoothing(
  previous: HarmonicSmoothEntry[],
  peaks: (HarmonicPeak | null)[],
  alpha = 0.3,
): HarmonicSmoothEntry[] {
  return peaks.map((peak, index) => {
    if (!peak) return null;
    const prior = previous[index];
    return prior
      ? {
          levelDb: prior.levelDb + (peak.level - prior.levelDb) * alpha,
          cents: prior.cents + (peak.cents - prior.cents) * alpha,
        }
      : { levelDb: peak.level, cents: peak.cents };
  });
}

/**
 * Linear-interpolated decimation, e.g. 8192 samples at 48 kHz down to ~4096
 * at 24 kHz before running YIN on them. YIN's cost is roughly quadratic in
 * sample count over its search range, so halving the rate is worth doing
 * whenever the full rate isn't needed for accuracy -- which it isn't for the
 * live harmonics fundamental search, whose lowest target (45 Hz) is well
 * inside a decimated Nyquist limit.
 */
export function decimateLinear(
  buffer: Float32Array<ArrayBuffer>,
  factor: number,
  out?: Float32Array<ArrayBuffer>,
): Float32Array<ArrayBuffer> {
  if (factor <= 1) return buffer;
  const outLength = Math.floor(buffer.length / factor);
  const target = out && out.length >= outLength ? out : new Float32Array(outLength);
  for (let index = 0; index < outLength; index += 1) {
    const position = index * factor;
    const left = Math.floor(position);
    const fraction = position - left;
    const right = Math.min(left + 1, buffer.length - 1);
    target[index] = buffer[left] * (1 - fraction) + buffer[right] * fraction;
  }
  return outLength === target.length ? target : target.subarray(0, outLength);
}

/**
 * Whether two fundamental measurements taken from the first and second half
 * of the same analysis window disagree by more than `thresholdCents` -- i.e.
 * the pitch moved *inside* the window, the signature of vibrato (or a slide)
 * rather than a partial genuinely drifting off its harmonic ratio. A sustained,
 * unmodulated tone gives near-identical halves; ordinary vibrato (5-7 Hz,
 * a few percent deep) does not.
 */
export function isModulating(f0FirstHalf: number, f0SecondHalf: number, thresholdCents = 4): boolean {
  if (!(f0FirstHalf > 0) || !(f0SecondHalf > 0)) return false;
  return Math.abs(1200 * Math.log2(f0SecondHalf / f0FirstHalf)) > thresholdCents;
}
