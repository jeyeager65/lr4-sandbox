# Copy the fclib modules this project uses from the FreeCAD workspace (D:/FreeCAD/lib/fclib, or FCLIB_SRC=<dir>)
# into freecad/fclib here. The vendored copy is what the scripts import; run this after changing fclib in the workspace.
#   python tools/sync_fclib.py          (plain Python; lists what changed)
#   python tools/sync_fclib.py --check  (exit 1 if the vendored copy differs - nothing is written)
import filecmp
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, "..", "freecad", "fclib")
SRC = os.environ.get("FCLIB_SRC", r"D:/FreeCAD/lib/fclib")
# the modules the LR4 scripts import (plus fclib's own imports between them); view = GUI colours / open_build
MODULES = ("__init__", "core", "mesh", "hw", "wood", "art", "fasteners", "cam", "fluidnc_post", "view")

if __name__ == "__main__":
    check = "--check" in sys.argv
    if not os.path.isdir(SRC):
        sys.exit(f"fclib source not found: {SRC} (set FCLIB_SRC)")
    os.makedirs(DST, exist_ok=True)
    changed = []
    for name in MODULES:
        s, d = os.path.join(SRC, name + ".py"), os.path.join(DST, name + ".py")
        if os.path.exists(d) and filecmp.cmp(s, d, shallow=False):
            continue
        changed.append(name)
        if not check:
            shutil.copy2(s, d)
    print(("differs: " if check else "updated: ") + (", ".join(changed) or "nothing"))
    sys.exit(1 if check and changed else 0)
