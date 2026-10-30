# The router presets (web/data/routers.js, the page's) vs fluidnc_post.py's ROUTERS: the post stays self-contained
# (it's copied into FreeCAD's Macro folder alone), so its dial tables are a copy - this keeps them the same.
#   python tests/test_routers_data.py
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "freecad", "fclib"))


def router_data():
    """web/data/routers.js's JSON block (between its marker lines)."""
    text = open(os.path.join(ROOT, "web", "data", "routers.js"), encoding="utf-8").read()
    a, b = text.index("// ---- JSON ----"), text.index("// ---- end JSON ----")
    return json.loads(text[a:b].split("\n", 1)[1])


def main():
    sys.argv = sys.argv[:1]                          # fluidnc_post parses its own arguments at import
    import fluidnc_post as post
    data = router_data()["routers"]
    fails = 0
    manual = {k: r for k, r in data.items() if r["source"] == "manual"}
    for k, r in manual.items():
        p = post.ROUTERS.get(k)
        same = p is not None and [list(q) for q in p["dial"]] == r["dial"] and p["name"] == r["name"]
        print(("  ok   " if same else "  FAIL ") + f"{k}: fluidnc_post's table = routers.js's")
        fails += not same
    extra = set(post.ROUTERS) - set(manual)
    print(("  ok   " if not extra else "  FAIL ") + f"no post router missing from routers.js {sorted(extra)}")
    fails += bool(extra)
    print(f"{fails} failed" if fails else "all passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
