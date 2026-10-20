# LowRider4 - V1 Engineering LowRider 4 CNC sized for a 26 x 50 in cutting area, on a flat
# MDF sheet table. Script-built assembly (the script owns the model):
#   - sizes from the LR4 calculator (calculator.py, matches V1E's)
#   - strut plates from Vector76's strut plate generator (ported in strut_plate.py), the real cut shapes
#   - every printed part is the V1E STL from Printables (parts/), placed by measured mating
#     features (lr4.py explains each), plus the Kobalt tool mount and the Jackpot3 box
#   - hardware (rails, steppers, MGN12, belts, bearings, switches, router) as simple solids
#
# Edit the parameters below and rebuild; don't edit build/LowRider4.FCStd by hand.
#   headless:  python tools/run.py freecad/build.py   (or tools\fcrun.ps1 freecad\build.py; also runs the checks)
#   in the GUI (MCP execute_code / Python console):
#     p = r"D:/GitHub/lr4-sandbox/freecad/build.py"; exec(open(p, encoding="utf-8").read(), {"__file__": p, "__name__": "__main__"})
# Writes build/LowRider4.FCStd, build/bom.md and exports/strut_plates_<strut>mm.(dxf|svg).
# STEP: export_step.py. Strut plate G-code: cam.py.
# Axes: X along the beam (YZ_Min side at the left), Y depth (front = 0), Z up (floor of the
# MDF sheet at 0). Units: mm inside; the cutting area and table are given in inches.

import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the repo (this script is in freecad/)
NAME = "LowRider4"     # the FreeCAD document / FCStd name (not the folder's)
LIB = HERE                                        # fclib is vendored in freecad/fclib (tools/sync_fclib.py)
for p in (LIB, HERE):
    if p not in sys.path:
        sys.path.insert(0, p)
import fclib  # noqa: E402
fclib.reload()
import FreeCAD as App                             # noqa: E402
import Part                                       # noqa: E402
import Mesh                                       # noqa: E402
from fclib import core, hw, mesh, wood            # noqa: E402
import lr4                                        # noqa: E402
importlib.reload(lr4)

core.set_units("mm")
V = App.Vector
IN = 25.4

# ---- parameters --------------------------------------------------------------------------
CUT_X_IN = 26.0        # usable cutting area along the beam (X) - user, 2026-10-17
CUT_Y_IN = 50.0        # usable cutting area along the table (Y) - user, 2026-10-17
XZ_PLATE = 6.5         # XZ plate thickness: V1E shop aluminium (calculator default) - GUESS
                       # which plates you'll use; 1/4" (6.35) if you cut your own
EMT_WALL = 1.45        # 1" EMT (29.5 mm OD) wall - nominal, MEASURE YOURS (OD matters most)
STRUT_T = 6.35         # strut plate stock: 1/4" MDF per V1E (no ply) - MEASURE YOURS
WING = 11.5            # generator front_wing_size: 11.5 for 29.5 mm (1" EMT) rails (V1E docs)
DOGBONE = 3.5          # generator dogbones: 3.5 for a 1/8" bit (V1E docs)
MDF_T = 0.75 * IN      # table: one MDF sheet, 3/4" - GUESS / MEASURE YOURS
TABLE_IN = None        # (width X, length Y) in inches; None = calculator footprint + margin,
TABLE_MARGIN_IN = 1.0  # rounded up to whole inches (V1E: 1-2" extra is nice per side... each dim)
# Where the machine is parked in the model (0..1 of the travel): tool X, tool Y, Z axis
X_POS, Y_POS, Z_POS = 0.5, 0.35, 0.3     # Z_POS 0 = carriages at the bottom of the MGN rails
JP3_SHIFT_X = -17.0   # ...and this far toward the Min end so the narrow hose holder on brace 2 clears the lid;
                      # less when the bay is short (lr4.jp3_shift: the lid clears the XZ_Min -> Brace_1 bolt ends)
PSU_BAY = 1           # bay (0 = Min end) where the power brick lies on the bottom strut plate
STRUTS = "mdf"        # "mdf" = the CNC-cut strut plates; "temp" = V1E's 4 printed Temp_Strut_v1 (what the machine
                      # runs on until it cuts its plates): the end braces move to 180 mm from the next (needs 4+ braces),
                      # the PSU lies on the Max-end bottom temp strut (GUESS). Size builds patch this line.
HARDWARE = True        # bolts, screws and nuts from the parts' holes (hardware.py, ~1-2 min)
THREADS = True         # model screw / leadscrew threads (revolved rings) and GT2 belt teeth - FCStd + STEP
PETER_PLATES = ("Min", "Max")   # Peter Plates covers (Printables 1044487) on these YZ plates; () = none (user 2026-10-19)
PETER_STYLE = "solid"  # "solid" (stepper openings filled) or "honeycomb" (open infill in a 4 mm border; print with no
                       # top / bottom layers - lets the steppers breathe). The web viewer shows both.
TOUCH_CLIP = False     # its alligator clip (Mueller BU-45) on the magnet - left out until there's a good model (user)
TOUCH_PLATE = True     # V1E Tiny Touch Plate stored in the top tool mount's slot, alligator clip on its pad (user)
JP3_FAN = True         # optional 5015 blower in the Jackpot3 lid (V1E shop, 24 V) - user 2026-10-19
JP3_FAN_OUTLET = (-1, 0, 0)   # which way its outlet points (of the two the lid holes allow): toward the Min end (user)
JP3_BOARD = True       # the Jackpot3 board itself (user's OBJ, ~550k triangles) on the box's four lugs
JP3_BOARD_FLIP = True  # turned 180 deg on its lugs (user 2026-10-19: stepper headers toward the box's low lip side)
JP3_BOARD_RECOLOUR = (((0.62, 0.62, 0.36), (0.10, 0.33, 0.72)),   # (OBJ colour, shown as): khaki PCB -> V1E blue,
                      ((0.29, 0.66, 0.33), (0.07, 0.07, 0.08)))   # green terminal plugs -> black (user photo 2026-10-19)
STEPPER_LEADS = 12.0   # mm of the 4 stepper leads drawn past their bushing (0 = none; real ones are 1 m)
Z_SHAFT = 24.0         # Z stepper shaft length from its face (V1E: 20 mm+; hw.nema17 default 24) - MEASURE YOURS
CHECK = None           # overlap checks (~10 min): None = only when run headless
# -----------------------------------------------------------------------------------------

CHECK = {"0": False, "1": True}.get(os.environ.get("LR4_CHECK", ""), CHECK)   # LR4_CHECK=0 skips it
CUT_X, CUT_Y = CUT_X_IN * IN, CUT_Y_IN * IN
calc = lr4.calculator(CUT_X, CUT_Y, XZ_PLATE)
calc_in = lr4.calculator_inches(CUT_X_IN, CUT_Y_IN, XZ_PLATE / IN)
strut = calc["strut"]
n_braces, pitch = lr4.braces(strut)
TEMP = STRUTS == "temp"
brace_off = lr4.brace_offsets(strut, n_braces, TEMP)   # brace i at X_s0 + brace_off[i] (even pitch; temp: 180 mm end bays)
xtable, ytable = calc["xtable"], calc["ytable"]
if TABLE_IN:
    TW, TL = TABLE_IN[0] * IN, TABLE_IN[1] * IN
else:
    TW = math.ceil(xtable / IN + 2 * TABLE_MARGIN_IN) * IN
    TL = math.ceil(ytable / IN + 2 * TABLE_MARGIN_IN) * IN
T = MDF_T                                       # table top
FX0, FY0 = (TW - xtable) / 2, (TL - ytable) / 2   # calculator footprint (belt holder outsides)
FX1, FY1 = FX0 + xtable, FY0 + ytable

# X layout: YZ plate outer faces 9 mm inside the footprint (xtable = strut + 2 t + 110, and
# each side is carriage top 46 + XZ plate t from the YZ outer face)
X_yz0 = FX0 + (xtable - (strut + 2 * (lr4.CARRIAGE_TOP + XZ_PLATE))) / 2
X_s0 = X_yz0 + lr4.CARRIAGE_TOP + XZ_PLATE      # strut plates start (Min end brace outer face)
X_yz1 = X_s0 + strut + XZ_PLATE + lr4.CARRIAGE_TOP   # YZ_Max outer face

# travel and the moving frames
tool_x = X_s0 + strut / 2 + (X_POS - 0.5) * CUT_X
tool_y = FY0 + (ytable - CUT_Y) / 2 + Y_POS * CUT_Y
b = lr4.B_RANGE[1] - Z_POS * (lr4.B_RANGE[1] - lr4.B_RANGE[0])
Zm = T + lr4.WHEEL_BOTTOM_PY - b                # D origin height (Min wheels on the table)
Ym = tool_y - lr4.ROUTER_AXIS_D
tube_h = 163.0 - lr4.CLIP_TUBE[0]                 # Y rail axis above the table (Y_Clip): 20.77
Z_tube = T + tube_h
X_tube = X_yz1 - lr4.TUBE_PZ_MAX
bmax = Zm + lr4.TUBE_PY_MAX - Z_tube            # Max plate: D y = py - bmax
tip_z = Zm + lr4.KOBALT_Z_IN_D + lr4.ROUTER["tip_z"]


import time as _time                              # noqa: E402 - per-stage timings in the report
_t0 = _t1 = _time.time()


def stage(name):
    """Print how long the stage that just ended took (build/*.log: grep "[time]")."""
    global _t1
    now = _time.time()
    print(f"[time] {name}: {now - _t1:.1f} s (total {now - _t0:.0f} s)", flush=True)
    _t1 = now


def D(dx, dy):
    """D frame (XZ_Min DXF) -> machine (Y, Z)."""
    return Ym + dx, Zm + dy


F = mesh.frame
pl_yz_min = F(((0, 0, 1), (-1, 0, 0), (0, -1, 0)), (X_yz0, Ym + lr4.YZ_X0, Zm + b))
pl_yz_max = F(((0, 0, -1), (-1, 0, 0), (0, 1, 0)), (X_yz1, Ym + lr4.YZ_X0, Zm - bmax))
pl_core = F(((0, 0, 1), (-1, 0, 0), (0, -1, 0)), (tool_x - lr4.KOBALT_IN_CORE[2], Ym + lr4.CORE_TO_D[0],
                                                  Zm + lr4.CORE_TO_D[1]))
pl_kobalt = pl_core.multiply(F(((1, 0, 0), (0, 0, -1), (0, 1, 0)), lr4.KOBALT_IN_CORE))
ROWS_BRACE = ((0, 0, -1), (-1, 0, 0), (0, 1, 0))
ROWS_BRACE_MAX = ((0, 0, 1), (-1, 0, 0), (0, -1, 0))
ROWS_HOLDER = ((0, 1, 0), (-1, 0, 0), (0, 0, 1))   # belt holders: print z up, print y -> X


def brace_x(i):
    return X_s0 + brace_off[i]                            # brace i occupies X brace_x(i) .. + 18


# ---- colours ------------------------------------------------------------------------------
PRINT_MAIN = (0.16, 0.16, 0.18)        # printed parts, main colour (black PLA in the docs)
PRINT_ACCENT = (0.80, 0.12, 0.10)      # printed accents (V1E red)
MDF = (0.55, 0.42, 0.30)
MDF_TABLE = (0.78, 0.66, 0.50)
ROUTER_HEAD = (0.13, 0.33, 0.80)       # Kobalt blue head; brush caps / button / switch / dial / cord black
ROUTER_CAP = (0.07, 0.07, 0.08)
ROUTER_DIAL = (0.07, 0.07, 0.08)
LR4 = os.path.join(lr4.PARTS, "lr4")
KOB = os.path.join(lr4.PARTS, "kobalt")
JP3 = os.path.join(lr4.PARTS, "jackpot3")

m = core.Model(NAME)
printed = []          # (part file, qty) for the BOM
threads = []          # threaded stretches the web viewer draws as a texture (hardware.py adds the fasteners')
hw_extra = dict(x_idlers=[], loops=[])   # placements hardware.py needs (tilted X drive, belt loop screws)
belt_runs = []        # straight belt runs: the viewer extends them over the travel and clips them at the gantry
T_X = (-X_POS * CUT_X_IN * IN, (1 - X_POS) * CUT_X_IN * IN)      # travel from the parked pose (mm)
T_Y = (-Y_POS * CUT_Y_IN * IN, (1 - Y_POS) * CUT_Y_IN * IN)


def stl(name, file, pl, group, colour=PRINT_MAIN, folder=LR4, count=True):
    m.add_mesh(name, mesh.load(os.path.join(folder, file + ".stl")), pl, group=group, colour=colour)
    if count:
        printed.append(file)


stage("setup")
# ---- table --------------------------------------------------------------------------------
m.add("TableMDF", core.box(0, TW, 0, TL, 0, T), group="Table", colour=MDF_TABLE,
      cut=wood.sheet(t=T / IN, w=TW / IN, l=TL / IN, note="table top / spoil board"))

stage("table")
# ---- YZ assemblies -------------------------------------------------------------------------
stl("YZ_Plate_Min", "YZ_Plate_Min_V1", pl_yz_min, "YZ_Min")
stl("YZ_Plate_Max", "YZ_Plate_Max_V1", pl_yz_max, "YZ_Max", PRINT_MAIN)
for w, (rows, off) in lr4.WHEELS.items():
    plate = pl_yz_min if w.endswith("Min") else pl_yz_max
    stl(w, w, plate.multiply(F(rows, off)), "YZ_" + w.split("_")[1], PRINT_ACCENT)
for z, off in lr4.ZSTOPS.items():
    plate = pl_yz_min if z.endswith("Min") else pl_yz_max
    stl(z, z, plate.multiply(F(lr4.ident(), off)), "YZ_" + z.split("_")[1], PRINT_ACCENT)

# Peter Plates: fancy covers on the YZ plates' outer faces (lr4.PETER_IN_YZ; Max side mirrored, as the designer says).
# User 2026-10-19: no stepper cut-outs (filled), and a honeycomb option (open infill inside a solid border).
# PETER_STYLE goes in the model; the other style is saved to build/peter_alt for the web viewer's switch.
if PETER_PLATES:
    import shutil as _sh
    peter_stl = os.path.join(lr4.PARTS, "peter", "PeterPlates_w_locations.stl")   # ~55 s to make: cached in build/cache
    variants = core.cached(os.path.join(ROOT, "build", "cache"), "peter_variants", lr4.peter_variants, peter_stl,
                           files=[peter_stl])
    alt_dir = os.path.join(ROOT, "build", "peter_alt")
    _sh.rmtree(alt_dir, ignore_errors=True)
    os.makedirs(alt_dir)
    for side in PETER_PLATES:
        pl_side = pl_yz_min if side == "Min" else pl_yz_max
        for tag in ("T", "B"):
            shapes = {}
            for style in ("solid", "honeycomb"):
                v = variants[tag][style]
                mx = App.Matrix(*lr4.PETER_IN_YZ, 0, 0, 0, 1)
                if style == "solid":                                  # the designer's mesh (+ fills)
                    mm = Mesh.Mesh(v)
                    mm.transform(mx)
                    if side == "Max":                                 # mirror in print y (py -> 300 - py)
                        mm.transform(App.Matrix(1, 0, 0, 0, 0, -1, 0, 300.0, 0, 0, 1, 0, 0, 0, 0, 1))
                        mm.flipNormals()
                    shapes[style] = mm
                else:                                                 # B-rep honeycomb
                    sh = v.copy()
                    sh.transformShape(mx)
                    if side == "Max":
                        sh = sh.mirror(V(0, 150.0, 0), V(0, 1, 0))
                    shapes[style] = sh
            name = f"PeterPlate_{tag}_{side}"
            main = shapes[PETER_STYLE]
            if PETER_STYLE == "solid":
                m.add_mesh(name, main, pl_side, group=f"YZ_{side}", colour=PRINT_ACCENT)
            else:
                main = main.copy()
                main.transformShape(pl_side.toMatrix())
                m.add(name, main, group=f"YZ_{side}", colour=PRINT_ACCENT)
            other = "honeycomb" if PETER_STYLE == "solid" else "solid"
            alt = shapes[other]
            altm = Mesh.Mesh(alt.tessellate(0.05)) if other == "honeycomb" else Mesh.Mesh(alt)
            altm.transform(pl_side.toMatrix())
            altm.write(os.path.join(alt_dir, f"{name}~{other}.stl"))
            printed.append(f"PeterPlate{tag}" + (" (mirrored)" if side == "Max" else ""))

# XZ plates: the DXFs extruded (aluminium), on the MGN12H carriages
xz = {}
for side, fn in (("Min", "XZ_Min_DXF_V1.dxf"), ("Max", "XZ_Max_DXF.dxf")):
    doc_tmp = App.newDocument("lr4_dxf_tmp")
    import Import
    Import.readDXF(os.path.join(LR4, fn), doc_tmp.Name)
    edges = [e for o in doc_tmp.Objects if hasattr(o, "Shape") for e in o.Shape.Edges]
    for e in edges:                                    # V1E's DXFs miss by 3e-7 mm at a few joints: without this
        e.fixTolerance(1e-4)                           # the ~19 x 22 mm cutout's wire stays open and is dropped
    App.closeDocument(doc_tmp.Name)
    wires = sorted((Part.Wire(g) for g in Part.sortEdges(edges)), key=lambda w: -Part.Face(w).Area if w.isClosed() else 0)
    face = Part.makeFace([w for w in wires if w.isClosed()], "Part::FaceMakerBullseye")
    sol = face.extrude(V(0, 0, XZ_PLATE if side == "Min" else -XZ_PLATE))
    x0 = X_yz0 + lr4.CARRIAGE_TOP if side == "Min" else X_yz1 - lr4.CARRIAGE_TOP
    sol.Placement = F(((0, 0, 1), (1, 0, 0), (0, 1, 0)), (x0, Ym, Zm))
    xz[side] = sol
    m.add(f"XZ_Plate_{side}", sol, group=f"YZ_{side}", colour=hw.ALUMINIUM)

# MGN12 rails + carriages (Max plate rails are mirrored in print y: py -> 300 - py)
for side, plate, blocks in (("Min", pl_yz_min, lr4.BLOCKS_MIN), ("Max", pl_yz_max, lr4.BLOCKS_MAX)):
    for px, (y0, y1) in lr4.MGN_RAILS.items():
        ya, yb = (y0, y1) if side == "Min" else (300 - y1, 300 - y0)
        rail = hw.mgn12_rail(yb - ya, plate.multiply(F(((0, -1, 0), (1, 0, 0), (0, 0, 1)), (px, ya, 33.0))), holes=True)
        m.add(f"MGN12_Rail_{side}_{int(px)}", rail, group=f"YZ_{side}", colour=hw.STEEL)
        cy = (b - blocks[px]) if side == "Min" else (bmax + blocks[px])        # carriage centre py
        blk = hw.mgn12h_block(plate.multiply(F(((0, -1, 0), (1, 0, 0), (0, 0, 1)), (px, cy, 33.0))))
        m.add(f"MGN12H_{side}_{int(px)}", blk, group=f"YZ_{side}", colour=hw.STEEL)

# steppers, couplers, leadscrews, Y pulleys and idlers (YZ plate print coords, Max mirrored)
def add_stepper(name, pl, group, **kw):
    """hw.nema17 in its coloured parts (user 2026-10-19: 84 oz-in, StepperOnline 17HS19-2004S1 style): the body
    keeps the motor's name (joints, checks), the rest are <name>_Face / _Shaft / _Screws / _Plug /
    _Lead_Red ... (STEPPER_LEADS / lead_deg: where the leads come out)."""
    for k, sh in hw.nema17(pl, parts=True, leads=STEPPER_LEADS, **kw).items():
        nm = name if k == "body" else name + "_" + "_".join(w.capitalize() for w in k.split("_"))
        m.add(nm, sh, group=group, colour=hw.NEMA17_COLOURS[k])


for side, plate in (("Min", pl_yz_min), ("Max", pl_yz_max)):
    s = 1 if side == "Min" else -1          # print y direction of "down" on this plate
    my = (lambda y: y) if side == "Min" else (lambda y: 300 - y)
    up = (0, -s, 0)                          # machine up, in plate print coords
    # Z stepper face on the plate's mounting wall's underside (2026-10-19: the fastener check found the motor
    # 3.8 mm up inside the 6.0 mm wall its M3s go through; was 173.85)
    zface = my(177.67)
    add_stepper(f"Z_Stepper_{side}", plate.multiply(hw.along((lr4.LEADSCREW_PX, zface, lr4.LEADSCREW_PZ), up)),
                f"YZ_{side}", shaft=Z_SHAFT)
    # 5-8 mm helical coupler (D19 x 25) centred on the joint: the leadscrew sits on the 24 mm motor shaft's end
    # (V1E yzz6a: "fully seated and touching the stepper shaft"), 2 set screws per hub (2026-10-19: was a plain
    # cylinder on the motor boss with the leadscrew starting 10 mm down inside the shaft)
    cp = hw.helical_coupler(plate.multiply(hw.along((lr4.LEADSCREW_PX, zface - s * (Z_SHAFT - 12.5), lr4.LEADSCREW_PZ), up)))
    m.add(f"Z_Coupler_{side}", cp["body"], group=f"YZ_{side}", colour=hw.ALUMINIUM)
    m.add(f"Z_Coupler_{side}__grubs", cp["grubs"], group="Hardware", colour=hw.BLACK)
    p0 = plate.multVec(V(lr4.LEADSCREW_PX, zface - s * Z_SHAFT, lr4.LEADSCREW_PZ))
    m.add(f"Z_Leadscrew_{side}", hw.leadscrew_t8(150.0, hw.along(tuple(p0), (0, 0, 1)), thread=THREADS),
          group=f"YZ_{side}", colour=hw.STEEL)                   # T8: 4 starts, 2 mm pitch (thread drawn as rings)
    threads.append(dict(obj=f"Z_Leadscrew_{side}", p=tuple(p0), d=(0, 0, 1), t0=0.0, t1=150.0, pitch=2.0, starts=4,
                        r_major=4.0, r_minor=3.0))
    # Y stepper face on the wall's top (shaft points down to the belt; 2026-10-19: was 202.1, 2.3 mm inside it)
    yface = my(199.77)
    add_stepper(f"Y_Stepper_{side}", plate.multiply(hw.along((lr4.YSTEP_PX, yface, lr4.YSTEP_PZ), (0, s, 0))),
                f"YZ_{side}")
    m.add(f"Y_Pulley_{side}", hw.gt2_pulley(plate.multiply(hw.along((lr4.YSTEP_PX, my(lr4.Y_BELT_PY), lr4.YSTEP_PZ),
                                                                     (0, s, 0))), bore=5.0), group=f"YZ_{side}", colour=hw.ALUMINIUM)
    for k, px in enumerate(lr4.Y_IDLER_PX):
        m.add(f"Y_Idler_{side}_{k + 1}", hw.gt2_idler(plate.multiply(hw.along((px, my(lr4.Y_BELT_PY), 5.0), (0, s, 0))), bore=5.0),
              group=f"YZ_{side}", colour=hw.ALUMINIUM)

# Z stubs + Z nuts on the XZ plates, around the leadscrews (option "i": stub hangs from the
# XZ plate's two top M5 holes, nut pocket on the leadscrew)
lead_x = {"Min": X_yz0 + lr4.LEADSCREW_PZ, "Max": X_yz1 - lr4.LEADSCREW_PZ}
lead_y = Ym + lr4.YZ_X0 - lr4.LEADSCREW_PX
pl_stub = {"Min": F(((0, 0, -1), (1, 0, 0), (0, -1, 0)), (X_yz0 + lr4.CARRIAGE_TOP, Ym - 105.0, Zm + 279.7)),
           "Max": F(((0, 0, 1), (1, 0, 0), (0, 1, 0)), (X_yz1 - lr4.CARRIAGE_TOP, Ym - 105.0, Zm + 15.7))}
for side in ("Min", "Max"):                     # right way up: turned about the plate's top M5 pair
    pv = V(0, Ym + lr4.STUB_PIVOT_D[0], Zm + lr4.STUB_PIVOT_D[1] + (36.0 if side == "Max" else 0.0))
    flip = App.Placement(pv, App.Rotation(V(1, 0, 0), 180)).multiply(App.Placement(-pv, App.Rotation()))
    pl_stub[side] = flip.multiply(pl_stub[side])
    stl(f"Z_Stub_{side}", f"Z_Stub_{side}", pl_stub[side], f"YZ_{side}", PRINT_ACCENT)
    pl_nut = pl_stub[side].multiply(F(*lr4.Z_NUT_IN_STUB[side]))
    stl(f"Z_Nut_{side}", "Z_Nut", pl_nut, f"YZ_{side}", PRINT_ACCENT)
    # flanged T8 brass nut: flange UNDER the Z_Nut (its M3 holes are blind and open downward; V1E yzz7: "thread
    # this on to the leadscrew brass face down"), body up in the Z_Nut's 10.2 bore; 2 M3 hold it (hardware.py)
    z_face = min(h["p0"].z for h in mesh.find_holes(m.shape(f"Z_Nut_{side}"), 2.75, 3.2))
    m.add(f"Z_BrassNut_{side}", hw.t8_nut(hw.along((lead_x[side], lead_y, z_face), (0, 0, -1))),
          group=f"YZ_{side}", colour=hw.BRASS)

# wheel bearings (608 on M8). Min wheels: one bearing each, axle along X. Max wheels ride the
# Y rail on two bearings at +-45 deg (approximate positions)
for w in ("FrontWheel_Min", "BackWheel_Min"):
    rows, off = lr4.WHEELS[w]
    ax = 131.0 if w.startswith("Front") else 183.0
    pl = pl_yz_min.multiply(F(rows, off))
    c, c2 = pl.multVec(V(ax, 150, 11)), pl.multVec(V(ax, 151, 11))
    m.add(f"Bearing_{w}", hw.bearing608(hw.along(c, c2 - c)), group="YZ_Min", colour=hw.STEEL)
for w in ("FrontWheel_Max", "BackWheel_Max"):          # on the wheels' own M8 holes (lr4.MAX_WHEEL_BEARINGS)
    pl = pl_yz_max.multiply(F(*lr4.WHEELS[w]))
    for k, (off, ax) in enumerate(lr4.MAX_WHEEL_BEARINGS[w]):
        c = pl.multVec(V(*off))
        m.add(f"Bearing_{w}_{k + 1}", hw.bearing608(hw.along(c, pl.multVec(V(*off) + V(*ax)) - c)), group="YZ_Max",
              colour=hw.STEEL)

stage("YZ assemblies")
# ---- beam -----------------------------------------------------------------------------------
for i in range(n_braces):
    if i == n_braces - 1:
        pl = F(ROWS_BRACE_MAX, (brace_x(i), Ym + lr4.BRACEMAX_TO_D[0], Zm + lr4.BRACEMAX_TO_D[1]))
        stl("Brace_Max", "Brace_Max_29p5", pl, "Beam")
    else:
        pl = F(ROWS_BRACE, (brace_x(i) + lr4.BRACE_T, Ym + lr4.BRACE_TO_D[0], Zm + lr4.BRACE_TO_D[1]))
        stl(f"Brace_{i + 1}", "Brace_29p5", pl, "Beam")
for nm, (dx, dy) in (("X_Rail_Lower", lr4.RAIL_A), ("X_Rail_Upper", lr4.RAIL_B)):
    y, z = D(dx, dy)
    m.add(nm, hw.tube(29.5, EMT_WALL, (X_s0 + 1.5, y, z), (X_s0 + strut - 1.5, y, z)), group="Beam",
          colour=hw.STEEL)

# strut plates from the generator (strut_plate.py); DXF + SVG as the web page's download (mm)
os.makedirs(os.path.join(ROOT, "exports"), exist_ok=True)
plates = lr4.plate_faces(strut, WING, DOGBONE, out_base=os.path.join(ROOT, "exports", f"strut_plates_{strut}mm"))
(p0y, p0z), (dby, dbz) = lr4.FRONT_FACE
oy, oz = D(lr4.BRACE_TO_D[0] - p0y, p0z + lr4.BRACE_TO_D[1])
dY, dZ = -dby, dbz                                   # up the face, in machine (Y, Z)
nY, nZ = -dZ, dY                                     # outward (front) normal = X x d
oy, oz = oy + 0.2 * nY, oz + 0.2 * nZ                # 0.2 mm off the fitted face (fit noise ~0.17)
front = plates["front"].extrude(V(0, 0, STRUT_T))
front.Placement = App.Placement(App.Matrix(1, 0, 0, X_s0, 0, dY, nY, oy, 0, dZ, nZ, oz, 0, 0, 0, 1))
bottom = plates["bottom"].extrude(V(0, 0, STRUT_T))
bottom_y0 = Ym + lr4.BRACE_TO_D[0] - (lr4.BOTTOM_SEAT[1] + 67.5)      # plate edge at bx 155.75
bottom_z0 = Zm + lr4.BOTTOM_SEAT[0] + lr4.BRACE_TO_D[1]
bottom.Placement = App.Placement(V(X_s0, bottom_y0, bottom_z0), App.Rotation())
if not TEMP:
    m.add("StrutPlate_Front", front, group="Beam", colour=MDF,
          cut=wood.sheet(t=STRUT_T / IN, note="1/4in MDF - CNC cut, see exports/cam"))
    m.add("StrutPlate_Bottom", bottom, group="Beam", colour=MDF,
          cut=wood.sheet(t=STRUT_T / IN, note="1/4in MDF - CNC cut, see exports/cam"))
else:                                            # the 4 temp struts in the plates' own 2D frames (lr4.TEMP_STRUT_FRAMES)
    for which, plate in (("front", front), ("bottom", bottom)):
        for end in ("Min", "Max"):
            pl_ts = plate.Placement.multiply(F(*lr4.temp_strut_frame(which, end, strut)))
            stl(f"Temp_Strut_{which.title()}_{end}", "Temp_Strut_v1", pl_ts, "Beam", PRINT_ACCENT)
            # its 4 holes from the STL frame: the front ones lean with the face, where find_holes (axis-aligned
            # sections) can't see them
            hw_extra.setdefault("holes", {})[f"Temp_Strut_{which.title()}_{end}"] = [
                dict(p0=pl_ts.multVec(V(x, y, 0)), p1=pl_ts.multVec(V(x, y, lr4.TEMP_STRUT_T)), d=5.3)
                for x, y in lr4.TEMP_STRUT_HOLES]
plate_t = lr4.TEMP_STRUT_T if TEMP else STRUT_T  # what the box / PSU lie on

# X belt tensioner on the Max end, X belt along the front of the front strut plate
xb_y, xb_z = D(*lr4.XBELT_D)
xb_x = X_s0 + strut - lr4.BRACE_T              # Brace_Max's inner face (its lug carries the M5 nut)
# X belt tensioner (user photo xb4, 2026-10-18): block in the front strut plate's end notch, M5 tension screw from
# its -X face into the nut in Brace_Max's lug, its thin tongue riding on top of the lug; the belt enters the
# 2.1 mm slot on the -X face and loops round an M3 in the pocket behind it. Turned 180 deg about Y (through the
# screw axis) from the old placement, `lr4.XBELT_TENSION_SHIFT` along X (the screw's adjustment travel)
pl_xb = F(((0, 0, -1), (-1, 0, 0), (0, 1, 0)), (xb_x, xb_y + 155.9, xb_z - 151.2))
xb_pivot = V(xb_x - 6.0, xb_y, xb_z)
pl_xb = App.Placement(V(lr4.XBELT_TENSION_SHIFT, 0, 0), App.Rotation()).multiply(
    App.Placement(xb_pivot, App.Rotation(V(0, 1, 0), 180)).multiply(App.Placement(-xb_pivot, App.Rotation()))).multiply(pl_xb)
stl("X_Belt", "X_Belt", pl_xb, "Beam", PRINT_ACCENT)
belt_y = Ym + lr4.XBELT_Y_D                     # tensioner end of the X belt
x_belt_ends = ((X_s0 - XZ_PLATE / 2, *D(*lr4.XBELT_SLOT_D)),       # M3 loops: XZ_Min slot, tensioner pocket
               (xb_x - 6.0 + lr4.XBELT_TENSION_SHIFT, belt_y, xb_z))

# hose holders: their tab drops into the slot in each brace's back bar (V1E photos: holders on the
# back of the braces, cradles behind the beam). The cradles reach +X from the brace (handed parts).
slot_y, slot_z = D(lr4.BRACE_TO_D[0] - lr4.HOSE_SLOT[0], lr4.HOSE_SLOT[1] + lr4.BRACE_TO_D[1])
ROWS_HOOK = ((0, 0, 1), (1, 0, 0), (0, 1, 0))      # print z -> X, x -> back (+Y), y -> up


def hose_turn(i):
    """180 deg about the vertical axis through brace i's slot (user, 2026-10-17: the hooks were
    backwards); the tab stays in the slot."""
    return App.Placement(V(0, 0, 0), App.Rotation(V(0, 0, 1), 180),
                         V(brace_x(i) + lr4.BRACE_T / 2, slot_y, 0))


def hose(name, file, i):
    tx, ty, tz = lr4.HOSE_TABS[file]
    pl = F(ROWS_HOOK, (brace_x(i) + lr4.BRACE_T / 2 - tz, slot_y - tx, slot_z - ty))
    pl = hose_turn(i).multiply(pl)
    if file == "Hose_Hook_70":                     # upside down (user, 2026-10-17): about the front-back axis
        c = V(brace_x(i) + lr4.BRACE_T / 2, 0, slot_z)
        pl = App.Placement(c, App.Rotation(V(0, 1, 0), 180)).multiply(App.Placement(-c, App.Rotation())).multiply(pl)
    dy, dz = lr4.HOOK70_REST if file == "Hose_Hook_70" else lr4.HOSE_REST
    stl(name, file, App.Placement(V(0, dy, dz), App.Rotation()).multiply(pl), "Beam", PRINT_ACCENT)


# user, 2026-10-17: wide = Hose_Holder_Hook, medium = hose_holder_shorty, short = Hose_Hook_70.
# Seen from the back, left (Max end) to right (Min end): wide, wide, medium, short, medium.
HOSE_ORDER = ("Hose_Holder_Hook", "Hose_Holder_Hook", "hose_holder_shorty", "Hose_Hook_70", "hose_holder_shorty")
HOSE_NAMES = {"Hose_Holder_Hook": "Hose_Holder_Hook", "hose_holder_shorty": "Hose_Holder_Shorty",
              "Hose_Hook_70": "Hose_Hook_70"}
counts = {}
for i in range(n_braces):
    file = HOSE_ORDER[n_braces - 1 - i] if n_braces - 1 - i < len(HOSE_ORDER) else "hose_holder_shorty"
    counts[file] = counts.get(file, 0) + 1
    hose(f"{HOSE_NAMES[file]}_{counts[file]}", file, i)

stage("beam")
# ---- core + tool ----------------------------------------------------------------------------
stl("Core", "Core", pl_core, "Core", PRINT_MAIN)
for f in ("Tool_Mount_T_Kobalt", "Tool_Mount_B_Kobalt", "Dust_Shoe_Kobalt", "Dust_Skirt_Kobalt"):
    stl(f, f, pl_kobalt, "Core", PRINT_ACCENT if "Mount" in f else PRINT_MAIN, folder=KOB)
# router: Kobalt K7TR-03 (measured), axis on the mount bore centre, height and turn from the dust shoe's notch for
# its spindle lock button (user 2026-10-19; was a Makita-style guess with the cord facing -X)
rt = hw.kobalt_k7tr03(pl_kobalt.multiply(App.Placement(V(*lr4.ROUTER_AXIS_IN_KOBALT, lr4.ROUTER["nut_z"]), App.Rotation())),
                      switch_deg=lr4.ROUTER["switch_deg"], button_deg=lr4.KOBALT_NOTCH["deg"] - lr4.ROUTER["switch_deg"],
                      cord_out=lr4.ROUTER["cord_out"],
                      bit=(3.175, lr4.ROUTER["bit_out"]))   # placed by the shoe's notch (lr4.KOBALT_NOTCH)
for k, nm, col in (("body", "Router_Kobalt", hw.ALUMINIUM), ("head", "Router_Head", ROUTER_HEAD),   # aluminium motor housing
                   ("cap", "Router_Cap", ROUTER_CAP), ("dial", "Router_Dial", ROUTER_DIAL),
                   ("switch", "Router_Switch", ROUTER_CAP), ("cord", "Router_Cord", ROUTER_CAP),
                   ("nut", "Router_Nut", ROUTER_CAP), ("bit", "Router_Bit", hw.STEEL)):
    m.add(nm, rt[k], group="Core", colour=col)
# Tiny Touch Plate in the top mount's slot (lr4.TOUCH_SLOT / TOUCH_STORE): plate in the slot's mid-plane, strip
# centred in it, pad down beside the bottom mount, spade up above the top mount; the clip bites the strip's front
# edge between the mounts (V1E: store them touching)
if TOUCH_PLATE:
    ts = lr4.TOUCH_SLOT
    (mx, my), (cx, cy) = ts["mouth"], ts["closed"]
    u = V(mx - cx, my - cy, 0)
    u.normalize()
    nrm = V(0, 0, 1).cross(u)
    k = (ts["strip_x"] - cx) / (mx - cx)
    tst, pad = lr4.TOUCH_STORE, lr4.TOUCH_PLATE["pad"]
    org = V(cx + k * (mx - cx), cy + k * (my - cy), tst["pad_z"] + pad)      # the pad's top edge
    # hw frame: pad up from z 0, x across the strip; flipped (x -> -x, z -> -z) so the pad hangs down and the
    # frame's -x edge faces the slot's mouth (u, the front)
    tpl = pl_kobalt.multiply(App.Placement(App.Matrix(-u.x, nrm.x, 0, org.x, -u.y, nrm.y, 0, org.y, 0, 0, -1, org.z,
                                                      0, 0, 0, 1)))
    tp = hw.tiny_touch_plate(tpl, clip=False, wire=8.0, **lr4.TOUCH_PLATE)
    for k_, nm in (("plate", "TouchPlate"), ("spade", "TouchPlate_Spade"), ("wire_plate", "TouchPlate_Wire")):
        m.add(nm, tp[k_], group="Core", colour=hw.TOUCH_PLATE_COLOURS[k_])
    # rod magnet end-on on the +X top-mount bolt's head (it faces the front), the clip hanging from its outer end
    md, mt = tst["magnet"]
    bd_ = pl_kobalt.Rotation.multVec(V(*tst["bolt_d"]))   # into the core (+Y): the head is on the -d side
    hh = 0.55 * 5.0                                        # M5 button head height (hw.button_screw)
    mc = pl_kobalt.multVec(V(*tst["bolt"])) - bd_ * hh     # rod's back end on the head's crown
    m.add("TouchPlate_Magnet", Part.makeCylinder(md / 2, mt, mc, bd_ * -1), group="Core", colour=hw.STEEL)
    cm = mc - bd_ * (mt - 4.5) - V(0, 0, md / 2)            # the rod's underside, 4.5 from its end: the bite edge
    ex, ez = bd_ * -1, V(0, 0, -1)                          # clip: edge along the rod, body hanging down
    ey = ez.cross(ex)
    cpl = App.Placement(App.Matrix(ex.x, ey.x, ez.x, cm.x, ex.y, ey.y, ez.y, cm.y, ex.z, ey.z, ez.z, cm.z, 0, 0, 0, 1))
    if TOUCH_CLIP:
        cl, cw = hw.alligator_clip(cpl, grip=md, bite=md, wire=3.0)
        m.add("TouchPlate_Clip", cl, group="Core", colour=hw.TOUCH_PLATE_COLOURS["clip"])
        m.add("TouchPlate_Clip_Wire", cw, group="Core", colour=hw.TOUCH_PLATE_COLOURS["wire_clip"])
# TPU bristle strips bent into the skirt's groove (lr4.SKIRT_GROOVE): spine up at the groove ceiling, one strip
# from each end of the gap, squeezed ~1.5 % so the two meet in the middle
sg = lr4.SKIRT_GROOVE
groove = lr4.skirt_groove(mesh.load(os.path.join(KOB, "Dust_Skirt_Kobalt.stl")))
glen = float(sum(math.dist(a, b) for a, b in zip(groove, groove[1:])))
flat = mesh.load(os.path.join(KOB, "TPU_Bristles_22mm.stl"))
for k in range(sg["strips"]):
    bent = mesh.bend_strip(flat, groove, along=(1, sg["strip_y0"]), height=(0, sg["strip_spine_x"], 1),
                           across=(2, sg["strip_t"] / 2), z0=sg["z_ceiling"], start=0.0 if k == 0 else glen,
                           scale=glen / sg["strips"] / sg["strip_len"], reverse=k == 1)
    m.add_mesh(f"Bristles_TPU_{k + 1}", bent, pl_kobalt, group="Core", colour=(0.22, 0.22, 0.24))
    printed.append("TPU_Bristles_22mm")
# X drive (lr4.X_AXIS_TILT: everything leans 7 deg in the core, square to the rail plane). Stepper face on its
# mounting block, body above, shaft down; pulley hub-down so its teeth share the idlers' belt plane
xn = V(*lr4.X_AXIS_TILT)
xn.normalize()
xc = V(*lr4.X_MOTOR_LINE)
x_on = lambda np_: xc + xn * (np_ - xn.dot(xc))                      # point on the stepper axis at n.p
add_stepper("X_Stepper", pl_core.multiply(hw.along(tuple(x_on(lr4.X_MOTOR_FACE)), tuple(xn))), "Core",
            lead_deg=270.0)          # leads toward the Min end (at the default 90 they ran into the router cord)
m.add("X_Pulley", hw.gt2_pulley(pl_core.multiply(hw.along(tuple(x_on(lr4.X_BELT_NP[1])), tuple(xn * -1))), bore=5.0),
      group="Core", colour=hw.ALUMINIUM)
ia, ib = lr4.X_IDLER_LINE
iy = (lr4.X_BELT_NP[0] - xn.x * ia) / (xn.x * ib + xn.y)                # idler axes at n.p = belt start
x_idlers = [V(ia + ib * iy, iy, cz) for cz in (11.45, 31.45)]
for k, p in enumerate(x_idlers):
    m.add(f"X_Idler_{k + 1}", hw.gt2_idler(pl_core.multiply(hw.along(tuple(p), tuple(xn))), bore=5.0), group="Core",
          colour=hw.ALUMINIUM)
    hw_extra["x_idlers"].append((f"X_Idler_{k + 1}", tuple(pl_core.multVec(p + xn * 5.0)), tuple(pl_core.Rotation.multVec(xn))))
hw_extra["x_stepper"] = pl_core.multiply(hw.along(tuple(x_on(lr4.X_MOTOR_FACE)), tuple(xn)))
# X belt in the drive's tilted plane: from its M3 loop in the XZ_Min plate's angled slot, along the back of the
# first idler, round the pulley (teeth in), round the second idler, to the X_Belt tensioner. Three parts: the
# wrap rides the core, the two runs stretch along X from their fixed ends (lr4.motion "stretch_x").
ez = pl_core.Rotation.multVec(xn * -1)                                # belt width direction (~up, leaning 7 deg)
ex = V(1, 0, 0)
ey = ez.cross(ex)
wheels = [pl_core.multVec(x_idlers[0] + xn * 5.0), pl_core.multVec(x_on(lr4.X_BELT_NP[1]) - xn * 5.0),
          pl_core.multVec(x_idlers[1] + xn * 5.0)]                     # belt-centre points: idler, pulley, idler
xo = wheels[0]
loc = lambda p: ((p - xo).dot(ex), (p - xo).dot(ey))
xpl = App.Placement(App.Matrix(ex.x, ey.x, ez.x, xo.x, ex.y, ey.y, ez.y, xo.y, ex.z, ey.z, ez.z, xo.z, 0, 0, 0, 1))
for nm, e in zip(("Min end (XZ_Min slot)", "Max end (tensioner)"), x_belt_ends):
    print(f"X belt {nm}: {(V(*e) - xo).dot(ez):+.2f} mm out of the drive's belt plane")
r_pul = 16 * 2.0 / math.pi / 2 - 0.25 + 0.7
xpts, _ = hw.belt_path(loc(V(*x_belt_ends[0])), [(loc(wheels[0]), 6.7, -1), (loc(wheels[1]), r_pul, 1),
                                                 (loc(wheels[2]), 6.7, -1)], loc(V(*x_belt_ends[1])))
# teeth toward the pulley (it is wrapped anticlockwise: +1 = left of the path), in step from the Min end
seg_len = lambda q: sum(math.dist(a, b) for a, b in zip(q, q[1:]))
xl = [seg_len(xpts[:2]), seg_len(xpts[1:-1]), seg_len(xpts[-2:])]
for nm, seg, ph in (("Min", xpts[:2], 0.0), ("Wrap", xpts[1:-1], xl[0]), ("Max", xpts[-2:], xl[0] + xl[1])):
    m.add(f"Belt_X_{nm}", hw.belt_band(seg, 0.0, plane=xpl, teeth=1 if THREADS else 0, phase=ph), group="Belts",
          colour=hw.BLACK)
x_belt_len = sum(xl)
mtx = list(xpl.toMatrix().A)
belt_runs += [dict(obj="Belt_X_Min", fixed=xpts[0], moving=xpts[1], z=0.0, plane=mtx, teeth=1, phase_fixed=0.0,
                   ext=T_X[1] + 5.0, axis="x"),
              dict(obj="Belt_X_Max", fixed=xpts[-1], moving=xpts[-2], z=0.0, plane=mtx, teeth=1,
                   phase_fixed=sum(xl), ext=-T_X[0] + 5.0, axis="x")]
# the belt ends loop round an M3 (xb1/xb2): in the XZ_Min plate's slot and in the tensioner's pocket, screw along
# the belt's width, head up
xw = ez * -1 if ez.z > 0 else ez
hw_extra["loops"] += [("X Min end", tuple(xpl.multVec(V(*xpts[0], 0))), tuple(xw), "XZ_Plate_Min slot"),
                      ("X Max end", tuple(xpl.multVec(V(*xpts[-1], 0))), tuple(xw), "X_Belt tensioner")]
print(f"X belt path, slot screw to tensioner (mm): {sum(math.dist(a, b) for a, b in zip(xpts, xpts[1:])):.1f}"
      f" - calculator X belt {calc['xbelt']}")
# core bearings: one in each of the core's 8 slots, on the M8 hole's own axis, centred in the slot
# (lr4.CORE_BEARING_LINES, core print coords; the M8 bolts follow the bearings)
for k, (tube, cp, ca) in enumerate(lr4.CORE_BEARING_LINES):
    c, ax = pl_core.multVec(V(*cp)), pl_core.Rotation.multVec(V(*ca))
    m.add(f"Bearing_Core_{tube}_{k + 1}", hw.bearing608(hw.along(c, ax)), group="Core", colour=hw.STEEL)

stage("core + tool")
# ---- Y axis on the table: belt holders, Y rail + clips, Y belts ----------------------------
holders = {"Min": (FX0 + 159.8, "Min"), "Max": (FX1 - 159.8, "Max")}
for side, (ox, _) in holders.items():
    for end, oy, extra in (("F", FY0 + 110.0, f"Y_Belt_{side}_Lock"), ("B", FY1 - 203.0, f"Y_Belt_{side}_Tension")):
        pl = F(ROWS_HOLDER, (ox, oy, T))
        stl(f"Y_Belt_{side}{end}", f"Y_Belt_{side}{end}", pl, "Table", PRINT_ACCENT)
        stl(extra, extra, pl, "Table", PRINT_MAIN)
y_rail0 = (FY0 + FY1 - calc["yrail"]) / 2
m.add("Y_Rail", hw.tube(29.5, EMT_WALL, (X_tube, y_rail0, Z_tube), (X_tube, y_rail0 + calc["yrail"], Z_tube)),
      group="Table", colour=hw.STEEL)
c0, c1 = FY0 + 51.1 + 13.0, FY1 - 44.0 - 13.0       # first/last clip next to the belt holders
n_clips = math.ceil((c1 - c0) / 300.0) + 1          # V1E: no more than 300 mm centre to centre
for k in range(n_clips):
    yc = c0 + (c1 - c0) * k / (n_clips - 1)
    stl(f"Y_Clip_{k + 1}", "Y_Clip_29p5", F(((0, 1, 0), (0, 0, -1), (-1, 0, 0)),
                                             (X_tube - lr4.CLIP_TUBE[1], yc + 10.0, T + 163.0)), "Table")
# Y belts (V1E docs + photos yzb1/yzb2, 2026-10-18): on edge along the YZ plate's outer face, from the
# front holder's lock slot over the back of the front idler, round the front + inboard side of the pulley
# (teeth in), diagonally (parallel to the pocket wall) round the front of the back idler, and out to the
# back holder. Smooth idlers ride the belt's back. Three parts: the wrap rides the gantry, the two straight
# runs stretch from their holder (lr4.motion).
belt_len = {}
for side, plate, bx in (("Min", pl_yz_min, FX0 + lr4.BELT_SLOT_IN), ("Max", pl_yz_max, FX1 - lr4.BELT_SLOT_IN)):
    s = 1 if side == "Min" else -1                # anticlockwise from above = +1; the Max side is mirrored
    my = (lambda y: y) if side == "Min" else (lambda y: 300 - y)
    belt_py = my(lr4.Y_BELT_PY) + s * 5.0         # belt centre (the belt runs 10 mm down from Y_BELT_PY)
    i1, i2 = (plate.multVec(V(px, belt_py, 5.0)) for px in lr4.Y_IDLER_PX)       # back, front idler
    pc = plate.multVec(V(lr4.YSTEP_PX, belt_py, lr4.YSTEP_PZ))
    r_idler = 6.0 + 0.7                           # belt back on the 12 OD smooth idler
    r_pulley = 16 * 2.0 / math.pi / 2 - 0.25 + 0.7    # band on hw.gt2_pulley's land (GT2 16T; teeth in its grooves)
    # the belt runs through the 2.2 mm slot in the lock (front) and tension block (back) and loops round an M3
    # just past each block's outer end (yb1/yb2/yb6: pulling the belt seats the screw on that face): the belt
    # band ends at the face (the wrap round the screw isn't modelled), the screws go 2.9 past it (belt + r 1.5)
    y_lock = m.shape(f"Y_Belt_{side}_Lock").BoundBox.YMin
    y_tens = m.shape(f"Y_Belt_{side}_Tension").BoundBox.YMax
    pts, lines = hw.belt_path((bx, y_lock), [((i2.x, i2.y), r_idler, -s), ((pc.x, pc.y), r_pulley, s),
                                             ((i1.x, i1.y), r_idler, -s)], (bx, y_tens))
    yl = [seg_len(pts[:2]), seg_len(pts[1:-1]), seg_len(pts[-2:])]
    for nm, seg, ph in (("Front", pts[:2], 0.0), ("Wrap", pts[1:-1], yl[0]), ("Back", pts[-2:], yl[0] + yl[1])):
        m.add(f"Belt_Y_{side}_{nm}", hw.belt_band(seg, i1.z, teeth=s if THREADS else 0, phase=ph), group="Belts",
              colour=hw.BLACK)                        # teeth toward the pulley (wrapped with sense s)
    belt_runs += [dict(obj=f"Belt_Y_{side}_Front", fixed=pts[0], moving=pts[1], z=i1.z, plane=None, teeth=s,
                       phase_fixed=0.0, ext=T_Y[1] + 5.0, axis="y"),
                  dict(obj=f"Belt_Y_{side}_Back", fixed=pts[-1], moving=pts[-2], z=i1.z, plane=None, teeth=s,
                       phase_fixed=sum(yl), ext=-T_Y[0] + 5.0, axis="y")]
    belt_len[side] = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    for end, q, part in (("front", (bx, y_lock - 2.9), f"Y_Belt_{side}_Lock"),
                         ("back", (bx, y_tens + 2.9), f"Y_Belt_{side}_Tension")):
        hw_extra["loops"].append((f"Y {side} {end}", (q[0], q[1], i1.z), (0, 0, -1), part))   # yb1/yb6: belt round an M3
print("Y belt path, holder screw to holder screw (mm):", {k: round(v, 1) for k, v in belt_len.items()},
      "- calculator Y belt", calc["ybelt"])

stage("Y axis on the table")
# ---- electronics: Jackpot3 box on the bottom strut plate, first bay on the Min side (V1E) ---
# The box and lid are two channel profiles extruded along print z; the profile runs along Y,
# the open ends face the braces. Its flat base lies on the bottom strut plate with just the lip
# hanging over the plate's back edge (lr4.JP3_BASE_PY / JP3_LIP_X; user, 2026-10-18).
bay0 = brace_off[1] - brace_off[0]                            # = pitch (temp struts: 180)
bay_x = brace_x(0) + lr4.BRACE_T + (bay0 - lr4.BRACE_T) / 2
jp3_dx = lr4.jp3_shift(bay0, JP3_SHIFT_X)
if jp3_dx != JP3_SHIFT_X:
    print(f"Jackpot3 box: shift {jp3_dx:.1f} mm (not {JP3_SHIFT_X}) - the bay is short ({bay0:.1f} mm pitch), "
          "the lid has to clear the XZ_Plate_Min -> Brace_1 bolt ends")
pl_box = F(((0, 0, -1), (-1, 0, 0), (0, 1, 0)), (bay_x + 61.2 + jp3_dx,      # turned 180 deg about Z
                                                bottom.BoundBox.YMax + lr4.JP3_LIP_X + 0.2,   # (user, 2026-10-17)
                                                bottom_z0 + plate_t - lr4.JP3_BASE_PY))
stl("Jackpot3_Box", "Jackpot3_Box", pl_box, "Electronics", PRINT_MAIN, folder=JP3)
stage("electronics: box")
pl_lid = pl_box.multiply(F(*lr4.JP3_LID))
stl("Jackpot3_Lid", "Jackpot3_Lid", pl_lid, "Electronics", PRINT_MAIN, folder=JP3)   # same colour as the box (user)
if JP3_BOARD:   # one mesh per OBJ colour, cached as STLs beside the OBJ (lr4.JP3_BOARD explains the fit)
    jb = lr4.JP3_BOARD
    s, c = math.sin(math.radians(jb["tilt"])), math.cos(math.radians(jb["tilt"]))
    f = -1 if JP3_BOARD_FLIP else 1                      # flip = 180 deg about the board normal
    rows = ((0, f * c, -s), (0, f * s, c), (f, 0, 0))    # board x -> print z, y -> along the tilt, z -> normal
    tvec, nvec = V(c, s, 0), V(-s, c, 0)
    centre = tvec * jb["t_mid"] + nvec * jb["plane"] + V(0, 0, jb["z_mid"])
    q0 = V(jb["centre"][0], jb["centre"][1], jb["pcb_z"][0])
    rq = F(rows, (0, 0, 0)).multVec(q0)
    pl_board = pl_box.multiply(F(rows, tuple(centre - rq)))
    bdir = lr4.JP3_BOARD_DIR
    same = lambda a, b: max(abs(x - y) for x, y in zip(a, b)) < 0.01
    for i, (rgb, bm) in enumerate(mesh.obj_by_colour(os.path.join(bdir, jb["obj"]), jb["scale"], cache_dir=bdir)):
        pcb = same(rgb, (0.62, 0.62, 0.36))                       # the PCB's colour in the OBJ (mtl1)
        col = next((new for old, new in JP3_BOARD_RECOLOUR if same(rgb, old)), rgb)
        m.add_mesh("Jackpot3_PCB" if pcb else f"Jackpot3_Board_{i:02d}", bm, pl_board, group="Electronics", colour=col)
    # top silkscreen (EasyEDA SVG export, layer 3), flat on the PCB top; cached as an STL (~20 s to convert)
    svg, silk = os.path.join(bdir, jb["silk"]), os.path.join(bdir, "jackpot3_silk.stl")
    if not os.path.exists(silk) or os.path.getmtime(silk) < os.path.getmtime(svg):
        from fclib import art
        art.svg_layer_mesh(svg, "3", jb["scale"], jb["svg_origin"], jb["pcb_z"][1] + 0.01,
                           clip=(0, 0) + jb["pcb_size"]).write(silk)
    m.add_mesh("Jackpot3_Silk", mesh.load(silk), pl_board, group="Electronics", colour=(0.95, 0.95, 0.95))
    # 4 x M3 x 10 board -> lugs (the box's Printables page: 6 x M3 x 10, 2 of them in the lid); head 5 mm above the PCB
    top = jb["plane"] + jb["pcb_z"][1] - jb["pcb_z"][0]
    hw_extra["board_screws"] = [(tuple(pl_box.multVec(tvec * t + nvec * (top + 5.0) + V(0, 0, z))),
                                 tuple(pl_box.Rotation.multVec(nvec * -1)))
                                for t in (88.97, 162.10) for z in (15.9, 108.9)]
stage("electronics: board + silk")
hw_extra["lid_screws"] = [(tuple(pl_lid.multVec(V(*c) + V(*a) * 5.0)), tuple(pl_lid.Rotation.multVec(V(*a) * -1)))
                          for c, a in lr4.JP3_LID_SCREWS]            # 2 x M3 x 10, lid -> box
# optional 5015 blower (V1E shop, 24 V; user 2026-10-19) on the OUTSIDE of the lid: its inlet over the lid's 38 mm
# opening pulls the hot air out of the box (the box page: "convection pulling the heat out"; inside there is no room -
# the board and its wiring sit right under the opening, Printables photos), lugs on the lid's two diagonal M3 holes,
# outlet toward the Min end (JP3_FAN_OUTLET); 2 x M3 x 20 through the lugs into the lid. It exhausts: a CNC is dusty, so nothing is blown
# INTO the box (user, 2026-10-19)
if JP3_FAN:
    from fclib import fasteners as fx
    fc = pl_lid.multVec(V(*lr4.JP3_FAN["c"]))
    fa = pl_lid.Rotation.multVec(V(*lr4.JP3_FAN["axis"]))          # out of the lid
    fa.normalize()
    fh = [pl_lid.multVec(V(*q)) for q in lr4.JP3_FAN["holes"]]
    lidm = m.shape("Jackpot3_Lid")
    ends = []                                                       # outer face: last lid material going out
    ln = fx.Line({"lid": lidm}, fc + fa * 40.0, fa * -1, rmax=40.0)
    for rr in (21.0, 24.0):
        iv = ln.solid("lid", rr, 12)
        if iv:
            ends.append(iv[0][0])
    for q in fh:                                                    # round each lug hole
        w = q - fc
        w = w - fa * w.dot(fa)
        l2 = fx.Line({"lid": lidm}, fc + w + fa * 40.0, fa * -1, rmax=10.0)
        for rr in (1.8, 2.6, 3.6):
            iv = l2.solid("lid", rr, 8)
            if iv:
                ends.append(iv[0][0])
    seat = fc + fa * (40.0 - min(ends) + 0.05)                     # inlet face on the outermost lid surface
    fz = fa                                                         # local z: out, away from the lid
    fxv = fz.cross(V(0, 0, 1)) if abs(fz.z) < 0.9 else fz.cross(V(1, 0, 0))
    fxv.normalize()
    fyv = fz.cross(fxv)
    fpl = App.Placement(App.Matrix(fxv.x, fyv.x, fz.x, seat.x, fxv.y, fyv.y, fz.y, seat.y, fxv.z, fyv.z, fz.z, seat.z, 0, 0, 0, 1))
    loc = [(fpl.inverse().multVec(q).x, fpl.inverse().multVec(q).y) for q in fh]
    # the ears go on the two holes either way round, which turns the outlet 180 deg: JP3_FAN_OUTLET picks
    # made at the origin (~12 s each) and cached in build/cache, then moved onto the lid
    fans = [core.cached(os.path.join(ROOT, "build", "cache"), f"blower_5015_{i}", hw.blower_5015, App.Placement(),
                        holes=tuple((round(x, 4), round(y, 4)) for x, y in hs))
            for i, hs in enumerate((loc, loc[::-1]))]
    fan = max(fans, key=lambda f: fpl.Rotation.multVec(V(*f["outlet"], 0)).dot(V(*JP3_FAN_OUTLET)))

    def _onto_lid(v):
        if isinstance(v, dict):
            return {k: _onto_lid(x) for k, x in v.items()}
        if isinstance(v, Part.Shape):
            v = v.copy()
            v.Placement = fpl.multiply(v.Placement)
        return v
    fan = _onto_lid(fan)
    m.add("Jackpot3_Fan", fan["body"], group="Electronics", colour=hw.BLACK)
    m.add("Jackpot3_Fan_Label", fan["label"], group="Electronics", colour=(0.92, 0.94, 0.97))   # WINSINN sticker
    m.add("Jackpot3_Fan_Lead_Red", fan["wires"]["red"], group="Electronics", colour=(0.80, 0.10, 0.10))
    m.add("Jackpot3_Fan_Lead_Black", fan["wires"]["black"], group="Electronics", colour=hw.BLACK)
    side = tuple(round(v, 2) for v in fpl.Rotation.multVec(V(*fan["outlet"], 0)))
    hw_extra["fan_screws"] = [(tuple(fpl.multVec(V(x, y, 15.0 + 3.0))), tuple(fz * -1)) for x, y in loc]
    print(f"Jackpot3 fan: axis {tuple(round(v, 2) for v in fa)}, inlet face {40.0 - min(ends):+.2f} mm out along it, lugs at "
          f"{[(round(x, 1), round(y, 1)) for x, y in loc]}, outlet (world) {side}")
stage("electronics: fan")
psu = core.box(0, 150, 0, 60, 0, 32)            # 24 V power brick - GUESS size; lies flat on the bottom
psu_bay = n_braces - 2 if TEMP else PSU_BAY       # temp: on the Max-end bottom temp strut (GUESS)
psu.translate(V(brace_x(psu_bay) + (brace_off[psu_bay + 1] - brace_off[psu_bay] + lr4.BRACE_T - 150) / 2,   # centred in its bay
                bottom_y0 + (78.5 - 60) / 2, bottom_z0 + plate_t))     # (user, 2026-10-17)
m.add("PSU_24V", psu, group="Electronics", colour=hw.BLACK)

# endstops: Z on the Z stops, Y on the front wheels, X on the core - each on its own two M2.5 holes in the
# printed part (lr4.switch_frame, 2026-10-19; the rough frames below are only where to look)
hints = {}
for side, plate in (("Min", pl_yz_min), ("Max", pl_yz_max)):
    zs = plate.multiply(F(lr4.ident(), lr4.ZSTOPS[f"ZStop_{side}"]))
    sy = 156.6 if side == "Min" else 143.4
    hints[f"Endstop_Z_{side}"] = (f"ZStop_{side}", zs.multiply(hw.along((151.5, sy, 13.05), (1, 0, 0), up=(0, 1, 0))))
hints["Endstop_Y_Min"] = ("FrontWheel_Min", pl_yz_min.multiply(F(*lr4.WHEELS["FrontWheel_Min"])).multiply(
    hw.along((136.0, 142.0, 36.5), (1, 0, 0))))
hints["Endstop_Y_Max"] = ("FrontWheel_Max", pl_yz_max.multiply(F(*lr4.WHEELS["FrontWheel_Max"])).multiply(
    hw.along((141.1, 168.0, 36.1), (1, 0, 0))))
hints["Endstop_X"] = ("Core", pl_core.multiply(hw.along((169.2, 189.9, 9.2), (1, 0, 0))))
# switch_frame takes ~4 s each: cached in build/cache/switches.json, keyed by its code, the hint and the fingerprints
# of every part within 80 mm of it (the host and the strikers)
import hashlib                                   # noqa: E402
import inspect                                   # noqa: E402
sw_path = os.path.join(ROOT, "build", "cache", "switches.json")
try:
    sw_old = json.load(open(sw_path))
except (OSError, ValueError):
    sw_old = {}
sw_new, scene = {}, {p["name"]: p["shape"] for p in m.parts}
sw_code = inspect.getsource(lr4.switch_frame) + inspect.getsource(hw.omron_ss_gl13)
for nm, (host, hint) in hints.items():                     # Omron SS-3GL13PT (user, 2026-10-19), lever + tabs
    near = []
    for n_, s_ in sorted(scene.items()):
        bb_ = s_.BoundBox
        bb_.enlarge(80.0)
        if bb_.isInside(hint.Base):
            near.append((n_, core.fingerprint(s_)))
    key = hashlib.sha1(repr((sw_code, nm, host, tuple(hint.toMatrix().A), lr4.SWITCH_HOME.get(nm),
                             lr4.SWITCH_TIP.get(nm), near)).encode()).hexdigest()
    if key in sw_old:
        mat, hand, why = sw_old[key]
        pl = App.Placement(App.Matrix(*mat)) if mat else None
    else:
        pl, hand, why = lr4.switch_frame(m.shape(host), hint, lr4.SWITCH_HOME.get(nm), scene, nm, lr4.SWITCH_TIP.get(nm))
    sw_new[key] = [list(pl.toMatrix().A) if pl else None, hand, why]
    print(f"{nm}: {why}")
    sw = hw.omron_ss_gl13(pl or hint, hand=hand)
    m.add(nm, sw["body"], group="Electronics", colour=hw.BLACK)
    m.add(f"{nm}_Lever", sw["metal"], group="Electronics", colour=hw.STEEL)
os.makedirs(os.path.dirname(sw_path), exist_ok=True)
json.dump(sw_new, open(sw_path, "w"), indent=0)
print(f"[time]   switches: {sum(k in sw_old for k in sw_new)} of {len(sw_new)} from the cache")

stage("electronics")
# ---- hardware: bolts, screws, nuts from the parts' holes -----------------------------------
hw_count, hw_report = {}, []
if HARDWARE:
    import hardware
    importlib.reload(hardware)
    hw_count, hw_report, hw_specs = hardware.add(m, extra=hw_extra, out=os.path.join(ROOT, "build", "fasteners.json"),
                                                 cache=os.path.join(ROOT, "build", "cache", "hardware.pkl"))
    threads += [dict(obj=sp["obj"], p=sp["seat"], d=sp["d"], t0=sp["thread"][0], t1=sp["thread"][1], pitch=sp["thread"][2],
                     starts=1, r_major=sp["thread"][3], r_minor=sp["thread"][4]) for sp in hw_specs]
    print("hardware: " + "; ".join(hw_report))
    print("hardware totals: " + ", ".join(f"{n} x {k}" for k, n in sorted(hw_count.items())))

stage("hardware")
# ---- vacuum hose (after the hardware: it rests on the core's bolt heads): shoe -> over the core -> drag-chain loop in the holder trays -> clamped in the Min-end
# holder -> off the table edge to the floor (lr4.hose_route) ----
HOSE = dict(lr4.HOSE)


def hose_rest_over(names, y, r, n=7):
    """Lowest hose axis Z (hose along X at Y = y, radius r) that clears the parts `names` (meshes or
    solids) from above, from n sections across each."""
    z = -1e9
    for name in names:
        if not any(p["name"] == name for p in m.parts):
            continue
        sh = m.shape(name)
        bb = sh.BoundBox
        for k in range(n):
            segs = mesh._plane_segments(sh, 0, bb.XMin + bb.XLength * (k + 0.5) / n)
            if segs is None:
                continue
            for arr in segs:
                for py_, pz_ in arr:
                    if abs(py_ - y) < r:
                        z = max(z, pz_ + math.sqrt(r * r - (py_ - y) ** 2))
    return z


def hose_rest_along_y(name, x, y, r):
    """Lowest hose axis Z (hose along Y, axis at X = x) that clears part `name` at Y = y."""
    z = -1e9
    for poly in m.shape(name).crossSections([(V(0, y, 0), V(0, 1, 0))])[0]:
        for p in poly:
            if abs(p.x - x) < r:
                z = max(z, p.z + math.sqrt(r * r - (p.x - x) ** 2))
    return z


port = pl_kobalt.multVec(V(*lr4.HOSE["port_kobalt"]))
core_bb = m.shape("Core").BoundBox            # the hose lies lengthwise on the core's top, between the tie pairs
r_h = lr4.HOSE["od"] / 2
ROUTER_TOP_PARTS = ["Router_Kobalt", "Router_Head", "Router_Cap", "Router_Dial"]
router_top = max(m.shape(n).BoundBox.ZMax for n in ROUTER_TOP_PARTS)
over_z = max(router_top + lr4.HOSE["clear"] + r_h,   # going back over the core beside the router
             max(hose_rest_along_y("Core", port.x, core_bb.YMin + 3 * k, r_h) for k in range(int(core_bb.YLength / 3))))
tie_y = core_bb.YMax - lr4.HOSE["tie_y_back"]
tie_z = hose_rest_over(["Core", "Bearing_Core__M8"] + ROUTER_TOP_PARTS, tie_y, r_h, n=15) + 0.3   # + bolt heads
lid_bb = m.shape("Jackpot3_Lid").BoundBox     # the hose crosses the lid's slanted top, not its front hook
lid_rest = hose_rest_over(["Jackpot3_Lid", "Jackpot3_Fan", "Jackpot3_Fan_Label", "Jackpot3_Fan__M3"], Ym + lr4.HOSE["tray_y_d"],
                          lr4.HOSE["od"] / 2)          # it rides over the lid fan too (2026-10-19)
HOSE.update(
    port=tuple(port), top=router_top, over_z=over_z, tie_y=tie_y, tie_z=tie_z, core_end_dx=core_bb.XMax - port.x,
    tray_y=Ym + lr4.HOSE["tray_y_d"], tray_z=Zm + lr4.HOSE["tray_floor_d"] + lr4.HOSE["od"] / 2,
    bump=(lid_bb.XMin, lid_bb.XMax, lid_rest - lr4.HOSE["od"] / 2),   # (x0, x1, lid top under the hose)
    bump_next=min(b.Center.x for b in (m.shape(p["name"]).BoundBox for p in m.parts       # Hose_Hook_70 has no tray
                                       if p["name"].startswith("Hose_Holder"))
                  if b.XMin > lid_bb.XMax),
    clamp_x=min((m.shape(p["name"]).BoundBox for p in m.parts if p["name"].startswith("Hose_")),
                key=lambda b: b.XMin).Center.x,
    table_t=T, floor_y=TL / 2 if lr4.HOSE["floor"][1] is None else lr4.HOSE["floor"][1])
# the beam the upper run leans against: the upper X rail (axis Y, Z, radius), in the beam frame
HOSE["rail_up"] = [Ym + lr4.RAIL_B[0], Zm + lr4.RAIL_B[1], 29.5 / 2]
# the Max-end plates the U-turn bows round: XZ_Max rides the beam, YZ_Max the gantry (moves -dz against the beam)
HOSE["plates"] = [[b.XMin, b.XMax, b.YMax, b.ZMax, fr] for b, fr in
                  ((m.shape("XZ_Plate_Max").BoundBox, "beam"), (m.shape("YZ_Plate_Max").BoundBox, "gantry"))]
# fixed run (upper + lower): at full +X travel the U-turn starts uturn_gap past the core's end (lr4.hose_route:
# xu = xe + uturn_gap; user, 2026-10-18: keep it within about the machine's end)
HOSE["run"] = HOSE["port"][0] + (1 - X_POS) * CUT_X + HOSE["core_end_dx"] + 2 * HOSE["uturn_gap"] - HOSE["clamp_x"]
hose_pts = lr4.hose_route(HOSE)
hose_curve = lr4.catmull_rom(hose_pts, 12)
hose_len = sum(math.dist(a, b) for a, b in zip(hose_curve, hose_curve[1:]))
m.add_mesh("Vac_Hose", mesh.tube_along(hose_curve, HOSE["od"], 32), group="Hose", colour=(0.82, 0.86, 0.88),
           transparency=55)                    # clear PVC, steel wire helix
# router cord + cable sleeve tied along the hose: on the core's top behind it, then between the runs (lr4.cord_route,
# lr4.cable_places)
cord_tip = [tuple(v.Point) for v in rt["cord_tip"].Vertexes]
places = lr4.cable_places(HOSE, lr4.CORD["d"], lr4.SLEEVE["d"])
HOSE["cord"] = dict(lr4.CORD, tip=cord_tip[0], tip2=cord_tip[1], **places["cord"])
HOSE["sleeve"] = dict(lr4.SLEEVE, **places["sleeve"])
je = lr4.JP3_CABLE_ENTRY                          # it ends in the Jackpot3 box (the wires go to the controller)
jp, jd = pl_box.multVec(V(*je["p"])), pl_box.Rotation.multVec(V(*je["d"]))
# ...through the big hole in the brace just past the box's +X end (lr4.BRACE_BIG_HOLE); it leaves the hose just past
# the middle brace and eases down to it (user 2026-10-19)
br = min((o for o in m.parts if o["name"] in ("Brace_1", "Brace_2", "Brace_3", "Brace_4")
          and m.shape(o["name"]).BoundBox.XMin > jp.x), key=lambda o: m.shape(o["name"]).BoundBox.XMin)
bh = lr4.BRACE_BIG_HOLE
via = []
for k in (-1, 1):                                  # either face of the brace, +X side first
    q = br["placement"].multVec(V(*bh["c"]) + V(*bh["axis"]) * (k * (bh["half"] + 4.0)))
    q.y += bh["rest"][0]                                       # resting on the hole's bottom (it eases down to it)
    q.z += bh["rest"][1]
    via.append(tuple(q))
via.sort(key=lambda q: -q[0])
braces = sorted((o["name"] for o in m.parts if o["name"].startswith("Brace_") and "__" not in o["name"]),
                key=lambda n_: m.shape(n_).BoundBox.Center.x)
mid_brace = m.shape(braces[len(braces) // 2]).BoundBox
HOSE["sleeve"]["exit"] = dict(x=mid_brace.XMin - 5.0, p=tuple(jp), d=tuple(jd), via=via)
cord_curve = lr4.catmull_rom(lr4.cord_route(hose_curve, HOSE, HOSE["cord"], *cord_tip), 6)
m.add_mesh("Router_Cord_Run", mesh.tube_along(cord_curve, lr4.CORD["d"], 8), group="Hose", colour=ROUTER_CAP)
sleeve_curve = lr4.catmull_rom(lr4.cord_route(hose_curve, HOSE, HOSE["sleeve"]), 6)
m.add_mesh("Cable_Sleeve", mesh.tube_along(sleeve_curve, lr4.SLEEVE["d"], 8), group="Hose", colour=(0.12, 0.12, 0.13))
os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
json.dump(dict(HOSE, x_pos=X_POS), open(os.path.join(ROOT, "build", "hose.json"), "w"), indent=1)   # for export_web
json.dump(threads, open(os.path.join(ROOT, "build", "threads.json"), "w"), indent=0)        # for export_web
json.dump(belt_runs, open(os.path.join(ROOT, "build", "belts.json"), "w"), indent=0)

stage("vacuum hose")
# ---- build, report ---------------------------------------------------------------------------
doc = m.build()
path = m.save(os.path.join(ROOT, "build"))
stage("build + save FCStd")
bb = m.bound_box()
print(path)
print(f"calculator (mm): {calc}")
print(f"calculator (in): {calc_in}")
print(f"strut generator: {strut} mm, {n_braces} braces, pitch {pitch:.2f} mm, {pitch - 18:.2f} mm between braces")
print(f"table {TW / IN:g} x {TL / IN:g} in MDF, footprint {xtable} x {ytable} mm at ({FX0:.1f}, {FY0:.1f})")
print(f"machine {core.size_text(bb)}; tool at X {tool_x:.1f} Y {tool_y:.1f}, bit tip {tip_z - T:.1f} mm above the table "
      f"(Z_POS {Z_POS}); Y rail clips {n_clips}")
if not lr4.B_RANGE[0] <= b <= lr4.B_RANGE[1]:
    print("WARNING: Z_POS puts the carriages off their rails")

if CHECK if CHECK is not None else not App.GuiUp:
    import check
    importlib.reload(check)
    check.run(m, cache=os.path.join(ROOT, "build", "check_cache.json"))
    stage("overlap check")

bom = os.path.join(ROOT, "build", "bom.md")
import bom as bom_mod
importlib.reload(bom_mod)
with open(bom, "w", encoding="utf-8") as f:
    f.write(bom_mod.text(globals()))
json.dump(bom_mod.data(globals()), open(os.path.join(ROOT, "build", "bom.json"), "w"), indent=0)   # web viewer
print(bom)
stage("bom")
