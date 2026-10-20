# Share data test: rebuild every part the share data points at a file for (web/data/share, pipeline/share_data.py)
# from the files in parts/, the way the page will, and compare it with the private page data's mesh (the reference
# build). Also checks the share data holds no V1E geometry.
#   python tools/run.py tests/test_share.py     (FreeCAD only for the XZ plate DXFs; the STLs are read with numpy)
# Pass = stl: the file's vertices through A and the reference mesh's are the same set (each within TOL of the other's,
# grid matched) and the triangle counts agree; peter open: the piece's vertices all lie on the built plate (the build
# adds fills, so one way only); peter closed: >= 99 % of its vertices on the open piece (B's stepper window differs);
# dxf: extruded + A + tessellated as build.py / export_web do -> the same vertex set; bent: the flat strip bent along
# the recorded path (bend() = fclib mesh.bend_strip in numpy, the page's rule) + A -> the same vertex set.
import base64
import gzip
import hashlib
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PARTS = os.path.join(ROOT, "parts")
DATA = os.path.join(ROOT, "web", "data")
TOL = 0.002          # mm: grid cell for the vertex match (a match = within 0.4 cell per axis)
LO = -1000.0         # grid origin (mm); coordinates up to LO + 2^21 * TOL


def read_stl(p):
    """Triangles (n, 3, 3) of a binary or ASCII STL."""
    b = open(p, "rb").read()
    n = struct.unpack_from("<I", b, 80)[0] if len(b) >= 84 else -1
    if len(b) == 84 + 50 * n:
        rec = np.frombuffer(b, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=n, offset=84)
        return rec["v"].astype(float)
    v = [list(map(float, ln.split()[1:4])) for ln in b.decode("ascii", "replace").splitlines() if ln.strip().startswith("vertex")]
    return np.array(v).reshape(-1, 3, 3)


def place(tris, A):
    A = np.array(A)
    return tris @ A[:, :3].T + A[:, 3]


def keys(p):
    k = np.floor((p - LO) / TOL).astype(np.int64)
    if k.min() < 0 or k.max() >= 1 << 21:
        raise SystemExit("coordinates outside the match grid - move LO")
    return (k[:, 0] << 42) | (k[:, 1] << 21) | k[:, 2]


def inside(a, b):
    """Fraction of a's distinct points with one of b's within 0.4 TOL per axis (probes at +-0.4 cell: an interval
    narrower than a cell, so its two ends name every cell it touches - at +-0.5 a centred point can skip its own)."""
    a, kb = np.unique(a, axis=0), np.unique(keys(b))
    hit = np.zeros(len(a), bool)
    for dx in (-0.4, 0.4):
        for dy in (-0.4, 0.4):
            for dz in (-0.4, 0.4):
                hit |= np.isin(keys(a + np.array([dx, dy, dz]) * TOL), kb)
    return hit.mean()


def components(tris):
    """Connected components of a triangle soup (shared vertex positions), as triangle masks sorted by ZMax, highest
    first - the page's rule for picking a Peter piece."""
    v, inv = np.unique(tris.reshape(-1, 3), axis=0, return_inverse=True)
    f = inv.reshape(-1, 3)
    lab = np.arange(len(v))
    while True:
        m = lab[f].min(axis=1)
        new = lab.copy()
        for c in range(3):
            np.minimum.at(new, f[:, c], m)
        new = new[new]
        if np.array_equal(new, lab):
            break
        lab = new
    tl = lab[f[:, 0]]
    masks = [tl == u for u in np.unique(tl)]
    return sorted(masks, key=lambda mk: -tris[mk][..., 2].max())


def bend(tris, s):
    """fclib mesh.bend_strip on a triangle soup with the share data's arguments (path, along, height, across, z0,
    start, scale, reverse)."""
    P = np.array(s["path"], float)
    seg = np.diff(P, axis=0)
    S = np.r_[0.0, np.cumsum(np.hypot(seg[:, 0], seg[:, 1]))]
    tang = seg / np.hypot(seg[:, 0], seg[:, 1])[:, None]
    tv = np.r_[tang[:1], tang[:-1] + tang[1:], tang[-1:]]
    tv /= np.linalg.norm(tv, axis=1)[:, None]
    nv = np.c_[-tv[:, 1], tv[:, 0]]
    A = tris.reshape(-1, 3)
    (ai, a0), (hi, h0, hs), (ci, c0) = s["along"], s["height"], s["across"]
    t = np.clip(s["start"] + (-1 if s["reverse"] else 1) * s["scale"] * (A[:, ai] - a0), 0.0, S[-1])
    nn = np.c_[np.interp(t, S, nv[:, 0]), np.interp(t, S, nv[:, 1])]
    nn /= np.linalg.norm(nn, axis=1)[:, None]
    xy = np.c_[np.interp(t, S, P[:, 0]), np.interp(t, S, P[:, 1])] + nn * (A[:, ci] - c0)[:, None]
    return np.c_[xy, s["z0"] + hs * (A[:, hi] - h0)].reshape(tris.shape)


def ref_meshes(cfg, blob):
    out = {}
    for p in cfg["parts"]:
        if "mesh" in p:
            a, n = p["mesh"]["pos"]
            out[p["meta"]["name"]] = (np.frombuffer(blob, "<f4", n * 3, a).reshape(-1, 3).astype(float), p["mesh"]["idx"][1] // 3)
    return out


def dxf_solid(rel, depth, A):
    """build.py's XZ plate: the DXF's closed wires -> face -> extruded `depth` along z, placed by A."""
    import FreeCAD as App
    import Import
    import Part
    doc = App.newDocument("share_dxf_tmp")
    Import.readDXF(os.path.join(PARTS, rel), doc.Name)
    edges = [e for o in doc.Objects if hasattr(o, "Shape") for e in o.Shape.Edges]
    for e in edges:                                    # V1E's DXFs miss by 3e-7 mm at a few joints: without this
        e.fixTolerance(1e-4)                           # the ~19 x 22 mm cutout's wire stays open and is dropped
    App.closeDocument(doc.Name)
    wires = sorted((Part.Wire(g) for g in Part.sortEdges(edges)), key=lambda w: -Part.Face(w).Area if w.isClosed() else 0)
    sol = Part.makeFace([w for w in wires if w.isClosed()], "Part::FaceMakerBullseye").extrude(App.Vector(0, 0, depth))
    sol.Placement = App.Placement(App.Matrix(*[x for r in A for x in r], 0, 0, 0, 1))
    pts, facets = sol.tessellate(0.05)          # export_web TESSELLATE
    return np.array([[q.x, q.y, q.z] for q in pts]), len(facets)


def main():
    cfg = json.load(open(os.path.join(DATA, "lr4_config.json")))
    ref = ref_meshes(cfg, gzip.decompress(base64.b64decode(open(os.path.join(DATA, "lr4_config_geometry.txt")).read())))
    share = json.load(open(os.path.join(DATA, "share", "lr4_config.json")))
    fails, done = [], 0
    printed = {p["meta"]["name"] for p in cfg["parts"] if p["meta"].get("source") == "printed" and "mesh" in p}
    for p in share["parts"]:
        nm = p["meta"]["name"]
        if "mesh" in p and (nm in printed or nm in ("XZ_Plate_Min", "XZ_Plate_Max")):
            fails.append(f"{nm}: V1E geometry in the share data")
    covered = {p["meta"]["name"] for p in share["parts"] if "src" in p}
    for nm in sorted(printed - covered):
        if "~honeycomb" not in nm:
            fails.append(f"{nm}: printed part neither placed from a file nor dropped")

    def check(nm, ok, msg):
        nonlocal done
        done += 1
        print(("ok   " if ok else "FAIL ") + f"{nm}: {msg}")
        if not ok:
            fails.append(nm)

    for p in share["parts"]:
        s, nm = p.get("src"), p["meta"]["name"]
        if not s:
            continue
        recs = [s["open"], s["closed"]] if s["kind"] == "peter" else [s]
        missing = [r["file"] for r in recs if not os.path.exists(os.path.join(PARTS, r["file"]))]
        if missing:
            check(nm, False, f"missing {', '.join(missing)}")
            continue
        for r in recs:
            if hashlib.sha256(open(os.path.join(PARTS, r["file"]), "rb").read()).hexdigest() != r["sha256"]:
                print(f"WARN {nm}: {r['file']} is not the version A was solved for")
        pts, nref = ref[nm]
        if s["kind"] == "stl":
            t = place(read_stl(os.path.join(PARTS, s["file"])), s["A"])
            a, b = inside(t.reshape(-1, 3), pts), inside(pts, t.reshape(-1, 3))
            check(nm, a == 1 and b == 1 and len(t) == nref, f"{s['file']}: {a:.4f} / {b:.4f} of vertices match, {len(t)} vs {nref} triangles")
        elif s["kind"] == "peter":
            tris = read_stl(os.path.join(PARTS, s["open"]["file"]))
            piece = place(tris[components(tris)[s["open"]["piece"]]], s["open"]["A"]).reshape(-1, 3)
            closed = place(read_stl(os.path.join(PARTS, s["closed"]["file"])), s["closed"]["A"]).reshape(-1, 3)
            a, c = inside(piece, pts), inside(closed, piece)
            check(nm, a == 1 and c >= 0.99, f"open piece {s['open']['piece']} on the plate {a:.4f}, closed on the open piece {c:.4f}")
        elif s["kind"] == "dxf":
            q, nf = dxf_solid(s["file"], s["depth"], s["A"])
            a, b = inside(q, pts), inside(pts, q)
            check(nm, a == 1 and b == 1 and nf == nref, f"{s['file']}: {a:.4f} / {b:.4f} of vertices match, {nf} vs {nref} triangles")
        else:
            t = place(bend(read_stl(os.path.join(PARTS, s["file"])), s), s["A"])
            a, b = inside(t.reshape(-1, 3), pts), inside(pts, t.reshape(-1, 3))
            check(nm, a == 1 and b == 1 and len(t) == nref, f"{s['file']} bent: {a:.4f} / {b:.4f} of vertices match, {len(t)} vs {nref} triangles")
    print(f"{done - len([f for f in fails if ':' not in f])}/{done} parts pass" + (f"; FAIL: {fails}" if fails else ""))
    sys.stdout.flush()
    if fails:
        raise SystemExit(1)


main()
