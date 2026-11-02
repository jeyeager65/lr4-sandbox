// lr4-sandbox page: the wiring (Part 51a, user 2026-11-01) - the wiring list (data/wiring.js, LR4Wiring) on the model.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html).
//   - the stand-in board (51a.3): the Jackpot 3 drawn as a plain blue PCB + its connector blocks at the list's spots,
//     inside the box (a child of Jackpot3_Box: it rides the beam) - only when the user's own board model isn't there
//     (it never is in the public page: LOCAL_ONLY);
//   - the rat's nest (51a.5): Layers > Wiring - a line per run from end to end, coloured by its group (the core's runs
//     along the router cord / vac hose), drawn over the parts; hover / tap one: its name, from -> to, its segments, how far.
  const WR = { on: false, board: null, lines: null, tip: null, hover: null };
  const WR_V = (a) => new THREE.Vector3(...a);
  const wrMesh = (n) => meshes.find((m) => m.userData.name === n);
  function wrBoxLocal(box, at) {                      // a spot (mm from the box's bounding-box min) in the box mesh's frame
    const g = box.geometry; if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingBox.min.clone().add(WR_V(at));
  }
  // ---- the stand-in board ----
  function wrBoard() {
    const box = wrMesh("Jackpot3_Box"), own = wrMesh("Jackpot3_PCB");
    if (WR.board && (WR.board.parent !== box || own)) { WR.board.parent && WR.board.parent.remove(WR.board); WR.board = null; }
    if (!box || own || WR.board || typeof LR4Wiring === "undefined") return;
    const J = LR4Wiring.JP3, P = J.pcb, g = new THREE.Group();
    g.name = "Jackpot3_StandIn";
    const frame = (o, x, y, n, c, s) => {             // a box of size s with its min corner at o, on axes x / y / n
      const m = new THREE.Mesh(new THREE.BoxGeometry(...s), material(null, { c, r: 0.6 }));
      const B = new THREE.Matrix4().makeBasis(WR_V(x), WR_V(y), WR_V(n));
      m.quaternion.setFromRotationMatrix(B);
      m.position.copy(o).add(WR_V(x).multiplyScalar(s[0] / 2)).add(WR_V(y).multiplyScalar(s[1] / 2)).add(WR_V(n).multiplyScalar(s[2] / 2));
      g.add(m);
    };
    frame(wrBoxLocal(box, P.origin), P.x, P.y, P.n, [0.1, 0.33, 0.72], P.size);   // the PCB (V1E blue)
    for (const [k, s] of Object.entries(J.spots)) {   // a connector block under each spot, the pins' tops level with it
      const sz = /motor/.test(k) ? [10.2, 2.5, 8.5] : /\.in\./.test(k) ? [2.5, 5.1, 8.5] : /power/.test(k) ? [7, 8, 7.5] : [5, 4.5, 6];
      const at = wrBoxLocal(box, s.at).sub(WR_V(P.n).multiplyScalar(sz[2])).sub(WR_V(P.x).multiplyScalar(sz[0] / 2)).sub(WR_V(P.y).multiplyScalar(sz[1] / 2));
      frame(at, P.x, P.y, P.n, /motor|\.in\./.test(k) ? [0.08, 0.08, 0.09] : [0.92, 0.92, 0.9], sz);
    }
    box.add(g);
    WR.board = g;
  }
  // ---- the ends, where they are now (world) ----
  function wrEnd(e) {
    if (!e) return null;
    if (e.board) {
      const box = wrMesh("Jackpot3_Box"), s = LR4Wiring.JP3.spots[e.board];
      if (!box || !s) return null;
      box.updateMatrixWorld();
      return box.localToWorld(wrBoxLocal(box, s.at));
    }
    if (e.probe) return typeof ropeAnchor === "function" && ROPE.hBase ? ropeAnchor(0, [0, 0, 0]) : wrEnd({ part: "TouchPlate" });
    const m = wrMesh(e.part);
    return m && m.visible !== false ? new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()) : null;
  }
  // ---- routes (51b): a run's points end to end. The core's runs: along the cord / hose (wrCarrier). A motor's / endstop's on a YZ
  // plate to the board: up to the beam's line (GUESS until the user's photos: the box's middle depth, its floor's
  // height), along it to the box, in. The rest (power): straight (the switch panel's mains crosses the Y travel - it
  // needs its slack there). WR_ALLOW: per end, for the connector + a service loop (GUESS) ----
  const WR_ALLOW = 75;
  function wrPath(r) {
    const a = wrEnd(r.from), b = wrEnd(r.to);
    if (!a || !b) return null;
    const along = (r.via || []).includes("hose") && wrCarrier();
    if (along) {
      let s = along.getPoints(48);
      if (s[0].distanceTo(a) > s[s.length - 1].distanceTo(a)) s = s.reverse();   // the core's end first
      const box = wrMesh("Jackpot3_Box"), braces = wrBraces();
      if (!box || !braces.length || !(r.to && r.to.board)) return [a, ...s, b];
      // V1E docs (w7, w8): tied along the cord / hose to the brace just past halfway (toward the box), off there into
      // the braces with the others, along them to the box
      const bx = new THREE.Box3().setFromObject(box), cx = (bb) => (bb.min.x + bb.max.x) / 2;
      const mid = (braces[0].min.x + braces[braces.length - 1].max.x) / 2, hi = mid > cx(bx), wall = hi ? bx.max.x : bx.min.x;
      const past = braces.filter((bb) => (cx(bb) - mid) * (hi ? -1 : 1) >= -1);    // halfway or past it, toward the box
      const mb = (past.length ? past : braces).reduce((p, q) => (Math.abs(cx(q) - mid) < Math.abs(cx(p) - mid) ? q : p));
      const mc = mb.getCenter(new THREE.Vector3());
      let k = 0;
      s.forEach((p, i) => { if (p.distanceTo(mc) < s[k].distanceTo(mc)) k = i; });
      const on = braces.filter((bb) => (hi ? cx(bb) < cx(mb) && cx(bb) > wall : cx(bb) > cx(mb) && cx(bb) < wall));
      return wrIntoBox([a, ...s.slice(0, k + 1), wrTie(mb), ...(hi ? on.reverse() : on).map(wrTie)], wall, bx, b);
    }
    const box = wrMesh("Jackpot3_Box"), side = r.from && r.from.part && /_(Min|Max)(_|$)/.exec(r.from.part);
    if (box && side && r.to && r.to.board && (r.group === "motor" || r.group === "switch")) return wrBeamPath(a, b, side[1], box);
    return [a, b];
  }
  // V1E's LowRider docs (Wire Routing; user 2026-11-01: "through the beam and 3d printed parts"): a YZ assembly's
  // motors + endstops go through its plate's channels and out the back channel, then into the beam "with the beam at
  // full height", tied to each brace (tops or bottoms - the bottoms here: the box sits low) along to the board.
  // GUESS until the user's photos: the plate's exit = its back face, 25 mm under its top; at each brace, its back
  // bottom corner (10 mm in); into the box through its end wall facing that side.
  // what the core's runs are tied along: the router cord if there is one (V1E: "bundling the wires with your Router power
  // cord"), else the vac hose; the curve whether or not that layer is shown (the wires are there either way)
  function wrCarrier() {
    for (const n of ["Router_Cord_Run", "Vacuum_Hose"]) {
      const m = wrMesh(n), p = m && m.geometry.parameters && m.geometry.parameters.path;
      if (p) return p;
    }
    return null;
  }
  const wrBraces = () => meshes.filter((m) => /^Brace_/.test(m.userData.name || "") && !/__/.test(m.userData.name) && m.visible !== false)
    .map((m) => new THREE.Box3().setFromObject(m)).sort((p, q) => p.min.x - q.min.x);
  const wrTie = (bb) => new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y - 10, bb.min.z + 10);   // a brace's back bottom corner
  function wrIntoBox(pts, wall, bx, b) {              // through the box's end wall facing the run, to the spot
    const last = pts[pts.length - 1];
    pts.push(new THREE.Vector3(wall, Math.min(last.y, bx.max.y - 10), Math.max(last.z, bx.min.z + 10)), b);
    return pts;
  }
  function wrBeamPath(a, b, side, box) {
    const plate = wrMesh("YZ_Plate_" + side), bx = new THREE.Box3().setFromObject(box);
    const pts = [a];
    if (plate) { const pb = new THREE.Box3().setFromObject(plate); pts.push(new THREE.Vector3((pb.min.x + pb.max.x) / 2, pb.max.y, pb.max.z - 25)); }
    const max = side === "Max", wall = max ? bx.max.x : bx.min.x;
    const on = wrBraces().filter((bb) => (max ? (bb.min.x + bb.max.x) / 2 > wall : (bb.min.x + bb.max.x) / 2 < wall));
    for (const bb of (max ? on.reverse() : on)) pts.push(wrTie(bb));   // from that side's end brace in toward the box
    return wrIntoBox(pts, wall, bx, b);
  }
  const wrLen = (p) => p.reduce((s, v, i) => (i ? s + v.distanceTo(p[i - 1]) : 0), 0);
  // each run over the machine's travel (its corners: X / Y / Z ends) - the longest it gets; what its segments give;
  // whether that reaches (the longest + both ends' allowance). The pose put back after.
  function wrReport() {
    if (typeof LR4Wiring === "undefined" || !meta || !meta.travel || !HOME.pose) return [];
    const t = meta.travel, back = [HOME.pose.x, HOME.pose.y, HOME.pose.z], worst = {};
    for (const x of t.x) for (const y of t.y) for (const z of t.z) {
      move([x, y, z]);
      for (const r of LR4Wiring.RUNS) { const p = wrPath(r); if (p) worst[r.id] = Math.max(worst[r.id] || 0, wrLen(p)); }
    }
    move(back);
    return LR4Wiring.RUNS.map((r) => {
      const have = r.segs.every((g) => g.len) ? r.segs.reduce((s, g) => s + g.len, 0) : null, w = worst[r.id] || 0, need = w ? w + 2 * WR_ALLOW : 0;
      return { id: r.id, name: r.name, worst: Math.round(w), need: Math.round(need), have, reaches: have === null || !need ? null : have >= need, short: have && need > have ? Math.round(need - have) : 0 };
    });
  }
  // ---- the rat's nest ----
  function wrLines() {
    if (WR.lines) { scene.remove(WR.lines); WR.lines.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); WR.lines = null; }
    if (!WR.on || typeof LR4Wiring === "undefined") return;
    WR.lines = new THREE.Group();
    for (const r of LR4Wiring.RUNS) {
      const ln = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: LR4Wiring.GROUPS[r.group].colour, depthTest: false, transparent: true, opacity: 0.95 }));
      ln.renderOrder = 20; ln.userData.run = r; ln.frustumCulled = false;
      WR.lines.add(ln);
    }
    scene.add(WR.lines);
    wrTick();
  }
  function wrTick() {                                 // each frame while shown: the ends ride their parts
    wrBoard();
    if (!WR.lines) return;
    for (const ln of WR.lines.children) {
      const p = wrPath(ln.userData.run);
      ln.visible = !!p;
      if (!p) continue;
      const a = new Float32Array(p.length * 3); p.forEach((v, i) => v.toArray(a, i * 3));
      const g = ln.geometry, at = g.getAttribute("position");
      if (at && at.count === p.length) { at.array.set(a); at.needsUpdate = true; }
      else g.setAttribute("position", new THREE.BufferAttribute(a, 3));
      g.computeBoundingSphere();
      ln.userData.len = p.reduce((s, v, i) => (i ? s + v.distanceTo(p[i - 1]) : 0), 0);
    }
  }
  function wrSet(on) {
    WR.on = !!on;
    if (WR.on) WR.report = wrReport();               // (the lengths over the travel: once, as it's shown)
    const c = document.getElementById("lay-wiring"); if (c) c.checked = WR.on;
    if (!WR.on) wrTip(null);
    wrLines();
  }
  // hover / tap: the nearest run within 8 px of the pointer
  function wrPick(cx, cy) {
    if (!WR.lines) return null;
    const r = canvas.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, v = new THREE.Vector3();
    let best = null, bd = 8;
    const sc = (p) => { v.copy(p).project(camera); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; };
    for (const ln of WR.lines.children) {
      if (!ln.visible) continue;
      const a = ln.geometry.getAttribute("position");
      for (let i = 0; i + 1 < a.count; i++) {
        const p = sc(new THREE.Vector3().fromBufferAttribute(a, i)), q = sc(new THREE.Vector3().fromBufferAttribute(a, i + 1));
        if (p[2] > 1 || q[2] > 1) continue;
        const dx = q[0] - p[0], dy = q[1] - p[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - p[0]) * dx + (py - p[1]) * dy) / L)) : 0;
        const d = Math.hypot(p[0] + t * dx - px, p[1] + t * dy - py);
        if (d < bd) { bd = d; best = ln; }
      }
    }
    return best;
  }
  const wrEndName = (e) => (!e ? "the wall" : e.board ? LR4Wiring.JP3.spots[e.board].label : e.probe ? "the touch plate (the core's hole)"
    : (wrMesh(e.part) && wrMesh(e.part).userData.label) || e.part.replace(/_/g, " "));
  function wrTip(ln, cx, cy) {
    let el = WR.tip;
    if (!ln) { if (el) el.hidden = true; WR.hover = null; return; }
    if (!el) { el = WR.tip = document.createElement("div"); el.className = "wr-tip"; canvas.parentElement.appendChild(el); }
    const r = ln.userData.run, segs = r.segs.map((s) => `${s.kind === "ribbon" ? "V1E extender" : s.kind}${s.len ? ` ${(s.len / 1000).toFixed(2)} m` : ""}`).join(" + ");
    const q = (WR.report || []).find((x) => x.id === r.id), m = (v) => (v / 1000).toFixed(2) + " m";
    const fit = !q || !q.need ? "" : q.reaches === null ? `<span>longest over the travel ${m(q.worst)} (+ ${WR_ALLOW * 2} mm at the ends)</span>`
      : `<span>longest over the travel ${m(q.worst)} + ends: ${m(q.need)} of ${m(q.have)} - ${q.reaches ? "reaches" : `<em>${q.short} mm short: another extender</em>`}</span>`;
    el.innerHTML = `<b>${r.name}</b><span>${wrEndName(r.from)} → ${wrEndName(r.to)}</span><span>${segs}</span><span>routed now: ${m(ln.userData.len)} (GUESS route)</span>${fit}`;
    const b = canvas.parentElement.getBoundingClientRect();
    el.style.left = `${cx - b.left + 14}px`; el.style.top = `${cy - b.top + 14}px`; el.hidden = false;
    WR.hover = ln;
  }
  canvas.addEventListener("pointermove", (e) => { if (WR.on) wrTip(wrPick(e.clientX, e.clientY), e.clientX, e.clientY); });
  canvas.addEventListener("pointerleave", () => wrTip(null));
  { const c = document.getElementById("lay-wiring"); if (c) c.addEventListener("change", () => wrSet(c.checked)); }
  wrBoard();
  // tests / videos
  window.LR4WiringView = { report: () => (WR.report = wrReport()), set: wrSet, on: () => WR.on, board: () => !!WR.board, runs: () => (WR.lines ? WR.lines.children.map((l) => ({ id: l.userData.run.id, shown: l.visible, len: Math.round(l.userData.len || 0) })) : []),
    pick: (x, y) => { const l = wrPick(x, y); return l ? l.userData.run.id : null; } };
