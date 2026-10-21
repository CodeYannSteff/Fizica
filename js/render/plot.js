/* ============================================================================
   BRUTALIST PLOT — axes as solid black rules, technical ticks, red "+" test
   points with bracket error bars, continuous black regression line.
   ========================================================================== */


/**
 * @typedef {Object} PlotSpec
 * @property {number[]} xs
 * @property {number[]} ys
 * @property {number[]} [us]         per-point ± uncertainties (same units as ys)
 * @property {{slope:number,intercept:number,r2:number}|null} [fit]
 * @property {string} [xLabel]
 * @property {string} [yLabel]
 * @property {string} [title]
 * @property {boolean} [equation]
 * @property {{x:number,y:number}[]} [extras]   secondary series (hollow squares)
 * @property {string} [extrasLabel]
 */

/**
 * "Nice" axis step from a rough target count of ticks.
 * @param {number} raw
 */
function niceStep(raw) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-12))));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y
 * @param {string} text
 * @param {'center'|'left'|'right'} [align]
 */
function label(ctx, x, y, text, align = 'center') {
  ctx.save();
  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.fillStyle = INK;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** @param {number} v */
function num(v) {
  if (!Number.isFinite(v)) return '——';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return String(Number(v.toPrecision(4)));
}

/**
 * Draw the main T²-vs-L style scatter + regression.
 * @param {HTMLCanvasElement} canvas
 * @param {PlotSpec} spec
 */
function drawPlot(canvas, spec) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  const m = { l: 62, r: 22, t: 34, b: 52 };
  const pw = Math.max(10, w - m.l - m.r);
  const ph = Math.max(10, h - m.t - m.b);

  const xs = spec.xs.filter((v) => Number.isFinite(v));
  const ys = spec.ys.filter((v) => Number.isFinite(v));
  if (xs.length < 1) {
    ctx.fillStyle = INK;
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FĂRĂ DATE — RULEAZĂ UN PROTOCOL SAU IMPORTĂ RÂNDURI', w / 2, h / 2);
    ctx.font = '400 10px "JetBrains Mono", monospace';
    ctx.fillText('MODULUL 04 BATCH-200 · MODULUL 05 DATE', w / 2, h / 2 + 18);
    return;
  }

  // --- domain ------------------------------------------------------------
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (spec.fit) {
    y0 = Math.min(y0, spec.fit.slope * x0 + spec.fit.intercept);
    y1 = Math.max(y1, spec.fit.slope * x1 + spec.fit.intercept);
  }
  if (x1 - x0 < 1e-9) { x0 -= 0.5; x1 += 0.5; }
  if (y1 - y0 < 1e-9) { y0 -= 0.5; y1 += 0.5; }
  const xPad = (x1 - x0) * 0.06;
  const yPad = (y1 - y0) * 0.1;
  x0 -= xPad; x1 += xPad; y0 = Math.max(0, y0 - yPad); y1 += yPad;

  const X = (/** @type {number} */ v) => m.l + ((v - x0) / (x1 - x0)) * pw;
  const Y = (/** @type {number} */ v) => m.t + ph - ((v - y0) / (y1 - y0)) * ph;

  // --- millimetre grid ---------------------------------------------------
  const xsStep = niceStep((x1 - x0) / 7);
  const ysStep = niceStep((y1 - y0) / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let v = Math.ceil(x0 / xsStep) * xsStep; v <= x1; v += xsStep) {
    ctx.moveTo(Math.round(X(v)) + 0.5, m.t);
    ctx.lineTo(Math.round(X(v)) + 0.5, m.t + ph);
  }
  for (let v = Math.ceil(y0 / ysStep) * ysStep; v <= y1; v += ysStep) {
    ctx.moveTo(m.l, Math.round(Y(v)) + 0.5);
    ctx.lineTo(m.l + pw, Math.round(Y(v)) + 0.5);
  }
  ctx.stroke();

  // --- title --------------------------------------------------------------
  if (spec.title) {
    ctx.fillStyle = INK;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(spec.title, m.l, 8);
    ctx.textBaseline = 'alphabetic';
  }

  // --- axes ---------------------------------------------------------------
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(m.l, m.t);
  ctx.lineTo(m.l, m.t + ph);
  ctx.lineTo(m.l + pw, m.t + ph);
  ctx.stroke();

  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.fillStyle = INK;
  for (let v = Math.ceil(x0 / xsStep) * xsStep; v <= x1; v += xsStep) {
    const px = X(v);
    ctx.beginPath();
    ctx.moveTo(px, m.t + ph);
    ctx.lineTo(px, m.t + ph + 6);
    ctx.stroke();
    label(ctx, px, m.t + ph + 17, num(v));
  }
  for (let v = Math.ceil(y0 / ysStep) * ysStep; v <= y1; v += ysStep) {
    const py = Y(v);
    ctx.beginPath();
    ctx.moveTo(m.l - 6, py);
    ctx.lineTo(m.l, py);
    ctx.stroke();
    label(ctx, m.l - 10, py, num(v), 'right');
  }

  // axis titles
  ctx.save();
  ctx.font = '700 10.5px "JetBrains Mono", monospace';
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(spec.xLabel ?? 'x', m.l + pw / 2, h - 8);
  ctx.translate(13, m.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(spec.yLabel ?? 'y', 0, 0);
  ctx.restore();

  // --- regression line ------------------------------------------------------
  if (spec.fit) {
    const { slope, intercept } = spec.fit;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(X(x0), Y(slope * x0 + intercept));
    ctx.lineTo(X(x1), Y(slope * x1 + intercept));
    ctx.stroke();

    if (spec.equation !== false) {
      const eq = `y = ${num(slope)}·x ${intercept >= 0 ? '+' : '−'} ${num(Math.abs(intercept))}   R²=${spec.fit.r2.toFixed(4)}`;
      ctx.font = '700 10px "JetBrains Mono", monospace';
      const tw = ctx.measureText(eq).width;
      const ex = m.l + pw - tw - 12;
      const ey = m.t + 14;
      ctx.fillStyle = PAPER;
      ctx.fillRect(ex - 5, ey - 11, tw + 10, 16);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(ex - 5, ey - 11, tw + 10, 16);
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.fillText(eq, ex, ey);
    }
  }

  // --- error bars + red "+" points -------------------------------------------
  const n = Math.min(spec.xs.length, spec.ys.length);
  for (let i = 0; i < n; i++) {
    const x = spec.xs[i];
    const y = spec.ys[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const px = X(x);
    const py = Y(y);
    const u = spec.us?.[i] ?? 0;

    if (u > 0) {
      const up = Y(y + u);
      const dn = Y(y - u);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      // bracket-style error bar: spine + squared caps
      ctx.moveTo(px, up);
      ctx.lineTo(px, dn);
      ctx.moveTo(px - 5, up);
      ctx.lineTo(px + 5, up);
      ctx.moveTo(px - 5, dn);
      ctx.lineTo(px + 5, dn);
      // tick marks on the spine at ±u (technical bracket read)
      ctx.moveTo(px - 3, up + 4);
      ctx.lineTo(px, up);
      ctx.moveTo(px - 3, dn - 4);
      ctx.lineTo(px, dn);
      ctx.stroke();
    }

    // red cross marker
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 5, py);
    ctx.lineTo(px + 5, py);
    ctx.moveTo(px, py - 5);
    ctx.lineTo(px, py + 5);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 1.5, py - 1.5, 3, 3);
  }

  // --- secondary series -------------------------------------------------------
  if (spec.extras?.length) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = PAPER;
    ctx.lineWidth = 1.6;
    for (const e of spec.extras) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const px = X(e.x);
      const py = Y(e.y);
      ctx.fillRect(px - 4, py - 4, 8, 8);
      ctx.strokeRect(px - 4, py - 4, 8, 8);
    }
    if (spec.extrasLabel) {
      ctx.font = '500 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.fillText(`□ ${spec.extrasLabel}`, m.l + pw - 6, m.t + ph - 8);
    }
  }

  // legend for markers
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = SIGNAL;
  ctx.fillText('+ PUNCT MĂSURAT', m.l + 6, m.t + ph - 8);
}

/**
 * Compact time-series strip (used by the camera module).
 * @param {HTMLCanvasElement} canvas
 * @param {ArrayLike<number>} ts
 * @param {ArrayLike<number>} ys
 * @param {{label?:string, yUnit?:string}} [opt]
 */
function drawStrip(canvas, ts, ys, opt = {}) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  const n = Math.min(ts.length, ys.length);
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(opt.label ?? 'θ(t)', 8, 6);
  ctx.textBaseline = 'alphabetic';
  if (n < 2) {
    ctx.font = '400 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SE AȘTEAPTĂ SEMNAL', w / 2, h / 2);
    return;
  }

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = ys[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(1e-6, hi - lo);
  lo -= span * 0.12;
  hi += span * 0.12;
  const t0 = ts[0];
  const t1 = ts[n - 1];
  const tspan = Math.max(1e-6, t1 - t0);
  const X = (/** @type {number} */ t) => 6 + ((t - t0) / tspan) * (w - 12);
  const Y = (/** @type {number} */ v) => 22 + (h - 34) * (1 - (v - lo) / (hi - lo));

  // zero line
  if (lo < 0 && hi > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(6, Y(0));
    ctx.lineTo(w - 6, Y(0));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = X(ts[i]);
    const py = Y(ys[i]);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${hi.toFixed(2)} ${opt.yUnit ?? ''}`, w - 6, 34);
  ctx.fillText(`${lo.toFixed(2)}`, w - 6, h - 8);
  ctx.textAlign = 'left';
  ctx.fillText(`${t0.toFixed(1)}s`, 6, h - 8);
}

/**
 * Phase portrait (θ, ω) — a raw instrument trace, no decoration.
 * @param {HTMLCanvasElement} canvas
 * @param {ArrayLike<number>} thetas
 * @param {ArrayLike<number>} omegas
 */
function drawPhase(canvas, thetas, omegas) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, 6);
  ctx.lineTo(w / 2, h - 6);
  ctx.moveTo(6, h / 2);
  ctx.lineTo(w - 6, h / 2);
  ctx.stroke();

  const n = Math.min(thetas.length, omegas.length);
  if (n < 2) {
    ctx.fillStyle = INK;
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('URMĂ DE FAZĂ θ / ω', w / 2, h / 2);
    return;
  }

  let maxA = Math.max(1e-6, ...[...thetas].slice(-2000).map(Math.abs));
  let maxW = Math.max(1e-6, ...[...omegas].slice(-2000).map(Math.abs));
  maxA = Math.max(maxA, 0.05);
  maxW = Math.max(maxW, 0.05);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const from = Math.max(0, n - 4000);
  for (let i = from; i < n; i++) {
    const px = w / 2 + (thetas[i] / maxA) * (w / 2 - 8);
    const py = h / 2 - (omegas[i] / maxW) * (h / 2 - 8);
    if (i === from) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = '500 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`θ ±${maxA.toFixed(2)}rad`, 6, h - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`ω ±${maxW.toFixed(2)}`, w - 6, 14);
}

/**
 * Horizontal bar comparison used by ISOLATE (4 quadrant periods).
 * @param {HTMLCanvasElement} canvas
 * @param {{label:string,value:number}[]} rows
 * @param {string} [unit]
 */
function drawBars(canvas, rows, unit = 's') {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { ctx, w, h } = fit;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  if (!rows.length) return;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  const rowH = Math.min(46, (h - 16) / rows.length);
  rows.forEach((r, i) => {
    const y = 8 + i * rowH;
    const bw = ((w - 150) * r.value) / max;
    ctx.fillStyle = INK;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.label, 8, y + rowH / 2);
    ctx.fillStyle = i === 0 ? SIGNAL : INK;
    ctx.fillRect(110, y + 6, Math.max(2, bw), rowH - 14);
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText(`${r.value.toFixed(4)} ${unit}`, w - 8, y + rowH / 2);
  });
  ctx.textBaseline = 'alphabetic';
}
