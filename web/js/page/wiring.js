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
    if (box && side && r.to && r.to.board && (r.group === "motor" || r.group === "switch")) return wrBeamPath(a, b, side[1], box, bwKind(r.id));
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
  // kind (51c, a Y / Z motor's or endstop's run: "ymotor" / "zmotor" / "ystop" / "zstop"): through the YZ plate's
  // channels (BW_CH), out its back face over the back wheel, behind the XZ plate into the beam at the bundle's level,
  // through each brace's window (bwTies), to the box. Without (the supply's mains): the old plate exit, the braces' corners
  function wrBeamPath(a, b, side, box, kind) {
    const plate = wrMesh("YZ_Plate_" + side), bx = new THREE.Box3().setFromObject(box);
    const pts = [a];
    const max = side === "Max", wall = max ? bx.max.x : bx.min.x;
    if (plate && kind && BW_CH.join[kind] !== undefined) {
      const pb = new THREE.Box3().setFromObject(plate);
      for (const q of BW_CH.lead[kind].concat(BW_CH.trunk.slice(BW_CH.join[kind]))) pts.push(bwPlatePt(pb, side, q));
      const on = wrBraces().filter((bb) => (max ? (bb.min.x + bb.max.x) / 2 > wall : (bb.min.x + bb.max.x) / 2 < wall));
      const ties = bwTies(max ? on.reverse() : on), E = pts[pts.length - 1], xz = wrMesh("XZ_Plate_" + side);
      const xb = xz && new THREE.Box3().setFromObject(xz), t0 = ties[0] || E;
      pts.exit = pts.length - 1;                     // the plate's back face; then behind the XZ plate (it rides the beam)
      pts.push(new THREE.Vector3(xb ? (xb.min.x + xb.max.x) / 2 : E.x, t0.y, t0.z));
      pts.free = pts.exit;                           // the span the beam's Z moves (51d: a rope)
      pts.fold = pts.length;                         // (the end brace's tie: the BOM's spare is kept there - not drawn)
      pts.push(...ties);
      return wrIntoBox(pts, wall, bx, b);
    }
    if (plate) {                                      // out low on the plate's inner face, at its back (w1; yze6: "out of the bottom")
      const pb = new THREE.Box3().setFromObject(plate);
      pts.push(new THREE.Vector3(side === "Max" ? pb.min.x : pb.max.x, pb.max.y - 20, pb.min.z + 0.3 * (pb.max.z - pb.min.z)));
    }
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
    let mains = 0;
    // the ropes settle briefly at each corner (Part 53 perf: ~3 s of the load); the router cord's sim runs with the
    // Wiring layer off too (HR.force), first at a fixed pose - the travel's middle, Z up - which sets its rest length
    // (user 2026-11-05: it was set when Wiring went on, so it varied with the pose then)
    if (hr) { HR.force = true; HR.hose = HR.cord = null; HR.fixing = true; }   // (both laid fresh: the hose's free span kept its last shape)
    try {
      // (the fixed pose: a full settle from the guide - the same shape whatever pose came before)
      if (hr) { const mid = (a) => (a[0] + a[a.length - 1]) / 2; move([mid(t.x), mid(t.y), t.z[t.z.length - 1]]); HR.fixing = false; HR.quick = true; }
      for (const x of t.x) for (const y of t.y) for (const z of t.z) {
        if (hr) HR.mainsLen = 0;
        move([x, y, z]);
        for (const r of wrRuns()) { const p = wrPath(r); if (p) worst[r.id] = Math.max(worst[r.id] || 0, wrLen(p)); }
        if (hr && HR.hose) hl.push(HR.hose.length());   // the hose as it hangs (Part 53b: the BOM's length, hoseNeed)
        if (hr && HR.mainsLen) mains = Math.max(mains, HR.mainsLen);   // the hub's mains cord as drawn (with the router cord)
      }
    } finally { if (hr) { HR.quick = false; HR.force = false; HR.fixing = false; } }
    if (mains) worst["psu-ac"] = mains;               // (not the Wiring layer's route: ~10 cm short)
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
    const key = JSON.stringify([meta.travel, !!wrMesh("Router_Cord_Run"), !!wrMesh("Vacuum_Hose"), wrHub(), typeof HR !== "undefined" && HR.key]);   // HR.key: a new cord scene -> its fixed-pose length again
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
  // fz: the fold's turns, mm a step (-1: down; 51c's bundle: +-3); nMax: its most turns; sag: the other spans' (x their length)
  function wrDrawn(r, p, len, fz = -1, nMax = 6, sag = 0.01) {
    const q = (WR.report || []).find((x) => x.id === r.id), slack = q && q.worst ? Math.max(0, q.worst - len) : 0;
    const spare = q && q.have && q.need ? q.have - q.need : 0, out = [];
    for (let i = 0; i < p.length; i++) {
      out.push(p[i]);
      if (i === p.fold && i + 1 < p.length && spare > 2 * WR_FOLD / 3 && nMax > 0) {   // the bundle: hairpins along the next span, tied flat
        const n = Math.max(1, Math.min(nMax, Math.round(spare / (2 * WR_FOLD)))), h = Math.min(WR_FOLD, spare / (2 * n), 0.4 * p[i].distanceTo(p[i + 1]));
        const u = p[i + 1].clone().sub(p[i]).normalize().multiplyScalar(h);
        for (let j = 0; j < n; j++) out.push(p[i].clone().add(u).add(new THREE.Vector3(0, 0, fz * (j * 3 + 1.5))), p[i].clone().add(new THREE.Vector3(0, 0, fz * (j * 3 + 3))));
        out.push(p[i]);
      }
      if (i + 1 < p.length) {
        const L = p[i].distanceTo(p[i + 1]);
        if (L < 100) continue;
        const d = i === p.free ? Math.min(400, Math.sqrt(3 * L * slack / 8) + 0.01 * L) : sag * L;   // (the rest lies on the floor)
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
    if (wrMesh("Jackpot3_Box")) bwMeshes();          // (the beam's wire meshes made with the machine, not first in Inspect: a new mesh rebuilds the Show tree)
    if (!WR.lines) { bwTick(); return; }   // (Inspect draws the plates' wires with Wiring off)
    for (const ln of WR.lines.children) {
      const p = wrPath(ln.userData.run);
      ln.visible = !!p;
      if (ln.userData.join) ln.userData.join.visible = !!p;
      ln.userData.p = p;
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
    bwTick();
  }
  // ---- 51c (2026-11-05): the beam's runs drawn wire by wire (as the core's, hose_bom.js WIRE_SET) - the Y / Z motors'
  // leads (4 loose wires), V1E's extender (a flat 6-wire black ribbon, the end wire's white line) from the taped join on,
  // the endstops' red / black pairs (a far one's spliced into the extender's 2 spare wires at the join). Along the route
  // (wrBeamPath with its kind): through the YZ plate's channels as V1E's docs (user 2026-11-05: "legitimately route the
  // wires through the channels"), out its back face, into the beam (the span the beam's Z moves), one round bundle (4 x 3
  // wires: it fits the plate's channels and a sleeve) through each brace's window (a zip tie beside each), straight (no
  // fold drawn - user), into the box (Min: the lid's end slot; Max: the +X wall's slot over the core's wires), then each
  // wire in its own lane above the core's (board frame +4 mm) to its pin. A sleeve over the bundle from the plate to the
  // box (Layers > See through sleeves). Pieces: the plate's (rides the plate; a mesh per side in its YZ group - Inspect
  // shows them, X-ray look ghosts the plate), the span (rebuilt on Z), the beam's (rides the beam) ----
  // the plate's channels (V1E docs yze3-yzz2; sections 2026-11-05, private/page_tools/slice_dump.js + slice_png.py):
  // points in the Min plate's frame [mm in from its outer face, from its front (y min), up from its bottom] (the Max
  // plate: its mirror). trunk: the front channel from the plate's top (by the Z stop) down to the bottom, the wire keeper
  // along the bottom (behind its tab), the back channel up and out the back face over the back wheel (w1). Each kind joins
  // the trunk at join[kind] after its lead: the Z endstop at the top; the Y stepper (its plug top front) through the
  // hole beside it into the front channel; the Y endstop (on the front wheel) under the plate into the front channel's
  // bottom opening (yze8: "the first channel"); the Z stepper (its plug at its bottom) down into the keeper
  const BW_CH = {
    trunk: [[22, 55.5, 98], [22, 55, 89], [22, 55, 74], [22, 58, 67], [22, 64, 64.5], [22, 67.5, 61.5], [22, 69.75, 59], [22, 71.75, 56],
      [22, 75, 50], [22, 76.5, 40], [22, 76.5, 10], [25, 79, 4], [31, 84, 3.3], [31, 111, 3.3], [31, 141, 3.3], [27, 149, 3.3], [24, 151.5, 3.3],
      [22, 156, 5.5], [22, 159.5, 8], [22, 164, 14], [22, 167.5, 20], [22, 171.5, 32], [22, 173, 44], [22, 173.5, 56], [22, 175, 62], [22, 176, 68],
      [22, 178, 74], [22, 181, 80], [22, 184, 86], [22, 188, 90], [22, 193, 91]],
    // (the front channel: from the Z stop's slot (open into it over z 148 off the world) down; open behind the Y stepper (y 618..629.5 off the world, z 86..113 - its hole), then curving
    // down to the bottom. The keeper: a wedge over its tab, ~11 wide x 6 tall - the bundle 2 x 6 at x 71, z 24.3. The steppers turned so
    // their leads face the plate's back (build.py lead_deg, user 2026-11-05): the Y stepper's plug by the front
    // channel, the Z stepper's at its bottom: up its pocket into the thin branch (y 713..737 off the world, z ~44..47) to
    // the back channel (V1E yzz2: "notice what side of the hole this goes in from"). The Y endstop's wire: from the switch's recess
    // through the flat slot inside the plate (z 23.5..27.7 off the world, y 605..643: "the first channel") into the
    // front channel's bottom)
    join: { zstop: 0, ymotor: 2, ystop: 11, zmotor: 21 },
    lead: { ystop: [[16, 30, 4.6], [17, 36, 4.6], [17, 72, 4.6]], zstop: [[30, 48, 131], [22, 48.5, 131], [22, 50.5, 120], [22, 52.25, 112], [22, 54, 104]], ymotor: [[21.5, 53, 84]], zmotor: [[21.5, 138, 21], [22, 145, 23.5], [22, 156, 24.7], [22, 165, 25.8]] },
  };
  const bwKind = (id) => (/^[yz]\d-(motor|stop)$/.test(id) ? id[0] + id.slice(3) : null);   // "y0-motor" -> "ymotor"
  const bwPlatePt = (pb, side, q) => new THREE.Vector3(side === "Max" ? pb.max.x - q[0] : pb.min.x + q[0], pb.min.y + q[1], pb.min.z + q[2]);
  // through a brace's window (section 2026-11-05, Brace_2 at its middle x: the bottom rail's top at z min+16, open y
  // max-44..max-24 up to z min+49, a diagonal over its back): over the 24 V supply where it's in a bay this side passes
  // (its top + the sleeve), y max-40; else low (z min+20, y max-28), in line with the box's Min entry
  const BW_SLEEVE_R = 3.8;
  function bwTies(on) {
    if (!on.length) return [];
    const psu = wrMesh("PSU_24V"), pB = psu && new THREE.Box3().setFromObject(psu);
    const x0 = Math.min(...on.map((b) => b.min.x)), x1 = Math.max(...on.map((b) => b.max.x)), over = pB && pB.max.x > x0 && pB.min.x < x1;
    const z0 = Math.min(...on.map((b) => b.min.z)), zIn = over ? Math.max(46, pB.max.z + BW_SLEEVE_R + 0.5 - z0) : 20;
    return on.map((b) => new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y - (over ? 40 : 28), b.min.z + zIn));
  }
  // an empty geometry with a position attribute (Inspect's Lines look makes edges of every shown mesh)
  const bwEmpty = () => new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  const BW_SIDES = { Min: ["y0-motor", "y0-stop", "z0-motor", "z0-stop"], Max: ["y1-motor", "y1-stop", "z1-motor", "z1-stop"] };
  const BW_C = { red: [0.8, 0.1, 0.1], green: [0.1, 0.6, 0.25], blue: [0.12, 0.3, 0.85], black: [0.05, 0.05, 0.05], ribbon: [0.06, 0.06, 0.07], white: [0.92, 0.92, 0.9] };
  const BW_LEAD = ["red", "green", "blue", "black"];   // the motor's 4 in the core's order (pin order: GUESS - match yours to A+ A- B+ B-)
  // the bundle's cross-section [across, up] (mm): a row per motor (Y under Z), the endstops' pairs side by side on top;
  // past the join (Max) the two ribbons flat, Y's under Z's
  const BW_SLOT = { ymotor: (k) => [(k - 1.5) * 1.3, -1.3], zmotor: (k) => [(k - 1.5) * 1.3, 0], zstop: (k) => [-1.95 + k * 1.3, 1.3], ystop: (k) => [0.65 + k * 1.3, 1.3],
    ribbon: (kind, j) => [(j - 2.5) * 1.0, kind === "ymotor" ? -0.65 : 0.65] };
  // in the plate: 2 rows of 6 (the keeper's wedge), Y's motor + endstop under Z's; they change over in the span
  const BW_SLOT_PLATE = { ymotor: (k) => [(k - 2.5) * 1.3, -0.65], zmotor: (k) => [(k - 0.5) * 1.3, 0.65], ystop: (k) => [(k + 1.5) * 1.3, -0.65], zstop: (k) => [(k - 2.5) * 1.3, 0.65] };
  const BW_R = { lead: 0.6, pair: 0.6, ribbon: 0.5 };
  const BW = { mesh: null, ties: null, key: null, at: null, joins: {}, info: {}, plates: {}, spans: [], sleeveSpans: [] };
  function bwMeshes() {
    if (BW.mesh && meshes.includes(BW.mesh)) return true;
    if (typeof addMesh !== "function") return false;
    const mk = (name, label, mat, c, group) => addMesh(bwEmpty(), mat, { name, label, group: group || "Electronics", motion: "hose", source: "hardware", color: c });
    const vc = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    BW.mesh = mk("Beam_Wires", "The beam's wires, each drawn (Y0 / Z0 / Y1 / Z1 motors' leads, V1E's extenders as black ribbons, the endstops' pairs): from the YZ plates into the beam, through the braces, into the Jackpot box to their connectors", vc(), [0.6, 0.6, 0.6]);
    for (const s of ["Min", "Max"]) BW.plates[s] = mk("Beam_WiresPlate_" + s, `The ${s} YZ plate's wires in its channels (V1E docs): down the front channel, along the wire keeper under its tab, up the back channel and out its back face`, vc(), [0.6, 0.6, 0.6], "YZ_" + s);
    BW.span = mk("Beam_WiresSpan", "The beam's wires from the YZ plates into the beam (the span the beam's Z moves)", vc(), [0.6, 0.6, 0.6]);
    BW.ties = mk("Beam_ZipTies", "Zip ties: the beam's wire bundle beside each brace", new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5 }), [0.1, 0.1, 0.11]);
    BW.sleeve = mk("Beam_Sleeve", "Cable sleeve over the beam's wires, from the YZ plate's back into the beam to the Jackpot box (Layers > See through sleeves)", new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.12, 0.12, 0.13), roughness: 0.75 }), [0.12, 0.12, 0.13]);
    BW.sleeveSpan = mk("Beam_SleeveSpan", "Cable sleeve over the beam's wires from the YZ plate into the beam", new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.12, 0.12, 0.13), roughness: 0.75 }), [0.12, 0.12, 0.13]);
    bwSleeveClear();
    BW.key = null;
    if (typeof applyVisibility === "function") applyVisibility();   // (hidden with Wiring off from the start)
    return true;
  }
  function bwSleeveClear() {                          // Layers > See through sleeves (hose_bom.js HR.sleeveClear: the core's sleeve too)
    const on = typeof HR !== "undefined" && !!HR.sleeveClear;
    for (const m of [BW.sleeve, BW.sleeveSpan]) if (m) {
      Object.assign(m.material, { transparent: on, opacity: on ? 0.22 : 1, depthWrite: !on }); m.material.needsUpdate = true; m.renderOrder = on ? 2 : 0;
    }
  }
  // a header's pin k (world) + the way up off the board (as hose_bom.js hrWireMeshes)
  function bwPin(id, k) {
    const box = wrMesh("Jackpot3_Box"), s = LR4Wiring.JP3.spots[id], at = wrEnd({ board: id }), P = LR4Wiring.JP3.pcb;
    if (!box || !s || !at) return null;
    const q = box.getWorldQuaternion(new THREE.Quaternion()), ax = WR_V(/motor/.test(id) ? P.x : P.y).applyQuaternion(q);
    return { at: at.addScaledVector(ax, (k - (s.pins - 1) / 2) * 2.54), up: WR_V(P.n).applyQuaternion(q), x: s.at[0] - P.origin[0] + (/motor/.test(id) ? (k - (s.pins - 1) / 2) * 2.54 : 0) };
  }
  // the route's point at arc s from its start (+ the segment it's on)
  function bwAt(p, s) {
    for (let i = 1; i < p.length; i++) {
      const L = p[i].distanceTo(p[i - 1]);
      if (s <= L) return { v: p[i - 1].clone().lerp(p[i], L ? s / L : 0), i };
      s -= L;
    }
    return { v: p[p.length - 1].clone(), i: p.length - 1 };
  }
  // the bundle's frame along D: [across, up] per point. In the plate (i <= iA): across = the plate's thickness (x), up
  // square to it and the run; in the beam: across horizontal (square to the run, -y), up = z. Kept continuous.
  function bwFrames(D, iA, sx) {                     // sx: the plate's inward x (+1 Min, -1 Max: the layout mirrors with it)
    const X = new THREE.Vector3(sx, 0, 0), Z = new THREE.Vector3(0, 0, 1), F = [];
    const tan = (i) => D[Math.min(D.length - 1, i + 1)].clone().sub(D[Math.max(0, i - 1)]).normalize();
    for (let i = 0; i < D.length; i++) {
      const t = tan(i), p = F[i - 1];
      let a, u;
      if (i <= iA) { a = X.clone(); u = t.clone().cross(X); if (u.length() < 0.2) u = p ? p[1].clone() : Z.clone(); u.normalize(); if (p ? u.dot(p[1]) < 0 : u.z < 0) u.negate(); }
      else { a = t.clone().cross(Z); if (a.length() < 0.2) a = p ? p[0].clone() : new THREE.Vector3(0, -1, 0); a.normalize(); if (p && i - 1 > iA ? a.dot(p[0]) < 0 : a.y > 0) a.negate(); u = Z.clone(); }
      F.push([a, u]);
    }
    return F;
  }
  function bwTick() {
    const insp = typeof INSPECT !== "undefined" && !!INSPECT;
    if ((!WR.on && !insp) || typeof hrTubes !== "function" || typeof LR4Wiring === "undefined" || !bwMeshes()) return;
    const box = wrMesh("Jackpot3_Box"), pm = wrMesh("YZ_Plate_Min");
    if (!box || !pm) return;
    box.updateMatrixWorld(); pm.updateMatrixWorld();
    const bpos = new THREE.Vector3().setFromMatrixPosition(box.matrixWorld), ppos = new THREE.Vector3().setFromMatrixPosition(pm.matrixWorld);
    const runs = {}, paths = {};
    for (const r of LR4Wiring.RUNS) if (bwKind(r.id)) { runs[r.id] = r; paths[r.id] = wrPath(r); }
    // (the route's points to its plate exit ride the YZ plate, the rest the beam)
    let key = "";
    for (const [id, p] of Object.entries(paths)) key += "|" + id + (p ? p.map((v, i) => { const o = i <= p.exit ? ppos : bpos; return [v.x - o.x, v.y - o.y, v.z - o.z].map((a) => Math.round(a * 4)).join(); }).join(";") : "-");
    if (key !== BW.key) { BW.key = key; BW.at = bpos.clone(); BW.pat = ppos.clone(); BW.spanKey = null; bwBuild(runs, paths, box); }
    const d = bpos.clone().sub(BW.at), dp = ppos.clone().sub(BW.pat), rel = d.clone().sub(dp);
    for (const m of [BW.mesh, BW.ties, BW.sleeve]) m.position.copy(d);
    BW.span.position.copy(dp); BW.sleeveSpan.position.copy(dp);
    for (const [s, m] of Object.entries(BW.plates)) {   // (Inspect's exploded view: with its plate)
      const pl = wrMesh("YZ_Plate_" + s);
      m.position.copy(dp); if (pl && pl.userData.ex) m.position.add(WR_V(pl.userData.ex));
    }
    const sk = rel.toArray().map((a) => a.toFixed(2)).join();
    if (sk !== BW.spanKey) {                           // the span: plate's end -> beam's end, straight (51d: a rope)
      BW.spanKey = sk;
      const L = (s) => new THREE.LineCurve3(s.a, s.w.clone().add(rel));
      BW.span.geometry = BW.spans.length ? hrTubes(BW.span.geometry, BW.spans.map((s) => ({ curve: L(s), segs: 1, r: s.r, radial: 6, rgb: s.rgb }))) : bwEmpty();
      BW.sleeveSpan.geometry = BW.sleeveSpans.length ? hrTubes(BW.sleeveSpan.geometry, BW.sleeveSpans.map((s) => ({ curve: L(s), segs: 1, r: BW_SLEEVE_R, radial: 14 }))) : bwEmpty();
    }
    if (WR.lines) for (const ln of WR.lines.children) {   // the taped joins (wrLines' cylinders) onto the drawn splice
      const j = BW.joins[ln.userData.run.id], m = ln.userData.join;
      if (j && m) { m.position.copy(j.p).add(d); m.quaternion.copy(j.q); m.scale.set(0.75, 1, 0.75); }
    }
  }
  function bwBuild(runs, paths, box) {
    const specs = [], V = (x, y, z) => new THREE.Vector3(x, y, z), info = {}, tieAt = [], plateSpecs = { Min: [], Max: [] }, sleeves = [];
    const bx = new THREE.Box3().setFromObject(box);
    const boxPt = (x, y, z) => box.localToWorld(wrBoxLocal(box, [x, y, z]));
    BW.joins = {}; BW.spans = []; BW.sleeveSpans = [];
    const curve = (pts, rgb, r, to) => {
      const q = pts.filter((v, i) => i === 0 || v.distanceTo(pts[i - 1]) > 0.05);
      if (q.length < 2) return null;
      const c = new THREE.CatmullRomCurve3(q, false, "centripetal");
      to.push({ curve: c, segs: Math.max(6, Math.ceil(c.getLength() / 4)), r, radial: 6, rgb });
      return c;
    };
    for (const [side, ids] of Object.entries(BW_SIDES)) {
      const max = side === "Max", curves = [];
      // a wire: split = [the plate's back exit, behind the XZ plate] (indices in pts): the plate's part, the span between
      // (rebuilt as Z moves: bwTick), the beam's part; no split: all the beam's
      const tube = (pts, rgb, r, split, stripe) => {
        const put = (q, to) => { const c = curve(q, rgb, r, to); if (c && stripe) curve(q.map((v, i) => v.clone().add(stripe[i] || stripe[stripe.length - 1])), BW_C.white, 0.2, to); return c; };
        if (!split) { const c = put(pts, specs); return c && { c0: c, c1: c }; }
        const [iA, iW] = split, c0 = put(pts.slice(0, iA + 1), plateSpecs[side]), c1 = put(pts.slice(iW), specs);
        BW.spans.push({ a: pts[iA].clone(), w: pts[iW].clone(), r, rgb });
        return c0 && c1 && { c0, c1 };
      };
      // the Min entry: through the lid's end slot (world z 116..122; the box mesh's frame = its geometry's min, 6.3 mm
      // over the box's world bounds), under the lid's inner shelf to x +8; Max: the +X wall's slot (world y 732..741
      // under z 131), the ribbons over the core's wires (section 2026-11-05)
      const ent = max ? [boxPt(140, 31.5, 20)] : [boxPt(-8, 86, 11.7), boxPt(0, 86, 11.7), boxPt(8, 86, 11.7)];
      let J = null, lane = 0, sleeveDone = false;
      for (const id of ids) {
        const r = runs[id], p = paths[id], kind = bwKind(id);
        if (!r || !p || p.exit === undefined) continue;
        const rib = r.segs.find((g) => g.kind === "ribbon");
        const p2 = p.slice(0, -2).concat(ent), iA0 = p.exit, iW0 = p.exit + 1, iT0 = p.fold;
        if (rib && r.group === "motor") J = bwAt(p2, r.segs[0].len - WR_ALLOW);   // the lead's end (its plug's allowance kept)
        const vJ = rib && J ? J.v.clone() : null;      // the splice: the motor's lead meets the extender; its endstop's pair too
        if (vJ) {                                       // (on this run's own route: the segment past the beam's entry nearest the join)
          let k = iW0 + 1, best = 1e9;
          for (let i = iW0 + 1; i < p2.length; i++) { const d = new THREE.Line3(p2[i - 1], p2[i]).closestPointToPoint(vJ, true, new THREE.Vector3()).distanceTo(vJ); if (d < best) { best = d; k = i; } }
          p2.splice(k, 0, vJ);
        }
        const D = wrDrawn(r, p2, wrLen(p), -1, 0, 0), iJ = vJ ? D.indexOf(vJ) : -1;   // (straight: no fold, no sag)
        const iA = D.indexOf(p2[iA0]), iW = D.indexOf(p2[iW0]), iE = D.length - 1, F = bwFrames(D, iA, max ? -1 : 1), sp2 = [iA, iW];
        const arc = [0];                                // (the wires meet at the part: their offsets grow over the first 15 mm)
        for (let i = 1; i < D.length; i++) arc.push(arc[i - 1] + D[i].distanceTo(D[i - 1]));
        // slot: [across, up] in the beam, or a function k -> it (a wire: its plate slot to the plate's exit, its beam slot after)
        const along = (slot, i0, i1) => D.slice(i0, i1 + 1).map((v, i) => { const k = i0 + i, f = Math.min(1, arc[k] / 15), sl = typeof slot === "function" ? slot(k) : slot;
          return v.clone().addScaledVector(F[k][0], sl[0] * f).addScaledVector(F[k][1], sl[1] * f); });
        const slotOf = (k) => (i) => (i <= iA ? BW_SLOT_PLATE[kind](k) : BW_SLOT[kind](k));
        const wires = r.group === "motor" ? BW_LEAD.map((c) => ({ kind: "lead", c })) : [{ kind: "pair", c: "red" }, { kind: "pair", c: "black" }];
        const pinId = r.to.board, ends = [];
        const inBox = (l, pin, motor) => {               // a lane (board frame: + c x / y, + r up, above the core's wires) to the pin
          const c = l % 4, rr = Math.floor(l / 4), o = [c * 1.3, -c * 1.3, 4 + rr * 1.3], B = (x, y, z) => wrBoardPt(x + o[0], y + o[1], z + o[2]);
          const pts = max ? [B(100, -7, 20)] : [B(6, 50, 18)];
          if (motor) pts.push(...(max ? [] : [B(-2, 2, 21), B(4, -7, 20)]), B(pin.x - o[0], -7, 20));
          else pts.push(...(max ? [B(6, -7, 20), B(0, -1, 21), B(0, 40, 22)] : []), B(0, 70, 24), B(4, 75, 24));   // (higher than the core's: kept off the lid's back wall)
          return pts.concat([14, 6, 1, 0].map((h) => pin.at.clone().addScaledVector(pin.up, h)));
        };
        wires.forEach((w, k) => {
          const slot = slotOf(k);
          if (iJ >= 0) { const c = tube(along(slot, 0, iJ), BW_C[w.c], BW_R[w.kind], sp2); if (c) ends.push({ c, pin: null }); return; }   // the lead / own pair to the join
          const pin = bwPin(pinId, k);
          const c = pin && tube(along(slot, 0, iE).concat(inBox(lane + k, pin, r.group === "motor")), BW_C[w.c], BW_R[w.kind], sp2);
          if (c) ends.push({ c, pin });
        });
        if (iJ >= 0 && r.group === "motor") {            // the extender: 6 black (the end one's white line) from the join, through the slot, split inside
          const sr = runs[rib.shares], zr = id === "y1-motor" ? 18.7 : 21.2;
          for (let j = 0; j < 6; j++) {
            const toStop = j >= 4, pin = toStop ? sr && bwPin(sr.to.board, j - 4) : bwPin(pinId, j);
            if (!pin) continue;
            const yy = 31.5 + (j - 2.5) * 1.0;
            const pts = along(BW_SLOT.ribbon(kind, j), iJ, iE - 1).concat([boxPt(140, yy, zr), boxPt(132, yy, zr), boxPt(126, yy, zr), boxPt(114, yy, zr)], inBox(lane + j, pin, !toStop));
            const n0 = iE - iJ, st = j ? null : pts.map((v, i) => (i < n0 ? F[iJ + i][1].clone().multiplyScalar(0.42) : V(0, 0, 0.42)));
            const c = tube(pts, BW_C.ribbon, BW_R.ribbon, null, st);
            if (c) ends.push({ c, pin, run: toStop ? sr.id : id });
          }
          const t = D[Math.min(iE, iJ + 1)].clone().sub(D[Math.max(0, iJ - 1)]).normalize();
          BW.joins[id] = { p: D[iJ].clone(), q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), t) };
        }
        if (!sleeveDone && iT0 !== undefined) {         // the sleeve: once a side, along the bundle's middle - plate exit -> into the beam (the span), on to short of the box
          sleeveDone = true;
          const iT = D.indexOf(p2[p2.length - ent.length - 1]), last = D[iT], e0 = ent[0], g = e0.clone().sub(last);
          const end = last.clone().addScaledVector(g.normalize(), Math.max(0, last.distanceTo(e0) - 12));
          const q = D.slice(iW, iT + 1).filter((v) => v !== vJ).concat([end]);
          if (q.length >= 2) sleeves.push({ curve: new THREE.CatmullRomCurve3(q, false, "centripetal"), segs: Math.ceil(wrLen(q) / 6), r: BW_SLEEVE_R, radial: 14 });
          BW.sleeveSpans.push({ a: D[iA].clone(), w: D[iW].clone() });
        }
        lane += r.group === "motor" && iJ >= 0 ? 6 : iJ >= 0 ? 0 : wires.length;
        curves.push(...ends.map((e) => e.c.c1));
        // (tests: where each wire starts / ends - at its part, at its pin, or at the join)
        const iv = info[id] = info[id] || { wires: 0, from: [], to: [] };
        for (const e of ends) {
          const ie = e.run && e.run !== id ? (info[e.run] = info[e.run] || { wires: 0, from: [], to: [] }) : iv;
          ie.wires++;
          if (!e.run) iv.from.push(+e.c.c0.getPoint(0).distanceTo(wrEnd(r.from)).toFixed(2));
          ie.to.push(e.pin ? +e.c.c1.getPoint(1).distanceTo(e.pin.at).toFixed(2) : "join");
        }
      }
      // a zip tie beside each brace the bundle passes (toward the box): round the sleeve there
      const wall = max ? bx.max.x : bx.min.x;
      const on = wrBraces().filter((bb) => (max ? (bb.min.x + bb.max.x) / 2 > wall : (bb.min.x + bb.max.x) / 2 < wall));
      const smp = [].concat(...curves.map((c) => c.getSpacedPoints(Math.ceil(c.getLength() / 2))));   // (once: Part 53's perf)
      for (const bb of on) {
        const xt = max ? bb.min.x - 2.5 : bb.max.x + 2.5, lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9);
        for (const q of smp) if (Math.abs(q.x - xt) < 1.2 && q.y > bb.max.y - 60 && q.z > bb.min.z && q.z < bb.min.z + 80) { lo.min(q); hi.max(q); }
        if (lo.x > hi.x) continue;
        const c = lo.clone().add(hi).multiplyScalar(0.5), R = BW_SLEEVE_R + 0.6, loop = [];
        for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2; loop.push(V(xt, c.y + R * Math.cos(t), c.z + R * Math.sin(t))); }
        tieAt.push(new THREE.CatmullRomCurve3(loop, true, "centripetal"));
      }
    }
    BW.mesh.geometry = hrTubes(BW.mesh.geometry, specs);
    for (const s of ["Min", "Max"]) BW.plates[s].geometry = plateSpecs[s].length ? hrTubes(BW.plates[s].geometry, plateSpecs[s]) : bwEmpty();
    BW.sleeve.geometry = sleeves.length ? hrTubes(BW.sleeve.geometry, sleeves) : bwEmpty();
    const ts = tieAt.map((c) => ({ curve: c, segs: 24, r: 0.55, radial: 5 }));
    BW.ties.geometry = ts.length ? hrTubes(BW.ties.geometry, ts) : bwEmpty();
    // (tests: every piece at the build's pose - the beam's, the plates', the spans)
    BW.info = info; BW.tieN = ts.length; BW.tieCurves = tieAt; BW.sleeveCurves = sleeves.map((s) => s.curve);
    BW.plateCurves = [].concat(...Object.values(plateSpecs).map((a) => a.map((s) => s.curve)));
    BW.curves = specs.map((s) => s.curve).concat(BW.plateCurves, BW.spans.map((s) => new THREE.LineCurve3(s.a, s.w)));
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
    pick: (x, y) => { const l = wrPick(x, y); return l ? l.userData.run.id : null; }, beam: () => ({ info: BW.info, ties: BW.tieN, key: !!BW.key }) };
