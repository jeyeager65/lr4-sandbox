// lr4-sandbox page: the touch plate's cable as a rope, and the clip flung off the collet nut (Part 44d, user 2026-10-27).
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html).
  // ---- The plate's wire (red) and the clip's (black) come out of the small rectangular hole in the core's front face
  // together and split there (user 2026-10-27, their screenshots; Core.stl scan: ~6 x 3.5 mm at x 545-551, z 133-136.5,
  // through the front at y 650, its top sloping up as it goes in). Two Verlet ropes, each pinned in the hole (they
  // ride the core): the clip's ends at the crimp, then
  // the clip itself as a rigid 2-node body (crimp + far end); the plate's at the spade. They replace the short stubs
  // the parts were exported with (TouchPlate_Wire, TouchPlate_Clip_Insulation: hidden, panel.js ROPE_STUB; user): each
  // wire's last segment is pinned where its stub was, so it leaves the crimp / spade straight. The slack
  // lives in the core: each wire pays in / out to ~1.2x what it needs. Stiff (user: "stiffer, not break, not hang down
  // as far"): bend edges over every two segments, a no-stretch pass, and short most-out lengths. The plate end always
  // follows the plate; the clip ends follow the clip while it's held (stored on its bolt, or out on the nut).
  // (Video Clip: LEAVE=on) keeps the clip on the nut after a probe (job.js TOUCH_ANIM.leave); the router starts
  // anyway and once it spins the magnet lets go: the clip flies off tangentially (clockwise from above), pays its wire
  // out to ROPE.cmax, snaps, swings and hangs - clanking on what it hits. The job carries on. ----
  const ROPE = { nc: 16, np: 20, cmax: 170, pmax: 320, r: 1.1, len: 26,   // GUESS (mm): the most wire the core lets out to
    // the clip / the plate (measure yours); len: crimp -> clip tip
    win: [-5.0, 18.3, 0.4], dx: 1.3,                  // the hole's middle (at the face) from the crimp's stored spot (FCStd,
    // 2026-10-27); the two wires side by side, +-dx; each from 2 mm in to 6 mm out the front (-Y), the first segment
    // pinned so they're seen coming out of the hole
    from: [0, 2, 0], out: [0, -6, -0.5],
    p: null, q: null, Lc: 0, Lp: 0, at: null, mesh: null, eBase: null, tBase: null, pBase: null, flung: null, spun: 0, cols: null, colsT: 0, clank: 0 };
  const ROPE_G = 9810, ROPE_H = 1 / 240;              // mm/s^2; the step (s)
  // (not the core / mounts: their boxes hold the hole the wires come out of - they shoved the wires out, 2026-10-27)
  const ROPE_COLS = /^(Router_Housing|Router_ColletNut|Router_Bit|Tool_Mount_[TB]_Kobalt|Dust_Shoe|Spoilboard)$/;
  const ROPE_STUB = /^TouchPlate_(Wire|Clip_Insulation)$/;   // drawn by the ropes instead (panel.js applyVisibility)
  const ROPE_COLS_HELD = /^(Router_Housing|Tool_Mount_[TB]_Kobalt|Spoilboard)$/;   // held: the nut / bit hold the clip itself
  const ROPE_RING = 43;                               // mm: the tool mounts' clamp rings round the router's axis (FCStd: median
                                                      // 39-41, the bolt ears 49-51; 47 had the hanging wire fighting it; their
                                                      // boxes held the wires' hole, 2026-10-27)
  // node layout: the clip's wire 0..CE (0 in the hole, CE = the crimp), CT = the clip's far end, the plate's p0..PE
  // (p0 in the hole, PE = its stub); edges [a, b, which length]: c / p a share of the wire, k = the clip
  const RN = (() => {
    const { nc, np } = ROPE, CE = nc - 1, CT = nc, p0 = nc + 1, PE = p0 + np - 1;
    const chains = [[...Array(nc).keys()], Array.from({ length: np }, (_, i) => p0 + i)];
    const link = (ch, k) => ch.slice(1).map((i, j) => [ch[j], i, k]);
    const order = [...link(chains[0], "c").slice(0, -1), [CE - 1, CE, "u"], [CE, CT, "k"], ...link(chains[1], "p")];   // also the no-stretch pass's order
    // the clip is rigid with its crimp's straight bit of wire (CE-1 .. CE .. CT: a triangle of fixed sides; user: the wire
    // comes straight out of the end of the clip, through the crimp)
    const B = [];                                     // bend edges: they only push (a pair can't fold closer than ~1.9 segments)
    chains.forEach((ch, k) => { for (let i = 0; i + 2 < ch.length; i++) B.push([ch[i], ch[i + 2], "cp"[k]]); });
    return { CE, CT, p0, PE, n: PE + 1, E: [...order, [CE - 1, CT, "s"]], B, order, chains };
  })();
  const ropeClip = () => meshes.filter((m) => CLIP_RE.test(m.userData.name || ""));
  const ropeBaseOf = (m) => new THREE.Vector3(...(m.userData.base || { t: [0, 0, 0] }).t);
  // (base frame) the centroid of the stub's free end: pick = "low" / "high" z - as stored on the Kobalt (in a cage,
  // Part 50: picked with the cage's move undone, then moved back; kobalt: left as on the Kobalt - the core's hole)
  function ropeEnd(ms, pick, kobalt) {
    const v = new THREE.Vector3(), pts = [], M = touchMatrix(ms[0].userData.name), Mi = M && M.clone().invert();
    for (const m of ms) {
      const a = m.geometry.attributes.position.array, b = ropeBaseOf(m);
      for (let i = 0; i < a.length; i += 3) {
        v.set(a[i], a[i + 1], a[i + 2]);
        if (Mi) v.applyMatrix4(Mi);
        pts.push(v.clone().add(b));
      }
    }
    const zs = pts.map((p) => p.z), z = pick === "low" ? Math.min(...zs) : Math.max(...zs);
    const end = pts.filter((p) => Math.abs(p.z - z) < 0.6);
    const c = end.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / end.length);
    if (M && !kobalt) { const b = ropeBaseOf(ms[0]); c.sub(b).applyMatrix4(M).add(b); }
    return c;
  }
  function ropeBase() {                               // the stubs' ends + the clip's far end (stored pose, base frame), once
    const cw = meshes.filter((m) => /^TouchPlate_Clip_(Wire|Insulation)$/.test(m.userData.name || "")), jaw = meshes.find((m) => m.userData.name === "TouchPlate_Clip_A");
    const pw = meshes.find((m) => m.userData.name === "TouchPlate_Wire");
    if (!cw.length || !jaw || !pw) return false;
    if (ROPE.eBase && ROPE.baseGeo === pw.geometry) return true;   // again when the parts are redrawn (a new mount's cage)
    ROPE.baseGeo = pw.geometry;
    const ins = cw.find((m) => m.userData.name === "TouchPlate_Clip_Insulation") || cw[0];
    ROPE.eBase = ropeEnd(cw, "low");                  // the clip's stub hangs down from the crimp: its free end
    ROPE.hBase = ropeEnd(cw, "low", true);            // the same on the Kobalt: what the core's hole is measured from
    ROPE.cBase = ropeEnd([ins], "high");              // and where it leaves the crimp
    ROPE.pBase = ropeEnd([pw], "high");               // the plate's leaves the spade upward (stored): its free end
    ROPE.sBase = ropeEnd([pw], "low");                // and the spade
    jaw.geometry.computeBoundingBox();
    const jc = jaw.geometry.boundingBox.getCenter(new THREE.Vector3()).add(ropeBaseOf(jaw));
    ROPE.tBase = ROPE.cBase.clone().add(jc.sub(ROPE.cBase).normalize().multiplyScalar(ROPE.len));
    return true;
  }
  const ropeAnchor = (dx, at) => ROPE.hBase.clone().add(new THREE.Vector3(ROPE.win[0] + at[0] + dx, ROPE.win[1] + at[1], ROPE.win[2] + at[2])).add(touchMotion());
  const ropeAt = (m, p) => p.clone().sub(ropeBaseOf(m)).applyQuaternion(m.quaternion).add(m.position);   // a base-frame point where m is now
  function ropeEnds() {                               // world: clip [crimp, clip tip, stub end] (null once flung), plate [spade, stub end]
    const jaw = meshes.find((q) => q.userData.name === "TouchPlate_Clip_A"), pw = meshes.find((q) => q.userData.name === "TouchPlate_Wire");
    return { clip: ROPE.flung ? null : [ropeAt(jaw, ROPE.cBase), ropeAt(jaw, ROPE.tBase), ropeAt(jaw, ROPE.eBase)],
      plate: [ropeAt(pw, ROPE.sBase), ropeAt(pw, ROPE.pBase)] };
  }
  // a mount as its outline round the router's axis (Part 50, user 2026-10-31: the wires went through the Makita's bottom
  // mount - its ears / cage reach past the ring): per 5 deg and 3 mm of height, how far out it reaches (its triangles
  // sampled ~2 mm apart), once per mesh (in the mesh's frame: it rides the core with the router). The cells round the
  // core's hole are left at ROPE_RING (the wires come out there; a mount's box there shoved them out, 2026-10-27)
  const ROPE_PA = 72, ROPE_PZ = 3;
  function ropeProfile(m, axis, b) {
    const la = m.worldToLocal(axis.clone()), key = la.x.toFixed(1) + "," + la.y.toFixed(1);
    let P = m.userData.ropeProf;
    if (!P || P.geo !== m.geometry || P.key !== key) {
      const g = m.geometry, pa = g.attributes.position, ix = g.index, n = ix ? ix.count : pa.count;
      g.computeBoundingBox();
      const z0 = g.boundingBox.min.z, nz = Math.ceil((g.boundingBox.max.z - z0) / ROPE_PZ) + 1, rad = new Float32Array(ROPE_PA * nz);
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), v = new THREE.Vector3();
      const put = (p) => {
        const dx = p.x - la.x, dy = p.y - la.y, r = Math.hypot(dx, dy);
        const ia = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) * ROPE_PA) % ROPE_PA, iz = Math.floor((p.z - z0) / ROPE_PZ);
        const k = iz * ROPE_PA + ia;
        if (r > rad[k]) rad[k] = r;
      };
      for (let i = 0; i < n; i += 3) {
        A.fromBufferAttribute(pa, ix ? ix.getX(i) : i); B.fromBufferAttribute(pa, ix ? ix.getX(i + 1) : i + 1); C.fromBufferAttribute(pa, ix ? ix.getX(i + 2) : i + 2);
        const s = Math.min(12, Math.ceil(Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A)) / 2));
        for (let u = 0; u <= s; u++) for (let w = 0; w <= s - u; w++) {
          put(v.copy(A).multiplyScalar(1 - (u + w) / s || 0).addScaledVector(B, s ? u / s : 0).addScaledVector(C, s ? w / s : 0));
        }
      }
      P = m.userData.ropeProf = { geo: m.geometry, key, z0, nz, rad, open: null };
    }
    if (!P.open && ROPE.hBase) {                      // the hole: its cells (and their neighbours) no further out than the ring
      P.open = true;
      for (const dx of [-ROPE.dx, ROPE.dx]) for (const at of [ROPE.from, ROPE.out]) {
        const h = m.worldToLocal(ropeAnchor(dx, at)), r = Math.hypot(h.x - la.x, h.y - la.y);
        const ia = Math.floor(((Math.atan2(h.y - la.y, h.x - la.x) / (2 * Math.PI)) + 1) * ROPE_PA) % ROPE_PA, iz = Math.floor((h.z - P.z0) / ROPE_PZ);
        for (let a = -1; a <= 1; a++) for (let z = -2; z <= 2; z++) {
          if (iz + z < 0 || iz + z >= P.nz) continue;
          const k = (iz + z) * ROPE_PA + (ia + a + ROPE_PA) % ROPE_PA;
          P.rad[k] = Math.min(P.rad[k], Math.max(ROPE_RING, r - 2));
        }
      }
    }
    m.updateMatrixWorld();
    const o = new THREE.Vector3(la.x, la.y, P.z0).applyMatrix4(m.matrixWorld);
    return { prof: P, x: o.x, y: o.y, z0: o.z, z1: b.max.z };
  }
  function ropeColliders(held) {                      // boxes (the router body, the mounts' outlines round it) of what
    const out = [];                                   // the cable can hit
    let axis = null;                                  // the router's axis (x, y): the mounts' rings are round it
    const add = (m) => {
      if (!m || !m.visible || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.updateMatrixWorld();
      const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
      if (/^Router_Housing$/.test(m.userData.name)) {
        const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
        out.push({ cyl: true, x: c.x, y: c.y, r: Math.min(s.x, s.y) / 2, z0: b.min.z, z1: b.max.z });
        axis = c;
      } else if (/^Tool_Mount_/.test(m.userData.name)) { if (axis) out.push(ropeProfile(m, axis, b)); }
      else out.push({ b });
    };
    const list = meshes.filter((m) => (held ? ROPE_COLS_HELD : ROPE_COLS).test(m.userData.name || ""));
    for (const m of list.sort((a, b) => (a.userData.name === "Router_Housing" ? -1 : b.userData.name === "Router_Housing" ? 1 : 0))) add(m);   // the router first: its axis
    if (JOB.stock && JOB.stock.visible) out.push({ b: new THREE.Box3().setFromObject(JOB.stock) });   // a group: top + walls
    return out;
  }
  function ropePen(p, R, c) {                         // how far p (radius R) is into collider c: { n (out), d } or null
    if (c.prof) {                                     // a mount's outline: out sideways, or over / under its cells
      const P = c.prof, dx = p.x - c.x, dy = p.y - c.y, r = Math.hypot(dx, dy);
      const ia = Math.floor(((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) * ROPE_PA) % ROPE_PA;
      const at = (iz) => (iz < 0 || iz >= P.nz ? 0 : P.rad[iz * ROPE_PA + ia]);
      const lo = Math.floor((p.z - R - c.z0) / ROPE_PZ), hi = Math.floor((p.z + R - c.z0) / ROPE_PZ);
      let rad = 0;
      for (let iz = lo; iz <= hi; iz++) rad = Math.max(rad, at(iz));
      if (!rad || r >= rad + R) return null;
      const side = rad + R - r;
      let up = hi, dn = lo;                           // the nearest clear slab above / below
      while (up < P.nz && at(up) && r < at(up) + R) up++;
      while (dn >= 0 && at(dn) && r < at(dn) + R) dn--;
      const dUp = c.z0 + up * ROPE_PZ + R - p.z, dDn = p.z - (c.z0 + (dn + 1) * ROPE_PZ - R);
      if (dUp < side && dUp <= dDn) return { n: new THREE.Vector3(0, 0, 1), d: dUp };
      if (dDn < side) return { n: new THREE.Vector3(0, 0, -1), d: dDn };
      return { n: r > 1e-6 ? new THREE.Vector3(dx / r, dy / r, 0) : new THREE.Vector3(1, 0, 0), d: side };
    }
    if (c.cyl) {
      if (p.z < c.z0 - R || p.z > c.z1 + R) return null;
      const dx = p.x - c.x, dy = p.y - c.y, r = Math.hypot(dx, dy);
      if (r >= c.r + R) return null;
      const side = c.r + R - r, bottom = p.z - (c.z0 - R);
      if (bottom < side) return { n: new THREE.Vector3(0, 0, -1), d: bottom };
      return { n: r > 1e-6 ? new THREE.Vector3(dx / r, dy / r, 0) : new THREE.Vector3(1, 0, 0), d: side };
    }
    const b = c.b;
    if (p.x < b.min.x - R || p.x > b.max.x + R || p.y < b.min.y - R || p.y > b.max.y + R || p.z < b.min.z - R || p.z > b.max.z + R) return null;
    const pen = [[p.x - (b.min.x - R), -1, 0, 0], [b.max.x + R - p.x, 1, 0, 0], [p.y - (b.min.y - R), 0, -1, 0],
      [b.max.y + R - p.y, 0, 1, 0], [p.z - (b.min.z - R), 0, 0, -1], [b.max.z + R - p.z, 0, 0, 1]];
    const k = pen.reduce((a, e) => (e[0] < a[0] ? e : a));
    return { n: new THREE.Vector3(k[1], k[2], k[3]), d: k[0] };
  }
  function ropePush(i) {                              // node i out of the colliders; the speed into the surface (mm/s)
    const p = ROPE.p[i], q = ROPE.q[i], R = (i === RN.CE || i === RN.CT ? 3 : 0) + ROPE.r;   // the clip is bulkier than its wire
    let hit = 0;
    for (const c of ROPE.cols) {
      const e = ropePen(p, R, c);
      if (!e) continue;
      // out without a kick (q moved too: a push mustn't become speed - it made the wires bounce), then no speed into
      // the surface, and friction along it
      const vn = p.clone().sub(q).dot(e.n);
      hit = Math.max(hit, -vn / ROPE_H);
      p.addScaledVector(e.n, e.d); q.addScaledVector(e.n, e.d);
      if (vn < 0) q.addScaledVector(e.n, vn);
      q.lerp(p, 0.4);
    }
    return hit;
  }
  // a segment between two nodes outside a part can still cut its corner (user 2026-10-27: through the stock's edge):
  // points along it are tested too, and both ends move out by what the deepest one is in (by their inverse masses)
  function ropePushSeg(i, j, w) {
    const a = ROPE.p[i], b = ROPE.p[j], wa = w(i), wb = w(j);
    if (wa + wb === 0) return;
    for (const c of ROPE.cols) {
      let best = null;
      for (const t of [0.25, 0.5, 0.75]) {
        const e = ropePen(a.clone().lerp(b, t), ROPE.r, c);
        if (e && (!best || e.d > best.d)) best = e;
      }
      if (!best) continue;
      const da = best.d * wa / Math.max(wa, wb), db = best.d * wb / Math.max(wa, wb);   // (q too: no kick)
      a.addScaledVector(best.n, da); ROPE.q[i].addScaledVector(best.n, da);
      b.addScaledVector(best.n, db); ROPE.q[j].addScaledVector(best.n, db);
    }
  }
  function ropeLine(chain, a, b, sag) {               // lay a chain's nodes from a to b, sagging
    chain.forEach((i, k) => {
      const f = k / (chain.length - 1), p = a.clone().lerp(b, f);
      p.z -= Math.sin(Math.PI * f) * sag;
      ROPE.p[i] = p; ROPE.q[i] = p.clone();
    });
  }
  function ropeInit(ac, ap, E) {
    ROPE.p = new Array(RN.n); ROPE.q = new Array(RN.n);
    ROPE.Lc = ac.distanceTo(E.clip[2]) * 1.2; ROPE.Lp = ap.distanceTo(E.plate[1]) * 1.2;
    ropeLine(RN.chains[0], ac, E.clip[0], 0.2 * ROPE.Lc);
    ropeLine(RN.chains[1], ap, E.plate[0], 0.2 * ROPE.Lp);
    for (const [i, v] of [[RN.CT, E.clip[1]], [RN.CE - 1, E.clip[2]], [RN.PE - 1, E.plate[1]]]) { ROPE.p[i] = v.clone(); ROPE.q[i] = v.clone(); }
  }
  function ropeMesh() {                               // the two wires, rebuilt every frame (low poly)
    if (!ROPE.mesh) {
      const ins = meshes.find((m) => m.userData.name === "TouchPlate_Clip_Insulation");
      const black = ins ? ins.material : new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.6 });
      const red = new THREE.MeshStandardMaterial({ color: 0x8a0e0e, roughness: 0.55 });   // the plate's wire: a deep red, easier to see (user)
      ROPE.mesh = new THREE.Group();
      ROPE.mesh.userData.name = "TouchPlate_Cable";
      ROPE.mesh.add(new THREE.Mesh(new THREE.BufferGeometry(), black), new THREE.Mesh(new THREE.BufferGeometry(), red));
      scene.add(ROPE.mesh);
    }
    RN.chains.forEach((ch, k) => {
      const pts = ch.map((i) => ROPE.p[i]), m = ROPE.mesh.children[k];
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, ROPE.r, 6, false);
    });
  }
  function ropeFling() {                              // the magnet lets go: off the nut's flat, along the turn (clockwise)
    const nut = meshes.find((m) => m.userData.name === "Router_ColletNut"), { CE, CT } = RN;
    const c = nut ? new THREE.Box3().setFromObject(nut).getCenter(new THREE.Vector3()) : ROPE.p[CE].clone();
    const r = ROPE.p[CE].clone().sub(c).setZ(0).normalize(), tan = new THREE.Vector3(0, 0, 1).cross(r).negate();
    const v = tan.multiplyScalar(1300).addScaledVector(r, 450).add(new THREE.Vector3(0, 0, 250));   // ~1.4 m/s: early in the spin-up
                                                      // (2.8 m/s looked wild in the video, user 2026-10-27)
    for (const i of [CE - 1, CE, CT]) ROPE.q[i].copy(ROPE.p[i]).addScaledVector(v, -ROPE_H * (i === CT ? 1.25 : 1));   // a tumble
    ROPE.flung = { t: 0, e0: ROPE.p[CE].clone(), d0: ROPE.p[CT].clone().sub(ROPE.p[CE]).normalize() };
    ROPE.cols = ropeColliders(false); ROPE.colsT = 0;
    for (const m of ropeClip()) { m.userData.held = true; m.userData.flingQ = m.quaternion.clone(); m.userData.flingP = m.position.clone(); }
    if (SND.s) SND.s.event("clank");
    const el = $("heat-note");
    if (el) { el.textContent = "The clip was still on the collet nut: the router flung it off. Take the clip off before the router starts."; el.hidden = false; }
  }
  function ropeClipPlace() {                          // the flung clip: its crimp on CE, pointing CE -> CT
    const F = ROPE.flung, e = ROPE.p[RN.CE], d = ROPE.p[RN.CT].clone().sub(e).normalize();
    // turned a little from last frame's pose (the shortest turn from the nut's pose flipped it round when d came near
    // -d0: the user saw it jump about, 2026-10-27)
    if (!F.q) { F.q = new THREE.Quaternion(); F.d = F.d0.clone(); }
    F.q.premultiply(new THREE.Quaternion().setFromUnitVectors(F.d, d)).normalize(); F.d.copy(d);
    const q = F.q;
    for (const m of ropeClip()) {
      m.quaternion.copy(q).multiply(m.userData.flingQ);
      m.position.copy(m.userData.flingP).sub(F.e0).applyQuaternion(q).add(e);
    }
  }
  function ropeReset(keep) {                          // the clip home on its bolt (a new probe: keep = still LEAVE; Clip LEAVE=off)
    if (!keep) TOUCH_ANIM.leave = false;
    if (!ROPE.flung) return;
    ROPE.flung = null; ROPE.p = null; ROPE.at = null;
    TOUCH_ANIM.clip = 0;
    for (const m of ropeClip()) { m.userData.held = false; m.quaternion.identity(); }
    if (meta) move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);
  }
  function ropeTick(dt) {
    const ins = meshes.find((m) => m.userData.name === "TouchPlate_Clip_Insulation");
    const show = !!(ins && ins.userData.shown) && ropeBase();   // the stub's own visibility (panel.js hides the stub itself)
    if (ROPE.mesh) ROPE.mesh.visible = show;
    if (!show || dt <= 0) return;
    const A = TOUCH_ANIM, { CE, CT, p0, PE, E } = RN, ac = ropeAnchor(ROPE.dx, ROPE.from), ap = ropeAnchor(-ROPE.dx, ROPE.from);   // clip's +X (it hangs that side)
    const acOut = ropeAnchor(ROPE.dx, ROPE.out), apOut = ropeAnchor(-ROPE.dx, ROPE.out);
    if (!ROPE.flung && A.leave && A.clip >= 1 && JOB.spinning) { if ((ROPE.spun += dt) > 0.25) { ROPE.spun = 0; if (ROPE.p) ropeFling(); } }
    else ROPE.spun = 0;
    const ends = ropeEnds(), held = ends.clip;
    if (!ROPE.p) ropeInit(ac, ap, ends);
    // calm (user 2026-10-27: "they bounce around way too much"): with the clip + plate stored the whole cable rides the
    // core - every node carried by its move (no swing from the gantry); the slack only changes outside a band (it was
    // re-tuned every frame and kept tugging the nodes); heavy drag unless the clip is flying
    const stored = held && !A.out && A.plate <= 0 && A.clip <= 0;
    if (ROPE.at && stored) {
      const dm = ac.clone().sub(ROPE.at);
      if (dm.lengthSq() > 0) for (let i = 0; i < RN.n; i++) { ROPE.p[i].add(dm); ROPE.q[i].add(dm); }
    }
    ROPE.at = ac.clone();
    // put away and settled (1.5 s): the shape rides the core rigidly, no physics (user 2026-10-28: "shouldn't bounce
    // around at all when put away" - the colliders' refresh and the slack still nudged them)
    ROPE.still = stored ? (ROPE.still || 0) + dt : 0;
    if (!stored) ROPE.frozen = null;
    if (stored && ROPE.still > 1.5) {
      if (!ROPE.frozen) ROPE.frozen = ROPE.p.map((p) => p.clone().sub(ac));
      ROPE.frozen.forEach((r, i) => { ROPE.p[i].copy(ac).add(r); ROPE.q[i].copy(ROPE.p[i]); });
      ROPE.rel = ROPE.frozen.map((r) => r.clone()); ROPE.vmax = 0; ROPE.vnode = -1;
      ropeMesh();
      return;
    }
    const pay = (L, need, max) => {                   // grow when it's near taut, shrink only when it's clearly slack
      const lo = need * 1.1 + 3, hi = need * 1.45 + 10;
      return L < lo ? Math.min(max, L + Math.min(400 * dt, lo - L)) : L > hi ? L - Math.min(60 * dt, L - hi) : L;
    };
    ROPE.Lp = pay(ROPE.Lp, ap.distanceTo(ends.plate[1]), ROPE.pmax);   // each wire: what reaches its end, a little slack
    if (held) ROPE.Lc = pay(ROPE.Lc, ac.distanceTo(held[2]), ROPE.cmax);
    else {
      ROPE.flung.t += dt;
      ROPE.Lc = Math.min(ROPE.cmax, ROPE.Lc + 2500 * dt);   // pays out of the core as it's yanked
    }
    if (!ROPE.cols || (ROPE.colsT += dt) > 0.25) { ROPE.cols = ropeColliders(!!held); ROPE.colsT = 0; }   // the core moves on
    const rest = { c: ROPE.Lc / (ROPE.nc - 2), p: ROPE.Lp / (ROPE.np - 2), k: ROPE.len,   // the last segment: the stub's
      u: ROPE.eBase.distanceTo(ROPE.cBase), s: ROPE.eBase.distanceTo(ROPE.tBase) };   // the crimp's wire; its end -> the clip's far end
    const pin = (i) => i <= 1 || i === p0 || i === p0 + 1 || i === PE || i === PE - 1 || (held && (i === CE || i === CT || i === CE - 1));
    const w = (i) => (pin(i) ? 0 : i === CE || i === CT || i === CE - 1 ? 0.25 : 1);   // inverse masses: the clip is heavy
    const steps = Math.min(30, Math.ceil(dt / ROPE_H)), g = ROPE_G * ROPE_H * ROPE_H;
    let hit = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < RN.n; i++) {
        if (pin(i)) continue;
        // held: no momentum at all, each step just settles toward its rest shape (user 2026-10-28: "they dont need to
        // bounce at all" while probing; 0.95 drag still swung when Z moved); flung: real swing
        const p = ROPE.p[i], v = p.clone().sub(ROPE.q[i]).multiplyScalar(held ? 0 : 0.99);
        ROPE.q[i].copy(p); p.add(v); p.z -= g;
      }
      const fix = (i, v) => { ROPE.p[i].copy(v); ROPE.q[i].copy(v); };
      fix(0, ac); fix(1, acOut); fix(p0, ap); fix(p0 + 1, apOut); fix(PE, ends.plate[0]); fix(PE - 1, ends.plate[1]);
      if (held) { fix(CE, held[0]); fix(CT, held[1]); fix(CE - 1, held[2]); }
      const solve = (i, j, r, stiff) => {
        const p0 = ROPE.p[i], p1 = ROPE.p[j], w0 = w(i), w1 = w(j);
        if (w0 + w1 === 0) return;
        const d = p1.clone().sub(p0), l = d.length() || 1e-6;
        if (stiff < 1 && l > r) return;               // bend edges only push, never pull
        const f = stiff * (l - r) / l / (w0 + w1);
        p0.addScaledVector(d, f * w0); p1.addScaledVector(d, -f * w1);
      };
      for (let it = 0; it < 20; it++) {
        for (const [i, j, k] of E) solve(i, j, rest[k], 1);
        for (const [i, j, k] of RN.B) solve(i, j, 1.9 * rest[k], 0.5);
      }
      for (const [i, j, k] of RN.order) {           // no stretch: each node back within its edge (hole outward)
        if (pin(j)) continue;
        const d = ROPE.p[j].clone().sub(ROPE.p[i]), l = d.length();
        if (l > rest[k] * 1.02) {                     // (q moved with it: a correction mustn't become speed)
          const was = ROPE.p[j].clone();
          ROPE.p[j].copy(ROPE.p[i]).addScaledVector(d, rest[k] * 1.02 / l);
          ROPE.q[j].add(ROPE.p[j].clone().sub(was));
        }
      }
      for (const [i, j] of RN.order) ropePushSeg(i, j, w);
      for (let i = 0; i < RN.n; i++) if (!pin(i)) { const h = ropePush(i); if (i === CE || i === CT) hit = Math.max(hit, h); }
    }
    let vm = 0, vi = -1;                              // the fastest node frame to frame, relative to the core (the director's log)
    const rel = ROPE.p.map((p) => p.clone().sub(ac));
    if (ROPE.rel) rel.forEach((r, i) => { const v = r.distanceTo(ROPE.rel[i]) / dt; if (v > vm) { vm = v; vi = i; } });
    ROPE.rel = rel; ROPE.vmax = vm; ROPE.vnode = vi;
    if (!held) {
      ROPE.clank -= dt;
      if (hit > 450 && ROPE.clank <= 0 && SND.s) { SND.s.event(hit > 1500 ? "clank" : "clink"); ROPE.clank = 0.12; }
      ropeClipPlace();
    }
    ropeMesh();
  }
  window.LR4Clip = { leave(on) { if (on) TOUCH_ANIM.leave = true; else ropeReset(); },
    state: () => ({ leave: !!TOUCH_ANIM.leave, flung: !!ROPE.flung, Lc: +ROPE.Lc.toFixed(1), Lp: +ROPE.Lp.toFixed(1), clip: +TOUCH_ANIM.clip.toFixed(2),
      out: TOUCH_ANIM.out, plate: +TOUCH_ANIM.plate.toFixed(2), spinning: !!JOB.spinning, vmax: Math.round(ROPE.vmax || 0), vnode: ROPE.vnode }),
    nodes: () => (ROPE.p || []).map((p) => p.toArray()) };
