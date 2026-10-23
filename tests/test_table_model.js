// table_model.js (Part 33) vs freecad/lr4.py table_parts: the Python's boxes (tests/table_golden.json, written by
// lr4.table_parts for the ref size + a 48 x 96, both tables) and, when there is one, the last build's build/table.json.
// Also: the half-lap slots line up, the parts don't overlap, the cut-list rows.
//   node tests/test_table_model.js
// After changing lr4.TABLE (and table_model.js TABLE to match), rewrite the golden from freecad/ with:
//   python -c "import lr4, json; ..."  - table_parts(kind, *size) for each case's size, rows [name, *box (3 dp), len(slots)]
"use strict";
const fs = require("fs"), path = require("path");
const TM = require("../web/js/table_model.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

const gold = JSON.parse(fs.readFileSync(path.join(__dirname, "table_golden.json"), "utf8"));
for (const [kind, cases] of Object.entries(gold)) {
  for (const { size, parts } of cases) {
    const js = TM.parts(kind, ...size);
    ok(js.length === parts.length, `${kind} ${size[0]}: ${js.length} parts, Python ${parts.length}`);
    for (const [name, ...rest] of parts) {
      const p = js.find((q) => q.name === name), box = rest.slice(0, 6), nslots = rest[6];
      ok(p && p.box.every((v, i) => near(v, box[i])) && p.slots.length === nslots,
        `${kind} ${size[0]} ${name}: ${p ? p.box.map((v) => v.toFixed(3)) : "missing"} vs ${box}`);
    }
  }
}
for (const f of ["build/table.json", "build/torsion/table.json"]) {
  const file = path.join(__dirname, "..", f);
  if (!fs.existsSync(file)) continue;
  const b = JSON.parse(fs.readFileSync(file, "utf8")), js = TM.parts(b.kind, b.TW, b.TL, b.xtable, b.ytable, ...b.cut, b.T);
  ok(js.length === b.parts.length && b.parts.every((p, i) => js[i].name === p.name && js[i].box.every((v, k) => near(v, p.box[k]))),
    `${f} (${b.kind}): same as the build`);
}

// the egg-crate: every crossing has a slot in both ribs, half the height each, so the ribs meet without overlapping
const tor = TM.parts("torsion", 1016, 1651, 953, 1583, 660.4, 1270);
const ry = tor.filter((p) => /^(TableRib_Y|RailEdge_)/.test(p.name)).sort((a, b) => a.box[0] - b.box[0]), rx = tor.filter((p) => p.name.startsWith("TableRib_X"));
ok(ry.length === 5 && rx.length === 6, `ref grid ${ry.length} x ${rx.length}`);
const gaps = ry.slice(1).map((p, i) => p.box[0] - ry[i].box[0]);
ok(Math.max(...gaps) <= TM.TABLE.grid + 1e-9, `rib spacing ${gaps.map((g) => g.toFixed(1))} <= 12 in`);
const inside = (s, x, y, z) => x > s[0] && x < s[3] && y > s[1] && y < s[4] && z > s[2] && z < s[5];
let crossings = 0, good = 0;
for (const a of ry) for (const b of rx) {
  crossings++;
  const x = (a.box[0] + a.box[3]) / 2, y = (b.box[1] + b.box[4]) / 2, h = TM.TABLE.rib_h;
  const top = a.slots.some((s) => inside(s, x, y, -h / 4)) && !a.slots.some((s) => inside(s, x, y, -3 * h / 4));
  const bot = b.slots.some((s) => inside(s, x, y, -3 * h / 4)) && !b.slots.some((s) => inside(s, x, y, -h / 4));
  if (top && bot) good++;
}
ok(good === crossings, `half-laps: ${good} of ${crossings} crossings slotted top (Y rib) + bottom (X rib)`);
// the box is the spoilboard's length; the rail strips run the table's full length, past its ends (user 2026-10-23)
const tsp = tor.find((p) => p.name === "Spoilboard").box, tst = tor.find((p) => p.name === "RailStrip_Min").box;
ok(ry.slice(1, -1).every((p) => p.box[1] === tsp[1] && p.box[4] === tsp[4]) && ry[0].name === "RailEdge_Min" && ry[0].box[1] === 0 && ry[4].box[4] === 1651 && tst[1] < tsp[1] - 100 && tst[4] > tsp[4] + 100 &&
  near(rx[0].box[1], tsp[1]) && near(rx[rx.length - 1].box[4], tsp[4]), `box ${tsp[1].toFixed(1)}..${tsp[4].toFixed(1)}, strips 0..${tst[4]}`);
// strips / spoilboard side by side at z 0..T, the base under them; the spoilboard covers the cutting area
const sh = TM.parts("sheet", 1016, 1651, 953, 1583, 660.4, 1270), by = Object.fromEntries(sh.map((p) => [p.name, p.box]));
ok(by.RailStrip_Min[3] < by.Spoilboard[0] && by.Spoilboard[3] < by.RailStrip_Max[0], "strip | spoilboard | strip, with gaps");
// the bit's travel at the ref (build/travel.json from the parked tool at 508, 635): x 187.91..850, y 144.47..1416. Every
// edge past it by more than a 1/4" bit's radius and less than a 3/4" bit's (user 2026-10-23)
const reach = [187.91, 144.47, 850, 1416], past = [reach[0] - by.Spoilboard[0], reach[1] - by.Spoilboard[1], by.Spoilboard[3] - reach[2], by.Spoilboard[4] - reach[3]];
ok(past.every((d) => d > 0.125 * 25.4 && d < 0.375 * 25.4), `spoilboard past the bit's travel: ${past.map((d) => d.toFixed(2))} mm`);
ok(by.TableBase[5] === 0 && by.Spoilboard[2] === 0 && near(by.Spoilboard[5], 19.05), "base below 0, work surface 0..T");
// a narrow machine: the spoilboard is held off the strips
const tiny = TM.parts("sheet", 600, 900, 537, 832, 254, 520), t = Object.fromEntries(tiny.map((p) => [p.name, p.box]));
ok(t.Spoilboard[0] >= t.RailStrip_Min[3] + TM.TABLE.spoil_gap - 1e-9 && t.Spoilboard[3] <= t.RailStrip_Max[0] - TM.TABLE.spoil_gap + 1e-9,
  `small size: spoilboard ${t.Spoilboard[0].toFixed(1)}..${t.Spoilboard[3].toFixed(1)} between the strips`);
// cut list rows
const r1 = TM.rows("sheet", sh), r2 = TM.rows("torsion", tor);
ok(r1.length === 4 && r1[0][3] === "26.5625 x 50.5625 in" && r1[3][1] === "Table sheet" && r1[3][3] === "40 x 65 in", JSON.stringify(r1.map((r) => r[3])));
const rr = (n) => r2.find((r) => r[1] === n) || [];
ok(r2.length === 6 && rr("Rail side board")[0] === 2 && rr("Rail side board")[3] === "3.5 x 65 in" && rr("Torsion box rib, along Y")[0] === 3 && rr("Torsion box rib, along Y")[3] === "3.5 x 50.5625 in" && rr("Torsion box rib, along X")[0] === 6 && rr("Torsion box rib, along X")[3] === "3.5 x 40 in" &&
  /6 half-lap slots from the top/.test(rr("Torsion box rib, along Y")[4]), JSON.stringify(r2.slice(3)));
ok(r2.every((r) => TM.NAMES.test(r[1])) && TM.NAMES.test("Table top"), "row names match NAMES");

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
