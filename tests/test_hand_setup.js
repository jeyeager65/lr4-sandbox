// hand_setup.js (Part 31): which stock / bits a file brings, the offset carve view (a job's moves carving the table's
// spoilboard = the same cuts as carving in the table's frame), topAt / level / resample, and the surfacing job (it
// parses, brings its bit, and lowers a marked-up spoilboard to its depth: marks shallower than that go, deeper stay).
//   node tests/test_hand_setup.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const HS = require("../web/js/hand_setup.js");
const MC = require("../web/js/motion_carve.js");

const ctx = vm.createContext({ console, performance, Math, Map, Set, Float64Array, Float32Array, Uint8Array, Symbol });
for (const f of ["lib/cnc-gcode-tools/gcode-expander.js", "lib/cnc-gcode-tools/stock-sim.js", "lib/cnc-gcode-tools/parser.js",
  "lib/cnc-gcode-tools/animator.js", "gcode_play.js"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "js", f), "utf8"), ctx, { filename: f });
const GP = vm.runInContext("self = this; GcodePlay", ctx), StockSimulator = vm.runInContext("StockSimulator", ctx);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

(async () => {
  // needs()
  const n0 = HS.needs("G21\nG0 X1\n");
  ok(!n0.stock && n0.tools.join() === "1" && !n0.surfacing, `bare: ${JSON.stringify(n0)}`);
  const n1 = HS.needs("(Stock: XMIN=0 XMAX=1 YMIN=0 YMAX=1 ZMIN=-1 ZMAX=0)\n(ToolDef 2: SHAPE=flat D=3)\nT2 M6\nG0 X1 (T9 in a comment)\nM6 T3\n");
  ok(n1.stock && n1.tools.join() === "3", `own stock, T2 defined, T3 not: ${JSON.stringify(n1)}`);
  // bit form <-> def
  const b = { shape: "vbit", d: 12.7, angle: 60, len: 30, tip: 0, cr: 0, flutes: 0 }, d = HS.toDef(b);
  ok(d.diameter === 12.7 && d.angle === 60 && d.overallLength === 30 && JSON.stringify(HS.fromDef(d)) === JSON.stringify(b), `toDef/fromDef ${JSON.stringify(d)}`);
  ok(/1\/4"/.test(HS.bitName({ shape: "flat", d: 6.35 })), HS.bitName({ shape: "flat", d: 6.35 }));
  // every shape the simulator cuts (user 2026-10-26): bullnose, chamfer, tapered ball + tip / corner radius / flutes
  for (const x of [{ shape: "bullnose", d: 6.35, angle: 90, len: 0, tip: 0, cr: 1, flutes: 2 }, { shape: "chamfer", d: 12.7, angle: 90, len: 0, tip: 1, cr: 0, flutes: 0 },
    { shape: "taperball", d: 6.35, angle: 10, len: 25, tip: 1.5, cr: 0, flutes: 2 }]) {
    const y = HS.toDef(x);
    ok(JSON.stringify(HS.fromDef(y)) === JSON.stringify(x), `round trip ${x.shape}: ${JSON.stringify(y)}`);
  }
  ok(HS.toDef({ shape: "flat", d: 6, angle: 90, tip: 2, cr: 1 }).tip === undefined && HS.toDef({ shape: "flat", d: 6, cr: 1 }).cornerRadius === undefined,
    "a flat bit carries no tip / corner radius");
  ok(HS.SHAPES.length === 6 && /chamfer/.test(HS.bitName({ shape: "chamfer", d: 12.7, angle: 90 })) && /tapered ball/.test(HS.bitName({ shape: "taperball", d: 3 })), "names");

  // the offset view carves the same as the table's own frame
  const spoil = () => new StockSimulator({ xmin: -50, xmax: 250, ymin: -50, ymax: 250, zmin: -19, zmax: 0 }, new Map(), { maxCells: 9e4, snapshots: false });
  const tools = StockSimulator.compileTools(new Map([[1, { shape: "flat", diameter: 6 }]]));
  const a = spoil(), c = spoil(), off = [20, 30, 6];          // work zero 20 / 30 from the corner, on 6 mm stock
  const segs = [{ type: "cut", toolNumber: 1, start: { x: 0, y: 0, z: -4 }, end: { x: 100, y: 50, z: -8 } }];
  HS.shifted(a, off, tools, tools.get(1)).carveOne(segs[0], null, tools, null);
  c.sweep(20, 30, 2, 120, 80, -2, tools.get(1));
  let same = true;
  for (let i = 0; i < a.heights.length; i++) if (Math.abs(a.heights[i] - c.heights[i]) > 1e-6) same = false;
  ok(same && Math.min(...a.heights) < -1.9, `shifted carveOne = the table frame's sweep (min ${Math.min(...a.heights)})`);
  const e = spoil();
  MC.carve(HS.shifted(e, off, tools, tools.get(1)), segs, [{ line: [{ x: 0, y: 0, z: -4 }, { x: 100, y: 50, z: -8 }], seg: 0 }]);
  ok(Math.abs(Math.min(...e.heights) - Math.min(...c.heights)) < 1e-6, "motion_carve lines through the offset view");
  ok(HS.topAt(c, 110, 75, 1) < -1 && HS.topAt(c, 200, 200) === 0 && HS.topAt(c, 999, 0) === null, "topAt: in the cut, untouched, off it");
  ok(HS.level(c.heights) === 0, "level: a mark doesn't move it");
  const r = HS.resample(c.heights, c.nx, c.ny, Math.round(c.nx / 2), Math.round(c.ny / 2));
  ok(r.length === (Math.round(c.nx / 2) + 1) * (Math.round(c.ny / 2) + 1) && Math.min(...r) < -1, "resample keeps the cut");

  // surfacing: marks 0.3 mm deep go, a 2 mm one stays (shallower)
  const board = spoil();
  board.sweep(10, 10, -0.3, 180, 10, -0.3, tools.get(1));
  board.sweep(10, 100, -2, 180, 100, -2, tools.get(1));
  const text = HS.surfacing({ x: [0, 200], y: [0, 200], d: 25.4, over: 0.4, z: -0.5 });
  const tl = await GP.load(text);
  ok(HS.needs(text).surfacing && !HS.needs(text).tools.length && tl.tools.get(1).diameter === 25.4 && !tl.stock, "surfacing job: marked, brings its bit");
  ok(text.split("\n").every((l) => new TextEncoder().encode(l).length <= 127), "surfacing job: every line fits FluidNC (<= 127 bytes)");
  const sim = HS.shifted(board, [0, 0, 0], StockSimulator.compileTools(tl.tools), null);
  tl.segs.forEach((s, i) => sim.carveOne(s, tl.segs[i - 1], sim.tools, sim.defaultTool));
  ok(Math.abs(HS.level(board.heights) - -0.5) < 1e-4, `surfaced level ${HS.level(board.heights)}`);
  ok(Math.abs(HS.topAt(board, 95, 10, 1) + 0.5) < 1e-4 && HS.topAt(board, 95, 100, 1) < -1.9, "0.3 mm mark gone, 2 mm one stays");

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
