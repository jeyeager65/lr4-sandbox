# LowRider4 - CAM for the two MDF strut plates, cut on the user's LowRider (FluidNC, Jackpot),
# with the fluidnc post (fclib/fluidnc_post.py). One bit: 1/8" single-flute upcut - the
# generator's 3.5 mm dogbones are sized for it.
#
# Run headless (CAM is slow - never in the GUI):  python tools/run.py freecad/cam.py
# Writes build/LowRider4-CAM.FCStd (open it to see/simulate the toolpaths) and
# exports/cam/StrutPlates_T1_eighth.gcode.
#
# Setup on the machine:
#   - Stock: 1/4" MDF (V1E: MDF or hardboard, not ply), at least STOCK_W x STOCK_L below, laid
#     with its long side along the table (Y) - the plates are longer than the X travel.
#   - Zero: X0 Y0 = the stock's front-left corner, Z0 = top of the stock (touch plate probe at
#     PROBE_XY, an uncut corner). Screw the stock down outside the plates (big-head screws),
#     not inside the outlines.
#   - Order: all bolt holes first (V1E: "drill all the holes first"), then each outline with
#     tabs. Cuts 0.25 mm into the spoil board.
#
# Goldens for the page's JS CAM (tests/test_strut_cam.js): LR4_STRUT=<mm> LR4_CAM_OUT=<file.gcode> cuts that strut
# length instead of build.py's and writes only that file (no FCStd).

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the repo (this script is in freecad/)
NAME = "LowRider4"
LIB = HERE                                        # fclib is vendored in freecad/fclib (tools/sync_fclib.py)
for p in (LIB, HERE):
    if p not in sys.path:
        sys.path.insert(0, p)
import fclib  # noqa: E402
fclib.reload()
import FreeCAD as App                             # noqa: E402
from fclib import cam, core                       # noqa: E402
import lr4                                        # noqa: E402
importlib.reload(lr4)

V = App.Vector
B = {"__file__": os.path.join(HERE, "build.py"), "__name__": "lr4_params"}
# parameters shared with build.py (read only the parameter block - no model build)
src = open(B["__file__"], encoding="utf-8").read()
block = src.split("# ---- parameters", 1)[1].split("# ----------", 1)[0]
exec("IN = 25.4\n" + "\n".join(l for l in block.splitlines()[1:]), B)

# ---- parameters ----------------------------------------------------------------------------
T = B["STRUT_T"]       # stock thickness (1/4" MDF) - MEASURE YOURS, then set STRUT_T in build.py
THROUGH = 0.25         # cut this far into the spoil board (V1E: at least 0.2)
MARGIN = 12.0          # stock edge to plate
GAP = 12.0             # between the plates (> 2 bit diameters)
BIT = dict(Diameter=3.175, Flutes=1, CuttingEdgeHeight=12.0, Length=38.0)   # 1/8" 1F upcut - MEASURE
FEED, PLUNGE = 15.0, 3.0      # mm/s: user's 1/8" 1-flute feed (maple, 2026-10-14) - fine for MDF
STEP = 2.0             # stepdown, mm (user's 1/8" setting)
RPM = 18000            # Kobalt dial 3 -> ~0.05 mm/tooth at 15 mm/s
TAB_W, TAB_H = 6.0, 1.5    # holding tabs, mm
PLATE = 0.5            # touch plate thickness (user's), None = zero Z by hand
PROBE_XY = (MARGIN / 2, MARGIN / 2)      # probe on the uncut margin corner
ROUTER = "kobalt"
# -----------------------------------------------------------------------------------------

core.set_units("mm")
GOLDEN = os.environ.get("LR4_CAM_OUT")
strut = lr4.calculator(B["CUT_X_IN"] * 25.4, B["CUT_Y_IN"] * 25.4, B["XZ_PLATE"])["strut"]
if os.environ.get("LR4_STRUT"):
    strut = float(os.environ["LR4_STRUT"])
faces = lr4.plate_faces(strut, B["WING"], B["DOGBONE"])

# lay the plates along Y (length) side by side in X; SCAD (x, y) -> stock (X, Y) = (y, x) turned
solids, x = {}, MARGIN
for name in ("front", "bottom"):
    f = faces[name].copy()
    f.rotate(V(0, 0, 0), V(0, 0, 1), 90)              # SCAD x (length) -> +Y, SCAD y -> -X
    bb = f.BoundBox
    f.translate(V(x - bb.XMin, MARGIN - bb.YMin, 0))
    solids[name] = f.extrude(V(0, 0, -T))
    x += bb.XLength + GAP
STOCK_W, STOCK_L = x - GAP + MARGIN, strut + 2 * MARGIN
print(f"stock {STOCK_W:.0f} x {STOCK_L:.0f} mm ({STOCK_W / 25.4:.2f} x {STOCK_L / 25.4:.2f} in), T {T} mm")

doc = core.fresh_document(f"{NAME}_CAM")
objs = {n: cam.helper(doc, f"StrutPlate_{n.capitalize()}", s, visible=True) for n, s in solids.items()}
POST_ARGS = " ".join(a for a in (
    f"--plate={PLATE}" if PLATE is not None else "", f"--router={ROUTER}",
    f"--probe-xy={PROBE_XY[0]:g},{PROBE_XY[1]:g}",
    '--origin="stock front-left corner, just above the MDF"',
    '--probe-spot="the uncut margin corner"') if a)
job = cam.new_job(doc, list(objs.values()), post="fluidnc", args=POST_ARGS,
                  stock_box=(0, 0, -T, STOCK_W, STOCK_L, T))
tc = cam.add_tool(doc, job, 1, "1/8in 1-flute upcut", "endmill", BIT, rpm=RPM, feed=FEED, plunge=PLUNGE)


def short(op, name):
    if "Comment" in op.PropertiesList:
        op.Comment = name
    return op


final = -T - THROUGH
ops = []
for n, o in objs.items():
    clone = cam.clone_of(job, o)
    ops.append(short(cam.profile(job, tc, clone, cam.bottom_faces(clone, -T), 0.0, final, STEP, perimeter=False,
                                 holes=True, label=f"T1 {n} plate bolt holes"), f"{n.capitalize()} holes"))
for n, o in objs.items():
    clone = cam.clone_of(job, o)
    op = cam.profile(job, tc, clone, cam.bottom_faces(clone, -T), 0.0, final, STEP, side="Outside",
                     label=f"T1 {n} plate outline")
    ops.append(short(cam.tabs(job, op, TAB_W, TAB_H, label=f"T1 {n} plate outline + tabs"), f"{n.capitalize()} outline"))
doc.recompute()
for o in ops:
    print(f"{o.Label}: {len(o.Path.Commands)} commands")
cam.tidy_view(doc, job)
if not GOLDEN:
    doc.saveAs(os.path.join(ROOT, "build", f"{NAME}-CAM.FCStd"))

outdir = os.path.join(ROOT, "exports", "cam")
os.makedirs(outdir, exist_ok=True)
from fclib import fluidnc_post                    # noqa: E402 - the same post the GUI uses ("fluidnc")
fn = GOLDEN or os.path.join(outdir, "StrutPlates_T1_eighth.gcode")
gcode = fluidnc_post.export([tc] + ops, fn, f'{POST_ARGS} --title="{NAME} strut plates {strut:g} mm"')
mins = sum(fluidnc_post.op_minutes(o, tc) for o in ops)
print(f"T1 1/8in 1F upcut, dial {cam.router_dial(RPM, ROUTER)}: {len(gcode.splitlines())} lines, ~{mins:.0f} min "
      f"-> {fn}")
