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
  // a point in the Jackpot board's own frame (mm: x along the motor headers, y toward the inputs, z up from the PCB's
  // bottom face's plane as in private/jp3_spots.py, the PCB 1.16-3.70) -> the box mesh's frame / world (it rides the beam)
  function wrBoardLocal(box, x, y, z) {
    const P = LR4Wiring.JP3.pcb, at = WR_V(P.origin).addScaledVector(WR_V(P.x), x).addScaledVector(WR_V(P.y), y).addScaledVector(WR_V(P.n), z - 1.16);
    return wrBoxLocal(box, at.toArray());
  }
  function wrBoardPt(x, y, z) {
    const box = wrMesh("Jackpot3_Box");
    if (!box || typeof LR4Wiring === "undefined") return null;
    box.updateMatrixWorld();
    return box.localToWorld(wrBoardLocal(box, x, y, z));
  }
  // ---- the ESP32 (user 2026-11-02: "we want to avoid routing wires over the wifi antenna"): the WROOM-32E module on
  // the stand-in board (the user's own board model has its own), and its antenna's keep-out - a clear amber zone over
  // the antenna end (past the board's +y edge), JP3.esp.keep mm round it; shown only with the Wiring layer (user 2026-11-03) ----
  function wrEsp(box, own) {
    if (WR.esp && WR.esp.parent !== box) { WR.esp.parent && WR.esp.parent.remove(WR.esp); WR.esp = null; }
    if (!box || WR.esp || typeof LR4Wiring === "undefined" || !LR4Wiring.JP3.esp) return;
    const E = LR4Wiring.JP3.esp, P = LR4Wiring.JP3.pcb, g = new THREE.Group();
    g.name = "Jackpot3_ESP32";
    const B = new THREE.Matrix4().makeBasis(WR_V(P.x), WR_V(P.y), WR_V(P.n)), q = new THREE.Quaternion().setFromRotationMatrix(B);
    const block = (x0, y0, z0, sx, sy, sz, mat) => {   // a box in the board frame, min corner (x0, y0, z0)
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.quaternion.copy(q);
      m.position.copy(wrBoardLocal(box, x0 + sx / 2, y0 + sy / 2, z0 + sz / 2));
      g.add(m);
    };
    const [x0, y0] = E.min, [sx, sy] = E.size, top = 3.7;
    if (!own) {
      block(x0, y0, top, sx, sy, 0.8, material(null, { c: [0.08, 0.09, 0.12], r: 0.6 }));   // the module's PCB
      block(x0 + 0.5, y0 + 0.6, top + 0.8, sx - 1, E.ant - y0 - 1.2, E.h - 0.8, new THREE.MeshStandardMaterial({ color: 0xc8cacc, metalness: 0.8, roughness: 0.35 }));   // the shield
      const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.4 });
      for (let k = 0; k < 5; k++) block(x0 + 2 + k * 3, E.ant + 1.2, top + 0.8, 0.6, 4.8, 0.05, gold);   // the antenna's meander
      for (let k = 0; k < 4; k++) block(x0 + 2 + k * 3, E.ant + (k % 2 ? 1.2 : 5.4), top + 0.8, 3.6, 0.6, 0.05, gold);
    }
    const K = E.keep, zm = new THREE.MeshBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 0.2, depthWrite: false });
    block(x0 - K, E.ant, top - K, sx + 2 * K, y0 + sy - E.ant + K, 2 * K, zm);   // the keep-out round the antenna end
    { const z = g.children[g.children.length - 1];      // + its edges, so it reads against a dark box
      z.add(new THREE.LineSegments(new THREE.EdgesGeometry(z.geometry), new THREE.LineBasicMaterial({ color: 0xffa31a, transparent: true, opacity: 0.8 }))); }
    g.traverse((o) => { if (o.isMesh) o.userData.espKeep = o.material === zm; });
    box.add(g);
    WR.esp = g;
    wrEspKeep();
  }
  function wrEspKeep() {
    if (WR.esp) WR.esp.traverse((o) => { if (o.userData.espKeep) o.visible = !!WR.on; });
  }
  // ---- the stand-in board ----
  function wrBoard() {
    { const bx = wrMesh("Jackpot3_Box"); wrEsp(bx, !!wrMesh("Jackpot3_PCB")); }
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
    if (!m || m.visible === false) return null;
    const bb = new THREE.Box3().setFromObject(m), c = bb.getCenter(new THREE.Vector3());
    if (e.at === "near" || e.at === "far") {          // an end of its long axis, nearer / farther from the Jackpot box
      const s = bb.getSize(new THREE.Vector3()), ax = s.x >= s.y && s.x >= s.z ? "x" : s.y >= s.z ? "y" : "z";
      const jb = wrMesh("Jackpot3_Box"), jc = jb ? new THREE.Box3().setFromObject(jb).getCenter(new THREE.Vector3()) : c;
      const p1 = c.clone(), p2 = c.clone(); p1[ax] = bb.min[ax]; p2[ax] = bb.max[ax];
      return (e.at === "near") === (p1.distanceTo(jc) < p2.distanceTo(jc)) ? p1 : p2;
    }
    return c;
  }
  // ---- routes (51b): a run's points end to end. The core's runs: along the cord / hose (wrCarrier). A motor's / endstop's on a YZ
  // plate to the board: up to the beam's line (GUESS until the user's photos: the box's middle depth, its floor's
  // height), along it to the box, in. The rest (power): straight (the switch panel's mains crosses the Y travel - it
  // needs its slack there). WR_ALLOW: per end, for the connector + a service loop (GUESS) ----
  const WR_ALLOW = 75;
  // the table hub option (Part 52c): the mains into its inlet, the supply fed from it, its cable to the switch panel
  const wrHub = () => typeof optsOn === "function" && !!optsOn().hub;
  const wrRuns = () => LR4Wiring.runsFor(wrHub());
  function wrPath(r) {
    const a = wrEnd(r.from), b = wrEnd(r.to);
    if (!a || !b) return null;
    if (r.id === "psu-dc") {                          // the brick's near end -> in through the box's +X wall slot (the core's wires'),
      const bx = wrMesh("Jackpot3_Box"), s = bx && LR4Wiring.JP3.spots[r.to.board];   // along that wall's inside, into the
      if (bx && s) {                                   // terminal from its open side (it faces +X: side entry)
        const bb = new THREE.Box3().setFromObject(bx), q = bx.getWorldQuaternion(new THREE.Quaternion());
        const out = WR_V(s.out).applyQuaternion(q), hin = new THREE.Vector3(bb.max.x - 2, bb.min.y + 31, bb.min.z + 19), nr = b.clone().addScaledVector(out, 10);
        return [a, new THREE.Vector3(hin.x + 14, (a.y + hin.y) / 2, hin.z), hin, new THREE.Vector3(Math.min(hin.x - 4, nr.x + 4), (hin.y + nr.y) / 2, (hin.z + nr.z) / 2), nr, b];
      }
    }
    const along = (r.via || []).includes("hose") && wrCarrier();
    if (along) {
      // from the table (the switch panel's mains): the vac hose from its floor end, reached under the table (GUESS)
      const core = wrMesh("Core"), cc = core ? new THREE.Box3().setFromObject(core).getCenter(new THREE.Vector3()) : a;
      const fromTable = a.distanceTo(cc) > 500, hp = fromTable && wrMesh("Vacuum_Hose") && wrMesh("Vacuum_Hose").geometry.parameters.path;
      // Part 53b: the core's runs in the wire bundle (hose_bom.js hrWires, V1E's core + wire routing docs): the motor's
      // up its lead to the top of the -X face; the endstop's / touch plate's (through the core's tunnel) from its exit
      // there; along the settled cord to past the box, a rope down into its +X wall's slot, to the spot
      if (!fromTable && typeof HR !== "undefined" && HR.wireP && r.to && r.to.board) {
        const inBox = typeof hrBoxRoute === "function" ? hrBoxRoute({ "x-motor": "motor", "x-stop": "stop", probe: "probe" }[r.id] || "stop", [0, 0]) : [];   // round the board (the ESP32's antenna)
        { const bx = wrMesh("Jackpot3_Box"), n = WR_V(LR4Wiring.JP3.pcb.n).applyQuaternion(bx.getWorldQuaternion(new THREE.Quaternion()));
          inBox.push(b.clone().addScaledVector(n, 14)); }   // then straight down onto the connector
        const kind = r.from.part === "X_Stepper_Plug" ? "motor" : r.from.probe ? "probe" : "stop", mo = kind === "motor" && HR.wireMotor;
        const head = mo ? HR.wireMotor.slice(0, -1) : [a, ...((HR.wirePre && HR.wirePre[kind]) || []).slice(1)];
        const pts = [...head, ...HR.wireP.slice(mo ? HR.wireJ : 0), ...inBox, b];
        pts.fold = head.length + HR.wireFold - (mo ? HR.wireJ : 0);   // the spare: folded where it leaves the cord
        return pts;
      }
      let s = (hp || along).getPoints(48);
      if ((s[0].distanceTo(cc) > s[s.length - 1].distanceTo(cc)) !== fromTable) s = s.reverse();   // the core's end first (the table's: last)
      const head = fromTable ? [a, new THREE.Vector3(a.x, a.y, s[0].z)] : [a];
      const box = r.to && (r.to.board ? wrMesh("Jackpot3_Box") : wrMesh(r.to.part)), braces = wrBraces();
      if (!box || !braces.length) return [...head, ...s, b];
      // V1E docs (w7, w8): tied along the cord / hose to the brace just past halfway (toward the box), off there into
      // the braces with the others, along them to the box (or the part: the supply's mains, w9e)
      const bx = new THREE.Box3().setFromObject(box), cx = (bb) => (bb.min.x + bb.max.x) / 2;
      const mid = (braces[0].min.x + braces[braces.length - 1].max.x) / 2, hi = mid > cx(bx), wall = hi ? bx.max.x : bx.min.x;
      const past = braces.filter((bb) => (cx(bb) - mid) * (hi ? -1 : 1) >= -1);    // halfway or past it, toward the box
      const mb = (past.length ? past : braces).reduce((p, q) => (Math.abs(cx(q) - mid) < Math.abs(cx(p) - mid) ? q : p));
      const mc = mb.getCenter(new THREE.Vector3());
      let k = 0;
      s.forEach((p, i) => { if (p.distanceTo(mc) < s[k].distanceTo(mc)) k = i; });
      const on = braces.filter((bb) => (hi ? cx(bb) < cx(mb) && cx(bb) > wall : cx(bb) > cx(mb) && cx(bb) < wall));
      const pts = wrIntoBox([...head, ...s.slice(0, k + 1), wrTie(mb), ...(hi ? on.reverse() : on).map(wrTie)], wall, bx, b);
      pts.fold = head.length + k + 1;                  // the spare: folded at the middle brace (its slack rides the hose)
      return pts;
    }
    if ((r.via || []).includes("beam") && r.to && r.to.part) return wrMainsPath(a, b, wrMesh(r.to.part)) || [a, b];
    if (r.id === "hub-panel") {                       // stapled along the table's underside, behind the end, to the panel (GUESS)
      if (typeof HUB !== "undefined" && HUB.cables && HUB.cables.pts.Paddle) return HUB.cables.pts.Paddle.slice();   // the drawn 12-3 (scene.js hubCables)
      const pn = wrMesh("TableHub_Panel"), uz = pn ? new THREE.Box3().setFromObject(pn).max.z - 15 : a.z, x = a.x;
      return [a, new THREE.Vector3(x, a.y, uz), new THREE.Vector3(x, b.y + 90, uz), new THREE.Vector3(b.x, b.y + 90, uz), b];
    }
    const box = wrMesh("Jackpot3_Box"), side = r.from && r.from.part && /_(Min|Max)(_|$)/.exec(r.from.part);
    if (box && side && r.to && r.to.board && (r.group === "motor" || r.group === "switch")) return wrBeamPath(a, b, side[1], box);
    return [a, b];
  }
  // the supply's mains (user 2026-11-02: "in the beam through the braces"; V1E docs w9e: "a single extension cord into
  // the beam"): from the switch panel along the table's front to the gantry's end nearer the supply, across to its YZ
  // plate (the span the Y travel moves: its slack), in there like the Y / Z wires, along the braces to the supply. GUESS
  function wrMainsPath(a, b, tgt) {
    const braces = wrBraces();
    if (!tgt || !braces.length) return null;
    const tb = new THREE.Box3().setFromObject(tgt), mid = (braces[0].min.x + braces[braces.length - 1].max.x) / 2;
    const side = (tb.min.x + tb.max.x) / 2 < mid ? "Min" : "Max", plate = wrMesh("YZ_Plate_" + side);
    if (!plate) return null;
    const pb = new THREE.Box3().setFromObject(plate), pts = wrBeamPath(a, b, side, tgt);
    pts.splice(1, 0, new THREE.Vector3(side === "Max" ? pb.max.x : pb.min.x, a.y, a.z));
    pts.fold = pts.fold === undefined ? undefined : pts.fold + 1;
    pts.free = 1;
    return pts;
  }
  // V1E's LowRider docs (Wire Routing; user 2026-11-01: "through the beam and 3d printed parts"): a YZ assembly's
  // motors + endstops go through its plate's channels and out the back channel, then into the beam "with the beam at
  // full height", tied to each brace (tops or bottoms - the bottoms here: the box sits low) along to the board.
  // GUESS (no LR4 to check - the docs only): the plate's exit = its inner face at the back, 30 % up (docs w1: low, toward the
  // end brace); at each brace, its back bottom corner (10 mm in); into the box through its end wall facing that side.
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
    if (plate) {                                      // out low on the plate's inner face, at its back (w1; yze6: "out of the bottom")
      const pb = new THREE.Box3().setFromObject(plate);
      pts.push(new THREE.Vector3(side === "Max" ? pb.min.x : pb.max.x, pb.max.y - 20, pb.min.z + 0.3 * (pb.max.z - pb.min.z)));
    }
    const max = side === "Max", wall = max ? bx.max.x : bx.min.x;
    const on = wrBraces().filter((bb) => (max ? (bb.min.x + bb.max.x) / 2 > wall : (bb.min.x + bb.max.x) / 2 < wall));
    for (const bb of (max ? on.reverse() : on)) pts.push(wrTie(bb));   // from that side's end brace in toward the box
    if (on.length) { pts.free = pts.length - on.length - 1; pts.fold = pts.free + 1; }   // the span the gantry moves; the end brace's tie
    return wrIntoBox(pts, wall, bx, b);
  }
  const wrLen = (p) => p.reduce((s, v, i) => (i ? s + v.distanceTo(p[i - 1]) : 0), 0);
  // each run over the machine's travel (its corners: X / Y / Z ends) - the longest it gets; what its segments give;
  // whether that reaches (the longest + both ends' allowance). The pose put back after.
  function wrReport() {
    if (typeof LR4Wiring === "undefined" || !meta || !meta.travel || !HOME.pose) return [];
    const t = meta.travel, back = [HOME.pose.x, HOME.pose.y, HOME.pose.z], worst = {};
    const hr = typeof HR !== "undefined" && HR, hl = [];
    if (hr) HR.quick = true;                          // the ropes settle briefly at each corner (Part 53 perf: ~3 s of the load)
    try {
      for (const x of t.x) for (const y of t.y) for (const z of t.z) {
        move([x, y, z]);
        for (const r of wrRuns()) { const p = wrPath(r); if (p) worst[r.id] = Math.max(worst[r.id] || 0, wrLen(p)); }
        if (hr && HR.hose) hl.push(HR.hose.length());   // the hose as it hangs (Part 53b: the BOM's length, hoseNeed)
      }
    } finally { if (hr) HR.quick = false; }
    if (hl.length) HR.need = { max: Math.max(...hl), min: Math.min(...hl), rope: true };
    move(back);
    const need = {};
    for (const [id, w] of Object.entries(worst)) if (w) need[id] = Math.round(w + 2 * WR_ALLOW);
    const f = LR4Wiring.fit(need);
    WR.fit = f;
    return wrRuns().map((r) => Object.assign({ id: r.id, name: r.name, worst: Math.round(worst[r.id] || 0), need: need[r.id] || 0 },
      f.runs[r.id] || { have: null, reaches: null, short: 0 }));
  }
  // the BOM's wiring (hose_bom.js renderBom): the fit at this scene, once per scene (its travel + whether the cord /
  // hose are there) - the report moves the machine through the travel's corners
  function wrFit(now) {
    if (typeof LR4Wiring === "undefined" || !meta || !meta.travel || !HOME.pose || !wrMesh("Jackpot3_Box")) return null;
    const key = JSON.stringify([meta.travel, !!wrMesh("Router_Cord_Run"), !!wrMesh("Vacuum_Hose"), wrHub()]);
    if (WR.fitKey !== key) {
      // (load perf, Part 53: ~0.4 s - the report moves the machine and its ropes through the travel's corners) not in the
      // BOM's first draw: just after, then the BOM again with the wiring rows. Called with now = true (tests, the probes): at once
      if (now) { WR.report = wrReport(); WR.fitKey = key; return WR.fit; }
      if (WR.later !== key) {
        WR.later = key;
        setTimeout(() => { if (WR.later !== key) return; WR.later = null; WR.report = wrReport(); WR.fitKey = key; if (typeof renderBom === "function") renderBom(); }, 800);   // after the first frames are up
      }
      return null;
    }
    return WR.fit;
  }
  // ---- the rat's nest ----
  function wrLines() {
    for (const k of ["lines", "joins"]) if (WR[k]) { scene.remove(WR[k]); WR[k].traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); WR[k] = null; }
    if (!WR.on || typeof LR4Wiring === "undefined") return;
    WR.lines = new THREE.Group(); WR.joins = new THREE.Group();
    for (const r of wrRuns()) {
      const ln = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: LR4Wiring.GROUPS[r.group].colour, depthTest: false, transparent: true, opacity: 0.95 }));
      ln.renderOrder = 20; ln.userData.run = r; ln.frustumCulled = false;
      WR.lines.add(ln);
      if (r.group === "motor" && r.segs[0].len && r.segs.some((g) => g.kind === "ribbon")) {   // the lead's plug meets the extender's
        const j = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 45, 12), new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.7 }));
        j.userData = { run: r.id, at: r.segs[0].len - WR_ALLOW };
        ln.userData.join = j; WR.joins.add(j);
      }
    }
    scene.add(WR.lines, WR.joins);
    wrTick();
  }
  // a route as the wire lies (51b): the span the gantry moves (plate -> end brace) hangs with the travel's slack here
  // (the longest over the travel less now: a parabola that much longer, depth ~ sqrt(3 L e / 8)); the rest of the
  // runs' spare (what it has less what it needs) folded on itself and tied at its fold point (V1E docs w4-w5: "Pull
  // all the slack to the furthest section", "Fold each wire up on itself"), hanging; the other spans a slight sag
  const WR_FOLD = 120;                               // the bundle's length, mm (GUESS)
  function wrDrawn(r, p, len) {
    const q = (WR.report || []).find((x) => x.id === r.id), slack = q && q.worst ? Math.max(0, q.worst - len) : 0;
    const spare = q && q.have && q.need ? q.have - q.need : 0, out = [];
    for (let i = 0; i < p.length; i++) {
      out.push(p[i]);
      if (i === p.fold && i + 1 < p.length && spare > 2 * WR_FOLD / 3) {   // the bundle: hairpins along the next span, tied flat
        const n = Math.max(1, Math.min(6, Math.round(spare / (2 * WR_FOLD)))), h = Math.min(WR_FOLD, spare / (2 * n), 0.4 * p[i].distanceTo(p[i + 1]));
        const u = p[i + 1].clone().sub(p[i]).normalize().multiplyScalar(h);
        for (let j = 0; j < n; j++) out.push(p[i].clone().add(u).add(new THREE.Vector3(0, 0, -(j * 3 + 1.5))), p[i].clone().add(new THREE.Vector3(0, 0, -(j * 3 + 3))));
        out.push(p[i]);
      }
      if (i + 1 < p.length) {
        const L = p[i].distanceTo(p[i + 1]);
        if (L < 100) continue;
        const d = i === p.free ? Math.min(400, Math.sqrt(3 * L * slack / 8) + 0.01 * L) : 0.01 * L;   // (the rest lies on the floor)
        for (let t = 1; t < 8; t++) out.push(p[i].clone().lerp(p[i + 1], t / 8).add(new THREE.Vector3(0, 0, -4 * d * (t / 8) * (1 - t / 8))));
      }
    }
    return out;
  }
  // a join (V1E docs w2-w3: "Fold the wires, leaving the connection straight", taped, labelled): the motor's lead
  // ends its length along the route (less the plug end's allowance); the endstop's own wire is spliced in there too
  function wrJoin(j, p) {
    let s = j.userData.at;
    for (let i = 1; i < p.length; i++) {
      const L = p[i].distanceTo(p[i - 1]);
      if (s <= L || i === p.length - 1) {
        const d = p[i].clone().sub(p[i - 1]).normalize();
        j.position.copy(p[i - 1]).addScaledVector(d, Math.min(s, L));
        j.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        return;
      }
      s -= L;
    }
  }
  function wrTick() {                                 // each frame while shown: the ends ride their parts
    wrBoard();
    if (!WR.lines) return;
    for (const ln of WR.lines.children) {
      const p = wrPath(ln.userData.run);
      ln.visible = !!p;
      if (ln.userData.join) ln.userData.join.visible = !!p;
      if (!p) continue;
      ln.userData.len = wrLen(p);
      if (ln.userData.join) wrJoin(ln.userData.join, p);
      const w = wrDrawn(ln.userData.run, p, ln.userData.len);
      const a = new Float32Array(w.length * 3); w.forEach((v, i) => v.toArray(a, i * 3));
      const g = ln.geometry, at = g.getAttribute("position");
      if (at && at.count === w.length) { at.array.set(a); at.needsUpdate = true; }
      else g.setAttribute("position", new THREE.BufferAttribute(a, 3));
      g.computeBoundingSphere();
    }
  }
  function wrSet(on) {
    WR.on = !!on;
    if (typeof hrWiresSet === "function") hrWiresSet();   // Part 53c: the drawn wires show with it (hose_bom.js) - drawn first,
    if (WR.on) WR.report = wrReport();               // the report's X runs follow them (the lengths over the travel: once, as it's shown)
    const c = document.getElementById("lay-wiring"); if (c) c.checked = WR.on;
    if (!WR.on) wrTip(null);
    wrEspKeep();
    wrLines();
    if (typeof applyVisibility === "function") applyVisibility();
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
      : `<span>longest over the travel ${m(q.worst)} + ends: ${m(q.need)}${q.ext ? `; ${q.ext} extender${q.ext > 1 ? "s" : ""}` : ""}${q.cut ? `; your wire ${m(q.cut)}` : ""}` +
        ` - ${q.reaches ? `reaches${q.have - q.need > 50 ? `, ${m(q.have - q.need)} spare folded at a brace` : ""}` : `<em>${q.short} mm short: extend it</em>`}</span>`;
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
  window.LR4WiringView = { report: () => (WR.report = wrReport()), fit: wrFit, set: wrSet, on: () => WR.on, board: () => !!WR.board, runs: () => (WR.lines ? WR.lines.children.map((l) => ({ id: l.userData.run.id, shown: l.visible, len: Math.round(l.userData.len || 0) })) : []),
    pick: (x, y) => { const l = wrPick(x, y); return l ? l.userData.run.id : null; } };
