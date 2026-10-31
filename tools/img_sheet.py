# A contact sheet of a folder's screenshots (tools/three_shots.js), each labelled, to look at a whole set at once.
#   python tools/img_sheet.py <dir> [out.png] [--w 300]     (default out: <dir>/sheet.png)
import os
import sys

from PIL import Image, ImageDraw


def main(d, out=None, w=300, cols=5):
    names = sorted(n for n in os.listdir(d) if n.endswith(".png") and not n.startswith(("diff_", "sheet")))
    ims = [Image.open(os.path.join(d, n)).convert("RGB") for n in names]
    if not ims:
        return
    h = round(w * ims[0].height / ims[0].width)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * (h + 14)), "white")
    dr = ImageDraw.Draw(sheet)
    for i, (n, im) in enumerate(zip(names, ims)):
        x, y = (i % cols) * w, (i // cols) * (h + 14)
        sheet.paste(im.resize((w, h)), (x, y + 14))
        dr.text((x + 3, y + 1), n[:-4], fill="black")
    sheet.save(out or os.path.join(d, "sheet.png"))


if __name__ == "__main__":
    av = [v for v in sys.argv[1:] if not v.startswith("--")]
    w = int(sys.argv[sys.argv.index("--w") + 1]) if "--w" in sys.argv else 300
    main(av[0], av[1] if len(av) > 1 and not av[1].isdigit() else None, w)
