/* ============================================================================
   DOM + FORMAT UTILITIES
   ========================================================================== */

/**
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root]
 * @returns {T}
 */
function $(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return /** @type {T} */ (el);
}

/**
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root]
 * @returns {T|null}
 */
function $$(sel, root = document) {
  return /** @type {T|null} */ (root.querySelector(sel));
}

/**
 * @param {string} sel
 * @param {ParentNode} [root]
 * @returns {Element[]}
 */
function all(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

/**
 * @param {string} tag
 * @param {Record<string, string|number|boolean>|null} [attrs]
 * @param {(Node|string)[]|string} [kids]
 * @returns {HTMLElement}
 */
function h(tag, attrs = null, kids = []) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), /** @type {any} */ (v));
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  const list = Array.isArray(kids) ? kids : [kids];
  for (const k of list) {
    if (k === null || k === undefined || k === false) continue;
    el.append(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return el;
}

/** @param {HTMLElement} el @param {boolean} on */
function visible(el, on) {
  el.style.display = on ? '' : 'none';
}

/** @param {number} n @param {number} [d] */
function fmt(n, d = 3) {
  return Number.isFinite(n) ? n.toFixed(d) : '——';
}

/** @param {number} n @param {number} [sig] */
function fmtSig(n, sig = 4) {
  return Number.isFinite(n) ? String(Number(n.toPrecision(sig))) : '——';
}

/** @param {number} n */
function pctStr(n, d = 3) {
  if (!Number.isFinite(n)) return '——';
  return `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
}

/** Short unique session id, e.g. PL-8F3A2C */
function sessionId() {
  const b = new Uint8Array(3);
  crypto.getRandomValues(b);
  return 'PL-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** @param {Date} [d] */
function utcStamp(d = new Date()) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** @returns {string} */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Resize a canvas to its CSS box × dpr and return the 2d context with the
 * transform already scaled, so drawing code works in CSS pixels.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [dprCap]
 * @returns {{ctx:CanvasRenderingContext2D,w:number,h:number}|null}
 */
function fitCanvas(canvas, dprCap = 2) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Simple localStorage JSON store with in-memory fallback. */
const store = {
  /** @param {string} key @param {any} val */
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* private mode / quota — state simply does not persist */
    }
  },
  /** @param {string} key @param {any} [fallback] */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
};
