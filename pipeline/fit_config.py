# Configurator phase 2: from the size builds (size_builds.py -> private/sizes/<tag>/), work out how every part
# moves with the machine's size, check it against every build, and write the page's data:
#   python pipeline/fit_config.py        (plain Python + numpy; no FreeCAD)
# -> web/data/lr4_config.json (parts, rules, fitted coefficients) + lr4_config_geometry.txt (gzip+base64
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
import base64
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
OUT = os.path.join(PROJ, "web", "data")    # the page data
sys.path.insert(0, HERE)
from size_builds import SIZES                       # noqa: E402
sys.path.insert(0, os.path.join(PROJ, "freecad"))
import lr4                                          # noqa: E402  (plain Python: math / os only)

IN = 25.4
XZ_PLATE = 6.5
REF = "ref"
FEATURES = ["1", "TW", "TL", "strut", "pitch", "cutY", "cutX"]   # cutX: belt run reach (travel)
TOL_RIGID = 0.02        # mm: same shape (bbox size; see same_shape)
TOL_FIT = 0.05          # mm: fitted position vs the build
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
                f=np.array([1.0, TW, TL, strut, pitch, cy * IN, cx * IN]))


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


def main():
    built = [t for t in SIZES if os.path.exists(os.path.join(SIZES_DIR, t, "LowRider4", "exports", "web", "lr4_local.json"))]
    # LR4_HOLDOUT=tag,tag: left out of the fit (still summarised for the test) - an out-of-sample check
    hold = set(os.environ.get("LR4_HOLDOUT", "").split(",")) - {""}
    tags = [t for t in built if t not in hold]
    print("sizes:", tags, "held out:", sorted(hold & set(built)))
    infos = {t: size_info(*SIZES[t]) for t in built}
    F_all = np.array([infos[t]["f"] for t in tags])
    print("feature matrix rank", np.linalg.matrix_rank(F_all), "of", F_all.shape[1])
    data = {}
    metas = {}
    for t in built:
        meta_t, parts = load(t)
        json.dump({nm: dict(c=p["c"].tolist(), lo=p["lo"].tolist(), hi=p["hi"].tolist(), n=len(p["pos"]))
                   for nm, p in parts.items()}, open(os.path.join(SIZES_DIR, t, "summary.json"), "w"))
        if t in hold:
            continue
        metas[t] = meta_t
        for name, p in parts.items():
            key, idx, j = key_of(name, parts, infos[t])
            if key is None:
                continue
            data.setdefault(key, {}).setdefault(t, []).append((idx, j, name, p))
        print(f"  {t}: {len(parts)} parts, strut {infos[t]['strut']}, {infos[t]['n']} braces")
    ref_meta, ref_parts = metas[REF], load(REF)[1]

    out_parts, blob, report = [], bytearray(), []
    mesh_of = {}                                     # key -> (ref sample used as the mesh)

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

    for key, by in sorted(data.items()):
        samples = [(t, idx, j, name, p) for t in tags for (idx, j, name, p) in by.get(t, [])]
        # the reference sample (mesh): the ref build's lowest index member, else any size's
        ref_s = sorted([s for s in samples if s[0] == REF], key=lambda s: (s[1] or 0) if (s[1] or 0) >= 0 else -s[1])
        base = ref_s[0] if ref_s else samples[0]
        bp = base[4]
        if key.startswith("StrutPlate_") and "__" not in key:
            kind = "plate"
        else:
            same = all(same_shape(s[4], bp) for s in samples)
            kind = "rigid" if same else "stretch"
        fam = key.startswith("Hose:") or any((s[1] or 0) != 0 for s in samples)   # Brace_1-only parts aren't one
        F = np.array([infos[s[0]]["f"] for s in samples])
        jp3 = key.startswith("Jackpot3")
        shift = np.array([[(s[1] or 0) * infos[s[0]]["pitch"] + (jp3_extra(infos[s[0]]["pitch"]) if jp3 else 0), 0, 0]
                          for s in samples])
        meta = dict(bp["meta"])
        for k_ in ("pos", "idx", "uv", "file", "bytes"):
            meta.pop(k_, None)
        rec = dict(key=key if fam else key.replace("Brace_#", "Brace_1"), kind=kind, meta=meta)
        rec["lo_ref"], rec["hi_ref"] = bp["lo"].round(5).tolist(), bp["hi"].round(5).tolist()
        if jp3:
            rec["jp3"] = True
        if fam:
            rec["family"] = "brace" if not key.startswith("Hose:") else "hose"
        if kind in ("rigid", "plate"):
            Y = np.array([s[4]["c"] for s in samples]) - shift if kind == "rigid" else \
                np.array([s[4]["lo"] for s in samples]) - shift
            C, err = lstsq(F, Y)
            rec["C"] = C.T.round(6).tolist()          # 3 x 6
            rec["c_ref"] = (bp["c"] if kind == "rigid" else bp["lo"]).round(5).tolist()
            if kind == "rigid":
                rec["base_idx"] = base[1] or 0
        else:
            Y = np.hstack([np.array([s[4]["lo"] for s in samples]), np.array([s[4]["hi"] for s in samples])]) \
                - np.hstack([shift, shift])
            C, err = lstsq(F, Y)
            rec["C"] = C.T.round(6).tolist()          # 6 x 6: lo xyz, hi xyz
            rec["lo_ref"], rec["hi_ref"] = bp["lo"].round(5).tolist(), bp["hi"].round(5).tolist()
        if "clip" in meta:                             # belt run: its clip point moves with size too
            P = np.array([s[4]["meta"]["clip"]["p"] for s in samples])
            Cp, errp = lstsq(F, P)
            rec["clipC"] = Cp.T.round(6).tolist()
            err = max(err, errp)
        rec["err"] = round(float(err), 4)
        rec["sizes"] = len(set(s[0] for s in samples))
        if key.startswith("Hose:"):
            rec["hose_j"] = sorted(set(s[2] for s in samples))
        if len(F) < 6 or np.linalg.matrix_rank(F) < 6:
            report.append(f"UNDERDETERMINED {key}: {len(F)} samples, rank {np.linalg.matrix_rank(F)}")
        if err > TOL_FIT:
            report.append(f"FIT {kind} {key}: max error {err:.3f} mm over {rec['sizes']} sizes")
        if kind != "plate" and key != "Y_Clip_last":       # the last clip is drawn with the first's mesh
            rec["mesh"] = add_mesh(bp)
        out_parts.append(rec)

    # Y clips: count rule from build.py, n = ceil((c1 - c0) / 300) + 1 between the first and last
    # hose anchors: every numeric leaf fitted
    hose_fit, hose_ref = {}, None

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
    hose_ref = metas[REF]["hose"]
    for path in hv[REF]:
        if path in HOSE_RULES:                         # picked from parts by build.py: config_model.hose redoes it
            continue
        Y = np.array([hv[t][path] - (jp3_extra(infos[t]["pitch"]) if path in JP3_HOSE else 0) for t in tags])
        if np.ptp(Y) < 1e-6:
            continue
        C, err = lstsq(F_all, Y)
        hose_fit[json.dumps(path)] = C.round(6).tolist()
        if err > TOL_FIT:
            report.append(f"FIT hose {path}: max error {err:.3f}")

    # BOM: the two hardware tables' counts follow the brace and Y clip counts - fitted per row as a + b n + c nc
    # (rows matched by item + joint with the numbers taken out: the first brace named in a joint varies)
    boms = {t: json.load(open(os.path.join(SIZES_DIR, t, "LowRider4", "build", "bom.json"))) for t in tags}
    nclips = {t: sum(1 for q in json.load(open(os.path.join(SIZES_DIR, t, "summary.json"))) if re.match(r"^Y_Clip_\d+$", q))
              for t in tags}
    # only builds whose fastener check is clean: a flagged joint changes the counts (a nut with no seat isn't counted)
    flagged = {t: [r[2] for r in next(q for q in boms[t] if q["title"] == "Hardware: where every fastener goes")["rows"]
                   if str(r[6]).startswith("CHECK")] for t in tags}
    for t, f in flagged.items():
        if f:
            report.append(f"FLAGGED build {t} (pitch {infos[t]['pitch']:.1f} mm, left out of the BOM fit): {'; '.join(f)}")
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
                report.append(f"BOM row not in every build ({len(have)}/{len(btags)}): {title}: {k}")
            Gh = np.array([[1.0, infos[t]["n"], nclips[t]] for t in have])
            fits[k] = {}
            for c in cols:
                Y = np.array([float(rows_by[t][k][c]) for t in have])
                C, err = lstsq(Gh, Y)
                fits[k][c] = C.round(6).tolist()
                if err > 1e-6:
                    report.append(f"BOM count not linear in braces / clips: {title}: {k} col {c} (err {err:.3f})")
        extra = {k for t in btags for k in rows_by[t]} - set(rows_by[REF])
        for k in sorted(extra):
            report.append(f"BOM row missing from the reference build: {title}: {k}")
        bom_fit[title] = fits

    # travel / parked pose: from the build's own numbers at each size
    tv = {}
    for k in ("x", "y", "z"):
        for i in (0, 1):
            Y = np.array([metas[t]["travel"][k][i] for t in tags])
            C, err = lstsq(F_all, Y)
            tv[f"{k}{i}"] = C.round(6).tolist()
            if err > TOL_FIT:
                report.append(f"FIT travel {k}{i}: {err:.3f}")

    os.makedirs(OUT, exist_ok=True)
    gz = gzip.compress(bytes(blob), 9)
    txt = base64.b64encode(gz).decode("ascii")
    open(os.path.join(OUT, "lr4_config_geometry.txt"), "w").write(txt)
    cfg = dict(features=FEATURES, ref=dict(tag=REF, cut_in=list(SIZES[REF]), f=infos[REF]["f"].tolist()),
               verified=dict(sizes={t: SIZES[t] for t in tags},
                             strut=[min(i["strut"] for i in infos.values()), max(i["strut"] for i in infos.values())],
                             braces=[min(i["n"] for i in infos.values()), max(i["n"] for i in infos.values())]),
               parts=out_parts, hose=hose_ref,
               plate_frames=json.load(open(os.path.join(SIZES_DIR, "plate_frames.json"))),   # plate_frames.py, ref
               hose_fit=hose_fit, travel_fit=tv,
               tip_above_table=ref_meta["tip_above_table"], peter_style=ref_meta.get("peter_style"),
               bom_ref=ref_meta.get("bom"), bom_fit=bom_fit, n_ref=infos[REF]["n"], nclips_ref=nclips[REF],
               hose_order=HOSE_ORDER, jp3=dict(shift=JP3_SHIFT_X, a=JP3_A, min_pitch=round(lr4.JP3_MIN_PITCH, 3), hose=sorted(map(list, JP3_HOSE))),
               built=max(time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(os.path.join(
                   SIZES_DIR, t, "LowRider4", "exports", "web", "lr4_local.json")))) for t in tags),   # newest size build
               geometry_chars=len(txt),
               triangles=sum(p["mesh"]["idx"][1] // 3 for p in out_parts if "mesh" in p))
    json.dump(cfg, open(os.path.join(OUT, "lr4_config.json"), "w"), separators=(",", ":"))
    json.dump({t: SIZES[t] for t in built}, open(os.path.join(OUT, "sizes.json"), "w"))   # test_config_model.js
    kinds = {}
    for p in out_parts:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    print(f"parts {len(out_parts)} {kinds}; geometry {len(txt) / 1e6:.2f} MB text; "
          f"{cfg['triangles']} triangles; hose leaves fitted {len(hose_fit)}")
    print("stretch:", ", ".join(p["key"] for p in out_parts if p["kind"] == "stretch"))
    print("worst fits:", ", ".join(f"{p['key']} {p['err']}" for p in sorted(out_parts, key=lambda p: -p["err"])[:8]))
    print("\n".join(report) if report else "report: all fits within tolerance")


if __name__ == "__main__":
    main()
