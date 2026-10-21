/* ============================================================================
   VIEW 05 — DATA: raw data sheet + T² = f(L) regression instrument.
   Editable cells, CSV in/out, live least-squares fit and equation blocks.
   ========================================================================== */


/**
 * @typedef {import('../app/store.js').DataRow} DataRow
 * @typedef {import('../app/store.js').SampleSource} SampleSource
 */

function initData() {
  const tbody = /** @type {HTMLTableSectionElement} */ ($('#data-table tbody'));
  const chart = /** @type {HTMLCanvasElement} */ ($('#data-chart'));
  /** @type {SampleSource|'all'} */
  let filter = 'all';

  // ------------------------------------------------------------- rendering -
  /** Display rounding only; the store keeps full precision. */
  const num = (/** @type {number} */ v, /** @type {number} */ dp) =>
    Number.isFinite(v) ? v.toFixed(dp) : '';

  function render() {
    const rows = state.rows.filter((r) => filter === 'all' || r.source === filter);
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      if (!r.include) tr.classList.add('is-out');
      tr.innerHTML = `
        <td class="ta-l"><input type="checkbox" data-field="include" ${r.include ? 'checked' : ''} /></td>
        <td>${String(i + 1).padStart(2, '0')}</td>
        <td class="ta-l"><span class="src-tag src-${r.source}">${{ virtual: 'VIRTUAL', camera: 'CAMERĂ', import: 'IMPORT' }[r.source] ?? r.source.toUpperCase()}</span></td>
        <td><input type="number" data-field="L" step="0.001" value="${num(r.L, 4)}" /></td>
        <td><input type="number" data-field="m" step="0.001" value="${num(r.m, 3)}" /></td>
        <td><input type="number" data-field="theta0" step="0.01" value="${num(r.theta0, 3)}" /></td>
        <td><input type="number" data-field="T" step="0.0001" value="${num(r.T, 6)}" /></td>
        <td><input type="number" data-field="uT" step="0.0001" value="${num(r.uT, 6)}" /></td>
        <td>${deltaCell(r)}</td>
        <td><b>${(r.T * r.T).toFixed(5)}</b></td>
        <td class="ta-l"><input type="text" data-field="note" value="${escapeAttr(r.note)}" /></td>
        <td><button class="btn btn--sm" data-del title="Delete row">✕</button></td>`;
      tbody.append(tr);
    });
    $('#data-count').textContent = String(state.rows.length);
    $('#data-included').textContent = String(state.rows.filter((r) => r.include).length);
    fitAndPaint();
  }

  /**
   * Model deviation of an individual measurement: ΔT = T − T_Borda(L, θ₀, g₀).
   * Derived at render time — the store keeps raw T only, so CSV in/out and
   * the fit are untouched by this column.
   * @param {DataRow} r
   * @returns {string}
   */
  function deltaCell(r) {
    if (!(r.L > 0) || !Number.isFinite(r.theta0) || !Number.isFinite(r.T)) return '——';
    const d = r.T - periodBorda({ L: r.L, m: r.m, theta0: r.theta0, g: G_STD, type: 'simple' });
    const txt = `${d >= 0 ? '+' : ''}${d.toFixed(5)}`;
    return Math.abs(d) >= 0.01 ? `<span class="accent">${txt}</span>` : txt;
  }

  /** @param {string} s */
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ------------------------------------------------------------- editing --
  tbody.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const tr = input.closest('tr');
    if (!tr || !tr.dataset.id) return;
    const field = input.dataset.field;
    if (!field) return;
    if (field === 'include') {
      updateRow(tr.dataset.id, { include: input.checked });
      return;
    }
    if (field === 'note') {
      updateRow(tr.dataset.id, { note: input.value });
      return;
    }
    const v = Number(input.value);
    if (Number.isFinite(v)) updateRow(tr.dataset.id, { [field]: v });
    else render();
  });

  tbody.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target).closest('[data-del]');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (tr?.dataset.id) removeRow(tr.dataset.id);
  });

  // ------------------------------------------------------------- toolbar ---
  $('#data-add').addEventListener('click', () => {
    addRow({
      L: 1,
      m: 1,
      theta0: 0.2,
      T: 2.0064,
      uT: 0.001,
      source: 'import',
      note: 'manual',
    });
  });

  $('#data-filter').addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target).closest('button[data-filter]');
    if (!btn) return;
    for (const b of $('#data-filter').querySelectorAll('button')) b.classList.remove('is-active');
    btn.classList.add('is-active');
    filter = /** @type {any} */ (btn.dataset.filter);
    render();
  });

  const pop = $('#data-paste-pop');
  $('#data-paste').addEventListener('click', () => pop.classList.toggle('hidden'));
  $('#data-paste-cancel').addEventListener('click', () => pop.classList.add('hidden'));
  $('#data-paste-ok').addEventListener('click', () => {
    const text = /** @type {HTMLTextAreaElement} */ ($('#data-paste-area')).value;
    const rows = parseCSV(text);
    if (!rows.length) {
      $('#st-msg').textContent = 'CSV: Niciun rând valid — așteptat L, m, θ0, T [, uT]';
      return;
    }
    for (const r of rows) addRow(r);
    pop.classList.add('hidden');
    $('#st-msg').textContent = `CSV: ${rows.length} RÂNDURI IMPORTATE`;
  });

  $('#data-export').addEventListener('click', () => {
    const csv = exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pendulumlab_${state.id}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $('#st-msg').textContent = `CSV: ${state.rows.length} RÂNDURI EXPORTATE`;
  });

  $('#data-clear').addEventListener('click', () => {
    if (!state.rows.length) return;
    if (confirm('Ștergi toate rândurile din foaia de date?')) {
      clearRows();
      $('#st-msg').textContent = 'DATE: FOAIA A FOST GOLOITĂ';
    }
  });

  $('#data-all').addEventListener('change', (e) => {
    const on_ = /** @type {HTMLInputElement} */ (e.target).checked;
    for (const r of state.rows) updateRow(r.id, { include: on_ });
  });

  $('#data-fit').addEventListener('click', () => {
    fitAndPaint();
    $('#st-msg').textContent = `REGRESIE: N=${$('#data-included').textContent} · g=${$('#st-g-se').dataset.g ?? '——'}`;
  });

  // ------------------------------------------------------------- fitting --
  function fitAndPaint() {
    const { fit, gravity, n } = computeFit();
    const rows = state.rows.filter((r) => r.include && r.T > 0 && r.L > 0);

    drawPlot(chart, {
      xs: rows.map((r) => r.L),
      ys: rows.map((r) => r.T * r.T),
      us: rows.map((r) => uT2(r.T, r.uT)),
      fit: fit ? { slope: fit.slope, intercept: fit.intercept, r2: fit.r2 } : null,
      xLabel: 'L [m]',
      yLabel: 'T² [s²]',
      title: 'REGRESIE — T² = f(L) · METODA CELOR MAI MICI PĂTRATE',
      equation: true,
    });

    if (fit && n >= 3) {
      $('#eq-slope').innerHTML =
        `PANTA (m) = ${fmt(fit.slope, 4)} &nbsp;|&nbsp; R² = <span class="accent">${fit.r2.toFixed(4)}</span>`;
      $('#eq-g').innerHTML =
        `g<sub>EXP</sub> = 4π²/<span class="accent">m</span> = ${fmt(gravity.g, 4)} m/s² &nbsp; (${pct(gravity.relErr, 3)})`;
      $('#st-slope-se').textContent = `±${fit.slopeSe.toFixed(5)}`;
      $('#st-g-se').textContent = `±${gravity.ug.toFixed(4)}`;
      $('#st-rmse').textContent = fit.residualSe.toFixed(5);
      $('#st-int').textContent = fit.intercept.toFixed(5);
      $('#st-g-se').dataset.g = `${gravity.g.toFixed(4)}`;
      $('#data-fit-state').textContent = `R²=${fit.r2.toFixed(5)}`;
      $('#data-note').innerHTML =
        `Cel mai mic pătrat pe <b>${n}</b> rânduri incluse. g = 4π²·σ(L)/σ(T²) propagat prin pantă; ` +
        `referință g₀ = 9.80665 m/s² (CODATA). σ reziduu = ${fit.residualSe.toFixed(5)} s².`;
    } else {
      const nL = new Set(rows.map((r) => r.L)).size;
      $('#eq-slope').textContent =
        n === 0
          ? 'PANTA (m) = —— | R² = ——  (niciun rând inclus)'
          : `PANTA (m) = —— | R² = ——  (sunt necesare ≥3 L distincte — foaia are ${nL})`;
      $('#eq-g').innerHTML = 'g<sub>EXP</sub> = 4π²/m = ——';
      $('#st-slope-se').textContent = '——';
      $('#st-g-se').textContent = '——';
      $('#st-rmse').textContent = '——';
      $('#st-int').textContent = '——';
      $('#data-fit-state').textContent = 'inactivă';
    }
    $('#st-rows').textContent = String(state.rows.length);
  }

  on('rows', render);

  const ro = new ResizeObserver(() => fitAndPaint());
  ro.observe(chart);

  render();

  return {
    onShow() {
      render();
    },
    refit: fitAndPaint,
  };
}
