/* ============================================================================
   DRAFTING BOARD — technical-plan rendering of a pendulum system.
   Millimetre grid · solid geometry · dashed force vectors with numeric
   labels · stipple trajectory · engineering dimension lines.
   ========================================================================== */


const INK = '#000000';
const PAPER = '#ffffff';
const SIGNAL = '#ff3b30';

/**
 * @typedef {import('../core/physics/systems.js').Readings} Readings
 * @typedef {import('../core/physics/systems.js').PendulumParams} PendulumParams
 *
 * @typedef {Object} BoardOptions
 * @property {boolean} grid
 * @property {boolean} trail
 * @property {boolean} vectors
 * @property {boolean} dims
 * @property {boolean} hatch
 * @property {number} density  1..10
 * @property {string} [title]
 */

/** @type {BoardOptions} */
const DEFAULT_BOARD_OPTIONS = {
  grid: true,
  trail: true,
  vectors: true,
  dims: true,
  hatch: true,
  density: 6,
};

class DraftingBoard {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {{x:number,y:number,a:number}[]} */
    this.trail = [];
    this.maxTrail = 900;
  }

  clearTrail() {
    this.trail = [];
  }

  /** @param {number} x @param {number} y @param {number} a 0..1 */
  pushTrail(x, y, a) {
    this.trail.push({ x, y, a });
    if (this.trail.length > this.maxTrail) {
      this.trail.splice(0, this.trail.length - this.maxTrail);
    }
  }

  /**
   * @param {import('../core/physics/systems.js').PendulumSystem} sys

   * @param {BoardOptions} opt
   */
  render(sys, r, opt = DEFAULT_BOARD_OPTIONS) {
    const fit = fitCanvas(this.canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    this.renderRegion(ctx, 0, 0, w, h, sys, r, opt);
  }

  /**
   * Draw into a sub-rectangle of an existing context — used by the
   * 2×2 isolation grid, where four systems share one canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} ox @param {number} oy @param {number} w @param {number} h
   * @param {import('../core/physics/systems.js').PendulumSystem} sys
   * @param {Readings} r
   * @param {BoardOptions} opt
   */
  renderRegion(ctx, ox0, oy0, w, h, sys, r, opt = DEFAULT_BOARD_OPTIONS) {
    ctx.save();
    ctx.translate(ox0, oy0);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const p = sys.params;

    if (opt.grid) this.drawGrid(ctx, w, h);

    // ---- geometry -------------------------------------------------------
    const inverted = p.type === 'inverted';
    const span = p.type === 'double' ? p.L + p.L2 : effectiveSpan(p);
    const px = scaleFor(w, h, span, inverted);
    const ox = Math.round(w / 2);
    const oy = Math.round(inverted ? h * 0.72 : h * 0.26);

    const toPx = (/** @type {number} */ x, /** @type {number} */ y) => ({
      x: ox + x * px,
      y: oy - y * px, // world +y is up
    });

    // trail
    if (opt.trail) {
      const step = Math.max(1, Math.round(11 - opt.density));
      ctx.fillStyle = INK;
      for (let i = 0; i < this.trail.length; i += step) {
        const tp = this.trail[i];
        const pt = toPx(tp.x, tp.y);
        const age = i / this.trail.length;
        ctx.globalAlpha = 0.18 + 0.62 * age;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ---- dimension line for L -------------------------------------------
    if (opt.dims) {
      const dirX = inverted ? ox - 46 : ox - 42;
      const sign = inverted ? -1 : 1; // rod hangs below (normal) / stands above
      this.dimLine(ctx, dirX, oy, dirX, oy + sign * p.L * px, `L = ${p.L.toFixed(3)} m`);
      if (p.type === 'double') {
        this.dimLine(
          ctx,
          dirX,
          oy + sign * p.L * px,
          dirX,
          oy + sign * (p.L + p.L2) * px,
          `L₂ = ${p.L2.toFixed(3)} m`,
        );
      }
    }

    // ---- rods & bobs ------------------------------------------------------
    const b1 = toPx(r.x, r.y);
    ctx.strokeStyle = INK;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();

    if (p.type === 'double') {
      const b2 = toPx(r.x2, r.y2);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.stroke();
      this.drawBob(ctx, b1.x, b1.y, bobRadius(p.m, px), 'circle');
      this.drawBob(ctx, b2.x, b2.y, bobRadius(p.m2, px), 'square');
    } else {
      this.drawBob(ctx, b1.x, b1.y, bobRadius(p.m, px), 'circle', p, r);
    }

    // ---- pivot crosshair ---------------------------------------------------
    this.pivotCross(ctx, ox, oy, inverted ? 'BOTTOM' : 'TOP');

    // ---- angle arc ----------------------------------------------------------
    if (Math.abs(r.theta) > 1e-4) {
      const arcR = Math.min(46, span * px * 0.34);
      const ref = inverted ? -Math.PI / 2 : -Math.PI / 2;
      const th = inverted ? -r.theta : r.theta;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ox, oy, arcR, Math.min(ref, ref + th), Math.max(ref, ref + th));
      ctx.stroke();
      const midA = ref + th / 2;
      this.tag(
        ctx,
        ox + Math.cos(midA) * (arcR + 16),
        oy + Math.sin(midA) * (arcR + 16),
        `θ=${r.theta.toFixed(3)}rad`,
        INK,
        'center',
      );
    }

    // ---- force vectors -------------------------------------------------------
    if (opt.vectors) this.forces(ctx, p, r, b1, toPx);

    // ---- tension hatch ---------------------------------------------------------
    if (opt.hatch && r.tension > 1.5 * Math.max(1e-6, p.m * p.g)) {
      this.hatch(ctx, ox, oy, b1.x, b1.y, p.m * p.g, r.tension);
    }

    // ---- HUD ---------------------------------------------------------------------
    ctx.fillStyle = INK;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const head =
      opt.title ??
      `${p.type.toUpperCase()} · L=${p.L.toFixed(3)}m · m=${p.m.toFixed(3)}kg · g=${p.g.toFixed(5)}`;
    ctx.fillText(head, 12, 10);
    ctx.textAlign = 'right';
    ctx.fillText(`t = ${r.t.toFixed(3)} s`, w - 12, 10);
    ctx.textBaseline = 'alphabetic';

    // scale bar
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    const sb = 0.25 * px; // 25 cm
    ctx.beginPath();
    ctx.moveTo(12, h - 18);
    ctx.lineTo(12 + sb, h - 18);
    ctx.moveTo(12, h - 22);
    ctx.lineTo(12, h - 14);
    ctx.moveTo(12 + sb, h - 22);
    ctx.lineTo(12 + sb, h - 14);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('250 mm', 12 + sb + 6, h - 15);
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w @param {number} h
   */
  drawGrid(ctx, w, h) {
    ctx.save();
    ctx.lineWidth = 1;
    // minor millimetre-ish grid
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 8) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0.5; y < h; y += 8) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    // major grid
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0.5; y < h; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Engineering dimension line with end ticks and a boxed label.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
   * @param {string} label
   */
  dimLine(ctx, x1, y1, x2, y2, label) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (const [ex, ey] of [[x1, y1], [x2, y2]]) {
      ctx.moveTo(ex - nx * 5, ey - ny * 5);
      ctx.lineTo(ex + nx * 5, ey + ny * 5);
    }
    ctx.stroke();

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.font = '500 9px "JetBrains Mono", monospace';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(mx - tw / 2 - 4, my - 8, tw + 8, 15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - tw / 2 - 4, my - 8, tw + 8, 15);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, my);
    ctx.textBaseline = 'alphabetic';

    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x @param {number} y @param {number} r
   * @param {'circle'|'square'} shape
   * @param {PendulumParams} [p]
   * @param {Readings} [rd]
   */
  drawBob(ctx, x, y, r, shape, p, rd) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
    else ctx.rect(x - r, y - r, 2 * r, 2 * r);
    ctx.fill();

    // physical pendulum: outline the actual rigid body silhouette
    if (p && rd && p.type === 'physical') {
      const scale = r / Math.max(1e-6, Math.abs(rd.leff) || 1);
      if (p.inertia === 'disk_rim' || p.inertia === 'hoop_rim') {
        const R = Math.max(6, p.radius * Math.abs(scale || 12));
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        if (p.inertia === 'disk_rim') {
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x @param {number} y @param {string} kind
   */
  pivotCross(ctx, x, y, kind) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - 4.5, y - 4.5, 9, 9);
    ctx.fillStyle = INK;
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`O·${kind}(0.000, 0.000)`, x + 15, y - 6);
    ctx.restore();
  }

  /**
   * Free-body vectors: mg (black dashed, vertical) and |T| (signal red,
   * along the rod). Lengths scale with force, labelled with exact values.
   * @param {CanvasRenderingContext2D} ctx
   */
  forces(ctx, p, r, b1, toPx) {
    const Fmax = Math.max(p.m * p.g, r.tension, 1e-6);
    const len = 54; // px for Fmax
    const mg = p.m * p.g;
    const ax = b1.x;
    const ay = b1.y;

    // gravity — straight down
    const gl = (mg / Fmax) * len;
    this.arrow(ctx, ax, ay, ax, ay + gl, INK, true);
    this.tag(ctx, ax + 6, ay + gl + 4, `mg=${mg.toFixed(2)}N`, INK, 'left');

    // tension — toward pivot
    const vx = 0 - r.x;
    const vy = 0 - r.y;
    const vl = Math.hypot(vx, vy) || 1;
    const tl = (r.tension / Fmax) * len;
    this.arrow(ctx, ax, ay, ax + (vx / vl) * tl, ay - (vy / vl) * tl, SIGNAL, true);
    this.tag(
      ctx,
      ax + (vx / vl) * (tl + 6),
      ay - (vy / vl) * (tl + 6),
      `|T|=${r.tension.toFixed(2)}N`,
      SIGNAL,
      'center',
    );

    // second rod tension
    if (p.type === 'double') {
      const b2 = toPx(r.x2, r.y2);
      const vx2 = r.x - r.x2;
      const vy2 = r.y - r.y2;
      const v2 = Math.hypot(vx2, vy2) || 1;
      const t2l = (r.tension2 / Fmax) * len;
      this.arrow(ctx, b2.x, b2.y, b2.x + (vx2 / v2) * t2l, b2.y - (vy2 / v2) * t2l, SIGNAL, true);
      this.tag(
        ctx,
        b2.x + (vx2 / v2) * (t2l + 6),
        b2.y - (vy2 / v2) * (t2l + 6),
        `|T₂|=${r.tension2.toFixed(2)}N`,
        SIGNAL,
        'center',
      );
    }

  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  arrow(ctx, x1, y1, x2, y2, color, dashed) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    if (dashed) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(a - 0.36), y2 - 8 * Math.sin(a - 0.36));
    ctx.lineTo(x2 - 8 * Math.cos(a + 0.36), y2 - 8 * Math.sin(a + 0.36));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Technical hatch marks along the rod when tension is high.
   * @param {CanvasRenderingContext2D} ctx
   */
  hatch(ctx, x1, y1, x2, y2, mg, tension) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const n = Math.floor(len / 7);
    const load = Math.min(1, (tension - mg) / (3 * mg + 1e-9));
    ctx.save();
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = 1.4;
    const arm = 4 + 6 * load;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = x1 + dx * t;
      const y = y1 + dy * t;
      ctx.moveTo(x - nx * arm, y - ny * arm);
      ctx.lineTo(x + nx * arm, y + ny * arm);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  tag(ctx, x, y, text, color, align = 'center') {
    ctx.save();
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    const w = ctx.measureText(text).width;
    const px0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.fillStyle = PAPER;
    ctx.fillRect(px0 - 3, y - 8, w + 6, 13);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 1);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}

/** @param {PendulumParams} p */
function effectiveSpan(p) {
  return p.type === 'physical' ? Math.max(p.L, p.radius * 2) : p.L;
}

/**
 * Pick px-per-metre so the system fills ~58% of the drawing height.
 * @param {number} w @param {number} h @param {number} span @param {boolean} inverted
 */
function scaleFor(w, h, span, inverted) {
  const avail = h * (inverted ? 0.55 : 0.58);
  const byH = avail / Math.max(0.05, span);
  const byW = (w * 0.38) / Math.max(0.05, span);
  return Math.min(byH, byW);
}

/**
 * Bob radius from mass — logarithmic so 0.2 kg and 20 kg both read well.
 * @param {number} m @param {number} px
 */
function bobRadius(m, px) {
  const r = 7 + 5.5 * Math.cbrt(Math.max(0.01, m));
  return Math.min(30, Math.max(7, r));
}
