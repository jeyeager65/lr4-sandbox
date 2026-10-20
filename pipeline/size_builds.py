# Configurator phase 2: build the LR4 at several cut areas, each in its own throwaway copy of the project, so
# fit_config.py can work out how every part moves with size. The real build/ and exports/ are never touched.
#   python pipeline/size_builds.py [tag ...]      (plain Python; runs FreeCAD headless per size, ~4 min each)
# Copies: private/sizes/<tag>/ (freecad/ incl. fclib + build/cache; parts/ is read from the real project by
# patched paths - no junctions, so deleting private/sizes can't reach the originals). Each copy runs build.py with
# LR4_CHECK=0, then export_web.py, which leaves exports/web/lr4_local.json + geo/*.bin per size.
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
OUT = os.path.join(PROJ, "private", "sizes")     # = lr4.SIZES_DIR
RUN = os.path.join(PROJ, "tools", "run.py")

# tag: (cut X in, cut Y in). Chosen to vary strut, brace count (3..8), Y length (clip count) and the
# table's whole-inch rounding independently. "ref" is the user's machine (26 x 50).
SIZES = {
    "ref": (26.0, 50.0),
    "x28": (28.0, 50.0),
    "y60": (26.0, 60.0),
    "s20x40": (20.0, 40.0),
    "s33x70": (33.0, 70.0),
    "s40x50": (40.0, 50.0),
    "s24x45": (24.5, 45.0),
    "s36x96": (36.0, 96.0),
    "s15x30": (15.0, 30.0),
    "s48x96": (48.0, 96.0),
    # fractional inches: with whole inches the table (rounded up to whole inches) is just cut + a constant, so the
    # fit couldn't tell the table size from the cut area
    "f30x55": (30.3, 55.7),
    "f21x63": (21.8, 63.2),
    "f44x80": (44.6, 80.9),
}


def patch(path, subs):
    s = open(path, encoding="utf-8").read()
    for pat, rep in subs:
        s, n = re.subn(pat, rep, s, count=1, flags=re.M)
        if n != 1:
            raise RuntimeError(f"{path}: pattern not found: {pat}")
    open(path, "w", encoding="utf-8").write(s)


def make_copy(tag, cx, cy):
    dst = os.path.join(OUT, tag, "LowRider4")       # basename must stay LowRider4 (document name)
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    os.makedirs(os.path.join(dst, "build"))
    shutil.copytree(os.path.join(PROJ, "freecad"), os.path.join(dst, "freecad"),
                    ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(os.path.join(PROJ, "build", "cache"), os.path.join(dst, "build", "cache"))
    os.makedirs(os.path.join(dst, "exports", "web"))
    os.makedirs(os.path.join(dst, "web"))
    shutil.copy(os.path.join(PROJ, "web", "viewer.html"), os.path.join(dst, "web"))
    parts = os.path.join(PROJ, "parts").replace("\\", "/")
    patch(os.path.join(dst, "freecad", "lr4.py"), [(r'^PARTS = .*$', f'PARTS = r"{parts}"')])
    patch(os.path.join(dst, "freecad", "build.py"), [(r'^CUT_X_IN = [0-9.]+', f"CUT_X_IN = {cx}"),
                                          (r'^CUT_Y_IN = [0-9.]+', f"CUT_Y_IN = {cy}"),
                                          (r'^JP3_BOARD = True', "JP3_BOARD = False")])
    return dst


def run(dst, script, log):
    env = dict(os.environ, LR4_CHECK=os.environ.get("LR4_SIZE_CHECK", "0"))   # LR4_SIZE_CHECK=1: overlap check too
    with open(log, "a", encoding="utf-8") as fh:
        r = subprocess.run([sys.executable, RUN, os.path.join(dst, script)], stdout=fh, stderr=subprocess.STDOUT,
                           env=env)
    return r.returncode


if __name__ == "__main__":
    tags = sys.argv[1:] or list(SIZES)
    for tag in tags:
        cx, cy = SIZES[tag]
        t0 = time.time()
        dst = make_copy(tag, cx, cy)
        log = os.path.join(OUT, tag, "log.txt")
        ok = run(dst, "freecad/build.py", log) == 0 and run(dst, "freecad/export_web.py", log) == 0
        ok = ok and os.path.exists(os.path.join(dst, "exports", "web", "lr4_local.json"))
        print(f"{tag} {cx} x {cy} in: {'ok' if ok else 'FAILED - see ' + log} ({time.time() - t0:.0f} s)", flush=True)
