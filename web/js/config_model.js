// LR4 configurator: the machine at any size from lr4_config.json (fit_config.py). Pure functions, shared by the
// page and test_config_model.js (which checks them against every size build, part by part).
//   size(cutXmm, cutYmm, braces?)  -> the size features f = [1, TW, TL, strut, pitch, cutY] (+ n, ...)
//   instances(cfg, S)              -> every part to draw: {rec, name, t: [x,y,z], s: [sx,sy,sz], clipP?}
//                                     world = s * ref_vertex + t (per axis); rigid parts have s = [1,1,1]
//   hose(cfg, S)                   -> the hose / cord anchors (lr4.json "hose") at this size
//   travel(cfg, S)                 -> {x: [lo, hi], y: [...], z: [...]} from the parked pose
//   plateFrame(cfg, which, S)      -> 4x4 (row-major 3x4) matrix: generator 2D (x, y, z = thickness) -> machine
(function (root) {
  "use strict";
  const IN = 25.4, XZ = 6.5;
  const Calc = typeof module !== "undefined" && module.exports ? require("./calculator.js") : root.LR4Calc;
  // build.py HOSE_ORDER (holder file per brace, counted from the Max end) -> fit_config.py HOSE_TYPE keys
  const HOSE_KEY = { Hose_Holder_Hook: "Hook", hose_holder_shorty: "Shorty", Hose_Hook_70: "Hook70" };
  const HOSE_NAME = { Hook: "Hose_Holder_Hook", Shorty: "Hose_Holder_Shorty", Hook70: "Hose_Hook_70" };

  function size(cutX, cutY, braces) {
    const { strut, xtable, ytable } = Calc.calc(cutX, cutY, XZ);
    const auto = Math.floor((strut - 18) / 183) + 1;       // the strut plate generator's brace count
    const n = braces || auto;
    const pitch = (strut - 18) / (n - 1);
    const TW = Math.ceil(xtable / IN + 2 - 1e-9) * IN, TL = Math.ceil(ytable / IN + 2 - 1e-9) * IN;
    return { cutX, cutY, strut, n, auto, pitch, TW, TL, xtable, ytable, f: [1, TW, TL, strut, pitch, cutY, cutX] };
  }
  const dot = (row, f) => row.reduce((a, c, i) => a + c * f[i], 0);
  const lin = (C, f) => C.map((row) => dot(row, f));
  const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);

  function hoseKey(n, j) {
    const file = j < HOSE_ORDER_DEFAULT.length ? HOSE_ORDER_DEFAULT[j] : "hose_holder_shorty";
    return HOSE_KEY[file];
  }
  let HOSE_ORDER_DEFAULT = ["Hose_Holder_Hook", "Hose_Holder_Hook", "hose_holder_shorty", "Hose_Hook_70", "hose_holder_shorty"];

  function rigid(rec, c) { return { t: add(c, rec.c_ref, -1), s: [1, 1, 1] }; }
  function stretch(rec, lo, hi) {
    const s = [0, 1, 2].map((k) => { const d = rec.hi_ref[k] - rec.lo_ref[k]; return d > 1e-6 ? (hi[k] - lo[k]) / d : 1; });
    return { t: [0, 1, 2].map((k) => lo[k] - s[k] * rec.lo_ref[k]), s };
  }
  // Jackpot3 box: extra X past build.py's JP3_SHIFT_X when the bay is short (lr4.jp3_shift, a clamp; fit_config.py
  // took it out before fitting)
  let JP3 = null;
  const jp3Extra = (S) => (JP3 ? Math.max(0, JP3.a - S.pitch / 2 - JP3.shift) : 0);
  // ...and whether it fits in the bay at all (lr4.JP3_MIN_PITCH; only a manual brace count can go under it)
  const jp3Fits = (cfg, S) => !(cfg.jp3 && cfg.jp3.min_pitch) || S.pitch >= cfg.jp3.min_pitch;
  // position of a rec at this size, its family index shifted along X by idx * pitch
  function place(rec, S, idx) {
    const sh = [idx * S.pitch + (rec.jp3 ? jp3Extra(S) : 0), 0, 0];
    if (rec.kind === "rigid") return rigid(rec, add(lin(rec.C, S.f), sh));
    const v = lin(rec.C, S.f);
    return stretch(rec, add(v.slice(0, 3), sh), add(v.slice(3), sh));
  }

  function instances(cfg, S) {
    if (cfg.hose_order) HOSE_ORDER_DEFAULT = cfg.hose_order;
    JP3 = cfg.jp3 || null;
    const out = [], byKey = {};
    for (const rec of cfg.parts) byKey[rec.key] = rec;
    const jp3 = jp3Fits(cfg, S);                       // box doesn't fit the bay: leave it and its parts out
    const push = (rec, name, p, idx = 0) => {
      if (rec.jp3 && !jp3) return;
      const o = Object.assign({ rec, name }, p);
      if (rec.clipC) o.clipP = add(lin(rec.clipC, S.f), [idx * S.pitch, 0, 0]);
      out.push(o);
    };
    for (const rec of cfg.parts) {
      const k = rec.key;
      if (rec.kind === "plate" || k.startsWith("Y_Clip_last")) continue;
      if (k.startsWith("Y_Clip_first")) {               // clips: first + last fitted, the rest evenly between
        const suf = k.slice("Y_Clip_first".length), last = byKey["Y_Clip_last" + suf];
        const c0 = lin(rec.C, S.f), c1 = lin(last.C, S.f);
        const nc = Math.ceil((c1[1] - c0[1]) / 300 - 1e-9) + 1;   // build.py: <= 300 mm centre to centre
        for (let i = 0; i < nc; i++)
          push(rec, `Y_Clip_${i + 1}${suf}`, rigid(rec, add(c0, add(c1, c0, -1), i / (nc - 1))));
        continue;
      }
      if (rec.family === "brace") {                     // one per brace (Brace_1 .. Brace_{n-1}; Brace_Max is its own)
        for (let i = 0; i < S.n - 1; i++) push(rec, k.replace("Brace_#", `Brace_${i + 1}`), place(rec, S, i), i);
        continue;
      }
      if (rec.family === "hose") {                      // hose holders: type by brace counted from the Max end
        const type = k.slice(5).replace(/[~_].*$/, ""), suf = k.slice(5 + type.length);
        let count = 0;
        for (let i = 0; i < S.n; i++) {                 // build.py numbers each type in brace order (Min -> Max)
          const j = S.n - 1 - i;
          if (hoseKey(S.n, j) !== type) continue;
          count++;
          push(rec, `${HOSE_NAME[type]}_${count}${suf}`, place(rec, S, -j), -j);
        }
        continue;
      }
      push(rec, k, place(rec, S, 0));
    }
    return out;
  }

  // an instance's bounding box at this size
  function bbox(o) {
    const r = o.rec;
    return { lo: r.lo_ref.map((v, k) => v * o.s[k] + o.t[k]), hi: r.hi_ref.map((v, k) => v * o.s[k] + o.t[k]) };
  }
  // hose anchors: fitted, except the ones build.py picks from parts (fit_config.py HOSE_RULES), redone here from
  // the instances exactly as build.py does
  function hose(cfg, S, inst) {
    const h = JSON.parse(JSON.stringify(cfg.hose));
    for (const [path, C] of Object.entries(cfg.hose_fit)) {
      const ks = JSON.parse(path);
      let o = h;
      for (const q of ks.slice(0, -1)) o = o[q];
      o[ks[ks.length - 1]] = dot(C, S.f);
    }
    JP3 = cfg.jp3 || null;
    for (const ks of (JP3 && JP3.hose) || []) {         // anchors that ride with the Jackpot3 box
      let o = h;
      for (const q of ks.slice(0, -1)) o = o[q];
      o[ks[ks.length - 1]] += jp3Extra(S);
    }
    inst = inst || instances(cfg, S);
    const boxes = inst.filter((o) => !o.name.includes("~") && !o.name.includes("__")).map((o) => Object.assign(bbox(o), { name: o.name }));
    const cx = (b) => (b.lo[0] + b.hi[0]) / 2;
    const lidX1 = h.bump[1];                           // Hose_Hook_70 has no tray
    h.bump_next = Math.min(...boxes.filter((b) => b.name.startsWith("Hose_Holder") && b.lo[0] > lidX1).map(cx));
    const holders = boxes.filter((b) => b.name.startsWith("Hose_"));
    h.clamp_x = cx(holders.reduce((a, b) => (b.lo[0] < a.lo[0] ? b : a)));
    h.run = h.port[0] + (1 - h.x_pos) * S.cutX + h.core_end_dx + 2 * h.uturn_gap - h.clamp_x;
    const braces = boxes.filter((b) => /^Brace_(\d+|Max)$/.test(b.name)).sort((a, b) => cx(a) - cx(b));
    if (h.sleeve && h.sleeve.exit) h.sleeve.exit.x = braces[Math.floor(braces.length / 2)].lo[0] - 5.0;
    return h;
  }

  function travel(cfg, S) {
    const v = (k) => dot(cfg.travel_fit[k], S.f);
    return { x: [v("x0"), v("x1")], y: [v("y0"), v("y1")], z: [v("z0"), v("z1")] };
  }

  function plateFrame(cfg, which, S) {
    const rec = cfg.parts.find((p) => p.key === which), fr = cfg.plate_frames[which];
    const d = add(lin(rec.C, S.f), rec.c_ref, -1);     // the plate's bbox corner moved by d
    const m = fr.m.slice();
    m[3] += d[0]; m[7] += d[1]; m[11] += d[2];
    return m;
  }

  // ---- BOM at this size: the reference build's BOM (bom.py) with the size-dependent parts redone - calculator and
  // stock rows from the calculator, printed part counts from the parts drawn (names), hardware counts from
  // fit_config.py's per-row fits (a + b braces + c Y clips, exact across the size builds) ----
  const EMT_STICK = 3048, KERF = 3, WING = 11.5;
  function bom(cfg, S, names) {
    const secs = JSON.parse(JSON.stringify(cfg.bom_ref || []));
    const n = S.n, nc = names.filter((nm) => /^Y_Clip_\d+$/.test(nm)).length;
    const c = Calc.calc(S.cutX, S.cutY, XZ), ci = Calc.inches(c), num = (v) => +v.toFixed(1);
    const { strut, xbelt, xtable, yrail, ybelt, ytable, xrails } = c, strutIn = ci.strut;
    const count = (re) => names.filter((nm) => re.test(nm)).length;
    const sec = (t) => secs.find((q) => q.title.startsWith(t));
    const byName = (q, col, name) => q && q.rows.find((r) => r[col] === name);
    const set = (row, col, v) => { if (row) row[col] = v; };
    let q = sec("V1E calculator");
    if (q) {
      q.note = `Usable cutting area ${+(S.cutX / IN).toFixed(3)} x ${+(S.cutY / IN).toFixed(3)} in (${S.cutX.toFixed(1)} x ` +
        `${S.cutY.toFixed(1)} mm), 1" EMT (29.5 mm), XZ plates 6.5 mm. This build uses the mm values (the inch mode ` +
        `rounds the strut up to ${(strutIn * IN).toFixed(2)} mm).`;
      const rows = { 'X rails (1" EMT)': [xrails, ci.xrails], 'Y rail (1" EMT)': [num(yrail), ci.yrail],
        "Belt along X": [xbelt, ci.xbelt], "Belt along Y": [num(ybelt), ci.ybelt],
        "Belt total (GT2 10 mm)": [num(c.belt_total), ci.belt_total], "Strut length": [strut, strutIn],
        "Table footprint (min)": [`${xtable.toFixed(1)} x ${ytable.toFixed(1)}`, `${ci.xtable} x ${ci.ytable}`] };
      for (const [k, [mm, i]] of Object.entries(rows)) { const r = byName(q, 0, k); set(r, 1, mm); set(r, 2, i); }
    }
    q = sec("Buy / cut: stock");
    if (q) {
      const fmt = (mm) => `${Math.round(mm)} mm (${(mm / IN).toFixed(3)} in)`;
      set(byName(q, 1, "Table top"), 3, `${+(S.TW / IN).toFixed(2)} x ${+(S.TL / IN).toFixed(2)} in`);
      set(byName(q, 1, "X rail"), 3, fmt(xrails));
      set(byName(q, 1, "Y rail"), 3, fmt(yrail));
      const emt = byName(q, 1, "(EMT to buy)"), bins = [];
      for (const [L, nm] of [[yrail, "Y rail"], [xrails, "X rail"], [xrails, "X rail"]]) {
        const b = bins.find((x) => x.len + L + KERF <= EMT_STICK);
        if (b) { b.len += L + KERF; b.names.push(nm); } else bins.push({ len: L + KERF, names: [nm] });
      }
      set(emt, 3, `${Math.round(2 * xrails + yrail)} mm total`);
      set(emt, 4, `${bins.length} stick${bins.length > 1 ? "s" : ""}: ` + bins.map((b) => b.names.join(" + ")).join("; "));
      set(byName(q, 1, "Strut plate, front"), 3, `${strut} x ${(67.5 + 2 * WING).toFixed(1)} mm`);
      set(byName(q, 1, "Strut plate, bottom"), 3, `${strut} x 78.5 mm`);
      const bx = byName(q, 1, "Belt along X"), by = byName(q, 1, "Belt along Y");
      set(bx, 3, `${Math.round(xbelt)} mm`); set(bx, 4, `modelled path ${Math.round(xbelt - 95)} mm loop screw to tensioner`);
      set(by, 3, `${Math.round(ybelt)} mm`); set(by, 4, `modelled path ${Math.round(ybelt - 95)} mm lock to tension block`);
    }
    q = sec("Printed parts");
    if (q) {
      const counts = { Brace_29p5: n - 1, Y_Clip_29p5: nc, Hose_Holder_Hook: count(/^Hose_Holder_Hook_\d+$/),
        hose_holder_shorty: count(/^Hose_Holder_Shorty_\d+$/), Hose_Hook_70: count(/^Hose_Hook_70_\d+$/) };
      for (const [k, v] of Object.entries(counts)) set(byName(q, 1, k), 0, v);
      q.rows = q.rows.filter((r) => r[0] !== 0);
    }
    const g = [1, n, nc], fit = (C) => Math.round(C.reduce((a, c, i) => a + c * g[i], 0));
    for (const [title, keyf] of [["Hardware: V1E kit vs this build", (r) => r[3]],
      ["Hardware: where every fastener goes", (r) => [r[1], r[2].replace("Brace Max", "Brace 0").replace(/\d+/g, "#"), r[5]]]]) {
      q = sec(title);
      const fits = (cfg.bom_fit || {})[title];
      if (!q || !fits) continue;
      const seen = {};                                // repeated keys numbered in order, as fit_config.py does
      for (const r of q.rows) {
        const k = JSON.stringify(keyf(r));
        seen[k] = (seen[k] ?? -1) + 1;
        const f = fits[`${k}|${seen[k]}`];
        if (f) for (const [col, C] of Object.entries(f)) r[col] = fit(C);
      }
      q.rows = q.rows.filter((r) => title.startsWith("Hardware: V1E") || r[0] > 0);
    }
    q = sec("Hardware: V1E kit");
    if (q && q.note) q.note = q.note.replace(/this build has \d+ braces/, `this build has ${n} braces`);
    q = sec("Hardware: where");
    if (q && q.note) q.note = q.note.replace(/^\d+ fasteners/, `${q.rows.reduce((a, r) => a + (Number(r[0]) || 0), 0)} fasteners`);
    q = sec("Model notes");
    if (q) q.rows = q.rows.map((r) => [String(r[0])
      .replace(/^Braces: .*$/, `Braces: ${n} at ${S.pitch.toFixed(2)} mm pitch (${S.n === S.auto ? "generator default" : "chosen"}); ` +
        `Y clips: ${nc} (<= 300 mm apart).`)
      .replace(/Vacuum hose: [\d.]+ m modelled/, "Vacuum hose: modelled")]);
    return secs;
  }

  const api = { size, instances, hose, travel, plateFrame, bom, jp3Fits, IN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Model = api;
})(typeof self !== "undefined" ? self : this);
