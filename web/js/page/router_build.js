// lr4-sandbox page: Build your router (My LR4 > Router, user 2026-10-29). Pick the router (the same setting as Run's
// list), edit any of its numbers - the router in the view follows as you type - New / Reset / Delete, Export / Import
// a .router.json to share. Edits per machine (LR4Routers.EDITS_KEY via MS: { id: preset }); LR4Routers.define puts
// them in. The page's scripts share one global scope (rtSet / rtSwap / rtLook: router.js). ----
  const RB = { edits: {}, timer: 0, undo: [], redo: [], replay: false, cut: false };
  try { RB.edits = JSON.parse(MS.get(LR4Routers.EDITS_KEY) || "{}") || {}; } catch (e) { /* none */ }
  function rbSave() { try { MS.set(LR4Routers.EDITS_KEY, JSON.stringify(RB.edits)); } catch (e) { /* not kept */ } }
  const rbHex = (c) => "#" + c.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, "0")).join("");
  const rbRgb = (h) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3));
  const rbDark = (h) => rbHex(rbRgb(h).map((v) => v * 0.6));

  // the inputs: [data-k (a path in the preset), label, unit, which kind: r = routers only, s = spindles only, "" = both]
  const STACK = [["model.collet_nut.af", "Collet nut across flats", "mm", ""], ["model.collet_nut.h", "Collet nut height", "mm", ""],
    ["model.shaft.d", "Exposed shaft Ø", "mm", ""], ["model.shaft.exposed", "Exposed shaft length", "mm", ""],
    ["model.bearing_cap.d", "Bearing cap Ø", "mm", ""], ["model.bearing_cap.l", "Bearing cap length", "mm", ""],
    ["model.housing.d", "Motor housing Ø", "mm", "r"], ["model.housing.l", "Motor housing length", "mm", "r"],
    ["model.housing.ch", "Motor housing chamfer", "mm", "r"], ["model.housing.vent.depth", "Vent depth (0 = closed end)", "mm", "r"],
    ["model.housing.vent.wall", "Vent wall", "mm", "r"], ["model.housing.vent.spokes", "Vent spokes", "", "r"], ["model.housing.vent.w", "Spoke width", "mm", "r"],
    ["model.housing.vent.inset", "Spokes in from the rim", "mm", "r"],
    ["model.housing.d", "Can Ø", "mm", "s"], ["model.housing.l", "Can length", "mm", "s"],
    ["model.collar.d", "Collar Ø", "mm", "r"], ["model.collar.l", "Collar length", "mm", "r"], ["model.overall", "Overall height", "mm", "r"]];
  const BITEND = [["model.collet_nut.below", "Nut face below the shaft end", "mm"], ["model.collet.l", "Collet length", "mm"],
    ["model.collet.d", "Collet Ø (nut end)", "mm"], ["model.shaft.thread.d", "Thread Ø", "mm"], ["model.shaft.thread.pitch", "Thread pitch", "mm"],
    ["model.shaft.thread.length", "Thread length", "mm"]];
  const FLATS = [["model.shaft.flats.af", "Flats across", "mm"], ["model.shaft.flats.z", "Flats from the nut bottom", "mm"], ["model.shaft.flats.l", "Flats length", "mm"]];
  const CAP = [["L", "Length"], ["W", "Width"], ["H", "Height"], ["top_r", "Top fillet"], ["front_r", "Front fillet"],
    ["back_r", "Back fillet"], ["bot_r", "Under fillet"]];
  // every part's color + finish (model.looks; the page: router.js rtMaterial); r / s: routers / spindles only
  const LOOKS = [["motor_cap", "Motor cap", ""], ["housing", "Motor housing", "r"], ["housing", "Can", "s"], ["collar", "Collar", "r"],
    ["transition", "Transition", "r"], ["bearing_cap", "Bearing cap", ""], ["shaft", "Shaft", ""], ["collet_nut", "Collet nut", ""],
    ["collet", "Collet", ""], ["dial", "Dial", "r"], ["switch", "Switch rocker", "r"], ["shaft_lock", "Shaft lock button", "r"], ["lock_boss", "Shaft lock boss", "r"],
    ["strain_relief", "Strain relief", ""], ["cord", "Cord", ""], ["trim", "Trim (bezels, grille)", ""]];
  const FINISHES = [["metal", "Metal"], ["plastic", "Plastic"], ["rubber", "Rubber"]];
  function rbField(box, id, label, type, unit) {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = type === "color" ? `<label for="${id}">${label}</label><input id="${id}" type="color">` : type === "text" ?
      `<label for="${id}">${label}</label><div class="unit-input"><input id="${id}" type="text"><span>${unit}</span></div>` :
      `<label for="${id}">${label}</label><div class="unit-input"><input id="${id}" type="number" step="any"><span>${unit}</span></div>`;
    (typeof box === "string" ? $(box) : box).append(f);
    return f.querySelector("input");
  }
  const rbKind = (el, k) => { if (k) el.closest(".field").classList.add(k === "r" ? "rb-router" : "rb-spin"); };
  function rbBuild() {                               // the inputs, once
    for (let i = 0; i < 6; i++) rbField("rb-dial", `rb-d${i}`, `Dial ${i + 1}`, "num", "RPM").dataset.k = `speeds.${i}`;
    rbField("rb-s", "rb-s0", "Lowest accurate", "num", "RPM").dataset.k = "s.0";
    rbField("rb-s", "rb-s1", "Top speed", "num", "RPM").dataset.k = "s.1";
    STACK.forEach(([k, l, u, kind], i) => { const el = rbField("rb-stack", `rb-st${i}`, l, "num", u); el.dataset.k = k; rbKind(el, kind); });
    $("rb-st8").title = "A 45° bevel round the housing's bottom edge (the collet end), this big";
    const tr = document.createElement("div");      // the transition up to the motor cap + the shaft lock
    tr.className = "rb-router"; tr.id = "rb-trans-box";
    tr.innerHTML = '<div class="variant" id="rb-tshape"><span>Transition to the motor cap</span><button type="button" data-v="round" aria-pressed="true">Round</button>' +
      '<button type="button" data-v="cap" aria-pressed="false">To the cap\'s shape</button></div><div class="rb-grid" id="rb-trans"></div>' +
      '<div class="variant" id="rb-tedge"><span>Where it meets the cap</span><button type="button" data-v="none" aria-pressed="true">Plain</button>' +
      '<button type="button" data-v="fillet" aria-pressed="false">Fillet</button><button type="button" data-v="chamfer" aria-pressed="false">Chamfer</button></div>' +
      '<div class="rb-grid" id="rb-trans-e"></div><p class="foot" id="rb-t-emax" hidden></p>' +
      '<label class="check"><input type="checkbox" id="rb-lock-on"> Shaft lock button</label><div class="rb-grid" id="rb-lock"></div>';
    $("rb-stack").after(tr);
    rbField("rb-trans", "rb-t-l", "Transition length", "num", "mm").dataset.k = "model.transition.l";
    rbField("rb-trans", "rb-t-d", "Top Ø", "num", "mm").dataset.k = "model.transition.d";
    rbField("rb-trans-e", "rb-t-e", "Fillet size", "num", "mm").dataset.k = "model.transition.e";
    for (const [k, l, u] of [["z", "Lock height", "mm"], ["a", "Lock angle", "°"], ["d", "Boss Ø (0 = none)", "mm"], ["in", "Boss starts at", "mm"], ["arm", "Arm width (0 = none)", "mm"], ["r", "Lock reach", "mm"], ["button", "Button Ø", "mm"], ["pin", "Pin Ø (0 = none)", "mm"], ["out", "Button stands out", "mm"], ["travel", "Press depth", "mm"]])
      rbField("rb-lock", `rb-lock-${k}`, l, "num", u).dataset.k = `model.shaft_lock.${k}`;
    const cool = document.createElement("div");
    cool.className = "variant rb-spin"; cool.id = "rb-cooling";
    cool.innerHTML = '<span>Cooling</span><button type="button" data-v="air" aria-pressed="true">Air (fan)</button><button type="button" data-v="water" aria-pressed="false">Water</button>';
    tr.after(cool);
    // the bit end (user 2026-10-29: for the bit change): collet, nut, thread, the shaft's wrench flats
    rbField("rb-bitend", "rb-csizes", "Collet sizes", "text", "mm").dataset.list = "model.collet.sizes";
    $("rb-csizes").title = "Every shank the collets take, in mm, comma apart (1/8\" = 3.175, 1/4\" = 6.35); a bit change swaps the collet when the shank changes";
    BITEND.forEach(([k, l, u], i) => { rbField("rb-bitend", `rb-be${i}`, l, "num", u).dataset.k = k; });
    const fl = document.createElement("div");
    fl.innerHTML = '<label class="check"><input type="checkbox" id="rb-flats-on"> Wrench flats on the shaft (no shaft lock: 2 wrenches)</label><div class="rb-grid" id="rb-flats"></div>';
    $("rb-bitend").after(fl);
    FLATS.forEach(([k, l, u], i) => { rbField("rb-flats", `rb-fl${i}`, l, "num", u).dataset.k = k; });
    const cb = document.createElement("div");       // height in the mount (router.js rtFrame)
    cb.id = "rb-clampbox";
    cb.innerHTML = '<div class="rb-grid" id="rb-clampgrid"></div><p class="foot" id="rb-clampnote" hidden></p>';
    $("rb-mount").closest(".field").after(cb);
    rbField("rb-clampgrid", "rb-clamp", "Nut below the clamp", "num", "mm").dataset.k = "model.clamp";
    $("rb-clamp").title = "mm from the bottom of the collet nut up to the bottom of the mount's lower clamp: more = the router (and bit) sits lower";
    for (const [k, l] of CAP) rbField("rb-head", `rb-h-${k}`, l, "num", "mm").dataset.k = `model.motor_cap.${k}`;
    rbField("rb-head", "rb-h-dd", "Dial Ø", "num", "mm").dataset.k = "model.dial.d";
    rbField("rb-head", "rb-h-dt", "Dial thickness", "num", "mm").dataset.k = "model.dial.t";
    LOOKS.forEach(([k, l, kind], i) => {             // a color + a finish each
      const el = rbField("rb-colors", `rb-lk${i}`, l, "color"), f = el.closest(".field"), sel = document.createElement("select");
      el.dataset.look = k;
      sel.id = `rb-lf${i}`; sel.dataset.lookf = k; sel.setAttribute("aria-label", `${l} finish`);
      for (const [v, t] of FINISHES) sel.add(new Option(t, v));
      f.classList.add("rb-look");
      rbKind(el, kind);
      f.append(sel);
    });
  }
  const rbPath = (o, k) => k.split(".").reduce((a, p) => (a == null ? undefined : a[p]), o);
  function rbPut(o, k, v) {
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
  function rbTransShow(m) {                          // the transition's buttons + which of its sizes apply
    const T = m.transition || { shape: "round", edge: "none" };
    for (const btn of $("rb-tshape").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === T.shape));
    for (const btn of $("rb-tedge").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === T.edge));
    $("rb-t-d").closest(".field").hidden = T.shape === "cap";
    $("rb-trans-e").hidden = T.edge === "none";
    $("rb-t-e").closest(".field").querySelector("label").textContent = T.edge === "chamfer" ? "Chamfer size" : "Fillet size";
    const mx = m.transition ? LR4RouterBody.transitionEdgeMax(m) : 0, note = $("rb-t-emax");
    note.textContent = T.edge !== "none" && (T.e || 0) > mx ? `Only ${mx} mm fits here (the cap's size / the transition's length): drawn at ${mx}.` : "";
    note.hidden = !note.textContent;
    $("rb-t-e").title = `Up to ${mx} mm here`;
    if (!m.transition && document.activeElement !== $("rb-t-l")) $("rb-t-l").value = 0;
  }
  function rbShow() {                                // the inputs from the current router
    const id = rbCur(), r = LR4Routers.ROUTERS[id], p = LR4Routers.preset(id), m = p.model, spin = m.kind === "spindle";
    for (const btn of $("rb-kind").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === (spin ? "spindle" : "router")));
    for (const el of document.querySelectorAll("#st-rt .rb-router")) el.hidden = spin;
    for (const el of document.querySelectorAll("#st-rt .rb-spin")) el.hidden = !spin;
    if (spin) for (const btn of $("rb-cooling").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === m.cooling));
    const pick = $("rb-pick");
    pick.length = 0;
    for (const [k, q] of Object.entries(LR4Routers.ROUTERS)) pick.add(new Option(q.name + (q.edited && !q.custom ? " (edited)" : ""), k));
    pick.value = id;
    $("rb-name").value = p.name;
    const man = p.source === "manual";
    for (const btn of $("rb-source").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === p.source));
    $("rb-dial").hidden = !man; $("rb-s").hidden = man;
    $("rb-mount").value = p.mount;
    const mrec = cfg && cfg.parts && cfg.parts.find((q) => q.key === "Tool_Mount_B_Kobalt"), alt = mrec && mrec.src && mrec.src.alt && mrec.src.alt[p.mount];
    const mnote = $("rb-mountnote"), msrc = cfg && cfg.files && alt && cfg.files.sources[alt.file.split("/")[0]];
    mnote.textContent = alt && !userFiles.has(alt.file) ? `The ${msrc ? msrc.title : p.mount} files aren't added yet (Parts): drawn as the Kobalt set for now.` : "";
    mnote.hidden = !mnote.textContent;   // (Part 45c: scene.js mountAlt)
    const shown = Object.assign({}, p, { model: Object.assign({}, m, { overall: LR4RouterBody.overall(m), housing: Object.assign({ ch: 0 }, m.housing),
      bearing_cap: m.bearing_cap || { d: 0, l: 0 }, collar: m.collar || { d: 0, l: 0 } }) });
    for (const el of document.querySelectorAll("#st-rt input[data-k]")) {
      const k = el.dataset.k, v = k.startsWith("speeds.") ? (p.speeds ? p.speeds[+k.split(".")[1]][1] : "") : rbPath(shown, k);
      if (document.activeElement !== el) el.value = v === undefined || v === null ? "" : v;
    }
    if (document.activeElement !== $("rb-csizes")) $("rb-csizes").value = m.collet.sizes.join(", ");
    $("rb-flats-on").checked = !!m.shaft.flats; $("rb-flats").hidden = !m.shaft.flats;
    if (!spin) rbTransShow(m);
    const C = rtClamps(), clamp = m.clamp ?? (C ? C.def : 0);
    $("rb-clampbox").hidden = p.mount === "none" || !C;
    if (document.activeElement !== $("rb-clamp")) $("rb-clamp").value = clamp;
    const note = $("rb-clampnote"), off = [];
    if (C) {                                         // both clamps on the motor housing (a spindle: its can)?
      const g0 = m.collet_nut.h + m.shaft.exposed + (m.bearing_cap ? m.bearing_cap.l : 0), g1 = g0 + m.housing.l;
      for (const [nm, [z0, z1]] of [["lower", C.lo], ["upper", C.hi]]) if (clamp + z0 < g0 - 0.5 || clamp + z1 > g1 + 0.5) off.push(nm);
      const where = spin ? "can" : "motor housing";
      note.textContent = off.length ? `The ${off.join(" and ")} clamp${off.length > 1 ? "s are" : " is"} off the ${where} ` +
        `(it runs ${g0.toFixed(0)} - ${g1.toFixed(0)} mm up from the nut; the clamps ${(clamp + C.lo[0]).toFixed(0)} - ${(clamp + C.lo[1]).toFixed(0)} ` +
        `and ${(clamp + C.hi[0]).toFixed(0)} - ${(clamp + C.hi[1]).toFixed(0)}).` : "";
    }
    note.hidden = !off.length || $("rb-clampbox").hidden;
    $("rb-lock-on").checked = !!m.shaft_lock; $("rb-lock").hidden = !m.shaft_lock;
    if (!spin) for (const btn of $("rb-dialplace").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === m.dial.place));
    LOOKS.forEach(([k], i) => { const L = m.looks[k]; $(`rb-lk${i}`).value = rbHex(L.c); $(`rb-lf${i}`).value = L.f; });
    $("rb-reset").textContent = r.custom ? "Delete" : "Reset";
    $("rb-reset").disabled = !r.custom && !r.edited;
    $("sum-rt").textContent = r.name;
    rbTab(RB.tab);
    if (typeof rxTick === "function") rxTick();     // the numbers on the model, now
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

  rbBuild();
  // one tab of settings at a time (user 2026-10-29); the tab bar's ? = that tab's help
  const RB_HELP = { speed: "help-rb-speed", mount: "help-rb-mount", stack: "help-rb-stack", bitend: "help-rb-bitend", head: "help-rb-head", colors: "help-rb-colors" };
  RB.tab = kvGet("lr4-rb-tab");
  if (!RB_HELP[RB.tab]) RB.tab = "speed";
  function rbTab(t) {
    if (t === "head" && LR4Routers.preset(rbCur()).model.kind === "spindle") t = "stack";   // a spindle has no motor cap tab
    RB.tab = t;
    for (const b of $("rb-tabs").querySelectorAll("[role=tab]")) b.setAttribute("aria-selected", String(b.dataset.v === t));
    for (const s of document.querySelectorAll("#st-rt .rb-sec")) s.classList.toggle("on", s.dataset.sec === t);
    const q = $("rb-tab-q");
    q.hidden = !RB_HELP[t];
    if (RB_HELP[t]) q.dataset.help = RB_HELP[t];
  }
  $("rb-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[role=tab]");
    if (!b) return;
    rbTab(b.dataset.v);
    kvSet("lr4-rb-tab", RB.tab);
  });
  // Close-up: Inspect's router row, less the shoe's bottom (skirt + bristles) and the cord's run to the hose; its Show
  // boxes take out the shoe top / each mount (with their own bolts) and add the core
  const RB_VIEW_OFF = [["rb-shoe", "Dust_Shoe"], ["rb-mb", "Tool_Mount_B"], ["rb-mt", "Tool_Mount_T"]];
  const rbViewDrop = () => new RegExp("^(" + ["Dust_Skirt", "Bristles_TPU", "Router_Cord_Run",
    ...RB_VIEW_OFF.filter(([id]) => !$(id).checked).map(([, n]) => n)].join("|") + ")");
  const rbViewing = () => !!(INSPECT && INSPECT.as === "router");
  function rbViewMark() {
    $("rb-view").setAttribute("aria-pressed", String(rbViewing()));
    $("rb-core-box").hidden = !rbViewing();
    if (typeof rxMark === "function") rxMark();     // the dimensions on the model (router_edit.js)
  }
  $("rb-view").addEventListener("click", () => {
    if (rbViewing()) return inspectEnd();
    inspect("router", { as: "router", label: "Your router", drop: rbViewDrop(), plus: $("rb-core").checked ? "core" : null });
    rbViewMark();
  });
  $("rb-core-box").addEventListener("change", () => {   // the camera stays put
    if (!rbViewing()) return;
    INSPECT.drop = rbViewDrop();
    INSPECT.plus = $("rb-core").checked ? "core" : null;   // the core too: does the router clear it
    INSPECT.label = INSPECT.plus ? "Your router + the core" : "Your router";
    applyVisibility();
  });
  $("rb-pick").addEventListener("change", (e) => { rbMsg(""); rtSet({ router: e.target.value }); rbShow(); });
  $("rb-name").addEventListener("input", (e) => rbEdit((p) => { p.name = e.target.value || "My router"; }));
  $("rb-mount").addEventListener("change", (e) => rbEdit((p) => { p.mount = e.target.value; }, true));
  $("rb-source").addEventListener("click", (e) => {
    const v = e.target.dataset && e.target.dataset.v;
    if (v) rbEdit((p) => { p.source = v; if (v === "gcode" && !p.s) p.s = [10000, 30000]; }, true);
  });
  $("rb-kind").addEventListener("click", (e) => {    // router <-> spindle: the other kind's model, the bit end + looks kept
    const v = e.target.dataset && e.target.dataset.v;
    if (!v) return;
    rbEdit((p) => {
      const was = p.model.kind === "spindle" ? "spindle" : "router";
      if (v === was) return;
      const orig = LR4Routers.ROUTERS[rbCur()].custom ? null : LR4RouterData.routers[rbCur()];
      const tmpl = v === "spindle" ? LR4RouterData.routers.spindle65 : orig && orig.model.kind !== "spindle" ? orig : LR4RouterData.routers.makita;
      const keep = { collet_nut: p.model.collet_nut, collet: p.model.collet, shaft: p.model.shaft, looks: p.model.looks };
      p.model = Object.assign(JSON.parse(JSON.stringify(tmpl.model)), keep);
      if (v === "spindle") { p.source = "gcode"; p.s = p.s || tmpl.s.slice(); p.mount = "makita"; }
    }, true);
  });
  $("rb-tshape").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { rbTrans(p.model).shape = v; }, true); });
  $("rb-tedge").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { const T = rbTrans(p.model); T.edge = v; if (!(T.e > 0)) T.e = 3; }, true); });
  $("st-rt").addEventListener("change", (e) => {     // a part's finish; the collet sizes when typed out
    const k = e.target.dataset && e.target.dataset.lookf;
    if (k) rbEdit((p) => { p.model.looks[k] = { c: p.model.looks[k].c, f: e.target.value }; }, true);
    if (e.target.dataset && e.target.dataset.list) {
      const v = e.target.value.split(/[,;\s]+/).map(Number).filter((x) => x > 0);
      if (v.length) rbEdit((p) => { p.model.collet.sizes = v; }, true);
    }
  });
  $("rb-lock-on").addEventListener("change", (e) => rbEdit((p) => {
    const m = p.model;
    if (!e.target.checked) { delete m.shaft_lock; return; }
    m.shaft_lock = { z: +(m.collet_nut.h + m.shaft.exposed + (m.bearing_cap ? m.bearing_cap.l : 0) + 10).toFixed(1), a: -50, d: 14, r: +(m.housing.d / 2 + 3).toFixed(1), travel: 3, button: 10, out: 4 };
  }, true));
  $("rb-flats-on").addEventListener("change", (e) => rbEdit((p) => {
    const S = p.model.shaft;
    if (!e.target.checked) { delete S.flats; return; }
    S.flats = { af: +(S.d * 0.8).toFixed(1), z: +(p.model.collet_nut.h + 0.2).toFixed(1), l: Math.max(1, Math.min(3, S.exposed - 0.4)) };
  }, true));
  $("rb-cooling").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { p.model.cooling = v; }, true); });
  $("rb-dialplace").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { p.model.dial.place = v; }, true); });
  $("st-rt").addEventListener("input", (e) => {
    const el = e.target, k = el.dataset.k;
    if (el.dataset.lookf || el.dataset.list) return;   // (their change events)
    if (el.dataset.look) {
      const lk = el.dataset.look;
      rbEdit((p) => { p.model.looks[lk] = { c: rbRgb(el.value), f: p.model.looks[lk].f }; if (lk === "dial") p.model.dial.ring = [el.value, rbDark(el.value)]; });
      return;
    }
    if (!k) return;
    const v = el.value.trim() === "" ? undefined : Number(el.value);
    if (v === undefined || !Number.isFinite(v)) return;
    rbEdit((p) => {
      const m = p.model;
      if (k === "model.overall") { if (m.motor_cap) m.motor_cap.H = v - LR4RouterBody.stackTop(m); return; }   // the cap sits on the turned part: overall = its top + H
      if (k.startsWith("model.transition.")) rbTrans(m);   // typed into before there's one: made
      const sec = /^model\.(bearing_cap|collar)\./.exec(k);   // ... these too (a section needs both sizes)
      if (sec && !m[sec[1]]) m[sec[1]] = { d: m.housing.d * (sec[1] === "collar" ? 1 : 0.5), l: 8 };
      rbPut(p, k, v);
    });
  });
  $("rb-new").addEventListener("click", () => {
    const p = LR4Routers.preset(rbCur());
    p.name = ("My " + p.name.replace(/^My /, "")).slice(0, 40);
    const id = LR4Routers.newId(p.name);
    rbApply(id, p, true);
    rtSet({ router: id });
    rbShow();
    rbMsg(`Made "${p.name}" - shape it below.`);
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
  window.LR4RouterBuild = { preset: () => LR4Routers.preset(rbCur()), edit: (fn) => rbEdit(fn, true), edits: () => JSON.parse(JSON.stringify(RB.edits)) };
