// LR4 strut plates - G-code for cutting them on a LowRider / FluidNC (twin of freecad/cam.py, which needs FreeCAD
// CAM). Same setup as cam.py: the plates laid along Y side by side in X on 1/4" MDF, zero at the stock's front-left
// corner, top of stock; all bolt holes first, then each outline offset by the bit radius with tabs; 0.25 mm into the
// spoil board. Output in the style of freecad/fclib/fluidnc_post.py (settings block, touch plate, MSG pauses,
// (Stock:) / (ToolDef:) comments for the stock simulator). tests/test_strut_cam.js checks it against cam.py's G-code.
// opts.design (Part 41, plate_design.js toolpaths in the front plate's frame): T2 V-bit engraving first, then M0, the
// bit change and Z probed again, then T1: holes, the design's pockets and cut-throughs, outlines. None = as cam.py.
// Needs strut_plate.js (global `StrutPlate`, or require() in node) and polygon-clipping.
(function (root) {
  "use strict";
  const SP = typeof module !== "undefined" && module.exports ? require("./strut_plate.js") : root.StrutPlate;

  // cam.py's parameters. Feeds in mm/s (as cam.py), lengths in mm.
  const DEFAULTS = {
    t: 6.35,          // stock thickness (1/4" MDF) - MEASURE YOURS
    through: 0.25,    // into the spoil board (V1E: at least 0.2)
    margin: 12, gap: 12,                 // stock edge to plate, between the plates
    bit: 3.175, flutes: 1, flute_len: 12, oal: 38, bitName: "1/8in 1-flute upcut",
    feed: 15, plunge: 3,                 // mm/s
    step: 2,          // depth per pass
    router: "kobalt", dial: 3,           // dial 3 = ~18000 RPM on the Kobalt
    tabs: 4, tabW: 6, tabH: 1.5,         // tabs per outline; tabW = flat top length of the tool path
    plate: 0.5,       // touch plate thickness; null / 0 = zero Z by hand
    clear: 4, safe: 2,                   // rapid height, feed-start height above the stock top
    probeDepth: 110, probeFeed: 200, probeClear: 10,
    holeD: 5.3, wing: 11.5, dogbones: 3.5, nbraces: 0,
    title: "LowRider4 strut plates",
  };

  // fluidnc_post.ROUTERS: (dial, RPM), half steps interpolated
  const ROUTERS = {
    kobalt: { name: "Kobalt trim router", dial: [[1, 10000], [2, 14000], [3, 18000], [4, 22000], [5, 26000], [6, 35000]] },
    makita: { name: "Makita RT0701C", dial: [[1, 10000], [2, 12000], [3, 17000], [4, 22000], [5, 27000], [6, 30000]] },
    carbide: { name: "Carbide Compact Router", dial: [[1, 11000], [2, 13500], [3, 18250], [4, 24500], [5, 29250], [6, 31000]] },
    dewalt: { name: "DeWalt DWP611", dial: [[1, 16000], [2, 18200], [3, 20400], [4, 22600], [5, 24800], [6, 27000]] },
  };
  function dialRpm(dial, router) {
    const pts = ROUTERS[router].dial;
    if (dial <= pts[0][0]) return pts[0][1];
    for (let k = 1; k < pts.length; k++)
      if (dial <= pts[k][0]) return pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * (dial - pts[k - 1][0]) / (pts[k][0] - pts[k - 1][0]);
    return pts[pts.length - 1][1];
  }

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0], len = a => Math.hypot(a[0], a[1]);
  const area = ring => ring.reduce((s, p, i) => s + cross(p, ring[(i + 1) % ring.length]), 0) / 2;

  // ---- layout: SCAD (x along the strut, y across) -> stock (X, Y) = (-y, x), front first, as cam.py ----
  function layout(pc, strut, o) {
    const q = SP.plates(pc, strut, { nbraces: o.nbraces, wing: o.wing, dogbones: o.dogbones, layout: false });
    const plates = [];
    let x = o.margin;
    for (const name of ["front", "bottom"]) {
      if (q[name].length !== 1) throw new Error(`${name} plate is ${q[name].length} pieces`);
      let rings = q[name][0].map(r => r.slice(0, -1).map(([a, b]) => [-b, a]));
      const all = rings.flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
      const dx = x - Math.min(...xs), dy = o.margin - Math.min(...ys);
      rings = rings.map(r => r.map(([a, b]) => [a + dx, b + dy]));
      plates.push({ name, outer: rings[0], holes: rings.slice(1), xf: [dx, dy] });   // xf: generator (a, b) -> (-b + dx, a + dy)
      x += Math.max(...xs) - Math.min(...xs) + o.gap;
    }
    return { plates, braces: q.braces, stock: { w: x - o.gap + o.margin, l: strut + 2 * o.margin } };
  }

  // ---- outline offset: a CCW ring pushed out by r. Convex corners -> arcs round the corner (as FreeCAD's
  // profile), concave -> the offset lines meet; edges the offset swallows (inside the dogbones) are dropped. ----
  function offsetRing(ring, r) {
    let pts = ring.filter((p, i) => len(sub(p, ring[(i + 1) % ring.length])) > 1e-9);
    if (area(pts) < 0) pts = pts.reverse();
    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length], d = mul(sub(q, p), 1 / len(sub(q, p)));
      return { p0: p, p1: q, d, n: [d[1], -d[0]] };
    });
    const meet = (A, B) => {            // where offset line A meets offset line B (null = parallel)
      const c = cross(A.d, B.d);
      if (Math.abs(c) < 1e-12) return null;
      const a0 = add(A.p0, mul(A.n, r)), b0 = add(B.p0, mul(B.n, r));
      return add(a0, mul(A.d, cross(sub(b0, a0), B.d) / c));
    };
    // join type at each vertex between edge k-1 and k: arc (original corner, convex) or a meeting point
    for (let guard = 0; guard < 1000; guard++) {
      const m = edges.length, ends = [];
      for (let k = 0; k < m; k++) {
        const A = edges[(k - 1 + m) % m], B = edges[k], c = cross(A.d, B.d);
        const corner = len(sub(A.p1, B.p0)) < 1e-9;
        if (corner && c > 1e-9 && dot(A.d, B.d) < Math.cos(0.2 * Math.PI / 180)) ends.push({ arc: true, at: A.p1 });
        else if (corner && c > -1e-9) ends.push({ arc: false, pt: add(A.p1, mul(A.n, r)), pt2: add(B.p0, mul(B.n, r)) });
        else { const p = meet(A, B); ends.push({ arc: false, pt: p, pt2: p }); }
      }
      // each edge runs from its start join to its end join; drop any the offset turned backwards
      let bad = -1;
      for (let k = 0; k < m; k++) {
        const E = edges[k], s = ends[k], e = ends[(k + 1) % m];
        const a = s.arc ? add(E.p0, mul(E.n, r)) : s.pt2, b = e.arc ? add(E.p1, mul(E.n, r)) : e.pt;
        if (!a || !b || dot(sub(b, a), E.d) <= 1e-9) { bad = k; break; }
        E.a = a; E.b = b;
      }
      if (bad < 0) {
        const out = [];
        for (let k = 0; k < m; k++) {
          const E = edges[k], e = ends[(k + 1) % m];
          out.push({ type: "line", a: E.a, b: E.b });
          if (e.arc) out.push({ type: "arc", a: E.b, b: edges[(k + 1) % m].a, c: e.at, ccw: true });
          else if (len(sub(E.b, edges[(k + 1) % m].a)) > 1e-9) out.push({ type: "line", a: E.b, b: edges[(k + 1) % m].a });
        }
        return out;
      }
      edges.splice(bad, 1);
    }
    throw new Error("outline offset did not settle");
  }

  const arcSweep = el => {               // radians, > 0, in the element's own direction
    const a0 = Math.atan2(el.a[1] - el.c[1], el.a[0] - el.c[0]), a1 = Math.atan2(el.b[1] - el.c[1], el.b[0] - el.c[0]);
    let s = el.ccw ? a1 - a0 : a0 - a1;
    while (s <= 1e-12) s += 2 * Math.PI;
    return s;
  };
  const elLen = el => el.type === "line" ? len(sub(el.b, el.a)) : len(sub(el.a, el.c)) * arcSweep(el);
  const reverse = els => els.slice().reverse().map(el => Object.assign({}, el, { a: el.b, b: el.a, ccw: el.type === "arc" ? !el.ccw : undefined }));

  // Tabs: n tabs spread round the loop, each on a straight long enough for the flat + both 45 deg ramps.
  function placeTabs(els, o) {
    const half = o.tabW / 2 + o.tabH + 1, segs = [];
    let s = 0;
    els.forEach((el, k) => { const L = elLen(el); if (el.type === "line" && L >= 2 * half) segs.push({ k, s0: s, s1: s + L }); s += L; });
    const P = s, tabs = [];
    for (let i = 0; i < o.tabs; i++) {
      const target = P * (i + 0.5) / o.tabs;
      let best = null;
      for (const g of segs) {
        const c = Math.min(Math.max(target, g.s0 + half), g.s1 - half);
        if (tabs.some(t => Math.abs(t.s - c) < 2 * half)) continue;
        if (!best || Math.abs(c - target) < Math.abs(best.s - target)) best = { s: c, k: g.k, off: c - g.s0 };
      }
      if (best) tabs.push(best);
    }
    return tabs;
  }

  // ---- moves: {g, x, y, z, i, j, f: "feed" | "plunge"}; z / x / y left out = unchanged ----
  function depths(o) {
    const final = -o.t - o.through, out = [];
    for (let z = -o.step; z > final + 1e-6; z -= o.step) out.push(z);
    out.push(final);
    return out;
  }

  function holeOp(plate, o) {
    const r = o.holeD / 2 - o.bit / 2, mv = [];
    if (r <= 0.05) throw new Error("bit too big for the bolt holes");
    const cs = plate.holes.map(h => mul(h.reduce((s, p) => add(s, p), [0, 0]), 1 / h.length));
    // two rows along Y: up one row, back down the other (serpentine)
    const xs = [...new Set(cs.map(c => c[0].toFixed(2)))].map(Number).sort((a, b) => a - b);
    const order = xs.flatMap((x, k) => cs.filter(c => Math.abs(c[0] - x) < 0.01).sort((a, b) => k % 2 ? b[1] - a[1] : a[1] - b[1]));
    const a = Math.PI / 4, at = (c, q) => [c[0] + r * Math.cos(a + q * Math.PI / 2), c[1] + r * Math.sin(a + q * Math.PI / 2)];
    for (const c of order) {
      const p = at(c, 0);
      mv.push({ g: 0, z: o.clear }, { g: 0, x: p[0], y: p[1] }, { g: 0, z: o.safe });
      for (const z of depths(o)) {
        mv.push({ g: 1, z, f: "plunge" });
        for (let q = 1; q <= 4; q++) {
          const s = at(c, q - 1), e = at(c, q);
          mv.push({ g: 3, x: e[0], y: e[1], i: c[0] - s[0], j: c[1] - s[1], f: "feed" });
        }
      }
    }
    mv.push({ g: 0, z: o.clear });
    return { name: `${cap(plate.name)} holes`, moves: mv, holes: order.map(c => ({ x: c[0], y: c[1], r })) };
  }

  function outlineOp(plate, o) {
    let els = reverse(offsetRing(plate.outer, o.bit / 2));         // clockwise round the outside, as cam.py
    let k0 = 0;                                                       // start on the longest straight
    els.forEach((el, k) => { if (el.type === "line" && elLen(el) > elLen(els[k0])) k0 = k; });
    els = els.slice(k0).concat(els.slice(0, k0));
    const tabs = placeTabs(els, o), top = -o.t - o.through + o.tabH;
    const p0 = els[0].a, mv = [{ g: 0, z: o.clear }, { g: 0, x: p0[0], y: p0[1] }, { g: 0, z: o.safe }];
    for (const z of depths(o)) {
      mv.push({ g: 1, z, f: "plunge" });
      els.forEach((el, k) => {
        if (el.type === "arc") {
          const s = el.a, c = el.c;
          mv.push({ g: el.ccw ? 3 : 2, x: el.b[0], y: el.b[1], i: c[0] - s[0], j: c[1] - s[1], f: "feed" });
          return;
        }
        const d = mul(sub(el.b, el.a), 1 / elLen(el)), pt = s => add(el.a, mul(d, s));
        const ramp = top - z;
        for (const t of z < top - 1e-6 ? tabs.filter(t => t.k === k).sort((a, b) => a.off - b.off) : []) {
          const s0 = t.off - o.tabW / 2;
          for (const [s, zz, f] of [[s0 - ramp, z, "feed"], [s0, top, "feed"], [s0 + o.tabW, top, "feed"], [s0 + o.tabW + ramp, z, "plunge"]]) {
            const p = pt(s);
            mv.push({ g: 1, x: p[0], y: p[1], z: zz, f });
          }
        }
        mv.push({ g: 1, x: el.b[0], y: el.b[1], z, f: "feed" });
      });
    }
    mv.push({ g: 0, z: o.clear });
    return { name: `${cap(plate.name)} outline`, moves: mv, path: els, tabs: tabs.length, tabTop: top };
  }
  const cap = s => s[0].toUpperCase() + s.slice(1);

  // fluidnc_post.op_minutes: feeds / plunges at their rates, rapids at 50 mm/s, x 1.25
  function minutes(moves, o, from) {
    let [x, y, z] = from, t = 0;
    for (const m of moves) {
      const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z;
      let d = Math.hypot(nx - x, ny - y, nz - z);
      if (m.g >= 2) d = Math.hypot(Math.hypot(m.i, m.j) * arcSweep({ a: [x, y], b: [nx, ny], c: [x + m.i, y + m.j], ccw: m.g === 3 }), nz - z);
      t += m.g === 0 ? d / 50 : d / (m.f === "plunge" && Math.hypot(nx - x, ny - y) < 1e-6 ? o.plunge : o.feed);
      [x, y, z] = [nx, ny, nz];
    }
    return { min: t * 1.25 / 60, end: [x, y, z] };
  }
  const fmtMin = m => m < 1 ? "<1 min" : `~${Math.round(m)} min`;
  const g = v => String(+v.toFixed(4));
  const f3 = v => { const s = v.toFixed(3); return s === "-0.000" ? "0.000" : s; };

  // ---- the job ----------------------------------------------------------------------------------------------
  function job(pc, strut, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    if (!(o.t > 0 && o.step > 0 && o.feed > 0 && o.plunge > 0)) throw new Error("thickness, depth per pass and feeds must be > 0");
    if (o.tabs && o.tabH >= o.t + o.through) throw new Error("tabs must be lower than the stock");
    if (!ROUTERS[o.router]) throw new Error(`unknown router ${o.router}`);
    const lay = layout(pc, strut, o);
    const D = o.design || null, front = lay.plates.find(p => p.name === "front");
    const place = (op, tool) => {                    // a design op, front plate frame -> the stock's
      const [dx, dy] = front.xf;
      return { name: op.name, tool, moves: op.moves.map(m => Object.assign({}, m, m.x === undefined ? {} : { x: -m.y + dx, y: m.x + dy },
        m.g >= 2 ? { i: -m.j, j: m.i } : {})) };
    };
    const eng = D && D.engrave ? [place(D.engrave, 2)] : [];
    const ops = [...eng, ...lay.plates.map(p => holeOp(p, o)), ...(D ? D.t1.map(op => place(op, 1)) : []), ...lay.plates.map(p => outlineOp(p, o))];
    for (const op of ops) op.tool = op.tool || 1;
    let pos = [0, 0, o.probeClear];
    for (const op of ops) { const r = minutes(op.moves, o, pos); op.minutes = r.min; pos = r.end; }
    const rpm = dialRpm(o.dial, o.router), total = ops.reduce((s, op) => s + op.minutes, 0);
    const stock = { xmin: 0, xmax: lay.stock.w, ymin: 0, ymax: lay.stock.l, zmin: -o.t, zmax: 0 };
    const plate = o.plate ? o.plate : null, router = ROUTERS[o.router];
    const mms = v => `${g(v)} mm/min = ${g(+(v / 60).toPrecision(3))} mm/s`;
    const vName = D ? `${g(D.angle)}deg V-bit` : "";
    const L = [`(${o.title} ${g(strut)} mm)`, "(lr4-sandbox strut plate CAM, fluidnc post style - V1E Jackpot style. Run from the SD card.)",
      "(CNCSIM 1 UNITS=mm)",
      `(Stock: XMIN=${g(stock.xmin)} XMAX=${g(stock.xmax)} YMIN=0 YMAX=${g(stock.ymax)} ZMIN=${g(stock.zmin)} ZMAX=0)`,
      `(ToolDef 1: SHAPE=flat D=${g(o.bit)} FLUTES=${o.flutes} LEN=${g(o.flute_len)} OAL=${g(o.oal)} NAME=${o.bitName})`,
      ...(eng.length ? [`(ToolDef 2: SHAPE=vbit D=${g(D.vbitD)} ANGLE=${g(D.angle)} NAME=${vName})`] : []),
      "G0 G54 G17 G21 G90 G94", "", "(===== Settings - edit here =====)", "(Feeds, mm/min)",
      `#<t1_feed>=${g(o.feed * 60)} (T1 ${o.bitName} - cutting: ${mms(o.feed * 60)})`,
      `#<t1_plunge>=${g(o.plunge * 60)} (T1 ${o.bitName} - plunging: ${mms(o.plunge * 60)})`,
      ...(eng.length ? [`#<t2_feed>=${g(o.feed * 60)} (T2 ${vName} - cutting: ${mms(o.feed * 60)})`,
        `#<t2_plunge>=${g(o.plunge * 60)} (T2 ${vName} - plunging: ${mms(o.plunge * 60)})`] : []),
      "(Heights above the board top, mm)",
      `#<clear_z>=${g(o.clear)} (rapids between regions)`, `#<safe_z>=${g(o.safe)} (feed moves start from here)`];
    if (plate) L.push("(Touch plate)", `#<plate>=${g(plate)} (plate thickness, mm)`,
      `#<probe_feed>=${g(o.probeFeed)} (${mms(o.probeFeed)})`,
      `#<probe_depth>=${g(o.probeDepth)} (probe goes down to Z-${g(o.probeDepth)} at most, below the work zero)`,
      `#<probe_clear>=${g(o.probeClear)} (Z after probing)`,
      `#<probe_x>=${g(o.margin / 2)} (probe spot X)`, `#<probe_y>=${g(o.margin / 2)} (probe spot Y)`);
    const lo = router.dial[0][1], hi = router.dial[router.dial.length - 1][1];
    const note = rpm < lo * 0.97 ? ` - ${router.name} can't go below ~${lo} RPM` : rpm > hi * 1.03 ? ` - above this router's ~${hi} RPM max` : "";
    // (comment lines kept short: FluidNC stops a job on a line over 127 bytes, "14 Line too long")
    const t1Min = ops.filter(op => op.tool === 1).reduce((s, op) => s + op.minutes, 0);
    const zeroZ = () => {                            // probe (or zero by hand) the bit now in the router
      if (plate) L.push("G0 X#<probe_x> Y#<probe_y> (probe spot: the uncut margin corner)", "M0 (MSG, Attach Probe)",
        "G38.2 Z[-#<probe_depth>] F#<probe_feed> P#<plate> (probe, Z = plate thickness)", "G0 Z#<probe_clear>",
        `M0 (MSG, Remove Probe and Turn On Router at Dial ${g(o.dial)})`);
      else L.push(`M0 (MSG, Zero Z on the Board Top, then turn On Router at Dial ${g(o.dial)})`);
    };
    const t1Head = () => [`(===== T1: ${o.bitName} - ${router.name} dial ${g(o.dial)} = ~${Math.round(rpm)} RPM${note}, ${fmtMin(t1Min)} =====)`, "T1"];
    if (eng.length) {
      L.push("", `(Start: Tool T2 ${vName} in the router, router off,)`, "(jogged to the stock's front-left corner, just above the MDF)", "",
        `(===== T2: ${vName} - ${router.name} dial ${g(o.dial)}, ${fmtMin(eng[0].minutes)} =====)`,
        "T2", "G10 L20 P0 X0 Y0 Z0 (here = X0 Y0, temporary Z0)");
      zeroZ();
    } else {
      L.push("", `(Start: Tool T1 ${o.bitName} in the router, router off,)`, "(jogged to the stock's front-left corner, just above the MDF)", "",
        ...t1Head(), "G10 L20 P0 X0 Y0 Z0 (here = X0 Y0, temporary Z0)");
      zeroZ();
    }
    let last = { x: null, y: null, z: null, f: null };
    ops.forEach((op, n) => {
      if (n && op.tool !== ops[n - 1].tool) {         // after the engraving: the 1/8" bit in, Z found again
        L.push("G0 Z#<clear_z>", `M0 (MSG, Turn Off Router, Change to T1 ${o.bitName})`, "", ...t1Head());
        zeroZ();
        last = { x: null, y: null, z: null, f: null };
      }
      L.push(`(MSG, ${n + 1}/${ops.length} T${op.tool} ${op.name} - ${fmtMin(op.minutes)})`);
      for (const m of op.moves) {
        const w = [`G${m.g}`];
        for (const ax of ["x", "y", "z"]) {
          if (m[ax] === undefined) continue;
          const v = f3(m[ax]);
          if (m.g >= 2 && ax !== "z" || v !== last[ax]) w.push(ax.toUpperCase() + v);
          last[ax] = v;
        }
        if (m.g === 0 && m.z !== undefined && m.x === undefined && w.length > 1) w[1] ="Z" + (Math.abs(m.z - o.clear) < 1e-9 ? "#<clear_z>" : "#<safe_z>");
        if (m.g >= 2) w.push("I" + f3(m.i), "J" + f3(m.j));
        const fk = `t${op.tool}_${m.f}`;
        if (m.g && fk !== last.f) { w.push(`F#<${fk}>`); last.f = fk; }
        if (w.length > 1) L.push(w.join(" "));
      }
    });
    L.push("", "G4 P0 (finish queued moves, then home Z - FluidNC 4.1 rejects $HZ while moving)", "$HZ",
      "(MSG, Done - Turn Off Router)", "M30");
    return {
      gcode: L.join("\n") + "\n", ops, stock, minutes: total, rpm, braces: lay.braces, depths: depths(o),
      chipLoad: o.feed * 60 / (rpm * o.flutes), lines: L.length, opts: o,
    };
  }

  const api = { DEFAULTS, ROUTERS, dialRpm, layout, offsetRing, job };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StrutCam = api;
})(typeof self !== "undefined" ? self : this);
