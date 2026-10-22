# LR4 Sandbox - notes for Claude

A V1 Engineering LowRider 4 modelled in FreeCAD from the official STLs, plus a browser sandbox page (LowRider 4 Sandbox) fed by fits
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
  `exports/` are git-ignored, and `tools/check_no_parts.py` is the pre-commit hook. The V1E files are V1E's; users
  download their own. `web/data/` is committed: the page's data from `pipeline/share_data.py`, with no V1E geometry.
- **Commit or push only when the maintainer asks.** V1E has approved the public version; pushing and GitHub Pages
  still wait for the maintainer's go.
- **Keep JS and Python rules in step.** The page mirrors several Python rules (`lr4.hose_route` / `cord_route` /
  `jp3_shift` in `web/js/config_model.js`; `calculator.py` / `calculator.js`; `strut_plate.py` / `strut_plate.js`).
  Change both and run the tests.
- Units: mm inside; the cutting area and table are in inches. Axes: X along the beam, Y along the table (front 0),
  Z up.
- **Versions:** a user-visible page change bumps `VERSION` in `web/index.html` and gets a CHANGELOG.md entry; a new
  feature or a moved control also gets its README.md line (and a new screenshot in `docs/img/` if one shows it).
  CI (`.github/workflows/ci.yml`) runs only what works without part files: the guard, a Python compile, `npm test`.

## Running

- Build: `python tools/run.py freecad/build.py` (headless, ~1.5 min warm / ~4 min cold) - run it in the background
  with output to a log, then read the report lines (`[time]`, `flag`, `overlap`, `error`), not the whole log.
  `LR4_CHECK=0` skips the overlap check while iterating.
- Heavy work (builds, CAM, section sweeps, size builds) runs headless, never in the FreeCAD GUI: a long GUI call
  freezes it. Headless FCStd files carry no colours; open them in the GUI with `fclib.view.open_build`.
- After a model change that the sandbox page shows: `python pipeline/size_builds.py` (~55 min) ->
  `python pipeline/fit_config.py` -> `node tests/test_config_model.js` (must print "all N sizes match";
  it fails when there are no size builds to compare).
- Pages: `python tools/serve.py sandbox` / `python tools/serve.py viewer`. Edit the viewer in
  `web/viewer.html` (export_web copies it into exports/web).
- Page tests: `tests/test_page_*.js` drive headless Chrome (several need `parts/`; the FluidNC ones take minutes).
  Screenshots: `node tools/page_shot.js <url> <out.png> [--eval js --shot out2.png]...`.
- Videos: `python tools/serve.py sandbox --no-open`, then `node tools/record_demo.js <file.gcode> [out.mp4]` in the
  background (~6 min for 2 min of 1080p). The `(Video ...)` comment spec is the header of `tools/demo_script.js`;
  README's table follows it, so update both. Example: `docs/examples/feature_demo.gcode`. Send the video to the
  maintainer rather than analysing it; over 30 MB, send a CRF 30 copy.

## Keeping context small

- `lr4.py`, `build.py`, `hardware.py` and the pages are big: grep for the constant or function and read that range.
- Query generated JSON (`build/fasteners.json`, `bom.json`, `web/data/*.json`) with a short script; don't read it.
- Screenshots: only the views that show the change, small.
