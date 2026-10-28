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
ok(R.settings({ dial: 0 }).dial === 1 && R.settings({ dial: "x" }).dial === 3 && R.settings({ dial: 3.456 }).dial === 3.5, "dial clamped + rounded to 0.1");
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

console.log(`${checks - fails}/${checks} routers checks passed`);
process.exit(fails ? 1 : 0);
