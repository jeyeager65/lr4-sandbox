"""fclib: shared FreeCAD helpers for the projects under D:/FreeCAD.

Modules (import the ones a project needs):
    core      units, shapes (box, cyl, prism), Model (parts -> document), overlaps
    mesh      downloaded STL parts placed in assemblies, mesh overlap checks, mesh -> STEP
    hw        stock hardware solids: NEMA17, 608 bearing, MGN12 rail/block, GT2 pulley/idler, switches, tubes
    params    Params spreadsheet + expression-driven PartDesign sketches/pads/pockets
    art       text and SVG artwork as solids (labels, AMS colour inlays)
    printing  Bambu P1S defaults, fit clearances, bed check, STL/3MF/STEP export
    wood      lumber/plywood stock, fractions, cut lists, board packing, sheet nesting
    cam       FreeCAD CAM: tools, jobs, pocket/engrave ops, per-tool GRBL posting, time estimates
    view      GUI only: preview colours, camera, screenshots

Project scripts put D:/FreeCAD/lib on sys.path (see templates/) and call
fclib.reload() first, so edits here are picked up when re-running inside the GUI.
"""

ORDER = ("core", "mesh", "hw", "params", "art", "printing", "wood", "cam", "view")


def reload():
    """Re-import every loaded fclib module (dependencies first)."""
    import importlib
    import sys
    for name in ORDER:
        mod = sys.modules.get(f"fclib.{name}")
        if mod is not None:
            importlib.reload(mod)
