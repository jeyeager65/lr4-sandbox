# Shareable configurator: which source file (V1E / Printables STL, XZ plate DXF) each part of the reference build
# came from, and the transform from that file's own coordinates to the machine. The public page doesn't ship that
# geometry - each user loads the files they downloaded, and the page places them with these transforms.
#   python tools/run.py pipeline/source_frames.py   (LR4_FCSTD=<build> to read another build)
# -> private/sizes/source_frames.json: {part: {file, sha256, bytes, facets, kind: stl|dxf, A: 3x4 (file -> machine)}}
# STL parts: matched by point count, then an affine fit of the file's points (FreeCAD load order) onto the placed
# part (mirrored parts are just a negative determinant); accepted when it reproduces every point to 1e-3 mm.
# XZ plates: the DXF extruded by build.py; A = the solid's placement, depth = its extrusion.
import glob
import hashlib
import json
import os

import FreeCAD as App
import Mesh
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
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
dst = os.path.join(SIZES_DIR, "source_frames.json")
json.dump(out, open(dst, "w"), indent=1)
print(f"SOURCES {len(out)} parts from files; not from a file: {', '.join(unmatched)}")
