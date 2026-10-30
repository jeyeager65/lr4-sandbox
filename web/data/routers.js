// The routers the page knows (Part 45b, user 2026-10-28): one preset each = where its speed comes from, its dial's
// speed table or S range, its V1E mount set and its model (built in the page by js/router_body.js). Between the two
// marker lines is strict JSON so Python reads it too (tests/test_routers_data.py: fluidnc_post.ROUTERS has to match -
// the post stays self-contained).
//
// Model frame: mm, z up from the collet nut's bottom, +x = the switch / dial end of the motor cap, the cord leaves the
// -x end and bends toward +y. Every size differs per router (user). Names (user 2026-10-29, "clean naming everywhere"):
//   collet_nut { type, af: across flats, h, shape: hex | round, below: its face below the shaft's end };
//   collet { type, sizes: shank mm, l, d, taper: deg }; shaft { d, exposed: the gap from the nut's top up to the
//   bearing cap, thread { d, pitch, length }, flats { af, z, l } (a 2-wrench router: the flats a wrench holds) };
//   bearing_cap / housing (the motor housing the mount clamps; ch = its collet-end 45 deg chamfer) / collar { d, l },
//   stacked up from the nut; transition { l, d: top Ø, shape: round | cap (lofted to the motor cap's plan), edge:
//   none | fillet | chamfer, e } up to the motor cap { L (x), W (y), H (z), top_r, front_r (+x end), back_r (-x end),
//   bot_r, at: [x, y] }; dial { place: end | top, d, t, ring: [wheel, groove] colors }; switch { at, size, rocker };
//   shaft_lock { z, a: deg from +x (counter-clockwise from above), d, r: reach from the axis, travel: press depth };
//   strain_relief { at, l, d: at the cap, bend: deg toward +y }; cord { d, out: the stub drawn past the relief };
//   looks { part: { c: sRGB 0..1, f: metal | plastic | rubber } } for every part (js/routers.js LOOK_PARTS).
//   A spindle: { kind: "spindle", collet_nut, collet, shaft, bearing_cap, housing (the can), cooling: air | water }.
// The Kobalt's motor cap: centred on the axis, top + under fillets 14 (GUESS: clears the hose); its measured 80 mm width reaches ~3 mm into the core's top and its
// upper bearing bolts' heads (the real head is narrower at the back; 5 mm forward instead cut the hose 5.3 mm).
// clamp (nut below the lower clamp, mm): the Kobalt's is the build's 36.5; the others GUESS - both clamps on the
// housing, the upper one 3 mm under its top (V1E doesn't say how high each router sits).
// GUESS = not measured: the shaft flats, thread length, collet sizes / types except the Kobalt + Carbide (user:
// ER11 1/8 + 1/4, ER11A nut, M13 x 0.75), every Makita / DeWalt / T1 / spindle size. MEASURE YOURS.
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
        "collet_nut": {"type": "ER11A", "af": 16.9, "h": 13.0, "shape": "hex", "below": 1.5},
        "collet": {"type": "ER11", "sizes": [3.175, 6.35], "l": 18.0, "d": 11.5, "taper": 8},
        "shaft": {"d": 12.0, "exposed": 4.0, "thread": {"d": 13.0, "pitch": 0.75, "length": 8.0}},
        "bearing_cap": {"d": 30.4, "l": 11.0},
        "housing": {"d": 65.8, "l": 100.0},
        "collar": {"d": 66.6, "l": 22.0},
        "motor_cap": {"L": 105, "W": 80, "H": 60, "top_r": 14, "front_r": 14, "back_r": 14, "bot_r": 14},
        "dial": {"place": "end", "d": 22.0, "t": 8.0, "ring": ["#202022", "#0b0b0c"]},
        "shaft_lock": {"z": 25.0, "a": -51.5, "d": 16.8, "r": 29.5, "travel": 3.0},
        "strain_relief": {"at": [-52.5, 0, 185], "l": 45.0, "d": 13.0, "bend": 45.0},
        "looks": {
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
        "label": "Makita RT0701C (GUESS: published sizes, not measured)",
        "clamp": 29.5,
        "collet_nut": {"type": "Makita", "af": 22.0, "h": 14.0, "shape": "hex", "below": 1.5},
        "collet": {"type": "Makita cone", "sizes": [6.35, 9.525], "l": 20.0, "d": 14.0, "taper": 8},
        "shaft": {"d": 12.0, "exposed": 4.0, "thread": {"d": 16.0, "pitch": 1.0, "length": 9.0}},
        "housing": {"d": 65.0, "l": 95.0},
        "collar": {"d": 65.0, "l": 8.0},
        "motor_cap": {"L": 78.0, "W": 72.0, "H": 84.0, "top_r": 8.0, "front_r": 14.0, "back_r": 14.0, "bot_r": 4.0},
        "dial": {"place": "end", "d": 24.0, "t": 6.0, "ring": ["#c8322b", "#8e1f1a"]},
        "shaft_lock": {"z": 24.0, "a": -50.0, "d": 12.0, "r": 35.5, "travel": 3.0},
        "looks": {
          "motor_cap": {"c": [0.067, 0.6, 0.63], "f": "plastic"},
          "dial": {"c": [0.78, 0.2, 0.17], "f": "plastic"}
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
        "clamp": 25.5,
        "collet_nut": {"type": "ER11A", "af": 19.0, "h": 13.0, "shape": "hex", "below": 1.5},
        "collet": {"type": "ER11", "sizes": [3.175, 6.35], "l": 18.0, "d": 11.5, "taper": 8},
        "shaft": {"d": 12.0, "exposed": 3.0, "thread": {"d": 13.0, "pitch": 0.75, "length": 8.0}, "flats": {"af": 10.0, "z": 13.2, "l": 2.6}},
        "bearing_cap": {"d": 66.0, "l": 8.0},
        "housing": {"d": 64.8, "l": 85.0},
        "collar": {"d": 66.0, "l": 9.0},
        "transition": {"l": 38.0, "d": 73.0, "shape": "round", "edge": "none"},
        "motor_cap": {"L": 100.0, "W": 75.0, "H": 44.0, "top_r": 14.0, "front_r": 14.0, "back_r": 14.0, "bot_r": 4.0},
        "dial": {"place": "end", "d": 28.0, "t": 9.0, "ring": ["#c22a22", "#871a15"]},
        "strain_relief": {"at": [-50.0, 0, 176.0], "l": 40.0, "d": 12.0, "bend": 45.0},
        "looks": {
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
        "clamp": 35.5,
        "collet_nut": {"type": "DeWalt", "af": 22.0, "h": 15.0, "shape": "hex", "below": 1.5},
        "collet": {"type": "DeWalt", "sizes": [6.35], "l": 20.0, "d": 12.0, "taper": 8},
        "shaft": {"d": 12.0, "exposed": 4.0, "thread": {"d": 16.0, "pitch": 1.0, "length": 9.0}},
        "housing": {"d": 69.0, "l": 100.0},
        "collar": {"d": 69.0, "l": 6.0},
        "motor_cap": {"L": 82.0, "W": 76.0, "H": 90.0, "top_r": 10.0, "front_r": 14.0, "back_r": 14.0, "bot_r": 4.0},
        "dial": {"place": "end", "d": 22.0, "t": 6.0},
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
        "clamp": 29.5,
        "collet_nut": {"type": "ER11A", "af": 17.0, "h": 13.0, "shape": "hex", "below": 1.5},
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
        "collet_nut": {"type": "ER11A", "af": 22.0, "h": 12.0, "shape": "hex", "below": 1.5},
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
