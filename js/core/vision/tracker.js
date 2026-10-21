/* ============================================================================
   BLOB TRACKER — dependency-free target tracking on raw ImageData.
   Three strategies, all producing the same centroid stream:
     COLOR   — RGB distance to a calibrated target colour
     LUMA    — absolute luminance threshold (optionally inverted)
     MOTION  — adaptive background subtraction (works without calibration)
   Tracking runs inside a prediction window → cheap and robust to clutter.
   ========================================================================== */

/**
 * @typedef {'color'|'luma'|'motion'} TrackMode
 *
 * @typedef {Object} Blob
 * @property {number} x @property {number} y @property {number} area
 * @property {number} conf @property {boolean} found @property {number} window
 *
 * @typedef {Object} TrackerParams
 * @property {TrackMode} mode
 * @property {[number, number, number]} target
 * @property {number} colorTol
 * @property {number} lumaTh
 * @property {number} motionTh
 * @property {number} smoothing
 * @property {number} minArea
 * @property {number} window
 * @property {boolean} invertLuma
 */

/** @type {TrackerParams} */
const DEFAULT_TRACKER = {
  mode: 'color',
  target: [255, 59, 48],
  colorTol: 78,
  lumaTh: 165,
  motionTh: 30,
  smoothing: 0.5,
  minArea: 10,
  window: 110,
  invertLuma: false,
};

class BlobTracker {
  constructor() {
    /** @type {TrackerParams} */
    this.p = { ...DEFAULT_TRACKER, target: [...DEFAULT_TRACKER.target] };
    /** @type {{x:number,y:number,t:number}|null} */
    this.last = null;
    this.vel = { x: 0, y: 0 };
    /** @type {Float32Array|null} */
    this.bg = null;
    this.bgW = 0;
    this.bgH = 0;
    this.lost = 0;
  }

  reset() {
    this.last = null;
    this.vel = { x: 0, y: 0 };
    this.bg = null;
    this.lost = 0;
  }

  /**
   * Calibrate the colour model from a clicked pixel block.
   * @param {ImageData} img @param {number} cx @param {number} cy @param {number} [radius]
   */
  calibrate(img, cx, cy, radius = 4) {
    const { data, width } = img;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy - radius; y <= cy + radius; y++) {
      if (y < 0 || y >= img.height) continue;
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x < 0 || x >= width) continue;
        const i = (y * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        n++;
      }
    }
    if (n > 0) {
      this.p.target = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      this.p.mode = 'color';
    }
    this.seed(cx, cy);
  }

  /** @param {number} x @param {number} y */
  seed(x, y) {
    this.last = { x, y, t: performance.now() };
    this.vel = { x: 0, y: 0 };
    this.lost = 0;
  }

  /**
   * @param {ImageData} img
   * @param {number} now
   * @returns {Blob}
   */
  update(img, now) {
    const { width: W, height: H, data } = img;
    const p = this.p;

    // --- prediction window -------------------------------------------------
    let cx = W / 2, cy = H / 2, win = p.window;
    if (this.last) {
      const dt = Math.max(1e-3, Math.min(0.2, (now - this.last.t) / 1000));
      cx = this.last.x + this.vel.x * dt;
      cy = this.last.y + this.vel.y * dt;
      win = p.window * (1 + Math.min(this.lost, 12) * 0.25);
      cx = clampf(cx, 0, W - 1);
      cy = clampf(cy, 0, H - 1);
    }
    const x0 = Math.max(0, Math.floor(cx - win));
    const x1 = Math.min(W - 1, Math.ceil(cx + win));
    const y0 = Math.max(0, Math.floor(cy - win));
    const y1 = Math.min(H - 1, Math.ceil(cy + win));

    // --- background model (MOTION) ----------------------------------------
    if (p.mode === 'motion') {
      if (!this.bg || this.bgW !== W || this.bgH !== H) {
        this.bg = new Float32Array(W * H);
        this.bgW = W;
        this.bgH = H;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            this.bg[y * W + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
        }
      }
    }

    // --- accumulate --------------------------------------------------------
    let sw = 0, sx = 0, sy = 0;
    const tol2 = p.colorTol * p.colorTol;
    const [tr, tg, tb] = p.target;

    for (let y = y0; y <= y1; y++) {
      const row = y * W;
      for (let x = x0; x <= x1; x++) {
        const i = (row + x) * 4;
        const R = data[i], G = data[i + 1], B = data[i + 2];
        let w = 0;
        if (p.mode === 'color') {
          const dr = R - tr, dg = G - tg, db = B - tb;
          const d2 = dr * dr + dg * dg + db * db;
          if (d2 < tol2) w = 1 - d2 / tol2;
        } else if (p.mode === 'luma') {
          const l = 0.299 * R + 0.587 * G + 0.114 * B;
          if (p.invertLuma ? l < p.lumaTh : l > p.lumaTh) w = 1;
        } else {
          const l = 0.299 * R + 0.587 * G + 0.114 * B;
          const d = Math.abs(l - this.bg[row + x]);
          if (d > p.motionTh) w = Math.min(1, (d - p.motionTh) / 60);
        }
        if (w > 0) {
          sw += w; sx += w * x; sy += w * y;
        }
      }
    }

    // --- background maintenance (never learn the foreground) --------------
    if (p.mode === 'motion' && this.bg) {
      const a = 0.04;
      const sxr = sw > 0 ? sx / sw : -1e9;
      const syr = sw > 0 ? sy / sw : -1e9;
      const r2 = win * win * 0.25;
      for (let y = y0; y <= y1; y++) {
        const row = y * W;
        for (let x = x0; x <= x1; x++) {
          if ((x - sxr) ** 2 + (y - syr) ** 2 < r2 && sw > p.minArea) continue;
          const i = (row + x) * 4;
          const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          this.bg[row + x] = this.bg[row + x] * (1 - a) + l * a;
        }
      }
    }

    // --- verdict -----------------------------------------------------------
    if (sw < p.minArea) {
      this.lost++;
      return {
        x: this.last?.x ?? 0,
        y: this.last?.y ?? 0,
        area: sw,
        conf: 0,
        found: false,
        window: win,
      };
    }

    let bx = sx / sw;
    let by = sy / sw;
    if (this.last) {
      const dt = Math.max(1e-3, Math.min(0.2, (now - this.last.t) / 1000));
      this.vel.x = this.vel.x * 0.55 + ((bx - this.last.x) / dt) * 0.45;
      this.vel.y = this.vel.y * 0.55 + ((by - this.last.y) / dt) * 0.45;
      const a = p.smoothing;
      bx = this.last.x * (1 - a) + bx * a;
      by = this.last.y * (1 - a) + by * a;
    }
    this.last = { x: bx, y: by, t: now };
    this.lost = 0;
    return { x: bx, y: by, area: sw, conf: clampf(sw / 320, 0, 1), found: true, window: win };
  }

  /** @returns {{x:number,y:number}|null} */
  position() {
    return this.last ? { x: this.last.x, y: this.last.y } : null;
  }
}

/** @param {number} v @param {number} lo @param {number} hi */
function clampf(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
