# Check parts/ against parts/manifest.json: which third-party files are missing, which differ from the tested
# versions (still used, with a warning), and which aren't in the manifest. Plain Python, no FreeCAD.
#   python tools/check_parts.py            report; exits 1 if a file the build needs is missing
#   python tools/check_parts.py --accept   add the checksums of the differing files (after re-solving with them:
#                                          pipeline/source_frames.py + the share test pass)
import datetime
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = os.path.join(ROOT, "parts")
MANIFEST = os.path.join(PARTS, "manifest.json")


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def check(man):
    missing, differ, ok = [], [], []
    for rel, f in man["files"].items():
        p = os.path.join(PARTS, rel)
        if not os.path.exists(p):
            missing.append(rel)
        elif sha(p) not in f["sha256"]:
            differ.append(rel)
        else:
            ok.append(rel)
    known = set(man["files"]) | {"manifest.json"}
    extra = sorted(os.path.relpath(os.path.join(d, n), PARTS).replace(os.sep, "/")
                   for d, _, ns in os.walk(PARTS) for n in ns
                   if os.path.relpath(os.path.join(d, n), PARTS).replace(os.sep, "/") not in known
                   and n.lower().endswith((".stl", ".dxf", ".step")))
    return missing, differ, ok, extra


if __name__ == "__main__":
    man = json.load(open(MANIFEST))
    missing, differ, ok, extra = check(man)
    print(f"{len(ok)} of {len(man['files'])} files as tested ({man['tested']})")
    for rel in missing:
        f = man["files"][rel]
        print(f"  MISSING  {rel}  ({f['use']}) - from {man['sources'][f['source']]['url']}")
    for rel in differ:
        print(f"  DIFFERS  {rel} - not the tested version; it is still placed, check it looks right")
    for rel in extra:
        print(f"  UNKNOWN  {rel} (not in the manifest; ignored)")
    if "--accept" in sys.argv and differ:
        for rel in differ:
            man["files"][rel]["sha256"].append(sha(os.path.join(PARTS, rel)))
            man["files"][rel]["date"] = datetime.date.today().isoformat()
        json.dump(man, open(MANIFEST, "w", newline="\n"), indent=1)
        print(f"accepted {len(differ)} new checksum(s)")
    sys.exit(1 if any(man["files"][r]["use"] == "build" for r in missing) else 0)
