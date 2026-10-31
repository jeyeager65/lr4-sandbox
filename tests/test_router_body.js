// router_body.js (Part 45b): every preset builds closed, outward-facing parts; the Kobalt's collet nut lands on the
// FreeCAD model's (lr4_config.json's Router_Nut lo_ref / hi_ref, less the router's frame) and its cord tip on the size
// build's cord route; the Carbide's measured sizes (overall 200, housing 64.8 x 85, cap 75 wide); the motor cap on the
// turned part; the bit end (thread inside the nut, the collet under the shaft's end, the flats).
//   node tests/test_router_body.js
"use strict";
const B = require("../web/js/router_body.js");
const R = require("../web/js/routers.js");
const cfg = require("../web/data/lr4_config.json");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const bbox = (m) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[i + k]); hi[k] = Math.max(hi[k], m.pos[i + k]); }
  return [lo, hi];
};
const volume = (m) => {                              // signed: > 0 when the faces point out
  let v = 0;
  for (let i = 0; i < m.idx.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => m.pos.slice(m.idx[i + k] * 3, m.idx[i + k] * 3 + 3));
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
};
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);
const f = (a) => a.map((v) => +v.toFixed(1)).join(",");
const M = (id) => R.ROUTERS[id].model;               // cleaned: every look + default filled in

for (const id of Object.keys(R.ROUTERS)) {
  const m = M(id), out = B.build(m), spin = m.kind === "spindle";
  const parts = ["collet_nut", "collet", "shaft", "thread", "housing", "motor_cap", "strain_relief", "cord"].concat(spin ? ["trim"] : ["dial", "switch", "switch_off"]);
  for (const k of parts) {
    const p = out.parts[k];
    ok(p.pos.length > 0 && p.pos.every(Number.isFinite), `${id} ${k}: built, finite`);
    ok(volume(p) > 0, `${id} ${k}: faces out (volume ${volume(p).toFixed(0)})`);
  }
  ok(Object.keys(out.parts).every((k) => B.PARTS.includes(k)) && Object.keys(m.looks).every((k) => R.LOOK_PARTS.includes(k)), `${id}: parts + looks named`);
  ok(Math.abs(bbox(out.parts.motor_cap)[1][2] - B.overall(m)) < 0.6, `${id}: top = overall ${B.overall(m)}`);
  const th = bbox(out.parts.thread), nut = m.collet_nut;
  ok(th[0][2] >= nut.below - 0.01 && th[1][2] <= nut.h + 0.01 && th[1][0] <= m.shaft.thread.d / 2 + 0.01, `${id}: the thread inside the nut (${f(th[0])} .. ${f(th[1])})`);
  const co = bbox(out.parts.collet);
  ok(co[0][2] > 0 && Math.abs(co[1][0] - m.collet.d / 2) < 0.05, `${id}: the collet from the nut's face up, ${m.collet.d} across its nut end`);
  if (m.shaft.flats) {
    const sh = out.parts.shaft, F = m.shaft.flats;
    let ymax = 0;
    for (let i = 0; i < sh.pos.length; i += 3) if (sh.pos[i + 2] > F.z + 0.1 && sh.pos[i + 2] < F.z + F.l - 0.1) ymax = Math.max(ymax, Math.abs(sh.pos[i + 1]));
    ok(Math.abs(ymax - F.af / 2) < 0.01, `${id}: the shaft's flats ${F.af} across (${(2 * ymax).toFixed(2)})`);
  }
}

// the Kobalt vs the FreeCAD model (ref build), in the router's frame: the bit's centre, the nut's bottom
const rec = (n) => cfg.parts.find((p) => p.key === n);
// (Part 45b step 4: FreeCAD's router is this preset now - router_export.js - so its boxes aren't checked against it;
// the page data's Router_Nut until the next size refresh, Router_ColletNut after)
const bit = rec("Router_Bit"), nutR = rec("Router_ColletNut") || rec("Router_Nut");
const o = [(bit.lo_ref[0] + bit.hi_ref[0]) / 2, (bit.lo_ref[1] + bit.hi_ref[1]) / 2, nutR.lo_ref[2]];
const K = B.build(M("kobalt"));
ok(near(K.cord.dir, [-Math.SQRT1_2, Math.SQRT1_2, 0], 1e-6), "Kobalt cord leaves bent 45 deg toward +y");
// js/page/router.js RT_BUILD_TIP = the page data's cord tip (the size builds' router; after the next refresh: the
// default preset's, tools/router_export.js cord.tip - update RT_BUILD_TIP then, this check says so)
const tipW = cfg.hose.cord.tip, BUILD_TIP = [-108.1, 27.4, 196.0];
ok(near(BUILD_TIP.map((v, i) => v + o[i]), tipW, 1.0), `RT_BUILD_TIP = lr4's cord_tip (${f(BUILD_TIP.map((v, i) => v + o[i]))} vs ${f(tipW)})`);
// the page's mount frame (router.js RT_MOUNTS.kobalt) = the build's bit axis + nut bottom
const mb = rec("Tool_Mount_B_Kobalt"), fo = [mb.lo_ref[0] + 49.4, mb.lo_ref[1] + 44.35, mb.lo_ref[2] - 36.5];
ok(near(fo, o, 0.05), `RT_MOUNTS.kobalt puts the router where the build's was (${f(fo)} vs ${f(o)})`);

// the Carbide: measured sizes
const cm = M("carbide"), C = B.build(cm), [hlo, hhi] = bbox(C.parts.motor_cap);
ok(Math.abs(hhi[1] - hlo[1] - 75) < 0.5, `Carbide motor cap 75 wide (${(hhi[1] - hlo[1]).toFixed(1)})`);
const hz = bbox(C.parts.housing);
ok(Math.abs(hz[0][2] - 37) < 0.01 && Math.abs(hz[1][2] - 109) < 0.01 && Math.abs(hz[1][0] - 32.4) < 0.01, "Carbide housing 64.8 x 72, 37 up from the nut's bottom");
ok(B.overall(cm) === 200, `Carbide overall 200 (${B.overall(cm)})`);

// the motor cap: sized by its preset, sitting on the turned stack, its parts on it
for (const id of Object.keys(R.ROUTERS)) {
  const m = M(id), h = m.motor_cap;
  if (m.kind === "spindle") continue;
  const out = B.build(m), [lo, hi] = bbox(out.parts.motor_cap), x = B.expand(m), at = h.at || [0, 0];
  ok(Math.abs(hi[0] - lo[0] - h.L) < 0.5 && Math.abs(hi[1] - lo[1] - h.W) < 0.5, `${id}: motor cap ${f([hi[0] - lo[0], hi[1] - lo[1]])} = L x W ${h.L} x ${h.W}`);
  ok(Math.abs(hi[2] - lo[2] - h.H) < 0.5, `${id}: motor cap ${(hi[2] - lo[2]).toFixed(1)} tall = H ${h.H}`);
  ok(Math.abs(lo[2] - B.stackTop(m)) < 0.5, `${id}: cap sits on the turned part (bottom ${lo[2].toFixed(1)}, stack top ${B.stackTop(m)})`);
  ok(x.strain_relief.at[0] <= at[0] - h.L / 2 + 0.01, `${id}: cord leaves the -x end`);
  ok(Math.abs(x.switch.at[0] - (at[0] + h.L / 2 + 0.75)) < 0.01 && out.rocker, `${id}: switch + rocker on the +x end`);
  if (m.shaft_lock) {
    ok(out.z.lock && out.z.lock.travel === m.shaft_lock.travel, `${id}: shaft lock + its press (${m.shaft_lock.travel} mm)`);
  }
}
const g = B.expand({ collet_nut: { af: 20, h: 10, below: 1 }, shaft: { d: 12, exposed: 0 }, housing: { d: 60, l: 90 },
  motor_cap: { L: 80, W: 70, H: 60, top_r: 5, front_r: 20, back_r: 8, bot_r: 3 }, dial: { place: "end", d: 20, t: 6 } });
ok(g.cap.z[0] === 100 && g.cap.z[1] === 160 && g.cap.r[0] === 8 && g.cap.r[1] === 20 && g.cap.top_r === 5 && g.cap.bot_r === 3,
  `motor cap: on the stack, back / front corner fillets, top / underneath ${JSON.stringify(g.cap)}`);

// a shaped motor cap (Part 46b): drawn from its three views, closed + out, the size the shape says; the dial, switch
// and strain relief on it; the cap's plan + top follow the shape (the transition to it, a dial on top)
{
  const CS = require("../web/js/cap_shape.js"), km = M("kobalt"), c0 = km.motor_cap;
  const shape = CS.STARTS.pear({ L: 100, W: 76, H: 58, at: 0, top_r: 10 });
  const sm = R.clean({ name: "shaped", source: "manual", speeds: R.ROUTERS.kobalt.speeds, mount: "kobalt", model: Object.assign({}, km, { motor_cap: Object.assign({}, c0, { shape }) }) }).model;
  const sb = B.build(sm), mc = sb.parts.motor_cap, [lo, hi] = bbox(mc), z = CS.size(sm.motor_cap.shape), z0 = B.stackTop(sm);
  ok(!!sm.motor_cap.shape && sm.motor_cap.L === z.L && sm.motor_cap.H === z.H, `shaped cap: kept by clean(), its size from the shape (${sm.motor_cap.L} x ${sm.motor_cap.W} x ${sm.motor_cap.H})`);
  ok(volume(mc) > 0 && Math.abs(hi[0] - lo[0] - z.L) < 0.2 && Math.abs(hi[1] - lo[1] - z.W) < 0.2 && Math.abs(lo[2] - z0) < 0.2 && Math.abs(hi[2] - z0 - z.H) < 0.4,   // (a window dial's strip: 0.3 proud)
    `shaped cap: faces out, ${f(lo)} .. ${f(hi)} (on the stack at ${z0})`);
  const ex = B.expand(sm);
  ok(ex.switch.at[0] > hi[0] - 3 && ex.switch.at[0] < hi[0] + 2 && ex.strain_relief.at[0] < lo[0] + 3, `shaped cap: the switch on its front (${ex.switch.at[0].toFixed(1)}), the relief at its back (${ex.strain_relief.at[0].toFixed(1)})`);
  const top = Object.assign({}, sm, { dial: Object.assign({}, sm.dial, { place: "top" }), transition: { l: 20, d: 70, shape: "cap", edge: "fillet", e: 3 } });
  const tb = B.build(top), [dlo] = bbox(tb.parts.dial), [, thi] = bbox(tb.parts.transition);
  ok(dlo[2] > z0 + 20 && thi[2] <= B.stackTop(top) + 0.01 && tb.parts.trim.idx.length > 0, `shaped cap: a dial on top sits in it (${dlo[2].toFixed(1)}), the transition lofts up to its plan`);
}

// the Makita collet (user's photo 2026-10-30): a cone nose, a barrel, a ring at the far end, 3 slits from the nose
{
  const mc = B.colletPart(M("makita"), 3.175);
  let zlo = Infinity, zhi = -Infinity, rmax = 0;
  for (let i = 0; i < mc.pos.length; i += 3) { zlo = Math.min(zlo, mc.pos[i + 2]); zhi = Math.max(zhi, mc.pos[i + 2]); rmax = Math.max(rmax, Math.hypot(mc.pos[i], mc.pos[i + 1])); }
  ok(volume(mc) > 0 && Math.abs(zhi - zlo - 20) < 0.01 && Math.abs(rmax - 7) < 0.01, `Makita collet: closed + out, 20 long, Ø14 at the cone (${(zhi - zlo).toFixed(2)}, ${(2 * rmax).toFixed(2)})`);
}

// Part 46c: the pockets as real booleans (everything above ran without them: the patches). Every edge on two faces
// (welded), the volume down by the pocket, the dial window's floor + bevel in the head; brush pockets in the Makita
const CSG = require("../web/js/csg.js");
const watertight = (m) => {
  const w = CSG.weld(m), e = new Map();
  for (let t = 0; t < w.idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = w.idx[t + k], b = w.idx[t + (k + 1) % 3], key = a < b ? a * 1e7 + b : b * 1e7 + a;
    e.set(key, (e.get(key) || 0) + 1);
  }
  return [...e.values()].every((n) => n === 2);
};
CSG.init().then((loaded) => {
  ok(loaded && CSG.ready(), "csg: manifold-3d loads (web/manifold/)");
  const cut = B.build(M("makita"));
  for (const k of ["motor_cap", "transition"]) ok(watertight(cut.parts[k]), `Makita ${k}: the brush pockets leave it closed`);
  ok(volume(cut.parts.motor_cap) > 0, "Makita motor_cap: faces out after the brush pockets");
  for (const open of [true, false]) {
    const m = JSON.parse(JSON.stringify(M("kobalt")));
    m.dial = Object.assign({}, m.dial, { place: "window", win: { open } });
    const w = B.build(m), cap = w.parts.motor_cap, ex = B.expand(m), Wn = ex.dial.win;
    const nowin = B.build(Object.assign({}, m, { dial: Object.assign({}, m.dial, { place: "end", slot: false }) })).parts.motor_cap;   // (uncut)
    const dv = volume(nowin) - volume(cap), box = (Wn.x[1] - Wn.x[0]) * (Wn.y[1] - Wn.y[0]);
    ok(watertight(cap) && dv > 100, `Kobalt window (open ${open}): closed, the pocket takes ${(dv / 1000).toFixed(2)} cm3 out`);
    let floor = 0;                                   // the floor: head faces at the window's z inside its box
    for (let i = 0; i < cap.pos.length; i += 3) {
      const [x, y, z] = [cap.pos[i], cap.pos[i + 1], cap.pos[i + 2]];
      if (Math.abs(z - Wn.z) < 0.01 && x >= Wn.x[0] - 0.01 && y >= Wn.y[0] - 0.01 && y <= Wn.y[1] + 0.01) floor++;
    }
    ok(floor >= 4 && box > 0, `Kobalt window (open ${open}): its floor at z ${Wn.z.toFixed(1)} in the head (${floor} points)`);
  }
  {                                                  // the window's corner (win.r, the Makita's U): rounded in plan, still
    const m = JSON.parse(JSON.stringify(M("makita"))), sq = JSON.parse(JSON.stringify(m));   // closed; less taken out than square
    sq.dial = Object.assign({}, m.dial, { win: Object.assign({}, m.dial.win, { r: 0 }) });
    const cr = B.build(m).parts.motor_cap, cs = B.build(sq).parts.motor_cap;
    ok(M("makita").dial.win.r === 8 && watertight(cr) && watertight(cs) && volume(cr) > volume(cs),
      `Makita window corner r 8: closed, takes ${((volume(cr) - volume(cs)) / 1000).toFixed(2)} cm3 less out than square`);
  }
  // Part 46d: the wheel inside the head, its rim through a slot; a surround round it: none / sunk (+ out the top) /
  // raised, on the end and on top. Closed every way; sunk takes more out than none, raised adds; the rim `set` in from
  // the slot's face; a dark back in the pocket (trim)
  for (const id of ["kobalt", "makita", "carbide"]) for (const place of ["end", "top"]) {
    const vols = {};
    for (const [k, sur] of [["none", { kind: "none" }], ["sunk", { kind: "sunk", depth: 3, margin: 3, edge: "fillet", e: 1, out: "top" }], ["raised", { kind: "raised", depth: 2, margin: 3 }]]) {
      const m = JSON.parse(JSON.stringify(M(id)));
      m.dial = Object.assign({}, m.dial, { place, surround: sur, set: 0.3 });
      const b = B.build(m), cap = b.parts.motor_cap, D = B.expand(m).dial;
      vols[k] = volume(cap);
      ok(watertight(cap) && vols[k] > 0, `${id} dial ${place} ${k}: the head stays closed`);
      const [lo, hi] = bbox(b.parts.dial), O = D.open, face = O.o.map((v, i) => v + O.n[i] * O.lift);
      const rim = place === "end" ? hi[0] + 0.5 - face[0] : hi[2] + 0.5 - face[2];   // (the disc is 1 under the rim)
      ok(Math.abs(rim + 0.3) < 0.05 && lo.every(Number.isFinite), `${id} dial ${place} ${k}: the rim 0.3 in from the slot's face (${rim.toFixed(2)})`);
    }
    ok(vols.sunk < vols.none && vols.none < vols.raised, `${id} dial ${place}: sunk < none < raised (${Object.values(vols).map((v) => (v / 1000).toFixed(2)).join(" / ")} cm3)`);
  }
  {
    const m = JSON.parse(JSON.stringify(M("makita")));
    m.dial = Object.assign({}, m.dial, { place: "end" });   // (the Makita's own: in a window since 2026-10-31)
    const with_ = B.build(m).parts.trim.idx.length;
    m.dial = Object.assign({}, m.dial, { slot: false });
    ok(with_ > B.build(m).parts.trim.idx.length && B.expand(m).dial.open === undefined, "dial slot: a dark back in the pocket; slot: false = the old look (no opening)");
  }
  {                                                  // the dial's style (user 2026-10-30, an option): numbers on the rim / on a domed top
    const dome = B.build(M("kobalt")), m = JSON.parse(JSON.stringify(M("kobalt")));
    m.dial = Object.assign({}, m.dial, { style: "rim" });
    const rim = B.build(m), [, dh] = bbox(dome.parts.dial), [, rh] = bbox(rim.parts.dial);
    ok(M("kobalt").dial.style === "dome" && dome.dial.dome && dome.dial.dome.top === 0.45 && rim.dial.dome === null, "dial style: the Kobalt's dome kept by the cleaning; rim = no dome");
    ok(volume(dome.parts.dial) > 0 && volume(dome.parts.dial) < volume(rim.parts.dial) && Math.abs(dh[2] - rh[2]) < 0.01, "dial style: the dome closed + out, less than the plain wheel, the same height");
  }
  console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
});
