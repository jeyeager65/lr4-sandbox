// lr4-sandbox page: the router + its speed dial (Part 45a, user 2026-10-27; LR4Routers in js/routers.js). The page's
// scripts share one global scope. RT: machine.js.
  // ---- which router (Run > Router), its dial on the model: drag it (up / right = faster), click = the next whole
  // number, the mouse wheel = a stop (0.5) a notch, every way snaps to the 0.5 stops; a big readout while it turns. A manual router's dial sets the speed (sound,
  // chip load, heat, the bit's turn follow it); a G-code router (AutoSpin T1) takes the file's S and ignores its
  // dial. Kept per machine (lr4-router). The dial's numbers are a ring on Router_Dial (a child: it rides every pose
  // and the tram lean; not in meshes, so no picking or printed look), turned about the router's axis. ----
  const RT_KEY = "lr4-router";
  // the dust shoe's height in its slot (the router's model.shoe, mm + up - the Mount panel): the upper shoe + the lower one
  // on it (skirt, bristles), not its screw (machine.js move; user 2026-11-01)
  const SHOE_ADJ = /^(Dust_Shoe_Kobalt$|Dust_Skirt|Bristles_TPU)/;
  const rtShoe = () => { const r = LR4Routers.ROUTERS[RT.set.router]; return (r && r.model && r.model.shoe) || 0; };
  try { RT.set = LR4Routers.settings(JSON.parse(MS.get(RT_KEY) || "null")); } catch (e) { /* defaults */ }
  function rtSave() { try { MS.set(RT_KEY, JSON.stringify(RT.set)); } catch (e) { /* not kept */ } }
  const rtRpmText = (v) => `~${(Math.round(v / 100) * 100).toLocaleString("en-US")} RPM`;
  function rtSet(o, why) {                           // o: { router?, dial? }; why: "drag" / "wheel" / "click" (readout)
    const was = RT.set;
    RT.set = LR4Routers.settings(Object.assign({}, RT.set, o));
    if (RT.set.router !== was.router) { RT.noted = null; rtSwap(); }   // a note again for the new router; its model
    rtSave();
    rtLook();
    if (RT.set.router !== was.router && typeof rbShow === "function") rbShow();   // My LR4 > Router (router_build.js)
    if (RT.set.router !== was.router && typeof optsRefresh === "function") optsRefresh();   // mount None: no shoe / hose (panel.js)
    if (RT.set.router !== was.router && typeof renderFiles === "function" && needed) renderFiles();   // its mount set's files in Parts
    if (why) rtReadout();
    return RT.set;
  }
  // the dial wheel's look (user's photos 2026-10-28: the Makita's and the Kobalt's are the same style; Part 46d from the
  // makers' close-ups: fine sharp ridges, small numbers on narrow lands): ridges all round its edge, white numbers 1..6
  // on flat lands DIAL_STEP deg apart (number d at the texture's u 0.25 + (d - 1) x step / 360). RING: ridge pitch (8 to
  // a step, so every land sits on the same phase), land half-width (deg), ridge height, the rim's edges rounded (mm).
  // ringColor: the wheel + its groove bottoms (the preset's dial.ring: Kobalt black, Makita red)
  const RING = { pitch: LR4Routers.DIAL_STEP / 8, land: 5.5, rise: 0.5, round: 0.5 };
  const ringColor = (id) => { const r = LR4Routers.ROUTERS[id]; return (r && r.model.dial && r.model.dial.ring) || ["#202022", "#0b0b0c"]; };

  // ---- the router's model, the page's own (Part 45b step 2, user 2026-10-29: "page decoupled from the FreeCAD
  // router"): built from its preset (web/data/routers.js, js/router_body.js) - one mesh per part, each with its look -
  // and the model bit, on the mount's clamp axis. The size build's Router_* parts are left out (scene.js rebuild).
  // RT_MOUNTS: each V1E mount's lower clamp (its part), the clamp's axis from that part's ref box corner (x, y; the
  // bit's centre in the build) and the build's nut-below-the-clamp; the upper clamp too (the builder's note). The
  // frame's +x (the switch end) is the machine's +x. A new router swaps the meshes (rtSwap: mid-job too). ----
  // Part 45c: the Makita 701 / T1 and DeWalt 611 sets are drawn on the Kobalt parts' records (scene.js mountAlt: their
  // files share the Kobalt files' frame); their bores (circle fits of the STLs' rings, against the Kobalt's -0.8 = the
  // build's ROUTER_AXIS_IN_KOBALT) sit -0.55 / +1.575 mm along the file's x = -y here: d 65.8 / 69.9
  const RT_MOUNTS = {
    kobalt: { B: "Tool_Mount_B_Kobalt", T: "Tool_Mount_T_Kobalt", axis: [49.4, 44.35], clamp: 36.5 },
    makita: { B: "Tool_Mount_B_Kobalt", T: "Tool_Mount_T_Kobalt", axis: [49.4, 44.9], clamp: 36.5 },
    dewalt: { B: "Tool_Mount_B_Kobalt", T: "Tool_Mount_T_Kobalt", axis: [49.4, 42.775], clamp: 36.5 },
  };
  const rtMountOf = (r) => RT_MOUNTS[r && RT_MOUNTS[r.mount] ? r.mount : "kobalt"];
  // each part's mesh name + label (the bit end: the collet, the thread and the shaft above the nut are inside it)
  const RT_MESH = { collet_nut: ["Router_ColletNut", "Collet nut"], collet: ["Router_Collet", "Collet"], thread: ["Router_Thread", "Shaft thread"],
    shaft: ["Router_Shaft", "Shaft"], bearing_cap: ["Router_BearingCap", "Bearing cap"], housing: ["Router_Housing", "Motor housing"],
    collar: ["Router_Collar", "Collar"], transition: ["Router_Transition", "Transition"], motor_cap: ["Router_MotorCap", "Motor cap"],
    dial: ["Router_Dial", "Speed dial"], switch: ["Router_Switch", "Switch"], shaft_lock: ["Router_ShaftLock", "Shaft lock"], lock_boss: ["Router_LockBoss", "Shaft lock boss"], brush_cap: ["Router_BrushCap", "Brush caps"], brush_ring: ["Router_BrushRing", "Brush cap borders"],
    strain_relief: ["Router_StrainRelief", "Strain relief"], cord: ["Router_Cord", "Cord"], trim: ["Router_Trim", "Trim"] };
  const RT_OWN = /^Router_(?!Cord_Run$)/;                          // the page's router meshes (+ the bit)
  // the model bit (a 1/8" 2-flute end mill 20 mm out of the nut, as the size build's): GUESS until the bit settings say
  const RT_BIT = { shape: "flat", d: 3.175, stickout: 20, flen: 12, len: 38 };
  function rtRec(n) { return typeof cfg !== "undefined" && cfg && cfg.parts ? cfg.parts.find((p) => p.key === n) : null; }
  function rtClamps() {                              // the clamps from the lower clamp's bottom: { def, lo: [z0, z1], hi: [z0, z1] }
    if (typeof cfg === "undefined" || !cfg || !cfg.parts) return null;   // (no model yet)
    const M = rtMountOf(LR4Routers.ROUTERS[RT.set.router]);
    if (RT.clampOf === cfg && RT.clampM === M) return RT.clamps;
    const B = rtRec(M.B), T = rtRec(M.T);
    RT.clampOf = cfg; RT.clampM = M;
    RT.clamps = B && T && B.lo_ref ? { def: rtClampDef(M, B), lo: [0, B.hi_ref[2] - B.lo_ref[2]], hi: [T.lo_ref[2] - B.lo_ref[2], T.hi_ref[2] - B.lo_ref[2]] } : null;
    return RT.clamps;
  }
  // the default nut-below-the-clamp: the nut's bottom level with the core's bottom (else the build's)
  function rtClampDef(M, B) { const C = rtRec("Core"); return C && C.lo_ref ? +(B.lo_ref[2] - C.lo_ref[2]).toFixed(2) : M.clamp; }
  // the router frame (ref build coords): on the clamp axis, z = the nut's bottom (the router's height in the mount:
  // model.clamp = mm from the nut's bottom up to the lower clamp's bottom, kept with the router)
  function rtFrame(r) {
    const M = rtMountOf(r), B = rtRec(M.B);
    if (!B || !B.lo_ref) return null;
    const clamp = r.model.clamp ?? rtClampDef(M, B);
    return { o: [B.lo_ref[0] + M.axis[0], B.lo_ref[1] + M.axis[1], B.lo_ref[2] - clamp], a: 0, mount: M.B };
  }
  function rtBody() {                                // the current router's built model + frame (kept until either changes)
    const r = LR4Routers.ROUTERS[RT.set.router], f = r && rtFrame(r);
    if (!f) return null;
    const key = JSON.stringify(f) + (window.LR4Csg && LR4Csg.ready() ? "+csg" : "");   // (rebuilt once the pockets can be cut)
    if (!RT.body || RT.body.id !== RT.set.router || RT.body.key !== key) RT.body = { id: RT.set.router, key, f, b: LR4RouterBody.build(r.model) };
    return RT.body;
  }
  // a look -> its material (scene.js material: metal reflects the environment)
  function rtMaterial(L) {
    if (L.f === "metal") return material(null, { c: L.c, r: 0.34 });
    const m = material(L.c, null);
    m.roughness = L.f === "rubber" ? 0.88 : 0.5;
    return m;
  }
  function rtBitGeo(f) {                             // the model bit, tip down at its stickout under the nut, in the ref frame
    const B = RT_BIT, mb = jobBitMesh(Object.assign(HandSetup.toDef({ shape: B.shape, d: B.d }), { overallLength: B.len, fluteLength: B.flen }), "#9ea2a8");
    const geo = mb.geometry;
    for (const m of mb.material) m.dispose();
    geo.clearGroups();
    geo.translate(f.o[0], f.o[1], f.o[2] - B.stickout);
    return geo;
  }
  // the router's meshes for scene.js rebuild: [geo, mat, ud] each, riding the mount's instance (inst: LR4Model.instances)
  function rtMeshes(inst) {
    const B = rtBody(), r = LR4Routers.ROUTERS[RT.set.router];
    if (!B) return [];
    const mi = inst.find((o) => o.name === B.f.mount), base = mi ? { t: mi.t, s: mi.s } : { t: [0, 0, 0], s: [1, 1, 1] };
    const ud0 = { group: "Core", motion: "core", source: "hardware", base, ownGeo: true };
    const out = [], looks = r.model.looks;
    RT.mountBuilt = r.mount;                         // (rtSwap: another mount's parts = a rebuild)
    for (const [part, [name, label]] of Object.entries(RT_MESH)) {
      const m = B.b.parts[part];
      if (!m || !m.idx.length) continue;
      const p = LR4RouterBody.place(m, B.f), geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(p.pos, 3));
      geo.setIndex(p.idx);
      const L = looks[part === "thread" ? "shaft" : part] || looks.trim;
      const ud = Object.assign({}, ud0, { name, label: part === "housing" ? `${label} (${r.name})` : label, color: L.c, rtPart: part });
      if (part === "switch") {
        const off = B.b.parts.switch_off, po = LR4RouterBody.place(off, B.f), g2 = new THREE.BufferGeometry();
        g2.setAttribute("position", new THREE.Float32BufferAttribute(po.pos, 3));
        g2.setIndex(po.idx);
        const on = dress(geo, null, false), offG = dress(g2, null, false);   // power.js: on / off; its face: rtRockerFace
        ud.rocker = B.b.rocker ? { on, off: offG, c: LR4RouterBody.placeV(B.b.rocker.c, B.f), a: B.f.a, tip: B.b.rocker.a * Math.PI / 180, size: B.b.rocker.size } : null;
        out.push([on, rtMaterial(L), ud]);
        continue;
      }
      if (part === "dial") {                         // the wheel's centre, axis and the rim that shows (ref frame)
        const d = B.b.dial;
        ud.dial = d && { c: LR4RouterBody.placeV(d.c, B.f), axis: LR4RouterBody.placeV(d.axis, B.f, true), out: LR4RouterBody.placeV(d.out, B.f, true), r: d.r, t: d.t, ribs: d.ribs, marks: d.marks, dome: d.dome, bevel: d.bevel };
      }
      if (part === "shaft_lock" && B.b.z.lock) ud.lockDir = LR4RouterBody.placeV(B.b.z.lock.dir, B.f, true);
      out.push([dress(geo, null, false), rtMaterial(L), ud]);
    }
    rtClashSoon();                                   // once they're in the scene: does it hit the core?
    out.push([rtBitGeo(B.f), material(null, { c: [0.72, 0.73, 0.75], r: 0.28 }), Object.assign({}, ud0, { name: "Router_Bit", label: "Router bit", color: [0.62, 0.64, 0.67] })]);
    return out;
  }
  // the cord leaves where this router's does: the build's tip moved by (this router's - the build's). RT_BUILD_TIP = the
  // size build's cord tip in the router frame: tools/router_export.js's default (Kobalt) preset, build/router/router.json
  // cord.tip (full size refresh 2026-11-01; was the old hw.kobalt_k7tr03 stub, -108.1, 27.4, 196)
  const RT_BUILD_TIP = [-103.62, 27.39, 185.0];
  function rtHose(h) {
    const B = rtBody(), M = rtMountOf(LR4Routers.ROUTERS[RT.set.router]), r = LR4Routers.ROUTERS[RT.set.router];
    if (!B || !h.cord || !h.cord.tip) return;
    if (!h.cord.tip0) Object.assign(h.cord, { tip0: h.cord.tip.slice(), tip20: h.cord.tip2.slice() });
    const kob = RT_BUILD_TIP.slice(), c = B.b.cord;   // where the size build's cord tip is, in the router frame at its clamp
    kob[2] -= (r.model.clamp ?? M.clamp) - M.clamp;
    const w = (v) => LR4RouterBody.placeV(v, B.f, true);
    const dt = w(c.tip.map((v, i) => v - kob[i])), L = Math.hypot(...h.cord.tip20.map((v, i) => v - h.cord.tip0[i]));
    h.cord.tip = h.cord.tip0.map((v, i) => v + dt[i]);
    const dir = w(c.dir);
    h.cord.tip2 = h.cord.tip.map((v, i) => v + dir[i] * L);
    if (c.base) {                                    // Part 53: the strain relief's base - the cord rope starts there (hose_bom.js)
      h.cord.base = h.cord.tip0.map((v, i) => v + w(c.base.map((q, k) => q - kob[k]))[i]);
      h.cord.baseDir = w(c.baseDir); h.cord.relief = Object.assign({}, c.relief);
    }
  }
  // ---- does the router hit the core? (user 2026-11-01, the Kobalt's new head): the router's parts as columns on a 1 mm
  // grid from above, each the z spans inside one part (its closed mesh: the crossings sorted, paired); the core's
  // surface sampled ~1.5 mm apart round them - a point over 0.5 mm into a span is a clash. Run a moment after a router's
  // meshes are made; the Router step (its dot too) and the router editor say which part and how far. ----
  // what it's checked against: the core, and the dust shoe (its height in the slot - the router's model.shoe - can bring it up to the
  // router: the Kobalt's lock collar, user 2026-11-01)
  const RT_CLASH_CORE = /^(Core|Bearing_Core_|Dust_Shoe_Kobalt$)/, RT_CLASH_CELL = 1, RT_CLASH_MIN = 0.5;
  const rtClashWhat = (n) => (/^Dust_Shoe/.test(n) ? "the dust shoe" : "the core");
  function rtClashSoon() { clearTimeout(RT.clashT); RT.clashT = setTimeout(rtClashShow, 400); }
  function rtTris(m, fn) {                           // each triangle of m in world coordinates
    const g = m.geometry, pa = g.attributes.position, ix = g.index, n = ix ? ix.count : pa.count;
    m.updateMatrixWorld();
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), M = m.matrixWorld;
    for (let i = 0; i + 2 < n; i += 3) {
      A.fromBufferAttribute(pa, ix ? ix.getX(i) : i).applyMatrix4(M); B.fromBufferAttribute(pa, ix ? ix.getX(i + 1) : i + 1).applyMatrix4(M);
      C.fromBufferAttribute(pa, ix ? ix.getX(i + 2) : i + 2).applyMatrix4(M);
      fn(A, B, C);
    }
  }
  function rtClash() {                               // [{ label, depth (mm), n (points) }] worst first, or null (nothing to check)
    const parts = meshes.filter((m) => RT_OWN.test(m.userData.name || "") && m.userData.name !== "Router_Bit" && m.geometry);
    // (the shoe drawn is the Kobalt's while the router's mount files aren't loaded: not the router's, left out)
    const noShoe = typeof mountMissing === "function" && mountMissing().length > 0;
    const core = meshes.filter((m) => RT_CLASH_CORE.test(m.userData.name || "") && m.geometry && !(noShoe && /^Dust_Shoe/.test(m.userData.name)));
    if (!parts.length || !core.length) return null;
    const box = new THREE.Box3();
    for (const m of parts) box.expandByObject(m);
    const S = RT_CLASH_CELL, x0 = box.min.x, y0 = box.min.y, nx = Math.ceil((box.max.x - x0) / S) + 1, ny = Math.ceil((box.max.y - y0) / S) + 1;
    const cols = parts.map(() => new Map());         // per part: cell -> its crossings' z
    parts.forEach((m, k) => rtTris(m, (A, B, C) => {  // each cell centre under the triangle: the triangle's z there
      const d = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
      if (Math.abs(d) < 1e-9) return;                 // edge-on from above
      const i0 = Math.max(0, Math.ceil((Math.min(A.x, B.x, C.x) - x0) / S - 0.5)), i1 = Math.min(nx - 1, Math.floor((Math.max(A.x, B.x, C.x) - x0) / S - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(A.y, B.y, C.y) - y0) / S - 0.5)), j1 = Math.min(ny - 1, Math.floor((Math.max(A.y, B.y, C.y) - y0) / S - 0.5));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const px = x0 + (i + 0.5) * S, py = y0 + (j + 0.5) * S;
        const u = ((B.x - px) * (C.y - py) - (C.x - px) * (B.y - py)) / d, v = ((C.x - px) * (A.y - py) - (A.x - px) * (C.y - py)) / d, w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const key = i * ny + j, a = cols[k].get(key);
        const z = u * A.z + v * B.z + w * C.z;
        if (a) a.push(z); else cols[k].set(key, [z]);
      }
    }));
    for (const c of cols) for (const [key, a] of c) a.sort((p, q) => p - q);
    const hit = new Map(), pad = new THREE.Box3().copy(box).expandByScalar(1), P = new THREE.Vector3(), pts = [];
    let what = "";                                    // the target being sampled (the core / the dust shoe)
    const test = (p) => {                             // a core point: into which part's span, how far (vertically)
      const i = Math.floor((p.x - x0) / S), j = Math.floor((p.y - y0) / S);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return;
      for (let k = 0; k < parts.length; k++) {
        const a = cols[k].get(i * ny + j);
        if (!a) continue;
        for (let q = 0; q + 1 < a.length; q += 2) {
          const dz = Math.min(p.z - a[q], a[q + 1] - p.z);
          if (dz > RT_CLASH_MIN) {
            const key = k + "|" + what, h = hit.get(key) || { k, what, depth: 0, n: 0 };
            h.n++; h.depth = Math.max(h.depth, dz); hit.set(key, h);
            if (pts.length < 90000) pts.push(p.x, p.y, p.z);
          }
        }
      }
    };
    for (const m of core) { what = rtClashWhat(m.userData.name); rtTris(m, (A, B, C) => {
      if (!pad.containsPoint(A) && !pad.containsPoint(B) && !pad.containsPoint(C)) return;
      const s = Math.min(12, Math.ceil(Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A)) / 1.5));
      for (let u = 0; u <= s; u++) for (let w = 0; w <= s - u; w++) {
        P.copy(A).multiplyScalar(1 - (u + w) / s || 0).addScaledVector(B, s ? u / s : 0).addScaledVector(C, s ? w / s : 0);
        test(P);
      }
    }); }
    const out = [...hit.values()].map((h) => ({ label: (parts[h.k].userData.label || parts[h.k].userData.name).replace(/ \(.*\)$/, ""), what: h.what,
      depth: +h.depth.toFixed(1), n: h.n })).sort((a, b) => b.depth - a.depth);
    out.pts = pts;                                   // where (world): the core's points inside the router
    return out;
  }
  function rtClashShow() {
    if (typeof meshes === "undefined") return;
    const h = rtClash(), r = LR4Routers.ROUTERS[RT.set.router];
    RT.clash = h;
    const hs = meshes.find((m) => m.userData.name === "Router_Housing");   // its points in the housing's frame (they ride along)
    if (hs && h) { hs.updateMatrixWorld(); const inv = hs.matrixWorld.clone().invert(), v = new THREE.Vector3(), a = new Float32Array(h.pts.length);
      for (let i = 0; i < a.length; i += 3) v.set(h.pts[i], h.pts[i + 1], h.pts[i + 2]).applyMatrix4(inv).toArray(a, i);
      RT.clashPts = { mesh: hs, a }; } else RT.clashPts = null;
    if (typeof rxSliceDots === "function") rxSliceDots();
    const miss = typeof mountMissing === "function" ? mountMissing() : [], mn = r && { makita: "Makita 701 / T1", dewalt: "DeWalt 611" }[r.mount];
    const tm = miss.length ? `The ${mn || "router's"} mount's files aren't loaded (${miss.map((f) => f.split("/").pop()).join(", ")}): the Kobalt's mounts and ` +
      "dust shoe are drawn in their place, so the fit here isn't this router's. Load them with Parts (top right). " : "";
    const t = tm + (h && h.length ? `The ${r ? r.name : "router"} runs into ${h.slice(0, 3).map((q) => `${q.what} (its ${q.label.toLowerCase()}, ~${q.depth} mm)`).join(", ")}. ` +
      "Check its sizes or the shoe's height in its slot (Edit router > Slice: tick Core under Show to see the core)." : "");
    for (const id of ["rb-clash", "rte-clash"]) { const el = document.getElementById(id); if (el) { el.textContent = t; el.hidden = !t; } }
    const dot = document.getElementById("dot-rt"); if (dot) dot.hidden = !t;
  }
  function rtSwap() {                                // a new router (or its model edited): its meshes in place of the old
    if (typeof meshes === "undefined" || typeof meta === "undefined" || !meta || typeof cfg === "undefined" || !cfg) return;
    const rr = LR4Routers.ROUTERS[RT.set.router];
    if (rr && rr.model.kind === "spindle") PWR.body = true;   // a spindle has no switch of its own to leave off
    if (rr && RT.mountBuilt && RT.mountBuilt !== rr.mount && typeof rebuild === "function") { rebuild(); return; }   // its mount's parts too
    for (const m of meshes.filter((q) => RT_OWN.test(q.userData.name || ""))) {
      scene.remove(m);
      m.geometry.dispose();
      if (m.userData.rocker) { m.userData.rocker.on.dispose(); m.userData.rocker.off.dispose(); }
      if (m.userData.ring) m.userData.ring.geometry.dispose();
      m.material.dispose();
    }
    meshes = meshes.filter((q) => !RT_OWN.test(q.userData.name || ""));
    for (const [geo, mat, ud] of rtMeshes(LR4Model.instances(cfg, S))) addMesh(geo, mat, ud);
    meta.parts = meshes;
    if (RT.body && RT.body.b.noSwitch) PWR.body = true;   // a spindle has no switch of its own to leave off
    if (meta.hose && meta.hose.cord) { rtHose(meta.hose); if (typeof makeHose === "function" && hoseMesh) makeHose(); }
    if (typeof applyVisibility === "function") applyVisibility();
    if (typeof powerLook === "function") powerLook();   // the rocker as the switch is (power.js; it moves the machine back too)
    else move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);
    if (typeof abGeo === "function") abGeo();
    if (typeof renderBom === "function") renderBom();   // the BOM's router + mount rows (hose_bom.js)
  }
  const ringTheta = (d) => 90 + (d - LR4Routers.DIAL[0]) * LR4Routers.DIAL_STEP;   // deg round the cylinder (u x 360)
  // a dial's ridge pattern: n ridges between two numbers (dial.ribs, user 2026-10-31), the land round each number the
  // old share of the pitch (n 7 = RING's pitch + land)
  const ringPat = (n) => { const p = LR4Routers.DIAL_STEP / ((n ?? 7) + 1); return { pitch: p, land: p * RING.land / RING.pitch }; };
  function ringLand(deg, P = RING) {                 // on a number's land: |deg - its centre| < P.land
    const D = LR4Routers.DIAL;
    for (let d = D[0]; d <= D[1]; d++) { const k = Math.abs((((deg - ringTheta(d)) % 360) + 540) % 360 - 180); if (k < P.land) return true; }
    return false;
  }
  // radius out from the wheel at deg: lands flush with the ridge tops, grooves down to the wheel's own radius
  const ringRise = (deg, P = RING) => ringLand(deg, P) ? RING.rise * 0.8 : RING.rise * (1 - Math.abs(Math.sin(Math.PI * (deg - ringTheta(1)) / P.pitch)));   // sharp crests
  function rtRingGeo(r, h, P = RING) {
    const geo = new THREE.CylinderGeometry(r, r, h, 720, 16, true), p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {              // (its top + bottom edges rounded over RING.round)
      const y = uv.getY(i) * h, q = Math.max(0, 1 - Math.min(y, h - y) / RING.round);
      const th = uv.getX(i) * 2 * Math.PI, R = r + ringRise(uv.getX(i) * 360, P) * (1 - q) - RING.round * (1 - Math.sqrt(1 - q * q));
      p.setX(i, R * Math.sin(th)); p.setZ(i, R * Math.cos(th));
    }
    geo.computeVertexNormals();
    geo.userData.mm = { band: h, circ: 2 * Math.PI * r, h: Math.min(h * 0.5, 3.5) };
    return geo.rotateX(Math.PI / 2);
  }
  // a domed dial's band: the rim + the dome up to its flat top, the rim ridged (as rtRingGeo), the dome smooth with the
  // numbers on it (geometry.userData.v = how far up the band). Same frame as rtRingGeo: axis z, centred, u = deg / 360.
  // A beveled one (the Makita's): the ridges run up the bevel too, the numbers flat on it, halfway up
  function rtDomeRingGeo(D) {
    const prof = LR4RouterBody.dialProfile({ d: D.r * 2 + 0.1, t: D.t, dome: D.dome, bevel: D.bevel }, 16).slice(0, -1), P = ringPat(D.ribs);
    const s = [0];
    for (let j = 1; j < prof.length; j++) s.push(s[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
    const N = 720, M = prof.length, pos = [], uv = [], idx = [];
    for (let j = 0; j < M; j++) for (let i = 0; i <= N; i++) {
      const u = i / N, th = u * 2 * Math.PI, [r, h] = prof[j], R = r + ((D.bevel || h <= D.t / 2 + 1e-6) && h > 0 ? ringRise(u * 360, P) : 0);   // ridged rim (+ bevel), smooth dome
      pos.push(R * Math.sin(th), -R * Math.cos(th), h - D.t / 2);
      uv.push(u, s[j] / s[M - 1]);
    }
    for (let j = 0; j + 1 < M; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + N + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);         // faces out
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const k = prof.findIndex(([, h]) => h > D.t / 2 + 1e-6);                 // where the dome starts
    geo.userData.v = +((D.bevel ? (s[k - 1] + s[k]) / 2 : s[k] + 0.45 * (s[M - 1] - s[k])) / s[M - 1]).toFixed(3);   // on the dome, toward its outer edge (room for them); halfway up a bevel
    geo.userData.vRim = D.bevel ? null : +(s[k - 1] / s[M - 1]).toFixed(3);   // the ridged rim's top (a bevel: ridged all the way)
    const sv = geo.userData.v * s[M - 1], j = s.findIndex((q) => q >= sv), f = j > 0 ? (sv - s[j - 1]) / (s[j] - s[j - 1] || 1) : 0;
    geo.userData.mm = { band: s[M - 1], circ: 2 * Math.PI * (j > 0 ? prof[j - 1][0] + f * (prof[j][0] - prof[j - 1][0]) : prof[0][0]), h: 2.6 };   // (the numbers' size)
    return geo;
  }
  function rtRingTex(col, v, vRim, mm, P = RING, marks = null) {   // marks: the six stops' labels (else 1-6)             // v: the numbers' height up the band (0 bottom .. 1 top); none = a plain rim;
    // mm: { band, circ, h } the band's length up + its circumference there (mm), the numbers' height: drawn true to size
    const c = document.createElement("canvas"), W = 2048, H = v ? 192 : 96, g = c.getContext("2d");
    c.width = W; c.height = H;
    g.fillStyle = col[0]; g.fillRect(0, 0, W, H);
    g.fillStyle = col[1];                            // the groove bottoms a little darker
    for (let deg = ringTheta(1) + P.pitch / 2 - 360; deg < 360; deg += P.pitch) {
      const x = ((deg % 360) + 360) % 360 / 360 * W;
      if (!ringLand(deg, P)) g.fillRect(x - 3, vRim ? H * (1 - vRim) : 0, 6, H);   // (a domed band: on its rim only)
    }
    const D = LR4Routers.DIAL;
    const px = W / mm.circ, sy = (H / mm.band) / px;   // canvas px per mm across; the band's px per mm up, relative
    g.fillStyle = "#f4f4f4"; g.textAlign = "center"; g.textBaseline = "middle"; const nh = mm.h * Math.min(1.5, Math.sqrt(P.land / RING.land));   // (fewer ridges, a wider land: bigger numbers; 7 = as before)
    g.font = `bold ${Math.round(nh * px / 0.72)}px sans-serif`;
    for (let d = D[0]; d <= D[1]; d++) {
      g.save(); g.translate(ringTheta(d) / 360 * W, v ? H * (1 - v) : H / 2); g.scale(1, sy);
      g.fillText(marks ? marks[d - D[0]] : String(d), 0, 0.04 * nh * px);
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // the rocker's face, marked O | I in white (user: too dark to read as 3D), tipped with it: on = its "I" (+y) end in
  function rtRockerFace(m, on) {
    const R = m.userData.rocker;
    if (!R) return;
    let p = m.userData.faceObj;
    if (!p) {
      const c = document.createElement("canvas"), W = 512, H = Math.round(W * R.size[2] / R.size[1]), g = c.getContext("2d");
      c.width = W; c.height = H;
      g.strokeStyle = g.fillStyle = "#e8e8e8"; g.lineWidth = H * 0.045;
      g.beginPath(); g.arc(W * 0.3, H / 2, H * 0.12, 0, 2 * Math.PI); g.stroke();   // O (off) on the -y half, I (on) on the +y
      g.fillRect(W * 0.7 - H * 0.0225, H * 0.37, H * 0.045, H * 0.26);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      p = m.userData.faceObj = new THREE.Mesh(new THREE.PlaneGeometry(R.size[1], R.size[2]),
        new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
      p.castShadow = false;
      m.add(p);
    }
    const a = R.a + (on ? R.tip : -R.tip), n = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), up = new THREE.Vector3(0, 0, 1);
    p.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(up.clone().cross(n), up, n));
    p.position.set(...R.c).addScaledVector(n, R.size[0] / 2 + 0.05);
  }
  function rtLook() {
    if (RT.rbFor !== RT.clampOf && rtClamps() && typeof rbShow === "function") { RT.rbFor = RT.clampOf; rbShow(); }   // the Router step's clamp, once a model is in
    const dm = typeof meshes !== "undefined" && meshes.find((m) => m.userData.name === "Router_Dial");
    const D = dm && dm.userData.dial;                 // the preset's wheel (rtMeshes): any axis (a spindle: no dial)
    if (D) {
      let ring = dm.userData.ring;
      if (!ring) {
        const ax = new THREE.Vector3(...D.axis).normalize(), ox = new THREE.Vector3(...D.out).normalize();
        const pivot = new THREE.Object3D();          // x = the rim that shows, z = the wheel's axis
        pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ox, ax.clone().cross(ox), ax));
        pivot.position.set(...D.c);
        ring = new THREE.Mesh(D.dome || D.bevel ? rtDomeRingGeo(D) : rtRingGeo(D.r + 0.05, D.t * 0.96, ringPat(D.ribs)), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }));
        ring.castShadow = false;
        pivot.add(ring);
        dm.add(pivot);
        dm.userData.ring = ring;
      }
      // a G-code router with an S stop (the T1's spindle mode): turned to S - its speed comes from the file, not the dial
      const rr = LR4Routers.ROUTERS[RT.set.router], sAt = D.marks ? D.marks.indexOf("S") : -1;
      ring.rotation.z = -LR4Routers.dialDeg(rr && rr.source === "gcode" && sAt >= 0 ? LR4Routers.DIAL[0] + sAt : RT.set.dial) * Math.PI / 180;
      const col = ringColor(RT.set.router), gv = ring.geometry.userData, key = [col.join(), gv.v, gv.vRim, gv.mm.band.toFixed(2), gv.mm.circ.toFixed(2), D.ribs ?? 7, (D.marks || []).join()].join("|");   // one texture per look + size, kept
      RT.texs = RT.texs || {};
      if (!RT.texs[key]) RT.texs[key] = rtRingTex(col, gv.v, gv.vRim, gv.mm, ringPat(D.ribs), D.marks);
      if (ring.material.map !== RT.texs[key]) { ring.material.map = RT.texs[key]; ring.material.needsUpdate = true; }
    }
    const sel = $("rt-router"), man = LR4Routers.manual(RT.set.router);
    if (!sel.options.length) for (const [k, r] of Object.entries(LR4Routers.ROUTERS)) sel.add(new Option(r.name, k));
    sel.value = RT.set.router;
    const dial = $("rt-dial");
    dial.value = RT.set.dial; dial.disabled = !man;
    $("rt-dial-v").textContent = man ? RT.set.dial.toFixed(1) : "-";
    $("rt-rpm").textContent = man ? rtRpmText(LR4Routers.dialRpm(RT.set.dial, RT.set.router)) : "speed = the G-code's S";
  }
  // the big readout over the view while the dial turns (fades 1.5 s after the last turn)
  function rtReadout() {
    let el = RT.readout;
    if (!el) { el = RT.readout = document.createElement("div"); el.className = "rt-readout"; el.setAttribute("aria-live", "polite"); canvas.parentElement.appendChild(el); }
    const man = LR4Routers.manual(RT.set.router);
    el.innerHTML = man ? `<b>Dial ${LR4Routers.dialMark(RT.set.dial, RT.set.router)}</b><span>${rtRpmText(LR4Routers.dialRpm(RT.set.dial, RT.set.router))}</span>` :
      `<b>${LR4Routers.ROUTERS[RT.set.router].name}</b><span>its speed comes from the G-code (S)</span>`;
    el.classList.add("on");
    clearTimeout(RT.fade);
    RT.fade = setTimeout(() => el.classList.remove("on"), 1500);
  }
  // a note once per router-on line of the job (scripting.js soundJob): the file's dial vs this one, S vs a G-code router
  function rtNote(plan, line) {
    let ev = null;
    for (const e of (plan && plan.events) || []) { if (e.line > line) break; ev = e; }
    if (!ev || ev === RT.noted) return;
    RT.noted = ev;
    const n = LR4Routers.note(RT.set, ev), el = $("rt-note");
    el.textContent = n; el.hidden = !n;
    if (n) ctlAdd(n, "err");
  }
  {                                                  // the dial in the view + Run's row
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), stage = canvas.parentElement;
    const onDial = (e, all) => {                     // all: blocked by parts in front (a press); else the dial only (hover)
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const list = meshes.filter((q) => q.visible && !q.userData.shadowOnly && (all || q.userData.name === "Router_Dial"));
      const h = ray.intersectObjects(list, false)[0];
      return !!h && h.object.userData.name === "Router_Dial";
    };
    let drag = null, hover = false, wheelAcc = 0;
    const PX = 40;                                   // px of drag per dial step
    stage.addEventListener("pointerdown", (e) => {
      if (e.target !== canvas || e.button !== 0 || canvas.classList.contains("measuring") || !onDial(e, true)) return;
      e.stopPropagation(); e.preventDefault();       // OrbitControls and the picker never see it
      drag = { x: e.clientX, y: e.clientY, d: RT.set.dial, moved: false };
      canvas.style.cursor = "grabbing";
    }, true);
    window.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = drag.y - e.clientY;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        if (LR4Routers.manual(RT.set.router)) rtSet({ dial: drag.d + (dx + dy) / PX }, "drag"); else rtReadout();
        return;
      }
      if (e.target !== canvas || e.buttons) return;
      if (onDial(e, false)) { canvas.style.cursor = "grab"; hover = true; }
      else if (hover) { canvas.style.cursor = ""; hover = false; }
    }, true);
    window.addEventListener("pointerup", () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      canvas.style.cursor = hover ? "grab" : "";
      if (d.moved) return;
      if (!LR4Routers.manual(RT.set.router)) { rtReadout(); return; }
      const D = LR4Routers.DIAL, next = Math.floor(RT.set.dial + 1e-6) + 1;
      rtSet({ dial: next > D[1] ? D[0] : next }, "click");
    }, true);
    stage.addEventListener("wheel", (e) => {
      if (e.target !== canvas || !onDial(e, true)) return;
      e.stopPropagation(); e.preventDefault();       // not a zoom
      if (!LR4Routers.manual(RT.set.router)) { rtReadout(); return; }
      // one stop (0.5) a mouse notch (~100 px; touchpads send many small deltas, summed)
      wheelAcc -= e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1) / 100;
      const n = Math.trunc(wheelAcc + Math.sign(wheelAcc) * 1e-9);
      if (!n) return;
      wheelAcc -= n;
      rtSet({ dial: RT.set.dial + n * LR4Routers.DIAL_STOP }, "wheel");
    }, { capture: true, passive: false });
    $("rt-router").addEventListener("change", (e) => rtSet({ router: e.target.value }));
    $("rt-dial").addEventListener("input", (e) => rtSet({ dial: Number(e.target.value) }, "drag"));
  }
  if (typeof meta !== "undefined" && meta && !meshes.some((m) => RT_OWN.test(m.userData.name || ""))) rtSwap();   // a model built before this file loaded
  rtLook();
  // the pockets (js/csg.js, Part 46c): manifold-3d loads in the background; a router already shown is built again with them
  if (window.LR4Csg) LR4Csg.init().then((loaded) => { if (loaded && RT.body) rtSwap(); });
  // tests / videos: the settings, set them, the dial's ring turn (rad) + where the dial is on screen (client px)
  window.LR4Router = { state: () => Object.assign({}, RT.set), set: (o) => rtSet(o || {}),
    ring() { const dm = meshes.find((m) => m.userData.name === "Router_Dial"); return dm && dm.userData.ring ? +dm.userData.ring.rotation.z.toFixed(4) : null; },
    screen() { return LR4Power.screen("Router_Dial"); }, frame: () => (RT.body ? JSON.parse(JSON.stringify(RT.body.f)) : null),
    csg: () => !!(window.LR4Csg && LR4Csg.ready()) };
