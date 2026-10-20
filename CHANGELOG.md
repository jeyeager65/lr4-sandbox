# Changelog

The version is the configurator page's (`VERSION` in `web/index.html`, shown in its footer). The footer also shows
the date the model data was built and the Printables file set it was solved for.

## 0.11.0 - 2026-10-20
- Run G-code: with Temporary struts, the strut plate G-code above plays on the machine - the file's own text,
  parsed by cnc-gcode-tools (#<variables>, arcs, messages). The bit follows it at V1E's JP3_LR speeds (or your
  config.yaml's) with acceleration; each M0 pauses with its message ("Attach Probe", ...) until you press Resume;
  G38.2 stops on the stock, with the Tiny Touch Plate taken off the core and laid on it under the bit; the 1/4" MDF at the cutting area's front-left corner is
  carved as it goes. The moves are drawn (faint ahead, solid once done; rapids orange, cuts blue, probes green).
  Work position and tool position read in mm while it runs. Play / pause, 1-300x, a time slider to scrub; touching
  the position sliders pauses it. "Play a G-code file..." runs your own file the same way (G20 inches and G20 / G21
  switches play in mm; carving needs its (Stock:) / (ToolDef:) header). At the end, "Install the plates" switches to
  Permanent. tests/test_gcode_play.js checks the pauses, probe, units and that the whole file frees both plates.
- The dust shoe, skirt and bristles now show / hide with the vacuum hose (group "Vacuum hose + dust shoe").

## 0.10.0 - 2026-10-20
- Strut plate G-code: "Download G-code" under the strut plates makes the FluidNC job for this size in the browser
  (both plates on one 1/4" MDF sheet along Y, bolt holes first, then each outline with tabs, 0.25 mm into the spoil
  board; touch plate probing, router dial messages, stock-simulator comments). "G-code settings" sets stock
  thickness, depth per pass, feed, plunge, tabs, tab height, router + dial and the touch plate; defaults are the
  FreeCAD script's (`freecad/cam.py`), and tests/test_strut_cam.js checks the two agree.

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
