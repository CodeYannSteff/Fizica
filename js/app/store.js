/* ============================================================================
   APP STORE — the raw data sheet, regression cache, session identity.
   Every module (SIM, ISOLATE, BATCH, LAB, CSV) writes into the same sheet.
   ========================================================================== */


/**
 * @typedef {'virtual'|'camera'|'import'} SampleSource
 *
 * @typedef {Object} DataRow
 * @property {string} id
 * @property {number} L       length [m]
 * @property {number} m       mass [kg]
 * @property {number} theta0  amplitude [rad]
 * @property {number} T       measured period [s]
 * @property {number} uT      period uncertainty [s]
 * @property {SampleSource} source
 * @property {string} note
 * @property {boolean} include
 */

/** @type {{id:string, view:string, rows:DataRow[], batchIds:string[]}} */
const state = {
  id: sessionId(),
  view: 'sim',
  rows: [],
  batchIds: [],
};

/** @type {Map<string, Set<(rows:DataRow[])=>void>>} */
const listeners = new Map();

/**
 * @param {string} evt
 * @param {(rows:DataRow[])=>void} cb
 */
function on(evt, cb) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(cb);
}

/** @param {string} evt */
function emit(evt) {
  const set = listeners.get(evt);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(state.rows);
    } catch (err) {
      console.error(`[store] listener for "${evt}" failed`, err);
    }
  }
}

function persist() {
  store.set('pendulumlab.rows', state.rows);
  store.set('pendulumlab.session', state.id);
}

/** Load persisted rows (if any) from localStorage. */
function hydrate() {
  const rows = store.get('pendulumlab.rows');
  if (Array.isArray(rows)) state.rows = rows;
  emit('rows');
}

/**
 * @param {Omit<DataRow,'id'|'include'> & {id?:string, include?:boolean}} row
 * @returns {DataRow}
 */
function addRow(row) {
  const full = /** @type {DataRow} */ ({
    id: uid(),
    include: true,
    note: '',
    ...row,
  });
  state.rows.push(full);
  persist();
  emit('rows');
  return full;
}

/**
 * @param {DataRow[]} rows
 */
function addRows(rows) {
  for (const r of rows) {
    state.rows.push({ id: uid(), include: true, note: '', ...r });
  }
  persist();
  emit('rows');
}

/** @param {string} id */
function removeRow(id) {
  state.rows = state.rows.filter((r) => r.id !== id);
  persist();
  emit('rows');
}

function clearRows() {
  state.rows = [];
  state.batchIds = [];
  persist();
  emit('rows');
}

/** @param {string} id @param {Partial<DataRow>} patch */
function updateRow(id, patch) {
  const r = state.rows.find((x) => x.id === id);
  if (!r) return;
  Object.assign(r, patch);
  persist();
  emit('rows');
}

/** @returns {DataRow[]} rows that are enabled and numerically valid */
function usableRows() {
  return state.rows.filter(
    (r) =>
      r.include &&
      Number.isFinite(r.L) &&
      Number.isFinite(r.T) &&
      r.L > 0 &&
      r.T > 0,
  );
}

/**
 * Least-squares fit of T² against L on the included rows.
 * @returns {{fit:import('../core/stats/regression.js').LinReg|null,
 *            gravity:{g:number,ug:number,relErr:number},
 *            n:number}}
 */
function computeFit() {
  const rows = usableRows();
  const xs = rows.map((r) => r.L);
  const ys = rows.map((r) => r.T * r.T);
  const fit = linreg(xs, ys);
  const gravity = fit
    ? gravityFromSlope(fit.slope, fit.slopeSe)
    : { g: NaN, ug: NaN, relErr: NaN };
  return { fit, gravity, n: rows.length };
}

/** @param {DataRow} r */
function tSquared(r) {
  return r.T * r.T;
}

/** @param {DataRow} r */
function rowUT2(r) {
  return uT2(r.T, r.uT);
}

/**
 * Serialize the sheet as CSV (header + rows).
 * @returns {string}
 */
function exportCSV() {
  const head = 'L_m,m_kg,theta0_rad,T_s,uT_s,source,note';
  const lines = state.rows.map((r) =>
    [r.L, r.m, r.theta0, r.T, r.uT, r.source, csvEscape(r.note)].join(','),
  );
  return [head, ...lines].join('\n');
}

/** @param {string} s */
function csvEscape(s) {
  if (!s) return '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Parse pasted CSV: L, m, θ0, T, uT (header optional, comma/semicolon/tab).
 * @param {string} text
 * @returns {DataRow[]}
 */
function parseCSV(text) {
  /** @type {DataRow[]} */
  const out = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[a-z_]/i.test(line) && !/[\d.]/.test(line.split(/[,;\t]/)[0] ?? '')) {
      continue; // header
    }
    const parts = line.split(/[,;\t]/).map((s) => s.trim());
    if (parts.length < 4) continue;
    const L = Number(parts[0]);
    const m = Number(parts[1]);
    const th = Number(parts[2]);
    const T = Number(parts[3]);
    const uT = parts[4] !== undefined && parts[4] !== '' ? Number(parts[4]) : 0.001;
    if (![L, m, th, T].every(Number.isFinite)) continue;
    out.push({
      id: uid(),
      L, m, theta0: th, T,
      uT: Number.isFinite(uT) ? uT : 0.001,
      source: 'import',
      note: 'csv',
      include: true,
    });
  }
  return out;
}
