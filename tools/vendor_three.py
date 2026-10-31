# Vendor a three.js release into web/vendor/three/r<N>/ (Part 49: no CDN) and point the pages' import maps at it:
#   python tools/vendor_three.py 0.157.0        (the npm version; the folder is named by the revision, r157)
# Fetches build/three.module(.min).js (+ three.core(.min).js from r171 on, which the module imports), the add-ons
# below from examples/jsm (and whatever they import relatively) and the LICENSE from jsdelivr; removes the other
# vendored revisions (git has them); rewrites "vendor/three/r<old>/" in web/index.html.
import os
import re
import shutil
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "web", "vendor", "three")
PAGES = [os.path.join(ROOT, "web", "index.html")]
ADDONS = ["controls/OrbitControls.js", "controls/TrackballControls.js", "environments/RoomEnvironment.js",
          "lights/RectAreaLightUniformsLib.js"]


def get(ver, path):
    url = f"https://cdn.jsdelivr.net/npm/three@{ver}/{path}"
    try:
        with urllib.request.urlopen(url) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main(ver):
    rev = "r" + ver.split(".")[1]
    dest = os.path.join(VENDOR, rev)
    if os.path.exists(dest):
        shutil.rmtree(dest)
    files = {}
    for path in ["build/three.module.min.js", "build/three.module.js"]:   # min from ~r150; plain before
        data = get(ver, path)
        if data:
            files["build/three.module.js"] = data
            break
    else:
        raise SystemExit(f"three@{ver}: no build/three.module.js")
    for m in re.findall(rb"""from\s*["']\./(three\.[\w.]+\.js)["']""", files["build/three.module.js"]):   # r171+: the core
        name = m.decode()
        mini = name if ".min." in name else name.replace(".js", ".min.js")   # (the min module imports ./three.core.js)
        files["build/" + name] = get(ver, "build/" + mini) or get(ver, "build/" + name)
    todo = ["examples/jsm/" + a for a in ADDONS]
    while todo:
        path = todo.pop()
        if path in files:
            continue
        data = get(ver, path)
        if data is None:
            raise SystemExit(f"three@{ver}: no {path}")
        files[path] = data
        for m in re.findall(rb"""from\s*["'](\.{1,2}/[^"']+)["']""", data):   # relative imports of the add-ons
            todo.append(os.path.normpath(os.path.join(os.path.dirname(path), m.decode())).replace("\\", "/"))
    files["LICENSE"] = get(ver, "LICENSE")
    for path, data in files.items():
        os.makedirs(os.path.dirname(os.path.join(dest, path)), exist_ok=True)
        with open(os.path.join(dest, path), "wb") as f:
            f.write(data)
    for old in os.listdir(VENDOR):
        if old != rev:
            shutil.rmtree(os.path.join(VENDOR, old))
    for page in PAGES:
        html = open(page, encoding="utf-8").read()
        new = re.sub(r"vendor/three/r\d+/", f"vendor/three/{rev}/", html)
        if new != html:
            open(page, "w", encoding="utf-8", newline="\n").write(new)
    size = sum(len(d) for d in files.values())
    print(f"three@{ver} -> web/vendor/three/{rev}/: {len(files)} files, {size / 1e6:.2f} MB")


if __name__ == "__main__":
    main(sys.argv[1])
