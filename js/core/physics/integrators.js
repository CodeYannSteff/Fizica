/* ============================================================================
   NUMERICAL UTILITIES — RK4 INTEGRATOR
   ========================================================================== */

/**
 * @typedef {(t: number, y: Float64Array, out: Float64Array) => void} DerivFn
 */

class RK4 {
  /**
   * @param {number} n
   */
  constructor(n) {
    this.n = n;
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
    this.tmp = new Float64Array(n);
  }

  /**
   * @param {DerivFn} f
   * @param {number} t
   * @param {Float64Array} y
   * @param {number} dt
   */
  step(f, t, y, dt) {
    const { k1, k2, k3, k4, tmp, n } = this;

    f(t, y, k1);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k1[i];

    f(t + 0.5 * dt, tmp, k2);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k2[i];

    f(t + 0.5 * dt, tmp, k3);
    for (let i = 0; i < n; i++) tmp[i] = y[i] + dt * k3[i];

    f(t + dt, tmp, k4);
    for (let i = 0; i < n; i++) {
      y[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    y[0] = wrapAngle(y[0]);
    if (n >= 3) y[2] = wrapAngle(y[2]);
  }
}

/**
 * @param {number} a
 * @returns {number}
 */
function wrapAngle(a) {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r < -Math.PI) r += TAU;
  return r;
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
