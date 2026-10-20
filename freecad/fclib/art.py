# Text and SVG artwork as solids: labels, debossed text, multi-colour inlays for AMS.
# (From hdmi-ddc-input-switch/case/cadlib.py.) Works in mm, independent of core units.
#
#   label = text_solid("M3", 4.0, 0.6)                 # 4 mm tall letters, 0.6 mm deep
#   place_centered(label, x, y, top - 0.6); part = part.cut(label)       # deboss
#   for colour, solid in svg_color_solids("logo.svg", 40, 30, 0.6): ...  # one per colour

import os
import FreeCAD as App
import Part

FONT_DIR  = "C:/Windows/Fonts/"
FONT_FILE = "arialbd.ttf"


def text_solid(s, height, depth, font_file=FONT_FILE, bold=0.0):
    """Extruded text, positioned with its bounding box at the origin.
    `bold` grows every outline by that much (thicker strokes, smaller holes) and spaces
    the letters out by twice that, so the gaps between them stay as the font drew them."""
    faces = []
    for i, char in enumerate(Part.makeWireString(s, FONT_DIR, font_file, height)):
        if char:
            if bold > 0:
                # fine polygons first: offsetting the font's splines can give faces
                # that extrude into invalid solids
                poly = []
                for w in char:
                    pts = w.discretize(Deflection=0.005)
                    poly.append(Part.makePolygon(pts + [pts[0]] if pts[0] != pts[-1] else pts))
                f = Part.Face(poly, "Part::FaceMakerBullseye").makeOffset2D(bold, join=0)
            else:
                f = Part.Face(char, "Part::FaceMakerBullseye")
            if bold > 0:
                f.translate(App.Vector(2 * bold * i, 0, 0))
            faces.append(f)
    solid = Part.makeCompound(faces).extrude(App.Vector(0, 0, depth))
    bb = solid.BoundBox
    solid.translate(App.Vector(-bb.XMin, -bb.YMin, 0))
    return solid


def fit_height(lines, max_w, max_h, font_file=FONT_FILE, line_gap=0.8, line_max_h=None, bold=0.0):
    """Largest line height at which all `lines` fit a max_w x max_h box."""
    fits = []
    for s in lines:
        w10 = text_solid(s, 10.0, 0.1, font_file).BoundBox.XLength
        fits.append(10.0 * (max_w - 2 * bold * len(s)) / w10)    # bold adds 2*bold per letter
    n = len(lines)
    return min(line_max_h or max_h, min(fits), (max_h - 2 * bold * n - line_gap * (n - 1)) / n)


def fit_text(label, max_w, max_h, depth, font_file=FONT_FILE, min_h=None, line_gap=0.8,
             line_max_h=None, height=None, bold=0.0):
    """Text sized to fit a max_w x max_h box, centred on the origin, z from 0 to depth.
    Each line is at most line_max_h tall. "\\n" in the label forces line breaks; otherwise,
    if a single line would be shorter than min_h and the label has a space, it wraps
    onto two lines. `height` forces the line height (e.g. to match other labels)."""
    def line(s, h):
        return text_solid(s, h, depth, font_file, bold)

    if "\n" in label:
        lines = label.split("\n")
        h = fit_height(lines, max_w, max_h, font_file, line_gap, line_max_h, bold)
    else:
        lines = [label]
        h = fit_height(lines, max_w, max_h, font_file, line_gap, line_max_h, bold)
        if min_h and h < min_h and " " in label:
            lines = label.split(" ", 1)
            h = fit_height(lines, max_w, max_h, font_file, line_gap, line_max_h, bold)
    if height is not None:
        h = height

    pitch = h + 2 * bold + line_gap
    total = len(lines) * (h + 2 * bold) + (len(lines) - 1) * line_gap
    out = None
    for i, s in enumerate(lines):
        t = line(s, h)
        place_centered(t, 0, total / 2 - i * pitch - (h + 2 * bold) / 2, 0)
        out = t if out is None else out.fuse(t)
    return out


SVG_SHAPES = ("path", "rect", "circle", "ellipse", "polygon")
SVG_NAMED = {"black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000",
             "blue": "#0000ff", "yellow": "#ffff00", "orange": "#ffa500", "gray": "#808080",
             "grey": "#808080"}


def _svg_fill(el, inherited):
    fill = el.get("fill")
    for decl in (el.get("style") or "").split(";"):
        k, _, v = decl.partition(":")
        if k.strip() == "fill":
            fill = v.strip()
    fill = (fill or inherited or "#000000").lower()
    fill = SVG_NAMED.get(fill, fill)
    if len(fill) == 4 and fill.startswith("#"):
        fill = "#" + "".join(c * 2 for c in fill[1:])
    return fill


def _svg_faces(svg_text):
    """Import SVG text into a temporary document; return one face per SVG shape
    (holes within a shape via nesting). Shapes may overlap each other."""
    import importSVG
    import re
    import tempfile
    # FreeCAD asks for a DPI when the root width has no unit; we rescale anyway,
    # so give it mm units to skip the dialog.
    for attr in ("width", "height"):
        svg_text = re.sub(rf'(<svg\b[^>]*?\b{attr}=")([\d.]+)(?:px)?"', r'\1\2mm"', svg_text, count=1)
    tmp = os.path.join(tempfile.gettempdir(), "cadlib-import.svg")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(svg_text)
    doc = App.newDocument("SvgTmp")
    try:
        importSVG.insert(tmp, doc.Name)
        faces = []
        for o in doc.Objects:
            if hasattr(o, "Shape") and not o.Shape.isNull():
                wires = [w for w in o.Shape.Wires if w.isClosed()]
                if wires:
                    faces.append(Part.makeFace(wires, "Part::FaceMakerBullseye"))
        return faces
    finally:
        App.closeDocument(doc.Name)


def _svg_stroke(el, inherited):
    stroke = el.get("stroke")
    for decl in (el.get("style") or "").split(";"):
        k, _, v = decl.partition(":")
        if k.strip() == "stroke":
            stroke = v.strip()
    stroke = (stroke or inherited or "none").lower()
    stroke = SVG_NAMED.get(stroke, stroke)
    if len(stroke) == 4 and stroke.startswith("#"):
        stroke = "#" + "".join(c * 2 for c in stroke[1:])
    return stroke


def _svg_import_shapes(svg_text):
    """Import SVG text into a temporary document; return the imported shapes (mm, Y up)."""
    import importSVG
    import tempfile
    tmp = os.path.join(tempfile.gettempdir(), "fclib-import.svg")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(svg_text)
    doc = App.newDocument("SvgTmp")
    try:
        importSVG.insert(tmp, doc.Name)
        doc.recompute()
        return [o.Shape.copy() for o in doc.Objects if hasattr(o, "Shape") and not o.Shape.isNull()]
    finally:
        App.closeDocument(doc.Name)


def svg_stroke_wires(path):
    """Closed outlines from a CAM-style SVG (strokes, no fills), grouped by stroke colour:
    {"#rrggbb": [wire, ...]} in the SVG's own mm coordinates (Y up), unscaled.
    The SVG's width/height must carry mm units (CAM exports like MillMage/LightBurn do)."""
    import copy
    import xml.etree.ElementTree as ET
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(path)

    def tag(el):
        return el.tag.rsplit("}", 1)[-1]

    order = []

    def walk(el, inherited):
        stroke = _svg_stroke(el, inherited)
        if tag(el) in SVG_SHAPES:
            el.set("data-fclib-stroke", stroke)
            if stroke != "none" and stroke not in order:
                order.append(stroke)
        for child in list(el):
            walk(child, stroke)
    walk(tree.getroot(), None)

    out = {}
    for colour in order:
        t = copy.deepcopy(tree)
        parents = {c: p for p in t.iter() for c in p}
        for el in list(t.iter()):
            if tag(el) in SVG_SHAPES and el.get("data-fclib-stroke") != colour:
                parents[el].remove(el)
        wires = []
        for s in _svg_import_shapes(ET.tostring(t.getroot(), encoding="unicode")):
            wires += [w for w in s.Wires if w.isClosed()]
        out[colour] = wires
    return out


def write_cut_svg(path, ring_sets, width, height, stroke="#ff0000", title=""):
    """Laser/CAM cut file: closed polylines in mm, Y up in the model -> Y down in the SVG.
    ring_sets = [[(is_hole, [points]), ...], ...] (e.g. core.face_rings output per face),
    drawn in the box 0..width x 0..height. Hairline strokes in `stroke` (LightBurn/MillMage
    layer colour), no fill."""
    paths = []
    for rings in ring_sets:
        for _, pts in rings:
            d = "M" + " L".join(f"{p.x:.3f},{height - p.y:.3f}" for p in pts) + " Z"
            paths.append(f'<path d="{d}"/>')
    svg = (f'<?xml version="1.0" encoding="UTF-8"?>\n'
           f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.3f}mm" height="{height:.3f}mm" '
           f'viewBox="0 0 {width:.3f} {height:.3f}">'
           f'<title>{title}</title>'
           f'<g fill="none" stroke="{stroke}" stroke-width="0.05">{"".join(paths)}</g></svg>\n')
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    return path


def rings_face(rings):
    """Planar face from [(is_hole, [points])] polylines (core.face_rings output)."""
    wires = [Part.makePolygon(pts + [pts[0]]) for _, pts in rings]
    return Part.makeFace(wires, "Part::FaceMakerBullseye")


def bridge_islands(pieces, width=1.5, overlap=0.5, min_bridges=2, reach=40.0):
    """Join separate flat pieces (pieces[0] = the frame) into ONE stencil sheet with
    straight bridges `width` wide across the shortest gaps: a minimum spanning tree, then
    extra bridges so each piece has at least `min_bridges` (so it can't swivel). Bridges
    never cross a third piece. Returns (sheet face, [(i, j, gap length)], unconnected)."""
    import itertools
    n = len(pieces)
    cands = []
    for i, j in itertools.combinations(range(n), 2):
        a, b = pieces[i], pieces[j]
        ba, bb = a.BoundBox, b.BoundBox
        if (ba.XMin - reach > bb.XMax or bb.XMin - reach > ba.XMax or
                ba.YMin - reach > bb.YMax or bb.YMin - reach > ba.YMax):
            continue
        d, pts, _ = a.distToShape(b)
        if d < 1e-6 or d > reach:
            continue
        p, q = pts[0]
        u = q - p
        u.normalize()
        side = App.Vector(-u.y, u.x, 0) * (width / 2)
        s, e = p - u * overlap, q + u * overlap
        rect = Part.Face(Part.makePolygon([s - side, e - side, e + side, s + side, s - side]))
        if any(k not in (i, j) and rect.BoundBox.intersect(pieces[k].BoundBox) and
               rect.common(pieces[k]).Area > 1e-6 for k in range(n)):
            continue
        cands.append((d, i, j, rect))
    cands.sort(key=lambda c: c[0])

    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    chosen, degree, pairs = [], [0] * n, set()
    for d, i, j, rect in cands:                      # Kruskal: connect everything
        if find(i) != find(j):
            parent[find(i)] = find(j)
            chosen.append((d, i, j, rect))
            degree[i] += 1
            degree[j] += 1
            pairs.add((i, j))
    for d, i, j, rect in cands:                      # extra bridges against swivelling
        if (i, j) in pairs:
            continue
        if (degree[i] < min_bridges and i != 0) or (degree[j] < min_bridges and j != 0):
            chosen.append((d, i, j, rect))
            degree[i] += 1
            degree[j] += 1
            pairs.add((i, j))
    unconnected = [k for k in range(n) if find(k) != find(0)]
    sheet = pieces[0].fuse(pieces[1:] + [c[3] for c in chosen]).removeSplitter()
    faces = sheet.Faces
    sheet = faces[0] if len(faces) == 1 else sheet
    return sheet, [(i, j, round(d, 2)) for d, i, j, _ in chosen], unconnected


def faces_from_wires(wires):
    """Faces with holes from nested closed outlines (letters with counters, islands in
    holes...), by nesting depth: even = material, odd = hole."""
    return Part.makeFace(wires, "Part::FaceMakerBullseye").Faces


def svg_color_solids(path, max_w, max_h, depth):
    """Filled shapes from an SVG, one solid per fill colour, all scaled together to
    fit max_w x max_h and centred on the origin, z from 0 to depth.
    Returns [(colour "#rrggbb", solid), ...] in drawing order of first appearance.
    Colours drawn later are cut out of the ones beneath, so the solids don't overlap.
    Strokes are ignored; fill="none" shapes are skipped."""
    import copy
    import xml.etree.ElementTree as ET
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(path)

    def tag(el):
        return el.tag.rsplit("}", 1)[-1]

    # effective fill of every shape, with a stable id so copies can be filtered
    order, n = [], 0

    def walk(el, inherited):
        nonlocal n
        fill = _svg_fill(el, inherited) if tag(el) in SVG_SHAPES + ("g", "svg") else inherited
        if tag(el) in SVG_SHAPES:
            el.set("data-cadlib", str(n))
            n += 1
            if fill != "none" and fill not in order:
                order.append(fill)
            el.set("data-cadlib-fill", fill)
        for child in list(el):
            walk(child, fill)
    walk(tree.getroot(), None)

    faces = []
    for colour in order:
        t = copy.deepcopy(tree)
        parents = {c: p for p in t.iter() for c in p}
        for el in list(t.iter()):
            if tag(el) in SVG_SHAPES and el.get("data-cadlib-fill") != colour:
                parents[el].remove(el)
        fs = _svg_faces(ET.tostring(t.getroot(), encoding="unicode"))
        if fs:
            faces.append((colour, fs))
    if not faces:
        raise ValueError(f"no filled shapes in {path}")

    bb = None
    for _, fs in faces:
        for f in fs:
            if bb is None:
                bb = f.BoundBox
            else:
                bb.add(f.BoundBox)
    s = min(max_w / bb.XLength, max_h / bb.YLength)
    centre = bb.Center
    solids = []
    for colour, fs in faces:
        solid = None
        for f in fs:
            f.scale(s, centre)
            f.translate(App.Vector(-centre.x, -centre.y, 0))
            e = f.extrude(App.Vector(0, 0, depth))
            solid = e if solid is None else solid.fuse(e)
        solids.append([colour, solid.removeSplitter()])
    for i in range(len(solids)):
        for j in range(i + 1, len(solids)):
            solids[i][1] = solids[i][1].cut(solids[j][1])
    return [(c, sol) for c, sol in solids if sol.Volume > 1e-6]


def place_centered(shape, x, y, z):
    """Move shape so its XY bounding-box centre is at (x, y) and its bottom at z."""
    bb = shape.BoundBox
    shape.translate(App.Vector(x - bb.Center.x, y - bb.Center.y, z - bb.ZMin))
    return shape


def hex_rgb(colour):
    """'#rrggbb' -> (r, g, b) floats; anything else -> mid grey."""
    c = colour.lstrip("#")
    if len(c) != 6:
        return (0.5, 0.5, 0.5)
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _arc_points(p0, rx, ry, phi, large, sweep, p1, step_deg=15.0):
    """SVG elliptical arc (endpoint form) -> points after p0, ending at p1."""
    import math
    (x1, y1), (x2, y2) = p0, p1
    if rx == 0 or ry == 0 or (x1, y1) == (x2, y2):
        return [p1]
    c, s = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = c * dx + s * dy, -s * dx + c * dy
    rx, ry = abs(rx), abs(ry)
    lam = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    k = math.sqrt(max(0.0, num / (rx * rx * yp * yp + ry * ry * xp * xp)))
    if large == sweep:
        k = -k
    cxp, cyp = k * rx * yp / ry, -k * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2
    ang = lambda ux, uy: math.atan2(uy, ux)
    t1 = ang((xp - cxp) / rx, (yp - cyp) / ry)
    dt = ang((-xp - cxp) / rx, (-yp - cyp) / ry) - t1
    if sweep and dt < 0:
        dt += 2 * math.pi
    elif not sweep and dt > 0:
        dt -= 2 * math.pi
    n = max(2, int(abs(math.degrees(dt)) / step_deg) + 1)
    out = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        out.append((cx + rx * math.cos(t) * c - ry * math.sin(t) * s, cy + rx * math.cos(t) * s + ry * math.sin(t) * c))
    out[-1] = p1
    return out


def _svg_subpaths(d):
    """Absolute-command SVG path (M L H V C Q A Z, as EasyEDA writes) -> [(points, closed)]."""
    import re
    toks = re.findall(r"[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", d)
    subs, pts, cmd, i, cur = [], [], None, 0, (0.0, 0.0)
    num = lambda: float(toks[i])
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]; i += 1
            if cmd in "Zz":
                if pts:
                    subs.append((pts, True)); cur = pts[0]; pts = []
                continue
        if cmd in "Mm" or cmd in "Ll":
            p = (float(toks[i]), float(toks[i + 1])); i += 2
            if cmd.islower():
                p = (cur[0] + p[0], cur[1] + p[1])
            if cmd in "Mm":
                if pts:
                    subs.append((pts, False))
                pts = [p]; cmd = "l" if cmd == "m" else "L"
            else:
                pts.append(p)
            cur = p
        elif cmd in "HV":
            v = float(toks[i]); i += 1
            cur = (v, cur[1]) if cmd == "H" else (cur[0], v); pts.append(cur)
        elif cmd in "CQ":
            n = 3 if cmd == "C" else 2
            c = [(float(toks[i + 2 * k]), float(toks[i + 2 * k + 1])) for k in range(n)]; i += 2 * n
            ctrl = [cur] + c
            for k in range(1, 9):
                t = k / 8
                q = ctrl[:]
                while len(q) > 1:
                    q = [((1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]) for a, b in zip(q, q[1:])]
                pts.append(q[0])
            cur = c[-1]
        elif cmd == "A":
            rx, ry, phi, la, sw, x, y = (float(t) for t in toks[i:i + 7]); i += 7
            pts += _arc_points(cur, rx, ry, phi, int(la), int(sw), (x, y)); cur = (x, y)
        else:
            raise ValueError(f"SVG path command {cmd} not handled")
    if pts:
        subs.append((pts, False))
    return subs


def svg_layer_mesh(path, layer="3", scale=0.254, origin=(0.0, 0.0), z=0.0, cap_min=0.1, clip=None):
    """One layer of an EasyEDA PCB SVG export (layerid "3" = top silkscreen) -> a flat Mesh at height z,
    facing +z: stroked lines as quads with round end caps (caps only where the line is >= cap_min mm wide),
    filled shapes (stroke none / width 0) as faces with holes. Board units -> mm: x = (X - origin[0]) * scale,
    y = (origin[1] - Y) * scale (SVG y points down). For EasyEDA, scale 0.254 (10 mil) and origin = the board's
    min x / max SVG y match its OBJ export with the same scale and min corner (fclib.mesh.obj_by_colour).
    clip = (x0, y0, x1, y1) mm: drop triangles whose centre is outside (notes drawn off the board)."""
    import math
    import xml.etree.ElementTree as ET
    import Mesh
    ox, oy = origin
    tf = lambda p: ((p[0] - ox) * scale, (oy - p[1]) * scale)
    tris = []

    def tri(a, b, c):
        if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0:
            b, c = c, b                                   # wind counter-clockwise: normal +z
        if clip:
            mx, my = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
            if not (clip[0] <= mx <= clip[2] and clip[1] <= my <= clip[3]):
                return
        tris.append((a, b, c))

    def disk(c, r, n):
        ring = [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
        for k in range(n):
            tri(c, ring[k], ring[(k + 1) % n])

    def stroke(pts, w, closed):
        pts = [tf(p) for p in pts]
        if closed:
            pts = pts + [pts[0]]
        h = w / 2
        for a, b in zip(pts, pts[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1e-9:
                continue
            nx, ny = -dy / L * h, dx / L * h
            q = [(a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny), (b[0] - nx, b[1] - ny), (a[0] - nx, a[1] - ny)]
            tri(q[0], q[1], q[2]); tri(q[0], q[2], q[3])
        if w >= cap_min:   # round caps; round joins too on wide lines (thin text doesn't show them)
            for p in (pts[:-1] if closed else pts) if w >= 0.25 else ([] if closed else [pts[0], pts[-1]]):
                disk(p, h, 8)

    def fill(subs):
        ws = []
        for pts, _ in subs:
            q = [tf(p) for p in pts]
            q = [p for k, p in enumerate(q) if k == 0 or math.hypot(p[0] - q[k - 1][0], p[1] - q[k - 1][1]) > 1e-6]
            if len(q) >= 3:
                ws.append(Part.makePolygon([App.Vector(x, y, 0) for x, y in q + [q[0]]]))
        if not ws:
            return
        try:
            faces = faces_from_wires(ws)
        except Exception:
            return
        for f in faces:
            v, fs = f.tessellate(0.01)
            for a, b, c in fs:
                tri((v[a].x, v[a].y), (v[b].x, v[b].y), (v[c].x, v[c].y))

    def walk(e, on):
        tag = e.tag.split("}")[-1]
        style = (e.get("style") or "").replace(" ", "")
        if e.get("display") == "none" or e.get("visibility") == "hidden" or "display:none" in style:
            return                                        # hidden (EasyEDA keeps hidden designators in the file)
        lid = e.get("layerid")
        on = (lid == layer) if lid is not None else on
        if on and tag in ("path", "polyline", "polygon", "circle"):
            sw = float(e.get("stroke-width") or 0) * scale
            filled = e.get("stroke") == "none" or sw == 0
            if tag == "path":
                subs = _svg_subpaths(e.get("d", ""))
            elif tag == "circle":
                cx, cy, r = (float(e.get(k)) for k in ("cx", "cy", "r"))
                subs = [([(cx + r * math.cos(2 * math.pi * k / 16), cy + r * math.sin(2 * math.pi * k / 16))
                          for k in range(16)], True)]
            else:
                v = [float(t) for t in e.get("points", "").replace(",", " ").split()]
                subs = [(list(zip(v[0::2], v[1::2])), tag == "polygon")]
            if filled and e.get("fill") != "none":
                fill(subs)
            elif sw > 0:
                for pts, closed in subs:
                    if len(pts) == 1:
                        disk(tf(pts[0]), sw / 2, 8)
                    else:
                        stroke(pts, sw, closed)
        for ch in e:
            walk(ch, on)

    walk(ET.parse(path).getroot(), False)
    return Mesh.Mesh([[App.Vector(x, y, z) for x, y in t] for t in tris])
