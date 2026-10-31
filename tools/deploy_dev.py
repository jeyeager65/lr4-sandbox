# The unofficial dev copy of the page on Cloudflare (a Worker with static assets: lr4-sandbox-dev.jeyeager.workers.dev,
# public; user 2026-10-30: "a current dev version, not the one on
# GitHub Pages ... direct from here, not a GitHub Action"). Builds the site from the WORKING TREE's web/ (uncommitted
# changes and new files too - but only files git tracks or would track: nothing ignored, no part / CAD file), the same
# way pages.yml does (stamped for cache busting), plus Cloudflare's _headers (the cross-origin
# isolation FluidNC's threads need, sent for real; noindex) and uploads it with wrangler (the first deploy makes the
# Worker; signed in once with npx wrangler login).
#   python tools/deploy_dev.py --dry        build build/dev-site only (look before you send)
#   python tools/deploy_dev.py              build + deploy
#   --name NAME                             another Worker (default lr4-sandbox-dev)
import datetime
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "dev-site")
WRANGLER = "wrangler@4"                              # npx fetches it; the major version pinned
sys.path.insert(0, os.path.join(ROOT, "tools"))
from check_no_parts import BAD_EXT, OWNED            # the pre-commit guard's lists (OWNED: the pendant meshes, shipped)
from stamp_build import stamp

HEADERS = """/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
  X-Robots-Tag: noindex
"""


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def build():
    files = sorted(set(git("ls-files", "web").split("\n") + git("ls-files", "--others", "--exclude-standard", "web").split("\n")) - {""})
    bad = [f for f in files if f.lower().endswith(BAD_EXT) and not f.startswith(OWNED)]
    if bad:
        raise SystemExit("part / CAD files in web/, not sending: " + ", ".join(bad))
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    n = 0
    for f in files:
        if not os.path.isfile(os.path.join(ROOT, f)):   # (a tracked file deleted here: left out)
            continue
        dst = os.path.join(OUT, os.path.relpath(f, "web"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, f), dst)
        n += 1
    sha = git("rev-parse", "--short=7", "HEAD").strip()
    dirty = "+" if git("status", "--porcelain", "web").strip() else ""
    bid = f"dev-{sha}{dirty}-{datetime.datetime.now():%Y%m%d%H%M}"
    idx = os.path.join(OUT, "index.html")
    with open(idx, encoding="utf-8") as fh:
        html = fh.read()
    with open(idx, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(stamp(html, bid))
    with open(os.path.join(OUT, "_headers"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(HEADERS)
    size = sum(os.path.getsize(os.path.join(d, x)) for d, _, xs in os.walk(OUT) for x in xs)
    print(f"built {OUT}: {n} files, {size / 1e6:.1f} MB, build {bid}")
    return bid


def main():
    a = sys.argv[1:]
    name = a[a.index("--name") + 1] if "--name" in a else "lr4-sandbox-dev"
    bid = build()
    if "--dry" in a:
        return
    cmd = ["npx", "--yes", WRANGLER, "deploy", "--assets", OUT, "--name", name, "--compatibility-date", "2026-10-01",
           "--message", bid]
    print(" ".join(cmd))
    sys.exit(subprocess.run(cmd, cwd=ROOT, shell=os.name == "nt").returncode)


if __name__ == "__main__":
    main()
