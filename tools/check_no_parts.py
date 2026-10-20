# Guard: fail if any staged (or, with --all, tracked) file is a part / CAD file or lives in a folder that must stay
# out of the repo (V1E meshes, DXFs, STEPs, FCStd, the private folder). Used by the pre-commit hook and CI.
#   python tools/check_no_parts.py          (staged files)
#   python tools/check_no_parts.py --all    (every tracked file)
#   python tools/check_no_parts.py --install   (writes .git/hooks/pre-commit to run it)
import os
import subprocess
import sys

BAD_EXT = (".stl", ".step", ".stp", ".dxf", ".3mf", ".obj", ".fcstd", ".fcbak", ".scad")
BAD_DIRS = ("parts/", "private/", "vendor/", "build/", "exports/", "web/data/", "tests/golden/", "tests/node_modules/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOK = "#!/bin/sh\nexec python tools/check_no_parts.py\n"


def files(all_tracked):
    cmd = ["git", "ls-files"] if all_tracked else ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")


if __name__ == "__main__":
    if "--install" in sys.argv:
        with open(os.path.join(ROOT, ".git", "hooks", "pre-commit"), "w", newline="\n") as fh:
            fh.write(HOOK)
        print("installed .git/hooks/pre-commit")
        sys.exit(0)
    bad = [f for f in files("--all" in sys.argv) if f and (f.lower().endswith(BAD_EXT) or f.startswith(BAD_DIRS))]
    if bad:
        print("Not allowed in the repo (part / CAD / private files):\n  " + "\n  ".join(bad))
        sys.exit(1)
