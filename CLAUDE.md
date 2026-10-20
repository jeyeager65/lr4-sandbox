# LR4 Sandbox - notes for Claude

A V1 Engineering LowRider 4 modelled in FreeCAD from the official STLs, plus a browser configurator fed by fits
across many FreeCAD builds. See README.md for the layout. FreeCAD 1.1, Python 3, Node for tests.

## Start here

- If `private/RESUME.md` exists (maintainer's git-ignored notes), read it first: state, open items, publish steps.
  Then `docs/PLAN.md` (settings, measurements, decisions). `private/LOG.md` is the history: grep it, don't read it.
- Big projects are worked in numbered parts (`private/CONFIGURATOR.md` "Work in parts"): "do part N" means read
  RESUME + that plan's decisions + that part only, finish by ticking it with a notes line, a LOG entry, and RESUME if
  the run or publish steps changed. Don't start the next part in the same session.

## Rules

- **Script-owned model.** Change `freecad/build.py` parameters or `freecad/lr4.py` constants and rebuild; never
  hand-edit `build/LowRider4.FCStd` (the next build overwrites it).
- **Measured, not assumed.** Every part frame in `lr4.py` was solved from hole patterns, sections and overlap scans,
  with a note on each. Don't re-derive them, and don't assume design angles: fit the real features.
- **`freecad/fclib/` is a vendored copy.** Don't edit it here. Change the source (the maintainer's FreeCAD workspace,
  `D:/FreeCAD/lib/fclib`), then `python tools/sync_fclib.py`.
- **No part files in git.** STL / STEP / DXF / OBJ / 3MF / FCStd, and `parts/`, `private/`, `vendor/`, `build/`,
  `exports/`, `web/data/` are git-ignored, and `tools/check_no_parts.py` is the pre-commit hook. The V1E files are
  V1E's; users download their own.
- **Commit or push only when the maintainer asks.** Nothing goes to GitHub until V1E has approved the public version.
- **Keep JS and Python rules in step.** The page mirrors several Python rules (`lr4.hose_route` / `cord_route` /
  `jp3_shift` in `web/js/config_model.js`; `calculator.py` / `calculator.js`; `strut_plate.py` / `strut_plate.js`).
  Change both and run the tests.
- Units: mm inside; the cutting area and table are in inches. Axes: X along the beam, Y along the table (front 0),
  Z up.
- **Versions:** a user-visible page change bumps `VERSION` in `web/index.html` and gets a CHANGELOG.md entry.
  CI (`.github/workflows/ci.yml`) runs only what works without part files: the guard, a Python compile, `npm test`.

## Running

- Build: `python tools/run.py freecad/build.py` (headless, ~1.5 min warm / ~4 min cold) - run it in the background
  with output to a log, then read the report lines (`[time]`, `flag`, `overlap`, `error`), not the whole log.
  `LR4_CHECK=0` skips the overlap check while iterating.
- Heavy work (builds, CAM, section sweeps, size builds) runs headless, never in the FreeCAD GUI: a long GUI call
  freezes it. Headless FCStd files carry no colours; open them in the GUI with `fclib.view.open_build`.
- After a model change that the configurator shows: `python pipeline/size_builds.py` (~55 min) ->
  `python pipeline/fit_config.py` -> `node tests/test_config_model.js` (must print "all N sizes match";
  it fails when there are no size builds to compare).
- Pages: `python tools/serve.py configurator` / `python tools/serve.py viewer`. Edit the viewer in
  `web/viewer.html` (export_web copies it into exports/web).

## Keeping context small

- `lr4.py`, `build.py`, `hardware.py` and the pages are big: grep for the constant or function and read that range.
- Query generated JSON (`build/fasteners.json`, `bom.json`, `web/data/*.json`) with a short script; don't read it.
- Screenshots: only the views that show the change, small.
