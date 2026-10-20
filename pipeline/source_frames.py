# Shareable configurator: which source file (V1E / Printables STL, XZ plate DXF) each part of the reference build
# came from, and the transform from that file's own coordinates to the machine. The public page doesn't ship that
# geometry - each user loads the files they downloaded, and the page places them with these transforms.
#   python tools/run.py pipeline/source_frames.py   (LR4_FCSTD=<build> to read another build)
# -> private/sizes/source_frames.json: {part: {file, sha256, bytes, facets, kind: stl|dxf, A: 3x4 (file -> machine)}}
# STL parts: matched by point count, then an affine fit of the file's points (FreeCAD load order) onto the placed
# part (mirrored parts are just a negative determinant); accepted when it reproduces every point to 1e-3 mm.
# XZ plates: the DXF extruded by build.py; A = the solid's placement, depth = its extrusion.
# Peter Plates (kind "peter"): the build makes them from PeterPlates_w_locations.stl (both covers in one file, stood
# up) with the openings filled, so they aren't matched by points. open = that file, piece = its connected component
# (sorted by ZMax, highest first: 0 = T, 1 = B), A = the build's frame (YZ plate x PETER_IN_YZ, Max mirrored);
# closed = PeterPlateT / B.stl (flat, as downloaded), fitted onto the open piece by nearest points.
# Bristles (kind "bent"): bent along the skirt by the build (mesh.bend_strip): the groove path (skirt file frame) and
# bend_strip's arguments are recorded, A = the skirt's (checked: the strip bent with them lands on the built one).
import glob
import itertools
import sys
import hashlib
import json
import os

import FreeCAD as App
import Mesh
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(PROJ, "freecad"))
import lr4                                            # noqa: E402
PARTS = os.path.join(PROJ, "parts")
SIZES_DIR = os.path.join(PROJ, "private", "sizes")    # = lr4.SIZES_DIR
path = os.environ.get("LR4_FCSTD") or os.path.join(SIZES_DIR, "ref", "LowRider4", "build", "LowRider4.FCStd")
doc = App.openDocument(path)


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


files = {}
for p in glob.glob(os.path.join(PARTS, "**", "*.stl"), recursive=True):
    if os.sep + "board" + os.sep in p:
        continue
    m = Mesh.Mesh(p)
    pts = np.array([[v.x, v.y, v.z] for v in m.Topology[0]])
    files[p] = dict(n=len(pts), facets=m.CountFacets, pts=pts)

out, unmatched = {}, []
for o in doc.Objects:
    if o.TypeId != "Mesh::Feature":
        continue
    placed = np.array([[v.x, v.y, v.z] for v in o.Mesh.Topology[0]])
    best = None
    for p, f in files.items():
        if f["n"] != len(placed):
            continue
        Q = np.hstack([f["pts"], np.ones((len(placed), 1))])
        A, *_ = np.linalg.lstsq(Q, placed, rcond=None)          # 4 x 3
        err = np.abs(Q @ A - placed).max()
        if best is None or err < best[0]:
            best = (err, p, A)
    if best and best[0] < 1e-3:
        err, p, A = best
        out[o.Name] = dict(file=os.path.relpath(p, PARTS).replace(os.sep, "/"), sha256=sha(p), bytes=os.path.getsize(p),
                           facets=files[p]["facets"], kind="stl", A=A.T.round(9).tolist(), err=float(err))
    else:
        unmatched.append(o.Name)

for side, fn, depth in (("Min", "lr4/XZ_Min_DXF_V1.dxf", 6.5), ("Max", "lr4/XZ_Max_DXF.dxf", -6.5)):
    s = doc.getObject(f"XZ_Plate_{side}").Shape
    M = s.Placement.toMatrix()
    p = os.path.join(PARTS, fn)
    out[f"XZ_Plate_{side}"] = dict(file=fn, sha256=sha(p), bytes=os.path.getsize(p), kind="dxf", depth=depth,
                                   A=[[M.A11, M.A12, M.A13, M.A14], [M.A21, M.A22, M.A23, M.A24],
                                      [M.A31, M.A32, M.A33, M.A34]],
                                   bbox=[s.BoundBox.XMin, s.BoundBox.YMin, s.BoundBox.ZMin,
                                         s.BoundBox.XMax, s.BoundBox.YMax, s.BoundBox.ZMax])


def rows(M):
    return np.array([[M.A11, M.A12, M.A13, M.A14], [M.A21, M.A22, M.A23, M.A24], [M.A31, M.A32, M.A33, M.A34]])


def nearest(a, b):
    """For each point of a: distance to and index of the nearest point of b (chunked brute force)."""
    d, j = np.empty(len(a)), np.empty(len(a), dtype=int)
    for i in range(0, len(a), 500):
        D = np.linalg.norm(a[i:i + 500, None, :] - b[None, :, :], axis=2)
        j[i:i + 500] = D.argmin(axis=1)
        d[i:i + 500] = D[np.arange(len(D)), j[i:i + 500]]
    return d, j


def fit_onto(src, dst, tol=1e-3):
    """Rigid (or mirrored) 3x4 taking src's points onto dst's: the best of the 48 axis-aligned orientations by bbox
    centre, refined by least squares on the points that coincide. Returns (A, fraction matched, max error)."""
    cs, cd = (src.min(0) + src.max(0)) / 2, (dst.min(0) + dst.max(0)) / 2
    best = None
    for perm in itertools.permutations(range(3)):
        for sg in itertools.product((1, -1), repeat=3):
            R = np.zeros((3, 3))
            R[range(3), perm] = sg
            q = (src - cs) @ R.T + cd
            if not np.allclose(q.max(0) - q.min(0), dst.max(0) - dst.min(0), atol=1.0):
                continue
            d, j = nearest(q, dst)
            f = (d < 0.05).mean()
            if best is None or f > best[0]:
                best = (f, R, j, d)
    f, R, j, d = best
    ok = d < 0.05
    Q = np.hstack([src[ok], np.ones((ok.sum(), 1))])
    A, *_ = np.linalg.lstsq(Q, dst[j[ok]], rcond=None)
    q = np.hstack([src, np.ones((len(src), 1))]) @ A
    d, _ = nearest(q, dst)
    return A.T, float((d < tol).mean()), float(d[d < tol].max())


def file_rec(fn, **kw):
    p = os.path.join(PARTS, fn)
    return dict(file=fn, sha256=sha(p), bytes=os.path.getsize(p), facets=Mesh.Mesh(p).CountFacets, **kw)


pts_of = lambda m: np.array([[v.x, v.y, v.z] for v in m.Topology[0]])
OPEN = "peter/PeterPlates_w_locations.stl"
comps = sorted(Mesh.Mesh(os.path.join(PARTS, OPEN)).getSeparateComponents(), key=lambda c: -c.BoundBox.ZMax)
mirror = App.Matrix(1, 0, 0, 0, 0, -1, 0, 300.0, 0, 0, 1, 0, 0, 0, 0, 1)    # build.py: Max side, print y -> 300 - y
in_yz = App.Matrix(*lr4.PETER_IN_YZ, 0, 0, 0, 1)
for piece, tag in enumerate(("T", "B")):
    closed = f"peter/PeterPlate{tag}.stl"
    Fc, frac, err = fit_onto(pts_of(Mesh.Mesh(os.path.join(PARTS, closed))), pts_of(comps[piece]))
    print(f"PETER {tag}: closed -> open piece, {frac:.1%} of points within 1e-3 mm (worst {err:.1e})")
    for side in ("Min", "Max"):
        nm = f"PeterPlate_{tag}_{side}"
        o = doc.getObject(nm)
        if o is None:
            continue
        M = o.Placement.toMatrix()
        if side == "Max":
            M = M.multiply(mirror)
        A = rows(M.multiply(in_yz))
        q = pts_of(comps[piece]) @ A[:, :3].T + A[:, 3]
        d, _ = nearest(q, pts_of(o.Mesh))
        if d.max() > 1e-3:
            raise SystemExit(f"{nm}: open piece off the built plate by {d.max():.4f} mm")
        Ac = A[:, :3] @ Fc[:, :3]
        Ac = np.hstack([Ac, (A[:, :3] @ Fc[:, 3] + A[:, 3])[:, None]])
        out[nm] = dict(kind="peter", open=file_rec(OPEN, A=A.round(9).tolist(), piece=piece, err=float(d.max())),
                       closed=file_rec(closed, A=Ac.round(9).tolist(), matched=round(frac, 4)))
        unmatched.remove(nm)
from fclib import mesh as fm                          # noqa: E402  (lr4 put freecad/ on the path)
sg = lr4.SKIRT_GROOVE
SKIRT, STRIP = "kobalt/Dust_Skirt_Kobalt.stl", "kobalt/TPU_Bristles_22mm.stl"
groove = np.asarray(lr4.skirt_groove(Mesh.Mesh(os.path.join(PARTS, SKIRT))), dtype=float)
glen = float(np.hypot(*np.diff(groove, axis=0).T).sum())
flat = Mesh.Mesh(os.path.join(PARTS, STRIP))
for nm in [u for u in unmatched if u.startswith("Bristles_TPU")]:
    k = int(nm.rsplit("_", 1)[1]) - 1
    bend = dict(along=[1, sg["strip_y0"]], height=[0, sg["strip_spine_x"], 1], across=[2, sg["strip_t"] / 2],
                z0=sg["z_ceiling"], start=0.0 if k == 0 else glen, scale=glen / sg["strips"] / sg["strip_len"],
                reverse=k == 1)
    A = np.array(out[SKIRT.split("/")[1][:-4]]["A"])       # build.py: the strips go in with the skirt's placement
    q = pts_of(fm.bend_strip(flat, groove, **bend)) @ A[:, :3].T + A[:, 3]
    d, _ = nearest(q, pts_of(doc.getObject(nm).Mesh))
    if d.max() > 1e-3:
        raise SystemExit(f"{nm}: bent strip off the built one by {d.max():.4f} mm")
    out[nm] = dict(kind="bent", **file_rec(STRIP, A=A.round(9).tolist(), path=groove.round(5).tolist(), err=float(d.max()),
                                           **bend))
    unmatched.remove(nm)

dst = os.path.join(SIZES_DIR, "source_frames.json")
json.dump(out, open(dst, "w"), indent=1)
print(f"SOURCES {len(out)} parts from files; not from a file: {', '.join(unmatched)}")
