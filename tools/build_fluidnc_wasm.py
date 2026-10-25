# Build FluidNC for the browser (its wasm port, `pio run -e wasm`) from jeyeager65/FluidNC's `wasm-sim` branch at the
# pinned commit, and copy it into web/fluidnc/ (committed like web/data; the page loads it from there):
#   web/fluidnc/program.js + program.wasm   the module (web/js/fluidnc_sim.js loads it)
#   web/fluidnc/LICENSE                     FluidNC's GPL-3.0 (the page links it next to the source)
#   web/fluidnc/build.json                  repo, branch, commit, source link, emcc version, date
#   web/fluidnc/demo_config.yaml            the wasm demo's config.yaml (FluidNC/wasm/demo/seed-localfs)
#   python tools/build_fluidnc_wasm.py              (plain Python; the checkout must be at PIN with no local changes)
#   python tools/build_fluidnc_wasm.py --dirty      build whatever the checkout has (marked "dirty" in build.json)
# FLUIDNC=<checkout> (default D:/GitHub/FluidNC) and EMSDK=<emsdk folder> (default D:/emsdk) override the paths.
# Needs PlatformIO (~/.platformio) and the Emscripten SDK (installed + activated once: emsdk install / activate latest).
import datetime
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "fluidnc")
SRC = os.environ.get("FLUIDNC", r"D:/GitHub/FluidNC")
EMSDK = os.path.normpath(os.environ.get("EMSDK", r"D:/emsdk"))
REPO = "https://github.com/jeyeager65/FluidNC"
BRANCH = "wasm-sim"
# the wasm-sim commit the page ships; bump it after committing (and pushing) a change on the branch
PIN = "8755cc999ea79df827d12320774a8091e512acb7"


def git(*args):
    return subprocess.run(["git", "-C", SRC, *args], capture_output=True, text=True, check=True).stdout.strip()


def pio():
    for p in (os.path.expanduser("~/.platformio/penv/Scripts/pio.exe"), os.path.expanduser("~/.platformio/penv/bin/pio")):
        if os.path.exists(p):
            return p
    return shutil.which("pio") or sys.exit("PlatformIO not found (~/.platformio/penv or pio on PATH)")


def run_in_emsdk(cmd):
    # emcc / em++ on PATH for this one command (the wasm env's pio_toolchain_wasm.py looks for them) - what emsdk_env
    # does, set here: emsdk_env.bat prints bash exports instead when it's started from Git Bash
    env = dict(os.environ, EMSDK=EMSDK, EM_CONFIG=os.path.join(EMSDK, ".emscripten"))
    node = os.path.join(EMSDK, "node")
    extra = [EMSDK, os.path.join(EMSDK, "upstream", "emscripten")]
    if os.path.isdir(node):
        extra += [os.path.join(node, d, "bin") for d in sorted(os.listdir(node))]
    env["PATH"] = os.pathsep.join(extra + [env.get("PATH", "")])
    exe = shutil.which(cmd[0], path=env["PATH"]) or cmd[0]
    return subprocess.run([exe] + cmd[1:], cwd=SRC, capture_output=True, text=True, env=env)


if __name__ == "__main__":
    dirty_ok = "--dirty" in sys.argv
    if not os.path.isdir(os.path.join(SRC, "FluidNC", "wasm")):
        sys.exit(f"FluidNC checkout with the wasm port not found: {SRC} (set FLUIDNC)")
    head, branch, changes = git("rev-parse", "HEAD"), git("rev-parse", "--abbrev-ref", "HEAD"), git("status", "--porcelain")
    if not dirty_ok and (head != PIN or changes):
        sys.exit(f"{SRC} is at {branch} {head[:8]}{' with local changes' if changes else ''}; PIN is {PIN[:8]} "
                 f"(git checkout {BRANCH} there, or --dirty to build it anyway)")
    log = os.path.join(HERE, "..", "build", "fluidnc_wasm.log")
    os.makedirs(os.path.dirname(log), exist_ok=True)
    print(f"building {branch} {head[:8]} (pio run -e wasm; log: build/fluidnc_wasm.log)", flush=True)
    r = run_in_emsdk([pio(), "run", "-e", "wasm"])
    with open(log, "w", encoding="utf-8") as f:
        f.write(r.stdout + r.stderr)
    if r.returncode:
        sys.exit("build failed:\n" + "\n".join((r.stdout + r.stderr).splitlines()[-15:]))
    built = os.path.join(SRC, ".pio", "build", "wasm")
    # the JS glue is `program` (program.exe on Windows; the env's post-action copies `program` to program.js elsewhere)
    glue = next((os.path.join(built, n) for n in ("program.js", "program.exe", "program") if os.path.isfile(os.path.join(built, n))), None)
    if not glue:
        sys.exit(f"no JS glue (program.js / program.exe / program) in {built}")
    os.makedirs(OUT, exist_ok=True)
    shutil.copyfile(glue, os.path.join(OUT, "program.js"))
    shutil.copyfile(os.path.join(built, "program.wasm"), os.path.join(OUT, "program.wasm"))
    shutil.copyfile(os.path.join(SRC, "LICENSE"), os.path.join(OUT, "LICENSE"))
    shutil.copyfile(os.path.join(SRC, "FluidNC", "wasm", "demo", "seed-localfs", "config.yaml"), os.path.join(OUT, "demo_config.yaml"))
    emcc = run_in_emsdk(["emcc", "--version"]).stdout.splitlines()
    info = {"repo": REPO, "branch": branch, "commit": head, "source": f"{REPO}/tree/{head}",
            "dirty": bool(changes), "emcc": emcc[0] if emcc else "", "built": datetime.date.today().isoformat(),
            "license": "GPL-3.0 (LICENSE)"}
    with open(os.path.join(OUT, "build.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=1)
        f.write("\n")
    kb = lambda n: f"{os.path.getsize(os.path.join(OUT, n)) / 1024:.0f} KB"
    print(f"web/fluidnc: program.js {kb('program.js')}, program.wasm {kb('program.wasm')}"
          f"{' (DIRTY build - not for committing)' if changes else ''}")
