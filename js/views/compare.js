/* ============================================================================
   VIEW 02 — ISOLATE: 2×2 split-grid comparison.
   Four instances of the same system differ in exactly one factor; the giant
   typographic verdict shows the induced period spread.
   ========================================================================== */


/**
 * @typedef {import('../core/physics/systems.js').PendulumParams} PendulumParams
 * @typedef {import('../core/physics/systems.js').PendulumType} PendulumType
 */

const FACTORS = {
  mass: {
    key: /** @type {const} */ ('m'),
    unit: 'kg',
    label: 'MASA m',
    hyp: 'T = 2π√(L/g) nu conține niciun termen de masă. Cele patru cuadrante au geometrie identică și diferă doar prin masa bilei.',
    levels: [0.5, 1, 5, 20],
    digits: 2,
  },
  length: {
    key: /** @type {const} */ ('L'),
    unit: 'm',
    label: 'LUNGIME L',
    hyp: 'Lungimea intră liniar în T² — cele patru cuadrante trebuie să producă perioade clar separate.',
    levels: [0.5, 1, 2, 4],
    digits: 2,
  },
  amplitude: {
    key: /** @type {const} */ ('theta0'),
    unit: 'rad',
    label: 'AMPLITUDINE θ₀',
    hyp: 'Izocronismul se menține doar pentru θ mici; amplitudinile mari lungesc T după seria Borda.',
    levels: [0.1, 0.4, 0.9, 1.4],
    digits: 2,
  },
  damping: {
    key: /** @type {const} */ ('damping'),
    unit: '1/s',
    label: 'AMORTIZARE c',
    hyp: 'Amortizarea vâscoasă liniară deplasează perioada amortizată cu √(1−ξ²): un efect mic, dar măsurabil.',
    levels: [0, 0.1, 0.3, 0.6],
    digits: 2,
  },
  gravity: {
    key: /** @type {const} */ ('g'),
    unit: 'm/s²',
    label: 'GRAVITAȚIE g',
    hyp: 'Gravitația scalează cuplul de restabilire — patru lumi (Luna…Jupiter) trebuie să se separe imediat.',
    levels: [1.62, 3.71, 9.81, 24.79],
    digits: 2,
  },
};

const QUAD_LABELS = ['A', 'B', 'C', 'D'];

function initCompare() {
  const canvas = /** @type {HTMLCanvasElement} */ ($('#cmp-canvas'));
  const board = new DraftingBoard(canvas);
  const opt = { ...DEFAULT_BOARD_OPTIONS };

  /** @type {PendulumSystem[]} */
  let systems = [];
  /** @type {{x:number,y:number}[][]} */
  let trails = [[], [], [], []];
  /** @type {number[][]} */
  let thSeries = [[], [], [], []];
  /** @type {number[][]} */
  let tSeries = [[], [], [], []];

  let running = false;
  let startedAt = 0;
  let done = false;
  /** @type {{key:string,label:string,unit:string,digits:number,hyp:string,levels:number[]}} */
  let factorMeta = FACTORS.mass;
  /** @type {number[]} */
  let levels = [];
  /** @type {PendulumType} */
  const type = 'simple';

  const factorSel = /** @type {HTMLSelectElement} */ ($('#cmp-factor'));
  const inputs = {
    L: /** @type {HTMLInputElement} */ ($('#cmp-base-L')),
    m: /** @type {HTMLInputElement} */ ($('#cmp-base-m')),
    th: /** @type {HTMLInputElement} */ ($('#cmp-base-th')),
    v1: /** @type {HTMLInputElement} */ ($('#cmp-v1')),
    v2: /** @type {HTMLInputElement} */ ($('#cmp-v2')),
    v3: /** @type {HTMLInputElement} */ ($('#cmp-v3')),
    v4: /** @type {HTMLInputElement} */ ($('#cmp-v4')),
  };

  function applyFactorMeta() {
    const meta = FACTORS[factorSel.value] ?? FACTORS.mass;
    factorMeta = meta;
    // seed the level inputs with the classic ladder for this factor
    inputs.v1.value = String(meta.levels[0]);
    inputs.v2.value = String(meta.levels[1]);
    inputs.v3.value = String(meta.levels[2]);
    inputs.v4.value = String(meta.levels[3]);
    $('#cmp-hypothesis').textContent = meta.hyp;
  }

  factorSel.addEventListener('change', applyFactorMeta);
  applyFactorMeta();

  function buildSystems() {
    const base = {
      ...DEFAULT_PARAMS,
      type,
      g: 9.80665,
      L: Math.max(0.02, Number(inputs.L.value) || 1),
      m: Math.max(0.01, Number(inputs.m.value) || 1),
      theta0: Math.max(0.001, Number(inputs.th.value) || 0.3),
      omega0: 0,
      damping: 0,
      driveA: 0,
    };
    levels = [inputs.v1, inputs.v2, inputs.v3, inputs.v4].map(
      (el) => Number(el.value) || 0,
    );
    systems = levels.map((lv) => {
      const p = cloneParams(base);
      /** @type {any} */ (p)[factorMeta.key] = factorMeta.key === 'm' || factorMeta.key === 'L'
        ? Math.max(0.001, lv)
        : lv;
      return new PendulumSystem(p);
    });
    trails = [[], [], [], []];
    thSeries = [[], [], [], []];
    tSeries = [[], [], [], []];
    done = false;
    $('#cmp-verdict').classList.add('hidden');
  }

  function render() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const qw = w / 2;
    const qh = h / 2;

    systems.forEach((sys, i) => {
      const ox = (i % 2) * qw;
      const oy = Math.floor(i / 2) * qh;
      const r = sys.snapshot();
      const qopt = { ...opt, title: `Q${QUAD_LABELS[i]} · ${factorMeta.label} = ${levels[i].toFixed(factorMeta.digits)} ${factorMeta.unit}` };
      board.renderRegion(ctx, ox, oy, qw, qh, sys, r, qopt);
      // quadrant-local trail
      for (let k = 0; k < trails[i].length; k += 3) {
        const pt = trails[i][k];
        const px = ox + pt.x;
        const py = oy + pt.y;
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.15 + 0.6 * (k / Math.max(1, trails[i].length));
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // thick quadrant divider
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(qw, 0);
    ctx.lineTo(qw, h);
    ctx.moveTo(0, qh);
    ctx.lineTo(w, qh);
    ctx.stroke();
  }

  function stepAll(dt) {
    const sub = Math.max(1, Math.ceil(dt / 0.004));
    const d = dt / sub;
    for (let i = 0; i < systems.length; i++) {
      const sys = systems[i];
      for (let s = 0; s < sub; s++) {
        sys.step(d);
        if (s % 2 === 0) {
          const r = sys.snapshot();
          tSeries[i].push(sys.t);
          thSeries[i].push(r.theta);
          const px = innerX(r, sys);
          const py = innerY(r, sys);
          trails[i].push({ x: px, y: py });
          if (trails[i].length > 700) trails[i].shift();
        }
      }
      if (tSeries[i].length > 4000) {
        tSeries[i].splice(0, 2000);
        thSeries[i].splice(0, 2000);
      }
    }
  }

  // quadrant-space projection so the trail survives the renderRegion offset
  /** @param {import('../core/physics/systems.js').Readings} r @param {PendulumSystem} sys */
  function innerX(r, sys) {
    const p = sys.params;
    const span = p.L + (p.type === 'double' ? p.L2 : 0);
    const px = pxPerM(span);
    return quadW() / 2 + r.x * px;
  }
  /** @param {import('../core/physics/systems.js').Readings} r @param {PendulumSystem} sys */
  function innerY(r, sys) {
    const p = sys.params;
    const span = p.L + (p.type === 'double' ? p.L2 : 0);
    const px = pxPerM(span);
    const oy = 0.26 * quadH();
    return oy - r.y * px;
  }
  function quadW() {
    return canvas.getBoundingClientRect().width / 2;
  }
  function quadH() {
    return canvas.getBoundingClientRect().height / 2;
  }
  /** @param {number} span */
  function pxPerM(span) {
    const byH = (quadH() * 0.58) / Math.max(0.05, span);
    const byW = (quadW() * 0.38) / Math.max(0.05, span);
    return Math.min(byH, byW);
  }

  function finish() {
    running = false;
    done = true;
    /** @type {number[]} */
    const Ts = [];
    /** @type {number[]} */
    const stds = [];
    const tbody = /** @type {HTMLTableSectionElement} */ ($('#cmp-table tbody'));
    tbody.innerHTML = '';

    systems.forEach((sys, i) => {
      const m = detectPeriod(tSeries[i], thSeries[i], 3);
      Ts.push(m.T);
      stds.push(m.std);
      const p = sys.params;
      const level = levels[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${QUAD_LABELS[i]}</td>
        <td>${level.toFixed(factorMeta.digits)} ${factorMeta.unit}</td>
        <td>${m.T ? m.T.toFixed(5) : '——'}</td>
        <td>${p.type === 'simple' ? (Math.PI * 2 * Math.sqrt(p.L / p.g)).toFixed(5) : '——'}</td>
        <td>${m.T && Ts[0] ? (m.T - Ts[0]).toFixed(5) : '——'}</td>`;
      tbody.append(tr);
    });

    const valid = Ts.filter((v) => v > 0);
    const spread = valid.length ? Math.max(...valid) - Math.min(...valid) : NaN;
    const noise = valid.length ? Math.max(...stds, 5e-4) : 5e-4;

    $('#cmp-ta').innerHTML = Ts[0] ? `${Ts[0].toFixed(4)}<small>s</small>` : '——';
    $('#cmp-tb').innerHTML = Ts[1] ? `${Ts[1].toFixed(4)}<small>s</small>` : '——';
    $('#cmp-tc').innerHTML = Ts[2] ? `${Ts[2].toFixed(4)}<small>s</small>` : '——';
    $('#cmp-td').innerHTML = Ts[3] ? `${Ts[3].toFixed(4)}<small>s</small>` : '——';
    $('#cmp-spread').textContent = Number.isFinite(spread) ? `${(spread * 1000).toFixed(2)} ms` : '——';

    const isolated = Number.isFinite(spread) && spread <= 2 * noise;
    const verdictEl = $('#cmp-verdict');
    verdictEl.classList.remove('hidden');
    verdictEl.classList.toggle('verdict--ok', isolated);
    $('#cmp-verdict-v').innerHTML = `ΔT = <em>${fmt(spread, 4)}</em> s`;
    $('#cmp-verdict-sub').textContent = isolated
      ? `${factorMeta.label} ESTE IZOLAT — ÎMPRĂȘTIERE ≤ 2σ (σ=${fmt(noise, 5)}s)`
      : `${factorMeta.label} ESTE ACTIV — ÎMPRĂȘTIERE = ${fmt(spread, 5)}s ≫ 2σ (σ=${fmt(noise, 5)}s)`;

    $('#st-msg').textContent = `IZOLARE: ΔT=${fmt(spread, 5)}s PENTRU ${factorMeta.label}`;
  }

  let raf = 0;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - startedAt) / 1000);
    startedAt = now;
    stepAll(dt);

    const allLocked = thSeries.every((s) => s.length > 64);
    const enoughTime = now - bootAt > 9000;
    const anyTooLong = now - bootAt > 14000;
    render();

    if ((allLocked && enoughTime) || anyTooLong) {
      render();
      finish();
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  let bootAt = 0;

  function run() {
    cancelAnimationFrame(raf);
    buildSystems();
    running = true;
    done = false;
    bootAt = performance.now();
    startedAt = bootAt;
    $('#st-msg').textContent = 'IZOLARE: SE RULEAZĂ COMPARAȚIA CU 4 CUADRANTE';
    raf = requestAnimationFrame(loop);
  }

  $('#cmp-run').addEventListener('click', run);
  $('#cmp-to-data').addEventListener('click', () => {
    const rows = systems
      .map((sys, i) => {
        const m = detectPeriod(tSeries[i], thSeries[i], 3);
        const p = sys.params;
        return {
          L: p.L,
          m: p.m,
          theta0: p.theta0,
          T: m.T || Math.PI * 2 * Math.sqrt(p.L / p.g),
          uT: Math.max(m.std, 5e-4),
          source: /** @type {'virtual'} */ ('virtual'),
          note: `IZOLARE ${factorMeta.label}=${(levels[i] ?? 0).toFixed(factorMeta.digits)}`,
        };
      })
      .filter((r) => r.T > 0);
    if (!rows.length) {
      $('#st-msg').textContent = 'IZOLARE: NIMIC DE TRIMIS — RULEAZĂ MAI ÎNTÂI COMPARAȚIA';
      return;
    }
    addRows(rows);
    $('#st-msg').textContent = `IZOLARE: ${rows.length} RÂNDURI TRIMISE → FOAIA DE DATE`;
  });

  // auto-run the first time the tab is opened
  let primed = false;

  return {
    onShow() {
      render();
      if (!primed) {
        primed = true;
        setTimeout(run, 120);
      }
    },
    onResize() {
      render();
    },
    get isDone() {
      return done;
    },
    get systems() {
      return systems;
    },
  };
}
