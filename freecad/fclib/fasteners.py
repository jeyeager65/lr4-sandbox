# Fasteners placed and checked along their own axis, against the parts they join (meshes or solids).
#
# A screw/bolt is a line: head seat point p, unit direction d (head -> tip). Everything is measured
# with rays parallel to that line at a few radii, through the triangles of the parts near it:
#   - head seat: the first material of the head part at the head's bearing radius (so a head drops
#     to the floor of its counterbore / hex recess, or sits on a plain face)
#   - nut seat: the far end of a stretch of the nut part's material at the nut's bearing radius, with
#     room for the nut after it (a hex pocket floor, a hidden nut slot, or the part's far face)
#   - the chain of parts the shank passes through, thread engagement, how far the tip sticks out past
#     the nut, and anything the head, shank or nut runs into (a part with no hole there, a belt...)
#
#   from fclib import fasteners as fx
#   parts = {name: mesh_or_shape, ...}
#   s = fx.place(parts, p, d, 5.0, 30.0, "button", head="Plate", nut="Brace")
#   print(fx.describe(s)); solid = fx.solid(s)
#
# Threads: hw.button_screw / hex_bolt / wood_screw(thread=True) model them (revolved V profile, not a
# helix); fx.thread_info(spec) gives the threaded stretch for viewers that draw threads as a texture.

import math

import numpy as np
import FreeCAD as App

from fclib import hw, mesh

V = App.Vector
PITCH = {2.5: 0.45, 3.0: 0.5, 4.0: 0.7, 5.0: 0.8, 6.0: 1.0, 8.0: 1.25}   # ISO coarse
WOOD_PITCH = {4.0: 1.8}                                                     # M4 / #8 wood screw
STD_LENGTHS = {2.5: (6, 8, 10, 12, 16, 20), 3.0: (6, 8, 10, 12, 16, 20, 25, 30),
               4.0: (12, 16, 20, 25, 30), 5.0: (10, 12, 16, 20, 25, 30, 35, 40, 45),
               8.0: (20, 25, 30, 35, 40, 45, 50, 55, 60)}
HEX_THREAD = {8.0: 22.0}       # ISO 4014 thread length b for the partly threaded hex bolts (L <= 125)


def head_dims(kind, d):
    """(radius, height) of a head: button (ISO 7380), hex (ISO 4014), pan / wood (pan-ish)."""
    if kind == "hex":
        af = 1.6 * d if d < 8 else 13.0
        return af / math.sqrt(3), 0.65 * d
    if kind in ("pan", "wood"):
        return d, 0.6 * d
    return 0.95 * d, 0.55 * d


def nut_dims(d):
    """(across flats, nylock height)."""
    return hw.NUT_AF.get(d, 1.6 * d), hw.LOCKNUT_H.get(d, 0.8 * d)


def _frame(d):
    d = V(d)
    d.normalize()
    u = d.cross(V(0, 0, 1)) if abs(d.z) < 0.9 else d.cross(V(1, 0, 0))
    u.normalize()
    return d, u, d.cross(u)


class Line:
    """The triangles of `parts` near the line p + t d (within rmax), in the line's frame, for rays
    parallel to it."""

    def __init__(self, parts, p, d, rmax=14.0):
        self.p, (self.d, self.u, self.v) = V(p), _frame(d)
        o = np.array(tuple(self.p))
        M = np.array([tuple(self.u), tuple(self.v), tuple(self.d)])
        self.tris = {}
        for name, obj in parts.items():
            bb = obj.BoundBox
            c = V(bb.Center)
            w = c - self.p
            off = w - self.d * w.dot(self.d)
            if off.Length > rmax + bb.DiagonalLength / 2:
                continue
            a, b, cc = mesh._triangles(obj)
            L = [(x - o) @ M.T for x in (a, b, cc)]          # (u, v, t) per corner
            lo = np.minimum(np.minimum(L[0], L[1]), L[2])
            hi = np.maximum(np.maximum(L[0], L[1]), L[2])
            keep = (lo[:, 0] <= rmax) & (hi[:, 0] >= -rmax) & (lo[:, 1] <= rmax) & (hi[:, 1] >= -rmax)
            if keep.any():
                self.tris[name] = [x[keep] for x in L]
        self.names = list(self.tris)

    def hits(self, name, ou, ov):
        """Sorted t where the ray (ou, ov) + t d crosses part `name`."""
        if name not in self.tris:
            return []
        A, B, C = self.tris[name]
        x0, y0 = A[:, 0] - ou, A[:, 1] - ov
        e1x, e1y = B[:, 0] - A[:, 0], B[:, 1] - A[:, 1]
        e2x, e2y = C[:, 0] - A[:, 0], C[:, 1] - A[:, 1]
        det = e1x * e2y - e1y * e2x
        ok = np.abs(det) > 1e-12
        det = np.where(ok, det, 1.0)
        s = (-x0 * e2y + y0 * e2x) / det                      # barycentric of (ou, ov)
        r = (-e1x * y0 + e1y * x0) / det
        hit = ok & (s >= 0) & (r >= 0) & (s + r <= 1)
        t = A[hit, 2] + s[hit] * (B[hit, 2] - A[hit, 2]) + r[hit] * (C[hit, 2] - A[hit, 2])
        return sorted(set(np.round(t, 4).tolist()))

    def solid(self, name, r=0.0, n=6, mode="any"):
        """Stretches (t0, t1) of part `name` along the line at radius r: n rays round the line (one on
        the axis if r == 0), merged ("any": material if any ray is in it; "all": every ray)."""
        rays = [(0.0, 0.0)] if r <= 0 else [(r * math.cos(a), r * math.sin(a))
                                            for a in (2 * math.pi * (k + 0.137) / n for k in range(n))]
        per = []
        for ou, ov in rays:
            h = self.hits(name, ou, ov)
            per.append([(h[i], h[i + 1]) for i in range(0, len(h) - 1, 2)])
        if mode == "all":
            out = per[0]
            for iv in per[1:]:
                out = [(max(a0, b0), min(a1, b1)) for a0, a1 in out for b0, b1 in iv if min(a1, b1) > max(a0, b0)]
            return sorted(out)
        ev = sorted(x for iv in per for x in iv)
        out = []
        for a, b in ev:
            if out and a <= out[-1][1] + 1e-6:
                out[-1] = (out[-1][0], max(out[-1][1], b))
            else:
                out.append((a, b))
        return out


def _overlap(iv, t0, t1):
    return sum(max(0.0, min(b, t1) - max(a, t0)) for a, b in iv)


def place(parts, p, d, size, length, kind="button", head=None, nut=None, after=None, tapped=(), ignore=(),
          head_seat=None, nut_seat=None, through=None, rmax=14.0, label=""):
    """Place and check one fastener on the line p + t d (d from the head toward the tip; p anywhere on
    the line before the head part). head = the part the head bears on; nut = the part whose far side
    (or hex pocket / nut slot) takes the nylock (None: no nut - the screw threads into `tapped` parts
    or self-taps into the last printed part); after = the nut must sit beyond this t (e.g. past a
    bearing). head_seat / nut_seat = fixed t instead of searching. through = parts the shank may pass
    through without a hole (tapped metal, wood). ignore = parts left out of the checks (e.g. the
    bearing on the bolt). Returns a spec dict (see describe)."""
    line = Line({k: v for k, v in parts.items() if k not in ignore}, p, d, rmax)
    hr, hh = head_dims(kind, size)
    af, nh = nut_dims(size)
    s = dict(size=size, length=length, kind=kind, d=tuple(line.d), head_part=head, nut_part=nut, label=label,
             notes=[], flags=[])
    # head seat: first material of the head part at 0.8 x head radius (recess floor or plain face)
    if head_seat is None:
        iv = line.solid(head, 0.8 * hr) if head else []
        if not iv:
            s["flags"].append(f"head part {head} not on the line")
            head_seat = 0.0
        else:
            # the stretch of the head part the screw's own hole runs through (its walls hug the shank); the
            # head sits where material at head radius starts on that stretch (face, or counterbore floor)
            holes = [w for w in line.solid(head, size / 2 + 0.45, 8, "all") if w[1] - w[0] > 0.5]
            head_seat = iv[0][0]
            if holes:
                h0 = holes[0][0]
                own = [a for a, b in iv if a <= h0 + 0.05 <= b + 0.05]
                head_seat = own[0] if own else h0
    seat = line.p + line.d * head_seat
    s["seat"] = tuple(seat)
    tip = length                                       # all t from here on are from the seat
    sh = lambda iv: [(a - head_seat, b - head_seat) for a, b in iv]
    # what the shank passes through (at just outside the shank: the hole wall), in order
    chain = []
    for name in line.names:
        for a, b in sh(line.solid(name, size / 2 + 0.45, 8, "all")):
            if b > 0.02 and a < tip:
                chain.append((name, round(max(a, 0.0), 2), round(min(b, tip), 2)))
    chain.sort(key=lambda c: c[1])
    s["chain"] = chain
    for (n1, a1, b1), (n2, a2, b2) in zip(chain, chain[1:]):    # parts the screw clamps must not overlap
        if n1 != n2 and a2 < b1 - 0.3:
            s["flags"].append(f"{n2} overlaps {n1} by {b1 - a2:.1f} mm along the screw")
    # head recess: is the head below the head part's own surface? (how deep it sits)
    if head:
        top = sh(line.solid(head, 1.05 * hr, 8))
        outer = [a for a, b in top if a < -0.01]
        s["head_sunk"] = round(-min(outer), 2) if outer else 0.0
    # nut
    nut_t = None
    if nut is not None:
        ring = 0.85 * af / 2
        iv = sh(line.solid(nut, ring))
        others = [sh(line.solid(n, ring)) for n in line.names]
        floor = (after - head_seat) if after is not None else 0.5
        if nut_seat is not None:
            nut_t = nut_seat - head_seat
        else:
            for a, b in iv:
                if b <= floor:
                    continue
                nxt = min([x for o in others for x, y in o if x > b + 0.05] + [1e9])
                if nxt - b >= 0.6 * nh:                   # room for (most of) the nut
                    nut_t = b
                    break
        if nut_t is None:
            s["flags"].append(f"no seat for the nut on {nut}")
        else:
            s["nut"] = dict(t=round(nut_t, 3), h=nh, af=af)
            pk = mesh.find_pocket(parts[nut], line.p + line.d * head_seat, line.d, nut_t + 0.2, nut_t + nh - 0.2, af) \
                if nut in parts else None
            if pk:
                s["nut"]["corner"] = tuple(pk[2])
                s["nut"]["pocket"] = True
            s["protrude"] = round(tip - (nut_t + nh), 2)  # thread past the nylock's top
            if tip < nut_t + nh - 0.01:
                s["flags"].append(f"too short: tip {tip - nut_t - nh:+.1f} mm short of the nylock top")
    else:
        last = chain[-1] if chain else None
        if last:
            s["engage"] = round(min(tip, last[2]) - last[1], 2)
            s["engage_part"] = last[0]
            if last[2] < tip - 0.05 and last[0] not in (through or ()):
                s["notes"].append(f"tip {tip - last[2]:.1f} mm past {last[0]}")
    # head seat corner (hex head in a hex recess)
    if kind == "hex" and head and s.get("head_sunk", 0) > 0.5:
        pk = mesh.find_pocket(parts[head], seat, line.d * -1, 0.2, hh - 0.2, 2 * hr * math.sqrt(3) / 2)
        if pk:
            s["head_corner"] = tuple(pk[2])
    # collisions: head body, shank axis, nut body - with every part near the line
    hit = []
    r_head = 0.95 * hr * math.sqrt(3) / 2 if kind == "hex" else 0.9 * hr   # hex: inside the flats (it may sit
    for name in line.names:                                                # turned to fit a hex recess)
        iv = sh(line.solid(name, r_head, 8))
        o = _overlap(iv, -hh + 0.05, -0.05)
        if o > 0.05:
            hit.append((name, "head", round(o, 2)))
        if name not in (through or ()) and name not in tapped:
            o = _overlap(sh(line.solid(name, 0.0)), 0.05, tip - 0.05)
            if o > 0.3:                                   # (< 0.3: bottoming in a blind printed hole - fine)
                hit.append((name, "shank", round(o, 2)))
        if nut_t is not None:
            o = _overlap(sh(line.solid(name, 0.9 * af / 2, 8)), nut_t + 0.05, nut_t + nh - 0.05)
            if o > 0.05:
                hit.append((name, "nut", round(o, 2)))
        if tip > (nut_t + nh if nut_t is not None else (chain[-1][2] if chain else 0)) + 0.1:
            o = _overlap(sh(line.solid(name, 0.0)), (nut_t + nh) if nut_t is not None else chain[-1][2] if chain else 0,
                         tip)
            if o > 0.3 and name not in tapped and name not in (through or ()) and not any(h[0] == name and h[1] == "shank" for h in hit):
                hit.append((name, "tip", round(o, 2)))
    s["hits"] = hit
    for name, where, o in hit:
        s["flags"].append(f"{where} runs {o:.1f} mm into {name}")
    return s


def thread_info(s):
    """(t0, t1, pitch, r_major, r_minor) of the threaded stretch, t from the head seat."""
    d, L = s["size"], s["length"]
    if s["kind"] == "wood":
        p = WOOD_PITCH.get(d, 0.45 * d)
        return 0.0, L, p, d / 2, d / 2 - 0.55 * p
    p = PITCH.get(d, 0.15 * d)
    b = HEX_THREAD.get(d, L) if s["kind"] == "hex" else L
    return max(0.0, L - b), L, p, d / 2, d / 2 - 0.54 * p


_PROTO = {}   # one solid per screw / nut type, made at the origin and copied into place (threads are slow to make)


def _placed(key, make, pl):
    if key not in _PROTO:
        _PROTO[key] = make(App.Placement())
    out = _PROTO[key].copy()
    out.Placement = pl.multiply(out.Placement)
    return out


def solid(s, thread=True, drive="phillips"):
    """The fastener (and its nut, if any) as solids: (screw, nut or None)."""
    seat, d = V(*s["seat"]), V(*s["d"])
    up = None
    if s.get("head_corner"):
        up = tuple(d.cross(V(*s["head_corner"])))
    pl = hw.along(tuple(seat), tuple(d), up=up)
    size, L = s["size"], s["length"]
    if s["kind"] == "hex":
        sc = _placed(("hex", size, L, thread), lambda p: hw.hex_bolt(size, L, p, thread=thread), pl)
    elif s["kind"] == "wood":
        sc = _placed(("wood", size, L, thread), lambda p: hw.wood_screw(size, L, p, thread=thread), pl)
    else:
        sc = _placed(("button", size, L, thread, drive),
                     lambda p: hw.button_screw(size, L, p, drive=drive, thread=thread), pl)
    nt = None
    if s.get("nut"):
        n = s["nut"]
        up = tuple(d.cross(V(*n["corner"]))) if n.get("corner") else None
        nt = _placed(("nut", size), lambda p: hw.nut(size, p), hw.along(tuple(seat + d * n["t"]), tuple(d), up=up))
    return sc, nt


def describe(s):
    """One line: size x length, what it passes through, nut / engagement, flags."""
    ch = " > ".join(f"{n} {b - a:.1f}" for n, a, b in s["chain"])
    txt = f"M{s['size']:g}x{s['length']:g} {s['kind']}: {ch}"
    if s.get("head_sunk"):
        txt += f"; head {s['head_sunk']:.1f} deep in {s['head_part']}"
    if s.get("nut"):
        txt += f"; nut at {s['nut']['t']:.1f}{' (pocket)' if s['nut'].get('pocket') else ''}, {s['protrude']:+.1f} past it"
    elif "engage" in s:
        txt += f"; {s['engage']:.1f} mm into {s['engage_part']}"
    for n in s["notes"]:
        txt += f"; {n}"
    for f in s["flags"]:
        txt += f"; !! {f}"
    return txt


def best_length(s, need_past_nut=0.5):
    """Shortest standard length that takes the nylock fully (tip >= nut top + need_past_nut), or None."""
    if not s.get("nut"):
        return None
    need = s["nut"]["t"] + s["nut"]["h"] + need_past_nut
    for L in STD_LENGTHS.get(s["size"], ()):
        if L >= need:
            return L
    return None
