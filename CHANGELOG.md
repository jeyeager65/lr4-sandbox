# Changelog

The version is the configurator page's (`VERSION` in `web/index.html`, shown in its footer). The footer also shows
the date the model data was built and the Printables file set it was solved for.

## 0.9.0 - 2026-10-20
- Temporary struts: Parts > "Strut plates: Permanent (MDF) / Temporary (printed)" shows the machine as it first
  runs, on V1E's 4 printed Temp_Strut_v1 (front + bottom at each end, end braces 180 mm from the next) before it
  cuts its own MDF strut plates. Needs 4+ braces. The FreeCAD build has it as `STRUTS = "temp"`. Bring-your-own-files
  mode places your Temp_Strut_v1.stl too.

## 0.8.0 - 2026-10-20
- VR mode (PC VR through SteamVR / OpenXR): an "Enter VR" button appears when the browser offers WebXR. A menu on
  the left controller (inches / mm, size steppers and presets, braces, Peter Plates, part groups, unhide); touch a
  part (or point + trigger) for its card with Hide part / Hide group; grab the red sphere to move the core, drag
  the corner diamond to resize the table; hold a grip to drag the machine, both grips to zoom and rotate; snap
  turn; teleport at 1:1 or a tabletop model on a stand. The desktop window swaps its side panel for a popup card
  while VR is on. Not yet tried on a headset.
- "Show N hidden parts" under the part groups (parts hidden from VR).
- Basic table legs + apron under the MDF (drawn in the page only, for a sense of height): View > Table height sets
  the top of the MDF (default 34 in).
- Workshop background (View > Background: Workshop / Plain): concrete floor, block walls with windows, a half-open
  roll-up door onto a driveway, sky / grass / trees outside, workbench + pegboard, shelf of bins, shop vac, strip lights. Enter your building's size (X, Y, ceiling; blank = auto) to see
  the gap from the machine to each wall, with a warning under 2 ft / 600 mm. In VR at 1:1 you stand in it.

## 0.7.0 - 2026-10-20
- Repo polish: README (the two ways to use it), CHANGELOG, issue template, CI (the no-part-files guard, Python
  compile, calculator tests), a manual GitHub Pages workflow (not enabled yet).
- `tests/test_config_model.js` fails when there are no size builds to compare, instead of passing on nothing.

## 0.6.0 - 2026-10-20
- Peter Plates "Honeycomb", made in the browser from your own closed plate STLs.
- FluidNC `config.yaml` download: V1E's JP3_LR config with the X / Y travel set for your size.
- Lite detail (automatic on phones and software GPUs), with a Full / Lite switch.
- Footer: version, model data date, "Report a problem" (fills in the size and file checksums) and forum links.

## 0.5.0 - 2026-10-20
- Bring your own part files: drop the Printables zips, a folder or the STL / DXF files. Recognised by SHA-256, kept
  in the browser's IndexedDB, nothing uploaded. Missing / different files listed with their Printables links.
- STL and DXF readers in the page (the XZ plates are extruded from V1E's DXFs); Peter Plates Open / Closed / None.
- Model fix: the XZ plates' ~19 x 22 mm cutout was missing (DXF joints 3e-7 mm apart).

## 0.4.0 - 2026-10-20
- `parts/manifest.json`: every part file with its source and SHA-256; `tools/check_parts.py`.
- Share data (`pipeline/share_data.py`): the page data without V1E geometry, each part placed from its file.

## 0.3.0 - 2026-10-20
- Strut plate generator and LR4 calculator in our own code (JS and Python), tested against Vector76's generator
  and V1E's calculator. Builds no longer need OpenSCAD.

## 0.2.0 - 2026-10-20
- First import: the FreeCAD model, the configurator page, the size-build pipeline and the tools.
