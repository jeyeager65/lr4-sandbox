# LowRider4 - real travel limits from the last build, headless:
#   python tools/run.py freecad/travelcheck.py      (LR4_AXES=Y: only Y)
# Each moving group is pushed from the parked pose along -/+ X, Y, Z until it first touches a part that stays
# behind (rays cast along the axis on a fine grid through both parts' triangles; the gap per ray = from an A
# surface to the next B surface ahead). Prints the free distance each way and the parts that stop it.
#   Y: gantry + beam + core vs the table (holders, stop screws)    X: core vs beam + gantry
#   Z: beam + core vs gantry + table
# Flexible / sliding parts are left out (hose, cord, stepper leads, belt runs, the rails the wheels ride, leadscrews).

import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import FreeCAD as App                             # noqa: E402
import lr4                                        # noqa: E402

CELL = 0.25                                       # ray grid (mm)
MAXLEN = 2500.0                                   # look this far each way
SKIP = ("Vac_Hose", "Router_Cord", "Cable_Sleeve", "Stepper_Lead", "Bristles")
SLIDE = {0: ("X_Rail",), 1: ("Y_Rail", "TableMDF"), 2: ("MGN12_Rail", "MGN_Rail", "Z_Lead", "Leadscrew")}
MOVES = {0: ("core",), 1: ("gantry", "beam", "core"), 2: ("beam", "core")}

t0 = time.time()
doc = App.openDocument(os.path.join(ROOT, "build", "LowRider4.FCStd"))
parts = []
for o in doc.Objects:
    if o.TypeId not in ("Mesh::Feature", "Part::Feature") or o.Name.startswith(SKIP) or "_Lead_" in o.Name:
        continue
    mo = lr4.motion(o.Name)
    if mo in ("stretch", "stretch_x"):
        continue
    if o.TypeId == "Mesh::Feature":
        if o.Mesh.CountFacets == 0:
            continue
        pts, fac = o.Mesh.Topology
    else:
        if o.Shape.isNull() or not o.Shape.Faces:
            continue
        pts, fac = o.Shape.tessellate(0.1)
    P = np.array([(p.x, p.y, p.z) for p in pts])
    tri = P[np.array(fac)]
    parts.append(dict(name=o.Name, motion=mo, tri=tri, lo=tri.reshape(-1, 3).min(0), hi=tri.reshape(-1, 3).max(0)))
print(f"{len(parts)} parts in {time.time() - t0:.0f} s", flush=True)


def hits(tri, k, lo, n):
    """Ray grid along axis k over the perpendicular box lo (2,) with n (2,) cells -> (cell index, depth)."""
    u, w = [a for a in range(3) if a != k]
    T2 = tri[:, :, [u, w]]
    tlo = np.floor((T2.min(1) - lo) / CELL - 0.5).astype(int)
    thi = np.ceil((T2.max(1) - lo) / CELL - 0.5).astype(int)
    tlo, thi = np.maximum(tlo, 0), np.minimum(thi, n - 1)
    ok = (thi >= tlo).all(1)
    idx = np.nonzero(ok)[0]
    out_c, out_d = [], []
    for ch in np.array_split(idx, max(1, len(idx) // 20000)):
        nu, nw = thi[ch, 0] - tlo[ch, 0] + 1, thi[ch, 1] - tlo[ch, 1] + 1
        cnt = nu * nw
        t = np.repeat(ch, cnt)
        start = np.repeat(np.cumsum(cnt) - cnt, cnt)
        r = np.arange(cnt.sum()) - start
        nwr = np.repeat(nw, cnt)
        iu = np.repeat(tlo[ch, 0], cnt) + r // nwr
        iw = np.repeat(tlo[ch, 1], cnt) + r % nwr
        pu, pw = lo[0] + (iu + 0.5) * CELL, lo[1] + (iw + 0.5) * CELL
        A, B, C = T2[t, 0], T2[t, 1], T2[t, 2]
        den = (B[:, 1] - C[:, 1]) * (A[:, 0] - C[:, 0]) + (C[:, 0] - B[:, 0]) * (A[:, 1] - C[:, 1])
        good = np.abs(den) > 1e-12
        den = np.where(good, den, 1.0)
        l1 = ((B[:, 1] - C[:, 1]) * (pu - C[:, 0]) + (C[:, 0] - B[:, 0]) * (pw - C[:, 1])) / den
        l2 = ((C[:, 1] - A[:, 1]) * (pu - C[:, 0]) + (A[:, 0] - C[:, 0]) * (pw - C[:, 1])) / den
        l3 = 1 - l1 - l2
        inside = good & (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
        Tk = tri[t, :, k]
        d = l1 * Tk[:, 0] + l2 * Tk[:, 1] + l3 * Tk[:, 2]
        out_c.append((iu * n[1] + iw)[inside])
        out_d.append(d[inside])
    if not out_c:
        return np.zeros(0, int), np.zeros(0)
    return np.concatenate(out_c), np.concatenate(out_d)


def gap(a, b, k, s):
    """Free distance moving part a goes along s * axis k before touching b (inf if never)."""
    u, w = [x for x in range(3) if x != k]
    lo = np.maximum(a["lo"][[u, w]], b["lo"][[u, w]])
    hi = np.minimum(a["hi"][[u, w]], b["hi"][[u, w]])
    if (hi - lo < CELL).any():
        return np.inf
    n = np.ceil((hi - lo) / CELL).astype(int)
    ca, da = hits(a["tri"], k, lo, n)
    cb, db = hits(b["tri"], k, lo, n)
    if not len(ca) or not len(cb):
        return np.inf
    da, db = da * s, db * s                     # moving toward + in these coordinates
    c = np.concatenate([ca, cb])
    d = np.concatenate([da, db])
    isa = np.concatenate([np.ones(len(ca), bool), np.zeros(len(cb), bool)])
    o = np.lexsort((~isa, d, c))                # by cell, then depth (A first on ties)
    c, d, isa = c[o], d[o], isa[o]
    # last A depth at or before each entry, in the same cell
    ia = np.where(isa, np.arange(len(c)), -1)
    ia = np.maximum.accumulate(ia)
    valid = (~isa) & (ia >= 0)
    valid[valid] &= c[ia[valid]] == c[valid]
    if not valid.any():
        return np.inf
    g = d[valid] - d[ia[valid]]
    g = g[g > -0.05]
    return float(g.min()) if len(g) else np.inf


res = {}
AXES = os.environ.get("LR4_AXES", "XYZ").upper()   # LR4_AXES=Y: just Y
for k, ax in enumerate("XYZ"):
    if ax not in AXES:
        continue
    mv = [p for p in parts if p["motion"] in MOVES[k]]
    fx = [p for p in parts if p["motion"] not in MOVES[k] and not p["name"].startswith(SLIDE[k])]
    for s, sg in ((-1, "-"), (1, "+")):
        found = []
        for a in mv:
            u, w = [x for x in range(3) if x != k]
            for b in fx:
                if (np.minimum(a["hi"][[u, w]], b["hi"][[u, w]]) - np.maximum(a["lo"][[u, w]], b["lo"][[u, w]]) < CELL).any():
                    continue
                ahead = (b["hi"][k] - a["lo"][k]) if s > 0 else (a["hi"][k] - b["lo"][k])
                if ahead <= 0:
                    continue
                near = (b["lo"][k] - a["hi"][k]) if s > 0 else (a["lo"][k] - b["hi"][k])
                if near > MAXLEN:
                    continue
                g = gap(a, b, k, s)
                if g < np.inf:
                    found.append((g, a["name"], b["name"]))
        found.sort()
        res[ax + sg] = found[:10]
        print(f"\n{ax}{sg}: " + ("free " + f"{found[0][0]:.1f} mm" if found else "no stop found"), flush=True)
        for g, an, bn in found[:10]:
            print(f"   {g:8.2f}  {an}  ->  {bn}")
json.dump(res, open(os.path.join(ROOT, "build", "travel_check.json"), "w"), indent=1)
print(f"\ndone in {time.time() - t0:.0f} s")
