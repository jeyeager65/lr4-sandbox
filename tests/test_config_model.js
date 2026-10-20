// The configurator's machine vs the FreeCAD builds, part by part:
//   python pipeline/fit_config.py && node tests/test_config_model.js
// For every size build (private/sizes/<tag>/summary.json, written by fit_config.py) the page's model
// (config_model.js + web/data/lr4_config.json) must produce exactly the build's parts, each within TOL:
// rigid parts by centroid, stretched parts by bounding box. Also checks the hose anchors and travel.
"use strict";
const fs = require("fs"), path = require("path");
const M = require("../web/js/config_model.js");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "data", "lr4_config.json"), "utf8"));
const SIZES = path.join(__dirname, "..", "private", "sizes");
const TOL = 0.05;
const TOL_BELT = 0.15;      // stretched belt runs: their bbox ends move with where the teeth fall
const sizes = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "data", "sizes.json"), "utf8"));

let fails = 0;
for (const [tag, [cx, cy]] of Object.entries(sizes)) {
  const f = path.join(SIZES, tag, "summary.json");
  if (!fs.existsSync(f)) { console.log(`skip ${tag}: no build`); continue; }
  const act = JSON.parse(fs.readFileSync(f, "utf8"));
  const S = M.size(cx * M.IN, cy * M.IN);
  const inst = M.instances(cfg, S), got = new Map(inst.map((o) => [o.name, o]));
  const want = Object.keys(act).filter((n) => !/^StrutPlate_(Front|Bottom)$/.test(n));
  const missing = want.filter((n) => !got.has(n)), extra = [...got.keys()].filter((n) => !(n in act));
  let worst = 0, worstName = "", bad = [];
  for (const n of want) {
    const o = got.get(n);
    if (!o) continue;
    const a = act[n], r = o.rec;
    let d;
    if (r.kind === "rigid") {
      const c = r.c_ref.map((v, k) => v + o.t[k]);
      d = Math.max(...c.map((v, k) => Math.abs(v - a.c[k])));
    } else {
      const lo = r.lo_ref.map((v, k) => v * o.s[k] + o.t[k]), hi = r.hi_ref.map((v, k) => v * o.s[k] + o.t[k]);
      d = Math.max(...lo.map((v, k) => Math.abs(v - a.lo[k])), ...hi.map((v, k) => Math.abs(v - a.hi[k])));
    }
    if (d > worst) { worst = d; worstName = n; }
    if (d > (r.kind === "stretch" && /^Belt_/.test(n) ? TOL_BELT : TOL)) bad.push(`${n} ${d.toFixed(3)}`);
  }
  for (const w of ["StrutPlate_Front", "StrutPlate_Bottom"]) {     // plate frames: bbox corner
    const m = M.plateFrame(cfg, w, S), fr = cfg.plate_frames[w];
    const rec = cfg.parts.find((p) => p.key === w);
    const d = Math.max(Math.abs(m[3] - fr.m[3] - (act[w].lo[0] - rec.c_ref[0])),
      Math.abs(m[7] - fr.m[7] - (act[w].lo[1] - rec.c_ref[1])), Math.abs(m[11] - fr.m[11] - (act[w].lo[2] - rec.c_ref[2])));
    if (d > TOL) bad.push(`${w} frame ${d.toFixed(3)}`);
  }
  // hose / cord / sleeve anchors vs the build's hose.json, every number
  const hf = path.join(SIZES, tag, "LowRider4", "build", "hose.json");
  if (fs.existsSync(hf)) {
    const real = JSON.parse(fs.readFileSync(hf, "utf8")), mine = M.hose(cfg, S, inst);
    const walk = (a, b, p) => {
      if (typeof a === "number") { if (typeof b !== "number" || Math.abs(a - b) > TOL) bad.push(`hose ${p} ${a} vs ${b}`); return; }
      if (a && typeof a === "object") for (const k of Object.keys(a)) walk(a[k], b == null ? undefined : b[k], `${p}.${k}`);
    };
    walk(real, mine, "");
  }
  // BOM: the page's (LR4Model.bom) vs the build's bom.json, cell by cell. Allowed to differ: how the EMT sticks are
  // described, the hose length note, and which brace / carriage a fastener row is named after (rows matched by key).
  const bf = path.join(SIZES, tag, "LowRider4", "build", "bom.json");
  const realBom = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, "utf8")) : null;
  const checks = realBom ? realBom.find((q) => q.title.startsWith("Hardware: where")).rows.filter((r) => String(r[6]).startsWith("CHECK")) : [];
  if (checks.length) console.log(`     (${tag}: build flagged ${checks.map((r) => r[2]).join("; ")}: BOM not compared)`);
  if (realBom && !checks.length) {
    const real = realBom, mine = M.bom(cfg, S, inst.map((o) => o.name));
    const norm = (v) => typeof v === "number" ? +v.toFixed(3) : String(v).replace(/\d+/g, "#");
    for (const rs of real) {
      const ms = mine.find((q) => q.title === rs.title);
      if (!ms) { bad.push(`BOM section missing: ${rs.title}`); continue; }
      const where = rs.title.startsWith("Hardware: where");
      const col = { "V1E calculator": 0, "Hardware: V1E kit vs this build": 3 }[rs.title] ?? 1;
      const key0 = (r) => where ? JSON.stringify([r[1], norm(r[2].replace("Brace Max", "Brace 0")), r[5]]) : JSON.stringify(r[col]);
      const keyed = (rows) => { const seen = {}; return rows.map((r, i) => {
        if (rs.title === "Model notes") return [String(i), r];
        const k = key0(r); seen[k] = (seen[k] ?? -1) + 1; return [`${k}|${seen[k]}`, r]; }); };
      const mrows = new Map(keyed(ms.rows));
      const key = ((m) => (r) => m.get(r))(new Map(keyed(rs.rows).map(([k, r]) => [r, k])));
      if (ms.rows.length !== rs.rows.length) bad.push(`BOM ${rs.title}: ${ms.rows.length} rows, build has ${rs.rows.length}`);
      for (const r of rs.rows) {
        const m = mrows.get(key(r));
        if (!m) { bad.push(`BOM ${rs.title}: no row ${key(r).slice(0, 80)}`); continue; }
        r.forEach((v, i) => {
          if (rs.title.startsWith("Buy / cut") && r[1] === "(EMT to buy)" && i === 4) return;
          if (rs.title === "Model notes" && /^Vacuum hose/.test(v)) return;
          if (where && i >= 2 && i !== 5) return;        // joint / head / nut / check text: the reference build's
          const same = typeof v === "number" ? Math.abs(v - m[i]) < 0.05 : String(v) === String(m[i]);
          if (!same) bad.push(`BOM ${rs.title}: ${JSON.stringify(v)} vs ${JSON.stringify(m[i])}`);
        });
      }
      if (rs.note !== ms.note && !rs.title.startsWith("Hardware: where")) bad.push(`BOM note ${rs.title}`);
    }
  }
  const ok = !missing.length && !extra.length && !bad.length;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${tag} (${cx} x ${cy} in, strut ${S.strut}, ${S.n} braces): ${want.length} parts, ` +
    `worst ${worst.toFixed(4)} mm (${worstName})` +
    (missing.length ? `\n     missing: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? " ..." : ""}` : "") +
    (extra.length ? `\n     extra: ${extra.slice(0, 12).join(", ")}${extra.length > 12 ? " ..." : ""}` : "") +
    (bad.length ? `\n     off: ${bad.slice(0, 12).join("; ")}` : ""));
}
// config.yaml: only axes x / y max_travel_mm change (laid out like V1E's JP3_LR file: nested keys, comments, a
// commented-out axis, a max_travel_mm outside axes)
{
  const yaml = ["board: Jackpot3", "axes:", "  shared_stepper_disable_pin: NO_PIN", "  x:", "    steps_per_mm: 50.000",
    "    max_travel_mm: 1220", "    homing:", "      cycle: 2", "    #X", "    motor0:", "      pulloff_mm: 4.000", "  y:",
    "    max_travel_mm: 2440 # 8 ft", "  z:", "    max_travel_mm: 150.000", "#  c:", "#    max_travel_mm: 300.000",
    "other:", "  max_travel_mm: 5"].join("\n");
  const S = M.size(24.5 * M.IN, 45 * M.IN), r = M.fluidncConfig(yaml, cfg, S, "note");
  const out = r.text.split("\n"), body = out.slice(2), diff = yaml.split("\n").map((l, i) => l === body[i] ? null : [l, body[i]]).filter(Boolean);
  const ok = out.length === yaml.split("\n").length + 2 && diff.length === 2 && body[5] === "    max_travel_mm: 622.3"
    && body[12] === "    max_travel_mm: 1143.0" && out[1] === "# note";
  let bad = false;
  try { M.fluidncConfig("axes:\n  z:\n    max_travel_mm: 150\n", cfg, S); } catch (e) { bad = true; }
  if (!ok || !bad) fails++;
  console.log(`${ok && bad ? "ok  " : "FAIL"} config.yaml: ${diff.length} lines changed (${diff.map((d) => d[1].trim()).join(", ")}), no-x/y file ${bad ? "refused" : "accepted"}`);
}
console.log(fails ? `${fails} check(s) failed` : "all sizes match, config.yaml ok");
process.exit(fails ? 1 : 0);
