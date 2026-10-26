// Filaments (Part 40): the spools (material + color), which printed part is on which spool, the presets, the printed
// look's settings (layer height, bed face, on / off) and the strut plates' material - all visual only.
// Plain JS, no THREE: panel.js turns a spool into a material; tests/test_filaments.js.
// State: { preset (the built-in whose rule places the parts), saved (the name of the user's preset it came from, or null),
//   spools: [{ mat, color }], parts: { meshName: spoolIndex }, layer, bed, look, plates: { front, bottom } }
//   (a plate: { mat, color, paint: "#rrggbb" | null } - paint: its face painted, cuts show the material)
// The built-in presets (and the user's saved ones) are starting points: change a spool or a part and it's "edited".
(function (root) {
  "use strict";
  // the look of each material (rough = roughness, clear = clearcoat, rim = thin-edge glow (translucency), fiber:
  // 0 none, 1 carbon (dark specks), 2 glass (light specks))
  const MATERIALS = {
    PLA: { rough: 0.42, clear: 0.0, rim: 0.0, fiber: 0 },
    PETG: { rough: 0.20, clear: 0.45, rim: 0.22, fiber: 0 },
    "PET-CF": { rough: 0.90, clear: 0.0, rim: 0.0, fiber: 1 },
    "PET-GF": { rough: 0.72, clear: 0.0, rim: 0.0, fiber: 2 },
    "PC-CF": { rough: 0.82, clear: 0.0, rim: 0.0, fiber: 1 },
    "PC-GF": { rough: 0.66, clear: 0.0, rim: 0.0, fiber: 2 },
    TPU: { rough: 0.62, clear: 0.0, rim: 0.08, fiber: 0 }};
  const NAMES = Object.keys(MATERIALS);
  // common filament colors (the color pickers' suggestions; any color works)
  const PALETTE = [["Black", "#292a2e"], ["White", "#ecebe6"], ["Gray", "#8a8d91"], ["Silver", "#b9bdc1"], ["Red", "#cc1f1a"],
    ["Orange", "#e8661c"], ["Yellow", "#f3c22f"], ["Green", "#2f8f46"], ["Blue", "#1f5fbf"], ["Purple", "#6b3fa0"],
    ["Pink", "#f08cb4"], ["Magenta", "#c8287a"], ["Teal", "#1f8f8f"], ["Brown", "#6e4a2f"], ["Natural", "#e4d9bf"], ["Carbon", "#2a2a2c"]];
  const MAIN = "#292a2e", ACCENT = "#cc1f1a", FIBER = "#2a2a2c";
  const TPU_PART = /^Bristles_TPU/;                   // always TPU, in its data color, never on a spool
  const MOUNTS = /^Tool_Mount_[TB]_/;                 // the router mounts: "commonly PETG but can be PLA" (user)
  const PETER_T = /^PeterPlate_T_/, PETER_B = /^PeterPlate_B_/;   // classic look (user): top Peter Plate black, bottom red
  const classicRole = (p) => (PETER_T.test(p.name) ? 0 : PETER_B.test(p.name) ? 1 : p.role === "accent" ? 1 : 0);
  const FIBER_PARTS = /^(Core|YZ_Plate_M(in|ax)|Tool_Mount_[TB]_.*)$/;   // + the two outer braces (by position)
  // a preset: its spools and a rule (part -> spool index). part: { name, role ("main" / "accent"), outer (an end brace) }
  const PRESETS = {
    classic: { label: "V1E classic", spools: [["PLA", MAIN], ["PLA", ACCENT], ["PETG", ACCENT]],
      rule: (p) => (MOUNTS.test(p.name) ? 2 : classicRole(p)) },
    single: { label: "Single color", spools: [["PLA", MAIN]], rule: () => 0 },
    fiber: { label: "Fiber upgrade", spools: [["PLA", MAIN], ["PLA", ACCENT], ["PET-CF", FIBER]],
      rule: (p) => (FIBER_PARTS.test(p.name) || p.outer ? 2 : classicRole(p)) }};
  // the strut plates (Part 40: visual only): material -> default color, roughness, wood grain, see-through
  const PLATES = {
    mdf: { label: "MDF", color: "#a7865f", rough: 0.88 },
    hardboard: { label: "Hardboard", color: "#5b3e28", rough: 0.55 },
    plywood: { label: "Plywood", color: "#dbad70", rough: 0.75, grain: "ply" },
    acrylic: { label: "Acrylic", color: "#e8eef0", rough: 0.06, opacity: 0.55 }};
  const LAYER = { min: 0.08, max: 0.6, def: 0.2, presets: [[0.12, 0.4], [0.2, 0.4], [0.28, 0.4], [0.3, 0.6], [0.4, 0.6]] };
  const HEX = /^#[0-9a-f]{6}$/i;

  function hsl(hex) {                                 // -> [hue deg, saturation, lightness] (0..1)
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
  }
  function colorName(hex) {                           // the nearest palette name (people don't read hex): hue counts as
    const c = hsl(hex);                               // much as both colors are saturated (grays have no real hue)
    let best = null, bd = Infinity;
    for (const [name, h] of PALETTE) {
      if (name === "Carbon") continue;                // a near-black: "Black" reads better
      const q = hsl(h), dh = Math.min(Math.abs(c[0] - q[0]), 360 - Math.abs(c[0] - q[0])) / 180;
      const d = (dh * 3 * Math.min(c[1], q[1])) ** 2 + (c[1] - q[1]) ** 2 + ((c[2] - q[2]) * 1.5) ** 2;
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function filamentName(s, i) {                      // "Black PLA"; a number only when two would share a name
    const nm = (j) => `${colorName(s.spools[j].color)} ${s.spools[j].mat}`, me = nm(i);
    const same = s.spools.map((_, j) => j).filter((j) => nm(j) === me);
    return same.length > 1 ? `${me} ${same.indexOf(i) + 1}` : me;
  }
  function defaults() {
    return { preset: "classic", saved: null, spools: PRESETS.classic.spools.map(([mat, color]) => ({ mat, color })), parts: {},
      layer: LAYER.def, bed: "pei", look: "auto",
      plates: { front: { mat: "mdf", color: PLATES.mdf.color, paint: null }, bottom: { mat: "mdf", color: PLATES.mdf.color, paint: null } } };
  }
  // anything stored / linked -> a valid state (unknown bits dropped, the rest defaulted)
  function clean(s) {
    const d = defaults();
    if (!s || typeof s !== "object") return d;
    const out = { preset: PRESETS[s.preset] ? s.preset : d.preset };
    out.saved = typeof s.saved === "string" && s.saved ? s.saved.slice(0, 40) : null;
    const sp = Array.isArray(s.spools) ? s.spools.filter((x) => x && MATERIALS[x.mat] && HEX.test(x.color)).slice(0, 12) : [];
    out.spools = sp.length ? sp.map((x) => ({ mat: x.mat, color: x.color.toLowerCase() })) : d.spools;
    out.parts = {};
    if (s.parts && typeof s.parts === "object")
      for (const [k, v] of Object.entries(s.parts)) if (Number.isInteger(v) && v >= 0 && v < out.spools.length) out.parts[k] = v;
    out.layer = +s.layer >= LAYER.min && +s.layer <= LAYER.max ? +s.layer : d.layer;
    out.bed = s.bed === "smooth" ? "smooth" : "pei";
    out.look = ["on", "off"].includes(s.look) ? s.look : "auto";
    out.plates = {};
    for (const k of ["front", "bottom"]) {
      const p = s.plates && s.plates[k];
      out.plates[k] = p && PLATES[p.mat] ? { mat: p.mat, color: HEX.test(p.color) ? p.color.toLowerCase() : PLATES[p.mat].color,
        paint: HEX.test(p.paint || "") ? p.paint.toLowerCase() : null } : d.plates[k];
    }
    return out;
  }
  function setPreset(s, name) {                       // the preset's spools, overrides cleared
    const p = PRESETS[name] || PRESETS.classic;
    return Object.assign({}, s, { preset: PRESETS[name] ? name : "classic", saved: null, spools: p.spools.map(([mat, color]) => ({ mat, color })), parts: {} });
  }
  // ---- the user's presets: [{ name, preset (the built-in rule), spools, parts }], kept in this browser ----
  const copy = (o) => JSON.parse(JSON.stringify(o));
  function cleanSaved(list) {
    if (!Array.isArray(list)) return [];
    return list.filter((p) => p && typeof p.name === "string" && p.name.trim()).slice(0, 30).map((p) => {
      const c = clean({ preset: p.preset, spools: p.spools, parts: p.parts });
      return { name: p.name.trim().slice(0, 40), preset: c.preset, spools: c.spools, parts: c.parts };
    });
  }
  function sourceOf(s, saved) {                       // what s started from: its saved preset, else its built-in
    const m = s.saved && saved.find((p) => p.name === s.saved);
    return m ? { label: m.name, spools: m.spools, parts: m.parts }
      : { label: PRESETS[s.preset].label, spools: PRESETS[s.preset].spools.map(([mat, color]) => ({ mat, color })), parts: {} };
  }
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  function edited(s, saved) {                         // changed since its preset (spools or parts)?
    const src = sourceOf(s, saved), sp = (l) => JSON.stringify(l.map((x) => [x.mat, x.color.toLowerCase()]));
    return sp(src.spools) !== sp(s.spools) || sorted(src.parts) !== sorted(s.parts);
  }
  function useSaved(s, p) { return Object.assign({}, s, { preset: p.preset, saved: p.name, spools: copy(p.spools), parts: copy(p.parts) }); }
  function resetTo(s, saved) {                        // back to what it started from
    const m = s.saved && saved.find((p) => p.name === s.saved);
    return m ? useSaved(s, m) : setPreset(s, s.preset);
  }
  function saveAs(saved, s, name) {                   // -> [the new list, s now from that preset]
    const p = { name: name.trim().slice(0, 40), preset: s.preset, spools: s.spools.map((x) => ({ mat: x.mat, color: x.color.toLowerCase() })), parts: copy(s.parts) };
    return [[...saved.filter((x) => x.name !== p.name), p], Object.assign({}, s, { saved: p.name })];
  }
  function removeSpool(s, i) {                        // its parts go back to the rule; later overrides shift down
    if (s.spools.length <= 1) return s;
    const parts = {};
    for (const [k, v] of Object.entries(s.parts)) if (v !== i) parts[k] = v > i ? v - 1 : v;
    return Object.assign({}, s, { spools: s.spools.filter((_, j) => j !== i), parts });
  }
  // parts: [{ name, role, cx }] (the printed parts on show) -> Map name -> spool index (-1 = TPU, its own look).
  // The outer braces = the Brace_* with the lowest and highest cx (any size).
  function assign(parts, s) {
    const br = parts.filter((p) => /^Brace_/.test(p.name)).sort((a, b) => a.cx - b.cx);
    const outer = new Set(br.length ? [br[0].name, br[br.length - 1].name] : []);
    const rule = (PRESETS[s.preset] || PRESETS.classic).rule, n = s.spools.length, out = new Map();
    for (const p of parts) {
      if (TPU_PART.test(p.name)) { out.set(p.name, -1); continue; }
      const o = s.parts[p.name];
      out.set(p.name, Number.isInteger(o) && o < n ? o : Math.min(rule(Object.assign({ outer: outer.has(p.name) }, p)), n - 1));
    }
    return out;
  }
  const lookOn = (s, lite) => (s.look === "auto" ? !lite : s.look === "on");

  // ---- the share link: only what differs from the defaults. spools=PLA_292a2e~PETG_cc1f1a, parts=Core.3~Brace_1.3
  // (1-based), preset=fiber, layer=0.28, bed=smooth, look=off, plates=mdf_a7865f~acrylic_e8eef0 (painted: mdf_a7865f!202020) ----
  function toLink(s) {
    const d = defaults(), q = {}, sp = (x) => `${x.mat}_${x.color.slice(1)}`;
    if (s.preset !== d.preset) q.preset = s.preset;
    const p0 = setPreset(d, s.preset).spools.map(sp).join("~"), now = s.spools.map(sp).join("~");
    if (now !== p0) q.spools = now;
    const ov = Object.entries(s.parts).map(([k, v]) => `${k}.${v + 1}`);
    if (ov.length) q.parts = ov.join("~");
    if (s.layer !== d.layer) q.layer = String(s.layer);
    if (s.bed !== d.bed) q.bed = s.bed;
    if (s.look !== d.look) q.look = s.look;
    const plt = (p) => `${p.mat}_${p.color.slice(1)}${p.paint ? "!" + p.paint.slice(1) : ""}`;
    const pl = ["front", "bottom"].map((k) => plt(s.plates[k])).join("~");
    if (pl !== ["front", "bottom"].map((k) => plt(d.plates[k])).join("~")) q.plates = pl;
    return q;
  }
  function fromLink(o) {                              // the link's keys -> a state (null if it has none of them)
    if (!["preset", "spools", "parts", "layer", "bed", "look", "plates"].some((k) => o[k] !== undefined)) return null;
    let s = setPreset(defaults(), o.preset);
    const pair = (t) => { const i = t.lastIndexOf("_"); return [t.slice(0, i), "#" + t.slice(i + 1)]; };
    if (o.spools) s.spools = o.spools.split("~").map(pair).map(([mat, color]) => ({ mat, color }));
    if (o.parts) for (const t of o.parts.split("~")) { const i = t.lastIndexOf("."); s.parts[t.slice(0, i)] = parseInt(t.slice(i + 1), 10) - 1; }
    if (o.layer) s.layer = parseFloat(o.layer);
    if (o.bed) s.bed = o.bed;
    if (o.look) s.look = o.look;
    if (o.plates) {
      const one = (t) => { const [m, pt] = t.split("!"), [mat, color] = pair(m); return { mat, color, paint: pt ? "#" + pt : null }; };
      const [f, b] = o.plates.split("~").map(one);
      s.plates = { front: f, bottom: b };
    }
    return clean(s);
  }

  const api = { MATERIALS, NAMES, PALETTE, colorName, filamentName, cleanSaved, sourceOf, edited, useSaved, resetTo, saveAs, PRESETS, PLATES, LAYER, TPU_PART, defaults, clean, setPreset, removeSpool, assign,
    lookOn, toLink, fromLink };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Filaments = api;
})(typeof self !== "undefined" ? self : this);
