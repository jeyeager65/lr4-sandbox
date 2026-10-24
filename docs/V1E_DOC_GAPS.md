# What the V1E docs don't cover

A running list of things we needed for the model that [docs.v1e.com/lowrider](https://docs.v1e.com/lowrider/) (and the
part pages it links) don't say. Each entry: what's missing, what the model does for now, and whether it's settled.

| # | Part / step | What the docs don't say | The model for now | Status |
|---|---|---|---|---|
| 1 | Kobalt dust shoe ([Printables 1034828](https://www.printables.com/model/1034828-kobalt-tool-mount-and-dust-shoe-for-the-lowrider-4)) | The screw that holds the dust shoe to the bottom tool mount: its size / length, and that it exists at all. The core assembly steps (ci / cj) cover the tool mount's four M5s only. The shoe has a vertical slot; behind it the mount has a short M5 hole, angled 35 deg in plan, with a hex nut slot. | An M5 from the shoe's slot into that hole, nylock in the hex slot (`lr4.SHOE_SCREW_HOLE`, `hardware.py`). With the kit's M5 x 30 about 15 mm sticks out past the nylock - an M5 x 16-20 would fit better. | Screw found; length not in the docs (M5 x 30 from the kit for now) |
| 2 | Tiny Touch Plate | Its outline (tab, the two necks, the hole) and the connector (a 0.110" insulated female disconnect). | Sizes read from the kit photos: tab 2.8 x 6.8, hole 1.0 at 4.3, necks 4.0 x 3.9 and 6.3 x 3.0 (`hw.tiny_touch_plate(detail=True)`, `lr4.TOUCH_PLATE`). | Guessed: measure |
| 3 | Touch plate storage | How the plate and its magnet/clip sit when stored on the tool mounts, beyond "keep the clip and the plate touching". | Strip up through the top mount's slot, the connector resting on top, tilted 1.5 deg so the pad clears the bottom mount; the magnet end-on on the +X top-mount bolt head, the BU-45 clip holding it, screw head out (`lr4.TOUCH_TILT`, build.py `TOUCH_CLIP_POSE`). | From the user's machine |
