// The routers the page knows (Part 45b, user 2026-10-28): one preset each = where its speed comes from, its dial's
// speed table or S range, its V1E mount set and its model (built in the page by js/router_body.js). Between the two
// marker lines is strict JSON so Python reads it too (tests/test_routers_data.py: fluidnc_post.ROUTERS has to match -
// the post stays self-contained).
//
// Model frame: mm, z up from the collet nut's bottom, +x = the switch / dial end of the motor cap, the cord leaves the
// -x end and bends toward +y. Every size differs per router (user). Names (user 2026-10-29, "clean naming everywhere"):
//   collet_nut { type, af: across flats, h, below: its face below the shaft's end } (a hex: the bit change's wrench);
//   collet { type, sizes: shank mm, l, d, taper: deg }; shaft { d, exposed: the gap from the nut's top up to the
//   bearing cap, thread { d, pitch, length }, flats { af, z, l } (a 2-wrench router: the flats a wrench holds) };
//   bearing_cap / housing (the motor housing the mount clamps; ch = its collet-end 45 deg chamfer; vent { depth: the
//   openings' depth, inset: the spokes' face in from the rim, wall, spokes, w }: its open end the fan blows out of, spokes
//   from the hub (the bearing cap) to the wall) / collar { d, l },
//   stacked up from the nut; transition { l, d: top Ø, shape: round | cap (lofted to the motor cap's plan), edge:
//   none | fillet | chamfer, e } up to the motor cap { L (x), W (y), H (z), top_r, front_r (+x end), back_r (-x end),
//   bot_r, at: [x, y], shape: { top, side, end } (drawn in the builder's shape editor, js/cap_shape.js: then L / W / H /
//   at are the shape's size and the fillets don't apply) }; dial { place: end | top | window, d, t, ring: [wheel, groove] colors; window: in (its rim from the end), drop
//   (its top under the cap's top), win { l, w, r: its corners rounded from above, bevel, open: a notch through the end too }, style: rim | dome { top } | bevel { top: the flat top's share of r } }; switch { at, size, rocker };
//   shaft_lock { z, a: deg from +x (counter-clockwise from above), d: its boss's Ø (0 = none), in: where the boss starts out from the axis,
//   arm: a bracket that wide from the boss up to the housing (0 = none), pin: Ø of the button's pin into the shaft's
//   hole (square to the flats; 0 = none), r: reach from the axis (the boss's end),
//   travel: press depth, button: Ø, out: how far the button stands out (defaults 0.7 d, travel + 1) };
//   brushes { n, z, a, d, r: its base out from the axis, out (no border), ring: a border in the head's color flush with
//   the body (r = its surface), inset: the cap in it } (the brush caps);
//   strain_relief { at, l, d: at the cap, bend: deg toward +y }; cord { d, out: the stub drawn past the relief };
//   looks { part: { c: sRGB 0..1, f: metal | plastic | rubber } } for every part (js/routers.js LOOK_PARTS).
//   A spindle: { kind: "spindle", collet_nut, collet, shaft, bearing_cap, housing (the can), cooling: air | water }.
// The Kobalt's motor cap: centred on the axis, top + under fillets 14 (GUESS: clears the hose); its measured 80 mm width reaches ~3 mm into the core's top and its
// upper bearing bolts' heads (the real head is narrower at the back; 5 mm forward instead cut the hose 5.3 mm).
// clamp (nut below the lower clamp, mm): left out = the nut's bottom level with the core's bottom (user 2026-10-30;
// the build's 36.5); a preset or the builder may set its own.
// Kobalt + Carbide bit end, hub, vent and lock: user-measured 2026-10-30 (nut bottom to rim / hub / lock center).
// GUESS = not measured: thread length, collet sizes / types except the Kobalt + Carbide (user:
// ER11 1/8 + 1/4, ER11A nut, M13 x 0.75), every Makita / DeWalt / T1 / spindle size. MEASURE YOURS.
// A router with a lock has flats too (user 2026-10-30: "any router with a spindle lock, you should still be able to
// use the 2 wrench method"): both measured 2026-10-30.
(function (root) {
  "use strict";
  const DATA =
// ---- JSON ----
{
  "default": "kobalt",
  "routers": {
    "kobalt": {
      "name": "Kobalt trim router",
      "source": "manual",
      "speeds": [[1, 10000], [2, 14000], [3, 18000], [4, 22000], [5, 26000], [6, 35000]],
      "speeds_source": "manual table",
      "mount": "kobalt",
      "model": {
        "label": "Kobalt K7TR-03 (measured)",
        "collet_nut": {"type": "ER11A", "af": 16.9, "h": 13.0, "below": 1.5},
        "collet": {"type": "ER11", "sizes": [3.175, 6.35], "l": 18.0, "d": 11.5, "taper": 8},
        "shaft": {"d": 12.9, "exposed": 10.0, "thread": {"d": 13.0, "pitch": 0.75, "length": 8.0}, "flats": {"af": 11.8, "z": 13.0, "l": 5.0}},
        "bearing_cap": {"d": 40.0, "l": 11.0},
        "housing": {"d": 65.8, "l": 94.0, "vent": {"depth": 10.0, "inset": 0.5, "wall": 3.5, "spokes": 12, "w": 3.0}},
        "collar": {"d": 66.6, "l": 22.0},
        "motor_cap": {"L": 105, "W": 80, "H": 60, "top_r": 14, "front_r": 14, "back_r": 14, "bot_r": 14},
        "dial": {"place": "window", "win": {"open": true}, "style": "dome", "dome": {"top": 0.45}, "d": 22.0, "t": 8.0, "ring": ["#202022", "#0b0b0c"]},
        "shaft_lock": {"z": 24.0, "a": -51.5, "d": 17.0, "in": 10.0, "r": 28.0, "button": 12.0, "pin": 5.0, "out": 4.0, "travel": 1.5},
        "strain_relief": {"at": [-52.5, 0, 185], "l": 45.0, "d": 13.0, "bend": 45.0},
        "looks": {
          "shaft": {"c": [0.09, 0.09, 0.1], "f": "metal"},
          "collet_nut": {"c": [0.09, 0.09, 0.1], "f": "metal"},
          "motor_cap": {"c": [0.13, 0.33, 0.8], "f": "plastic"},
          "dial": {"c": [0.07, 0.07, 0.08], "f": "plastic"},
          "switch": {"c": [0.17, 0.17, 0.18], "f": "plastic"}
        }
      }
    },
    "makita": {
      "name": "Makita RT0701C",
      "source": "manual",
      "speeds": [[1, 10000], [2, 12000], [3, 17000], [4, 22000], [5, 27000], [6, 30000]],
      "speeds_source": "Makita RT0701C instruction manual, speed adjusting dial table",
      "mount": "makita",
      "model": {
        "label": "Makita RT0701C (measured from a STEP model, 2022; collets: its 1/4, the V1E store's 1/8)",
        "collet_nut": {"type": "Makita", "af": 22, "h": 12, "below": 5.9},
        "collet": {"type": "Makita", "sizes": [6.35, 3.175], "l": 20, "d": 14, "taper": 8},
        "shaft": {"d": 17, "exposed": 19.4, "thread": {"d": 17, "pitch": 1, "length": 6}},
        "bearing_cap": {"d": 43.4, "l": 6.5},
        "housing": {"d": 64, "l": 90, "ch": 1, "vent": {"depth": 10, "wall": 1.5, "spokes": 12, "w": 2.2, "inset": 2}},
        "transition": {"l": 26, "shape": "cap", "edge": "none", "d": 64, "e": 0},
        "motor_cap": {"L": 103.6, "W": 75.2, "H": 46, "at": [-10.2, 0], "bot_r": 2, "shape": {
          "top": [{"x": -62, "y": 0, "s": "line"}, {"x": -62, "y": 14, "s": "line"}, {"x": -54, "y": 14, "s": "line"}, {"x": -36, "y": 28, "s": "curve"}, {"x": -26, "y": 34.5, "s": "curve"}, {"x": 0, "y": 37.6, "s": "curve"}, {"x": 24, "y": 34.5, "s": "curve"}, {"x": 34, "y": 31, "s": "curve"}, {"x": 38.5, "y": 22, "s": "curve"}, {"x": 41.6, "y": 0, "s": "line"}],
          "front": [{"x": -62, "y": 6, "s": "line"}, {"x": -50, "y": 6, "s": "line"}, {"x": -50, "y": 0, "s": "line"}, {"x": 41.6, "y": 0, "s": "line", "r": 1}, {"x": 41.6, "y": 24, "s": "curve"}, {"x": 40, "y": 31, "s": "curve"}, {"x": 36, "y": 38, "s": "curve"}, {"x": 31, "y": 43.8, "s": "curve"}, {"x": 25, "y": 46, "s": "line"}, {"x": -25, "y": 46, "s": "curve"}, {"x": -33, "y": 43, "s": "curve"}, {"x": -37, "y": 40, "s": "line"}, {"x": -52, "y": 40, "s": "line", "r": 3}, {"x": -56, "y": 34, "s": "line"}, {"x": -62, "y": 34, "s": "line", "r": 2}],
          "section": [{"x": 0, "y": 46, "s": "line"}, {"x": 37.6, "y": 46, "s": "line", "r": 12}, {"x": 37.6, "y": 0, "s": "line", "r": 1}, {"x": 0, "y": 0, "s": "line"}]}},
        "dial": {"place": "window", "in": 4, "drop": 3, "win": {"l": 10, "w": 30, "r": 8, "bevel": 0, "open": true}, "style": "bevel", "bevel": {"top": 0.6}, "ribs": 4, "d": 30, "t": 8, "ring": ["#c8322b", "#8e1f1a"]},
        "shaft_lock": {"z": 25.72, "a": -55, "d": 14, "in": 14, "arm": 15, "pin": 7, "r": 24, "travel": 3, "button": 12, "out": 5.5},
        "brushes": {"n": 2, "z": 153.87, "a": 90, "d": 12, "r": 37.6, "out": 2.5, "ring": 2, "inset": 1},
        "strain_relief": {"l": 73, "d": 20, "bend": 0, "at": [-62, 0, 173.87]},
        "cord": {"d": 7.6, "out": 15},
        "looks": {
          "motor_cap": {"c": [0, 0.51, 0.565], "f": "plastic"},
          "transition": {"c": [0.74, 0.75, 0.77], "f": "plastic"},
          "collet_nut": {"c": [0.55, 0.56, 0.58], "f": "metal"},
          "dial": {"c": [0.75, 0.12, 0.1], "f": "plastic"},
          "shaft_lock": {"c": [0.75, 0.1, 0.1], "f": "plastic"}
        }
      }
    },
    "carbide": {
      "name": "Carbide Compact Router",
      "source": "manual",
      "speeds": [[1, 11000], [2, 13500], [3, 18250], [4, 24500], [5, 29250], [6, 31000]],
      "speeds_source": "Carbide 3D table (approximate)",
      "mount": "makita",
      "model": {
        "label": "Carbide Compact Router (user-measured 2026-10-28; shape from photos)",
        "collet_nut": {"type": "ER11A", "af": 19.0, "h": 13.0, "below": 1.5},
        "collet": {"type": "ER11", "sizes": [3.175, 6.35], "l": 18.0, "d": 11.5, "taper": 8},
        "shaft": {"d": 13.8, "exposed": 16.0, "thread": {"d": 13.0, "pitch": 0.75, "length": 8.0}, "flats": {"af": 12.8, "z": 14.5, "l": 5.0}},
        "bearing_cap": {"d": 43.0, "l": 8.0},
        "housing": {"d": 64.8, "l": 72.0, "vent": {"depth": 10.0, "inset": 0.5, "wall": 2.2, "spokes": 12, "w": 2.2}},
        "collar": {"d": 66.0, "l": 9.0},
        "transition": {"l": 38.0, "d": 73.0, "shape": "round", "edge": "none"},
        "motor_cap": {"L": 100.0, "W": 75.0, "H": 44.0, "top_r": 14.0, "front_r": 14.0, "back_r": 14.0, "bot_r": 4.0},
        "dial": {"place": "top", "surround": {"kind": "sunk", "depth": 2, "margin": 3, "edge": "chamfer", "e": 0.8}, "d": 28.0, "t": 9.0, "ring": ["#c22a22", "#871a15"]},
        "shaft_lock": {"z": 24.0, "a": -51.5, "d": 14.0, "in": 10.0, "arm": 15.0, "r": 26.0, "button": 10.0, "pin": 5.0, "out": 4.0, "travel": 3.5},
        "strain_relief": {"at": [-50.0, 0, 176.0], "l": 40.0, "d": 12.0, "bend": 45.0},
        "looks": {
          "shaft": {"c": [0.09, 0.09, 0.1], "f": "metal"},
          "bearing_cap": {"c": [0.4, 0.41, 0.43], "f": "plastic"},
          "lock_boss": {"c": [0.4, 0.41, 0.43], "f": "plastic"},
          "collet_nut": {"c": [0.09, 0.09, 0.1], "f": "metal"},
          "motor_cap": {"c": [0.36, 0.37, 0.39], "f": "plastic"},
          "dial": {"c": [0.78, 0.15, 0.13], "f": "plastic"}
        }
      }
    },
    "dewalt": {
      "name": "DeWalt DWP611",
      "source": "manual",
      "speeds": [[1, 16000], [2, 18200], [3, 20400], [4, 22600], [5, 24800], [6, 27000]],
      "speeds_source": "even spread over DeWalt's 16000-27000 RPM spec - unverified",
      "mount": "dewalt",
      "model": {
        "label": "DeWalt DWP611 (GUESS: published sizes, not measured)",
        "collet_nut": {"type": "DeWalt", "af": 22.0, "h": 15.0, "below": 1.5},
        "collet": {"type": "DeWalt", "sizes": [6.35], "l": 20.0, "d": 12.0, "taper": 8},
        "shaft": {"d": 12.0, "exposed": 4.0, "thread": {"d": 16.0, "pitch": 1.0, "length": 9.0}},
        "housing": {"d": 69.0, "l": 100.0},
        "collar": {"d": 69.0, "l": 6.0},
        "motor_cap": {"L": 82.0, "W": 76.0, "H": 90.0, "top_r": 10.0, "front_r": 14.0, "back_r": 14.0, "bot_r": 4.0},
        "dial": {"place": "end", "surround": {"kind": "raised", "depth": 1, "margin": 2, "edge": "fillet", "e": 0.6}, "d": 22.0, "t": 6.0},
        "shaft_lock": {"z": 26.0, "a": -50.0, "d": 12.0, "r": 37.5, "travel": 3.0},
        "looks": {
          "motor_cap": {"c": [0.996, 0.741, 0.09], "f": "plastic"}
        }
      }
    },
    "t1": {
      "name": "Sienci AutoSpin T1",
      "source": "gcode",
      "s": [10000, 31250],
      "speeds_source": "Sienci: 5 V PWM, 0-100 % = 0-31250 RPM, under 10000 not accurate (GUESS: S = RPM straight)",
      "mount": "makita",
      "model": {
        "label": "Sienci AutoSpin T1 (GUESS: Makita-size body, not measured)",
        "collet_nut": {"type": "ER11A", "af": 17.0, "h": 13.0, "below": 1.5},
        "collet": {"type": "ER11", "sizes": [3.175, 6.35], "l": 18.0, "d": 11.5, "taper": 8},
        "shaft": {"d": 12.0, "exposed": 4.0, "thread": {"d": 13.0, "pitch": 0.75, "length": 8.0}, "flats": {"af": 10.0, "z": 13.5, "l": 3.0}},
        "housing": {"d": 65.0, "l": 95.0},
        "collar": {"d": 65.0, "l": 8.0},
        "motor_cap": {"L": 78.0, "W": 72.0, "H": 89.0, "top_r": 8.0, "front_r": 14.0, "back_r": 14.0, "bot_r": 4.0},
        "dial": {"place": "end", "d": 24.0, "t": 6.0},
        "looks": {
          "motor_cap": {"c": [0.1, 0.1, 0.11], "f": "plastic"}
        }
      }
    },
    "spindle65": {
      "name": "65 mm spindle (air-cooled)",
      "source": "gcode",
      "s": [6000, 24000],
      "speeds_source": "a VFD sets the speed from S (GUESS: a typical 800 W - 1.5 kW 24000 RPM spindle, S = RPM straight)",
      "mount": "makita",
      "model": {
        "label": "65 mm spindle (GUESS: typical sizes, not measured)",
        "kind": "spindle",
        "collet_nut": {"type": "ER11A", "af": 22.0, "h": 12.0, "below": 1.5},
        "collet": {"type": "ER11", "sizes": [3.175, 6.35], "l": 18.0, "d": 11.5, "taper": 8},
        "shaft": {"d": 16.0, "exposed": 3.0, "thread": {"d": 13.0, "pitch": 0.75, "length": 8.0}, "flats": {"af": 13.0, "z": 12.2, "l": 2.6}},
        "bearing_cap": {"d": 48.0, "l": 10.0},
        "housing": {"d": 65.0, "l": 180.0},
        "cooling": "air",
        "looks": {
          "motor_cap": {"c": [0.1, 0.1, 0.11], "f": "plastic"}
        }
      }
    }
  }
}
// ---- end JSON ----
  ;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  else root.LR4RouterData = DATA;
})(typeof self !== "undefined" ? self : this);
