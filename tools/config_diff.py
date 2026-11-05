# Compare two fit_config.py outputs (lr4_config.json + lr4_config_geometry.bin.gz), e.g. an incremental refresh
# against a full one:
#   python tools/config_diff.py build/config <other dir> [--tol 0.05]
# Fits are compared as positions (mm) at every size in size_builds.SIZES (F @ C), not as raw coefficients - two fits
# can differ in C where the features are collinear and still place every part the same. Meshes: vertex positions.
# Prints the differences and a last line "SAME (within tol)" or "DIFFERENT: n items".
import gzip
import json
import os
import sys

import numpy as np

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJ, "pipeline"))
from fit_config import size_info          # noqa: E402
from size_builds import SIZES             # noqa: E402

F = np.array([size_info(*v)["f"] for v in SIZES.values()])


def load(d):
    cfg = json.load(open(os.path.join(d, "lr4_config.json")))
    return cfg, gzip.decompress(open(os.path.join(d, "lr4_config_geometry.bin.gz"), "rb").read())


def mesh(blob, m):
    return np.frombuffer(blob, dtype="<f4", count=m["pos"][1] * 3, offset=m["pos"][0]).reshape(-1, 3)


def pos_err(c1, c2):
    """Largest position difference (mm) over the sizes between two fits (rows x features)."""
    a, b = np.atleast_2d(np.array(c1, float)), np.atleast_2d(np.array(c2, float))
    if a.shape != b.shape:
        return np.inf
    return float(np.abs(F @ (a - b).T).max())


def main():
    da, db = sys.argv[1], sys.argv[2]
    tol = float(sys.argv[sys.argv.index("--tol") + 1]) if "--tol" in sys.argv else 0.05
    (a, ga), (b, gb) = load(da), load(db)
    out, notes = [], []
    pa = {(p["key"], p.get("struts")): p for p in a["parts"]}
    pb = {(p["key"], p.get("struts")): p for p in b["parts"]}
    for k in sorted(set(pa) - set(pb), key=str):
        out.append(f"part only in A: {k}")
    for k in sorted(set(pb) - set(pa), key=str):
        out.append(f"part only in B: {k}")
    for k in sorted(set(pa) & set(pb), key=str):
        p, q = pa[k], pb[k]
        if p["kind"] != q["kind"] or p.get("family") != q.get("family"):
            out.append(f"part {k}: kind {p['kind']}/{p.get('family')} vs {q['kind']}/{q.get('family')}")
            continue
        e = pos_err(p["C"], q["C"])
        if "clipC" in p or "clipC" in q:
            e = max(e, pos_err(p.get("clipC", [[0]]), q.get("clipC", [[0]])))
        if e > tol:
            out.append(f"part {k}: placed {e:.3f} mm apart")
        if ("mesh" in p) != ("mesh" in q):
            out.append(f"part {k}: mesh in one only")
        elif "mesh" in p:
            ma, mb = mesh(ga, p["mesh"]), mesh(gb, q["mesh"])
            if ma.shape != mb.shape:
                out.append(f"part {k}: mesh {len(ma)} vs {len(mb)} vertices")
            elif len(ma) and np.abs(ma - mb).max() > 1e-4:
                out.append(f"part {k}: mesh vertices differ by {np.abs(ma - mb).max():.4f} mm")
        if p.get("anchor") != q.get("anchor"):        # how it was placed (an incremental fit's guess): a note, not a difference
            notes.append(f"note: part {k}: anchor {p.get('anchor')} vs {q.get('anchor')}")
        for f in ("jp3", "from_temp", "hose_j"):
            if p.get(f) != q.get(f):
                out.append(f"part {k}: {f} {p.get(f)} vs {q.get(f)}")

    def fits(name, x, y):
        x, y = x or {}, y or {}
        for k in sorted(set(x) ^ set(y)):
            out.append(f"{name} {k}: only in {'A' if k in x else 'B'}")
        for k in sorted(set(x) & set(y)):
            if pos_err(x[k], y[k]) > tol:
                out.append(f"{name} {k}: {pos_err(x[k], y[k]):.3f} apart")

    def boms(name, x, y):
        x, y = x or {}, y or {}
        for t in sorted(set(x) | set(y)):
            xt, yt = x.get(t, {}), y.get(t, {})
            for k in sorted(set(xt) ^ set(yt)):
                out.append(f"{name} {t}: row only in {'A' if k in xt else 'B'}: {k}")
            for k in sorted(set(xt) & set(yt)):
                if json.dumps(xt[k], sort_keys=True) != json.dumps(yt[k], sort_keys=True):
                    d = max(abs(u - v) for c in xt[k] for u, v in zip(xt[k][c], yt[k].get(c, [])))
                    if d > 1e-4:
                        out.append(f"{name} {t}: {k}: {xt[k]} vs {yt[k]}")

    def same(name, x, y):
        if json.dumps(x, sort_keys=True) != json.dumps(y, sort_keys=True):
            out.append(f"{name}: differs")

    fits("hose_fit", a.get("hose_fit"), b.get("hose_fit"))
    fits("travel_fit", a.get("travel_fit"), b.get("travel_fit"))
    boms("bom_fit", a.get("bom_fit"), b.get("bom_fit"))
    for f in ("hose", "bom_ref", "n_ref", "nclips_ref", "tip_above_table", "peter_style", "plate_frames", "jp3",
              "features", "ref"):
        same(f, a.get(f), b.get(f))
    ta, tb = a.get("temp") or {}, b.get("temp") or {}
    fits("temp.hose_fit", ta.get("hose_fit"), tb.get("hose_fit"))
    fits("temp.travel_fit", ta.get("travel_fit"), tb.get("travel_fit"))
    boms("temp.bom_fit", ta.get("bom_fit"), tb.get("bom_fit"))
    for f in ("hose", "bom_ref", "nclips_ref", "sizes"):
        same(f"temp.{f}", ta.get(f), tb.get(f))
    print("\n".join(notes + out))
    print("SAME (within tol)" if not out else f"DIFFERENT: {len(out)} items")


if __name__ == "__main__":
    main()
