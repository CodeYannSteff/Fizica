/* ============================================================================
   VIEW 06 — REPORT: "The Printing Press".
   Turns the whole experimental record into a typographic A4 document:
   masthead · input parameters · governing equations · regression analysis ·
   technical schematic · factor diagnostics · measurement appendix.
   ========================================================================== */


/**
 * @typedef {import('../app/store.js').DataRow} DataRow
 * @typedef {import('../core/stats/regression.js').FactorVerdict} FactorVerdict
 */

function initReport() {
  const doc = $('#report-doc');

  // ------------------------------------------------------------- helpers --
  /** @param {string} s */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Fraction / formula helper rendered in monospace with real rules.
   * @param {string} nu @param {string} de
   */
  const frac = (nu, de) =>
    `<span class="frac"><span class="nu">${nu}</span><span class="de">${de}</span></span>`;

  // ------------------------------------------------------------ analysis --
  /**
   * Factor diagnostics straight off the sheet: group by one variable,
   * average T within each level, compare the spread against measurement noise.
   * @returns {FactorVerdict[]}
   */
  function diagnostics() {
    const rows = usableRows();
    const noise =
      rows.reduce((s, r) => s + r.uT, 0) / Math.max(1, rows.length) || 0.001;

    /**
     * Isolation test for one factor: within each stratum where every OTHER
     * variable is held fixed, compare the mean T per level of the factor and
     * take the median spread across strata. This is what keeps a length sweep
     * from confounding the mass verdict (and vice-versa).
     * @param {keyof DataRow} key
     * @param {keyof DataRow[]} others
     */
    function factorSpread(key, others) {
      /** @type {Map<string, DataRow[]>} */
      const buckets = new Map();
      for (const r of rows) {
        const k = others.map((o) => Number(r[o]).toFixed(3)).join('|');
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(r);
      }
      /** @type {number[]} */ const spreads = [];
      /** @type {Set<number>} */ const levels = new Set();
      for (const grp of buckets.values()) {
        const mm = groupMeans(
          grp.map((r) => Number(r[key])),
          grp.map((r) => r.T),
        );
        if (mm.length < 2) continue;
        const vs = mm.map((g) => g.mean);
        spreads.push(Math.max(...vs) - Math.min(...vs));
        for (const g of mm) levels.add(g.level);
      }
      spreads.sort((a, b) => a - b);
      return {
        levels: [...levels].sort((a, b) => a - b),
        spread: spreads.length ? spreads[Math.floor(spreads.length / 2)] : 0,
        strata: spreads.length,
      };
    }

    // ---- MASS: L and θ₀ held fixed ---------------------------------------
    const mf = factorSpread('m', ['L', 'theta0']);
    const massVerdict = {
      factor: 'MASA m',
      levels: mf.levels,
      values: mf.levels.map(() => 0),
      spread: mf.spread,
      noise,
      assessed: mf.strata > 0,
      isolated: mf.strata > 0 && mf.spread <= 2 * noise,
      verdict: mf.strata
        ? `ÎMPRĂȘTIERE ÎN (L,θ₀) = ${fmt(mf.spread * 1000, 3)} ms față de 2σ = ${fmt(2 * noise * 1000, 3)} ms · ${mf.strata} strate`
        : 'NEEVALUAT — FĂRĂ VARIAȚIE DE MASĂ ÎN FOAIE',
    };

    // ---- AMPLITUDE: L and m held fixed -----------------------------------
    const af = factorSpread('theta0', ['L', 'm']);
    const ampVerdict = {
      factor: 'AMPLITUDINE θ₀',
      levels: af.levels,
      values: af.levels.map(() => 0),
      spread: af.spread,
      noise,
      assessed: af.strata > 0,
      isolated: af.strata > 0 && af.spread <= 2 * noise,
      verdict: af.strata
        ? `ÎMPRĂȘTIERE ÎN (L,m) = ${fmt(af.spread * 1000, 3)} ms față de 2σ = ${fmt(2 * noise * 1000, 3)} ms · ${af.strata} strate`
        : 'NEEVALUAT — FĂRĂ VARIAȚIE DE AMPLITUDINE ÎN FOAIE',
    };

    // ---- LENGTH: judged by the regression slope itself --------------------
    const { fit, gravity } = computeFit();
    const tStat = fit && fit.slopeSe > 0 ? Math.abs(fit.slope / fit.slopeSe) : 0;
    const lenLevels = groupMeans(rows.map((r) => r.L), rows.map((r) => r.T));
    const lenVerdict = {
      factor: 'LUNGIME L',
      levels: lenLevels.map((g) => g.level),
      values: lenLevels.map((g) => g.mean),
      spread: lenLevels.length
        ? Math.max(...lenLevels.map((g) => g.mean)) - Math.min(...lenLevels.map((g) => g.mean))
        : 0,
      noise,
      assessed: lenLevels.length >= 2 && Number.isFinite(tStat) && tStat > 0,
      isolated: Number.isFinite(tStat) && tStat < 5,
      verdict:
        lenLevels.length < 2
          ? 'NEEVALUAT — O SINGURĂ LUNGIME ÎN FOAIE'
          : `pantă = ${fmt(fit.slope, 4)} ± ${fit.slopeSe < 5e-5 ? '<0.0001' : fmt(fit.slopeSe, 4)} ` +
            `s²/m · |t| = ${tStat >= 999.5 ? '>999' : fmt(tStat, 1)}`,
    };

    // ---- GRAVITY: from the regression slope --------------------------------
    // A raw T²-vs-L fit over large amplitudes is biased low: the Borda series
    // inflates T, hence T², by (1+θ₀²/16+…)² — predict that deficit first so a
    // systematic amplitude effect is never mislabelled as instrument error.
    const thetaMax = rows.reduce((m, r) => Math.max(m, r.theta0), 0);
    const a2m = thetaMax * thetaMax;
    const bordaMax = 1 + a2m / 16 + (11 * a2m * a2m) / 3072;
    const ampBias = (1 - 1 / (bordaMax * bordaMax)) * 100; // max expected g deficit [%]
    const biased =
      Number.isFinite(gravity.relErr) &&
      Math.abs(gravity.relErr) >= 1 &&
      thetaMax > 0.25 &&
      Math.abs(gravity.relErr) <= Math.abs(ampBias) * 1.3 + 0.3;
    const gravVerdict = {
      factor: 'GRAVITAȚIE g',
      levels: [G_STD],
      values: [gravity.g],
      spread: Math.abs(gravity.g - G_STD),
      noise: gravity.ug || 0,
      assessed: Number.isFinite(gravity.g),
      isolated: Number.isFinite(gravity.g) && Math.abs(gravity.relErr) < 1,
      pill: biased ? 'BIASAT' : undefined,
      verdict:
        !Number.isFinite(gravity.g)
          ? 'NEDETERMINAT — TREBUIE ≥3 LUNGIIMI'
          : Math.abs(gravity.relErr) < 1
            ? `MĂSURAT ${fmt(gravity.g, 4)} m/s² (±${gravity.ug < 5e-5 ? '<0.0001' : fmt(gravity.ug, 4)})`
            : biased
              ? `DEVIAȚIE ${pct(gravity.relErr, 2)} — BIAS DE AMPLITUDINE AL REGRESIEI T² BRUTE ` +
                `(θ₀ ≤ ${fmt(thetaMax, 2)} rad · BORDA PREZICE ≈ ${fmt(ampBias, 1)}% DEFICIT MAXIM)`
              : `DEVIAȚIE ${pct(gravity.relErr, 2)} — VERIFICĂ CALIBRAREA`,
    };
    void fit;
    return [massVerdict, lenVerdict, ampVerdict, gravVerdict];
  }

  // ----------------------------------------------------------- schematic --
  /**
   * Vector technical schematic of the apparatus (SVG, print-crisp).
   * @param {DataRow[]} rows
   */
  function schematic(rows) {
    const Lmean = rows.length
      ? rows.reduce((s, r) => s + r.L, 0) / rows.length
      : 1;
    const pivotX = 150;
    const pivotY = 44;
    const lenPx = 210;
    const theta = 0.42;
    const bobX = pivotX + Math.sin(theta) * lenPx;
    const bobY = pivotY + Math.cos(theta) * lenPx;
    return `
<svg class="rp-schematic" viewBox="0 0 460 330" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Schema tehnică a aparatului de pendul">
  <rect x="0" y="0" width="460" height="330" fill="#ffffff"/>
  <!-- grid -->
  <g stroke="#000" stroke-opacity="0.10" stroke-width="1">
    ${Array.from({ length: 46 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="330"/>`).join('')}
    ${Array.from({ length: 33 }, (_, i) => `<line x1="0" y1="${i * 10}" x2="460" y2="${i * 10}"/>`).join('')}
  </g>
  <!-- ceiling -->
  <line x1="60" y1="${pivotY}" x2="300" y2="${pivotY}" stroke="#000" stroke-width="4"/>
  <g stroke="#000" stroke-width="1.4">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${66 + i * 20}" y1="${pivotY}" x2="${56 + i * 20}" y2="${pivotY - 12}"/>`).join('')}
  </g>
  <!-- rod -->
  <line x1="${pivotX}" y1="${pivotY}" x2="${bobX}" y2="${bobY}" stroke="#000" stroke-width="3"/>
  <!-- bob -->
  <circle cx="${bobX}" cy="${bobY}" r="16" fill="#000"/>
  <!-- pivot cross -->
  <g stroke="#000" stroke-width="2">
    <line x1="${pivotX - 12}" y1="${pivotY}" x2="${pivotX + 12}" y2="${pivotY}"/>
    <line x1="${pivotX}" y1="${pivotY - 12}" x2="${pivotX}" y2="${pivotY + 12}"/>
  </g>
  <rect x="${pivotX - 5}" y="${pivotY - 5}" width="10" height="10" fill="none" stroke="#000" stroke-width="1.4"/>
  <!-- vertical reference -->
  <line x1="${pivotX}" y1="${pivotY}" x2="${pivotX}" y2="${pivotY + lenPx + 34}" stroke="#000"
        stroke-width="1" stroke-dasharray="6 5"/>
  <!-- angle arc -->
  <path d="M ${pivotX} ${pivotY + 58} A 58 58 0 0 0 ${pivotX + Math.sin(theta) * 58} ${pivotY + Math.cos(theta) * 58}"
        fill="none" stroke="#000" stroke-width="1.6"/>
  <text x="${pivotX + 40}" y="${pivotY + 78}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">θ₀</text>
  <!-- length dimension -->
  <g stroke="#000" stroke-width="1.2">
    <line x1="${pivotX - 58}" y1="${pivotY}" x2="${pivotX - 58}" y2="${pivotY + lenPx}"/>
    <line x1="${pivotX - 64}" y1="${pivotY}" x2="${pivotX - 52}" y2="${pivotY}"/>
    <line x1="${pivotX - 64}" y1="${pivotY + lenPx}" x2="${pivotX - 52}" y2="${pivotY + lenPx}"/>
  </g>
  <rect x="${pivotX - 96}" y="${pivotY + lenPx / 2 - 9}" width="76" height="17" fill="#fff" stroke="#000"/>
  <text x="${pivotX - 58}" y="${pivotY + lenPx / 2 + 4}" text-anchor="middle"
        font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">L = ${Lmean.toFixed(3)} m</text>
  <!-- gravity vector -->
  <g stroke="#000" stroke-width="1.6" stroke-dasharray="7 4">
    <line x1="${bobX}" y1="${bobY + 18}" x2="${bobX}" y2="${bobY + 76}"/>
  </g>
  <polygon points="${bobX},${bobY + 86} ${bobX - 6},${bobY + 72} ${bobX + 6},${bobY + 72}" fill="#000"/>
  <text x="${bobX + 10}" y="${bobY + 66}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">m·g</text>
  <!-- tension vector -->
  <g stroke="#ff3b30" stroke-width="1.8" stroke-dasharray="7 4">
    <line x1="${bobX}" y1="${bobY - 18}" x2="${pivotX + (bobX - pivotX) * 0.45}" y2="${pivotY + (bobY - pivotY) * 0.45 + 6}"/>
  </g>
  <text x="${bobX - 4}" y="${bobY - 26}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" fill="#ff3b30">|T|</text>
  <!-- labels -->
  <text x="18" y="316" font-family="JetBrains Mono, monospace" font-size="10" letter-spacing="1.5">FIG. 01 — SCHEMA APARATULUI · O SINGURĂ LIBERTATE · REV.A</text>
  <text x="${pivotX + 16}" y="${pivotY - 8}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">O (0,0)</text>
  <text x="${bobX + 24}" y="${bobY + 5}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700">m</text>
</svg>`;
  }

  // ------------------------------------------------------------ generator --
  function generate() {
    const rows = usableRows();
    const all = state.rows;
    const { fit, gravity } = computeFit();
    const now = new Date();
    const stamp = utcStamp(now);

    const srcCount = {
      virtual: all.filter((r) => r.source === 'virtual').length,
      camera: all.filter((r) => r.source === 'camera').length,
      import: all.filter((r) => r.source === 'import').length,
    };

    const Ls = rows.map((r) => r.L);
    const ms = rows.map((r) => r.m);
    const ths = rows.map((r) => r.theta0);
    const range = (/** @type {number[]} */ a) =>
      a.length ? `${fmt(Math.min(...a), 3)} … ${fmt(Math.max(...a), 3)}` : '——';

    const diags = diagnostics();
    const title =
      srcCount.camera > 0 && srcCount.virtual > 0
        ? 'PENDUL GRAVITAȚIONAL — STUDIU HIBRID CAM/VIRTUAL'
        : srcCount.camera > 0
          ? 'PENDUL GRAVITAȚIONAL — MĂSURARE FIZICĂ'
          : 'PENDUL GRAVITAȚIONAL — EXPERIMENT NUMERIC';

    const noise =
      rows.reduce((s, r) => s + r.uT, 0) / Math.max(1, rows.length) || 0.001;

    // ---- conclusions -------------------------------------------------------
    const massV = diags[0];
    const lenV = diags[1];
    const ampV = diags[2];
    const conclusions = [
      `Masă: pe ${massV.levels.length || 0} niveluri de masă, împrăștierea perioadei este ` +
        `${fmt(massV.spread * 1000, 3)} ms față de un prag de zgomot de ${fmt(noise * 1000, 3)} ms ` +
        `→ ${massV.isolated ? 'factorul este IZOLAT (fără influență asupra T)' : 'factorul ESTE ACTIV'}.`,
      `Lungime: împrăștiere ${fmt(lenV.spread, 4)} s pe ${lenV.levels.length || 0} niveluri ` +
        `→ ${lenV.isolated ? 'izolat (neobișnuit pentru un pendul — verifică foaia)' : 'ACTIV — confirmă T ∝ √L'}.`,
      `Amplitudine: împrăștiere ${fmt(ampV.spread, 4)} s ` +
        `→ ${ampV.isolated ? 'izocronismul se menține pe acest interval' : 'ACTIV — neizocron; seria Borda guvernează deviația'}.`,
      Number.isFinite(gravity.g)
        ? `Gravitație: g = ${fmt(gravity.g, 4)} ± ${fmt(gravity.ug, 4)} m/s² → deviația față de CODATA = ${pct(gravity.relErr, 3)}.` +
          (diags[3].pill === 'BIASAT'
            ? ` Deficitul urmează corecția de amplitudine Borda a regresiei T² brute (θ₀ până la ` +
              `${fmt(Math.max(...rows.map((r) => r.theta0)), 2)} rad), nu o eroare de instrument: ` +
              `refă regresia doar pe rândurile de mică amplitudine pentru acuratețe de nivel CODATA.`
            : '')
        : 'Gravitație: nedeterminată — regresia necesită măsurători la ≥ 3 lungimi distincte.',
    ];

    const eqBlock = (cap, html) =>
      `<div class="rp-eq"><span class="cap">${cap}</span>${html}</div>`;

    // ---- assemble ----------------------------------------------------------
    const page1 = `
<div class="report-page" data-page="01 / 03">
  <div class="rp-masthead">
    <div class="rp-kicker">
      <span>PENDULUM//LAB — DOSAR EXPERIMENTAL</span>
      <span>${stamp} UTC</span>
    </div>
    <h1>${title}</h1>
    <div class="rp-kicker" style="margin-top:10px">
      <span>SESIUNEA ${esc(state.id)}</span>
      <span>DOC PL-RPT-${stamp.slice(0, 10).replace(/-/g, '')}</span>
      <span>N = ${rows.length} RÂNDURI</span>
    </div>
  </div>

  <div class="rp-sec">
    <div class="rp-sec__h">01 · Parametri de intrare <span>unități SI</span></div>
    <div class="rp-meta">
      <div><div class="k">Lungimea L</div><div class="v">${range(Ls)} m</div></div>
      <div><div class="k">Masa m</div><div class="v">${range(ms)} kg</div></div>
      <div><div class="k">Amplitudinea θ₀</div><div class="v">${range(ths)} rad</div></div>
      <div><div class="k">Gravitație (ref)</div><div class="v">${G_STD.toFixed(5)} m/s²</div></div>
      <div><div class="k">Rânduri cameră</div><div class="v">${srcCount.camera}</div></div>
      <div><div class="k">Rânduri virtuale</div><div class="v">${srcCount.virtual}</div></div>
      <div><div class="k">Rânduri importate</div><div class="v">${srcCount.import}</div></div>
      <div><div class="k">u(T) medie</div><div class="v">${fmt(noise, 5)} s</div></div>
    </div>
  </div>

  <div class="rp-sec">
    <div class="rp-sec__h">02 · Ecuații de mișcare <span>compunere echivalentă LaTeX</span></div>
    ${eqBlock(
      'ECUAȚIA MIȘCĂRII — PENDUL SIMPLU (exactă, neliniară)',
      `θ̈ + ${frac('g', 'L')} · sin θ = 0 &nbsp;&nbsp;⟺&nbsp;&nbsp; θ̈ + ωₙ² · sin θ = 0,  ωₙ = √(${frac('g', 'L')})`,
    )}
    ${eqBlock(
      'SOLUȚIA PENTRU MICI UNCHIURI (limita izocronă, |θ| ≪ 1)',
      `sin θ ≈ θ &nbsp;→&nbsp; θ(t) = θ₀ · cos(ωₙ t + φ) &nbsp;→&nbsp; T₀ = 2π √(${frac('L', 'g')})`,
    )}
    ${eqBlock(
      'SERIA DE PUTERI BORDA — corecția de amplitudine',
      `T = T₀ · ( 1 + ${frac('θ₀²', '16')} + ${frac('11·θ₀⁴', '3072')} + ${frac('173·θ₀⁶', '737280')} + ⋯ )`,
    )}
    ${eqBlock(
      'CONSERVAREA ENERGIEI',
      `E = ½·m·L²·ω² + m·g·L·(1 − cos θ) = const &nbsp;&nbsp;|&nbsp;&nbsp; E(θ₀, 0) = m·g·L·(1 − cos θ₀)`,
    )}
    ${eqBlock(
      'MODELUL DE REGRESIE — lanțul de măsurare',
      `T² = ${frac('4π²', 'g')} · L + q &nbsp;&nbsp;→&nbsp;&nbsp; g = ${frac('4π²', 'm̂')} ,  m̂ = slope(T² vs L)`,
    )}
    <div class="rp-note">
      Masa <b>m</b> nu apare în niciuna dintre ecuațiile de mișcare de mai sus: ecuația
      mișcării este independentă de masa bilei, ceea ce este rădăcina algebrică a rezultatului
      de izolare documentat în secțiunea 05.
    </div>
  </div>
</div>`;

    const page2 = `
<div class="report-page" data-page="02 / 03">
  <div class="rp-sec">
    <div class="rp-sec__h">03 · Analiza de regresie <span>T² = f(L)</span></div>
    <div class="rp-chart">
      <canvas id="report-chart" width="720" height="430"></canvas>
      <div class="rp-fig">
        <span>FIG. 02 — DISPERSIE + CEL MAI MIC PĂTRAT</span>
        <span>+ MĂSURAT · ─ REGRESIE · [ BARĂ DE EROARE</span>
      </div>
    </div>
  </div>

  <div class="rp-cols">
    <div class="rp-sec">
      <div class="rp-sec__h">Coeficienți <span>cel mai mic pătrat</span></div>
      <table class="data-sheet">
        <thead><tr><th class="ta-l">Mărime</th><th>Valoare</th><th>σ</th></tr></thead>
        <tbody>
          <tr><td class="ta-l">panta m̂</td><td>${fit ? fmt(fit.slope, 5) : '——'}</td><td>${fit ? fmt(fit.slopeSe, 6) : '——'}</td></tr>
          <tr><td class="ta-l">interceptarea q</td><td>${fit ? fmt(fit.intercept, 5) : '——'}</td><td>${fit ? fmt(fit.interceptSe, 6) : '——'}</td></tr>
          <tr><td class="ta-l">R²</td><td>${fit ? fit.r2.toFixed(6) : '——'}</td><td>—</td></tr>
          <tr><td class="ta-l">reziduu σ</td><td>${fit ? fmt(fit.residualSe, 5) : '——'}</td><td>—</td></tr>
          <tr><td class="ta-l">N (incluse)</td><td>${rows.length}</td><td>—</td></tr>
        </tbody>
      </table>
    </div>
    <div class="rp-sec">
      <div class="rp-sec__h">Gravitația derivată <span>matricea erorilor</span></div>
      <table class="data-sheet">
        <thead><tr><th class="ta-l">Mărime</th><th>Valoare</th><th>Err. rel.</th></tr></thead>
        <tbody>
          <tr><td class="ta-l">g experimental</td><td>${fmt(gravity.g, 5)} m/s²</td><td>${pct(gravity.relErr, 4)}</td></tr>
          <tr><td class="ta-l">u(g) propagat</td><td>${fmt(gravity.ug, 5)} m/s²</td><td>—</td></tr>
          <tr><td class="ta-l">g referință (CODATA)</td><td>${G_STD.toFixed(5)} m/s²</td><td>0.000%</td></tr>
          <tr><td class="ta-l">Δ(g)</td><td>${Number.isFinite(gravity.g) ? fmt(gravity.g - G_STD, 5) : '——'} m/s²</td><td>${pct(gravity.relErr, 4)}</td></tr>
        </tbody>
      </table>
      <div class="rp-note">
        g = 4π²·σ²(L)/Cov(L, T²) se obține propagând eroarea standard a pantei:
        u(g) = 4π²·u(m̂)/m̂². O valoare în interiorul a ±1% validează întregul lanț de măsurare
        (rigla, urmărirea camerei, estimatorul, regresia).
      </div>
    </div>
  </div>

  <div class="rp-sec">
    <div class="rp-sec__h">04 · Schema tehnică <span>vectorială</span></div>
    ${schematic(rows)}
    <div class="rp-fig">
      <span>FIG. 01 — APARAT, GEOMETRIE &amp; DIAGRAMĂ DE FORȚE</span>
      <span>TOATE DIMENSIUNILE ÎN METRI</span>
    </div>
  </div>
</div>`;

    const diagRows = diags
      .map((d) => {
        const pillText =
          d.pill ?? (d.assessed === false ? 'N/A' : d.isolated ? 'IZOLAT' : 'ACTIV');
        const pillCls = d.pill
          ? 'yes'
          : d.assessed === false
            ? 'na'
            : d.isolated
              ? 'no'
              : 'yes';
        return `
        <div class="rp-diag__row">
          <div>${d.factor}</div>
          <div>${d.verdict}${d.levels.length > 1 ? ` · spread = ${fmt(d.spread, 5)}` : ''}</div>
          <div><span class="verdict-pill ${pillCls}">${pillText}</span></div>
        </div>`;
      })
      .join('');

    const appendixRows = all
      .slice(0, 60)
      .map(
        (r, i) => `
        <tr>
          <td>${String(i + 1).padStart(2, '0')}</td>
          <td class="ta-l">${({ virtual: 'VIRTUAL', camera: 'CAMERĂ', import: 'IMPORT' })[r.source] ?? r.source.toUpperCase()}</td>
          <td>${fmt(r.L, 3)}</td>
          <td>${fmt(r.m, 3)}</td>
          <td>${fmt(r.theta0, 3)}</td>
          <td><b>${fmt(r.T, 5)}</b></td>
          <td>${fmt(r.uT, 5)}</td>
          <td>${fmt(r.T * r.T, 5)}</td>
        </tr>`,
      )
      .join('');

    const page3 = `
<div class="report-page" data-page="03 / 03">
  <div class="rp-sec">
    <div class="rp-sec__h">05 · Diagnosticul factorilor <span>izolarea variabilelor</span></div>
    <div class="rp-diag">
      <div class="rp-diag__row rp-diag__row--h">
        <div>Factor</div><div>Dovadă</div><div>Verdict</div>
      </div>
      ${diagRows}
    </div>
    <div class="rp-cols" style="margin-top:14px">
      <div class="rp-note">
        <b>CONCLUZIA ALGEBRICĂ.</b> ${conclusions.map((c) => esc(c)).join(' ')}
      </div>
      <div class="rp-note" style="border-left-color:#000">
        <b>PROCEDURĂ.</b> Fiecare rând este o observație independentă a perioadei T, estimată din
        trecerile prin zero ale seriei de unghiuri (același estimator pentru cameră și simulare).
        Incertitudinea u(T) combină împrăștierea ciclurilor succesive cu rezoluția de eșantionare;
        barele de eroare din FIG. 02 sunt u(T²) = 2·T·u(T).
      </div>
    </div>
  </div>

  <div class="rp-sec">
    <div class="rp-sec__h">06 · Anexa măsurătorilor <span>${all.length} rânduri${all.length > 60 ? ' — primele 60 afișate' : ''}</span></div>
    <table class="data-sheet">
      <thead>
        <tr>
          <th>#</th><th class="ta-l">Sursă</th><th>L [m]</th><th>m [kg]</th><th>θ₀ [rad]</th>
          <th>T [s]</th><th>u(T)</th><th>T² [s²]</th>
        </tr>
      </thead>
      <tbody>${appendixRows}</tbody>
    </table>
  </div>

  <div class="rp-sec">
    <div class="rp-note" style="border-left-color:#000">
      <b>REPRODUCTIBILITATE.</b> Sesiunea ${esc(state.id)} · generat ${stamp} UTC ·
      instrument PENDULUM//LAB (compilare statică, integrator RK4, pas fix, estimator de perioadă:
      treceri prin zero interpolate cu vârfuri parabolice sub-cadru ca rezervă și gard de
      valori extreme pe mediana). Încercările virtuale sunt marcate VIRTUAL,
      măsurătorile fizice cu camera CAMERĂ, intrările manuale/CSV IMPORT.
    </div>
  </div>
</div>`;

    doc.innerHTML = page1 + page2 + page3;

    // draw the report chart once the canvas is in layout
    requestAnimationFrame(() => {
      const c = /** @type {HTMLCanvasElement|null} */ ($('#report-chart', doc));
      if (!c) return;
      c.style.width = '100%';
      c.style.height = 'auto';
      drawPlot(c, {
        xs: rows.map((r) => r.L),
        ys: rows.map((r) => r.T * r.T),
        us: rows.map((r) => uT2(r.T, r.uT)),
        fit: fit ? { slope: fit.slope, intercept: fit.intercept, r2: fit.r2 } : null,
        xLabel: 'L [m]',
        yLabel: 'T² [s²]',
        title: `T² = f(L) · N=${rows.length} · R²=${fit ? fit.r2.toFixed(5) : '——'} · g=${fmt(gravity.g, 4)} m/s²`,
        equation: true,
      });
    });

    $('#rep-status').textContent =
      `GENERAT ${stamp} UTC · ${rows.length} RÂNDURI · g=${fmt(gravity.g, 4)} m/s²`;
    $('#st-msg').textContent = `RAPORT GENERAT — ${rows.length} RÂNDURI ÎNCORPORATE`;
  }

  $('#rep-generate').addEventListener('click', generate);
  $('#rep-generate-2').addEventListener('click', generate);
  $('#rep-print').addEventListener('click', () => {
    if (!doc.querySelector('#report-chart')) generate();
    setTimeout(() => window.print(), 260);
  });

  // keep the document honest if data changes after generation
  on('rows', () => {
    if (doc.querySelector('#report-chart')) {
      $('#rep-status').textContent = 'DATE MODIFICATE — REGENERAȚI';
    }
  });

  return { onShow() {} };
}
