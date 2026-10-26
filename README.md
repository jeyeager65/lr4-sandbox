# LowRider 4 Sandbox

A full 3D model of the [V1 Engineering LowRider 4](https://docs.v1e.com/lowrider/) CNC that you can size, build and
run in your browser. Enter your cutting area and **LowRider 4 Sandbox** draws the whole machine from the real printed
part files, with the cut list, strut plates, bill of materials and a FluidNC `config.yaml` for that size. Then run
it: play G-code on it and watch the stock get carved, or drive it with the real FluidNC firmware running in the
page (home, jog, probe, console). Behind the page is a FreeCAD model that places every part by its measured mating
features and checks every fastener.

![The LowRider 4 at 26 x 50 in, in the workshop](docs/img/hero.webp)

> [!WARNING]
> Still under development. There's no guarantee that the model, measurements, cut list, BOM, G-code or config.yaml
> are accurate: check them against V1 Engineering's docs before you cut, print or buy anything.

## What's here

| | |
|---|---|
| **LowRider 4 Sandbox** (`web/index.html`) | The page. **Configure:** enter a cutting area and it builds the machine in 3D (every printed part, rail, belt, bolt, the strut plates and the vacuum hose); choose what's on it (router + shoe, hose, lid fan, pendant, Peter Plates, strut plates). **Layers** (on the view): a tree of every part by assembly and kind, with presets, to hide parts from the view, and an inspect view for one assembly at a time. **Get the files:** the cut list (V1E's calculator), the strut plate outlines, DXF / SVG / G-code downloads, the full BOM and a `config.yaml` for your size. **Run:** play G-code on the machine, or drive it with FluidNC in the browser. Plus machine sounds, a workshop round it, VR, share links and scripted demo videos. |
| **FreeCAD model** (`freecad/`) | Scripts that assemble the LowRider 4 in [FreeCAD](https://www.freecad.org/) from the official STLs. Every part is placed by its measured mating features (hole patterns, pockets), and every fastener is checked for seat, engagement and collisions. Outputs: an FCStd assembly, a BOM, strut plate DXF/SVG and G-code. |
| **Pipeline** (`pipeline/`) | Builds the model at many sizes and fits how each part moves with the size. That is how the page can draw any size without FreeCAD. |
| **FluidNC in the browser** (`web/fluidnc/`) | FluidNC's wasm port, built from a fork's `wasm-sim` branch with simulated limit switches, a touch plate probe and a time scale. |

## The part files

The printed parts are **not** in this repo. They are V1 Engineering's files, all on V1E's Printables pages. You
download them yourself (free), and the page or the FreeCAD scripts place your copies:

| Download | Folder in `parts/` (FreeCAD only) |
|---|---|
| [LowRider 4](https://www.printables.com/model/1034840) (V1 Engineering), including the XZ plate DXFs | `lr4/` |
| [Kobalt tool mount + dust shoe](https://www.printables.com/model/1034828) (V1 Engineering) | `kobalt/` |
| [Jackpot3 box](https://www.printables.com/model/1434650) (V1 Engineering) | `jackpot3/` |
| [Peter Plates](https://www.printables.com/model/1044487) (V1 Engineering) | `peter/` |

On each Printables page, use **Download** to get all of the model's files as one zip. Nothing else is needed: the
page and the scripts bring their own hardware models (steppers, bearings, rails, bolts, router, hose).

### Adding them to the page

1. Open the page. Until it has the files, each missing printed part is a plain grey box (its hardware hidden), and
   a **Your part files** card over the view has a Download button per Printables source with "n of m" for each.
2. Drop the four zips anywhere on the page, in Configure or Run. You can also drop a folder or loose STL / DXF files, or
   use **Choose files…** / **Choose a folder…** on the card. In Chrome / Edge, **Look in my Downloads folder…** finds
   the zips there (pick the folder once; later visits re-check it with one click).
3. The card counts them in and closes itself when everything is there; the printed parts replace the boxes. The
   **Parts** chip in the top bar ("Parts 40/40 ✓", or amber "· add files") opens the card again; **Forget files**
   (under What's loaded) clears them. **Skip for now** stops the card opening by itself.

![A first visit: the hardware only, and the missing files listed](docs/img/files.webp)

The files are read in your browser and kept there (IndexedDB) for next time; nothing is uploaded. Each file is
recognised by its SHA-256, so renamed files are fine. A file that differs from the version the placements were
solved for is still used, with a warning in the panel. `parts/manifest.json` lists every file with the SHA-256 it
was tested with.

### Adding them for the FreeCAD scripts

Unzip each download into its folder under `parts/` (the table above), for example `parts/lr4/YZ_Plate_Min_V1.stl`.
`python tools/check_parts.py` lists what's missing or differs. `parts/` is git-ignored, and a pre-commit check
(`tools/check_no_parts.py`) stops part files from being committed.

## Using the page

### Configure and Layers

**Configure** is six steps that open in any order (a closed step shows a one-line summary):
**1 Size** - enter the cutting area (inches or mm) and the page rebuilds the machine: brace count, rails, belts,
table, hose routing; the strut plates (MDF or the printed temporary ones); warnings show here (a red dot while it's
closed). **2 Options** take parts off the machine and the BOM (router + dust shoe, skirt, hose, lid fan, pendant)
and pick the Peter Plates style (Open, Closed, Honeycomb or None). **3 Table** - the base and the table height.
**4 As built** - a real machine's faults (below). **5 Look** - the print colors and the scene. **6 Get the files**
(also in the top bar).

**My LR4 ▾** (top bar) holds **My machines**: several named machines, each with its own size, options, table,
filaments, As built, spoilboard, SD card, Flash (config.yaml) and front plate design. New, Duplicate, Rename,
Delete, and **Export** / **Import** as a `.lr4.json` file. A shared link opens as a temporary machine with a banner
(**Save as one of my machines** keeps it); nothing of yours changes until you do.

**As built** is off (Ideal) by default. **Real-world** gives the machine a real build's faults: the Y and Z switches
not quite in line (homing leaves the gantry racked or the beam off level by that much), motors that let go at power-up
(racked until it homes), a warped or bowed spoilboard and a router out of tram. Run then shows how far out it is, with
Power cycle and a squareness test (a rectangle and its diagonals, sized to your machine, on the SD card). The view can
magnify the rack and tilt (10x to 100x) so you can see which way it's off (the router's tram lean is drawn true size);
the cuts and readouts always use the real values.

**Look** sets the print colors: filament spools named by color, presets as starting points (save your own), and
**Printed in** on any part's chip to print just that part in another filament. Printed parts are drawn with layer
lines at your layer height. The strut plates can be drawn as MDF, hardboard, plywood or acrylic.

**Layers** (on the view, or L) only hides parts from the view, never from the BOM: a tree of assembly > printed / cut / hardware /
electronics > part (a bolt is listed under both assemblies it joins), with presets (All, No hardware, Printed parts
only, Frame only). **Look** > **Scene** sets the detail (Full, or Lite for slower devices), the lighting (Realistic: the
workshop's own lights, soft shadows on Full detail and filmic colour; or Simple: even light, lightest on the GPU) and
the background (the workshop, the same shop empty, or plain).

**Inspect** (⤢ on a Layers row, **Inspect** on a selected part, or double-click a part) shows one assembly or part alone with the bolts and bearings
that hold it, and its parts list with screw and nut counts. Its tools: an exploded view (along the bolt lines), a
section cut (X, Y or Z, either side), X-ray (the printed parts see-through, the hardware solid), Lines (edges only)
and a measuring tool that snaps to corners and hole centres. Esc or **Back to the machine** returns.

![Inspect: the core, exploded, with its parts list](docs/img/inspect.webp)

**Get the files** has the cut list from V1E's LowRider 4 calculator, the strut plates (DXF / SVG, or G-code to cut them on
the machine itself), the full BOM with hardware counts for your size, and V1E's JP3_LR `config.yaml` with
`max_travel_mm` set for your size (or your own config.yaml, adjusted the same way). The BOM has a **Where to buy**
column: V1E's store first (what's in the kit, what's a kit option), then EU and other sellers V1E lists.

**Front plate design** (Get the files > Strut plates): download an SVG template for your plate's length, draw on it
in Inkscape (Engrave, Pocket and Cut through layers; the red areas are off limits), and upload it. The page checks
it, carves it into the front plate in the view and adds it to the strut plate G-code (a V-bit first, an optional
1/16" clean-up, then the 1/8" bit for the plates).

Building numbers (the cutting area, table, braces pitch, cut list, strut plate drawing) follow the inches / mm
switch. Running numbers (tool position, MPos, work position, jogging, the G-code settings) are always mm with 3
decimals, as FluidNC reports them.

![Get the files: the BOM, the cut list and the strut plates](docs/img/build.webp)

### Run: FluidNC

**Run** boots the real FluidNC firmware in the page, with your config.yaml (V1E's JP3_LR until
you load your own under Configure > Get the files). The browser build has no stepper drivers or real pins, so it runs a translated
copy: every motor becomes a plain stepper and the limit and probe pins move to known pins; rates, acceleration,
travel, homing and limits are kept as in your file. (`$CD` in the console shows that copy; the page's config.yaml
download is always your real file.) FluidNC needs a cross-origin isolated page (`tools/serve.py`, or GitHub Pages
after one reload); where it can't run, the page says so.

Run has a Machine column on the left, the Job column on the right and the console under the view:
- **The state pill** shows FluidNC's state (red on an alarm, with a card over the view saying what to do); its menu
  has Unlock ($X), Soft reset and Power cycle.
- **Home** All ($H) or one axis homes on the machine's switches: each switch trips when its motor reaches the stop,
  so each Y motor stops on its own switch and squares the gantry, as on the real machine.
- **Work | Machine readout:** click a value and type where to go (Enter = `G90 G0` / `G53 G0`). **Zero** All / X /
  Y / Z sets work zero where the bit is. Machine is greyed until it has homed: like the real controller, it doesn't
  know where the machine is until then.
- **Hold / Resume** and **Stop** for a running job; FluidNC's **Feed** and **Rapid** overrides.
- **The jog pad** jogs X / Y / Z by a step (0.1 to 100 mm) at a feed; ■ stops the jog.
- **Touch plate under the bit** puts the plate on the stock so G38.2 stops on it.
- **On the table > Bit** (and a job's bit change) takes any bit the cut simulation knows: flat end mill, ball end,
  bullnose (corner radius), V-bit, chamfer (angle + tip flat) or tapered ball (angle + ball diameter), with its flute
  count, up to 1-1/2" across. A bit wider than 1/4" is drawn on a 1/4" shank (the router's collet takes no more), as
  a 2-flute bit unless the file says otherwise; over 1/2" it's drawn as a surfacing bit. **My bits** keeps your bits
  in this browser, starting with the V1E store's bits and a 3/4" surfacing bit. A job's tool change pops up its
  bit: **Install bit and resume**.
- **On the table > Stock** puts a board on the spoilboard by hand. **Spoilboard:** every cut into it stays (per
  machine, in this browser); **Surfacing job to the SD card** writes a zigzag that flattens it; **New spoilboard**
  lays a fresh one.
- **The console** takes any G-code or `$` command and shows FluidNC's replies (folded to one line until you open it).
- **Speed** runs the machine at 1x to 20x.

**Run G-code** runs any G-code file from the page's **SD card**, including the strut plate job the page keeps there
for your size (`LR4_strut_plates_<length>mm_<braces>br_<area>.gcode`; V1E's build order cuts these MDF plates on the
printed temporary struts - the strut plates choice in Configure only changes the model you see) (**Add
G-code files…**, or drop them on it; ▶ starts one after a short check: homed, work zero, the stock, the bit) through FluidNC (`$SD/Run`), from the page or from the FluidTouch
pendant. The stock is carved as the motors move (with the file's own bits, from
[cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) `(Stock: ...)` / `(ToolDef ...)` comments, or the
ones set up under **On the table**), M0 holds pop up their message, G38.2 probes stop on the touch plate and tool
changes hold for the bit.

**👁 Preview** plays a file fast (1x to 100x, scrub with the timeline, **Space** plays / pauses) from where
FluidNC is, in a player that takes the Job column's place: what Run would do, with the file's own probing and zeroing (G38.2 P, G10 L20, G92) on a copy of the
offsets. It carves a copy of the stock, never the spoilboard, and FluidNC doesn't move; **Exit preview** (or
FluidNC moving) puts the model back where FluidNC is. Preview works even where FluidNC can't run.

![Preview: the strut plate job at 100x, carving a copy of the stock](docs/img/playback.webp)

**Web UIs:** put a web UI on FluidNC's SD card or Flash (WebUI 3, WebUI 2 or FigUI: their release `index.html.gz`,
as they are) and **Pendant & WebUI > Web UIs > Open** (top bar, in Run) shows it in a window of its own, served by the page's FluidNC
web server the way a board serves it: watch and drive the machine from there, upload files to its card. The Flash's
`index.html.gz` opens at `/`, `/sd/ui/<name>/index.html.gz` at `/ui/<name>/`, any other `x.html.gz` at
`/sd/x.html` (FluidNC's WebDAV, in 4.1.1 too). Keep the sandbox tab open: FluidNC runs there, and the window reaches
it through its own service worker (`web/device/`; same browser only). Several UIs open at once can get errors from
FluidNC, as on a board.

![Run: FluidNC homed, with its console open](docs/img/fluidnc.webp)

**Browser:** tested in desktop Chrome (and Edge for VR). FluidNC mode needs the page to be cross-origin isolated
(its threads need SharedArrayBuffer). `tools/serve.py` sends the headers; on GitHub Pages the page reloads itself
once on the first visit to turn it on (a service worker, `web/coi-serviceworker.js`). Private windows without
service workers can't run FluidNC mode; everything else works.

### Workshop

**Look** > **Scene** > **Background** > **Workshop** shows the machine in a workshop: by default the maintainer's
16 x 20 ft shop with an 8' 4" ceiling (benches, shelf, an open garage door, four 4 ft LED strips that light the
scene). **Empty shop** is the same building with only the garage door, the lights and the fire extinguisher. Zoom in
and the near walls open up;
zoom far out to see the closed building. Enter your own building's size (X, Y, ceiling, under Background) to see how
much room the machine takes: the page gives the gap to each wall and warns when a side is under 2 ft / 600 mm. The
room and the table legs are drawn by the page only.

![The workshop from the driveway: the LR4 through the open garage door](docs/img/outside.webp)

### Sound

**⚙** (on the canvas) > **Sound** turns on machine sounds, synthesized live from what the machine is doing: the
steppers (TMC2209s in StealthChop, pitched by each axis' step rate), the Kobalt router at its dial speed with the
cutting load (it bogs down in a deep cut), the shop vac, the switch clicks when homing and the touch plate tap. The
same menu has the volume and, for fun, a "robot noises" voice. The welcome card has a link that turns them on.

### Help videos

**Help ▾** (top bar) lists short videos that play **live in the page**, not as recordings - the machine homes, jogs
and cuts on its own FluidNC while titles and captions explain it. Each one has its own link (`#help=<id>`):

- [Tour + first job](https://jeyeager65.github.io/lr4-sandbox/#help=tour) - the Configure steps, then Run: Home, Zero
  and a name plate engraved
- [Why home?](https://jeyeager65.github.io/lr4-sandbox/#help=why_home) - switched on, the gantry is racked; `$H`
  squares it
- [Probing and zero](https://jeyeager65.github.io/lr4-sandbox/#help=probing) - work zero per axis, and the touch plate
  finding the stock's top
- [As built + tram](https://jeyeager65.github.io/lr4-sandbox/#help=asbuilt) - a racked gantry, a router out of tram,
  a warped spoilboard, and the squareness test
- [Your own front plate](https://jeyeager65.github.io/lr4-sandbox/#help=front_plate) - the template, your SVG, the
  plate in 3D and its job

Each one plays on a temporary machine set up the
way the video needs (its size, table, As built), so your machine, its settings and its SD card stay exactly as they
are; **✕ Exit** brings you back. While one plays: ⏸ / ▶ (or Space, or a click on the view) pauses, a drag looks round
(**Follow** gives the camera back), and the sound comes on for the video. Jobs play at up to 5× (FluidNC's pace in the
browser). The welcome card offers the tour. The videos are `(Video ...)` G-code scripts in [`web/help/`](web/help/)
(the list: `web/help/index.json`); the same files make the YouTube versions with `tools/record_demo.js` (below), and
any G-code file with `(Video ...)` lines on the SD card can be played the same way (its ⋯ menu: **▶ Play as a video**).

### Around the view

- **Iso / Front / Top / Side / Back / Fit all** (keys **1**-**5**, **F**) set the camera; on a phone they fold into
  one **View** menu. ☰ (**H**) hides the side panel. **Layers** (**L**) shows / hides parts.
- **On a phone** Run is the view, Hold / Stop, the readout, Home / Zero / Jog / Files and the job; Jog, Files and the
  console open as sheets from the bottom.
- **📏 Measure** (**M**): two clicks on the machine, snapping to corners and hole centres; Esc ends it.
- **📷** (**P**) saves the view as a PNG.
- **?** lists the keys. ⚙ also connects a 3Dconnexion SpaceMouse.
- **Copy a link to this build** (in the footer) puts the size, braces, plate choices, options, pendant, table, room,
  colours and units in the link, for example `#26x50&braces=6&hose=0&units=mm`; opening it sets them.
- **Reset settings** (footer) puts every setting back to the default; your part files and SD card stay.

### VR (optional)

With a PC VR headset on SteamVR / OpenXR (PS VR2, Index, Quest Link) and Chrome or Edge, the toolbar shows
**Enter VR** (https or 127.0.0.1 only); the desktop window then shows a small card instead of the side panel. Left
controller: the menu (tap its grip to hide it). Touch a part - or point at it and pull the trigger - for its name
and Hide part / Hide group. Trigger also presses menu buttons, grabs the red sphere to move the core and drags the
corner diamond to resize the table (snaps to 1/2 in, rebuilds when you let go). Hold a grip to drag the machine;
hold both to zoom and rotate. Thumbstick: left / right turns; at 1:1 push forward to aim a teleport and let go to
jump; on the tabletop forward / back zooms. Load part files on the desktop first.

## Running it locally

```sh
python tools/serve.py sandbox 48x96          # the page on 127.0.0.1:8767; optional size in inches
```

It serves the repo with the cross-origin isolation headers and opens the page with `?parts=/parts/`, so it loads
the files in your `parts/` folder (if you have one) without dropping them.

## Making videos from G-code

`tools/record_demo.js` records an MP4 of the page running a G-code file, with the machine sounds. The video is
scripted by `(Video ...)` comments in the file itself, in the style of cnc-gcode-tools' `(CNCSIM)` / `(Stock:)` /
`(ToolDef)` comments: FluidNC and the page ignore them, so one file is both the job and the video. It runs the page
in headless Chrome, where the page's own director ([`web/js/page/director.js`](web/js/page/director.js), the same one
that plays help videos live in the page) runs the script on a clock stepped one frame at a time, so the video plays at
true speed however long each frame takes to render (1080p: about 6 minutes for a 2 minute video).

It needs a clone of this repo, the part files in `parts/` (see above), Node 22+, Chrome and ffmpeg on the PATH:

```sh
python tools/serve.py sandbox --no-open      # serve the page (with the headers FluidNC and the pendant need)
node tools/record_demo.js docs/examples/feature_demo.gcode exports/video/feature_demo.mp4
```

[`docs/examples/feature_demo.gcode`](docs/examples/feature_demo.gcode) is a worked example: a tour of the page
(Show presets, the core in Inspect: exploded, cut, X-ray, lines), then homing, a probe and a small sign cut with two
bits (a 1/8" flat for the letters and holes, a tool change, a 90° V-bit for the border), with captions, camera
shots and the FluidTouch pendant's screen in a corner. The comments:

| Comment | What it does |
|---|---|
| `(Video: SIZE=1920x1080 FPS=30 SOUND=on ...)` | Settings, before the first move: size, frame rate, volume, `VOICE=robot`, `DETAIL`, `SCENERY=shop\|empty\|plain`, `MACHINE=26x50` (cutting area, in), the machine's options as on My LR4 (`TABLE=34in ROOM=16x20x9ft BRACES= STRUTS= PETER= ROUTER= SKIRT= HOSE= FAN= MAIN= ACCENT=`), `PENDANT=on`, `MODE=fluidnc` (run it on the page's FluidNC), how long M0 pauses and messages show (`PAUSE`, `MESSAGETIME`), `PARK=on`, `HOLD` on the result. |
| `(Video Title: TIME=3 TEXT=Line one\|Line two)` | A full-screen title card. |
| `(Video Text: TIME=4 TEXT=...)` | A caption over what comes next. |
| `(Video Shot: VIEW=tool TIME=1.5 ORBIT=8 DIST=600)` | The camera: `workshop`, `machine`, `stock`, `tool` (follows the bit), `toolfront` (the same, straight in from the front), `core`, `iso`, `front`, `top`, `side`, `back`, `page`, `pendant`, `ymin` / `ymax` (a Y carriage), `gantry`, `gantrytop` (straight down: the rack); it blends there over TIME and turns round it over ORBIT. |
| `(Video AsBuilt: ON=on RACK=4 STOPY=1.5 TRAM=2 WARPX=0.8 EXAG=10 ...)` | The machine's As built faults for this video (Configure > 4 As built); the full list is in the script reference. |
| `(Video Show: PRESET=frame HIDE=Dust_Skirt*,Bristles_TPU* SHOW=...)` | What's drawn, by Show's presets and ids (an assembly, `asm.kind`, a part name, `*` patterns). Mid-job too: hide the skirt and bristles to watch the bit. |
| `(Video Inspect: ID=core EXPLODE=0.7 SECTION=y@0.5 FLIP=on VIEW=xray TIME=2 ORBIT=6)` | The inspect view, animated over TIME; `ID=off` goes back to the machine. |
| `(Video Home: OFFSET=30)` / `(Video Zero: X=150 Y=120)` | Home at real speed, then jog to work zero (where the stock sits); before the first move. |
| `(Video Speed: FIT=25 REAL=3)` | The job's pace: `X=` times, or fit its moves into FIT seconds; REAL = seconds at 1x at each section's first cut. |
| `(Video Wait: TIME=2)` / `(Video Pendant: SHOW=on CORNER=br SIZE=24)` | Hold; the pendant's screen in a corner. |
| `(Video: KIND=ui)` | A video of the whole page (panel, top bar, Run columns; 1920x1080 unless `SIZE=`), to show how to use it. The default, `KIND=machine`, shows only the 3D view. |
| `(Video Point: ID=home TIME=3 TEXT=This is Home)` | ui videos: a ring round a control (by its element id) and a caption. |
| `(Video Design: EXAMPLE=on)` / `(Video Design: FILE=help/plate.svg)` | The front plate design, as if uploaded (Configure > 6 Get the files): the template's own Example, or an SVG next to the page. |
| `(Video Click: ID=home)` / `(Video Step: ID=t-run)` | ui videos: a pointer moves to the control and clicks it, and the page does what a click does (Home homes, the Start check's ▶ Start runs the job); Step only opens a Design step, tab or menu that isn't open. |

Lines before the first move are the intro and run in order; later ones run when the job reaches their line. `MSG`
comments show on top as the job reaches them, and M0 pauses show their popup. The full reference is the header of
[`web/js/demo_script.js`](web/js/demo_script.js); the recorder's options (`--size`, `--job`, `--real`, `--mode`,
`--voice`, `--pendant`, `--no-sound`, `--log` ...) are in the header of [`tools/record_demo.js`](tools/record_demo.js), and
command-line flags win over the file's settings. `--log events.txt` writes the director's event log (shots, titles,
captions, Home, jogs, each second's speed); `node tools/video_log_diff.js before.txt after.txt` checks that a change
left a video as it was.

## Running the FreeCAD model

Needs FreeCAD 1.1 or newer and Python 3.

```sh
python tools/run.py freecad/build.py         # build the machine (~1.5 min with warm caches, ~4 min cold)
python tools/run.py freecad/export_web.py    # web viewer data from the last build
python tools/serve.py viewer                 # look at it in the browser
```

`tools/run.py` finds `freecadcmd` on Windows, macOS and Linux (or set `FREECAD_CMD`). Set the cutting area at the
top of `freecad/build.py` (`CUT_X_IN`, `CUT_Y_IN`). Output goes to `build/` (FCStd, BOM) and `exports/`
(strut plates, G-code, web data).

## Rebuilding FluidNC for the browser

`web/fluidnc/` is committed, so the page works as is. To rebuild it (after a change on the fork's branch):

1. Install the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (`emsdk install latest`,
   `emsdk activate latest`) and [PlatformIO](https://platformio.org/install/cli).
2. Clone [the fork](https://github.com/jeyeager65/FluidNC) and check out its `wasm-sim` branch at the commit
   `PIN` in `tools/build_fluidnc_wasm.py`.
3. Run it, pointing at both:

```sh
FLUIDNC=/path/to/FluidNC EMSDK=/path/to/emsdk python tools/build_fluidnc_wasm.py
```

It runs `pio run -e wasm` and copies `program.js` / `program.wasm`, FluidNC's GPL-3.0 license and `build.json` (the
exact commit and a source link) into `web/fluidnc/`. `--dirty` builds a checkout with local changes (marked so in
`build.json`; don't commit that). The defaults are `D:/GitHub/FluidNC` and `D:/emsdk`.

`web/fluidnc/vnet_host.js` and `web/device/` (the Web UI windows) are adapted from FluidNC's
`FluidNC/wasm/demo/vnet-*.js` and are GPL-3.0 like the rest of `web/fluidnc/`.

## Tests

```sh
cd tests && npm install                      # once
npm test                                     # what CI runs (no part files needed)
npm run test:local                           # the node tests below that don't need a browser
node test_config_model.js                    # the page's machine vs every FreeCAD size build
node test_calculator.js                      # the JS and Python calculators agree (needs python)
node test_vr.js                              # the VR menu layout, the workshop room
node test_strut_cam.js                       # the page's strut plate G-code; vs freecad/cam.py if its goldens exist
node test_show_tree.js                       # the Show tree, its presets and the inspect sets
node test_sounds.js                          # the machine sound helpers (stepper pitch, router, cutting load)
node test_demo_script.js                     # (Video ...) comments -> the video's settings and commands
node test_help_scripts.js                    # web/help/: every help video parses clean, fits FluidNC, names real ids
node test_page_help.js                       # headless Chrome (GPU): a help video live on the temporary machine,
                                             #   pause / Follow / the end, Exit leaves your machine as it was
node test_page_help_ui.js                    # a ui video (tests/video_ui.gcode) live: Step / Point / Click, the job
                                             #   started by the page's own Start
node test_gcode_play.js                      # G-code playback: pauses, probe, G20/G21, carving frees the plates
node test_homing.js                          # homing helpers: FluidNC's homing order, pull-offs, MPos
node test_fluidnc_sim.js                     # parsing FluidNC's output (status reports, ok / error, messages)
node test_sim_config.js                      # config.yaml -> the browser copy (V1E's JP3_LR + an odd user file)
node test_page_fluidnc.js                    # headless Chrome: FluidNC in the page - boot, home, probe, jog,
                                             #   speed, restarts; served with headers and as plain files (Pages)
node test_page_vr.js                         # headless Chrome: the page in VR preview
node test_page_webui.js                      # headless Chrome: a web UI from the SD card / Flash in its own
                                             #   window - /command, WebSocket, a move, an upload (headers + plain)
node test_page_inspect.js                    # headless Chrome: the inspect view and its tools (needs parts/)
node test_page_sdjob.js                      # headless Chrome: the SD card and a job run on FluidNC
node test_page_pendant.js                    # headless Chrome: the pendant on FluidNC
node test_page_fluidtouch.js                 # headless Chrome: FluidTouch's UI connected to the page
node test_page_sound.js                      # headless Chrome: machine sounds start, follow the axes, render a WAV
node test_page_parts.js                      # headless Chrome: part files - the Parts chip, welcome card, stand-ins
node test_page_phone.js                      # headless Chrome: the phone layout (390 x 844): Run's sheets, console
node test_page_help_all.js                   # every help video in web/help/ plays live to its end
node test_page_hand.js                       # headless Chrome: stock / bit / touch plate by hand, moves carve, M6 holds
node test_page_table.js                      # headless Chrome: the table base (MDF sheet / torsion box) and spoilboard
node test_page_asbuilt.js                    # headless Chrome: As built - racked homing, power cycle, warp, tram
node test_page_filaments.js                  # headless Chrome: filaments, presets, Printed in, the printed look
node test_page_machines.js                   # headless Chrome: My machines - switch, duplicate, export / import, links
node test_page_design.js                     # headless Chrome: the front plate design, uploaded and carved
node test_strut_plate.js                     # JS strut plates vs Vector76's OpenSCAD generator (maintainer only)
python ../tools/run.py test_strut_plate.py   # Python strut plates vs the same (maintainer only)
node test_parts_files.js                     # the page's STL / DXF readers vs the reference build (needs parts/)
python ../tools/run.py test_share.py         # the share data's placements vs the reference build (needs parts/)
```

CI (`.github/workflows/ci.yml`) runs the no-part-files guard, a compile of every Python script and `npm test`.
The rest need Chrome, `parts/`, the size builds or the OpenSCAD goldens, so they run locally.

## Problems and changes

Something placed wrong, a file not recognised, a wrong number: use **Report a problem** in the page's footer. It
opens a GitHub issue with your size and file checksums filled in. Questions about the LowRider itself go to the
[V1E forum](https://forum.v1e.com/). Parts to buy: [LowRider parts in the V1E store](https://www.v1e.com/collections/lowrider-parts), or the BOM's
Where to buy column. What changed per version: [CHANGELOG.md](CHANGELOG.md).

## Layout

```
freecad/    the model: build.py, lr4.py (measured placements), hardware.py, bom.py, checks, export, CAM
  fclib/    shared FreeCAD helpers (vendored copy)
web/        the page (index.html), the viewer (viewer.html), js/
  data/     the page's data from the pipeline (placements and our own hardware meshes; no V1E geometry)
  fluidnc/  FluidNC built for the browser (GPL-3.0)
pipeline/   FreeCAD builds -> the page's data
tests/      node tests, test_strut_plate.py, test_share.py
tools/      run.py, serve.py, build_fluidnc_wasm.py, repo tools (sync_fclib, check_no_parts, check_parts,
            page_shot = headless screenshots, record_demo + demo_script = videos from G-code)
docs/       PLAN.md: settings, measurements and decisions behind the model; img/: the pictures here;
            examples/: a scripted demo video (G-code)
.github/    CI, the Pages workflow (manual), issue template
```

`parts/` (except its manifest), `build/` and `exports/` are git-ignored. `web/data/` is committed: it's the page's
only data, and it holds no V1E geometry (the page places your downloaded files).

## Credits

- **[V1 Engineering](https://www.v1e.com/)** designed the LowRider 4 and its parts. The machine
  sizing matches V1E's LowRider 4 calculator; the `config.yaml` is V1E's JP3_LR.
- **[Vector76](https://github.com/vector76)** wrote the [LR4 strut plate generator](https://vector76.github.io/Web_OpenSCAD_Customizer/strut_plate.html)
  (OpenSCAD) that the strut plate code follows.
- Preview and the job carving use [cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) (MIT):
  its parser, expander, animator and stock simulator, copied unmodified into `web/js/lib/cnc-gcode-tools/`.
- The Run tab's controller is **[FluidNC](https://github.com/bdring/FluidNC)** (GPL-3.0) itself, built for the
  browser with its wasm port, from the `wasm-sim` branch of [a fork](https://github.com/jeyeager65/FluidNC/tree/wasm-sim)
  (`web/fluidnc/build.json` names the exact commit; `tools/build_fluidnc_wasm.py` rebuilds it).
- The pendant is [FluidTouch](https://github.com/jeyeager65/FluidTouch) (MIT): its case and stand, and its firmware's
  UI built for the browser (`web/fluidtouch/`).
- [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) (MIT, `web/coi-serviceworker.js`) makes the page
  cross-origin isolated on GitHub Pages, which FluidNC's threads need.

### Built with Claude

Most of this repo was written with [Claude Code](https://claude.com/claude-code) (Anthropic), working with the
maintainer. That includes the FreeCAD scripts, the part placement solving, the sandbox page and its tests. The
maintainer checked the model against V1E's build photos and real measurements. [`CLAUDE.md`](CLAUDE.md) holds the
instructions Claude follows when working in this repo.

## License

The code in this repo is [MIT-licensed](LICENSE), except `web/fluidnc/` (FluidNC, built from its source:
[GPL-3.0](web/fluidnc/LICENSE)). The LowRider 4 design and its part files belong to V1 Engineering and their other
authors, and are not covered by this license.
