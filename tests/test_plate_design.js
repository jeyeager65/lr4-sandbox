// Part 41: the front plate design (web/js/plate_design.js) and its place in the strut job (strut_cam.js opts.design).
// The template (its length marker, layers); shapes sorted into engrave / pockets / cut-throughs; the checks; offsets and
// pocket lines keep the bit off the walls; the toolpaths carved with the page's stock simulator land at the right
// depths; the merged job: T2 V-bit first, the bit change and Z probed again, T1 after, lines within FluidNC's 127 bytes,
// the engraving on the front plate in the stock's frame.
//   node tests/test_plate_design.js   (in npm test)
"use strict";
const pc = require("polygon-clipping");
const PD = require("../web/js/plate_design.js"), SC = require("../web/js/strut_cam.js");
const { StockSimulator, compileStockTool } = require("../web/js/lib/cnc-gcode-tools/stock-sim.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;
const L = 830, P = PD.plate(pc, L);
const cam = Object.assign({}, SC.DEFAULTS);         // the strut job's bit, depths, tabs, heights
const circle = (cx, cy, r, n = 48) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), -(cy + r * Math.sin(2 * Math.PI * i / n))]);
const rect = (x, y, w, h) => [[x, -y], [x + w, -y], [x + w, -(y + h)], [x, -(y + h)], [x, -y]];   // svg mm (y down)

// the template
const T = PD.template(pc, L);
ok(PD.lengthOf(T) === 830 && /inkscape:label="Engrave"/.test(T) && /inkscape:label="Cut through"/.test(T) && /sodipodi:insensitive="true"/.test(T)
  && /inkscape:label="Example"[^>]*display:none/.test(T), "template: length marker, layers, guide locked, Example hidden");
ok(P.holes.length === 2 * 5 && near(P.box[3] - P.box[1], 67.5 + 2 * 11.5, 1e-6), `front plate: ${P.holes.length} bolt holes, ${(P.box[3] - P.box[1]).toFixed(1)} mm tall with wings`);

// a design: a line, a pocket (with an island), a cut-through, and the bad ones
const mid = L / 2, cy = 33.75;
const good = [
  { kind: "engrave", el: 1, closed: false, pts: [[mid - 100, -(cy + 15)], [mid + 100, -(cy + 15)]] },
  { kind: "pocket", el: 2, closed: true, depth: null, pts: rect(mid - 40, cy - 8, 80, 16) },
  { kind: "pocket", el: 2, closed: true, depth: null, pts: rect(mid - 10, cy - 3, 20, 6) },   // its island
  { kind: "pocket", el: 3, closed: true, depth: 2, pts: rect(mid + 60, cy - 5, 25, 10) },
  { kind: "through", el: 4, closed: true, pts: circle(mid - 70, cy, 8) },
];
const D = PD.design(good);
ok(D.engrave.length === 1 && D.pockets.length === 2 && D.pockets[0].rings.length === 2 && D.pockets[1].depth === 2 && D.through.length === 1,
  "design: 1 line, 2 pockets (one with an island, one 2 mm), 1 cut-through");
ok(near(D.pockets[0].rings[0][0][1], cy - 8, 1e-9), "svg y down -> plate y up");
const pr = PD.check(D, P, { bit: cam.bit });
ok(!pr.some((p) => p.level === "error"), `good design: no errors ${JSON.stringify(pr)}`);
const errs = (items, more = {}) => PD.check(Object.assign(PD.design(items), more), P, { bit: cam.bit }).filter((p) => p.level === "error").map((p) => p.text);
const h0 = P.holes[0];
ok(errs([{ kind: "engrave", el: 1, closed: false, pts: [[h0[0] - 3, -h0[1]], [h0[0] + 3, -h0[1]]] }]).some((t) => /bolt holes/.test(t)), "a line over a bolt hole: error");
ok(errs([{ kind: "engrave", el: 1, closed: false, pts: [[mid, -(cy)], [mid, -(cy + 60)]] }]).some((t) => /edge/.test(t)), "a line off the plate: error");
ok(errs([{ kind: "pocket", el: 1, closed: false, pts: [[mid, -cy], [mid + 20, -cy]] }]).some((t) => /open shape/.test(t)), "an open pocket: error");
ok(errs([{ kind: "pocket", el: 1, closed: true, pts: rect(mid, cy, 2.5, 20) }]).some((t) => /narrower/.test(t)), "a 2.5 mm pocket (1/8\" bit): error");
ok(errs([], { text: 2 }).some((t) => /not turned into paths/.test(t)), "text objects: error");
ok(errs([]).some((t) => /Nothing/.test(t)), "nothing to cut: error");

// offsets and pocket lines: never closer than the bit radius to a wall
const r = cam.bit / 2, ring = D.pockets[0].rings[0];
const inw = PD.offsetPath(ring, r, true), outw = PD.offsetPath(ring, r, false);
const xs = inw.flatMap((e) => [e.a[0], e.b[0]]);
ok(inw.every((e) => e.type === "line") && near(Math.max(...xs) - Math.min(...xs), 80 - 2 * r, 1e-6), "inward offset of a rectangle: straight, bit-width smaller");
ok(outw.filter((e) => e.type === "arc").length === 4, "outward offset: arcs round the 4 corners");
ok(PD.offsetPath(rect(0, 0, 2, 2), r, true) === null, "inward offset of a 2 mm square for a 3.2 mm bit: none");
const lines = PD.pocketLines(D.pockets[0].rings, r, cam.bit * 0.4);
const segs = D.pockets[0].rings.flatMap((q) => q.map((p, i) => [p, q[(i + 1) % q.length]]));
const dist = (p) => Math.min(...segs.map(([a, b]) => { const ab = [b[0] - a[0], b[1] - a[1]], L2 = ab[0] ** 2 + ab[1] ** 2, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2)) : 0; return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t); }));
ok(lines.length > 5 && lines.every((q) => dist([q.x0, q.y]) >= r - 1e-6 && dist([q.x1, q.y]) >= r - 1e-6 && !PD.inRings([(q.x0 + q.x1) / 2, q.y], [D.pockets[0].rings[1]])),
  `pocket lines: ${lines.length}, all at least r from a wall, none over the island`);

// the toolpaths carved with the simulator (plate frame, z 0 = the face): engraving 0.5 deep, pockets 1.5 / 2, through
const opts = Object.assign({}, cam, { angle: 90 });
const tp = PD.toolpaths(D, opts);
ok(tp.engrave && tp.t1.length === 2, `toolpaths: engraving + ${tp.t1.map((o) => o.name).join(", ")}`);
const t = cam.t, sim = new StockSimulator({ xmin: mid - 110, xmax: mid + 110, ymin: 0, ymax: 67.5, zmin: -t - 1, zmax: 0 }, new Map(), { maxCells: 4e5 });
const vbit = compileStockTool({ shape: "vbit", diameter: 6.35, angle: 90 }), flat = compileStockTool({ shape: "flat", diameter: cam.bit });
for (const [mv, tool] of [[tp.engrave.moves, vbit], ...tp.t1.map((o) => [o.moves, flat])]) for (const p of PD.pieces(mv)) sim.sweep(...p, tool);
const at = (x, y) => { const i = Math.round((x - sim.stock.xmin) / sim.dx), j = Math.round((y - sim.stock.ymin) / sim.dy); return sim.heights[j * sim.vx + i]; };
ok(near(at(mid, cy + 15), -0.5, 0.15), `engraved line: ${at(mid, cy + 15).toFixed(2)} (-0.5)`);
ok(near(at(mid - 25, cy), -1.5, 0.05) && near(at(mid, cy), 0, 1e-6), `pocket: ${at(mid - 25, cy).toFixed(2)} (-1.5), island ${at(mid, cy).toFixed(2)} (0)`);
ok(near(at(mid + 72, cy), -2, 0.05), `2 mm pocket (its layer's depth): ${at(mid + 72, cy).toFixed(2)}`);
ok(at(mid - 70 + 7.6, cy) < -t + 0.01 && near(at(mid - 70, cy), 0, 1e-6), `cut-through: its ring cut through (${at(mid - 70 + 7.6, cy).toFixed(2)}), the slug's middle untouched`);
ok(near(at(mid - 100, 10), 0, 1e-6), "the plate elsewhere: untouched");

// merged into the strut job
const J = SC.job(pc, L, Object.assign({ design: Object.assign({}, tp, { angle: 90, vbitD: 6.35 }) }));
const G = J.gcode, lines2 = G.split("\n");
const iT2 = lines2.indexOf("T2"), iT1 = lines2.indexOf("T1");
ok(/\(ToolDef 2: SHAPE=vbit D=6\.35 ANGLE=90 NAME=90deg V-bit\)/.test(G) && iT2 > 0 && iT1 > iT2, "job: ToolDef 2, T2 before T1");
ok((G.match(/^G38\.2 /gm) || []).length === 2 && /M0 \(MSG, Turn Off Router, Change to T1/.test(G), "job: probed twice, a bit change between");
ok(/\(MSG, 1\/\d+ T2 Front plate engraving/.test(G) && /T1 Front plate pockets/.test(G) && /T1 Front plate cut-throughs/.test(G), "job: engraving (T2), pockets + cut-throughs (T1)");
ok(lines2.every((l) => Buffer.byteLength(l) <= 127), `job: every line within 127 bytes (longest ${Math.max(...lines2.map((l) => Buffer.byteLength(l)))})`);
ok(G.indexOf("Front plate pockets") > G.indexOf("Bottom holes") && G.indexOf("Front plate cut-throughs") < G.indexOf("Front outline"), "job: holes, then the design, then the outlines");
// the engraving's XY on the front plate as laid on the stock
const front = SC.layout(pc, L, Object.assign({}, cam)).plates[0], eng = J.ops.find((o) => o.name === "Front plate engraving");
const xy = eng.moves.filter((m) => m.x !== undefined).map((m) => [m.x, m.y]);
ok(xy.length && xy.every((p) => PD.inRings(p, [front.outer])), `engraving inside the front plate on the stock (${xy.length} points)`);
const fx = front.xf, want = [-(cy + 15) + fx[0], (mid - 100) + fx[1]];
ok(xy.some((p) => near(p[0], want[0], 1e-6) && near(p[1], want[1], 1e-6)), "engraving's end at the turned plate's spot (x, y) -> (-y + dx, x + dy)");

console.log(`${checks - fails}/${checks} passed`);
process.exit(fails ? 1 : 0);
