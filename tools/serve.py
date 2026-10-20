# Serve one of the pages on localhost and open it in the browser (Ctrl+C stops the server):
#   python tools/serve.py configurator [WxH]   web/ on http://127.0.0.1:8767 (e.g. 48x96 = a 48 x 96 in cutting area)
#   python tools/serve.py configurator --share [WxH]   the same page on the share data (web/data/share: no V1E
#                                              geometry - load your own part files, as the public page will)
#   python tools/serve.py viewer               exports/web on http://127.0.0.1:8765 (full detail; refresh it with
#                                              freecad/export_web.py)
# The configurator page is written for the claude.ai artifact host, which adds the document skeleton (charset,
# viewport); this wraps it as web/index_local.html (git-ignored) first. The viewer's local page comes from export_web.
import functools
import http.server
import os
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = {"configurator": (os.path.join(ROOT, "web"), 8767, "index_local.html"),
         "viewer": (os.path.join(ROOT, "exports", "web"), 8765, "LowRider4_local.html")}


def wrap_configurator(folder):
    page = open(os.path.join(folder, "index.html"), encoding="utf-8").read()
    open(os.path.join(folder, "index_local.html"), "w", encoding="utf-8").write(
        "<!doctype html>\n<html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'></head><body>\n" + page + "\n</body></html>\n")


if __name__ == "__main__":
    share = "--share" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--share"]
    which = args[0] if args else ""
    if which not in PAGES:
        sys.exit("usage: python tools/serve.py configurator [--share] [WxH] | viewer")
    folder, port, page = PAGES[which]
    if which == "configurator":
        wrap_configurator(folder)
    elif not os.path.exists(os.path.join(folder, page)):
        sys.exit(f"{os.path.join(folder, page)} not found - run: python tools/run.py freecad/export_web.py")
    url = f"http://127.0.0.1:{port}/{page}" + ("?share" if share else "") + (f"#{args[1]}" if len(args) > 1 else "")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=folder)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving {folder} at {url} - Ctrl+C to stop", flush=True)
    threading.Timer(0.5, webbrowser.open, (url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
