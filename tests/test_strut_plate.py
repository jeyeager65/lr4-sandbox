# Golden test: freecad/strut_plate.py vs Vector76's SCAD run by OpenSCAD (local only - the SCAD isn't shipped).
#   python tools/run.py tests/test_strut_plate.py
# Same cases and goldens as test_strut_plate.js (tests/golden/, made by OpenSCAD when missing). Pass = every vertex
# of each outline lies within TOL of the matching outline on the other side, the areas agree, and the plate faces
# the build makes (true-circle holes) equal the ones it made from OpenSCAD's DXF (the old lr4.plate_faces): symmetric
# difference < 1e-4 mm^2 per mm of edge.
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "freecad"))
import strut_plate as SP  # noqa: E402

OPENSCAD = os.environ.get("OPENSCAD", r"C:\Program Files\OpenSCAD\openscad.com")
SCAD = os.path.join(ROOT, "vendor", "lr4_strut_plate_3d.scad")
GOLD = os.path.join(HERE, "golden")
TOL = 0.01

LENGTHS = [380, 450, 566, 567, 600, 700, 749, 750, 780, 830, 1000, 1200, 1500, 1800]
CASES = [dict(L=L, wing=w, dog=d, nb=0) for L in LENGTHS for w in (8, 11.5) for d in (0, 3.5)]
CASES += [dict(L=830, wing=11.5, dog=3.5, nb=6), dict(L=1200, wing=8, dog=6.35, nb=0)]


def fmt(v):
    return f"{v:g}"


def golden(c):
    os.makedirs(GOLD, exist_ok=True)
    f = os.path.join(GOLD, f"L{c['L']}_w{fmt(c['wing'])}_d{fmt(c['dog'])}_n{c['nb']}.dxf")
    if not os.path.exists(f):
        subprocess.run([OPENSCAD, "-o", f, "-D", f"strut_length={c['L']}", "-D", f"num_braces={c['nb']}",
                        "-D", f"dogbones={c['dog']}", "-D", f"front_wing_size={c['wing']}", "-D", "render_2d=true",
                        SCAD], check=True, capture_output=True)
    return read_loops(f)


def read_loops(path):
    """OpenSCAD 2D DXF (LINE entities only) -> closed loops [[(x, y), ...]]."""
    lines = open(path, encoding="utf-8").read().splitlines()
    segs, cur = [], None
    for code, val in zip(lines[0::2], lines[1::2]):
        code, val = code.strip(), val.strip()
        if code == "0":
            if cur and len(cur) == 4:
                segs.append(((cur["10"], cur["20"]), (cur["11"], cur["21"])))
            cur = {} if val == "LINE" else None
        elif cur is not None and code in ("10", "20", "11", "21"):
            cur[code] = float(val)
    key = lambda p: (round(p[0], 5), round(p[1], 5))
    nxt = {}
    for a, b in segs:
        nxt.setdefault(key(a), []).append(b)
    loops, used = [], set()
    for a, b in segs:
        if (key(a), key(b)) in used:
            continue
        loop, p = [a], b
        used.add((key(a), key(b)))
        while key(p) != key(loop[0]):
            loop.append(p)
            q = next(q for q in nxt[key(p)] if (key(p), key(q)) not in used)
            used.add((key(p), key(q)))
            p = q
        loops.append(loop)
    return loops


def area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def cen(r):
    return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) if l2 else 0.0
    return ((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2) ** 0.5


def hd(A, B):
    return max(min(seg_dist(p, B[i - 1], B[i]) for i in range(len(B))) for p in A)


def old_faces(loops):
    """What lr4.plate_faces made from OpenSCAD's DXF: per plate, outer loop + true-circle holes (bottom moved up)."""
    out = {}
    for name, (y0, y1) in (("front", (-30, 120)), ("bottom", (-130, -10))):
        mine = sorted((l for l in loops if y0 < cen(l)[1] < y1), key=lambda l: -area(l))
        shift = -SP.BOTTOM_Y if name == "bottom" else 0.0
        out[name] = SP.face([[(x, y + shift) for x, y in l] for l in mine], hole_d=5.3)
    return out


fails, worst, worst_face = 0, 0.0, 0.0
for c in CASES:
    g = golden(c)
    pl = SP.plates(c["L"], c["wing"], c["dog"], c["nb"])
    mine = [l for loops in SP._laid_out(pl) for l in loops]
    bad, cw = (f"loops {len(mine)} vs {len(g)}" if len(mine) != len(g) else ""), 0.0
    if not bad:
        left = list(g)
        for r in mine:
            cx, cy = cen(r)
            s = left.pop(min(range(len(left)), key=lambda i: (cen(left[i])[0] - cx) ** 2 + (cen(left[i])[1] - cy) ** 2))
            d = max(hd(r, s), hd(s, r))
            cw = max(cw, d)
            if d > TOL or abs(area(r) - area(s)) > 0.05:
                bad = f"loop at ({cx:.1f}, {cy:.1f}) off {d:.4f} mm, area {area(r):.3f} vs {area(s):.3f}"
                break
    if not bad:                                       # the build's faces, new vs old
        old = old_faces(g)
        for name in ("front", "bottom"):
            new = SP.face(pl[name], hole_d=5.3)
            diff = new.cut(old[name]).Area + old[name].cut(new).Area
            worst_face = max(worst_face, diff)
            if diff > 1e-4 * new.Length:               # OpenSCAD snaps to a grid (~0.005 mm at 1.8 m)
                bad = f"{name} face differs by {diff:.4f} mm^2 (areas {new.Area:.3f} vs {old[name].Area:.3f})"
    worst = max(worst, cw)
    n, _ = SP.braces(c["L"], c["nb"])
    tag = f"L={c['L']} wing={fmt(c['wing'])} dog={fmt(c['dog'])} n={c['nb']} (braces {n}, {len(mine)} loops)"
    if bad:
        fails += 1
        print("FAIL", tag, "-", bad)
    else:
        print("ok  ", tag, f"max dev {cw:.1e}")
print(f"{len(CASES) - fails}/{len(CASES)} pass, worst deviation {worst:.2e} mm, worst face difference "
      f"{worst_face:.2e} mm^2")
sys.stdout.flush()                                    # freecadcmd drops unflushed output on SystemExit
if fails:
    raise SystemExit(1)
