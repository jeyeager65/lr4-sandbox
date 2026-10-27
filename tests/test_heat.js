// heat.js (Part 44b): rubbing vs cutting (chipload), a dwell smoking -> scorching -> catching in about the intended
// times, a proper cut staying cool, moving on cooling a spot, Fire off = a warning only, the extinguisher, a video's
// ramp, settings + share link.
//   node tests/test_heat.js
"use strict";
const H = require("../web/js/heat.js");
const IM = require("../web/js/imperfect.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

const base = (o) => Object.assign({ dt: 0.05, p: { x: 50, y: 50, z: -3 }, r: 1.5875, rpm: 18000, flutes: 2, vh: 0, vz: 0, eng: { d: 3, c: 3 }, fire: false }, o);
// run until fn(out, st) or secs: -> the time it happened (s) or null
function until(st, o, fn, secs = 60) {
  for (let t = 0; t < secs; t += 0.05) { const out = H.step(st, base(typeof o === "function" ? o(t) : o)); if (fn(out, st)) return t; }
  return null;
}

ok(H.settings().on === false && H.settings().fire === false && H.settings().auto === true, "off by default");
// rubbing: chipload under 0.025 mm rubs; a dwell rubs fully; the router off doesn't heat
ok(H.rubbing({ rpm: 18000, flutes: 2, vh: 0 }).rub === 1, "dwell: rubs fully");
ok(H.rubbing({ rpm: 18000, flutes: 2, vh: 25 }).rub === 0, "1500 mm/min at 18000 rpm (0.042 mm/tooth): cuts");
ok(Math.abs(H.rubbing({ rpm: 18000, flutes: 2, vh: 5 }).rub - (1 - 5 / 600 / 0.025)) < 1e-9, "300 mm/min: rubs some");

// a dwell with the router on, 3 mm deep: smoke ~5 s, scorch after, would-ignite ~15 s (Fire off: no fire)
const d = H.create(), tSmoke = until(d, {}, (o) => o.events.includes("smoke"));
const tScorch = until(d, {}, (o) => o.events.includes("scorch"));
const tIgn = until(d, {}, (o) => o.events.includes("would-ignite"));
console.log(`  dwell: smoke ${tSmoke} s, then scorch +${tScorch} s, would-ignite +${tIgn} s`);
ok(tSmoke > 3 && tSmoke < 9, `dwell smokes in 3-9 s (${tSmoke})`);
ok(tScorch !== null && tIgn !== null && tSmoke + tScorch + tIgn < 25, `then scorches + would catch within 25 s`);
ok(H.burning(d).length === 0, "Fire off: no fire");
// Fire on: it catches, the fire grows; the extinguisher puts it out and cools the spot + the bit
const f = H.create(), tF = until(f, { fire: true }, (o) => o.events.includes("ignite"));
ok(tF !== null && tF < 25 && H.burning(f).length === 1, `Fire on: catches (${tF} s)`);
const n0 = f.cells.size;
until(f, { fire: true }, () => false, 5);
const fb = H.burning(f)[0];
ok(H.fireSize(fb) > 1.2 && fb.r > 15 && f.cells.size > n0 + 20, `the fire grows and spreads: size ${H.fireSize(fb).toFixed(2)}, r ${fb.r.toFixed(0)} mm, cells ${n0} -> ${f.cells.size}`);
ok(until(f, { fire: true, eng: { d: 0, c: 0 } }, () => false, 3) === null && H.burning(f).length === 1, "a fire keeps burning with the bit out");
H.extinguish(f);
ok(H.burning(f).length === 0 && f.bit < 100 && [...f.cells.values()].every((c) => c.T < 100), "extinguished: out, cooled");
ok([...f.cells.values()].some((c) => c.scorch > 0.5), "the scorch stays");

// a proper cut along X at 1500 mm/min never smokes; a creep at 60 mm/min does (slowly), router off never
const cut = (vh) => (t) => ({ vh, p: { x: 10 + vh * t, y: 50, z: -3 } });
ok(until(H.create(), cut(25), (o) => o.events.includes("smoke"), 60) === null, "1500 mm/min: no smoke");
ok(until(H.create(), cut(1), (o) => o.events.includes("smoke"), 120) !== null, "60 mm/min: smokes in time");
ok(until(H.create(), { rpm: 0 }, (o) => o.events.includes("smoke"), 30) === null, "router off: no heat");
ok(until(H.create(), { eng: { d: 0, c: 0 } }, (o) => o.events.includes("smoke"), 30) === null, "in the air: no heat");
// moving on: the spot cools and the cell goes
const m = H.create(); until(m, {}, () => false, 6);
const hot0 = Math.max(...[...m.cells.values()].map((c) => c.T));
until(m, { eng: { d: 0, c: 0 }, p: { x: 300, y: 50, z: 5 } }, () => false, 10);
const hot1 = Math.max(0, ...[...m.cells.values()].map((c) => c.T));
ok(hot1 < hot0 * 0.4, `moving on cools it: ${hot0.toFixed(0)} -> ${hot1.toFixed(0)}`);
// a video's ramp: catches in TIME s wherever the bit is
const v = H.create(); H.ramp(v, 20, 20, 0, 4);
const tR = until(v, { fire: true, eng: { d: 0, c: 0 } }, (o) => o.events.includes("ignite"), 10);
ok(tR !== null && tR > 3.5 && tR < 4.6, `ramp catches at ~4 s (${tR})`);
// off the stock (top null): nothing heats there
const o2 = H.create(); until(o2, { top: () => null }, () => false, 10);
ok(o2.cells.size === 0, "off the stock: no cells");

// settings in Imperfect + the share link
const im = IM.settings({ heat: { on: true, fire: true } });
ok(im.heat.on && im.heat.fire && im.heat.auto, `Imperfect heat ${JSON.stringify(im.heat)}`);
const link = IM.toLink(im), back = IM.fromLink(Object.assign({ ab: "1" }, link));
ok(back.heat.on && back.heat.fire, `share link ${JSON.stringify(link)}`);

console.log(`${checks - fails}/${checks} heat checks passed`);
process.exit(fails ? 1 : 0);
