// lr4-sandbox page, part 7 of 13: On the table (stock, bit, touch plate, spoilboard), As built.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- On the table (Part 31, user 2026-10-23): the stock, the bit in the router and the touch plate, set up by hand
  // as at the real machine, and the spoilboard. A file with no (Stock:) line gets the hand stock and a bit it doesn't
  // define gets the router's (or the one picked at its tool change, kept per file in this browser), as a header before
  // the file (GcodePlay.header), so the file itself is unchanged. Every move carves (handTick): the stock (the job's,
  // else the hand one) and the spoilboard, a height field over the whole table top kept in IndexedDB per machine size
  // (HandSetup.board). Table frame: mm from the cutting area's front-left corner, Z up from the spoilboard's top. ----
  const defKey = (src) => "lr4-jobdef:" + (src.kind === "sd" ? src.name : src.kind);
  function defLoad(src) {
    try { return JSON.parse(MS.get(defKey(src)) || "null"); } catch (e) { return null; }
  }
  function handHeader(src) {
    const n = HandSetup.needs(src.text), saved = (defLoad(src) || {}).tools || {}, tools = {}, z0 = jobZ0(), s = HAND.stock;
    for (const t of n.tools) tools[t] = saved[t] || HAND.bit;
    // the surfacing job runs on the bare spoilboard
    const st = !n.stock && !n.surfacing && s.on ? { xmin: s.x0 - z0[0], xmax: s.x1 - z0[0], ymin: s.y0 - z0[1], ymax: s.y1 - z0[1], thick: s.t } : null;
    JOB.handStock = !!st;
    return GcodePlay.header(st, tools, n.inch);
  }
  // the cutting area's front-left corner on the table top, world mm: on the model router's own axis (it sits ~0.8 mm
  // off the nominal tool spot, placed by the dust shoe's notch), so the model bit is measured at machine zero (a plain
  // cylinder: its box centre is on the axis)
  function tableFrame() {
    const bb = tableBox();
    if (!bb || !meta) return null;
    const fr = [(bb.min.x + bb.max.x) / 2 - S.cutX / 2, (bb.min.y + bb.max.y) / 2 - S.cutY / 2, bb.max.z];
    const mb = meshes.find((m) => m.userData.name === "Router_Bit");
    if (mb) {
      const tv0 = meta.travel, was = HOME.pose && [HOME.pose.x, HOME.pose.y, HOME.pose.z];
      HAND.skip = true;
      AB.square = true;                              // the frame of the square machine (Part 32's errors are on top)
      move([tv0.x[0], tv0.y[0], 0]);
      AB.square = false;
      const g = mb.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      fr[0] = (g.boundingBox.min.x + g.boundingBox.max.x) / 2 * mb.scale.x + mb.position.x;
      fr[1] = (g.boundingBox.min.y + g.boundingBox.max.y) / 2 * mb.scale.y + mb.position.y;
      if (was) move(was);
    }
    return fr;
  }
  try { Object.assign(HAND, JSON.parse(MS.get("lr4-hand") || "{}")); } catch (e) { /* defaults */ }
  const handSave = () => { try { MS.set("lr4-hand", JSON.stringify({ stock: HAND.stock, bit: HAND.bit })); } catch (e) { /* not kept */ } };
  function handShow() {                              // which stock shows: the job's, else the hand one (Show the stock)
    const on = $("hs-show-stock").checked;
    if (HAND.mesh) HAND.mesh.visible = on && !JOB.stock;
    if (JOB.stock) JOB.stock.visible = on;
    stockName();
  }
  function stockName() {                             // On the table > Stock: what's on the table, the job's own too
    const s = HAND.stock, js = JOB.tl && JOB.stock && !JOB.handStock ? JOB.tl.stock : null;
    $("hs-stock-name").textContent = js ? `${+(js.xmax - js.xmin).toFixed(1)} × ${+(js.ymax - js.ymin).toFixed(1)} × ${+(js.zmax - js.zmin).toFixed(2)} mm, from the job`
      : s.on ? `${+(s.x1 - s.x0).toFixed(1)} × ${+(s.y1 - s.y0).toFixed(1)} × ${+s.t.toFixed(2)} mm` : "none";
  }
  function bitForm(box, b) {                         // fill / read a bit form (On the table > Bit, the tool-change popup)
    const q = (k) => box.querySelector(`[data-k="${k}"]`);
    if (b) { q("shape").value = b.shape; q("d").value = +(+b.d).toFixed(4); q("angle").value = b.angle || 90; q("len").value = b.len || 0; return b; }
    const d = parseFloat(q("d").value);
    return d > 0 ? { shape: q("shape").value, d, angle: parseFloat(q("angle").value) || 90, len: Math.max(0, parseFloat(q("len").value) || 0) } : null;
  }
  // a bit into the router: drawn instead of the model's bit (its stick-out: the model bit's length if 0), carves the
  // hand moves; what's in the router is kept for next time (a job's bit going in counts too)
  function handBit(b) {
    HAND.bit = Object.assign({}, b);
    HAND.tool = compileStockTool(HandSetup.toDef(b));
    handSave();
    $("hs-bit-name").textContent = HandSetup.bitName(b);
    bitForm($("hs-bit"), b);
    if (HAND.bitMesh) { scene.remove(HAND.bitMesh); HAND.bitMesh.geometry.dispose(); [].concat(HAND.bitMesh.material).forEach((m) => m.dispose()); HAND.bitMesh = null; }
    const rb = meshes.find((m) => m.userData.name === "Router_Bit");
    if (rb && meta) {
      const g = rb.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const len = b.len > 0 ? b.len : (g.boundingBox.max.z - g.boundingBox.min.z) * rb.scale.z;
      HAND.bitMesh = jobBitMesh(Object.assign(HandSetup.toDef(b), { overallLength: len, fluteLength: Math.min(len, b.d * 3) }), TOOL_RGB[0]);
      if (HAND.bitMesh) scene.add(HAND.bitMesh);
      applyVisibility();
      move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);
    }
  }
  // the hand stock (no job loaded): a StockSimulator in the table's frame, bottom on the spoilboard
  // Part 32: stock follows a warped spoilboard (always - user 2026-10-25, as clamped down): its sag over box (table
  // frame), or null (As built off: a flat board)
  function stockRest(box) { return AB.set.on && SPOIL.sim ? Imperfect.restField(SPOIL.sim, box) : null; }
  function handStock() {
    const s = HAND.stock, fr = SPOIL.frame, fol = AB.set.on ? SPOIL.ver : "flat";
    const key = `${JSON.stringify(s)}|${fr && fr.join()}|${lite}|${fol}`;
    stockName();
    stockFields(s);
    if (key === HAND.key) return;
    HAND.key = key;
    if (HAND.mesh) { scene.remove(HAND.mesh); HAND.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); HAND.mesh = null; }
    HAND.sim = null;
    if (!s.on || !fr) return;
    HAND.sim = Imperfect.attach(new StockSimulator({ xmin: s.x0, xmax: s.x1, ymin: s.y0, ymax: s.y1, zmin: 0, zmax: s.t }, new Map(), { maxCells: lite ? 1.2e5 : 4e5, snapshots: false }), [0, 0, 0], abState);
    const rest = stockRest({ x: [s.x0, s.x1], y: [s.y0, s.y1] });
    Imperfect.follow(HAND.sim, rest);
    HAND.mesh = jobStockMesh(HAND.sim, fr, undefined, rest && rest.at);
    scene.add(HAND.mesh);
    meshUpdate(HAND.sim, HAND.mesh, true);
    handShow();
  }
  // the spoilboard: the Spoilboard's top as a height field (Z 0 = its top when new), kept per machine (My machines) and size
  function spoilSetup() {
    const t = meshes.find((m) => m.userData.name === "Spoilboard"), fr = tableFrame();
    if (!t || !fr) return;
    const bb = new THREE.Box3().setFromObject(t), key = MS.spoilKey(`${S.cutX.toFixed(1)}x${S.cutY.toFixed(1)}`);
    const look = `${key}|${fr.map((v) => v.toFixed(2)).join()}|${lite}`;
    SPOIL.frame = fr;
    if (look === SPOIL.look) return;
    SPOIL.look = look;
    if (SPOIL.mesh) { scene.remove(SPOIL.mesh); SPOIL.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const st = { xmin: bb.min.x - fr[0], xmax: bb.max.x - fr[0], ymin: bb.min.y - fr[1], ymax: bb.max.y - fr[1], zmin: bb.min.z - fr[2], zmax: 0 };
    const keep = SPOIL.sim && SPOIL.key === key ? SPOIL.sim : null;
    SPOIL.sim = Imperfect.attach(new StockSimulator(st, new Map(), { maxCells: lite ? 1.5e5 : 6e5, snapshots: false }), [0, 0, 0], abState);
    if (keep) SPOIL.sim.heights.set(HandSetup.resample(keep.heights, keep.nx, keep.ny, SPOIL.sim.nx, SPOIL.sim.ny));
    else spoilFresh(SPOIL.sim);                      // until this size's kept board comes back (if any)
    SPOIL.key = key;
    SPOIL.mesh = jobStockMesh(SPOIL.sim, fr, MDF_RGB);
    spoilRef();
    scene.add(SPOIL.mesh);
    meshUpdate(SPOIL.sim, SPOIL.mesh, true);
    applyVisibility();
    HAND.key = "";                                   // the hand stock sits on it: placed again
    if (!keep) {                                     // this size's board from the last session
      const seq = ++SPOIL.loading, sim = SPOIL.sim;
      HandSetup.board.get(key).then((r) => {
        if (!r || seq !== SPOIL.loading || sim !== SPOIL.sim) return;
        sim.heights.set(r.nx === sim.nx && r.ny === sim.ny ? r.heights : HandSetup.resample(r.heights, r.nx, r.ny, sim.nx, sim.ny));
        sim.markAllDirty();
        meshUpdate(sim, SPOIL.mesh, true);
        SPOIL.laid = "laid" in r ? r.laid : spoilLaidGuess(sim);
        spoilRef();
        SPOIL.ver++;
        spoilNote();
        handStock();                                 // a stock following it: laid on this one
      }).catch(() => { /* none kept */ });
    }
    spoilNote();
  }
  // a new spoilboard: flat, or (As built) warped - its high spot at the top (Z 0); SPOIL.laid = that warp (null = flat)
  const spoilBox = () => ({ x: [0, S.cutX], y: [0, S.cutY] });
  function spoilFresh(sim) {
    SPOIL.laid = AB.set.on ? Object.assign({}, AB.set.warp) : null;
    SPOIL.ver++;
    if (SPOIL.laid) Imperfect.warpBoard(sim, SPOIL.laid, spoilBox());
    else { sim.heights.fill(0); sim.markAllDirty(); }
    spoilRef();
  }
  function spoilRef() {                              // the board's shading measures cuts from its surface as laid
    if (!SPOIL.sim || !SPOIL.mesh) return;
    const w = SPOIL.laid && typeof SPOIL.laid === "object" ? SPOIL.laid : null;
    setFresh(SPOIL.sim, SPOIL.mesh, w ? Imperfect.freshHeights(SPOIL.sim, w, spoilBox()).heights : null);
  }
  // a board kept before the warp was kept with it: flat or the warp now if it's still as laid, else not known (= cut)
  function spoilLaidGuess(sim) {
    if (!Imperfect.boardCut(sim, null, spoilBox())) return null;
    return AB.set.on && !Imperfect.boardCut(sim, AB.set.warp, spoilBox()) ? Object.assign({}, AB.set.warp) : undefined;
  }
  // As built's warp changed (or it went on / off): a board without cuts is laid again with it at once; one with cuts
  // only if ask (the form) and the user says so - else it stays, the warp waits for the next New spoilboard
  async function spoilRelay(ask) {
    if (!SPOIL.sim) return;
    const want = AB.set.on ? AB.set.warp : null;
    if (JSON.stringify(want) === JSON.stringify(SPOIL.laid)) return;
    if (Imperfect.boardCut(SPOIL.sim, SPOIL.laid, spoilBox()) &&
      !(ask && await askBox({ title: `Lay a new spoilboard ${want ? "with this warp" : "(flat)"}?`, text: "Its cuts go.", ok: "Lay it" }))) return;
    spoilFresh(SPOIL.sim);
    meshUpdate(SPOIL.sim, SPOIL.mesh, true);
    HandSetup.board.remove(SPOIL.key).catch(() => {});
    spoilNote();
  }
  function spoilNote() {
    if (!SPOIL.sim) return;
    const lv = HandSetup.level(SPOIL.sim, { x: [0, S.cutX], y: [0, S.cutY] });
    $("hs-spoil-note").textContent = `Keeps every cut that goes below the stock. ` +
      `Level now ${lv < -0.005 ? `${(-lv).toFixed(2)} mm below new (surfaced)` : "as new"}; ` +
      `${((SPOIL.sim.stock.zmax - SPOIL.sim.stock.zmin) + lv).toFixed(1)} mm thick.`;
  }
  function spoilSaveSoon() {                         // carving -> kept a moment later (not every frame)
    clearTimeout(SPOIL.saveTimer);
    SPOIL.saveTimer = setTimeout(() => { if (SPOIL.sim) HandSetup.board.put(SPOIL.key, SPOIL.sim, { laid: SPOIL.laid }).catch(() => {}); spoilNote(); }, 1500);
  }
  function handRefresh() { spoilSetup(); abGeo(); abNote(); handStock(); if (!HAND.tool) handBit(HAND.bit, false); }
  // the touch plate (button): under the bit on what's there - the stock if the bit is over it, else the spoilboard -
  // and wired to the probe at that surface + the plate; again = away. Jobs lay their own (fjPlate / jobSeek)
  function handPlate(on) {
    if (!on) HAND.plate = null;
    else {
      const p = HOME.pose, tv = meta.travel, x = p.x - tv.x[0], y = p.y - tv.y[0], z0 = jobZ0(), fr = SPOIL.frame || tableFrame();
      let z = null;
      if (JOB.sim) { const w = HandSetup.topAt(JOB.sim, x - z0[0], y - z0[1]); if (w !== null) z = w - JOB.tl.stock.zmin + Imperfect.restAt(JOB.sim, x, y); }
      else if (HAND.sim) { z = HandSetup.topAt(HAND.sim, x, y); if (z !== null) z += Imperfect.restAt(HAND.sim, x, y); }
      if (z === null || z < 0.01) z = SPOIL.sim ? HandSetup.topAt(SPOIL.sim, x, y) ?? 0 : 0;
      const thick = StrutCam.DEFAULTS.plate;
      HAND.plate = { world: true, x: fr[0] + x, y: fr[1] + y, wz: fr[2] + z, z, thick, tool: 0 };
      TOUCH_PLATE.stock = z; TOUCH_PLATE.plate = thick;
      $("hs-plate-note").textContent = `On the ${z > 0.01 && (JOB.sim || HAND.sim) ? "stock" : "spoilboard"} under the bit: its top ` +
        `${(z + thick).toFixed(2)} mm above the spoilboard. G38.2 down stops on it.`;
    }
    if (!on) $("hs-plate-note").textContent = "";
    $("ctl-plate").setAttribute("aria-pressed", String(!!on));
    $("ctl-plate").textContent = on ? "Put the touch plate away" : "Touch plate under the bit";
    ctlProbe();
    if (jobTouch(HAND.plate || null) && meta) move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);
  }
  $("ctl-plate").addEventListener("click", () => { if (meta && HOME.pose) handPlate(!HAND.plate); });
  // every move carves (once a frame): the tip's path since the last frame, with the router's bit, into the stock (the
  // job's, seen in its work frame, else the hand one) and the spoilboard - except a job's own moves (carved from the
  // job: jobSeek, fjTick) and the page's own jumps (HAND.skip: a scrub, a reload, measuring the router)
  // hand moves (jogs, the console, the pendant) carve from the motors, sampled every 4 ms as a running job's moves are
  // (job_fluidnc.js fjSample), not once a frame: with slow frames one sample a frame made a plunge then a slot one
  // diagonal, or nothing yet when the move had ended (test_page_hand on a software renderer, ~1 s a frame). The sims
  // are cut as the samples come; the frame only redraws them. Not while a job / Preview runs (they carve their own);
  // videos (CTL.recRaw: the pose at each frame's machine time) still carve frame to frame in handTick.
  function handCarve(a, b) {                         // tool tip a -> b, mm from the cutting area's front-left corner
    const d = HAND.dirty;
    if (JOB.sim) {
      const z0 = jobZ0(), zm = JOB.tl.stock.zmin;
      if (JOB.sim.sweep(a.x - z0[0], a.y - z0[1], a.z + zm, b.x - z0[0], b.y - z0[1], b.z + zm, HAND.tool)) d.job = true;
    } else if (HAND.sim && HAND.sim.sweep(a.x, a.y, a.z, b.x, b.y, b.z, HAND.tool)) d.hand = true;
    if (SPOIL.sim && Math.min(a.z, b.z) < 0 && SPOIL.sim.sweep(a.x, a.y, a.z, b.x, b.y, b.z, HAND.tool)) d.spoil = true;
  }
  function handSample() {
    if (!meta || !CTL.sim || CTL.sim.stopped || !CTL.boot || CTL.recRaw || FJ.job || JOB.playing || JOB.preview || !HAND.tool) { HAND.at = null; return; }
    const tv = meta.travel, p = ctlLive().map((v, i) => Math.min(Math.max(v, tv["xyz"[i]][0]), tv["xyz"[i]][1]));   // held as ctlTick holds it
    const q = { x: p[0] - tv.x[0], y: p[1] - tv.y[0], z: p[2] + meta.tip_above_table, sim: CTL.sim }, a = HAND.at;
    if (!a || a.sim !== CTL.sim) { HAND.at = q; return; }   // a new FluidNC (restart, power cycle): a new start, no line across
    if (Math.abs(a.x - q.x) + Math.abs(a.y - q.y) + Math.abs(a.z - q.z) <= 0.01) return;
    handCarve(a, q);
    HAND.at = q;
  }
  function handTick() {
    if (!HAND.timer) { HAND.dirty = {}; HAND.timer = setInterval(handSample, 4); }   // started with the frames (every script loaded)
    if (!meta || !HOME.pose) return;
    const tv = meta.travel, p = HOME.pose, now = { x: p.x - tv.x[0], y: p.y - tv.y[0], z: p.z + meta.tip_above_table };
    const prev = HAND.last;
    HAND.last = now;
    if (CTL.recRaw && !HAND.skip && !JOB.playing && !FJ.job && prev && HAND.tool && !JOB.preview &&
        (prev.x !== now.x || prev.y !== now.y || prev.z !== now.z)) handCarve(prev, now);
    HAND.skip = false;
    const d = HAND.dirty;
    HAND.dirty = {};
    if (d.job) jobUpdateMesh(false);
    if (d.hand) meshUpdate(HAND.sim, HAND.mesh, false);
    if (d.spoil) { meshUpdate(SPOIL.sim, SPOIL.mesh, false); spoilSaveSoon(); }
    return !!(d.job || d.hand || d.spoil);
  }
  // a tool change (M6, both modes): the popup asks for the bit - the file's ToolDef, or the one picked before for this
  // file, or what's in the router - and Resume puts it in (a bit the file doesn't define is kept for the file)
  function toolAsk(e) {
    // the file's own ToolDef (not the one handHeader put in front of it for a bit the file doesn't define)
    e = Object.assign({}, e, { defined: e.defined && !HandSetup.needs(JOB.src.text).tools.includes(e.tool) });
    const def = e.defined ? JOB.tl.tools.get(e.tool) : null, saved = ((defLoad(JOB.src) || {}).tools || {})[e.tool];
    JOB.toolAsk = e;
    bitForm($("job-pop-bit"), def ? HandSetup.fromDef(def) : saved || HAND.bit);
    $("job-pop-bit").hidden = false;
    $("job-pop-h").textContent = `Tool change (M6 T${e.tool}) - line ${e.lineNum}`;
    $("job-pop-msg").textContent = def ? `Put the file's T${e.tool} in the router (its ToolDef below), then resume.` :
      `The file doesn't say which bit T${e.tool} is: say here, put it in the router, then resume.`;
    $("job-resume").textContent = "Bit's in: resume";
  }
  function toolPut() {                               // Resume after a tool change: the picked bit goes in
    const e = JOB.toolAsk;
    JOB.toolAsk = null;
    $("job-pop-bit").hidden = true;
    if (!e || !JOB.tl) return;
    const b = bitForm($("job-pop-bit"));
    if (!b) return;
    handBit(b);
    if (e.defined) return;                           // the file's own: carved with its ToolDef
    const d = defLoad(JOB.src) || {};
    d.tools = Object.assign({}, d.tools, { [e.tool]: b });
    try { MS.set(defKey(JOB.src), JSON.stringify(d)); } catch (err) { /* not kept */ }
    // this job carves on with it (no reload: the stock keeps its cuts): its tool def, compiled, and its bit drawn
    const def = HandSetup.toDef(b), tool = compileStockTool(def);
    JOB.tl.tools.set(e.tool, def);
    if (tool) { if (JOB.sim) JOB.sim.tools.set(e.tool, tool); if (JOB.tools) JOB.tools.set(e.tool, tool); }
    if (JOB.bits) {
      const old = JOB.bits.get(e.tool), m = jobBitMesh(def, toolRgb(JOB.tl, e.tool));
      if (old) { JOB.group.remove(old); old.geometry.dispose(); }
      if (m) { m.visible = false; JOB.bits.set(e.tool, m); JOB.group.add(m); }
    }
  }
  // the Stock fields (user 2026-10-25: placed by size + position): width / depth / thickness, X / Y of its front-left
  // corner from the cutting area's; HAND.stock keeps x0 x1 y0 y1 t
  function stockFields(s) {
    for (const [id, v] of [["hs-w", s.x1 - s.x0], ["hs-d", s.y1 - s.y0], ["hs-t", s.t], ["hs-x", s.x0], ["hs-y", s.y0]]) $(id).value = +v.toFixed(2);
  }
  for (const id of ["hs-use", "hs-off"]) $(id).addEventListener("click", () => {
    const num = (k) => parseFloat($(k).value), x0 = num("hs-x"), y0 = num("hs-y");
    const s = { on: id === "hs-use", x0, x1: x0 + num("hs-w"), y0, y1: y0 + num("hs-d"), t: num("hs-t") };
    if (s.on && !(s.x1 > s.x0 && s.y1 > s.y0 && s.t > 0)) { $("hs-plate-note").textContent = "Stock: the width, depth and thickness must be above 0 (and X / Y numbers)."; return; }
    HAND.stock = s.on ? s : Object.assign({}, HAND.stock, { on: false });
    // Take it off takes a loaded job's own stock (its (Stock: ...) comment) off too: the job stays, with nothing to cut
    // (user 2026-10-24: the strut plate MDF couldn't be removed); Put it on the table brings stock back
    JOB.stockOff = !s.on && JOB.src && JOB.tl && JOB.tl.stock && !JOB.handStock ? JOB.src.name : null;
    handSave();
    handStock();
    jobSetup(JOB.pageJob);                           // a loaded job without its own stock takes it
  });
  $("hs-fit").addEventListener("click", () => {      // round the loaded job's cuts (work mm -> the table's)
    const g = JOB.tl && GcodePlay.missing(JOB.tl).guess, z0 = jobZ0();
    if (!g) return;
    stockFields({ x0: g.xmin + z0[0], x1: g.xmax + z0[0], y0: g.ymin + z0[1], y1: g.ymax + z0[1],
      t: JOB.tl.stock ? JOB.tl.stock.zmax - JOB.tl.stock.zmin : parseFloat($("hs-t").value) || 0 });
  });
  $("hs-bit-use").addEventListener("click", () => { const b = bitForm($("hs-bit")); if (b) { handBit(b); jobSetup(JOB.pageJob); } });
  $("hs-show-stock").addEventListener("change", handShow);
  $("hs-new").addEventListener("click", async () => {
    if (!SPOIL.sim || !await askBox({ title: "Start a new spoilboard?", text: "Every cut in this one goes (as swapping or resurfacing it).", ok: "New spoilboard" })) return;
    spoilFresh(SPOIL.sim);
    meshUpdate(SPOIL.sim, SPOIL.mesh, true);
    HandSetup.board.remove(SPOIL.key).catch(() => {});
    spoilNote();
    handStock();
  });
  $("hs-surf").addEventListener("click", async () => {   // a surfacing job for this cutting area onto the SD card
    if (!SPOIL.sim) return;
    const d = parseFloat($("hs-sd").value), over = parseFloat($("hs-so").value) / 100, depth = parseFloat($("hs-sz").value);
    if (!(d > 0 && over > 0 && over < 1 && depth > 0)) return;
    const z = HandSetup.level(SPOIL.sim, { x: [0, S.cutX], y: [0, S.cutY] }) - depth;
    const text = HandSetup.surfacing({ x: [0, S.cutX], y: [0, S.cutY], d, over, z });
    const path = "/LR4_surfacing.gcode";
    try { await SdCard.store.put(path, text); } catch (e) { /* the live card is enough */ }
    if (CTL.sim) SdCard.writeLive(CTL.sim, path, text);
    await sdRefresh();
    await sdSelect(path);
    $("hs-plate-note").textContent = `${path} on the SD card: ${d} mm bit, ${Math.round(over * 100)}% step-over, Z ${z.toFixed(2)} ` +
      `(${depth} mm below the spoilboard's level). Take the stock off first; it runs on the bare spoilboard.`;
  });
  // ---- As built (Part 32, user 2026-10-23): the machine a little out of square / level until it homes (each Y / Z
  // side its own switch, side 2's stops a little apart, the motors letting go when powered down), a warped spoilboard
  // and the router out of tram. AB (above) + js/imperfect.js; every stock sim carves through it (Imperfect.attach). ----
  function abYaml() { return CTL.yaml ? CTL.yaml : yamlBase ? yamlBase.text : null; }
  function abPulls() {                               // each side's pulloff_mm ([Min end, Max end]) in the config.yaml in use
    const y = abYaml(), p = AB.set.pull ? Object.assign(abPullsOf(y), AB.set.pull) : abPullsOf(y);   // pull: a video's stand-in
    return { y: Imperfect.bySide(p.y, AB.set), z: Imperfect.bySide(p.z, AB.set) };
  }
  function abPullsOf(y) {
    if (AB.pullMemo && AB.pullMemo.y === y) return Object.assign({}, AB.pullMemo.p);
    let v = {};
    try { if (y) v = parseFluidNCConfig(y).values; } catch (e) { /* V1E's values */ }
    AB.pullMemo = { y, p: Imperfect.pulloffs(v, Homing.V1E.y.pulloff) };
    return Object.assign({}, AB.pullMemo.p);
  }
  function abStops() {
    const h = Homing.settings(abYaml());
    return Imperfect.stops(AB.set, abPulls(), { y: h.y.positive, z: h.z.positive });
  }
  function abFromMotors() {                          // FluidNC: side 2 - side 1 from each motor's own steps
    if (!AB.set.on || !CTL.sim || !CTL.bootM || !CTL.cfg) return null;
    const ms = CTL.cfg.pins.motors, E = {};
    for (const a of ["y", "z"]) {
      const s2 = Imperfect.side2Motor(AB.set), k = [1 - s2, s2].map((n) => ms.findIndex((m) => m.axis === a && m.motor === n));   // [Min, Max]
      E[a] = k.some((i) => i < 0) ? AB.E[a] : k.map((i) => CTL.bootM[i] + CTL.sim.motorSteps(ms[i].step) / CTL.cfg.steps[a].to).reduce((s1, s2) => s2 - s1);
    }
    return E;
  }
  const abRedraw = () => { if (meta && HOME.pose) { HAND.skip = true; move([HOME.pose.x, HOME.pose.y, HOME.pose.z]); } };
  function abNote() {
    const f = (v) => Math.abs(v).toFixed(2), E = AB.E;
    $("ab-run").hidden = !AB.set.on;
    if (!AB.set.on) { $("ab-now").textContent = "Ideal: a perfect machine (square, level, flat, trammed)."; $("ab-stop-note").textContent = ""; return; }
    const st = abStops(), pl = abPulls(), h = Homing.settings(abYaml());
    const res = { y: Imperfect.residual(st.y, pl.y, h.y.positive), z: Imperfect.residual(st.z, pl.z, h.z.positive) };
    const rk = (v) => (Math.abs(v) < 0.005 ? "square" : `racked ${f(v)} mm (the Max side ${v > 0 ? "ahead" : "behind"})`);
    const lv = (v) => (Math.abs(v) < 0.005 ? "level" : `${f(v)} mm ${v > 0 ? "higher" : "lower"} at the Max end`);
    let t = `Now: the gantry ${rk(E.y)}, the beam ${lv(E.z)}`;
    if (AB.geo) t += `; a cutting-area rectangle's diagonals would differ by ${f(Imperfect.squareness(E, AB.geo, { x0: 0, x1: S.cutX, y0: 0, y1: S.cutY }).diff)} mm`;
    $("ab-now").textContent = t + `. $H leaves it ${rk(res.y)}, ${lv(res.z)}.`;
    // where each "stops apart" comes from: set here, what the pulloffs make up for, else a typical amount (equal pulloffs)
    const from = { set: "set here", pulloffs: "from your pulloffs", guess: "typical" };
    const why = [st.from.y, st.from.z].includes("guess") ? " Typical = a usual amount; your pulloffs are equal, so $H leaves it that far out." : "";
    $("ab-stop-note").textContent = `Stops apart: Y ${st.y.toFixed(2)} mm (${from[st.from.y]}), Z ${st.z.toFixed(2)} mm (${from[st.from.z]}). ` +
      `Pulloffs, Min / Max end: Y ${pl.y.join(" / ")}, Z ${pl.z.join(" / ")} mm.` + why;
  }
  let abNoteTimer = 0;
  const abNoteSoon = () => { if (!abNoteTimer) abNoteTimer = setTimeout(() => { abNoteTimer = 0; abNote(); }, 300); };
  function abForm() {
    const s = AB.set, v = (id, x) => { $(id).value = x === null || x === undefined || !Number.isFinite(+x) ? "" : +(+x).toFixed(4); };
    $("ab-on").checked = s.on; $("ab-power").checked = s.power;
    $("ab-mode").querySelectorAll("button[data-v]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.v === "real") === s.on)));
    $("ab-box").hidden = !s.on;                      // the errors only matter (and show) on Real-world
    v("ab-sy", s.stop.y); v("ab-sz", s.stop.z); v("ab-rm", s.rackMax); v("ab-tm", s.tiltMax);
    v("ab-wx", s.warp.x); v("ab-wy", s.warp.y); v("ab-wb", s.warp.bow); v("ab-tx", s.tram.x); v("ab-ty", s.tram.y);
    $("ab-ex").value = String(s.exag);
    $("ab-m0").querySelectorAll("button[data-v]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === s.motor0)));
  }
  function abRead() {
    const n = (id) => { const x = parseFloat($(id).value); return Number.isFinite(x) ? x : null; }, d = (id) => n(id) ?? 0;
    return { on: $("ab-on").checked, power: $("ab-power").checked, stop: { y: n("ab-sy"), z: n("ab-sz") }, rackMax: d("ab-rm"), tiltMax: d("ab-tm"),
      warp: { x: d("ab-wx"), y: d("ab-wy"), bow: d("ab-wb") }, tram: { x: d("ab-tx"), y: d("ab-ty") }, exag: Number($("ab-ex").value) || 1, motor0: AB.set.motor0 };
  }
  // a change (the form, LR4AsBuilt.set, a video): merged into the settings and kept; the switches + drawing follow, and
  // the spoilboard its warp (ask = the form: may ask to lay a cut board again)
  function abSet(ch, ask) {
    const cur = JSON.parse(JSON.stringify(AB.set));
    for (const [k, v] of Object.entries(ch || {})) {
      if (v && typeof v === "object" && cur[k] && typeof cur[k] === "object") Object.assign(cur[k], v); else cur[k] = v;
    }
    const rewired = cur.motor0 !== AB.set.motor0;
    AB.set = Imperfect.settings(cur);
    try { MS.set("lr4-asbuilt", JSON.stringify(AB.set)); } catch (e) { /* not kept */ }
    abForm();
    if (rewired && CTL.sim) ctlBoot();                // which motor is where: FluidNC restarts with each motor on its side
    else if (CTL.sim && CTL.bootM && meta) { ctlSwitches(); ctlProbe(); }
    spoilRelay(ask);
    handStock();                                     // the stock follows the board (or not) as As built now says
    abRedraw();
    abNote();
  }
  // power down and up: the gantry comes up racked, the beam off level, not homed (FluidNC restarts)
  function abPowerCycle() {
    AB.E = Imperfect.powerUp(AB.set);
    if (JOB.preview) previewEnd();
    ctlBoot();
    abRedraw();
    abNote();
  }
  for (const id of ["ab-on", "ab-power", "ab-sy", "ab-sz", "ab-rm", "ab-tm", "ab-wx", "ab-wy", "ab-wb", "ab-tx", "ab-ty", "ab-ex"])
    $(id).addEventListener("change", () => abSet(abRead(), true));
  $("ab-cycle").addEventListener("click", abPowerCycle);
  $("ab-mode").addEventListener("click", (e) => {    // Ideal | Real-world = the hidden ab-on checkbox (tests / videos set it)
    const b = e.target.closest("button[data-v]");
    if (b && (b.dataset.v === "real") !== $("ab-on").checked) { $("ab-on").checked = b.dataset.v === "real"; abSet(abRead(), true); }
  });
  $("ab-m0").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) abSet({ motor0: b.dataset.v }); });
  // the squareness test's rectangle: 25 mm in from the cutting area; deep enough that the V-groove is ~2 of the
  // spoilboard sim's cells wide (Measure reads it to ~0.1 mm then; 1 mm deep would fall between its points): 2.5 mm,
  // 5 in Lite
  function abSqRect() {
    const m = 25, cell = SPOIL.sim ? Math.max(SPOIL.sim.dx, SPOIL.sim.dy) : 1.3;
    return { x: m, y: m, w: S.cutX - 2 * m, h: S.cutY - 2 * m, z: -Math.max(1, Math.ceil(cell * 3.6) / 2) };
  }
  // read the test off the cut: its corner crosses in the job's stock, the hand stock or the spoilboard
  function abMeasure() {
    const r = abSqRect(), J = JOB.sim && JOB.sim._asBuilt;
    const srcs = [JOB.sim && { sim: JOB.sim, off: J ? J.toTable : [0, 0, 0] }, HAND.sim && { sim: HAND.sim, off: [0, 0, 0] }, SPOIL.sim && { sim: SPOIL.sim, off: [0, 0, 0] }];
    const q = Imperfect.readSquare(srcs.filter(Boolean), { x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h });
    const names = ["front-left", "front-right", "back-right", "back-left"];
    $("ab-sq-note").textContent = q.missing ? `No cross cut at the ${q.missing.map((k) => names[k]).join(", ")} corner${q.missing.length > 1 ? "s" : ""}: run the squareness test first.` :
      `Measured off the cut: diagonals ${q.d1.toFixed(2)} / ${q.d2.toFixed(2)} mm, ${Math.abs(q.diff).toFixed(2)} apart` +
      (Math.abs(q.diff) < 0.1 ? " - square (as near as the sim reads, ~0.1 mm)." : ` - out of square (the front edge ${Math.abs(q.skew * 60).toFixed(1)}' off X).`);
    return q;
  }
  $("ab-meas").addEventListener("click", abMeasure);
  $("ab-sq").addEventListener("click", async () => {   // a squareness test over the cutting area onto the SD card
    const r = abSqRect();
    const text = Imperfect.squareJob(r), path = "/LR4_squareness.gcode";
    try { await SdCard.store.put(path, text); } catch (e) { /* the live card is enough */ }
    if (CTL.sim) SdCard.writeLive(CTL.sim, path, text);
    await sdRefresh();
    await sdSelect(path);
    const q = AB.geo && Imperfect.squareness(AB.E, AB.geo, { x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h });
    $("ab-sq-note").textContent = `${path} on the SD card: a ${r.w.toFixed(0)} × ${r.h.toFixed(0)} mm rectangle, ${-r.z} mm deep with a 60° V-bit, ` +
      `crosses at the corners. Measure corner to corner both ways (or Measure the diagonals once it's cut): equal = square.` +
      (q ? ` As the machine is now: ${q.d1.toFixed(2)} / ${q.d2.toFixed(2)} mm (${Math.abs(q.diff).toFixed(2)} apart).` : "");
  });
  abForm();
  window.LR4AsBuilt = { get: () => JSON.parse(JSON.stringify(AB.set)), set: abSet, E: () => Object.assign({}, AB.E), powerCycle: abPowerCycle,
    setE(E) { AB.E = { y: +E.y || 0, z: +E.z || 0 }; abRedraw(); abNote(); }, geo: () => AB.geo, stops: abStops, pulls: abPulls,
    measure: abMeasure, sqRect: abSqRect, laid: () => SPOIL.laid, tipErr: (x) => Imperfect.tipErr(AB.E, AB.geo, x),
    tip() { const rb = meshes.find((m) => m.userData.name === "Router_Bit"), p = rb && bitTip(rb), fr = SPOIL.frame; return p && fr ? [p.x - fr[0], p.y - fr[1], p.z - fr[2]] : null; },
    note: () => $("ab-now").textContent,
    drawn() {                                        // the drawing's rack (gantry, about Z) and tilt (beam, about Y), radians
      const q = (k) => { const m = meshes.find((n) => n.userData.motion === k); return m ? m.quaternion : null; }, g = q("gantry"), b = q("beam");
      return { rack: g ? 2 * Math.atan2(g.z, g.w) : null, tilt: b ? -2 * Math.atan2(b.y, b.w) : null, span: AB.piv && AB.piv.span };
    } };
  const clock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}`) +
    `:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function jobSeek(s, carve = true) {                // Preview: the model to time s; the stock copy carved up to it
    const tl = JOB.tl;
    if (!tl) return;
    JOB.t = Math.min(Math.max(s, 0), tl.total);
    const p = GcodePlay.at(tl, JOB.t), tv = meta.travel, at = JOB.at, tableZ = at[2] + (tl.stock ? tl.stock.zmin : 0);
    if (carve && JOB.sim) JOB.sim.advanceTo(p.index, 15, p.progress);   // (never the spoilboard: Run cuts that)
    HAND.skip = true;                               // the job's own moves: carved from the job, not as hand moves
    jobUpdateMesh(false);
    JOB.done.geometry.setDrawRange(0, 2 * p.index);
    if (p.index < tl.segs.length) {                  // the move in progress: its start to the bit, in its colour
      const sg = tl.segs[p.index], P = JOB.partial.geometry.attributes.position, C = JOB.partial.geometry.attributes.color;
      P.array.set([at[0] + sg.start.x, at[1] + sg.start.y, at[2] + sg.start.z, at[0] + p.x, at[1] + p.y, at[2] + p.z]);
      C.array.set(JOB.moveRgb.subarray(6 * p.index, 6 * p.index + 6));
      P.needsUpdate = C.needsUpdate = true;
      JOB.partial.geometry.setDrawRange(0, 2);
    } else JOB.partial.geometry.setDrawRange(0, 0);
    // each probe (one per tool change): the plate on the stock from its attach pause until resumed past the next
    const pw = tl.plates.find((q) => JOB.t >= q.t0 && JOB.t < q.t1) || null;   // off at its remove pause (going home while it waits)
    jobTouch(pw);
    jobCloseUp(pw);
    const clamp = (v, r) => Math.min(Math.max(v, r[0]), r[1]);
    // work zero is the cutting area's corner = slider 0 (+ jobZ0); the tip's height above the table = stock + work Z
    const z0 = jobZ0(), mx = clamp(p.x + tv.x[0] + z0[0], tv.x), my = clamp(p.y + tv.y[0] + z0[1], tv.y);
    // the bit turns while the job runs, but not with the touch plate out (the router is off for the probe)
    JOB.spinning = JOB.playing && !probing;
    // Z too stops at its bottom stop (the Z nut on the couplers): a job asking for more is cut short there - the bit
    // needs to stick out further (jobZShort says how much; the carving still follows the file)
    const zLow = tv.z[0] + tableZ + meta.tip_above_table - at[2];   // the lowest work Z the bit reaches
    const pz = Math.max(p.z, zLow);
    move([mx, my, at[2] + pz - tableZ - meta.tip_above_table]);
    if (JOB.bits) {
      const sg = tl.segs[Math.min(p.index, tl.segs.length - 1)], b = JOB.bits.get(sg.toolNumber) || JOB.bits.values().next().value;
      for (const q of JOB.bits.values()) q.visible = bitOK && q === b;
      if (b) { b.position.set(at[0] + mx - tv.x[0] - z0[0], at[1] + my - tv.y[0] - z0[1], at[2] + pz); b.rotation.z = JOB.spinning ? JOB.spin : 0; }
    }
    $("wx").textContent = p.x.toFixed(3); $("wy").textContent = p.y.toFixed(3); $("wz").textContent = p.z.toFixed(3);
    $("job-t").value = Math.round(JOB.t / tl.total * 1000);
    $("job-o").textContent = clock(JOB.t);
    if (JOB.preview) pvLines(tl, p.index);
    const m = GcodePlay.message(tl, JOB.t), done = JOB.t >= tl.total;
    const short = jobZShort(tl, zLow);
    $("job-status").textContent = `${done ? "Done. " : ""}${m ? m.text : ""}` + (short > 0.05 ? ` This job goes ` +
      `${short.toFixed(1)} mm below the bottom of Z: the bit needs to stick out that much further.` : "");
    if (done) jobPlaying(false);
  }
  function pvLines(tl, i) {                          // Preview's player: the file's line at this move, one either side
    const sg = tl.segs[Math.min(i, tl.segs.length - 1)], n = sg && sg.srcLine, box = $("pv-lines");
    if (!n || n === JOB.pvLine) return;
    JOB.pvLine = n;
    if (!JOB.srcLines || JOB.srcLines.text !== JOB.src.text) JOB.srcLines = { text: JOB.src.text, lines: JOB.src.text.split("\n") };
    box.textContent = "";
    for (let k = Math.max(1, n - 1); k <= Math.min(JOB.srcLines.lines.length, n + 1); k++) {
      const d = document.createElement("div");
      d.textContent = `${k}  ${JOB.srcLines.lines[k - 1].replace(/\r$/, "")}`;
      if (k === n) d.className = "cur";
      box.append(d);
    }
    $("pv-line").textContent = `line ${n.toLocaleString()}`;
  }
  function jobZShort(tl, zLow) {                     // how far the job's lowest Z is below the reach (cached per job)
    if (JOB.zMinFor !== tl) {
      JOB.zMinFor = tl;
      JOB.zMin = Math.min(...tl.segs.map((q) => Math.min(q.start.z, q.end.z)));
    }
    return zLow - JOB.zMin;
  }
  function jobPlaying(on) {
    JOB.playing = !!JOB.preview && on && !!JOB.tl && JOB.t < JOB.tl.total;
    if (JOB.playing) $("job-pop").hidden = true;
    fjButtons();
  }
  // ---- Preview (Part 34, user 2026-10-24; was Basic mode): "what happens if I press Run now". Plays the loaded file
  // fast (1-100x, scrub) from where FluidNC is, laid out as Run lays it out (fjPrepare's G54), the file's own G38.2 P /
  // G10 L20 / G92 on the parser's copy of the offsets (GcodePlay), never sent to FluidNC. It carves a throwaway copy
  // of the stock (put back on the way out), never the spoilboard; a tool change's bit goes back too. Back to the
  // machine (or FluidNC moving: ctlTick) snaps the model back to where FluidNC is. ----
  async function previewStart() {
    if (!JOB.tl || FJ.job || JOB.preview) return;
    if (CTL.homed && CTL.sim) {                     // lay it out from where the machine is now, as Run would
      const p = ctlRaw(), from = jobSpot();
      if (!from || ["x", "y", "z"].some((a, i) => Math.abs(p[i] - from[a]) > 0.005)) {
        CTL.runFrom = { x: p[0], y: p[1], z: p[2] };
        await jobSetup(JOB.pageJob);
        if (!JOB.tl || FJ.job || JOB.preview) return;
      }
    }
    JOB.preview = { heights: JOB.sim ? JOB.sim.heights.slice() : null, carved: JOB.sim ? JOB.sim.carvedIndex : 0,
      bit: HAND.bit && Object.assign({}, HAND.bit) };
    if (JOB.sim) JOB.sim.reset();
    if (JOB.bits && JOB.bits.size && !jobBit) { jobBit = true; applyVisibility(); }   // the job's bits ride the router
    JOB.k = 0; JOB.pvLine = null;
    jobSeek(0);
    $("job-prev").setAttribute("aria-pressed", "true");
    $("job-prev-note").hidden = false;
    const warn = previewWarnings();
    $("job-status").textContent = (CTL.homed ? "Preview from where FluidNC is." : "Preview: FluidNC isn't homed, so " +
      "Run won't start yet; previewed from work zero (the cutting area's front-left corner, Z on the stock top).") + warn;
    jobPlaying(true);
  }
  function previewWarnings() {                       // below the spoilboard, past the travel (Run would do the same)
    const tl = JOB.tl, st = tl.stock, w = [];
    jobZShort(tl, 0);                                // (caches JOB.zMin)
    if (st && JOB.zMin < st.zmin - 0.01) w.push(`it cuts ${(st.zmin - JOB.zMin).toFixed(2)} mm into the spoilboard (not shown here; Run cuts it)`);
    if (!JOB.fits) w.push("some moves are past the machine's travel");
    return w.length ? ` Note: ${w.join("; ")}.` : "";
  }
  function previewEnd(why) {
    const P = JOB.preview;
    if (!P) return;
    JOB.preview = null;
    jobPlaying(false);
    $("job-pop").hidden = true;
    if (JOB.sim && P.heights) {                      // the stock as it was: the preview's carve was a copy
      JOB.sim.heights.set(P.heights);
      JOB.sim.carvedIndex = P.carved;
      JOB.sim.markAllDirty();
      jobUpdateMesh(true);
    }
    if (P.bit && JSON.stringify(P.bit) !== JSON.stringify(HAND.bit)) handBit(P.bit);
    if (JOB.bits) for (const b of JOB.bits.values()) b.visible = false;
    if (jobBit) { jobBit = false; applyVisibility(); }
    JOB.done.geometry.setDrawRange(0, 0); JOB.partial.geometry.setDrawRange(0, 0);
    jobTouch(null); jobCloseUp(null);
    JOB.t = 0; JOB.k = 0;
    HAND.skip = true;                                // back to FluidNC's pose: not a cut
    if (CTL.pose) move(CTL.pose);
    $("job-prev").setAttribute("aria-pressed", "false");
    $("job-prev-note").hidden = true;
    $("job-status").textContent = why || "Back to the machine.";
    fjButtons();
  }
  function jobStop(e) {                              // M0, a failed probe or a tool change: hold
    jobPlaying(false);
    $("job-pop-h").textContent = e.kind === "alarm" ? "Alarm" : `Paused (M0) - line ${e.lineNum}`;
    $("job-pop-msg").textContent = e.kind === "pause" ? GcodePlay.pauseText(JOB.tl, e) : e.text;
    $("job-resume").textContent = e.kind === "alarm" ? "Carry on anyway" : "Resume (cycle start)";
    $("job-pop-bit").hidden = true;
    if (e.kind === "tool") toolAsk(e);
    $("job-pop").hidden = false;
    $("job-status").textContent = $("job-pop-msg").textContent;   // not the MSG lines after the M0 yet
    jobTouch(JOB.tl.plates.find((q) => JOB.t >= q.t0 && JOB.t < q.t1) || null);
  }
  function jobTick() {
    const now = performance.now(), dt = Math.min((now - (JOB.last || now)) / 1000, 0.5);   // wall time: the speed holds on
    JOB.last = now;                                                                       // a slow GPU (tick's dt is capped)
    if (!JOB.tl) return;
    if (JOB.playing) {
      JOB.spin = ((JOB.spin || 0) - dt * 2 * Math.PI) % (2 * Math.PI);   // clockwise from above, 1 turn/s, as cnc-gcode-tools
      const r = GcodePlay.step(JOB.tl, JOB.t, dt, JOB.rate || +$("job-speed").value, JOB.k);   // rate: LR4Demo.rate (videos)
      JOB.k = r.k;
      jobSeek(r.t);
      if (r.stop) jobStop(r.stop);
    } else if (FJ.job) fjTick();
    else if (JOB.sim && JOB.preview) {               // catch up after a scrub (carving is spread over frames)
      const p = GcodePlay.at(JOB.tl, JOB.t);
      if (JOB.sim.carvedIndex < p.index) { JOB.sim.advanceTo(p.index, 15, p.progress); jobUpdateMesh(false); }
    }
  }
  $("job-play").addEventListener("click", () => {
    if (!JOB.tl) return;
    if (!JOB.preview) {                              // Run / Hold / Resume on FluidNC
      if (!FJ.job) fjRun();
      else if (CTL.sim) { if (FJ.job.held) resumeWhenSettled(() => CTL.sim && CTL.sim.realtime("~")); else CTL.sim.realtime("!"); }
      return;
    }
    if (!JOB.playing && JOB.t >= JOB.tl.total) { jobSeek(0); JOB.k = 0; }
    jobPlaying(!JOB.playing);
  });
  $("job-prev").addEventListener("click", () => (JOB.preview ? previewEnd() : previewStart()));
  $("job-resume").addEventListener("click", () => {
    if ($("job-resume").disabled) return;
    if (JOB.toolAsk) toolPut();
    resumeWhenSettled(() => {                        // the popup stays up (saying so) while the touch plate moves
      $("job-pop").hidden = true;
      if (JOB.preview) jobPlaying(true);
      else if (CTL.sim && FJ.job) CTL.sim.realtime("~");
    });
  });
  {                                                  // drag the pause popup anywhere over the view (kept till reload)
    for (const pop of [$("job-pop"), $("ft-pop")]) {
    let grab = null;
    pop.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button, canvas")) return;
      const r = pop.getBoundingClientRect(), host = pop.parentElement.getBoundingClientRect();
      grab = { dx: e.clientX - r.left, dy: e.clientY - r.top, host };
      pop.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    pop.addEventListener("pointermove", (e) => {
      if (!grab) return;
      const { host } = grab, w = pop.offsetWidth, h = pop.offsetHeight;
      const x = Math.min(Math.max(e.clientX - grab.dx - host.left, 0), host.width - w);
      const y = Math.min(Math.max(e.clientY - grab.dy - host.top, 0), host.height - h);
      Object.assign(pop.style, { left: `${x}px`, top: `${y}px`, transform: "none" });
    });
    const drop = () => { grab = null; };
    pop.addEventListener("pointerup", drop);
    pop.addEventListener("pointercancel", drop);
    }
  }
  $("job-reset").addEventListener("click", () => {
    if (!JOB.preview) {                              // Stop = soft reset: FluidNC drops the job (ALARM:3 if it was moving)
      if (CTL.sim && FJ.job) { CTL.sim.realtime(0x18); fjDone("Stopped (reset)."); }
      return;
    }
    jobPlaying(false); $("job-pop").hidden = true; jobSeek(0); JOB.k = 0;
  });
