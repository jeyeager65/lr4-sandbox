# Off-the-shelf mechanical hardware as simple solids, for assemblies (CNC machines, printers):
# steppers, bearings, linear rails, pulleys, switches, tubes, rods, screws. Lengths in mm.
# Shapes are good for looks and clearance checks, not for manufacturing.
#
# Every function builds the part in its own frame (documented per function) and moves it
# with `pl` (an App.Placement, e.g. from fclib.mesh.frame or along()).
#
#   from fclib import hw
#   s = hw.nema17(hw.along((0, 0, 50), (0, 0, 1)))       # shaft up from (0, 0, 50)
#   r = hw.tube(29.5, 1.45, (0, 0, 0), (800, 0, 0))      # 1" EMT along X

import math
import FreeCAD as App
import Part

V = App.Vector

STEEL = (0.62, 0.64, 0.67)
ALUMINIUM = (0.80, 0.82, 0.85)
BLACK = (0.10, 0.10, 0.11)
BRASS = (0.78, 0.62, 0.25)
EMT_OD = {"1in EMT": 29.5, "30mm": 30.0, "32mm": 32.0}       # LowRider rail tubes


def along(origin, direction, up=None):
    """Placement putting a part's local +Z on `direction` at `origin` (local X picked from
    `up` x direction, or any perpendicular)."""
    z = V(*direction)
    z.normalize()
    up = V(*up) if up is not None else (V(0, 0, 1) if abs(z.z) < 0.9 else V(1, 0, 0))
    x = up.cross(z)
    if x.Length < 1e-9:
        x = V(1, 0, 0) if abs(z.x) < 0.9 else V(0, 1, 0)
        x = x - z * x.dot(z)
    x.normalize()
    y = z.cross(x)
    m = App.Matrix(x.x, y.x, z.x, origin[0], x.y, y.y, z.y, origin[1], x.z, y.z, z.z, origin[2], 0, 0, 0, 1)
    return App.Placement(m)


def _moved(shape, pl):
    if pl is not None:
        shape.Placement = pl.multiply(shape.Placement)
    return shape


def tube(od, wall, p0, p1):
    """Round tube from point p0 to p1."""
    a, b = V(*p0), V(*p1)
    d = b - a
    outer = Part.makeCylinder(od / 2, d.Length, a, d)
    if wall <= 0 or wall >= od / 2:
        return outer
    return outer.cut(Part.makeCylinder(od / 2 - wall, d.Length, a, d))


def rod(d, p0, p1):
    return tube(d, 0, p0, p1)

def box_at(size, centre, pl=None):
    """Box of size (x, y, z) centred on `centre` (local), then moved by pl."""
    sx, sy, sz = size
    s = Part.makeBox(sx, sy, sz, V(centre[0] - sx / 2, centre[1] - sy / 2, centre[2] - sz / 2))
    return _moved(s, pl)


ZINC = (0.72, 0.76, 0.82)          # blue-zinc plated screws
NEMA17_COLOURS = {"body": BLACK, "face": ALUMINIUM, "shaft": STEEL, "screws": ZINC, "plug": (0.78, 0.78, 0.74),
                  "label": (0.95, 0.95, 0.95), "band": (0.20, 0.38, 0.80), "lead_red": (0.80, 0.12, 0.10),
                  "lead_green": (0.10, 0.55, 0.35), "lead_blue": (0.12, 0.30, 0.80), "lead_black": (0.06, 0.06, 0.06)}


def _sq_prism(half, chamfer, z0, z1):
    """Square prism (side 2 * half) with 45 deg corner chamfers, axis z, from z0 to z1."""
    h, c = half, chamfer
    pts = [V(h - c, -h, 0), V(h, -h + c, 0), V(h, h - c, 0), V(h - c, h, 0), V(-h + c, h, 0), V(-h, h - c, 0),
           V(-h, -h + c, 0), V(-h + c, -h, 0)]
    f = Part.Face(Part.makePolygon(pts + pts[:1]))
    f.translate(V(0, 0, z0))
    return f.extrude(V(0, 0, z1 - z0))


def nema17(pl=None, length=48.0, shaft=24.0, parts=False, flat=15.0, flat_depth=0.5, leads=12.0, lead_deg=90.0,
           lams=True, label=False):
    """NEMA 17 stepper (StepperOnline 17HS19-2004S1 style, 84 oz-in / 59 Ncm, 48 mm; its datasheet: 42 max,
    31 +/-0.1 M3 pattern 4.5 deep, boss D22 x 2, shaft D5 x 24 with a 0.5 D-flat over its last 15).
    Local frame: mounting face at z = 0, shaft along +z from (0, 0), body down to z = -length.
    Black aluminium end caps (42.3 square, small corner chamfers) with a machined silver front face; a laminated
    stator between them (42.0, big chamfers, grooves when lams); 4 Phillips screws in the rear cap; the round
    label (label=True); a plastic bushing at the rear edge where the 4 leads come out (lead_deg: its direction round the axis,
    from local +x), bending back along the body for `leads` mm (0 = none). The D-flat faces local +x.
    parts=False: one solid (body + face + shaft). parts=True: {key: shape} for NEMA17_COLOURS."""
    cap, hc, cc = 9.0, 21.15, 3.8                          # end cap length, half width, corner chamfer
    fz = -0.5                                              # machined face plate, z fz..0
    front = _sq_prism(hc, cc, -cap, fz)
    rear = _sq_prism(hc, cc, -length, -length + cap)
    st0, st1 = -length + cap, -cap
    if lams:                                               # laminations: 0.2 deep grooves at 0.8 pitch
        stator = _sq_prism(20.8, 6.2, st0, st1)
        n = int((st1 - st0) / 0.8)
        pitch = (st1 - st0) / n
        stator = stator.fuse([_sq_prism(21.0, 6.0, st0 + k * pitch + 0.1, st0 + (k + 1) * pitch - 0.1)
                              for k in range(n)])
    else:
        stator = _sq_prism(21.0, 6.0, st0, st1)
    face = _sq_prism(hc, cc, fz, 0.0).cut(Part.makeCylinder(15.0, 1.0, V(0, 0, fz - 0.5)))
    boss = Part.makeCylinder(11.0, 2.0 - fz, V(0, 0, fz))
    holes = [Part.makeCylinder(1.25, 4.5, V(x, y, -4.5)) for x in (-15.5, 15.5) for y in (-15.5, 15.5)]
    face = face.cut(holes)
    front = front.cut(holes)
    # rear: 4 screw recesses (D6 x 0.6, M3 hole), the lead bushing in a notch at the rear edge
    a = math.radians(lead_deg)
    ux, uy = math.cos(a), math.sin(a)
    rot = App.Placement(V(0, 0, 0), App.Rotation(V(0, 0, 1), lead_deg - 90.0))   # notch built on +y, turned
    notch = Part.makeBox(8.0, 2.5, 4.0, V(-4.0, hc - 2.5, -length))
    notch.Placement = rot
    plug = Part.makeBox(8.0, 3.0, 4.0, V(-4.0, hc - 2.5, -length))
    plug.Placement = rot
    rec = [Part.makeCylinder(3.0, 0.6, V(x, y, -length)) for x in (-15.5, 15.5) for y in (-15.5, 15.5)]
    sh_holes = [Part.makeCylinder(1.5, 5.0, V(x, y, -length)) for x in (-15.5, 15.5) for y in (-15.5, 15.5)]
    rear = rear.cut([notch] + rec + sh_holes)
    body = front.fuse([stator, rear, boss]).removeSplitter()
    screws = []                                          # pan heads (1.2 proud, light: flat top, cut cross)
    for x in (-15.5, 15.5):
        for y in (-15.5, 15.5):
            hd = Part.makeCone(2.8, 2.3, 1.8, V(x, y, -length + 0.6), V(0, 0, -1))
            hd = hd.cut([Part.makeBox(3.2, 0.7, 1.0, V(x - 1.6, y - 0.35, -length - 1.25)),
                         Part.makeBox(0.7, 3.2, 1.0, V(x - 0.35, y - 1.6, -length - 1.25))])
            screws.append(hd.fuse(Part.makeCylinder(1.5, 4.0, V(x, y, -length + 0.6))))
    screws = screws[0].fuse(screws[1:])
    # shaft from the boss top, D-flat over the last `flat` mm
    sh = Part.makeCylinder(2.5, shaft - 2.0, V(0, 0, 2.0))
    if flat > 0:
        sh = sh.cut(Part.makeBox(3.0, 6.0, flat + 1.0, V(2.5 - flat_depth, -3.0, shaft - flat)))
    # label (label=True): D36 disc, a blue band across it
    disc = Part.makeCylinder(18.0, 0.15, V(0, 0, -length - 0.15))
    band_box = Part.makeBox(40.0, 9.0, 1.0, V(-20.0, -4.5, -length - 0.5))
    band_box.Placement = rot
    band = disc.common(band_box)
    sticker = disc.cut(band_box)
    out = dict(body=body, face=face, shaft=sh, screws=screws, plug=plug)
    if label:
        out.update(label=sticker, band=band)
    if leads > 0:
        zc, r0 = -length + 2.0, hc + 0.5                   # leads leave the bushing's outer face, bend back
        bend = 3.0
        for k, col in enumerate(("red", "green", "blue", "black")):
            t = (k - 1.5) * 1.5                            # across, side by side
            tx, ty = -uy, ux
            # out 1.5, a quarter bend (radius `bend`), back `leads`: cylinders + a torus quarter (light to mesh)
            ud = V(ux, uy, 0)
            p0 = V(ux * r0 + tx * t, uy * r0 + ty * t, zc)
            p1 = p0 + ud * 1.5
            pc = p1 + V(0, 0, -bend)                       # bend centre
            p2 = pc + ud * bend
            tor = Part.makeTorus(bend, 0.6, V(0, 0, 0), V(0, 0, 1), -180, 180, 90)   # in xy, from +x to +y
            ex, ey = V(0, 0, 1), ud                        # torus x -> up the motor (p1), y -> out (p2)
            ez = ex.cross(ey)
            tor.Placement = App.Placement(App.Matrix(ex.x, ey.x, ez.x, pc.x, ex.y, ey.y, ez.y, pc.y,
                                                     ex.z, ey.z, ez.z, pc.z, 0, 0, 0, 1))
            seg = Part.makeCylinder(0.6, 1.5, p0, ud).fuse([tor, Part.makeCylinder(0.6, leads, p2, V(0, 0, -1))])
            out["lead_" + col] = seg
    if not parts:
        return _moved(body.fuse([face, sh]), pl)
    return {k: _moved(v, pl) for k, v in out.items()}


def bearing608(pl=None):
    """608 bearing (22 x 8 x 7) centred on the origin, axis z."""
    s = Part.makeCylinder(11.0, 7.0, V(0, 0, -3.5)).cut(Part.makeCylinder(4.0, 7.0, V(0, 0, -3.5)))
    return _moved(s, pl)


def gt2_pulley(pl=None, teeth=16, width=10.0, bore=0.0):
    """GT2 pulley for 10 mm belt: local axis z, belt surface from z = 0 to width, hub below. bore > 0
    (e.g. 5) leaves the shaft hole."""
    pd = teeth * 2.0 / math.pi
    s = Part.makeCylinder(pd / 2 - 0.25, width + 2, V(0, 0, -1))
    s = s.fuse([Part.makeCylinder(pd / 2 + 1.5, 1.0, V(0, 0, -1)), Part.makeCylinder(pd / 2 + 1.5, 1.0, V(0, 0, width)),
                Part.makeCylinder(6.5, 7.0, V(0, 0, -8))])
    if bore > 0:
        s = s.cut(Part.makeCylinder(bore / 2, width + 12, V(0, 0, -9)))
    return _moved(s, pl)


def gt2_idler(pl=None, width=10.0, od=12.0, flange=18.0, bore=0.0):
    """Smooth idler with flanges (V1E 20T smooth, 5 mm bore): axis z, belt from z = 0 to width. bore > 0
    (e.g. 5) leaves the hole for its screw."""
    s = Part.makeCylinder(od / 2, width, V(0, 0, 0))
    s = s.fuse([Part.makeCylinder(flange / 2, 1.0, V(0, 0, -1)), Part.makeCylinder(flange / 2, 1.0, V(0, 0, width))])
    if bore > 0:
        s = s.cut(Part.makeCylinder(bore / 2, width + 2, V(0, 0, -1)))
    return _moved(s, pl)


def belt_strip(p0, p1, width=10.0, thick=1.4, width_dir=(0, 0, 1)):
    """A straight run of belt from p0 to p1 (centre line), `width` along width_dir."""
    a, b = V(*p0), V(*p1)
    d = b - a
    w = V(*width_dir)
    w.normalize()
    t = d.cross(w)
    t.normalize()
    corner = a - w * (width / 2) - t * (thick / 2)
    face = Part.Face(Part.makePolygon([corner, corner + d, corner + d + w * width, corner + w * width, corner]))
    return face.extrude(t * thick)


def belt_path(start, wraps, end, step_deg=5.0):
    """Centre line (2D points) of a belt in a plane: straight from `start`, round each wrap, straight
    to `end`. wraps = [((cx, cy), r, sense), ...]: r = centre-line radius on that wheel (idler running
    radius + thick/2 for the back on a smooth idler; pulley pitch radius for the teeth), sense +1 if
    the belt goes round it anticlockwise, -1 clockwise (seen from +z of the plane). Returns
    (points, tangents): tangents = the (point on the previous item, point on the next) of each line."""
    def tangent(ca, ra, sa, cb, rb, sb):
        dx, dy = cb[0] - ca[0], cb[1] - ca[1]
        dl = math.hypot(dx, dy)
        k = sb * rb - sa * ra                         # cross(t, cb - ca) = k for the common tangent
        if abs(k) > dl:
            raise ValueError(f"belt_path: no tangent between {ca} and {cb}")
        phi = math.atan2(dy, dx) - math.asin(k / dl)
        t = (math.cos(phi), math.sin(phi))
        nl = (-t[1], t[0])                            # left normal; the centre is on the left if anticlockwise
        return ((ca[0] - sa * ra * nl[0], ca[1] - sa * ra * nl[1]),
                (cb[0] - sb * rb * nl[0], cb[1] - sb * rb * nl[1]))
    items = [(tuple(start), 0.0, 1)] + [(tuple(c), r, s) for c, r, s in wraps] + [(tuple(end), 0.0, 1)]
    lines = [tangent(*items[i], *items[i + 1]) for i in range(len(items) - 1)]
    pts = [lines[0][0]]
    for i, (c, r, s) in enumerate(items[1:-1]):
        a0 = math.atan2(lines[i][1][1] - c[1], lines[i][1][0] - c[0])
        a1 = math.atan2(lines[i + 1][0][1] - c[1], lines[i + 1][0][0] - c[0])
        sweep = (a1 - a0) % (2 * math.pi) if s > 0 else -((a0 - a1) % (2 * math.pi))
        n = max(1, int(abs(math.degrees(sweep)) / step_deg))
        pts += [(c[0] + r * math.cos(a0 + sweep * j / n), c[1] + r * math.sin(a0 + sweep * j / n)) for j in range(n + 1)]
    pts.append(lines[-1][1])
    return pts, lines


GT2 = dict(pitch=2.0, tooth_h=0.75, base=1.15, tip=0.75)    # GT2 profile, simplified to a trapezoid


def belt_band(points, z, width=10.0, thick=1.4, plane=None, teeth=0, phase=0.0):
    """Belt solid along a 2D centre line (belt_path points) in the plane z = `z` (width centred on it),
    then moved by `plane` (an App.Placement, e.g. to put the path in a vertical plane).
    teeth = +1 / -1 puts GT2 teeth on the left / right of the path direction (the side that meets the
    toothed pulley; the belt never twists, so it is the same side all along): the tooth tips stay on
    that face of the `thick` band, the lands sit tooth_h further in. phase = arc length of this
    piece's start along the whole belt (keeps the teeth in step across pieces)."""
    pts = [V(x, y, 0) for x, y in points]
    pts = [p for i, p in enumerate(pts) if i == 0 or (p - pts[i - 1]).Length > 1e-6]
    nrm = []
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        d = b - a
        d.normalize()
        nrm.append(V(-d.y, d.x, 0))
    left = [p + n * (thick / 2) for p, n in zip(pts, nrm)]
    right = [p - n * (thick / 2) for p, n in zip(pts, nrm)]
    if teeth:
        g = GT2
        s_v = [0.0]
        for a, b in zip(pts, pts[1:]):
            s_v.append(s_v[-1] + (b - a).Length)
        L = s_v[-1]
        land = thick / 2 - g["tooth_h"]
        ramp = (g["base"] - g["tip"]) / 2
        marks = []                                   # (s, offset from the centre line on the tooth side)
        k0 = math.floor(phase / g["pitch"]) - 1
        k = k0
        while True:
            s0 = k * g["pitch"] - phase              # tooth k starts here (land before it)
            for ds, off in ((0.0, land), (ramp, thick / 2), (ramp + g["tip"], thick / 2), (g["base"], land)):
                marks.append((s0 + ds, off))
            if s0 > L:
                break
            k += 1

        def at(s):
            i = max(0, min(len(pts) - 2, next((j for j in range(len(s_v) - 1) if s_v[j + 1] >= s), len(pts) - 2)))
            f = (s - s_v[i]) / max(s_v[i + 1] - s_v[i], 1e-9)
            n = nrm[i] * (1 - f) + nrm[i + 1] * f
            n.normalize()
            return pts[i] + (pts[i + 1] - pts[i]) * f, n

        import bisect
        ms = [m[0] for m in marks]

        def off_at(s):                               # profile offset at arc length s
            j = bisect.bisect_left(ms, s)
            if j >= len(marks):
                return land
            if j == 0:
                return marks[0][1]
            (s0, o0), (s1, o1) = marks[j - 1], marks[j]
            return o1 if s1 - s0 < 1e-9 else o0 + (o1 - o0) * (s - s0) / (s1 - s0)

        ss = sorted(set([0.0, L] + [m[0] for m in marks if 0.0 < m[0] < L] + s_v[1:-1]))
        side = []
        for s in ss:
            p, n = at(s)
            side.append(p + n * (teeth * off_at(s)))
        if teeth > 0:
            left = side
        else:
            right = side
    face = Part.Face(Part.makePolygon(left + right[::-1] + [left[0]]))
    s = face.extrude(V(0, 0, width))
    s.translate(V(0, 0, z - width / 2))
    return _moved(s, plane)


MGN12_HOLES = dict(pitch=25.0, d=3.5, cb_d=6.0, cb_h=4.5)   # mounting holes: through 3.5, counterbore 6 x 4.5


def mgn12_rail(length, pl=None, holes=False):
    """MGN12 rail: local x along the rail from 0 to length, y across (12 wide), z up (8 tall). holes=True
    adds the M3 mounting holes (3.5 through, 6 x 4.5 counterbore from the top) every 25 mm, centred on
    the length (the end distance is what's left over / 2, e.g. 12.5 on a 150 rail)."""
    s = Part.makeBox(length, 12.0, 8.0, V(0, -6.0, 0))
    if holes:
        h = MGN12_HOLES
        n = int(length // h["pitch"])
        e = (length - (n - 1) * h["pitch"]) / 2
        for k in range(n):
            x = e + k * h["pitch"]
            s = s.cut(Part.makeCylinder(h["d"] / 2, 8.2, V(x, 0, -0.1)))
            s = s.cut(Part.makeCylinder(h["cb_d"] / 2, h["cb_h"] + 0.1, V(x, 0, 8.0 - h["cb_h"])))
    return _moved(s, pl)


def mgn12h_block(pl=None):
    """MGN12H carriage on a rail at z = 0: centred on x = 0, 45.4 long, 27 wide, top at
    z = 13 (rail bottom to block top)."""
    b = Part.makeBox(45.4, 27.0, 10.0, V(-22.7, -13.5, 3.0))
    return _moved(b.cut(Part.makeBox(46, 12.6, 6.0, V(-23, -6.3, 2.9))), pl)


SS_GL13 = dict(body=(19.8, 10.2, 6.4), hole_d=2.35, pitch=9.5, hole_in=2.9,   # Omron SS-3GL13PT (from the user's photo +
               pivot_x=7.6, tip_x=-7.6, tip_rise=1.0, lever_w=3.6, lever_t=0.5,     # Omron SS proportions; lever from
               arch=(1.5, 2.6), tab_x=(-7.4, 0.0, 7.4), tab=(3.2, 7.0, 0.5),        # the user's photo, GUESS)
               tab_hole=1.3)    # arch: the "simulated roller" - the arm's end rises into a rounded crest over the body's
                                # end (half-ellipse, half-width x height) and turns back down on the far side


def omron_ss_gl13(pl=None, hand=1, **dims):
    """Omron SS-3GL13PT micro switch (subminiature, simulated-roller hinge lever, solder tabs) - the V1E
    endstop. Same frame as microswitch(): the two mounting holes on local x at -4.75 / +4.75, body from z = 0
    (mounting face) to 6.4 (screw-head face), but - as the real part - the holes sit 2.9 from the TERMINAL edge
    (-y) and the lever runs along the far edge (+y, 7.3 from the holes). hand = +1: pivot at +x, curled tip past
    the -x end (as seen from the head face); -1 the mirror image (the switch turned over). Returns
    {"body": black plastic, "metal": lever + pivot + terminals}."""
    d = dict(SS_GL13, **dims)
    L, H, W = d["body"]
    y0, y1 = -d["hole_in"], H - d["hole_in"]
    body = Part.makeBox(L, H, W, V(-L / 2, y0, 0))
    for x in (-d["pitch"] / 2, d["pitch"] / 2):
        body = body.cut(Part.makeCylinder(d["hole_d"] / 2, W, V(x, 0, 0)))
    body = body.fuse(Part.makeBox(1.6, 0.7, 2.2, V(hand * 1.5 - 0.8, y1, W / 2 - 1.1)))      # plunger under the lever
    px, tx, zc = hand * d["pivot_x"], hand * d["tip_x"], W / 2
    yb = y1 + 0.35 + d["lever_t"] / 2                         # lever centre line at the pivot
    yt = yb + d["tip_rise"]                                   # ... at the tip (free position)
    rx, ry = d["arch"]
    path = [(px, y1 - 0.6), (px, yb), (tx, yt)]               # pivot hook into the body, the arm, then the arch
    cx = tx - hand * rx                                       # arch centre: it bulges away from the body (+y),
    for k in range(1, 16):                                    # crest over the body's end, then about halfway
        a = math.radians(10 * k)                              # back down (the user's photo)
        path.append((cx + hand * rx * math.cos(a), yt + ry * math.sin(a)))
    metal = belt_band(path, zc, width=d["lever_w"], thick=d["lever_t"])
    tw, tl, tt = d["tab"]
    for x in d["tab_x"]:
        tab = Part.makeBox(tw, tl, tt, V(x - tw / 2, y0 - tl, zc - tt / 2))
        tab = tab.cut(Part.makeCylinder(d["tab_hole"] / 2, tt, V(x, y0 - tl + 1.3, zc - tt / 2)))
        metal = metal.fuse(tab)
    return {"body": _moved(body, pl), "metal": _moved(metal, pl)}


def microswitch(pl=None):
    """Lever micro switch (20 x 6.4 x 10.2) with its two 2.3 mm mounting holes on the local
    x axis at x = -4.75 / +4.75 (9.5 apart), body thickness along z from 0 to 6.4, lever +y."""
    body = Part.makeBox(20.0, 10.2, 6.4, V(-10.0, -7.3, 0))
    for x in (-4.75, 4.75):
        body = body.cut(Part.makeCylinder(1.15, 6.4, V(x, 0, 0)))
    lever = Part.makeBox(18.0, 0.6, 4.0, V(-8.0, 2.9, 1.2))
    lever.rotate(V(-8.0, 2.9, 0), V(0, 0, 1), 12)
    return _moved(body.fuse(lever), pl)


def thread_profile(r_major, depth, pitch, z0, z1, flank=60.0):
    """Points (r, z) of a revolved thread from z0 up to z1 (crest flat P/8, root flat P/4 for a 60 deg V;
    `flank` 30 for a trapezoidal / ACME-ish leadscrew), starting and ending on the root."""
    r_minor = r_major - depth
    if flank >= 60:
        crest, root = pitch / 8, pitch / 4
    else:                                          # trapezoid: flats ~ P * 0.37 each
        crest, root = 0.37 * pitch, 0.37 * pitch
    rise = (pitch - crest - root) / 2
    pts, z = [(r_minor, z0)], z0
    while z + pitch <= z1 + 1e-9:
        pts += [(r_major, z + rise), (r_major, z + rise + crest), (r_minor, z + 2 * rise + crest),
                (r_minor, z + pitch)]
        z += pitch
    if z < z1 - 1e-6:
        pts.append((r_minor, z1))
    return pts


def threaded_rod(r_major, depth, pitch, z0, z1, flank=60.0, bore=0.0):
    """Solid of revolution about z with a thread from z0 to z1 (rings, not a helix: looks right,
    cheap to build and mesh). bore > 0 leaves a hole of that radius."""
    pts = thread_profile(r_major, depth, pitch, z0, z1, flank)
    prof = [V(bore, 0, z0)] + [V(r, 0, z) for r, z in pts] + [V(bore, 0, z1), V(bore, 0, z0)]
    if bore <= 0:
        prof = [V(0, 0, z0)] + [V(r, 0, z) for r, z in pts] + [V(0, 0, z1), V(0, 0, z0)]
    clean = [prof[0]]
    for q in prof[1:]:
        if (q - clean[-1]).Length > 1e-7:
            clean.append(q)
    return Part.Face(Part.makePolygon(clean)).revolve(V(0, 0, 0), V(0, 0, 1), 360)


def _shank(d, length, thread, pitch=None, plain=0.0):
    """Shank along +z from 0: plain to `plain`, then threaded (ISO coarse pitch) to `length`."""
    if not thread:
        return Part.makeCylinder(d / 2, length, V(0, 0, 0))
    p = pitch or {2.5: 0.45, 3.0: 0.5, 4.0: 0.7, 5.0: 0.8, 6.0: 1.0, 8.0: 1.25}.get(d, 0.15 * d)
    th = threaded_rod(d / 2, 0.54 * p, p, plain, length)
    if plain > 0:
        return Part.makeCylinder(d / 2, plain, V(0, 0, 0)).fuse(th)
    return th


def screw(d, length, pl=None, head_d=None, head_h=None):
    """Socket/button head screw: head on z <= 0, shank along +z."""
    head_d = head_d or 1.8 * d
    head_h = head_h or 0.55 * d
    s = Part.makeCylinder(d / 2, length, V(0, 0, 0)).fuse(Part.makeCylinder(head_d / 2, head_h, V(0, 0, -head_h)))
    return _moved(s, pl)


def button_screw(d, length, pl=None, drive="phillips", head_d=None, head_h=None, thread=False):
    """Button head screw (ISO 7380 proportions): domed head on z <= 0, shank along +z. drive =
    "phillips" (cross recess, PH size by d), "hex" (socket), or None. thread=True models the thread."""
    dk, k = head_d or 1.9 * d, head_h or 0.55 * d
    e = 0.18 * k                                   # straight rim under the dome
    a, h = dk / 2, k - e
    R = (a * a + h * h) / (2 * h)                  # sphere through the rim and the crown
    dome = Part.makeSphere(R, V(0, 0, -k + R)).common(Part.makeBox(dk, dk, h, V(-a, -a, -k)))
    head = Part.makeCylinder(a, e, V(0, 0, -e)).fuse(dome)
    if drive == "phillips":
        m = 0.62 * dk                              # recess diameter at the crown (PH1 on M3, PH2 on M5)
        dep, w = 0.55 * k + 0.2 * m, 0.2 * m
        cone = Part.makeCone(m / 2, 0.05, dep, V(0, 0, -k - 0.01))
        cross = Part.makeBox(m, w, dep, V(-m / 2, -w / 2, -k - 0.01)).fuse(
            Part.makeBox(w, m, dep, V(-w / 2, -m / 2, -k - 0.01)))
        head = head.cut(cross.common(cone).fuse(Part.makeCone(0.24 * m, 0.05, 0.8 * dep, V(0, 0, -k - 0.01))))
    elif drive == "hex":
        s = 0.35 * dk                              # socket across flats
        r = s / math.sqrt(3)
        hexa = Part.Face(Part.makePolygon([V(r * math.cos(math.radians(t)), r * math.sin(math.radians(t)), -k - 0.01)
                                           for t in range(0, 361, 60)])).extrude(V(0, 0, 0.6 * k))
        head = head.cut(hexa)
    return _moved(_shank(d, length, thread).fuse(head), pl)


def hex_bolt(d, length, pl=None, thread=False, thread_len=None):
    """Hex head bolt: head on z <= 0, shank along +z. thread=True models the thread over the last
    thread_len mm (default ISO 4014: 2d + 6, i.e. partly threaded - M8 x 40 has 22 mm of thread)."""
    af = 1.6 * d if d < 8 else 13.0
    r = af / math.sqrt(3)
    hexa = Part.Face(Part.makePolygon([V(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), 0)
                                       for a in range(0, 361, 60)])).extrude(V(0, 0, -0.65 * d))
    b = thread_len or min(length, 2 * d + 6)
    return _moved(_shank(d, length, thread, plain=max(0.0, length - b)).fuse(hexa), pl)


def wood_screw(d, length, pl=None, thread=False):
    """Pan head wood screw (#8 ~ M4): head on z <= 0, coarse thread, pointed tip along +z."""
    head = Part.makeCylinder(d, 0.6 * d, V(0, 0, -0.6 * d))
    w = 0.2 * d
    cross = Part.makeBox(1.2 * d, w, 0.4 * d, V(-0.6 * d, -w / 2, -0.6 * d)).fuse(
        Part.makeBox(w, 1.2 * d, 0.4 * d, V(-w / 2, -0.6 * d, -0.6 * d)))
    head = head.cut(cross)
    tip_l = 1.2 * d
    body = _shank(d, length - tip_l, thread, pitch=0.45 * d) if thread else Part.makeCylinder(d / 2, length - tip_l)
    tip = Part.makeCone(d / 2 - (0.24 * d if thread else 0.0), 0.15, tip_l, V(0, 0, length - tip_l))
    return _moved(body.fuse([head, tip]), pl)


def t8_nut(pl=None, flange_d=22.0, flange_t=3.5, body_d=10.2, length=15.0, holes_pcd=16.0):
    """T8 leadscrew nut, flanged (brass): flange from z = 0 to flange_t with 4 x 3.5 holes on holes_pcd,
    body (body_d) from z = -(length - flange_t) up to the flange; 8 mm bore."""
    f = Part.makeCylinder(flange_d / 2, flange_t, V(0, 0, 0))
    for k in range(4):
        a = math.radians(45 + 90 * k)
        f = f.cut(Part.makeCylinder(1.75, flange_t, V(holes_pcd / 2 * math.cos(a), holes_pcd / 2 * math.sin(a), 0)))
    b = Part.makeCylinder(body_d / 2, length - flange_t, V(0, 0, -(length - flange_t)))
    return _moved(f.fuse(b).cut(Part.makeCylinder(4.0, length + 2, V(0, 0, -length))), pl)


def leadscrew_t8(length, pl=None, thread=True):
    """T8 leadscrew (8 mm, 4 starts, 2 mm pitch, 8 mm lead) along z from 0 to length; thread drawn as
    trapezoid rings at the 2 mm pitch (what the eye sees), 1 mm deep."""
    if not thread:
        return _moved(Part.makeCylinder(4.0, length, V(0, 0, 0)), pl)
    return _moved(threaded_rod(4.0, 1.0, 2.0, 0.0, length, flank=30.0), pl)


COPPER = (0.80, 0.48, 0.32)
TOUCH_PLATE_COLOURS = {"plate": (0.72, 0.73, 0.74), "spade": (0.80, 0.12, 0.10), "clip": ZINC,
                       "wire_plate": (0.80, 0.12, 0.10), "wire_clip": (0.06, 0.06, 0.06)}


def alligator_clip(pl=None, grip=0.5, bite=3.0, wire=25.0):
    """Mueller BU-45 "Pee-Wee" alligator clip (zinc-plated steel - the user's; BU-45C is copper) from the V1E touch
    plate kit (Mueller datasheet DS-BU-45: 38.89 long, 11.91 high, 6.35 jaws, opens to 7.9, 6-40 screw): (clip, wire).
    Two stamped pieces crossed like scissors just behind the jaws (the pivot): piece A is the bottom jaw, two thin
    side straps rising to the arched top body, then a flat tail with the screw terminal and two crimp ears curled up
    at its end; piece B is the toothed top jaw, diving down between A's straps into a channel along the bottom. A
    coil spring stands between A's top body and B's bottom channel (pushing them apart closes the jaws).
    Local frame: it bites an edge running along x at z = 0, the jaws on the faces of something `grip` thick
    (centred on y = 0) over `bite` mm below the edge, the rest of the clip above (+z)."""
    t = 0.5                                            # sheet
    zt = -bite                                         # tips
    zj = zt + 6.35                                     # end of the jaws
    yb = -grip / 2 - 2.2 - t                           # the clip's underside (A's jaw bottom; the jaws grip with
                                                       # their side walls' toothed edges)
    ytop = yb + 11.91                                  # top of A's body

    def plate(p0, p1, wd, x0=0.0):                     # a sheet strip along the profile line p0 -> p1 ((z, y)),
        dz, dy = p1[0] - p0[0], p1[1] - p0[1]          # its face below the line, wd wide (x) centred on x0
        ln = math.hypot(dz, dy)
        b = Part.makeBox(wd, t, ln, V(x0 - wd / 2, -t, 0))
        b.rotate(V(0, 0, 0), V(1, 0, 0), -math.degrees(math.atan2(dy, dz)))
        b.translate(V(0, p0[1], p0[0]))
        return b

    def walls(p0, p1, wd, h, up):                      # the two folded sides of a channel along p0 -> p1
        out = []
        for sx in (1, -1):
            dz, dy = p1[0] - p0[0], p1[1] - p0[1]
            ln = math.hypot(dz, dy)
            b = Part.makeBox(t, h, ln, V(sx * (wd / 2) - (t if sx > 0 else 0.0), 0.0 if up else -h, 0))
            b.rotate(V(0, 0, 0), V(1, 0, 0), -math.degrees(math.atan2(dy, dz)))
            b.translate(V(0, p0[1], p0[0]))
            out.append(b)
        return out

    def teeth(z0, z1, y, wd, down, n=5):               # small triangular teeth along both jaw edges
        out = []
        for sx in (1, -1):
            x = sx * (wd / 2) - (t if sx > 0 else 0.0)
            step = (z1 - z0) / n
            for k in range(n):
                za = z0 + k * step
                tri = [V(x, y, za), V(x, y, za + step), V(x, y + (-0.9 if down else 0.9), za + step / 2)]
                out.append(Part.Face(Part.makePolygon(tri + tri[:1])).extrude(V(t, 0, 0)))
        return out
    wa, wb = 6.6, 5.0                                  # A's width (outside), B's (inside)
    # piece A: bottom jaw (a U channel, sides up), side straps up to the top body, body, down to the tail, ears
    ya = yb + t                                        # bottom jaw's base (its walls rise to -grip / 2)
    a_parts = [plate((zt, ya), (zj, ya), wa)] + walls((zt, ya), (zj, ya), wa, 2.2, True)
    zb0, zb1 = zt + 12.5, zt + 25.5                    # A's top body
    for sx in (1, -1):                                 # straps (thin, on the outside)
        a_parts.append(plate((zj, ya + 1.0), (zb0, ytop - 0.2), 1.1, sx * (wa / 2 - 0.55)))
    a_parts += [plate((zb0, ytop), (zb1, ytop), wa)] + walls((zb0, ytop - t), (zb1, ytop - t), wa, 3.0, False)
    ytail = yb + 6.0
    ztail = zt + 29.0
    a_parts.append(plate((zb1, ytop), (ztail, ytail), wa * 0.8))
    zend = zt + 38.89
    a_parts.append(plate((ztail, ytail), (zend - 3.0, ytail), wa * 0.8))
    for sx in (1, -1):                                 # crimp ears curled up at the very end
        a_parts.append(plate((zend - 3.0, ytail), (zend, ytail + 3.5), 1.6, sx * 1.6))
    # piece B: top jaw (U channel, sides down, teeth along their edges), diving down to the bottom channel
    yu = grip / 2 + 0.9 + 1.1 + t                      # top jaw's base top (walls 1.1 + teeth 0.9 down to +grip / 2)
    b_parts = [plate((zt, yu), (zj, yu), wb)] + walls((zt, yu - t), (zj, yu - t), wb, 1.1, False)
    b_parts += teeth(zt, zj, grip / 2 + 0.9, wb, True)
    zc0, zc1 = zt + 12.0, zt + 27.0                    # B's bottom channel
    b_parts.append(plate((zj, yu), (zc0, yb + t), wb))
    b_parts += [plate((zc0, yb + t), (zc1, yb + t), wb)] + walls((zc0, yb + t), (zc1, yb + t), wb, 2.2, True)
    # pivot where they cross, the spring standing between them, the screw terminal through the tail
    zp = zt + 9.0
    pin = Part.makeCylinder(0.55, wa + 0.6, V(-wa / 2 - 0.3, (ya + yu) / 2, zp), V(1, 0, 0))
    zs = zt + 19.0
    y0s, y1s = yb + t, ytop - t
    n = 5
    rings = [Part.makeTorus(2.4, 0.35, V(0, y0s + (y1s - y0s) * (k + 0.5) / n, zs), V(0, 1, 0)) for k in range(n)]
    zsc = zt + 32.5
    screw = Part.makeCylinder(2.0, 1.4, V(0, ytail, zsc), V(0, 1, 0)).fuse(
        Part.makeCylinder(1.2, 4.0, V(0, ytail - 4.0, zsc), V(0, 1, 0)))
    screw = screw.cut(Part.makeBox(4.4, 0.6, 0.6, V(-2.2, ytail + 0.9, zsc - 0.3)))     # slot
    parts = a_parts + b_parts + rings + [pin, screw]
    clip = Part.makeCompound(parts)                    # (thin touching sheets: kept as pieces, not fused)
    cw = Part.makeCylinder(0.9, wire, V(0, ytail + 1.2, zend - 1.0))
    return _moved(clip, pl), _moved(cw, pl)


def tiny_touch_plate(pl=None, pad=18.0, strip_w=8.0, length=85.0, t=0.5, tab=(6.35, 7.0), clip=True, wire=25.0,
                     clip_at=None):
    """V1 Engineering Tiny Touch Plate (0.5 mm stainless; user-measured 18 x 18 pad, 8 mm strip, 85 long): a
    paddle with a 1/4" tab at the end for the red insulated spade connector on its wire, and (clip=True) the kit's
    copper alligator clip stored biting the pad's top edge (V1E: keep the clip and the plate touching).
    Local frame: plate in the xz plane, centred on y = 0 (thickness t), pad from z = 0 up to `pad` (its bottom edge
    at z = 0), strip and tab hanging down to z = pad - length. `wire` mm stubs of the two wires.
    clip_at = None: the clip bites the pad's top edge, body up; (z, side): it bites the strip's side edge (side +1 =
    +x, -1 = -x) at height z, its body sticking out sideways.
    Returns {plate, spade, wire_plate, clip, wire_clip} (TOUCH_PLATE_COLOURS)."""
    tw, tl = tab
    zb = pad - length                                      # bottom of the tab
    box = lambda w, z0, z1: Part.makeBox(w, t, z1 - z0, V(-w / 2, -t / 2, z0))
    plate = box(pad, 0.0, pad).fuse([box(strip_w, zb + tl, 0.0), box(tw, zb, zb + tl + 0.5)]).removeSplitter()
    # insulated female disconnect: red sleeve over the tab, barrel, wire out of its end
    sleeve = Part.makeBox(9.5, 5.0, 13.0, V(-4.75, -2.5, zb + tl - 13.0))   # up to the tab's shoulder
    hole = Part.makeBox(tw + 0.4, t + 0.4, tl + 0.6, V(-(tw + 0.4) / 2, -(t + 0.4) / 2, zb - 0.1))   # the tab's slot
    zs = zb + tl - 13.0
    spade = sleeve.cut(hole).fuse(Part.makeCylinder(2.6, 10.0, V(0, 0, zs), V(0, 0, -1)))
    out = {"plate": plate, "spade": spade,
           "wire_plate": Part.makeCylinder(0.9, wire, V(0, 0, zs - 10.0), V(0, 0, -1))}
    if clip:
        cl, cw = alligator_clip(grip=t, wire=wire)          # biting the pad's top edge, body up
        for s_ in (cl, cw):
            s_.translate(V(0, 0, pad))
            if clip_at is not None:                        # on the strip's side edge instead, turned to face +-x
                zc, side = clip_at
                s_.translate(V(0, 0, -pad))
                s_.rotate(V(0, 0, 0), V(0, 1, 0), 90.0 * side)
                s_.translate(V(side * strip_w / 2, 0, zc))
        out["clip"] = cl
        out["wire_clip"] = cw
    return {k: _moved(v, pl) for k, v in out.items()}


def blower_5015(pl=None, holes=((21.0, 19.4), (-21.0, -19.4)), r=24.3, h=15.0, inlet_r=16.5, hub_r=11.0,
                blades=36, duct_w=20.0, label=True):
    """5015 radial blower (WINSINN 50 x 50 x 15, the V1E shop one): scroll housing - a round body (radius r) with
    the outlet duct running off it tangentially - two round mounting ears on a diagonal (3.3 holes, full height),
    the inlet a ring of thin blades round a big flat hub, the back closed with 7 spoke ribs and a round label.
    Local frame: inlet face at z = 0 centred on the impeller axis, body to z = h (back / label face). The ear on
    holes[0] sets the turn: seen from the back the line through the ears runs 46 deg below the outlet direction (as
    measured on the shop photo); the other ear lands on holes[1] when the pair is symmetric. Returns {"body": black housing +
    impeller, "label": the round sticker (or None), "outlet": unit (x, y) the air leaves along, "wires": short red /
    black leads (dict)}."""
    # unturned frame (local x / y as seen from the back): outlet face at +x, the duct's outer wall tangent at
    # y = +r, ears at 134 / 314 deg (the line through them 46 deg off the outlet,
    # measured on the shop photo seen from the back)
    d = math.hypot(*holes[0])
    a0 = math.degrees(math.atan2(holes[0][1], holes[0][0]))
    turn = a0 - 134.0
    body = Part.makeCylinder(r, h, V(0, 0, 0))
    body = body.fuse(Part.makeBox(r + 1.35, duct_w, h, V(0, r - duct_w, 0)))             # outlet duct
    for ang in (134.0, 314.0):
        e = V(math.cos(math.radians(ang)), math.sin(math.radians(ang)), 0)
        n = V(-e.y, e.x, 0)
        ear = Part.makeCylinder(3.6, h, e * d).fuse(
            Part.Face(Part.makePolygon([e * (r - 3) + n * 3.6, e * d + n * 3.6, e * d - n * 3.6, e * (r - 3) - n * 3.6,
                                        e * (r - 3) + n * 3.6])).extrude(V(0, 0, h)))
        body = body.fuse(ear).cut(Part.makeCylinder(1.65, h, e * d))
    # inside: impeller cavity open on the inlet ring, scroll channel out through the duct (outlet 17 x 12)
    body = body.cut(Part.makeCylinder(inlet_r, h - 1.5, V(0, 0, 0)))
    body = body.cut(Part.makeBox(r + 2.0, duct_w - 3.0, h - 3.0, V(0, r - duct_w + 1.5, 1.5)))
    body = body.cut(Part.makeCylinder(r - 1.5, h - 3.0, V(0, 0, 1.5)).cut(Part.makeCylinder(inlet_r - 0.1, h, V(0, 0, 0))))
    imp = Part.makeCylinder(hub_r, h - 2.5, V(0, 0, 0.8))                               # flat hub, a little recessed
    for k in range(blades):
        b = Part.makeBox(inlet_r + 4.0 - hub_r, 0.5, h - 4.0, V(hub_r - 0.2, -0.25, 1.2))
        b.rotate(V(hub_r, 0, 0), V(0, 0, 1), 18.0)                                       # forward-curved look
        b.rotate(V(0, 0, 0), V(0, 0, 1), 360.0 * k / blades)
        imp = imp.fuse(b)
    imp = imp.common(Part.makeCylinder(r - 2.0, h, V(0, 0, 0)))
    body = body.fuse(imp)
    for k in range(7):                                                                   # back face spoke ribs
        g = Part.makeBox(r - 2.0 - 12.5, 0.7, 0.35, V(12.5, -0.35, h - 0.35))
        g.rotate(V(0, 0, 0), V(0, 0, 1), 360.0 * k / 7 + 10.0)
        body = body.cut(g)
    lab = Part.makeCylinder(12.0, 0.15, V(0, 0, h)) if label else None
    # leads: out of the housing's side next to the lower ear, toward the outlet side
    e = V(math.cos(math.radians(314.0)), math.sin(math.radians(314.0)), 0)
    w0 = e * (r - 0.5) + V(0, 0, h / 2)
    wd = V(1, -0.2, 0)
    wd.normalize()
    wires = {"red": Part.makeCylinder(0.7, 16.0, w0 + V(0, 0, 0.8), wd),
             "black": Part.makeCylinder(0.7, 16.0, w0 - V(0, 0, 0.8), wd)}
    rot = App.Placement(V(0, 0, 0), App.Rotation(V(0, 0, 1), turn))
    mv = lambda sh: _moved(_moved(sh, rot), pl) if sh is not None else None
    out = V(1, 0, 0)
    out = rot.Rotation.multVec(out)
    return {"body": mv(body), "label": mv(lab), "outlet": (out.x, out.y),
            "wires": {k: mv(v) for k, v in wires.items()}}


def flex_coupler(pl=None, d=19.0, length=25.0):
    """5-8 mm flexible shaft coupler: axis z from 0 to length."""
    return _moved(Part.makeCylinder(d / 2, length, V(0, 0, 0)), pl)


def helical_coupler(pl=None, d=19.0, length=25.0, bores=(5.0, 8.0), hub=7.0, grooves=6, groove_w=0.7,
                    groove_depth=2.2, grub=3.0, grub_len=None):
    """Helical-beam ("flex") shaft coupler, e.g. 5 to 8 mm, D19 x L25 (V1E Z axis): axis z from 0 (bores[0]
    end) to length. The helix cut between the hubs is drawn as `grooves` ring grooves (looks the part, not a
    helix). Each hub has 2 tapped holes 90 deg apart with an M3 cup-point set screw (hex socket), its top
    0.3 below the surface, at the hub's mid-length. Returns {"body": aluminium, "grubs": black set screws,
    "grub_points": [(point, inward axis), ...] in local coords}."""
    r = d / 2
    body = Part.makeCylinder(r, length, V(0, 0, 0))
    half = length / 2
    body = body.cut(Part.makeCylinder(bores[0] / 2, half + 0.01, V(0, 0, -0.005)))
    body = body.cut(Part.makeCylinder(bores[1] / 2, half + 0.01, V(0, 0, half)))
    span = length - 2 * hub
    for k in range(grooves):
        z = hub + span * (k + 0.5) / grooves - groove_w / 2
        ring = Part.makeCylinder(r + 0.1, groove_w, V(0, 0, z)).cut(Part.makeCylinder(r - groove_depth, groove_w, V(0, 0, z)))
        body = body.cut(ring)
    grubs, pts = [], []
    for zc, bore in ((hub / 2, bores[0]), (length - hub / 2, bores[1])):
        for a in (0.0, 90.0):
            u = V(math.cos(math.radians(a)), math.sin(math.radians(a)), 0)
            hole_l = r - bore / 2 + 0.2
            body = body.cut(Part.makeCylinder(grub / 2, hole_l, V(0, 0, zc) + u * (bore / 2 - 0.1), u))
            top = u * (r - 0.3) + V(0, 0, zc)                 # set screw from the surface (less 0.3) inward,
            ln = grub_len or (r - 0.3 - bore / 2)             # long enough to bear on its shaft
            s = Part.makeCylinder(grub / 2 - 0.05, ln, top, u * -1)
            hexa = Part.Face(Part.makePolygon([top + (V(0, 0, 1) * math.cos(math.radians(t)) + u.cross(V(0, 0, 1)) * math.sin(math.radians(t))) * 0.87
                                               for t in range(0, 361, 60)])).extrude(u * -1.5)
            s = s.cut(hexa)
            grubs.append(s)
            pts.append((tuple(top), tuple(u * -1)))
    return {"body": _moved(body, pl), "grubs": _moved(Part.makeCompound(grubs), pl), "grub_points": pts}


ROUTER_RT0701 = dict(        # Makita RT0701C-style compact router; Kobalt 1.25 HP trim router is a clone
    tip_z=10.0, bit_d=6.35,              # bit tip and cutting diameter (1/4") - GUESS stick-out
    nut_d=19.0, nut_h=11.5, nut_z=36.0,  # ER11 collet nut (Kobalt ships ER11 1/4 + 1/8 collets)
    neck_d=24.0, nose_d=50.0, nose_z=50.0,       # spindle neck, lower bearing nose - GUESS
    grip_d=65.8, grip_z=(54.0, 150.0),   # clamp cylinder: 65.8 measured by owners (Maslow forum)
    cap_d=70.0, cap_z=(158.0, 200.0),    # motor cap above the grip - GUESS
    top_d=56.0, top_z=212.0,             # domed top - GUESS (RT0701C: 7-7/8" tall with its base)
    dial_d=24.0, dial_h=5.0,             # speed dial on the top
    cord_d=13.0, cord_len=50.0, cord_z=192.0, cord_up=20.0,   # strain relief, tilted up (deg)
    switch=(10.0, 22.0, 5.0), switch_z=170.0)                 # slide switch (wide, tall, proud)


def compact_router(pl=None, back_deg=0.0, **dims):
    """Compact (trim) router, axis z, bit tip at tip_z, body up to top_z. Returns a dict of solids:
    body (housing, dial, switch, cord), nut (collet nut), bit. `back_deg`: direction (deg from local
    +x) of the cord exit; the switch sits 90 deg round from it. dims override ROUTER_RT0701."""
    d = dict(ROUTER_RT0701, **dims)
    nut_top = d["nut_z"] + d["nut_h"]
    g0, g1 = d["grip_z"]
    c0, c1 = d["cap_z"]
    prof = [(0, nut_top), (d["neck_d"] / 2, nut_top), (d["neck_d"] / 2, d["nose_z"]), (d["nose_d"] / 2, d["nose_z"]),
            (d["grip_d"] / 2 - 2.0, g0 - 2.0), (d["grip_d"] / 2, g0), (d["grip_d"] / 2, g1), (d["cap_d"] / 2, c0),
            (d["cap_d"] / 2, c1), (d["top_d"] / 2, d["top_z"]), (0, d["top_z"])]
    pts = [V(r, 0, z) for r, z in prof]
    body = Part.Face(Part.makePolygon(pts + [pts[0]])).revolve(V(0, 0, 0), V(0, 0, 1), 360)
    body = body.fuse(Part.makeCylinder(d["dial_d"] / 2, d["dial_h"], V(0, 0, d["top_z"])))
    a = math.radians(back_deg)
    out = V(math.cos(a), math.sin(a), 0)
    up = math.radians(d["cord_up"])
    cdir = out * math.cos(up) + V(0, 0, math.sin(up))
    p0 = out * (d["cap_d"] / 2 - 4.0) + V(0, 0, d["cord_z"])
    body = body.fuse(Part.makeCone(d["cord_d"] / 2 + 2, d["cord_d"] / 2, d["cord_len"], p0, cdir))
    sw, sh, sp = d["switch"]
    sa = a + math.pi / 2
    sbox = Part.makeBox(sp + 2.0, sw, sh, V(d["cap_d"] / 2 - 2.0, -sw / 2, d["switch_z"]))
    sbox.rotate(V(0, 0, 0), V(0, 0, 1), math.degrees(sa))
    body = body.fuse(sbox).removeSplitter()
    nut = Part.makeCylinder(d["nut_d"] / 2, d["nut_h"], V(0, 0, d["nut_z"]))
    nut = nut.makeChamfer(1.0, [e for e in nut.Edges if abs(e.Vertexes[0].Point.z - d["nut_z"]) < 1e-6])
    bit = Part.makeCylinder(d["bit_d"] / 2, d["nut_z"] + 2.0 - d["tip_z"], V(0, 0, d["tip_z"]))
    return {k: _moved(s, pl) for k, s in (("body", body), ("nut", nut), ("bit", bit))}


TRIM_ROUTER = dict(ROUTER_RT0701,      # Makita RT0701C-style trim router (Kobalt 1.25 HP is a clone): round motor
    grip_z=(54.0, 146.0),               # housing (the clamp grip), then a rounded-rectangle head with the switch,
    head=(82.0, 64.0, 18.0, 0.0),       # cord and speed dial: (depth front-back, width, corner r, shift to the back)
                                        # - sized to fit the LowRider 4 core (wall 44-49 mm from the axis behind it)
    head_z=(146.0, 194.0), head_flare=8.0,   # head bottom/top; the bottom flares out from the grip over this height
    cap=(5.0, 9.0, 3.0),                # top cap: inset from the head sides, height, top edge chamfer
    dial=(24.0, 4.0, 18.0),             # speed dial on the top cap: diameter, height, offset toward the back
    switch=(24.0, 12.0, 4.0),           # slide switch on the head's side: length (round the head), height, proud
    cord_d=13.0, cord_relief=45.0, cord_out=110.0, cord_up=15.0, cord_z=180.0)   # strain relief + cord stub


def _rrect(depth, width, r, z0, h, dy=0.0):
    """Rounded-rectangle prism: `depth` along local +x (the router's back), `width` along y, from z0 up h."""
    b = Part.makeBox(depth, width, h, V(-depth / 2 + dy, -width / 2, z0))
    return b.makeFillet(r, [e for e in b.Edges if abs(e.Vertexes[0].Point.z - e.Vertexes[-1].Point.z) > h * 0.9])


KOBALT_K7TR03 = dict(            # Kobalt K7TR-03 7 A trim router (user-measured 2026-10-19; z from the collet nut's bottom)
    nut=(16.0, 13.0),               # ER11 nut: diameter, height (photo; button centre 25 up, 12 above the nut's top)
    spindle=(12.0, 4.0),            # threaded spindle between nut and nose: diameter, length (photo)
    nose=(30.4, 11.0),              # cast nose under the grip (fits the dust shoe's 31 mm collar): diameter, length
    grip=(65.8, 100.0),             # polished cylinder: diameter, length (28 .. 128 up)
    cast=(66.6, 22.0, 20.0),        # matte cast collar above it: diameter, straight height; switch-end blue starts 20 up
    shoulder=(96.0, 72.0, 6.0),     # cast flare under the head: length, width, bottom chamfer (photo)
    head=(105.0, 80.0, 41.0),       # blue head: length (cord end -> dial end), width, height along the sides (photo:
                                    # its bottom edge 41 under the top; 55 to the V dips round the brush caps)
    corners=(25.0, 12.0),           # plan corner radii: cord end, switch end (top photo, user: rounder)
    dome=(14.0, 28.0),              # side-profile rounding of the top: cord end, switch end (side photo)
    top_r=8.0,                      # rounding of the top edges along the long sides (switch-end photo)
    overall=210.0,                  # nut bottom -> head top
    brush=(174.0, 22.0, 30.0),      # brush caps on the long sides: height, cap d, blue boss d (its V dips to 155)
    button=(25.0, 11.8, 16.8, 30.9),  # spindle lock: height, button d, boss d, button face from the axis (2 in from the grip)
    button_deg=-51.5,               # its direction from the switch end, seen from above (between the switch end and
                                    # the left side seen facing it; -51.5 lines it up with the LR4 Kobalt dust shoe's
                                    # notch with the head square to the core)
    switch=(25.0, 16.0, 2.5),       # rocker on the switch-end panel: width, height, proud (photo)
    dial=(22.0, 6.0),               # speed wheel, lying flat in the housing at the switch end, its edge out of the end
                                    # (user): diameter, thickness (photo)
    cord=(7.4, 45.0, 13.0, 14.0),   # cord d, strain relief length, its d at the head, its axis below the head top
    cord_bend=45.0,                 # the relief curves this far round toward local +y over its length (user: to the back)
    cord_out=15.0, bit=(3.175, 16.0))   # cord stub past the relief; bit d, stick-out below the nut


def _plan_prism(L, W, r_neg, r_pos, z0, h):
    """Box L (x) by W (y) from z0 up h with its vertical edges rounded: r_neg at the -x end, r_pos at +x."""
    b = Part.makeBox(L, W, h, V(-L / 2, -W / 2, z0))
    for r, sx in ((r_neg, -1), (r_pos, 1)):
        es = [e for e in b.Edges if abs(e.Vertexes[0].Point.z - e.Vertexes[-1].Point.z) > h * 0.9
              and all(abs(v.Point.x - sx * L / 2) < 1e-6 for v in e.Vertexes)]
        if r > 0 and es:
            b = b.makeFillet(r, es)
    return b


def kobalt_k7tr03(pl=None, switch_deg=0.0, **dims):
    """Kobalt K7TR-03 trim router (KOBALT_K7TR03, user-measured + photos): axis z, collet nut's bottom at z = 0. The
    head's long axis runs from the cord end (-x) to the switch / dial end (+x), turned to face `switch_deg` (deg from
    local +x); the spindle lock button points button_deg from the switch end (negative = clockwise seen from above:
    between the switch end and the left side seen facing the switch). Same keys as trim_router: body (nose, grip, cast collar + flare - aluminium),
    head (blue), cap (brush caps + lock button - black), dial, switch, cord, nut, bit, cord_tip (2 vertices: the
    stub end and 10 mm on)."""
    d = dict(KOBALT_K7TR03, **dims)
    nd, nh = d["nut"]
    sd, sl = d["spindle"]
    od, ol = d["nose"]
    gd, gl = d["grip"]
    cd, cst, csw = d["cast"]
    L, W, H = d["head"]
    top = d["overall"]
    g0 = nh + sl + ol                                       # grip bottom (28)
    g1 = g0 + gl                                            # grip top / cast seam (128)
    hb = top - H                                            # blue's bottom along the sides (169)
    nut = Part.makeCylinder(nd / 2, nh, V(0, 0, 0))
    nut = nut.makeChamfer(1.0, [e for e in nut.Edges if abs(e.Vertexes[0].Point.z) < 1e-6])
    body = Part.makeCylinder(sd / 2, sl + 0.5, V(0, 0, nh))
    nose = Part.makeCylinder(od / 2, ol, V(0, 0, nh + sl))
    nose = nose.makeChamfer(1.0, [e for e in nose.Edges if abs(e.Vertexes[0].Point.z - nh - sl) < 1e-6])
    bz, bd, bbd, br = d["button"]
    ba = math.radians(d["button_deg"])
    bu = V(math.cos(ba), math.sin(ba), 0)
    boss = Part.makeCylinder(bbd / 2, br - 1.4 - 8.0, V(0, 0, bz) + bu * 8.0, bu)
    # cast: straight collar, then a flare (chamfered at the bottom) out to under the head
    sL, sW, sch = d["shoulder"]
    c1 = g1 + cst
    sh = _plan_prism(sL, sW, 14.0, 12.0, c1, hb - c1 + 0.5)
    sh = sh.makeChamfer(sch, [e for e in sh.Edges if all(abs(v.Point.z - c1) < 1e-6 for v in e.Vertexes)])
    body = body.fuse([nose, boss, Part.makeCylinder(gd / 2, gl, V(0, 0, g0)),
                      Part.makeCylinder(cd / 2, cst + 1.0, V(0, 0, g1)), sh]).removeSplitter()
    # head: plan with rounded corners, top domed down at both ends (side profile), top edges rounded
    rn, rp = d["corners"]
    head = _plan_prism(L, W, rn, rp, hb, H)
    try:
        head = head.makeFillet(d["top_r"], [e for e in head.Edges if all(abs(v.Point.z - top) < 1e-6 for v in e.Vertexes)])
    except Exception:
        pass
    dn, dp = d["dome"]
    prof = Part.makeBox(L, W + 20.0, H, V(-L / 2, -W / 2 - 10.0, hb))
    for r, sx in ((dn, -1), (dp, 1)):
        es = [e for e in prof.Edges if all(abs(v.Point.z - top) < 1e-6 and abs(v.Point.x - sx * L / 2) < 1e-6
                                           for v in e.Vertexes)]
        prof = prof.makeFillet(r, es)
    head = head.common(prof)
    # cord end: a bump the cord leaves from; switch end: the panel down to the cast, the dial housing + its boss
    cdia, crl, crd, cdz = d["cord"]
    bump = Part.makeBox(5.0, 34.0, 26.0, V(-L / 2 - 4.5, -17.0, top - cdz - 13.0))
    pz0 = g1 + csw
    panel = Part.makeBox(10.0, 48.0, top - 20.0 - pz0, V(L / 2 - 8.0, -24.0, pz0))
    house = Part.makeBox(30.0, 40.0, 20.0, V(L / 2 - 20.0, -20.0, top - 22.0))
    house = house.makeFillet(14.0, [e for e in house.Edges if all(v.Point.z > top - 2.1 and v.Point.x > L / 2 + 9.9
                                                                  for v in e.Vertexes)])   # rolls over the end
    try:
        house = house.makeFillet(4.0, [e for e in house.Edges if all(v.Point.z > top - 2.1 for v in e.Vertexes)
                                       and all(abs(v.Point.y) > 19.9 for v in e.Vertexes)])
    except Exception:
        pass
    # brush caps: blue bosses on both long sides (their V dips down past the head's bottom)
    bcz, bcd, bbz = d["brush"]
    bosses = [Part.makeCylinder(bbz / 2, 10.0, V(0, s * (W / 2 - 8.0), bcz), V(0, s, 0)) for s in (1, -1)]
    head = head.fuse([bump, panel, house] + bosses).cut(body)
    sw_w, sw_h, sw_p = d["switch"]
    zs = (pz0 + top - 20.0) / 2 + 2.0
    switch = Part.makeBox(sw_p, sw_w, sw_h, V(L / 2 + 2.0, -sw_w / 2, zs - sw_h / 2))
    dd, dt = d["dial"]
    dz = top - 12.0                                         # wheel mid-height, in the housing
    dial = Part.makeCylinder(dd / 2, dt, V(L / 2 - 1.0, 0, dz - dt / 2))
    head = head.cut(Part.makeCylinder(dd / 2 + 0.5, dt + 1.0, V(L / 2 - 1.0, 0, dz - dt / 2 - 0.5)))
    caps = [Part.makeCylinder(bcd / 2, 1.5, V(0, s * (W / 2 + 2.0), bcz), V(0, s, 0)) for s in (1, -1)]
    cap = caps[0].fuse([caps[1], Part.makeCylinder(bd / 2, 1.4, V(0, 0, bz) + bu * (br - 1.4), bu)])
    body = body.cut(cap)                                    # (the button's top reaches up under the grip's edge)
    # cord out of the bump at the cord end (-x): the relief tapers along an arc curving cord_bend toward +y, the cord
    # stub straight on from its end
    p0 = V(-L / 2 - 4.5, 0, top - cdz)
    bend = math.radians(d["cord_bend"])
    if bend > 1e-6:
        rb = crl / bend                                     # arc radius, centre on the +y side
        sec = []
        for i in range(7):
            ph = bend * i / 6
            c_ = p0 + V(-rb * math.sin(ph), rb * (1 - math.cos(ph)), 0)
            tn = V(-math.cos(ph), math.sin(ph), 0)
            rr_ = crd / 2 + (cdia / 2 + 0.6 - crd / 2) * i / 6
            sec.append(Part.Wire(Part.makeCircle(rr_, c_, tn)))
        cord = Part.makeLoft(sec, True)
        p1, cdir = c_, tn
    else:
        cdir = V(-1, 0, 0)
        cord = Part.makeCone(crd / 2, cdia / 2 + 0.6, crl, p0, cdir)
        p1 = p0 + cdir * crl
    if d["cord_out"] > 0:
        cord = cord.fuse(Part.makeCylinder(cdia / 2, d["cord_out"] + 0.5, p1 - cdir * 0.5, cdir))
    p2 = p1 + cdir * d["cord_out"]
    bdia, bout = d["bit"]
    bit = Part.makeCylinder(bdia / 2, bout, V(0, 0, -bout))
    out = {"body": body, "head": head, "cap": cap, "dial": dial, "switch": switch, "cord": cord, "nut": nut,
           "bit": bit, "cord_tip": Part.Compound([Part.Vertex(p2), Part.Vertex(p2 + cdir * 10.0)])}
    for v in out.values():
        v.rotate(V(0, 0, 0), V(0, 0, 1), switch_deg)
    return {k: _moved(v, pl) for k, v in out.items()}



def trim_router(pl=None, back_deg=0.0, side_deg=None, **dims):
    """Makita RT0701C-style trim router in separate parts (for colours): axis z, bit tip at tip_z. `back_deg`:
    direction (deg from local +x) the head's back - and the cord - face; the switch is on the side at
    `side_deg` (default back_deg - 90). Returns body (nose + round grip), head, cap, dial, switch, cord, nut, bit, cord_tip (2 vertices: the stub end and 10 mm on).
    dims override TRIM_ROUTER (lengths are GUESSES until measured)."""
    d = dict(TRIM_ROUTER, **dims)
    nut_top = d["nut_z"] + d["nut_h"]
    g0, g1 = d["grip_z"]
    h0, h1 = d["head_z"]
    prof = [(0, nut_top), (d["neck_d"] / 2, nut_top), (d["neck_d"] / 2, d["nose_z"]), (d["nose_d"] / 2, d["nose_z"]),
            (d["grip_d"] / 2 - 2.0, g0 - 2.0), (d["grip_d"] / 2, g0), (d["grip_d"] / 2, g1 + 1.0), (0, g1 + 1.0)]
    pts = [V(r, 0, z) for r, z in prof]
    body = Part.Face(Part.makePolygon(pts + [pts[0]])).revolve(V(0, 0, 0), V(0, 0, 1), 360)
    depth, width, rc, dyb = d["head"]
    fl = d["head_flare"]
    # head: a loft from the grip circle up to the rounded rectangle, then straight up
    sect = _rrect(depth, width, rc, h0 + fl, h1 - h0 - fl, dyb)
    top_w = sect.slice(V(0, 0, 1), h0 + fl + 0.01)[0]
    top_w.translate(V(0, 0, -0.01))
    circ = Part.Wire(Part.makeCircle(d["grip_d"] / 2 - 0.5, V(0, 0, h0), V(0, 0, 1)))
    flare = Part.makeLoft([circ, top_w], True, False)
    head = sect.fuse(flare).removeSplitter()
    ci, ch, cc = d["cap"]
    cap = _rrect(depth - 2 * ci, width - 2 * ci, max(rc - ci, 1.0), h1, ch, dyb)
    cap = cap.makeChamfer(cc, [e for e in cap.Edges if abs(e.Vertexes[0].Point.z - (h1 + ch)) < 1e-6
                               and abs(e.Vertexes[-1].Point.z - (h1 + ch)) < 1e-6])
    dd, dh, doff = d["dial"]
    dial = Part.makeCylinder(dd / 2, dh, V(doff + dyb, 0, h1 + ch - 0.5))
    sl, sh, sp = d["switch"]
    sw = Part.makeBox(sp + 2.0, sl, sh, V(width / 2 - 2.0, -sl / 2, (h0 + fl + h1) / 2 - sh / 2))
    sw = sw.makeFillet(1.5, [e for e in sw.Edges if e.Vertexes[0].Point.x > width / 2 - 1.0 and e.Vertexes[-1].Point.x > width / 2 - 1.0])
    up = math.radians(d["cord_up"])
    cdir = V(math.cos(up), 0, math.sin(up))
    p0 = V(depth / 2 + dyb - 4.0, 0, d["cord_z"])
    cord = Part.makeCone(d["cord_d"] / 2 + 2.0, d["cord_d"] / 2 - 2.0, d["cord_relief"], p0, cdir)
    p1 = p0 + cdir * (d["cord_relief"] - 1.0)
    sdir = V(1.0, 0, -0.35)
    sdir.normalize()
    if d["cord_out"] > 0:
        cord = cord.fuse(Part.makeCylinder(3.8, d["cord_out"], p1, sdir))
    p2 = p1 + sdir * d["cord_out"]
    rot = lambda s, deg: (s.rotate(V(0, 0, 0), V(0, 0, 1), deg), s)[1]
    sdeg = back_deg - 90.0 if side_deg is None else side_deg
    out = {"body": body, "head": rot(head, back_deg), "cap": rot(cap, back_deg), "dial": rot(dial, back_deg),
           "switch": rot(sw, sdeg), "cord": rot(cord, back_deg),     # switch built facing +x, turned to its side
           # the stub's end and a point 10 mm further on (to route the rest of the cord from): two vertices
           "cord_tip": rot(Part.Compound([Part.Vertex(p2), Part.Vertex(p2 + sdir * 10.0)]), back_deg)}
    nut = Part.makeCylinder(d["nut_d"] / 2, d["nut_h"], V(0, 0, d["nut_z"]))
    out["nut"] = nut.makeChamfer(1.0, [e for e in nut.Edges if abs(e.Vertexes[0].Point.z - d["nut_z"]) < 1e-6])
    out["bit"] = Part.makeCylinder(d["bit_d"] / 2, d["nut_z"] + 2.0 - d["tip_z"], V(0, 0, d["tip_z"]))
    return {k: _moved(s, pl) for k, s in out.items()}


NUT_AF = {2.5: 5.0, 3.0: 5.5, 5.0: 8.0, 8.0: 13.0}     # hex nut across flats (ISO)
LOCKNUT_H = {2.5: 3.0, 3.0: 4.0, 5.0: 5.0, 8.0: 8.0}  # nylock nut height


def nut(d, pl=None, height=None):
    """Hex (nylock) nut: axis z from 0 to height, centred on the axis."""
    af = NUT_AF.get(d, 1.6 * d)
    h = height or LOCKNUT_H.get(d, 0.8 * d)
    r = af / math.sqrt(3)
    hexa = Part.Face(Part.makePolygon([V(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), 0)
                                       for a in range(0, 361, 60)])).extrude(V(0, 0, h))
    return _moved(hexa.cut(Part.makeCylinder(d / 2, h, V(0, 0, 0))), pl)
