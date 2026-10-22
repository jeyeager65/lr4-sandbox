# The FluidTouch pendant for the page (Part 18): the CrowPanel Advance 7" case (Top + Bottom) sitting in its table
# stand, meshed from the FreeCAD sources in the FluidTouch repo (MIT, the user's own - ours to ship, credited) and
# written to web/models/pendant/ as binary STLs (one per part, already placed in the pendant frame) + pendant.json (each
# part's triangle count and box, the screen's corners). tools/check_no_parts.py allows them (OWNED): the user's own.
#   python tools/run.py pipeline/pendant_meshes.py      (FLUIDTOUCH=<repo> if not D:/GitHub/FluidTouch)
# Pendant frame (mm): X along the stand (centred), Y from the stand's back face (0) toward the user (negative: the
# screen faces -Y, as the machine's front is at its Y min), Z up from the stand's base. The case sits in the cradle as
# the stand's profile holds it: its back on the back support, its edge on the floor, both 15 deg back from upright
# (ProfileSketch: floor (16.48, 5) -> (43.14, 12.14), back support up from (16.48, 5); 27.6 mm between the back and
# the front holder for the 27.2 mm case). Which way up the display's image runs in the case is a GUESS (case +Y up).
import json
import math
import os

import FreeCAD as App
import Mesh
import MeshPart

HERE = os.path.dirname(os.path.abspath(__file__))
FT = os.environ.get("FLUIDTOUCH") or "D:/GitHub/FluidTouch"
OUT = os.path.join(HERE, "..", "web", "models", "pendant")
TILT = 15.0                                   # cradle: back support + floor, deg from upright / level
CASE = {"back": 25.1697, "front": -2.0, "edge": -3.0, "xmid": (-3.0 + 180.4) / 2}   # case model: back z, screen z, bottom edge y
STAND_XMID = 92.0                             # stand -5 .. 189 (MirrorHalf about x = 92)
BACK_N, FLOOR_U = 17.21, 0.562                # the back support's line (n . p) and the floor's (u . p), stand Y / Z
OPENING = (8.85, 170.65, 7.35, 101.15)        # the Top's screen opening at its face (x0, x1, y0, y1), case mm
ACTIVE = (154.21, 85.92)                      # the 7" 800 x 480 panel's active area, mm (Elecrow's drawing)
DEFLECT = (0.25, 0.4)                         # mesh linear (mm) / angular (rad) deflection

c, s = math.cos(math.radians(TILT)), math.sin(math.radians(TILT))
n, u = (c, s), (-s, c)                        # stand (Y, Z): toward the front holder / up the back support


def case_to_stand(p):                         # case model point -> stand frame
    a = BACK_N + CASE["back"] - p.z           # the case's back on the back support; its z runs toward -n
    b = FLOOR_U + p.y - CASE["edge"]          # its bottom edge on the floor; its y runs up the slope
    return App.Vector(p.x - CASE["xmid"] + STAND_XMID, n[0] * a + u[0] * b, n[1] * a + u[1] * b)


def stand_to_pendant(p):                      # stand frame -> pendant frame: turned to face -Y, centred, back at Y 0
    return App.Vector(-(p.x - STAND_XMID), -p.y, p.z)


def mesh_of(shape, to):
    m = MeshPart.meshFromShape(Shape=shape, LinearDeflection=DEFLECT[0], AngularDeflection=DEFLECT[1], Relative=False)
    pts, facets = m.Topology
    return Mesh.Mesh(([to(App.Vector(*q)) for q in pts], facets))


os.makedirs(OUT, exist_ok=True)
case = App.openDocument(os.path.join(FT, "hardware", "case", "CrowPanelAdvance7Case.FCStd"), hidden=True)
stand = App.openDocument(os.path.join(FT, "hardware", "stand", "CrowPanelAdvance7Stand.FCStd"), hidden=True)
parts = {
    "case_top": (case.getObject("Body").Shape, lambda p: stand_to_pendant(case_to_stand(p))),
    "case_bottom": (case.getObject("Body001").Shape, lambda p: stand_to_pendant(case_to_stand(p))),
    "stand": (stand.getObject("Body").Shape, stand_to_pendant),
}
info = {"source": "https://github.com/jeyeager65/FluidTouch/tree/main/hardware", "license": "MIT", "parts": {}}
for name, (shape, to) in parts.items():
    m = mesh_of(shape, to)
    m.write(os.path.join(OUT, name + ".stl"))
    bb = m.BoundBox
    info["parts"][name] = {"tris": m.CountFacets, "bbox": [round(v, 2) for v in (bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax)]}
    print(f"{name}: {m.CountFacets} triangles, bbox {info['parts'][name]['bbox']}")

# the screen: the active area centred in the opening, 0.6 mm behind the bezel's face; corners in screen order
# (bottom-left, bottom-right, top-right, top-left as you look at it; case -x is the viewer's right with case +y up)
cx, cy = (OPENING[0] + OPENING[1]) / 2, (OPENING[2] + OPENING[3]) / 2
z = CASE["front"] + 0.6
w, h = ACTIVE[0] / 2, ACTIVE[1] / 2
corners = [(cx + w, cy - h), (cx - w, cy - h), (cx - w, cy + h), (cx + w, cy + h)]
info["screen"] = {"px": [800, 480], "corners": [[round(v, 3) for v in stand_to_pendant(case_to_stand(App.Vector(x, y, z)))] for x, y in corners]}
with open(os.path.join(OUT, "pendant.json"), "w", encoding="utf-8") as f:
    json.dump(info, f, indent=1)
print("screen", info["screen"]["corners"])
