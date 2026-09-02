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
