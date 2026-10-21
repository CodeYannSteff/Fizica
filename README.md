# PENDULUM//LAB

Brutalist-minimalist physics engine & data studio for gravitational pendulums and
oscillatory motion: dynamics simulation, physical measurement via computer vision,
200-test virtual sweeps, factor isolation, and the classical regression
**T² = (4π²/g)·L** with propagated uncertainties — printable as an A4 lab report.

**Zero dependencies. Zero build step. Pure HTML/CSS/JS.**

## Run it

The site is fully static — there is nothing to install, compile, or transpile.

**Option A — just open the file.**
Double-click `index.html`. It works from `file://` (scripts are classic, loaded in
dependency order — no ES-module CORS restrictions).

**Option B — serve it locally (optional, closest to production).**

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html
```

## Deploy on GitHub Pages

1. Push this directory to a GitHub repository:

   ```bash
   git init
   git add .
   git commit -m "Add PENDULUM//LAB static physics studio"
   git branch -M main
   git remote add origin git@github.com:<you>/<repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)` → **Save**.

3. The site appears at `https://<you>.github.io/<repo>/` in ~30 seconds.
   Any static host works the same way (Netlify, Cloudflare Pages, nginx, a USB stick).

## Layout

```
index.html          static markup for all six modules + ordered <script> tags
styles/app.css      design system (tokens, components, bento grid)
styles/print.css    @media print layer for the A4 report / PDF export
js/core/            physics (RK4, pendulum systems, period estimator),
                    stats (OLS regression, error propagation), sweeps, vision
js/render/          canvas drafting (rig) + plots
js/app/store.js     in-memory sheet, fit, localStorage persistence, CSV I/O
js/views/           01 SIM · 02 ISOLATE · 03 LAB-CAM · 04 BATCH-200 ·
                    05 DATA · 06 REPORT
js/main.js          boot, tab switching, view lifecycle
```

> **Script order matters.** All modules share one global scope and are listed in
> `index.html` in dependency order (core → render → store → views → main).
> There are no name collisions by design — keep it that way when editing.

## Physics notes

- Integrator: fixed-step **RK4**; energy drift ≈ 1e-13 over 10 s.
- Amplitude-corrected period: Borda series
  `T = T₀(1 + θ₀²/16 + 11θ₀⁴/3072 + 173θ₀⁶/737280)`.
- `g = 4π²/slope` with slope standard error propagated to `σ(g)`; reference
  g₀ = 9.80665 m/s² (CODATA).
- The same zero-crossing period estimator is shared by simulation and camera, so
  virtual and physical results are directly comparable.
- A raw T²-vs-L fit over large amplitudes is biased low by the Borda term — the
  report predicts that deficit and tags the verdict **BIASED** instead of
  blaming the instrument.

## Export

**06 REPORT → PRINT / PDF** opens the browser print dialog on a print-styled A4
layout (3 pages: masthead + regression, apparatus schematic + diagnostics,
measurement appendix).
