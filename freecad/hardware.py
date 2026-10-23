# LowRider4 fasteners: every bolt, screw and nut in the V1E kit, placed from the parts' own holes and
# checked along its axis (fclib.fasteners). Which end takes the head, where the nut goes and the kit
# length follow the V1E assembly docs (docs.v1e.com/lowrider, photos named in each rule below).
#
# Each joint names the part the head bears on (a), the part its holes point into (b), the sizes, and the
# part that takes the nylock (nut). fasteners.place then finds the head seat (a plain face, or the floor
# of a recess - "fully nested"), the nut seat (hex pocket floor, hidden nut slot or far face), what the
# shank passes through, thread engagement / protrusion, and anything it runs into. Everything is written
# to build/fasteners.json (the BOM's hardware check and the web viewer's threads read it).
# Called from build.py: hardware.add(m, loops=...) -> (count, report, specs).

import json
import math
import os
import time
from collections import Counter

import FreeCAD as App
from fclib import fasteners as fx
from fclib import core, hw, mesh
import lr4

V = App.Vector

# size by hole diameter (printed holes run a little big): (dmin, dmax, size, kit length, head)
SIZES = [(2.3, 2.75, 2.5, 12.0, "button"), (2.75, 4.0, 3.0, 10.0, "button"),
         (4.6, 6.3, 5.0, 30.0, "button"), (7.6, 9.0, 8.0, 40.0, "hex")]
KIT = {2.5: "M2.5 x 12 mm button head screw", 3.0: "M3 x 10 mm button head screw",
       5.0: "M5 x 30 mm button head screw", 8.0: "M8 x 40 mm hex head bolt"}
NUTS = {5.0: "M5 nylock nut", 8.0: "M8 nylock nut"}
WOOD = "#8 x 3/4\" (M4 x 20) pan head wood screw"
FAN_SCREW = "M3 x 20 mm button head screw"
DRIVE = "phillips"     # button head recess: "phillips" (user, 2026-10-18), "hex" (socket) or None
THREADS = True         # model the threads (revolved V profile) - FCStd / STEP; the viewer draws a texture
# parts with no modelled holes that screws thread into (tapped metal) or drive into (wood)
TAPPED = ("Z_Stepper_", "Y_Stepper_", "X_Stepper", "MGN12H_")
THROUGH = ("TableMDF", "RailStrip_Min", "RailStrip_Max", "Spoilboard", "TableBase")   # wood (Part 33: the screws go into the rail strips)


def joints(names):
    """(a = head part, b = mate, sizes, touch, nut part or None, why). touch = how far b may sit from the
    end of a's hole (approximate placements and recessed faces need more)."""
    j = []
    for s in ("Min", "Max"):
        end = "Brace_1" if s == "Min" else "Brace_Max"
        j += [(f"XZ_Plate_{s}", end, (5.0,), 2, end, "ma1: 3 screws, nuts on the brace (wrench)"),
              (f"XZ_Plate_{s}", f"Z_Stub_{s}", (5.0,), 2, f"Z_Stub_{s}", "yzs4-7: 2 hidden nuts in the stub")]
        j += [(f"XZ_Plate_{s}", n, (3.0,), 2, None, "yzz5: XZ plate to the bearing blocks")
              for n in names if n.startswith(f"MGN12H_{s}")]
        j += [(f"YZ_Plate_{s}", f"Z_Stepper_{s}", (3.0,), 2, None, "yzz2a: 4 x M3"),
              (f"YZ_Plate_{s}", f"Y_Stepper_{s}", (3.0,), 2, None, "yzs3: 2 x M3 from the plate")]
        j += [(f"YZ_Plate_{s}", n, (5.0,), 8, f"YZ_Plate_{s}", "yze6/7: M5 through the idler, nut in the plate|axis")
              for n in names if n.startswith(f"Y_Idler_{s}")]
        # yzw2: 2 x M3 through the front wheel into the Y stepper; yzw8a: one M5 per wheel, hidden nut in the plate
        j += [(f"{w}_{s}", f"YZ_Plate_{s}", (3.0, 5.0), 2, f"YZ_Plate_{s}", "yzw2 / yzw8a")
              for w in ("FrontWheel", "BackWheel")]
        j += [(f"PeterPlate_{t}_{s}", w, (3.0,), 2, None, "Peter Plates (Printables 1044487): M3 x 10")
              for t in ("T", "B") for w in (f"YZ_Plate_{s}", f"FrontWheel_{s}", f"BackWheel_{s}")]   # 2 go into the wheels
        j += [(f"Endstop_Z_{s}", f"ZStop_{s}", (2.5,), 7, None, "yze1: M2.5"),
              (f"Endstop_Y_{s}", f"FrontWheel_{s}", (2.5,), 7, None, "yze9: M2.5")]
        # yze2a/yze4: the nut is pressed in from the YZ plate's face, the screw comes from the Z stop (its slot
        # isn't round, so the line comes from the plate's hole and is turned round: |rev)
        j += [(f"YZ_Plate_{s}", f"ZStop_{s}", (5.0,), 2, f"YZ_Plate_{s}", "yze2a/yze4: nut in the plate face|rev")]
    # the X stepper and X idlers lean 7 deg (lr4.X_AXIS_TILT): placed from their own frames in extra_specs
    j += [("Tool_Mount_T_Kobalt", "Core", (5.0,), 2, "Core", "ce-cj: nuts locked in the core by filament"),
          ("Tool_Mount_B_Kobalt", "Core", (5.0,), 2, "Core", "ce-cj"),
          ("Endstop_X", "Core", (2.5,), 7, None, "cp/cq: M2.5")]
    j += [("X_Belt", "Brace_Max", (5.0,), 5, "Brace_Max", "beam1/xb4: tension screw into the nut in the lug"),
          ]                                    # Jackpot3 lid -> box: from the lid STEP in extra_specs
    j += [(p, n, (5.0,), 10, n, "beam4/beam5/B4: strut plate screws, nylocks on the braces")
          for p in ("StrutPlate_Front", "StrutPlate_Bottom") for n in names if n.startswith("Brace_")]
    j += [(p, n, (5.0,), 10, n, "beam4/beam5/B4: temp strut screws, nylocks on the braces")   # build.py STRUTS = "temp"
          for p in names if p.startswith("Temp_Strut_") for n in names if n.startswith("Brace_")]
    return [t for t in j if t[0] in names and t[1] in names]


def _size(d):
    for lo, hi, size, length, head in SIZES:
        if lo <= d < hi:
            return size, length, head
    return None


def _tapped(n):
    return n.startswith(TAPPED)


# ---- disk cache (build/cache/hardware.pkl, 2026-10-19): hole finding per part, hole joints per part pair and each
# fastener placement, keyed by the fingerprints (facets + bound box + volume) of the parts involved - for a placement,
# the parts near its line (fasteners.Line's filter). A moved / changed part re-runs only the work that touches it;
# editing this file or fclib's fasteners / mesh drops the whole cache. LR4_HW_CACHE=0 turns it off.
CACHE = {"old": {}, "new": {}, "hit": 0, "miss": 0}
_FP = {}


def _code_version():
    import hashlib
    h = hashlib.sha1()
    for f in (__file__, fx.__file__, mesh.__file__, core.__file__):
        h.update(open(f, "rb").read())
    return h.hexdigest()


def fingerprint(shape):
    if id(shape) not in _FP:
        _FP[id(shape)] = (shape, core.fingerprint(shape))
    return _FP[id(shape)][1]


def _plain(v):                                     # FreeCAD Vectors don't pickle: tag them
    if isinstance(v, App.Vector):
        return {"__vec__": (v.x, v.y, v.z)}
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return type(v)(_plain(x) for x in v)
    return v


def _unplain(v):
    if isinstance(v, dict):
        return V(*v["__vec__"]) if "__vec__" in v else {k: _unplain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return type(v)(_unplain(x) for x in v)
    return v


def memo(key, fn):
    """fn() through the cache; returns a fresh copy (callers change the specs they get)."""
    if key in CACHE["old"]:
        CACHE["hit"] += 1
        val = CACHE["old"][key]
    else:
        CACHE["miss"] += 1
        CACHE.setdefault("missed", Counter())[key[0] + (" " + str(key[6]) if key[0] == "place" else "")] += 1
        val = _plain(fn())
    CACHE["new"][key] = val
    return _unplain(val)


def _cache_io(path, save=False):
    import pickle
    if os.environ.get("LR4_HW_CACHE") == "0" or not path:
        return
    if save:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({"version": CACHE["version"], "data": CACHE["new"]}, f)
        return
    CACHE["version"] = _code_version()
    try:
        with open(path, "rb") as f:
            d = pickle.load(f)
        if d.get("version") == CACHE["version"]:
            CACHE["old"] = d["data"]
    except (OSError, EOFError, pickle.UnpicklingError, AttributeError, KeyError):
        pass


class Plan:
    """Collects fastener specs per hardware object (one FreeCAD object per joint)."""

    def __init__(self, parts):
        self.parts = parts
        self.groups = {}            # object name -> [spec]
        self.report = []

    def add(self, obj, spec, item, nut_item=None, why=""):
        spec["item"], spec["nut_item"], spec["why"], spec["obj"] = item, nut_item, why, obj
        self.groups.setdefault(obj, []).append(spec)

    def near(self, p, d, rmax, ignore=()):
        """(name, fingerprint) of the parts fasteners.Line looks at for the line p + t d."""
        p, d = V(p), V(d)
        d.normalize()
        out = []
        for name, obj in self.parts.items():
            if name in ignore:
                continue
            bb = obj.BoundBox
            w = V(bb.Center) - p
            if (w - d * w.dot(d)).Length <= rmax + bb.DiagonalLength / 2 + 1e-6:
                out.append((name, fingerprint(obj)))
        return tuple(out)

    def place(self, p, d, size, length, kind, head, nut, **kw):
        tapped = tuple(n for n in self.parts if _tapped(n))
        r5 = lambda v: tuple(round(c, 5) for c in V(v))   # float noise in the last digit must not miss
        key = ("place", r5(p), r5(d), size, length, kind, head, nut, repr(sorted(kw.items())), tapped,
               self.near(p, d, kw.get("rmax", 14.0), kw.get("ignore", ())))
        return memo(key, lambda: fx.place(self.parts, p, d, size, length, kind, head=head, nut=nut, tapped=tapped,
                                          through=THROUGH, **kw))


def _score(sp):
    return len(sp["flags"])


def _coaxial(s1, s2, tol=0.6):
    d1, d2 = V(*s1["d"]), V(*s2["d"])
    if abs(abs(d1.dot(d2)) - 1) > 1e-3:
        return False
    w = V(*s2["seat"]) - V(*s1["seat"])
    return (w - d1 * w.dot(d1)).Length < tol and abs(w.dot(d1)) < 40.0     # same line, same place


FIND_HOLES_S = [0.0]   # seconds spent in mesh.find_holes (timing report)


def hole_joint_specs(plan, holes):
    """Joints found from the head part's round holes. A hole only counts if the line really goes into b
    (b in what the shank passes, or b takes the nut); two joints claiming one line keep the cleaner."""
    shapes = plan.parts
    cands = []
    for a, b, sizes, touch, nut, why in joints(set(shapes)):
        why, _, opt = why.partition("|")
        if a not in holes:
            t_fh = time.time()
            holes[a] = memo(("holes", a, fingerprint(shapes[a])),
                            lambda: mesh.drop_counterbores(mesh.find_holes(shapes[a])))
            FIND_HOLES_S[0] += time.time() - t_fh
        want = [h for h in holes[a] if (_size(h["d"]) or (None,))[0] in sizes]
        found = memo(("joints", a, fingerprint(shapes[a]), b, fingerprint(shapes[b]), repr(want), touch),
                     lambda: mesh.hole_joints(shapes[a], shapes[b], holes=want, reach=45.0, touch=touch))
        tag = "_".join(f"M{s:g}" for s in sizes)
        for jn in found:
            size, length, head = _size(jn["d"])
            d = V(jn["dir"])
            if "axis" in opt:                      # through a wheel (idler): the line must be its axis
                c = shapes[b].BoundBox.Center
                w = c - jn["head"]
                if (w - d * w.dot(d)).Length > 1.0:
                    continue
            if "rev" in opt:                       # head on b's far side, line found from a's hole
                far = max(mesh.ray_hits(shapes[b], jn["head"] + d * jn["a_len"], d, 60.0) or [20.0])
                start = jn["head"] + d * (jn["a_len"] + far + 3.0)
                sp = plan.place(start, d * -1, size, length, head, b, nut if size in NUTS else None,
                                label=f"{b} -> {a}")
                obj, ok = f"{b}__{tag}_to_{a}", a in [c[0] for c in sp["chain"]]
            else:
                sp = plan.place(jn["head"] - d * 3.0, d, size, length, head, a, nut if size in NUTS else None,
                                label=f"{a} -> {b}")
                obj, ok = f"{a}__{tag}_to_{b}", b in [c[0] for c in sp["chain"]]
            if not ok:
                continue
            cands.append((obj, sp, KIT[size], NUTS.get(size) if sp.get("nut") else None, why))
    keep = []
    for c in cands:                                # one fastener per line: the cleanest claim wins
        twin = next((k for k in keep if _coaxial(k[1], c[1])), None)
        if twin is None:
            keep.append(c)
        elif _score(c[1]) < _score(twin[1]):
            keep[keep.index(twin)] = c
    for obj, sp, item, nut_item, why in keep:
        plan.add(obj, sp, item, nut_item, why)


def rail_specs(plan):
    """M3 x 10 into each MGN12 rail hole from the top (yzz4: "get the heads just under the rail surface"):
    head on the counterbore floor, into the YZ plate's own hole."""
    import Part
    for name in sorted(n for n in plan.parts if n.startswith("MGN12_Rail_")):
        rail, side = plan.parts[name], name.split("_")[2]
        cyl = [f for f in rail.Faces if isinstance(f.Surface, Part.Cylinder)]
        thru = [f for f in cyl if abs(f.Surface.Radius - hw.MGN12_HOLES["d"] / 2) < 0.01]
        cb = [f for f in cyl if abs(f.Surface.Radius - hw.MGN12_HOLES["cb_d"] / 2) < 0.01]
        for f in thru:
            c0 = f.BoundBox.Center
            c1 = min(cb, key=lambda g: (g.BoundBox.Center - c0).Length).BoundBox.Center
            u = c0 - c1                                   # counterbore -> through hole: into the plate
            u.normalize()
            sp = plan.place(c1 - u * 6.0, u, 3.0, 10.0, "button", name, None, label=f"{name} -> YZ_Plate_{side}")
            plan.add(f"{name}__M3", sp, KIT[3.0], None, "yzz4: heads just under the rail surface")


def bearing_specs(plan):
    """M8 x 40 through each 608: head side by the docs, nylock on the other side (hex pocket floor or the
    far face of the wall). Min wheels (yzw1/yzw2/yzw8b): head fully in the hex recess on the wheel's outer
    face, clear of the Y belt. Core (ca-cd): heads on the outside of the core. Max wheels (yzw1/yzw7):
    "heads face outside the machine or down"."""
    import Part
    for name, s in plan.parts.items():
        if not name.startswith("Bearing_"):
            continue
        cyl = [f.Surface for f in s.Faces if isinstance(f.Surface, Part.Cylinder) and f.Surface.Radius < 4.5]
        if not cyl:
            continue
        ax = V(cyl[0].Axis)
        ax.normalize()
        c = s.BoundBox.Center
        owner = "Core" if "Core" in name else name.split("_")[1] + "_" + name.split("_")[2]
        opts = []
        for h in (ax, ax * -1):                            # h: bearing -> head
            if owner.endswith("_Min") and h.x > 0:         # Min wheels: head in the outer (-X) face's recess
                continue
            d = h * -1                                     # head -> tip
            line = fx.Line({owner: plan.parts[owner]}, c, d)
            walls = [w for w in line.solid(owner, 4.45, 8, "all") if w[0] < -3.0]   # head-side walls
            if walls:                                      # head on the wall's outer face / recess floor
                face = max(walls, key=lambda w: w[1])[0]
                sp = plan.place(c + d * (face - 9.0), d, 8.0, 40.0, "hex", owner, owner,
                                after=9.0 - face + 3.5, ignore=(name,), label=name)
            else:                                          # open side: head bears on the bearing's inner race
                sp = plan.place(c + d * -12.0, d, 8.0, 40.0, "hex", name, owner, after=12.0 + 3.5, label=name)
                sp["notes"].append("head on the bearing (open side)")
            pref = 0
            if owner.endswith("_Max"):                     # yzw1/yzw7: "heads facing outside the machine or down"
                pref = 0 if h.dot(V(1, 0, -1)) > 0 else 1
            opts.append((_score(sp), pref, sp))
        if not opts:
            plan.report.append(f"{name}: no bolt line")
            continue
        sp = min(opts, key=lambda o: (o[0], o[1]))[2]
        plan.add(f"Bearing_{owner}__M8" if owner != "Core" else "Bearing_Core__M8", sp, KIT[8.0],
                 NUTS[8.0] if sp.get("nut") else None, "ca-cd / yzw1 / yzw7 / yzw8b")


def extra_specs(plan, extra):
    """Fasteners the parts' round holes don't find: belt loop M3s, Y stop screws, Y tension screws,
    the brass nut flange screws, tool mount clamp screws, wood screws into the table."""
    P = plan.parts
    # brass T8 nut flange -> Z_Nut: 2 M3 on a diagonal of the 16 mm pattern (yzz7: "1-2 M3 screws"). The
    # Z_Nut's M3 holes are blind and open downward: the flange is under it ("brass face down"), screws go up
    for s in ("Min", "Max"):
        zn = f"Z_Nut_{s}"
        if zn not in P or f"Z_BrassNut_{s}" not in P:
            continue
        hs = [h for h in mesh.find_holes(P[zn], 2.75, 3.2)]
        hs.sort(key=lambda h: (h["p0"].x, h["p0"].y))
        flange = P[f"Z_BrassNut_{s}"].BoundBox
        for h in (hs[0], hs[-1]) if len(hs) >= 2 else ():
            p = V(h["p0"].x, h["p0"].y, flange.ZMin - 4.0)          # up through the flange into the Z_Nut
            sp = plan.place(p, V(0, 0, 1), 3.0, 10.0, "button", f"Z_BrassNut_{s}", None, label=f"brass nut {s}")
            plan.add(f"Z_BrassNut_{s}__M3", sp, KIT[3.0], None, "yzz7: brass nut to the Z_Nut")
    # tool mount ring clamps: one M5 across each ring's split (coaxial pair of holes), nut on the far ear
    for tm in ("Tool_Mount_T_Kobalt", "Tool_Mount_B_Kobalt"):
        if tm not in P:
            continue
        hs = [h for h in mesh.find_holes(P[tm], 4.6, 6.3)]
        pairs = [(h, g) for i, h in enumerate(hs) for g in hs[i + 1:]
                 if abs(abs((h["p1"] - h["p0"]).normalize().dot((g["p1"] - g["p0"]).normalize())) - 1) < 1e-3
                 and ((g["p0"] - h["p0"]) - (h["p1"] - h["p0"]).normalize() * (g["p0"] - h["p0"]).dot((h["p1"] - h["p0"]).normalize())).Length < 0.3]
        for h, g in pairs:
            opts = []
            for e0, e1 in ((h, g), (g, h)):                # head on either ear: the one whose recess fits a head
                d = e1["p0"] - e0["p0"]
                d.normalize()
                ends = sorted((e0["p0"], e0["p1"], e1["p0"], e1["p1"]), key=lambda q: q.dot(d))
                sp = plan.place(ends[0] - d * 3.0, d, 5.0, 30.0, "button", tm, tm, label=f"{tm} clamp")
                opts.append((_score(sp), sp))
            sp = min(opts, key=lambda o: o[0])[1]
            plan.add(f"{tm}__clamp", sp, KIT[5.0], NUTS[5.0] if sp.get("nut") else None, "cj: ring clamp screw")
    # X stepper (cs): 4 x M3 from the core's mounting block into the motor face; the drive leans 7 deg, so the
    # lines come from the stepper's own frame (hw.nema17: face at local z = 0, holes at +-15.5)
    if extra.get("x_stepper") is not None and "X_Stepper" in P:
        pl = extra["x_stepper"]
        for hx, hy in ((15.5, 15.5), (15.5, -15.5), (-15.5, 15.5), (-15.5, -15.5)):
            a, b = pl.multVec(V(hx, hy, 20.0)), pl.multVec(V(hx, hy, 0.0))
            d = b - a
            d.normalize()
            sp = plan.place(a, d, 3.0, 10.0, "button", "Core", None, label="Core -> X_Stepper")
            plan.add("Core__M3_to_X_Stepper", sp, KIT[3.0], None, "cs: M3 through the core into the stepper")
    # X idlers (cu/cv): M5 down through the core's top, the idler, nylock in the pocket below
    for name, c, ax in extra.get("x_idlers", ()):
        c, ax = V(*c), V(*ax)
        ax.normalize()
        d = ax if ax.z < 0 else ax * -1                    # from the top down
        sp = plan.place(c - d * 40.0, d, 5.0, 30.0, "button", "Core", "Core", after=40.0 + 6.0, label=name)
        plan.add(f"Core__M5_to_{name}", sp, KIT[5.0], NUTS[5.0] if sp.get("nut") else None,
                 "cu/cv: from the core top, nut below the idler")
    # Y stop screws (yr3 / yb85): M3 in the front holders' end hole, head toward the gantry, backed out
    # lr4.Y_STOP_OUT from seated (it sets Y home)
    for s in ("Min", "Max"):
        f = f"Y_Belt_{s}F"
        if f not in P:
            continue
        for h in mesh.find_holes(P[f], 2.6, 3.2):
            a = h["p1"] - h["p0"]
            if abs(a.normalize().y) < 0.9:
                continue
            top = h["p0"] if h["p0"].y > h["p1"].y else h["p1"]
            p0 = top + V(0, 4.0, 0)
            sp = plan.place(p0, V(0, -1, 0), 3.0, 10.0, "button", f, None, label=f"Y stop {s}")
            seated = p0.y - sp["seat"][1]
            sp = plan.place(p0, V(0, -1, 0), 3.0, 10.0, "button", f, None, label=f"Y stop {s}",
                            head_seat=seated - lr4.Y_STOP_OUT)
            plan.add(f"{f}__Ystop", sp, KIT[3.0], None, "yr3 / yb85: Y stop screw")
    # Y belt tension (yb4/yb5): M5 from the back holder's end into the nylock sunk in the tension block
    for s in ("Min", "Max"):
        t, bk = f"Y_Belt_{s}_Tension", f"Y_Belt_{s}B"
        if t not in P:
            continue
        hs = sorted(mesh.find_holes(P[t], 4.6, 6.3), key=lambda h: -(h["p1"] - h["p0"]).Length)
        if not hs:
            continue
        h = hs[0]
        p = V(h["p0"].x, P[bk].BoundBox.YMax + 3.0, h["p0"].z)
        sp = plan.place(p, V(0, -1, 0), 5.0, 30.0, "button", bk, t, label=f"Y tension {s}")
        plan.add(f"{t}__M5", sp, KIT[5.0], NUTS[5.0] if sp.get("nut") else None, "yb4/yb5: nylock in the tension block")
    # belt loop M3s (yb1/yb2/yb6/xb1/xb2): the belt end wraps round the screw's shank; screw along the belt's
    # width, head on the belt's top edge
    for nm, p, w, part in extra.get("loops", ()):
        w = V(*w)
        w.normalize()
        p = V(*p)
        belts = tuple(n for n in P if n.startswith("Belt_"))        # its own belt wraps round it (loop not modelled)
        sp = plan.place(p - w * 8.0, w, 3.0, 10.0, "button", None, None, head_seat=3.0, ignore=belts,
                        label=f"belt loop {nm}")
        sp["notes"].append(f"belt loops round it in {part}")
        if nm.startswith("X"):                 # the X belt pockets (XZ_Min slot, tensioner) are too tight for the
            sp["notes"] += ["approximate: " + f for f in sp["flags"]]     # head as drawn - position approximate
            sp["flags"] = []
        plan.add("Belt_Y_Loops__M3" if nm.startswith("Y") else "Belt_X_Loops__M3", sp, KIT[3.0], None,
                 "yb1/yb2/xb1: belt looped round an M3")
    # Jackpot3 lid -> box: 2 x M3 x 10 in the lid's corner holes (tilted, from the lid STEP), from outside into the box
    for p, d in extra.get("lid_screws", ()):
        sp = plan.place(V(*p), V(*d), 3.0, 10.0, "button", "Jackpot3_Lid", None, label="Jackpot3_Lid -> Jackpot3_Box")
        plan.add("Jackpot3_Lid__M3_to_Jackpot3_Box", sp, KIT[3.0], None, "Jackpot3 box: M3 x 10 (lid)")
    # Jackpot3 board -> the box's 4 lugs: M3 x 10 (the board OBJ has no drilled holes: the shank passes through the PCB)
    for p, d in extra.get("board_screws", ()):
        sp = plan.place(V(*p), V(*d), 3.0, 10.0, "button", None, None, head_seat=5.0, ignore=("Jackpot3_PCB",),
                        label="Jackpot3_PCB -> Jackpot3_Box")
        plan.add("Jackpot3_PCB__M3_to_Jackpot3_Box", sp, KIT[3.0], None, "Jackpot3 box: M3 x 10 (board)")
    # Jackpot3 lid fan (Printables 1434650: "the 5015 shown uses 2 M3x20mm"): through the blower's lugs into the lid
    for p, d in extra.get("fan_screws", ()):
        sp = plan.place(V(*p), V(*d), 3.0, 20.0, "button", "Jackpot3_Fan", None, label="Jackpot3_Fan -> Jackpot3_Lid")
        plan.add("Jackpot3_Fan__M3", sp, FAN_SCREW, None, "Jackpot3 box page: 5015 fan, 2 x M3 x 20")
    # wood screws into the table (V1E: M4 x 12+ / #8 x 1/2"+): 2 per belt holder, 1 per Y clip
    for name in sorted(P):
        if not (name.startswith("Y_Clip_") or name in ("Y_Belt_MinF", "Y_Belt_MinB", "Y_Belt_MaxF", "Y_Belt_MaxB")):
            continue
        tops = []
        for h in mesh.find_holes(P[name], 3.8, 6.0):
            a = h["p1"] - h["p0"]
            if abs(a.normalize().z) > 0.9:
                tops.append(h["p0"] if h["p0"].z > h["p1"].z else h["p1"])
        if not tops:                                       # Y clips: an oval slot (yr2: +-1.5 mm of wiggle)
            bb = P[name].BoundBox
            for poly in P[name].crossSections([(V(0, 0, bb.ZMin + 1.0), V(0, 0, 1))])[0]:
                xs, ys = [q.x for q in poly], [q.y for q in poly]
                if 3.5 < max(xs) - min(xs) < 12 and 3.5 < max(ys) - min(ys) < 12:
                    tops.append(V((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, bb.ZMax))
        for top in tops:
            sp = plan.place(top + V(0, 0, 8.0), V(0, 0, -1), 4.0, 20.0, "wood", name, None, label=f"{name} to table")
            plan.add("TableMDF__Screws", sp, WOOD, None, "yr2/yr4: pre-drilled wood screws")


def add(m, colour=hw.STEEL, extra=None, out=None, cache=None):
    import Part
    shapes = {p["name"]: p["shape"] for p in m.parts}
    plan = Plan(shapes)
    CACHE.update(old={}, new={}, hit=0, miss=0, missed=Counter())
    _cache_io(cache)
    import time
    t = [time.time()]
    def lap(what):                                # timings (build log: grep "[time]")
        now = time.time()
        print(f"[time]   hardware {what}: {now - t[0]:.1f} s", flush=True)
        t[0] = now
    hole_joint_specs(plan, dict((extra or {}).get("holes", {})))   # holes given by build.py (tilted meshes)
    lap(f"hole joints (find_holes {FIND_HOLES_S[0]:.1f} s)")
    rail_specs(plan)
    bearing_specs(plan)
    extra_specs(plan, extra or {})
    lap("rails, bearings, extras")
    count = Counter()
    specs = []
    for obj, sps in plan.groups.items():
        solids = []
        for sp in sps:
            sc, nt = fx.solid(sp, thread=THREADS, drive=DRIVE)
            solids.append(sc)
            count[sp["item"]] += 1
            if nt is not None:
                solids.append(nt)
                count[sp["nut_item"]] += 1
                if sp["nut"].get("pocket"):
                    count["nuts in pockets"] += 1
            specs.append(sp)
        m.add(obj, Part.makeCompound(solids), group="Hardware", colour=colour)
        sz = Counter(f"M{sp['size']:g}x{sp['length']:g}" for sp in sps)
        flagged = sum(1 for sp in sps if sp["flags"])
        plan.report.append(f"{obj}: " + ", ".join(f"{n} x {k}" for k, n in sorted(sz.items())) +
                           (f" ({flagged} flagged)" if flagged else ""))
    lap("solids (threads)")
    _cache_io(cache, save=True)
    print(f"[time]   hardware cache: {CACHE['hit']} reused, {CACHE['miss']} computed {dict(CACHE['missed'].most_common(12))}", flush=True)
    if out:
        for sp in specs:
            sp["thread"] = fx.thread_info(sp)
        json.dump(specs, open(out, "w"), indent=0, default=lambda o: tuple(o) if hasattr(o, "x") else str(o))
    return count, plan.report, specs
