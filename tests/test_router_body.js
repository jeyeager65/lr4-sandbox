// router_body.js (Part 45b): every preset builds closed, outward-facing pieces; the Kobalt preset lands on the
// FreeCAD model's boxes (hw.kobalt_k7tr03 as built: lr4_config.json's Router_* lo_ref / hi_ref, less the router's
// frame); the Carbide's measured sizes (overall 200, grip 64.8 x 85, head 75 wide); the dial / cord frames.
//   node tests/test_router_body.js
"use strict";
const B = require("../web/js/router_body.js");
const DATA = require("../web/data/routers.js");
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

for (const [id, r] of Object.entries(DATA.routers)) {
  const out = B.build(r.body);
  for (const k of r.body.kind === "spindle" ? ["body", "head", "nut", "cap", "cord"] : ["body", "head", "nut", "dial", "switch", "cord"]) {
    const m = out.parts[k];
    ok(m.pos.length > 0 && m.pos.every(Number.isFinite), `${id} ${k}: built, finite`);
    ok(volume(m) > 0, `${id} ${k}: faces out (volume ${volume(m).toFixed(0)})`);
  }
  ok(Math.abs(bbox(out.parts.head)[1][2] - r.body.overall) < 0.6, `${id}: head top = overall ${r.body.overall}`);   // (Kobalt: its dial housing 0.5 over)
}

// the Kobalt preset vs the FreeCAD model (ref build), in the router's frame: the bit's centre, the nut's bottom
const rec = (n) => cfg.parts.find((p) => p.key === n);
const bit = rec("Router_Bit"), nut = rec("Router_Nut");
const o = [(bit.lo_ref[0] + bit.hi_ref[0]) / 2, (bit.lo_ref[1] + bit.hi_ref[1]) / 2, nut.lo_ref[2]];
const K = B.build(DATA.routers.kobalt.body);
for (const [k, n, tol] of [["nut", "Router_Nut", 0.6]]) {   // (the rest reshaped from the user's photos 2026-10-28)
  const [lo, hi] = bbox(K.parts[k]), R = rec(n);
  const want = [R.lo_ref.map((v, i) => v - o[i]), R.hi_ref.map((v, i) => v - o[i])];
  ok(near(lo, want[0], tol) && near(hi, want[1], tol), `Kobalt ${k} on FreeCAD's ${n}: ${f(lo)} .. ${f(hi)} vs ${f(want[0])} .. ${f(want[1])}`);
}
ok(near(K.cord.dir, [-Math.SQRT1_2, Math.SQRT1_2, 0], 1e-6), "Kobalt cord leaves bent 45 deg toward +y");
const tipW = cfg.hose.cord.tip, BUILD_TIP = [-108.1, 27.4, 196.0];   // js/page/router.js RT_BUILD_TIP (the cord route's reference)
ok(near(BUILD_TIP.map((v, i) => v + o[i]), tipW, 1.0), `RT_BUILD_TIP = lr4's cord_tip (${f(BUILD_TIP.map((v, i) => v + o[i]))} vs ${f(tipW)})`);
ok(Math.abs(K.cord.tip[2] - 185) < 0.01, "Kobalt cord leaves on the seam (z 185)");

// the Carbide: measured sizes
const C = B.build(DATA.routers.carbide.body), cb = DATA.routers.carbide.body;
const [hlo, hhi] = bbox(C.parts.head);
ok(Math.abs(hhi[1] - hlo[1] - 75) < 0.5, `Carbide head 75 wide (${(hhi[1] - hlo[1]).toFixed(1)})`);
const grip = cb.nut[1] + cb.spindle[1] + cb.nose[1];
ok(grip === 24 && cb.grip[0] === 64.8 && cb.grip[1] === 85, "Carbide grip 64.8 x 85, 24 up from the nut's bottom");
const capLo = bbox(C.parts.cap)[0][2];
ok(capLo > 150, `Carbide switch bezel on the head (lowest z ${capLo.toFixed(1)})`);

// the generic head: sized by its preset, sitting on the turned stack, its parts on it
for (const [id, r] of Object.entries(DATA.routers)) {
  const h = r.body.head;
  if (!h || r.body.slabs) continue;
  const out = B.build(r.body), [lo, hi] = bbox(out.parts.head), x = B.expand(r.body), at = h.at || [0, 0];
  ok(Math.abs(hi[0] - lo[0] - h.L) < 0.5 && Math.abs(hi[1] - lo[1] - h.W) < 0.5, `${id}: generic head ${f([hi[0] - lo[0], hi[1] - lo[1]])} = L x W ${h.L} x ${h.W}`);
  ok(Math.abs(hi[2] - lo[2] - h.H) < 0.5, `${id}: generic head ${(hi[2] - lo[2]).toFixed(1)} tall = H ${h.H}`);
  ok(Math.abs(lo[2] - B.stackTop(r.body)) < 0.5, `${id}: head sits on the grip (bottom ${lo[2].toFixed(1)}, stack top ${B.stackTop(r.body)})`);
  ok(x.cord.at[0] <= at[0] - h.L / 2 + 0.01, `${id}: cord leaves the -x end`);
  if (!r.body.switch) ok(Math.abs(x.switch.at[0] - (at[0] + h.L / 2 + 0.75)) < 0.01 && out.rocker, `${id}: switch + rocker on the +x end`);
}
const g = B.expand({ nut: [20, 10, "hex"], grip: [60, 90], overall: 160, head: { L: 80, W: 70, H: 60, top_r: 5, front_r: 20, back_r: 8, bot_r: 3 } });
const gs = g.slabs[0];
ok(gs.z[0] === 100 && gs.z[1] === 160 && gs.r[0] === 8 && gs.r[1] === 20 && gs.top_r === 5 && gs.bot_r === 3,
  `generic head: H down from overall, back / front corner fillets, top / underneath ${JSON.stringify(gs)}`);

console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
