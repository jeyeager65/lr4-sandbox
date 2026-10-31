// router_schema.js (Part 48b): the router editor's one table of settings. Every setting routers.js clean() keeps has a
// row (and every row's path is one clean() keeps); rows follow the router (spindle / router, the dial's place, a drawn
// cap); each feature added survives clean() and comes off again; shown() / value() read what's drawn.
//   node tests/test_router_schema.js
"use strict";
require("./fixtures/fixture.js").addToData();         // the tests' own box router (testbox)
const R = require("../web/js/routers.js");
const S = require("../web/js/router_schema.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const clone = (x) => JSON.parse(JSON.stringify(x));

// a preset with everything on: every feature added, a window dial and a slot dial (two presets), a sunk surround
const full = (id, place) => {
  const p = R.preset(id);
  for (const F of S.FEATURES) if ((!F.only || F.only === "r") && !F.has(p.model)) F.add(p);
  Object.assign(p.model.dial, { place, style: "dome", dome: { top: 0.4 } });
  if (place !== "window") Object.assign(p.model.dial, { slot: { w: 10, h: 5, r: 2 }, set: 0.3, surround: { kind: "sunk", depth: 2, margin: 3, r: 2, edge: "fillet", e: 1, out: "top" } });
  p.model.switch = { down: 30 };
  p.model.clamp = 30;
  p.model.housing.ch = 1;
  return R.clean(p);
};
// leaf paths of a cleaned preset
const leaves = (o, pre = "", out = []) => {
  for (const [k, v] of Object.entries(o)) {
    const q = pre ? `${pre}.${k}` : k;
    if (q === "speeds" || q === "s") v.forEach((e, i) => out.push(`${q}.${i}`));
    else if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, q, out); else out.push(q);
  }
  return out;
};
// kept by clean() but not a setting you edit: names / types the files carry, the shape editor's points, the ring
// colors (set by the dial's look), the strain relief + cord (placed by the preset), the motor cap's place
const NOT_ROWS = /^(model\.label|speeds_source|model\.collet_nut\.type|model\.collet\.type|model\.collet\.taper|model\.motor_cap\.at|model\.motor_cap\.shape|model\.dial\.ring|model\.strain_relief\.|model\.cord\.|model\.kind$)/;
const keyOf = (path) => path.replace(/^speeds\.(\d)\.\d$/, "speeds.$1").replace(/^model\.looks\.(\w+)\.[cf]$/, "looks.$1").replace(/^s\.\d$/, (m) => m);
const rowKeys = new Set(S.ROWS.map((r) => r.k));
for (const [id, place] of [["kobalt", "window"], ["kobalt", "end"], ["carbide", "top"], ["spindle65", null]]) {
  const p = place ? full(id, place) : R.clean(Object.assign(R.preset(id), { source: "gcode", s: [8000, 24000] }));
  const miss = [...new Set(leaves(p).map(keyOf))].filter((k) => !NOT_ROWS.test(k) && !rowKeys.has(k));
  ok(!miss.length, `${id} ${place || "spindle"}: every setting clean() keeps has a row (missing: ${miss.join(", ")})`);
}
// every row's path: one clean() keeps (in some preset), or a special key
const all = new Set(["kobalt:window", "kobalt:end", "carbide:top"].flatMap((s) => leaves(full(...s.split(":"))).map(keyOf)));
for (const k of leaves(R.clean(Object.assign(R.preset("spindle65"), { source: "gcode", s: [8000, 24000] }))).map(keyOf)) all.add(k);
for (const k of leaves(R.preset("kobalt")).map(keyOf)) all.add(k);
const SPECIAL = new Set(["kind", "model.overall", "shape", "model.collet.sizes", "s.0", "s.1"]);
const stray = S.ROWS.map((r) => (r.kind === "has" ? r.of : r.k)).filter((k) => !SPECIAL.has(k) && !all.has(k));
ok(!stray.length, `every row is a setting clean() keeps (stray: ${stray.join(", ")})`);
ok(S.ROWS.every((r) => S.PARTS.some((P) => P.id === r.part)), "every row's part is an outline item");
ok(S.ROWS.every((r) => r.kind !== "choice" && r.kind !== "select" || (r.opts && r.opts.length >= 2)), "every choice has its options");

// rows follow the router
const kb = R.preset("kobalt"), labels = (part, p, o) => S.rows(part, p, o).map((r) => S.labelOf(r, p.model)).join(",");
ok(/Window length/.test(labels("dial", kb)) && !/Slot width/.test(labels("dial", kb)), `the Kobalt's window dial: window rows, no slot (${labels("dial", kb)})`);
const ke = clone(kb); ke.model.dial.place = "end";
ok(/Slot width/.test(labels("dial", ke)) && !/Window length/.test(labels("dial", ke)) && !/Slot width/.test(labels("dial", ke, { csg: false })),
  "on the end: the slot's rows (none without the geometry booleans)");
ok(!/Depth/.test(labels("dial", ke)) && /Depth/.test(labels("dial", Object.assign(clone(ke), { model: Object.assign(clone(ke.model), { dial: Object.assign(clone(ke.model.dial), { surround: { kind: "raised" } }) }) }))),
  "the surround's sizes once there is one");
ok(/Top edges/.test(labels("motor_cap", kb)), "a box cap: its corners");
const ksh = clone(kb); ksh.model.motor_cap.shape = { top: [] };
ok(!/Top edges/.test(labels("motor_cap", ksh)), "a drawn cap: no corners");
const sp = R.preset("spindle65");
ok(labels("housing", sp).startsWith("Length,Ø,Cooling") && /Can/.test(labels("housing", sp)) && !/Bottom chamfer/.test(labels("housing", sp)),
  `a spindle's can: its cooling + look, no chamfer (${labels("housing", sp)})`);
ok(!S.partShown("motor_cap", sp.model) && S.partShown("motor_cap", kb.model) && S.partLabel("housing", sp.model) === "Can", "a spindle: no motor cap, its housing named Can");
ok(/Dial 1/.test(labels("router", kb)) && !/Top speed/.test(labels("router", kb)) && /Top speed/.test(labels("router", Object.assign(clone(kb), { source: "gcode" }))),
  "the router's speed rows follow its source");
const tr = clone(kb); tr.model.transition = { l: 10, shape: "cap", edge: "chamfer", e: 2, d: 60 };
ok(!/Top Ø/.test(labels("transition", tr)) && /Chamfer size/.test(labels("transition", tr)), `the transition: shaped to the cap, a chamfer (${labels("transition", tr)})`);

// features: added = kept by clean(), shown; removed = gone
for (const F of S.FEATURES) {
  const p = R.preset("testbox");
  if (F.has(p.model)) F.remove(p);
  const off = R.clean(p);
  F.add(p);
  const on = R.clean(p);
  ok(!F.has(off.model) && on && F.has(on.model) && S.partShown(F.part, on.model) && !S.partShown(F.part, off.model), `feature ${F.id}: added, kept by clean(), removed`);
}

// "has:" rows: an optional piece on / off (no "0 = none" sizes)
const lk = clone(kb), lockKeys = () => S.rows("shaft_lock", lk).map((r) => r.k);
ok(S.value(lk, "has:lock.d") === (lk.model.shaft_lock.d > 0) && lockKeys().includes("has:lock.d"), "the boss's toggle reads the boss");
lk.model.shaft_lock.d = 0; lk.model.shaft_lock.arm = 0;
ok(!S.value(lk, "has:lock.d") && !lockKeys().includes("model.shaft_lock.d") && !lockKeys().includes("model.shaft_lock.in") && !lockKeys().includes("model.shaft_lock.arm"),
  "no boss / arm: their sizes hidden, the toggles stay");
ok(S.ROWS.filter((r) => r.kind === "has").every((r) => S.ROWS.some((q) => q.k === r.of)) && !S.ROWS.some((r) => /0 = none/.test(S.labelOf(r, kb.model))),
  "every toggle has its size row; no label says 0 = none");

// values as drawn
const sh = S.shown(kb);
ok(Math.abs(S.value(kb, "model.overall", sh) - 210) < 30 && S.value(kb, "speeds.0") > 0 && S.value(kb, "kind") === "router" && S.value(sp, "kind") === "spindle",
  `values: overall ${S.value(kb, "model.overall", sh)}, dial 1 ${S.value(kb, "speeds.0")}`);
ok(S.value(kb, "model.switch.down", sh) > 0 && /, /.test(S.value(kb, "model.collet.sizes")), "the switch's place as drawn; the collet sizes as a list");

console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
