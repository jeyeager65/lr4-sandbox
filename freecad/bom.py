# Bill of materials for the LowRider4 build, from build.py's numbers and hardware.py's fastener plan:
#   data(g) -> sections (title, note, columns, rows) - written to build/bom.json (the web viewer shows it)
#   text(g) -> build/bom.md
from collections import Counter, OrderedDict

IN = 25.4

# V1E docs (docs.v1e.com/lowrider, "Printed Parts"): infill and notes per file
INFILL = {"Core": "30%", "YZ_Plate_Min_V1": "25%", "YZ_Plate_Max_V1": "25%", "FrontWheel_Min": "20%",
          "FrontWheel_Max": "20%", "BackWheel_Min": "20%", "BackWheel_Max": "20%", "Brace_29p5": "30% (one end brace 60%)",
          "Brace_Max_29p5": "60%", "Hose_Hook_70": "30%", "Hose_Holder_Hook": "30%", "hose_holder_shorty": "30%",
          "Y_Clip_29p5": "30%", "Temp_Strut_v1": "15%", "Jackpot3_Box": "20%", "Jackpot3_Lid": "20%"}
SOURCE = {"Tool_Mount_T_Kobalt": "Kobalt tool mount (Printables 1034828)", "Tool_Mount_B_Kobalt": "Kobalt tool mount",
          "Dust_Shoe_Kobalt": "Kobalt tool mount", "Dust_Skirt_Kobalt": "Kobalt tool mount",
          "TPU_Bristles_22mm": "Kobalt tool mount - TPU 95A, 1 wall, 0.35 layers",
          "Jackpot3_Box": "Jackpot3 box (Printables 1434650)", "Jackpot3_Lid": "Jackpot3 box",
          "PeterPlateT": "Peter Plates (Printables 1044487) - YZ Min; stepper openings filled (model) - or print with no top / "
                         "bottom layers + honeycomb infill for the open look (lets the steppers breathe)",
          "PeterPlateB": "Peter Plates (Printables 1044487) - YZ Min; as above",
          "PeterPlateT (mirrored)": "Peter Plates - mirror in the slicer for YZ Max",
          "PeterPlateB (mirrored)": "Peter Plates - mirror in the slicer for YZ Max"}

# V1E hardware list for a 4 x 8 ft build (docs "Hardware") - the kit
KIT = [  # (kit qty, item, US equivalent / note)
    (14, "M8 x 40 mm hex head bolt", '5/16" x 1 1/2" hex head'),
    (14, "M8 nylock nut", '5/16" nylock'),
    (60, "M5 x 30 mm button head screw", "must be metric"),
    (60, "M5 nylock nut", "must be metric"),
    (83, "M3 x 10 mm button head screw", "must be metric (16 hold the XZ plates - sized for 6.35 mm plates); "
                                          "the Peter Plates' screws are extra (not in the kit)"),
    (10, "M2.5 x 12 mm button head screw", "endstops"),
    (18, '#8 x 3/4" (M4 x 20) pan head wood screw', 'V1E: M4 x 12+ / #8 x 1/2"+ - not in the kit; 3/4" for the 8 mm holder bases'),
    (0, "M3 x 20 mm button head screw", "not in the kit: the optional Jackpot3 lid fan (2)"),
]
# needed but not in the model (count added to the model's for "this build")
NOT_MODELLED = {}   # the Jackpot3 board's 4 x M3 x 10 are modelled now (2026-10-19)

SPECIALTY = [  # (qty, item, notes) - docs "Specialty Parts"
    (1, "Jackpot3 CNC controller (FluidNC)", "V1E shop / Elecrow; in the Jackpot3 box, first bay on the YZ_Min side"),
    (5, "NEMA 17 stepper, 48 mm, 84 oz-in (StepperOnline 17HS19-2004S1 or similar), 20 mm+ shaft", "X, Y0, Y1, Z0, Z1"),
    (3, "Stepper wire extension", "Y1, Z1 and the core"),
    (1, "V1E Tiny Touch Plate (0.5 stainless, 2 m wire, alligator clip, N52 magnet)",
     "optional; stored snapped into the top tool mount's slot, clip on the pad; plate -> probe S, clip -> G"),
    (3, "GT2 16T pulley, 10 mm belt, 5 mm bore", "X, Y0, Y1 - grub screws on the flat first, threadlocker"),
    (6, "GT2 20T smooth idler, 10 mm, 5 mm bore", "2 per YZ plate, 2 in the core"),
    (5, "Omron SS-3GL13PT micro switch (simulated roller lever)", "endstops X, Y0, Y1, Z0, Z1 - 2 x M2.5 x 12 each; "
     "the Y levers catch the stop screw heads only just (in the model ~1 mm short) - V1E yb85: bend the tab out a little"),
    (14, "608-2RS bearing", "8 core + 2 Min wheels + 4 Max wheels"),
    (2, "T8 leadscrew 145 mm+ (4 start, 2 mm pitch, 8 mm/rev) + flanged brass nut", "brass flange under the Z_Nut"),
    (2, "5 to 8 mm flexible (helical beam) coupler, D19 x 25", "Z steppers; 2 x M3 set screws per hub come with it "
     "(about M3 x 6 on the 5 mm side, M3 x 5 on the 8 mm side); centred on the shaft / leadscrew joint"),
    (4, "MGN12H 150 mm linear rail + block", "2 per YZ plate"),
    (1, "24 V power supply, 36 W+", "brick size in the model is a GUESS"),
    (1, "5015 blower fan, 24 V (V1E shop: 5015 fan blower)", "optional - on the outside of the Jackpot3 lid, inlet over its "
     "38 mm opening: it pulls air OUT of the box (dusty shop - don't blow in), outlet toward the Min end; 2 x M3 x 20"),
    (1, "Threadlocker (blue)", "optional, pulley / coupler grub screws"),
    (1, "PTFE grease / light oil", "optional, leadscrews, idlers, rails"),
    (1, "Wire sleeve", "optional"),
]
OTHER = [
    (1, 'Fulton 2-1/2" x 20 ft clear PVC dust collection hose (steel wire)', "user's; threads into the dust shoe; ground the wire"),
    (1, "Kobalt 1.25 HP trim router", "user's"),
    (1, "Zip ties (long)", "hose to the core's two tie tunnels, wires to the braces"),
]


def _pretty(n):
    return n.replace("_", " ").replace("29p5", "29.5").replace(" V1", "")


def hardware_groups(specs):
    """One row per (item, joint): where it goes, how it sits, the check."""
    groups = OrderedDict()
    for sp in specs:
        key = (sp["item"], sp["label"].split(" -> ")[0] if " -> " in sp["label"] else sp["obj"], sp["why"])
        groups.setdefault(key, []).append(sp)
    rows = []
    for (item, _, why), sps in groups.items():
        sp = sps[0]
        lab = sp["label"]
        if lab.startswith("Bearing_"):
            lab = "608 bearing axles in " + ("the core" if "Core" in lab else _pretty(lab.split("_", 1)[1].rsplit("_", 1)[0]
                                                                                         if lab.count("_") > 2 else lab.split("_", 1)[1]))
        elif lab.startswith("belt loop"):
            lab = "belt end loops"
        else:
            lab = _pretty(lab).replace(" -> ", " to ")
        head = f"head on {_pretty(sp['head_part'])}" if sp.get("head_part") else "head on the belt"
        sunk = max(s.get("head_sunk") or 0 for s in sps)
        if sunk > 0.5:
            head += f", nested {sunk:.1f} mm"
        if sp.get("nut"):
            pk = sum(1 for s in sps if s["nut"].get("pocket"))
            pr = [s["protrude"] for s in sps if "protrude" in s]
            nut = f"nylock {'in pocket' if pk == len(sps) else 'on the far face' if not pk else f'{pk} in pockets'}"
            if pr:
                nut += f", thread {min(pr):+.1f}" + (f" to {max(pr):+.1f}" if max(pr) - min(pr) > 0.2 else "") + " mm past it"
        elif sp.get("engage") is not None:
            e = [s["engage"] for s in sps if s.get("engage") is not None]
            nut = f"threads {min(e):.1f}" + (f"-{max(e):.1f}" if max(e) - min(e) > 0.2 else "") + \
                  f" mm into {_pretty(sp['engage_part'])}"
        else:
            nut = "-"
        flags = sorted({f for s in sps for f in s["flags"]})
        notes = sorted({n for s in sps for n in s["notes"] if n.startswith("approximate") or n.startswith("head on the bearing")})
        status = "OK" if not flags else "CHECK: " + "; ".join(flags)
        if notes and not flags:
            status = "OK (" + "; ".join(notes) + ")"
        step = why.split(":")[0]
        rows.append([len(sps), item, lab, head, nut, step, status])
    return rows


def data(g):
    calc, calc_in = g["calc"], g["calc_in"]
    strut, n_braces = g["strut"], g["n_braces"]
    specs = g.get("hw_specs") or []
    model = Counter(sp["item"] for sp in specs) + Counter(sp["nut_item"] for sp in specs if sp.get("nut_item"))
    S = []
    S.append(dict(title="V1E calculator", note=f"Usable cutting area {g['CUT_X_IN']:g} x {g['CUT_Y_IN']:g} in "
                  f"({g['CUT_X']:.1f} x {g['CUT_Y']:.1f} mm), 1\" EMT (29.5 mm), XZ plates {g['XZ_PLATE']:g} mm. This build "
                  f"uses the mm values (the inch mode rounds the strut up to {calc_in['strut'] * IN:.2f} mm).",
                  columns=["Item", "mm", "in (inch mode)", "Qty"],
                  rows=[["X rails (1\" EMT)", calc["xrails"], calc_in["xrails"], 2],
                        ["Y rail (1\" EMT)", round(calc["yrail"], 1), calc_in["yrail"], 1],
                        ["Belt along X", calc["xbelt"], calc_in["xbelt"], 1],
                        ["Belt along Y", round(calc["ybelt"], 1), calc_in["ybelt"], 2],
                        ["Belt total (GT2 10 mm)", round(calc["belt_total"], 1), calc_in["belt_total"], ""],
                        ["Strut length", strut, calc_in["strut"], "2 plates"],
                        ["Table footprint (min)", f"{calc['xtable']} x {calc['ytable']:.1f}",
                         f"{calc_in['xtable']} x {calc_in['ytable']}", ""]]))
    S.append(dict(title="Buy: specialty parts and electronics", note="V1E LowRider 4 docs, \"Specialty Parts\" (most come in "
                  "the V1E hardware kit).", columns=["Qty", "Item", "Notes"],
                  rows=[list(r) for r in SPECIALTY + OTHER]))
    emt = calc["xrails"] * 2 + calc["yrail"]
    S.append(dict(title="Buy / cut: stock", note="Lengths from the calculator; plates from the strut generator.",
                  columns=["Qty", "Part", "Material", "Size", "Notes"],
                  rows=[[1, "Table top", f"{g['MDF_T'] / IN:g}\" MDF", f"{g['TW'] / IN:g} x {g['TL'] / IN:g} in",
                         f"calculator footprint + {g['TABLE_MARGIN_IN']:g}\" margin (GUESS - a real table later)"],
                        [2, "X rail", "1\" EMT", f"{calc['xrails']} mm ({calc['xrails'] / IN:.3f} in)", "must not touch the XZ plates"],
                        [1, "Y rail", "1\" EMT", f"{calc['yrail']:.0f} mm ({calc['yrail'] / IN:.3f} in)", ""],
                        ["", "(EMT to buy)", "1\" EMT, 10 ft sticks", f"{emt:.0f} mm total", "2 sticks: Y rail + 1 X rail, then the other X rail"],
                        [1, "Strut plate, front", "1/4\" MDF", f"{strut} x 90.5 mm", "CNC: exports/cam (wings 11.5)"],
                        [1, "Strut plate, bottom", "1/4\" MDF", f"{strut} x 78.5 mm", "CNC: exports/cam"],
                        [1, "XZ plates (pair)", "aluminium 6.5 mm", "V1E DXFs", "V1E shop, or cut from parts/lr4 (6.35 fits the M3 x 10s)"],
                        [1, "Belt along X", "GT2 10 mm", f"{calc['xbelt']} mm", f"modelled path {g.get('x_belt_len', 0):.0f} mm loop screw to tensioner"],
                        [2, "Belt along Y", "GT2 10 mm", f"{calc['ybelt']:.0f} mm",
                         f"modelled path {max(g.get('belt_len', {0: 0}).values()):.0f} mm lock to tension block"]]))
    counts = Counter(g["printed"])
    counts["Temp_Strut_v1"] += 4
    rows = []
    for f, q in sorted(counts.items(), key=lambda kv: (kv[0] in SOURCE, kv[0].lower())):
        note = INFILL.get(f, "30%")
        src = SOURCE.get(f, "V1E LowRider 4 (Printables 1034840)")
        if f == "Temp_Strut_v1":
            src += " - temporary, until the machine cuts its MDF strut plates (not in the model)"
        rows.append([q, f, note, src])
    S.append(dict(title="Printed parts", note="PLA, 3 walls, no supports, default orientation (V1E); the Kobalt mount 2 walls. "
                  "Files in parts/.", columns=["Qty", "File", "Infill", "Source / notes"], rows=rows))
    rows = []
    for q, item, note in KIT:
        need = model.get(item, 0) + NOT_MODELLED.get(item, (0, ""))[0]
        extra = NOT_MODELLED.get(item, (0, ""))[1]
        rows.append([q, need, model.get(item, 0), item, note + (f"; {extra}" if extra else "")])
    S.append(dict(title="Hardware: V1E kit vs this build", note="Kit = the V1E list for a 4 x 8 ft machine (7 braces); "
                  f"this build has {n_braces} braces (4 x M5 + nylock per brace). 'Needed' = what the model places plus what "
                  "it can't (named in the notes). Z_Nut cross-tensioner M3s left out, as V1E says.",
                  columns=["Kit", "Needed", "In model", "Item", "Notes"], rows=rows))
    hw_rows = hardware_groups(specs)
    bad = sum(1 for r in hw_rows if r[-1].startswith("CHECK"))
    S.append(dict(title="Hardware: where every fastener goes", note=f"{len(specs)} fasteners placed from the parts' holes and "
                  "checked along their axis (head seat, what the shank passes, nut seat or thread engagement, anything they run "
                  f"into). {bad} row(s) to check. V1E step = the photo name in docs.v1e.com/lowrider.",
                  columns=["Qty", "Item", "Joint", "Head", "Nut / thread", "V1E step", "Check"], rows=hw_rows))
    S.append(dict(title="Model notes", note="", columns=["Note"], rows=[
        [f"Braces: {n_braces} at {g['pitch']:.2f} mm pitch (generator default); Y clips: {g['n_clips']} (<= 300 mm apart)."],
        ["Threads are modelled on every screw, bolt and leadscrew (revolved V / trapezoid rings, not a true helix); GT2 belt "
         "teeth face the pulleys."],
        ["Approximate: router body (GUESS dims), power supply, Jackpot3 lid, the X belt end loop screws, the hose route."],
        [f"Vacuum hose: {g['hose_len'] / 1000:.1f} m modelled at the parked pose (shoe to {-g['HOSE']['floor'][2]:.0f} mm "
         "below the table top)."]]))
    return S


def text(g):
    out = [f"# {g['NAME']}: bill of materials", ""]
    for s in data(g):
        out += [f"## {s['title']}", ""]
        if s["note"]:
            out += [s["note"], ""]
        out.append("| " + " | ".join(s["columns"]) + " |")
        out.append("|" + "---|" * len(s["columns"]))
        for r in s["rows"]:
            out.append("| " + " | ".join(str(c) for c in r) + " |")
        out.append("")
    return "\n".join(out)
