// imperfect.js (Part 32): the stop offsets the pulloffs square, homing's residual, a racked / tilted machine's cuts
// (attach), the router out of tram leaving ridges when surfacing (and none trammed), the warped spoilboard and the
// squareness test.
//   node tests/test_imperfect.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const IM = require("../web/js/imperfect.js");

const ctx = vm.createContext({ console, performance, Math, Map, Set, Float64Array, Float32Array, Uint8Array, Symbol });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "js", "lib/cnc-gcode-tools/stock-sim.js"), "utf8"), ctx, { filename: "stock-sim.js" });
const StockSimulator = vm.runInContext("StockSimulator", ctx);

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// settings: saved values over the defaults, nested ones merged
const s0 = IM.settings({ exag: 50, tram: { x: 0.5 } });
ok(s0.exag === 50 && s0.tram.x === 0.5 && s0.tram.y === 0 && s0.warp.bow === IM.DEFAULTS.warp.bow, `settings ${JSON.stringify(s0)}`);

// pulloffs + stops: equal (V1E) -> the GUESS; the user's unequal ones -> what squares them; set ones win
const pv = IM.pulloffs({ "/axes/y/motor0/pulloff_mm": 4, "/axes/y/motor1/pulloff_mm": 4, "/axes/z/motor0/pulloff_mm": 4, "/axes/z/motor1/pulloff_mm": 4 });
const pos = { y: false, z: true };
const st0 = IM.stops(IM.settings(), pv, pos);
ok(st0.y === IM.GUESS_STOP.y && st0.from.y === "guess" && st0.z === IM.GUESS_STOP.z, `V1E pulloffs: ${JSON.stringify(st0)}`);
ok(near(IM.residual(st0.y, pv.y, false), IM.GUESS_STOP.y) && near(IM.residual(st0.z, pv.z, true), IM.GUESS_STOP.z), "V1E's config homes out by the stops");
const pu = IM.pulloffs({ "/axes/y/motor0/pulloff_mm": 4, "/axes/y/motor1/pulloff_mm": 3.2, "/axes/z/motor0/pulloff_mm": 3.5, "/axes/z/motor1/pulloff_mm": 4.1 });
const st1 = IM.stops(IM.settings(), pu, pos);
ok(st1.from.y === "pulloffs" && near(IM.residual(st1.y, pu.y, false), 0) && near(IM.residual(st1.z, pu.z, true), 0), `the user's pulloffs square it: ${JSON.stringify(st1)}`);
ok(near(st1.y, 0.8) && near(st1.z, 0.6), `stops = the pulloff difference: ${st1.y} ${st1.z}`);
const st2 = IM.stops(IM.settings({ stop: { y: 1.5 } }), pu, pos);
ok(st2.y === 1.5 && st2.from.y === "set" && near(IM.residual(st2.y, pu.y, false), 0.7), `a set stop: ${JSON.stringify(st2)}`);
ok(JSON.stringify(IM.pulloffs({ "/axes/y/motor0/pulloff_mm": 2 }).y) === "[2,2]" && IM.pulloffs({}).z.join() === "4,4", "missing pulloffs");

// power-up: within the limits, none when off
const rnd = (() => { let k = 7; return () => (k = (k * 16807) % 2147483647) / 2147483647; })();
const pw = [...Array(50)].map(() => IM.powerUp(IM.settings({ on: true }), rnd));
ok(pw.every((e) => Math.abs(e.y) <= 2 && Math.abs(e.z) <= 1.5) && pw.some((e) => Math.abs(e.y) > 0.5), "power-up errors");
ok(JSON.stringify(IM.powerUp(IM.settings({ on: true, power: false }), rnd)) === '{"y":0,"z":0}' && IM.powerUp(IM.settings(), rnd).y === 0, "no power-up error when off (the default)");

// a racked machine cuts a line along X sloping in Y: 1 mm rack over the span = 1 mm at side 2, half way = 0.5
const geo = { xA: -50, span: 700 };
const te = IM.tipErr({ y: 1, z: -0.5 }, geo, 300);
ok(near(te.dy, 0.5) && near(te.dz, -0.25), `tipErr ${JSON.stringify(te)}`);
const flat = (d) => StockSimulator.compileTools(new Map([[1, { number: 1, shape: "flat", diameter: d }]])).get(1);
const mk = (o) => new StockSimulator(Object.assign({ xmin: 0, xmax: 600, ymin: 0, ymax: 100, zmin: -10, zmax: 0 }, o), new Map(), { maxCells: 2e5, snapshots: false });
const STATE = { set: IM.settings({ on: true, tram: { x: 0, y: 0 } }), E: { y: 1.4, z: 0 }, geo };
const a = IM.attach(mk(), [0, 0, 0], () => STATE), b3 = flat(3.175);
a.sweep(0, 50, -1, 600, 50, -1, b3);
const yAt = (sim, x) => {                            // the cut's centre line in Y at x (the deepest cells' mean)
  const i = Math.round((x - sim.stock.xmin) / sim.dx); let s = 0, n = 0;
  for (let j = 0; j <= sim.ny; j++) if (sim.heights[j * sim.vx + i] < -0.5) { s += sim.stock.ymin + j * sim.dy; n++; }
  return n ? s / n : NaN;
};
const r0 = yAt(a, 10), r1 = yAt(a, 590), want = 1.4 * 580 / 700;
ok(Math.abs(r1 - r0 - want) < 0.5, `racked cut slopes: ${(r1 - r0).toFixed(2)} vs ${want.toFixed(2)}`);
STATE.set.on = false;
const p = IM.attach(mk(), [0, 0, 0], () => STATE);
p.sweep(0, 50, -1, 600, 50, -1, b3);
ok(Math.abs(yAt(p, 590) - yAt(p, 10)) < 0.2, "off: as commanded");
STATE.set.on = true;
// attach twice = the same wrapper, frame updated
ok(IM.attach(a, [5, 0, 0], () => STATE) === a && a._asBuilt.toTable[0] === 5, "attach again");

// the router out of tram: surfacing (passes along Y, 40% step-over of a 25.4 mm bit) leaves ridges; trammed is flat
function surface(tram, Ez = 0) {
  const S = { set: IM.settings({ on: true, tram }), E: { y: 0, z: Ez }, geo }, sim = IM.attach(mk({ xmax: 200 }), [0, 0, 0], () => S);
  const d = 25.4, t = flat(d), step = d * 0.4;
  for (let x = 20; x <= 180; x += step) sim.sweep(x, -20, -0.5, x, 120, -0.5, t);
  const j = Math.round(50 / sim.dy); let lo = Infinity, hi = -Infinity;
  for (let i = Math.ceil(40 / sim.dx); i <= Math.floor(160 / sim.dx); i++) { const h = sim.heights[j * sim.vx + i]; lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return { lo, hi };
}
const sm = surface({ x: 0, y: 0 }), rg = surface({ x: 0.5, y: 0 });
ok(near(sm.lo, -0.5, 1e-6) && near(sm.hi, -0.5, 1e-6), `trammed: flat ${JSON.stringify(sm)}`);
const ridge = 25.4 * 0.4 * Math.tan(0.5 * Math.PI / 180);   // the next pass's low edge is a step-over on: its face rises that far
ok(near(rg.lo, -0.5, 0.005) &&Math.abs(rg.hi - rg.lo - ridge) < 0.03, `0.5 deg out of tram: ridges ${(rg.hi - rg.lo).toFixed(3)} mm vs ${ridge.toFixed(3)}`);
const bt = surface({ x: 0, y: 0 }, 2);             // a tilted beam tilts the router too (2 mm over 700)
ok(bt.hi - bt.lo > 0.02, `beam tilt leaves ridges too: ${(bt.hi - bt.lo).toFixed(3)}`);
// tram in Y: the edges along a pass (sideways) - a pass along Y with the bit tilted in Y is still flat across
const ty = surface({ x: 0, y: 0.5 });
ok(ty.hi - ty.lo < 0.01, `tram in Y, passes along Y: flat across ${(ty.hi - ty.lo).toFixed(4)}`);

// a fresh warped spoilboard: the corners and middle as set
const box = { x: [0, 600], y: [0, 100] }, w = { x: 0.3, y: -0.2, bow: 0.4 };
ok(near(IM.warpAt(w, box, 300, 50), 0.4) && near(IM.warpAt(w, box, 600, 50), 0.15) && near(IM.warpAt(w, box, 0, 0), -0.05), "warpAt");
const wb = mk(), span = IM.warpBoard(wb, w, box), hAt = (x, y) => wb.heights[Math.round(y / wb.dy) * wb.vx + Math.round(x / wb.dx)];
let top = -Infinity;
for (const v of wb.heights) top = Math.max(top, v);
ok(near(top, 0) && near(hAt(300, 50) - hAt(0, 0), 0.45, 0.01) && span > 0.45, `warpBoard: high spot at the top, middle 0.45 over the corner (${span.toFixed(3)} deep)`);

// squareness: square = equal diagonals; racked = the difference ~ 2 x rack x h / diagonal
const sq0 = IM.squareness({ y: 0, z: 0 }, geo, { x0: 0, x1: 600, y0: 0, y1: 1200 });
ok(near(sq0.diff, 0) && near(sq0.skew, 0), "square");
const sq1 = IM.squareness({ y: 1, z: 0 }, geo, { x0: 0, x1: 600, y0: 0, y1: 1200 });
const rk = 600 / 700, dd = 2 * rk * 1200 / Math.hypot(600, 1200);
ok(Math.abs(sq1.diff - dd) < 0.01 && sq1.skew > 0, `racked 1 mm: diagonals differ ${sq1.diff.toFixed(3)} vs ${dd.toFixed(3)}`);
const job = IM.squareJob({ x: 20, y: 20, w: 500, h: 1000, z: -0.3 });
ok(/^\(LR4 squareness test\)/.test(job) && /ToolDef 1: SHAPE=vbit/.test(job) && /G1 X520\.000 Y1020\.000/.test(job) && /M30/.test(job), "squareJob");
ok(job.split("\n").every((l) => new TextEncoder().encode(l).length <= 127), "squareJob: every line fits FluidNC (<= 127 bytes)");

// a tuned config's pulloffs written into a config.yaml (FluidNC boots it): only motor pulloff_mm lines change, a missing one is added
const yml = "axes:\n  y:\n    motor0:\n      hard_limits: true\n      pulloff_mm: 4.000\n    motor1:\n      hard_limits: true\n  z:\n    motor1:\n      pulloff_mm: 4\n";
const wp = IM.withPulloffs(yml, { y: [4, 3.2], z: [4, 3.5] }), wv = wp.split("\n");
ok(wv.length === yml.split("\n").length + 1 && wv[4] === "      pulloff_mm: 4.000" && wv[7] === "      pulloff_mm: 3.200" && wv[10] === "      pulloff_mm: 3.500", `withPulloffs:\n${wp}`);
ok(IM.withPulloffs(yml, null) === yml && JSON.stringify(IM.settings({ pull: { y: [4, 3.2] } }).pull) === '{"y":[4,3.2]}' && IM.settings().pull === null, "no pull = as it is; settings keep pull");
const stT = IM.stops(IM.settings(), { y: [4, 3.2], z: [4, 3.5] }, pos);
ok(near(IM.residual(stT.y, [4, 3.2], false), 0) && near(IM.residual(stT.z, [4, 3.5], true), 0), `tuned pulloffs: $H squares + levels (stops ${stT.y} / ${stT.z})`);

// the tip's X shift: racked, the bit (ty in front of the carriages) swings -X; the beam tilted, the tip (tz below) +X
const gT = { xA: -50, span: 943, ty: 70, tz: 170 };
const tx = IM.tipErr({ y: 8, z: 0 }, gT, 300), tz = IM.tipErr({ y: 0, z: 5 }, gT, 300);
ok(near(tx.dx, -8 * 70 / 943) && near(tz.dx, 5 * 170 / 943) && IM.tipErr({ y: 1, z: 1 }, geo, 0).dx === 0, `tip X shift ${tx.dx.toFixed(3)} / ${tz.dx.toFixed(3)}`);
const xs = IM.attach(mk(), [0, 0, 0], () => ({ set: IM.settings({ on: true }), E: { y: 0, z: 5 }, geo: gT }));
xs.sweep(300, 0, -3, 300, 100, -3, b3);
const xAt = (sim, y) => {                            // the cut's centre line in X at y
  const j = Math.round((y - sim.stock.ymin) / sim.dy); let s = 0, n = 0;
  for (let i = 0; i <= sim.nx; i++) if (sim.heights[j * sim.vx + i] < -0.5) { s += sim.stock.xmin + i * sim.dx; n++; }
  return n ? s / n : NaN;
};
ok(Math.abs(xAt(xs, 50) - 300 - tz.dx) < 0.3, `the cut moves in X with the tilt: ${(xAt(xs, 50) - 300).toFixed(2)} vs ${tz.dx.toFixed(2)}`);

// a laid board: uncut = as laid (flat or warped), any cut = cut, not known = cut
const lb = mk(), lbox = { x: [0, 600], y: [0, 100] };
IM.warpBoard(lb, w, lbox);
ok(!IM.boardCut(lb, w, lbox) && IM.boardCut(lb, null, lbox) && IM.boardCut(lb, undefined, lbox), "a warped board, uncut");
const fb = mk();
ok(!IM.boardCut(fb, null, lbox) && IM.boardCut(fb, w, lbox), "a flat board, uncut");
IM.warpBoard(lb, w, lbox); lb.sweep(100, 50, -1, 120, 50, -1, b3);
ok(IM.boardCut(lb, w, lbox), "a warped board, cut");

// stock that follows a warped spoilboard: a pass at one Z cuts it shallower where the board is lower; flat stock (on
// the high spot) evenly
const sb = mk(); IM.warpBoard(sb, { x: 0.6, y: 0, bow: 0 }, lbox);   // +X end 0.6 higher
const rest = IM.restField(sb, { x: [100, 500], y: [20, 80] });
ok(rest && near(rest.at(500, 50), 0, 0.02) && near(rest.at(100, 50), -0.4, 0.03) && !IM.restField(mk(), lbox), `restField ${rest && rest.at(100, 50).toFixed(3)}`);
const stk = (fol) => {
  const s = new StockSimulator({ xmin: 100, xmax: 500, ymin: 20, ymax: 80, zmin: 0, zmax: 18 }, new Map(), { maxCells: 1e5, snapshots: false });
  IM.attach(s, [0, 0, 0], () => ({ set: IM.settings({ on: true }), E: { y: 0, z: 0 }, geo }));
  if (fol) IM.follow(s, rest);
  s.sweep(110, 50, 17, 490, 50, 17, b3);
  const d = (x) => 18 - s.heights[Math.round((50 - 20) / s.dy) * s.vx + Math.round((x - 100) / s.dx)];
  return [d(120), d(480)];
};
const [f1, f2] = stk(true), [p1, p2] = stk(false);
ok(near(f1, 1 + rest.at(120, 50), 0.02) && near(f2, 1 + rest.at(480, 50), 0.02) && f2 - f1 > 0.3 && near(IM.restAt(IM.follow(mk(), rest), 0, 0), 0), `follows: shallower where the board is lower ${f1.toFixed(3)} / ${f2.toFixed(3)}`);
ok(near(p1, 1, 1e-3) && near(p2, 1, 1e-3), `flat: ${p1.toFixed(3)} / ${p2.toFixed(3)}`);

// the squareness test read off the cut (V-bit crosses in a spoilboard-sized sim): racked = the predicted difference;
// homed square = ~0
const vb = StockSimulator.compileTools(new Map([[1, { number: 1, shape: "vbit", diameter: 6.35, angle: 60 }]])).get(1);
const sqR = { x0: 25, y0: 25, x1: 637, y1: 1246 };
function sqCut(E, depth) {
  const s = IM.attach(new StockSimulator({ xmin: -40, xmax: 700, ymin: -40, ymax: 1310, zmin: -19, zmax: 0 }, new Map(), { maxCells: 6e5, snapshots: false }),
    [0, 0, 0], () => ({ set: IM.settings({ on: true }), E, geo: gT }));
  const { x0, y0, x1, y1 } = sqR, ln = (a, b, c, d) => s.sweep(a, b, -depth, c, d, -depth, vb);
  ln(x0, y0, x1, y0); ln(x1, y0, x1, y1); ln(x1, y1, x0, y1); ln(x0, y1, x0, y0);
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { ln(x - 10, y, x + 10, y); ln(x, y - 10, x, y + 10); }
  return { s, rd: IM.readSquare([{ sim: s, off: [0, 0, 0] }], sqR), want: IM.squareness(E, gT, sqR) };
}
for (const [E, d] of [[{ y: 2, z: 0 }, 3], [{ y: 0, z: 0 }, 3], [{ y: 0.8, z: 0.5 }, 3], [{ y: -1.2, z: 0 }, 3], [{ y: 0.8, z: 0 }, 2]]) {
  const { rd, want, s } = sqCut(E, d);
  ok(!rd.missing && Math.abs(rd.diff - want.diff) < 0.05, `read the cut, rack ${E.y} ${d} mm deep (cell ${s.dx.toFixed(2)}): diagonals ${rd.d1 && rd.d1.toFixed(2)} / ${rd.d2 && rd.d2.toFixed(2)}, diff ${rd.diff && rd.diff.toFixed(3)} vs ${want.diff.toFixed(3)}`);
}
ok(IM.readSquare([{ sim: mk(), off: [0, 0, 0] }], { x0: 50, y0: 50, x1: 500, y1: 80 }).missing.length === 4, "nothing cut: missing");
// which motor is on which end (V1E: Y0 / Z0 on the left = the Min end, the default; some machines the other way)
ok(IM.settings({}).motor0 === "min" && IM.settings({ motor0: "max" }).motor0 === "max" && IM.settings({ motor0: "x" }).motor0 === "min", "motor0 setting");
ok(IM.side2Motor(IM.settings({})) === 1 && IM.side2Motor(IM.settings({ motor0: "max" })) === 0, "side 2 (Max end) motor");
ok(IM.bySide([3, 5], IM.settings({})).join() === "3,5" && IM.bySide([3, 5], IM.settings({ motor0: "max" })).join() === "5,3", "pulloffs by side");
// the share link
ok(Object.keys(IM.toLink(IM.settings({}))).length === 0, "link: defaults say nothing");
const abs = IM.settings({ on: true, motor0: "max", stop: { y: 0.5, z: null }, power: false, warp: { x: -0.3, y: 0, bow: 0.4 }, tram: { x: 0.1, y: 0 }, exag: 25 });
const abq = IM.toLink(abs);
ok(abq.ab === "1" && JSON.stringify(IM.fromLink(abq)) === JSON.stringify(abs), `link round trip: ${JSON.stringify(abq)}`);
ok(IM.fromLink({ units: "mm" }) === null && IM.fromLink({ abx: "sy_x~zz_1" }).stop.y === null, "link: none / junk");
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
