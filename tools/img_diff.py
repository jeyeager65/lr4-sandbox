# Compare two folders of screenshots (tools/three_shots.js): per PNG the mean difference (0-255), the share of pixels
# that changed by more than 16 in any channel, and a diff image (<b>/diff_<name>.png, changed pixels in red).
#   python tools/img_diff.py <dir a> <dir b> [--no-images]
import os
import sys

import numpy as np
from PIL import Image


def main(a, b, images=True):
    names = sorted(n for n in os.listdir(a) if n.endswith(".png") and not n.startswith(("diff_", "sheet")))
    print(f"{'shot':16} {'mean':>6} {'changed':>8}")
    for n in names:
        if not os.path.exists(os.path.join(b, n)):
            print(f"{n[:-4]:16} (missing in {b})")
            continue
        x = np.asarray(Image.open(os.path.join(a, n)).convert("RGB"), dtype=np.int16)
        y = np.asarray(Image.open(os.path.join(b, n)).convert("RGB"), dtype=np.int16)
        if x.shape != y.shape:
            print(f"{n[:-4]:16} size {x.shape} vs {y.shape}")
            continue
        d = np.abs(x - y)
        hit = d.max(axis=2) > 16
        print(f"{n[:-4]:16} {d.mean():6.2f} {100 * hit.mean():7.2f}%")
        if images and hit.any():
            img = (y * 0.35).astype(np.uint8)
            img[hit] = [255, 0, 0]
            Image.fromarray(img).save(os.path.join(b, "diff_" + n))


if __name__ == "__main__":
    av = [v for v in sys.argv[1:] if not v.startswith("--")]
    main(av[0], av[1], "--no-images" not in sys.argv)
