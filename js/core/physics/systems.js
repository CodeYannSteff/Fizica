/* ============================================================================
   PENDULUM SYSTEMS — simple · physical · double · inverted
   RK4 integration + analytic readouts (energy, tensions, coordinates).
   ========================================================================== */


/**
 * @typedef {'simple'|'physical'|'double'|'inverted'} PendulumType
 * @typedef {'point'|'rod_end'|'disk_rim'|'hoop_rim'|'custom'} InertiaKind
 *
 * @typedef {Object} PendulumParams
 * @property {PendulumType} type
 * @property {number} g      gravitational acceleration [m/s²]
 * @property {number} L      primary rod length [m]
 * @property {number} L2     secondary rod length [m]
 * @property {number} m      primary bob mass [kg]
 * @property {number} m2     secondary bob mass [kg]
 * @property {InertiaKind} inertia
 * @property {number} radius disk/hoop radius [m]
 * @property {number} kGyr   radius of gyration k, I = m k² [m]
 * @property {number} theta0 initial angle from equilibrium [rad]
 * @property {number} omega0 initial angular velocity [rad/s]
 * @property {number} damping   viscous coefficient [1/s]
 * @property {number} driveA    drive torque amplitude [rad/s²]
 * @property {number} driveOmega drive torque frequency [rad/s]
 * @property {boolean} control PD stabilisation (inverted)
 * @property {number} Kp
 * @property {number} Kd
 *
 * @typedef {Object} Readings
 * @property {number} t @property {number} theta @property {number} omega
 * @property {number} theta2 @property {number} omega2
 * @property {number} energy @property {number} kinetic @property {number} potential
 * @property {number} tension @property {number} tension2
 * @property {number} x @property {number} y @property {number} x2 @property {number} y2
 * @property {number} periodTheory @property {number} periodBorda @property {number} leff
 */

const G_STD = 9.80665;

const TYPE_LABEL = {
  simple: 'PENDUL SIMPLU',
  physical: 'PENDUL FIZIC',
  double: 'PENDUL DUBLU',
  inverted: 'PENDUL INVERSAT',
};

/** @type {PendulumParams} */
const DEFAULT_PARAMS = {
  type: 'simple',
  g: G_STD,
  L: 1,
  L2: 0.6,
  m: 1,
  m2: 1,
  inertia: 'rod_end',
  radius: 0.5,
  kGyr: 0.5,
  theta0: 0.35,
  omega0: 0,
  damping: 0,
  driveA: 0,
  driveOmega: 0,
  control: false,
  Kp: 24,
  Kd: 6,
};

/**
 * Moment of inertia about the pivot and distance pivot→CM for the physical
 * pendulum, for the standard rigid-body presets.
 * @param {PendulumParams} p
 * @returns {{I:number,d:number}}
 */
function inertiaGeometry(p) {
  const { m, L, radius, kGyr, inertia } = p;
  switch (inertia) {
    case 'rod_end':
      return { I: (m * L * L) / 3, d: L / 2 };
    case 'disk_rim':
      return { I: 1.5 * m * radius * radius, d: radius };
    case 'hoop_rim':
      return { I: 2 * m * radius * radius, d: radius };
    case 'custom':
      return { I: m * kGyr * kGyr, d: kGyr * 0.8 };
    case 'point':
    default:
      return { I: m * L * L, d: L };
  }
}

/** @param {PendulumParams} p */
function effectiveLength(p) {
  if (p.type === 'physical') {
    const { I, d } = inertiaGeometry(p);
    return I / (p.m * d);
  }
  return p.L;
}

/** Small-angle period T₀ = 2π√(Leff/g) [s]. @param {PendulumParams} p */
function periodSmallAngle(p) {
  const Leff = effectiveLength(p);
  return Math.PI * 2 * Math.sqrt(Leff / p.g);
}

/**
 * Borda power series for the amplitude-corrected period:
 * T = T₀ (1 + θ₀²/16 + 11θ₀⁴/3072 + 173θ₀⁶/737280 + …)
 * @param {PendulumParams} p
 */
function periodBorda(p) {
  const a2 = p.theta0 * p.theta0;
  const series =
    1 + a2 / 16 + (11 * a2 * a2) / 3072 + (173 * a2 * a2 * a2) / 737280;
  return periodSmallAngle(p) * series;
}

/** @param {PendulumParams} p */
function cloneParams(p) {
  return /** @type {PendulumParams} */ ({ ...p });
}

class PendulumSystem {
  /** @param {PendulumParams} params */
  constructor(params) {
    this.params = params;
    this.n = params.type === 'double' ? 4 : 2;
    this.y = new Float64Array(this.n);
    this.f = new Float64Array(this.n);
    this.rk = new RK4(this.n);
    this.t = 0;
    this.reset();
  }

  reset() {
    const p = this.params;
    // type can be swapped on a live instance (SIM type selector) — the DOF
    // count, state vector and integrator must follow
    const n = p.type === 'double' ? 4 : 2;
    if (this.n !== n || this.y.length !== n) {
      this.n = n;
      this.y = new Float64Array(n);
      this.f = new Float64Array(n);
      this.rk = new RK4(n);
    }
    this.t = 0;
    if (this.n === 4) {
      this.y[0] = p.theta0;
      this.y[1] = p.omega0;
      this.y[2] = p.theta0 * 0.999 + 0.001;
      this.y[3] = 0;
    } else {
      // inverted: θ measured from upright → seed near π − θ₀ so that
      // "θ₀ = 0.3 rad" means "tipped 0.3 rad from the top".
      this.y[0] = p.type === 'inverted' ? Math.PI - p.theta0 : p.theta0;
      this.y[1] = p.omega0;
    }
  }

  /**
   * @param {number} theta0
   * @param {number} omega0
   */
  reseed(theta0, omega0) {
    this.params.theta0 = theta0;
    this.params.omega0 = omega0;
    this.reset();
  }

  /** @param {number} dt */
  step(dt) {
    const self = this;
    this.rk.step(function (t, y, out) {
      self.derivs(t, y, out);
    }, this.t, this.y, dt);
    this.t += dt;
  }

  /**
   * @param {number} t
   * @param {Float64Array} y
   * @param {Float64Array} out
   */
  derivs(t, y, out) {
    const p = this.params;
    const th = y[0];
    const om = y[1];
    const drive = p.driveA * Math.sin(p.driveOmega * t);

    if (this.n === 4) {
      this.doubleDerivs(y, out, drive);
      return;
    }

    let acc;
    if (p.type === 'physical') {
      const { I, d } = inertiaGeometry(p);
      acc = -(p.m * p.g * d * Math.sin(th)) / I - p.damping * om + drive;
    } else if (p.type === 'inverted') {
      // θ from upright: gravity destabilises (+sin θ), actuator can stabilise.
      acc = (p.g / p.L) * Math.sin(th) - p.damping * om + drive;
      if (p.control) acc += -p.Kp * th - p.Kd * om;
    } else {
      acc = -(p.g / p.L) * Math.sin(th) - p.damping * om + drive;
    }
    out[0] = om;
    out[1] = acc;
  }

  /**
   * Standard 2-DOF double-pendulum equations (Lagrangian, closed form).
   * @param {Float64Array} y
   * @param {Float64Array} out
   * @param {number} drive
   */
  doubleDerivs(y, out, drive) {
    const p = this.params;
    const g = p.g, m1 = p.m, m2 = p.m2, L1 = p.L, L2 = p.L2;
    const th1 = y[0], w1 = y[1], th2 = y[2], w2 = y[3];
    const d = th1 - th2;
    const cd = Math.cos(d);
    const sd = Math.sin(d);
    const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);

    out[0] = w1;
    out[2] = w2;
    out[1] =
      (-g * (2 * m1 + m2) * Math.sin(th1) -
        m2 * g * Math.sin(th1 - 2 * th2) -
        2 * sd * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * cd) +
        drive) /
      (L1 * den);
    out[3] =
      (2 * sd *
        (w1 * w1 * L1 * (m1 + m2) +
          g * (m1 + m2) * Math.cos(th1) +
          w2 * w2 * L2 * m2 * cd)) /
      (L2 * den);
  }

  /** @returns {Readings} */
  snapshot() {
    const p = this.params;
    const th = this.y[0];
    const om = this.y[1];
    let E = 0, K = 0, V = 0, T1 = 0, T2 = 0;
    let x = 0, y = 0, x2 = 0, y2 = 0, th2 = 0, w2 = 0;

    if (this.n === 4) {
      th2 = this.y[2];
      w2 = this.y[3];
      const L1 = p.L, L2 = p.L2;
      x = L1 * Math.sin(th);
      y = -L1 * Math.cos(th);
      x2 = x + L2 * Math.sin(th2);
      y2 = y - L2 * Math.cos(th2);

      const v1sq = L1 * L1 * om * om;
      const v2sq =
        L1 * L1 * om * om +
        L2 * L2 * w2 * w2 +
        2 * L1 * L2 * om * w2 * Math.cos(th - th2);
      K = 0.5 * p.m * v1sq + 0.5 * p.m2 * v2sq;
      V =
        (p.m + p.m2) * p.g * L1 * (1 - Math.cos(th)) +
        p.m2 * p.g * L2 * (1 - Math.cos(th2));
      E = K + V;

      // exact rod tensions: solve the 2×2 system acting on mass 1
      this.derivs(this.t, this.y, this.f);
      const a1 = this.f[1];
      const a2 = this.f[3];
      const a1x = L1 * (Math.cos(th) * a1 - Math.sin(th) * om * om);
      const a1y = L1 * (Math.sin(th) * a1 + Math.cos(th) * om * om);
      const a2x = a1x + L2 * (Math.cos(th2) * a2 - Math.sin(th2) * w2 * w2);
      void a2x;
      const s1 = -Math.sin(th), c1 = Math.cos(th);
      const s2 = Math.sin(th2), c2 = -Math.cos(th2);
      const det = s1 * c2 - s2 * c1;
      if (Math.abs(det) > 1e-9) {
        const rx = p.m * a1x;
        const ry = p.m * (a1y + p.g);
        T1 = Math.abs((rx * c2 - s2 * ry) / det);
        T2 = Math.abs((s1 * ry - rx * c1) / det);
      }
    } else if (p.type === 'physical') {
      const { I, d } = inertiaGeometry(p);
      x = d * Math.sin(th);
      y = -d * Math.cos(th);
      K = 0.5 * I * om * om;
      V = p.m * p.g * d * (1 - Math.cos(th));
      E = K + V;
      T1 = Math.abs(p.m * (p.g * Math.cos(th) + d * om * om));
    } else if (p.type === 'inverted') {
      x = p.L * Math.sin(th);
      y = p.L * Math.cos(th);
      K = 0.5 * p.m * p.L * p.L * om * om;
      V = p.m * p.g * p.L * (1 + Math.cos(th));
      E = K + V;
      T1 = Math.abs(p.m * (p.g * Math.cos(th) - p.L * om * om));
    } else {
      x = p.L * Math.sin(th);
      y = -p.L * Math.cos(th);
      K = 0.5 * p.m * p.L * p.L * om * om;
      V = p.m * p.g * p.L * (1 - Math.cos(th));
      E = K + V;
      T1 = Math.abs(p.m * (p.g * Math.cos(th) + p.L * om * om));
    }

    return {
      t: this.t,
      theta: wrapAngle(th),
      omega: om,
      theta2: wrapAngle(th2),
      omega2: w2,
      energy: E,
      kinetic: K,
      potential: V,
      tension: T1,
      tension2: T2,
      x, y, x2, y2,
      periodTheory: periodSmallAngle(p),
      periodBorda: periodBorda(p),
      leff: effectiveLength(p),
    };
  }
}
