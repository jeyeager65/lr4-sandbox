# Cache busting for GitHub Pages (it serves everything with max-age=600 and no way to change it): stamps the
# assembled site's index.html with a build id, so a new page never runs with an old cached script or data file.
#   python tools/stamp_build.py _site/index.html <build id>      (the Pages workflow passes the short commit)
# - window.LR4_BUILD = "" becomes the id: the page's lr4v() then adds ?v=<id> to what it loads itself (data,
#   models, the FluidNC / FluidTouch builds)
# - every local <script src> and stylesheet <link href> gets ?v=<id> (http(s): and // ones are left alone, and so
#   is coi-serviceworker.js)
import re
import sys


def stamp(html, bid):
    out, n = re.subn(r'window\.LR4_BUILD = ""', f'window.LR4_BUILD = "{bid}"', html)
    if n != 1:
        raise SystemExit("index.html: no window.LR4_BUILD = \"\" to stamp")

    def tag(m):
        url = m.group(2)
        # the service worker keeps its URL (a new one each build would register a new worker; browsers check
        # workers for updates themselves)
        if re.match(r"^(https?:)?//", url) or "?v=" in url or url == "coi-serviceworker.js":
            return m.group(0)
        return f'{m.group(1)}{url}{"&" if "?" in url else "?"}v={bid}{m.group(3)}'
    out = re.sub(r'(<script\s+src=")([^"]+)(")', tag, out)
    out = re.sub(r'(<link\s+rel="stylesheet"\s+href=")([^"]+)(")', tag, out)
    return out


if __name__ == "__main__":
    path, bid = sys.argv[1], sys.argv[2]
    if not re.fullmatch(r"[0-9A-Za-z._-]{1,40}", bid):
        raise SystemExit(f"bad build id: {bid!r}")
    html = open(path, encoding="utf-8").read()
    new = stamp(html, bid)
    open(path, "w", encoding="utf-8", newline="\n").write(new)
    print(f"{path}: build {bid}, {new.count('?v=' + bid)} local tags stamped")
