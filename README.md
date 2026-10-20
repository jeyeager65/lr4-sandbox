# LR4 Sandbox

A full 3D model of the [V1 Engineering LowRider 4](https://docs.v1e.com/lowrider/) CNC, built from the real printed
part files and sized to any cutting area, plus a browser configurator that shows the whole machine, cut list, strut
plates and bill of materials for your size.

> **Status: work in progress, not released.** This is an independent fan project. It is not made, endorsed or
> supported by V1 Engineering. Questions about the LowRider itself belong on the
> [V1E forum](https://forum.v1e.com/), not here.

## What's here

| | |
|---|---|
| **Configurator** (`web/index.html`) | Enter a cutting area and the page builds the machine in 3D: every printed part, rail, belt, bolt, the strut plates and the vacuum hose. It also gives the cut list, the strut plate outlines and the BOM. |
| **FreeCAD model** (`freecad/`) | Scripts that assemble the LowRider 4 in [FreeCAD](https://www.freecad.org/) from the official STLs. Every part is placed by its measured mating features (hole patterns, pockets), and every fastener is checked for seat, engagement and collisions. Outputs: an FCStd assembly, a BOM, strut plate DXF/SVG and G-code. |
| **Pipeline** (`pipeline/`) | Builds the model at many sizes and fits how each part moves with the size. That is how the configurator can draw any size without FreeCAD. |

The printed parts are **not** in this repo. They are V1 Engineering's (and other designers') files. You download
them yourself from Printables, and the model and configurator place your copies:

| Folder in `parts/` | Source |
|---|---|
| `lr4/` | [LowRider 4](https://www.printables.com/model/1034840) (V1 Engineering), including the XZ plate DXFs |
| `kobalt/` | [Kobalt tool mount + dust shoe](https://www.printables.com/model/1034828) (V1 Engineering) |
| `jackpot3/` | [Jackpot3 box](https://www.printables.com/model/1434650) |
| `peter/` | [Peter Plates](https://www.printables.com/model/1044487) (V1 Engineering) |

`parts/manifest.json` lists every file with the SHA-256 it was tested with. `python tools/check_parts.py` says
which are missing or differ (a different version is still used, with a warning).

## Two ways to use it

1. **In the browser (light).** Open the configurator (GitHub Pages, once it's published), download the four
   Printables zips above and drop them on the page. Nothing to install; the files stay in your browser. You get
   the 3D machine at your size, the cut list, the BOM, strut plate DXF / SVG / G-code and a FluidNC `config.yaml`.
2. **The FreeCAD scripts (heavy).** Clone the repo, unzip the same downloads into `parts/` (folders as in the
   table) and build. You get your own FCStd assembly with every fastener checked, the BOM, strut plate DXF and
   G-code. Needs FreeCAD 1.1+; see below.

Downloads: only the Printables files in the table. Nothing else is needed; the page and the scripts bring our own
hardware models (steppers, bearings, rails, bolts, router, hose).

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

## Running the configurator locally

```sh
python tools/serve.py configurator 48x96     # optional size in inches
python tools/serve.py configurator --share   # the share data: no V1E geometry, load your own part files
```

With the share data the page draws only our hardware until you give it the part files: drop the Printables zips,
a folder or the STL / DXF files on the page (or use its buttons). They're read in your browser, recognised by
SHA-256 (renamed files are fine) and kept in its IndexedDB; nothing is uploaded. The panel lists what's missing,
with the Printables links, and warns about files that differ from the versions the placements were solved for.

**VR (optional):** with a PC VR headset on SteamVR / OpenXR (PS VR2, Index, Quest Link) and Chrome or Edge, the
View panel shows "Enter VR" (https or 127.0.0.1 only); the desktop window then shows a small card instead of the
side panel. Left controller: the menu (tap its grip to hide it). Touch a part - or point at it and pull the
trigger - for its name and Hide part / Hide group. Trigger also presses menu buttons, grabs the red sphere to move
the core and drags the corner diamond to resize the table (snaps to 1/2 in, rebuilds when you let go). Hold a grip
to drag the machine; hold both to zoom and rotate. Thumbstick: left / right turns; at 1:1 push forward to aim a
teleport and let go to jump; on the tabletop forward / back zooms. Load part files on the desktop first.

**Workshop:** View > Background shows the machine in a workshop. Enter your building's size (X, Y, ceiling) to see
how much room it takes: the page gives the gap from the machine to each wall and warns when a side is under
2 ft / 600 mm. The table legs and the room are drawn by the page only (not part of the FreeCAD model).

## Tests

```sh
cd tests && npm install                      # once
npm test                                     # what CI runs (no part files needed)
npm run test:local                           # all the node tests below
node test_config_model.js                    # the configurator's machine vs every FreeCAD size build
node test_calculator.js                      # the JS and Python calculators agree (needs python)
node test_vr.js                              # the VR menu layout and helpers
node test_strut_cam.js                       # the page's strut plate G-code; vs freecad/cam.py if its goldens exist
node test_strut_play.js                      # job playback + stock carving: holes / outlines through, tabs left
node test_strut_plate.js                     # JS strut plates vs Vector76's OpenSCAD generator (maintainer only)
python ../tools/run.py test_strut_plate.py   # Python strut plates vs the same (maintainer only)
node test_parts_files.js                     # the page's STL / DXF readers vs the reference build (needs parts/)
python ../tools/run.py test_share.py         # the share data's placements vs the reference build (needs parts/)
```

CI (`.github/workflows/ci.yml`) runs the no-part-files guard, a compile of every Python script and `npm test`.
The rest need `parts/`, the size builds or the OpenSCAD goldens, so they run locally.

## Problems and changes

Something placed wrong, a file not recognised, a wrong number: use **Report a problem** in the page's footer. It
opens a GitHub issue with your size and file checksums filled in. Questions about the LowRider itself go to the
[V1E forum](https://forum.v1e.com/). What changed per version: [CHANGELOG.md](CHANGELOG.md).

## Layout

```
freecad/    the model: build.py, lr4.py (measured placements), hardware.py, bom.py, checks, export, CAM
  fclib/    shared FreeCAD helpers (vendored copy)
web/        the pages: index.html (configurator), viewer.html, js/
pipeline/   FreeCAD builds -> configurator data
tests/      node tests, test_strut_plate.py, test_share.py, test_parts_files.js
tools/      run.py, serve.py, repo tools (sync_fclib, check_no_parts, check_parts, page_shot = headless screenshots)
docs/       PLAN.md: settings, measurements and decisions behind the model
.github/    CI, the Pages workflow (manual), issue template
```

`parts/` (except its manifest), `build/`, `exports/` and `web/data/` are git-ignored. A pre-commit check (`tools/check_no_parts.py`)
stops STL, STEP, DXF and FCStd files from being committed.

## Credits

- **[V1 Engineering](https://www.v1e.com/)** designed the LowRider 4 and its parts. The machine
  sizing matches V1E's LowRider 4 calculator.
- **[Vector76](https://github.com/vector76)** wrote the [LR4 strut plate generator](https://vector76.github.io/Web_OpenSCAD_Customizer/strut_plate.html)
  (OpenSCAD) that the strut plate code follows.
- The stock carving in the job playback is `StockSimulator` from
  [cnc-gcode-tools](https://github.com/jeyeager65/cnc-gcode-tools) (MIT), copied as `web/js/stock_sim.js`.

### Built with Claude

Most of this repo was written with [Claude Code](https://claude.com/claude-code) (Anthropic), working with the
maintainer. That includes the FreeCAD scripts, the part placement solving, the configurator and its tests. The
maintainer checked the model against V1E's build photos and real measurements. [`CLAUDE.md`](CLAUDE.md) holds the
instructions Claude follows when working in this repo.

## License

The code in this repo is [MIT-licensed](LICENSE). The LowRider 4 design and its part files belong to V1 Engineering
and their other authors, and are not covered by this licence.
