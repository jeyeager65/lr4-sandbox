# LowRider 4 geometry: the size calculator and strut plates (calculator.py, strut_plate.py), and where
# every downloaded STL goes. Imported by build.py and cam.py. All lengths in mm.
#
# How the placements were found (2026-10-17, from the STL/DXF files themselves - V1E publishes
# no assembly CAD): hole patterns and rail clamps were measured on mesh cross sections, then
# each mapping was checked by section-overlap (parts touch, never intersect) and against the
# V1E build photos. Notes per constant below; PLAN.md has the story.
#
# Frames:
#   machine: X width (left = YZ_Min side), Y depth (front = 0), Z up, table bottom at Z = 0.
#   D      : the XZ_Min plate DXF frame (parts/lr4/XZ_Min_DXF_V1.dxf): D x -> machine +Y,
#            D y -> machine +Z. Both XZ plate DXFs are drawn from the same side, so the X
#            rails sit at the same D coordinates on both ends. (Ym, Zm) = machine (Y, Z) of D's
#            origin - it moves with the beam (Y travel) and the Z axis.

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the repo (this script is in freecad/)
PARTS = os.path.join(ROOT, "parts")
PRIVATE = os.path.join(ROOT, "private")                     # git-ignored: the user's own files, logs, size builds
JP3_BOARD_DIR = os.path.join(PRIVATE, "jackpot3_board")    # user's EasyEDA OBJ + SVG (build.py JP3_BOARD)
SIZES_DIR = os.path.join(PRIVATE, "sizes")                  # configurator size builds (configurator/size_builds.py)
IN = 25.4

if HERE not in sys.path:
    sys.path.insert(0, HERE)


# ---- size calculator (calculator.py, matches V1E's) and strut plates (strut_plate.py, Vector76's generator) -----
from calculator import OFFSETS, calculator, calculator_inches  # noqa: E402,F401  (lr4.calculator etc. as before)
import strut_plate  # noqa: E402
from strut_plate import BOTTOM_Y, braces  # noqa: E402,F401


def plate_faces(strut_length, wing=11.5, dogbones=3.5, num_braces=0, hole_d=5.3, out_base=None):
    """The two plates as flat Part faces in generator coordinates, both at y = 0..67.5: {"front": face,
    "bottom": face}. Bolt holes are true circles of hole_d. out_base: also write <out_base>.dxf / .svg (both
    plates laid out as the generator draws them - the same files as the web page's download)."""
    pl = strut_plate.plates(strut_length, wing, dogbones, num_braces)
    if out_base:
        strut_plate.write(out_base, pl)
    return {k: strut_plate.face(v, hole_d) for k, v in pl.items()}


# ---- temporary struts (V1E Temp_Strut_v1, Printables 1034840): the machine runs on 4 of these - front + bottom at
# each end - until it has cut its own MDF strut plates (V1E docs "Beam Assembly", photos beam3-5, B4, B5).
# Flat 67.5 x 192.3 x 4 mm; holes d 5.3 at STL x 124.5 / 180.5, y 62.5 / 242.5 = the generator's holes (5.75 in from
# each edge) on two braces 180 mm apart. STL ends: a small notch at y 56 (the front plate's screw-head notch, Min
# end) and a 40 x 32 cutout at y 249 (X belt tensioner, Max end); a d 3.5 hole mid-length near x 186.
TEMP_STRUT_PITCH = 180.0         # brace centre to centre under a temp strut
TEMP_STRUT_T = 4.0
TEMP_STRUT_HOLES = ((124.5, 62.5), (180.5, 62.5), (124.5, 242.5), (180.5, 242.5))   # STL (x, y), d 5.3, through
# STL -> generator 2D (u along the plate, v across, n = thickness): rows, offset (u0 = the end brace's hole line
# at u = 9; Max end: + strut - 18). Front Min: small notch at the Min end, matching the MDF plate's (v 29-39 vs
# 30.5-42.5). Front Max: the same way round, so the big cutout is at the Max end over the X belt tensioner (MDF
# notch v 10.9-30 -> cutout 11.3-51.3).
# Bottom: GUESS - both ends the same way round (beam5: the small hole on the same edge at both ends), turned so
# the textured (bed) face is underneath; the hole then lies at the back edge (v 58.8).
TEMP_STRUT_FRAMES = {
    ("front", "Min"): (((0, 1, 0), (1, 0, 0), (0, 0, -1)), (-53.5, -118.75, 4.0)),
    ("front", "Max"): (((0, 1, 0), (1, 0, 0), (0, 0, -1)), (-233.5, -118.75, 4.0)),   # + strut - 18 (= Min, moved)
    ("bottom", "Min"): (((0, -1, 0), (1, 0, 0), (0, 0, 1)), (251.5, -118.75, 0.0)),
    ("bottom", "Max"): (((0, -1, 0), (1, 0, 0), (0, 0, 1)), (71.5, -118.75, 0.0)),    # + strut - 18
}


def brace_offsets(strut, n, temp=False):
    """Brace i's X offset from brace 0 (its Min face), i = 0..n-1. MDF plates: the generator's even pitch. Temp
    struts (V1E beam3: "position the end braces to fit the temp struts, equally space your remaining braces"): the
    two end bays TEMP_STRUT_PITCH, the rest evenly between. Needs 4+ braces."""
    span = strut - 18.0
    if not temp:
        return [span * i / (n - 1) for i in range(n)]
    if n < 4:
        raise ValueError(f"temp struts need 4+ braces (this size has {n})")
    a, b = TEMP_STRUT_PITCH, span - TEMP_STRUT_PITCH
    return [0.0] + [a + (b - a) * i / (n - 3) for i in range(n - 2)] + [span]


def temp_strut_frame(which, end, strut):
    """(rows, offset) mapping Temp_Strut_v1.stl into the generator's 2D frame of the `which` plate."""
    rows, (u, v, w) = TEMP_STRUT_FRAMES[(which, end)]
    return rows, (u + (strut - 18.0 if end == "Max" else 0.0), v, w)


# ---- measured geometry (mm, print coordinates of the STLs/DXFs in parts/) -------------------
RAIL_A = (62.17, 58.57)          # lower X rail centre in D (= brace clamp at print (198.78, 92.70))
RAIL_B = (75.78, 171.27)         # upper X rail centre in D (brace clamp (185.17, 205.40)); 113.5 apart
BRACE_TO_D = (260.95, -34.13)    # Brace_29p5 print (bx, by) -> D (260.95 - bx, by - 34.13): its 3 M5
                                 # holes = the XZ plates' 3 M5 holes (mirrored)
BRACEMAX_TO_D = (257.25, 265.87)  # Brace_Max_29p5 -> D (257.25 - bx, 265.87 - by) (rotated 180 deg)
BRACE_T = 18.0                   # brace thickness (= SCAD's 18 mm brace slots)
YZ_X0 = 179.0                    # YZ plate print x -> D x = 179 - px (MGN rail holes at px 85 / 177
                                 # = XZ carriage patterns at D x 94 / 2)
CARRIAGE_TOP = 46.0              # YZ print z of the carriage tops (rail bed z 33 + MGN12H 13)
MGN_RAILS = {85.0: (68.8, 218.8), 177.0: (78.8, 228.8)}   # Min plate: rail px -> print y span
BLOCKS_MIN = {177.0: 32.5, 85.0: 42.5}   # XZ_Min DXF carriage centres (D y) per YZ rail px
BLOCKS_MAX = {177.0: 68.5, 85.0: 78.5}   # XZ_Max: 36 mm higher - the Max side rides the Y rail
B_RANGE = (134.0, 238.6)         # Min: b = D y + py; carriage (45.4 long) stays on its 150 rail
WHEEL_BOTTOM_PY = 238.94         # Min plate print y of the lowest bearing bottom (M8 axle + 11): table top.
                                 # Wheels flush on their screw seats: front axle py 227.68, back 227.94 -> the
                                 # back bearing touches, the front one is 0.27 up (2026-10-17; was 240.5 with
                                 # the wheels hanging 1.82 / 0.56 below their seats)
TUBE_PY_MAX = 46.085             # Max plate print y of the Y rail axis: all four Max bearings touch the rail
TUBE_PZ_MAX = 29.52              # Max plate print z of the Y rail axis (2026-10-18: re-solved from the MEASURED
                                 # bolt holes, residuals <= 0.004; was 46.87 / 29.55 from exact-45 deg lines that
                                 # left the Max side 0.785 low; before that 45.3 / 30.0 from the 36 mm XZ offset)
CLIP_TUBE = (142.23, 151.77)     # Y_Clip print (x, y) of the tube axis; table at print x = 163
CLIP_OUTER_PY = 189.0            # Y_Clip outer end (flush with the table edge line)
CORE_TO_D = (193.72, 263.72)     # Core print (cx, cy) -> D (193.72 - cx, 263.72 - cy); its two rail
                                 # clearance arcs (r 16.8) sit 113.47 apart like the brace clamps
MAX_WHEEL_BEARINGS = {           # (centre, bolt axis) in the wheel's print coords, on the M8 hole's own axis:
    "FrontWheel_Max": [((125.800, 170.858, 11.0), (-0.73728, 0.67559, 0.0)), ((125.800, 132.106, 25.59), (0.73728, 0.67559, 0.0))],
    "BackWheel_Max": [((187.405, 170.858, 11.0), (0.73728, 0.67559, 0.0)), ((187.405, 132.105, 25.0), (-0.73728, 0.67559, 0.0))],
}                                # 2026-10-18: holes fitted per section (circle fit, d 8.10) and a line through the
                                 # centres -> 42.5 deg, not the 45 assumed before (2.3 deg / ~0.5 mm off at the
                                 # bearing). 2026-10-19: inner race on the wheel's raised boss (0.9 mm proud out to
                                 # r ~6), outer race 0.9 clear of the face - moved 0.9 along the axis off the wall
                                 # (the fastener check found it 0.9 into the boss). The rail contact is on the race's
                                 # line along the axis (foot 0.32 -> 0.58 from its centre), so TUBE_* still hold.
CORE_TUBES = {"Lower": (131.55, 205.15), "Upper": (117.94, 92.45)}   # tube axes in core print (x, y):
                                 # RAIL_A / RAIL_B through CORE_TO_D
CORE_BEARINGS = [                # (tube, slot angle deg in core print xy, core print z): the 8 radial
    ("Lower", 44.0, 36.0), ("Lower", 44.0, 150.0), ("Lower", 147.25, 57.0), ("Lower", 147.25, 129.0),
    ("Upper", 205.9, 36.0), ("Upper", 205.9, 150.0), ("Upper", 308.25, 55.0), ("Upper", 308.25, 131.0),
]                                # slots, mapped by open-material scans 2026-10-17 (pairs symmetric
                                 # about core z 93; slots 8.5 wide, 24.75 long) - superseded by:
CORE_BEARING_LINES = [           # (tube, centre, bolt axis) in core print coords, on the M8 hole's own axis
    ("Lower", (149.781, 223.348, 35.5), (-0.74315, 0.66913, 0.0)), ("Lower", (149.781, 223.348, 149.5), (-0.74315, 0.66913, 0.0)),
    ("Lower", (110.152, 219.533, 56.5), (-0.60182, -0.79863, 0.0)), ("Lower", (110.152, 219.533, 128.5), (-0.60182, -0.79863, 0.0)),
    ("Upper", (94.936, 80.675, 35.5), (0.5, -0.86603, 0.0)), ("Upper", (94.936, 80.675, 149.5), (0.5, -0.86603, 0.0)),
    ("Upper", (133.805, 72.059, 54.5), (0.81915, 0.57358, 0.0)), ("Upper", (133.805, 72.059, 130.5), (0.81915, 0.57358, 0.0)),
]                                # 2026-10-18: hole lines fitted per section (d 8.10) - 138 / 233 / -60 / 35 deg,
                                 # 3.3-4.3 deg off the slot-normal guess; bearing centred in its 9.00 mm slot.
                                 # On these lines the bearings sit -0.03..+0.06 from the X rails (the rails are
                                 # placed by the braces, so this is an independent check)
# X drive (2026-10-18): the X stepper's 31 mm screw holes and both X idler M5 holes all lean 7.0 deg in the core
# (square to the rail plane, which leans 6.9 deg), not along print y. Along this axis (n.p, core print):
# stepper face 169.39 (top of its mounting block), idler pocket 171.35..185.45 -> belt 173.4..183.4; the pulley
# goes on hub-down (teeth nearest the motor) to share that belt plane. The XZ_Min belt slot leans 7.0 deg too.
X_AXIS_TILT = (0.1218, 0.9926, 0.0)      # stepper / idler axis in core print, toward the pulley (machine down)
X_MOTOR_LINE = (198.05, 149.0, 21.45)    # a point on the stepper axis (31 mm screw pattern centre at print y 149)
X_IDLER_LINE = (134.66, 0.1228)          # idler hole axes: print x = a + b * y, at print z 11.45 / 31.45
X_MOTOR_FACE, X_BELT_NP = 169.39, (173.4, 183.4)
XBELT_TENSION_SHIFT = -2.0       # X_Belt tensioner along X from its tongue-on-lug position: clear of the brace and
                                 # the strut plate from -4 to 0 (the screw's travel); -2 = mid (2026-10-18)
XBELT_SLOT_D = (45.96, 102.06)   # XZ_Min DXF: the angled belt pocket (3.4 x 12.9, 7 deg, under a 2 mm neck from the
                                 # top edge) - its centre in D; the belt's M3 loop sits here
KOBALT_IN_CORE = (194.0, 263.67, 92.5)   # Kobalt frame -> Core: cx = kx + 194.0, cy = 263.67 - kz,
                                 # cz = ky + 92.5 (mount ear holes = Core's 4 M5 holes, 61 x 87.9;
                                 # cx offset = where the mounts first touch the core, overlap scan)
ROUTER_AXIS_D = CORE_TO_D[0] - KOBALT_IN_CORE[0]        # 3.92: router axis in D x
KOBALT_Z_IN_D = CORE_TO_D[1] - KOBALT_IN_CORE[1]        # 0.05: Kobalt z -> D y offset
LEADSCREW_PX, LEADSCREW_PZ = 134.0, 21.0    # Z stepper axis on the YZ plates (31 mm pattern)
YSTEP_PX, YSTEP_PZ = 217.0, 21.0            # Y stepper axis
# Y belt (2026-10-18): the idlers + pulley sit in the pocket at the plate's bottom (print y 212.1 .. 226.9,
# open to the outer face); 12 mm idler stacks centred in it -> belt (10 wide) from print y 214.5 to 224.5.
# The holders' lock slots (X 2.25 wide, 5.65 in from the footprint edge) are open over the same height.
Y_BELT_PY = 214.5
Y_IDLER_PX = (189.0, 211.0)                 # M5 nut traps (print x; machine front = larger px)
BELT_SLOT_IN = 5.65                         # belt centre in the holder lock slot, in from the footprint X edge
BELT_END_IN = (8.0, 26.5)                   # (old, unused since 2026-10-19: the belt ends at the lock / tension
                                            # block's outer face, build.py) belt end from the footprint edges
XBELT_D = (40.17, 102.77)        # X belt tension screw (Brace_Max hole = XZ_Max 11 mm hole) in D
FRONT_FACE = ((205.85, 116.87), (-0.1273, 0.9919))   # brace print: front strut plate seat (lower
                                 # corner, direction up the face) - 67.5 long, 7.3 deg like the rails
BOTTOM_SEAT = (90.0, 88.25)      # brace print: bottom strut plate in the 68 x 6.5 recess under the
                                 # brace (feet at bx 80-88 / 156-162 drop to by 90): plate by 90..96.35,
                                 # bx 88.25..155.75 (flush with the brace bottom)

HOSE_SLOT = (85.33, 140.0)       # brace print: hose-holder slot in the back bar, 4 x 14 (bx 83.3-87.3),
                                 # the tab (3.5 x 13) rests on by 140; found 2026-10-17 by sectioning the
                                 # brace (91.5 was the 9 x 10 hole beside it); same spot on Brace_Max
HOSE_REST = (0.0, -4.0)          # wide/medium holders: tab down in the brace's 4 x 14 slot, base dropped onto
                                 # the back bar top (Z 153.9, same as Hose_Hook_70's foot); overlap scan,
                                 # user 2026-10-17 ("the bottom part slides into a slot in the brace")
HOSE_TABS = {                    # print (x, y, z) of each holder's tab centre at its base, base rests on
    "Hose_Holder_Hook": (-175.66, 102.0, 0.0),     # the slot top; tab 3.5 x 13 hangs 19.5 into the slot
    "hose_holder_shorty": (-175.66, 102.0, 0.0),
    "Hose_Hook_70": (138.3, 128.0, 6.7),           # strip end (HOOK70_REST then seats it)
}
HOOK70_REST = (23.53, 40.36)     # Hose_Hook_70 (flipped, untilted): its 3.3 x 19.2 tail centred in the brace's
                                 # 4 x 19.5 slot (Y 810.9), foot on the back bar top (Z 153.87), tail tip just
                                 # above the slot floor; arm leans back 10.9 deg (rays, 2026-10-17)
HOOK70_TILT = 10.9               # deg: Hose_Hook_70's arm leans this far from its tab; no longer applied (the tab hangs plumb)

# Placements of parts relative to their YZ plate (rows = machine-of-plate axes in print axes).
WHEELS = {   # name: (rows, offset) in YZ plate print coords; screw holes matched (0.02 mm), then the wheel
             # pulled up flush on its flat screw seat (print y; uniform gaps 1.82 / 0.56 / 0.25 / -0.54 closed,
             # 2026-10-17 - the old zero-overlap sweep had left them hanging)
    "FrontWheel_Min": (((0, 0, -1), (-1, 0, 0), (0, 1, 0)), (269.0, 358.68, -129.0)),
    "BackWheel_Min": (((0, 0, 1), (1, 0, 0), (0, 1, 0)), (14.0, 44.94, -129.0)),
    "FrontWheel_Max": (((0, 0, -1), (1, 0, 0), (0, -1, 0)), (269.0, -62.75, 181.0)),
    "BackWheel_Max": (((0, 0, 1), (-1, 0, 0), (0, -1, 0)), (14.0, 250.46, 181.0)),
}
STUB_PIVOT_D = (45.0, 119.5)     # XZ plate top M5 pair (Y 680.28, 6 below the Min plate top; Max +36) in D:
                                 # the Z stubs turn 180 deg about the plate normal here so their tops sit
                                 # flush with the plate top (user photo, 2026-10-17: they were upside down)
XBELT_Y_D = 46.0                 # X belt centre line in D x (Y 681.3): on the X idlers' 12 mm running surface
                                 # (back at 680.6) and inside the XZ_Min keyhole pocket (Y 679.0-682.4 at the
                                 # belt's lower edge, 680.2-683.6 at its top), user 2026-10-17
Z_NUT_IN_STUB = {"Min": (((1, 0, 0), (0, -1, 0), (0, 0, -1)), (0.0, 299.0, 39.8)),    # flipped, in the
                 "Max": (((-1, 0, 0), (0, 1, 0), (0, 0, -1)), (300.0, 1.0, 39.8))}   # stub pocket
JP3_BASE_PY = 96.345             # Jackpot3_Box print y of its flat base (it lies on the bottom strut plate)
JP3_LIP_X = 80.26                # ...and the inner side of the lip under it (print x 67.4-80.3, down to y 90.6),
                                 # which hangs over the plate's back edge (STL sections, 2026-10-18; it used to
                                 # rest on the lip with the base 5.8 mm up)
JP3_LID = (((1, 0, 0), (0, -1, 0), (0, 0, -1)), (-1.0, 251.0, 124.9))   # lid on the box's slanted
                                 # top, turned over (APPROXIMATE: profile search found no tight nest)
JP3_BOLT_END = 30.0 - 6.5 - BRACE_T   # the XZ_Plate_Min -> Brace_1 M5 x 30 ends 5.5 mm past the brace's Max face
JP3_BOLT_GAP = 1.0               # lid end <- that bolt end, at least (short pitch; user 2026-10-20)


def jp3_shift(pitch, shift):
    """Jackpot3 box X shift from its bay centre: `shift` (build.py JP3_SHIFT_X, toward the Min end to clear the
    brace-2 hose holder), cut back when the bay is short so the lid's Min end stays JP3_BOLT_GAP past the
    XZ_Plate_Min -> Brace_1 bolt ends (they hit it by 2.4 mm at 184 mm pitch). Lid end - bolt end =
    (pitch - BRACE_T) / 2 + 61.2 + shift - lid depth - JP3_BOLT_END; 61.2 = box origin past the bay centre (build.py).
    configurator/fit_config.py + config_model.js use the same rule (keep in step)."""
    return max(shift, JP3_BOLT_GAP + JP3_BOLT_END + JP3_LID[1][2] - 61.2 - (pitch - BRACE_T) / 2)


JP3_LID_LEN = 127.4              # lid along machine X (STL print z 0-127.4) - the widest Jackpot3 part (box 122.4)
# Shortest brace pitch the box fits: lid JP3_BOLT_GAP past the Brace_1 bolt ends and JP3_BOLT_GAP short of Brace_2
# (152.9 mm). The auto brace count never goes under 183 mm; only the page's manual brace choice can - it then hides
# the box (config_model.js, via fit_config.py's cfg.jp3.min_pitch).
JP3_MIN_PITCH = BRACE_T + JP3_BOLT_END + JP3_BOLT_GAP + JP3_LID_LEN + JP3_BOLT_GAP
ZSTOPS = {"ZStop_Min": (57.625, -43.704, 25.3), "ZStop_Max": (57.625, 43.704, 25.3)}   # identity rotation:
                                 # nested in the plate's corner pocket (floor print z 25.3, against its x 192
                                 # wall and sloped y 125 wall; slot over the screw hole at 215, 116); found by
                                 # a height-map search of 8 orientations, 2026-10-17 (was resting on z 42)

# Kobalt K7TR-03 trim router (user-measured 2026-10-19: fclib.hw.KOBALT_K7TR03). Its height and turn are set by the
# dust shoe: the spindle lock button's boss drops into the U notch at the top of the shoe's collar round the nose
# (Dust_Shoe_Kobalt, ring r 15.5-19 at Kobalt z 34.5-45: open 6-71 deg, centre 38.5 deg, round bottom at z 34.5).
# The head sits square to the core (user 2026-10-19): switch / dial end toward machine +X (Kobalt frame 90 deg), cord
# end toward the Min end; the button then points 38.5 - 90 = -51.5 deg from the switch end, into the notch.
KOBALT_NOTCH = dict(deg=38.5, button_z=43.0)    # button centre (boss d 16.8: bottom on the notch's at z 34.6)
ROUTER = dict(nut_z=43.0 - 25.0, bit_out=16.0, cord_out=15.0, switch_deg=90.0)   # nut bottom (Kobalt z), bit stick-out (photo; set
ROUTER["tip_z"] = ROUTER["nut_z"] - ROUTER["bit_out"]           # yours), cord stub (the rest is routed - CORD)
ROUTER_AXIS_IN_KOBALT = (-0.8, 0.0)   # mount bore centre in the Kobalt frame (circle fit, both rings: d 66.7)
# Tiny Touch Plate storage (user 2026-10-19: it clips into the top router holder): Tool_Mount_T_Kobalt has a sprung
# tab on its outer wall leaving a 1.2 mm slot, ~10 mm deep, full height (Kobalt z 115.5-135.0), open toward the
# front with a detent (0.3 mm) at the mouth. The plate's 8 mm strip snaps in edge-first; the pad rests on the
# mount's top. Slot mid-plane in the Kobalt frame (ray scan of the STL): mouth end / closed end, and its z range.
TOUCH_SLOT = dict(mouth=(20.0, 36.05), closed=(12.0, 36.75), z=(115.48, 134.98), strip_x=15.5)
TOUCH_PLATE = dict(pad=18.0, strip_w=8.0, length=85.0)   # user-measured (0.5 stainless, V1E)
# As stored (user's photo of a Kobalt LR4, 2026-10-19): pad DOWN beside the bottom mount, the strip up through the top
# mount's slot, the red spade just above it (under the head). The kit's N52 rod magnet (3.15 x 12.6) sticks end-on
# to the head of the top mount's +X bolt into the core, pointing forward; the alligator clip hangs from it, its jaws
# round the rod near the end (user). pad_z: the pad's bottom edge (Kobalt z).
TOUCH_STORE = dict(pad_z=57.5, magnet=(3.15, 12.6),
                   bolt=(-7.27, 43.95, 125.0), bolt_d=(-1.0, 0.0, 0.0))   # that bolt's head seat + axis (Kobalt frame,
                                                                            # from build/fasteners.json)


# Kobalt dust shoe: the TPU bristle strips (printed flat, 166.5 x 26.3 x 3.0; a ~5.6 mm spine along one edge)
# push spine-up into the groove under Dust_Skirt_Kobalt: a 2.35 mm groove, open at the bottom (Kobalt z 24.05)
# up to its ceiling at z 29.25, running round the bit and the hose port, with a ~4 mm gap where the skirt's C
# opens. Its centreline is 328 mm: two strips, one from each end of the gap, meeting in the middle (2026-10-18).
SKIRT_GROOVE = dict(z_ceiling=29.25, trace_z=26.0, trace_from=(30.0, -25.0), strips=2,
                    strip_spine_x=163.16, strip_y0=66.75, strip_len=166.5, strip_t=3.02)


def skirt_groove(skirt_mesh):
    """Groove centreline under the dust skirt, Kobalt frame (x, y) points from one end of the gap round to the
    other: rays from inside the stadium every 0.5 deg; the groove centre is mid-way between hits 2 and 3."""
    import numpy as np
    import FreeCAD as App
    from fclib import mesh as fm
    g = SKIRT_GROOVE
    o = App.Vector(*g["trace_from"], g["trace_z"])
    pts = []
    for k in range(720):
        a = math.radians(k * 0.5)
        h = fm.ray_hits(skirt_mesh, o, App.Vector(math.cos(a), math.sin(a), 0), 90)
        if len(h) >= 4:
            r = (h[1] + h[2]) / 2
            pts.append((o.x + math.cos(a) * r, o.y + math.sin(a) * r, k * 0.5))
    P = np.array(pts)
    steps = np.diff(np.r_[P[:, 2], P[0, 2] + 360])
    i = int(np.argmax(steps))                     # the gap: start just after it
    return P[np.r_[np.arange(i + 1, len(P)), np.arange(0, i + 1)], :2]


# Peter Plates (Printables 1044487, V1E: "LR4 fancy covers inspired by Peter H" - user 2026-10-19): two covers on the
# YZ plate's outer face, M3 x 10 into it. Their "w locations" STL -> YZ_Plate_Min print frame, found by matching
# hole patterns: 9 of the 11 cover holes land exactly (0.00 mm) on M3 holes in the plate's outer face (print z 0):
# X = x + 179.00, Y = -z + 238.77, Z = y + 152.0 (the covers' plate side at y -152 on z = 0, 6.25 thick outward).
# Made for YZ Min; "if you want YZ max just mirror the parts" - the Max plate is the Min one mirrored in print y.
PETER_IN_YZ = (1, 0, 0, 179.00, 0, 0, -1, 238.77, 0, 1, 0, 152.0)
# user 2026-10-19: no stepper cut-outs - B's face-plate window (Y stepper, B2 below) and the notch both covers share
# at their seam (Z stepper, x 18.5..57.5) are filled; peter_variants measures the notch fill's edges per depth.
PETER_FILL = {"B2": ([(-64.7, 11.3), (-25.3, 11.3), (-25.3, 61.3), (-64.7, 61.3)], None)}


def peter_variants(stl_path, honeycomb=True, cell=5.0, wall=0.8, border=4.0, slab=0.5):
    """The two Peter Plates in their own frame, both ways: {"T": {"solid": Mesh, "honeycomb": Part.Shape}, "B": ...}.
    solid = the designer's mesh with the stepper openings filled; honeycomb = the filled covers rebuilt as solids
    with the screw holes and counterbores, a solid `border` round each piece and open hex cells inside it, like a
    print with no top / bottom layers (the designer's "fancy infill" tip; lets the steppers breathe).
    The covers' edges are drafted (B's top edge sits ~2.8 mm higher at the back, T's bottom edge too), so the fills
    and the rebuilt covers are stacks of `slab`-thick layers, each cut to the cover's own outline at its depth, and
    the notch fill to the edge just either side of it at that depth (user 2026-10-19: straight fills left a jog at
    the seam)."""
    import FreeCAD as App, Mesh, Part
    from fclib import core, fasteners as fx, mesh as fmesh
    V = App.Vector
    comps = sorted(Mesh.Mesh(stl_path).getSeparateComponents(), key=lambda c: -c.BoundBox.ZMax)
    holes = [h for h in fmesh.find_holes(Mesh.Mesh(stl_path), 2.5, 4.0)]
    hole_xz = [(h["p0"].x, h["p0"].z) for h in holes]
    poly = lambda pts, y: Part.Face(Part.makePolygon([V(x, y, z) for x, z in pts + pts[:1]]))

    def loops_at(m, y, big=12.0):
        out = []
        for lp in m.crossSections([(V(0, y, 0), V(0, 1, 0))])[0]:
            xs = [p.x for p in lp]
            if max(xs) - min(xs) > big:
                pts = [lp[0]]
                for p in lp[1:]:
                    if (p - pts[-1]).Length > 0.15:
                        pts.append(p)
                if (pts[0] - pts[-1]).Length > 1e-6:
                    pts.append(pts[0])
                if len(pts) < 4:
                    continue
                try:
                    out.append(Part.Face(Part.makePolygon([V(p.x, y, p.z) for p in pts])))
                except Exception:
                    continue
        return out

    def edge(m, x, y, top):                                     # the cover's top / bottom edge at (x, depth y)
        ln = fx.Line({"m": m}, V(x, y, -20.0), V(0, 0, 1), rmax=1.0)
        iv = [(a - 20.0, b - 20.0) for a, b in ln.solid("m", 0.0)]
        if not iv:
            return None
        return max(b for a, b in iv) if top else min(a for a, b in iv)
    nx0, nx1 = 18.5, 57.5                                       # the shared notch (Z stepper), cover frame x
    res = {}
    for tag, m in zip(("T", "B"), comps):
        y_hi = -152.0
        y_lo = -156.0 if tag == "T" else -158.25
        slabs = []
        y = y_hi
        while y > y_lo + 1e-6:
            y2 = max(y - slab, y_lo)
            slabs.append((y, y2))
            y = y2
        fills, fill_faces, layers, outlines, last_fs, by_depth = [], [], [], [], [], []
        for y0, y1 in slabs:
            ym = (y0 + y1) / 2
            zl, zr = edge(m, nx0 - 1.1, ym, tag == "B"), edge(m, nx1 + 1.1, ym, tag == "B")
            f = None
            # the notch sits over the Y stepper, whose 42.3 body stands 0.15 proud of the YZ plate's 42 mm face: the
            # fill starts one slab (0.5 mm) back from the plate face - a relief on the inside, closed outside
            if zl is not None and zr is not None and y0 < y_hi - 0.01:
                if tag == "T":
                    f = poly([(nx0 - 0.5, zl), (nx1 + 0.5, zr), (nx1 + 0.5, 89.0), (nx0 - 0.5, 89.0)], y0)
                else:
                    f = poly([(nx0 - 0.5, 38.5), (nx1 + 0.5, 38.5), (nx1 + 0.5, zr), (nx0 - 0.5, zl)], y0)
            if tag == "B" and y1 < -155.4:                       # the window in B's face plate (Y stepper)
                w = poly(PETER_FILL["B2"][0], y0)
                f = w if f is None else f.fuse(w)
            if f is not None:
                fills.append(f.extrude(V(0, y1 - y0, 0)))
                fill_faces += f.Faces
            if honeycomb:                                       # a clean outline near this depth (a section
                fs = None                                           # right on a step can self-intersect)
                for dy in (0.0, 0.08, -0.08, 0.16, -0.16, 0.22, -0.22):
                    cand = loops_at(m, ym + dy)
                    if cand and all(g.isValid() and g.extrude(V(0, -0.5, 0)).isValid() for g in cand):
                        fs = []
                        for g in cand:
                            g.translate(V(0, -dy, 0))
                            fs.append(g)
                        break
                if fs is None:
                    fs = [g.copy() for g in last_fs]
                    for g in fs:
                        g.translate(V(0, ym - g.BoundBox.Center.y, 0))
                last_fs = fs
                by_depth.append((ym, fs, [g for g in (f.Faces if f is not None else [])]))
                lay = [g.extrude(V(0, y1 - y0, 0)) for g in fs]
                for g in lay:
                    g.translate(V(0, y0 - ym, 0))
                layers += lay
                outlines += fs
        solid = Mesh.Mesh(m)
        for f in fills:
            solid.addMesh(Mesh.Mesh(f.tessellate(0.05)))
        out = {"solid": solid}
        if honeycomb:
            mine = [(x, z) for x, z in hole_xz if m.BoundBox.XMin - 1 < x < m.BoundBox.XMax + 1
                    and m.BoundBox.ZMin - 1 < z < m.BoundBox.ZMax + 1]
            body = layers[0].fuse(layers[1:] + fills).removeSplitter()
            for x, z in mine:                                       # screw holes + counterbores (floor 1.6 off the plate)
                body = body.cut(Part.makeCylinder(1.4, 20, V(x, -150, z), V(0, -1, 0)))
                body = body.cut(Part.makeCylinder(3.1, 10, V(x, -153.6, z), V(0, -1, 0)))
            # the lattice region: the cover's outermost outline over all depths (+ the fills), so the solid
            # `border` is the same width all round
            yp = -154.0
            flat = []
            # representative depths only (fusing every slab's outline fragments on B): the plate-side slab (B's
            # standoffs reach highest there) and the slab with the biggest outline (B's face plate / T's back)
            first = by_depth[0]
            widest = max(by_depth, key=lambda t: sum(g.Area for g in t[1]))
            filled = max(by_depth, key=lambda t: sum(g.Area for g in t[2]))     # (the plate-side slab has a relief)
            for g in first[1] + widest[1] + widest[2] + filled[2]:
                g = g.copy()
                g.translate(V(0, yp - g.BoundBox.Center.y, 0))
                flat.append(g)
            # union of all the outlines, done in 3D (2D face fuses dropped the fills): 1 mm prisms, fused, sliced
            prisms = []
            for g in flat:
                pr = g.extrude(V(0, 1.0, 0))
                if pr.isValid() and pr.Volume > 1.0:
                    pr.translate(V(0, -0.5, 0))
                    prisms.append(pr)
            prisms.sort(key=lambda pr: -pr.Volume)
            un = prisms[0]
            for pr in prisms[1:]:                                   # one at a time: skip one that won't fuse
                try:
                    un = un.fuse(pr)
                except Exception:
                    continue
            try:
                un = un.removeSplitter()
            except Exception:
                pass                                                # (the slice below doesn't need it)
            lattice_face = Part.Face(max(un.slice(V(0, 1, 0), yp), key=lambda w: Part.Face(w).Area))
            cells = core.honeycomb_cells(lattice_face, V(0, 8.0, 0), cell=cell, wall=wall, wall_in=border,
                                         keep=[(x, yp, z) for x, z in mine])
            out["honeycomb"] = body.cut(cells)
        res[tag] = out
    return res


# Jackpot3 lid fan mount (2026-10-19, from parts/jackpot3/Jackpot3_Lid.step mapped onto the STL: STL = (x + 259.714,
# -z + 217.654, y - 18.6), 259 of 263 vertices matched): a 38 mm opening in the lid's top with a 32 mm 4-hole
# pattern (40 mm fan) and two diagonal M3 holes 57 mm apart for a 5015 blower (Printables 1434650: "the 5015 shown
# uses 2 M3x20mm"). Print coords; axis points out of the lid (inside is -axis).
JP3_FAN = dict(c=(158.552, 99.062, 63.700), axis=(-0.3256, -0.9455, 0.0),
               holes=((139.155, 107.145, 44.402), (179.022, 93.417, 83.202)))
# the lid's two corner screw holes (3.1, in a 2.4 wall, on two differently sloped faces - the axis-aligned mesh hole
# finder only saw one; user 2026-10-19: "the case is missing a screw"). Print coords, axis out of the lid.
JP3_LID_SCREWS = (((67.405, 119.747, 119.900), (-0.1736, -0.9848, 0.0)),
                  ((180.015, 91.672, 5.650), (-0.3256, -0.9455, 0.0)))
# Jackpot3 board (user's EasyEDA OBJ, private/jackpot3_board: 10 mil units -> scale 0.254; board frame = OBJ min corner,
# PCB 99.7 x 79.7 x 2.54 at z 1.16-3.70, no drilled holes in the export). It lies on the box's four M3 lugs (d 2.84,
# axes tilted 10 deg about print z: normal (-sin 10, cos 10, 0)); lug tops on n.p = 86.56 (86.55 / 86.58), hole centres
# at t = 88.97 / 162.10 along (cos 10, sin 10, 0) and print z 15.9 / 108.9 -> 73.1 x 93.0, i.e. 3.3 mm in from each
# board edge (STL sections, 2026-10-19). The board's long side runs along print z; it is centred on the four holes.
JP3_BOARD = dict(obj="jackpot3.obj", scale=0.254, centre=(49.85, 39.85), pcb_z=(1.16, 3.70),
                 tilt=10.0, plane=86.56, t_mid=125.535, z_mid=62.4,
                 # top silkscreen: EasyEDA SVG (user 2026-10-19), same units; x = X - 4021.2104, y = 3271.9664 - Y
                 # (the OBJ's min corner, SVG y down) - fclib.art.svg_layer_mesh; clipped to the PCB
                 silk="jackpot3_silk.svg", svg_origin=(4021.2104, 3271.9664), pcb_size=(99.69, 79.70))


def ident():
    return ((1, 0, 0), (0, 1, 0), (0, 0, 1))


# lever side of each endstop (V1E docs): Z "lever faces away from the flat side" (yze2), Y "arm facing out"
# (yze9), X "lever opens to the bottom" (cq) - used only when both ways round clear the part equally
# what trips each endstop and which way the switch moves toward it when its axis homes (V1E: Y homes to Y min -
# the lever's rounded tip meets the M3 stop screw in the front holder, yb85; X to X min - the core runs to the
# Min end; Z up - the rising carriage / XZ plate meets the switch on the Z stop, yzw9). switch_frame picks the
# orientation whose lever tip, moved that way, runs into the striker first (rays from the rounded tip).
SWITCH_HOME = {"Endstop_X": ((-1, 0, 0), ("XZ_Plate_Min", "Brace_1", "Z_Stub_Min", "YZ_Plate_Min", "ZStop_Min")),
               "Endstop_Y_Min": ((0, -1, 0), ("Y_Belt_MinF",)), "Endstop_Y_Max": ((0, -1, 0), ("Y_Belt_MaxF",)),
               "Endstop_Z_Min": ((0, 0, -1), ("MGN12H_Min", "XZ_Plate_Min")),
               "Endstop_Z_Max": ((0, 0, -1), ("MGN12H_Max", "XZ_Plate_Max"))}
SWITCH_TIP = {"Endstop_X": (0, 0, -1)}       # ties only: cq "lever opens to the bottom" (free tip below the pivot)


def switch_frame(host, hint_pl, home=None, scene=None, name="", tip=None):
    """Placement + hand for hw.omron_ss_gl13 on its two M2.5 holes in the printed part `host` (mesh), found near
    a rough placement `hint_pl` (2026-10-19: the old eyeballed switches sat ~5 mm off their holes and their
    screws ran through solid plastic). Body on the face where the holes open, holes centred. Of the four ways
    (turned end for end x turned over): least part material in the body, lever and tabs; then - home =
    (direction the switch moves toward its striker, striker name prefixes), scene = {name: shape} - the one whose
    lever's rounded tip, moved that way, meets a striker first and soonest. -> (placement, hand, note)"""
    import FreeCAD as App
    from fclib import fasteners as fx, mesh
    V = App.Vector
    c = hint_pl.multVec(V(0, 0, 3.2))
    ax = hint_pl.Rotation.multVec(V(0, 0, 1))
    holes = mesh.holes_near(host, c, ax, rmax=1.6, rmin=0.8)
    best = None
    for i, (a1, b1, d1, n1) in enumerate(holes):
        for a2, b2, d2, n2 in holes[i + 1:]:
            gap = ((a2 - a1) - d1 * (a2 - a1).dot(d1)).Length
            if abs(gap - 9.6) < 0.6 and abs(d1.dot(d2)) > 0.99:
                mid = (a1 + a2) * 0.5
                if best is None or (mid - c).Length < (best[0] - c).Length:
                    best = (mid, a1, b1, a2, b2, d1)
    if best is None:
        return None, 1, "no M2.5 pair found"
    mid, a1, b1, a2, b2, d = best
    # the switch sits on the face where the holes open: of the two hole ends, the one with no part material
    # just past it, on the axis and round the holes (the other end is blind or runs on into the part)
    def face_at(p, o):                                 # where the part ends just past p (None: it goes on)
        ln = fx.Line({"h": host}, p, o)
        iv = [(a, b) for r in (0.0, 1.8) for a, b in ln.solid("h", r, 8) if a < 3.0 and b > -0.5]
        if any(b > 1.0 for a, b in iv):
            return None
        return p + o * max([b for a, b in iv] + [0.0])
    face, out = None, None
    for p, o in (((a1 + a2) * 0.5, d * -1), ((b1 + b2) * 0.5, d)):
        f = face_at(p, o)
        if f is not None:
            face, out = f, o
            break
    if face is None:
        return None, 1, "no open face"
    x = a2 - a1
    x = x - out * x.dot(out)
    x.normalize()
    opts = []
    from fclib import hw
    g = hw.SS_GL13
    y0, y1 = -g["hole_in"], g["body"][1] - g["hole_in"]
    near = {}
    if scene:
        c0 = face
        for n, sh in scene.items():
            bb = sh.BoundBox
            if n.startswith("Endstop") or not bb.isValid():
                continue
            q = App.Vector(min(max(c0.x, bb.XMin), bb.XMax), min(max(c0.y, bb.YMin), bb.YMax), min(max(c0.z, bb.ZMin), bb.ZMax))
            if (q - c0).Length < 120.0 or (home and n.startswith(home[1])):   # strikers at any distance
                near[n] = sh

    def inside(pl, u, w, z0, z1):                       # part material along local z at (u, w), z0..z1
        ln = fx.Line({"h": host}, pl.multVec(V(u, w, z0)), out)
        return sum(max(0.0, min(b, z1 - z0) - max(a, 0.0)) for a, b in ln.solid("h", 0.0))

    def tip_hits(pl, hand):                             # rays from the rounded tip along the homing direction
        if not home or not near:
            return 0.0, 1e9, ""
        hd, strikers = App.Vector(*home[0]), home[1]
        yt = y1 + 0.35 + g["lever_t"] / 2 + g["tip_rise"]
        rx, ry = g["arch"]
        cx = hand * g["tip_x"] - hand * rx              # the arch ("simulated roller"): sample its outer face
        t2 = g["lever_t"] / 2
        good, dist, first = 0, 1e9, {}
        pts = [(cx + hand * (rx + t2) * math.cos(math.radians(a)), yt + (ry + t2) * math.sin(math.radians(a)), z)
               for a in (30.0, 70.0, 110.0, 150.0) for z in (3.2 - 1.4, 3.2, 3.2 + 1.4)]
        for u, w, z in pts:
            p = pl.multVec(V(u, w, z))
            ln = fx.Line(near, p, hd, rmax=1.0)
            hit = None
            for n in ln.names:
                iv = [a for a, b in ln.solid(n, 0.0) if b > 0.05]
                if iv and (hit is None or max(iv[0], 0.0) < hit[1]):
                    hit = (n, max(iv[0], 0.0))
            if hit:
                first[hit[0]] = first.get(hit[0], 0) + 1
                if hit[0].startswith(strikers):
                    good += 1
                    dist = min(dist, hit[1])
        top = max(first, key=first.get) if first else "nothing"
        return good / len(pts), dist, top
    for sx in (1, -1):
        xx = x * sx
        yy = out.cross(xx)
        rot = App.Rotation(xx, yy, out, "ZXY")
        pl = App.Placement(face + out * 0.05, rot)
        body = sum(inside(pl, u, w, 0.0, 6.4) for u in (-9.0, -4.5, 0.0, 4.5, 9.0) for w in (y0 + 0.5, 2.0, y1 - 0.5))
        tabs = sum(inside(pl, u, w, 2.9, 3.5) for u in g["tab_x"] for w in (y0 - 2.0, y0 - 5.0))
        for hand in (1, -1):
            lev = sum(inside(pl, hand * u, w, 1.4, 5.0) for u, w in ((g["pivot_x"] - 2, y1 + 0.8), (0.0, y1 + 1.3),
                                                                      (g["tip_x"], y1 + 1.8),
                                                                      (g["tip_x"] - g["arch"][0], y1 + 1.8 + g["arch"][1])))
            clash = round(body + tabs + lev, 1)
            frac, dist, top = tip_hits(pl, hand)
            pref = -rot.multVec(V(-hand, 0, 0)).dot(V(*tip)) if tip else 0.0     # pivot -> tip vs `tip`
            opts.append((clash > 1.5, -round(frac, 2), round(dist, 1), round(pref, 2), clash, pl, hand,
                         (body, tabs, lev), top))
    best = min(opts, key=lambda o: o[:5])
    return best[5], best[6], (f"holes {((a2 - a1) - d * (a2 - a1).dot(d)).Length:.2f} apart, clash body/tabs/lever "
                              f"{best[7][0]:.1f}/{best[7][1]:.1f}/{best[7][2]:.1f}, hand {best[6]:+d}, lever edge "
                              f"{tuple(round(v, 2) for v in best[5].Rotation.multVec(V(0, 1, 0)))}, tip "
                              f"{tuple(round(v, 2) for v in best[5].Rotation.multVec(V(-best[6], 0, 0)))}, meets "
                              f"{best[8]} after {best[2]:.1f} mm ({-best[1]:.0%} of rays)")


# ---- what moves with what (the web viewer and the hose checks) ---------------------------------------------
# "table" never moves, "gantry" moves in Y (YZ plates and what's on them), "beam" in Y + Z, "core" in X + Y + Z
MOTION_BEAM = ("XZ_Plate", "Z_Stub", "Z_Nut", "Z_BrassNut", "MGN12H", "Brace", "X_Rail", "StrutPlate", "Temp_Strut",
               "X_Belt", "Belt_X", "Hose_", "Jackpot3", "PSU", "Vac_Hose")
MOTION_CORE = ("Core", "Tool_Mount", "Dust_", "Router", "Bristles", "X_Stepper", "X_Pulley", "X_Idler",
               "Bearing_Core", "Endstop_X", "TouchPlate")
MOTION_TABLE = ("TableMDF", "Y_Belt_", "Y_Rail", "Y_Clip", "Belt_Y")


def motion(name):
    """Which carriage a part rides: 'core', 'beam', 'table' or 'gantry' (by name; fasteners are named
    after the part they hold, so they follow it). 'stretch': a straight Y belt run from a fixed holder to the
    moving gantry (Belt_Y_*_Front/Back; the viewer scales it in Y about its holder end)."""
    if name.startswith("Belt_Y_") and name.endswith(("_Front", "_Back")):
        return "stretch"
    if name.startswith("Belt_Y_") and name.endswith("_Wrap"):
        return "gantry"
    if name in ("Belt_X_Min", "Belt_X_Max"):      # X belt runs: fixed to the beam, stretched along X by the core
        return "stretch_x"
    if name == "Belt_X_Wrap":
        return "core"
    if name.startswith(MOTION_CORE):
        return "core"
    if name.startswith(MOTION_BEAM):
        return "beam"
    if name.startswith(MOTION_TABLE):
        return "table"
    return "gantry"


# ---- vacuum hose -------------------------------------------------------------------------------
# Fulton 2-1/2" x 20' clear PVC dust collection hose, steel wire helix (user, 2026-10-18), from the Kobalt
# dust shoe to a vac on the floor off the Min end. Clamped in the Min-end holder; between the clamp and the
# core it works like a drag chain: the lower run lies in the holder trays out toward the Max end, U-turns
# up, and the upper run rides on top of it back to the core. The U-turn rolls at half the core's speed, so
# the length is fixed and the shape is rebuilt for every X (build.py for the parked pose, the web viewer
# live). KEEP hose_route / catmull_rom IN STEP WITH hoseRoute / CatmullRomCurve3 in
# exports/web/LowRider4.html.
HOSE = dict(
    od=73.0,          # 2.5" ID wire hose, ~73 OD (GUESS - MEASURE YOURS); it threads into the shoe's 69 mm socket
    cuff_in=9.0,      # how far it goes down into the socket (the 69 mm part is 8.9 deep)
    port_kobalt=(70.6, -58.16, 73.98),   # top of the dust shoe's hose socket (d 60.6, 69 at the top), Kobalt frame
    clear=6.0,        # air under the hose where it crosses the router's top
    tie_y_back=20.7,  # the hose lies lengthwise (along X) on the core's top, between the two zip-tie hole pairs
                      # (each pair: a hole in front of the top's ridge at Y 712 and one behind it at ~743, joined by
                      # a tunnel under the top skin, at X 485 / 532): axis this far in front of the core's back
    tray_y_d=157.72,  # hose axis where it rests in the holder trays, D x (machine Y 793.0): a 73 mm circle lowered
                      # into the four tray sections settles on the front curl + back lip (2026-10-18)
    tray_floor_d=109.68,  # ...at D y = this + od/2 (machine Z 196.8 + 0.15 at the parked pose)
    pitch=60.0,       # control point spacing along the runs
    loop_r=50.0,      # U-turn half-width (centre line, X), widened when a big bow round a plate would tighten it
    uturn_gap=5.0,    # at full +X travel the U-turn starts this far past the core's end (user, 2026-10-18: keep it
                      # within about the machine's end; it bows round the Max-end plates instead of hanging past
                      # them - reaches about X 1019, the table edge is 1016)
    rise_r=60.0,      # radius of the bend from straight up out of the socket to heading back over the core
    turn=55.0,        # radius of the turn from heading back (+Y) to heading +X along the core's top
    out_dx=190.0,     # length (X) of the upper run's S from the tie line back to the trays' line (shorter,
                      # with the shift scaled, when the U-turn is closer; the U-turn takes the rest)
    exit_x=10.0,      # hose axis X where it leaves the clamp holder (past the YZ_Min plate's top, X 36-93)
    drop=(-90.0, 35.0, -170.0),   # then off the table edge: offset (X, Y, Z) of the bend below the tray
    floor=(-130.0, None, -450.0),  # vac end, fixed: X, Y (None = middle of the table), Z below the table top
)


def hose_route(h, dx=0.0, dz=0.0):
    """Hose control points [(x, y, z, frame)] at the build pose with the core moved dx in X (and the beam
    dz in Z, which moves it against the YZ_Max plate the U-turn bows around). frame:
    'core' rides the core (X+Y+Z), 'beam' the beam (Y+Z), 'table' is fixed. h = HOSE plus the
    build's anchors: port (x, y, z) top of the shoe socket, top (Z of the router's top), over_z (axis
    Z going back over the core), tie_y / tie_z (axis along the core's top), core_end_dx (core's +X end
    from the port), tray_y, tray_z (axis), bump (x0, x1, z) = Jackpot3 lid (z = its top under the hose), bump_next (X of the first
    tray holder past it), clamp_x (the Min-end
    holder), run (fixed length of upper + lower run, see build.py), table_t, floor_y."""
    r, od, R = h["od"] / 2, h["od"], h["loop_r"]
    px, py, pz = h["port"][0] + dx, h["port"][1], h["port"][2] - h["cuff_in"]
    ztop = h["top"] + h["clear"] + r
    ty, tz = h["tray_y"], h["tray_z"]
    x0, x1, zl = h["bump"]
    zb = max(zl + r + 2.0, tz)                     # hose axis over the Jackpot3 lid (flat if it clears)

    xa, xn = h["clamp_x"], h["bump_next"]

    def tray_z(x):                                 # lower run: in the trays; straight up from the clamp holder
        if xa <= x < x0:                           # onto the Jackpot3 lid, flat across its top, straight down
            return tz + (zb - tz) * (x - xa) / (x0 - xa)   # to the next holder with a tray (bump_next)
        if x0 <= x <= x1:
            return zb
        if x1 < x < xn:
            return zb + (tz - zb) * (x - x1) / (xn - x1)
        return tz

    def run_xs(hi, lo):                            # sample points hi -> lo; 30 mm either side of each corner of
        cor = (xn, x1, x0, xa)                     # the straight runs, so the hose rounds them (the short rise
        brk = [b for b in (xn - 30, xn + 30, x1 - 30, x1 + 30, x0 + 30, xa)   # from the clamp onto the lid
               if lo <= b < hi]                    # is one S-bend: clamp point, then 30 mm onto the lid)
        xs, x = [], hi
        while x > lo:
            if all(abs(x - b) > 40 for b in cor) and all(abs(x - b) > 25 for b in brk):
                xs.append(x)
            x -= h["pitch"]
        return sorted(xs + brk, reverse=True)
    # up out of the socket beside the router, back over the core's Min side, a turn to +X, lengthwise
    # along the core's top between the two zip-tie pairs, off its +X end and an S back to the trays' line
    # (user markup, 2026-10-18)
    Rb, T, L = h["rise_r"], h["turn"], h["out_dx"]
    zc, yh, zr = h["over_z"], h["tie_y"], h["tie_z"]
    pts = [(px, py, pz, "core"), (px, py, (pz + zc - Rb) / 2, "core")]
    for k in range(5):                             # straight up -> heading back (+Y), radius Rb
        a = math.radians(22.5 * k)
        pts.append((px, py + Rb * (1 - math.cos(a)), zc - Rb + Rb * math.sin(a), "core"))
    for k in range(5):                             # heading back -> heading +X, radius T, centre (px + T, yh - T)
        a = math.radians(180 - 22.5 * k)
        pts.append((px + T + T * math.cos(a), yh - T + T * math.sin(a), zc + (zr - zc) * k / 4, "core"))
    xe = px + h["core_end_dx"]                     # the core's +X end
    # (along the top over both tie pairs to the core's end xe, then the upper run: sampled together below)
    zt = zr                                        # upper run level where it leaves the core / tops the U-turn

    # The upper run lies on top of the lower one (user, 2026-10-18) except at the bend: off the core it
    # slides over to the trays' line (a cosine S, up to L long) and settles onto the lower run, and it
    # rises back to the core-top level only over the last Ld before the U-turn. When the U-turn is close
    # (core near +X) the S is shortened with its shift scaled by the square of its length (the U-turn twists
    # the rest) and the dip shrinks with the square of the room too, so no bend gets tighter than with room to spare.
    ch, Ld = h["uturn_gap"], L                      # Ld: the upper run settles / rises back over this length -
                                                   # the same as the S, so it moves straight onto its rest
                                                   # spot (a quicker drop dips into the upper X rail)
    xu = max(xe + ch, (h["run"] + xa + xe) / 2)   # U-turn: upper (xu - xe) + lower (xu - xa) = run; at full +X
    g = xu - xe                                    # travel it starts right at the core's end
    Ly = min(L, g)
    Af = (Ly / L) ** 2                             # share of the S's shift made before the U-turn (curvature ~
    dip = min(1.0, (g / (2 * Ld)) ** 2)           # shift / Ly^2, so the shift scales with Ly^2)
    ry_, rz_, rr_ = h["rail_up"]

    def nest(zl):                                  # where the upper run rests: on the lower hose (axis ty, zl)
        ay, az, by, bz = ty, zl, ry_, rz_          # and against the beam - the upper X rail (user, 2026-10-18:
        ra, rb = od + 1.0, r + rr_ + 1.0           # "laying against the beam on top of the other hose")
        d = math.hypot(by - ay, bz - az)
        a_ = (ra * ra - rb * rb + d * d) / (2 * d)
        hh = math.sqrt(max(ra * ra - a_ * a_, 0.0))
        py_, pz_ = ay + a_ * (by - ay) / d, az + a_ * (bz - az) / d
        return py_ + hh * (bz - az) / d, pz_ - hh * (by - ay) / d   # the upper of the two circle intersections

    def S(u):
        return (1 - math.cos(math.pi * min(max(u, 0.0), 1.0))) / 2

    def S5(u):                                     # smootherstep: no curvature at either end, so the slide-over
        u = min(max(u, 0.0), 1.0)                  # adds nothing to the U-turn's bend where they meet
        return u * u * u * (u * (6 * u - 15) + 10)
    yu = yh + (nest(tray_z(xu))[0] - yh) * Af
    # The U-turn: half an ellipse in the plane through the X axis and the line from its top (yu, zu) to its
    # bottom (ty, tz) - tilted when the core is near +X and the upper run hasn't reached the trays' line.
    # It must pass outside the Max-end plates' top back edges (h["plates"]: x0, x1, back Y, top Z, frame;
    # a "gantry" plate doesn't ride the beam's Z travel, so it sits -dz in this frame): as the loop comes
    # within 40 mm of a plate, its top lifts clear of that plate's top and its middle bows out round the edge.
    reach = lambda x0: min(1.0, max(0.0, (xu + R + r - x0 + 40) / 40))
    zu = zt
    for qx0, qx1, ey, ez, fr in h["plates"]:   # (not x0/x1: those are the lid's)
        ez = ez - dz if fr == "gantry" else ez
        if ez + r + 3 > zt:
            zu = max(zu, zt + (ez + r + 3 - zt) * reach(qx0))
    dyz = (ty - yu, tz - zu)
    Lc = math.hypot(*dyz)
    u = (dyz[0] / Lc, dyz[1] / Lc)
    nv = (-u[1], u[0])                             # in-plane normal: the outside (+Y +Z) of the turn
    bulge = 0.0
    for qx0, qx1, ey, ez, fr in h["plates"]:   # (not x0/x1: those are the lid's)
        ez = ez - dz if fr == "gantry" else ez
        cy_, cz_ = ey - yu, ez - zu
        sc, tc = nv[0] * cy_ + nv[1] * cz_, (u[0] * cy_ + u[1] * cz_) / Lc
        if 0 < tc < 1 and sc > -(r + 3):           # the plate's body lies on the -nv side of its edge: pass
            need = (r + 3 + sc) / math.sqrt(max(0.2, 1 - (1 - 2 * tc) ** 2))   # outside it with r + 3 to spare
            bulge = max(bulge, need * reach(qx0))
    x0s = px + T                                   # one evenly spaced run of samples, about 20 apart, from the end
    nseg = max(2, math.ceil((xu - x0s) / 20.0))    # of the turn onto the core to the U-turn's top: flat on the
    for i in range(1, nseg):                       # core's top up to its end (xe), then the upper run's S and dip
        x = x0s + (xu - x0s) * i / nseg            # (uneven spacing makes the spline kink)
        if x <= xe:
            pts.append((x, yh, zr, "core"))
            continue
        t = x - xe
        ys, zs = nest(tray_z(x))                   # lying on the lower run, against the beam
        zl = zt + (zu - zt) * S(t / g)             # the run's own level: core top -> the U-turn's top
        pts.append((x, yh + (ys - yh) * Af * S5(t / Ly), zl - (zl - zs) * dip * S5(t / Ld) * S5((g - t) / Ld), "beam"))
    # bend radius at the U-turn's top and bottom = Rx^2 / |dyz/2 + 2 bulge nv|: widen the loop (X) when a big
    # bow would make it tighter than ~40 mm
    acc = math.hypot(dyz[0] / 2 + 2 * bulge * nv[0], dyz[1] / 2 + 2 * bulge * nv[1])
    Rx = max(R, math.sqrt(40.0 * acc))
    for k in range(0 if g >= 30 else 1, 13):       # (right at the core's end the top point and the run's last
        a = math.radians(90 - 15 * k)              # point are too close: skip the top, it spikes the bend)
        f = (1 - math.sin(a)) / 2                  # 0 at the top, 1 at the bottom
        b = bulge * math.cos(a) ** 2               # full at the middle, no kink where it meets the runs
        pts.append((xu + Rx * math.cos(a), yu + f * dyz[0] + b * nv[0], zu + f * dyz[1] + b * nv[1], "beam"))
    pts.append((xu - 40, ty, tray_z(xu - 40), "beam"))   # level out of the U-turn
    for x in run_xs(xu - 100.0, max(xa, h["exit_x"] + 60)):  # lower run in the trays back to the clamp (xa)
        pts.append((x, ty, tray_z(x), "beam"))
    pts.append((h["exit_x"], ty, tray_z(h["exit_x"]), "beam"))
    ddx, ddy, ddz = h["drop"]
    pts.append((h["exit_x"] + ddx * 0.55, ty + ddy * 0.4, tz + ddz * 0.25, "beam"))
    pts.append((h["exit_x"] + ddx, ty + ddy, tz + ddz, "beam"))
    fx, _, fz = h["floor"]
    pts.append((h["exit_x"] + fx, h["floor_y"], h["table_t"] + fz, "table"))
    return pts


# Router cord + cable sleeve along the vac hose (user 2026-10-19). The cord leaves the router's strain relief (Min
# end, curving back), runs back round the Min side of the hose's arch, then lies on the core's top right behind the
# hose with the sleeve behind it (X motor / X endstop / touch plate wires out of the core), both in the same zip ties
# as the hose through the top's tie slots. Off the core's +X end they move into the pocket where the upper run rests
# on the lower one against the upper X rail (cord under the upper hose, the sleeve beside it on the rail side - it
# crosses over the cord on the way, lifted by `lift`), round the inside of the U-turn, and lie on the lower run toward
# the beam. Each cable's place round the hose: offsets (y, z) from the hose's axis on the core (CORE_TOP_SEATS:
# resting on the core's sloped top behind the ridge the hose sits on, measured from Core.stl at X 485-532), and
# directions + radii in the pocket / lower run from hose_pocket. Low-poly tubes; the viewer rebuilds them with the
# hose (cordRoute in the page mirrors cord_route).
CORE_TOP_SEATS = {"cord": (10.0, -39.3), "sleeve": (19.5, -44.5)}   # (y, z) from the hose axis on the core's top
CORD = dict(d=7.4,                 # Kobalt cord OD (user-measured 2026-10-19)
            step=15.0,             # spacing of its points along the hose
            lead=10.0,             # straight run out of the strain relief stub before it heads back
            wrap=80.0,             # length of hose over which it moves from the core's top into the pocket
            turn_blend=90.0,       # +/- this along the hose round the U-turn's tip it moves from the upper to the lower run
            lift=0.0)              # extra distance off the hose mid-way into the pocket (to pass over another cable)
# The sleeve's wires go to the Jackpot3 controller (user 2026-10-19): it leaves the lower run just past the box's +X
# end and drops into the box through the 12 x 20 opening in that end wall (Jackpot3_Box STL frame: the opening's centre
# on its z = 0 face, inward +z; Y 731-743, Z 115-135 at the build pose - the 29 x 9 slot beside it is the other choice).
JP3_CABLE_ENTRY = dict(p=(156.94, 108.35, 0.2), d=(0.0, 0.0, 1.0))
# ...on its way down it passes through the big hole in the brace just past the box's +X end (user 2026-10-19), not a
# straight drop: the hole's centre in the Brace_29p5 STL frame (~61 x 69, through along its z = machine -X, 18 thick).
BRACE_BIG_HOLE = dict(c=(157.73, 146.86, 9.0), axis=(0.0, 0.0, 1.0), half=9.0,
                      rest=(-16.5, -27.0))   # the 13 mm sleeve resting on the hole's bottom (user): machine (dY, dZ)
                                             # from its centre - the bottom is lowest (Z 129) at Y 715-728, toward the front
SLEEVE = dict(CORD, d=13.0,        # braided sleeve over the core's wires (GUESS - MEASURE YOURS)
              wrap=160.0, lift=11.0)   # crosses over the cord into the pocket: a longer move, lifted by about the
                                       # cord's diameter + clearance


def cord_route(curve, h, c, tip=None, tip2=None, dx=0.0, pose=(0.0, 0.0, 0.0)):
    """Control points of a cable tied along the hose: `curve` = the hose's sampled centre line (dense [(x, y, z)],
    at the pose), h = the hose dict (port, turn, od, core_end_dx), c = the cable (CORD / SLEEVE + core_side / core_r,
    up_dir / up_r, lo_dir / lo_r: its direction + distance from the hose's axis on the core's top, in the pocket and
    on the lower run). By length along the hose: core from the start of the run along the core's top, blended over
    `wrap` after the core's +X end to the pocket (lifted by `lift` mid-way), across the U-turn's tip to the lower run.
    tip / tip2 (the router's cord stub end and a point further along it): it starts there, runs `lead` on, then
    straight back (+Y) to the first tied point; without them it starts on the hose (the sleeve, out of the core).
    c["exit"] = {x, p, d, via} (the sleeve): it leaves the lower run where it passes x, eases down to and through the
    `via` points
    (a brace's hole) and on to the opening at p (all at the build pose; moved by `pose` = the beam's (0, dy, dz)),
    stopping at the wall (the wires go in along d)."""
    x_start = h["port"][0] + dx + h["turn"] + 10.0
    xe = h["port"][0] + dx + h["core_end_dx"]
    i0 = next(i for i, p in enumerate(curve) if p[0] >= x_start)
    i_turn = max(range(len(curve)), key=lambda i: curve[i][0])
    i_end = next((i for i in range(i0, i_turn) if curve[i][0] >= xe), i_turn)
    arc = [0.0]
    for i in range(1, len(curve)):
        arc.append(arc[-1] + math.dist(curve[i], curve[i - 1]))

    def square(v, t):                              # v made square to the unit tangent t, unit length (or None)
        k = sum(x * y for x, y in zip(v, t))
        w = [x - k * y for x, y in zip(v, t)]
        wl = math.sqrt(sum(x * x for x in w))
        return [x / wl for x in w] if wl > 1e-6 else None
    # a frame carried along the hose from the start of the core-top run (e1 up there), turning with it: each
    # cable's place is an angle in it, so they follow the hose round the U-turn and down the drop in order
    tans, e1s = {}, {}
    e1 = None
    for i in range(i0, len(curve)):
        a, b = curve[max(i - 1, 0)], curve[min(i + 1, len(curve) - 1)]
        tn = math.dist(a, b) or 1.0
        t = [(q - p) / tn for p, q in zip(a, b)]
        e1 = square(e1 if e1 is not None else (0.0, 0.0, 1.0), t) or e1
        tans[i], e1s[i] = t, e1

    def ang(v, i):                                 # angle of world direction v round the hose at sample i
        t, e = tans[i], e1s[i]
        e2 = (t[1] * e[2] - t[2] * e[1], t[2] * e[0] - t[0] * e[2], t[0] * e[1] - t[1] * e[0])
        return math.atan2(sum(x * y for x, y in zip(v, e2)), sum(x * y for x, y in zip(v, e)))
    at = lambda s_: min(range(i0, len(curve)), key=lambda i: abs(arc[i] - s_))
    a1, a2 = arc[i_end], arc[i_turn]
    keys = [a1, a1 + c["wrap"], a2 - c["turn_blend"], a2 + c["turn_blend"]]
    for k in range(1, len(keys)):                  # (core near +X: squeeze the blends, keep them in order)
        keys[k] = max(keys[k], keys[k - 1])
    th = [ang(c["core_side"], i0), ang(c["up_dir"], at(keys[1])), None, ang(c["lo_dir"], at(keys[3]))]
    th[2] = th[1]
    for k in range(1, len(th)):                    # (no jumps across +-180)
        while th[k] - th[k - 1] > math.pi:
            th[k] -= 2 * math.pi
        while th[k] - th[k - 1] < -math.pi:
            th[k] += 2 * math.pi
    rads = [c["core_r"], c["up_r"], c["up_r"], c["lo_r"]]
    pts, acc = [], c["step"]
    for i in range(i0, len(curve)):
        if i > i0:
            acc += arc[i] - arc[i - 1]
        if acc < c["step"] and i != len(curve) - 1:
            continue
        acc = 0.0
        s = arc[i]
        k = next((k for k in range(len(keys)) if s < keys[k]), len(keys))
        if k == 0:
            q, r = th[0], rads[0]
        elif k == len(keys):
            q, r = th[-1], rads[-1]
        else:
            w = (s - keys[k - 1]) / ((keys[k] - keys[k - 1]) or 1.0)
            q = (1 - w) * th[k - 1] + w * th[k]
            r = (1 - w) * rads[k - 1] + w * rads[k] + (c["lift"] * math.sin(math.pi * w) if k == 1 else 0.0)
        t, e = tans[i], e1s[i]
        e2 = (t[1] * e[2] - t[2] * e[1], t[2] * e[0] - t[0] * e[2], t[0] * e[1] - t[1] * e[0])
        m = [math.cos(q) * x + math.sin(q) * y for x, y in zip(e, e2)]
        pts.append(tuple(p + v * r for p, v in zip(curve[i], m)))
        if c.get("exit") and i > i_turn and pts[-1][0] < c["exit"]["x"]:
            break
    if c.get("exit"):                              # off the lower run, down into the box's opening
        e = [a + b for a, b in zip(c["exit"]["p"], pose)]
        d = c["exit"]["d"]
        via = [tuple(a + b for a, b in zip(v, pose)) for v in c["exit"].get("via", ())]
        last = pts[-1]
        p_out = tuple(a - b * 12.0 for a, b in zip(e, d))
        first = via[0] if via else p_out
        n = max(1, int(math.dist(last, first) / 35.0))    # a gradual descent (eased) to the first via point
        for k in range(1, n + 1):
            f = k / (n + 1)
            e_ = (1 - math.cos(math.pi * f)) / 2
            pts.append((last[0] + (first[0] - last[0]) * f, last[1] + (first[1] - last[1]) * e_,
                        last[2] + (first[2] - last[2]) * e_))
        pts += via
        pts += [p_out, tuple(a - b * 1.0 for a, b in zip(e, d))]   # the sleeve stops at the wall, the wires go in
    if tip is not None:                            # from the router: out of the stub, then straight back
        td = [b - a for a, b in zip(tip, tip2)]
        tl = math.sqrt(sum(v * v for v in td))
        p1 = tuple(t + v / tl * c["lead"] for t, v in zip(tip, td))
        pts = [tuple(tip), p1, (p1[0], pts[0][1], (p1[2] + pts[0][2]) / 2)] + pts
    return pts


def cable_places(h, cord_d, sleeve_d):
    """Each cable's place round the hose for cord_route: {"cord": {core_side, core_r, up_dir, up_r, lo_dir, lo_r},
    "sleeve": {...}}. Core: CORE_TOP_SEATS. Pocket (where the upper run rests on the lower one against the upper X
    rail, as hose_route's nest): the cord in the circle touching both hoses on the rail side; the sleeve touching the
    cord and the upper hose (away from the lower) / the cord and the lower hose (away from the upper, toward the beam)."""
    r, od = h["od"] / 2, h["od"]
    ty, tz = h["tray_y"], h["tray_z"]
    ry, rz, rr = h["rail_up"]

    def meet(c1, r1, c2, r2):                      # the two intersections of two circles
        d = math.dist(c1, c2)
        a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
        hh = math.sqrt(max(r1 * r1 - a * a, 0.0))
        p = (c1[0] + a * (c2[0] - c1[0]) / d, c1[1] + a * (c2[1] - c1[1]) / d)
        return [(p[0] + s * hh * (c2[1] - c1[1]) / d, p[1] - s * hh * (c2[0] - c1[0]) / d) for s in (1, -1)]
    lo = (ty, tz)
    up = max(meet(lo, od + 1.0, (ry, rz), r + rr + 1.0), key=lambda q: q[1])   # as hose_route's nest
    rc, rs = cord_d / 2 + 0.5, sleeve_d / 2 + 0.5
    pk = min(meet(up, r + rc, lo, r + rc), key=lambda q: math.dist(q, (ry, rz)))            # the rail side
    s_up = max(meet(up, r + rs, pk, rc + rs), key=lambda q: math.dist(q, lo))               # away from the lower
    s_lo = max(meet(lo, r + rs, pk, rc + rs), key=lambda q: math.dist(q, up))               # away from the upper
    unit = lambda q, o: (0.0, (q[0] - o[0]) / math.dist(q, o), (q[1] - o[1]) / math.dist(q, o))
    out = {}
    for name, p_up, p_lo in (("cord", pk, pk), ("sleeve", s_up, s_lo)):
        cy, cz = CORE_TOP_SEATS[name]
        out[name] = dict(core_side=(0.0, cy / math.hypot(cy, cz), cz / math.hypot(cy, cz)), core_r=math.hypot(cy, cz),
                         up_dir=unit(p_up, up), up_r=math.dist(p_up, up), lo_dir=unit(p_lo, lo), lo_r=math.dist(p_lo, lo))
    return out


def catmull_rom(pts, n=12):
    """Points along a centripetal Catmull-Rom curve through pts (three.js CatmullRomCurve3,
    'centripetal', open), n per span."""
    def sub(a, b): return [a[i] - b[i] for i in range(3)]
    def add(a, b): return [a[i] + b[i] for i in range(3)]
    def mul(a, s): return [a[i] * s for i in range(3)]
    def dsq(a, b): return sum((a[i] - b[i]) ** 2 for i in range(3))
    P = [list(p[:3]) for p in pts]
    out = []
    for k in range(len(P) - 1):
        p0 = P[k - 1] if k > 0 else add(sub(P[0], P[1]), P[0])
        p1, p2 = P[k], P[k + 1]
        p3 = P[k + 2] if k + 2 < len(P) else add(sub(P[-1], P[-2]), P[-1])
        dt0, dt1, dt2 = dsq(p0, p1) ** 0.25, dsq(p1, p2) ** 0.25, dsq(p2, p3) ** 0.25
        if dt1 < 1e-4: dt1 = 1.0
        if dt0 < 1e-4: dt0 = dt1
        if dt2 < 1e-4: dt2 = dt1
        out_s = []
        for i in range(3):
            t1 = ((p1[i] - p0[i]) / dt0 - (p2[i] - p0[i]) / (dt0 + dt1) + (p2[i] - p1[i]) / dt1) * dt1
            t2 = ((p2[i] - p1[i]) / dt1 - (p3[i] - p1[i]) / (dt1 + dt2) + (p3[i] - p2[i]) / dt2) * dt1
            c0, c1 = p1[i], t1
            c2 = -3 * p1[i] + 3 * p2[i] - 2 * t1 - t2
            c3 = 2 * p1[i] - 2 * p2[i] + t1 + t2
            out_s.append((c0, c1, c2, c3))
        for j in range(n if k < len(P) - 2 else n + 1):
            t = j / n
            out.append(tuple(c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 for c in out_s))
    return out
