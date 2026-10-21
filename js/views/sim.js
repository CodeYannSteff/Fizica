/* ============================================================================
   VIEW 01 — SIM: live drafting-board simulation with instrument readouts.
   ========================================================================== */


/**
 * @typedef {import('../core/physics/systems.js').PendulumParams} PendulumParams
 */

function initSim() {
  /** @type {PendulumParams} */
  const params = {
    type: 'simple',
    g: 9.80665,
    L: 1, L2: 0.6,
    m: 1, m2: 1,
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

  const sys = new PendulumSystem(cloneParams(params));
  const board = new DraftingBoard(/** @type {HTMLCanvasElement} */ ($('#sim-canvas')));
  const phaseCanvas = /** @type {HTMLCanvasElement} */ ($('#sim-phase'));

  const opt = { ...DEFAULT_BOARD_OPTIONS, title: undefined };

  let running = true;
  let lastFrame = performance.now();
  let fps = 60;
  let lastFpsAt = performance.now();
  let frames = 0;

  /** @type {number[]} */
  const trailTheta = [];
  /** @type {number[]} */
  const trailT = [];
  /** @type {number[]} */
  const phTh = [];
  /** @type {number[]} */
  const phOm = [];
  let measured = { T: 0, std: 0, cycles: 0 };

  // ------------------------------------------------------------- inputs --
  /** @type {Record<string, HTMLInputElement|HTMLSelectElement>} */
  const num = {};
  for (const id of [
    'sim-L', 'sim-m', 'sim-L2', 'sim-m2', 'sim-radius', 'sim-kg', 'sim-g',
    'sim-theta0', 'sim-omega0', 'sim-damping', 'sim-driveA', 'sim-driveW',
    'sim-kp', 'sim-kd',
  ]) {
    const el = /** @type {HTMLInputElement} */ ($(`#${id}`));
    num[id] = el;
  }
  const inertiaSel = /** @type {HTMLSelectElement} */ ($('#sim-inertia'));
  const controlChk = /** @type {HTMLInputElement} */ ($('#sim-control'));

  function readInputs(reseed) {
    const g = (/** @type {string} */ id, fallback) => {
      const v = Number(num[id].value);
      return Number.isFinite(v) ? v : fallback;
    };
    const prevTheta = params.theta0;
    params.L = Math.max(0.02, g('sim-L', 1));
    params.m = Math.max(0.01, g('sim-m', 1));
    params.L2 = Math.max(0.02, g('sim-L2', 0.6));
    params.m2 = Math.max(0.01, g('sim-m2', 1));
    params.radius = Math.max(0.01, g('sim-radius', 0.5));
    params.kGyr = Math.max(0.01, g('sim-kg', 0.5));
    params.g = Math.max(0.01, g('sim-g', 9.80665));
    params.theta0 = Math.max(0.001, Math.min(3.14, g('sim-theta0', 0.35)));
    params.omega0 = g('sim-omega0', 0);
    params.damping = Math.max(0, g('sim-damping', 0));
    params.driveA = g('sim-driveA', 0);
    params.driveOmega = Math.max(0, g('sim-driveW', 0));
    params.Kp = Math.max(0, g('sim-kp', 24));
    params.Kd = Math.max(0, g('sim-kd', 6));
    params.inertia = /** @type {any} */ (inertiaSel.value);
    params.control = controlChk.checked;

    if (reseed || Math.abs(prevTheta - params.theta0) > 1e-12) {
      resetSim();
    } else {
      sys.params = cloneParams(params);
    }
    syncTypeUI();
  }

  function syncTypeUI() {
    document.body.dataset.type = params.type;
    $('#st-system').textContent = TYPE_LABEL[params.type] ?? '—';
    $('#kv-type').textContent = TYPE_LABEL[params.type] ?? '—';
  }

  for (const id of Object.keys(num)) {
    num[id].addEventListener('input', () => readInputs(false));
  }
  inertiaSel.addEventListener('change', () => readInputs(false));
  controlChk.addEventListener('change', () => readInputs(false));

  // type segmented control
  const seg = $('#sim-type-seg');
  seg.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target).closest('button[data-type]');
    if (!btn) return;
    for (const b of seg.querySelectorAll('button')) b.classList.remove('is-active');
    btn.classList.add('is-active');
    params.type = /** @type {any} */ (btn.dataset.type);
    resetSim();
    syncTypeUI();
  });

  // drafting options
  const optEl = {
    vectors: /** @type {HTMLInputElement} */ ($('#opt-vectors')),
    trail: /** @type {HTMLInputElement} */ ($('#opt-trail')),
    grid: /** @type {HTMLInputElement} */ ($('#opt-grid')),
    dims: /** @type {HTMLInputElement} */ ($('#opt-dims')),
    hatch: /** @type {HTMLInputElement} */ ($('#opt-hatch')),
    density: /** @type {HTMLInputElement} */ ($('#opt-density')),
    timescale: /** @type {HTMLInputElement} */ ($('#opt-timescale')),
  };
  function readOpt() {
    opt.vectors = optEl.vectors.checked;
    opt.trail = optEl.trail.checked;
    opt.grid = optEl.grid.checked;
    opt.dims = optEl.dims.checked;
    opt.hatch = optEl.hatch.checked;
    opt.density = Number(optEl.density.value);
  }
  for (const k of ['vectors', 'trail', 'grid', 'dims', 'hatch', 'density']) {
    optEl[k].addEventListener('input', readOpt);
  }
  readOpt();

  // ------------------------------------------------------------ transport --
  const runBtn = /** @type {HTMLButtonElement} */ ($('#sim-run'));
  runBtn.addEventListener('click', () => {
    running = !running;
    runBtn.textContent = running ? '⏸ Pauză' : '▶ Rulează';
    runBtn.classList.toggle('is-active', !running);
  });
  $('#sim-step').addEventListener('click', () => {
    running = false;
    runBtn.textContent = '▶ Rulează';
    runBtn.classList.remove('is-active');
    advance(0.01, true);
  });
  $('#sim-reset').addEventListener('click', () => resetSim());
  $('#sim-random').addEventListener('click', () => {
    const th = Math.round((0.05 + Math.random() * 1.2) * 1000) / 1000;
    num['sim-theta0'].value = String(th);
    readInputs(true);
  });
  $('#sim-log').addEventListener('click', () => {
    const T = measured.T > 0 ? measured.T : sys.snapshot().periodBorda;
    const uT = measured.T > 0 ? Math.max(measured.std, 5e-4) : 0.002;
    addRow({
      L: params.L,
      m: params.m,
      theta0: params.theta0,
      T,
      uT,
      source: 'virtual',
      note: `SIM ${params.type.toUpperCase()}${measured.T > 0 ? '' : ' (Borda)'}`,
    });
    flash(`TRIMIS T = ${T.toFixed(4)} s → FOAIA DE DATE`);
  });

  function resetSim() {
    sys.params = cloneParams(params);
    sys.reset();
    board.clearTrail();
    trailTheta.length = 0;
    trailT.length = 0;
    phTh.length = 0;
    phOm.length = 0;
    measured = { T: 0, std: 0, cycles: 0 };
  }

  /** @param {number} dtSim @param {boolean} forceSingle */
  function advance(dtSim, forceSingle) {
    const maxStep = 0.004;
    const steps = forceSingle ? 1 : Math.max(1, Math.min(64, Math.ceil(dtSim / maxStep)));
    const dt = dtSim / steps;
    for (let i = 0; i < steps; i++) {
      sys.step(dt);
      const r = sys.snapshot();
      trailT.push(sys.t);
      trailTheta.push(r.theta);
      phTh.push(r.theta);
      phOm.push(r.omega);
      if (trailT.length > 6000) { trailT.splice(0, 2000); trailTheta.splice(0, 2000); }
      if (phTh.length > 4000) { phTh.splice(0, 1000); phOm.splice(0, 1000); }
    }
  }

  function updateMeasurements() {
    if (trailT.length > 48) {
      const m = detectPeriod(trailT, trailTheta, 3);
      if (m.cycles >= 3) measured = m;
    }
  }

  function updateReadouts(r) {
    $('#ro-t').innerHTML = `${r.t.toFixed(3)}<small>s</small>`;
    $('#ro-theta').innerHTML = `${r.theta.toFixed(3)}<small>rad</small>`;
    $('#ro-omega').innerHTML = `${r.omega.toFixed(3)}<small>rad/s</small>`;
    $('#ro-tension').innerHTML = `${r.tension.toFixed(2)}<small>N</small>`;
    $('#ro-energy').innerHTML = `${r.energy.toFixed(3)}<small>J</small>`;
    $('#ro-t0').innerHTML = `${r.periodTheory.toFixed(3)}<small>s</small>`;
    $('#ro-tb').innerHTML = `${r.periodBorda.toFixed(3)}<small>s</small>`;
    $('#ro-tm').textContent = measured.T > 0
      ? `${measured.T.toFixed(4)} ±${Math.max(measured.std, 5e-4).toFixed(4)}s`
      : '——';
    if (measured.T > 0) {
      const d = measured.T - r.periodBorda;
      $('#ro-dtm').innerHTML =
        `<span class="${Math.abs(d) >= 0.01 ? 'accent' : ''}">${d >= 0 ? '+' : ''}${d.toFixed(5)}</span><small>s</small>`;
    } else {
      $('#ro-dtm').innerHTML = '——<small>s</small>';
    }

    $('#st-time').textContent = `${r.t.toFixed(3)}s`;
    $('#st-theta').textContent = `${r.theta.toFixed(3)}rad`;
    $('#st-t0').textContent = `${r.periodTheory.toFixed(3)}s`;

    const wn = Math.sqrt(params.g / Math.max(1e-6, r.leff));
    $('#kv-leff').textContent = `${r.leff.toFixed(3)} m`;
    $('#kv-wn').textContent = `${wn.toFixed(3)} rad/s`;
    const xi = params.damping / (2 * wn);
    $('#kv-xi').textContent = xi.toFixed(3);
    $('#kv-regime').textContent =
      params.damping === 0
        ? params.driveA !== 0
          ? 'ANTRENAT'
          : 'NEAMORTIZAT'
        : xi < 1
          ? 'SUBAMORTIZAT'
          : Math.abs(xi - 1) < 1e-6
            ? 'CRITIC'
            : 'SUPRAAMORTIZAT';
    $('#kv-amp').textContent = `${Math.abs(params.theta0).toFixed(3)} rad`;
  }

  let measureTick = 0;

  function frame(now) {
    const dtWall = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    frames++;
    if (now - lastFpsAt > 500) {
      fps = Math.round((frames * 1000) / (now - lastFpsAt));
      frames = 0;
      lastFpsAt = now;
      $('#st-fps').textContent = String(fps);
    }

    if (running) {
      const scale = Number(optEl.timescale.value);
      advance(dtWall * scale, false);
    }

    const r = sys.snapshot();
    const b1 = { x: r.x, y: r.y };
    if (opt.trail) board.pushTrail(b1.x, b1.y, 1);
    board.render(sys, r, opt);

    if (++measureTick % 24 === 0) {
      updateMeasurements();
      drawPhase(phaseCanvas, phTh, phOm);
    }
    updateReadouts(r);
    requestAnimationFrame(frame);
  }

  // initial paint before the first rAF (avoids a blank stage)
  syncTypeUI();
  updateReadouts(sys.snapshot());
  board.render(sys, sys.snapshot(), opt);
  requestAnimationFrame(frame);

  return {
    /** Called when the tab becomes visible — re-fit canvases. */
    onShow() {
      lastFrame = performance.now();
    },
  };

  /** @param {string} msg */
  function flash(msg) {
    const el = $('#st-msg');
    el.textContent = msg;
    el.classList.add('status-item--alert');
    setTimeout(() => {
      el.textContent = 'GATA';
      el.classList.remove('status-item--alert');
    }, 2600);
  }
}
