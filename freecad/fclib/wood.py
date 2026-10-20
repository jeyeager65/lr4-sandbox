# Woodworking: stock sizes, fractions, cut lists, board packing and sheet nesting.
# All dimensions in inches (call core.set_units("in") in wood projects).
#
# Tag each Model part with what it is cut from, then write the cut list:
#   m.add("Leg1", box(...), group="Frame", colour=PINE, cut=board("2x4"))
#   m.add("Top", box(...), group="Panels", colour=PLY, cut=sheet(0.625))
#   m.add("Casters", ..., cut=hardware("3in plate caster", qty=4))
#   text = cut_list(m, "Shelf")          # markdown: buy list, cutting plans, nesting
#
# Lengths/widths left out are read from the part's bounding box (longest side = length),
# which is right for parts that are axis-aligned boxes. Give them explicitly for angled
# or shaped parts (and say "long point" in the note).

import math
import FreeCAD as App

IN = 25.4

# --- stock -------------------------------------------------------------------------------
LUMBER = {                      # nominal -> (thickness, width) actual
    "1x2": (0.75, 1.5), "1x3": (0.75, 2.5), "1x4": (0.75, 3.5), "1x6": (0.75, 5.5),
    "1x8": (0.75, 7.25), "2x2": (1.5, 1.5), "2x3": (1.5, 2.5), "2x4": (1.5, 3.5),
    "2x6": (1.5, 5.5), "2x8": (1.5, 7.25), "4x4": (3.5, 3.5),
}
BOARD_LENGTH = 96.0             # 8 ft
PLY_ON_HAND = (0.4375, 0.625)   # 7/16" and 5/8" - what's usually in the shop
PLY = {"1/4": 0.25, "7/16": 0.4375, "1/2": 0.5, "5/8": 0.625, "3/4": 0.75}   # nominal (measure yours)
SHEET = (48.0, 96.0)
KERF = 0.125
EDGE_TRIM = 0.25                # trimmed off factory sheet edges before nesting

PINE = (0.87, 0.72, 0.50)       # preview colours
PLYWOOD = (0.80, 0.62, 0.38)
HARDWARE = (0.15, 0.15, 0.17)
EXISTING = (0.62, 0.62, 0.66)   # use with transparency 40 for parts already built


def board(stock="2x4", length=None, rip=None, note=""):
    """A part cut from dimensional lumber. rip = width after ripping (None = full width)."""
    return dict(kind="board", stock=stock, length=length, rip=rip, note=note)


def sheet(t=None, w=None, l=None, grain=False, note=""):
    """A part cut from sheet goods. grain=True keeps the length along the sheet's 96"."""
    return dict(kind="sheet", t=t, w=w, l=l, grain=grain, note=note)


def hardware(desc, qty=1, note=""):
    return dict(kind="hw", desc=desc, qty=qty, note=note)


# --- formatting --------------------------------------------------------------------------
def frac(x, den=16, mark='"'):
    """2.5625 -> '2 9/16"' (rounded to 1/den)."""
    n = round(x * den)
    whole, rem = divmod(n, den)
    if rem == 0:
        return f"{whole}{mark}"
    g = math.gcd(rem, den)
    return f"{whole} {rem // g}/{den // g}{mark}" if whole else f"{rem // g}/{den // g}{mark}"


def floor16(v):
    return math.floor(v * 16 + 1e-6) / 16.0


# --- packing -----------------------------------------------------------------------------
def pack_linear(pieces, stock=BOARD_LENGTH, kerf=KERF):
    """First-fit decreasing: [(length, label)] -> boards, each a list of pieces."""
    boards = []
    used = lambda b: sum(p[0] for p in b) + kerf * len(b)
    for pc in sorted(pieces, key=lambda p: -p[0]):
        if pc[0] > stock:
            raise ValueError(f"{pc[1] or 'piece'} is {frac(pc[0])}, longer than the {frac(stock)} stock")
        for b in boards:
            if used(b) + kerf + pc[0] <= stock:
                b.append(pc)
                break
        else:
            boards.append([pc])
    return boards


class _Sheet:
    def __init__(self, w, l, spacing):
        self.W, self.L = w, l                    # x = across (48), y = along the grain (96)
        self.free = [(0.0, 0.0, w + spacing, l + spacing)]
        self.placed = []                         # (label, x, y, w, l, rotated)


def _prune(free):
    keep = []
    for i, r in enumerate(free):
        inside = any(i != j and o[0] <= r[0] + 1e-9 and o[1] <= r[1] + 1e-9 and
                     o[0] + o[2] >= r[0] + r[2] - 1e-9 and o[1] + o[3] >= r[1] + r[3] - 1e-9 and
                     (o != r or j < i) for j, o in enumerate(free))
        if not inside:
            keep.append(r)
    return keep


def _place(s, label, x, y, w, l, rot, spacing):
    s.placed.append((label, x, y, w, l, rot))
    W, L = w + spacing, l + spacing
    nf = []
    for fx, fy, fw, fh in s.free:
        if x >= fx + fw or x + W <= fx or y >= fy + fh or y + L <= fy:
            nf.append((fx, fy, fw, fh))
            continue
        if x > fx:
            nf.append((fx, fy, x - fx, fh))
        if x + W < fx + fw:
            nf.append((x + W, fy, fx + fw - x - W, fh))
        if y > fy:
            nf.append((fx, fy, fw, y - fy))
        if y + L < fy + fh:
            nf.append((fx, y + L, fw, fy + fh - y - L))
    s.free = _prune([r for r in nf if r[2] > 0.3 and r[3] > 0.3])


def nest_sheets(parts, sheet_size=SHEET, spacing=KERF, trim=EDGE_TRIM):
    """MaxRects nesting of [(label, w, l, grain)] onto sheets (w across, l along the grain).
    Tries several orderings and keeps the one using the fewest sheets.
    Returns [_Sheet] with .placed = [(label, x, y, w, l, rotated)]."""
    W, L = sheet_size[0] - 2 * trim, sheet_size[1] - 2 * trim

    def once(order):
        sheets = []

        def best(p):
            label, w, l, grain = p
            top = None
            for s in sheets:
                for rot in ((False,) if grain else (False, True)):
                    pw, pl = (l, w) if rot else (w, l)
                    for fx, fy, fw, fh in s.free:
                        if pw + spacing <= fw + 1e-9 and pl + spacing <= fh + 1e-9:
                            score = (min(fw - pw, fh - pl), max(fw - pw, fh - pl))
                            if top is None or score < top[0]:
                                top = (score, s, fx, fy, pw, pl, rot)
            return top

        for p in order:
            spot = best(p)
            if spot is None:
                sheets.append(_Sheet(W, L, spacing))
                spot = best(p)
                if spot is None:
                    raise ValueError(f"{p[0]} ({frac(p[1])} x {frac(p[2])}) doesn't fit a sheet")
            _, s, x, y, pw, pl, rot = spot
            _place(s, p[0], x, y, pw, pl, rot, spacing)
        return sheets

    keys = [lambda p: -(p[1] * p[2]), lambda p: -max(p[1], p[2]),
            lambda p: -min(p[1], p[2]), lambda p: -(p[1] + p[2])]
    return min((once(sorted(parts, key=k)) for k in keys), key=len)


def sheet_svg(s, scale=6.0):
    """One nested sheet as an SVG string (for the HTML/markdown cut plan)."""
    w, h = s.W * scale, s.L * scale
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
           f'viewBox="0 0 {w:.0f} {h:.0f}"><rect width="{w:.0f}" height="{h:.0f}" fill="#f4ecdc" stroke="#333"/>']
    for label, x, y, pw, pl, rot in s.placed:
        out.append(f'<rect x="{x * scale:.1f}" y="{y * scale:.1f}" width="{pw * scale:.1f}" '
                   f'height="{pl * scale:.1f}" fill="#d9b47c" stroke="#333"/>'
                   f'<text x="{(x + pw / 2) * scale:.1f}" y="{(y + pl / 2) * scale:.1f}" font-size="11" '
                   f'text-anchor="middle" dominant-baseline="middle">{label}</text>')
    return "".join(out) + "</svg>"


# --- cut list ----------------------------------------------------------------------------
def part_kind(name):
    """'SideLeft2' -> 'Side': what identical parts are grouped under."""
    base = name.rstrip("0123456789")
    for word in ("Left", "Right", "Front", "Back", "Top", "Bottom"):
        if base != word and base.endswith(word):
            base = base[: -len(word)]
    return base or name


def _dims_in(shape):
    bb = shape.BoundBox
    return sorted(d / IN for d in (bb.XLength, bb.YLength, bb.ZLength))      # t, w, l


def resolve(model):
    """Fill in missing cut dimensions from each part's bounding box: [(name, cut)]."""
    out = []
    for p in model.parts:
        cut = p["cut"]
        if cut is None:
            continue
        cut = dict(cut)
        if cut["kind"] in ("board", "sheet"):
            t, w, l = _dims_in(p["shape"])
            if cut["kind"] == "board":
                cut["length"] = cut["length"] or l
            else:
                cut["t"], cut["w"], cut["l"] = cut["t"] or t, cut["w"] or w, cut["l"] or l
        out.append((p["name"], cut))
    return out


def cut_list(model, title, intro=(), extra=(), board_length=BOARD_LENGTH, sheet_size=SHEET, nest=True):
    """Markdown cut list for a Model: lumber with a buy list and cutting plan, sheet parts
    with nesting per thickness, hardware. extra = hardware(...) items with no part."""
    rows = {}
    for name, c in resolve(model) + [(h["desc"], h) for h in extra]:
        if c["kind"] == "board":
            key = ("board", part_kind(name), c["stock"], round(c["length"] * 16) / 16, c["rip"], c["note"])
        elif c["kind"] == "sheet":
            key = ("sheet", part_kind(name), round(c["t"], 4), round(c["w"] * 16) / 16,
                   round(c["l"] * 16) / 16, c["grain"], c["note"])
        else:
            key = ("hw", c["desc"], c["note"])
        rows.setdefault(key, []).append((name, c))

    out = [f"# {title}: cut list"] + (["", *intro] if intro else [])
    boards = sorted((k, v) for k, v in rows.items() if k[0] == "board")
    if boards:
        out += ["", "## Lumber", "", "| Qty | Part | Stock | Length | Notes |", "|---|---|---|---|---|"]
        by_stock = {}
        for (_, kind, stock, length, rip, note), names in sorted(boards, key=lambda kv: (kv[0][2], -kv[0][3])):
            what = stock if rip is None else f"{stock} ripped to {frac(rip)}"
            out.append(f"| {len(names)} | {kind} | {what} | {frac(length)} | {note} |")
            by_stock.setdefault(stock, []).extend([(length, kind)] * len(names))
        for stock, pieces in sorted(by_stock.items()):
            plan = pack_linear(pieces, board_length)
            out += ["", f"**Buy {len(plan)} x {frac(board_length / 12, mark='')} ft {stock}** "
                        f"({frac(KERF)} kerf):", ""]
            for i, b in enumerate(plan, 1):
                rest = board_length - sum(p[0] for p in b) - KERF * len(b)
                out.append(f"- Board {i}: " + " + ".join(f"{frac(L)} {lab}" for L, lab in b) +
                           f"  (offcut {frac(max(rest, 0))})")

    sheets = [(k, v) for k, v in rows.items() if k[0] == "sheet"]
    if sheets:
        out += ["", "## Sheet goods", "", "| Qty | Part | Thickness | Width x Length | Notes |",
                "|---|---|---|---|---|"]
        by_t = {}
        for (_, kind, t, w, l, grain, note), names in sorted(sheets, key=lambda kv: (-kv[0][2], kv[0][1])):
            g = " (grain along length)" if grain else ""
            out.append(f"| {len(names)} | {kind} | {frac(t)} | {frac(w)} x {frac(l)} | {note}{g} |")
            for n, _ in names:
                by_t.setdefault(t, []).append((n, w, l, grain))
        for t, parts in sorted(by_t.items()):
            area = sum(w * l for _, w, l, _ in parts)
            line = f"{frac(t)}: {area / 144:.1f} sq ft ({area / (sheet_size[0] * sheet_size[1]):.0%} of a sheet)"
            if nest:
                nested = nest_sheets(parts, sheet_size)
                line += f", nests on **{len(nested)} sheet(s)**"
                out += ["", line, ""]
                for i, s in enumerate(nested, 1):
                    out.append(f"- Sheet {i}: " + ", ".join(
                        f"{lab} {frac(pw)} x {frac(pl)}{' (rotated)' if rot else ''}"
                        for lab, _, _, pw, pl, rot in s.placed))
            else:
                out += ["", line]

    hw = [(k, v) for k, v in rows.items() if k[0] == "hw"]
    if hw:
        out += ["", "## Hardware", "", "| Qty | Item | Notes |", "|---|---|---|"]
        for (_, desc, note), names in sorted(hw):
            out.append(f"| {sum(c['qty'] for _, c in names)} | {desc} | {note} |")
    return "\n".join(out) + "\n"
