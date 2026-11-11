# Copy the cnc-gcode-tools files the page uses from a COMMIT of that repo (D:/GitHub/cnc-gcode-tools, or
# GCODE_TOOLS_SRC=<dir>) into web/js/lib/cnc-gcode-tools, and pin it in SOURCE.json (version, commit, a SHA-256 per
# file). From the commit, not the working tree: the copy here must be something upstream has (2026-11-10: the
# roundover shape was vendored from uncommitted files).
#   python tools/sync_gcode_tools.py [rev]     copy the files at rev (default HEAD) and write SOURCE.json
#   python tools/sync_gcode_tools.py --check   exit 1 if a vendored file isn't what SOURCE.json pins (CI: needs no
#                                              upstream repo; line endings don't count)
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, "..", "web", "js", "lib", "cnc-gcode-tools")
SRC = os.environ.get("GCODE_TOOLS_SRC", r"D:/GitHub/cnc-gcode-tools")
FILES = {"parser.js": "src/js/parser.js", "gcode-expander.js": "src/js/gcode-expander.js",
         "animator.js": "src/js/animator.js", "stock-sim.js": "src/js/stock-sim.js", "LICENSE": "LICENSE"}
PIN = os.path.join(DST, "SOURCE.json")


def sha(data):
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def git(*args):
    return subprocess.run(["git", "-C", SRC, *args], check=True, capture_output=True).stdout


def check():
    with open(PIN, encoding="utf-8") as f:
        pin = json.load(f)
    bad = []
    for name, want in pin["files"].items():
        p = os.path.join(DST, name)
        if not os.path.exists(p) or sha(open(p, "rb").read()) != want:
            bad.append(name)
    extra = sorted(set(FILES) - set(pin["files"]))
    print(f"cnc-gcode-tools {pin['version']} ({pin['commit'][:7]}): " +
          ("differs from SOURCE.json: " + ", ".join(bad + extra) if bad or extra else "matches SOURCE.json"))
    return 1 if bad or extra else 0


def sync(rev):
    if not os.path.isdir(os.path.join(SRC, ".git")):
        sys.exit(f"cnc-gcode-tools repo not found: {SRC} (set GCODE_TOOLS_SRC)")
    commit = git("rev-parse", rev).decode().strip()
    pin = {"repo": "https://github.com/jeyeager65/cnc-gcode-tools", "version": git("show", f"{commit}:VERSION").decode().strip(),
           "commit": commit, "date": git("show", "-s", "--format=%cs", commit).decode().strip(), "files": {}}
    changed = []
    for name, path in FILES.items():
        data = git("show", f"{commit}:{path}")
        dst = os.path.join(DST, name)
        if not os.path.exists(dst) or sha(open(dst, "rb").read()) != sha(data):
            changed.append(name)
            with open(dst, "wb") as f:
                f.write(data)
        pin["files"][name] = sha(data)
    with open(PIN, "w", encoding="utf-8", newline="\n") as f:
        json.dump(pin, f, indent=2)
        f.write("\n")
    dirty = git("status", "--porcelain", "--", *FILES.values()).decode().strip()
    print(f"cnc-gcode-tools {pin['version']} ({commit[:7]}): updated " + (", ".join(changed) or "nothing"))
    if dirty:
        print("NOTE: upstream has uncommitted changes in these files (not copied):\n" + dirty)


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sync(args[0] if args else "HEAD")
