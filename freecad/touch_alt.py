# Part 50: the touch plate + clip as stored on the Makita / DeWalt mounts (their cage, touch_pose.py) for the page:
#   python tools/run.py freecad/touch_alt.py           (no full build: the page data's own TouchPlate meshes move)
# Checks the Kobalt pose touch_pose.py makes against the shipped meshes (build.py's), each cage pose's overlaps with
# that mount's top + bottom STLs, and writes web/data/touch_alt.json: per mount, the plate's and the clip's move from
# the Kobalt pose as 4x4 rows in the mount files' frame (the page: A . D . A^-1, A = Tool_Mount_T's src.A).
# LR4_TOUCH_STL=<folder>: also the posed parts as STLs (file frame) to look at.
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import FreeCAD as App                                 # noqa: E402
import Mesh                                           # noqa: E402
import MeshPart                                       # noqa: E402
import numpy as np                                    # noqa: E402

import lr4                                            # noqa: E402
import touch_pose                                     # noqa: E402
from fclib import hw, mesh                            # noqa: E402

V = App.Vector
build_py = open(os.path.join(HERE, "build.py"), encoding="utf-8").read()
CLIP_POSE = eval(build_py.split("\nTOUCH_CLIP_POSE = ", 1)[1].split("#", 1)[0])   # build.py's setting (one source)
PLATE_PARTS = {"plate": "TouchPlate", "spade": "TouchPlate_Spade", "spade_metal": "TouchPlate_Spade_Metal", "wire_plate": "TouchPlate_Wire"}
CLIP_PARTS = {"magnet": "TouchPlate_Magnet", "a": "TouchPlate_Clip_A", "b": "TouchPlate_Clip_B", "screw": "TouchPlate_Clip_Screw",
              "spring": "TouchPlate_Clip_Spring", "wire_core": "TouchPlate_Clip_Wire", "wire_insulation": "TouchPlate_Clip_Insulation"}
FILES = {"makita": ("makita/Tool_Mount_T_Makita.stl", "makita/Tool_Mount_B_Makita.stl"),
         "dewalt": ("dewalt/Tool_Mount_T_DeWalt.stl", "dewalt/Tool_Mount_B_DeWalt.stl")}


def clip_pose(mount):
    return touch_pose.clip_pose(CLIP_POSE) if mount == "kobalt" else touch_pose.cage_clip(mount)


def parts(mount, pl=App.Placement()):
    tp = hw.tiny_touch_plate(pl.multiply(touch_pose.plate(mount)), clip=False, wire=8.0, **lr4.TOUCH_PLATE)
    cl = hw.bu45_clip(os.path.join(HERE, "models", "alligator_clip"), pl.multiply(touch_pose.magnet(mount)), clip=clip_pose(mount))
    return {nm: tp[k] for k, nm in PLATE_PARTS.items()} | {nm: cl[k] for k, nm in CLIP_PARTS.items()}


def move(p_alt, p_kob):                               # the Kobalt pose -> the mount's (file frame)
    return rows(p_alt.multiply(p_kob.inverse()))


def as_mesh(s):
    return MeshPart.meshFromShape(Shape=s, LinearDeflection=0.05, AngularDeflection=0.3)


def rows(p):
    m = p.toMatrix()
    return [[round(m.A[4 * i + j], 6) for j in range(4)] for i in range(4)]


cfg = json.load(open(os.path.join(ROOT, "web", "data", "lr4_config.json")))
recs = {r["meta"]["name"]: r for r in cfg["parts"]}
A3 = recs["Tool_Mount_T_Kobalt"]["src"]["A"]
A = App.Placement(App.Matrix(*A3[0], *A3[1], *A3[2], 0, 0, 0, 1))
bad = 0
# 1. the Kobalt pose = what build.py put in the page data
for nm, s in parts("kobalt", A).items():
    r = recs.get(nm)
    if r is None or not r.get("lo_ref"):
        continue
    b = as_mesh(s).BoundBox                           # (a curved BRep's own box is padded: tenths of a mm)
    d = max(abs(a - c) for a, c in zip((b.XMin, b.YMin, b.ZMin, b.XMax, b.YMax, b.ZMax), r["lo_ref"] + r["hi_ref"]))
    if d > 0.1:
        bad += 1
    print(f"{'ok ' if d <= 0.1 else 'BAD'} kobalt {nm}: box {d:.3f} mm from the page data's")
# 2. the cage poses: overlaps with the mounts (mm^2 summed over z planes 0.5 apart), 3. the moves
out = {"plate": list(PLATE_PARTS.values()), "magnet": ["TouchPlate_Magnet"],
       "clip": [nm for nm in CLIP_PARTS.values() if nm != "TouchPlate_Magnet"], "mounts": {}}
stl_dir = os.environ.get("LR4_TOUCH_STL")
for mount, files in FILES.items():
    ps = parts(mount)
    ms = {nm: as_mesh(s) for nm, s in ps.items()}
    for f in files:
        mt = mesh.load(os.path.join(ROOT, "parts", f))
        for nm, m in ms.items():
            b = m.BoundBox
            zs = list(np.arange(b.ZMin + 0.25, b.ZMax, 0.5))
            if not zs or not m.BoundBox.intersect(mt.BoundBox):
                continue
            a = mesh.overlap_fast(m, mt, "z", zs)
            if a > 0.5:
                bad += 1
                print(f"OVERLAP {mount} {nm} x {os.path.basename(f)}: {a:.1f} mm^2")
    mag = {k: touch_pose.magnet(k) for k in ("kobalt", mount)}
    out["mounts"][mount] = {"plate": move(touch_pose.plate(mount), touch_pose.plate("kobalt")),
                            "magnet": move(mag[mount], mag["kobalt"]),
                            "clip": move(mag[mount].multiply(clip_pose(mount)), mag["kobalt"].multiply(clip_pose("kobalt")))}
    pb = ps["TouchPlate"].BoundBox
    print(f"{mount}: plate z {pb.ZMin:.1f}..{pb.ZMax:.1f}, clip z {ps['TouchPlate_Clip_A'].BoundBox.ZMin:.1f}..{ps['TouchPlate_Clip_A'].BoundBox.ZMax:.1f}")
    if stl_dir:
        os.makedirs(stl_dir, exist_ok=True)
        for nm, m in ms.items():
            m.write(os.path.join(stl_dir, f"{mount}_{nm}.stl"))
json.dump(out, open(os.path.join(ROOT, "web", "data", "touch_alt.json"), "w", newline="\n"), indent=1)
print(f"{'all ok' if not bad else str(bad) + ' problem(s)'}; wrote web/data/touch_alt.json")
