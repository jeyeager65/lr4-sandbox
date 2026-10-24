// show_tree.js: the Show tab's tree on the reference build's parts (web/data/lr4_config.json) plus the page's own
// (hose cables, pendant).   node tests/test_show_tree.js
// Every part is filed; bolts joining two assemblies are listed under both and drawn if either is on; belts, the
// router and the shoe land where Part 26 put them; presets; ids are unique per kind row.
"use strict";
const fs = require("fs"), path = require("path");
const T = require("../web/js/show_tree.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "data", "lr4_config.json"), "utf8"));
const parts = cfg.parts.map((r) => Object.assign({}, r.meta));
for (const p of parts) if (/^(Dust_Skirt|Bristles_TPU)/.test(p.name)) p.group = "Shoe";   // as the page does
parts.push({ name: "Vacuum_Hose", label: "Vacuum hose", group: "Hose", source: "hardware", motion: "hose" },
  { name: "Cable_Sleeve", label: "Cable sleeve", group: "Hose", source: "hardware", motion: "hose" },
  { name: "Pendant_case", label: "Case", group: "Pendant", source: "pendant", role: "main", motion: "table" },
  { name: "Pendant_screen", label: "Screen", group: "Pendant", source: "pendant", motion: "table" },
  { name: "Pendant_spacer", label: "Spacer", group: "Pendant", source: "made", motion: "table" });
const tree = T.build(parts);
const where = (id) => (tree.place[id] || []).map((p) => p.join("."));

// every part (threads by their screw) has a place, every place a row
for (const p of parts) ok((tree.place[p.name.replace(/~thread$/, "")] || []).length, "filed: " + p.name);
for (const a of tree.asms) for (const k of a.kinds) {
  const ids = k.parts.map((q) => q.id);
  ok(new Set(ids).size === ids.length, "unique ids in " + k.id);
  ok(k.n === k.parts.reduce((s, q) => s + q.n, 0), "count " + k.id);
}
ok(tree.asms.map((a) => a.id).join() === "table,yz-min,yz-max,beam,core,router,touch,hose,electronics,pendant", "assemblies " + tree.asms.map((a) => a.id));

// moves
ok(where("Belt_Y_Min_Front").join() === "table.hardware", "Y belt with the table: " + where("Belt_Y_Min_Front"));
ok(where("Belt_X_Min").join() === "beam.hardware", "X belt with the beam");
ok(where("Router_Kobalt").join() === "router.hardware", "router out of Core");
ok(where("Tool_Mount_T_Kobalt").join() === "router.printed", "tool mount with the router");
ok(where("Dust_Skirt_Kobalt").join() === "router.printed", "skirt with the router");
ok(where("X_Stepper").join() === "core.electronics", "X stepper: core electronics");
ok(where("Jackpot3_Fan").join() === "electronics.electronics", "lid fan");
ok(where("XZ_Plate_Min").join() === "yz-min.cut", "XZ plate cut");
ok(where("Pendant_case").join() === "pendant.printed" && where("Pendant_spacer").join() === "pendant.cut", "pendant kinds");

// bolts by their joint
ok(where("Tool_Mount_T_Kobalt__M5_to_Core").sort().join() === "core.hardware,router.hardware", "tool mount bolt under both: "
  + where("Tool_Mount_T_Kobalt__M5_to_Core"));
ok(where("XZ_Plate_Min__M5_to_Brace_1").sort().join() === "beam.hardware,yz-min.hardware", "XZ plate to brace 1: " + where("XZ_Plate_Min__M5_to_Brace_1"));
ok(where("Bearing_Core__M8").join() === "core.hardware", "core bearing bolt: " + where("Bearing_Core__M8"));
const bolt = "Tool_Mount_T_Kobalt__M5_to_Core";
ok(T.on(tree, new Set(["router"]), bolt), "bolt drawn with only the core on");
ok(!T.on(tree, new Set(["router", "core.hardware"]), bolt), "bolt off with both off");
ok(!T.on(tree, new Set([bolt]), bolt), "bolt off by its own id");
ok(T.on(tree, new Set(), "Core__M3_to_X_Stepper~thread".replace("~thread", "")), "thread id = screw");

// presets
const offOf = (p) => T.preset(tree, p);
ok(offOf("all").size === 0, "All = nothing off");
ok(!T.on(tree, offOf("no-hardware"), "Core__M3_to_X_Stepper") && T.on(tree, offOf("no-hardware"), "Core"), "No hardware");
ok(T.on(tree, offOf("printed"), "Core") && !T.on(tree, offOf("printed"), "XZ_Plate_Min") && !T.on(tree, offOf("printed"), "Y_Rail"), "Printed only");
const fr = offOf("frame");
ok(T.on(tree, fr, "Brace_1") && T.on(tree, fr, "Y_Rail") && !T.on(tree, fr, "Core") && !T.on(tree, fr, "Y_Stepper_Min"), "Frame only");
ok(T.on(tree, fr, "XZ_Plate_Min__M5_to_Brace_1"), "Frame only keeps the frame's bolts");
ok(T.presetOf(tree, offOf("printed")) === "printed" && T.presetOf(tree, new Set(["core"])) === "", "presetOf");

// inspect (Part 27): a part pulls in the bolts joining it and the bearings / idlers they hold; an assembly is itself
const ins = T.inspectSet(tree, "Core");
ok(["Bearing_Core__M8", "Bearing_Core_Lower_1", "X_Idler_2", "Core__M3_to_X_Stepper", "Tool_Mount_T_Kobalt__M5_to_Core",
  "Endstop_X__M2_5_to_Core"].every((x) => ins.has(x)), "Core: bolts + bearings + idlers");
ok(!ins.has("X_Stepper") && !ins.has("Router_Kobalt") && !ins.has("Tool_Mount_T_Kobalt"), "Core: not the parts on the far side");
ok(T.inspectSet(tree, "core").size === T.members(tree, "core").length, "an assembly = its members");
const xz = T.inspectSet(tree, "XZ_Plate_Min");
ok(xz.has("XZ_Plate_Min__M5_to_Brace_1") && xz.has("MGN12H_Min_177") && !xz.has("Brace_1"), "XZ plate: its bolts + rail blocks, not the brace");
ok(T.inspectSet(tree, "Bearing_Core__M8").size === 1, "a bolt's own row: just it");
const list = T.partsList(parts.filter((p) => ins.has(p.name.replace(/~thread$/, ""))));
const row = (t, l) => ((list.find((q) => q.title === t) || { rows: [] }).rows.find((r) => r[1] === l) || [])[0];
ok(row("Hardware", "Bearing Core Lower") === 4 && row("Hardware", "X Idler") === 2, "copies counted: " + JSON.stringify(list));
ok(row("Fasteners", "M8 x 40 mm hex head bolt") === 8 && row("Fasteners", "M8 nylock nut") === 8
  && row("Fasteners", "M5 x 30 mm button head screw") === 6 && row("Fasteners", "M3 x 10 mm button head screw") === 4,
  "Core's fasteners from meta.fast");
const yl = T.partsList(parts.filter((p) => T.members(tree, "yz-min").includes(p.name.replace(/~thread$/, ""))));
ok(yl.find((q) => q.title === "Hardware").rows.some((r) => r[1] === "MGN12 Rail Min 85"), "rail lengths not merged");

// exploded view (Part 28): along the bolt lines from the anchor; bolts out past their heads; the rest straight out
{
  const set = new Set(["Plate", "Brace", "Wheel", "Bolt", "Bearing"]);
  const info = { bolts: { Bolt: { axis: [1, 0, 0], chain: ["Plate", "Brace"] } },
    centre: { Plate: [0, 0, 0], Brace: [10, 0, 0], Wheel: [0, 50, 0], Bolt: [5, 0, 0], Bearing: [0, 0, 0] },
    size: { Plate: 100, Brace: 50, Wheel: 40, Bearing: 5 } };
  const e = T.explode(set, info);
  ok(e.Plate.join() === "0,0,0" && e.Brace.join() === "1,0,0" && e.Bolt.join() === "-1,0,0", "chain from the plate: " + JSON.stringify(e));
  ok(e.Wheel.join() === "0,1,0" && e.Bearing.join() === "0,0,1", "no bolt: straight out (or up): " + JSON.stringify(e));
  const e2 = T.explode(set, Object.assign({ anchor: "Brace" }, info));
  ok(e2.Brace.join() === "0,0,0" && e2.Plate.join() === "-1,0,0" && e2.Bolt.join() === "-2,0,0", "anchored on the nut side: " + JSON.stringify(e2));
  ok(Object.keys(T.explode(new Set(), info)).length === 0, "empty set");
  const set3 = new Set([...set, "Rail", "Bolt2"]);
  const info3 = Object.assign({}, info, { bolts: Object.assign({ Bolt2: { axis: [0, 0, 1], chain: ["Wheel", "Rail"] } }, info.bolts),
    centre: Object.assign({ Rail: [0, 50, 5], Bolt2: [0, 50, 2] }, info.centre), size: Object.assign({ Rail: 30 }, info.size) });
  const e3 = T.explode(set3, info3);
  ok(e3.Wheel.join() === "0,1,0" && e3.Rail.join() === "0,1,1" && e3.Bolt2.join() === "0,1,-1", "an unreached part's bolts carry on from it: " + JSON.stringify(e3));
}
// a component's meshes stay together (the stepper isn't taken apart); numbered copies are not one component
{
  const set = new Set(["Plate", "Y_Stepper_Min", "Y_Stepper_Min_Shaft", "Y_Stepper_Min_Lead_Red", "Y_Clip", "Y_Clip_2",
    "Router_Kobalt", "Router_Cap", "Bolt"]);
  const c = (x) => [x, 1, 0];
  const info = { bolts: { Bolt: { axis: [0, 0, 1], chain: ["Y_Stepper_Min_Shaft", "Plate"] } }, size: { Plate: 100 },
    centre: { Plate: [0, 0, 0], Y_Stepper_Min: c(1), Y_Stepper_Min_Shaft: c(2), Y_Stepper_Min_Lead_Red: c(3), Y_Clip: c(4),
      Y_Clip_2: c(5), Router_Kobalt: [0, 0, 9], Router_Cap: [9, 9, 9], Bolt: c(0) } };
  const e = T.explode(set, info);
  ok(e.Y_Stepper_Min.join() === "-1,0,0" && e.Y_Stepper_Min_Shaft.join() === "-1,0,0" && e.Y_Stepper_Min_Lead_Red.join() === "-1,0,0",
    "stepper pieces move with the stepper (its bolt chain names the shaft; it slides out -X): " + JSON.stringify(e));
  ok(e.Router_Cap.join() === e.Router_Kobalt.join() && e.Y_Clip_2.join() !== e.Y_Clip.join(), "router pieces together, numbered copies apart");
}
// an axle bolt's bearings come off sideways (square to the axle, away from the host), the bolt two steps out
{
  const set = new Set(["Core", "Axle", "Bearing_1"]);
  const e = T.explode(set, { bolts: { Axle: { axis: [1, 0, 0], chain: ["Core"], held: ["Bearing_1"] } }, size: { Core: 100 },
    centre: { Core: [0, 0, 0], Axle: [0, 0, 20], Bearing_1: [3, 0, 20] } });
  ok(e.Axle.join() === "-2,0,0" && e.Bearing_1.join() === "0,0,1", "axle out two steps, bearing out of its slot: " + JSON.stringify(e));
}
// SLIDE: the motors come off their way, not along their screws; info.slide steers a held bearing
{
  const set = new Set(["YZ_Plate_Min", "Y_Stepper_Min", "Y_Stepper_Min_Face", "Bolt", "Core", "Axle", "Bearing_1"]);
  const e = T.explode(set, { bolts: { Bolt: { axis: [0, 0, 1], chain: ["YZ_Plate_Min", "Y_Stepper_Min_Face", "Y_Stepper_Min"] },
    Axle: { axis: [1, 0, 0], chain: ["YZ_Plate_Min"], held: ["Bearing_1"] } }, size: { YZ_Plate_Min: 100 },
    centre: { YZ_Plate_Min: [0, 0, 0], Y_Stepper_Min: [0, 0, 30], Y_Stepper_Min_Face: [0, 0, 20], Bolt: [0, 0, 10], Axle: [0, 0, -9], Bearing_1: [0, 5, -9] },
    slide: { Bearing_1: [0, 0.6, 0.8] } });
  ok(e.Y_Stepper_Min.join() === "-1,0,0" && e.Y_Stepper_Min_Face.join() === "-1,0,0", "Y motor (Min) slides out -X: " + JSON.stringify(e));
  ok(e.Bearing_1.join() === "0,0.6,0.8", "bearing out of its slot's opening");
}
// real data: every bolt with an axis has it as a unit vector and a chain
for (const p of parts) if (p.axis) ok(Math.abs(Math.hypot(...p.axis) - 1) < 1e-3 && p.chain.length && p.holes.length, "axis + chain + holes: " + p.name);

// My machine options on the BOM (config_model.js bomOptions, on the reference BOM)
const M = require("../web/js/config_model.js");
const bomWith = (opt) => M.bomOptions(JSON.parse(JSON.stringify(cfg.bom_ref)), opt);
const rows = (secs, t) => secs.find((q) => q.title.startsWith(t)).rows;
const kitRow = (secs, item) => rows(secs, "Hardware: V1E kit").find((r) => r[3] === item);
const all = bomWith({ router: true, skirt: true, hose: true, fan: true, pendant: false });
ok(JSON.stringify(all) === JSON.stringify(cfg.bom_ref), "all fitted = the reference BOM");
const bare = bomWith({ router: false, skirt: true, hose: false, fan: false, pendant: false });
ok(!rows(bare, "Printed parts").some((r) => /^(Dust_|Tool_Mount|TPU_)/.test(r[1])), "no router: no mount / shoe / skirt prints");
ok(!rows(bare, "Buy: specialty").some((r) => /router|dust collection hose|blower|Wire sleeve/i.test(r[1])), "no router / hose / fan to buy");
ok(!rows(bare, "Hardware: where").some((r) => /^(Tool Mount|Jackpot3 Fan)/.test(r[2])), "their fasteners gone");
const m5 = kitRow(all, "M5 x 30 mm button head screw"), m5b = kitRow(bare, "M5 x 30 mm button head screw");
ok(m5[1] - m5b[1] === 7 && m5[2] - m5b[2] === 7, `kit: 7 fewer M5 (tool mount + dust shoe): ${m5} / ${m5b}`);
ok(kitRow(all, "M5 nylock nut")[1] - kitRow(bare, "M5 nylock nut")[1] === 7, "kit: 7 fewer M5 nylocks");
ok(!kitRow(bare, "M3 x 20 mm button head screw"), "kit: no M3 x 20 without the fan");
ok(/^177 fasteners/.test(bare.find((q) => q.title.startsWith("Hardware: where")).note),
   "where note recounted (186 - 6 tool mount - 1 dust shoe - 2 fan)");
const skirt = bomWith({ router: true, skirt: false, hose: true, fan: true });
ok(!rows(skirt, "Printed parts").some((r) => /^(Dust_Skirt|TPU_)/.test(r[1])) && rows(skirt, "Printed parts").some((r) => r[1] === "Dust_Shoe_Kobalt"),
  "no skirt: shoe stays");
const nohose = bomWith({ router: true, skirt: true, hose: false, fan: true });   // the shoe goes with the hose (user 2026-10-23)
ok(!rows(nohose, "Printed parts").some((r) => /^(Dust_|TPU_)/.test(r[1])) && rows(nohose, "Printed parts").some((r) => /^Tool_Mount/.test(r[1])),
  "no hose: no shoe / skirt / bristles, the tool mount stays");
const pend = bomWith({ router: true, skirt: true, hose: true, fan: true, pendant: true });
ok(rows(pend, "Printed parts").some((r) => r[1] === "stand") && rows(pend, "Buy: specialty").some((r) => /CrowPanel/.test(r[1])), "pendant rows");

console.log(`show_tree:${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
