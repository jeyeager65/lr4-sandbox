# LowRider4 - export the built assembly for the browser viewer (exports/web/), headless:
#   python tools/run.py freecad/export_web.py
# Writes, for the viewer (LowRider4_local.html, served by tools/serve.py viewer), geo/<part>.bin (per part float32
# positions [+ uv] + uint16/uint32 triangle indices) + lr4_local.json (names, groups, colours, motion, travel limits).
# STL meshes go in at full resolution, solids tessellated.

import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # the repo (this script is in freecad/)
NAME = "LowRider4"
LIB = HERE                                        # fclib is vendored in freecad/fclib (tools/sync_fclib.py)
for p in (LIB, HERE):
    if p not in sys.path:
        sys.path.insert(0, p)
import FreeCAD as App                             # noqa: E402

DECIMATE_ABOVE = None      # decimate meshes with more facets than this (None = full detail)
TESSELLATE = 0.05          # mm deviation for solids
STEPPER_BITS = ("_Face", "_Shaft", "_Screws", "_Lead_Red", "_Lead_Green", "_Lead_Blue", "_Lead_Black")
TESSELLATE_FASTENERS = 0.12   # bolts/screws/nuts (names with '__'): Phillips heads are many small faces

# what moves with what: lr4.motion (shared with hosecheck.py)


def pretty(name):
    s = name.replace("_", " ").replace("29p5", "29.5").replace(" V1", "")
    return s.replace("YZ ", "YZ ").replace("Kobalt", "(Kobalt)").strip()


B = {"__file__": os.path.join(HERE, "build.py"), "__name__": "lr4_params"}
src = open(B["__file__"], encoding="utf-8").read()
block = src.split("# ---- parameters", 1)[1].split("# ----------", 1)[0]
exec("IN = 25.4\n" + "\n".join(block.splitlines()[1:]), B)
import lr4                                        # noqa: E402
from fclib import hw                              # noqa: E402 - stock colours, to tag metal finishes
IN = 25.4

doc = App.openDocument(os.path.join(ROOT, "build", f"{NAME}.FCStd"))
group_of = {}
for g in doc.Objects:
    if g.TypeId == "App::DocumentObjectGroup":
        for o in g.Group:
            group_of[o.Name] = g.Label

# threads: the FCStd models them (rings); the page draws them as a texture on a plain cylinder instead (far fewer
# triangles). Fasteners and leadscrews are rebuilt here without threads; each threaded stretch gets a thin cylinder
# with helical UVs (u = along / pitch, v = starts x turns) in a "<obj>~thread" part.
import math                                       # noqa: E402
from fclib import fasteners as fx                 # noqa: E402
BUILD = os.path.join(ROOT, "build")
load = lambda f: json.load(open(os.path.join(BUILD, f))) if os.path.exists(os.path.join(BUILD, f)) else []
threads, fspecs, belt_runs = load("threads.json"), load("fasteners.json"), load("belts.json")
th_by = {}
for t in threads:
    th_by.setdefault(t["obj"], []).append(t)
sp_by = {}
for sp in fspecs:
    sp_by.setdefault(sp["obj"], []).append(sp)
run_by = {r["obj"]: r for r in belt_runs}


def plain_shape(o):
    """The object without modelled threads (or its own shape)."""
    import Part
    if o.Name in sp_by:
        sol = []
        for sp in sp_by[o.Name]:
            sc, nt = fx.solid(sp, thread=False)
            sol += [sc] + ([nt] if nt is not None else [])
        return Part.makeCompound(sol)
    if o.Name.startswith("Z_Leadscrew") and o.Name in th_by:
        t = th_by[o.Name][0]
        return hw.leadscrew_t8(t["t1"], hw.along(tuple(t["p"]), tuple(t["d"])), thread=False)
    return o.Shape


def thread_mesh(ts):
    """Cylinders over the threaded stretches: (points, triangles, uvs)."""
    pts, tris, uvs = [], [], []
    for t in ts:
        d = App.Vector(*t["d"])
        d.normalize()
        u = d.cross(App.Vector(0, 0, 1)) if abs(d.z) < 0.9 else d.cross(App.Vector(1, 0, 0))
        u.normalize()
        v = d.cross(u)
        p0 = App.Vector(*t["p"])
        r = t["r_major"] + 0.02
        n = 16 if r < 2 else 20 if r < 3.5 else 28
        nz = max(1, int((t["t1"] - t["t0"]) / 4.0))
        base = len(pts)
        for j in range(nz + 1):
            z = t["t0"] + (t["t1"] - t["t0"]) * j / nz
            for k in range(n + 1):
                a = 2 * math.pi * k / n
                pts.append(p0 + d * z + (u * math.cos(a) + v * math.sin(a)) * r)
                uvs.append((z / t["pitch"], t["starts"] * k / n))
        for j in range(nz):
            for k in range(n):
                i0 = base + j * (n + 1) + k
                i1, i2, i3 = i0 + 1, i0 + n + 1, i0 + n + 2
                tris += [(i0, i2, i1), (i1, i2, i3)]
    return pts, tris, uvs


def run_shape(r):
    """A straight belt run at its full reach: from its fixed end out past the parked moving end by the travel
    (the page clips it at the moving end), teeth in step with the fixed end."""
    fx_, mv = App.Vector(*r["fixed"], 0), App.Vector(*r["moving"], 0)
    dd = mv - fx_
    dd.normalize()
    far = mv + dd * r["ext"]
    plane = App.Placement(App.Matrix(*r["plane"])) if r["plane"] else None
    if r["obj"].endswith(("_Front", "_Min")):           # path runs fixed -> moving
        seg, ph = [(fx_.x, fx_.y), (far.x, far.y)], r["phase_fixed"]
    else:                                               # path runs moving -> fixed
        seg, ph = [(far.x, far.y), (fx_.x, fx_.y)], r["phase_fixed"] - (far - fx_).Length
    sh = hw.belt_band(seg, r["z"], plane=plane, teeth=r["teeth"], phase=ph)
    w = lambda q: plane.multVec(App.Vector(q.x, q.y, 0)) if plane else App.Vector(q.x, q.y, r["z"])
    nrm = w(fx_) - w(mv)
    nrm.normalize()
    return sh, dict(n=[nrm.x, nrm.y, nrm.z], p=list(w(mv)), axis=r["axis"])


out_dir = os.path.join(ROOT, "exports", "web")
os.makedirs(out_dir, exist_ok=True)
blob = bytearray()
parts = []
tris_total = 0
import time                                       # noqa: E402 - timings: the slowest parts are printed
t_loop, slow = time.time(), []
for o in doc.Objects:
    t_obj = time.time()
    if o.Name in ("Vac_Hose", "Router_Cord_Run", "Cable_Sleeve"):   # the page sweeps the hose + cord itself (they bend as the core moves)
        continue
    if o.TypeId == "Mesh::Feature":
        clip = None
        m = o.Mesh.copy()                         # already placed
        if DECIMATE_ABOVE and m.CountFacets > DECIMATE_ABOVE:
            m.decimate(0.2, 0.85)
        pts, facets = m.Topology
        source = "printed"
    elif o.TypeId == "Part::Feature":
        clip = None
        if o.Name in run_by:                      # straight belt run: full reach, clipped live by the page
            shape, clip = run_shape(run_by[o.Name])
            pts, facets = shape.tessellate(TESSELLATE)
        elif "__" in o.Name or o.Name in th_by or "_Stepper_" in o.Name and o.Name.endswith(STEPPER_BITS) \
                or o.Name.startswith("TouchPlate"):
            # fasteners: coarse angles too (Phillips heads); threads drawn; stepper leads / screws / face
            import MeshPart
            fm = MeshPart.meshFromShape(Shape=plain_shape(o), LinearDeflection=TESSELLATE_FASTENERS, AngularDeflection=0.35)
            pts, facets = fm.Topology
        else:
            pts, facets = o.Shape.tessellate(TESSELLATE)
        source = "made" if o.Name.startswith(("StrutPlate", "TableMDF", "XZ_Plate")) else "hardware"
    else:
        continue
    if not facets:
        continue
    col = tuple(o.PreviewColor)[:3] if "PreviewColor" in o.PropertiesList else (0.6, 0.6, 0.6)
    off = len(blob)
    for p in pts:
        blob += struct.pack("<3f", p.x, p.y, p.z)
    wide = len(pts) > 65535
    fmt = "<3I" if wide else "<3H"
    ioff = len(blob)
    for f in facets:
        blob += struct.pack(fmt, *f)
    if len(blob) % 4:
        blob += b"\0" * (4 - len(blob) % 4)
    tris_total += len(facets)
    parts.append(dict(name=o.Name, label=pretty(o.Label), group=group_of.get(o.Name, ""), motion=lr4.motion(o.Name),
                      source=source, color=[round(c, 3) for c in col], pos=[off, len(pts)],
                      idx=[ioff, len(facets) * 3, 32 if wide else 16]))
    # surface finish for the page's materials (metals reflect an environment map), from the part's colour
    near = lambda ref: source != "printed" and max(abs(a - b) for a, b in zip(col, ref)) < 0.02
    if o.Name.startswith(("X_Rail", "Y_Rail")):    # 1" EMT conduit: galvanized steel
        parts[-1]["finish"] = "galvanized"
    elif o.Name.startswith("Z_Leadscrew"):         # T8 leadscrew: plain rod under its "~thread" texture part
        parts[-1]["finish"] = "steel"
    elif o.Name.startswith(("MGN12_Rail", "MGN12H")):   # linear rails + carriages: ground bearing steel
        parts[-1]["finish"] = "rail_steel"
    elif near(hw.ALUMINIUM):
        parts[-1]["finish"] = "aluminium_plate" if o.Name.startswith("XZ_Plate") else "aluminium"
    elif near(hw.STEEL):
        parts[-1]["finish"] = "steel"
    elif near(hw.BRASS):
        parts[-1]["finish"] = "brass"
    if clip:                                      # belt run: Y runs stay on the table, X runs ride the beam; the
        parts[-1]["clip"] = clip                  # page cuts each at its moving end (plane n . x = n . (p + motion))
        parts[-1]["motion"] = "table" if clip["axis"] == "y" else "beam"
    if o.Name in th_by:                           # its threads, as a textured cylinder part of its own
        tp, tt, tuv = thread_mesh(th_by[o.Name])
        off = len(blob)
        for q in tp:
            blob += struct.pack("<3f", q.x, q.y, q.z)
        uoff = len(blob)
        for a_, b_ in tuv:
            blob += struct.pack("<2f", a_, b_)
        wide = len(tp) > 65535
        ioff = len(blob)
        for f in tt:
            blob += struct.pack("<3I" if wide else "<3H", *f)
        if len(blob) % 4:
            blob += b"\0" * (4 - len(blob) % 4)
        tris_total += len(tt)
        parts.append(dict(parts[-1], name=o.Name + "~thread", pos=[off, len(tp)], uv=uoff,
                          idx=[ioff, len(tt) * 3, 32 if wide else 16], finish="thread", of=o.Name))

    slow.append((time.time() - t_obj, o.Name))
print(f"[time] parts: {time.time() - t_loop:.1f} s; slowest: " + ", ".join(f"{n} {t:.1f}" for t, n in sorted(slow)[::-1][:8]))
t_out = time.time()

# Peter Plates: the model has PETER_STYLE; the other style comes from build/peter_alt (world-placed STLs). The page
# shows one style at a time (its "Peter Plates" switch); both are tagged with their variant.
import Mesh                                       # noqa: E402
style = B.get("PETER_STYLE", "solid")
alt_dir = os.path.join(BUILD, "peter_alt")
for pt in list(parts):
    if pt["name"].startswith("PeterPlate_") and "__" in pt["name"]:   # their M3s (+ threads): shown with either
        pt["peter_hw"] = True                                         # style, hidden by the page's "None"
        continue
    if pt["name"].startswith("PeterPlate_") and "~" not in pt["name"]:
        pt["variant"] = style
        for fn in (os.listdir(alt_dir) if os.path.isdir(alt_dir) else []):
            if fn.startswith(pt["name"] + "~") and fn.endswith(".stl"):
                other = fn[len(pt["name"]) + 1:-4]
                am = Mesh.Mesh(os.path.join(alt_dir, fn))
                apts, afac = am.Topology
                off = len(blob)
                for q in apts:
                    blob += struct.pack("<3f", q.x, q.y, q.z)
                wide = len(apts) > 65535
                ioff = len(blob)
                for f in afac:
                    blob += struct.pack("<3I" if wide else "<3H", *f)
                if len(blob) % 4:
                    blob += b"\0" * (4 - len(blob) % 4)
                tris_total += len(afac)
                parts.append(dict(pt, name=pt["name"] + "~" + other, pos=[off, len(apts)],
                                  idx=[ioff, len(afac) * 3, 32 if wide else 16], variant=other, of=pt["name"]))

CUT_X, CUT_Y = B["CUT_X_IN"] * IN, B["CUT_Y_IN"] * IN
b_lo, b_hi = lr4.B_RANGE
b_now = b_hi - B["Z_POS"] * (b_hi - b_lo)
T = B["MDF_T"]
tip_now = T + lr4.WHEEL_BOTTOM_PY - b_now + lr4.KOBALT_Z_IN_D + lr4.ROUTER["tip_z"]
meta = dict(
    name=NAME, parts=parts, triangles=tris_total,
    cut_in=[B["CUT_X_IN"], B["CUT_Y_IN"]],
    table_in=None,
    travel=load("travel.json"),                 # build.py: home trip -> first contact, from the parked pose (lr4.STOPS)
    tip_above_table=tip_now - T,
    calc=lr4.calculator(CUT_X, CUT_Y, B["XZ_PLATE"]),
)
bb = doc.getObject("TableMDF").Shape.BoundBox
meta["table_mm"] = [bb.XLength, bb.YLength, bb.ZLength]
meta["peter_style"] = style
meta["bom"] = load("bom.json")                  # build/bom.json (bom.py): the page's bill of materials
hose_json = os.path.join(ROOT, "build", "hose.json")   # route anchors from build.py (lr4.hose_route, mirrored
if os.path.exists(hose_json):                          # by hoseRoute in the page)
    meta["hose"] = json.load(open(hose_json))
import shutil                                     # noqa: E402


def span(pt):
    """A part's bytes in blob: positions [, uv], indices, padded to 4 (always contiguous, in that order)."""
    end = pt["idx"][0] + pt["idx"][1] * (4 if pt["idx"][2] == 32 else 2)
    return pt["pos"][0], (end + 3) // 4 * 4


def rebased(pt, shift, **kw):
    q = dict(pt, pos=[pt["pos"][0] - shift, pt["pos"][1]], idx=[pt["idx"][0] - shift] + pt["idx"][1:], **kw)
    if "uv" in pt:
        q["uv"] = pt["uv"] - shift
    return q


ntris = lambda ps: sum(pt["idx"][1] // 3 for pt in ps)
# every part in its own geo/<name>.bin, offsets relative to its file
geo_dir = os.path.join(out_dir, "geo")
shutil.rmtree(geo_dir, ignore_errors=True)
os.makedirs(geo_dir)
loc_parts = []
for pt in parts:
    a, b = span(pt)
    fn = "geo/" + pt["name"].replace("~", "--") + ".bin"
    open(os.path.join(out_dir, fn), "wb").write(blob[a:b])
    loc_parts.append(rebased(pt, a, file=fn, bytes=b - a))
json.dump(dict(meta, parts=loc_parts, triangles=ntris(loc_parts)), open(os.path.join(out_dir, "lr4_local.json"), "w"), indent=0)
# the page: web/viewer.html, copied next to its data (served by tools/serve.py viewer)
shutil.copyfile(os.path.join(ROOT, "web", "viewer.html"), os.path.join(out_dir, "LowRider4_local.html"))
print(f"{len(loc_parts)} parts, {ntris(loc_parts)} triangles, {len(blob) / 1e6:.1f} MB in geo/ -> {out_dir}")
print(f"[time] variants + write: {time.time() - t_out:.1f} s")
