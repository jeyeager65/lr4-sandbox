# FreeCAD CAM (Path) helpers: tool controllers, jobs, pocket/profile/engrave ops, posting
# one G-code file per tool (GRBL / FluidNC machines have no tool changer), time estimates.
# Proven on the LowRider v3 (WorkshopCabinets/cnc_cam.py). Lengths in mm, feeds in mm/s.
#
#   job, stock = new_job(doc, [model, helpers...], stock_box)        # stock top at Z0
#   t1 = add_tool(doc, job, 1, "quarter upcut", "endmill", {"Diameter": 6.35}, feed=15, plunge=4)
#   op = pocket(job, t1, helper, bottom_faces(clone_of(job, helper), -4), 0, -4, step=2)
#   op = tabs(job, profile(job, t1, part, bottom_faces(clone_of(job, part), -6.35), 0, -6.55, 2))
#   files = post_by_tool(job, outdir, "Sign", order=[1, 2, 3])

import math
import os
import FreeCAD as App
import Part

SHAPES = {"endmill": "endmill.fcstd", "ballend": "ballend.fcstd", "vbit": "v-bit.fcstd",
          "taperedballnose": "taperedballnose.fcstd", "chamfer": "chamfer.fcstd",
          "bullnose": "bullnose.fcstd", "drill": "drill.fcstd"}


def clear_expr(op, *props):
    for prop in props:
        try:
            op.setExpression(prop, None)
        except Exception:
            pass


def helper(doc, name, shapes, visible=False):
    """Plain Part::Feature holding cut geometry for ops to reference."""
    o = doc.addObject("Part::Feature", name)
    o.Shape = Part.makeCompound(shapes) if isinstance(shapes, (list, tuple)) else shapes
    if App.GuiUp:
        o.ViewObject.Visibility = visible
    return o


def bottom_faces(obj, z, tol=1e-3):
    """Names of obj's flat faces at height z (the floors ops should cut to)."""
    return [f"Face{i}" for i, f in enumerate(obj.Shape.Faces, 1)
            if abs(f.BoundBox.ZMax - z) < tol and abs(f.BoundBox.ZMin - z) < tol]


def new_job(doc, models, stock_box, post="grbl", label="Job", args="--no-show-editor"):
    """Job over `models` with a box stock: stock_box = (x0, y0, z0, length, width, height)."""
    import Path.Main.Job as PathJob
    import Path.Main.Stock as PathStock
    job = PathJob.Create(label, models)
    job.PostProcessor = post
    job.PostProcessorArgs = args
    x0, y0, z0, L, W, H = stock_box
    stock = PathStock.CreateBox(job, None, App.Placement(App.Vector(x0, y0, z0), App.Rotation()))
    stock.Length, stock.Width, stock.Height = L, W, H
    job.Stock = stock
    job.Proxy._defaults = list(job.Tools.Group)       # default controller, removed by add_tool
    return job


def add_tool(doc, job, num, name, shape, params, rpm=18000, feed=15.0, plunge=4.0):
    """Tool controller `num` for a ToolBit of `shape` (SHAPES key) with `params`
    (e.g. {"Diameter": 6.35, "Flutes": 1}); feeds in mm/s."""
    from Path.Tool.toolbit import ToolBit
    import Path.Tool.Controller as PathTC
    p = {"Length": "50 mm", "CuttingEdgeHeight": "22 mm", "Flutes": "2"}
    p.update({k: (f"{v} mm" if isinstance(v, float) and k not in ("Flutes",) else str(v))
              for k, v in params.items()})
    bit = ToolBit.from_dict({"name": name, "shape": SHAPES[shape], "shape-type": shape.capitalize(),
                             "parameter": p, "attribute": {}})
    tool = bit.attach_to_doc(doc)
    tc = PathTC.Create(f"T{num} {name}", tool=tool, toolNumber=num)
    tc.SpindleSpeed = rpm
    tc.SpindleDir = "Forward"
    tc.HorizFeed, tc.VertFeed = feed, plunge
    tc.HorizRapid = tc.VertRapid = 0
    job.Proxy.addToolController(tc)
    for d in getattr(job.Proxy, "_defaults", []):
        if d.Name in [o.Name for o in doc.Objects]:
            doc.removeObject(d.Name)
    job.Proxy._defaults = []
    return tc


def clone_of(job, helper_obj):
    """The job's copy of a model object (ops must reference the job's clones)."""
    for m in job.Model.Group:
        if getattr(m, "Objects", None) and helper_obj in m.Objects or \
                getattr(m, "Base", None) is helper_obj or m.Label.startswith(helper_obj.Label):
            return m
    raise RuntimeError(f"no clone for {helper_obj.Label}")


def _create(factory, job, tc, label):
    # FreeCAD picks (or asks for) a tool controller while creating an op; hand it ours.
    import PathScripts.PathUtils as PathUtils
    orig = PathUtils.findToolController
    PathUtils.findToolController = lambda *a, **k: tc
    try:
        op = factory(label, parentJob=job)
    finally:
        PathUtils.findToolController = orig
    op.ToolController = tc
    clear_expr(op, "StartDepth", "FinalDepth", "StepDown", "SafeHeight", "ClearanceHeight")
    return op


SAFE_HEIGHT = 2.0         # above the start depth: feed moves start here
CLEARANCE_HEIGHT = 4.0    # above the start depth: rapids between regions (flat board, clamps
                          # outside the work - the LowRider Z is slow, so keep it low)


def _heights(op, start, final, step, safe=None, clearance=None):
    safe = SAFE_HEIGHT if safe is None else safe
    clearance = CLEARANCE_HEIGHT if clearance is None else clearance
    op.StartDepth, op.FinalDepth, op.StepDown = start, final, step
    op.SafeHeight, op.ClearanceHeight = start + safe, start + clearance


def pocket(job, tc, base_obj, faces, start, final, step, stepover=40, stock=0.0, rest=False,
           label=None):
    """Pocket the given flat faces of base_obj (a job clone) down to `final`.
    stock = material left on the walls (FreeCAD ExtraOffset); rest = only what earlier ops
    in the job left (rest machining)."""
    import Path.Op.PocketShape as PathPocketShape
    op = _create(PathPocketShape.Create, job, tc, label or f"{tc.Label} pocket")
    op.Base = [(base_obj, faces)]
    _heights(op, start, final, step)
    op.StepOver = stepover
    op.ExtraOffset = stock
    op.UseRestMachining = rest
    for prop in ("MinTravel",):          # order regions/levels to cut rapid travel
        if prop in op.PropertiesList:
            setattr(op, prop, True)
    return op


def profile(job, tc, base_obj, faces, start, final, step, side="Outside", perimeter=True, holes=False,
            extra=0.0, label=None):
    """Contour the given flat faces of base_obj (a job clone) down to `final`: the outline
    (perimeter) on `side` and/or the holes in the faces (always cut inside).
    extra = stock left on the wall (OffsetExtra)."""
    import Path.Op.Profile as PathProfile
    op = _create(PathProfile.Create, job, tc, label or f"{tc.Label} profile")
    op.Base = [(base_obj, faces)]
    _heights(op, start, final, step)
    op.Side = side
    op.processPerimeter = perimeter
    op.processHoles = holes
    op.processCircles = holes
    op.OffsetExtra = extra
    return op


def tabs(job, op, width=6.0, height=1.5, label=None):
    """Holding tabs (Tags dressup) on op's path; the dressup takes op's place in the job."""
    import Path.Dressup.Tags as PathTags
    op.recompute()
    d = PathTags.Create(op)
    d.Label = label or f"{op.Label} + tabs"
    d.recompute()
    d.Width, d.Height = width, height
    if op in job.Operations.Group:
        job.Operations.removeObject(op)
    if App.GuiUp and op.ViewObject is not None:
        op.ViewObject.Visibility = False
    return d


def engrave(job, tc, base_obj, start, final, step, label=None):
    """Tool centre follows the edges of base_obj (a wire/face clone) down to `final`."""
    import Path.Op.Engrave as PathEngrave
    op = _create(PathEngrave.Create, job, tc, label or f"{tc.Label} engrave")
    op.BaseShapes = [base_obj]
    _heights(op, start, final, step)
    return op


def vcarve(job, tc, base_obj, faces, final=-20.0, discretize=0.01, clamp=True, label=None):
    """V-carve the given flat faces of base_obj (a job clone) with a V-bit: depth follows the
    width (medial axis), down to at most `final`. Keep `final` below the depth at which the
    bit is as wide as the widest stroke (half width / tan(half angle)): where it is capped,
    FreeCAD only cuts the centreline and the corner branches, leaving 'teeth' on the walls.
    discretize = curve deflection in mm (FreeCAD's 0.25 default gives coarse polygons whose
    corner branches show as notches on round letters).
    clamp: FreeCAD 1.1's Vcarve goes too deep where strokes meet (the N's diagonal and stems:
    ~0.4 mm past the outline). With clamp, its path is copied into a Custom op with every
    point no deeper than the outline allows (see vcarve_clamp) and the Vcarve op is made
    inactive; the Custom op is returned."""
    import Path.Op.Vcarve as PathVcarve
    op = _create(PathVcarve.Create, job, tc, label or f"{tc.Label} vcarve")
    op.Base = [(base_obj, faces)]
    _heights(op, 0.0, final, abs(final))
    op.Discretize = discretize
    if not clamp:
        return op
    op.recompute()
    outline = [e for name in faces for e in base_obj.Shape.getElement(name).Edges]
    return vcarve_clamp(job, op, outline)


def vcarve_clamp(job, op, outline, step=0.2):
    """A Custom op with op's V-carve path, every cutting point raised to the deepest the
    V-bit may go there without cutting past `outline` (edges at z = 0): depth <=
    (distance to the outline - tip radius) / tan(half angle). Moves are split every `step` mm
    so the clamp holds between the original points too. op is made inactive."""
    import numpy as np
    import Path
    import Path.Op.Custom as PathCustom
    tool = op.ToolController.Tool
    val = lambda name, default: float(getattr(getattr(tool, name, None), "Value", default))
    tan = math.tan(math.radians(val("CuttingEdgeAngle", 60.0) / 2))
    tip_r = val("TipDiameter", 0.0) / 2
    segs = [(a, b) for e in outline for a, b in zip(*(lambda d: (d[:-1], d[1:]))(e.discretize(Deflection=0.002)))]
    A = np.array([(a.x, a.y) for a, _ in segs])
    AB = np.array([(b.x - a.x, b.y - a.y) for a, b in segs])
    L2 = np.maximum((AB ** 2).sum(1), 1e-12)

    def deepest(x, y):
        AP = np.array([x, y]) - A
        t = np.clip((AP * AB).sum(1) / L2, 0, 1)
        d = np.sqrt(((AP - AB * t[:, None]) ** 2).sum(1)).min()
        return -max(0.0, d - tip_r) / tan

    out, pos, raised = [], None, 0.0
    for c in op.Path.Commands:
        p = c.Parameters
        if c.Name in ("G1", "G01") and pos is not None and any(k in p for k in "XYZ"):
            nxt = App.Vector(p.get("X", pos.x), p.get("Y", pos.y), p.get("Z", pos.z))
            n = max(1, math.ceil((nxt - pos).Length / step)) if min(pos.z, nxt.z) < 0 else 1
            moved = []
            for i in range(1, n + 1):
                q = pos + (nxt - pos) * (i / n)
                z = max(q.z, deepest(q.x, q.y)) if q.z < 0 else q.z
                raised = max(raised, z - q.z)
                moved.append((q, z))
            if all(z - q.z < 1e-4 for q, z in moved):
                moved = moved[-1:]          # nothing clamped: keep the original single move
            for q, z in moved:
                prm = {"X": q.x, "Y": q.y, "Z": z}
                if "F" in p:
                    prm["F"] = p["F"]
                out.append(Path.Command(c.Name, prm))
            pos = nxt
            continue
        out.append(c)
        if any(k in p for k in "XYZ"):
            pos = App.Vector(p.get("X", pos.x if pos else 0), p.get("Y", pos.y if pos else 0),
                             p.get("Z", pos.z if pos else 0))
    label = op.Label
    op.Active = False
    op.Label = f"{label} - FreeCAD unclamped"
    custom = _create(PathCustom.Create, job, op.ToolController, label)
    custom.Label = label
    custom.Source = "Text"
    custom.Gcode = [c.toGCode() for c in out]
    custom.recompute()
    print(f"vcarve_clamp: {op.Label} -> {custom.Label}: raised up to {raised:.3f} mm")
    return custom


def drill(job, tc, base_obj, faces, final, peck=None, label=None):
    """Drill the holes (vertical cylindrical faces) of base_obj (a job clone) to `final`;
    peck = peck depth (G83, posted as plain moves), None = one plunge."""
    import Path.Op.Drilling as PathDrilling
    op = _create(PathDrilling.Create, job, tc, label or f"{tc.Label} drill")
    op.Base = [(base_obj, faces)]
    op.StartDepth, op.FinalDepth = 0.0, final          # drilling has no StepDown
    op.SafeHeight, op.ClearanceHeight = SAFE_HEIGHT, CLEARANCE_HEIGHT
    if peck:
        op.PeckEnabled, op.PeckDepth = True, peck
    return op


def cylinder_faces(obj):
    """Names of obj's cylindrical faces (holes for drill())."""
    return [f"Face{i}" for i, f in enumerate(obj.Shape.Faces, 1)
            if f.Surface.__class__.__name__ == "Cylinder"]


# --- 2D region math (Clipper via Path.Area: robust and fast, unlike OCC 2D offsets) -------
# Use these to work out what each tool can reach and give later tools plain pockets on just
# the leftovers - FreeCAD's own rest machining (UseRestMachining) re-sweeps every move of
# the earlier ops and took 15+ minutes on a lettered sign.

def offset(shape, d):
    """Flat faces grown (d > 0) or shrunk (d < 0) by d mm, as faces in the XY plane."""
    import Path
    a = Path.Area(Fill=1, Coplanar=0)
    a.setPlane(Part.makeCircle(1))
    a.add(shape)
    return a.makeOffset(offset=d)


def reach(region, tool_r, stock=0.0):
    """The part of `region` a flat tool of radius tool_r sweeps while keeping `stock` off
    its edges (morphological opening)."""
    core_ = offset(region, -(tool_r + stock))
    return offset(core_, tool_r) if core_.Faces else core_


def cleanup(shape, sliver=0.1, min_area=0.5):
    """Drop slivers narrower than 2 x sliver and pieces smaller than min_area mm^2."""
    s = offset(offset(shape, -sliver), sliver) if shape.Faces else shape
    faces = [f for f in s.Faces if f.Area >= min_area]
    return Part.makeCompound(faces) if faces else Part.Compound([])


def floor_solid(faces_shape, depth):
    """Flat faces at z = 0 -> a solid from -depth to 0 whose bottom faces are the floors to
    pocket (what PocketShape ops select)."""
    solids = []
    for f in faces_shape.Faces:
        g = f.copy()
        g.translate(App.Vector(0, 0, -depth - g.BoundBox.ZMin))
        solids.append(g.extrude(App.Vector(0, 0, depth)))
    return Part.makeCompound(solids)


def attach_view_provider(o):
    """Ops created from a script get no GUI view provider (toolpaths not drawn)."""
    kind = type(getattr(o, "Proxy", None)).__name__
    import Path.Op.Gui.Base as OpGui
    if kind == "ObjectPocket":
        import Path.Op.Gui.PocketShape as G
        o.ViewObject.Proxy = OpGui.ViewProvider(o.ViewObject, G.Command.res)
    elif kind == "ObjectProfile":
        import Path.Op.Gui.Profile as G
        o.ViewObject.Proxy = OpGui.ViewProvider(o.ViewObject, G.Command.res)
    elif kind == "ObjectEngrave":
        import Path.Op.Gui.Engrave as G
        o.ViewObject.Proxy = OpGui.ViewProvider(o.ViewObject, G.Command.res)
    elif kind == "ObjectTagDressup":
        import Path.Dressup.Gui.Tags as G
        o.ViewObject.Proxy = G.PathDressupTagViewProvider(o.ViewObject)


def tidy_view(doc, job, colours=None):
    """Show toolpaths (coloured per tool) over the see-through model; hide helpers/stock."""
    if not App.GuiUp:
        return
    colours = colours or {1: (0.1, 0.8, 0.2), 2: (0.2, 0.6, 1.0), 3: (1.0, 0.75, 0.1)}
    ops = set(job.Operations.Group)
    for o in doc.Objects:
        vo = getattr(o, "ViewObject", None)
        if vo is None:
            continue
        if o.TypeId == "Path::FeaturePython" and o is not job and vo.Proxy is None:
            attach_view_provider(o)
        if o in ops:
            vo.Visibility = True
            vo.LineWidth = 2
            num = getattr(getattr(o, "ToolController", None), "ToolNumber", 0)
            vo.NormalColor = colours.get(num, (1, 1, 1))
        elif o is job:
            vo.Visibility = True
        elif o.TypeId != "App::DocumentObjectGroup":
            vo.Visibility = False


def estimate(ops, rapid=50.0):
    """Rough run time in minutes for ops: cutting moves at their feeds, rapids at `rapid`
    mm/s. Machines rarely reach programmed feed on short moves, so add ~20-30 %."""
    total = 0.0
    for op in ops:
        tc = op.ToolController
        pos = App.Vector(0, 0, 0)
        for c in op.Path.Commands:
            if c.Name not in ("G0", "G00", "G1", "G01", "G2", "G02", "G3", "G03"):
                continue
            p = c.Parameters
            nxt = App.Vector(p.get("X", pos.x), p.get("Y", pos.y), p.get("Z", pos.z))
            d = (nxt - pos).Length
            if c.Name in ("G2", "G02", "G3", "G03") and "I" in p:      # arc: use the chord x 1.1
                d *= 1.1
            if c.Name in ("G0", "G00"):
                total += d / rapid
            else:
                vertical = abs(nxt.z - pos.z) > 1e-6 and abs(nxt.x - pos.x) + abs(nxt.y - pos.y) < 1e-6
                feed = float(tc.VertFeed) if vertical else float(tc.HorizFeed)
                total += d / max(feed, 0.1)
            pos = nxt
    return total / 60.0


# The router dial table lives in the self-contained FluidNC post (fluidnc_post.py), so the
# post works on its own in FreeCAD's Macro folder; re-exported here for project scripts.
from fclib.fluidnc_post import ROUTERS, dial_rpm, router_dial  # noqa: E402,F401


def post_by_tool(job, outdir, name, order, labels=None):
    """One GRBL file per tool number in `order`: <name>_T<n>_<label>.nc"""
    import importlib
    grbl = importlib.import_module("Path.Post.scripts.grbl_post")
    tcs = {tc.ToolNumber: tc for tc in job.Tools.Group}

    def tc_of(o):
        while o is not None and getattr(o, "ToolController", None) is None:
            o = getattr(o, "Base", None)
            o = o if hasattr(o, "Path") else None
        return o.ToolController if o is not None else None

    ops = [o for o in job.Operations.Group if getattr(o, "Active", True)]
    files = []
    os.makedirs(outdir, exist_ok=True)
    for num in order:
        sel = [o for o in ops if tc_of(o) is not None and tc_of(o).ToolNumber == num]
        if not sel:
            continue
        label = (labels or {}).get(num, f"tool{num}")
        fn = os.path.join(outdir, f"{name}_T{num}_{label}.nc")
        grbl.export([tcs[num]] + sel, fn, "--no-show-editor")
        files.append((num, fn, sel))
    return files
