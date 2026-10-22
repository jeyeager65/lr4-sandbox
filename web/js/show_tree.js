// The Show tab's tree (Part 26): every part drawn, filed as assembly > kind > part, with stable ids a script can use
// (Part 29's (Video Show: ...)). Assembly from the part's group, with a few moves: belts go with what they ride on (Y
// belts: table, X belt: beam), the router + its mount + dust shoe come out of Core. Kind from the source (printed / cut /
// hardware) plus electronics by name. Bolts and screws (names "A__M5_to_B", the hardware's joints) are filed under the
// assemblies of both parts they join: listed under both, drawn if either is shown. Ids: assembly "beam", kind
// "beam.hardware", part = the mesh name (a thread "X~thread" follows X). Visibility = a set of ids turned off.
// Inspect (Part 27): a row's parts + every bolt joining one of them + the bearings / idlers / rails those bolts hold
// (inspectSet), and its parts list with the fastener counts from the data (meta.fast, share_data.py) - partsList.
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

  // parts: [{ name, label, group, source, motion, of, role, joins }] (the meshes' userData) ->
  // { asms: [{ id, label, n, kinds: [{ id, kind, label, n, parts: [{ id, label, n }] }] }], place: { partId: [[asm, kind]] },
  //   joins: { boltId: [part names it joins: its name's A / B (all of "Bearing_Core_*" for "Bearing_Core") + meta.joins] },
  //   kind: { partId: kind } }
  // (n = parts, threads not counted; a bolt counts in each assembly it's listed under)
  function build(parts) {
    const byName = new Map();                         // non-bolt part name -> assembly
    for (const p of parts) if (!isBolt(p) && !p.of) byName.set(p.name, asmOf(p));
    const names = [...byName.keys()];
    const partsOf = (x) => {                          // a joint's part name -> the parts it names
      if (!x) return [];
      if (byName.has(x)) return [x];
      const sub = names.filter((n) => n.startsWith(x + "_"));        // "Bearing_Core" -> Bearing_Core_Lower_1 ...
      if (sub.length) return sub;
      const sup = names.filter((n) => x.startsWith(n + "_")).sort((a, b) => b.length - a.length)[0];   // "MGN12H_Max_177"
      return sup ? [sup] : [];
    };
    const resolve = (x) => { const p = partsOf(x)[0]; return p ? byName.get(p) : null; };   // -> its assembly
    const place = {}, rows = {}, joins = {}, kinds = {};
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
      kinds[id] = kind;
      if (isBolt(p)) {
        const a = p.name.split("__")[0], b = (/_to_(.+)$/.exec(p.name.slice(a.length + 2)) || [])[1];
        joins[id] = [...new Set([...partsOf(a), ...partsOf(b), ...(p.joins || []).filter((n) => byName.has(n))])];
      }
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
    return { asms, place, joins, kind: kinds };
  }

  // a row (assembly, "asm.kind" or part id) -> its part ids
  function members(tree, id) {
    for (const a of tree.asms) {
      if (a.id === id) return a.kinds.flatMap((k) => k.parts.map((q) => q.id));
      const k = a.kinds.find((x) => x.id === id);
      if (k) return k.parts.map((q) => q.id);
    }
    return tree.place[id] ? [id] : [];
  }
  // what the inspect view shows for a row: its parts + every bolt joining one of them (not for a bolt's own row) + the
  // plain hardware those bolts name (bearings on their axles, idlers, rail blocks) -> Set of part ids
  function inspectSet(tree, id) {
    const out = new Set(members(tree, id)), own = [...out].filter((p) => !tree.joins[p]);
    if (!own.length) return out;
    for (const [b, js] of Object.entries(tree.joins)) {
      if (!js.some((n) => out.has(n) && own.includes(n))) continue;
      out.add(b);
      for (const n of js) if (tree.kind[n] === "hardware") out.add(n);
    }
    return out;
  }
  // the parts list of a set: parts: the meshes' userData (threads skipped) ->
  // [{ title, rows: [[qty, label]] }] - Printed / Cut / Hardware / Electronics by label, then Fasteners by item from
  // meta.fast (screws + nuts); a bolt mesh without counts (temp struts, coupler grubs) is listed by name, qty null
  function partsList(parts) {
    const secs = KINDS.filter(([k]) => k !== "hardware").map(([k, t]) => [k, t]);
    secs.splice(2, 0, ["hardware", "Hardware"]);
    const by = {}, fast = new Map(), unknown = [];
    for (const p of parts) {
      if (/~thread$/.test(p.name)) continue;
      if (isBolt(p)) {
        if (p.fast) for (const [n, it] of p.fast) fast.set(it, (fast.get(it) || 0) + n);
        else unknown.push(boltLabel(p));
        continue;
      }
      const k = kindOf(p), m = by[k] = by[k] || new Map();
      const l = String(p.label || p.name).replace(/ (\d{1,2})$/, (w, n) => (+n <= 16 ? "" : w));   // copies: "Y Clip 3" -> "Y Clip" (not "Rail 85")
      m.set(l, (m.get(l) || 0) + 1);
    }
    const sort = (rows) => rows.sort((a, b) => String(a[1]).localeCompare(String(b[1]), "en", { numeric: true }));
    const out = secs.filter(([k]) => by[k]).map(([k, t]) => ({ title: t, rows: sort([...by[k]].map(([l, n]) => [n, l])) }));
    if (fast.size || unknown.length)
      out.push({ title: "Fasteners", rows: sort([...fast].map(([it, n]) => [n, it])).concat(unknown.map((l) => [null, l])) });
    return out;
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

  const api = { build, on, preset, presetOf, members, inspectSet, partsList, ASM, KINDS, PRESETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4ShowTree = api;
})(typeof window !== "undefined" ? window : this);
