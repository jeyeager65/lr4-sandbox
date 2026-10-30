// routers.js (Part 45a): settings kept valid, a manual router runs at its dial whatever the file's S, a G-code
// router (AutoSpin T1) at S up to its top, the notes (file's dial vs the router's, S out of range), the bit's turn
// on screen, the dial's angle; sounds.js routerPlan keeps the file's dial.
//   node tests/test_routers.js
"use strict";
const R = require("../web/js/routers.js");
const S = require("../web/js/sounds.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

ok(JSON.stringify(R.settings(null)) === JSON.stringify({ router: "kobalt", dial: 3 }), "defaults: Kobalt, dial 3");
ok(R.settings({ router: "nope", dial: 9 }).router === "kobalt" && R.settings({ dial: 9 }).dial === 6, "unknown router / dial past 6 clamped");
ok(R.settings({ dial: 0 }).dial === 1 && R.settings({ dial: "x" }).dial === 3 && R.settings({ dial: 3.456 }).dial === 3.5 && R.settings({ dial: 3.2 }).dial === 3, "dial clamped + snapped to the 0.5 stops");
ok(R.manual("kobalt") && R.manual("makita") && !R.manual("t1"), "Kobalt / Makita manual, T1 G-code");

// manual: the dial, not S
ok(R.rpm({ router: "kobalt", dial: 3 }, 24000) === 18000, "Kobalt dial 3: 18000 whatever S says");
ok(R.rpm({ router: "kobalt", dial: 4.5 }, 1) === 24000, "Kobalt dial 4.5: 24000 (interpolated)");
ok(R.rpm({ router: "makita", dial: 6 }, 18000) === 30000, "Makita dial 6: 30000");
ok(R.rpm({ router: "kobalt", dial: 3 }, 0) === 0, "off is off");
// G-code: S
ok(R.rpm({ router: "t1", dial: 1 }, 24000) === 24000, "T1: S24000 = 24000, the dial ignored");
ok(R.rpm({ router: "t1" }, 40000) === 31250, "T1: S past 31250 runs at 31250");

// notes
ok(R.note({ router: "kobalt", dial: 3 }, { rpm: 18000, dial: 3 }) === "", "file's dial = the router's: no note");
ok(/dial 4.*dial is at 3/.test(R.note({ router: "kobalt", dial: 3 }, { rpm: 22000, dial: 4 })), "file asks dial 4, router at 3: a note");
ok(R.note({ router: "kobalt", dial: 3 }, { rpm: 24000 }) === "", "M3 S on a manual router: no note (S just does nothing)");
ok(/manual router/.test(R.note({ router: "t1" }, { rpm: 18000, dial: 3 })), "T1 running a manual post: a note");
ok(/top speed/.test(R.note({ router: "t1" }, { rpm: 40000 })) && /accurate/.test(R.note({ router: "t1" }, { rpm: 5000 })), "T1: S too high / low noted");
ok(R.note({ router: "t1" }, { rpm: 18000 }) === "" && R.note({ router: "kobalt" }, { rpm: 0, dial: 5 }) === "", "T1 in range / router off: nothing");

// the turn on screen: 1.5 .. 2.5 rev/s, 2 at 18000, never past 2.5 (the nut wagon-wheels at 30 fps)
ok(R.spinRps(0) === 0 && R.spinRps(10000) === 1.5 && R.spinRps(18000) === 2 && R.spinRps(35000) === 2.5 && R.spinRps(5000) === 1.5, "spin rev/s");
let mono = true;
for (let v = 10000, p = 0; v <= 35000; v += 500) { const q = R.spinRps(v); if (q < p) mono = false; p = q; }
ok(mono, "spin grows with the speed");
ok(R.dialDeg(1) === 0 && R.dialDeg(6) === 250 && R.dialDeg(3.5) === 125, "dial angle");

// routerPlan: the file's dial on its router-on event
const plan = S.routerPlan(["(dial 3 = ~18000 RPM)", "M0 (MSG, Turn On Router at Dial 4)", "G1 X10", "M0 (MSG, Turn Off Router)"].join("\n"));
ok(plan.events.length === 2 && plan.events[0].dial === 4 && plan.events[1].dial === undefined, "routerPlan keeps the file's dial");
ok(S.routerPlan("M3 S12000").events[0].dial === undefined, "M3 S: no dial");
const both = S.routerPlan("M3 S24000 (Turn On Router at Dial 4)").events;
ok(both.length === 1 && both[0].rpm === 24000 && both[0].dial === 4, `M3 S + a dial comment: one event, its S + the dial ${JSON.stringify(both)}`);

// Build your router: clean() makes any stored / imported object a valid preset (or null), define() puts it in
const B = require("../web/js/router_body.js"), SC = require("../web/js/strut_cam.js");
ok(R.clean(null) === null && R.clean({ name: "x" }) === null && R.clean({ body: { nut: [20, 10] } }) === null, "clean: no model (or an old body) -> null");
const junk = R.clean({ name: "J".repeat(99), source: "manual", speeds: [[1, "a"], [2, 5], [3, 9e9], 4, [5, 1], [6, 20000]], mount: "?",
  model: { collet_nut: { af: -5, h: "x" }, housing: "no", motor_cap: { L: 1e6, W: "?" }, dial: { place: "top" }, looks: { housing: { c: [2, -1, 0.5], f: "?" } } } });
ok(junk && junk.name.length === 40 && junk.mount === "makita" && junk.model.collet_nut.af === 5 && junk.model.motor_cap.L === 300 && junk.model.dial.place === "top",
  `clean: junk clamped (${JSON.stringify(junk && junk.model.motor_cap)})`);
ok(junk.speeds.every(([d, v], i) => d === i + 1 && v >= 1000 && (i === 0 || v >= junk.speeds[i - 1][1])), `clean: speed table 1..6, never slower up the dial ${JSON.stringify(junk.speeds)}`);
ok(junk.model.looks.housing.c.join() === "1,0,0.5" && junk.model.looks.housing.f === "metal" && R.LOOK_PARTS.every((k) => junk.model.looks[k]), "clean: a look for every part, clamped");
ok(B.overall(junk.model) > junk.model.collet_nut.h && B.build(junk.model).parts.motor_cap.pos.every(Number.isFinite), "clean: builds");
ok(R.ROUTERS.kobalt.model.collet.type === "ER11" && R.ROUTERS.kobalt.model.collet.sizes.join() === "3.175,6.35" && R.ROUTERS.kobalt.model.collet_nut.type === "ER11A"
  && R.ROUTERS.kobalt.model.shaft.thread.pitch === 0.75 && R.ROUTERS.carbide.model.collet.type === "ER11", "Kobalt + Carbide: ER11 1/8 + 1/4, ER11A nut, M13 x 0.75");
ok(["carbide", "kobalt"].every((id) => R.ROUTERS[id].model.shaft.flats && R.ROUTERS[id].model.shaft_lock),
  "Kobalt + Carbide: a shaft lock and flats (held either way)");
const mine = R.preset("makita");
mine.name = "Mine"; mine.model.motor_cap.L = 111; mine.source = "gcode"; mine.s = [8000, 24000];
const id = R.newId(mine.name);
R.define(id, mine);
ok(id === "custom-mine" && R.ROUTERS[id].custom && !R.manual(id) && R.rpm({ router: id, dial: 3 }, 30000) === 24000 && !SC.ROUTERS[id], "define: a G-code custom router (its top speed, no speed table)");
mine.source = "manual"; R.define(id, mine);
ok(SC.ROUTERS[id] && R.dialRpm(1, id) === R.ROUTERS.kobalt.speeds[0][1] && R.newId("Mine") === "custom-mine-2", "define: manual without a table -> the Kobalt's; ids stay unique");
R.define(id, null);
ok(!R.ROUTERS[id] && !SC.ROUTERS[id] && R.define("makita", null).model.motor_cap.L === 78, "define(null): a custom one gone, a preset back to its data");

// the motor cap always sits on the turned part; a longer housing lifts it; it covers the turned part
const hb = (p) => { const m = B.build(p.model).parts.motor_cap; let z = Infinity; for (let i = 2; i < m.pos.length; i += 3) z = Math.min(z, m.pos[i]); return z; };
const gap = R.preset("makita");
gap.model.motor_cap.H = 20;
const g1 = R.clean(gap);
ok(Math.abs(hb(g1) - B.stackTop(g1.model)) < 0.5 && B.overall(g1.model) === B.stackTop(g1.model) + 20, `H 20: on the housing, overall ${B.overall(g1.model)}`);
gap.model.housing.l += 30;
const g2 = R.clean(gap);
ok(Math.abs(hb(g2) - B.stackTop(g2.model)) < 0.5 && B.overall(g2.model) === B.overall(g1.model) + 30, `housing 30 longer: the cap rides up (overall ${B.overall(g2.model)})`);
gap.model.motor_cap.W = 30; gap.model.motor_cap.L = 40;
const g3 = R.clean(gap).model.motor_cap;
ok(g3.W === 65 && g3.L === 65, `a cap narrower than the housing -> the housing's 65 (${g3.L} x ${g3.W})`);

// the dimensions on the model (router_dims.js): every editable one names a builder input; read-only where it's derived
const DM = require("../web/js/router_dims.js");
const dm = (id, c = 36.5) => Object.fromEntries(DM.dims(R.ROUTERS[id], c).map((d) => [d.id, d]));
const mk = dm("makita");
ok(mk["cap-L"].v === 78 && mk["cap-L"].k === "model.motor_cap.L" && mk["cap-L"].f === 2 && mk.overall.v === 205 && mk.overall.k === "model.overall" && mk.clamp.v === 36.5,
  "dims: the Makita's motor cap length (centered: drag x2), overall, nut below the clamp");
ok(Object.values(mk).every((d) => d.views.length && Number.isFinite(d.v) && [d.a, d.b, d.off].every((p) => p.length === 3 && p.every(Number.isFinite))), "dims: all placed, in a view");
ok(mk["len-shaft"].k === "model.shaft.exposed" && mk["len-collet_nut"].k === "model.collet_nut.h" && mk["dia-collet_nut"].k === "model.collet_nut.af", "dims: the exposed shaft + the collet nut");
const cb = dm("carbide");
ok(cb["len-transition"].k === "model.transition.l" && cb["len-transition"].v === 38 && cb["dia-transition"].v === 73 && cb["housing-ch"].k === "model.housing.ch", "dims: the Carbide's transition + the housing chamfer");
const hs = R.clean({ name: "H", model: { collet_nut: { af: 20, h: 12 }, shaft: { d: 12, exposed: 0 }, housing: { d: 65, l: 90, ch: 2.5 },
  transition: { l: 20, shape: "cap", edge: "fillet", e: 4 }, motor_cap: { L: 90, W: 80, H: 98 } } });
const hd = Object.fromEntries(DM.dims(hs, 36.5).map((d) => [d.id, d]));
ok(hs.model.housing.ch === 2.5 && !hd["dia-transition"] && hd["transition-e"].kind === "rad", "clean + dims: a cap-shaped transition (no Ø), its fillet");
ok(Math.abs(hb(hs) - B.stackTop(hs.model)) < 0.5 && B.stackTop(hs.model) === 12 + 90 + 20, "the cap on the transition");
const sp = dm("spindle65");
ok(sp["len-housing"].k === "model.housing.l" && sp.overall.k === null && !sp["cap-L"], "dims: a spindle's can; its overall shown only, no motor cap");
ok(!dm("makita", null).clamp && DM.dims(Object.assign({}, R.ROUTERS.makita, { mount: "none" }), 36.5).every((d) => d.id !== "clamp"), "dims: no clamp line without a mount");
ok(DM.pick(R.ROUTERS.kobalt, "housing", [0, 0, 60]) === "housing" && DM.pick(R.ROUTERS.kobalt, "switch", [0, 0, 0]) === "motor_cap" && DM.pick(R.ROUTERS.kobalt, null, [0, 0, 0], "Tool_Mount_B_Kobalt") === "mount",
  "pick: a part's mesh -> its region");
// an old page's stored edit (0.60 schema: dial + body) of a data-file router: dropped, the router keeps its own preset (user 2026-10-30: the page wouldn't load)
const kob = JSON.stringify(R.ROUTERS.kobalt.model), left = R.loadEdits({ get: () => JSON.stringify({ kobalt: { name: "Kobalt", dial: [[1, 10000]], body: { nut: {} } } }) });
ok(R.ROUTERS.kobalt && JSON.stringify(R.ROUTERS.kobalt.model) === kob && !left.kobalt && R.settings({ router: "kobalt" }).router === "kobalt", "an old stored edit of the Kobalt: dropped, the Kobalt stays");

console.log(`${checks - fails}/${checks} routers checks passed`);
process.exit(fails ? 1 : 0);
