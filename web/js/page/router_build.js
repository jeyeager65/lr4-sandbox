// lr4-sandbox page: Build your router (My LR4 > Router, user 2026-10-29). Pick the router (the same setting as Run's
// list); Edit router opens the router editor (its outline + inspector: router_inspect.js, the numbers on the model:
// router_edit.js) - the router in the view follows as you type - New / Reset / Delete, Export / Import a .router.json.
// Edits per machine (LR4Routers.EDITS_KEY via MS: { id: preset }); LR4Routers.define puts them in. The page's scripts
// share one global scope (rtSet / rtSwap / rtLook: router.js). ----
  const RB = { edits: {}, timer: 0, undo: [], redo: [], replay: false, cut: false };
  try { RB.edits = JSON.parse(MS.get(LR4Routers.EDITS_KEY) || "{}") || {}; } catch (e) { /* none */ }
  function rbSave() { try { MS.set(LR4Routers.EDITS_KEY, JSON.stringify(RB.edits)); } catch (e) { /* not kept */ } }
  const rbHex = (c) => "#" + c.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, "0")).join("");
  const rbRgb = (h) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
  const rbDark = (h) => rbHex(rbRgb(h).map((v) => v * 0.6));

  const rbPath = (o, k) => k.split(".").reduce((a, p) => (a == null ? undefined : a[p]), o);
  function rbPut(o, k, v) {
    const cs = /^model\.motor_cap\.(L|W|H)$/.exec(k), cap = o.model && o.model.motor_cap;
    if (cs && cap && cap.shape && v > 0) cap.shape = LR4CapShape.scaled(cap.shape, { [cs[1]]: v });   // a drawn cap stretches
    const ps = k.split("."), last = ps.pop();
    let a = o;
    for (const p of ps) { if (a[p] == null || typeof a[p] !== "object") a[p] = {}; a = a[p]; }
    if (Array.isArray(a) && k.startsWith("speeds.")) a[last] = [+last + 1, v];
    else a[last] = v;
  }
  const rbCur = () => RT.set.router;
  function rbTrans(m) {                              // the transition, made if there's none yet (15 long, as wide as the collar)
    if (!m.transition) m.transition = { l: 15, d: (m.collar || m.housing).d, shape: "round", edge: "none", e: 3 };
    return m.transition;
  }
  function rbShow() {                                // the page from the current router: the lists, the toolbar, the editor
    const id = rbCur(), r = LR4Routers.ROUTERS[id];
    const pick = $("rb-pick");
    pick.length = 0;
    for (const [k, q] of Object.entries(LR4Routers.ROUTERS)) pick.add(new Option(q.name + (q.edited && !q.custom ? " (edited)" : ""), k));
    pick.value = id;
    $("rb-reset").textContent = r.custom ? "Delete" : "Reset";
    $("rb-reset").disabled = !r.custom && !r.edited;
    $("rb-reset").title = r.custom ? "Remove this router you made" : r.edited ? "Put this router back the way it came" : "Nothing changed yet: Reset puts it back once you do";
    $("sum-rt").textContent = r.name; $("rte-h").textContent = r.name;
    if (typeof capEditShow === "function") capEditShow();
    if (typeof rxTick === "function") rxTick();     // the numbers on the model, now
    if (typeof rtiShow === "function") rtiShow();   // the outline + inspector (router_inspect.js)
  }
  // notes for an inspector item (router_inspect.js): what the numbers alone don't say
  function rbNotes(part) {
    const p = LR4Routers.preset(rbCur()), m = p.model, spin = m.kind === "spindle", out = [];
    if (part === "mount") {
      const mrec = cfg && cfg.parts && cfg.parts.find((q) => q.key === "Tool_Mount_B_Kobalt"), alt = mrec && mrec.src && mrec.src.alt && mrec.src.alt[p.mount];
      const msrc = cfg && cfg.files && alt && cfg.files.sources[alt.file.split("/")[0]];
      if (alt && !userFiles.has(alt.file)) out.push(`The ${msrc ? msrc.title : p.mount} files aren't added yet (Parts): drawn as the Kobalt set for now.`);   // (Part 45c: scene.js mountAlt)
      const C = rtClamps(), clamp = m.clamp ?? (C ? C.def : 0), off = [];
      if (C && p.mount !== "none") {                 // both clamps on the motor housing (a spindle: its can)?
        const g0 = m.collet_nut.h + m.shaft.exposed + (m.bearing_cap ? m.bearing_cap.l : 0), g1 = g0 + m.housing.l;
        for (const [nm, [z0, z1]] of [["lower", C.lo], ["upper", C.hi]]) if (clamp + z0 < g0 - 0.5 || clamp + z1 > g1 + 0.5) off.push(nm);
        if (off.length) out.push(`The ${off.join(" and ")} clamp${off.length > 1 ? "s are" : " is"} off the ${spin ? "can" : "motor housing"} ` +
          `(it runs ${g0.toFixed(0)} - ${g1.toFixed(0)} mm up from the nut; the clamps ${(clamp + C.lo[0]).toFixed(0)} - ${(clamp + C.lo[1]).toFixed(0)} ` +
          `and ${(clamp + C.hi[0]).toFixed(0)} - ${(clamp + C.hi[1]).toFixed(0)}).`);
      }
    }
    if (part === "transition" && m.transition && m.transition.edge !== "none") {
      const mx = LR4RouterBody.transitionEdgeMax(m);
      if ((m.transition.e || 0) > mx) out.push(`Only ${mx} mm fits here (the cap's size / the transition's length): drawn at ${mx}.`);
    }
    if (part === "dial" && !spin && m.dial.place !== "window" && !(window.LR4Csg && LR4Csg.ready())) out.push("The slot's settings need the geometry booleans, which haven't loaded.");
    if (part === "motor_cap" && m.motor_cap && m.motor_cap.shape) out.push("Drawn in the shape editor: Length / Width / Height stretch the drawing.");
    return out;
  }
  function rbLists() {                               // Run's router list + the job's speed-table list, from ROUTERS again
    $("rt-router").length = 0;                       // (rtLook fills it)
    const cam = $("cam-router");
    if (cam) {
      const was = cam.value;
      cam.length = 0;
      for (const k of Object.keys(StrutCam.ROUTERS)) cam.add(new Option(StrutCam.ROUTERS[k].name, k));
      cam.value = StrutCam.ROUTERS[was] ? was : StrutCam.DEFAULTS.router;
    }
  }
  // undo / redo (user 2026-10-29): every change to a router is one step { id, b, a } - its stored edit before and
  // after (null = the data file's, or no such custom router) + the router picked before (cur0) and after (cur1). Changes
  // under 0.8 s apart to the same router are one step (typing, a slider, a drag). This page visit only.
  const rbClone = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);
  function rbHist(id, b, a) {
    if (RB.replay) return;
    const now = Date.now(), top = RB.undo[RB.undo.length - 1];
    if (top && top.id === id && now - top.t < 800 && !RB.cut) { top.a = a; top.t = now; }
    else { RB.undo.push({ id, b, a, t: now, cur0: rbCur() }); if (RB.undo.length > 200) RB.undo.shift(); }
    RB.cut = false;
    RB.redo.length = 0;
    rbUndoMark();
  }
  function rbStep(back) {                            // undo (back) / redo one step
    const from = back ? RB.undo : RB.redo, to = back ? RB.redo : RB.undo, e = from.pop();
    if (!e) return;
    if (back) e.cur1 = rbCur();
    to.push(e);
    RB.replay = true;
    try {
      const snap = back ? e.b : e.a;
      if (snap) rbApply(e.id, rbClone(snap), true);
      else { delete RB.edits[e.id]; LR4Routers.define(e.id, null); rbSave(); rbLists(); }
      const want = back ? e.cur0 : e.cur1 || e.id;
      const cur = LR4Routers.ROUTERS[want] ? want : LR4Routers.ROUTERS[e.id] ? e.id : LR4Routers.DEFAULTS.router;
      if (cur !== rbCur()) rtSet({ router: cur });
      if (RT.body) RT.body.id = null;
      rtSwap(); rtLook(); rbShow();
    } finally { RB.replay = false; }
    RB.cut = true;                                    // the next change is a new step
    rbMsg(back ? "Undone." : "Redone.");
    rbUndoMark();
  }
  function rbUndoMark() {
    for (const [id, st] of [["rb-undo", RB.undo], ["rb-redo", RB.redo]]) for (const el of document.querySelectorAll(`[data-undo="${id}"], #${id}`)) el.disabled = !st.length;
  }
  function rbApply(id, p, now) {                     // p: the new preset for id (null: back to the data file's)
    const before = rbClone(RB.edits[id]);
    const was = LR4Routers.ROUTERS[id] && LR4Routers.ROUTERS[id].mount, q = LR4Routers.define(id, p);
    if (rbCur() === id && (q ? q.mount : null) !== was && typeof optsRefresh === "function") optsRefresh();   // None: no shoe / hose
    if (p && q) RB.edits[id] = q; else delete RB.edits[id];
    rbHist(id, before, rbClone(RB.edits[id]));
    rbSave();
    rbLists();
    clearTimeout(RB.timer);
    const redo = () => { if (rbCur() === id) { if (RT.body) RT.body.id = null; rtSwap(); } rtLook(); rbShow(); };
    if (now) redo(); else RB.timer = setTimeout(redo, 120);   // typing: one rebuild when it pauses
  }
  function rbEdit(fn, now) {                         // change the current router's preset with fn(p)
    const id = rbCur(), p = LR4Routers.preset(id);
    fn(p);
    rbApply(id, p, now);
  }
  function rbMsg(t) { const el = $("rb-msg"); el.textContent = t; el.hidden = !t; }
  // one setting changed (Part 48b: the inspector and the fields both come here; k = an LR4RouterSchema row's): the
  // builder's rules - the cap sits on the turned part (overall = its top + H), a section / transition set before
  // there's one is made, router <-> spindle swaps the model. A number rebuilds when typing pauses, a choice now.
  function rbSet(k, v) {
    const step = typeof v !== "number" && k !== "name";   // a choice: an undo step of its own (typing, sliding: merged)
    if (step) RB.cut = true;
    rbSetKey(k, v);
    if (step) RB.cut = true;
  }
  function rbSetKey(k, v) {
    const now = typeof v !== "number";
    if (k === "kind") return rbKindSet(v);
    if (k === "name") return rbEdit((p) => { p.name = String(v).slice(0, 40) || "My router"; });
    if (k === "mount") return rbEdit((p) => { p.mount = v; }, true);
    if (k === "source") return rbEdit((p) => { p.source = v; if (v === "gcode" && !p.s) p.s = [10000, 30000]; }, true);
    if (k === "model.collet.sizes") {
      const a = String(v).split(/[,;\s]+/).map(Number).filter((x) => x > 0);
      if (a.length) rbEdit((p) => { p.model.collet.sizes = a; }, true);
      return;
    }
    if (k.startsWith("model.dial.surround.")) {
      const f = k.slice(20);
      return rbEdit((p) => { p.model.dial.surround = Object.assign({ kind: "none" }, p.model.dial.surround, { [f]: f === "out" ? (v ? "top" : "none") : v }); }, now);
    }
    if (k === "model.dial.win.open") return rbEdit((p) => { p.model.dial.win = Object.assign({}, p.model.dial.win, { open: !!v }); }, true);
    if (k.startsWith("has:")) {                      // an optional piece on (its size) / off (0)
      const r = LR4RouterSchema.ROWS.find((q) => q.k === k);
      if (r) rbEdit((p) => rbPut(p, r.of, v ? (typeof r.on === "function" ? r.on(p.model) : r.on) : 0), true);
      return;
    }
    rbEdit((p) => {
      const m = p.model;
      if (k === "model.overall") { if (m.motor_cap) rbPut(p, "model.motor_cap.H", v - LR4RouterBody.stackTop(m)); return; }
      if (k.startsWith("model.transition.")) { const T = rbTrans(m); if (k === "model.transition.edge" && !(T.e > 0)) T.e = 3; }   // set before there's one: made
      const sec = /^model\.(bearing_cap|collar)\./.exec(k);   // ... these too (a section needs both sizes)
      if (sec && !m[sec[1]]) m[sec[1]] = { d: m.housing.d * (sec[1] === "collar" ? 1 : 0.5), l: 8 };
      rbPut(p, k, v);
    }, now);
  }
  function rbLook(lk, o) {                           // a part's look: o.c (#hex) and / or o.f (finish)
    rbEdit((p) => {
      const L = p.model.looks[lk];
      p.model.looks[lk] = { c: o.c ? rbRgb(o.c) : L.c, f: o.f || L.f };
      if (o.c && lk === "dial") p.model.dial.ring = [o.c, rbDark(o.c)];
    }, !!o.f);
  }
  function rbKindSet(v) {                            // router <-> spindle: the other kind's model, the bit end + looks kept
    rbEdit((p) => {
      const was = p.model.kind === "spindle" ? "spindle" : "router";
      if (v === was) return;
      const orig = LR4Routers.ROUTERS[rbCur()].custom ? null : LR4RouterData.routers[rbCur()];
      const tmpl = v === "spindle" ? LR4RouterData.routers.spindle65 : orig && orig.model.kind !== "spindle" ? orig : LR4RouterData.routers.makita;
      const keep = { collet_nut: p.model.collet_nut, collet: p.model.collet, shaft: p.model.shaft, looks: p.model.looks };
      p.model = Object.assign(JSON.parse(JSON.stringify(tmpl.model)), keep);
      if (v === "spindle") { p.source = "gcode"; p.s = p.s || tmpl.s.slice(); p.mount = "makita"; }
    }, true);
  }
  function rbFromPreset(id) {                        // the shape, mount and speeds of a built-in router; the name kept
    const t = LR4RouterData.routers[id];
    if (!t) return;
    RB.cut = true;
    rbEdit((p) => {
      const q = JSON.parse(JSON.stringify(t));
      p.model = q.model; p.mount = q.mount; p.source = q.source;
      delete p.speeds; delete p.s;
      if (q.speeds) p.speeds = q.speeds;
      if (q.s) p.s = q.s;
    }, true);
    RB.cut = true;
    rbMsg(`Shaped like the ${t.name}. Undo puts it back.`);
  }
  function rbFeature(id, on) {                       // a part added / taken off (LR4RouterSchema.FEATURES)
    const F = LR4RouterSchema.FEATURES.find((f) => f.id === id);
    if (!F) return;
    RB.cut = true;                                    // its own undo step
    rbEdit((p) => { if (on && !F.has(p.model)) F.add(p); else if (!on && F.has(p.model)) F.remove(p); }, true);
    RB.cut = true;
  }

  // Close-up: Inspect's router row, less the shoe's bottom (skirt + bristles) and the cord's run to the hose; its Show
  // boxes take out the shoe top / each mount (with their own bolts) and add the core
  const RB_VIEW_OFF = [["rb-shoe", "Dust_Shoe"], ["rb-mb", "Tool_Mount_B"], ["rb-mt", "Tool_Mount_T"]];
  const rbViewDrop = () => new RegExp("^(" + ["Dust_Skirt", "Bristles_TPU", "Router_Cord_Run",
    ...RB_VIEW_OFF.filter(([id]) => !$(id).checked).map(([, n]) => n)].join("|") + ")");
  const rbViewing = () => !!(INSPECT && INSPECT.as === "router");
  // the router editor (Part 46b, user 2026-10-30: "it's just grown too much to have in the side panel"): the close-up
  // with the outline in the side panel's place (#rte), the inspector on the right (Part 48b / c); Back / Esc leaves.
  // Not on a phone (user 2026-10-30): the button is hidden there.
  function rbViewMark() {
    const on = rbViewing();
    $("rb-view").setAttribute("aria-pressed", String(on));
    document.documentElement.classList.toggle("rte-on", on);
    $("rte").hidden = !on;
    if (!on && typeof capEditOpen === "function") capEditOpen(false);   // the shape editor: when the motor cap's Edit shape asks
    if (on && typeof capEditFit === "function") requestAnimationFrame(capEditFit);   // framed in the room between the columns
    $("rb-core-box").hidden = !on;
    if (typeof rxMark === "function") rxMark();     // the dimensions on the model (router_edit.js)
    if (typeof rtiShow === "function") rtiShow();
  }
  $("rb-view").addEventListener("click", () => {
    if (rbViewing()) return inspectEnd();
    inspect("router", { as: "router", label: "Your router", drop: rbViewDrop(), plus: $("rb-core").checked ? "core" : null });
    rbViewMark();
  });
  $("rte-back").addEventListener("click", () => inspectEnd());
  $("rb-core-box").addEventListener("change", () => {   // the camera stays put
    if (!rbViewing()) return;
    INSPECT.drop = rbViewDrop();
    INSPECT.plus = $("rb-core").checked ? "core" : null;   // the core too: does the router clear it
    INSPECT.label = INSPECT.plus ? "Your router + the core" : "Your router";
    applyVisibility();
  });
  $("rb-pick").addEventListener("change", (e) => { rbMsg(""); rtSet({ router: e.target.value }); rbShow(); });
  $("rb-new").addEventListener("click", () => {
    const p = LR4Routers.preset(rbCur());
    p.name = ("My " + p.name.replace(/^My /, "")).slice(0, 40);
    const id = LR4Routers.newId(p.name);
    rbApply(id, p, true);
    rtSet({ router: id });
    rbShow();
    rbMsg(`Made "${p.name}": pick a part to shape it.`);
  });
  $("rb-reset").addEventListener("click", () => {
    const id = rbCur(), r = LR4Routers.ROUTERS[id];
    if (r.custom) {
      if (!confirm(`Delete "${r.name}"?`)) return;
      RB.cut = true; rbHist(id, rbClone(RB.edits[id]), null); RB.cut = true;   // its own step (undo brings it back)
      delete RB.edits[id]; LR4Routers.define(id, null); rbSave(); rbLists();
      rtSet({ router: LR4Routers.DEFAULTS.router });
      rbShow();
      rbMsg(`Deleted "${r.name}".`);
    } else { rbApply(id, null, true); rbMsg(`${r.name} is back the way it came.`); }
  });
  $("rb-undo").addEventListener("click", () => rbStep(true));
  $("rb-redo").addEventListener("click", () => rbStep(false));
  document.addEventListener("click", (e) => {        // the close-up's own Undo / Redo (router_edit.js)
    const b = e.target.closest && e.target.closest("[data-undo]");
    if (b) rbStep(b.dataset.undo === "rb-undo");
  });
  document.addEventListener("keydown", (e) => {      // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, with the Router step open or in the close-up
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== "z" && k !== "y") return;
    if (e.target.closest && e.target.closest("input[type=text], input[type=number], textarea")) return;   // their own undo
    if (!$("st-rt").open && !rbViewing()) return;
    e.preventDefault();
    rbStep(k === "z" && !e.shiftKey);
  });
  $("rb-export").addEventListener("click", () => {
    const p = LR4Routers.preset(rbCur()), blob = new Blob([JSON.stringify({ lr4_router: 2, router: p }, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (p.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "router") + ".router.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("rb-import").addEventListener("click", () => $("rb-file").click());
  $("rb-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    let o = null;
    try { o = JSON.parse(await f.text()); } catch (err) { /* below */ }
    const p = o && LR4Routers.clean(o.router || o);
    if (!p) { rbMsg(`${f.name} isn't a router file (or one from before 2026-10-30's names).`); return; }
    const id = LR4Routers.newId(p.name);
    rbApply(id, p, true);
    rtSet({ router: id });
    rbShow();
    rbMsg(`Added "${p.name}".`);
  });
  rbShow();
  // tests: the current preset, edit it (fn(p)), the stored edits
  window.LR4RouterBuild = { preset: () => LR4Routers.preset(rbCur()), edit: (fn) => rbEdit(fn, true), edits: () => JSON.parse(JSON.stringify(RB.edits)),
    set: (k, v) => rbSet(k, v), look: (k, o) => rbLook(k, o), feature: (id, on) => rbFeature(id, on), notes: (part) => rbNotes(part) };
