# LowRider4 - vacuum hose check over the whole travel, headless (seconds, not minutes):
#   python tools/run.py freecad/hosecheck.py (41 X positions x 3 beam heights)
# Uses the last build (build/LowRider4.FCStd + build/hose.json). For every pose it sweeps the hose
# centreline (lr4.hose_route + catmull_rom, exactly what build.py and the viewer draw) and reports:
#   - the tightest bend (centre-line radius; under the hose radius the tube folds on the inside)
#   - the hose length (should stay about constant: the hose doesn't stretch)
#   - each nearby part's clearance (fclib mesh.clearance: centreline to the part's triangles, minus the
#     hose radius; negative = cuts in), with every part moved with its own carriage (lr4.motion).

import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the repo (this script is in freecad/)
for p in (HERE,):                                   # freecad/ (with the vendored fclib)
    if p not in sys.path:
        sys.path.insert(0, p)
import FreeCAD as App                             # noqa: E402
from fclib import mesh                            # noqa: E402
import lr4                                        # noqa: E402

N_X = 41                                          # X positions, home trip .. Max-end stop
CUT_IN = 1.0                                      # flag a part the hose cuts into deeper than this (mm)
ALLOW = {"YZ_Plate_Max": 3.0, "Dust_Shoe_Kobalt": 2.5}   # the shoe: the ~73 mm hose threads into its 69 socket
THREADS = 12                                      # numpy releases the GIL in the heavy maths (Ryzen 9 3900X: 12 cores)
COARSE = 4                                        # centreline samples per span for clearance (bends use 12)
REPORT = 2.0                                      # list parts closer than this (mm); further ones aren't measured                     # the lower run lies against its back edge (the trays' line is
                                                  # 793, the plate's back 759.3: a 2.8 mm sliver by design)
SKIP_MM = 15.0                                    # hose skipped at its start: the cuff, threaded into the dust shoe

B = {"__file__": os.path.join(HERE, "build.py")}  # the build's parameters (cut area, parked pose)
src = open(B["__file__"], encoding="utf-8").read()
exec("IN = 25.4\n" + "\n".join(src.split("# ---- parameters", 1)[1].split("# ----------", 1)[0].splitlines()[1:]), B)
TRAVEL = json.load(open(os.path.join(ROOT, "build", "travel.json")))   # build.py: from the parked pose (lr4.STOPS)
DZS = (TRAVEL["z"][0], 0.0, TRAVEL["z"][1])       # beam lowest, parked, highest (Z travel)

t0 = time.time()
h = json.load(open(os.path.join(ROOT, "build", "hose.json")))
doc = App.openDocument(os.path.join(ROOT, "build", "LowRider4.FCStd"))
parts = []
for o in doc.Objects:
    if o.Name == "Vac_Hose" or o.TypeId not in ("Mesh::Feature", "Part::Feature"):
        continue
    s = o.Mesh if o.TypeId == "Mesh::Feature" else o.Shape
    if s.isNull() if hasattr(s, "isNull") else s.CountFacets == 0:
        continue
    parts.append((o.Name, s, lr4.motion(o.Name)))
r = h["od"] / 2
print(f"{len(parts)} parts loaded in {time.time() - t0:.0f} s")


def bend_min(c):
    best = (math.inf, None)
    for i in range(1, len(c) - 1):
        a, b, d = c[i - 1], c[i], c[i + 1]
        u = [b[j] - a[j] for j in range(3)]
        v = [d[j] - a[j] for j in range(3)]
        cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        ar = math.sqrt(sum(x * x for x in cr)) / 2
        if ar > 1e-9:
            best = min(best, (math.dist(a, b) * math.dist(b, d) * math.dist(a, d) / (4 * ar), b))
    return best


worst_bend, lengths, worst_part = (math.inf,), [], {}
t1 = time.time()
poses = []                                        # every pose's centreline first ...
for dz in DZS:
    for k in range(N_X):
        xpos = k / (N_X - 1)
        dx = TRAVEL["x"][0] + xpos * (TRAVEL["x"][1] - TRAVEL["x"][0])
        route = lr4.hose_route(h, dx, dz)
        c = lr4.catmull_rom(route, 12)
        cc = lr4.catmull_rom(route, COARSE)
        run_, i0 = 0.0, 0
        while i0 < len(cc) - 1 and run_ < SKIP_MM:
            run_ += math.dist(cc[i0], cc[i0 + 1])
            i0 += 1
        Pn = np.asarray(cc[i0:], float)
        poses.append((xpos, dx, dz, Pn, Pn.min(0), Pn.max(0)))
        rb = bend_min(c)
        if rb[0] < worst_bend[0]:
            worst_bend = (rb[0], tuple(round(x) for x in rb[1]), xpos, dz)
        lengths.append(sum(math.dist(a, b) for a, b in zip(c, c[1:])))


def offset(mo, dx, dz):
    return (dx, 0.0, 0.0) if mo == "core" else (0.0, 0.0, 0.0) if mo == "stretch_x" else (0.0, 0.0, -dz) if mo in ("gantry", "table", "stretch") else (0.0, 0.0, 0.0)


def check_part(item):
    """One part against every pose: cropped once to where the hose ever goes (in the part's own frame),
    then per pose to that pose's hose box."""
    name, s, mo = item
    offs = [np.asarray(offset(mo, dx, dz)) for xpos, dx, dz, P, plo, phi in poses]
    lo = np.min([plo - o for (_, _, _, _, plo, _), o in zip(poses, offs)], axis=0) - r - 6
    hi = np.max([phi - o for (_, _, _, _, _, phi), o in zip(poses, offs)], axis=0) + r + 6
    A, B, C = mesh.tris_near(s, lo, hi)
    if not len(A):
        return name, None
    tmin, tmax = np.minimum(np.minimum(A, B), C), np.maximum(np.maximum(A, B), C)
    worst = (math.inf,)
    for (xpos, dx, dz, P, plo, phi), off in zip(poses, offs):
        keep = np.all((tmax >= plo - off - r - 6) & (tmin <= phi - off + r + 6), axis=1)
        if not keep.any():
            continue
        cl, where = mesh.clearance(P, s, r, tuple(off), chunk=24, tris=(A[keep], B[keep], C[keep]), cap=REPORT)
        if cl < worst[0]:
            worst = (cl, xpos, dz, tuple(round(x) for x in where))
    return name, (worst if worst[0] < math.inf else None)


from concurrent.futures import ThreadPoolExecutor   # noqa: E402
with ThreadPoolExecutor(THREADS) as ex:
    for name, res in ex.map(check_part, parts):
        if res:
            worst_part[name] = res
print(f"{N_X} X positions x {len(DZS)} beam heights in {time.time() - t1:.0f} s")
print(f"tightest bend {worst_bend[0]:.1f} mm (hose radius {r:.1f}) at {worst_bend[1]}, X_POS {worst_bend[2]}, dz {worst_bend[3]:.1f}")
print(f"length {min(lengths):.0f} - {max(lengths):.0f} mm")
bad = []
for name, (cl, xpos, dz, where) in sorted(worst_part.items(), key=lambda kv: kv[1][0]):
    if cl > REPORT:
        continue
    flag = cl < -ALLOW.get(name, CUT_IN)
    bad += [name] if flag else []
    print(f"  {name:32s} {cl:7.1f} mm at X_POS {xpos:.3f} dz {dz:6.1f} {where}" + ("   <-- CUTS IN" if flag else ""))
print(f"hose check: {len(bad)} part(s) cut in: {bad}  ({time.time() - t0:.0f} s total)")
