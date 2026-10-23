# Interference checks for the LowRider4 assembly: parts that should touch but not intersect.
# Shared section area (mm^2) on a few planes through each pair's common bounding box; build.py
# runs this when headless. A clamp on a rail (bore 29.34 vs 29.5 EMT) is expected to show a
# little - that's the press fit. Router_Kobalt in the Tool_Mount rings shows ~32 mm^2: the bore pinches to
# 64.8 over a short arc on the clamp side (66.7 elsewhere) round the 65.8 grip - the clamp fit.

# Speed (2026-10-18): fclib mesh.overlap_fast (numpy, only the triangles crossing each plane, sections filled
# on a ~0.1 mm grid) instead of FreeCAD face booleans, and a cache: a pair whose two parts haven't changed
# (fingerprint: facet/face count, bounding box, volume) reuses its last result. LR4_CHECK_FULL=1 ignores the
# cache, LR4_CHECK_EXACT=1 uses the old exact (slow) mesh.overlap.

import json
import os
import time
import FreeCAD as App
from fclib import mesh

PAIRS = [
    # YZ assemblies
    ("YZ_Plate_Min", "FrontWheel_Min"), ("YZ_Plate_Min", "BackWheel_Min"), ("YZ_Plate_Min", "ZStop_Min"),
    ("YZ_Plate_Max", "FrontWheel_Max"), ("YZ_Plate_Max", "BackWheel_Max"), ("YZ_Plate_Max", "ZStop_Max"),
    ("YZ_Plate_Min", "XZ_Plate_Min"), ("YZ_Plate_Max", "XZ_Plate_Max"),
    ("XZ_Plate_Min", "Z_Stub_Min"), ("XZ_Plate_Max", "Z_Stub_Max"),
    ("YZ_Plate_Min", "Z_Stub_Min"), ("YZ_Plate_Max", "Z_Stub_Max"),
    ("Z_Stub_Min", "Z_Nut_Min"), ("Z_Stub_Max", "Z_Nut_Max"),
    ("Z_Stub_Min", "Z_Leadscrew_Min"), ("Z_Stub_Max", "Z_Leadscrew_Max"), ("Z_Nut_Min", "Z_Leadscrew_Min"),
    ("Z_Stub_Min", "ZStop_Min"), ("Z_Stub_Max", "ZStop_Max"),
    ("XZ_Plate_Min", "ZStop_Min"), ("XZ_Plate_Max", "ZStop_Max"), ("MGN12H_Min_85", "ZStop_Min"),
    ("MGN12H_Min_177", "ZStop_Min"), ("MGN12_Rail_Min_177", "ZStop_Min"), ("MGN12_Rail_Min_85", "ZStop_Min"),
    # beam
    ("XZ_Plate_Min", "Brace_1"), ("XZ_Plate_Max", "Brace_Max"),
    ("StrutPlate_Front", "Brace_1"), ("StrutPlate_Front", "Brace_2"), ("StrutPlate_Front", "Brace_Max"),
    ("StrutPlate_Bottom", "Brace_1"), ("StrutPlate_Bottom", "Brace_2"), ("StrutPlate_Bottom", "Brace_Max"),
    ("X_Rail_Lower", "Brace_2"), ("X_Rail_Upper", "Brace_2"),
    ("X_Rail_Lower", "XZ_Plate_Min"), ("X_Rail_Lower", "XZ_Plate_Max"),
    ("X_Rail_Upper", "StrutPlate_Front"), ("X_Rail_Lower", "StrutPlate_Front"),
    ("X_Belt", "Brace_Max"), ("X_Belt", "StrutPlate_Front"),
    # X drive (tilted 7 deg in the core) and the X belt round it
    ("Core", "X_Pulley"), ("Core", "X_Idler_1"), ("Core", "X_Idler_2"),
    ("Belt_X_Wrap", "X_Idler_1"), ("Belt_X_Wrap", "X_Idler_2"), ("Belt_X_Wrap", "X_Pulley"), ("Belt_X_Wrap", "Core"),
    ("Belt_X_Min", "Core"), ("Belt_X_Max", "Core"), ("Belt_X_Min", "XZ_Plate_Min"), ("Belt_X_Min", "Z_Stub_Min"),
    ("Belt_X_Min", "Brace_1"), ("Belt_X_Min", "StrutPlate_Front"), ("Belt_X_Max", "StrutPlate_Front"),
    ("Belt_X_Max", "X_Belt"), ("Belt_X_Max", "Brace_Max"), ("Belt_X_Max", "Brace_4"), ("Belt_X_Min", "Brace_2"),
    ("Belt_X_Min", "Brace_3"), ("Belt_X_Max", "Brace_3"),
    # core
    ("Core", "X_Rail_Upper"), ("Core", "X_Rail_Lower"), ("Core", "StrutPlate_Front"),
    ("Core", "StrutPlate_Bottom"), ("Core", "Tool_Mount_T_Kobalt"), ("Core", "Tool_Mount_B_Kobalt"),
    ("Core", "Dust_Shoe_Kobalt"), ("Core", "Router_Kobalt"), ("Core", "X_Stepper"),
    ("Router_Kobalt", "Tool_Mount_T_Kobalt"), ("Router_Kobalt", "Tool_Mount_B_Kobalt"), ("Router_Kobalt", "Dust_Shoe_Kobalt"),
    ("Router_Nut", "Dust_Shoe_Kobalt"), ("Router_Bit", "Dust_Shoe_Kobalt"), ("Router_Kobalt", "X_Stepper"),
    ("Router_Nut", "Dust_Skirt_Kobalt"), ("Router_Kobalt", "Dust_Skirt_Kobalt"),
    ("Router_Head", "Core"), ("Router_Head", "Tool_Mount_T_Kobalt"), ("Router_Head", "X_Stepper"), ("Router_Cord", "Core"),
    ("Router_Cord", "Tool_Mount_T_Kobalt"), ("Router_Cap", "Core"), ("Router_Switch", "Core"),
    ("Router_Switch", "Tool_Mount_T_Kobalt"), ("Router_Cord", "X_Stepper"), ("Router_Cord", "Hose_Holder_Shorty_1"),
    ("Bristles_TPU_1", "Dust_Skirt_Kobalt"), ("Bristles_TPU_2", "Dust_Skirt_Kobalt"), ("Bristles_TPU_1", "Dust_Shoe_Kobalt"),
    ("Bristles_TPU_2", "Dust_Shoe_Kobalt"), ("Bristles_TPU_1", "Bristles_TPU_2"), ("Bristles_TPU_1", "Router_Bit"),
    # table
    ("Y_Rail", "Y_Clip_1"), ("Y_Rail", "Y_Clip_2"), ("Y_Rail", "Y_Belt_MaxF"), ("Y_Rail", "Y_Belt_MaxB"),
    ("Y_Rail", "FrontWheel_Max"), ("Y_Rail", "BackWheel_Max"), ("RailStrip_Max", "FrontWheel_Max"),
    ("Spoilboard", "FrontWheel_Max"), ("Spoilboard", "FrontWheel_Min"), ("Spoilboard", "BackWheel_Min"),
    # Y belts: idlers + pulley in the YZ plate pocket, belt round them and into the holder lock slots
    *[p for s in ("Min", "Max") for p in (
        (f"YZ_Plate_{s}", f"Y_Idler_{s}_1"), (f"YZ_Plate_{s}", f"Y_Idler_{s}_2"), (f"YZ_Plate_{s}", f"Y_Pulley_{s}"),
        (f"Belt_Y_{s}_Wrap", f"YZ_Plate_{s}"), (f"Belt_Y_{s}_Wrap", f"Y_Idler_{s}_1"), (f"Belt_Y_{s}_Wrap", f"Y_Idler_{s}_2"),
        (f"Belt_Y_{s}_Wrap", f"Y_Pulley_{s}"), (f"Belt_Y_{s}_Front", f"FrontWheel_{s}"), (f"Belt_Y_{s}_Back", f"BackWheel_{s}"),
        (f"Belt_Y_{s}_Front", f"YZ_Plate_{s}"), (f"Belt_Y_{s}_Back", f"YZ_Plate_{s}"),
        (f"Belt_Y_{s}_Front", f"Y_Belt_{s}F"), (f"Belt_Y_{s}_Front", f"Y_Belt_{s}_Lock"),
        (f"Belt_Y_{s}_Back", f"Y_Belt_{s}B"), (f"Belt_Y_{s}_Back", f"Y_Belt_{s}_Tension"))],
    ("Belt_Y_Max_Front", "Y_Rail"), ("Belt_Y_Max_Back", "Y_Rail"),
    ("RailStrip_Min", "FrontWheel_Min"), ("RailStrip_Min", "BackWheel_Min"), ("RailStrip_Max", "Y_Clip_1"),
    ("RailStrip_Min", "Y_Belt_MinF"), ("RailStrip_Min", "Y_Belt_MinB"), ("RailStrip_Max", "Y_Belt_MaxF"),
    ("RailStrip_Min", "PeterPlate_B_Min"), ("RailStrip_Min", "YZ_Plate_Min"), ("RailStrip_Min", "Endstop_Y_Min_Lever"),
    # Part 33: the table base under the strips / spoilboard (TABLE "sheet" or "torsion": half-laps, slot clear 0.4)
    ("TableBase", "RailStrip_Min"), ("TableBase", "Spoilboard"), ("TableRib_Y1", "TableRib_X1"),
    ("TableRib_Y2", "TableRib_X2"), ("TableRib_Y1", "RailStrip_Min"), ("TableRib_X2", "Spoilboard"),
    ("RailEdge_Min", "RailStrip_Min"), ("RailEdge_Min", "TableRib_X1"), ("RailEdge_Max", "RailStrip_Max"),
    ("RailEdge_Min", "Vac_Hose"), ("RailEdge_Min", "Y_Belt_MinF"), ("RailEdge_Max", "Y_Belt_MaxF"),
    # electronics
    ("Jackpot3_Box", "StrutPlate_Bottom"), ("Jackpot3_Box", "X_Rail_Lower"), ("Jackpot3_Box", "Brace_1"),
    ("Jackpot3_Box", "Jackpot3_Lid"), ("Jackpot3_Box", "Brace_2"), ("Jackpot3_Box", "Hose_Hook_70_1"),
    ("Jackpot3_Lid", "Hose_Hook_70_1"), ("Jackpot3_Box", "StrutPlate_Front"),
    *[(f"PeterPlate_{t}_{s}", o) for s in ("Min", "Max") for t in ("T", "B")
      for o in (f"YZ_Plate_{s}", f"Belt_Y_{s}_Wrap", f"Belt_Y_{s}_Front", f"Belt_Y_{s}_Back", f"Y_Pulley_{s}",
                f"Y_Idler_{s}_1", f"Y_Idler_{s}_2", f"FrontWheel_{s}", f"BackWheel_{s}", f"ZStop_{s}", f"Endstop_Y_{s}",
                f"Endstop_Z_{s}", f"Z_Stepper_{s}", f"Y_Stepper_{s}")],
    ("PeterPlate_T_Min", "PeterPlate_B_Min"), ("PeterPlate_T_Max", "PeterPlate_B_Max"),
    ("Jackpot3_Fan", "Jackpot3_Lid"), ("Jackpot3_Fan", "Jackpot3_Box"), ("Jackpot3_Fan", "StrutPlate_Bottom"),
    ("Jackpot3_Fan", "Vac_Hose"),
    # hose holders in the brace slots, PSU on the bottom plate
    ("Hose_Holder_Shorty_1", "Brace_1"), ("Hose_Hook_70_1", "Brace_2"), ("Hose_Holder_Shorty_2", "Brace_3"),
    ("Hose_Holder_Hook_1", "Brace_4"), ("Hose_Holder_Hook_2", "Brace_Max"), ("Hose_Hook_70_1", "X_Rail_Upper"),
    ("Hose_Holder_Shorty_1", "XZ_Plate_Min"), ("Hose_Holder_Shorty_1", "YZ_Plate_Min"),
    ("Hose_Holder_Shorty_1", "Z_Stub_Min"), ("Hose_Holder_Shorty_1", "X_Rail_Upper"),
    ("PSU_24V", "StrutPlate_Bottom"), ("PSU_24V", "Hose_Holder_Shorty_2"), ("PSU_24V", "Brace_2"), ("PSU_24V", "Brace_3"),
    # vacuum hose (parked pose; the ~73 mm wire hose threaded into the shoe's 69 mm socket shows there, and the
    # hose resting in a tray shows up to ~30 mm^2 - the rest height is solved to 0.15 mm)
    ("Vac_Hose", "Dust_Shoe_Kobalt"), ("Vac_Hose", "Core"), ("Vac_Hose", "Router_Kobalt"), ("Vac_Hose", "X_Stepper"),
    ("Vac_Hose", "Router_Head"), ("Vac_Hose", "Router_Cap"), ("Vac_Hose", "Router_Cord"),
    ("Vac_Hose", "Hose_Holder_Shorty_1"), ("Vac_Hose", "Hose_Hook_70_1"), ("Vac_Hose", "Hose_Holder_Shorty_2"),
    ("Vac_Hose", "Brace_1"), ("Vac_Hose", "Brace_2"), ("Vac_Hose", "Jackpot3_Lid"), ("Vac_Hose", "YZ_Plate_Min"),
    ("Vac_Hose", "RailStrip_Min"), ("Vac_Hose", "TableBase"), ("Vac_Hose", "TableRib_Y1"), ("Vac_Hose", "Hose_Holder_Hook_1"), ("Vac_Hose", "Brace_3"), ("Vac_Hose", "Brace_4"),
    # temp struts (build.py STRUTS = "temp"), instead of the strut plates
    *[(f"Temp_Strut_{w}_{e}", b) for w in ("Front", "Bottom") for e in ("Min", "Max")
      for b in ("Brace_1", "Brace_2", "Brace_3", "Brace_4", "Brace_5", "Brace_6", "Brace_7", "Brace_Max", "X_Rail_Upper",
                "X_Rail_Lower", "X_Belt", "Belt_X_Min", "Belt_X_Max", "Core", "Jackpot3_Box", "Jackpot3_Lid", "PSU_24V",
                "XZ_Plate_Min", "XZ_Plate_Max", "Cable_Sleeve", "Router_Cord_Run", "Vac_Hose")],
    # Tiny Touch Plate in the top mount's slot (2026-10-19)
    *[(a, b) for a in ("TouchPlate", "TouchPlate_Spade", "TouchPlate_Clip", "TouchPlate_Wire", "TouchPlate_Clip_Wire",
                       "TouchPlate_Magnet")
      for b in ("Tool_Mount_T_Kobalt", "Tool_Mount_B_Kobalt", "Core", "Router_Kobalt", "Router_Head", "Router_Cap",
                "Router_Switch", "Router_Cord", "Router_Cord_Run", "Dust_Shoe_Kobalt", "Vac_Hose", "X_Stepper",
                "Tool_Mount_T_Kobalt__clamp", "Tool_Mount_B_Kobalt__clamp", "Tool_Mount_T_Kobalt__M5_to_Core")],
    # router cord tied along the hose (2026-10-19)
    *[("Router_Cord_Run", n) for n in ("Vac_Hose", "Dust_Shoe_Kobalt", "Core", "Router_Kobalt", "Router_Head",
                                       "Router_Cap", "Router_Dial", "Router_Switch", "X_Stepper", "Hose_Holder_Shorty_1",
                                       "Hose_Hook_70_1", "Hose_Holder_Shorty_2", "Hose_Holder_Hook_1",
                                       "Hose_Holder_Hook_2", "Brace_1", "Brace_2", "Brace_3", "Brace_4", "Brace_Max",
                                       "Jackpot3_Lid", "YZ_Plate_Min", "RailStrip_Min", "TableBase", "XZ_Plate_Max", "YZ_Plate_Max")],
    *[("Cable_Sleeve", n) for n in ("Vac_Hose", "Router_Cord_Run", "Jackpot3_Box", "Jackpot3_Fan", "Dust_Shoe_Kobalt", "Core", "Router_Kobalt", "Router_Head",
                                       "Router_Cap", "Router_Dial", "Router_Switch", "X_Stepper", "Hose_Holder_Shorty_1",
                                       "Hose_Hook_70_1", "Hose_Holder_Shorty_2", "Hose_Holder_Hook_1",
                                       "Hose_Holder_Hook_2", "Brace_1", "Brace_2", "Brace_3", "Brace_4", "Brace_Max",
                                       "Jackpot3_Lid", "YZ_Plate_Min", "RailStrip_Min", "TableBase", "XZ_Plate_Max", "YZ_Plate_Max")],
]


def planes(a, b, n=4):
    """n planes along each of the two longest sides of the pair's common bounding box."""
    bb = App.BoundBox(a.BoundBox)
    bb = bb.intersected(b.BoundBox) if hasattr(bb, "intersected") else bb
    ext = {"x": (bb.XMin, bb.XMax), "y": (bb.YMin, bb.YMax), "z": (bb.ZMin, bb.ZMax)}
    axes = sorted(ext, key=lambda k: ext[k][1] - ext[k][0], reverse=True)[:2]
    return [(ax, ext[ax][0] + (ext[ax][1] - ext[ax][0]) * (i + 0.5) / n) for ax in axes for i in range(n)]


def fingerprint(s):
    """Cheap identity of a placed part: changes when it moves or changes shape (fclib.core.fingerprint)."""
    from fclib import core
    return core.fingerprint(s)


def run(m, limit=25.0, cache=None):
    t0 = time.time()
    shapes = {p["name"]: p["shape"] for p in m.parts}
    exact = os.environ.get("LR4_CHECK_EXACT") == "1"
    old = {}
    if cache and os.path.exists(cache) and os.environ.get("LR4_CHECK_FULL") != "1":
        try:
            old = json.load(open(cache))
        except ValueError:
            old = {}
    if old.get("method") != ("exact" if exact else "fast"):
        old = {}
    new, fps, reused = {"method": "exact" if exact else "fast", "pairs": {}}, {}, 0
    fp = lambda n: fps.setdefault(n, fingerprint(shapes[n]))
    bad = []
    # the Jackpot3 board comes as one mesh per OBJ colour (names vary with the export): each against its box
    board = [n for n in shapes if n == "Jackpot3_PCB" or n.startswith("Jackpot3_Board_")]
    pairs = PAIRS + [(n, o) for n in board for o in ("Jackpot3_Box", "Jackpot3_Lid", "Jackpot3_Fan")]
    for a, b in pairs:
        if a not in shapes or b not in shapes:
            print(f"  check: no part {a if a not in shapes else b}")
            continue
        sa, sb = shapes[a], shapes[b]
        if not sa.BoundBox.intersect(sb.BoundBox):
            print(f"  {a:20s} {b:20s} apart (no common box)")
            continue
        key, ids = f"{a}|{b}", [fp(a), fp(b)]
        hit = old.get("pairs", {}).get(key)
        if hit and hit["fp"] == ids:
            area, note = hit["area"], " (unchanged)"
            reused += 1
        else:
            f = mesh.overlap if exact else mesh.overlap_fast
            area, note = sum(f(sa, sb, ax, [v]) for ax, v in planes(sa, sb)), ""
        new["pairs"][key] = {"fp": ids, "area": area}
        flag = "  <-- INTERSECT" if area > limit else ""
        print(f"  {a:20s} {b:20s} {area:9.1f} mm^2{flag}{note}", flush=True)
        if flag:
            bad.append((a, b, round(area, 1)))
    if cache:
        json.dump(new, open(cache, "w"), indent=0)
    print(f"overlap check: {len(bad)} intersecting pair(s) of {len(pairs)} ({reused} unchanged, reused; "
          f"{time.time() - t0:.0f} s)")
    return bad
