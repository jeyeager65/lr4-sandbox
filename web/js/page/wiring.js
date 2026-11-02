// lr4-sandbox page: the wiring (Part 51a, user 2026-11-01) - the wiring list (data/wiring.js, LR4Wiring) on the model.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html).
//   - the stand-in board (51a.3): the Jackpot 3 drawn as a plain blue PCB + its connector blocks at the list's spots,
//     inside the box (a child of Jackpot3_Box: it rides the beam) - only when the user's own board model isn't there
//     (it never is in the public page: LOCAL_ONLY);
//   - the rat's nest (51a.5): Layers > Wiring - a line per run from end to end, coloured by its group (the core's runs
//     along the cable sleeve), drawn over the parts; hover / tap one: its name, from -> to, its segments, how far.
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
  function wrPath(r) {                                // a run's points: end -> (along the sleeve) -> end
    const a = wrEnd(r.from), b = wrEnd(r.to);
    if (!a || !b) return null;
    const sl = (r.via || []).includes("sleeve") && typeof sleeveMesh !== "undefined" && sleeveMesh && sleeveMesh.visible && sleeveMesh.geometry.parameters && sleeveMesh.geometry.parameters.path;
    if (!sl) return [a, b];
    let s = sl.getPoints(24);
    if (s[0].distanceTo(a) > s[s.length - 1].distanceTo(a)) s = s.reverse();   // the core's end first
    return [a, ...s, b];
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
    el.innerHTML = `<b>${r.name}</b><span>${wrEndName(r.from)} → ${wrEndName(r.to)}</span><span>${segs}</span><span>along these lines: ${(ln.userData.len / 1000).toFixed(2)} m</span>`;
    const b = canvas.parentElement.getBoundingClientRect();
    el.style.left = `${cx - b.left + 14}px`; el.style.top = `${cy - b.top + 14}px`; el.hidden = false;
    WR.hover = ln;
  }
  canvas.addEventListener("pointermove", (e) => { if (WR.on) wrTip(wrPick(e.clientX, e.clientY), e.clientX, e.clientY); });
  canvas.addEventListener("pointerleave", () => wrTip(null));
  { const c = document.getElementById("lay-wiring"); if (c) c.addEventListener("change", () => wrSet(c.checked)); }
  wrBoard();
  // tests / videos
  window.LR4WiringView = { set: wrSet, on: () => WR.on, board: () => !!WR.board, runs: () => (WR.lines ? WR.lines.children.map((l) => ({ id: l.userData.run.id, shown: l.visible, len: Math.round(l.userData.len || 0) })) : []),
    pick: (x, y) => { const l = wrPick(x, y); return l ? l.userData.run.id : null; } };
