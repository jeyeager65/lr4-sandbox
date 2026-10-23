# LowRider4

V1 Engineering LowRider 4 CNC for a 26 x 50 in usable cutting area: every printed part, the
strut plates, hardware, Jackpot3 box and Kobalt tool mount assembled on a table: a spoilboard
between two rail strips (3/4" MDF) on an MDF sheet or a plywood torsion box (`TABLE`, Part 33). Also makes the strut plate G-code for the user's current
LowRider (FluidNC).

## Settings

| | |
|---|---|
| Type | CNC machine build (general / assembly) |
| Units | mm inside (V1E parts are metric); cutting area and table in inches |
| Modeling style | A: script -> solids (+ downloaded STL meshes placed by script) |
| Owner | script |
| Source of truth | `build.py` (+ `lr4.py` geometry, `cam.py` CAM) |
| Outputs | screenshots, BOM (`build/bom.md` + `bom.json`), STEP (`private/export_step.py`), strut plate G-code (`cam.py`), web viewer (`export_web.py`) |
| Printer / material | Bambu P1S + AMS, PLA (V1E: PLA, 3 walls, no supports, default orientation) |
| Git | no |
| Created | 2026-10-17 |

Owner rules: **script** = edit the script/params and rebuild; never hand-edit the built
FCStd. **model** = the FCStd is the source; edit it in the GUI or through the MCP; any
script is history only.

## Files

- `private/RESUME.md` - where the last session left off; read it with this file.
- `private/LOG.md` - the full dated log (grep it; don't read it whole).
- The FreeCAD scripts below are in `freecad/` (run from the repo: `python tools/run.py freecad/build.py`); output goes to
  the repo's `build/` and `exports/`.
- `build.py` - parameters + assembly; writes `build/LowRider4.FCStd`, `build/bom.md`,
  `exports/strut_plates_<strut>mm.dxf/.svg` (the same files as the web page's download), and the viewer
  side files `build/fasteners.json`, `threads.json`, `belts.json`, `hose.json`, `bom.json`, `peter_alt/`.
- `lr4.py` - every measured placement constant (with how it was found).
- `calculator.py` - the size calculator (our code, matches V1E's; twin of `web/js/calculator.js`).
- `strut_plate.py` - Vector76's strut plate generator ported to Python (twin of `web/js/strut_plate.js`;
  golden-tested against his SCAD, no OpenSCAD needed to build).
- `hardware.py` - every fastener, placed and checked with fclib `fasteners` (docs photo per joint).
- `check.py` - interference checks between mating parts (155 pairs, run by headless builds; ~11 s with
  `overlap_fast` + the pair cache `build/check_cache.json`).
- `hosecheck.py` - vac hose bends, length and clearance over X x Z travel (~60 s).
- `bom.py` - BOM writer. `cam.py` - strut plate CAM -> `exports/cam/*.gcode`.
- `private/export_step.py` - whole assembly to `exports/LowRider4.step` (meshes decimated as far as FreeCAD's
  decimator goes; 859 MB, 208 parts, 2026-10-19 - smaller needs pyfqmr, ask before installing).
- `CONFIGURATOR.md` - plan for a separate LR4 web configurator (later).
- `export_web.py` - browser viewer data (`exports/web/`: geo/*.bin + lr4_local.json); viewer page `web/viewer.html`
  (copied to `exports/web/LowRider4_local.html`; `python tools/serve.py viewer`). Rerun after a build.
- `vendor/` (git-ignored, local only) - `lr4_strut_plate_3d.scad` (Vector76's generator, as served by his page)
  and `v1e_lr4_calculator.js` (V1E's calculator): only the tests read them (golden cases).
- `parts/` - downloaded files: `lr4/` (Printables 1034840, V1E LowRider 4, 29.5 mm EMT
  variants), `kobalt/` (1034828, Kobalt tool mount + dust shoe), `jackpot3/` (1434650,
  Jackpot3 box; `Jackpot3_Lid.step` gives the lid's screw and fan holes), `peter/` (1044487, Peter
  Plates). CC BY-NC-SA 4.0 (V1 Engineering) - personal use.

## Requirements

- Usable cutting area 26 x 50 in (660.4 x 1270 mm), X (beam) the short axis.
- Sizes from the V1E LR4 calculator; strut plates from the Vector76 strut plate generator.
- All printed parts + strut plates + hardware (Jackpot3, endstops, steppers, rails, belts...)
  in one FreeCAD assembly, on the table above (no legs in the model; the web page draws basic ones).
- CAM for the strut plates -> FluidNC G-code (user's LowRider v3 + Jackpot, Kobalt router).

## Calculator results (26 x 50 in, XZ plate 6.5 mm)

| Item | mm | in (calculator inch mode) |
|---|---|---|
| Strut length (2 plates) | 830 | 32.75 |
| X rails (2) | 827 | 32.625 |
| Y rail (1) | 1525 | 60.125 |
| Belt X (1) / Y (2) / total | 1010 / 1725 / 4460 | 39.875 / 68 / 175.625 |
| Table footprint (min) | 953 x 1583 | 37.625 x 62.375 |

Generator: strut_length 830, braces 5 (default) at 203 mm pitch, dogbones 3.5, front + bottom
plates, front_wing_size 11.5 (1" EMT). Plates 830 x 90.5 (front) and 830 x 78.5 (bottom).

## Measurements

| What | Value | Source (measured / datasheet / GUESS) |
|---|---|---|
| Rail tubes | 1" EMT, 29.5 mm OD | V1E docs (US); wall 1.45 GUESS |
| XZ plates | 6.5 mm aluminium | GUESS - V1E shop plates (calculator default); 6.35 if cut from the DXFs |
| Strut plate stock | 1/4" MDF, 6.35 mm | GUESS - MEASURE YOURS (sets cam.py depth) |
| Table | 40 x 65 in (footprint + 1" margin each way, rounded up) | GUESS |
| Spoilboard + rail strips | 3/4" MDF; spoilboard = the bit's full travel + 1/4" a side (26-9/16 x 50-9/16 in: a 1/4" bit stays on it, a 3/4" bit surfaces all of it); Min strip to the footprint + 2.5", Max strip from the footprint - 4" (`lr4.TABLE`) | thickness MEASURE YOURS; strip widths GUESS |
| Table base | "sheet": 3/4" MDF; "torsion": 5/8" plywood ribs (0.6" GUESS - plywood is thin), 3-1/2" tall, <= 12" grid, half-lapped | GUESS - MEASURE YOURS / choose |
| Router | Kobalt 1.25 HP trim router (Makita RT0701C clone): `hw.trim_router`, grip 65.8 (owners' figure), ER11 nut | motor length, grip/head heights, head 82 x 64, bit stick-out, colours GUESS - MEASURE (override in `lr4.ROUTER`) |
| 1/8" bit | 1-flute upcut, 12 mm flutes, 38 mm long | GUESS - MEASURE |
| Power supply | 150 x 60 x 32 mm brick | GUESS |
| Bottom temp strut orientation | both ends the same way round, bed face down, small d 3.5 hole at the back edge | GUESS from beam5 (`lr4.TEMP_STRUT_FRAMES`); front ones from the notches (B4/B5) |
| Z stepper shaft | 24 mm from the face (`Z_SHAFT`) | GUESS - V1E says 20 mm+; only where the leadscrew's end sits in the coupler |
| Z coupler | bottom 6.5 mm above the motor face (`Z_COUPLER_ABOVE`): V1E yzz1, on the plate's guide, just clear of the 6 mm wall | from a photo (~ +-1); its top is the nut's stop, near Z's bottom stop |
| Bit stick-out | 20 mm below the collet nut (`lr4.ROUTER["bit_out"]`) | a default (user 2026-10-21): varies with the bit - a deeper cut, a longer bit further out |
| Vacuum hose | Fulton 2-1/2" x 20 ft clear PVC, steel wire (user's) - 73 mm OD | OD GUESS - MEASURE (`lr4.HOSE['od']`) |
| Endstop lever | Omron SS-3GL13PT 19.8 x 10.0 body, hinge 2.7 in, curl 1.0 past the body, crest 6.5 free / 4.5 at the click (`hw.SS_GL13`) | MEASURED 2026-10-20; lever width + curl shape still from the photo |
| Y stop screws | backed out 5 mm (`lr4.Y_STOP_OUT`) - sets Y home, clicks ~3 mm before the wheels hit the front holders | CHOICE - set on the machine |
| Bearings | 608 (8 x 22 x 7) | datasheet; real size/tolerance may explain the 0.26 mm beam level difference |
| Router colours | blue grip, charcoal head, black cap/switch/cord, grey dial | GUESS (screen only) |

## Decisions

| # | Decision | Alternatives considered |
|---|---|---|
| 1 | Script-built assembly; printed parts are the official STLs placed by measured mating features | remodel parts as solids (huge effort, less faithful); GUI assembly by hand |
| 2 | Python port of the generator (`strut_plate.py`, 2026-10-20), golden-tested against the SCAD run by OpenSCAD (58 cases) | run the SCAD with OpenSCAD in every build (until 2026-10-20: needs OpenSCAD and the SCAD, which isn't ours to ship) |
| 3 | Calculator's mm mode (strut 830); the inch mode would round up to 32.75" = 831.85 mm | inch mode |
| 4 | 1" EMT (29.5) parts: Brace_29p5, Y_Clip_29p5, wings 11.5 | 30/32 mm tubes |
| 5 | Kobalt tool mount (user's router) | Makita/DeWalt mounts |
| 6 | Jackpot3 (user is buying one, 2026-10-17) in the Jackpot3 box on the bottom strut plate, first bay on the YZ_Min side (V1E recommendation) | other bays; reusing the LR3's Jackpot |
| 7 | Table 40 x 65 in (Part 33: spoilboard + rail strips on a base - decision 17) | full 4 x 8 sheet (too big), exact footprint (no margin) |
| 8 | Strut plate CAM: one 1/8" 1-flute upcut (dogbones are sized for it), holes first, tabs on outlines, plates along Y | 1/4" bit (no dogbones fit); EstlCAM as in the V1E docs |
| 9 | Vac hose (user's 2.5") clamped in the Min-end holder, zip-tied lengthwise on the core's top, slack folded like a drag chain (upper run nested between the lower run and the upper X rail, U-turn 5 mm past the core) (user, 2026-10-18) | hose sliding loose through the trays; across the core; U-turn far past the core (stuck out past the table) |
| 10 | Y belts: holder slot -> back of idler 1 -> pulley front + inboard side -> front of idler 2 -> holder (the only path with the smooth back on both idlers; V1E yzb1/yzb2) | belt between the idlers in a straight line |
| 11 | Fasteners from the V1E docs photos (head side / nut side per joint), Phillips button heads (user), M8 hex bolts | generic "head on the first part" rule (put the Min wheel M8s backwards) |
| 12 | Endstops = Omron SS-3GL13PT; orientation picked by what trips them (`lr4.SWITCH_HOME`) | eyeballed generic switches (~5 mm off their holes) |
| 13 | Jackpot3 lid fan: 5015 on the OUTSIDE, exhausting (dusty shop - don't blow in), outlet toward the Min end (user, 2026-10-19) | inside the lid (board and wiring in the way); blowing in |
| 14 | Peter Plates on both YZ plates (Max mirrored), stepper cut-outs filled (user); "solid" in the model, "honeycomb" kept as the viewer alternative | designer's covers with stepper openings |
| 15 | Temp struts as a build option (`STRUTS = "temp"`): V1E's 4 Temp_Strut_v1 (front + bottom at each end) in the plates' own 2D frames (`lr4.TEMP_STRUT_FRAMES`); the end braces move to 180 mm from the next, the rest evenly between (V1E beam3), needs 4+ braces; PSU on the Max-end bottom temp strut, Jackpot3 box on the Min-end one. The configurator shows it as the Strut plates Temporary / Permanent toggle (2026-10-20) | keep the MDF brace pitch (temp strut screws would miss the inner braces) |

| 17 | Table (Part 33, user 2026-10-23): a separate 3/4" MDF spoilboard (cutting area + margin) between two 3/4" MDF rail strips (rail mounts level with the spoilboard's bottom, so the work surface and the bit's reach don't change), on `TABLE = "sheet"` (MDF) or `"torsion"` (plywood egg-crate, no skins). The work surface stays at z 0..T: the base is below z 0, so the machine + size builds didn't move | the sheet as the spoilboard; rails on the base with a thicker spoilboard |

## How the parts were placed (V1E publishes no assembly CAD)

Measured on mesh cross-sections (circle fits, RANSAC arcs), then each mating was checked with a
section-overlap scan (touching, not intersecting) and against the V1E build photos:

- Brace rail clamps 113.5 mm apart -> the Core's two rail clearance arcs are 113.47 apart with
  the same 13.6 mm offset -> rails, braces, core agree.
- The braces' 3 M5 holes = the XZ plate DXFs' 3 M5 holes (mirrored) -> brace on XZ plate.
- XZ plate MGN12H hole patterns (20 x 20, 92 apart, 10 mm stagger) = the YZ plate rail holes;
  the YZ plate's three 11 mm access holes = the brace-screw triangle rotated 180 deg -> the YZ
  plates are printed upside down (print +y = down). Matches the build photos.
- Wheels: screw holes matched to the plate (0.02 mm), then pulled up flush on their flat screw seats
  (vertical screws, so height = seat contact). Max side height + X from all four 45-deg bearings touching
  the Y rail; Min side from the lowest bearing on the table.
- XZ_Max carriage holes are 36 mm higher: the Max side rides the Y rail. The Y_Clip puts the
  tube axis 20.8 mm above the table (clip bore 29.6, concentric with the tube within 0.04). With every
  bearing touching on its measured M8 line, the Max side is 0.26 mm short of the 36 the XZ offset implies
  (was 1.04 before the 2026-10-18 bearing lines; parked - likely tube OD / bearing tolerance).
- Front strut plate seat = the braces' 67 mm front face; the X belt tension screw (Brace_Max hole
  = XZ_Max 11 mm hole) lands in the middle of the generator's 35 x 19.1 end notch -> SCAD x = 0
  is the YZ_Min end and y = 0 the lower edge. Bottom plate = the 68 x 6.5 recess under each brace.
- Kobalt mount ear holes (61 x 87.9) = the Core's four M5 holes; depth from the overlap scan.
- Hose holders: their 3.5 x 13 mm tab drops into the 4 x 14 mm slot in each brace's back bar
  (found by sectioning the brace); tab down in the slot, base on the back bar top
  (V1E photos w7/w8b: on the back of the braces, cradles behind the beam).
- Approximate (eyeballed, not solved): PSU, router body/bit, the Jackpot3 lid's seat on the box
  (no tight nest found - its screw and fan holes are exact, from the lid STEP), the X belt's end-loop M3s. (Endstops now sit on their own M2.5 holes, bearings on their measured
  M8 lines, the X belt round its drive, the X_Belt tensioner in its notch - see the log.)
- Fasteners (2026-10-19): every one placed from its part's holes and checked along its axis
  (fclib.fasteners); head side / nut side per the V1E docs photos (hardware.py names them).
- Y belts: the YZ plate's bottom pocket (open to the outer face) sets the idler/pulley height; the
  holders' lock slots (2.25 wide) set the ends; the path wraps idler 2's back, the pulley's front +
  inboard side and idler 1's front (V1E photos yzb1/yzb2: belt on the face, dips round the pulley).
- Check (`check.py`, 155 pairs): parts touch with 0 mm^2 shared section except the known
  fits: EMT in brace clamps a few mm^2 (29.34 bore vs 29.5 tube = press fit), router grip / tool mount
  rings ~54 each (the clamp), hose / shoe socket (the cuff threads in), bristles / skirt groove (TPU press fit).

## Print / build notes

- V1E: PLA, 3 walls, no supports, default orientation; 200 x 200 x 190 mm build volume (P1S ok).
  Infill per part in `build/bom.md`. Print Z_Stub + Z_Nut first to check the M5 nut fit.
- Temp_Strut_v1 x 4 (not in the model) holds the beam until the machine cuts its own plates.
- Strut plates: cut with the CURRENT LowRider (v3) - `exports/cam/StrutPlates_T1_eighth.gcode`.
- Peter Plates: PLA like the rest; print orientation not checked yet (use the designer's). Designer: let the
  steppers breathe (vents, high-temp material, or no top / bottom layers) - the honeycomb style is open anyway.
- TPU_Bristles_22mm (x2): TPU, printed flat; bent into the dust skirt's groove.
- Not in the V1E kit (buy extra): 22 x M3 x 10 (Peter Plates), 2 x M3 x 20 (lid fan), 14 wood screws.

## Log

In `private/LOG.md` (append `- YYYY-MM-DD - ...` entries there; grep it, don't read it whole).

## How the style worked

(Fill in as you go: what was easy or painful about this modeling style for this kind
of project. These notes decide the workspace defaults over time.)

- Downloaded STLs + script placement: placing ~40 meshes needed real detective work (hole
  patterns, overlap scans); once each frame is a constant in `lr4.py`, resizing the machine is
  just the cut-area parameters.
