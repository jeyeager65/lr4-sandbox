# Share step: the configurator's page data without any V1E / Printables geometry. Each part whose mesh came from a
# downloaded file (printed STLs, XZ plate DXFs, Peter Plates, bristles) loses its mesh and gets `src` instead - the
# file, its SHA-256 and the 3x4 A (file coordinates -> the reference build's machine coordinates, where the mesh sat),
# so the page places the user's own copy exactly where the mesh was. Our meshes (hardware, strut plates, table, bolts)
# stay. Plain Python (numpy).
#   python pipeline/share_data.py
# in : web/data/lr4_config.json + lr4_config_geometry.txt (fit_config.py), private/sizes/source_frames.json
#      (source_frames.py), parts/manifest.json
# out: web/data/share/lr4_config.json + lr4_config_geometry.txt (same layout as the private data) - the
#      tests/test_share.py check rebuilds every src part from parts/ and compares it with the private meshes.
# src kinds: stl {file, sha256, A}; dxf {.., depth: extrusion along the DXF's z, before A}; peter {open: {.., piece:
# connected component by ZMax, highest first}, closed: {..}} (the "~honeycomb" alternates are dropped - part 6 builds
# them from the user's DXFs); bent {file, sha256, A, path, along, height, across, z0, start, scale, reverse} (the bristles: mesh.bend_strip's
# arguments - the page bends the user's flat strip along the groove path, then A).
import base64
import gzip
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
DATA = os.path.join(PROJ, "web", "data")
OUT = os.path.join(DATA, "share")
FRAMES = os.path.join(PROJ, "private", "sizes", "source_frames.json")
MANIFEST = os.path.join(PROJ, "parts", "manifest.json")


def load_geometry(path):
    return gzip.decompress(base64.b64decode(open(path).read()))


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
    blob = load_geometry(os.path.join(DATA, "lr4_config_geometry.txt"))
    frames = json.load(open(FRAMES))
    man = json.load(open(MANIFEST))
    out_blob, parts, dropped, by_kind = bytearray(), [], [], {}
    for rec in cfg["parts"]:
        name = rec["meta"]["name"]
        if "~honeycomb" in name:
            dropped.append(name)
            continue
        rec = dict(rec)
        src = src_of(name, frames) if "mesh" in rec else None    # Y_Clip_last: drawn with Y_Clip_first's
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
    txt = base64.b64encode(gzip.compress(bytes(out_blob), 9)).decode("ascii")
    share = dict(cfg, parts=parts, geometry_chars=len(txt),
                 triangles=sum(p["mesh"]["idx"][1] // 3 for p in parts if "mesh" in p),
                 files=dict(tested=man["tested"], sources=man["sources"],
                            files={k: {f: v[f] for f in ("source", "use", "sha256")} for k, v in man["files"].items()}))
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "lr4_config_geometry.txt"), "w").write(txt)
    json.dump(share, open(os.path.join(OUT, "lr4_config.json"), "w"), separators=(",", ":"))
    print(f"SHARE {len(parts)} parts: {sum(by_kind.values())} from files {by_kind}, "
          f"{sum('mesh' in p for p in parts)} meshes kept; dropped {len(dropped)} ({', '.join(dropped)}); "
          f"geometry {len(txt) / 1e6:.2f} MB (private {cfg['geometry_chars'] / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
