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

  // the inputs: [container, key, label, get(preset) -> value, set(preset, value)]; "" = empty (the head's H: auto)
  const STACK = [["nut", 0, "Nut across flats"], ["nut", 1, "Nut height"], ["spindle", 0, "Spindle Ø"], ["spindle", 1, "Spindle length"],
    ["nose", 0, "Nose Ø"], ["nose", 1, "Nose length"], ["grip", 0, "Grip Ø"], ["grip", 1, "Grip length"],
    ["cast", 0, "Collar Ø"], ["cast", 1, "Collar length"]];
  const HEAD = [["L", "Length"], ["W", "Width"], ["H", "Height"], ["top_r", "Top fillet"], ["front_r", "Front fillet"],
    ["back_r", "Back fillet"], ["bot_r", "Under fillet"]];
  const COLORS = [["head", "Head"], ["body", "Nose + spindle"], ["dial", "Dial"]];
  // each section of the turned part: its color + finish (body.looks; the page: router.js rtLooks)
  const LOOKS = [["grip", "Grip"], ["cast", "Collar"], ["trans", "Transition"]], FINISHES = [["metal", "Metal"], ["plastic", "Plastic"], ["rubber", "Rubber"]];
  const rbLook = (b, k) => (b.looks && b.looks[k]) || { c: b.colors.body, f: "metal" };
  function rbField(box, id, label, type, unit) {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = type === "color" ? `<label for="${id}">${label}</label><input id="${id}" type="color">` :
      `<label for="${id}">${label}</label><div class="unit-input"><input id="${id}" type="number" step="any"${type === "auto" ? ' placeholder="auto"' : ""}><span>${unit}</span></div>`;
    (typeof box === "string" ? $(box) : box).append(f);
    return f.querySelector("input");
  }
  function rbBuild() {                               // the inputs, once
    for (let i = 0; i < 6; i++) rbField("rb-dial", `rb-d${i}`, `Dial ${i + 1}`, "num", "RPM").dataset.k = `dial.${i}`;
    rbField("rb-s", "rb-s0", "Lowest accurate", "num", "RPM").dataset.k = "s.0";
    rbField("rb-s", "rb-s1", "Top speed", "num", "RPM").dataset.k = "s.1";
    for (const [k, i, l] of STACK) {                 // (a spindle: nut + nose, then its can)
      const el = rbField("rb-stack", `rb-${k}${i}`, l, "num", "mm");
      el.dataset.k = `body.${k}.${i}`;
      if (k !== "nut" && k !== "nose") el.closest(".field").classList.add("rb-router");
    }
    rbField("rb-stack", "rb-overall", "Overall height", "num", "mm").dataset.k = "body.overall";
    $("rb-overall").closest(".field").classList.add("rb-router");
    for (const [i, l] of [[0, "Can Ø"], [1, "Can length"]]) {
      const el = rbField("rb-stack", `rb-can${i}`, l, "num", "mm");
      el.dataset.k = `body.can.${i}`;
      el.closest(".field").classList.add("rb-spin");
    }
    const gch = rbField("rb-stack", "rb-gch", "Grip chamfer", "num", "mm");   // the grip's collet end, 45 deg
    gch.dataset.k = "body.grip_ch"; gch.title = "A 45° bevel round the grip's bottom edge (the collet end), this big";
    gch.closest(".field").classList.add("rb-router");
    $("rb-grip1").closest(".field").after(gch.closest(".field"));
    const lathe = document.createElement("div");    // the transition up to the head + the spindle lock
    lathe.className = "rb-router"; lathe.id = "rb-trans-box";
    lathe.innerHTML = '<div class="variant" id="rb-tshape"><span>Transition to the head</span><button type="button" data-v="round" aria-pressed="true">Round</button>' +
      '<button type="button" data-v="head" aria-pressed="false">To the head\'s shape</button></div><div class="rb-grid" id="rb-trans"></div>' +
      '<div class="variant" id="rb-tedge"><span>Where it meets the head</span><button type="button" data-v="none" aria-pressed="true">Plain</button>' +
      '<button type="button" data-v="fillet" aria-pressed="false">Fillet</button><button type="button" data-v="chamfer" aria-pressed="false">Chamfer</button></div>' +
      '<div class="rb-grid" id="rb-trans-e"></div><p class="foot" id="rb-t-emax" hidden></p>' +
      '<label class="check"><input type="checkbox" id="rb-lock-on"> Spindle lock button</label><div class="rb-grid" id="rb-lock"></div>';
    $("rb-stack").after(lathe);
    rbField("rb-trans", "rb-t-l", "Transition length", "num", "mm").dataset.k = "body.trans.l";
    rbField("rb-trans", "rb-t-d", "Top Ø", "num", "mm").dataset.k = "body.trans.d";
    rbField("rb-trans-e", "rb-t-e", "Fillet size", "num", "mm").dataset.k = "body.trans.e";
    for (const [k, l, u] of [["z", "Lock height", "mm"], ["a", "Lock angle", "°"], ["d", "Lock Ø", "mm"], ["r", "Lock reach", "mm"]])
      rbField("rb-lock", `rb-lock-${k}`, l, "num", u).dataset.k = `body.lock.${k}`;
    const nut = document.createElement("div");
    nut.className = "variant"; nut.id = "rb-nutkind";
    nut.innerHTML = '<span>Nut</span><button type="button" data-v="hex" aria-pressed="true">Hex</button><button type="button" data-v="round" aria-pressed="false">Round</button>';
    lathe.after(nut);
    const cool = document.createElement("div");
    cool.className = "variant rb-spin"; cool.id = "rb-cooling";
    cool.innerHTML = '<span>Cooling</span><button type="button" data-v="air" aria-pressed="true">Air (fan)</button><button type="button" data-v="water" aria-pressed="false">Water</button>';
    nut.after(cool);
    const cb = document.createElement("div");       // height in the mount (router.js rtDrop)
    cb.id = "rb-clampbox";
    cb.innerHTML = '<div class="rb-grid" id="rb-clampgrid"></div><p class="foot" id="rb-clampnote" hidden></p>';
    $("rb-mount").closest(".field").after(cb);
    rbField("rb-clampgrid", "rb-clamp", "Nut below the clamp", "num", "mm").dataset.k = "body.clamp";
    $("rb-clamp").title = "mm from the bottom of the collet nut up to the bottom of the mount's lower clamp: more = the router (and bit) sits lower";
    for (const [k, l] of HEAD) rbField("rb-head", `rb-h-${k}`, l, "num", "mm").dataset.k = `body.head.${k}`;
    rbField("rb-head", "rb-h-dd", "Dial Ø", "num", "mm").dataset.k = "body.head.dial.d";
    rbField("rb-head", "rb-h-dt", "Dial thickness", "num", "mm").dataset.k = "body.head.dial.t";
    for (const [k, l] of COLORS) rbField("rb-colors", `rb-c-${k}`, l, "color").dataset.c = k;
    for (const [k, l] of LOOKS) {                    // a color + a finish each
      const el = rbField("rb-colors", `rb-lk-${k}`, l, "color"), f = el.closest(".field"), sel = document.createElement("select");
      el.dataset.look = k;
      sel.id = `rb-lf-${k}`; sel.dataset.lookf = k; sel.setAttribute("aria-label", `${l} finish`);
      for (const [v, t] of FINISHES) sel.add(new Option(t, v));
      f.classList.add("rb-router", "rb-look");
      f.append(sel);
    }
  }
  const rbPath = (o, k) => k.split(".").reduce((a, p) => (a == null ? undefined : a[p]), o);
  function rbPut(o, k, v) {
    const ps = k.split("."), last = ps.pop();
    let a = o;
    for (const p of ps) { if (a[p] == null || typeof a[p] !== "object") a[p] = {}; a = a[p]; }
    if (Array.isArray(a) && k.startsWith("dial.")) a[last] = [+last + 1, v];
    else a[last] = v;
  }
  const rbCur = () => RT.set.router;
  function rbTrans(b) {                              // the transition, made if there's none yet (15 long, as wide as the collar)
    if (!b.trans) b.trans = { l: 15, d: (b.cast[0] > 0 && b.cast[1] > 0 ? b.cast : b.grip)[0], shape: "round", edge: "none", e: 3 };
    return b.trans;
  }
  function rbTransShow(b) {                          // the transition's buttons + which of its sizes apply
    const T = b.trans || { shape: "round", edge: "none" };
    for (const btn of $("rb-tshape").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === T.shape));
    for (const btn of $("rb-tedge").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === T.edge));
    $("rb-t-d").closest(".field").hidden = T.shape === "head";
    $("rb-trans-e").hidden = T.edge === "none";
    $("rb-t-e").closest(".field").querySelector("label").textContent = T.edge === "chamfer" ? "Chamfer size" : "Fillet size";
    const mx = b.trans ? LR4RouterBody.transEdgeMax(LR4RouterBody.expand(b)) : 0, note = $("rb-t-emax");
    note.textContent = T.edge !== "none" && (T.e || 0) > mx ? `Only ${mx} mm fits here (the head's size / the transition's length): drawn at ${mx}.` : "";
    note.hidden = !note.textContent;
    $("rb-t-e").title = `Up to ${mx} mm here`;
    if (!b.trans && document.activeElement !== $("rb-t-l")) $("rb-t-l").value = 0;
  }
  function rbShow() {                                // the inputs from the current router
    const id = rbCur(), r = LR4Routers.ROUTERS[id], p = LR4Routers.preset(id), b = p.body, spin = b.kind === "spindle";
    const simple = !spin && !!b.head && !b.slabs;
    for (const btn of $("rb-kind").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === (spin ? "spindle" : "router")));
    for (const el of document.querySelectorAll("#st-rt .rb-router")) el.hidden = spin;
    for (const el of document.querySelectorAll("#st-rt .rb-spin")) el.hidden = !spin;
    if (spin) for (const btn of $("rb-cooling").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === b.cooling));
    const pick = $("rb-pick");
    pick.length = 0;
    for (const [k, q] of Object.entries(LR4Routers.ROUTERS)) pick.add(new Option(q.name + (q.edited && !q.custom ? " (edited)" : ""), k));
    pick.value = id;
    $("rb-name").value = p.name;
    const man = p.source === "manual";
    for (const btn of $("rb-source").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === p.source));
    $("rb-dial").hidden = !man; $("rb-s").hidden = man;
    $("rb-mount").value = p.mount;
    for (const btn of $("rb-nutkind").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === b.nut[2]));
    if (simple) b.head.dial = typeof b.head.dial === "string" ? { place: b.head.dial } : Object.assign({ place: "end", d: 24, t: 6 }, b.head.dial);
    for (const el of document.querySelectorAll("#st-rt input[data-k]")) {
      const k = el.dataset.k, v = k.startsWith("dial.") ? (p.dial ? p.dial[+k.split(".")[1]][1] : "") : rbPath(p, k);
      if (document.activeElement !== el) el.value = v === undefined || v === null ? "" : v;
    }
    if (!spin) rbTransShow(b);
    const C = rtClamps(), clamp = b.clamp ?? (C ? C.def : 0);
    $("rb-clampbox").hidden = p.mount === "none" || !C;
    if (document.activeElement !== $("rb-clamp")) $("rb-clamp").value = clamp;
    const note = $("rb-clampnote"), off = [];
    if (C) {                                         // both clamps on the grip (a spindle: its can)?
      let g0 = b.nut[1], g1;
      if (spin) { g0 += b.nose[0] > 0 && b.nose[1] > 0 ? b.nose[1] : 0; g1 = g0 + b.can[1]; }
      else { for (const k of ["spindle", "nose"]) if (b[k] && b[k][0] > 0 && b[k][1] > 0) g0 += b[k][1]; g1 = g0 + b.grip[1]; }
      for (const [nm, [z0, z1]] of [["lower", C.lo], ["upper", C.hi]]) if (clamp + z0 < g0 - 0.5 || clamp + z1 > g1 + 0.5) off.push(nm);
      const where = spin ? "can" : "grip";
      note.textContent = off.length ? `The ${off.join(" and ")} clamp${off.length > 1 ? "s are" : " is"} off the ${where} ` +
        `(the ${where} runs ${g0.toFixed(0)} - ${g1.toFixed(0)} mm up from the nut; the clamps ${(clamp + C.lo[0]).toFixed(0)} - ${(clamp + C.lo[1]).toFixed(0)} ` +
        `and ${(clamp + C.hi[0]).toFixed(0)} - ${(clamp + C.hi[1]).toFixed(0)}).` : "";
    }
    note.hidden = !off.length || $("rb-clampbox").hidden;
    $("rb-lock-on").checked = !!b.lock; $("rb-lock").hidden = !b.lock;
    $("rb-detailed").hidden = simple || spin;
    $("rb-head").hidden = $("rb-dialplace").hidden = !simple;
    if (simple) for (const btn of $("rb-dialplace").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.v === b.head.dial.place));
    for (const [k] of COLORS) $(`rb-c-${k}`).value = rbHex(b.colors[k] || b.colors.cap);
    if (!spin) for (const [k] of LOOKS) { const L = rbLook(b, k); $(`rb-lk-${k}`).value = rbHex(L.c); $(`rb-lf-${k}`).value = L.f; }
    $("rb-reset").textContent = r.custom ? "Delete" : "Reset";
    $("rb-reset").disabled = !r.custom && !r.edited;
    $("sum-rt").textContent = r.name;
    rbTab(RB.tab);
    if (typeof rxTick === "function") rxTick();     // the numbers on the model, now
  }
  function rbLists() {                               // Run's router list + the job's dial-table list, from ROUTERS again
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
  const RB_HELP = { speed: "help-rb-speed", mount: "help-rb-mount", stack: "help-rb-stack", head: "help-rb-head" };
  RB.tab = kvGet("lr4-rb-tab");
  if (!RB_HELP[RB.tab] && RB.tab !== "colors") RB.tab = "speed";
  function rbTab(t) {
    if (t === "head" && LR4Routers.preset(rbCur()).body.kind === "spindle") t = "stack";   // a spindle has no head tab
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
    if (v) rbEdit((p) => { p.source = v; if (v === "gcode" && !p.s) p.s = [10000, 30000]; if (v === "manual" && !p.dial) p.dial = null; }, true);
  });
  $("rb-kind").addEventListener("click", (e) => {    // router <-> spindle: the other kind's body, the nut + colors kept
    const v = e.target.dataset && e.target.dataset.v;
    if (!v) return;
    rbEdit((p) => {
      const was = p.body.kind === "spindle" ? "spindle" : "router";
      if (v === was) return;
      const orig = LR4Routers.ROUTERS[rbCur()].custom ? null : LR4RouterData.routers[rbCur()];
      const tmpl = v === "spindle" ? LR4RouterData.routers.spindle65 : orig && orig.body.kind !== "spindle" ? orig : LR4RouterData.routers.makita;
      p.body = Object.assign(JSON.parse(JSON.stringify(tmpl.body)), { nut: p.body.nut, colors: p.body.colors });
      if (v === "spindle") { p.source = "gcode"; p.s = p.s || tmpl.s.slice(); p.mount = "makita"; }
    }, true);
  });
  $("rb-tshape").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { rbTrans(p.body).shape = v; }, true); });
  $("rb-tedge").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { const T = rbTrans(p.body); T.edge = v; if (!(T.e > 0)) T.e = 3; }, true); });
  $("st-rt").addEventListener("change", (e) => {     // a section's finish
    const k = e.target.dataset && e.target.dataset.lookf;
    if (k) rbEdit((p) => { const b = p.body; b.looks = Object.assign({}, b.looks, { [k]: { c: rbLook(b, k).c, f: e.target.value } }); }, true);
  });
  $("rb-lock-on").addEventListener("change", (e) => rbEdit((p) => {
    const b = p.body;
    if (!e.target.checked) { delete b.lock; return; }
    const nose = b.nose && b.nose[0] > 0 && b.nose[1] > 0 ? b.nose : [0, 0];
    b.lock = { z: +(b.nut[1] + (b.spindle ? b.spindle[1] : 0) + nose[1] / 2).toFixed(1), a: -50, d: 16, r: +(b.grip[0] / 2 - 3).toFixed(1) };
  }, true));
  $("rb-cooling").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { p.body.cooling = v; }, true); });
  $("rb-nutkind").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { p.body.nut[2] = v; }, true); });
  $("rb-dialplace").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) rbEdit((p) => { p.body.head.dial = Object.assign({}, p.body.head.dial, { place: v }); }, true); });
  $("st-rt").addEventListener("input", (e) => {
    const el = e.target, k = el.dataset.k, c = el.dataset.c;
    if (el.dataset.lookf) return;                    // (its change event)
    if (el.dataset.look) { const lk = el.dataset.look; rbEdit((p) => { const b = p.body; b.looks = Object.assign({}, b.looks, { [lk]: { c: rbRgb(el.value), f: rbLook(b, lk).f } }); }); return; }
    if (k) {
      const v = el.value.trim() === "" ? undefined : Number(el.value);
      if (v !== undefined && !Number.isFinite(v)) return;
      rbEdit((p) => {
        if (v === undefined) return;
        if (k === "body.overall" && p.body.head && !p.body.slabs) { p.body.head.H = v - LR4RouterBody.stackTop(p.body); return; }   // the head sits on the turned part: overall = its top + H
        if (k.startsWith("body.head.dial.") && typeof p.body.head.dial === "string") p.body.head.dial = { place: p.body.head.dial };
        if (k.startsWith("body.trans.")) rbTrans(p.body);   // typed into before there's one: made
        rbPut(p, k, v);
      });
    } else if (c) rbEdit((p) => { p.body.colors[c] = rbRgb(el.value); if (c === "dial") p.body.ring = [el.value, rbDark(el.value)]; });
  });
  $("rb-simple").addEventListener("click", () => rbEdit((p) => {   // the photo-modelled head -> a box the same size
    const out = LR4RouterBody.build(p.body).parts.head, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < out.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], out.pos[i + k]); hi[k] = Math.max(hi[k], out.pos[i + k]); }
    const b = p.body;
    const lk = (b.bosses || []).find((q) => q.name === "lock boss" && q.from_r);   // the Kobalt's lock -> the builder's
    if (lk) b.lock = { z: lk.from_r[2], a: lk.from_r[1], d: lk.d, r: +(lk.from_r[0] + lk.l).toFixed(1) };
    for (const k of ["slabs", "prisms", "bosses", "dial", "switch", "cord", "vents", "louvers", "labels", "pockets", "seam"]) delete b[k];
    b.head = { L: Math.round(hi[0] - lo[0]), W: Math.round(hi[1] - lo[1]), top_r: 8, front_r: 14, back_r: 14, bot_r: 4, dial: { place: "end", d: 24, t: 6 } };
    if ((lo[0] + hi[0]) / 2 > 1 || (lo[0] + hi[0]) / 2 < -1) b.head.at = [Math.round((lo[0] + hi[0]) / 2), 0];
  }, true));
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
    const p = LR4Routers.preset(rbCur()), blob = new Blob([JSON.stringify({ lr4_router: 1, router: p }, null, 2) + "\n"], { type: "application/json" });
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
    if (!p) { rbMsg(`${f.name} isn't a router file.`); return; }
    const id = LR4Routers.newId(p.name);
    rbApply(id, p, true);
    rtSet({ router: id });
    rbShow();
    rbMsg(`Added "${p.name}".`);
  });
  rbShow();
  // tests: the current preset, edit it (fn(p)), the stored edits
  window.LR4RouterBuild = { preset: () => LR4Routers.preset(rbCur()), edit: (fn) => rbEdit(fn, true), edits: () => JSON.parse(JSON.stringify(RB.edits)) };
