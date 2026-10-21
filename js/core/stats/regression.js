/* ============================================================================
   REGRESSION & ERROR PROPAGATION — T² = (4π²/g)·L
   Ordinary least squares with standard errors, R², residual statistics,
   plus the factor-isolation verdict used by ISOLATE and the report.
   ========================================================================== */


/**
 * @typedef {Object} LinReg
 * @property {number} n @property {number} slope @property {number} intercept
 * @property {number} r2 @property {number} slopeSe @property {number} interceptSe
 * @property {number} residualSe @property {number} xMean @property {number} ssx
 * @property {number[]} residuals @property {number[]} fitted
 */

/**
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {LinReg|null}
 */
function linreg(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;

  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  /** @type {number[]} */
  const residuals = new Array(n);
  /** @type {number[]} */
  const fitted = new Array(n);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const f = slope * xs[i] + intercept;
    const r = ys[i] - f;
    fitted[i] = f; residuals[i] = r; sse += r * r;
  }

  const r2 = syy > 0 ? 1 - sse / syy : 1;
  const dof = n - 2;
  const s2 = dof > 0 ? sse / dof : 0;
  const slopeSe = Math.sqrt(s2 / sxx);
  const interceptSe = Math.sqrt(s2 * (1 / n + (mx * mx) / sxx));

  return {
    n, slope, intercept, r2, slopeSe, interceptSe,
    residualSe: Math.sqrt(s2), xMean: mx, ssx: sxx, residuals, fitted,
  };
}

/**
 * g from the slope of T² = (4π²/g)·L → g = 4π²/m, with propagated σ(g)
 * and the relative deviation from the CODATA standard value.
 * @param {number} slope @param {number} slopeSe
 * @returns {{g:number,ug:number,relErr:number}}
 */
function gravityFromSlope(slope, slopeSe) {
  const K = 4 * Math.PI * Math.PI;
  if (!Number.isFinite(slope) || slope <= 0) {
    return { g: NaN, ug: NaN, relErr: NaN };
  }
  const g = K / slope;
  const ug = (K * slopeSe) / (slope * slope);
  return { g, ug, relErr: ((g - G_STD) / G_STD) * 100 };
}

/** Uncertainty of T² from the uncertainty of T. */
function uT2(T, uT) {
  return 2 * T * uT;
}

/**
 * @typedef {Object} FactorVerdict
 * @property {string} factor @property {number[]} levels @property {number[]} values
 * @property {number} spread @property {number} noise @property {boolean} isolated
 * @property {string} verdict
 * @property {boolean} [assessed] - false when the sheet lacks variation in this factor
 * @property {string} [pill] - explicit pill label override (e.g. 'BIASED')
 */

/**
 * Declare whether a factor measurably influences the period: the spread
 * across levels must exceed 2σ of the measurement noise to count as ACTIVE.
 * @param {string} factor
 * @param {number[]} levels
 * @param {number[]} values
 * @param {number} noise
 * @returns {FactorVerdict}
 */
function judgeFactor(factor, levels, values, noise) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) {
    return { factor, levels, values, spread: 0, noise, isolated: true, verdict: 'DATE INSUFICIENTE' };
  }
  const spread = Math.max(...finite) - Math.min(...finite);
  const isolated = spread <= Math.max(2 * noise, 1e-9);
  return {
    factor, levels, values, spread, noise, isolated,
    verdict: isolated ? 'IZOLAT — FĂRĂ EFECT' : 'ACTIV — INFLUENȚEAZĂ T',
  };
}

/** @param {number} n @param {number} [digits] */
function pct(n, digits = 3) {
  return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%` : '——';
}

/**
 * Group a list of (level, value) pairs by level and return the mean per level.
 * @param {number[]} levels
 * @param {number[]} values
 * @returns {{level:number,mean:number,n:number}[]}
 */
function groupMeans(levels, values) {
  /** @type {Map<number, number[]>} */
  const m = new Map();
  levels.forEach((lv, i) => {
    const v = values[i];
    if (!Number.isFinite(v)) return;
    if (!m.has(lv)) m.set(lv, []);
    m.get(lv).push(v);
  });
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, arr]) => ({
      level,
      mean: arr.reduce((s, v) => s + v, 0) / arr.length,
      n: arr.length,
    }));
}
