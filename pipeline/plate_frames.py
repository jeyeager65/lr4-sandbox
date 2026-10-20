# Prints the strut plates' placement matrices (generator 2D frame -> machine) from a built FCStd as JSON:
#   python tools/run.py pipeline/plate_frames.py  (LR4_FCSTD=<path> to read another build)
# fit_config.py uses them so the configurator page can extrude the JS generator's outlines in place.
import json
import os

import FreeCAD as App

HERE = os.path.dirname(os.path.abspath(__file__))
path = os.environ.get("LR4_FCSTD") or os.path.join(HERE, "..", "build", "LowRider4.FCStd")
doc = App.openDocument(path)
out = {}
for nm in ("StrutPlate_Front", "StrutPlate_Bottom"):
    s = doc.getObject(nm).Shape
    M = s.Placement.toMatrix()
    out[nm] = dict(m=[M.A11, M.A12, M.A13, M.A14, M.A21, M.A22, M.A23, M.A24, M.A31, M.A32, M.A33, M.A34],
                   bbox=[s.BoundBox.XMin, s.BoundBox.YMin, s.BoundBox.ZMin, s.BoundBox.XMax, s.BoundBox.YMax,
                         s.BoundBox.ZMax])
print("PLATES " + json.dumps(out))
