/* ============================================================================
   VIEW 04 — BATCH-200: virtual test sweep engine.
   Protocol presets + custom grid → N independent RK4 trials streamed into
   a live result sheet, with running statistics and an instant g estimate.
   ========================================================================== */


/**
 * @typedef {import('../core/sim/engine.js').SweepConfig} SweepConfig
 * @typedef {import('../core/sim/engine.js').VirtualTest} VirtualTest
 */

function initBatch() {
  const list = $('#protocol-list');
  /** @type {SweepConfig|null} */
  let activePreset = null;
  /** @type {{aborted:boolean}} */
  const cancel = { aborted: false };
  let running = false;
  /** @type {VirtualTest[]} */
  let results = [];
  const tbody = /** @type {HTMLTableSectionElement} */ ($('#sw-table tbody'));

  const f = {
    type: /** @type {HTMLSelectElement} */ ($('#sw-type')),
    target: /** @type {HTMLInputElement} */ ($('#sw-target')),
    Lmin: /** @type {HTMLInputElement} */ ($('#sw-Lmin')),
    Lmax: /** @type {HTMLInputElement} */ ($('#sw-Lmax')),
    mmin: /** @type {HTMLInputElement} */ ($('#sw-mmin')),
    mmax: /** @type {HTMLInputElement} */ ($('#sw-mmax')),
    thmin: /** @type {HTMLInputElement} */ ($('#sw-thmin')),
    thmax: /** @type {HTMLInputElement} */ ($('#sw-thmax')),
    damp: /** @type {HTMLInputElement} */ ($('#sw-damp')),
  };

  // ------------------------------------------------------- protocol list --
  for (const p of PROTOCOLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--block';
    btn.dataset.protocol = p.id;
    btn.innerHTML = `${p.label}<br /><span style="font-weight:400;font-size:9px;opacity:.7">${p.desc}</span>`;
    btn.addEventListener('click', () => applyPreset(p.id));
    list.append(btn);
  }

  /** @param {string} id */
  function applyPreset(id) {
    const p = PROTOCOLS.find((x) => x.id === id);
    if (!p) return;
    activePreset = p.cfg;
    f.type.value = p.cfg.type;
    f.Lmin.value = String(p.cfg.Lmin);
    f.Lmax.value = String(p.cfg.Lmax);
    f.mmin.value = String(p.cfg.mmin);
    f.mmax.value = String(p.cfg.mmax);
    f.thmin.value = String(p.cfg.thmin);
    f.thmax.value = String(p.cfg.thmax);
    f.damp.value = String(p.cfg.damping);
    f.target.value = String(p.cfg.cap);
    $('#sw-claim').textContent = p.claim;
    for (const b of list.querySelectorAll('button')) {
      b.classList.toggle('is-active', b.dataset.protocol === id);
    }
    $('#sw-run').textContent = `▶ Rulează ${p.cfg.cap} de teste virtuale`;
    $('#st-msg').textContent = `PROTOCOL ÎNCĂRCAT: ${p.label}`;
  }

  // Editing any field switches to custom mode: the grid is re-balanced to N.
  for (const el of Object.values(f)) {
    el.addEventListener('input', () => {
      activePreset = null;
      for (const b of list.querySelectorAll('button')) b.classList.remove('is-active');
      $('#sw-run').textContent = `▶ Rulează ${Math.round(Number(f.target.value) || 200)} de teste virtuale`;
    });
    el.addEventListener('change', () => {
      activePreset = null;
    });
  }

  /** @returns {SweepConfig} */
  function readConfig() {
    const target = Math.max(4, Math.min(600, Math.round(Number(f.target.value) || 200)));
    if (activePreset) {
      // honour the protocol's axis structure exactly (fixed axes stay fixed)
      return { ...activePreset, type: /** @type {any} */ (f.type.value), cap: target };
    }
    const base = {
      type: /** @type {any} */ (f.type.value),
      g: 9.80665,
      Lmin: Number(f.Lmin.value) || 0.25,
      Lmax: Number(f.Lmax.value) || 2,
      nL: 10,
      mmin: Number(f.mmin.value) || 0.2,
      mmax: Number(f.mmax.value) || 5,
      nM: 4,
      thmin: Number(f.thmin.value) || 0.15,
      thmax: Number(f.thmax.value) || 0.15,
      nTh: 1,
      damping: Math.max(0, Number(f.damp.value) || 0),
      cap: target,
    };
    if (base.Lmax < base.Lmin) [base.Lmin, base.Lmax] = [base.Lmax, base.Lmin];
    if (base.mmax < base.mmin) [base.mmin, base.mmax] = [base.mmax, base.mmin];
    if (base.thmax < base.thmin) [base.thmin, base.thmax] = [base.thmax, base.thmin];
    if (base.thmax - base.thmin > 1e-9) base.nTh = 5; // amplitude sweep axis
    return rebalanceSweep(base, target);
  }

  /** @param {VirtualTest} t */
  function appendRow(t) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${String(t.id).padStart(3, '0')}</td>
      <td class="ta-l"><span class="src-tag src-virtual">VIR</span></td>
      <td>${t.params.L.toFixed(3)}</td>
      <td>${t.params.m.toFixed(3)}</td>
      <td>${t.params.theta0.toFixed(3)}</td>
      <td><b>${t.T ? t.T.toFixed(5) : '——'}</b></td>
      <td>${t.T ? t.uT.toFixed(5) : '——'}</td>
      <td>${t.T0.toFixed(5)}</td>
      <td>${t.TB.toFixed(5)}</td>
      <td>${t.cycles}</td>`;
    tbody.append(tr);
    const wrap = tbody.closest('.sheet-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function updateStats() {
    const n = results.length;
    $('#sw-n').textContent = String(n);
    const Ts = results.map((t) => t.T).filter((v) => v > 0);
    if (Ts.length) {
      const mean = Ts.reduce((s, v) => s + v, 0) / Ts.length;
      const sd = Ts.length > 1
        ? Math.sqrt(Ts.reduce((s, v) => s + (v - mean) ** 2, 0) / (Ts.length - 1))
        : 0;
      $('#sw-mean').textContent = `${mean.toFixed(4)} s`;
      $('#sw-sd').textContent = `${sd.toFixed(5)} s`;
    }
    const xs = results.filter((t) => t.T > 0).map((t) => t.params.L);
    const ys = results.filter((t) => t.T > 0).map((t) => t.T * t.T);
    const fit = linreg(xs, ys);
    $('#sw-g').textContent = fit
      ? `${gravityFromSlope(fit.slope, fit.slopeSe).g.toFixed(4)} m/s²`
      : '——';
  }

  async function run() {
    if (running) return;
    running = true;
    cancel.aborted = false;
    results = [];
    tbody.innerHTML = '';
    const cfg = readConfig();
    const runBtn = /** @type {HTMLButtonElement} */ ($('#sw-run'));
    const cancelBtn = /** @type {HTMLButtonElement} */ ($('#sw-cancel'));
    runBtn.disabled = true;
    cancelBtn.disabled = false;
    $('#sw-fill').style.width = '0%';
    $('#sw-progress-text').textContent = '0 / ' + cfg.cap + ' — 0%';
    $('#st-msg').textContent = `BATCH: SE EXECUTĂ ${cfg.cap} DE TESTE VIRTUALE`;

    const t0 = performance.now();
    await runSweep(cfg, {
      cancel,
      chunk: 3,
      onTest: (t) => {
        results.push(t);
        appendRow(t);
      },
      onProgress: (done, total) => {
        const pct = Math.round((done / total) * 100);
        $('#sw-fill').style.width = `${pct}%`;
        $('#sw-progress-text').textContent = `${done} / ${total} — ${pct}%`;
        updateStats();
      },
    });

    updateStats();
    $('#sw-wall').textContent = `${((performance.now() - t0) / 1000).toFixed(2)} s`;
    $('#sw-fill').style.width = '100%';
    $('#sw-progress-text').textContent = cancel.aborted
      ? `ANULAT — ${results.length} teste păstrate`
      : `${results.length} / ${cfg.cap} — COMPLETAT`;
    runBtn.disabled = false;
    cancelBtn.disabled = true;
    running = false;
    $('#st-msg').textContent = cancel.aborted
      ? 'BATCH: ANULAT DE OPERATOR'
      : `BATCH COMPLETAT: N=${results.length} · g=${$('#sw-g').textContent}`;
  }

  $('#sw-run').addEventListener('click', run);
  $('#sw-cancel').addEventListener('click', () => {
    cancel.aborted = true;
  });

  $('#sw-push').addEventListener('click', () => {
    const rows = results
      .filter((t) => t.T > 0)
      .map((t) => ({
        L: t.params.L,
        m: t.params.m,
        theta0: t.params.theta0,
        T: t.T,
        uT: t.uT,
        source: /** @type {'virtual'} */ ('virtual'),
        note: `BATCH#${String(t.id).padStart(3, '0')} ${t.params.type}`,
      }));
    if (!rows.length) {
      $('#st-msg').textContent = 'BATCH: NIMIC DE TRIMIS — RULEAZĂ MAI ÎNTÂI O VARIAȚIE';
      return;
    }
    addRows(rows);
    $('#st-msg').textContent = `BATCH: ${rows.length} RÂNDURI TRIMISE → FOAIA DE DATE (MODULUL 05)`;
  });

  // default preset
  applyPreset('length');

  return {
    onShow() {},
    get results() {
      return results;
    },
  };
}
