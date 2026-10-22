// The Show tab's tree (Part 26): every part drawn, filed as assembly > kind > part, with stable ids a script can use
// (Part 29's (Video Show: ...)). Assembly from the part's group, with a few moves: belts go with what they ride on (Y
// belts: table, X belt: beam), the router + its mount + dust shoe come out of Core. Kind from the source (printed / cut /
// hardware) plus electronics by name. Bolts and screws (names "A__M5_to_B", the hardware's joints) are filed under the
// assemblies of both parts they join: listed under both, drawn if either is shown. Ids: assembly "beam", kind
// "beam.hardware", part = the mesh name (a thread "X~thread" follows X). Visibility = a set of ids turned off.
// Pure (no THREE / DOM): tests/test_show_tree.js.
(function (root) {
  "use strict";
  const ASM = [["table", "Table + Y rail"], ["yz-min", "YZ Min side"], ["yz-max", "YZ Max side"], ["beam", "Beam"],
    ["core", "Core"], ["router", "Router + dust shoe"], ["hose", "Vacuum hose + cables"],
    ["electronics", "Electronics + switches"], ["pendant", "FluidTouch pendant"]];
  const KINDS = [["printed", "Printed"], ["cut", "Cut"], ["hardware", "Hardware"], ["electronics", "Electronics"]];
  const GROUP_ASM = { Table: "table", YZ_Min: "yz-min", YZ_Max: "yz-max", Beam: "beam", Core: "core", Shoe: "router",
    Hose: "hose", Electronics: "electronics", Pendant: "pendant" };
  const MOTION_ASM = { table: "table", gantry: "beam", beam: "beam", core: "core", hose: "hose" };   // a bolt nothing else places
  const ROUTER = /^(Router_|Tool_Mount_|Dust_Shoe|Dust_Skirt|Bristles_TPU)/;
  const ELEC = /(^|_)(Stepper|Endstop)|^PSU|^Jackpot3_(Fan|Board)|^TouchPlate_Wire|^Pendant_screen/;
  const FRAME = ["table", "yz-min", "yz-max", "beam"];
  const PRESETS = [["all", "All"], ["no-hardware", "No hardware"], ["printed", "Printed parts only"], ["frame", "Frame only"]];

  const isBolt = (p) => p.name.includes("__");
  const partId = (p) => p.name.replace(/~thread$/, "");   // not p.of: some threads name a merged screw set
  function asmOf(p) {                                 // a part that isn't a bolt
    if (p.group === "Belts") return /^Belt_X/.test(p.name) ? "beam" : "table";
    if (p.group === "Core" && ROUTER.test(p.name)) return "router";
    return GROUP_ASM[p.group] || MOTION_ASM[p.motion] || "beam";
  }
  function kindOf(p) {
    if (isBolt(p)) return "hardware";
    if (ELEC.test(p.name)) return "electronics";
    if (p.source === "printed" || (p.source === "pendant" && p.role)) return "printed";
    return p.source === "made" ? "cut" : "hardware";
  }
  function boltLabel(p) {                             // "XZ Plate Min  M3 to Brace 1" -> "XZ Plate Min · M3 to Brace 1"
    const [a, r] = String(p.label || p.name).split(/\s{2,}/);
    return r ? `${a} · ${r.replace(/\bM2 5\b/, "M2.5")}` : a;
  }

  // parts: [{ name, label, group, source, motion, of, role }] (the meshes' userData) ->
  // { asms: [{ id, label, n, kinds: [{ id, kind, label, n, parts: [{ id, label, n }] }] }], place: { partId: [[asm, kind]] } }
  // (n = parts, threads not counted; a bolt counts in each assembly it's listed under)
  function build(parts) {
    const byName = new Map();                         // non-bolt part name -> assembly
    for (const p of parts) if (!isBolt(p) && !p.of) byName.set(p.name, asmOf(p));
    const names = [...byName.keys()];
    const resolve = (x) => {                          // a joint's part name -> its assembly
      if (!x) return null;
      if (byName.has(x)) return byName.get(x);
      const sub = names.find((n) => n.startsWith(x + "_"));          // "Bearing_Core" -> Bearing_Core_Lower_1
      if (sub) return byName.get(sub);
      const sup = names.filter((n) => x.startsWith(n + "_")).sort((a, b) => b.length - a.length)[0];   // "MGN12H_Max_177"
      return sup ? byName.get(sup) : null;
    };
    const place = {}, rows = {};
    for (const p of parts) {
      if (p.of) continue;
      const kind = kindOf(p);
      let asms = [asmOf(p)];
      if (isBolt(p)) {
        const a = p.name.split("__")[0], b = (/_to_(.+)$/.exec(p.name.slice(a.length + 2)) || [])[1];
        asms = [...new Set([resolve(a), resolve(b)].filter(Boolean))];
        if (!asms.length) asms = [MOTION_ASM[p.motion] || "beam"];
      }
      const id = partId(p);
      if (!place[id]) place[id] = [];
      for (const a of asms) {
        if (place[id].some(([x]) => x === a)) { rows[a + "." + kind].get(id).n++; continue; }
        place[id].push([a, kind]);
        const k = rows[a + "." + kind] = rows[a + "." + kind] || new Map();
        k.set(id, { id, label: isBolt(p) ? boltLabel(p) : p.label || p.name, n: 1 });
      }
    }
    const asms = [];
    for (const [id, label] of ASM) {
      const kinds = [];
      for (const [kind, kl] of KINDS) {
        const k = rows[id + "." + kind];
        if (!k) continue;
        const ps = [...k.values()].sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
        kinds.push({ id: id + "." + kind, kind, label: kl, n: ps.reduce((s, q) => s + q.n, 0), parts: ps });
      }
      if (kinds.length) asms.push({ id, label, n: kinds.reduce((s, k) => s + k.n, 0), kinds });
    }
    return { asms, place };
  }

  // drawn? a part is off by its own id, else on where any of its places has the assembly and its kind on
  function on(tree, off, id) {
    if (off.has(id)) return false;
    return (tree.place[id] || []).some(([a, k]) => !off.has(a) && !off.has(a + "." + k));
  }
  // a preset -> the ids it turns off (a fresh set; part-level hides are cleared too)
  function preset(tree, name) {
    const off = new Set();
    for (const a of tree.asms) {
      if (name === "frame" && !FRAME.includes(a.id)) { off.add(a.id); continue; }
      for (const k of a.kinds) {
        if ((name === "no-hardware" && k.kind === "hardware") || (name === "printed" && k.kind !== "printed")
          || (name === "frame" && k.kind === "electronics")) off.add(k.id);
      }
    }
    return off;
  }
  // which preset the off set is, or "" (a hand-made mix)
  function presetOf(tree, off) {
    for (const [p] of PRESETS) {
      const s = preset(tree, p);
      if (s.size === off.size && [...s].every((x) => off.has(x))) return p;
    }
    return "";
  }

  const api = { build, on, preset, presetOf, ASM, KINDS, PRESETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4ShowTree = api;
})(typeof window !== "undefined" ? window : this);
