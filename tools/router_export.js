// The page's default router for the FreeCAD model (Part 45b step 4, user 2026-10-29: "FreeCAD gets a generated
// default router" - the default preset's meshes from js/router_body.js, so the model and the page match). Writes one
// binary STL per part (router frame: mm, z up from the collet nut's bottom, +x = the switch end) + router.json
// { name, label, parts: { mesh name: { file, c, f } }, cord: { tip, dir }, top } to the out folder. freecad/build.py
// runs it (build/router/) and places them on the mount (lr4.ROUTER). Leaves out what's inside the nut (collet, thread)
// and the rocker's off state.
//   node tools/router_export.js [out dir] [router id]
"use strict";
const fs = require("fs");
const path = require("path");
const R = require("../web/js/routers.js");
const B = require("../web/js/router_body.js");

const out = path.resolve(process.argv[2] || path.join(__dirname, "..", "build", "router"));
const id = process.argv[3] || R.DEFAULTS.router;
const r = R.ROUTERS[id];
if (!r) { console.error(`unknown router ${id}`); process.exit(1); }
// the page's mesh names (js/page/router.js RT_MESH)
const NAMES = { collet_nut: "Router_ColletNut", shaft: "Router_Shaft", bearing_cap: "Router_BearingCap", housing: "Router_Housing",
  collar: "Router_Collar", transition: "Router_Transition", motor_cap: "Router_MotorCap", dial: "Router_Dial", switch: "Router_Switch",
  shaft_lock: "Router_ShaftLock", strain_relief: "Router_StrainRelief", cord: "Router_Cord", trim: "Router_Trim" };

function stl(m) {                                    // binary STL, normals from the winding
  const n = m.idx.length / 3, buf = Buffer.alloc(84 + n * 50);
  buf.write("lr4-sandbox router_export", 0);
  buf.writeUInt32LE(n, 80);
  for (let t = 0; t < n; t++) {
    const p = [0, 1, 2].map((k) => m.pos.slice(m.idx[t * 3 + k] * 3, m.idx[t * 3 + k] * 3 + 3));
    const u = [0, 1, 2].map((k) => p[1][k] - p[0][k]), v = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
    let c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...c) || 1;
    c = c.map((x) => x / l);
    const o = 84 + t * 50;
    [...c, ...p[0], ...p[1], ...p[2]].forEach((x, i) => buf.writeFloatLE(x, o + i * 4));
  }
  return buf;
}
fs.mkdirSync(out, { recursive: true });
const built = B.build(r.model), parts = {};
for (const [k, name] of Object.entries(NAMES)) {
  const m = built.parts[k];
  if (!m || !m.idx.length) continue;
  const file = name + ".stl", L = r.model.looks[k] || r.model.looks.trim;
  fs.writeFileSync(path.join(out, file), stl(m));
  parts[name] = { file, c: L.c, f: L.f };
}
const info = { id, name: r.name, label: r.model.label, parts, cord: built.cord, top: B.overall(r.model), collet_nut: r.model.collet_nut };
fs.writeFileSync(path.join(out, "router.json"), JSON.stringify(info, null, 1) + "\n");
console.log(`router_export: ${r.name} -> ${out} (${Object.keys(parts).length} parts)`);
