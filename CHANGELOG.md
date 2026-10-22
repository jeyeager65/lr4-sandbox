# Changelog

The version is the sandbox page's (`VERSION` in `web/index.html`, shown in its footer). The footer also shows
the date the model data was built and the Printables file set it was solved for.

## 0.29.0 - 2026-10-22
- Video scripts set the machine: `(Video: TABLE=34in ROOM=16x20x9ft BRACES=6 STRUTS=temp PETER=none ROUTER=off
  SKIRT=off HOSE=off FAN=off MAIN=#rrggbb ACCENT=#rrggbb)` (with MACHINE=26x50 as before), and `(Video Show:
  PRESET=frame HIDE=core.hardware,Y_Clip_* SHOW=XZ_Plate_Min)` picks what's drawn by the Show tree's ids, in the intro
  or mid-job. Scripts (and the console) can use `LR4Machine.apply({...})` and `LR4Show.apply({...})`.
- `MSGTIME=` is now `MESSAGETIME=`: FluidNC (and the page) show any comment containing "MSG" as a message, so the
  old name put the whole settings line on screen. The old name still works, with a warning.
- Fixed: the file's own bit was left at the job's start while the router homed and jogged to work zero.

## 0.28.0 - 2026-10-22
- Inspect tools: **Explode** (a slider; parts move apart along the bolts that join them, bolts out past their heads),
  **Section** (an X / Y / Z cut through the set, slider to move it, ⇅ to keep the other side) and **Measure** (two
  clicks; snaps to corners and to hole centres, gives the distance in mm and inches plus ΔX / ΔY / ΔZ).

## 0.27.0 - 2026-10-22
- **Inspect view**: ⤢ on any Show row (an assembly, a kind or one part), or double-click a part (its assembly; inside
  the view, the part) - that set alone in place of the machine: its parts, every bolt joining them and the bearings /
  idlers / rail blocks those bolts hold, where they sit on the machine now, framed, no workshop. A parts list with the
  fastener counts (screws and nuts by size). Show's checkboxes and the pick chip work in it; Back or Esc returns.

## 0.26.0 - 2026-10-22
- Tabs are **My machine / Show / Build / Run**. My machine: the size, what's on the machine (router + dust shoe,
  dust skirt + bristles, vacuum hose + cables, Jackpot3 lid fan, FluidTouch pendant, strut plates, Peter Plates; off =
  gone from the model and the BOM), table height + workshop size, print colours.
- **Show** (view only): a tree of every part, assembly > printed / cut / hardware / electronics > part, with presets
  (All, No hardware, Printed parts only, Frame only). A bolt joining two assemblies is listed under both and shown with
  either; belts go with what they ride on; the router is its own assembly. Detail and Background moved here from ⚙.
  Not kept between loads.

## 0.18.0 - 2026-10-21
- The panel tabs are **Config / Build / Run** (were Machine / Build it / Run).
- G-code files live on a virtual SD card kept in your browser (Run tab > SD card): add or drop files, ▶ to play or
  run one, download, delete.
  Playback and FluidNC use the same files; the strut plate G-code is kept there as /LR4_strut_plates.gcode.
- FluidNC mode runs the picked file from its SD card ($SD/Run): Run / Hold / Resume / Stop, M0 pauses in the popup
  with their message, the touch plate laid on the stock for the probe and taken off after it. The stock is carved from
  the machine's real motion (the file's own moves while the machine is on them, its actual path where it isn't).
  The page sets G54 at the cutting area's front-left corner on the stock top before a run, as Playback assumes.
- $SD/Delete (and other $SD / $LocalFS commands) in the console update the files kept in the browser.
- FluidNC's Flash (LocalFS) is kept in the browser too: config.yaml there is the one in use (V1E's, or yours, which now
  stays after a reload). FluidNC boots a translated copy (sim_config.yaml); a config.yaml changed on its Flash becomes
  the one in use.
- A file with no stock or bit definition: say them in Stock and bits (kept per file), at the start or at a pause;
  Playback stops at a change to a bit the file doesn't define, FluidNC is held there.
- The FluidTouch pendant: the CrowPanel 7" in its printed case on its stand, screwed with a 5/8" plywood spacer to the
  table's front near the Min corner, the case's bottom level with the apron's. Its own part group (also in the VR
  menu); the screen shows a placeholder status (state + MPos) until FluidTouch itself runs in the page.

## 0.17.0 - 2026-10-21
- Renamed: the page is **LowRider 4 Sandbox** (was "LowRider 4 Configurator"); `python tools/serve.py sandbox`
  (`configurator` still works).
- Z's bottom stop: the Z coupler now sits where V1E's YZ plate guide puts it (it was 5 mm high, which stopped Z
  early). The bit sticks out 20 mm (a default). Z travel -32.31 .. 71.01 mm; the bit reaches 2.5 mm below the table
  top, so the strut job's cut into the spoil board is in reach. Playback holds Z at its bottom stop and says how far
  short a job is.
- The workshop is the maintainer's shop: 16 x 20 ft, 8' 4" ceiling, gable roof with architectural shingles, grey-green
  siding, benches at the machine's home end (tools on one pegboard, a computer on the other bench), a high window
  between them, the front wall's windows and entry door, an open 8 x 7 ft sectional door on its ceiling tracks, OSB
  inside. From far away it's the closed building. Blank building size = this shop.

## 0.16.0 - 2026-10-21
- FluidNC mode homes ($H) and probes (G38.2, a touch plate under the bit) on simulated switches that trip on each
  motor's own step count; speed 1x / 2x / 5x / 10x. The model follows the motors; a jog pad replaces the sliders;
  MPos is greyed until homed.
- The Playback readout's "Tip" is now "Z", 0 at Z's homed spot.

## 0.15.0 - 2026-10-21
- Run tab: "Runs on Playback | FluidNC". FluidNC mode boots FluidNC with a copy of the config.yaml in use (plain
  stepper drivers, pins renumbered; rates, travel and homing as in yours). A new size or config.yaml restarts it.

## 0.14.0 - 2026-10-21
- FluidNC itself runs in the page (its wasm port, from a fork's `wasm-sim` branch; GPL-3.0, `web/fluidnc/`), with a
  console in the Run tab. The page is cross-origin isolated (COOP / COEP; on GitHub Pages via coi-serviceworker).

## 0.13.0 - 2026-10-20
- Home ($H): a Home button (Run tab, the canvas toolbar and the VR menu) homes the machine as FluidNC does with V1E's
  JP3_LR config.yaml: Z up to its switch, then X and Y together (each Y motor stops on its own switch, squaring the
  gantry); seek, pull off, feed back, pull off. Each switch lights up as it trips. Settings come from the config.yaml
  in use (yours, if you brought one). Played faster than life; "Real speed" plays it at the config's rates.
- A machine position readout (MPos X / Y / Z) once homed: mpos_mm at the pulled-off spot. Run G-code then starts from
  the homed spot instead of jumping to work zero.
- The tool position sliders span the machine's real travel (home switch to the far stop), not the cutting area.
- config.yaml: X / Y max_travel_mm = the travel less pulloff_mm (FluidNC counts it from the pulled-off spot), with a
  note when that's short of the cutting area.

## 0.12.0 - 2026-10-20
- The panel is reorganized into tabs: Machine (cutting area, parts, colours), Build it (BOM, cut list, strut plates,
  config.yaml) and Run (tool position, G-code). The page remembers the last tab. Once all the part files load, they
  fold to one line ("Manage" opens them).
- View controls are on the canvas: a toolbar (☰, Iso / Front / Top / Side / Back / Fit all / VR) and ⚙ for Detail,
  Background, table height, building size and SpaceMouse (a bottom sheet on phones). ☰ hides the panel so the model
  fills the window, and the page remembers that too. The selected part shows as a chip on the canvas.
- Long notes fold away ("About these files", "About this config"); the fit and credits notes moved to an "About this
  model" dialog. Run G-code has a "Use the temporary struts" button.
- Tool position X / Y follow the inches / mm toggle (they were always inches).
- The "Viewing in VR" card has ✕: it shrinks to a pill ("Viewing in VR ▾ · Exit VR") so the desktop mirror stays
  clear, and the page remembers this.
- tests/test_page_vr.js: the VR menu still reads and drives the panel's controls while their tab is hidden, and the
  canvas overlays hide in VR (headless Chrome; not part of `npm test`).

## 0.11.0 - 2026-10-20
- cnc-gcode-tools copies updated to 0.6.2 (G20/G21 carry the position and feed over; 45° flute helix); the page's
  own workarounds for both are gone.
- Page data: the geometry is `lr4_config_geometry.bin.gz` (plain gzip, fetched as bytes) instead of base64 text -
  a quarter smaller (share data 2.86 MB) and no decode step.
- One data set: the page always loads web/data/ (the share data, no V1E geometry) - locally exactly what is published;
  `python tools/serve.py configurator` serves the repo and loads your parts/ (?parts=/parts/). `?share` and
  `serve.py --share` are gone. fit_config.py's output with the V1E meshes moved to build/config/ (share_data.py's
  input and the tests' reference only).
- No more claude.ai artifact workarounds: index.html and viewer.html are complete pages (no wrapping by serve.py, the
  Pages workflow or export_web); DXF downloads as .dxf (was zipped), no "Copy DXF text"; downloads are plain browser downloads; the viewer
  loads only its per-part .bin files (export_web no longer writes lr4_geometry.txt / lr4.json / LowRider4.html).
- tools/record_demo.js: records a demo video (QHD by default) - a turn round the workshop and the LR4, then a G-code
  file running (M0s resumed after 2 s, probe close-ups), the gantry parked at the end to show the result. Drives the
  page through `window.LR4Demo`, one frame at a time, so the video plays at true speed.
- Run G-code: with Temporary struts, the strut plate G-code above plays on the machine - the file's own text,
  parsed by cnc-gcode-tools (#<variables>, arcs, messages). The bit follows it at V1E's JP3_LR speeds (or your
  config.yaml's) with acceleration; each M0 pauses with its message ("Attach Probe", ...) until you press Resume;
  G38.2 stops on the stock, with the Tiny Touch Plate taken off the core and laid on it under the bit (every probe: one per tool change) and the
  dust shoe's bottom (skirt + bristles) taken off meanwhile; the bit is drawn from the file's ToolDef as cnc-gcode-tools
  draws and shades it (tool colours, 45 deg helix) and turns clockwise with the collet nut while the job runs; the
  M0 popup opens mid-view and can be dragged; "Close-up while probing" (on by default, as cnc-gcode-tools) eases the
  view to the touch plate when a probe starts and back to your view once the plate is put away; the 1/4" MDF at the cutting area's front-left corner is
  carved as it goes, shaded as cnc-gcode-tools shades its stock (cuts in their own colour, darker with depth, lit
  from beside the camera, cut-through left open). The moves are drawn as cnc-gcode-tools draws them (cuts in their tool's colour, the same as its bit; rapids grey;
  probes red; the move in progress up to the bit), faint ahead, solid once done.
  Work position and tool position read in mm while it runs. Play / pause, 1-300x (10x first; moves hidden until "Show the moves"), a time slider to scrub; touching
  the position sliders pauses it. "Play a G-code file..." runs your own file the same way (G20 inches and G20 / G21
  switches play in mm; carving needs its (Stock:) / (ToolDef:) header). At the end, "Install the plates" switches to
  Permanent. tests/test_gcode_play.js checks the pauses, probe, units and that the whole file frees both plates.
- Parts: "Dust skirt + bristles" is its own toggle (the shoe's bottom, the part you take off; the top stays with the
  router), so the bit can be seen with the hose on; hiding the vacuum hose hides them too.

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
