# GUI-only helpers: preview colours, camera and screenshots (saveImage needs the GUI).
# Use through the MCP's execute_code, or the FreeCAD Python console.
#
#   from fclib import view
#   doc = view.open_build(r"D:/FreeCAD/Projects/Shelf/build/Shelf.FCStd")
#   view.screenshot(doc, r"D:/FreeCAD/Projects/Shelf/build/shelf-iso.png")             # isometric
#   view.screenshot(doc, r".../top.png", look="top", edges=False)

import os
import FreeCAD as App
import FreeCADGui

V = App.Vector
ISO = V(-1, 1, -1)              # camera look direction: from the front right, above
FRONT, TOP, RIGHT = V(0, 1, 0), V(0, 0, -1), V(-1, 0, 0)
BG_TOP, BG_BOTTOM = (0xd3, 0xd6, 0xdb), (0xf5, 0xf5, 0xf7)
LIGHT_BG = (BG_TOP, BG_BOTTOM)
DARK_BG = ((0x3a, 0x3d, 0x42), (0x16, 0x17, 0x1a))     # charcoal, lighter at the top


def apply_colours(doc):
    """Paint objects with the PreviewColor that core.tag_colour() stored on them."""
    for o in doc.Objects:
        if "PreviewColor" in o.PropertiesList and o.ViewObject is not None:
            o.ViewObject.ShapeColor = tuple(o.PreviewColor)[:3]
            o.ViewObject.Transparency = int(o.PreviewTransparency)


def open_build(path):
    """(Re)open a headless-built FCStd in the GUI, coloured and fitted."""
    name = os.path.splitext(os.path.basename(path))[0]
    for d in list(App.listDocuments().values()):
        if os.path.normcase(os.path.abspath(d.FileName or "")) == os.path.normcase(os.path.abspath(path)):
            App.closeDocument(d.Name)
    doc = App.openDocument(path)
    vos = [o for o in doc.Objects if o.ViewObject is not None]
    if vos and not any(o.ViewObject.Visibility for o in vos):
        # seen with big headless builds (FreeCAD 1.1, LowRider4): no GUI state in the file
        # and every object loads hidden (even the App-side flag reads False) - show them all
        for o in vos:
            o.ViewObject.Visibility = True
    apply_colours(doc)
    gd = FreeCADGui.getDocument(doc.Name)
    gd.ActiveView.viewIsometric()
    gd.ActiveView.fitAll()
    return doc


def _packed(rgb):
    r, g, b = rgb
    return (r << 24) | (g << 16) | (b << 8) | 0xFF


def look_at(view, look):
    """Point the camera along `look` with world +Z as screen-up (orthographic)."""
    look = V(look)
    look.normalize()
    zc = look * -1
    up = V(0, 0, 1) if abs(zc.z) < 0.999 else V(0, 1, 0)
    xc = up.cross(zc)
    xc.normalize()
    yc = zc.cross(xc)
    m = App.Matrix(xc.x, yc.x, zc.x, 0, xc.y, yc.y, zc.y, 0, xc.z, yc.z, zc.z, 0, 0, 0, 0, 1)
    view.setCameraType("Orthographic")
    view.setCameraOrientation(App.Rotation(m), False)
    view.fitAll()
    FreeCADGui.updateGui()


NAMED = {"iso": "viewIsometric", "top": "viewTop", "bottom": "viewBottom", "front": "viewFront",
         "rear": "viewRear", "left": "viewLeft", "right": "viewRight",
         "dimetric": "viewDimetric", "trimetric": "viewTrimetric"}


def screenshot(doc, path, look="iso", size=(1600, 1200), only=None, edges=True, bg=LIGHT_BG):
    """Save a PNG of `doc`. look = "iso" / "top" / "front" / ... (FreeCAD's standard views,
    reliable) or a look-direction Vector. only = name prefixes to show (None = all).
    edges=False hides edge lines (dense polyline models look black otherwise).
    bg = (top, bottom) gradient colours (LIGHT_BG, DARK_BG); the user's view settings are
    restored after."""
    prefs = App.ParamGet("User parameter:BaseApp/Preferences/View")
    saved = {k: prefs.GetBool(k, d) for k, d in (("UseNavigationAnimations", True), ("Simple", True),
                                                 ("Gradient", False), ("RadialGradient", False))}
    saved_cols = {k: prefs.GetUnsigned(k, 0) for k in ("BackgroundColor2", "BackgroundColor3")}
    vis = {o.Name: o.ViewObject.Visibility for o in doc.Objects if o.ViewObject is not None}
    prefs.SetBool("UseNavigationAnimations", False)
    prefs.SetBool("Simple", False)
    prefs.SetBool("Gradient", True)
    prefs.SetBool("RadialGradient", False)
    prefs.SetUnsigned("BackgroundColor2", _packed(bg[0]))
    prefs.SetUnsigned("BackgroundColor3", _packed(bg[1]))
    try:
        if only:
            for o in doc.Objects:
                if o.ViewObject is not None and (hasattr(o, "Shape") or hasattr(o, "Mesh")):
                    o.ViewObject.Visibility = o.Name.startswith(tuple(only))
        FreeCADGui.setActiveDocument(doc.Name)
        view = FreeCADGui.getDocument(doc.Name).ActiveView
        FreeCADGui.runCommand("Std_DrawStyle", 0 if edges else 5)    # As is / Shaded
        if isinstance(look, str):
            view.setCameraType("Orthographic")
            getattr(view, NAMED[look])()
            view.fitAll()
            FreeCADGui.updateGui()
        else:
            look_at(view, look)
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        view.saveImage(path, size[0], size[1], "Current")
    finally:
        FreeCADGui.runCommand("Std_DrawStyle", 0)
        for k, v in saved.items():
            prefs.SetBool(k, v)
        for k, v in saved_cols.items():
            prefs.SetUnsigned(k, v)
        if only:
            for n, v in vis.items():
                doc.getObject(n).ViewObject.Visibility = v
    return path


# --- animation -----------------------------------------------------------------------------
def record(doc, frames_dir, n, step, size=(1600, 1000), bg=DARK_BG, edges=False, setup=None):
    """Render n frames to frames_dir/frame_0000.png ... step(i, t) changes the scene for
    frame i (t = i / n, 0..1, so a loop ends where it starts). setup(view) runs once first
    (camera type, framing). View settings are restored after."""
    import glob
    os.makedirs(frames_dir, exist_ok=True)
    for f in glob.glob(os.path.join(frames_dir, "frame_*.png")):
        os.remove(f)
    prefs = App.ParamGet("User parameter:BaseApp/Preferences/View")
    saved = {k: prefs.GetBool(k, d) for k, d in (("UseNavigationAnimations", True), ("Simple", True),
                                                 ("Gradient", False), ("RadialGradient", False))}
    saved_cols = {k: prefs.GetUnsigned(k, 0) for k in ("BackgroundColor2", "BackgroundColor3")}
    prefs.SetBool("UseNavigationAnimations", False)
    prefs.SetBool("Simple", False)
    prefs.SetBool("Gradient", True)
    prefs.SetBool("RadialGradient", False)
    prefs.SetUnsigned("BackgroundColor2", _packed(bg[0]))
    prefs.SetUnsigned("BackgroundColor3", _packed(bg[1]))
    try:
        FreeCADGui.setActiveDocument(doc.Name)
        view = FreeCADGui.getDocument(doc.Name).ActiveView
        FreeCADGui.runCommand("Std_DrawStyle", 0 if edges else 5)
        if setup:
            setup(view)
        for i in range(n):
            step(i, i / n)
            doc.recompute()
            FreeCADGui.updateGui()
            view.saveImage(os.path.join(frames_dir, f"frame_{i:04d}.png"), size[0], size[1], "Current")
    finally:
        FreeCADGui.runCommand("Std_DrawStyle", 0)
        for k, v in saved.items():
            prefs.SetBool(k, v)
        for k, v in saved_cols.items():
            prefs.SetUnsigned(k, v)
    return frames_dir


# (gif fps, width) tried in order when encode() has a size budget: keep motion smooth first,
# then shrink. Measured on SandwichSign (6 s, 1920x1080 frames): 20/960 5.5 MB, 20/800 4.5 MB,
# 20/720 3.9 MB, 15/800 3.3 MB.
GIF_LADDER = [(25, 960), (20, 960), (20, 800), (20, 720), (15, 720), (15, 640), (12, 640),
              (12, 480), (10, 480)]


def _gif(src, fps, gif, gif_fps, width, small=False, pre=""):
    import subprocess
    # small: palette from the changing pixels only + only changed rectangles re-dithered
    # (smaller files, same look for a turntable over a still background)
    stats, diff = (":stats_mode=diff", ":diff_mode=rectangle") if small else ("", "")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", src,
                    "-vf", f"{pre}fps={gif_fps},scale={width}:-1:flags=lanczos,split[a][b];"
                           f"[a]palettegen=max_colors=128{stats}[p];[b][p]paletteuse=dither=sierra2_4a{diff}",
                    "-loop", "0", gif], check=True)
    return os.path.getsize(gif)


def content_box(frames_dir, pad=0.05, threshold=14, step=4):
    """(w, h, x, y) crop that holds the model in EVERY frame (union over the animation), plus
    `pad` x the box's larger side of margin. The background is found per row from the frame's
    left/right edges, so plain colours and the vertical gradients of set_background() both
    work. Reads every `step`-th frame at half size through ffmpeg (needs numpy)."""
    import glob
    import subprocess
    import numpy as np
    files = sorted(glob.glob(os.path.join(frames_dir, "frame_*.png")))[::step]
    hit = None
    for f in files:
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", f, "-vf", "scale=iw/2:ih/2",
                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             capture_output=True, check=True).stdout
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                "stream=width,height", "-of", "csv=p=0", f],
                               capture_output=True, text=True, check=True).stdout.strip()
        W, H = (int(v) for v in probe.split(",")[:2])
        img = np.frombuffer(raw, np.uint8).reshape(H // 2, W // 2, 3).astype(np.int16)
        bg = (img[:, :3].mean(axis=1) + img[:, -3:].mean(axis=1)) / 2          # per row
        m = (np.abs(img - bg[:, None, :]).max(axis=2) > threshold)
        hit = m if hit is None else hit | m
    rows, cols = np.where(hit.any(axis=1))[0], np.where(hit.any(axis=0))[0]
    if not len(rows):
        return None
    x0, x1, y0, y1 = cols[0] * 2, cols[-1] * 2 + 2, rows[0] * 2, rows[-1] * 2 + 2
    m = int(pad * max(x1 - x0, y1 - y0))
    x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
    w, h = (x1 - x0) // 2 * 2, (y1 - y0) // 2 * 2                            # even for H.264
    return w, h, x0, y0


def encode(frames_dir, out_base, fps=30, gif_width=960, gif_max_mb=None, crop=None):
    """frames_dir/frame_*.png -> <out_base>.mp4 (H.264) and <out_base>.gif (palette-optimised).
    gif_max_mb (e.g. 4 for a forum limit, MB = 1,000,000 bytes): with gifski installed, steps
    down GIFSKI_LADDER (width, quality) at 20 fps; without it, ffmpeg's GIF_LADDER (frame
    rate, then width). Either way until the GIF fits; it prints what it chose.
    crop: None = whole frame; "auto" = trim the empty background around the model
    (content_box, the same box for every frame); or (w, h, x, y) in frame pixels.
    Needs ffmpeg on PATH."""
    import subprocess
    src = os.path.join(frames_dir, "frame_%04d.png")
    mp4, gif = out_base + ".mp4", out_base + ".gif"
    if crop == "auto":
        crop = content_box(frames_dir)
        print(f"crop: {crop[0]} x {crop[1]} at {crop[2]}, {crop[3]}" if crop else "crop: nothing found")
    pre = f"crop={crop[0]}:{crop[1]}:{crop[2]}:{crop[3]}," if crop else ""
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", src,
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
                    "-vf", pre + "scale=trunc(iw/2)*2:trunc(ih/2)*2", mp4], check=True)
    if crop:                                  # never scale the GIF up past the crop
        gif_width = min(gif_width, crop[0])
    if gif_max_mb is None:
        _gif(src, fps, gif, min(fps, 25), gif_width, pre=pre)
        return mp4, gif
    limit = gif_max_mb * 1e6
    if gifski_path():
        size, what = _gifski_fit(src, fps, gif, pre, gif_width, limit)
    else:                                     # ffmpeg only: drop fps, then width
        for gif_fps, width in GIF_LADDER:
            if width > gif_width or gif_fps > fps:
                continue
            size = _gif(src, fps, gif, gif_fps, width, small=True, pre=pre)
            if size <= limit:
                break
        what = f"ffmpeg, {gif_fps} fps, {width} px wide (install gifski for bigger/smoother)"
    print(f"gif: {what}, {size / 1e6:.2f} MB"
          + ("" if size <= limit else f" - STILL OVER {gif_max_mb} MB, shorten the clip"))
    return mp4, gif


# gifski (gif.ski, CLI from the GitHub release's win/gifski.exe): far better GIFs per MB than
# ffmpeg's palette - on SandwichSign 20 fps 880 px is 3.7 MB with gifski vs ~6.5 MB with ffmpeg.
# (width, quality) tried in order at GIFSKI_FPS until the GIF fits the budget.
GIFSKI_FPS = 20
GIFSKI_LADDER = [(960, 85), (960, 75), (880, 75), (800, 75), (720, 75), (640, 70), (560, 70),
                 (480, 65)]


def gifski_path():
    """gifski.exe on PATH, or in ~/bin (Git Bash's bin, not on the Windows PATH)."""
    import shutil
    found = shutil.which("gifski")
    if found:
        return found
    home = os.path.join(os.path.expanduser("~"), "bin", "gifski.exe")
    return home if os.path.isfile(home) else None


def _gifski_fit(src, fps, gif, pre, max_width, limit):
    import glob
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        # gifski takes PNG frames: crop + resample to GIFSKI_FPS with ffmpeg first
        subprocess.run(["ffmpeg", "-loglevel", "error", "-framerate", str(fps), "-i", src,
                        "-vf", f"{pre}fps={min(GIFSKI_FPS, fps)}", os.path.join(tmp, "f_%04d.png")],
                       check=True)
        frames = sorted(glob.glob(os.path.join(tmp, "f_*.png")))
        for width, quality in GIFSKI_LADDER:
            if width > max_width and (width, quality) != GIFSKI_LADDER[-1]:
                continue
            subprocess.run([gifski_path(), "-q", "-r", str(min(GIFSKI_FPS, fps)),
                            "-W", str(min(width, max_width)), "-Q", str(quality), "-o", gif]
                           + frames, check=True)
            size = os.path.getsize(gif)
            if size <= limit:
                break
    return size, f"gifski, {min(GIFSKI_FPS, fps)} fps, {min(width, max_width)} px wide, quality {quality}"
