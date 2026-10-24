# Configurator phase 2: from the size builds (size_builds.py -> private/sizes/<tag>/), work out how every part
# moves with the machine's size, check it against every build, and write the page's data:
#   python pipeline/fit_config.py        (plain Python + numpy; no FreeCAD)
# -> build/config/lr4_config.json (parts, rules, fitted coefficients + lr4_config_geometry.bin.gz (gzip
#    of each mesh once, at the reference size), and a report of anything that doesn't fit.
#
# Size features (all computable in the page from the cut area): f = [1, TW, TL, strut, pitch, cutY]
#   TW, TL: the table (calculator footprint + 1 in a side, rounded up to whole inches - build.py)
#   strut: calculator strut length; pitch: brace pitch; cutY: cut area along Y (the parked gantry is Y_POS of it)
# Part kinds:
#   rigid   - same shape at every size: bbox centre = C . f
#   family  - one per brace (braces, their strut plate fasteners, hose holders): centre - idx * pitch * X = C . f
#   yclip   - Y rail clips: first / last fitted, the rest spaced evenly between (build.py's rule, <= 300 mm)
#   stretch - rails, belt runs, table (and anything else that changes shape): bbox min / max per axis = C . f,
#             the page maps the reference mesh onto it per axis
#   plate   - strut plates: drawn by the page from the JS generator; their frame's translation = C . f
# Temp struts (build.py STRUTS = "temp", the <tag>_temp builds when they exist): the end braces sit 180 mm from the
#   next, so families shift by the brace offsets (lr4.brace_offsets) rather than idx * pitch. A part placed the same
#   by both is one rec; otherwise one per variant, tagged "struts": "mdf" / "temp". cfg.temp has the temp hose / BOM /
#   travel fits.
import gzip
import json
import math
import os
import re
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
SIZES_DIR = os.path.join(PROJ, "private", "sizes")    # = lr4.SIZES_DIR
OUT = os.path.join(PROJ, "build", "config")    # with V1E meshes: share_data.py's input + the tests' reference
sys.path.insert(0, HERE)
from size_builds import SIZES                       # noqa: E402
sys.path.insert(0, os.path.join(PROJ, "freecad"))
import lr4                                          # noqa: E402  (plain Python: math / os only)

IN = 25.4
XZ_PLATE = 6.5
REF = "ref"
TEMP = "_temp"          # size_builds.py --temp: the STRUTS = "temp" builds in private/sizes/<tag>_temp
FEATURES = ["1", "TW", "TL", "strut", "pitch", "cutY", "cutX"]   # cutX: belt run reach (travel)
TOL_RIGID = 0.02        # mm: same shape (bbox size; see same_shape)
TOL_FIT = 0.05          # mm: fitted position vs the build
# Changes that don't depend on size, so only the ref build needs re-running (not all 25):
# ANCHORED: parts fixed to a fitted part: placed by that part's fit + their ref offset (temp builds included)
# REF_SHAPE: a reshaped part whose centre didn't move: rigid, its mesh from the ref build, older builds' centres still fit
ANCHORED = (("TouchPlate", "Core"),    # touch plate (reshaped, angled), its connector, magnet + BU-45 clip (2026-10-24)
            ("Dust_Shoe_Kobalt__", "Core"),   # the dust shoe's slot screw (2026-10-24)
            # belt ends looped round their M3s (2026-10-24): each loop on its holder
            ("Belt_Y_Min_Front_Loop", "Y_Belt_Min_Lock"), ("Belt_Y_Min_Back_Loop", "Y_Belt_Min_Tension"),
            ("Belt_Y_Max_Front_Loop", "Y_Belt_Max_Lock"), ("Belt_Y_Max_Back_Loop", "Y_Belt_Max_Tension"),
            ("Belt_X_Min_Loop", "XZ_Plate_Min"), ("Belt_X_Max_Loop", "X_Belt"),
            ("Brace_#__XLoop1", "XZ_Plate_Min"),  # the X Min loop's M3, moved into Z_Stub_Min's slot (named after Brace_1)
            ("X_Belt__XLoop1", "X_Belt"),          # the X Max loop's M3, moved into the tensioner's pocket
            ("Bearing_FrontWheel_Min", "FrontWheel_Min"), ("Bearing_BackWheel_Min", "BackWheel_Min"))   # centred
REF_SHAPE = ("Router_Nut",)            # round -> hex ER11 nut (2026-10-24)
# OLD_REF: changed in the ref build by work the other builds don't have yet: fitted without the ref build
OLD_REF = ("TableMDF",                            # Part 33's table (the page draws the table itself; the rec stays as was)
           "Belt_X_Min", "Belt_X_Max")            # X runs now stop 2.9 short of their loop screws (the loops overlap them)
# merged screws -> one part per screw, named after the part it holds (nearest in XY): name -> (owners, label)
SPLIT = {
    "TableMDF__Screws": (r"^(Y_Clip_\d+|Y_Belt_(Min|Max)[FB])$", "Screw"),
    "Belt_X_Loops__M3": (r"^(X_Belt|Brace_1)$", "XLoop"),
    "Belt_Y_Loops__M3": (r"^Y_Belt_(Min|Max)_(Lock|Tension)$", "YLoop"),
}
LOCAL_ONLY = ("Jackpot3_Board_", "Jackpot3_PCB", "Jackpot3_Silk")
# hose anchors build.py picks from discrete parts (the first tray holder past the Jackpot lid, the Min-end clamp, the
# middle brace): config_model.js hose() computes these from the instances instead of a fit
# Jackpot3 box: build.py shifts it JP3_SHIFT_X from its bay centre, less when the bay is short (lr4.jp3_shift - a
# clamp, not linear in f): the extra X is taken out before fitting and config_model.js adds it back
JP3_SHIFT_X = float(re.search(r"^JP3_SHIFT_X = (-?[\d.]+)", open(os.path.join(PROJ, "freecad", "build.py"), encoding="utf-8").read(),
                              re.M).group(1))
JP3_A = lr4.jp3_shift(0.0, -math.inf)               # the rule: shift = max(JP3_SHIFT_X, JP3_A - pitch / 2)
JP3_HOSE = {("bump", 0), ("bump", 1), ("sleeve", "exit", "p", 0)}   # hose anchors that ride with the box (X)


def jp3_extra(pitch):
    return lr4.jp3_shift(pitch, JP3_SHIFT_X) - JP3_SHIFT_X


HOSE_RULES = {("bump_next",), ("clamp_x",), ("run",), ("sleeve", "exit", "x")}
HOSE_ORDER = ("Hose_Holder_Hook", "Hose_Holder_Hook", "hose_holder_shorty", "Hose_Hook_70", "hose_holder_shorty")
HOSE_TYPE = {"Hose_Holder_Hook": "Hook", "Hose_Holder_Shorty": "Shorty", "Hose_Hook_70": "Hook70"}


def size_info(cx, cy):
    strut = math.ceil(cx * IN + 169)
    n = math.floor((strut - 18) / 183) + 1
    pitch = (strut - 18) / (n - 1)
    xtable, ytable = strut + 2 * XZ_PLATE + 110, cy * IN + 313
    TW = math.ceil(xtable / IN + 2) * IN
    TL = math.ceil(ytable / IN + 2) * IN
    return dict(strut=strut, n=n, pitch=pitch, TW=TW, TL=TL, cutY=cy * IN, cutX=cx * IN,
                f=np.array([1.0, TW, TL, strut, pitch, cy * IN, cx * IN]), bx=lr4.brace_offsets(strut, n),
                bx_temp=lr4.brace_offsets(strut, n, True) if n >= 4 else None)


def load(tag):
    d = os.path.join(SIZES_DIR, tag, "LowRider4", "exports", "web")
    meta = json.load(open(os.path.join(d, "lr4_local.json")))
    parts = {}
    for p in meta["parts"]:
        if p["name"].startswith(LOCAL_ONLY):
            continue
        buf = open(os.path.join(d, p["file"]), "rb").read()
        pos = np.frombuffer(buf, dtype="<f4", count=p["pos"][1] * 3, offset=p["pos"][0]).reshape(-1, 3).astype(float)
        parts[p["name"]] = dict(meta=p, pos=pos, buf=buf, c=(pos.min(axis=0) + pos.max(axis=0)) / 2, lo=pos.min(axis=0),
                                hi=pos.max(axis=0))
    for nm, (owners, label) in SPLIT.items():
        for suffix in ("", "~thread"):
            if nm + suffix in parts:
                split_screws(parts, nm, suffix, owners, label)
    return meta, parts


def part_from(meta, pos, uv, tris):
    """A part dict in export_web's byte layout (positions [+ uv] + indices) for an extracted piece."""
    buf = bytearray(pos.astype("<f4").tobytes())
    m = dict(meta, pos=[0, len(pos)])
    if uv is not None:
        m["uv"] = len(buf)
        buf += uv.astype("<f4").tobytes()
    wide = len(pos) > 65535
    m["idx"] = [len(buf), tris.size, 32 if wide else 16]
    buf += tris.astype("<u4" if wide else "<u2").tobytes()
    while len(buf) % 4:
        buf += bytes(1)
    return dict(meta=m, pos=pos, buf=bytes(buf), c=(pos.min(axis=0) + pos.max(axis=0)) / 2, lo=pos.min(axis=0),
                hi=pos.max(axis=0))


def split_screws(parts, nm, suffix, owner_re, label):
    """One merged fastener part -> one part per screw, named after the part it holds down (nearest in XY):
    Y_Clip_<k>__Screw (repeats with the clips) or <holder>__Screw<j>."""
    p = parts.pop(nm + suffix)
    mt, buf = p["meta"], p["buf"]
    n, w = mt["idx"][1], mt["idx"][2]
    tris = np.frombuffer(buf, dtype="<u4" if w == 32 else "<u2", count=n, offset=mt["idx"][0]).reshape(-1, 3)
    uv = np.frombuffer(buf, dtype="<f4", count=len(p["pos"]) * 2, offset=mt["uv"]).reshape(-1, 2) if "uv" in mt else None
    par = np.arange(len(p["pos"]))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    for t in tris:
        r = find(t[0])
        for q in t[1:]:
            par[find(q)] = r
    roots = np.array([find(i) for i in range(len(par))])
    owners = [q for q in parts if re.match(owner_re, q)]
    found = {}
    for r in np.unique(roots):
        vi = np.nonzero(roots == r)[0]
        remap = -np.ones(len(par), dtype=int)
        remap[vi] = np.arange(len(vi))
        ti = tris[np.all(np.isin(tris, vi), axis=1)]
        piece = part_from(mt, p["pos"][vi], None if uv is None else uv[vi], remap[ti])
        own = min(owners, key=lambda q: np.hypot(*(parts[q]["c"][:2] - piece["c"][:2])))
        found.setdefault(own, []).append(piece)
    for own, pcs in found.items():
        pcs.sort(key=lambda q: (round(q["c"][0], 1), round(q["c"][1], 1)))
        for j, piece in enumerate(pcs):
            name = f"{own}__{label}{suffix}" if own.startswith("Y_Clip") else f"{own}__{label}{j + 1}{suffix}"
            piece["meta"]["name"] = name
            parts[name] = piece


def key_of(name, parts, info):
    """Stable key across sizes: (key, family index or None)."""
    m = re.match(r"^(Hose_Holder_Hook|Hose_Holder_Shorty|Hose_Hook_70)_\d+(.*)$", name)
    if m:                                           # which brace it hangs on, counted from the Max end
        x = parts[name]["c"][0]
        bx = [(abs(parts[b]["c"][0] - x), i) for i, b in enumerate(
            [f"Brace_{i + 1}" for i in range(info["n"] - 1)] + ["Brace_Max"])]
        i = min(bx)[1]
        return f"Hose:{HOSE_TYPE[m.group(1)]}{m.group(2)}", -(info["n"] - 1 - i), info["n"] - 1 - i
    m = re.match(r"^Y_Clip_(\d+)(.*)$", name)
    if m:
        k = int(m.group(1))
        nc = sum(1 for q in parts if re.match(r"^Y_Clip_\d+$", q))
        if k == 1:
            return "Y_Clip_first" + m.group(2), None, None
        if k == nc:
            return "Y_Clip_last" + m.group(2), None, None
        return None, None, None                     # in between: the page spaces them
    m = re.match(r"^Temp_Strut_.*Brace_(\d+)", name)
    if m:                                           # temp strut screws: only on the two braces at each end
        last = int(m.group(1)) == info["n"] - 1     # Brace_{n-1} (the Max strut's inner brace) -> "Brace_last"
        return (name[:m.start(1) - 6] + "Brace_last" + name[m.end(1):] if last else name), None, None
    m = re.search(r"Brace_(\d+)", name)
    if m:
        return name[:m.start()] + "Brace_#" + name[m.end():], int(m.group(1)) - 1, None
    return name, None, None


def same_shape(p, q):
    """Same shape, only moved: the bounding box has the same size and the vertex count agrees within 1% (FreeCAD
    re-tessellates a moved solid; STLs cut again can differ by a few triangles). Positions use the bbox centre."""
    return abs(len(p["pos"]) - len(q["pos"])) <= 0.01 * len(q["pos"]) and         np.abs((p["hi"] - p["lo"]) - (q["hi"] - q["lo"])).max() <= TOL_RIGID


def lstsq(F, Y):
    C, *_ = np.linalg.lstsq(F, Y, rcond=None)
    return C, np.abs(F @ C - Y).max() if len(Y) else 0.0


def offset(info, idx, temp=False):
    """Brace idx's X offset from brace 0 (lr4.brace_offsets; = config_model.js braceOffset): idx < 0 counts back
    from Brace_Max (the hose holders)."""
    bx = info["bx_temp" if temp else "bx"]
    return bx[idx] if idx >= 0 else bx[info["n"] - 1 + idx] - bx[info["n"] - 1]


def bay0(info, temp=False):
    bx = info["bx_temp" if temp else "bx"]
    return bx[1] - bx[0]


def collect(tags, suffix, infos, hold):
    """Load the size builds <tag><suffix>: (fitted tags, metas, data[key][tag] = [(idx, j, name, part)])."""
    data, metas, fitted = {}, {}, []
    for t in tags:
        meta_t, parts = load(t + suffix)
        json.dump({nm: dict(c=p["c"].tolist(), lo=p["lo"].tolist(), hi=p["hi"].tolist(), n=len(p["pos"]))
                   for nm, p in parts.items()}, open(os.path.join(SIZES_DIR, t + suffix, "summary.json"), "w"))
        if t in hold:
            continue
        fitted.append(t)
        metas[t] = meta_t
        for name, p in parts.items():
            key, idx, j = key_of(name, parts, infos[t])
            if key is None:
                continue
            data.setdefault(key, {}).setdefault(t, []).append((idx, j, name, p))
        print(f"  {t + suffix}: {len(parts)} parts, strut {infos[t]['strut']}, {infos[t]['n']} braces")
    return fitted, metas, data


def fit_key(key, samples, infos, temp=False, C_given=None, given=None):
    """Fit one key over its samples [(tag, idx, j, name, part)] -> (rec without mesh, base sample, error). C_given:
    only measure how well those coefficients place these samples (the shared / per-variant decision); given = the
    rec they come from (its kind, and its clip point fit)."""
    base = sorted([s for s in samples if s[0] == REF], key=lambda s: (s[1] or 0) if (s[1] or 0) >= 0 else -s[1])
    base = base[0] if base else samples[0]
    bp = base[4]
    if given is not None:
        kind = given["kind"]
    elif key.startswith("StrutPlate_") and "__" not in key:
        kind = "plate"
    elif key in REF_SHAPE:
        kind = "rigid"
    else:
        kind = "rigid" if all(same_shape(s[4], bp) for s in samples) else "stretch"
    fam = key.startswith("Hose:") or any((s[1] or 0) != 0 for s in samples)   # Brace_1-only parts aren't one
    F = np.array([infos[s[0]]["f"] for s in samples])
    jp3 = key.startswith("Jackpot3")
    shift = np.array([[offset(infos[s[0]], s[1] or 0, temp) + (jp3_extra(bay0(infos[s[0]], temp)) if jp3 else 0), 0, 0]
                      for s in samples])
    if kind in ("rigid", "plate"):
        Y = np.array([s[4]["c" if kind == "rigid" else "lo"] for s in samples]) - shift
    else:
        Y = np.hstack([np.array([s[4]["lo"] for s in samples]), np.array([s[4]["hi"] for s in samples])]) \
            - np.hstack([shift, shift])
    if C_given is not None:
        err = float(np.abs(F @ np.array(C_given).T - Y).max())
        if given is not None and "clipC" in given:
            P = np.array([s[4]["meta"]["clip"]["p"] for s in samples])
            err = max(err, float(np.abs(F @ np.array(given["clipC"]).T - P).max()))
        return None, base, err
    meta = dict(bp["meta"])
    for k_ in ("pos", "idx", "uv", "file", "bytes"):
        meta.pop(k_, None)
    rec = dict(key=key if fam else key.replace("Brace_#", "Brace_1"), kind=kind, meta=meta)
    rec["lo_ref"], rec["hi_ref"] = bp["lo"].round(5).tolist(), bp["hi"].round(5).tolist()
    if jp3:
        rec["jp3"] = True
    if fam:
        rec["family"] = "brace" if not key.startswith("Hose:") else "hose"
    C, err = lstsq(F, Y)
    rec["C"] = C.T.round(6).tolist()                  # rigid / plate 3 x f; stretch 6 x f: lo xyz, hi xyz
    if kind in ("rigid", "plate"):
        rec["c_ref"] = (bp["c"] if kind == "rigid" else bp["lo"]).round(5).tolist()
        if kind == "rigid":
            rec["base_idx"] = base[1] or 0
    if "clip" in meta:                                 # belt run: its clip point moves with size too
        P = np.array([s[4]["meta"]["clip"]["p"] for s in samples])
        Cp, errp = lstsq(F, P)
        rec["clipC"] = Cp.T.round(6).tolist()
        err = max(err, errp)
    rec["err"] = round(float(err), 4)
    rec["sizes"] = len(set(s[0] for s in samples))
    if key.startswith("Hose:"):
        rec["hose_j"] = sorted(set(s[2] for s in samples))
    return rec, base, err


def hose_fits(tags, metas, infos, F_all, report, temp=False, label="hose"):
    """Every numeric leaf of the hose anchors fitted (except the ones build.py picks from parts)."""
    def leaves(v, path=()):
        if isinstance(v, bool) or v is None or isinstance(v, str):
            return
        if isinstance(v, (int, float)):
            yield path, float(v)
        elif isinstance(v, list):
            for i, x in enumerate(v):
                yield from leaves(x, path + (i,))
        elif isinstance(v, dict):
            for k, x in v.items():
                yield from leaves(x, path + (k,))
    hv = {t: dict(leaves(metas[t]["hose"])) for t in tags}
    fit = {}
    for path in hv[REF]:
        if path in HOSE_RULES:                         # picked from parts by build.py: config_model.hose redoes it
            continue
        Y = np.array([hv[t][path] - (jp3_extra(bay0(infos[t], temp)) if path in JP3_HOSE else 0) for t in tags])
        if np.ptp(Y) < 1e-6:
            continue
        C, err = lstsq(F_all, Y)
        if err > TOL_FIT and REF in tags and len(tags) > 7:   # a size-independent change only in the ref build
            r = tags.index(REF)                        # (e.g. the hose OD, 2026-10-24): the others' fit, moved to
            keep = [i for i in range(len(tags)) if i != r]   # pass through the ref's value
            Co, erro = lstsq(F_all[keep], Y[keep])
            if erro <= TOL_FIT:
                Co[0] += Y[r] - F_all[r] @ Co
                C, err = Co, erro
        fit[json.dumps(path)] = C.round(6).tolist()
        if err > TOL_FIT:
            report.append(f"FIT {label} {path}: max error {err:.3f}")
    return fit


def bom_fits(tags, suffix, infos, report):
    """The two hardware tables' counts follow the brace and Y clip counts - fitted per row as a + b n + c nc
    (rows matched by item + joint with the numbers taken out: the first brace named in a joint varies)."""
    boms = {t: json.load(open(os.path.join(SIZES_DIR, t + suffix, "LowRider4", "build", "bom.json"))) for t in tags}
    nclips = {t: sum(1 for q in json.load(open(os.path.join(SIZES_DIR, t + suffix, "summary.json")))
                     if re.match(r"^Y_Clip_\d+$", q)) for t in tags}
    # only builds whose fastener check is clean: a flagged joint changes the counts (a nut with no seat isn't counted)
    flagged = {t: [r[2] for r in next(q for q in boms[t] if q["title"] == "Hardware: where every fastener goes")["rows"]
                   if str(r[6]).startswith("CHECK")] for t in tags}
    for t, f in flagged.items():
        if f:
            report.append(f"FLAGGED build {t + suffix} (pitch {infos[t]['pitch']:.1f} mm, left out of the BOM fit): "
                          f"{'; '.join(f)}")
    btags = [t for t in tags if not flagged[t]]
    bom_fit = {}
    for title, cols in (("Hardware: V1E kit vs this build", (1, 2)), ("Hardware: where every fastener goes", (0,))):
        keyf = (lambda r: r[3]) if title.startswith("Hardware: V1E") else \
            (lambda r: [r[1], re.sub(r"\d+", "#", r[2].replace("Brace Max", "Brace 0")), r[5]])   # = config_model.js bom()
        def keyed(rows):                               # repeated keys numbered in order: key|0, key|1, ...
            out, seen = {}, {}
            for r in rows:
                k = json.dumps(keyf(r), separators=(",", ":"), ensure_ascii=False)
                seen[k] = seen.get(k, -1) + 1
                out[f"{k}|{seen[k]}"] = r
            return out
        rows_by = {t: keyed(next(q for q in boms[t] if q["title"] == title)["rows"]) for t in btags}
        fits = {}
        for k in rows_by[REF]:
            have = [t for t in btags if k in rows_by[t]]
            if len(have) < len(btags):
                report.append(f"BOM{suffix} row not in every build ({len(have)}/{len(btags)}): {title}: {k}")
            Gh = np.array([[1.0, infos[t]["n"], nclips[t]] for t in have])
            fits[k] = {}
            for c in cols:
                Y = np.array([float(rows_by[t][k][c]) for t in have])
                C, err = lstsq(Gh, Y)
                fits[k][c] = C.round(6).tolist()
                if err > 1e-6:
                    report.append(f"BOM{suffix} count not linear in braces / clips: {title}: {k} col {c} (err {err:.3f})")
        extra = {k for t in btags for k in rows_by[t]} - set(rows_by[REF])
        for k in sorted(extra):
            report.append(f"BOM{suffix} row missing from the reference build: {title}: {k}")
        bom_fit[title] = fits
    return bom_fit, nclips[REF]


def travel_fits(tags, metas, F_all, report, label="travel"):
    tv = {}
    for k in ("x", "y", "z"):
        for i in (0, 1):
            Y = np.array([metas[t]["travel"][k][i] for t in tags])
            C, err = lstsq(F_all, Y)
            tv[f"{k}{i}"] = C.round(6).tolist()
            if err > TOL_FIT:
                report.append(f"FIT {label} {k}{i}: {err:.3f}")
    return tv


def main():
    built = [t for t in SIZES if os.path.exists(os.path.join(SIZES_DIR, t, "LowRider4", "exports", "web", "lr4_local.json"))]
    built_t = [t for t in built if os.path.exists(os.path.join(SIZES_DIR, t + TEMP, "LowRider4", "exports", "web",
                                                               "lr4_local.json"))]
    # LR4_HOLDOUT=tag,tag: left out of the fit (still summarised for the test) - an out-of-sample check
    hold = set(os.environ.get("LR4_HOLDOUT", "").split(",")) - {""}
    print("sizes:", [t for t in built if t not in hold], "held out:", sorted(hold & set(built)),
          "temp struts:", [t for t in built_t if t not in hold])
    infos = {t: size_info(*SIZES[t]) for t in built}
    tags, metas, data = collect(built, "", infos, hold)
    tags_t, metas_t, data_t = collect(built_t, TEMP, infos, hold) if REF in built_t else ([], {}, {})
    F_all = np.array([infos[t]["f"] for t in tags])
    print("feature matrix rank", np.linalg.matrix_rank(F_all), "of", F_all.shape[1])
    ref_meta = metas[REF]

    out_parts, blob, report = [], bytearray(), []

    def add_mesh(p):
        """The part's bytes (positions [+ uv] + indices), as export_web laid them out; offsets rebased."""
        mt = p["meta"]
        a = mt["pos"][0]
        off = len(blob)
        blob.extend(p["buf"][a:])
        if len(blob) % 4:
            blob.extend(b"\0" * (4 - len(blob) % 4))
        q = dict(pos=[mt["pos"][0] - a + off, mt["pos"][1]], idx=[mt["idx"][0] - a + off] + mt["idx"][1:])
        if "uv" in mt:
            q["uv"] = mt["uv"] - a + off
        return q

    def check(rec, key, samples):
        F = np.array([infos[s[0]]["f"] for s in samples])
        if rec.get("anchor"):                            # placed by its anchor's fit (ANCHORED)
            return
        if len(F) < 6 or np.linalg.matrix_rank(F) < 6:
            report.append(f"UNDERDETERMINED {key}{' (temp)' if rec.get('struts') == 'temp' else ''}: {len(F)} samples, "
                          f"rank {np.linalg.matrix_rank(F)}")
        if rec["err"] > TOL_FIT:
            report.append(f"FIT {rec['kind']} {key}{' (temp)' if rec.get('struts') == 'temp' else ''}: max error "
                          f"{rec['err']:.3f} mm over {rec['sizes']} sizes")

    # MDF plates and temp struts (STRUTS = "temp" builds, <tag>_temp): a key placed the same way by both is one part;
    # otherwise one rec per variant ("struts": "mdf" / "temp"; the page draws the set for its toggle). A temp rec of
    # the same shape reuses the MDF rec's mesh (its refs are that mesh's).
    n_shared = n_split = 0
    anchored = lambda k: any(k.startswith(pre) for pre, _ in ANCHORED)
    for key in sorted(set(data) | set(data_t), key=lambda k: (anchored(k), k)):   # anchored last: after their anchors
        sm = [(t, idx, j, name, p) for t in tags for (idx, j, name, p) in data.get(key, {}).get(t, [])]
        st = [(t, idx, j, name, p) for t in tags_t for (idx, j, name, p) in data_t.get(key, {}).get(t, [])]
        anchor = next((a for pre, a in ANCHORED if key.startswith(pre)), None)
        if anchor:
            sm, st = [s for s in sm if s[0] == REF], []
        elif key in OLD_REF:
            sm = [s for s in sm if s[0] != REF]
        elif sm and len(tags) > 1 and {s[0] for s in sm} == {REF} and not st:
            # only in a ref build newer than the rest (e.g. Part 33's table parts, which the page draws itself): left
            # out, as before that build - re-run all the size builds to fit them
            report.append(f"REF ONLY (left out; re-run the size builds): {key}")
            continue
        rec_m = base_m = rec_t = base_t = None
        if sm:
            rec_m, base_m, _ = fit_key(key, sm, infos)
        if rec_m and anchor:                             # the anchor's fit, shifted by the ref offset
            ar = next(r for r in out_parts if r["key"] == anchor and r.get("struts") != "temp")
            C = np.array(ar["C"])
            C[:, 0] += np.array(rec_m["c_ref"]) - C @ infos[REF]["f"]
            rec_m.update(kind="rigid", C=C.round(6).tolist(), err=ar["err"], sizes=ar["sizes"], anchor=anchor)
        if st:
            rec_t, base_t, _ = fit_key(key, st, infos, temp=True)
        if rec_m and rec_t:
            # one rec if the MDF one (its kind: a stretch rec also covers a rigid one) places the temp builds too
            same = rec_m.get("family") == rec_t.get("family") and \
                (same_shape(base_m[4], base_t[4]) or key in REF_SHAPE) and \
                (rec_m["kind"] == rec_t["kind"] or rec_m["kind"] == "stretch")
            err = fit_key(key, st, infos, temp=True, C_given=rec_m["C"], given=rec_m)[2] if same and \
                rec_m["kind"] != "plate" else math.inf
            if err <= TOL_FIT or (err <= max(rec_m["err"], rec_t["err"]) + 1e-6):
                rec_m["err"] = round(max(rec_m["err"], err), 4)
                rec_t = None
                n_shared += 1
            else:
                rec_m["struts"], rec_t["struts"] = "mdf", "temp"
                n_split += 1
                if same:                                 # same mesh: refer to the MDF one
                    for k_ in ("lo_ref", "hi_ref", "c_ref", "meta"):
                        if k_ in rec_m:
                            rec_t[k_] = rec_m[k_]
                    rec_t["mesh_of"] = key
        elif rec_m and tags_t and not anchor:
            rec_m["struts"] = "mdf"
        elif rec_t:
            rec_t["struts"] = "temp"
        for rec, base, samples in ((rec_m, base_m, sm), (rec_t, base_t, st)):
            if rec is None:
                continue
            check(rec, key, samples)
            if rec.get("mesh_of"):
                rec["mesh"] = rec_m["mesh"]
                del rec["mesh_of"]
            elif rec["kind"] != "plate" and key != "Y_Clip_last":   # the last clip is drawn with the first's mesh
                rec["mesh"] = add_mesh(base[4])
                if rec.get("struts") == "temp":
                    rec["from_temp"] = True                     # share_data.py: its source frame is the temp build's
            out_parts.append(rec)
    if tags_t:
        print(f"temp struts: {n_shared} parts shared, {n_split} placed differently, "
              f"{sum(1 for p in out_parts if p.get('struts') == 'temp')} temp-only recs in all")

    hose_fit = hose_fits(tags, metas, infos, F_all, report)
    bom_fit, nclips_ref = bom_fits(tags, "", infos, report)
    tv = travel_fits(tags, metas, F_all, report)
    temp = None
    if tags_t:
        F_t = np.array([infos[t]["f"] for t in tags_t])
        bom_t, nclips_t = bom_fits(tags_t, TEMP, infos, report)
        temp = dict(hose=metas_t[REF]["hose"], hose_fit=hose_fits(tags_t, metas_t, infos, F_t, report, True, "hose (temp)"),
                    bom_ref=metas_t[REF].get("bom"), bom_fit=bom_t, nclips_ref=nclips_t,
                    travel_fit=travel_fits(tags_t, metas_t, F_t, report, "travel (temp)"),
                    pitch=lr4.TEMP_STRUT_PITCH, min_braces=4, sizes=tags_t)

    os.makedirs(OUT, exist_ok=True)
    gz = gzip.compress(bytes(blob), 9)
    open(os.path.join(OUT, "lr4_config_geometry.bin.gz"), "wb").write(gz)
    cfg = dict(features=FEATURES, ref=dict(tag=REF, cut_in=list(SIZES[REF]), f=infos[REF]["f"].tolist()),
               verified=dict(sizes={t: SIZES[t] for t in tags},
                             strut=[min(i["strut"] for i in infos.values()), max(i["strut"] for i in infos.values())],
                             braces=[min(i["n"] for i in infos.values()), max(i["n"] for i in infos.values())]),
               parts=out_parts, hose=metas[REF]["hose"],
               plate_frames=json.load(open(os.path.join(SIZES_DIR, "plate_frames.json"))),   # plate_frames.py, ref
               hose_fit=hose_fit, travel_fit=tv,
               tip_above_table=ref_meta["tip_above_table"], peter_style=ref_meta.get("peter_style"),
               bom_ref=ref_meta.get("bom"), bom_fit=bom_fit, n_ref=infos[REF]["n"], nclips_ref=nclips_ref,
               hose_order=HOSE_ORDER, jp3=dict(shift=JP3_SHIFT_X, a=JP3_A, min_pitch=round(lr4.JP3_MIN_PITCH, 3), hose=sorted(map(list, JP3_HOSE))),
               temp=temp,
               built=max(time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(os.path.join(
                   SIZES_DIR, t, "LowRider4", "exports", "web", "lr4_local.json")))) for t in tags),   # newest size build
               geometry_bytes=len(gz),
               triangles=sum(p["mesh"]["idx"][1] // 3 for p in out_parts if "mesh" in p and p.get("struts") != "temp"))
    json.dump(cfg, open(os.path.join(OUT, "lr4_config.json"), "w"), separators=(",", ":"))
    json.dump({t: SIZES[t] for t in built}, open(os.path.join(OUT, "sizes.json"), "w"))   # test_config_model.js
    json.dump([t for t in built_t], open(os.path.join(OUT, "sizes_temp.json"), "w"))
    kinds = {}
    for p in out_parts:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    print(f"parts {len(out_parts)} {kinds}; geometry {len(blob) / 1e6:.2f} MB ({len(gz) / 1e6:.2f} MB gz); "
          f"{cfg['triangles']} triangles; hose leaves fitted {len(hose_fit)}")
    print("stretch:", ", ".join(p["key"] for p in out_parts if p["kind"] == "stretch"))
    print("worst fits:", ", ".join(f"{p['key']} {p['err']}" for p in sorted(out_parts, key=lambda p: -p["err"])[:8]))
    print("\n".join(report) if report else "report: all fits within tolerance")


if __name__ == "__main__":
    main()
