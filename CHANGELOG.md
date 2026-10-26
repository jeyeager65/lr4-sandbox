# Changelog

The version is the sandbox page's (`VERSION` in `web/js/page/job.js`, shown in its footer). The footer also shows
the date the model data was built and the Printables file set it was solved for.

## 0.48.0 - 2026-10-25
- **Help videos, played live in the page** (Help ▾ in the top bar, and the welcome card's "Watch the tour"): the
  machine homes and cuts on its own FluidNC while titles and captions explain it - no recordings. Each one plays on a
  temporary machine ("Help: <title>") set up the way the video needs; your machine, its settings and its SD card stay
  as they are, and ✕ Exit brings you back. Pause with ⏸ / Space / a click on the view, drag to look round (Follow gives
  the camera back). Sound comes on for the video. Jobs play at up to 5×.
- A G-code file on the SD card with `(Video ...)` lines can be played the same way (⋯ > ▶ Play as a video).

## 0.44.0 - 2026-10-25
- **Printed parts look printed** (Configure > Look > Printed look): layer lines along each part's own print direction
  (from how its STL sits on the bed), showing as you zoom in close and fading out further away; the bed face is
  Textured PEI or Smooth (the Peter Plates' outside face); the layer height is yours (0.08 - 0.6 mm; 0.12 / 0.2 / 0.28 for a 0.4 nozzle, 0.3 / 0.4 for a
  0.6). On by default, off in Lite.
- **Filaments** replace the Main / Accent colors: filaments (named by color + material, "Black PLA") of PLA, PETG, PET-CF, PET-GF, PC-CF or PC-GF in any color
  (common filament colors suggested), each with its own look (PETG glossy, fiber blends matte with specks). Presets:
  **V1E classic** (black + red PLA, the top Peter Plate black and the bottom red, the router mounts in PETG), **Single color**, **Fiber upgrade** (the Core, both YZ
  plates, the two end braces and the router mounts on a PET-CF spool). The presets are starting points: change a filament
  or a part and it shows "Edited from ...", with Reset and **Save as a preset** (your presets, kept in this browser: save changes over them, rename, delete).
  Put any part in any filament with **Printed in** on the selection chip or in Inspect. The bristles are always TPU. Kept in this browser
  and in the share link (older links' main= / accent= still work).
- **The EMT looks round again:** the galvanized tubes are softer and reflect a soft top-to-bottom studio instead of the box-room one,
  whose walls showed up as flat bands with hard steps (the tubes read as rounded squares).
- **Printed in** shows each filament's color swatch and name, not a hex code.
- A link to the **LowRider parts in the V1E store** (Get the files > Bill of materials, the footer, the README).
- The Design steps' **Next** buttons are gone (open any step from its header).
- **Fixed:** a warped spoilboard (Real-world) showed as cut everywhere but an oval at its high spot; cuts are now measured from the board as laid.
- **As built is in the share link** (ab=1 = Real-world, abx = its errors that differ from the defaults).
- **As built: Ideal | Real-world** in place of the checkbox; the Errors only show (and count) on Real-world. New:
  which end motor0 (Y0 / Z0) is on - Left (Min end, V1E's usual: "as you face the machine, the left side is Y0 and Z0") or
  Right; the switches, pulloffs and readouts follow it. "Magnify rack / tilt in the view" (was Exaggerate the drawing).
- **As built cleaned up:** fields with units in two columns that fit the panel, Homing fixes / Homing doesn't fix groups, explanations behind "?", Exaggerate the drawing as its own choice.
- **Strut plates' material:** MDF, hardboard, plywood or acrylic, a color each, front and bottom set apart (visual only).

## 0.43.3 - 2026-10-25
- **Homing no longer fails on a busy PC** (FluidNC wasm-sim 8755cc99): the simulated switches missed a re-press after homing's pull-off when the PC was busy or the machine fast (ALARM 9 / 8, or the two motors a step apart); now 0 of 15 at 10x with the CPU busy, was 3 of 15 (`node tests/stress_homing.js`).
- **Resume waits for the touch plate:** at the probe's holds, Resume (the popup, the Hold button or the pendant) waits until the plate, clip and shoe bottom have finished moving (the popup says so); in Preview the plate now goes home at the Remove Probe pause too, not after it. The animation keeps to about real time on a slow GPU.
- The pendant's screen is dark until FluidTouch starts (it showed a drawn stand-in of FluidTouch's status and position).
- **The strut plates choice is visual only** (Permanent / Temporary in Configure > Size): it changes the model, not how
  anything runs. The strut plate job is an ordinary file on the SD card that the page keeps up to date for the size
  and the G-code settings; loading it no longer switches to the temporary struts, and the Install the plates / Back
  to the strut plate job buttons are gone.
- **The strut plate file is named by its strut length** (then the braces and the cutting area), e.g.
  `LR4_strut_plates_830mm_5br_26x50in.gcode`. A new size replaces the page's file for the last size (unless you
  changed it on the card), so the card keeps one; the old `LR4_strut_plates.gcode` goes too.
- **The Job column, files first:** no Job / Job & files headings and no explanation paragraph. A loaded job is a card
  at the top (name, progress while it runs, Start / Preview / Unload); with none loaded, one line says so (and offers
  the strut plate job). Then SD card | Flash, the folder line as a plain path (`/`, `/jobs/`) and the files. Each file
  has ▶ and 👁; Download and Delete moved under ⋯ (folders too: ⋯ > Delete), so names have the room. The selected
  Configure button is red like Run.

## 0.43.2 - 2026-10-25
- The **Design** mode is now **Configure** (Configure | Run): you set the machine up, you don't design it.

## 0.43.1 - 2026-10-25
- **File lists (SD card / Flash):** the SD card | Flash switch sits right above the list. A folder line over the list
  always says where you are ("📂 SD card /", "SD card / jobs /"; click a name to go back up). The list shows one
  folder at a time - folders first, with their file counts; click one to go into it - so a long card stays
  manageable. Add and New folder go into the
  folder you're in; files dropped on a folder go into it. File rows are two lines: the whole name (wrapping after
  `_` / `.` / `-`), then the size and the buttons.

## 0.43.0 - 2026-10-25
- **New page layout, part 5 (phones):** Run on a phone is the view on top, then Hold / Stop, the Work | Machine
  readout, **Home / Zero / Jog / Files** and the loaded job. **Jog** and **Files** (the SD card and On the table) open
  as sheets from the bottom (✕ or Esc closes them); the console is a line at the bottom that opens as a sheet. The
  part files card is a bottom sheet too. No Flash, Pendant & WebUI or pendant option on a phone. Not yet checked on
  a real phone.

## 0.42.0 - 2026-10-25
- **New page layout, part 4 (part files):** the files box in the side panel became a **welcome card over the view**
  on a first visit: why the page needs the files, **1 Download** (a button per Printables source, "n of m ✓"),
  **2 Drop them anywhere on this page** (or Choose files / Choose a folder), What's loaded, Skip for now. It closes
  itself once everything is loaded. Run and G-code work without the files.
- **The whole window takes part files** any time, in Design or Run (the SD card, Flash and web UI lists still take
  their own drops).
- A **Parts chip** in the top bar: "Parts 40/40 ✓", or amber "Parts 12/40 · add files"; it opens the card.
- **Missing parts are grey boxes** (from their bounding boxes, no V1E geometry), "file missing" when selected; the
  hardware that joins them is hidden with them.
- **Downloads folder** (Chrome / Edge): pick it once and the page reads the Printables zips there; later visits
  re-check it with one click.

## 0.41.0 - 2026-10-25
- **New page layout, part 3 (Design):** the My LR4 / Show / Build tabs became six numbered steps that open in any
  order, one at a time: **1 Size** (cutting area, braces, strut plates), **2 Options**, **3 Table**, **4 As built**,
  **5 Look** (print colors, scene), **6 Get the files** (BOM, cut list, strut plates + G-code settings,
  config.yaml). A closed step shows a one-line summary; **Next** opens the next one; the open step is remembered.
  Size warnings put a red dot on step 1 while it's closed. **Get the files** in the top bar opens step 6.
- **Layers** on the view (or L) holds the parts tree (presets, show / hide, ⤢ Inspect), in both Design and Run.
- The selected-part chip has an **Inspect** button.

## 0.40.0 - 2026-10-24
- **New page layout, part 2 (Run):** the Machine column has FluidNC's **state pill** (its menu: Unlock $X, Soft reset,
  Power cycle), **Hold / Resume** (one button) and **Stop**, greyed out until a job runs, a **Work | Machine** readout
  (click a value, type a position, Enter = `G90 G0` / `G53 G0`, Esc cancels), **Home** All / X / Y / Z and **Zero**
  All / X / Y / Z (`G10 L20 P1`), FluidNC's **Feed** (-10 / +10 / reset) and **Rapid** (25 / 50 / 100%) overrides,
  and the jog pad with step chips. The old Tool position block and the hidden sliders are gone.
- The Job column switches **SD card | Flash**. Each file has **👁 Preview** and **▶ Start**; Start opens a short check
  by the button (homed, work zero, fits on the stock, the bit in the router, the travel) with one Start button. The
  loaded job's box shows its progress (a bar, % and time left) while it runs.
- **Preview** swaps the Job column for a player: scrub bar, play / pause, back to the start, speed, the file's
  current lines, Exit preview; a banner on the view says the machine isn't moving.
- **Alarms:** the pill turns red and a card over the view says what happened and what to do (Unlock / Home all);
  it goes away once FluidNC is out of the alarm.
- The FluidTouch pendant screen and the web UIs (WebUI, FigUI) moved to **Pendant & WebUI ▾** in the top bar. The
  console gets a Status reports switch and $G / $# / $SD/List buttons (Hold / Resume / Reset are in the Machine column).
- VR: letting go of the core's red handle jogs FluidNC there.

## 0.39.0 - 2026-10-24
- **New page layout, part 1 (the shell):** a top bar with the size, a **Design | Run** switch, **Get the files** and ⚙
  (theme Auto / Light / Dark, sounds, SpaceMouse, keyboard shortcuts, Reset settings). Design = today's My LR4 / Show /
  Build panel. Run = a sender layout: the Machine column (controller, tool position, jog, Home) | the view | the Job
  column (SD card, On the table, Flash, web UIs), and the FluidNC console under the view - folded to one line (state,
  last message, input) by default, open (drag its top edge) or big. The columns fold to strips (by themselves below
  1200 px); with the left one folded the work position floats on the view. "?" buttons open the longer explanations.
  The mode, theme, folds and console size are kept per browser.
- The workshop scene has no trees outside any more, and zoomed far out the ground reaches the horizon (the grass and
  the sky follow the camera, and the far limit grows as you zoom out - the building used to get cut off). The open
  garage door hides, like the roof, when the camera is above it or outside the garage wall, so it no longer covers the table.
- **Stock and the strut plate job:** turning on the temporary struts no longer loads the strut plate job (and its MDF
  stock); **Load the strut plate job** (Run > Job) or its SD card file does. On the table > Stock now names a loaded
  job's own stock ("..., from the job"), and **Take it off** removes that too (the job stays loaded). A new **Unload**
  button by Run / Stop / Preview clears the loaded file: its stock, moves and bits come off the table.
- **Jogs carve where they go on slow computers:** hand moves (jogs, the console, the pendant) carve from the motors
  sampled every 4 ms, not once a frame - with slow frames a plunge then a slot came out as one diagonal, or not at all.
  An M6 whose hold beats the page's frame now still asks for the bit (it showed "Paused (M0)").
- **View only:** ⛶ at the top right of the 3D view (or V) hides everything else; the same button or Esc brings it back.
- **The page's source is split up (no change in what it does):** `web/index.html` is the markup only; its styles are
  `web/css/page.css` and its script is `web/js/page/*.js` (12 files by area, loaded in order, sharing one scope).
- **Touch plate + clip:** the kit's Mueller BU-45 alligator clip (a detailed model, `freecad/models/alligator_clip/`)
  holds the touch plate magnet on its bolt head; the plate has its real outline (tab, necks, hole) and the 0.110"
  connector, stored a little tilted so it clears the mounts. A **Touch plate + clip** row in Show opens it in Inspect.
- **Inspect turns freely** (any axis, not just round Z); the view buttons and Back stand it up again. Close-ups no
  longer clip small parts.
- **Belt ends** loop round their M3s as on the real machine (teeth meshed after the wrap); the X belt's Min end
  screw sits in the Z stub's slot.
- The Kobalt dust shoe's screw (through its slot into the bottom mount, nylock in the hex slot); a hex collet nut.
- Loading and switching Show > Detail show a running count while the part meshes are made.
- `docs/V1E_DOC_GAPS.md`: what the model needed that the V1E docs don't say.
- **Probing is animated:** the shoe's bottom snaps off and slides out, the clip comes off its bolt onto a flat of
  the collet nut (riding down with the router), then the touch plate glides from its slot onto the stock; afterwards
  the reverse. The touch plate is brushed stainless; the spoilboard has a bottom; the X belt's tensioner screw sits
  in its pocket.
- The vacuum hose is 68 mm OD (measured); the Min side's wheel bearings sit centred in their windows.
- **GitHub Pages caching:** each publish stamps the page's files and what it loads with `?v=<commit>`
  (`tools/stamp_build.py`), so a visitor never mixes a new page with old cached scripts or data. The local server
  sends `Cache-Control: no-cache`.

## 0.37.0 - 2026-10-23
- **As built (My LR4 tab, off by default):** the machine as a real one is - a little out of square until it homes. Each Y and each Z
  motor has its own switch, and the Max side's switches sit a little further on than the Min side's; powered down,
  the motors let go, so at each power-up (page load, **Power cycle**) the gantry is racked and the beam off level.
  `$H` runs each side to its own switch and pulls it off by its own `pulloff_mm`, in Basic and in FluidNC (the
  firmware homes on per-motor switches): with per-motor pulloffs that make up the difference it comes out square,
  with V1E's file (equal pulloffs) it's left out by the stops' offset. The stops default to what your config's
  pulloffs make up for.
- Basic mode: the pendant's axis homing (`$HX`, `$HY`, `$HZ`) homes only that axis, keeping the axes homed before
  (it homed every axis).
- Not fixed by homing: a **warped spoilboard** (a New spoilboard is laid warped; probing reads different heights and
  a surfacing pass skims the high spots first) and a **router out of tram** (lines between surfacing passes).
- Every cut follows the machine: a racked gantry cuts out-of-square rectangles, a tilted beam cuts deeper at one end
  and tilts the bit (and shifts it a little in X: the bit sits in front of the gantry's line and below the beam).
  **Squareness test** (to the SD card): a rectangle with corner crosses; **Measure the diagonals** reads them off the
  carved spoilboard / stock (to ~0.1 mm; the test cuts 2.5 mm deep, 5 in Lite, so the sim's grid sees the groove).
- Stock on a warped spoilboard: **Follows it** (default: bent onto the board, cut and drawn that way, jobs' own stock
  too) or **Stays flat** (on its high spot) - Stock > On a warped spoilboard.
- FluidNC mode: homing at a speed above 1x no longer fails now and then with ALARM 9 (Homing Fail Approach). The
  simulated stepping could run out of prepared moves during a stall and stop, which homing took for "no switch
  found"; it now waits for them (FluidNC fork `wasm-sim` f946bec4), and the sim's config uses FluidNC's most step
  segments (20).
- Changing the warp lays a new spoilboard with it at once if the board has no cuts; with cuts it asks first (No keeps
  the board, the warp waits for the next New spoilboard). The board keeps the warp it was laid with.
- **Draw ×**: the rack / tilt drawn up to 100x bigger (a mm is invisible at 1x); cuts stay true.
- Video scripts: `(Video AsBuilt: RACK= TILT= STOPY= STOPZ= PULLOFFY=4/3.2 EXAG= TRAM= ...)` (PULLOFFY / Z = a tuned
  config's per-motor pulloffs), `(Video: HOMING=z,x,y)` (Home sends FluidNC's `$HZ`, `$HX`, `$HY` in that order), `(Video Home: VIEW=machine)` (the whole machine while homing) and the `gantry` / `gantrytop` / `ymin` / `ymax` shots (close on
  each end's Y carriage). Example: `docs/examples/why_home.gcode`.

## 0.36.0 - 2026-10-23
- **The table has a separate spoilboard:** 3/4" MDF covering the bit's full travel + 1/4" a side (a 3/4" bit surfaces all of it), between two 3/4" MDF **rail
  strips** (the Y belt holders, the Min wheels and the Y rail clips sit on those), so the spoilboard can be surfaced or
  replaced on its own. The spoilboard's cuts (On the table) are on it.
- **Table base (Build > Table > Base):** the **MDF sheet** as before, or a **torsion box** - a plywood egg-crate of
  half-lapped ribs (5/8" ply, 3-1/2" tall, about 12" apart; no skins). The cut list follows (spoilboard, rail strips,
  sheet or ribs with their slot counts). Also in the share link (`base=torsion`) and video scripts (`BASE=torsion`).
- The torsion box is as long as the spoilboard; the rail strips run past its ends on the box's two outer ribs, which
  run the full length under them (side boards), and the box sits right on the legs (no apron). The pendant mounts on
  the front end of the wider rail strip (on the box's face the dust shoe would hit it).
- Wood grain on the legs, apron and plywood parts (the MDF stays plain).
- The spoilboard casts its shadow again (since 0.35.0 the carving surface drawn over it let the light through).
- Loading says what it's doing (placing the parts, bill of materials, workshop and lights, compiling shaders).
- No vacuum hose = no dust shoe: turning the hose off also takes the shoe, skirt and bristles off (model and BOM).
- The table height is now the spoilboard's top.

## 0.35.0 - 2026-10-23
- **On the table (Run tab):** the machine set up by hand, as at the real one. **Stock** (size, where on the table,
  thickness; "Size it to the job"), the **bit in the router** (shape, diameter, V angle, stick-out; drawn in place of
  the model's bit) and a **Touch plate under the bit** button (on the stock if the bit is over it, else the
  spoilboard; wired to FluidNC's probe at that height). A job that names its stock / bits brings them; one that
  doesn't uses these (the per-file "Stock and bits" form is gone).
- **Every move carves:** jogs (pendant, FluidNC jog pad), console G-code and jobs carve the stock. The position
  sliders only move the bit (no carving).
- **The spoilboard carves too** (a height field over the table top) wherever a cut goes below the stock, and keeps
  its cuts in this browser per machine size. **New spoilboard** starts fresh; "Show the stock" off shows what the jobs
  did to it. **Surfacing job to the SD card:** a zigzag over the cutting area (bit, step-over, depth below the
  spoilboard's level) that lowers it - marks shallower than the pass go, deeper ones stay.
- **M6 holds for the bit** in Basic and FluidNC, at every tool change: the popup shows the file's ToolDef, or asks
  which bit it is (kept for that file); Resume puts it in the router.

## 0.34.0 - 2026-10-23
- **Web UIs (Run > Controller, FluidNC mode):** any `.html` / `.html.gz` on FluidNC's SD card or Flash is listed
  (named WebUI 3, WebUI 2, FigUI or by its title) and **Open** shows it in a window of its own, served by the page's
  FluidNC web server as a board serves it - the Flash's `index.html.gz` at `/`, `/sd/ui/<name>/` at `/ui/<name>/`,
  others at `/sd/<file>` / `/flash/<file>` (the `.gz` left off). The UI's commands, WebSocket and uploads reach
  FluidNC; files it writes show on the page's SD card / Flash. Add a UI with "Add to the Flash…" / "Add to the SD
  card…" or drop it on the list: a release's `index.html.gz` goes onto the card in a folder of its own
  (`/ui/figui/`, `/ui/webui3/`, `/ui/webui2/`), so several fit. In Basic, Open switches to FluidNC; the window waits
  (and retries) while the sandbox tab isn't running FluidNC.
- A web UI file on the SD card isn't a G-code job: no ▶, not loaded as the job when added or dropped.
- **Folders on the SD card and the Flash:** both lists are a folder tree (▾ / ▸ folds); click a folder to add files
  and new folders into it, ✕ on a folder deletes it and what's in it. Empty folders are kept (also ones FluidNC or a
  web UI makes) and are back after a reload. The Flash list can add and delete files too (not config.yaml).

## 0.33.0 - 2026-10-22
- **Show > Scene > Lighting: Realistic / Simple.** Realistic: in the workshop its own lights - the four 4 ft LED strips
  as soft area lights, soft shadows from overhead (Full detail), daylight through the garage door; on Plain a studio
  sun with shadows; filmic tone mapping and the room's soft light on every surface. Simple: the earlier even light
  (lightest on the GPU). Default: Realistic, Simple on Lite.
- Printed parts are smooth-shaded (sharp edges kept) instead of faceted.
- The two ceiling strips over the machine run along the shop side by side, in line with the bench lights' inner ends
  (they were one behind the other down the middle).
- **Background: Empty shop** - the workshop with only the garage door, the lights and the fire extinguisher (no
  benches, pegboard, computer, shelf or shop vac). `(Video: SCENERY=empty)` in videos.

## 0.32.0 - 2026-10-22
- Honeycomb Peter Plates keep the closed plates' counterbores (the button heads were buried in a flat slab): the
  screw holes are layered through the thickness as the closed STL has them, and cells keep 1.2 mm from each counterbore.
- A G-code job's bit shows only where the model's bit would (Show, inspect): no lone bit in "Frame only".

## 0.31.0 - 2026-10-22
- The "My machine" tab is now "My LR4".
- The view toolbar loses Home (Run > Home ($H) is still there); Sound moves into ⚙ with its volume and voice.
- Units: building numbers follow Inches / mm (the braces menu and the strut plate drawing too - inches with the mm
  beside them, as the DXF is mm); running numbers are always mm with 3 decimals, as FluidNC reports (Run's tool
  position was inches for X / Y and mm for Z). Fractions round to the nearest 1/8 (7.99 in was "7 2/2").
- Run: Run G-code above Tool position, the SD card open, a one-line controller note (the rest under "More about the
  two"), Flash only in FluidNC mode.
- Choice rows (strut plates, Peter Plates, Detail, Background, Runs on) are joined button groups under their label.
- The room size moves to Show > Scene, under Background (it's only drawn with the workshop); My LR4's section is "Table".
- **Copy a link to this build** (footer): size, braces, plate choices, options, pendant, table, room, colours, units in
  the URL (`#26x50&braces=6&hose=0&main=225588&units=mm`); opening it sets them.
- **📏 Measure** on the whole machine (toolbar, M), as in inspect. **📷** saves the view as a PNG (P).
- Keyboard: 1-5 views, F fit, M measure, P picture, Space play / pause (Basic), H panel, ? the list ("? keys" in the hint).
- **Reset settings** (footer): every setting back to the default; part files and the SD card stay.
- Phones: the five views fold into one View menu so the toolbar is one row; the hint says pinch / two fingers.

## 0.30.0 - 2026-10-22
- `(Video Inspect: ID=core TIME=1.5 ORBIT=8 EXPLODE=0.6 SECTION=x@0.5 FLIP=on)`: the inspect view in a video - the
  camera blends to its framing, explode and section animate over TIME, ORBIT turns round it, `ID=off` goes back.
  Each line runs with the job held.
- The inspect view hides the M0 pause popup, the message bar and the video's speed badge (back with Back).
- Section cuts are capped: each cut part shows a solid face (a lighter shade of its colour) instead of a hollow shell.
- Inspect View: **Solid / X-ray / Lines**. X-ray: printed and cut parts see-through, the hardware solid. Lines: every
  part drawn as its edges, front and back. In videos: `(Video Inspect: VIEW=xray)` (or lines / solid).
- The core is labelled "Core" (was "Core001", FreeCAD's suffix for a label already taken).

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
