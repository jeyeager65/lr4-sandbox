# Share step: the configurator's page data without any V1E / Printables geometry. Each part whose mesh came from a
# downloaded file (printed STLs, XZ plate DXFs, Peter Plates, bristles) loses its mesh and gets `src` instead - the
# file, its SHA-256 and the 3x4 A (file coordinates -> the reference build's machine coordinates, where the mesh sat),
# so the page places the user's own copy exactly where the mesh was. Our meshes (hardware, strut plates, table, bolts)
# stay. Plain Python (numpy).
#   python pipeline/share_data.py
# in : build/config/lr4_config.json + lr4_config_geometry.bin.gz (fit_config.py), private/sizes/source_frames.json
#      (source_frames.py), parts/manifest.json, build/fasteners.json (the reference build's hardware.py: each bolt mesh
#      gets meta.fast = [[qty, item], ...] incl. nuts and meta.joins = the parts it passes through - the page's inspect
#      view lists and pulls in from them, Part 27)
# out: web/data/lr4_config.json + lr4_config_geometry.bin.gz (what the page loads; same layout as the private data) - the
#      tests/test_share.py check rebuilds every src part from parts/ and compares it with the private meshes.
# src kinds: stl {file, sha256, A}; dxf {.., depth: extrusion along the DXF's z, before A}; peter {open: {.., piece:
# connected component by ZMax, highest first}, closed: {..}} (the "~honeycomb" alternates are dropped - part 6 builds
# them from the user's DXFs); bent {file, sha256, A, path, along, height, across, z0, start, scale, reverse} (the bristles: mesh.bend_strip's
# arguments - the page bends the user's flat strip along the groove path, then A).
import gzip
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
DATA = os.path.join(PROJ, "build", "config")    # fit_config.py's output (with V1E meshes)
OUT = os.path.join(PROJ, "web", "data")         # the page data (local and public)
FRAMES = os.path.join(PROJ, "private", "sizes", "source_frames.json")
FRAMES_TEMP = os.path.join(PROJ, "private", "sizes", "source_frames_temp.json")   # source_frames.py LR4_TEMP=1
MANIFEST = os.path.join(PROJ, "parts", "manifest.json")
FASTENERS = os.path.join(PROJ, "build", "fasteners.json")


def fastener_meta(path, recs):
    """bolt mesh name -> {fast: [[qty, item], ...] (screws then nuts, by count), joins: [part names, chain order]}.
    A screw set the export split into pieces (Belt_X_Loops__M3 -> Brace_1__XLoop1 + X_Belt__XLoop1; their threads'
    `of` names the set) gives each fastener to the piece whose box holds its seat."""
    pieces = {}                                   # set name -> [(piece name, lo, hi)]
    box = {r["meta"]["name"]: (r.get("lo_ref"), r.get("hi_ref")) for r in recs}
    for r in recs:
        m = r["meta"]
        if m.get("of") and m["name"].endswith("~thread") and m["of"] != m["name"][:-7]:
            pc = m["name"][:-7]
            pieces.setdefault(m["of"], []).append((pc,) + box.get(pc, (None, None)))

    def piece(f):
        obj = f["obj"].replace(".", "_")          # Endstop_X__M2.5_to_Core -> the mesh's Endstop_X__M2_5_to_Core
        if obj not in pieces:
            return obj
        sd = np.array(f["seat"])

        def dist(pc):                             # 0 inside the piece's box, else how far outside
            lo, hi = np.array(pc[1] or sd), np.array(pc[2] or sd)
            return float(np.linalg.norm(np.maximum(lo - sd, 0) + np.maximum(sd - hi, 0)))
        return min(pieces[obj], key=dist)[0]

    out = {}
    for f in json.load(open(path)) if os.path.exists(path) else []:
        o = out.setdefault(piece(f), {"items": {}, "joins": []})
        for it in (f.get("item"), f.get("nut_item")):
            if it:
                o["items"][it] = o["items"].get(it, 0) + 1
        for nm in [c[0] for c in f.get("chain", [])] + [f.get("head_part"), f.get("nut_part")]:
            if nm and nm not in o["joins"]:
                o["joins"].append(nm)
    return {k: {"fast": [[n, it] for it, n in v["items"].items()], "joins": v["joins"]} for k, v in out.items()}


def load_geometry(path):
    return gzip.decompress(open(path, "rb").read())


def mesh_span(m):
    """(start, end) of a mesh's bytes in the blob: positions [, uv], indices, padded to 4."""
    a = m["pos"][0]
    end = m["idx"][0] + m["idx"][1] * m["idx"][2] // 8
    return a, end + (-end) % 4


def src_of(name, frames):
    f = frames.get(name)
    if f is None:
        return None
    keep = ("file", "sha256", "A", "depth", "piece", "path", "along", "height", "across", "z0", "start", "scale", "reverse")
    if f["kind"] == "peter":
        return dict(kind="peter", **{s: {k: f[s][k] for k in keep if k in f[s]} for s in ("open", "closed")})
    return dict(kind=f["kind"], **{k: f[k] for k in keep if k in f})


def main():
    cfg = json.load(open(os.path.join(DATA, "lr4_config.json")))
    blob = load_geometry(os.path.join(DATA, "lr4_config_geometry.bin.gz"))
    frames = json.load(open(FRAMES))
    frames_t = json.load(open(FRAMES_TEMP)) if os.path.exists(FRAMES_TEMP) else {}
    man = json.load(open(MANIFEST))
    fmeta = fastener_meta(FASTENERS, cfg["parts"])
    out_blob, parts, dropped, by_kind = bytearray(), [], [], {}
    for rec in cfg["parts"]:
        name = rec["meta"]["name"]
        if "~honeycomb" in name:
            dropped.append(name)
            continue
        rec = dict(rec)
        if name in fmeta:
            rec["meta"] = dict(rec["meta"], **fmeta[name])
        src = src_of(name, frames_t if rec.get("from_temp") else frames) if "mesh" in rec else None   # Y_Clip_last:
                                                                                                        # Y_Clip_first's mesh
        if src:
            rec.pop("mesh", None)
            rec["src"] = src
            by_kind[src["kind"]] = by_kind.get(src["kind"], 0) + 1
        elif "mesh" in rec:
            if rec["meta"].get("source") == "printed":
                raise SystemExit(f"{name}: a printed part with no source file - its mesh would be shared")
            m = rec["mesh"]
            a, b = mesh_span(m)
            off = len(out_blob) - a
            out_blob += blob[a:b]
            q = dict(pos=[m["pos"][0] + off, m["pos"][1]], idx=[m["idx"][0] + off] + m["idx"][1:])
            if "uv" in m:
                q["uv"] = m["uv"] + off
            rec["mesh"] = q
        parts.append(rec)
    gz = gzip.compress(bytes(out_blob), 9, mtime=0)   # same bytes for the same data (git)
    share = dict(cfg, parts=parts, geometry_bytes=len(gz),
                 triangles=sum(p["mesh"]["idx"][1] // 3 for p in parts if "mesh" in p),
                 files=dict(tested=man["tested"], sources=man["sources"],
                            files={k: {f: v[f] for f in ("source", "use", "sha256")} for k, v in man["files"].items()}))
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "lr4_config_geometry.bin.gz"), "wb").write(gz)
    json.dump(share, open(os.path.join(OUT, "lr4_config.json"), "w"), separators=(",", ":"))
    print(f"SHARE {len(parts)} parts: {sum(by_kind.values())} from files {by_kind}, "
          f"{sum('mesh' in p for p in parts)} meshes kept; dropped {len(dropped)} ({', '.join(dropped)}); "
          f"geometry {len(gz) / 1e6:.2f} MB (private {cfg['geometry_bytes'] / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
