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
| **LowRider 4 Sandbox** (`web/index.html`) | The page. **My machine:** enter a cutting area and it builds the machine in 3D (every printed part, rail, belt, bolt, the strut plates and the vacuum hose); choose what's on it (router + shoe, hose, lid fan, pendant, Peter Plates, strut plates). **Show:** a tree of every part by assembly and kind, with presets, to hide parts from the view. **Build it:** the cut list (V1E's calculator), the strut plate outlines, DXF / SVG / G-code downloads, the full BOM and a `config.yaml` for your size. **Run:** play G-code on the machine, or drive it with FluidNC in the browser. Plus a workshop round it and VR. |
| **FreeCAD model** (`freecad/`) | Scripts that assemble the LowRider 4 in [FreeCAD](https://www.freecad.org/) from the official STLs. Every part is placed by its measured mating features (hole patterns, pockets), and every fastener is checked for seat, engagement and collisions. Outputs: an FCStd assembly, a BOM, strut plate DXF/SVG and G-code. |
| **Pipeline** (`pipeline/`) | Builds the model at many sizes and fits how each part moves with the size. That is how the page can draw any size without FreeCAD. |
| **FluidNC in the browser** (`web/fluidnc/`) | FluidNC's wasm port, built from a fork's `wasm-sim` branch with simulated limit switches, a touch plate probe and a time scale. |

## The part files

The printed parts are **not** in this repo. They are V1 Engineering's (and other designers') files. You download
them yourself from Printables (free), and the page or the FreeCAD scripts place your copies:

| Download | Folder in `parts/` (FreeCAD only) |
|---|---|
| [LowRider 4](https://www.printables.com/model/1034840) (V1 Engineering), including the XZ plate DXFs | `lr4/` |
| [Kobalt tool mount + dust shoe](https://www.printables.com/model/1034828) (V1 Engineering) | `kobalt/` |
| [Jackpot3 box](https://www.printables.com/model/1434650) | `jackpot3/` |
| [Peter Plates](https://www.printables.com/model/1044487) (V1 Engineering) | `peter/` |

On each Printables page, use **Download** to get all of the model's files as one zip. Nothing else is needed: the
page and the scripts bring their own hardware models (steppers, bearings, rails, bolts, router, hose).

### Adding them to the page

1. Open the page. Until it has the files, it draws only the hardware, and the **Your part files** panel at the top
   of the side panel lists what's missing, with a Printables link for each download.
2. Drop the four zips anywhere on the page. You can also drop a folder or loose STL / DXF files, or use
   **Choose files…** / **Choose a folder…** in the panel.
3. The panel counts them in ("✓ All 40 part files loaded") and the printed parts appear. **Manage** opens the panel
   again later; **Forget files** clears them.

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

### My machine, Show and Build

Enter the cutting area (inches or mm) and the page rebuilds the machine: brace count, rails, belts, table, hose
routing. Options take parts off the machine and the BOM (router + dust shoe, skirt, hose, lid fan, pendant); **Show**
only hides parts from the view (assembly > printed / cut / hardware / electronics > part; a bolt is listed under both
assemblies it joins). **Inspect** (⤢ on a row, or double-click a part) shows one assembly or part alone with the
bolts and bearings that hold it and its parts list, screw and nut counts included. **Build** has the cut list from V1E's LowRider 4 calculator, the strut plates (DXF / SVG, or G-code to
cut them on the machine itself), the full BOM with hardware counts for your size, and V1E's JP3_LR `config.yaml`
with `max_travel_mm` set for your size (or your own config.yaml, adjusted the same way).

![Build: the BOM, the cut list and the strut plates](docs/img/build.webp)

### Run: Basic

**Run** > **Runs on Basic** plays G-code on the machine: the strut plate job (V1E's build order: the machine runs
on its printed temporary struts and cuts its own MDF strut plates; **Use the temporary struts**), or any G-code file
(**Play a G-code file…**). The bit follows the moves at FluidNC-like speeds, the stock is carved as it goes, M0
pauses pop up their message, G38.2 probes stop on the touch plate, and Home plays FluidNC's homing. Speeds 1x to
300x; scrub with the timeline. With **FluidTouch pendant** ticked (off by default), the pendant on the table works
here too: it talks to a small stand-in for
FluidNC (labelled as such) that homes, jogs, holds / resumes, lists the SD card and plays a file from it; anything
else answers "not in Basic mode".

![Basic: the strut plate job on the temporary struts](docs/img/playback.webp)

### Run: FluidNC

**Run** > **Runs on FluidNC** boots the real FluidNC firmware in the page, with your config.yaml (V1E's JP3_LR until
you load your own under Build). The browser build has no stepper drivers or real pins, so it runs a translated
copy: every motor becomes a plain stepper and the limit and probe pins move to known pins; rates, acceleration,
travel, homing and limits are kept as in your file. (`$CD` in the console shows that copy; the page's config.yaml
download is always your real file.)

- **Home ($H)** homes on the machine's switches: each switch trips when its motor reaches the stop, so each Y motor
  stops on its own switch and squares the gantry, as on the real machine.
- **The jog pad** jogs X / Y / Z by a step (0.1 to 100 mm) at a feed; ■ stops the jog.
- **Touch plate under the bit** puts the plate on the stock so G38.2 stops on it.
- **The console** takes any G-code or `$` command and shows FluidNC's replies.
- **Machine speed** runs it at 1x, 2x, 5x or 10x.
- MPos is greyed until it has homed: like the real controller, it doesn't know where the machine is until then.

G-code files on the page's SD card run through FluidNC too (`$SD/Run`), from the page or from the FluidTouch pendant.

![FluidNC mode, homed, with its console](docs/img/fluidnc.webp)

**Browser:** tested in desktop Chrome (and Edge for VR). FluidNC mode needs the page to be cross-origin isolated
(its threads need SharedArrayBuffer). `tools/serve.py` sends the headers; on GitHub Pages the page reloads itself
once on the first visit to turn it on (a service worker, `web/coi-serviceworker.js`). Private windows without
service workers can't run FluidNC mode; everything else works.

### Workshop

**View** (the ⚙ on the canvas) > **Background** shows the machine in a workshop: by default the maintainer's
16 x 20 ft shop with an 8' 4" ceiling (benches, shelf, an open garage door). Zoom in and the near walls open up;
zoom far out to see the closed building. Enter your own building's size (X, Y, ceiling) to see how much room the
machine takes: the page gives the gap to each wall and warns when a side is under 2 ft / 600 mm. The room and the
table legs are drawn by the page only.

![The workshop from outside](docs/img/outside.webp)

### VR (optional)

With a PC VR headset on SteamVR / OpenXR (PS VR2, Index, Quest Link) and Chrome or Edge, the View panel shows
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

## Tests

```sh
cd tests && npm install                      # once
npm test                                     # what CI runs (no part files needed)
npm run test:local                           # the node tests below that don't need a browser
node test_config_model.js                    # the page's machine vs every FreeCAD size build
node test_calculator.js                      # the JS and Python calculators agree (needs python)
node test_vr.js                              # the VR menu layout, the workshop room
node test_strut_cam.js                       # the page's strut plate G-code; vs freecad/cam.py if its goldens exist
node test_gcode_play.js                      # G-code playback: pauses, probe, G20/G21, carving frees the plates
node test_homing.js                          # Basic mode's Home: FluidNC's homing order, pull-offs, MPos
node test_fluidnc_sim.js                     # parsing FluidNC's output (status reports, ok / error, messages)
node test_sim_config.js                      # config.yaml -> the browser copy (V1E's JP3_LR + an odd user file)
node test_page_fluidnc.js                    # headless Chrome: FluidNC in the page - boot, home, probe, jog,
                                             #   speed, restarts; served with headers and as plain files (Pages)
node test_page_vr.js                         # headless Chrome: the page in VR preview
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
[V1E forum](https://forum.v1e.com/). What changed per version: [CHANGELOG.md](CHANGELOG.md).

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
            page_shot = headless screenshots, record_demo = a demo video)
docs/       PLAN.md: settings, measurements and decisions behind the model; img/: the pictures here
.github/    CI, the Pages workflow (manual), issue template
```

`parts/` (except its manifest), `build/` and `exports/` are git-ignored. `web/data/` is committed: it's the page's
only data, and it holds no V1E geometry (the page places your downloaded files).

## Credits

- **[V1 Engineering](https://www.v1e.com/)** designed the LowRider 4 and its parts. The machine
  sizing matches V1E's LowRider 4 calculator; the `config.yaml` is V1E's JP3_LR.
- **[Vector76](https://github.com/vector76)** wrote the [LR4 strut plate generator](https://vector76.github.io/Web_OpenSCAD_Customizer/strut_plate.html)
  (OpenSCAD) that the strut plate code follows.
- Basic mode parses, times and carves with [cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) (MIT):
  its parser, expander, animator and stock simulator, copied unmodified into `web/js/lib/cnc-gcode-tools/`.
- The Run tab's controller is **[FluidNC](https://github.com/bdring/FluidNC)** (GPL-3.0) itself, built for the
  browser with its wasm port, from the `wasm-sim` branch of [a fork](https://github.com/jeyeager65/FluidNC/tree/wasm-sim)
  (`web/fluidnc/build.json` names the exact commit; `tools/build_fluidnc_wasm.py` rebuilds it).
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
