/* ============================================================================
   PENDULUM//LAB — application entry point.
   Classic scripts in one shared scope (loaded in dependency order by
   index.html) — zero dependencies, zero build step, works over file:// too.
   ========================================================================== */


/** @type {Record<string, {onShow?:()=>void, onResize?:()=>void}>} */
const views = {};

function boot() {
  hydrate();

  // --------------------------------------------------------- identity ----
  $('#meta-session').textContent = state.id;
  const clock = () => {
    $('#meta-utc').textContent = utcStamp().slice(11);
  };
  clock();
  setInterval(clock, 1000);

  // ------------------------------------------------------------ modules --
  views.sim = initSim();
  views.compare = initCompare();
  views.lab = initLab();
  views.batch = initBatch();
  views.data = initData();
  views.report = initReport();

  // -------------------------------------------------------------- tabs --
  const tabs = $('#tabbar');
  /**
   * @param {string} name
   */
  function show(name) {
    state.view = name;
    for (const el of all('.view')) {
      el.classList.toggle('is-active', el.dataset.view === name);
    }
    for (const b of all('.tab')) {
      b.classList.toggle('is-active', b.dataset.view === name);
    }
    views[name]?.onShow?.();
    // canvases that were hidden during resize need a fresh paint
    requestAnimationFrame(() => views[name]?.onResize?.());
  }

  tabs.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (e.target).closest('.tab');
    if (!btn?.dataset.view) return;
    show(btn.dataset.view);
  });

  window.addEventListener('resize', () => {
    views[state.view]?.onResize?.();
  });

  // ------------------------------------------------------------ status ---
  on('rows', () => {
    $('#st-rows').textContent = String(state.rows.length);
  });
  $('#st-rows').textContent = String(state.rows.length);

  // boot straight into the simulation
  show('sim');

  console.info(
    `%cPENDULUM//LAB%c  session ${state.id} · static build · no dependencies`,
    'background:#000;color:#fff;padding:2px 6px;font-weight:700',
    'color:#ff3b30;font-weight:700',
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
