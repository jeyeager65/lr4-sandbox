# STL meshes in script-built assemblies: downloaded printed parts (kits from Printables etc.)
# placed by rigid transforms, overlap checks between meshes, and STEP export of meshes.
# Lengths in mm (meshes are always mm).
#
#   from fclib import mesh
#   pl = mesh.frame(((0, 0, 1), (-1, 0, 0), (0, -1, 0)), (10, 20, 30))   # rows = where print x/y/z go
#   m.add_mesh("Core", mesh.load(path), pl, group="Printed", colour=RED)  # core.Model
#   mesh.overlap(mesh.placed(a, pa), mesh.placed(b, pb), "z", [5, 10, 15])  # mm^2 of shared section
#
# frame(rows, offset): rows[i] = machine axis i expressed in the part's print axes, i.e. the
# machine point is  X = rows[0] . p + offset[0]  etc. Rows must form a proper rotation
# (det +1) - a mirrored part needs its own (mirrored) STL, not a mirroring placement.

import FreeCAD as App
import Mesh

_cache = {}


def load(path):
    """STL/3MF/OBJ -> Mesh (cached per path; returns a copy you may transform)."""
    if path not in _cache:
        _cache[path] = Mesh.Mesh(path)
    return _cache[path].copy()


def obj_by_colour(path, scale=1.0, cache_dir=None):
    """Coloured OBJ (+ its .mtl, e.g. an EasyEDA PCB export: scale 0.254 for its 10 mil unit) ->
    [(rgb, Mesh)], one mesh per diffuse colour, in mm with the OBJ's min corner at the origin.
    cache_dir: write/read <stem>_<rrggbb>.stl there (a 60 MB OBJ takes ~30 s to parse)."""
    import glob, os
    stem = os.path.splitext(os.path.basename(path))[0]
    if cache_dir:
        hits = sorted(glob.glob(os.path.join(cache_dir, stem + "_??????.stl")))
        if hits and all(os.path.getmtime(h) >= os.path.getmtime(path) for h in hits):
            return [(tuple(int(h[-10:-4][i:i + 2], 16) / 255 for i in (0, 2, 4)), load(h)) for h in hits]
    kd, cur, mtl = {}, None, None
    V, tris = [], {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            t = line.split()
            if not t:
                continue
            if t[0] == "v":
                V.append((float(t[1]), float(t[2]), float(t[3])))
            elif t[0] == "f":
                idx = [int(s.split("/")[0]) for s in t[1:]]
                idx = [i - 1 if i > 0 else len(V) + i for i in idx]
                lst = tris.setdefault(cur, [])
                for i in range(1, len(idx) - 1):
                    lst.append((idx[0], idx[i], idx[i + 1]))
            elif t[0] == "usemtl":
                cur = t[1]
            elif t[0] == "mtllib":
                mtl = os.path.join(os.path.dirname(path), line.split(None, 1)[1].strip())
    if mtl and os.path.exists(mtl):
        name = None
        for line in open(mtl, encoding="utf-8", errors="replace"):
            t = line.split()
            if t and t[0] == "newmtl":
                name = t[1]
            elif t and t[0] == "Kd" and name:
                kd[name] = tuple(round(float(v), 2) for v in t[1:4])
    x0, y0, z0 = (min(v[i] for v in V) for i in range(3))
    P = [App.Vector((x - x0) * scale, (y - y0) * scale, (z - z0) * scale) for x, y, z in V]
    groups = {}
    for name, lst in tris.items():
        groups.setdefault(kd.get(name, (0.5, 0.5, 0.5)), []).extend(lst)
    out = []
    for rgb, lst in sorted(groups.items()):
        used = sorted({i for tri in lst for i in tri})
        remap = {i: k for k, i in enumerate(used)}
        msh = Mesh.Mesh(([P[i] for i in used], [tuple(remap[i] for i in tri) for tri in lst]))
        out.append((rgb, msh))
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            msh.write(os.path.join(cache_dir, stem + "_%02x%02x%02x.stl" % tuple(round(c * 255) for c in rgb)))
    return out


def frame(rows, offset=(0.0, 0.0, 0.0)):
    """Placement from an axis-permutation/rotation matrix (rows) and a translation."""
    m = App.Matrix(rows[0][0], rows[0][1], rows[0][2], offset[0],
                   rows[1][0], rows[1][1], rows[1][2], offset[1],
                   rows[2][0], rows[2][1], rows[2][2], offset[2], 0, 0, 0, 1)
    det = m.determinant()
    if abs(det - 1) > 1e-6:
        raise ValueError(f"frame rows are not a rotation (det {det:g})")
    return App.Placement(m)


def mirror_x_matrix(x0):
    """Matrix mirroring machine X about the plane x = x0."""
    return App.Matrix(-1, 0, 0, 2 * x0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)


def placed(m, pl):
    """Copy of mesh m (or a path) moved by placement pl (or matrix)."""
    out = load(m) if isinstance(m, str) else m.copy()
    out.transform(pl.toMatrix() if hasattr(pl, "toMatrix") else pl)
    return out


def apply(pl, x, y, z):
    """Machine point of print point (x, y, z) under placement pl."""
    return pl.multVec(App.Vector(x, y, z))


def bend_strip(m, path, along=(1, 0.0), height=(0, 0.0, 1), across=(2, 0.0), z0=0.0, start=0.0, scale=1.0,
               reverse=False):
    """Bend a flat strip Mesh (printed flat, e.g. TPU bristles or a gasket) along a 2D path in the xy plane:
    the strip's coordinate on axis along[0] (0/1/2 = x/y/z), measured from along[1], becomes arc length on the
    path from `start` (times `scale`; `reverse` runs it backwards from `start`); its coordinate on height[0]
    from height[1] becomes z = z0 + height[2] * (h - height[1]); its coordinate on across[0] from across[1]
    becomes an offset along the path's left normal. path: (x, y) points, densely sampled. Returns a new Mesh."""
    import numpy as np
    P = np.asarray(path, dtype=float)
    seg = np.diff(P, axis=0)
    sl = np.hypot(seg[:, 0], seg[:, 1])
    S = np.r_[0.0, np.cumsum(sl)]
    tang = seg / sl[:, None]
    tv = np.r_[tang[:1], tang[:-1] + tang[1:], tang[-1:]]            # vertex tangents: averaged neighbours
    tv /= np.linalg.norm(tv, axis=1)[:, None]
    nv = np.c_[-tv[:, 1], tv[:, 0]]                                  # left normals
    pts, facets = m.Topology
    A = np.array([[p.x, p.y, p.z] for p in pts])
    s = start + (-1 if reverse else 1) * scale * (A[:, along[0]] - along[1])
    s = np.clip(s, 0.0, S[-1])
    xy = np.c_[np.interp(s, S, P[:, 0]), np.interp(s, S, P[:, 1])]
    nn = np.c_[np.interp(s, S, nv[:, 0]), np.interp(s, S, nv[:, 1])]
    nn /= np.linalg.norm(nn, axis=1)[:, None]
    off = A[:, across[0]] - across[1]
    out = np.c_[xy + nn * off[:, None], z0 + height[2] * (A[:, height[0]] - height[1])]
    fl = [tuple(f) for f in facets]
    if reverse != (height[2] < 0):                                  # keep the facets facing out
        fl = [(a, c, b) for a, b, c in fl]
    return Mesh.Mesh(([App.Vector(*p) for p in out], fl))


def tube_along(points, d, sides=24):
    """Closed round tube Mesh of diameter d along a polyline (sample a curve densely first) -
    hoses, cables. Rotation-minimizing frames (double reflection), so it never twists or fails
    the way a B-rep pipe sweep can; capped ends."""
    import math
    P = [App.Vector(*p) for p in points]
    P = [p for i, p in enumerate(P) if i == 0 or (p - P[i - 1]).Length > 1e-6]
    T = []
    for i in range(len(P)):
        t = P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]
        t.normalize()
        T.append(t)
    a = App.Vector(0, 0, 1) if abs(T[0].z) < 0.9 else App.Vector(1, 0, 0)
    n = a.cross(T[0])
    n.normalize()
    N = [n]
    for i in range(len(P) - 1):                       # double reflection (Wang et al. 2008)
        v1 = P[i + 1] - P[i]
        c1 = v1.dot(v1)
        nl = N[-1] - v1 * (2 * v1.dot(N[-1]) / c1)
        tl = T[i] - v1 * (2 * v1.dot(T[i]) / c1)
        v2 = T[i + 1] - tl
        c2 = v2.dot(v2)
        nn = nl - v2 * (2 * v2.dot(nl) / c2) if c2 > 1e-12 else nl
        nn.normalize()
        N.append(nn)
    r = d / 2
    ring = []
    for p, t, n in zip(P, T, N):
        b = t.cross(n)
        ring.append([p + n * (r * math.cos(2 * math.pi * k / sides)) + b * (r * math.sin(2 * math.pi * k / sides))
                     for k in range(sides)])
    tris = []
    for i in range(len(P) - 1):
        for k in range(sides):
            a0, a1 = ring[i][k], ring[i][(k + 1) % sides]
            b0, b1 = ring[i + 1][k], ring[i + 1][(k + 1) % sides]
            tris += [[a0, b1, b0], [a0, a1, b1]]          # outward (t x n = b, angle runs n -> b)
    for k in range(sides):                            # caps (fans), facing out
        tris.append([P[0], ring[0][(k + 1) % sides], ring[0][k]])
        tris.append([P[-1], ring[-1][k], ring[-1][(k + 1) % sides]])
    m = Mesh.Mesh(tris)
    if m.Volume < 0:
        m.flipNormals()
    return m


# --- overlap checks (cross sections -> 2D faces -> common area; fast and robust) -----------
_AX = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}


def section_face(m, axis, value):
    """Closed section loops of mesh m in the plane axis = value, as one Part face (or None)."""
    import Part
    n = App.Vector(*_AX[axis])
    wires = []
    for poly in m.crossSections([(n * value, n)], 1e-4)[0]:
        if len(poly) > 3 and (poly[0] - poly[-1]).Length < 1e-3:
            try:
                wires.append(Part.makePolygon(list(poly[:-1]) + [poly[0]]))
            except Exception:
                pass
    if not wires:
        return None
    try:
        return Part.makeFace(wires, "Part::FaceMakerBullseye")
    except Exception:
        return None


def overlap(a, b, axis, values):
    """Total shared section area (mm^2) of meshes or shapes a and b over planes axis=v.
    0 = they don't intersect on those planes. Shapes (Part) are sliced exactly."""
    import Part
    tot = 0.0
    for v in values:
        fa, fb = (_slice(s, axis, v) for s in (a, b))
        if fa is None or fb is None:
            continue
        try:
            tot += fa.common(fb).Area
        except Exception:
            pass
    return tot


def _plane_segments(obj, k, v):
    """Section of a mesh/shape (as cached triangle arrays) with the plane coord k = v: segments as
    (p0, p1) arrays of the two in-plane coordinates, (N, 2) each."""
    import numpy as np
    A, B, C = _triangles(obj)
    v = v + 1e-7                                     # no vertex exactly on the plane
    d = np.stack([A[:, k] - v, B[:, k] - v, C[:, k] - v])          # (3, N)
    cross = (d.min(axis=0) < 0) & (d.max(axis=0) > 0)
    if not cross.any():
        return None
    P = np.stack([A[cross], B[cross], C[cross]])                    # (3, M, 3)
    d = d[:, cross]
    pts, msk = [], []
    for i, j in ((0, 1), (1, 2), (2, 0)):                           # where each edge meets the plane
        m = np.sign(d[i]) != np.sign(d[j])
        t = np.where(m, d[i] / np.where(m, d[i] - d[j], 1.0), 0.0)
        pts.append(P[i] + t[:, None] * (P[j] - P[i]))
        msk.append(m)
    pts, msk = np.stack(pts), np.stack(msk)                         # (3, M, 3), (3, M): two edges per tri
    first = np.argmax(msk, axis=0)
    second = 2 - np.argmax(msk[::-1], axis=0)
    idx = np.arange(pts.shape[1])
    keep = [a for a in range(3) if a != k]
    return pts[first, idx][:, keep], pts[second, idx][:, keep]


def _raster(segs, u0, w0, cell, nu, nw):
    """Even-odd fill of the closed loops made of segments on an nw x nu grid (cell size, origin u0, w0):
    a crossing of a row's centre line toggles every cell whose centre lies beyond it."""
    import numpy as np
    p, q = segs
    wa, wb = np.minimum(p[:, 1], q[:, 1]), np.maximum(p[:, 1], q[:, 1])
    r0 = np.clip(np.ceil((wa - w0) / cell - 0.5).astype(int), 0, nw)
    r1 = np.clip(np.ceil((wb - w0) / cell - 0.5).astype(int), 0, nw)   # rows r0 .. r1-1 cross this segment
    n = r1 - r0
    keep = n > 0
    if not keep.any():
        return np.zeros((nw, nu), bool)
    p, q, r0, n = p[keep], q[keep], r0[keep], n[keep]
    seg = np.repeat(np.arange(len(n)), n)
    row = r0[seg] + (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n))
    wr = w0 + (row + 0.5) * cell
    ps, qs = p[seg], q[seg]
    u = ps[:, 0] + (wr - ps[:, 1]) / (qs[:, 1] - ps[:, 1]) * (qs[:, 0] - ps[:, 0])
    col = np.clip(np.ceil((u - u0) / cell - 0.5).astype(int), 0, nu)
    grid = np.zeros((nw, nu + 1), np.int32)
    np.add.at(grid, (row, col), 1)
    return (np.cumsum(grid, axis=1)[:, :nu] & 1).astype(bool)


def overlap_fast(a, b, axis, values, max_cells=1.5e6):
    """Same measure as overlap() - shared section area (mm^2) of a and b over the planes axis = v -
    but in numpy: only the triangles crossing each plane are used and the two sections are filled on a
    grid (cell ~0.1 mm, finer for small parts) instead of being intersected as faces. Typically tens of
    times faster; agrees with overlap() to a few % (a raster, not exact)."""
    import numpy as np
    k = "xyz".index(axis)
    bb = App.BoundBox(a.BoundBox)
    bb = bb.intersected(b.BoundBox)
    if not bb.isValid():
        return 0.0
    lo = [bb.XMin, bb.YMin, bb.ZMin]
    hi = [bb.XMax, bb.YMax, bb.ZMax]
    (iu, iw) = [i for i in range(3) if i != k]
    du, dw = hi[iu] - lo[iu], hi[iw] - lo[iw]
    if du <= 0 or dw <= 0:
        return 0.0
    cell = max(0.02, min(0.1, (du * dw / max_cells) ** 0.5))
    nu, nw = int(np.ceil(du / cell)), int(np.ceil(dw / cell))
    tot = 0.0
    for v in values:
        sa, sb = _plane_segments(a, k, v), _plane_segments(b, k, v)
        if sa is None or sb is None:
            continue
        ga = _raster(sa, lo[iu], lo[iw], cell, nu, nw)
        if not ga.any():
            continue
        gb = _raster(sb, lo[iu], lo[iw], cell, nu, nw)
        tot += float((ga & gb).sum()) * cell * cell
    return tot


def _closest_on_tris(P, A, B, C):
    """Squared distance from each point P (n, 3) to its nearest triangle among (A, B, C) (m, 3 each):
    exact point-triangle distance (Ericson, Real-Time Collision Detection 5.1.5), vectorised."""
    import numpy as np
    p = P[:, None, :]
    a, b, c = A[None], B[None], C[None]
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = (ab * ap).sum(-1), (ac * ap).sum(-1)
    bp = p - b
    d3, d4 = (ab * bp).sum(-1), (ac * bp).sum(-1)
    cp = p - c
    d5, d6 = (ab * cp).sum(-1), (ac * cp).sum(-1)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    den = np.where(va + vb + vc == 0, 1.0, va + vb + vc)
    v, w = vb / den, vc / den
    q = a + ab * v[..., None] + ac * w[..., None]                    # inside the face
    def put(mask, val):
        np.copyto(q, val, where=mask[..., None])
    t = np.clip(d1 / np.where(d1 - d3 == 0, 1, d1 - d3), 0, 1)         # edge ab
    put((vc <= 0) & (d1 >= 0) & (d3 <= 0), a + ab * t[..., None])
    t = np.clip(d2 / np.where(d2 - d6 == 0, 1, d2 - d6), 0, 1)         # edge ac
    put((vb <= 0) & (d2 >= 0) & (d6 <= 0), a + ac * t[..., None])
    t = np.clip((d4 - d3) / np.where((d4 - d3) + (d5 - d6) == 0, 1, (d4 - d3) + (d5 - d6)), 0, 1)   # edge bc
    put((va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0), b + (c - b) * t[..., None])
    put((d1 <= 0) & (d2 <= 0), np.broadcast_to(a, q.shape))           # vertex regions
    put((d3 >= 0) & (d4 <= d3), np.broadcast_to(b, q.shape))
    put((d6 >= 0) & (d5 <= d6), np.broadcast_to(c, q.shape))
    return ((q - p) ** 2).sum(-1).min(axis=1)


def tris_near(obj, lo, hi):
    """The triangles (A, B, C arrays) of a mesh/shape whose boxes reach into the box lo..hi: crop once,
    then pass to clearance(tris=...) for many queries in that region."""
    import numpy as np
    A, B, C = _triangles(obj)
    tmin, tmax = np.minimum(np.minimum(A, B), C), np.maximum(np.maximum(A, B), C)
    keep = np.all((tmax >= np.asarray(lo)) & (tmin <= np.asarray(hi)), axis=1)
    return A[keep], B[keep], C[keep]


def clearance(points, obj, r=0.0, offset=(0.0, 0.0, 0.0), chunk=24, tris=None, cap=None):
    """Clearance (mm) between a tube of radius r swept along `points` (a sampled centreline, e.g.
    catmull_rom output) and a mesh or shape, the part moved by `offset`: min distance from the
    centreline to the part's surface, minus r. Negative = the tube cuts in that deep. Returns
    (clearance, centreline point where it is smallest). numpy only; triangles are cut down to the
    neighbourhood of each run of `chunk` points first (pass tris=tris_near(...) to crop once for many
    calls). cap: only clearances up to cap matter - triangles whose box is further than r + cap from
    every point are skipped (cheap bound first), and (inf, None) means "more than cap". Exact for the sampled points (a part thinner than the sample spacing could slip between
    them); a centreline buried more than r + 5 inside a part is not seen (it looks for nearby surface)."""
    import numpy as np
    A, B, C = tris if tris is not None else _triangles(obj)
    if not len(A):
        return float("inf"), None
    off = np.asarray(offset, float)
    P = (points if isinstance(points, np.ndarray) else np.asarray([tuple(p)[:3] for p in points], float)) - off
    tmin, tmax = np.minimum(np.minimum(A, B), C), np.maximum(np.maximum(A, B), C)
    best, where = np.inf, None
    for i in range(0, len(P), chunk):
        Q = P[i:i + chunk]
        reach = r + (cap if cap is not None else 5.0)
        lo, hi = Q.min(0) - reach, Q.max(0) + reach
        near = np.all((tmax >= lo) & (tmin <= hi), axis=1)
        if not near.any():
            continue
        if cap is not None:                          # lower bound: each point to each triangle's box
            gap = np.maximum(np.maximum(tmin[near][None] - Q[:, None], 0), Q[:, None] - tmax[near][None])
            close = ((gap ** 2).sum(-1) <= reach * reach).any(axis=0)
            if not close.any():
                continue
            near = np.flatnonzero(near)[close]
        d2 = _closest_on_tris(Q, A[near], B[near], C[near])
        j = int(np.argmin(d2))
        if d2[j] < best:
            best, where = float(d2[j]), tuple(float(x) for x in (Q[j] + off))
    if where is None:
        return float("inf"), None
    return best ** 0.5 - r, where


def _slice(s, axis, v):
    import Part
    if isinstance(s, Mesh.Mesh):
        return section_face(s, axis, v)
    n = App.Vector(*_AX[axis])
    wires = s.slice(n, v)
    if not wires:
        return None
    try:
        return Part.makeFace(wires, "Part::FaceMakerBullseye")
    except Exception:
        return None


# --- STEP export -----------------------------------------------------------------------------
def to_shape(m, reduction=0.0, tolerance=0.1):
    """Mesh -> Part shell/solid of its facets. reduction 0..1 decimates first (0.8 keeps ~20 %
    of the triangles) - meshes from STLs make huge STEP files otherwise."""
    import Part
    m = m.copy()
    if reduction > 0:
        m.decimate(tolerance, reduction)
    s = Part.Shape()
    s.makeShapeFromMesh(m.Topology, 0.05, False)
    try:
        sol = Part.makeSolid(s)
        if sol.isValid():
            return sol
    except Exception:
        pass
    return s


def rows_from(x_to, y_to, z_to):
    """rows for frame() from where the PRINT axes go, e.g. rows_from("-y", "z", "x"): print x
    -> machine -Y, print y -> machine +Z, print z -> machine +X. Easier to read than rows."""
    cols = []
    for t in (x_to, y_to, z_to):
        s = -1 if t.startswith("-") else 1
        v = [0, 0, 0]
        v["xyz".index(t.lstrip("+-").lower())] = s
        cols.append(v)
    return tuple(tuple(cols[j][i] for j in range(3)) for i in range(3))


# ---- holes and fastener joints -------------------------------------------------------------
# find_holes(obj) lists round holes (mesh or Part shape) as dicts {p0, p1, d}: the hole's axis
# runs p0 -> p1 over its length. Meshes: circle fits on sections along X, Y and Z (axis-aligned
# holes only); shapes: concave cylindrical faces (any direction). ray_hits(obj, origin, dir)
# gives the distances where a ray crosses obj's surface. hole_joints(a, b) pairs a's holes
# with b: which holes point into b, from which end, and where a bolt would leave b.

def _circle(pts):
    """Least-squares circle (Kasa) through 2D points -> (cx, cy, r, rms) or None."""
    import math
    n = len(pts)
    sx = sum(p[0] for p in pts) / n
    sy = sum(p[1] for p in pts) / n
    u = [(p[0] - sx, p[1] - sy) for p in pts]
    suu = sum(a * a for a, b in u)
    svv = sum(b * b for a, b in u)
    suv = sum(a * b for a, b in u)
    b0 = sum(a ** 3 + a * b * b for a, b in u) / 2
    b1 = sum(b ** 3 + b * a * a for a, b in u) / 2
    det = suu * svv - suv * suv
    if abs(det) < 1e-12:
        return None
    uc = (b0 * svv - b1 * suv) / det
    vc = (suu * b1 - suv * b0) / det
    r = math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
    rms = math.sqrt(sum((math.hypot(a - uc, b - vc) - r) ** 2 for a, b in u) / n)
    return sx + uc, sy + vc, r, rms


def find_holes(obj, dmin=2.3, dmax=9.0, step=0.5):
    """Round holes of diameter dmin..dmax in a Mesh (axis-aligned) or Part shape (any axis)."""
    import Part
    holes = []
    if isinstance(obj, Part.Shape):
        for f in obj.Faces:
            s = f.Surface
            if not isinstance(s, Part.Cylinder) or not dmin <= 2 * s.Radius <= dmax:
                continue
            u0, u1, v0, v1 = f.ParameterRange
            p, n = f.valueAt((u0 + u1) / 2, (v0 + v1) / 2), f.normalAt((u0 + u1) / 2, (v0 + v1) / 2)
            ax = App.Vector(s.Axis)
            ax.normalize()
            radial = p - s.Center - ax * (p - s.Center).dot(ax)
            if n.dot(radial) >= 0:              # convex (a pin or boss), not a hole
                continue
            ts = [(v.Point - s.Center).dot(ax) for v in f.Vertexes]
            c, d = s.Center, 2 * s.Radius
            for h in holes:                       # split half-faces of the same hole
                hax = h["p1"] - h["p0"]
                hax.normalize()
                off = (c - h["p0"]) - hax * (c - h["p0"]).dot(hax)
                if abs(abs(hax.dot(ax)) - 1) < 1e-6 and off.Length < 0.05 and abs(h["d"] - d) < 0.05:
                    break
            else:
                holes.append(dict(p0=c + ax * min(ts), p1=c + ax * max(ts), d=d))
        return holes
    bb = obj.BoundBox
    ranges = ((bb.XMin, bb.XMax), (bb.YMin, bb.YMax), (bb.ZMin, bb.ZMax))
    for k in range(3):
        a0, a1 = ranges[k]
        nrm = App.Vector(*[1.0 if i == k else 0.0 for i in range(3)])
        ws = [a0 + step / 2 + step * i for i in range(int((a1 - a0) / step))]
        uv = [i for i in range(3) if i != k]
        rec = []
        for w, loops in zip(ws, obj.crossSections([(nrm * w, nrm) for w in ws])):
            for poly in loops:
                if len(poly) < 8 or (poly[0] - poly[-1]).Length > 0.05:
                    continue
                fit = _circle([(p[uv[0]], p[uv[1]]) for p in poly])
                if fit and dmin <= 2 * fit[2] <= dmax and fit[3] < max(0.05, 0.04 * fit[2]):
                    rec.append((fit[0], fit[1], 2 * fit[2], w))
        groups = []
        for r in sorted(rec, key=lambda r: r[3]):
            for gr in groups:
                q = gr[-1]
                if abs(q[0] - r[0]) < 0.3 and abs(q[1] - r[1]) < 0.3 and abs(q[2] - r[2]) < 0.4 \
                        and r[3] - q[3] <= 1.6 * step:
                    gr.append(r)
                    break
            else:
                groups.append([r])
        for gr in groups:
            if len(gr) < 2:
                continue
            cu = sum(r[0] for r in gr) / len(gr)
            cv = sum(r[1] for r in gr) / len(gr)
            d = sorted(r[2] for r in gr)[len(gr) // 2]
            ends = []
            for w in (gr[0][3] - step / 2, gr[-1][3] + step / 2):
                v = [0.0, 0.0, 0.0]
                v[k], v[uv[0]], v[uv[1]] = w, cu, cv
                ends.append(App.Vector(*v))
            holes.append(dict(p0=ends[0], p1=ends[1], d=d))
    return holes


def drop_counterbores(holes, tol=0.3):
    """Holes minus counterbores / head pockets: a hole coaxial with a narrower one in the same part."""
    keep = []
    for h in holes:
        ax = h["p1"] - h["p0"]
        if ax.Length < 1e-9:
            continue
        ax.normalize()
        for s in holes:
            if s is h or s["d"] > h["d"] - 0.5:
                continue
            sx = s["p1"] - s["p0"]
            if sx.Length < 1e-9:
                continue
            sx.normalize()
            off = (s["p0"] - h["p0"]) - ax * (s["p0"] - h["p0"]).dot(ax)
            if abs(abs(sx.dot(ax)) - 1) < 1e-3 and off.Length < tol:
                break
        else:
            keep.append(h)
    return keep


_tri = {}


def _triangles(obj):
    import Part
    import numpy as np
    key = id(obj)
    if key not in _tri:
        if isinstance(obj, Part.Shape):
            pts, fac = obj.tessellate(0.05)
        else:
            pts, fac = obj.Topology
        P = np.array([(p.x, p.y, p.z) for p in pts], dtype=float)
        F = np.array(fac, dtype=int)
        _tri[key] = (obj, P[F[:, 0]], P[F[:, 1]], P[F[:, 2]])   # keep obj alive so id() stays unique
    return _tri[key][1:]


def ray_hits(obj, origin, direction, maxlen=1e4):
    """Sorted distances (0..maxlen) along the ray where it crosses obj's surface."""
    import numpy as np
    a, b, c = _triangles(obj)
    o = np.array([origin.x, origin.y, origin.z])
    dv = np.array([direction.x, direction.y, direction.z], dtype=float)
    dv /= np.linalg.norm(dv)
    end = o + dv * maxlen
    lo, hi = np.minimum(o, end) - 1e-6, np.maximum(o, end) + 1e-6
    keep = np.all((np.maximum(np.maximum(a, b), c) >= lo) & (np.minimum(np.minimum(a, b), c) <= hi), axis=1)
    a, b, c = a[keep], b[keep], c[keep]
    if not len(a):
        return []
    e1, e2 = b - a, c - a
    p = np.cross(dv, e2)
    det = np.einsum("ij,ij->i", e1, p)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - a
    u = np.einsum("ij,ij->i", s, p) * inv
    q = np.cross(s, e1)
    v = (q @ dv) * inv
    t = np.einsum("ij,ij->i", e2, q) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t >= 0) & (t <= maxlen)
    return sorted(set(np.round(t[hit], 3).tolist()))


def hole_joints(a, b, dmin=2.3, dmax=9.0, reach=60.0, holes=None, touch=1.0):
    """a's holes that point into b: list of {head, dir, d, a_len, b_in, b_out}. head = the hole end
    away from b (where a bolt head sits), dir = unit vector into b, b_in / b_out = distances from
    head to where b's material starts / where its first solid stretch ends round the hole (b_out
    None if that goes on past reach). b must start within `touch` mm of a's hole end (a ray that
    starts inside b counts as touching)."""
    out = []
    for h in (holes if holes is not None else find_holes(a, dmin, dmax)):
        ax = h["p1"] - h["p0"]
        L = ax.Length
        if L < 1e-6:
            continue
        ax.normalize()
        perp = ax.cross(App.Vector(0, 0, 1))
        if perp.Length < 0.1:
            perp = ax.cross(App.Vector(1, 0, 0))
        perp.normalize()
        perp2 = ax.cross(perp)
        r = h["d"]                   # sample a ring round the hole, outside any matching hole in b
        for sgn in (1, -1):
            d = ax * sgn
            start = h["p1"] if sgn > 0 else h["p0"]
            head = h["p0"] if sgn > 0 else h["p1"]
            segs = []
            for off in (perp * r, perp * -r, perp2 * r, perp2 * -r):
                hs = ray_hits(b, start + off - d * 0.05, d)
                if not hs:
                    continue
                if len(hs) % 2:                  # started inside b
                    hs = [0.0] + hs
                if hs[0] <= reach:
                    segs.append((hs[0], hs[1]))
            if len(segs) >= 2 and min(s0 for s0, s1 in segs) < touch:
                exits = sorted(s1 for s0, s1 in segs)
                ex = exits[len(exits) // 2]
                out.append(dict(head=head, dir=d, d=h["d"], a_len=L, b_in=L + min(s0 for s0, s1 in segs),
                                b_out=L + ex if ex <= reach else None))
                break
    return out


def find_pocket(obj, origin, direction, t0, t1, af, step=0.5, tol=0.7):
    """Hex nut pocket (across flats `af`, printed up to 2 * tol oversize) round the line
    origin + t * direction, t0 <= t <= t1:
    (ta, tb, corner) = where along the line the pocket starts and ends, and the unit vector (square
    to the line) from the axis to one of its corners - to turn a nut to fit; or None."""
    import math
    d = App.Vector(direction)
    d.normalize()
    u = d.cross(App.Vector(0, 0, 1))
    if u.Length < 0.1:
        u = d.cross(App.Vector(1, 0, 0))
    u.normalize()
    v = d.cross(u)
    ts = [t0 + step / 2 + step * i for i in range(max(1, int((t1 - t0) / step)))]
    hit = []
    import Part
    if isinstance(obj, Part.Shape):
        secs = [[[v.Point for v in w.OrderedVertexes] for w in obj.slice(d, d.dot(origin + d * t))] for t in ts]
    else:
        secs = obj.crossSections([(origin + d * t, d) for t in ts])
    for t, loops in zip(ts, secs):
        c = origin + d * t
        for poly in loops:
            if len(poly) < 6:
                continue
            pts = poly[:-1] if (poly[0] - poly[-1]).Length < 1e-6 else poly
            cx = sum((p - c).dot(u) for p in pts) / len(pts)
            cy = sum((p - c).dot(v) for p in pts) / len(pts)
            cc = c + u * cx + v * cy                       # the loop's own centre
            rs = [math.hypot((p - cc).dot(u), (p - cc).dot(v)) for p in poly]
            ratio = max(rs) / max(min(rs), 1e-6)          # hex: corner / flat = 2 / sqrt(3)
            if math.hypot(cx, cy) < 2 * tol and af / 2 - tol <= min(rs) <= af / 2 + 2 * tol                     and abs(ratio - 2 / math.sqrt(3)) < 0.08:
                p = poly[rs.index(max(rs))] - cc
                corner = u * p.dot(u) + v * p.dot(v)
                corner.normalize()
                hit.append((t, corner))
                break
    if len(hit) < 2:
        return None
    return hit[0][0] - step / 2, hit[-1][0] + step / 2, hit[len(hit) // 2][1]


def hole_axis(obj, origin, direction, ts, rmax=6.0):
    """Refine a bolt line from a round hole's own sections: for each t, the section loop whose
    centre is nearest origin + t * direction (all points within rmax of it). Returns (point,
    unit direction) through the loop centres, or the input line if under two are found."""
    d = App.Vector(direction)
    d.normalize()
    cs = []
    for t, loops in zip(ts, obj.crossSections([(origin + d * t, d) for t in ts])):
        c = origin + d * t
        best = None
        for poly in loops:
            pts = poly[:-1] if len(poly) > 1 and (poly[0] - poly[-1]).Length < 1e-6 else poly
            if len(pts) < 6:
                continue
            m = App.Vector(0, 0, 0)
            for p in pts:
                m += p
            m = m * (1.0 / len(pts))
            if max((p - m).Length for p in pts) > rmax:
                continue
            if best is None or (m - c).Length < (best - c).Length:
                best = m
        if best is not None and (best - c).Length < rmax:
            cs.append((t, best))
    if len(cs) < 2:
        return App.Vector(origin), d
    a, b = cs[0][1], cs[-1][1]
    nd = b - a
    if nd.dot(d) < 0:
        nd = -nd
    nd.normalize()
    m = App.Vector(0, 0, 0)
    for t, p in cs:
        m += p
    m = m * (1.0 / len(cs))
    p0 = m + nd * (origin - m).dot(nd)                     # the point on the new line abreast of origin
    return p0, nd


def find_counterbore(obj, origin, direction, t0, t1, dmin=11.0, dmax=19.0, step=0.5):
    """Round head pocket (diameter dmin..dmax) round the line origin + t * direction, t0 <= t <= t1:
    (ta, tb) where it starts and ends along the line, or None."""
    import math
    d = App.Vector(direction)
    d.normalize()
    ts = [t0 + step / 2 + step * i for i in range(max(1, int((t1 - t0) / step)))]
    hit = []
    for t, loops in zip(ts, obj.crossSections([(origin + d * t, d) for t in ts])):
        c = origin + d * t
        for poly in loops:
            pts = poly[:-1] if len(poly) > 1 and (poly[0] - poly[-1]).Length < 1e-6 else poly
            if len(pts) < 8:
                continue
            m = App.Vector(0, 0, 0)
            for p in pts:
                m += p
            m = m * (1.0 / len(pts))
            rs = [(p - m).Length for p in pts]
            if (m - c).Length < 1.5 and dmin <= 2 * min(rs) and 2 * max(rs) <= dmax and max(rs) / min(rs) < 1.08:
                hit.append(t)
                break
    if len(hit) < 2:
        return None
    return hit[0] - step / 2, hit[-1] + step / 2


def holes_near(obj, c, ax, reach=14.0, span=12.0, step=0.4, rmax=1.6, rmin=0.8, min_slices=4):
    """Small round holes near point c in a mesh, sectioned square to an approximate axis `ax` (a hole up
    to ~20 deg off it shows as an ellipse; its centres still lie on its axis): [(a, b, unit dir, n)] -
    the line through the loop centres from the first to the last section, n = sections it showed in.
    rmax / rmin bound the loop radius (M2.5-M3 holes by default)."""
    ax = App.Vector(ax)
    ax.normalize()
    ts = [-span + step * i for i in range(int(2 * span / step) + 1)]
    pts = []
    for t, loops in zip(ts, obj.crossSections([(c + ax * t, ax) for t in ts])):
        for poly in loops:
            q = poly[:-1] if len(poly) > 1 and (poly[0] - poly[-1]).Length < 1e-6 else poly
            if len(q) < 5:
                continue
            g = App.Vector(0, 0, 0)
            for p in q:
                g += p
            g = g * (1.0 / len(q))
            rs = [(p - g).Length for p in q]
            if max(rs) < rmax and min(rs) > rmin and (g - c - ax * t).Length < reach:
                pts.append((t, g))
    groups = []
    for t, g in sorted(pts, key=lambda x: x[0]):
        for gr in groups:
            w = g - gr[-1][1]
            if abs(gr[-1][0] - t) <= 2.5 * step and (w - ax * w.dot(ax)).Length < 0.6:
                gr.append((t, g))
                break
        else:
            groups.append([(t, g)])
    out = []
    for gr in groups:
        if len(gr) < min_slices:
            continue
        a, b = gr[0][1], gr[-1][1]
        d = b - a
        d.normalize()
        out.append((a, b, d, len(gr)))
    return out
