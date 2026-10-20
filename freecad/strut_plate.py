# LR4 strut plates - a Python port of Vector76's strut plate generator (OpenSCAD; not shipped here), the twin of
# web/js/strut_plate.js. Same shapes, same polygon circles ($fn 36 holes, 30 dogbones), so the outlines match the
# SCAD's DXF vertex for vertex (tests/test_strut_plate.py checks it against OpenSCAD, local only).
# The layout maths is plain Python; the outline cut (dogbones + notches) uses FreeCAD's OCC, so plates() / face()
# need FreeCAD. Coordinates as the SCAD: x along the strut (0..length), y 0..67.5 across the plate, mm.
import math

H = 67.5                 # plate height (SCAD y)
MARGIN = 0.25            # SCAD `margin`
BOTTOM_Y = -95.0         # the SCAD's plates_2d() draws the bottom plate at ty(-95)
HOLE_D, HOLE_FN, DOG_FN = 5.3, 36, 30


def braces(xlen, nbraces=0):
    """Brace count and pitch as the SCAD computes them (hole centres at 9 + i * pitch)."""
    n = nbraces or math.floor((xlen - 18) / (165 + 18)) + 1
    return n, (xlen - 18) / (n - 1)


def circle(d, fn, pre=(0, 0), rot=0, post=(0, 0)):
    """OpenSCAD circle(d, $fn) as tx(post) rz(rot) tx(pre) circle(): vertex i at 360 * i / fn degrees."""
    r, a = d / 2, math.radians(rot)
    c, s = math.cos(a), math.sin(a)
    out = []
    for i in range(fn):
        t = 2 * math.pi * i / fn
        x, y = r * math.cos(t) + pre[0], r * math.sin(t) + pre[1]
        out.append((c * x - s * y + post[0], s * x + c * y + post[1]))
    return out


def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def layout(xlen, nbraces=0, bottom=False, extra=8.0, dogbones=3.5):
    """One plate as plain polygons: (outline, cuts, holes). outline = the main rectangle plus the wings between
    the braces, walked counter-clockwise (the SCAD's union, written out); cuts = the polygons it subtracts that
    touch the outline (notches, dogbones); holes = the bolt hole 36-gons (inside, touching nothing)."""
    n, pitch = braces(xlen, nbraces)
    w = pitch - 18 - 2 * MARGIN                                  # wing width
    xs = [18 + MARGIN + i * pitch for i in range(n - 1)]         # wing left edges
    outline = [(MARGIN, 0.0)]
    for x0 in xs if extra > 0 else ():                         # along the bottom edge, wings hang below
        outline += [(x0, 0.0), (x0, -extra), (x0 + w, -extra), (x0 + w, 0.0)]
    outline += [(xlen - MARGIN, 0.0), (xlen - MARGIN, H)]
    for x0 in reversed(xs) if extra > 0 else ():               # back along the top, wings stick up
        outline += [(x0 + w, H), (x0 + w, H + extra), (x0, H + extra), (x0, H)]
    outline.append((MARGIN, H))
    cuts = []
    if not bottom:
        cuts.append(rect(0, 30.49, 5.25, 12))
        cuts.append(rect(xlen - 35.25, 10.85, 35 + 1, 19.1))    # right side large notch (+1 past the plate end:
                                                                  # same result, no faces coincident with the edge)
    d = dogbones
    if d > 0:
        for x0 in xs:
            cuts += [circle(d, DOG_FN, (-d / 2, 0), 45, (x0, 0)), circle(d, DOG_FN, (-d / 2, 0), -45, (x0, H)),
                     circle(d, DOG_FN, (d / 2, 0), -45, (x0 + w, 0)), circle(d, DOG_FN, (d / 2, 0), 45, (x0 + w, H))]
    holes = [circle(HOLE_D, HOLE_FN, post=(i * pitch + 9, y)) for y in (5.75, H - 5.75) for i in range(n)]
    return outline, cuts, holes


def _outer(outline, cuts):
    """outline minus cuts (OCC, as 1 mm prisms - 2D face booleans can drop faces) -> the outer loop's points."""
    import FreeCAD as App
    import Part
    V = App.Vector

    def prism(pts, z0, h):
        w = Part.makePolygon([V(x, y, z0) for x, y in pts] + [V(pts[0][0], pts[0][1], z0)])
        return Part.Face(w).extrude(V(0, 0, h))

    s = prism(outline, 0, 1)
    if cuts:
        s = s.cut(Part.makeCompound([prism(c, -1, 3) for c in cuts]))
    try:
        s = s.removeSplitter()
    except Exception:
        pass
    base = [f for f in s.Faces if f.BoundBox.ZMax < 1e-6]
    if len(base) != 1:
        raise RuntimeError(f"strut plate outline: {len(base)} faces at z = 0")
    pts = [(v.X, v.Y) for v in base[0].OuterWire.OrderedVertexes]
    return _collinear_free(pts)


def _collinear_free(pts):
    out = []
    for i, p in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % len(pts)]
        if abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9:
            out.append(p)
    return out


def plate(xlen, nbraces=0, bottom=False, extra=8.0, dogbones=3.5):
    """One plate as loops [outer, hole, hole, ...] (points, not closed), SCAD coordinates. Needs FreeCAD."""
    outline, cuts, holes = layout(xlen, nbraces, bottom, extra, dogbones)
    return [_outer(outline, cuts)] + holes


def plates(strut_length, wing=11.5, dogbones=3.5, nbraces=0):
    """Both plates as the SCAD's plates_2d() makes them, each at y 0..67.5: {"front": loops, "bottom": loops}.
    wing: front_wing_size (11.5 for 1" EMT, V1E docs); the bottom plate's wings are 5.5 (fixed in the SCAD)."""
    return dict(front=plate(strut_length, nbraces, False, wing, dogbones),
                bottom=plate(strut_length, nbraces, True, 5.5, dogbones))


def face(loops, hole_d=None):
    """Loops -> a flat Part face at z = 0. hole_d: make the bolt holes true circles of that size (at the 36-gons'
    centres) instead of the polygons."""
    import FreeCAD as App
    import Part
    V = App.Vector
    wires = [Part.makePolygon([V(x, y, 0) for x, y in loops[0]] + [V(*loops[0][0], 0)])]
    for l in loops[1:]:
        if hole_d:
            cx, cy = sum(p[0] for p in l) / len(l), sum(p[1] for p in l) / len(l)
            wires.append(Part.Wire(Part.makeCircle(hole_d / 2, V(cx, cy, 0))))
        else:
            wires.append(Part.makePolygon([V(x, y, 0) for x, y in l] + [V(*l[0], 0)]))
    return Part.makeFace(wires, "Part::FaceMakerBullseye")


# ---- downloads: the same files as the page's (strut_plate.js toDXF / toSVG), plates laid out as plates_2d() ----
def _laid_out(pl):
    return [pl["front"], [[(x, y + BOTTOM_Y) for x, y in l] for l in pl["bottom"]]]


def to_dxf(pl):
    """DXF R12, mm, one closed POLYLINE per loop (CAM-friendly; OpenSCAD writes LINE soup)."""
    L = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]
    for loops in _laid_out(pl):
        for ring in loops:
            L += ["0", "POLYLINE", "8", "0", "66", "1", "70", "1"]
            for x, y in ring:
                L += ["0", "VERTEX", "8", "0", "10", f"{x:.6f}", "20", f"{y:.6f}"]
            L += ["0", "SEQEND", "8", "0"]
    L += ["0", "ENDSEC", "0", "EOF"]
    return "\n".join(L) + "\n"


def to_svg(pl, pad=2):
    """SVG in mm (y up -> y down), evenodd fill so the holes show."""
    rings = [r for loops in _laid_out(pl) for r in loops]
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    x0, x1, y0, y1 = min(xs) - pad, max(xs) + pad, min(ys) - pad, max(ys) + pad
    w, h = x1 - x0, y1 - y0
    d = "".join("M" + "L".join(f"{x - x0:.4f},{y1 - y:.4f}" for x, y in r) + "Z" for r in rings)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.3f}mm" height="{h:.3f}mm" '
            f'viewBox="0 0 {w:.3f} {h:.3f}"><path d="{d}" fill="none" stroke="black" stroke-width="0.1" '
            f'fill-rule="evenodd"/></svg>\n')


def write(out_base, pl):
    """<out_base>.dxf and .svg."""
    for ext, text in (("dxf", to_dxf(pl)), ("svg", to_svg(pl))):
        with open(f"{out_base}.{ext}", "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
