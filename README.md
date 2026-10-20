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

A parts manifest with the exact file names and checksums the model was solved against is coming. Until then, the
FreeCAD scripts expect the folder layout above.

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
```

The page reads its data from `web/data/`, which `pipeline/` generates from FreeCAD builds:

```sh
python pipeline/size_builds.py               # FreeCAD builds at 13 sizes (~55 min)
python pipeline/fit_config.py                # fit -> web/data/
```

## Tests

```sh
cd tests && npm install                      # once
node test_config_model.js                    # the configurator's machine vs every FreeCAD size build
node test_calculator.js                      # the JS and Python calculators agree (needs python)
node test_strut_plate.js                     # JS strut plates vs Vector76's OpenSCAD generator (maintainer only)
python ../tools/run.py test_strut_plate.py   # Python strut plates vs the same (maintainer only)
```

## Layout

```
freecad/    the model: build.py, lr4.py (measured placements), hardware.py, bom.py, checks, export, CAM
  fclib/    shared FreeCAD helpers (vendored copy)
web/        the pages: index.html (configurator), viewer.html, js/
pipeline/   FreeCAD builds -> configurator data
tests/      node tests
tools/      run.py, serve.py, repo tools (sync_fclib, check_no_parts)
docs/       PLAN.md: settings, measurements and decisions behind the model
```

`parts/`, `build/`, `exports/` and `web/data/` are git-ignored. A pre-commit check (`tools/check_no_parts.py`)
stops STL, STEP, DXF and FCStd files from being committed.

## Credits

- **[V1 Engineering](https://www.v1e.com/)** designed the LowRider 4 and its parts. The machine
  sizing matches V1E's LowRider 4 calculator.
- **[Vector76](https://github.com/vector76)** wrote the [LR4 strut plate generator](https://vector76.github.io/Web_OpenSCAD_Customizer/strut_plate.html)
  (OpenSCAD) that the strut plate code follows.

### Built with Claude

Most of this repo was written with [Claude Code](https://claude.com/claude-code) (Anthropic), working with the
maintainer. That includes the FreeCAD scripts, the part placement solving, the configurator and its tests. The
maintainer checked the model against V1E's build photos and real measurements. [`CLAUDE.md`](CLAUDE.md) holds the
instructions Claude follows when working in this repo.

## License

The code in this repo is [MIT-licensed](LICENSE). The LowRider 4 design and its part files belong to V1 Engineering
and their other authors, and are not covered by this licence.
