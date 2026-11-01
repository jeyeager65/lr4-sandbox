# The Tiny Touch Plate + its magnet / clip as stored, per router mount (Part 50): placements in the mount files' frame
# (= the Kobalt frame; build.py composes pl_kobalt, touch_alt.py hands the page the Makita / DeWalt ones relative to the
# Kobalt's). plate(): hw.tiny_touch_plate's frame (plate in its xz plane, the pad from z 0 up, the strip hanging to
# -z); magnet(): hw.bu45_clip's (the magnet's middle, x along the rod, the clip hanging to -z).
import math

import FreeCAD as App

import lr4

V = App.Vector
MOUNTS = ("kobalt", "makita", "dewalt")
HEAD_H = 0.55 * 5.0                                   # M5 button head height (hw.button_screw)
PLATE_T = 0.5                                         # hw.tiny_touch_plate's t


def frame(ex, ey, ez, o):
    return App.Placement(App.Matrix(ex.x, ey.x, ez.x, o.x, ex.y, ey.y, ez.y, o.y, ex.z, ey.z, ez.z, o.z, 0, 0, 0, 1))


def plate(mount="kobalt"):
    if mount == "kobalt":
        # in the top mount's slot (lr4.TOUCH_SLOT / TOUCH_STORE): plate in the slot's mid-plane, strip centred in it,
        # pad down beside the bottom mount, spade up above the top mount; flipped (x -> -x, z -> -z) so the pad hangs
        # down and the frame's -x edge faces the slot's mouth (u, the front)
        ts = lr4.TOUCH_SLOT
        (mx, my), (cx, cy) = ts["mouth"], ts["closed"]
        u = V(mx - cx, my - cy, 0)
        u.normalize()
        nrm = V(0, 0, 1).cross(u)
        k = (ts["strip_x"] - cx) / (mx - cx)
        org = V(cx + k * (mx - cx), cy + k * (my - cy), lr4.TOUCH_STORE["pad_z"] + lr4.TOUCH_PLATE["pad"])   # the pad's top edge
        p = frame(u * -1, nrm, V(0, 0, -1), org)
        rx, ry, rz, dz = lr4.TOUCH_TILT                # angled a little about the slot, resting on its connector
        return p.multiply(App.Placement(V(0, 0, dz), App.Rotation())).multiply(
            App.Placement(V(), App.Rotation(rz, ry, rx), V(0, 0, org.z - sum(ts["z"]) / 2)))
    # in the cage (lr4.TOUCH_CAGE): the pad's bottom edge on the two walls' tops, the strip's axis through the
    # channel's middle, the strip against the ring side (TOUCH_CAGE_GAP off it: the clip goes in front), its face
    # toward n
    g = lr4.TOUCH_CAGE[mount]
    n, e = V(1, 1, 0) * (1 / math.sqrt(2)), V(1, -1, 0) * (1 / math.sqrt(2))
    (ae, az), (be, bz) = g["walls"]
    ul = math.hypot(be - ae, bz - az)
    ue, uz = (be - ae) / ul, (bz - az) / ul             # along the pad's bottom edge (toward +e), in (e, z)
    we, wz = uz, -ue                                   # down the strip
    me, mz = g["mid"]
    t = (me - ae) * we + (mz - az) * wz
    pe, pz = me - t * we, mz - t * wz                  # the pad edge's middle: on the walls' line, above `mid`
    o = V(*g["c"], 0) + n * (-g["ring"] + lr4.TOUCH_CAGE_GAP + PLATE_T / 2) + e * pe + V(0, 0, pz)
    ex, ez = e * ue + V(0, 0, uz), (e * we + V(0, 0, wz)) * -1
    return frame(ex, ez.cross(ex), ez, o)


def clip_pose(pose):
    """build.py TOUCH_CLIP_POSE (slid along, swung about the rod, turned round) -> hw.bu45_clip's clip= Placement."""
    cp = App.Placement(V(*pose[:3]), App.Rotation(V(1, 0, 0), pose[3]))
    if pose[4]:                                        # turned round about the vertical through the magnet's middle
        cp = cp.multiply(App.Placement(V(), App.Rotation(V(0, 0, 1), 180)))
    return cp


def cage_clip(mount):
    """The clip's clip= Placement on a cage mount's magnet (lr4.TOUCH_CAGE_CLIP_POSE; None = worked out): slid along
    the rod so its body sits in the middle of the cage's room in front of the strip, swung down the strip."""
    s, a, b, sw, turned = lr4.TOUCH_CAGE_CLIP_POSE
    if s is None:
        g, gap = lr4.TOUCH_CAGE[mount], lr4.TOUCH_CAGE_GAP
        front = -g["ring"] + gap + PLATE_T                # the strip's front face (n from c)
        s = (front + g["lip"]) / 2 - (front + lr4.TOUCH_STORE["magnet"][1] / 2)   # room's middle - the magnet's
    return clip_pose((s, a, b, along_strip(mount) if sw is None else sw, turned))


def along_strip(mount):
    """The swing (deg about the rod, clip_pose's pose[3]) that puts the clip's tail down the plate's strip (user
    2026-10-31: in line with the 8 mm strip) instead of straight down."""
    down = plate(mount).Rotation.multVec(V(0, 0, -1))
    r = magnet(mount).Rotation
    return math.degrees(math.atan2(down.dot(r.multVec(V(0, 1, 0))), -down.dot(r.multVec(V(0, 0, 1)))))


def magnet(mount="kobalt"):
    md, mt = lr4.TOUCH_STORE["magnet"]
    if mount == "kobalt":
        # end-on on the top mount's +X bolt head (it faces the front), the clip hanging from its outer end
        bd = V(*lr4.TOUCH_STORE["bolt_d"])             # into the core: the head is on the -d side
        mc = V(*lr4.TOUCH_STORE["bolt"]) - bd * HEAD_H  # the rod's back end on the head's crown
        ex, ez = bd * -1, V(0, 0, 1)
        return frame(ex, ez.cross(ex), ez, mc - bd * (mt / 2))
    # end-on on the pad's front (n) face, lr4.TOUCH_MAGNET_ON_PAD up its middle
    p = plate(mount)
    n = V(1, 1, 0) * (1 / math.sqrt(2))
    back = p.multVec(V(0, 0, lr4.TOUCH_MAGNET_ON_PAD)) + n * (PLATE_T / 2)
    ez = V(0, 0, 1)
    return frame(n, ez.cross(n), ez, back + n * (mt / 2))
