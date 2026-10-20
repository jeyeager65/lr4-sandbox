# Run one of this repo's FreeCAD scripts headless (freecadcmd), with __file__ set so it finds its own folder and
# the vendored freecad/fclib. Exits non-zero if the script raises.
#   python tools/run.py freecad/build.py        (any Python 3; FreeCAD 1.1+ must be installed)
#   python tools/run.py pipeline/source_frames.py
# freecadcmd is looked for in FREECAD_CMD, then on PATH, then in the usual install folders (Windows / Mac / Linux).
import glob
import os
import shutil
import subprocess
import sys
import tempfile

CODE = """import sys, traceback
p = {path!r}
try:
    exec(compile(open(p, encoding='utf-8').read(), p, 'exec'), {{'__file__': p, '__name__': '__main__'}})
except SystemExit:
    raise
except BaseException:
    traceback.print_exc()
    open({marker!r}, 'w').close()
"""


def find_freecadcmd():
    env = os.environ.get("FREECAD_CMD")
    if env:
        return env
    for name in ("freecadcmd", "FreeCADCmd", "freecad.cmd"):
        p = shutil.which(name)
        if p:
            return p
    if sys.platform == "win32":
        roots = [os.environ.get(k) for k in ("ProgramFiles", "LOCALAPPDATA") if os.environ.get(k)]
        hits = [h for r in roots for h in glob.glob(os.path.join(r, "**", "FreeCAD*", "bin", "freecadcmd.exe"))]
        hits += [h for r in roots for h in glob.glob(os.path.join(r, "FreeCAD*", "bin", "freecadcmd.exe"))]
    elif sys.platform == "darwin":
        hits = glob.glob("/Applications/FreeCAD*.app/Contents/Resources/bin/freecadcmd")
    else:
        hits = [h for h in ("/usr/bin/freecadcmd", "/usr/local/bin/freecadcmd", "/snap/bin/freecad.cmd")
                if os.path.exists(h)]
    if hits:
        return sorted(set(hits))[-1]   # the newest version folder sorts last ("FreeCAD 1.1" > "FreeCAD 1.0")
    sys.exit("freecadcmd not found: install FreeCAD 1.1+ or set FREECAD_CMD to its freecadcmd")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python tools/run.py <script.py>")
    path = os.path.abspath(sys.argv[1]).replace("\\", "/")
    if not os.path.isfile(path):
        sys.exit(f"no such script: {path}")
    fd, marker = tempfile.mkstemp(suffix=".failed")
    os.close(fd)
    os.remove(marker)
    r = subprocess.run([find_freecadcmd(), "-c", CODE.format(path=path, marker=marker)])
    if os.path.exists(marker):
        os.remove(marker)
        sys.exit(1)
    sys.exit(r.returncode)
