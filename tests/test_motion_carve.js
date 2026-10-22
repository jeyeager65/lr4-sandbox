// motion_carve.js + the Part 17 additions to gcode_play.js and sd_card.js.   node tests/test_motion_carve.js
// Carving from motion: the strut plate job "run" by sampling its own timeline (as the page samples FluidNC's motors:
// every 4 ms of wall time at 1x / 10x, positions on a 1/200 mm step grid) carves the same stock as Playback's
// whole-move carve; a probe that stops early and a jog off the path are carved as the machine moved; a sample gap
// (a stalled page) still carves the moves in between. gcode_play: user stock / bits as a header (line numbers stay
// the file's), a change to an undefined bit stops playback, missing() / guess. sd_card: cleanName, diff, walk.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const pc = require("polygon-clipping");
const SC = require("../web/js/strut_cam.js");
const MC = require("../web/js/motion_carve.js");
const SD = require("../web/js/sd_card.js");

const ctx = vm.createContext({ console, performance, Math, Map, Set, Float64Array, Float32Array, Uint8Array, Symbol });
for (const f of ["lib/cnc-gcode-tools/gcode-expander.js", "lib/cnc-gcode-tools/stock-sim.js", "lib/cnc-gcode-tools/parser.js",
  "lib/cnc-gcode-tools/animator.js", "gcode_play.js"])
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "js", f), "utf8"), ctx, { filename: f });
const GP = vm.runInContext("self = this; GcodePlay", ctx), StockSimulator = vm.runInContext("StockSimulator", ctx);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const grid = (v) => Math.round(v * 200) / 200;                         // the motors' step grid
const newSim = (tl) => new StockSimulator(tl.stock, tl.tools, { maxCells: 2e5, snapshots: false });
// cells that differ by more than e mm, as a fraction of all
const differ = (a, b, e = 0.05) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > e) n++; return n / a.length; };
const cutCells = (h, top) => { let n = 0; for (const v of h) if (v < top - 1e-3) n++; return n; };

// play tl by sampling it every dtJob seconds of job time through the tracker; mutate(p, t) can move a sample off the path
function run(tl, dtJob, mutate) {
  const sim = newSim(tl), T = MC.tracker(tl.segs);
  let lines = 0;
  for (let t = 0; ; t = Math.min(t + dtJob, tl.total)) {
    const q = GP.at(tl, t), p = mutate ? mutate({ x: q.x, y: q.y, z: q.z }, t) : q;
    const acts = T.feed({ x: grid(p.x), y: grid(p.y), z: grid(p.z) }, 150 * dtJob * 1.5 + 1);
    lines += acts.filter((a) => a.line).length;
    MC.carve(sim, tl.segs, acts);
    if (t >= tl.total) break;
  }
  return { sim, T, lines };
}

(async () => {
  const job = SC.job(pc, 830, {}), tl = await GP.load(job.gcode);
  const ref = newSim(tl);
  ref.setSegments(tl.segs);
  ref.advanceTo(tl.segs.length);
  const top = tl.stock.zmax, refCut = cutCells(ref.heights, top);
  for (const speed of [1, 10]) {
    const t0 = Date.now(), r = run(tl, 0.004 * speed);
    const d = differ(ref.heights, r.sim.heights);
    ok(differ(ref.heights, r.sim.heights, ref.dx + 0.01) === 0, `${speed}x: a cell off by more than one cell's slope`);
    ok(d < 5e-4, `${speed}x: ${(d * 100).toFixed(4)}% of cells differ from Playback (cut ${cutCells(r.sim.heights, top)} vs ${refCut})`);
    ok(r.T.carved === tl.segs.length && r.lines === 0, `${speed}x: on the path to the end (${r.T.carved}/${tl.segs.length}, ${r.lines} off-path lines)`);
    console.log(`  ${speed}x: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${(d * 100).toFixed(4)}% differ`);
  }
  // a stalled page: one sample a second at 10x (15 mm of path between samples) still carves every move
  {
    const r = run(tl, 10);
    const d = differ(ref.heights, r.sim.heights);
    ok(d < 5e-4 && differ(ref.heights, r.sim.heights, ref.dx + 0.01) === 0 && r.lines === 0, `1 s gaps at 10x: ${(d * 100).toFixed(4)}% differ, ${r.lines} off-path lines`);
  }
  // the probe stops 2 mm above where the file's model expects (a thicker plate): off the path for the stretch below,
  // then back on it; nothing extra cut
  {
    const pi = tl.segs.findIndex((s) => s.type === "probe"), ps = tl.segs[pi];
    const t0 = pi ? tl.t[pi - 1] : 0, t1 = tl.t[pi + 1];
    const stopZ = ps.end.z + 2;
    const r = run(tl, 0.04, (p, t) => (t > t0 && t < t1 && Math.abs(p.x - ps.end.x) < 1e-6 && Math.abs(p.y - ps.end.y) < 1e-6 ? { x: p.x, y: p.y, z: Math.max(p.z, stopZ) } : p));
    ok(differ(ref.heights, r.sim.heights, ref.dx + 0.01) === 0 && r.T.carved === tl.segs.length,
      `probe stopping early: same cut (${differ(ref.heights, r.sim.heights, ref.dx + 0.01)}), back on the path (${r.T.carved}/${tl.segs.length})`);
  }
  // a jog through the stock mid-job (5 mm deep, 40 mm across the middle, where the file doesn't cut): carved, then rejoins
  {
    const tm = tl.total / 2, S = tl.stock, cx = (S.xmin + S.xmax) / 2, cy = (S.ymin + S.ymax) / 2;
    let jog = null;
    const r = run(tl, 0.04, (p, t) => {
      if (t < tm || t > tm + 1.2) return p;
      jog = jog || { x: p.x, y: p.y, z: p.z };
      const k = (t - tm) / 1.2, pts = [[jog.x, jog.y, jog.z], [cx - 20, cy, 2], [cx - 20, cy, -5], [cx + 20, cy, -5], [cx + 20, cy, 2], [jog.x, jog.y, jog.z]];
      const f = k * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), u = f - i;
      return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u, z: pts[i][2] + (pts[i + 1][2] - pts[i][2]) * u };
    });
    const h = (x, y) => r.sim.heights[Math.round((y - S.ymin) / r.sim.dy) * r.sim.vx + Math.round((x - S.xmin) / r.sim.dx)];
    ok(r.lines > 3 && Math.abs(h(cx, cy) + 5) < 0.05 && Math.abs(h(cx - 30, cy) - top) < 1e-6, `jog through the stock: cut ${h(cx, cy).toFixed(2)} at the centre, ${r.lines} lines`);
    ok(r.T.carved === tl.segs.length, `after the jog: back on the path (${r.T.carved}/${tl.segs.length})`);
  }

  // no stock / ToolDef: missing(), a header in mm or inches, line numbers kept, the tool-change stop
  const bare = ["G21 G90", "T1 M6", "G0 Z5", "G0 X10 Y10", "G1 Z-3 F300", "G1 X60 F900", "G0 Z5", "T2 M6", "M0 (MSG, change bit)",
    "G0 X10 Y30", "G1 Z-2 F300", "G1 X60 F900", "G0 Z5", "M30"].join("\n");
  const b0 = await GP.load(bare), m = GP.missing(b0);
  ok(m.stock && m.tools.join() === "1,2" && m.guess && m.guess.xmax === 60 && m.guess.ymax === 30 && m.guess.thick === 3,
    `missing: ${JSON.stringify(m)}`);
  ok(b0.events.some((e) => e.kind === "tool" && /T2/.test(e.text) && e.lineNum === 8), `tool change to undefined T2 stops (${JSON.stringify(b0.events.map((e) => [e.kind, e.lineNum]))})`);
  const head = GP.header({ xmin: 0, xmax: 80, ymin: 0, ymax: 40, thick: 6 }, { 1: { shape: "flat", d: 6.35 }, 2: { shape: "vbit", d: 12.7, angle: 60 } });
  const b1 = await GP.load(bare, undefined, undefined, { header: head });
  ok(b1.stock && b1.stock.zmin === -6 && b1.tools.get(1).diameter === 6.35 && b1.tools.get(2).shape === "vbit",
    `header: stock ${JSON.stringify(b1.stock)}, tools ${JSON.stringify([...b1.tools])}`);
  ok(b1.lines === b0.lines && b1.segs.every((s, i) => s.srcLine === b0.segs[i].srcLine) && b1.segs[3].srcLine === 6 &&
    !b1.events.some((e) => e.kind === "tool") && b1.events.find((e) => e.kind === "pause").lineNum === 9, "header: line numbers stay the file's");
  ok(JSON.stringify(b0.events.map((e) => [e.kind, e.lineNum])) === '[["tool",8],["msg",9],["pause",9],["end",14]]', "tool stop on its M6 line, before the M0 after it");
  const inch = bare.replace("G21", "G20").replace(/([XYZ])(-?\d+)/g, (s, a, v) => a + (v / 25.4).toFixed(5));
  const b2 = await GP.load(inch, undefined, undefined, { header: GP.header({ xmin: 0, xmax: 80, ymin: 0, ymax: 40, thick: 6 }, { 1: { shape: "flat", d: 6.35 } }, true) });
  ok(b2.metaInch && Math.abs(b2.stock.xmax - 80) < 1e-3 && Math.abs(b2.tools.get(1).diameter - 6.35) < 1e-3, `inch header: ${JSON.stringify(b2.stock)}`);
  const sm = newSim(b1);
  sm.setSegments(b1.segs);
  sm.advanceTo(b1.segs.length);
  ok(cutCells(sm.heights, 0) > 100, "user stock + bits carve");
  // srcLine of a #<var> file maps through the expander
  ok(tl.segs.every((s) => s.srcLine >= 1 && s.srcLine <= tl.lines) && /G38\.2/.test(job.gcode.split("\n")[tl.segs.find((s) => s.type === "probe").srcLine - 1]),
    "strut job: srcLine = the file's own line (the probe's is the G38.2)");

  // sd_card
  ok(SD.cleanName("C:\\jobs\\My Sign (v2).gcode") === "My_Sign_(v2).gcode" && SD.cleanName("über ñ.nc") === "uber_n.nc" &&
    SD.cleanName("...") === "file.gcode" && SD.pathOf("a b.nc") === "/a_b.nc", "cleanName");
  const B = (s) => new TextEncoder().encode(s);
  const d = SD.diff([{ path: "/a.nc", bytes: B("1") }, { path: "/b.nc", bytes: B("2") }, { path: "/c.nc", bytes: B("3") }],
    [{ path: "/a.nc", bytes: B("1") }, { path: "/b.nc", bytes: B("22") }, { path: "/d/e.nc", bytes: B("4") }]);
  ok(d.put.map((r) => r.path).join() === "/b.nc,/d/e.nc" && d.remove.join() === "/c.nc", `diff ${JSON.stringify(d)}`);
  const tree = { "/native_sd": ["a.nc", "d"], "/native_sd/d": ["e.nc"] };
  const FS = { readdir: (p) => [".", ".."].concat(tree[p] || []), stat: (p) => ({ mode: tree[p] ? 1 : 0, mtime: new Date(5) }),
    isDir: (m) => m === 1, readFile: (p) => B(p) };
  const w = SD.walk(FS);
  ok(w.map((f) => f.path).join() === "/a.nc,/d/e.nc" && new TextDecoder().decode(w[1].bytes) === "/native_sd/d/e.nc", `walk ${w.map((f) => f.path)}`);

  console.log(fails ? `${fails}/${checks} checks FAILED` : `${checks}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
