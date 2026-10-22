# Build FluidTouch (the pendant's firmware UI) for the browser from jeyeager65/FluidTouch's `feature/wasm-sim` branch
# at the pinned commit (its sim/wasm/build.ps1: Emscripten + MSYS2 cmake / ninja), and copy it into web/fluidtouch/
# (committed like web/fluidnc; web/js/fluidtouch_sim.js loads it):
#   web/fluidtouch/fluidtouch.js + fluidtouch.wasm   the module
#   web/fluidtouch/LICENSE                           FluidTouch's MIT licence
#   web/fluidtouch/build.json                        repo, branch, commit, source link, date
#   python tools/build_fluidtouch_wasm.py            (the checkout must be at PIN with no local changes)
#   python tools/build_fluidtouch_wasm.py --dirty    build whatever the checkout has (marked "dirty" in build.json)
# FLUIDTOUCH=<checkout> (default D:/GitHub/FluidTouch), EMSDK=<emsdk folder> (default D:/emsdk) and MSYS2_ROOT
# (default C:/msys64) override the paths.
import datetime
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "fluidtouch")
SRC = os.environ.get("FLUIDTOUCH", r"D:/GitHub/FluidTouch")
EMSDK = os.path.normpath(os.environ.get("EMSDK", r"D:/emsdk"))
REPO = "https://github.com/jeyeager65/FluidTouch"
BRANCH = "feature/wasm-sim"
# the feature/wasm-sim commit the page ships; bump it after committing (and pushing) a change on the branch
PIN = "53f23cff60f29870b7247207843d0550a38058a3"


def git(*args):
    return subprocess.run(["git", "-C", SRC, *args], capture_output=True, text=True, check=True).stdout.strip()


if __name__ == "__main__":
    dirty_ok = "--dirty" in sys.argv
    script = os.path.join(SRC, "sim", "wasm", "build.ps1")
    if not os.path.isfile(script):
        sys.exit(f"FluidTouch checkout with sim/wasm not found: {SRC} (set FLUIDTOUCH)")
    head, branch, changes = git("rev-parse", "HEAD"), git("rev-parse", "--abbrev-ref", "HEAD"), git("status", "--porcelain")
    if not dirty_ok and (head != PIN or changes):
        sys.exit(f"{SRC} is at {branch} {head[:8]}{' with local changes' if changes else ''}; PIN is {PIN[:8] or '(none)'} "
                 f"(git checkout {BRANCH} there, or --dirty to build it anyway)")
    log = os.path.join(HERE, "..", "build", "fluidtouch_wasm.log")
    os.makedirs(os.path.dirname(log), exist_ok=True)
    print(f"building {branch} {head[:8]} (sim/wasm/build.ps1; log: build/fluidtouch_wasm.log)", flush=True)
    shell = shutil.which("pwsh") or shutil.which("powershell") or sys.exit("PowerShell not found")
    r = subprocess.run([shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Emsdk", EMSDK],
                       cwd=SRC, capture_output=True, text=True)
    with open(log, "w", encoding="utf-8") as f:
        f.write(r.stdout + r.stderr)
    if r.returncode:
        sys.exit("build failed:\n" + "\n".join((r.stdout + r.stderr).splitlines()[-15:]))
    built = os.path.join(SRC, "sim", "wasm", "build")
    os.makedirs(OUT, exist_ok=True)
    for n in ("fluidtouch.js", "fluidtouch.wasm"):
        shutil.copyfile(os.path.join(built, n), os.path.join(OUT, n))
    shutil.copyfile(os.path.join(SRC, "LICENSE"), os.path.join(OUT, "LICENSE"))
    info = {"repo": REPO, "branch": branch, "commit": head, "source": f"{REPO}/tree/{head}",
            "dirty": bool(changes), "built": datetime.date.today().isoformat(), "license": "MIT (LICENSE)"}
    with open(os.path.join(OUT, "build.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=1)
        f.write("\n")
    kb = lambda n: f"{os.path.getsize(os.path.join(OUT, n)) / 1024:.0f} KB"
    print(f"web/fluidtouch: fluidtouch.js {kb('fluidtouch.js')}, fluidtouch.wasm {kb('fluidtouch.wasm')}"
          f"{' (DIRTY build - not for committing)' if changes else ''}")
