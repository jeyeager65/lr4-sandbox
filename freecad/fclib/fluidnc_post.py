# FluidNC post-processor for FreeCAD CAM (LowRider v3 + FluidTouch pendant + hand-set router).
#
# Self-contained: copy this one file into FreeCAD's user Macro folder (tools/install_posts.py
# does that) and it appears as "fluidnc" in the Job's post-processor list. Needs only FreeCAD's
# own grbl_post. Routers: pick with --router=, or add one to ROUTERS below. Built on grbl_post, then:
#   - arcs with huge radii (FluidNC float32 arc maths can crash on them) become straight lines
#   - modal output: X/Y/Z and F written only when they change (arcs always keep X and Y)
#   - a settings block of FluidNC local parameters at the top of the file (feeds in mm/min,
#     clearance/safe heights, touch-plate values) used as F#<t1_feed>, G0 Z#<clear_z>, ... so a
#     hand edit of one number changes every line that uses it (--no-params = plain numbers)
#   - each operation starts with (MSG, 3/5 T3 Narrow gaps - ~6 min): step, tool, the op's
#     Comment (or label), estimated time - FluidTouch shows the last MSG while it runs
#   - no K word on XY-plane arcs, no commented M6, no repeated moves, no grbl_post noise
#     (preamble/toolchange markers, empty tool-controller "operations")
#   - V1 Engineering Jackpot conventions (docs.v1e.com milling basics, GRBL/Jackpot): start
#     with G10 L20 P0 X0 Y0 Z0 at the jogged start point, $HZ before each bit change and at
#     the end, touch plate via G38.2 Z-110 F200 P<plate>, M0 + (MSG ...) pauses for the
#     FluidTouch pendant, optional router relay M62/M63, router dial setting per tool
#   - stock simulation comments for cnc-gcode-tools: (CNCSIM 1 UNITS=mm), (Stock: ...) from the
#     Job's stock, (ToolDef N: SHAPE=... D=... NAME=...) per bit (the viewer's tool names too),
#     (PriorJob: <file>) per --prior-job
#   - every line within FluidNC's 127-byte limit (MAX_LINE, fit_line): long comments wrap onto
#     more comment lines, an M0's (MSG ...) is cut short with a warning, code that can't fit is an error
# Arguments (Job > Post Processor Arguments), e.g. "--plate=15.0 --probe-xy=0,0":

TOOLTIP = """FluidNC (GRBL-compatible) post: modal output, no K on arcs, M0 + (MSG,...) bit
changes for the pendant, optional touch-plate probing, router dial setting in the messages."""
TOOLTIP_ARGS = """--plate=<mm>      touch plate thickness: probe Z at every bit (omit = zero Z by hand)
--probe-xy=<x,y>  where to probe - must stay uncut board top (default 10,10 as V1E)
--probe-to=<z>    G38.2 target Z (default -110, as V1E)
--spindle-pin=<n> router relay output (V1E: M62/M63 P1 = pin 27); omit for a hand-set router
--origin=<text>   where the bit is jogged before starting (shown in the start comment)
--probe-spot=<text> what the probe spot is (shown in the probe comment)
--title=<text>    program title comment
--keep-xy         first message says keep the existing X0 Y0 (for a later tool's own file)
--no-params       plain numbers instead of #<t1_feed>-style feed parameters (for previewers)
--router=<key>    router dial table: makita (default), kobalt, carbide, dewalt
--prior-job=<file> a file that runs before this one (same folder), for the viewer's stock
                  simulation; repeat it for each one, oldest first"""

import argparse
import os
import shlex

parser = argparse.ArgumentParser(prog="fluidnc", add_help=False)
parser.add_argument("--plate", type=float, default=None)
parser.add_argument("--probe-xy", default="10,10")
parser.add_argument("--probe-to", type=float, default=-110.0)
parser.add_argument("--spindle-pin", type=int, default=None)
parser.add_argument("--origin", default="the start corner")
parser.add_argument("--probe-spot", default="uncut board top")
parser.add_argument("--title", default="")
parser.add_argument("--keep-xy", action="store_true")
parser.add_argument("--no-params", action="store_true")
parser.add_argument("--router", default=None)
parser.add_argument("--prior-job", action="append", default=[])
parser.add_argument("--no-show-editor", action="store_true")
parser.add_argument("--show-editor", action="store_true")


# ---- routers: speed is set by hand on the router's dial; the messages say which setting ----
# Pick one with --router=<key> (Job > Post Processor Arguments). Tables are (dial, RPM);
# half steps on the dial are interpolated. Add your own router here.
ROUTERS = {
    "kobalt": dict(name="Kobalt trim router",
                   dial=[(1, 10000), (2, 14000), (3, 18000), (4, 22000), (5, 26000), (6, 35000)],
                   source="manual table"),
    "makita": dict(name="Makita RT0701C",
                   dial=[(1, 10000), (2, 12000), (3, 17000), (4, 22000), (5, 27000), (6, 30000)],
                   source="Makita RT0701C instruction manual, speed adjusting dial table"),
    "carbide": dict(name="Carbide Compact Router",
                    dial=[(1, 11000), (2, 13500), (3, 18250), (4, 24500), (5, 29250), (6, 31000)],
                    source="Carbide 3D table (approximate)"),
    "dewalt": dict(name="DeWalt DWP611",
                   dial=[(1, 16000), (2, 18200), (3, 20400), (4, 22600), (5, 24800), (6, 27000)],
                   source="even spread over DeWalt's 16000-27000 RPM spec - unverified"),
}
DEFAULT_ROUTER = "makita"     # the most common LowRider/MPCNC router
SPINUP_S = 3                  # s: dwell after the router relay switches on (--spindle-pin only)


def _table(router):
    return ROUTERS[router or DEFAULT_ROUTER]["dial"]


def router_dial(rpm, router=None):
    """Router dial setting (nearest half step) for a spindle speed. Outside the router's
    range it returns the end setting - see router_range_note()."""
    pts = _table(router)
    if rpm <= pts[0][1]:
        d = pts[0][0]
    elif rpm >= pts[-1][1]:
        d = pts[-1][0]
    else:
        for (d0, r0), (d1, r1) in zip(pts, pts[1:]):
            if r0 <= rpm <= r1:
                d = d0 + (d1 - d0) * (rpm - r0) / (r1 - r0)
                break
    d = round(d * 2) / 2
    return f"{d:g}"


def dial_rpm(dial, router=None):
    """RPM at a dial setting (interpolated between the marks)."""
    pts = _table(router)
    for (d0, r0), (d1, r1) in zip(pts, pts[1:]):
        if d0 <= dial <= d1:
            return r0 + (r1 - r0) * (dial - d0) / (d1 - d0)
    return pts[-1][1]


def router_range_note(rpm, router=None):
    """'' if the router can run at rpm, else a short warning for the comments."""
    pts = _table(router)
    lo, hi = pts[0][1], pts[-1][1]
    if rpm < lo * 0.97:
        return f" - {ROUTERS[router or DEFAULT_ROUTER]['name']} can't go below ~{lo} RPM: chips get thinner, watch for burning"
    if rpm > hi * 1.03:
        return f" - above this router's ~{hi} RPM max: chips get thicker, consider a lower feed"
    return ""


# ---- per-operation messages: "(MSG, 3/5 T3 Narrow gaps - ~6 min)" at the start of each op --
RAPID_MM_S = 50.0      # mm/s: rapid speed assumed by the estimates (LowRider XY; Z is slower)
TIME_FACTOR = 1.25     # short moves never reach the programmed feed: estimates x this


def op_minutes(op, tc):
    """Estimated run time of one op in minutes: moves at the tool controller's feeds (plunges
    at its vertical feed), rapids at RAPID_MM_S, arcs by their true length, x TIME_FACTOR."""
    import math
    hf, vf = max(float(tc.HorizFeed), 0.1), max(float(tc.VertFeed), 0.1)     # mm/s
    x = y = z = 0.0
    total = 0.0
    for c in op.Path.Commands:
        if c.Name not in ("G0", "G00", "G1", "G01", "G2", "G02", "G3", "G03"):
            continue
        p = c.Parameters
        nx, ny, nz = p.get("X", x), p.get("Y", y), p.get("Z", z)
        d = math.dist((x, y, z), (nx, ny, nz))
        if c.Name in ("G2", "G02", "G3", "G03") and ("I" in p or "J" in p):
            cx, cy = x + p.get("I", 0.0), y + p.get("J", 0.0)
            a0, a1 = math.atan2(y - cy, x - cx), math.atan2(ny - cy, nx - cx)
            sweep = (a0 - a1) if c.Name in ("G2", "G02") else (a1 - a0)
            sweep %= 2 * math.pi
            if sweep < 1e-9:
                sweep = 2 * math.pi if math.hypot(nx - x, ny - y) < 1e-6 else sweep
            d = math.hypot(math.hypot(p.get("I", 0.0), p.get("J", 0.0)) * sweep, nz - z)
        if c.Name in ("G0", "G00"):
            total += d / RAPID_MM_S
        else:
            plunge = abs(nz - z) > 1e-6 and math.hypot(nx - x, ny - y) < 1e-6
            total += d / (vf if plunge else hf)
        x, y, z = nx, ny, nz
    return total * TIME_FACTOR / 60.0


def op_name(op):
    """Short name for the pendant: the op's Comment if set, else its label without 'T<n>'."""
    import re
    name = (getattr(op, "Comment", "") or "").strip()
    if not name:
        name = re.sub(r"^T\d+\s*", "", op.Label.replace("_", " ")).strip() or op.Label
    return name.replace("(", "").replace(")", "")      # it goes inside a (MSG, ...) comment


def fmt_minutes(m):
    return "<1 min" if m < 1 else f"~{m:.0f} min"


def post_body(ops, tc):
    """G-code for one tool's ops from the GRBL post, without its preamble/postamble."""
    import importlib
    import tempfile
    grbl = importlib.import_module("Path.Post.scripts.grbl_post")
    tmp = os.path.join(tempfile.gettempdir(), "fluidnc-post.nc")
    # --translate_drill: G81/G83 drill cycles -> plain G0/G1 (FluidNC has no canned cycles)
    grbl.export([tc] + ops, tmp, "--no-show-editor --no-header --preamble= --postamble= --translate_drill")
    with open(tmp, encoding="utf-8") as f:
        return f.read().splitlines()


# ---- G-code clean-up and program assembly ----------------------------------------------

# FluidNC computes arcs in 32-bit floats (MotionControl.cpp mc_arc): with a huge radius the
# atan2f() of the cross product can get the WRONG SIGN, the G2/G3 correction then adds 2*pi
# (a near-full circle of that radius), and the uint16_t segment count overflows -> crash.
# GCode.cpp's arc check (0.5 mm / 0.1 % of radius) lets such arcs through. Risk starts when
# radius/chord approaches ~1e6; FreeCAD emits km-radius arcs on near-straight runs.
MAX_RADIUS_TO_CHORD = 1e4  # arcs whose radius is this many times their chord become G1 lines
                           # (the safety rule: ~100x margin below the ~1e6 danger ratio)
MAX_ARC_RADIUS = 10000.0   # mm: and any arc bigger than this - above anything a LowRider can
                           # cut, so real curves (an arched headboard, r = 1-3 m) stay arcs
ARC_TOLERANCE = 0.002      # mm: max deviation allowed when an arc is replaced by lines

# FluidNC rejects a line over 127 BYTES, comments included: GCode.cpp gc_execute_line copies it
# into char[128] and checks strlen before stripping comments -> "14 Line too long", ALARM:17,
# the job stops (verified in source and in the wasm sim, 2026-10-24). UTF-8: x / em dash = 2 / 3.
MAX_LINE = 127


def _nbytes(s):
    return len(s.encode("utf-8"))


def _cut(text, room):
    """text cut at a word boundary to fit room bytes, ending in '...'"""
    if _nbytes(text) <= room:
        return text
    words, out = text.split(" "), ""
    for w in words:
        nxt = (out + " " + w) if out else w
        if _nbytes(nxt) + 3 > room:
            break
        out = nxt
    if not out:                                    # one huge word: cut it by bytes
        out = text.encode("utf-8")[:max(0, room - 3)].decode("utf-8", "ignore")
    return out + "..."


def _wrap(text, room):
    """text split at word boundaries into pieces of at most room bytes"""
    pieces, cur = [], ""
    for w in text.split(" "):
        while _nbytes(w) > room:                   # a word longer than a line
            if cur:
                pieces.append(cur)
                cur = ""
            head = w.encode("utf-8")[:room].decode("utf-8", "ignore")
            pieces.append(head)
            w = w[len(head):]
        nxt = (cur + " " + w) if cur else w
        if _nbytes(nxt) > room and cur:
            pieces.append(cur)
            cur = w
        else:
            cur = nxt
    if cur:
        pieces.append(cur)
    return pieces


def fit_line(ln, warn=print):
    """one output line -> the lines to write, each within FluidNC's MAX_LINE bytes:
    a comment-only line wraps into several; an M0 / code line keeps its (MSG ...) cut short
    (warns: the message must stay on its M0); another trailing comment moves above the code;
    code alone that is too long is an error (nothing is cut silently)."""
    if _nbytes(ln) <= MAX_LINE:
        return [ln]
    if ln.startswith("(") and ln.endswith(")"):
        inner = ln[1:-1]
        if inner.startswith("MSG"):                # a lone message: keep it one message, cut short
            warn(f"fluidnc post: message cut to fit FluidNC's {MAX_LINE}-byte line: {ln}")
            return ["(" + _cut(inner, MAX_LINE - 2) + ")"]
        return ["(" + p + ")" for p in _wrap(inner, MAX_LINE - 2)]
    if "(" in ln and ln.endswith(")"):
        i = ln.index("(")
        code, inner = ln[:i].rstrip(), ln[i + 1:-1]
        if _nbytes(code) > MAX_LINE:
            raise ValueError(f"fluidnc post: G-code line over FluidNC's {MAX_LINE} bytes: {ln!r}")
        if inner.startswith("MSG"):
            warn(f"fluidnc post: message cut to fit FluidNC's {MAX_LINE}-byte line: {ln}")
            return [code + " (" + _cut(inner, MAX_LINE - _nbytes(code) - 3) + ")"]
        return ["(" + p + ")" for p in _wrap(inner, MAX_LINE - 2)] + [code]
    raise ValueError(f"fluidnc post: G-code line over FluidNC's {MAX_LINE} bytes: {ln!r}")


def linearize_big_arcs(lines, max_radius=MAX_ARC_RADIUS, tol=ARC_TOLERANCE):
    """Replace G2/G3 arcs whose radius exceeds max_radius with G1 segments that stay within
    tol of the arc (usually a single line). Assumes absolute XY (G90), XY plane (G17)."""
    import math
    import re
    pos = {}
    out = []
    num = lambda w, s: (lambda m: float(m.group(1)) if m else None)(re.search(w + r"(-?\d*\.?\d+)", s))
    for ln in lines:
        s = ln.strip()
        m = re.match(r"^(G0?[0123])\b", s)
        if not m:
            out.append(ln)
            continue
        code = m.group(1).replace("G0", "G") if len(m.group(1)) == 3 else m.group(1)
        end = {a: num(a, s) for a in "XYZ"}
        target = {a: (end[a] if end[a] is not None else pos.get(a)) for a in "XYZ"}
        if code in ("G2", "G3") and pos.get("X") is not None and pos.get("Y") is not None:
            i, j = num("I", s) or 0.0, num("J", s) or 0.0
            r = math.hypot(i, j)
            chord_len = math.hypot(target["X"] - pos["X"], target["Y"] - pos["Y"])
            if r > max_radius or (chord_len > 0 and r > MAX_RADIUS_TO_CHORD * chord_len):
                # Near-straight arc: always the SHORT way. Angles from atan2 are useless here -
                # with the centre ~km away, 0.001 mm rounding can put the start "behind" the
                # end and flip the sweep to almost a full circle. Use the chord instead.
                cx, cy = pos["X"] + i, pos["Y"] + j
                chord = math.hypot(target["X"] - pos["X"], target["Y"] - pos["Y"])
                sweep = 2 * math.asin(min(1.0, chord / (2 * r)))
                a0 = math.atan2(pos["Y"] - cy, pos["X"] - cx)
                bulge = r - math.sqrt(max(0.0, r * r - (chord / 2) ** 2))
                n = 1 if bulge <= tol else max(1, math.ceil(sweep / (2 * math.acos(max(-1.0, 1 - tol / r)))))
                f = num("F", s)
                z0, z1 = pos.get("Z"), target["Z"]
                for k in range(1, n + 1):
                    t = k / n
                    if k == n:
                        x, y = target["X"], target["Y"]
                    else:
                        ang = a0 - sweep * t if code == "G2" else a0 + sweep * t
                        x, y = cx + r * math.cos(ang), cy + r * math.sin(ang)
                    seg = f"G1 X{x:.3f} Y{y:.3f}"
                    if z1 is not None:
                        z = z1 if z0 is None else z0 + (z1 - z0) * t
                        seg += f" Z{z:.3f}"
                    if f is not None and k == 1:
                        seg += f" F{f:.3f}"
                    out.append(seg)
                pos.update({a: v for a, v in target.items() if v is not None})
                continue
        out.append(ln)
        pos.update({a: v for a, v in target.items() if v is not None})
    return out


def fluidnc_clean(lines, feed_params=None, z_params=None):
    """GRBL-post output tidied for FluidNC: arcs over MAX_ARC_RADIUS become lines (huge I/J
    can crash FluidNC); drop the K word on XY-plane arcs (FreeCAD writes
    K0.000; not needed), the commented-out M6, the router M3/M5 (manual router - the
    messages say what to do), and immediately repeated identical moves.
    G-code is modal, so X/Y/Z and F are written only when they change (FreeCAD repeats them
    on every line). Call once per section: the position starts unknown, so the first move
    after a bit change / probe is always complete."""
    import re
    out, last = [], {}                       # last value written per word (X, Y, Z, F)
    noise = ("(Begin preamble)", "(Begin postamble)", "(Begin toolchange)", "G17 G90", "G21", "G90")
    op = None                                # name of the operation being written
    for ln in linearize_big_arcs(lines):
        s = ln.strip()
        if not s or s.startswith("( M6") or re.match(r"^M[35]\b", s) or s in noise \
                or s.startswith("(Path: "):
            continue                         # (the program header sets G17 G21 G90)
        if s.startswith("(Begin operation: "):
            op = s[len("(Begin operation: "):-1]
        if s.startswith("("):
            if op is not None and s == f"({op})":
                continue                     # grbl_post repeats the op name as a comment
            out.append(s)
            continue
        words = re.findall(r"([A-Z])(-?\d*\.?\d+)", s)
        if not words:
            continue
        code = words[0][0] + words[0][1]
        if code not in ("G0", "G00", "G1", "G01", "G2", "G02", "G3", "G03"):
            out.append(s)                    # anything else: pass through, forget position
            last = {}
            continue
        arc = code in ("G2", "G02", "G3", "G03")
        keep = [code]
        for w, v in words[1:]:
            if w == "K" and arc:
                continue                     # XY-plane arcs only need I and J
            if w in ("X", "Y", "Z", "F"):
                # unchanged values are modal - except an arc's X/Y: GRBL-family controllers
                # reject an arc with no endpoint word in its plane
                if last.get(w) == v and not (arc and w in ("X", "Y")):
                    continue
                last[w] = v
            keep.append(w + v)
        if len(keep) == 1:
            continue                         # nothing changed: drop the move
        if z_params and code in ("G0", "G00"):   # G0 Z4.000 -> G0 Z#<clear_z>
            keep = [("Z" + z_params[round(float(w[1:]), 3)])
                    if w[0] == "Z" and round(float(w[1:]), 3) in z_params else w for w in keep]
        if feed_params:                      # F1200.000 -> F#<t1_feed> (FluidNC local parameter)
            keep = [("F" + feed_params[round(float(w[1:]), 3)])
                    if w[0] == "F" and round(float(w[1:]), 3) in feed_params else w for w in keep]
        line = " ".join(keep)
        if out and line == out[-1] and not arc:
            continue                         # (two identical arcs = a full circle: keep)
        out.append(line)
    return _drop_empty_ops(out)


def _drop_empty_ops(lines):
    """Remove (Begin operation: X) ... (Finish operation: X) blocks with no G-code in them -
    grbl_post writes one for the tool controller itself."""
    out, block = [], None
    for ln in lines:
        if ln.startswith("(Begin operation: "):
            out += block or []
            block = [ln]
        elif block is not None:
            block.append(ln)
            if ln.startswith("(Finish operation: "):
                if any(not b.startswith("(") for b in block):
                    out += block
                block = None
        else:
            out.append(ln)
    return out + (block or [])


def fluidnc_program(title, sections, plate=None, probe_xy=(10.0, 10.0), probe_to=-110.0,
                    probe_feed=200.0, clear=10.0, set_xy=True, spindle_pin=None,
                    origin="the start corner", probe_spot="uncut board top", params=True,
                    heights=None, router=None, stock=None, prior_jobs=None):
    """A FluidNC program in V1 Engineering's Jackpot / LowRider style
    (docs.v1e.com/tools/milling-basics, GRBL/Jackpot tabs):
      start      G10 L20 P0 X0 Y0 Z0 - wherever the bit was jogged to becomes the origin
                 (set_xy=False for a later tool's own file: home Z instead, keep X/Y)
      each bit   $HZ (home Z = all the way up), go to probe_xy, M0 + (MSG ...) to change the
                 bit and place the touch plate, G38.2 Z<probe_to> F<feed> P<plate> (FluidNC
                 sets work Z to the plate thickness on contact), clear to Z<clear>, M0 remove
                 the plate, then the router: M62 P<spindle_pin> if a relay is wired, else a
                 message with the router dial setting.
      end        router off, $HZ, M30
    sections = [dict(num, bit, rpm, lines)]. plate=None: no probing, zero Z by hand."""
    # FluidNC 4.1.x (PR #1811) checks a $-command's state guard BEFORE draining the planner:
    # $HZ (allowed only when Idle) arriving while moves are still queued is rejected, and a
    # file job stops on that error. G4 P0 drains the planner (waits until not in Cycle), so
    # the $HZ that follows sees Idle. See FluidNC ProcessSettings.cpp / Protocol.cpp.
    # $-lines must be bare: FluidNC strips comments only from gcode, so "$HZ (home Z)" would
    # be looked up as a setting named "HZ (home Z)" and fail.
    home_z = ["G4 P0 (finish queued moves, then home Z - FluidNC 4.1 rejects $HZ while moving)", "$HZ"]
    router = router or DEFAULT_ROUTER
    if router not in ROUTERS:
        raise ValueError(f"unknown router {router!r}: choose from {', '.join(ROUTERS)}")
    px, py = probe_xy
    out = [f"({title})", "(FluidNC post for FreeCAD - V1E Jackpot style. Run from the SD card.)"]
    # Stock simulation metadata (cnc-gcode-tools docs/stock-simulation-metadata.md); ToolDef
    # NAME= labels the bits. Each bit's section starts with its T word (FluidNC only records
    # the selected tool: nothing changes without M6), so ToolDef N is the tool controller's
    # own number, the same in the all-bits file and in a one-bit file.
    out += ["(CNCSIM 1 UNITS=mm)"]
    if stock:
        out.append("(Stock: " + " ".join(f"{k}={v:.4f}".rstrip("0").rstrip(".") for k, v in
                                         zip(("XMIN", "XMAX", "YMIN", "YMAX", "ZMIN", "ZMAX"), stock)) + ")")
    # files split per bit: every file that runs before this one, oldest first (bare names,
    # same folder) - the viewer carves those into the stock before this file
    for name in prior_jobs or []:
        name = os.path.basename(name)
        if "(" in name or ")" in name:
            raise ValueError(f"PriorJob file names can't contain parentheses: {name!r}")
        out.append(f"(PriorJob: {name})")
    out += [f"(ToolDef {sec['num']}: {sec['tooldef']})" for sec in sections if sec.get("tooldef")]
    out += ["G0 G54 G17 G21 G90 G94"]
    if params:
        # FluidNC local parameters (wiki: features/gcode_parameters_expressions): edit a value
        # here and every line that uses it follows. Local = this file only. Plain values only
        # (no expressions) so the body reads F#<t1_feed>, G0 Z#<clear_z>.
        mms = lambda v: f"{v:g} mm/min = {v / 60:.3g} mm/s"
        out += ["", "(===== Settings - edit here =====)", "(Feeds, mm/min)"]
        for sec in sections:
            for kind, what in (("feed", "cutting"), ("plunge", "plunging")):
                if sec.get(kind):
                    out.append(f"#<t{sec['num']}_{kind}>={sec[kind]:g} "
                               f"(T{sec['num']} {sec['bit']} - {what}: {mms(sec[kind])})")
        if heights:
            out += ["(Heights above the board top, mm)"]
            if heights.get("clear") is not None:
                out.append(f"#<clear_z>={heights['clear']:g} (rapids between regions)")
            if heights.get("safe") is not None:
                out.append(f"#<safe_z>={heights['safe']:g} (feed moves start from here)")
        if plate is not None:
            out += ["(Touch plate)",
                    f"#<plate>={plate:g} (plate thickness, mm)",
                    f"#<probe_feed>={probe_feed:g} ({mms(probe_feed)})",
                    f"#<probe_depth>={abs(probe_to):g} (probe goes down to Z-{abs(probe_to):g} at most, below the work zero)",
                    f"#<probe_clear>={clear:g} (Z after probing)",
                    f"#<probe_x>={px:g} (probe spot X)", f"#<probe_y>={py:g} (probe spot Y)"]
    v = (lambda name, num: f"#<{name}>") if params else (lambda name, num: num)
    probe_f, plate_w = v("probe_feed", f"{probe_feed:.0f}"), v("plate", f"{plate:.3f}" if plate is not None else "")
    # FluidNC can't negate a parameter in place (Z-#<x> is a format error): Z[-#<x>] it is
    probe_z = "[-#<probe_depth>]" if params else f"{probe_to:.1f}"
    probe_c = v("probe_clear", f"{clear:.1f}")
    probe_x, probe_y = v("probe_x", f"{px:.3f}"), v("probe_y", f"{py:.3f}")
    off = [f"M63 P{spindle_pin} (router relay off)"] if spindle_pin is not None else []
    # Messages in the user's style: "M0 (MSG, Change to Tool ... and Attach Probe)" then
    # "M0 (MSG, Remove Probe and Turn On Router ...)" - dust collection goes with the router.
    tool = lambda sec: f"Tool T{sec['num']} {sec['bit']}"
    # each op starts with "(MSG, 3/5 T3 Narrow gaps - ~6 min)" (FluidTouch shows the last MSG);
    # sections from export() carry ops = {label: (short name, minutes)}
    n_ops = sum(1 for sec in sections for ln in sec["lines"]
                if ln.startswith("(Begin operation: ") and ln[len("(Begin operation: "):-1] in sec.get("ops", {}))
    step = [0]
    if set_xy and sections:
        out += ["", f"(Start: {tool(sections[0])} in the router, jogged to {origin}, router off)"]
    for k, sec in enumerate(sections):
        dial = router_dial(sec["rpm"], router)
        mins = sum(m for _, m in sec.get("ops", {}).values())
        out += ["", f"(===== T{sec['num']}: {sec['bit']} - {ROUTERS[router]['name']} dial {dial} "
                    f"= ~{sec['rpm']:.0f} RPM{router_range_note(sec['rpm'], router)}"
                    + (f", {fmt_minutes(mins)}" if mins else "") + " =====)"]
        # the bit's number for previewers and the controller's T state; no M6, so no change
        out += [f"T{sec['num']}"]
        attach =" and Attach Probe" if plate is not None else " and Zero Z on the Board Top"
        if k == 0 and set_xy:
            # tool already in, jogged to the origin: set it now (as V1E's start block does)
            out += ["G10 L20 P0 X0 Y0 Z0 (here = X0 Y0, temporary Z0)"]
            ask = "Attach Probe" if plate is not None else "Zero Z on the Board Top"
        elif k == 0:
            out += home_z
            ask = f"Change to {tool(sec)}{attach} - keep X0 Y0"
        else:
            out += off + home_z
            # a hand-switched router is still running here: say so before hands go near the bit
            ask = ("" if spindle_pin is not None else "Turn Off Router, ") + f"Change to {tool(sec)}{attach}"
        if plate is not None:
            out += [f"G0 X{probe_x} Y{probe_y} (probe spot: {probe_spot})", f"(MSG, {ask})", "M0",
                    f"G38.2 Z{probe_z} F{probe_f} P{plate_w} (probe, Z = plate thickness)",
                    f"G0 Z{probe_c}"]
            on = "Remove Probe and Turn On Router"
        else:
            out += [f"(MSG, {ask})", "M0"]
            on = "Turn On Router"
        if spindle_pin is not None:
            # the relay switches the router: the message only asks for the dial setting
            relay_msg = f"Remove Probe - Router at Dial {dial}" if plate is not None else f"Router at Dial {dial}"
            out += [f"(MSG, {relay_msg})", "M0",
                    f"M62 P{spindle_pin} (router relay on)",
                    f"G4 P{SPINUP_S:g} (let the router reach speed)"]
        else:
            out += [f"(MSG, {on} at Dial {dial})", "M0"]
        for ln in sec["lines"]:
            label = ln[len("(Begin operation: "):-1] if ln.startswith("(Begin operation: ") else None
            if label in sec.get("ops", {}):
                name, mins = sec["ops"][label]
                step[0] += 1
                ln = f"(MSG, {step[0]}/{n_ops} T{sec['num']} {name} - {fmt_minutes(mins)})"
            out.append(ln)
    out += [""] + off + home_z + ["(MSG, Done)" if spindle_pin is not None else "(MSG, Done - Turn Off Router)", "M30"]
    # a ")" inside a comment ends it early: keep only the outer parentheses of each comment
    # "(MSG ...)" followed by "M0" -> one line "M0 (MSG ...)" (V1E style; the comment prints
    # while the line is parsed, then M0 pauses)
    merged = []
    for ln in out:
        if ln == "M0" and merged and merged[-1].startswith("(MSG"):
            merged[-1] = "M0 " + merged[-1]
        else:
            merged.append(ln)
    # Back-to-back pauses -> ONE pause with the messages joined: consecutive M0 prompts
    # confuse the FluidTouch pendant (and cost an extra Cycle Start).
    out = []
    for ln in merged:
        if ln.startswith("M0 (MSG, ") and out and out[-1].startswith("M0 (MSG, "):
            nxt = ln[len("M0 (MSG, "):]
            out[-1] = out[-1][:-1] + ", then " + nxt[:1].lower() + nxt[1:]
        else:
            out.append(ln)
    clean = []
    for ln in out:
        if ln.startswith("$") and ("(" in ln or ";" in ln):
            raise ValueError(f"FluidNC $-commands can't carry comments: {ln!r}")
        if "(" in ln and ln.endswith(")"):
            i = ln.index("(")
            ln = ln[:i + 1] + ln[i + 1:-1].replace("(", "[").replace(")", "]") + ")"
        clean.extend(fit_line(ln))                 # FluidNC's 127-byte line limit
    return "\n".join(clean) + "\n"


def _tool_controller(o):
    while o is not None:
        tc = getattr(o, "ToolController", None)
        if tc is not None:
            return tc
        o = getattr(o, "Base", None)
        o = o if hasattr(o, "Path") else None
    return None


def _mm(tool, name):
    v = getattr(tool, name, None)
    v = getattr(v, "Value", v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _tooldef(tool):
    """ToolDef fields for the viewer's stock simulation (cnc-gcode-tools
    docs/stock-simulation-metadata.md): SHAPE=... D=... in mm, angles in degrees, FLUTES=n,
    LEN=flute length, OAL=overall length, NAME=label (last: the rest of the line)."""
    fields = _tool_shape(tool)
    try:
        flutes = int(getattr(tool, "Flutes", 0) or 0)
    except (TypeError, ValueError):
        flutes = 0
    if fields and flutes > 0:
        fields += f" FLUTES={flutes}"
    # LEN = flute (cutting edge) length, OAL = overall length, mm
    n = lambda v: f"{v:.4f}".rstrip("0").rstrip(".")
    for key, prop in (("LEN", "CuttingEdgeHeight"), ("OAL", "Length")):
        v = _mm(tool, prop)
        if fields and v and v > 0:
            fields += f" {key}={n(v)}"
    # NAME= goes last: its value is the rest of the line (spaces allowed)
    name = " ".join(str(getattr(tool, "Label", "") or "").split())
    return f"{fields} NAME={name}" if fields and name else fields


def _tool_shape(tool):
    if tool is None:
        return None
    shape = (getattr(tool, "ShapeID", "") or getattr(tool, "ShapeName", "")
             or os.path.splitext(os.path.basename(str(getattr(tool, "BitShape", ""))))[0]
             or getattr(tool, "ShapeType", "")).lower()
    d, n = _mm(tool, "Diameter"), lambda v: f"{v:.4f}".rstrip("0").rstrip(".")
    if not d:
        return None
    if shape in ("ballend", "ballnose"):
        return f"SHAPE=ball D={n(d)}"
    if shape == "bullnose":
        # FreeCAD 1.1: CornerRadius; older bits: FlatRadius (radius of the flat bottom)
        cr = _mm(tool, "CornerRadius")
        if cr is None and _mm(tool, "FlatRadius") is not None:
            cr = d / 2 - _mm(tool, "FlatRadius")
        if cr is not None:
            return f"SHAPE=bullnose D={n(d)} CR={n(min(d / 2, max(0.0, cr)))}"
    if shape in ("v-bit", "vbit", "chamfer"):
        angle, tip = _mm(tool, "CuttingEdgeAngle") or 90.0, _mm(tool, "TipDiameter") or 0.0
        return f"SHAPE={'chamfer' if shape == 'chamfer' else 'vbit'} D={n(d)} ANGLE={n(angle)} TIP={n(tip)}"
    if shape == "drill":
        return f"SHAPE=vbit D={n(d)} ANGLE={n(_mm(tool, 'TipAngle') or 118.0)}"
    if shape == "taperedballnose":
        # ball tip of diameter TIP (FreeCAD's Diameter) blending into a cone of included
        # angle ANGLE, up to the cutting diameter D (TaperDiameter)
        top = _mm(tool, "TaperDiameter") or _mm(tool, "ShankDiameter") or d
        return f"SHAPE=taperball D={n(top)} ANGLE={n(_mm(tool, 'TaperAngle') or 90.0)} TIP={n(d)}"
    return f"SHAPE=flat D={n(d)}"


def _stock(objectslist):
    """The Job's stock bounding box (mm, same coordinates as the posted moves), or None."""
    seen, todo = set(), list(objectslist)
    while todo:
        o = todo.pop()
        if o is None or o.Name in seen:
            continue
        seen.add(o.Name)
        if hasattr(o, "Stock") and hasattr(o, "Operations"):
            shape = getattr(o.Stock, "Shape", None)
            if shape is None or shape.isNull():
                return None
            bb = shape.BoundBox
            return (bb.XMin, bb.XMax, bb.YMin, bb.YMax, bb.ZMin, bb.ZMax)
        todo += list(getattr(o, "InList", []))
    return None


def _sections(objectslist, params=True, z_params=None):
    """Split the posted objects into consecutive runs that use the same tool."""
    runs = []
    for o in objectslist:
        if hasattr(o, "Tool") and hasattr(o, "SpindleSpeed"):     # a ToolController itself
            continue
        if not hasattr(o, "Path") or getattr(o, "Active", True) is False:
            continue
        tc = _tool_controller(o)
        if tc is None:
            continue
        if not runs or runs[-1][0] is not tc:
            runs.append((tc, []))
        runs[-1][1].append(o)
    out = []
    for tc, ops in runs:
        bit = getattr(getattr(tc, "Tool", None), "Label", "") or tc.Label
        feed, plunge = round(float(tc.HorizFeed) * 60, 3), round(float(tc.VertFeed) * 60, 3)   # mm/min
        names = ({feed: f"#<t{tc.ToolNumber}_feed>", plunge: f"#<t{tc.ToolNumber}_plunge>"}
                 if params else None)                       # mm/min parameters (header)
        out.append(dict(num=tc.ToolNumber, bit=bit, rpm=float(tc.SpindleSpeed), feed=feed, plunge=plunge,
                        tooldef=_tooldef(getattr(tc, "Tool", None)),
                        lines=fluidnc_clean(post_body(ops, tc), names, z_params if params else None),
                        ops={o.Label: (op_name(o), op_minutes(o, tc)) for o in ops}))
    return out


def _heights(objectslist):
    """The ops' clearance / safe heights, if all ops agree (else None for that one)."""
    found = {"clear": set(), "safe": set()}
    for o in objectslist:
        for key, prop in (("clear", "ClearanceHeight"), ("safe", "SafeHeight")):
            if hasattr(o, prop) and hasattr(o, "Path"):
                found[key].add(round(float(getattr(o, prop)), 3))
    return {k: (next(iter(v)) if len(v) == 1 else None) for k, v in found.items()}


def export(objectslist, filename, argstring):
    args = parser.parse_args(shlex.split(argstring or ""))
    x, y = (float(v) for v in args.probe_xy.split(","))
    heights = _heights(objectslist)
    z_params = {}
    if heights.get("clear") is not None:
        z_params[round(heights["clear"], 3)] = "#<clear_z>"
    if heights.get("safe") is not None:
        z_params.setdefault(round(heights["safe"], 3), "#<safe_z>")
    sections = _sections(objectslist, params=not args.no_params, z_params=z_params)
    if not sections:
        raise ValueError("fluidnc post: no active operations with a tool controller to post")
    title = args.title or (f"T{sections[0]['num']}" if len(sections) == 1 else "all tools")
    gcode = fluidnc_program(title, sections, plate=args.plate, probe_xy=(x, y),
                                probe_to=args.probe_to, set_xy=not args.keep_xy,
                                spindle_pin=args.spindle_pin, origin=args.origin,
                                probe_spot=args.probe_spot, params=not args.no_params,
                                heights=heights, router=args.router, stock=_stock(objectslist),
                                prior_jobs=args.prior_job)
    if filename and filename != "-":
        with open(filename, "w", encoding="utf-8") as f:
            f.write(gcode)
    return gcode
