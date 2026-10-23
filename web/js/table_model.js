// The table (Part 33): a spoilboard between two rail strips (3/4" MDF, z 0..T: the work surface, where the machine
// has always sat) on a base below z 0 - "sheet" (one 3/4" MDF sheet) or "torsion" (a plywood egg-crate, no skins,
// as long as the spoilboard: the rail strips stick out past its ends).
// Mirrors freecad/lr4.py table_parts + bom.py table_rows; tests/test_table_model.js checks it against the Python.
// Plain JS: parts() -> boxes (mm, the size builds' frame), rows() -> the cut list's table rows.
(function (root) {
  "use strict";
  const IN = 25.4;
  const TABLE = { spoil_t: 0.75 * IN, spoil_margin: 0.25 * IN, spoil_gap: 0.125 * IN, strip_min: 2.5 * IN,
    strip_max: 4.0 * IN, reach: [156.41, 134.5, 110.4715728752538, 201.0], sheet_t: 0.75 * IN, rib_t: 0.6 * IN, rib_h: 3.5 * IN, grid: 12.0 * IN, slot_clear: 0.4 };
  const KINDS = ["sheet", "torsion"];

  // rib positions (low face) along a side: the outer two flush with the edges, the rest even, <= grid apart
  function ribSpots(length, t, grid) {
    const n = Math.max(2, Math.ceil((length - t) / grid - 1e-9) + 1);
    return Array.from({ length: n }, (_, i) => (length - t) * i / (n - 1));
  }

  // [{ name, box: [x0, y0, z0, x1, y1, z1], slots: [box], role }] - the footprint and cutting area centred on the table
  function parts(kind, TW, TL, xtable, ytable, cutX, cutY, T, c) {
    c = Object.assign({}, TABLE, c || {});
    T = T == null ? c.spoil_t : T;
    const fx0 = (TW - xtable) / 2, fx1 = (TW + xtable) / 2, a = fx0 + c.strip_min, b = fx1 - c.strip_max;
    // the spoilboard: the bit's full travel (reach, from the footprint's edges = lr4.STOPS) + spoil_margin a side - a 1/4"
    // bit never runs off it, a 3/4" one surfaces all of it (user 2026-10-23)
    const fy0 = (TL - ytable) / 2, fy1 = (TL + ytable) / 2, r = c.reach, mg = c.spoil_margin;
    const sx0 = Math.max(fx0 + r[0] - mg, a + c.spoil_gap), sx1 = Math.min(fx1 - r[1] + mg, b - c.spoil_gap);
    const sy0 = Math.max(fy0 + r[2] - mg, 0), sy1 = Math.min(fy1 - r[3] + mg, TL);
    const out = [{ name: "RailStrip_Min", box: [0, 0, 0, a, TL, T], slots: [], role: "strip" },
      { name: "RailStrip_Max", box: [b, 0, 0, TW, TL, T], slots: [], role: "strip" },
      { name: "Spoilboard", box: [sx0, sy0, 0, sx1, sy1, T], slots: [], role: "spoil" }];
    if (kind !== "torsion") {
      out.push({ name: "TableBase", box: [0, 0, -c.sheet_t, TW, TL, 0], slots: [], role: "base" });
      return out;
    }
    const t = c.rib_t, h = c.rib_h, w = c.rib_t + c.slot_clear;
    const xs = ribSpots(TW, t, c.grid), ys = ribSpots(sy1 - sy0, t, c.grid).map((y) => sy0 + y);   // the box: the spoilboard's length
    xs.forEach((x, i) => {                // the outer two run the full length under the rail strips (RailEdge_*)
      const edge = i === 0 || i === xs.length - 1;
      out.push({ name: edge ? (i === 0 ? "RailEdge_Min" : "RailEdge_Max") : `TableRib_Y${i}`,
        box: [x, edge ? 0 : sy0, -h, x + t, edge ? TL : sy1, 0], role: edge ? "edge" : "rib",
        slots: ys.map((y) => [x - 1, y - (w - t) / 2, -h / 2, x + t + 1, y + (w + t) / 2, 1]) });
    });
    ys.forEach((y, j) => out.push({ name: `TableRib_X${j + 1}`, box: [0, y, -h, TW, y + t, 0], role: "rib",
      slots: xs.map((x) => [x - (w - t) / 2, y - 1, -h - 1, x + (w + t) / 2, y + t + 1, -h / 2]) }));
    return out;
  }

  // the cut list's table rows [qty, part, material, size, notes] (bom.py table_rows)
  const inch = (mm) => `${+(Math.round(mm / IN * 16) / 16).toFixed(4)}`;
  const NAMES = /^(Table top|Table sheet|Spoilboard|Rail strip, (Min|Max)|Rail side board|Torsion box rib, along [XY])$/;
  function rows(kind, list, marginIn) {
    const box = Object.fromEntries(list.map((p) => [p.name, p.box]));
    const size = (n) => `${inch(box[n][3] - box[n][0])} x ${inch(box[n][4] - box[n][1])} in`;
    const out = [[1, "Spoilboard", '3/4" MDF', size("Spoilboard"), `the bit's full travel + 1/4" a side: a 3/4" bit surfaces all of it`],
      [1, "Rail strip, Min", '3/4" MDF', size("RailStrip_Min"), "Y belt holders + the Min wheels ride on it"],
      [1, "Rail strip, Max", '3/4" MDF', size("RailStrip_Max"), "Y belt holders + Y rail clips"]];
    if (kind === "torsion") {
      const s = box.Spoilboard, over = inch(Math.max(s[1], box.RailStrip_Min[4] - s[4]));
      for (const r of out.slice(1)) r[4] += `; sticks out ${over} in past each end of the box`;
      const eb = box.RailEdge_Min;
      out.push([2, "Rail side board", '5/8" plywood (GUESS)', `${inch(eb[5] - eb[2])} x ${inch(eb[4] - eb[1])} in`,
        `the box's outer long rib, run the full length under the rail strip; ${list.find((p) => p.name === "RailEdge_Min").slots.length} half-lap slots from the top`]);
    }
    if (kind !== "torsion") {
      out.push([1, "Table sheet", '3/4" MDF', size("TableBase"),
        `calculator footprint + ${marginIn == null ? 1 : marginIn}" margin; the strips + spoilboard on it`]);
      return out;
    }
    for (const [axis, along, slot] of [["Y", "along Y", "top"], ["X", "along X", "bottom"]]) {
      const ribs = list.filter((p) => p.name.startsWith(`TableRib_${axis}`)), b = ribs[0].box;
      out.push([ribs.length, `Torsion box rib, ${along}`, '5/8" plywood (GUESS)',
        `${inch(b[5] - b[2])} x ${inch(Math.max(b[3] - b[0], b[4] - b[1]))} in`, `${ribs[0].slots.length} half-lap slots from the ${slot}`]);
    }
    return out;
  }

  const api = { TABLE, KINDS, NAMES, ribSpots, parts, rows };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Table = api;
})(typeof self !== "undefined" ? self : this);
