/* ============================================================================
   VIRTUAL TEST ENGINE — batch sweeps of up to hundreds of simulated trials.
   Each trial is an independent RK4 run with the same period estimator used
   on camera data, producing an identical (L, m, θ₀, T) record.
   ========================================================================== */


/**
 * @typedef {import('../physics/systems.js').PendulumParams} PendulumParams
 * @typedef {import('../physics/systems.js').PendulumType} PendulumType
 *
 * @typedef {Object} VirtualTest
 * @property {number} id
 * @property {PendulumParams} params
 * @property {number} T        detected period [s]
 * @property {number} uT       1σ of the period [s]
 * @property {number} cycles
 * @property {number} T0       small-angle reference [s]
 * @property {number} TB       Borda-corrected [s]
 * @property {number} duration simulated time until lock [s]
 * @property {number} energyLoss relative mechanical energy loss
 *
 * @typedef {Object} SweepConfig
 * @property {PendulumType} type @property {number} g
 * @property {number} Lmin @property {number} Lmax @property {number} nL
 * @property {number} mmin @property {number} mmax @property {number} nM
 * @property {number} thmin @property {number} thmax @property {number} nTh
 * @property {number} damping @property {number} cap
 */

/** @type {SweepConfig} */
const DEFAULT_SWEEP = {
  type: 'simple',
  g: 9.80665,
  Lmin: 0.25, Lmax: 2, nL: 10,
  mmin: 0.2, mmax: 5, nM: 4,
  thmin: 0.15, thmax: 0.15, nTh: 1,
  damping: 0,
  cap: 200,
};

const SWEEP_NOMINAL = 200;

/**
 * @param {number} a @param {number} b @param {number} n
 * @returns {number[]}
 */
function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}

/**
 * Build the L × m × θ₀ parameter matrix, clipped to `cap`.
 * @param {SweepConfig} cfg
 * @returns {PendulumParams[]}
 */
function planSweep(cfg) {
  const Ls = linspace(cfg.Lmin, cfg.Lmax, cfg.nL);
  const ms = linspace(cfg.mmin, cfg.mmax, cfg.nM);
  const ths = linspace(cfg.thmin, cfg.thmax, cfg.nTh);
  /** @type {PendulumParams[]} */
  const out = [];
  outer: for (const th of ths) {
    for (const L of Ls) {
      for (const m of ms) {
        out.push({
          ...DEFAULT_PARAMS,
          type: cfg.type,
          g: cfg.g,
          L, m,
          theta0: th,
          damping: cfg.damping,
          omega0: 0,
          driveA: 0,
        });
        if (out.length >= cfg.cap) break outer;
      }
    }
  }
  return out;
}

/**
 * Adjust the grid counts so the sweep lands on `target` trials.
 * @param {SweepConfig} cfg @param {number} target
 * @returns {SweepConfig}
 */
function rebalanceSweep(cfg, target) {
  /** @type {SweepConfig} */
  const n = { ...cfg, cap: target };
  n.nTh = Math.max(1, Math.min(cfg.nTh, target));
  const perTh = Math.max(1, Math.round(target / n.nTh));
  n.nL = Math.max(2, Math.round(Math.sqrt(perTh * (cfg.nL / Math.max(1, cfg.nM)))));
  n.nM = Math.max(1, Math.round(perTh / n.nL));
  while (n.nL * n.nM * n.nTh > target) {
    if (n.nL >= n.nM && n.nL > 2) n.nL--;
    else if (n.nM > 1) n.nM--;
    else break;
  }
  while (n.nL * n.nM * n.nTh < target) {
    if (n.nL * (n.nM + 1) * n.nTh <= target) n.nM++;
    else n.nL++;
  }
  return n;
}

/**
 * @param {PendulumParams} params
 * @param {number} id
 * @param {{dt?:number,maxTime?:number,targetCycles?:number,stride?:number}} [o]
 * @returns {VirtualTest}
 */
function runVirtualTest(params, id, o = {}) {
  const dt = o.dt ?? 0.002;
  const maxTime = o.maxTime ?? 60;
  const targetCycles = o.targetCycles ?? 5;
  const stride = o.stride ?? 2;

  const sys = new PendulumSystem(cloneParams(params));
  const T0 = periodSmallAngle(params);
  const TB = periodBorda(params);
  const E0 = sys.snapshot().energy;

  /** @type {number[]} */
  const ts = [];
  /** @type {number[]} */
  const ys = [];
  const keep = Math.ceil((20 * T0) / (dt * stride)) + 64;

  let steps = Math.ceil(maxTime / dt);
  let k = 0;
  /** @type {ReturnType<typeof detectPeriod>} */
  let measured = { T: 0, std: 0, cycles: 0, amplitude: 0, method: 'none' };

  while (steps-- > 0) {
    sys.step(dt);
    if (k++ % stride !== 0) continue;
    ts.push(sys.t);
    ys.push(sys.y[0]);
    if (ts.length > keep) {
      const drop = ts.length - keep;
      ts.splice(0, drop);
      ys.splice(0, drop);
    }
    if (sys.t > 3 * T0 && ts.length % 32 === 0) {
      measured = detectPeriod(ts, ys, targetCycles);
      if (measured.cycles >= targetCycles) break;
    }
  }

  const E1 = sys.snapshot().energy;
  const denom = Math.abs(E0) > 1e-12 ? Math.abs(E0) : 1;

  return {
    id,
    params: cloneParams(params),
    T: measured.T,
    uT: Math.max(measured.std, (dt * stride) / 2, 5e-4),
    cycles: measured.cycles,
    T0,
    TB,
    duration: sys.t,
    energyLoss: Math.abs(E0 - E1) / denom,
  };
}

/**
 * Run a whole sweep asynchronously in chunks so the UI never freezes.
 * @param {SweepConfig} cfg
 * @param {{dt?:number,maxTime?:number,targetCycles?:number,stride?:number,
 *          onProgress?:(done:number,total:number)=>void,
 *          cancel?:{aborted:boolean},chunk?:number}} [o]
 * @returns {Promise<{tests:VirtualTest[],wallMs:number}>}
 */
async function runSweep(cfg, o = {}) {
  const plan = planSweep(cfg);
  const t0 = performance.now();
  /** @type {VirtualTest[]} */
  const tests = [];
  const chunk = o.chunk ?? 4;
  const total = plan.length;

  for (let i = 0; i < total; i++) {
    if (o.cancel?.aborted) break;
    const t = runVirtualTest(plan[i], tests.length + 1, o);
    tests.push(t);
    o.onTest?.(t);
    if ((i + 1) % chunk === 0 || i === total - 1) {
      o.onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return { tests, wallMs: performance.now() - t0 };
}

/**
 * @typedef {Object} ProtocolPreset
 * @property {string} id @property {string} label @property {string} desc
 * @property {string} claim @property {SweepConfig} cfg
 */

/** @type {ProtocolPreset[]} */
const PROTOCOLS = [
  {
    id: 'mass',
    label: 'MASA → T',
    desc: 'L = 1.00 m · m ∈ [0.2, 5.0] kg · N = 200',
    claim: 'Masa nu intră în ecuația mișcării: ΔT ≡ 0 până la zgomotul integratorului.',
    cfg: { ...DEFAULT_SWEEP, Lmin: 1, Lmax: 1, nL: 1, mmin: 0.2, mmax: 5, nM: 200, cap: 200 },
  },
  {
    id: 'length',
    label: 'LUNGIME → g',
    desc: 'L ∈ [0.25, 2.00] m · m ∈ [0.5, 4.0] kg · N = 200',
    claim: 'T² ∝ L — panta regresiei dă g experimental.',
    cfg: { ...DEFAULT_SWEEP, Lmin: 0.25, Lmax: 2, nL: 25, mmin: 0.5, mmax: 4, nM: 8, cap: 200 },
  },
  {
    id: 'amplitude',
    label: 'AMPLITUDINE → T',
    desc: 'L = 1.00 m · θ₀ ∈ [0.05, 1.40] rad · N = 200',
    claim: 'Izocronismul se strică la amplitudine mare — seria Borda prezice cu cât.',
    cfg: { ...DEFAULT_SWEEP, Lmin: 1, Lmax: 1, nL: 1, mmin: 1, mmax: 1, nM: 1, thmin: 0.05, thmax: 1.4, nTh: 200, cap: 200 },
  },
  {
    id: 'grid',
    label: 'GRILĂ COMPLETĂ',
    desc: 'L × m × θ₀ cartesian product · N = 200',
    claim: 'Matrice multifactor: izolează L (activ) de m (izolat) și testează corecția de amplitudine.',
    cfg: { ...DEFAULT_SWEEP, nL: 10, nM: 4, thmin: 0.05, thmax: 0.8, nTh: 5, cap: 200 },
  },
];
