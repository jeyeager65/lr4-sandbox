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
ok(tree.asms.map((a) => a.id).join() === "table,yz-min,yz-max,beam,core,router,hose,electronics,pendant", "assemblies " + tree.asms.map((a) => a.id));

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

// My machine options on the BOM (config_model.js bomOptions, on the reference BOM)
const M = require("../web/js/config_model.js");
const bomWith = (opt) => M.bomOptions(JSON.parse(JSON.stringify(cfg.bom_ref)), opt);
const rows = (secs, t) => secs.find((q) => q.title.startsWith(t)).rows;
const kitRow = (secs, item) => rows(secs, "Hardware: V1E kit").find((r) => r[3] === item);
const all = bomWith({ router: true, skirt: true, hose: true, fan: true, pendant: false });
ok(JSON.stringify(all) === JSON.stringify(cfg.bom_ref), "all fitted = the reference BOM");
const bare = bomWith({ router: false, skirt: true, hose: false, fan: false, pendant: false });
ok(!rows(bare, "Printed parts").some((r) => /^(Dust_|Tool_Mount|TPU_)/.test(r[1])), "no router: no mount / shoe / skirt prints");
ok(!rows(bare, "Buy: specialty").some((r) => /router|Fulton|blower|Wire sleeve/i.test(r[1])), "no router / hose / fan to buy");
ok(!rows(bare, "Hardware: where").some((r) => /^(Tool Mount|Jackpot3 Fan)/.test(r[2])), "their fasteners gone");
const m5 = kitRow(all, "M5 x 30 mm button head screw"), m5b = kitRow(bare, "M5 x 30 mm button head screw");
ok(m5[1] - m5b[1] === 6 && m5[2] - m5b[2] === 6, `kit: 6 fewer M5 (tool mount): ${m5} / ${m5b}`);
ok(kitRow(all, "M5 nylock nut")[1] - kitRow(bare, "M5 nylock nut")[1] === 6, "kit: 6 fewer M5 nylocks");
ok(!kitRow(bare, "M3 x 20 mm button head screw"), "kit: no M3 x 20 without the fan");
ok(/^177 fasteners/.test(bare.find((q) => q.title.startsWith("Hardware: where")).note), "where note recounted (185 - 6 tool mount - 2 fan)");
const skirt = bomWith({ router: true, skirt: false, hose: true, fan: true });
ok(!rows(skirt, "Printed parts").some((r) => /^(Dust_Skirt|TPU_)/.test(r[1])) && rows(skirt, "Printed parts").some((r) => r[1] === "Dust_Shoe_Kobalt"),
  "no skirt: shoe stays");
const pend = bomWith({ router: true, skirt: true, hose: true, fan: true, pendant: true });
ok(rows(pend, "Printed parts").some((r) => r[1] === "stand") && rows(pend, "Buy: specialty").some((r) => /CrowPanel/.test(r[1])), "pendant rows");

console.log(`show_tree:${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
