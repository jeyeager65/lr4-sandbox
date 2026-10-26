// web/js/bit_library.js: My bits - the store's defaults until you save, add / update / remove / reset, a file's tool
// matched to one of yours, and every default a bit the cut simulation can use.
//   node tests/test_bit_library.js   (in npm test)
"use strict";
const BL = require("../web/js/bit_library.js"), HS = require("../web/js/hand_setup.js");
const { compileStockTool } = require("../web/js/lib/cnc-gcode-tools/stock-sim.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

const ls = store(), B = BL.create(ls, () => 1000);
const d = B.list();
ok(d.length === 9 && !ls.m.size, `the defaults until something is saved (${d.length}, nothing written)`);
ok(d.filter((b) => b.url.startsWith("https://www.v1e.com/products/")).length === 8, "8 store bits with their store pages");
const surf = d.find((b) => b.id === "surf-34");
ok(surf && Math.abs(surf.d - 19.05) < 1e-9 && surf.flutes === 2 && !d.some((b) => b.d > 19.1), 'the surfacing bit is 3/4" (none bigger)');
for (const b of d) ok(!!compileStockTool(HS.toDef(b)), `${b.name}: the simulator takes it (${JSON.stringify(HS.toDef(b))})`);
const tb = d.find((b) => b.shape === "taperball");
ok(tb.tip === 1.6 && Math.abs(tb.angle - 5.3) < 0.05, "tapered ballnose: 1.6 mm ball, 5.3 deg");
// add / update / remove / reset
const id = B.add({ shape: "vbit", d: 12.7, angle: 60, tip: 0, cr: 0, flutes: 2, len: 0 }, '1/2" 60° V-bit');
ok(B.list().length === 10 && B.find(id).name === '1/2" 60° V-bit' && B.find(id).url === "", "add: saved (all 10 written)");
ok(B.update(id, { flutes: 3 }) && B.find(id).flutes === 3 && B.find(id).name === '1/2" 60° V-bit', "update keeps the name");
ok(B.remove("v1e-18-ball") && !B.find("v1e-18-ball") && B.list().length === 9, "remove a default");
const B2 = BL.create(ls);
ok(B2.find(id) && !B2.find("v1e-18-ball"), "kept across loads");
B2.reset();
ok(B2.list().length === 9 && B2.find("v1e-18-ball") && !B2.find(id), "reset: the store's list again");
// a file's ToolDef -> yours
ok(B.matchDef({ shape: "flat", diameter: 6.35 }).id === "v1e-14-1f-up", '1/4" flat -> 1/4" single flute');
ok(B.matchDef({ shape: "vbit", diameter: 3.175, angle: 45 }).id === "v1e-18-v45" && !B.matchDef({ shape: "vbit", diameter: 3.175, angle: 90 }), "V-bits match by angle too");
ok(!B.matchDef({ shape: "flat", diameter: 25.4 }), 'no 1" bit');
// the form check, and junk in storage
ok(BL.same(d[0], Object.assign({}, d[0], { name: "x", flen: 3 })) && !BL.same(d[0], Object.assign({}, d[0], { d: 3 })), "same: the form's fields only");
ls.setItem(BL.KEY, JSON.stringify([{ name: "no size" }, { id: "z", name: "ok", d: 2 }, 5]));
ok(BL.create(ls).list().map((b) => b.id).join() === "z", "bad stored bits dropped");
console.log(fails ? `bit library: ${fails} of ${checks} failed` : `bit library: all ${checks} passed`);
process.exit(fails ? 1 : 0);
