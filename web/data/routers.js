// The routers the page knows (Part 45b, user 2026-10-28): one preset each = where its speed comes from, its dial
// table or S range, its V1E mount set and its body (built in the page by js/router_body.js; the Kobalt preset =
// lib/fclib/hw.py KOBALT_K7TR03, the FreeCAD model, measured). Between the two marker lines is strict JSON so Python
// reads it too (tests/test_routers_data.py: fluidnc_post.ROUTERS has to match - the post stays self-contained).
//
// Body frame: mm, z up from the collet nut's bottom, +x = the switch / dial end of the head (Kobalt; the far round
// end on the Carbide), the cord leaves the -x end and bends toward +y. Every size differs per router (user).
//   nut [across flats, height, "hex" | "round"]; spindle / nose / grip / cast [d, length] stacked up from the nut;
//   grip_ch: the grip's collet-end chamfer (45 deg); trans: { l, d, shape: round | head, edge: none | fillet | chamfer, e }
//   the transition from the collar up to the head; looks: { grip | cast | trans: { c: sRGB, f: metal | plastic | rubber } };
//   (lathe: [[d, z]...] - old files' rows above the collar, read as the transition); slabs: the head and its pieces, each
//   { at: [x, y] centre, L (x), W (y) - or w: [w at -x, w at +x] for a trapezoid -, r: [corner r at -x, at +x],
//   z: [bottom, top], top_r: top edge rounding, dome: [-x end, +x end] side-profile rounding of the top, chamfer /
//   bot_r: bottom edge chamfer / rounding, part: "body" | "head" (default) | "cap" }; bosses: cylinders
//   { from: [x,y,z], dir, d, l, part }; dial: { axis: "z" (lying flat, rim out of the end: Kobalt / Makita) | "y"
//   (across the head, rim up through the top: Carbide), at: [x,y,z] centre, d, t, out: deg of the rim that shows
//   (0 = +x, 90 = +z for an axis-y wheel), slot: [L, W] dark slot round it on top }; switch: { at, size: [x, y, z] };
//   cord: { at: [x,y,z] where it leaves, d, relief: [length, d at the head], bend: deg toward +y, out: stub };
//   vents: [{ at: [x, y], size: [x, y], n, step: [dx, dy] }] dark slots on the top; colors: rgb 0..1.
// head (instead of slabs): the generic head, a box with rounded edges on top of the turned stack - { L, W, H, top_r,
//   front_r (+x end), back_r (-x end), bot_r (underneath), dial: "end" | "top" | { place, d, t } }; dial / switch /
//   cord given beside it are merged over the ones it places (js/router_body.js expand).
// GUESS = not measured (the plan's list); ring: the dial wheel's [color, groove] (js/page/router.js).
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
      "dial": [[1, 10000], [2, 14000], [3, 18000], [4, 22000], [5, 26000], [6, 35000]],
      "dial_source": "manual table",
      "mount": "kobalt",
      "body": {
        "label": "Kobalt K7TR-03 (measured)",
        "nut": [16.9, 13.0, "hex"],
        "spindle": [12.0, 4.0],
        "nose": [30.4, 11.0],
        "grip": [65.8, 100.0],
        "cast": [66.6, 22.0],
        "overall": 210.0,
        "lock": {
          "z": 25.0,
          "a": -51.5,
          "d": 16.8,
          "r": 29.5
        },
        "head": {
          "L": 105,
          "W": 80,
          "H": 60,
          "top_r": 8,
          "front_r": 14,
          "back_r": 14,
          "bot_r": 4,
          "dial": {
            "place": "end",
            "d": 22.0,
            "t": 8.0
          },
          "_note": "the generic head (2026-10-29, was photo-modelled): the measured 105 x 80 plan, collar top to the measured 210"
        },
        "cord": {
          "at": [-52.5, 0, 185],
          "relief": [45.0, 13.0]
        },
        "colors": {
          "body": [0.8, 0.82, 0.85],
          "head": [0.13, 0.33, 0.8],
          "cap": [0.07, 0.07, 0.08],
          "dial": [0.07, 0.07, 0.08],
          "switch": [0.17, 0.17, 0.18]
        },
        "ring": ["#202022", "#0b0b0c"]
      }
    },
    "makita": {
      "name": "Makita RT0701C",
      "source": "manual",
      "dial": [[1, 10000], [2, 12000], [3, 17000], [4, 22000], [5, 27000], [6, 30000]],
      "dial_source": "Makita RT0701C instruction manual, speed adjusting dial table",
      "mount": "makita",
      "body": {
        "label": "Makita RT0701C (GUESS: published sizes, not measured)",
        "nut": [22.0, 14.0, "hex"],
        "spindle": [12.0, 4.0],
        "nose": [0, 0],
        "grip": [65.0, 95.0],
        "cast": [65.0, 8.0],
        "overall": 205.0,
        "head": {
          "L": 78.0,
          "W": 72.0,
          "H": 84.0,
          "top_r": 8.0,
          "front_r": 14.0,
          "back_r": 14.0,
          "bot_r": 4.0,
          "_note": "generic head, GUESS"
        },
        "cord": {
          "relief": [45.0, 13.0]
        },
        "colors": {
          "body": [0.8, 0.82, 0.85],
          "head": [0.067, 0.6, 0.63],
          "cap": [0.07, 0.07, 0.08],
          "dial": [0.78, 0.2, 0.17]
        },
        "ring": ["#c8322b", "#8e1f1a"]
      }
    },
    "carbide": {
      "name": "Carbide Compact Router",
      "source": "manual",
      "dial": [[1, 11000], [2, 13500], [3, 18250], [4, 24500], [5, 29250], [6, 31000]],
      "dial_source": "Carbide 3D table (approximate)",
      "mount": "makita",
      "body": {
        "label": "Carbide Compact Router (user-measured 2026-10-28; shape from photos)",
        "nut": [19.0, 13.0, "hex"],
        "spindle": [12.0, 3.0],
        "nose": [66.0, 8.0],
        "grip": [64.8, 85.0],
        "cast": [66.0, 9.0],
        "trans": {
          "l": 38.0,
          "d": 73.0,
          "shape": "round",
          "edge": "none"
        },
        "overall": 200.0,
        "head": {
          "L": 100.0,
          "W": 75.0,
          "H": 44.0,
          "top_r": 14.0,
          "front_r": 14.0,
          "back_r": 14.0,
          "bot_r": 4.0,
          "dial": {
            "d": 28.0,
            "t": 9.0
          },
          "_note": "generic head: the measured 75 wide, on the cast shoulder (156) up to 200"
        },
        "cord": {
          "at": [-50.0, 0, 176.0],
          "relief": [40.0, 12.0]
        },
        "colors": {
          "body": [0.8, 0.82, 0.85],
          "head": [0.36, 0.37, 0.39],
          "cap": [0.07, 0.07, 0.08],
          "dial": [0.78, 0.15, 0.13]
        },
        "ring": ["#c22a22", "#871a15"]
      }
    },
    "dewalt": {
      "name": "DeWalt DWP611",
      "source": "manual",
      "dial": [[1, 16000], [2, 18200], [3, 20400], [4, 22600], [5, 24800], [6, 27000]],
      "dial_source": "even spread over DeWalt's 16000-27000 RPM spec - unverified",
      "mount": "dewalt",
      "body": {
        "label": "DeWalt DWP611 (GUESS: published sizes, not measured)",
        "nut": [22.0, 15.0, "hex"],
        "spindle": [12.0, 4.0],
        "nose": [0, 0],
        "grip": [69.0, 100.0],
        "cast": [69.0, 6.0],
        "overall": 215.0,
        "head": {
          "L": 82.0,
          "W": 76.0,
          "H": 90.0,
          "top_r": 10.0,
          "front_r": 14.0,
          "back_r": 14.0,
          "bot_r": 4.0,
          "dial": {
            "d": 22.0
          },
          "_note": "generic head, GUESS"
        },
        "colors": {
          "body": [0.8, 0.82, 0.85],
          "head": [0.996, 0.741, 0.09],
          "cap": [0.07, 0.07, 0.08],
          "dial": [0.07, 0.07, 0.08]
        },
        "ring": ["#202022", "#0b0b0c"]
      }
    },
    "t1": {
      "name": "Sienci AutoSpin T1",
      "source": "gcode",
      "s": [10000, 31250],
      "dial_source": "Sienci: 5 V PWM, 0-100 % = 0-31250 RPM, under 10000 not accurate (GUESS: S = RPM straight)",
      "mount": "makita",
      "body": {
        "label": "Sienci AutoSpin T1 (GUESS: Makita-size body, not measured)",
        "nut": [22.0, 14.0, "hex"],
        "spindle": [12.0, 4.0],
        "nose": [0, 0],
        "grip": [65.0, 95.0],
        "cast": [65.0, 8.0],
        "overall": 210.0,
        "head": {
          "L": 78.0,
          "W": 72.0,
          "H": 89.0,
          "top_r": 8.0,
          "front_r": 14.0,
          "back_r": 14.0,
          "bot_r": 4.0,
          "_note": "generic head, GUESS"
        },
        "colors": {
          "body": [0.8, 0.82, 0.85],
          "head": [0.1, 0.1, 0.11],
          "cap": [0.07, 0.07, 0.08],
          "dial": [0.07, 0.07, 0.08]
        },
        "ring": ["#202022", "#0b0b0c"]
      }
    },
    "spindle65": {
      "name": "65 mm spindle (air-cooled)",
      "source": "gcode",
      "s": [6000, 24000],
      "dial_source": "a VFD sets the speed from S (GUESS: a typical 800 W - 1.5 kW 24000 RPM spindle, S = RPM straight)",
      "mount": "makita",
      "body": {
        "label": "65 mm spindle (GUESS: typical sizes, not measured)",
        "kind": "spindle",
        "nut": [22.0, 12.0, "hex"],
        "nose": [48.0, 10.0],
        "can": [65.0, 180.0],
        "cooling": "air",
        "overall": 202.0,
        "colors": {
          "body": [0.8, 0.82, 0.85],
          "head": [0.1, 0.1, 0.11],
          "cap": [0.07, 0.07, 0.08],
          "dial": [0.07, 0.07, 0.08]
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
