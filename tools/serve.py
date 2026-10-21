# Serve one of the pages on localhost and open it in the browser (Ctrl+C stops the server):
#   python tools/serve.py configurator [WxH]   the repo on http://127.0.0.1:8767, opening web/index.html?parts=/parts/
#                                              (e.g. 48x96 = a 48 x 96 in cutting area): the public page and data,
#                                              with your part files fetched from parts/
#   python tools/serve.py viewer               exports/web on http://127.0.0.1:8765 (full detail; refresh it with
#                                              freecad/export_web.py)
# The viewer's page comes from export_web (web/viewer.html copied next to its data).
# Both send COOP / COEP (credentialless, so the CDN scripts still load): the page is cross-origin isolated, which
# FluidNC in the browser needs (SharedArrayBuffer). A plain static host gets the same from web/coi-serviceworker.js.
import functools
import http.server
import os
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Isolated(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()


PAGES = {"configurator": (ROOT, 8767, "web/index.html"),
         "viewer": (os.path.join(ROOT, "exports", "web"), 8765, "LowRider4_local.html")}


if __name__ == "__main__":
    args = sys.argv[1:]
    which = args[0] if args else ""
    if which not in PAGES:
        sys.exit("usage: python tools/serve.py configurator [WxH] | viewer")
    folder, port, page = PAGES[which]
    if not os.path.exists(os.path.join(folder, page)):
        sys.exit(f"{os.path.join(folder, page)} not found - run: python tools/run.py freecad/export_web.py")
    url = f"http://127.0.0.1:{port}/{page}" + ("?parts=/parts/" if which == "configurator" else "") + (f"#{args[1]}" if len(args) > 1 else "")
    handler = functools.partial(Isolated, directory=folder)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving {folder} at {url} - Ctrl+C to stop", flush=True)
    threading.Timer(0.5, webbrowser.open, (url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
