// lr4-sandbox page, part 3 of 12: the machine's pose (travel), Home ($H).
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- the model's pose store: X along the beam, Y along the table (inches from the home switch trip, lr4.STOPS),
  // Z by bit-tip height (mm), over the real travel. A new size keeps the gantry and core at the same fraction of their
  // travel. Was three hidden sliders until Part 36 (FluidNC moves the machine); move(pose) writes it, move() reads it. ----
  const poseAxis = () => ({ value: "0", min: "0", max: "0", dataset: {} });
  const sx = poseAxis(), sy = poseAxis(), sz = poseAxis();
  function updateSliders() {
    const t = meta.travel, first = !sx.dataset.init, cx = (t.x[1] - t.x[0]) / IN, cy = (t.y[1] - t.y[0]) / IN;
    const fx = first ? -t.x[0] / (t.x[1] - t.x[0]) : sx.value / sx.max;
    const fy = first ? -t.y[0] / (t.y[1] - t.y[0]) : sy.value / sy.max;
    sx.min = 0; sx.max = cx.toFixed(2); sx.value = (fx * cx).toFixed(1);
    sy.min = 0; sy.max = cy.toFixed(2); sy.value = (fy * cy).toFixed(1);
    if (first) {
      sz.min = (meta.tip_above_table + t.z[0]).toFixed(1);
      sz.max = (meta.tip_above_table + t.z[1]).toFixed(1);
      sz.value = meta.tip_above_table.toFixed(1);
    }
    sx.dataset.init = "1";
    move();
  }
  function spinNut() {                               // the collet nut turns with the bit, about the model bit's axis
    const nut = meshes.find((m) => m.userData.name === "Router_Nut"), bit = meshes.find((m) => m.userData.name === "Router_Bit");
    if (!nut || !bit || !(JOB.spinning && JOB.spin)) return;
    const g = bit.geometry;                          // a plain cylinder: its box centre is on the axis
    if (!g.boundingBox) g.computeBoundingBox();
    const ax = (g.boundingBox.min.x + g.boundingBox.max.x) / 2 * bit.scale.x + bit.position.x;
    const ay = (g.boundingBox.min.y + g.boundingBox.max.y) / 2 * bit.scale.y + bit.position.y;
    const c = Math.cos(JOB.spin), sn = Math.sin(JOB.spin), px = nut.position.x - ax, py = nut.position.y - ay;
    nut.quaternion.setFromAxisAngle(ZUP, JOB.spin);
    nut.position.x = ax + c * px - sn * py; nut.position.y = ay + sn * px + c * py;
  }
  // Part 32: the Y carriages (the gantry's ends at pose 0, from the meshes' own boxes): the table frame's geo for the
  // tip's error and the drawing's pivots. The span is the gantry's width (outer plate faces), near enough.
  function abGeo() {
    const b = new THREE.Box3(), beam = new THREE.Box3(), v = new THREE.Box3();
    for (const m of meshes) {
      const k = m.userData.motion;
      if (k !== "gantry" && k !== "beam") continue;
      const g = m.geometry, base = m.userData.base || { t: [0, 0, 0], s: [1, 1, 1] };
      if (!g.boundingBox) g.computeBoundingBox();
      v.min.set(...[0, 1, 2].map((i) => g.boundingBox.min.getComponent(i) * base.s[i] + base.t[i]));
      v.max.set(...[0, 1, 2].map((i) => g.boundingBox.max.getComponent(i) * base.s[i] + base.t[i]));
      (k === "gantry" ? b : beam).union(v);
    }
    const fr = SPOIL.frame;
    if (b.isEmpty() || !fr) { AB.geo = AB.piv = null; return; }
    const span = b.max.x - b.min.x;
    AB.piv = { x: b.min.x, y: (b.min.y + b.max.y) / 2, z: beam.isEmpty() ? b.max.z : (beam.min.z + beam.max.z) / 2, span };
    const rb = meshes.find((m) => m.userData.name === "Router_Bit"), tip = rb && bitTip(rb, rb.userData.base || { t: [0, 0, 0], s: [1, 1, 1] });
    AB.geo = { xA: b.min.x - fr[0], span, ty: tip ? tip.y - AB.piv.y : 0, tz: tip ? AB.piv.z - tip.z : 0 };
  }
  // the model bit's tip (its axis at the bottom: a plain cylinder's box centre / min Z), world mm - as drawn now, or at
  // pose 0 with base = its userData.base
  function bitTip(rb, base) {
    const g = rb.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox, p = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.min.z);
    if (base) return p.set(...[0, 1, 2].map((i) => p.getComponent(i) * base.s[i] + base.t[i]));
    rb.updateMatrixWorld();
    return p.applyMatrix4(rb.matrixWorld);
  }
  // the gantry racked (about Z) and the beam + core tilted (about Y) by AB.E, x the drawing's exaggeration, about the
  // Min end's carriage (side 1 stays put; at pose dy / dz)
  const AB_Y = new THREE.Vector3(0, 1, 0);
  function abPose(dy, dz) {
    const P = AB.piv, on = AB.set.on && P && !AB.square, ex = AB.set.exag || 1;   // square: tableFrame measuring
    const rack = on ? Math.atan2(AB.E.y * ex, P.span) : 0, tilt = on ? Math.atan2(AB.E.z * ex, P.span) : 0;
    if (!rack && !tilt && !AB.posed) return;
    AB.posed = !!(rack || tilt);
    const qr = new THREE.Quaternion().setFromAxisAngle(ZUP, rack), qt = new THREE.Quaternion().setFromAxisAngle(AB_Y, -tilt);
    const pr = new THREE.Vector3(P ? P.x : 0, P ? P.y + dy : 0, 0), pt = new THREE.Vector3(P ? P.x : 0, 0, P ? P.z + dz : 0);
    for (const m of meshes) {
      const k = m.userData.motion;
      if (m.userData.held || !(k === "gantry" || k === "beam" || k === "core")) continue;
      m.quaternion.identity();
      if (k !== "gantry" && tilt) { m.position.sub(pt).applyQuaternion(qt).add(pt); m.quaternion.premultiply(qt); }
      if (rack) { m.position.sub(pr).applyQuaternion(qr).add(pr); m.quaternion.premultiply(qr); }
    }
  }
  function move(pose) {
    // the parked pose is at -travel[0]; each motion frame moves by the slider's offset from it. pose = [dx, dy, dz]
    // (mm from the parked pose; the job playback) sets the sliders instead of reading them
    const t = meta.travel;
    if (pose) {
      sx.value = ((pose[0] - t.x[0]) / IN).toFixed(1);
      sy.value = ((pose[1] - t.y[0]) / IN).toFixed(1);
      sz.value = (pose[2] + meta.tip_above_table).toFixed(1);
    }
    const [dx, dy, dz] = pose || [sx.value * IN + t.x[0], sy.value * IN + t.y[0], sz.value - meta.tip_above_table];
    for (const m of meshes) {
      const k = m.userData.motion;
      if (k === "hose" || m.userData.held) continue;   // held: the touch plate laid on the stock (G-code playback)
      const b = m.userData.base || { t: [0, 0, 0], s: [1, 1, 1] };
      m.scale.set(b.s[0], b.s[1], b.s[2]);
      m.position.set(b.t[0] + (k === "core" ? dx : 0), b.t[1] + (k === "table" ? 0 : dy), b.t[2] + (k === "core" || k === "beam" ? dz : 0));
      if (m.userData.ex) m.position.add(new THREE.Vector3(...m.userData.ex));   // inspect's exploded view
      if (m.userData.name === "Router_Nut") m.quaternion.identity();
      const c = m.userData.clip;
      if (c) {                          // straight belt run (exported at full reach): cut where it meets the moving
        const [px, py, pz] = c.p;       // idler / pulley - Y runs: the gantry (dy); X runs: the core (dx + beam)
        m.material.clippingPlanes[0].setFromNormalAndCoplanarPoint(new THREE.Vector3(...c.n),
          c.axis === "y" ? new THREE.Vector3(px, py + dy, pz) : new THREE.Vector3(px + dx, py + dy, pz + dz));
      }
    }
    abPose(dy, dz);
    spinNut();
    if (jobBit && JOB.bits) {                         // the file's own bit rides on the router (homing, jogs, the
      const rb = meshes.find((m) => m.userData.name === "Router_Bit");   // video's moves), not left at the job's start
      if (rb) { const c = bitTip(rb); for (const b of JOB.bits.values()) if (b.visible) b.position.copy(c); }
    }
    if (HAND.bitMesh) {                               // the hand-installed bit: on the model bit's axis, tip at its tip
      const rb = meshes.find((m) => m.userData.name === "Router_Bit");
      if (rb) HAND.bitMesh.position.copy(bitTip(rb));
    }
    if (hoseMesh) updateHose(dx, dy, dz);
    if (CAPS.list.length) placeSection();             // inspect's section cut follows the set
    HOME.pose = { x: dx, y: dy, z: dz };
    touchClipPlace();                                 // the clip on the collet nut while probing rides the core
    touchSkirtPlace();                                // the shoe's bottom on its way off / back (job.js)
    dro();
  }

  // ---- Home ($H): FluidNC's own homing (ctlHome); the switches flash at each trip (clickSwitch, from its pins).
  // Homed: the DRO shows FluidNC's MPos and Run G-code starts there. HOME.pose = the model's pose (move());
  // HOME.order = a video's HOMING= order ($HZ, $HX, $HY). Part 34 retired Basic's own homing. ----
  const HOME = { pose: null, order: null };
  // the Controller (setupController): the running FluidNC, its config copy, the MPos <-> pose anchor, last status.
  // mode is always "fluidnc" since Part 34 (Basic became Preview: JOB.preview)
  const CTL = { mode: "fluidnc", sim: null, cfg: null, boot: null, mpos: null, state: "", booting: null,
    pins: 0, pose: null, yaml: "", homed: false, homing: false, rel: {} };
  // FluidNC's machine clock (ms): machine time runs k x the real clock (its time scale). realNow is the real clock even
  // while tools/record_demo.js freezes performance.now; ncScale sets FluidNC's scale and keeps the count.
  const realNow = performance.now.bind(performance);
  const NCK = { k: 1, m: 0, at: realNow() };
  const ncTime = () => NCK.m + (realNow() - NCK.at) * NCK.k;
  function ncScale(k) {
    NCK.m = ncTime(); NCK.at = realNow(); NCK.k = k;
    if (CTL.sim) CTL.sim.setTimeScale(k);
  }
  const SWITCHES = { x: ["Endstop_X"], y: ["Endstop_Y_Min", "Endstop_Y_Max"], z: ["Endstop_Z_Min", "Endstop_Z_Max"] };
  let flashMat = null;
  function clickSwitch(axis, release) {              // the switch + its lever light up for a moment at each trip
    if (SND.s) SND.s.event(release ? "release" : "switch");   // and tick (pressed) / tock (released) (js/sounds.js)
    if (release) return;
    if (!flashMat) flashMat = new THREE.MeshBasicMaterial({ color: 0xffc400 });
    for (const n of SWITCHES[axis] || []) for (const name of [n, n + "_Lever"]) {
      const m = meshes.find((q) => q.userData.name === name);
      if (!m) continue;
      if (!m.userData.flashOrig) m.userData.flashOrig = m.material;
      m.material = flashMat;
      clearTimeout(m.userData.flashT);
      m.userData.flashT = setTimeout(() => { m.material = m.userData.flashOrig; delete m.userData.flashOrig; }, 300);
    }
  }
  // the DRO: FluidNC's MPos, greyed until homed (it doesn't know where it is), and its work position (MPos - WCO).
  // While a job runs or Preview plays, those write Work (fjTick / jobSeek: the job's own work mm)
  function dro() {
    const own = !FJ.job && !JOB.preview, w = CTL.mpos && CTL.wco ? CTL.mpos.map((v, i) => v - CTL.wco[i]) : null;
    for (const [i, a] of ["x", "y", "z"].entries()) {
      $("m" + a).textContent = CTL.mpos ? CTL.mpos[i].toFixed(3) : "–";
      $("m" + a).style.opacity = CTL.homed ? "" : "0.55";
      if (own) $("w" + a).textContent = w ? w[i].toFixed(3) : "–";
    }
  }
  // where the job starts (Run and Preview): where the machine was when Run / Preview was pressed (CTL.runFrom), else
  // where its $H left it; null when not homed
  const jobSpot = () => (CTL.homed && (CTL.runFrom || CTL.homePose)) || null;
  // work zero's offset from the cutting area's corner (mm; LR4Demo.zero, videos only): poses = work + corner + this
  const jobZ0 = () => JOB.zero || [0, 0];
  function jobStartAt() {
    const h = jobSpot();
    if (!h) return undefined;
    const tv = meta.travel, z0 = JOB.zero;   // JOB.zero: LR4Demo.zero (videos: jogged there first)
    return (stock) => ({ x: z0 ? 0 : h.x - tv.x[0], y: z0 ? 0 : h.y - tv.y[0], z: h.z + meta.tip_above_table + (stock ? stock.zmin : 0) });
  }
  document.getElementById("home").addEventListener("click", () => ctlHome());

