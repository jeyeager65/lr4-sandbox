// lr4-sandbox page, part 3 of 12: the machine's pose (travel), Home ($H).
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- travel sliders: X along the beam, Y along the table, Z by bit-tip height, over the real travel (0 = the
  // home switch trip, lr4.STOPS). A new size keeps the gantry and core at the same fraction of their travel. ----
  const sx = document.getElementById("sx"), sy = document.getElementById("sy"), sz = document.getElementById("sz");
  function setupSliders() {
    [sx, sy, sz].forEach((el) => {
      el.addEventListener("input", () => {
        if (CTL.mode === "fluidnc") return;                  // hidden in FluidNC mode (the jog pad instead)
        jobPlaying(false); homeCancel(); move();             // the job pauses
        HAND.skip = true;                                    // a quick move to a spot, not a cut (user: sliders don't carve)
      });
      el.addEventListener("pointerdown", () => { CTL.drag = el; });
    });
    for (const ev of ["pointerup", "pointercancel"]) window.addEventListener(ev, () => { CTL.drag = null; });
  }
  function updateSliders() {
    const t = meta.travel, first = !sx.dataset.init, cx = (t.x[1] - t.x[0]) / IN, cy = (t.y[1] - t.y[0]) / IN;
    const fx = first ? -t.x[0] / (t.x[1] - t.x[0]) : sx.value / sx.max;
    const fy = first ? -t.y[0] / (t.y[1] - t.y[0]) : sy.value / sy.max;
    if (JSON.stringify(t) !== HOME.travel) {         // another machine: not homed
      if (HOME.home || HOME.run) $("home-status").textContent = "New size: not homed.";
      HOME.run = null; HOME.home = null; HOME.travel = JSON.stringify(t);
      $("home").textContent = "Home ($H)";
    }
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
      if (CTL.drag !== sx) sx.value = ((pose[0] - t.x[0]) / IN).toFixed(1);
      if (CTL.drag !== sy) sy.value = ((pose[1] - t.y[0]) / IN).toFixed(1);
      if (CTL.drag !== sz) sz.value = (pose[2] + meta.tip_above_table).toFixed(1);
    }
    const [dx, dy, dz] = pose || [sx.value * IN + t.x[0], sy.value * IN + t.y[0], sz.value - meta.tip_above_table];
    const X = (dx - t.x[0]) / IN, Y = (dy - t.y[0]) / IN, Z = dz + meta.tip_above_table;
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
    readout(X, Y, Z, !!pose);
    HOME.pose = { x: dx, y: dy, z: dz };
    dro();
  }
  let lastPos = null, zHomeMemo = null;
  // the tip height (above the table) at Z's homed spot: the readout's Z is measured from there (0, negative below)
  function zHomeTip() {
    if (!zHomeMemo || zHomeMemo.yaml !== yamlBase || zHomeMemo.t !== meta.travel)
      zHomeMemo = { yaml: yamlBase, t: meta.travel,
        v: meta.tip_above_table + meta.travel.z[1] - Homing.settings(yamlBase ? yamlBase.text : null).z.pulloff };
    return zHomeMemo.v;
  }
  function readout(X, Y, Z, playing) {                // X, Y in inches (the sliders); shown in mm, as FluidNC reports
    if (X === undefined) { if (!lastPos) return; [X, Y, Z, playing] = lastPos; }
    lastPos = [X, Y, Z, playing];
    const u = (v) => v * IN;
    document.getElementById("rx").textContent = u(X).toFixed(3);
    document.getElementById("ry").textContent = u(Y).toFixed(3);
    const zr = Z - zHomeTip();                       // Z from its homed spot
    document.getElementById("rz").textContent = zr.toFixed(3);
    document.getElementById("ox").textContent = `${u(X).toFixed(0)} / ${u(Number(sx.max)).toFixed(0)}`;
    document.getElementById("oy").textContent = `${u(Y).toFixed(0)} / ${u(Number(sy.max)).toFixed(0)}`;
    document.getElementById("oz").textContent = `${zr.toFixed(playing ? 1 : 0)} mm`;
  }

  // ---- Home ($H, js/homing.js): FluidNC's homing with the config.yaml in use (V1E's JP3_LR values until one is
  // read): Z up to its switch, then X + Y to theirs; seek, pull off, feed back, pull off; the switches flash at each
  // trip. Homed: the DRO shows MPos (mpos_mm at the pulled-off spot) and Run G-code starts there. Touching the
  // sliders mid-home stops it; a new size un-homes. ----
  const HOME = { run: null, t: 0, k: 0, home: null, s: null, pose: null, travel: "" };
  // the Controller (setupController): mode, the running sim, its config copy, the MPos <-> pose anchor, last status
  const CTL = { mode: "play", sim: null, cfg: null, boot: null, mpos: null, state: "", drag: null, booting: null,
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
  // axes: "Z" / "XY" ... = only those ($HZ, the pendant's axis buttons), together in one cycle; the others stay put and
  // keep their homing from before. Omitted = $H (the config's cycles)
  function homeStart(axes) {
    if (!meta || !HOME.pose) return;
    jobClear();                                      // its bit / stock would stay behind; reloaded when done
    const s = Homing.settings(yamlBase ? yamlBase.text : null), speed = $("home-real").checked ? { seek: 1, feed: 1 } : undefined;
    if (HOME.order) for (const a of ["x", "y", "z"]) if (HOME.order[a]) s[a].cycle = HOME.order[a];   // a video's HOMING= ($HZ, $HX, $HY)
    const only = axes ? String(axes).toLowerCase() : "";
    if (only) for (const a of ["x", "y", "z"]) s[a].cycle = only.includes(a) ? 1 : 0;   // cycle 0: not homed, stays put
    const keep = only && HOME.home && HOME.s ? Object.fromEntries(Object.entries(HOME.home).filter(([a]) => !only.includes(a))) : null;
    Object.assign(HOME, { s, t: 0, k: 0, home: null, keep, last: performance.now(), run: Homing.plan(HOME.pose, meta.travel, s, speed) });
    // Part 32: each Y / Z side homes on its own (side 2's switch stop mm on, each its own pulloff): AB.E = side 2 - side 1
    AB.home = null;
    if (AB.set.on) {
      const pl = abPulls(), st = abStops(), tv = meta.travel, s1 = JSON.parse(JSON.stringify(s)), s2 = JSON.parse(JSON.stringify(s));
      for (const a of ["y", "z"]) { s1[a].pulloff = pl[a][0]; s2[a].pulloff = pl[a][1]; }
      const tv2 = { x: tv.x, y: tv.y.map((v) => v + st.y), z: tv.z.map((v) => v + st.z) }, p = HOME.pose;
      AB.home = { r1: Homing.plan(p, tv, s1, speed), r2: Homing.plan({ x: p.x, y: p.y + AB.E.y, z: p.z + AB.E.z }, tv2, s2, speed) };
    }
    $("home").textContent = "Stop homing";
    dro();
  }
  function homeCancel() {
    if (!HOME.run) return;
    HOME.run = null;
    $("home").textContent = "Home ($H)";
    $("home-status").textContent = "Homing stopped: not homed.";
    jobSetup(JOB.pageJob);
  }
  function homeTick() {
    const r = HOME.run, now = performance.now();
    if (!r) return;
    HOME.t = Math.min(HOME.t + Math.min((now - (HOME.last || now)) / 1000, 0.5), r.total);   // wall time, as jobTick
    HOME.last = now;
    for (; HOME.k < r.events.length && r.events[HOME.k].time <= HOME.t; HOME.k++) clickSwitch(r.events[HOME.k].axis, r.events[HOME.k].kind === "release");
    const p = GcodePlay.at(r, HOME.t), sg = r.segs[Math.min(p.index, r.segs.length - 1)];
    if (AB.home) {
      const tt = HOME.t >= r.total ? Infinity : HOME.t, a = GcodePlay.at(AB.home.r1, tt), b = GcodePlay.at(AB.home.r2, tt);
      AB.E = { y: b.y - a.y, z: b.z - a.z };
      if (HOME.t >= r.total) { AB.home = null; abNote(); }
    }
    move([p.x, p.y, p.z]);
    if (HOME.t < r.total) {
      const axes = ["x", "y", "z"].filter((a) => r.settings[a].cycle === sg.cycle).map((a) => a.toUpperCase()).join(" + ");
      $("home-status").textContent = `Homing ${axes}: ${{ seek: "seeking the switch", pulloff: "pulling off",
        feed: "feeding back to the switch", settle: "settling" }[sg.phase]}…`;
      return;
    }
    HOME.home = Object.assign({}, HOME.keep, r.home); HOME.run = null;   // + the axes homed before ($HZ then $HX ...)
    $("home").textContent = "Home ($H)";
    const s = HOME.s, src = ["x", "y", "z"].some((a) => s[a].from === "yaml") && /^From your/.test(yamlBase && yamlBase.note)
      ? "your config.yaml's" : "V1E's JP3_LR";
    const notYet = ["x", "y", "z"].filter((a) => !(a in HOME.home)).map((a) => a.toUpperCase());
    $("home-status").textContent = `Homed${notYet.length ? ` ${["X", "Y", "Z"].filter((a) => !notYet.includes(a)).join(", ")} (not ${notYet.join(", ")} yet)` : ""} (${src} homing: mpos_mm ${s.x.mpos} / ${s.y.mpos} / ${s.z.mpos}, pulloff_mm ` +
      `${s.x.pulloff} / ${s.y.pulloff} / ${s.z.pulloff}). Run G-code starts from here.`;
    dro();
    jobSetup(JOB.pageJob);                           // the job reloads to start from the homed spot
  }
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
  function dro() {                                   // MPos once homed, else dashes (FluidNC mode: its MPos)
    if (CTL.mode === "fluidnc") {                   // its own MPos; greyed until homed (it doesn't know where it is)
      for (const [i, a] of ["x", "y", "z"].entries()) {
        $("m" + a).textContent = CTL.mpos ? CTL.mpos[i].toFixed(3) : "–";
        $("m" + a).style.opacity = CTL.homed ? "" : "0.55";
      }
      return;
    }
    for (const a of ["x", "y", "z"]) $("m" + a).style.opacity = "";
    const m = HOME.home && HOME.pose && !HOME.run ? Homing.mpos(HOME.s, HOME.home, HOME.pose) : null;
    for (const a of ["x", "y", "z"]) $("m" + a).textContent = m && m[a] !== null ? m[a].toFixed(3) : "–";
  }
  // the homed spot in the job's work mm (work zero = the cutting area's corner = the X / Y trips, Z on the stock
  // top), for GcodePlay.load's start; undefined when not homed
  // where the job starts: Playback's homed spot; FluidNC mode: where the machine was when Run was pressed (fjRun), else
  // where its $H left it
  const jobSpot = () => (CTL.mode === "fluidnc" ? (CTL.homed && (CTL.runFrom || CTL.homePose)) || null : HOME.home);
  // work zero's offset from the cutting area's corner (mm; LR4Demo.zero, videos only): poses = work + corner + this
  const jobZ0 = () => JOB.zero || [0, 0];
  function jobStartAt() {
    const h = jobSpot();
    if (!h) return undefined;
    const tv = meta.travel, z0 = JOB.zero;   // JOB.zero: LR4Demo.zero (videos: jogged there first)
    return (stock) => ({ x: z0 ? 0 : h.x - tv.x[0], y: z0 ? 0 : h.y - tv.y[0], z: h.z + meta.tip_above_table + (stock ? stock.zmin : 0) });
  }
  document.getElementById("home").addEventListener("click", () =>
    (CTL.mode === "fluidnc" ? ctlHome() : HOME.run ? homeCancel() : homeStart()));

