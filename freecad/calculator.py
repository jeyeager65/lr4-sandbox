# LR4 size calculator: stock lengths and table footprint from the usable cutting area. Our own code; the results
# match V1E's LowRider 4 calculator (docs.v1e.com/lowrider/calculator) - tests/test_calculator.js checks this file,
# its twin web/js/calculator.js and (locally, when vendor/ has it) V1E's calculator.js against each other.
# Plain Python, no FreeCAD. mm in, mm out; inches() gives the inch display (rounded UP to 1/8").
#   python freecad/calculator.py 48 96 --in          (cut area in inches; mm without --in)
import json
import math
import sys

IN = 25.4
OFFSETS = dict(xrail_core=169,          # strut = cut X + this (rounded up to a whole mm)
               yrail_minus_work=255,     # Y rail = cut Y + this
               ytable_minus_work=313,    # table footprint Y = cut Y + this
               xbelt_extra=180,          # X belt = strut + this
               ybelt_extra=200,          # each Y belt = Y rail + this
               xtable_extra=110,         # table footprint X = strut + both XZ plates + this
               xrail_cushion=3)          # X rails = strut - this (so the plates can't kick out)


def calculator(x_work, y_work, xz_plate=6.5):
    """Cut area (mm) + XZ plate thickness (mm) -> stock lengths and the minimum table footprint (mm)."""
    o = OFFSETS
    strut = math.ceil(x_work + o["xrail_core"])
    yrail = y_work + o["yrail_minus_work"]
    out = dict(strut=strut, xrails=strut - o["xrail_cushion"], yrail=yrail,
               xbelt=strut + o["xbelt_extra"], ybelt=yrail + o["ybelt_extra"],
               xtable=strut + 2 * xz_plate + o["xtable_extra"], ytable=y_work + o["ytable_minus_work"])
    out["belt_total"] = out["xbelt"] + 2 * out["ybelt"]
    return out


def up8(v):
    """Round up to the next 1/8 (inches)."""
    return math.ceil(v * 8) / 8


def inches(c):
    """A calculator() result in inches, each rounded UP to 1/8"; X rails = the rounded strut minus the rounded
    cushion, so the two always differ by whole 1/8 steps."""
    out = {k: up8(v / IN) for k, v in c.items()}
    out["xrails"] = out["strut"] - up8(OFFSETS["xrail_cushion"] / IN)
    return out


def calculator_inches(x_work_in, y_work_in, xz_plate_in):
    """Inch in, inch out (the calculator's inch mode)."""
    return inches(calculator(x_work_in * IN, y_work_in * IN, xz_plate_in * IN))


if __name__ == "__main__":
    if sys.argv[1:] == ["--json"]:            # tests: [[x_mm, y_mm, xz_mm], ...] on stdin -> [[mm, in], ...]
        out = []
        for x, y, xz in json.load(sys.stdin):
            c = calculator(x, y, xz)
            out.append([c, inches(c)])
        json.dump(out, sys.stdout)
    else:
        args = [a for a in sys.argv[1:] if a != "--in"]
        k = IN if "--in" in sys.argv else 1
        x, y = float(args[0]) * k, float(args[1]) * k
        xz = float(args[2]) * k if len(args) > 2 else 6.5
        c = calculator(x, y, xz)
        for name, v in c.items():
            print(f"{name:11s} {v:10.1f} mm  {inches(c)[name]:8.3f} in")
