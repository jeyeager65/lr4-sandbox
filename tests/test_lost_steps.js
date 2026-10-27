// lost_steps.js (Part 44a): motor capacity vs the cut's load per axis, slips in whole quanta, the lever rule on Y / Z,
// the rack coupling keeping Y near square, Z slipping most when dry, seeded noise repeating, settings + share link.
//   node tests/test_lost_steps.js
"use strict";
const LS = require("../web/js/lost_steps.js");
const IM = require("../web/js/imperfect.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const steps = { x: { perMm: 50, micro: 8 }, y: { perMm: 50, micro: 8 }, z: { perMm: 200, micro: 8 } };   // V1E JP3_LR
const base = (o) => Object.assign({ set: LS.settings({ on: true }), steps, rpm: 18000, flutes: 2, r: 1.5875, u: 0.5, noise: 0 }, o);
const run = (o, secs = 1, dt = 0.004, st = LS.create()) => {
  const all = [];
  for (let t = 0; t < secs; t += dt) all.push(...LS.step(st, base(Object.assign({ dt }, o))).slips);
  return { st, all };
};

// settings: clamped, defaults, off by default
const s0 = LS.settings({ on: 1, x: 2, y: -1 });
ok(s0.on === true && s0.x === 1 && s0.y === 0 && s0.z === LS.DEFAULTS.z, `settings ${JSON.stringify(s0)}`);
ok(LS.settings().on === false, "off by default");
// capacity: V1E's 16T pulley (32 mm a turn) at low speed ~59 N, halved at F_KNEE full steps/s; Z dry far below lubed
ok(near(LS.capacity("x", 0, steps.x, 0), 0.3 * 2 * Math.PI / 0.032, 1e-6), `X capacity ${LS.capacity("x", 0, steps.x, 0)}`);
ok(near(LS.capacity("x", LS.C.F_KNEE, steps.x, 0), LS.capacity("x", 0, steps.x, 0) / 2, 1e-9), "torque halves at the knee");
ok(LS.capacity("z", 0, steps.z, 1) < 0.3 * LS.capacity("z", 0, steps.z, 0), "dry Z screws: under 30% of lubed");
// run_amps (config.yaml): the push goes with the current, up to A_SAT; no amps = A_REF
{
  const c = (amps) => LS.capacity("x", 0, Object.assign({}, steps.x, { amps }), 0), c0 = LS.capacity("x", 0, steps.x, 0);
  ok(near(c(LS.C.A_REF), c0) && near(c(1.2), c0 * 1.5) && near(c(3), c(LS.C.A_SAT)), `run_amps: 0.8 = default, 1.2 = 1.5x, saturates (${c(1.2).toFixed(1)} N)`);
  const hot = { v: { x: 2500 / 60, y: 0, z: 0 }, eng: { d: 6, c: 6 } };
  ok(run(hot).all.length > 0 && run(Object.assign({}, hot, { steps: Object.assign({}, steps, { x: Object.assign({}, steps.x, { amps: 1.4 }) }) })).all.length === 0,
    "6 mm at 2500 slips at 0.8 A, not at 1.4 A");
}

// engage: a full slot 3 mm deep -> d 3 ahead, c 3; the bit above the stock -> 0
const flat = (top) => () => top;
const e = LS.engage(flat(10), { x: 0, y: 0, z: 7 }, 1, 0, 1.6, 20);
ok(near(e.d, 3) && near(e.c, 3), `engage slot ${JSON.stringify(e)}`);
ok(LS.engage(flat(10), { x: 0, y: 0, z: 12 }, 1, 0, 1.6).d === 0, "engage above the stock");
// half the bit off the stock's edge (stock only at y > 0), moving along +X: about half the samples cut
const edge = LS.engage((x, y) => (y > 0 ? 10 : null), { x: 0, y: 0, z: 7 }, 1, 0, 1.6);
ok(edge.d > 0.8 && edge.d < 2, `engage at an edge ${edge.d}`);

// a sane cut doesn't slip; too deep / too fast does, on X (one motor) before Y (two)
const along = (F, d, ax = "x") => ({ v: { x: ax === "x" ? F / 60 : 0, y: ax === "y" ? F / 60 : 0, z: 0 }, eng: { d, c: d } });
ok(run(along(1000, 3)).all.length === 0, "1/8in 3 mm at 1000 mm/min: no slips");
const deep = run(along(2500, 6));
ok(deep.all.length > 0 && deep.all.every((q) => q.axis === "x" && q.mm > 0), `too deep + fast along +X slips X: ${deep.all.length}`);
ok(near(deep.st.lost.x[0], deep.all.length * 4 / 6.25), `whole quanta (4 full steps = 0.64 mm): ${deep.st.lost.x[0]}`);
ok(run(along(2500, 6, "y")).all.length === 0, "the same along Y: two motors carry it");
ok(run(along(-2500, 6)).st.lost.x[0] < 0, "a - move slips short in -");

// hard spots (Part 44c): a knot / glue line cuts harder; a pushy cut that's fine in clear wood slips in a knot
const hard = { knots: [{ x: 50, y: 50, r: 10 }], glue: [{ axis: "x", at: 80 }] };
ok(LS.hardAt(hard, 50, 50) === LS.C.KNOT_K && LS.hardAt(hard, 50, 61) === 1 && near(LS.hardAt(hard, 50, 58.75), (1 + LS.C.KNOT_K) / 2) && LS.hardAt(null, 50, 50) === 1,
  `hardAt knot: center KNOT_K, outside 1, fades in its outer quarter (${LS.hardAt(hard, 50, 58.75)})`);
ok(LS.hardAt(hard, 0, 80.4) === 4 && LS.hardAt(hard, 0, 80.6) === 1 && LS.hardAt({ glue: [{ axis: "y", at: 5, w: 2, k: 2 }] }, 5.9, 0) === 2, "hardAt glue: 1 mm wide, either way");
{
  const e1 = LS.engage(flat(0), { x: 0, y: 0, z: -3 }, 1, 0, 1.5875, 12.7), e3 = LS.engage(flat(0), { x: 50, y: 50, z: -3 }, 1, 0, 1.5875, 12.7, hard);
  const eo = LS.engage(flat(-5), { x: 50, y: 50, z: -3 }, 1, 0, 1.5875, 12.7, hard);
  ok(e1.k === 1 && near(e3.k, LS.C.KNOT_K) && eo.k === 1 && near(e3.d, e1.d), `engage k: plain 1, in the knot KNOT_K, above the stock 1 (${e1.k}, ${e3.k}, ${eo.k})`);
}
const pushy = along(2000, 3);
ok(run(pushy).all.length === 0 && run(Object.assign({}, pushy, { eng: { d: 3, c: 3, k: LS.C.KNOT_K } })).all.length > 0,
  "2000 mm/min 3 deep: no slips in clear wood, slips in a knot");
ok(run(Object.assign({}, along(1000, 3), { eng: { d: 3, c: 3, k: LS.C.KNOT_K } })).all.length === 0, "1000 mm/min 3 deep: a knot doesn't stall it");

// the shank: deeper than the flutes, a sideways move shoves it - stuck even slow; a plunge that deep is fine
{
  const es = LS.engage(flat(10), { x: 0, y: 0, z: -4 }, 1, 0, 1.5875, 12.7);
  ok(near(es.d, 12.7) && near(es.s, 1.3), `engage: 14 deep with 12.7 flutes -> d 12.7, s 1.3 (${es.d}, ${es.s})`);
  ok(LS.engage(flat(10), { x: 0, y: 0, z: -4 }, 0, 0, 1.5875, 12.7).s === 0 && LS.engage(flat(10), { x: 0, y: 0, z: 0 }, 1, 0, 1.5875, 12.7).s === 0,
    "engage: s 0 when not moving sideways / within the flutes");
  const slow = { v: { x: 300 / 60, y: 0, z: 0 }, eng: { d: 0.2, c: 0.2, s: 1 } }, stuck = run(slow);
  ok(near(stuck.st.lost.x[0], 5, 0.65), `1 mm of shank at 300 mm/min: X stuck (lost ${stuck.st.lost.x[0].toFixed(2)} of 5 mm)`);
  ok(run({ v: { x: 0, y: 0, z: -1 }, eng: { d: 0, c: 0.5, s: 0 } }).all.length === 0, "plunging that deep: Z fine");
  // jammed: still stuck once it reads its own hole (s 0), until Z lifts; a move back frees it too
  const j1 = run({ v: { x: 5, y: 0, z: 0 }, eng: { d: 0, c: 0, s: 0 } }, 1, 0.004, stuck.st);
  ok(stuck.st.jam && near(j1.st.lost.x[0], 10, 0.65), `jammed: the next 5 mm lost too though s reads 0 (lost ${j1.st.lost.x[0].toFixed(2)})`);
  const back = run({ v: { x: -5, y: 0, z: 0 }, eng: { d: 0, c: 0, s: 0 } }, 0.1, 0.004, LS.create());
  const st2 = LS.create(); st2.jam = { x: 1, y: 0 };
  ok(back.all.length === 0 && (run({ v: { x: -5, y: 0, z: 0 }, eng: {} }, 0.1, 0.004, st2), st2.jam === null), "a move back frees it");
  const st3 = LS.create(); st3.jam = { x: 1, y: 0 }; run({ v: { x: 0, y: 0, z: 5 }, eng: {} }, 0.1, 0.004, st3);
  ok(st3.jam === null && run({ v: { x: 5, y: 0, z: 0 }, eng: { d: 0, c: 0, s: 0 } }, 1, 0.004, st3).all.length === 0, "Z lifting frees it");
  const st4 = LS.create(); st4.jam = { x: 1, y: 0 }; LS.homed(st4);
  ok(st4.jam === null, "$H frees it");
}

// router off in the stock: the bit drags, X stalls (loses most of the move)
const off = run(Object.assign(along(1000, 3), { rpm: 0 }));
ok(off.st.lost.x[0] > 0.5 * 1000 / 60 * 0.9, `router off: stalls ${off.st.lost.x[0]}`);

// Y: the lever rule - the router near side 2 loads it; the gantry pulls the other along (stays near square)
const yHard = Object.assign(along(4000, 10, "y"), { u: 0.9 });
const y = run(yHard, 2);
ok(y.st.lost.y[1] > y.st.lost.y[0], `Y: the side nearer the router slips more ${y.st.lost.y}`);
ok(y.st.lost.y[0] > 0, `Y: the far side follows ${y.st.lost.y}`);
ok(Math.abs(y.st.lost.y[1] - y.st.lost.y[0]) < 2.5, `Y stays near square: rack ${(y.st.lost.y[1] - y.st.lost.y[0]).toFixed(2)} mm`);

// Z: dry screws slip on the way up (the core's weight), lubed ones don't; a hard plunge slips Z down
const up = { v: { x: 0, y: 0, z: 15 }, eng: { d: 0, c: 0 } };
ok(run(up).all.length === 0, "Z up at 15 mm/s, default drag: no slips");
const dryUp = run(Object.assign(up, { set: LS.settings({ on: true, z: 1 }) }));
ok(dryUp.all.length > 0 && dryUp.all.every((q) => q.axis === "z" && q.mm > 0), `dry Z up slips ${dryUp.all.length}`);
ok(near(dryUp.all[0].mm, 4 / 25), "a Z slip = 4 full steps = 0.16 mm");
const plunge = { v: { x: 0, y: 0, z: -20 }, eng: { d: 3, c: 3 }, r: 3.175 };
ok(run(plunge, 0.3).all.some((q) => q.axis === "z" && q.mm < 0), "a 1/4in bit plunging at 1200 mm/min slips Z");
ok(run(Object.assign({}, plunge, { v: { x: 0, y: 0, z: -5 } }), 0.3).all.length === 0, "a 300 mm/min plunge doesn't");

// off: loads still reported, nothing lost
const offSet = run(Object.assign(along(2500, 6), { set: LS.settings({ on: false }) }));
ok(offSet.all.length === 0 && offSet.st.lost.x[0] === 0, "settings off: no slips");

// noise: seeded, smooth, in range; the same seed + job = the same slips
let lo = 1, hi = -1;
for (let s = 0; s < 50; s += 0.37) { const n = LS.noiseAt(7, s); lo = Math.min(lo, n); hi = Math.max(hi, n); }
ok(lo >= -1 && hi <= 1 && hi - lo > 0.5, `noise range ${lo} ${hi}`);
ok(Math.abs(LS.noiseAt(7, 3.5) - LS.noiseAt(7, 3.51)) < 0.05, "noise is smooth");
const edgeCut = (st) => { const o = []; for (let t = 0; t < 3; t += 0.004) o.push(...LS.step(st, base({ dt: 0.004, ...along(2000, 6.2), noise: undefined })).slips); return o.length; };
ok(edgeCut(LS.create(7)) === edgeCut(LS.create(7)), "same seed, same slips");

// homed: the slips' rack is forgotten (each side at its own switch)
LS.homed(y.st, "y");
ok(y.st.lost.y[0] === 0 && y.st.lost.y[1] === 0 && y.st.lost.x[0] === 0, "homed y");

// As built's settings + share link carry slip
const im = IM.settings({ slip: { on: true, z: 0.8 } });
ok(im.slip.on && im.slip.z === 0.8 && im.slip.x === 0.3, `Imperfect slip ${JSON.stringify(im.slip)}`);
ok(IM.settings().slip.on === false, "Imperfect slip off by default");
const link = IM.toLink(im), back = IM.fromLink(Object.assign({ ab: "1" }, link));
ok(/ls_1/.test(link.abx) && /lz_0.8/.test(link.abx) && back.slip.on && back.slip.z === 0.8, `share link ${JSON.stringify(link)}`);

console.log(`${checks - fails}/${checks} lost steps checks passed`);
process.exit(fails ? 1 : 0);
