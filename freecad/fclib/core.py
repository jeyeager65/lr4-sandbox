# Geometry and document helpers for script-built (Part) models.
#
# Lengths given to these helpers are in the project's units: call set_units("in") for
# woodworking, leave the default "mm" for printing. FreeCAD itself always works in mm.
# Axes everywhere: X = width, Y = depth, Z = up.

import os
import FreeCAD as App
import Part

IN = 25.4
_scale = 1.0


def set_units(units):
    """'mm' or 'in': the unit every length below is given in."""
    global _scale
    _scale = {"mm": 1.0, "in": IN}[units]


def units():
    return "in" if _scale == IN else "mm"


def mm(v):
    """Project units -> mm."""
    return v * _scale


def to_units(v_mm):
    """mm -> project units."""
    return v_mm / _scale


def V(x, y, z=0.0):
    return App.Vector(x * _scale, y * _scale, z * _scale)


# --- shapes ------------------------------------------------------------------------------
def box(x0, x1, y0, y1, z0, z1):
    """Axis-aligned box between two corners."""
    return Part.makeBox((x1 - x0) * _scale, (y1 - y0) * _scale, (z1 - z0) * _scale, V(x0, y0, z0))


def cube(l, w, h, at=(0, 0, 0)):
    """l x w x h box with its min corner at `at`."""
    return Part.makeBox(l * _scale, w * _scale, h * _scale, V(*at))


def cyl(r, h, at=(0, 0, 0), axis=(0, 0, 1)):
    return Part.makeCylinder(r * _scale, h * _scale, V(*at), App.Vector(*axis))


def _prism(vs, direction):
    face = Part.Face(Part.makePolygon(vs + [vs[0]]))
    return face.extrude(direction)


def prism_xy(pts, z0, z1):
    """Polygon [(x, y)] extruded from z0 to z1."""
    return _prism([V(x, y, z0) for x, y in pts], V(0, 0, z1 - z0))


def prism_xz(pts, y0, y1):
    """Polygon [(x, z)] extruded from y0 to y1."""
    return _prism([V(x, y0, z) for x, z in pts], V(0, y1 - y0, 0))


def prism_yz(pts, x0, x1):
    """Polygon [(y, z)] extruded from x0 to x1."""
    return _prism([V(x0, y, z) for y, z in pts], V(x1 - x0, 0, 0))


def place_centered(shape, x, y, z):
    """Move shape so its XY bounding-box centre is at (x, y) and its bottom at z."""
    bb = shape.BoundBox
    shape.translate(App.Vector(x * _scale - bb.Center.x, y * _scale - bb.Center.y, z * _scale - bb.ZMin))
    return shape


def edges_parallel(shape, axis=(0, 0, 1), tol=1e-6):
    """Straight edges parallel to `axis` (e.g. the vertical edges to fillet)."""
    a = App.Vector(*axis)
    a.normalize()
    out = []
    for e in shape.Edges:
        if e.Curve.TypeId != "Part::GeomLine":
            continue
        d = e.Vertexes[-1].Point - e.Vertexes[0].Point
        if d.Length > 0 and abs(abs(d.normalize().dot(a)) - 1) < tol:
            out.append(e)
    return out


# --- drafted (tapered) prisms: casting patterns, molds, tapered-endmill relief ------------
# OCC's own taper (Part::Extrusion TaperAngle, makeOffset2D + loft) fails on many font /
# SVG outlines. This builds the solid directly: each outline becomes a fine polyline, every
# vertex is offset along its miter, and the walls are ruled faces between the two rings.

def _ring(wire, deflection):
    pts = wire.discretize(Deflection=deflection)
    out = [pts[0]]
    for p in pts[1:]:
        if (p - out[-1]).Length > 1e-4:
            out.append(p)
    if (out[0] - out[-1]).Length <= 1e-4:
        out.pop()
    return out


def _area2(pts):
    n = len(pts)
    return sum(pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y for i in range(n))


def _miter(pts, d, limit=3.0):
    """Offset a closed ring d to the right of its direction (miter joins, capped)."""
    n, out = len(pts), []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        t1, t2 = b - a, c - b
        t1.normalize()
        t2.normalize()
        n1, n2 = App.Vector(t1.y, -t1.x, 0), App.Vector(t2.y, -t2.x, 0)
        k = 1 + n1.dot(n2)
        m = (n1 + n2) * (d / k) if k > 1e-9 else n1 * d
        if m.Length > limit * abs(d):
            m = m * (limit * abs(d) / m.Length)
        out.append(b + m)
    return out


def _offset_ring(r, d):
    """Offset ring, dropping top vertices whose offset edge would run backwards (the tiny
    edges at sharp corners), so the offset never loops over itself."""
    r = list(r)
    for _ in range(len(r)):
        b = _miter(r, d)
        n = len(r)
        flips = {(i + 1) % n for i in range(n) if (b[(i + 1) % n] - b[i]).dot(r[(i + 1) % n] - r[i]) <= 1e-9}
        if not flips:
            return r, b
        r = [p for k, p in enumerate(r) if k not in flips]
    raise ValueError("drafted_prism: offset cleanup did not converge")


def _planar(q, tol=1e-6):
    nrm = (q[1] - q[0]).cross(q[2] - q[0])
    if nrm.Length < 1e-12:
        return False
    nrm.normalize()
    return abs((q[3] - q[0]).dot(nrm)) < tol


def face_rings(face, deflection=0.02):
    """A flat face's outlines as polylines [(is_hole, [points])]: outer counter-clockwise
    first, holes clockwise (so 'right of the direction of travel' is always outward)."""
    rings = []
    for w in face.Wires:
        r = _ring(w, deflection)
        outer = w.isSame(face.OuterWire)
        if (_area2(r) > 0) != outer:
            r.reverse()
        rings.append((not outer, r))
    rings.sort(key=lambda t: t[0])
    return rings


def offset_rings(rings, d):
    """Grow (d > 0) or shrink (d < 0) the material of face_rings() output by d mm."""
    return [(hole, _offset_ring(r, d)[1]) for hole, r in rings]


def drafted_prism(face, depth, angle_deg, deflection=0.02):
    """Solid from a flat, horizontal face (its outline is the TOP) down `depth` (project
    units), the walls leaning `angle_deg` from vertical: > 0 grows going down (a raised
    letter or a pattern with draft), < 0 shrinks (a drafted pocket / cutter).
    Holes in the face lean the opposite way, as a tapered cutter would leave them.
    Curves become polylines within `deflection` mm."""
    import math
    h = depth * _scale
    d = h * math.tan(math.radians(angle_deg))
    rings = face_rings(face, deflection)
    faces, tops, bottoms = [], [], []
    down = App.Vector(0, 0, -h)
    for _, r in rings:
        r, b = _offset_ring(r, d)
        b = [p + down for p in b]
        tops.append(Part.makePolygon(r + [r[0]]))
        bottoms.append(Part.makePolygon(b + [b[0]]))
        n = len(r)
        for i in range(n):
            j = (i + 1) % n
            q = [r[i], r[j], b[j], b[i]]
            if _planar(q):
                faces.append(Part.Face(Part.makePolygon(q + [q[0]])))
            else:
                faces.append(Part.Face(Part.makePolygon([r[i], r[j], b[j], r[i]])))
                faces.append(Part.Face(Part.makePolygon([r[i], b[j], b[i], r[i]])))
    faces.append(Part.makeFace(tops, "Part::FaceMakerBullseye"))
    faces.append(Part.makeFace(bottoms, "Part::FaceMakerBullseye"))
    solid = Part.makeSolid(Part.makeShell(faces))
    if solid.Volume < 0:
        solid.reverse()
    return solid


# --- documents -----------------------------------------------------------------------------
def honeycomb_cells(face, depth, cell=5.0, wall=0.8, wall_in=1.2, keep=(), keep_r=3.8, angle=0.0):
    """Open honeycomb: the hexagonal cells (as one solid) to CUT from a part so it looks printed with no top or
    bottom layers. face = the region's outline (a planar Part.Face); the cells run through `depth` (a vector,
    both ways from the face, so make it longer than the part); cell = across flats, wall = the infill wall
    between cells; wall_in = perimeter wall left inside the outline; keep = points (on the face) with a solid
    ring of radius keep_r round them (screw holes). angle = turns the grid in the face's plane (deg)."""
    import math
    n = face.normalAt(0, 0)
    n.normalize()
    u = n.cross(App.Vector(0, 0, 1)) if abs(n.z) < 0.9 else n.cross(App.Vector(1, 0, 0))
    u.normalize()
    if angle:
        u = App.Rotation(n, angle).multVec(u)
    v = n.cross(u)
    def clean(f, step=0.6):                                   # outline rebuilt as a tidy polygon (merged faces
        pts = f.OuterWire.discretize(Distance=step)          # can carry slivers the offset chokes on)
        keep = [pts[0]]
        for p in pts[1:]:
            if (p - keep[-1]).Length > step * 0.5:
                keep.append(p)
        if (keep[0] - keep[-1]).Length > 1e-6:
            keep.append(keep[0])
        return Part.Face(Part.makePolygon(keep))
    region = face
    if wall_in:
        for k, join in ((0, 0), (0, 2), (1, 0)):                   # arc join first: the intersection join
            try:                                                   # fails on some dense mesh outlines
                region = (face if k == 0 else clean(face)).makeOffset2D(-wall_in, join=join)
                break
            except Exception:
                continue
    for p in keep:
        region = region.cut(Part.Face(Part.Wire(Part.makeCircle(keep_r, App.Vector(*p), n))))
    pitch = cell + wall
    r = cell / math.sqrt(3)                                   # hexagon circumradius (flats = cell)
    bb = face.BoundBox
    c0 = bb.Center
    span = bb.DiagonalLength / 2 + pitch
    hexes = []
    rows = int(span / (pitch * math.sqrt(3) / 2)) + 1
    cols = int(span / pitch) + 1
    for j in range(-rows, rows + 1):
        for i in range(-cols, cols + 1):
            cu = (i + (0.5 if j % 2 else 0.0)) * pitch
            cv = j * pitch * math.sqrt(3) / 2
            cc = c0 + u * cu + v * cv
            pts = [cc + (u * math.cos(math.radians(30 + 60 * k)) + v * math.sin(math.radians(30 + 60 * k))) * r
                   for k in range(7)]
            hexes.append(Part.Face(Part.makePolygon(pts)))
    grid = Part.makeCompound(hexes).common(region)            # clipped to the inside of the perimeter wall
    d = App.Vector(depth)
    cells = [f.extrude(d * 2.0) for f in grid.Faces]
    for c in cells:
        c.translate(d * -1.0)
    return Part.makeCompound(cells)


def fresh_document(name):
    """Close `name` if it is open, then create it empty."""
    if name in App.listDocuments():
        App.closeDocument(name)
    return App.newDocument(name)


def tag_colour(obj, colour, transparency=0):
    """Remember a preview colour on the object (headless builds have no ViewObject;
    fclib.view.apply_colours() paints it in the GUI) and paint it now if the GUI is up."""
    if "PreviewColor" not in obj.PropertiesList:
        obj.addProperty("App::PropertyColor", "PreviewColor", "fclib", "preview colour")
        obj.addProperty("App::PropertyInteger", "PreviewTransparency", "fclib", "preview transparency %")
    obj.PreviewColor = tuple(colour)
    obj.PreviewTransparency = int(transparency)
    if App.GuiUp and obj.ViewObject is not None:
        obj.ViewObject.ShapeColor = tuple(colour)
        obj.ViewObject.Transparency = int(transparency)


class Model:
    """Collects named parts, then builds them into a FreeCAD document.

        m = Model("Shelf")
        m.add("SideLeft", box(...), group="Carcass", colour=PINE, cut=wood.sheet())
        doc = m.build()
        m.save(BUILD)                    # build/Shelf.FCStd
    """

    def __init__(self, name):
        self.name = name
        self.parts = []                  # dicts: name, group, shape, colour, transparency, cut
        self.doc = None

    def add(self, name, shape, group="Parts", colour=None, transparency=0, cut=None):
        if any(p["name"] == name for p in self.parts):
            raise ValueError(f"duplicate part name {name}")
        self.parts.append(dict(name=name, group=group, shape=shape, colour=colour,
                               transparency=transparency, cut=cut))
        return shape

    def add_mesh(self, name, mesh, placement=None, group="Parts", colour=None, transparency=0,
                 cut=None):
        """A mesh part (e.g. a downloaded STL, see fclib.mesh) shown as a Mesh::Feature at
        `placement`. Its "shape" entry is the placed mesh (for bound_box and mesh checks);
        overlaps() skips mesh parts - use fclib.mesh.overlap for those."""
        if any(p["name"] == name for p in self.parts):
            raise ValueError(f"duplicate part name {name}")
        placed = mesh.copy()
        if placement is not None:
            placed.transform(placement.toMatrix())
        self.parts.append(dict(name=name, group=group, shape=placed, colour=colour,
                               transparency=transparency, cut=cut, mesh=mesh,
                               placement=placement))
        return placed

    def shape(self, name):
        return next(p["shape"] for p in self.parts if p["name"] == name)

    def build(self, doc=None):
        doc = doc or fresh_document(self.name)
        groups = {}
        for p in self.parts:
            if p["group"] not in groups:
                # internal name prefixed so a group never takes a part's name ("Pattern"
                # group + "Pattern" part would make the part "Pattern001")
                g = doc.addObject("App::DocumentObjectGroup", f"Group_{p['group']}")
                g.Label = p["group"]
                groups[p["group"]] = g
            if p.get("mesh") is not None:
                obj = doc.addObject("Mesh::Feature", p["name"])
                obj.Mesh = p["mesh"]
                if p["placement"] is not None:
                    obj.Placement = p["placement"]
            else:
                obj = doc.addObject("Part::Feature", p["name"])
                obj.Shape = p["shape"]
            groups[p["group"]].addObject(obj)
            if p["colour"] is not None:
                tag_colour(obj, p["colour"], p["transparency"])
        doc.recompute()
        self.doc = doc
        return doc

    def save(self, folder, filename=None):
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, filename or f"{self.name}.FCStd")
        self.doc.saveAs(path)
        return path

    def overlaps(self, min_volume=1.0, skip_groups=()):
        """Pairs of parts that intersect by more than min_volume mm^3: [(a, b, mm^3)]."""
        ps = [p for p in self.parts if p["group"] not in skip_groups and p.get("mesh") is None]
        bad = []
        for i in range(len(ps)):
            for j in range(i + 1, len(ps)):
                a, b = ps[i]["shape"], ps[j]["shape"]
                if not a.BoundBox.intersect(b.BoundBox):
                    continue
                v = a.common(b).Volume
                if v > min_volume:
                    bad.append((ps[i]["name"], ps[j]["name"], round(v, 1)))
        return bad

    def bound_box(self):
        bb = None
        for p in self.parts:
            if bb is None:
                bb = App.BoundBox(p["shape"].BoundBox)
            else:
                bb.add(p["shape"].BoundBox)
        return bb


def size_text(shape_or_bb):
    """'120 x 40 x 6 mm' (or inches) for a shape or bounding box."""
    bb = shape_or_bb.BoundBox if hasattr(shape_or_bb, "BoundBox") else shape_or_bb
    dims = [to_units(d) for d in (bb.XLength, bb.YLength, bb.ZLength)]
    return " x ".join(f"{d:.3g}" if units() == "in" else f"{d:.1f}" for d in dims) + f" {units()}"


def cached(cache_dir, name, fn, *args, files=(), salt="", **kw):
    """Disk cache for slow geometry: returns fn(*args, **kw), stored under cache_dir/name and reused while the key
    holds. The value may nest dicts (str keys) / lists of Mesh.Mesh (-> STL), Part.Shape (-> BREP) and JSON values.
    Key = fn's source + args + kw + size/mtime of each path in `files` + salt (bump salt when helpers fn calls
    change - their code isn't in the key)."""
    import hashlib
    import inspect
    import json
    import shutil
    import Mesh
    h = hashlib.sha1((inspect.getsource(fn) + repr(args) + repr(sorted(kw.items())) + salt).encode())
    for f in files:
        st = os.stat(f)
        h.update(f"{os.path.abspath(f)}|{st.st_size}|{st.st_mtime_ns}".encode())
    key = h.hexdigest()
    d = os.path.join(cache_dir, name)
    idx = os.path.join(d, "index.json")

    def enc(v, path):
        if isinstance(v, dict):
            return {"dict": {k: enc(x, f"{path}_{k}") for k, x in v.items()}}
        if isinstance(v, (list, tuple)):
            return {"list": [enc(x, f"{path}_{i}") for i, x in enumerate(v)]}
        if isinstance(v, Mesh.Mesh):
            v.write(os.path.join(d, path + ".stl"))
            return {"mesh": path + ".stl"}
        if isinstance(v, Part.Shape):
            v.exportBrep(os.path.join(d, path + ".brep"))
            return {"shape": path + ".brep"}
        return {"value": v}

    def dec(e):
        if "dict" in e:
            return {k: dec(x) for k, x in e["dict"].items()}
        if "list" in e:
            return [dec(x) for x in e["list"]]
        if "mesh" in e:
            return Mesh.Mesh(os.path.join(d, e["mesh"]))
        if "shape" in e:
            s = Part.Shape()
            s.importBrep(os.path.join(d, e["shape"]))
            return s
        return e["value"]

    try:
        with open(idx) as f:
            j = json.load(f)
        if j["key"] == key:
            return dec(j["data"])
    except (OSError, ValueError, KeyError):
        pass
    out = fn(*args, **kw)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    data = enc(out, "v")
    with open(idx, "w") as f:
        json.dump({"key": key, "data": data}, f)
    return out


def fingerprint(shape):
    """Cheap identity of a placed Part shape or Mesh (facet / face count, bound box, volume): changes when it moves
    or changes shape. For cache keys (LowRider4 check.py / hardware.py / build.py). Part shapes use OCC's precise box:
    the quick BoundBox of curved faces shifts ~0.005 mm once a shape has been tessellated (unstable keys)."""
    if hasattr(shape, "CountFacets"):
        b, n = shape.BoundBox, shape.CountFacets
    else:
        b, n = shape.optimalBoundingBox(False, False), len(shape.Faces)
    return f"{n}|{b.XMin:.3f},{b.YMin:.3f},{b.ZMin:.3f},{b.XMax:.3f},{b.YMax:.3f},{b.ZMax:.3f}|{shape.Volume:.2f}"
