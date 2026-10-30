// lr4-sandbox page: a bit change, animated (Part 45b step 3, user 2026-10-29: "animate changing the nut ... pressing
// the lock button and using a wrench ... without the lock button, it's a 2 wrench change"). The page's scripts share
// one global scope (RT: machine.js; the router's meshes: router.js; bits: job.js / table.js).
//   With the router off and the dust shoe off (it hides the nut: down and away, back on at the end): the shaft held - its lock pressed in (model.shaft_lock) or a wrench on the shaft's flats
//   (model.shaft.flats: 2 wrenches) - an open-end wrench (sized from collet_nut.af) breaks the nut loose in 60 deg
//   swings, then it spins off by hand (thread length / pitch turns, coming down a pitch a turn) with the collet + bit
//   in it; the bit slides out, the collet swaps when the new shank needs another, the new bit goes in to its stickout,
//   the nut spins back on and is tightened, the lock / holding wrench let go. At a job's tool change (the popup's
//   Install bit and resume: table.js) and the close-up's Change bit (router_edit.js). Driven from the page's tick
//   (tcTick: the video clock too); machine.js spinApply calls tcPlace, so a move mid-change keeps the parts where TC
//   has them. LR4ToolChange: tests / videos. ----
  const TC = { on: null, wrench: {}, mats: null, cap: null };
  const TC_ON = { anim: kvGet("lr4-tc-anim") !== "off", speed: 1 };   // speed: tests run it faster   // the popup's Show the bit change (kept in this browser)
  $("tc-anim").checked = TC_ON.anim;
  $("tc-anim").addEventListener("change", (e) => { TC_ON.anim = e.target.checked; kvSet("lr4-tc-anim", TC_ON.anim ? "on" : "off"); });
  const TC_SWING = 60 * Math.PI / 180;               // an open-end wrench on a hex: a 60 deg swing, then it goes on again
  const TC_HAND_RPS = 2.5;                           // turns a second, spinning the nut by hand
  const tcEase = (u) => u * u * (3 - 2 * u);
  // an open-end wrench: its jaw (the slot af wide, open toward +x, the nut's centre at the origin) on a round head,
  // the handle out along -x; in its xy plane, thick along z (the router's axis), centred
  function tcWrenchGeo(af) {
    const rc = af / 2 / Math.cos(Math.PI / 6), R = rc + 0.45 * af + 2, W = 0.75 * af + 3, L = 7 * af + 40, t = Math.max(3, 0.22 * af);
    const ta = Math.asin(Math.min(0.99, af / 2 / R)), tw = Math.asin(Math.min(0.99, W / 2 / R)), xb = -rc - 0.4, x1 = R * Math.cos(ta);
    const s = new THREE.Shape(), arc = (a0, a1) => { for (let k = 1; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16; s.lineTo(R * Math.cos(a), R * Math.sin(a)); } };
    s.moveTo(x1, af / 2);
    s.lineTo(xb, af / 2); s.lineTo(xb, -af / 2); s.lineTo(x1, -af / 2);   // the jaw's slot
    arc(-ta, -Math.PI + tw);                         // round the head's -y side to the handle
    s.lineTo(-L, -W / 2); s.lineTo(-L - W / 2, 0); s.lineTo(-L, W / 2);   // the handle, its end rounded off
    s.lineTo(R * Math.cos(Math.PI - tw), W / 2);
    arc(Math.PI - tw, ta);                           // round the +y side back to the jaw
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, -t / 2);
    g.userData = { R, x1, rc, t };
    return g;
  }
  function tcWrench(key, af) {                       // made once per size (kept, hidden when not in use)
    const k = key + "@" + af;
    if (!TC.wrench[k]) {
      const m = new THREE.Mesh(tcWrenchGeo(af), material(null, { c: [0.74, 0.75, 0.77], r: 0.3 }));
      m.castShadow = true; m.visible = false;
      scene.add(m);
      TC.wrench[k] = m;
    }
    return TC.wrench[k];
  }
  const tcMesh = (n) => meshes.find((m) => m.userData.name === n);
  // the shank a bit takes: its own Ø up to the biggest collet, else that collet (big bits come on a 1/4" shank)
  function tcShank(d, sizes) {
    const max = Math.max(...sizes);
    return d > max + 0.01 ? max : sizes.find((s) => s >= d - 0.01) || max;
  }
  const tcIn = (mm) => { const i = mm / 25.4, f = [[1 / 8, '1/8"'], [1 / 4, '1/4"'], [3 / 8, '3/8"'], [1 / 2, '1/2"']].find(([v]) => Math.abs(v - i) < 0.002); return f ? f[1] : `${+mm.toFixed(2)} mm`; };
  // the steps: [seconds, caption, fn(u 0..1, S)] - each sets S's state (lock press, wrench spots, nut turn + drop,
  // bits / collets) from its own start values; play() runs them in order
  function tcSteps(S) {
    const m = S.model, nut = m.collet_nut, F = m.shaft.flats, L = m.shaft_lock, two = !L && !!F;
    const P = m.shaft.thread.pitch, E = Math.min(m.shaft.thread.length, nut.h - (nut.below || 0)), turns = E / P;
    const drop = 12, out = S.bitLen + 12, cout = m.collet.l + 14;
    const st = [];
    const add = (sec, cap, fn) => st.push([sec, cap, fn]);
    const hold = two ? "A wrench on the shaft's flats holds it" : L ? "Press and hold the shaft lock" : "Hold the shaft";
    if (S.cam) add(0.9, "Bit change: the router is off", (u) => tcCam(S, tcEase(u)));
    if (S.shoe.length) add(0.8, "The dust shoe off", (u) => { S.shoeDz = 140 * tcEase(u); S.shoeOn = u < 0.98; });
    add(0.5, hold, (u) => { if (L) S.press = tcEase(u); if (two) S.hw = { slide: 1 - tcEase(u), a: 0, show: true }; });
    add(0.6, `${hold}, a ${nut.af} mm wrench on the collet nut`, (u) => { S.nw = { slide: 1 - tcEase(u), a: 0, show: true }; });
    for (let i = 0; i < 2; i++) {                    // break it loose: swing, off, back, on
      add(0.55, "Loosen the nut (a sixth of a turn a swing)", (u) => { const a = -(i + tcEase(u)) * TC_SWING; S.nutA = a; S.nw = { slide: 0, a: -tcEase(u) * TC_SWING, show: true }; S.nutDz = -a / (2 * Math.PI) * P; });
      if (i === 0) add(0.45, "", (u) => { const k = u < 0.33 ? u / 0.33 : u < 0.66 ? 1 : 1 - (u - 0.66) / 0.34; S.nw = { slide: 0.7 * k, a: u < 0.33 ? -TC_SWING : u < 0.66 ? -TC_SWING * (1 - (u - 0.33) / 0.33) : 0, show: true }; });
    }
    add(0.5, "Loose: spin it off by hand", (u) => { S.nw = { slide: tcEase(u), a: -TC_SWING, show: u < 0.98 }; if (L) S.press = 1 - tcEase(u); if (two) S.hw = { slide: tcEase(u), a: 0, show: u < 0.98 }; });
    const a0 = -2 * TC_SWING, z0 = -a0 / (2 * Math.PI) * P;
    const spin = Math.max(1.2, (turns - (z0 / P)) / TC_HAND_RPS);
    add(spin, `Spin it off by hand (${tcFmt(turns)} turns of the ${P} mm thread)`, (u) => { const z = z0 + (E - z0) * u; S.nutDz = z; S.nutA = a0 - (z - z0) / P * 2 * Math.PI; });
    add(0.6, "The nut comes off with the collet and the bit in it", (u) => { S.nutDz = E + drop * tcEase(u); });
    add(0.8, `The old bit out (${tcIn(S.shankA)} shank)`, (u) => { S.bitA = out * tcEase(u); S.showA = u < 0.97; });
    if (S.swap) {
      add(0.8, `Its ${tcIn(S.shankA)} collet out of the nut`, (u) => { S.colA = cout * tcEase(u); S.showColA = u < 0.97; });
      add(0.8, `A ${tcIn(S.shankB)} collet into the nut`, (u) => { S.showColB = true; S.colB = cout * (1 - tcEase(u)); });
    }
    add(0.8, `The new bit in${S.newName ? ": " + S.newName : ""} - to its stickout`, (u) => { S.showB = true; S.bitB = out * (1 - tcEase(u)); });
    add(0.6, "The nut back up to the shaft", (u) => { S.nutDz = E + drop * (1 - tcEase(u)); });
    add(spin, "Spin it on by hand", (u) => { const z = E - (E - z0) * u; S.nutDz = z; S.nutA = a0 - (z - z0) / P * 2 * Math.PI; });
    add(0.6, hold.replace("holds it", "holds it again"), (u) => { if (L) S.press = tcEase(u); if (two) S.hw = { slide: 1 - tcEase(u), a: 0, show: true }; S.nw = { slide: 1 - tcEase(u), a: -TC_SWING, show: true }; });
    for (let i = 0; i < 2; i++) {                    // tighten: the swings back
      add(0.55, "Tighten the nut (snug, not too tight)", (u) => { const a = a0 + (i + tcEase(u)) * TC_SWING; S.nutA = a; S.nw = { slide: 0, a: -TC_SWING + tcEase(u) * TC_SWING, show: true }; S.nutDz = -a / (2 * Math.PI) * P; });
      if (i === 0) add(0.45, "", (u) => { const k = u < 0.33 ? u / 0.33 : u < 0.66 ? 1 : 1 - (u - 0.66) / 0.34; S.nw = { slide: 0.7 * k, a: u < 0.33 ? 0 : u < 0.66 ? -TC_SWING * (u - 0.33) / 0.33 : -TC_SWING, show: true }; });
    }
    add(0.5, "Done: let go of the lock, wrench away", (u) => { S.nw = { slide: tcEase(u), a: 0, show: u < 0.98 }; if (L) S.press = 1 - tcEase(u); if (two) S.hw = { slide: tcEase(u), a: 0, show: u < 0.98 }; S.nutA = 0; S.nutDz = 0; });
    if (S.shoe.length) add(0.8, "The dust shoe back on", (u) => { S.shoeOn = true; S.shoeDz = 140 * (1 - tcEase(u)); });
    if (S.cam) add(0.9, "", (u) => tcCam(S, 1 - tcEase(u)));
    return st;
  }
  const tcFmt = (v) => (+v.toFixed(1)).toString();
  function tcCam(S, k) {                             // eased to a front look at the nut, and back
    const c = S.cam;
    camera.position.lerpVectors(c.p0, c.p1, k);
    controls.target.lerpVectors(c.t0, c.t1, k);
    controls.update();
  }
  // the parts where the change has them: from the snapshot taken at the start (the machine holds still)
  function tcPlace() {
    const S = TC.on;
    if (!S) return;
    const ax = S.axis, Ra = new THREE.Quaternion().setFromAxisAngle(ax, S.nutA);
    const put = (m, r, dz, rot) => {
      if (!m || !r) return;
      m.position.copy(r.p).sub(S.tip);
      if (rot) m.position.applyQuaternion(Ra);
      m.position.add(S.tip).addScaledVector(ax, -dz);
      m.quaternion.copy(rot ? Ra.clone().multiply(r.q) : r.q);
    };
    put(S.nut, S.rest.nut, S.nutDz, true);
    put(S.collet, S.rest.collet, S.nutDz + S.colA, false);
    S.collet.visible = S.showColA;
    if (S.colletB) { put(S.colletB, S.rest.collet, S.nutDz + S.colB, false); S.colletB.visible = S.showColB; }
    if (S.lock) S.lock.position.copy(S.rest.lock.p).addScaledVector(S.lockDir, -S.travel * S.press);
    for (const [b, dz, on] of [[S.bA, S.bitA, S.showA], [S.bB, S.bitB, S.showB]]) {
      if (!b) continue;
      b.position.copy(S.tip).addScaledVector(ax, -(S.nutDz + dz));
      b.quaternion.copy(S.bq);
      b.visible = on;
    }
    for (const b of S.hide) b.visible = false;
    S.shoe.forEach((q, i) => { q.position.copy(S.rest.shoe[i]); q.position.z -= S.shoeDz; q.visible = S.shoeOn; });
    const wr = (w, st, at) => {                      // a wrench: on at its spot, slid out along its slot, turned about the axis
      if (!w) return;
      w.visible = !!(st && st.show);
      if (!w.visible) return;
      const g = w.geometry.userData, q = new THREE.Quaternion().setFromAxisAngle(ax, st.a).multiply(S.frameQ);
      const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      w.quaternion.copy(q);
      w.position.copy(at).addScaledVector(ex, -st.slide * (g.x1 + g.rc + 4));
    };
    wr(S.nutW, S.nw, S.nutAt.clone().addScaledVector(ax, -S.nutDz));
    wr(S.holdW, S.hw, S.flatAt);
  }
  function tcTick(dt) {
    const S = TC.on;
    if (!S) return;
    S.t += dt * TC_ON.speed;
    while (S.k < S.steps.length && S.t >= S.steps[S.k][0]) {   // finish the step, on to the next
      S.steps[S.k][2](1, S);
      S.t -= S.steps[S.k][0];
      S.k++;
      if (S.k < S.steps.length && S.steps[S.k][1]) tcCaption(S.steps[S.k][1]);
    }
    if (S.k >= S.steps.length) return tcEnd();
    S.steps[S.k][2](Math.min(S.t / S.steps[S.k][0], 1), S);
    tcPlace();
  }
  function tcCaption(t) {
    let el = TC.cap;
    if (!el) { el = TC.cap = document.createElement("div"); el.className = "tc-caption"; el.setAttribute("aria-live", "polite"); canvas.parentElement.appendChild(el); }
    el.textContent = t || "";
    el.classList.toggle("on", !!t);
  }
  // the visible bit now (the job's, the one put in by hand, else the model's), its shank
  function tcBitNow() {
    if (jobBit && JOB.bits) for (const [t, b] of JOB.bits) if (b.visible) { const def = JOB.tl && JOB.tl.tools.get(t); return { mesh: b, d: def ? def.diameter : 6.35 }; }
    if (HAND.bitMesh && HAND.bitMesh.visible) return { mesh: HAND.bitMesh, d: HAND.bit.d };
    return { mesh: tcMesh("Router_Bit"), d: RT_BIT.d };
  }
  // play a change: o = { bit: the new bit (HandSetup form: { shape, d, len, flen, ... }) | null (the same bit back),
  // cam: true = ease the view to the nut and back, from: { d, mesh } the bit going out (else the one drawn now) }; resolves when done (at once if there's no router to change on)
  function tcPlay(o) {
    o = o || {};
    if (TC.on) return TC.on.done;
    const rb = tcMesh("Router_Bit"), nutM = tcMesh("Router_ColletNut"), colM = tcMesh("Router_Collet"), r = LR4Routers.ROUTERS[RT.set.router];
    if (!rb || !nutM || !colM || !r || !RT.body) return Promise.resolve(false);
    const m = r.model, sizes = m.collet.sizes, cur = tcBitNow();   // o.from: the bit going out, when the caller knows it (a job's last tool)
    const now = o.from ? { mesh: o.from.mesh || cur.mesh, d: o.from.d } : cur;
    move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);   // the parts at rest, unturned
    const tip = bitTip(rb), ax = new THREE.Vector3(0, 0, 1).applyQuaternion(rb.quaternion).normalize();
    const S = { model: m, t: 0, k: 0, tip, axis: ax, nutA: 0, nutDz: 0, press: 0, colA: 0, colB: 0, bitA: 0, bitB: 0,
      showA: true, showB: false, showColA: true, showColB: false, nw: null, hw: null, nut: nutM, collet: colM, hide: [] };
    S.rest = { nut: { p: nutM.userData.rest ? nutM.userData.rest.p.clone() : nutM.position.clone(), q: nutM.userData.rest ? nutM.userData.rest.q.clone() : nutM.quaternion.clone() },
      collet: { p: colM.userData.rest ? colM.userData.rest.p.clone() : colM.position.clone(), q: colM.userData.rest ? colM.userData.rest.q.clone() : colM.quaternion.clone() } };
    // the router's own frame in the world (its +x = the switch end; the nut's flats face +-y): the wrenches' rest turn
    const f = RT.body.f, xr = new THREE.Vector3(...LR4RouterBody.placeV([1, 0, 0], f, true)).applyQuaternion(rb.quaternion);
    S.frameQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xr, ax.clone().cross(xr), ax));
    const at = (z) => { const p = new THREE.Vector3(...LR4RouterBody.placeV([0, 0, z], f)); nutM.updateMatrixWorld(); return p.applyMatrix4(nutM.matrixWorld); };
    S.nutAt = at(m.collet_nut.h * 0.55);
    S.nutW = tcWrench("nut", m.collet_nut.af);
    if (!m.shaft_lock && m.shaft.flats) { S.flatAt = at(m.shaft.flats.z + m.shaft.flats.l / 2); S.holdW = tcWrench("flats", m.shaft.flats.af); }
    const lock = tcMesh("Router_ShaftLock");
    if (m.shaft_lock && lock) {
      S.lock = lock; S.rest.lock = { p: lock.position.clone() }; S.travel = m.shaft_lock.travel;
      S.lockDir = new THREE.Vector3(...lock.userData.lockDir).applyQuaternion(rb.quaternion);
    }
    // the bits: the one in now (a copy of it rides out), the new one (from its form, as table.js handBit draws it)
    S.bq = rb.quaternion.clone();
    S.hide = [rb, HAND.bitMesh, ...(JOB.bits ? JOB.bits.values() : [])].filter(Boolean);
    S.shoe = meshes.filter((q) => q.visible && /^(Dust_Shoe|Dust_Skirt|Bristles_TPU)/.test(q.userData.name || ""));   // (+ its bolts)
    S.rest.shoe = S.shoe.map((q) => q.position.clone());
    S.shoeDz = 0; S.shoeOn = true;
    S.vis = S.hide.map((b) => b.visible);
    const g0 = (now.mesh || rb).geometry;
    if (!g0.boundingBox) g0.computeBoundingBox();
    S.bitLen = g0.boundingBox.max.z - g0.boundingBox.min.z;
    S.own = [];                                      // geometry / materials made here (freed at the end)
    if (now.mesh === rb) {                           // the model bit's geometry is in the build's frame: its tip to the origin
      const tl = tip.clone().sub(rb.position).applyQuaternion(rb.quaternion.clone().invert());
      S.bA = new THREE.Mesh(rb.geometry.clone().translate(-tl.x, -tl.y, -tl.z), rb.material);
      S.own.push(S.bA.geometry);
    } else S.bA = now.mesh ? now.mesh.clone() : null;
    if (S.bA) scene.add(S.bA);
    const nb = o.bit || null, len = nb && nb.len > 0 ? nb.len : S.bitLen;
    S.bB = nb ? jobBitMesh(Object.assign(HandSetup.toDef(nb), { overallLength: len, fluteLength: nb.flen > 0 ? nb.flen : nb.d > colletMax() + 0.01 ? undefined : Math.min(len, nb.d * 3) }), TOOL_RGB[0])
      : S.bA ? S.bA.clone() : null;
    if (nb && S.bB) S.own.push(S.bB.geometry, ...[].concat(S.bB.material));
    if (S.bB) { S.bB.visible = false; scene.add(S.bB); }
    S.newName = nb ? HandSetup.bitName(nb) : "";
    S.shankA = tcShank(now.d, sizes); S.shankB = tcShank(nb ? nb.d : now.d, sizes);
    S.swap = Math.abs(S.shankA - S.shankB) > 0.01;
    if (S.swap) {                                    // the other collet: the same one, its bore for the new shank (a shade apart)
      S.colletB = new THREE.Mesh(colM.geometry, colM.material.clone());
      S.own.push(S.colletB.material);
      S.colletB.material.color.offsetHSL(0, 0, -0.08);
      S.colletB.visible = false;
      scene.add(S.colletB);
    }
    if (o.cam && !(window.LR4Director && LR4Director.directing && LR4Director.directing())) {   // (a video moves the camera itself)
      const t1 = S.nutAt.clone().addScaledVector(ax, -14), dir = new THREE.Vector3(0.35, -1, 0).normalize();   // from the front, a little to the switch side
      S.cam = { p0: camera.position.clone(), t0: controls.target.clone(), t1, p1: t1.clone().addScaledVector(dir, 210).add(new THREE.Vector3(0, 0, 25)) };
    }
    S.steps = tcSteps(S);
    S.done = new Promise((res) => { S.res = res; });
    TC.on = S;
    tcCaption(S.steps[0][1]);
    tcPlace();
    return S.done;
  }
  function tcEnd() {
    const S = TC.on;
    TC.on = null;
    for (const w of Object.values(TC.wrench)) w.visible = false;
    for (const b of [S.bA, S.bB, S.colletB]) if (b) scene.remove(b);
    for (const g of S.own) g.dispose();
    S.hide.forEach((b, i) => { b.visible = S.vis[i]; });
    S.collet.visible = true;
    S.shoe.forEach((q, i) => q.position.copy(S.rest.shoe[i]));
    if (S.lock) S.lock.position.copy(S.rest.lock.p);
    tcCaption("");
    applyVisibility();
    move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);
    S.res(true);
  }
  window.LR4ToolChange = { play: (o) => tcPlay(o), busy: () => !!TC.on, speed: (k) => { TC_ON.speed = k > 0 ? k : 1; },
    state: () => (TC.on ? { k: TC.on.k, n: TC.on.steps.length, nutDz: +TC.on.nutDz.toFixed(3), nutA: +TC.on.nutA.toFixed(3), press: TC.on.press, swap: TC.on.swap,
      two: !!TC.on.holdW, wrench: !!(TC.on.nutW && TC.on.nutW.visible), caption: TC.cap ? TC.cap.textContent : "" } : null) };
