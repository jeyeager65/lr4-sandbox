// filaments.js (Part 40): presets, per-part overrides, removing a spool, clean() and the share link round trip.
//   node tests/test_filaments.js
"use strict";
const F = require("../web/js/filaments.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

const parts = [
  { name: "Core", role: "main", cx: 500 }, { name: "YZ_Plate_Min", role: "main", cx: 0 }, { name: "YZ_Plate_Max", role: "main", cx: 1000 },
  { name: "Brace_1", role: "main", cx: 100 }, { name: "Brace_2", role: "main", cx: 300 }, { name: "Brace_Max", role: "main", cx: 900 },
  { name: "Tool_Mount_T_Kobalt", role: "accent", cx: 500 }, { name: "Tool_Mount_B_Kobalt", role: "accent", cx: 500 },
  { name: "Z_Stub_Min", role: "accent", cx: 0 }, { name: "PeterPlate_T_Max", role: "accent", cx: 1000 }, { name: "PeterPlate_B_Min", role: "accent", cx: 0 }, { name: "Bristles_TPU_1", role: "main", cx: 500 }];

let s = F.defaults(), a = F.assign(parts, s);
ok(a.get("Core") === 0 && a.get("Z_Stub_Min") === 1 && a.get("Tool_Mount_T_Kobalt") === 2, "classic: main / accent / mounts on PETG");
ok(a.get("PeterPlate_T_Max") === 0 && a.get("PeterPlate_B_Min") === 1, "classic: top Peter Plate black, bottom red");
ok(s.spools[2].mat === "PETG" && a.get("Bristles_TPU_1") === -1, "classic: spool 3 PETG, bristles TPU");

s = F.setPreset(s, "fiber"); a = F.assign(parts, s);
ok(["Core", "YZ_Plate_Min", "YZ_Plate_Max", "Brace_1", "Brace_Max", "Tool_Mount_B_Kobalt"].every((n) => a.get(n) === 2), "fiber: the fiber parts");
ok(a.get("Brace_2") === 0 && a.get("Z_Stub_Min") === 1 && a.get("PeterPlate_T_Max") === 0 && a.get("PeterPlate_B_Min") === 1, "fiber: inner brace main, accent + Peter Plates kept");
ok(s.spools[2].mat === "PET-CF", "fiber: PET-CF spool");

s = F.setPreset(s, "single"); a = F.assign(parts, s);
ok([...a.values()].every((v) => v === 0 || v === -1), "single: one spool");

s = F.setPreset(F.defaults(), "classic");
s.parts = { Core: 1, Brace_2: 2 };
a = F.assign(parts, s);
ok(a.get("Core") === 1 && a.get("Brace_2") === 2, "overrides win");
const r = F.removeSpool(s, 1);
ok(r.spools.length === 2 && !("Core" in r.parts) && r.parts.Brace_2 === 1, "remove: its overrides go, later ones shift");
ok(F.assign(parts, r).get("Z_Stub_Min") === 1, "remove: the rule clamps to the spools left");
ok(F.removeSpool(F.setPreset(s, "single"), 0).spools.length === 1, "the last spool stays");

ok(F.clean({ spools: [{ mat: "ABS", color: "#000000" }], layer: 5, bed: "x", parts: { Core: 9 } }).spools.length === 3, "clean: bad spools -> preset");
ok(F.clean({ layer: 5 }).layer === 0.2 && F.clean({ layer: 0.12 }).layer === 0.12, "clean: layer range");

ok(Object.keys(F.toLink(F.defaults())).length === 0, "link: defaults say nothing");
s = F.setPreset(F.defaults(), "fiber");
s.spools[0].color = "#ecebe6"; s.parts = { Core: 1, "Brace_12": 0 }; s.layer = 0.28; s.bed = "smooth"; s.look = "off";
s.plates.front = { mat: "acrylic", color: "#112233" };
const q = F.toLink(s), back = F.fromLink(q);
ok(JSON.stringify(back) === JSON.stringify(F.clean(s)), `link round trip: ${JSON.stringify(q)}`);
ok(F.fromLink({ units: "mm" }) === null, "link: no filament keys -> null");
ok(F.lookOn(F.defaults(), true) === false && F.lookOn(F.defaults(), false) === true && F.lookOn({ look: "on" }, true), "look: auto follows Lite");

for (const [hex, name] of [["#d63384", "Magenta"], ["#e01b8f", "Magenta"], ["#ffb6c1", "Pink"], ["#292a2e", "Black"], ["#cc1f1a", "Red"], ["#b9bdc1", "Silver"], ["#0000ff", "Blue"], ["#ff8800", "Orange"], ["#e2148c", "Magenta"], ["#ffffff", "White"], ["#808080", "Gray"], ["#00a000", "Green"], ["#8b5a2b", "Brown"]])
  ok(F.colorName(hex) === name, `colorName ${hex}: ${F.colorName(hex)}, want ${name}`);
// presets are starting points: edited, save as, reset
let e = F.setPreset(F.defaults(), "classic");
ok(!F.edited(e, []), "fresh preset: not edited");
e.spools[0].color = "#ECEBE6";
ok(F.edited(e, []) && F.sourceOf(e, []).label === "V1E classic", "a spool color: edited from V1E classic");
let [mine, e2] = F.saveAs([], e, "  White core ");
ok(mine.length === 1 && mine[0].name === "White core" && e2.saved === "White core" && !F.edited(e2, mine), "saved: from it, not edited");
e2.parts.Core = 1;
ok(F.edited(e2, mine) && F.sourceOf(e2, mine).label === "White core", "an override: edited from the saved one");
const e3 = F.resetTo(e2, mine);
ok(!F.edited(e3, mine) && !("Core" in e3.parts) && e3.spools[0].color === "#ecebe6", "reset: back to the saved preset");
ok(F.resetTo(F.setPreset(e3, "fiber"), mine).preset === "fiber", "a built-in resets to the built-in");
mine[0].spools[1].color = "#0000ff";                  // the stored list isn't shared with the state
ok(e3.spools[1].color !== "#0000ff", "useSaved copies");
ok(F.cleanSaved([{ name: "", spools: [] }, { name: "x", preset: "nope", spools: [{ mat: "PLA", color: "#123456" }] }]).length === 1, "cleanSaved");
ok(F.resetTo(Object.assign(F.defaults(), { saved: "gone" }), []).saved === null, "a deleted saved preset resets to its built-in");
// painted plates: paint kept (clean), in the link (mdf_a7865f!202020) and back; an old link (no paint) has none
{
  const s = F.defaults();
  s.plates.front = { mat: "mdf", color: "#a7865f", paint: "#202020" };
  const c = F.clean(s), q = F.toLink(c), back = F.fromLink(q);
  ok(c.plates.front.paint === "#202020" && c.plates.bottom.paint === null, "clean keeps the paint (none on the bottom)");
  ok(q.plates === "mdf_a7865f!202020~mdf_a7865f" && back.plates.front.paint === "#202020" && back.plates.bottom.paint === null, `paint in the link: ${q.plates}`);
  ok(F.fromLink({ plates: "plywood_dbad70~mdf_a7865f" }).plates.front.paint === null, "an old link: unpainted");
  ok(F.clean({ plates: { front: { mat: "mdf", color: "#a7865f", paint: "red" } } }).plates.front.paint === null, "a bad paint color: none");
}
console.log(`${checks - fails}/${checks} filament checks passed`);
process.exit(fails ? 1 : 0);
