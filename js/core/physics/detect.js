/* ============================================================================
   PERIOD DETECTION — zero-crossing estimator with peak fallback.
   Identical estimator for simulation series and camera series, so virtual
   and physical measurements are directly comparable.
   ========================================================================== */

/**
 * @param {ArrayLike<number>} t
 * @param {ArrayLike<number>} y
 * @param {number} [minCycles]
 * @returns {{T:number,std:number,cycles:number,amplitude:number,method:'peaks'|'zero'|'none'}}
 */
function detectPeriod(t, y, minCycles = 3) {
  const n = Math.min(t.length, y.length);
  if (n < 8) return { T: 0, std: 0, cycles: 0, amplitude: 0, method: 'none' };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i];
  mean /= n;

  /** @type {number[]} */
  const zc = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = y[i] - mean;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (i > 0) {
      const prev = y[i - 1] - mean;
      if (prev < 0 && v >= 0) {
        const f = prev === v ? 0 : -prev / (v - prev);
        zc.push(t[i - 1] + f * (t[i] - t[i - 1]));
      }
    }
  }

  /** @type {number[]} */
  let periods = [];
  /** @type {'peaks'|'zero'|'none'} */
  let method = 'none';

  if (zc.length >= minCycles + 1) {
    // consecutive positive-slope zero crossings are already one full period
    for (let i = 1; i < zc.length; i++) periods.push(zc[i] - zc[i - 1]);
    method = 'zero';
  }

  if (periods.length < minCycles) {
    /** @type {number[]} */
    const peaks = [];
    for (let i = 1; i < n - 1; i++) {
      const a = y[i - 1];
      const b = y[i];
      const c = y[i + 1];
      if (b > a && b >= c && b - mean > 0.15 * (hi - mean)) {
        // parabolic sub-frame refinement: vertex of the parabola through the
        // three samples around the maximum. Without it, peak times are pinned
        // to sample instants and every period quantizes to a whole frame —
        // ±1 frame of error per period on 30 fps footage.
        const den = a - 2 * b + c;
        let d = den !== 0 ? (0.5 * (a - c)) / den : 0;
        if (d > 0.5) d = 0.5;
        else if (d < -0.5) d = -0.5;
        peaks.push(t[i] + d * (t[i + 1] - t[i - 1]) / 2);
      }
    }
    /** @type {number[]} */
    const pk = [];
    for (let i = 1; i < peaks.length; i++) pk.push(peaks[i] - peaks[i - 1]);
    if (pk.length >= minCycles) {
      periods = pk;
      method = 'peaks';
    }
  }

  if (periods.length === 0) {
    return { T: 0, std: 0, cycles: 0, amplitude: (hi - lo) / 2, method: 'none' };
  }

  const med = median(periods);
  const kept = periods.filter((p) => Math.abs(p - med) <= 0.08 * med);
  const src = kept.length >= 2 ? kept : periods;

  const T = meanOf(src);
  const sd = src.length > 1 ? stdDev(src, T) : 0;
  return { T, std: sd, cycles: src.length, amplitude: (hi - lo) / 2, method };
}

/** @param {number[]} a */
function meanOf(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

/** @param {number[]} a @param {number} mean */
function stdDev(a, mean) {
  if (a.length < 2) return 0;
  let s = 0;
  for (const v of a) s += (v - mean) ** 2;
  return Math.sqrt(s / (a.length - 1));
}

/** @param {number[]} a */
function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
