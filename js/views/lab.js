/* ============================================================================
   VIEW 03 — LAB-CAM: physical measurement with computer vision.
   Camera or video file → colour/luma/motion blob tracking → live angle
   series → the same period estimator as the simulator → data-sheet rows.
   ========================================================================== */


function initLab() {
  const video = /** @type {HTMLVideoElement} */ ($('#cam-video'));
  const overlay = /** @type {HTMLCanvasElement} */ ($('#cam-overlay'));
  const frame = $('#cam-frame');
  const placeholder = $('#cam-placeholder');
  const fileInput = /** @type {HTMLInputElement} */ ($('#cam-file'));
  const stateEl = $('#cam-state');

  const tracker = new BlobTracker();

  /** @type {{x:number,y:number}|null} pivot in intrinsic video px */
  let pivot = null;
  /** @type {MediaStream|null} */
  let stream = null;
  let running = false;
  let paused = false;
  /** @type {'none'|'pivot'|'bob'} */
  let armMode = 'none';

  /** @type {number[]} */
  const ts = [];
  /** @type {number[]} */
  const ths = [];
  /** @type {{x:number,y:number}[]} */
  const posTrail = [];
  let lastAngle = NaN;
  /** last presented frame's media time — loop/scrub detection */
  let lastVt = -1;
  let period = { T: 0, std: 0, cycles: 0 };
  let blob = /** @type {import('../core/vision/tracker.js').Blob|null} */ (null);

  const strip = /** @type {HTMLCanvasElement} */ ($('#lab-strip'));

  // --------------------------------------------------------- geometry ----
  /** Letterboxed video box ↔ intrinsic frame mapping (object-fit: contain). */
  function layout() {
    const bw = frame.clientWidth;
    const bh = frame.clientHeight;
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const s = Math.min(bw / vw, bh / vh);
    return { bw, bh, vw, vh, s, ox: (bw - vw * s) / 2, oy: (bh - vh * s) / 2 };
  }

  /** @param {number} clientX @param {number} clientY */
  function toSource(clientX, clientY) {
    const rect = overlay.getBoundingClientRect();
    const L = layout();
    const bx = clientX - rect.left;
    const by = clientY - rect.top;
    return {
      x: (bx - L.ox) / L.s,
      y: (by - L.oy) / L.s,
    };
  }

  /** @param {number} sx @param {number} sy */
  function toCss(sx, sy) {
    const L = layout();
    return { x: L.ox + sx * L.s, y: L.oy + sy * L.s };
  }

  /** Offscreen working buffer, capped at 480 px wide. */
  const buf = document.createElement('canvas');
  const bctx = /** @type {CanvasRenderingContext2D} */ (buf.getContext('2d', { willReadFrequently: true }));
  let bufScale = 1;

  function grab() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    const sc = Math.min(1, 480 / vw);
    const w = Math.round(vw * sc);
    const h = Math.round(vh * sc);
    if (buf.width !== w || buf.height !== h) {
      buf.width = w;
      buf.height = h;
      bufScale = w / vw;
      tracker.reset();
    }
    bctx.drawImage(video, 0, 0, w, h);
    return bctx.getImageData(0, 0, w, h);
  }

  // ------------------------------------------------------ user actions ---
  async function startCamera() {
    try {
      stopAll();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      video.src = '';
      await video.play();
      boot();
    } catch (err) {
      setStatus('Camera refuzată / indisponibilă', 'is-lost');
      $('#st-msg').textContent =
        'CAMERA INDISPONIBILĂ — PERMISIUNE RESPINSĂ SAU FĂRĂ DISPOZITIV. MODUL FIȘIER VIDEO FUNCȚIONEAZĂ ÎN CONTINUARE.';
      console.error(err);
    }
  }

  /** @param {File} file */
  function openFile(file) {
    stopAll();
    const url = URL.createObjectURL(file);
    video.srcObject = null;
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.play().then(boot).catch((err) => {
      console.error(err);
      setStatus('Redare eșuată', 'is-lost');
    });
  }

  function boot() {
    pivot = null;
    tracker.reset();
    ts.length = 0;
    ths.length = 0;
    posTrail.length = 0;
    period = { T: 0, std: 0, cycles: 0 };
    running = true;
    paused = false;
    placeholder.classList.add('hidden');
    setStatus('SE CAUTĂ ȚINTA', '');
    armMode = 'pivot';
    $('#st-msg').textContent = 'LAB: DĂ CLIC PE PIVOT ÎN ÎNREGISTRARE';
    lastVt = -1;
    tick();
    requestFrame();
  }

  function stopAll() {
    running = false;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    video.pause();
    video.srcObject = null;
  }

  function stop() {
    stopAll();
    placeholder.classList.remove('hidden');
    setStatus('Oprit', '');
    clearOverlay();
  }

  /** @param {string} text @param {string} cls */
  function setStatus(text, cls) {
    stateEl.textContent = text;
    stateEl.className = `track-state ${cls}`.trim();
  }

  function clearOverlay() {
    const fit = fitCanvas(overlay);
    if (!fit) return;
    fit.ctx.clearRect(0, 0, fit.w, fit.h);
  }

  // ---------------------------------------------------------- calibration -
  overlay.addEventListener('click', (e) => {
    if (!running || video.videoWidth === 0) return;
    const p = toSource(e.clientX, e.clientY);
    if (armMode === 'pivot' || !pivot) {
      pivot = p;
      armMode = 'bob';
      $('#st-msg').textContent = 'LAB: PIVOT SETAT — ACUM DĂ CLIC PE BILĂ PENTRU CALIBRAREA CULOARII';
      setStatus('ȚINTĂ SETATĂ', '');
      return;
    }
    if (armMode === 'bob') {
      calibrateAt(p);
    }
  });

  /** @param {{x:number,y:number}} p source px → buffer px */
  function calibrateAt(p) {
    const img = grab();
    if (!img) return;
    tracker.calibrate(img, Math.round(p.x * bufScale), Math.round(p.y * bufScale));
    armMode = 'none';
    // start the period series from the calibration frame on
    ts.length = 0;
    ths.length = 0;
    posTrail.length = 0;
    period = { T: 0, std: 0, cycles: 0 };
    setStatus('ȚINTĂ FIXATĂ', 'is-locked');
    $('#st-msg').textContent = `LAB: CULOARE CALIBRATĂ rgb(${tracker.p.target.join(',')})`;
  }

  $('#cam-pivot-btn').addEventListener('click', () => {
    armMode = 'pivot';
    setStatus('PIVOT SETAT', '');
    $('#st-msg').textContent = 'LAB: DĂ CLIC PE PIVOT ÎN ÎNREGISTRARE';
  });
  $('#cam-bob-btn').addEventListener('click', () => {
    armMode = 'bob';
    setStatus('ȚINTĂ SETATĂ', '');
    $('#st-msg').textContent = 'LAB: DĂ CLIC PE BILĂ ÎN ÎNREGISTRARE';
  });
  $('#cam-start').addEventListener('click', startCamera);
  $('#cam-file-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) openFile(f);
  });
  $('#cam-stop').addEventListener('click', stop);
  const toggleBtn = /** @type {HTMLButtonElement} */ ($('#cam-toggle'));
  toggleBtn.addEventListener('click', () => {
    if (!running) return;
    paused = !paused;
    toggleBtn.textContent = paused ? '▶ Continuă' : '⏸ Pauză';
    if (paused) video.pause();
    else video.play().catch(() => {});
  });

  // -------------------------------------------------------- tuning inputs -
  $('#cam-mode-seg').addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target).closest('button[data-mode]');
    if (!btn) return;
    for (const b of $('#cam-mode-seg').querySelectorAll('button')) b.classList.remove('is-active');
    btn.classList.add('is-active');
    const m = btn.dataset.mode;
    if (m === 'invert') {
      tracker.p.mode = 'luma';
      tracker.p.invertLuma = true;
    } else {
      tracker.p.mode = /** @type {any} */ (m);
      tracker.p.invertLuma = false;
    }
    reseed();
  });

  function reseed() {
    if (!pivot || !video.videoWidth) return;
    tracker.reset();
    // guess: put the search window below the pivot (hanging pendulum)
    tracker.seed(pivot.x * bufScale, (pivot.y + video.videoHeight * 0.35) * bufScale);
  }

  const bindRange = (/** @type {string} */ id, /** @param {number} */ fn) => {
    const el = /** @type {HTMLInputElement} */ ($(`#${id}`));
    el.addEventListener('input', () => fn(Number(el.value)));
    fn(Number(el.value));
  };
  bindRange('cam-tol', (v) => { tracker.p.colorTol = v; });
  bindRange('cam-luma', (v) => { tracker.p.lumaTh = v; });
  bindRange('cam-motion', (v) => { tracker.p.motionTh = v; });
  bindRange('cam-window', (v) => { tracker.p.window = v; });
  bindRange('cam-smooth', (v) => { tracker.p.smoothing = v / 100; });

  // ------------------------------------------------------------ main loop -
  /** Overlay + readouts at display rate. */
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    drawOverlay();
    drawReadouts();
  }

  /**
   * Frame-accurate sampler: requestVideoFrameCallback fires once per frame
   * actually presented by the decoder and carries that frame's mediaTime.
   * Pairing angle with mediaTime (not performance.now()) removes decoder
   * presentation jitter, which otherwise inflates every measured period.
   */
  function requestFrame() {
    if (!running) return;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      // very old engine: fall back to the rAF sampler below
      fallbackSample();
      return;
    }
    video.requestVideoFrameCallback(onVideoFrame);
  }

  /** @param {number} _now @param {{mediaTime?:number}|undefined} meta */
  function onVideoFrame(_now, meta) {
    if (!running) return;
    requestFrame();
    if (paused || video.readyState < 2) return;
    const vt = meta && Number.isFinite(meta.mediaTime) ? meta.mediaTime : video.currentTime;
    if (lastVt >= 0 && vt < lastVt - 0.05) {
      // loop restart or scrub: the old angle series is no longer comparable.
      // Keep the last good lock on screen — same footage, same pendulum.
      ts.length = 0;
      ths.length = 0;
      posTrail.length = 0;
    }
    lastVt = vt;
    sampleFrame(vt);
  }

  /** rAF fallback for engines without requestVideoFrameCallback. */
  function fallbackSample() {
    if (!running) return;
    requestAnimationFrame(fallbackSample);
    if (!paused && video.readyState >= 2) sampleFrame(video.currentTime);
  }

  /** @param {number} vt media timestamp of the frame just grabbed */
  function sampleFrame(vt) {
    const img = grab();
    if (!img) return;
    blob = tracker.update(img, performance.now());

    if (pivot && blob.found) {
      // buffer px → source px
      const sx = blob.x / bufScale;
      const sy = blob.y / bufScale;
      const dx = sx - pivot.x;
      const dy = sy - pivot.y;
      const bottom = /** @type {HTMLInputElement} */ ($('#cam-bottom-pivot')).checked;
      const ang = bottom ? Math.atan2(dx, -dy) : Math.atan2(dx, dy);
      lastAngle = ang;

      ts.push(vt);
      ths.push(ang);
      if (ts.length > 900) { ts.splice(0, 300); ths.splice(0, 300); }
      posTrail.push({ x: sx, y: sy });
      if (posTrail.length > 46) posTrail.shift();

      if (ths.length % 8 === 0 && ths.length > 50) {
        // trim the leading stuck segment (footage held at rest before motion):
        // zero-crossings that span it would otherwise inflate the period by
        // up to the length of the hold — inside the outlier fence for slow
        // pendulums, which drags the mean.
        let i0 = 0;
        const th0s = ths[0];
        for (let i = 1; i < ths.length - 40; i++) {
          if (Math.abs(ths[i] - th0s) > 0.08) {
            i0 = i;
            break;
          }
        }
        // 2 clean periods are enough to lock: a 10 s clip of a 2.5 s pendulum
        // only ever contains 3 zero-crossings, so a 3-period lock was
        // impossible for slow pendulums within a single video loop.
        const m = detectPeriod(ts.slice(i0), ths.slice(i0), 2);
        if (m.cycles >= 2) period = m;
      }
      setStatus(blob.conf > 0.35 ? 'ȚINTĂ FIXATĂ' : 'SLAB', blob.conf > 0.35 ? 'is-locked' : 'is-lost');
    } else {
      setStatus(blob.found ? 'FĂRĂ PIVOT' : 'PIERDUT — SE CAUTĂ', blob.found ? '' : 'is-lost');
    }
  }

  /** ΔT = locked T − T_Borda(L, θ₀, g₀) using the Log-Measurement inputs. */
  function modelDeltaT() {
    if (!period.T) return NaN;
    const L = Math.max(0.01, Number(/** @type {HTMLInputElement} */ ($('#lab-L')).value) || 1);
    const th0 = Math.max(0.001, Number(/** @type {HTMLInputElement} */ ($('#lab-th0')).value) || 0.2);
    return period.T - periodBorda({ L, m: 1, theta0: th0, g: G_STD, type: 'simple' });
  }

  function drawReadouts() {
    $('#lab-theta').innerHTML = Number.isFinite(lastAngle)
      ? `${lastAngle.toFixed(3)}<small>rad</small>`
      : '——<small>rad</small>';
    $('#lab-T').innerHTML = period.T
      ? `${period.T.toFixed(4)} ±${Math.max(period.std, 0.002).toFixed(4)}<small>s</small>`
      : '——';
    $('#lab-cycles').textContent = String(period.cycles);
    const d = modelDeltaT();
    $('#lab-dT').innerHTML = Number.isFinite(d)
      ? `<span class="${Math.abs(d) >= 0.01 ? 'accent' : ''}">${d >= 0 ? '+' : ''}${d.toFixed(5)}</span><small>s</small>`
      : '——<small>s</small>';
    if (period.T && period.amplitude > 0.01) {
      const th0El = /** @type {HTMLInputElement} */ ($('#lab-th0'));
      if (document.activeElement !== th0El) {
        th0El.value = period.amplitude.toFixed(3);
      }
    }
    if (ths.length > 8 && Math.floor(performance.now() / 250) % 2 === 0) {
      drawStrip(strip, ts, ths, { label: 'θ(t) — CAMERĂ', yUnit: 'rad' });
    }
  }

  function drawOverlay() {
    const fit = fitCanvas(overlay);
    if (!fit) return;
    const { ctx, w, h } = fit;
    ctx.clearRect(0, 0, w, h);
    if (!video.videoWidth) return;
    const L = layout();

    // search window
    if (blob) {
      const c = toCss(blob.x / bufScale, blob.y / bufScale);
      const rw = (blob.window / bufScale) * L.s;
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = blob.found ? '#ffffff' : '#ff3b30';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - rw, c.y - rw, rw * 2, rw * 2);
      ctx.setLineDash([]);
    }

    // position trail
    if (posTrail.length > 1) {
      ctx.fillStyle = '#ff3b30';
      posTrail.forEach((p, i) => {
        const c = toCss(p.x, p.y);
        ctx.globalAlpha = 0.15 + (0.7 * i) / posTrail.length;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // bob marker
    if (blob && pivot) {
      const c = toCss(blob.x / bufScale, blob.y / bufScale);
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
      ctx.moveTo(c.x - 16, c.y);
      ctx.lineTo(c.x + 16, c.y);
      ctx.moveTo(c.x, c.y - 16);
      ctx.lineTo(c.x, c.y + 16);
      ctx.stroke();
      tag2(ctx, c.x + 20, c.y - 14, `x=${(blob.x / bufScale).toFixed(1)} y=${(blob.y / bufScale).toFixed(1)}`, '#ff3b30');
    }

    // pivot crosshair + angle
    if (pivot) {
      const c = toCss(pivot.x, pivot.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x - 14, c.y);
      ctx.lineTo(c.x + 14, c.y);
      ctx.moveTo(c.x, c.y - 14);
      ctx.lineTo(c.x, c.y + 14);
      ctx.stroke();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
      tag2(ctx, c.x + 18, c.y + 4, `PIVOT ${pivot.x.toFixed(0)},${pivot.y.toFixed(0)}`, '#ffffff');

      if (blob && Number.isFinite(lastAngle)) {
        const b = toCss(blob.x / bufScale, blob.y / bufScale);
        // tie line
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        tag2(ctx, (c.x + b.x) / 2 + 8, (c.y + b.y) / 2, `θ=${lastAngle.toFixed(3)}rad`, '#ffffff');
      }
    } else {
      tag2(ctx, w / 2, h - 30, 'CLIC PENTRU SETAREA PIVOTULUI', '#ffffff');
    }
  }

  /** White-on-black technical tag that stays readable over video. */
  function tag2(ctx, x, y, text, color) {
    ctx.save();
    ctx.font = '700 10px "JetBrains Mono", monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x - 4, y - 11, tw + 8, 15);
    ctx.fillStyle = color === '#ffffff' ? '#ffffff' : color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - 3);
    ctx.restore();
  }

  // ---------------------------------------------------------------- log ---
  $('#lab-log').addEventListener('click', () => {
    if (!period.T) {
      $('#st-msg').textContent = 'LAB: ÎNCĂ NU S-A BLOCAT O PERIOADĂ — TREBUIE ≥2 OSCILAȚII CURATE';
      return;
    }
    const L = Math.max(0.01, Number(/** @type {HTMLInputElement} */ ($('#lab-L')).value) || 1);
    const m = Math.max(0.001, Number(/** @type {HTMLInputElement} */ ($('#lab-m')).value) || 0.05);
    const th0 = Math.max(0.001, Number(/** @type {HTMLInputElement} */ ($('#lab-th0')).value) || 0.2);
    addRow({
      L,
      m,
      theta0: th0,
      T: period.T,
      uT: Math.max(period.std, 0.002),
      source: 'camera',
      note: `CAM ${period.cycles} cicluri`,
    });
    const dLT = modelDeltaT();
    $('#st-msg').textContent =
      `LAB: ÎNREGISTRAT T=${period.T.toFixed(4)}s` +
      (Number.isFinite(dLT) ? ` ΔT=${dLT >= 0 ? '+' : ''}${dLT.toFixed(5)}s` : '') +
      ' (CAMERĂ) → FOAIA DE DATE';
  });

  return {
    onShow() {
      drawStrip(strip, ts, ths, { label: 'θ(t) — CAMERĂ', yUnit: 'rad' });
    },
    onResize() {
      drawOverlay();
    },
    dispose: stop,
  };
}
