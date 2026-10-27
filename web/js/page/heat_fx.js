// lr4-sandbox page: heat, smoke, scorch, fire and the flying extinguisher (Part 44b, user 2026-10-26).
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html).
  // ---- Heat (As built > Heat; js/heat.js): each lost-steps sample (job_fluidnc.js slipTick: FluidNC jobs) feeds the
  // model the bit's speed, the rpm and how deep it is; a rubbing bit heats, the stock under it smokes, scorches and
  // (Fire on) catches. The fire burns till the extinguisher comes: it lifts off its bracket by the entry door
  // (workshop.js userData.extinguisher), glides over the machine, sprays a powder cloud and goes back. Smoke / flame /
  // powder = particles; scorch = dark marks on the stock (instanced discs on its top). Real-time fx: tick's dt. ----
  const HEAT = { st: null, sim: null, note: "", fly: null, crackle: 0, points: null, marks: null, parts: [], nMarks: 0 };
  const HEAT_MAX = 2500, SMOKE_MAX = 7000, MARK_MAX = 2500, SMOKE_BUDGET = 250;   // SMOKE_BUDGET: puffs / s from all the hot spots   // particles per pool (smoke, flame, powder: their own, so heavy smoke can't crowd the powder out)
  const heatSet = () => (AB.set.on && AB.set.heat && AB.set.heat.on ? AB.set.heat : null);
  function heatState() {                              // the model's state for this job's stock (a new stock: a new one)
    if (!HEAT.st || HEAT.sim !== JOB.sim) { HEAT.st = Heat.create(); HEAT.sim = JOB.sim; heatMarksClear(); }
    return HEAT.st;
  }
  // one sample (machine time) of a running job: m = { dt, v, eng, rpm, flutes, r, p (work mm), top }
  function heatStep(m) {
    const set = heatSet();
    if (!set) return;
    const st = heatState(), out = Heat.step(st, { dt: m.dt, p: m.p, r: m.r, rpm: m.rpm, flutes: m.flutes, vh: Math.hypot(m.v.x, m.v.y),
      vz: m.v.z, eng: m.eng, top: m.top, fire: set.fire });
    const rb = Heat.rubbing({ rpm: m.rpm, flutes: m.flutes, vh: Math.hypot(m.v.x, m.v.y), vz: m.v.z });
    for (const e of out.events) {
      if (e === "smoke") heatSay("Smoke: the bit is rubbing, not cutting - " + (Math.hypot(m.v.x, m.v.y, m.v.z) < 0.05 ? "it's sitting still with the router on" :
        `the feed is too slow for the rpm (${rb.chip.toFixed(3)} mm a tooth; under ${Heat.C.H_GOOD} rubs)`) + ". Lift it or speed up the feed.");
      if (e === "would-ignite") heatSay("Hot enough to catch fire here (Fire is off in As built, so it only smokes). Never leave a running router.");
      if (e === "ignite") { heatSay("Fire! The spot the bit rubbed caught."); heatFlySoon(); }
    }
  }
  function heatSay(t) { HEAT.note = t; const el = $("heat-note"); if (el) { el.textContent = t; el.hidden = !t; } }
  function heatFlySoon() {                            // the extinguisher comes by itself (auto) once the fire has grown
    const set = heatSet();
    if (set && set.auto && !HEAT.fly) HEAT.fly = { phase: "wait", t: 0 };
  }

  // ---- particles: two Points (normal for smoke / powder, additive for flame), sizes in mm, CPU-moved ----
  function heatPoints(additive, n = HEAT_MAX) {
    const geo = new THREE.BufferGeometry();
    for (const [k, w] of [["position", 3], ["size", 1], ["alpha", 1], ["color", 3]]) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * w), w));
    geo.setDrawRange(0, 0);
    // the sprite: flames a soft round glow; smoke / powder an irregular cloud of soft blobs inside the circle (one round
    // gradient read as a flat disc once a puff got big - user 2026-10-26: "this unnatural looking oval")
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), blob = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
    };
    if (additive) blob(64, 64, 64, 1);
    else {
      let seed = 7;
      const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 18; i++) { const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * 34; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 16 + r() * 22, 0.35); }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: new THREE.CanvasTexture(c) }, scale: { value: 500 } },
      vertexShader: "attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;" +
        "uniform float scale; void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);" +
        "gl_PointSize = size * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform sampler2D map; varying float vA; varying vec3 vC; void main() {" +
        "vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard; }",
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 5; pts.name = additive ? "heat-flame" : "heat-smoke";
    scene.add(pts);
    return { pts, list: [] };
  }
  function heatFxInit() {
    if (HEAT.points) return;
    // soot = the fire's black column, in its own pool: a spreading fire's hundreds of warm spots filled one shared pool
    // with small fresh puffs, each pushing out an old one before it grew (2026-10-26: the smoke barely showed)
    HEAT.points = { smoke: heatPoints(false, SMOKE_MAX), soot: heatPoints(false, SMOKE_MAX), flame: heatPoints(true), powder: heatPoints(false) };
    HEAT.points.smoke.max = HEAT.points.soot.max = SMOKE_MAX;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    HEAT.marks = new THREE.InstancedMesh(new THREE.CircleGeometry(Heat.C.CELL * 0.8, 12), mat, MARK_MAX);
    HEAT.marks.count = 0; HEAT.marks.frustumCulled = false; HEAT.marks.name = "heat-scorch";
    HEAT.marks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MARK_MAX * 3), 3);
    scene.add(HEAT.marks);
  }
  function heatMarksClear() { if (HEAT.marks) { HEAT.marks.count = 0; HEAT.marks.instanceMatrix.needsUpdate = true; } }
  // kind: smoke | flame | powder; p world mm; v mm/s
  function heatEmit(kind, p, v, o = {}) {
    const P = HEAT.points[kind] || HEAT.points.smoke;
    if (P.list.length >= (P.max || HEAT_MAX)) P.list.shift();
    P.list.push({ kind, p: p.clone(), v: v.clone(), age: 0, life: o.life || 2, s0: o.s0 || 6, s1: o.s1 || 30, a0: o.a0 ?? 0.6,
      col: o.col || [0.45, 0.45, 0.45], drag: o.drag ?? 0.6, rise: o.rise ?? 0, ceil: o.ceil, floor: o.floor, cx: o.cx, cy: o.cy });
  }
  function heatPointsDraw(P, dt) {
    const g = P.pts.geometry, pos = g.attributes.position.array, size = g.attributes.size.array, al = g.attributes.alpha.array, col = g.attributes.color.array;
    let n = 0;
    P.list = P.list.filter((q) => (q.age += dt) < q.life);
    for (const q of P.list) {
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt)); q.v.z += q.rise * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.floor !== undefined && q.p.z < q.floor) {   // hit the stock / table (user: the powder went through the table):
        q.p.z = q.floor;                              // it billows out along it and up
        const rx = q.p.x - (q.cx ?? q.p.x), ry = q.p.y - (q.cy ?? q.p.y), l = Math.hypot(rx, ry) || 1, sp = Math.max(60, -q.v.z * 0.6);
        q.v.set(q.v.x * 0.5 + (rx / l) * sp, q.v.y * 0.5 + (ry / l) * sp, Math.abs(q.v.z) * 0.15);
      }
      if (q.ceil !== undefined && q.p.z > q.ceil) {   // hit the underside: flattened, rolling outward along it
        q.p.z = q.ceil;
        const rx = q.p.x - q.cx, ry = q.p.y - q.cy, l = Math.hypot(rx, ry) || 1, push = Math.max(120, q.v.z);
        q.v.set(q.v.x + (rx / l) * push, q.v.y + (ry / l) * push, 0);
        q.s0 *= 1.01;
      }
      const f = q.age / q.life;
      pos[3 * n] = q.p.x; pos[3 * n + 1] = q.p.y; pos[3 * n + 2] = q.p.z;
      size[n] = q.s0 + (q.s1 - q.s0) * f;
      al[n] = q.a0 * (q.kind === "flame" ? 1 - f : Math.min(1, f * 6) * (1 - f) * (1 - f));   // smoke thins as it spreads
      const c = q.kind === "flame" ? [1, 0.75 - 0.5 * f, 0.25 - 0.25 * f] : q.col;
      col[3 * n] = c[0]; col[3 * n + 1] = c[1]; col[3 * n + 2] = c[2];
      n++;
    }
    for (const k of ["position", "size", "alpha", "color"]) g.attributes[k].needsUpdate = true;
    g.setDrawRange(0, n);
    P.pts.material.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
  const workToWorld = (x, y, z) => new THREE.Vector3(JOB.at[0] + x, JOB.at[1] + y, JOB.at[2] + z);
  function heatTopAt(x, y) {                          // the stock's top (work mm) there, else the cell's own z
    const s = JOB.sim;
    if (!s || !s.heights) return null;
    const i = Math.round((x - s.stock.xmin) / s.dx), k = Math.round((y - s.stock.ymin) / s.dy);
    return i >= 0 && i <= s.nx && k >= 0 && k <= s.ny ? s.heights[k * s.vx + i] : null;
  }

  // ---- once a frame (scripting.js tick) ----
  // no job running (it ended, or the e-stop cut the power - Part 44f): the heat goes on in real time by itself - the bit
  // cools, the spots cool or burn and a fire spreads (before, it all froze with the job's last sample)
  function heatCoast(dt) {
    const sim = JOB.sim, top = (x, y) => {
      if (!sim || !sim.heights) return null;
      const i = Math.round((x - sim.stock.xmin) / sim.dx), k = Math.round((y - sim.stock.ymin) / sim.dy);
      return i >= 0 && i <= sim.nx && k >= 0 && k <= sim.ny ? sim.heights[k * sim.vx + i] : null;
    };
    heatStep({ dt, v: { x: 0, y: 0, z: 0 }, eng: null, rpm: 0, flutes: 2, r: 1.5, p: { x: 0, y: 0, z: 0 }, top });
  }
  function heatFxTick(dt) {
    const st = HEAT.st;
    if (!st || !JOB.at || HEAT.sim !== JOB.sim) { if (HEAT.points) for (const P of Object.values(HEAT.points)) { P.list.length = 0; heatPointsDraw(P, 0); } return; }
    if (!FJ.job && dt > 0) heatCoast(dt);
    heatFxInit();
    const rnd = Math.random, V = (x, y, z) => new THREE.Vector3(x, y, z);
    // smoke from hot cells, scorch marks
    let m = 0, smk = 0;
    const mt = new THREE.Matrix4(), colr = new THREE.Color();
    // spots inside a burning fire send up no gray smoke: the fire's black column is theirs (their gray core outlived it
    // as a flat patch - user 2026-10-26: "this unnatural looking oval")
    const fires = Heat.burning(st), inFire = (c) => fires.some((f) => Math.hypot(c.x - f.x, c.y - f.y) <= (f.r || 6) + Heat.C.CELL);
    const smokeOf = (c) => (inFire(c) ? 0 : Heat.smokeOf(c));
    for (const c of st.cells.values()) smk += smokeOf(c);
    const per = smk > 0 ? Math.min(140, SMOKE_BUDGET / smk) : 0;   // puffs / s per unit of smoke, the total held to the budget
    for (const c of st.cells.values()) {
      const top = heatTopAt(c.x, c.y), z = top === null ? c.z : Math.max(c.z, top);
      const sm = smokeOf(c);
      // (user 2026-10-26: "significantly more smoke") a smoking spot pours it out: thick, wide, slow to clear
      const ns = sm * per * dt;
      for (let i = 0; i < ns + (rnd() < ns % 1 ? 1 : 0); i++) heatEmit("smoke", workToWorld(c.x + (rnd() - 0.5) * 4, c.y + (rnd() - 0.5) * 4, z + 1),
        V((rnd() - 0.5) * 60, (rnd() - 0.5) * 60, 45 + 70 * sm), { life: 7 + 5 * rnd(), s0: 15, s1: 250 + 350 * sm, a0: 0.18 + 0.22 * sm, col: [0.5, 0.5, 0.51], drag: 0.2, rise: 9, floor: workToWorld(0, 0, z).z });
      if (c.scorch > 0.02 && m < MARK_MAX && top !== null) {
        mt.makeScale(0.5 + 0.7 * c.scorch, 0.5 + 0.7 * c.scorch, 1).setPosition(workToWorld(c.x, c.y, top + 0.05));
        HEAT.marks.setMatrixAt(m, mt);
        HEAT.marks.setColorAt(m, colr.setRGB(0.42 - 0.36 * c.scorch, 0.25 - 0.22 * c.scorch, 0.1 - 0.09 * c.scorch));
        m++;
      }
    }
    HEAT.marks.count = m; HEAT.marks.instanceMatrix.needsUpdate = true; if (HEAT.marks.instanceColor) HEAT.marks.instanceColor.needsUpdate = true;
    // flames + black smoke over each fire, crackles
    for (const f of Heat.burning(st)) {
      // k grows past 1 while it burns (heat.js fireSize, up to 2.5): wider (its r, mm), taller, smokier
      const k = Heat.fireSize(f), top = heatTopAt(f.x, f.y), at = workToWorld(f.x, f.y, (top === null ? f.z : Math.max(f.z, top)) + 1), rr = 2 * (f.r || 6);
      const ceil = heatCeiling(at);                  // the router (dust shoe, collet) right over it: flames spread out under it
      for (let i = 0; i < 160 * k * dt + rnd(); i++) heatEmit("flame", at.clone().add(V((rnd() - 0.5) * rr, (rnd() - 0.5) * rr, 0)),
        V((rnd() - 0.5) * 40, (rnd() - 0.5) * 40, 160 + 150 * k * rnd()), { life: 0.4 + 0.4 * rnd(), s0: 14 + 16 * k, s1: 4, a0: 0.9, drag: 1.5,
          ceil: ceil === null ? undefined : ceil - 4, floor: at.z, cx: at.x, cy: at.y });
      const nf = 35 * k * dt;                        // a big, thin black plume, spreading as it rises (fewer, bigger puffs: see-through)
      for (let i = 0; i < nf + (rnd() < nf % 1 ? 1 : 0); i++) heatEmit("soot", at.clone().add(V((rnd() - 0.5) * rr * 1.5, (rnd() - 0.5) * rr * 1.5, 40 + 40 * k * rnd())),
        V((rnd() - 0.5) * 220, (rnd() - 0.5) * 220, 130 + 60 * k), { life: 9 + 5 * rnd(), s0: 80, s1: 700 + 300 * k, a0: 0.22, col: [0.08, 0.08, 0.08], drag: 0.12, rise: 12, floor: at.z });
      if (SND.s && rnd() < 12 * k * dt) SND.s.event("crackle");
    }
    heatDamageTick(dt);
    heatFlyTick(dt);
    for (const P of Object.values(HEAT.points)) heatPointsDraw(P, dt);
  }

  // ---- what a fire does to the machine (user 2026-10-26: "if it got stuck and caught on fire the router would be right
  // over it, so it should do terrible things to the machine"): every part near a fire takes heat (by distance from the
  // flames, more above them: hot air rises); it chars (its color toward black, rougher) and the printed / TPU parts
  // slump toward the fire (PLA softens ~60 °C, the TPU skirt + bristles first), smoking while they cook. It stays that
  // way when the fire's out: Repair puts it right (LR4Heat.repair, the Run note's button). Illustrative, like the rest. ----
  const DMG = { CHAR: 10, MELT0: 1.2, MELT: 6, SAG: 25, MELT_R: 150, PULL: 0.22, REACH: 260, EVERY: 0.25, BIG: 400 };   // MELT_R: mm round the fire that slumps   // exposure units, mm
  // (user 2026-10-27: "melting the plastic a bit too much" - SAG 70 -> 25 mm, MELT_R 220 -> 150, MELT 4 -> 6)
  HEAT.dmg = new Map();                                // mesh -> { h (exposure), char, melt, orig { color, rough }, geo (own copy), base }
  const dmgBox = new THREE.Box3(), dmgSphere = new THREE.Sphere();
  function heatCeiling(at) {                          // the lowest underside right over a fire's spot (world z) within 250 mm
    let best = null;
    for (const m of meshes) {
      if (!m.visible || !m.geometry || m.userData.floor) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      dmgBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
      if (at.x < dmgBox.min.x || at.x > dmgBox.max.x || at.y < dmgBox.min.y || at.y > dmgBox.max.y) continue;
      if (dmgBox.min.z > at.z + 5 && dmgBox.min.z < at.z + 250 && (best === null || dmgBox.min.z < best)) best = dmgBox.min.z;
    }
    return best;
  }
  const heatTpu = (m) => /Skirt|Bristle|TPU/i.test(m.userData.name || "");
  const heatPrinted = (m) => heatTpu(m) || !!(m.material && m.material.userData && m.material.userData.print);
  function heatDamageTick(dt) {
    const fires = HEAT.st ? Heat.burning(HEAT.st) : [];
    HEAT.dmgT = (HEAT.dmgT || 0) + dt;
    if (!fires.length || HEAT.dmgT < DMG.EVERY) return;
    const step = HEAT.dmgT; HEAT.dmgT = 0;
    const rnd = Math.random;
    for (const f of fires) {
      const k = Heat.fireSize(f), top = heatTopAt(f.x, f.y), at = workToWorld(f.x, f.y, top === null ? f.z : Math.max(f.z, top));
      for (const m of meshes) {
        if (!m.visible || !m.geometry || m.userData.floor) continue;
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        dmgSphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
        if (dmgSphere.center.distanceTo(at) - dmgSphere.radius > DMG.REACH) continue;
        if (!g.boundingBox) g.computeBoundingBox();
        dmgBox.copy(g.boundingBox).applyMatrix4(m.matrixWorld);
        // only parts small enough to be in the fire (router, dust shoe, the core's printed parts): a long tube or the
        // spoilboard would char end to end (2026-10-26 render: the beam + board went black); the board has its scorch marks
        const sz = dmgBox.getSize(new THREE.Vector3());
        if (Math.max(sz.x, sz.y, sz.z) > DMG.BIG) continue;
        const q = dmgBox.clampPoint(at, new THREE.Vector3()), dz = q.z - at.z;
        const d = Math.hypot(q.x - at.x, q.y - at.y, dz > 0 ? dz * 0.5 : dz * 2);   // above: closer (the heat rises)
        if (d > DMG.REACH) continue;
        let D = HEAT.dmg.get(m);
        if (!D) { D = { h: 0, char: 0, melt: 0 }; HEAT.dmg.set(m, D); }
        D.h += step * k / (1 + (d / 60) ** 2);
        D.char = Math.min(1, D.h / DMG.CHAR);
        heatChar(m, D);
        if (heatPrinted(m)) {
          const melt = Math.min(1, Math.max(0, (D.h - (heatTpu(m) ? DMG.MELT0 / 3 : DMG.MELT0)) / DMG.MELT));
          if (melt > D.melt + 0.02) { D.melt = melt; heatMelt(m, D, at); }
        }
        if (D.char > 0.15 && D.char < 1) for (let n = 0; n < 4; n++) {   // the part cooking: smoke off it
          const c = dmgBox.getCenter(new THREE.Vector3());
          heatEmit("smoke", V3(c.x + (rnd() - 0.5) * 40, c.y + (rnd() - 0.5) * 40, dmgBox.min.z + (dmgBox.max.z - dmgBox.min.z) * rnd()),
            V3((rnd() - 0.5) * 30, (rnd() - 0.5) * 30, 80), { life: 6, s0: 20, s1: 220, a0: 0.5, col: [0.15, 0.14, 0.13], drag: 0.25, rise: 10 });
        }
      }
    }
  }
  function heatChar(m, D) {                           // its own material's color toward char (kept to put back)
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (!D.orig) D.orig = mats.map((mt) => ({ color: mt.color ? mt.color.clone() : null, rough: mt.roughness, em: mt.emissive ? mt.emissive.clone() : null }));
    const black = new THREE.Color(0.02, 0.016, 0.012), glow = new THREE.Color(0.35, 0.08, 0.0);
    mats.forEach((mt, i) => {
      const o = D.orig[i];
      if (o.color) mt.color.copy(o.color).lerp(black, 0.92 * D.char);
      if (o.rough !== undefined) mt.roughness = Math.min(1, o.rough + 0.5 * D.char);
      if (o.em && D.char < 1) mt.emissive.copy(o.em).lerp(glow, Math.sin(Math.PI * D.char) * 0.25);   // glowing while it chars
      else if (o.em) mt.emissive.copy(o.em);
    });
  }
  function heatMelt(m, D, at) {                       // slump toward the fire: vertices near it drop + draw in (own geometry)
    if (!D.geo) {
      D.base = m.geometry;
      m.geometry = m.geometry.clone();
      D.geo = m.geometry;
      D.pos0 = Float32Array.from(D.base.attributes.position.array);
    }
    m.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(), fl = at.clone().applyMatrix4(inv);
    const down = V3(0, 0, -1).transformDirection(inv), P = D.geo.attributes.position, p = P.array, p0 = D.pos0;
    for (let i = 0; i < p.length; i += 3) {
      const x = p0[i], y = p0[i + 1], z = p0[i + 2], d = Math.hypot(x - fl.x, y - fl.y, z - fl.z);
      const w = D.melt * Math.max(0, 1 - d / DMG.MELT_R) ** 1.3, s = DMG.SAG * w, k = DMG.PULL * w;
      p[i] = x + down.x * s + (fl.x - x) * k; p[i + 1] = y + down.y * s + (fl.y - y) * k; p[i + 2] = z + down.z * s + (fl.z - z) * k;
    }
    P.needsUpdate = true;
    D.geo.computeVertexNormals();
  }
  function heatRepair() {                             // every part back as it was
    for (const [m, D] of HEAT.dmg) {
      if (D.orig) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt, i) => {
        const o = D.orig[i];
        if (o.color) mt.color.copy(o.color);
        if (o.rough !== undefined) mt.roughness = o.rough;
        if (o.em) mt.emissive.copy(o.em);
      });
      if (D.geo) { m.geometry = D.base; D.geo.dispose(); }
    }
    HEAT.dmg.clear();
    heatDamageNote();
  }
  function heatDamageNote() {                         // the Run note's damage line + its Repair button
    const bad = [...HEAT.dmg].filter(([, D]) => D.char > 0.25 || D.melt > 0.1).sort((a, b) => b[1].h - a[1].h);
    const el = $("heat-dmg"), names = bad.slice(0, 6).map(([m, D]) => `${(m.userData.label || m.userData.name || "a part").replace(/ \(.*$/, "")} (${D.melt > 0.1 ? "melted" : "charred"})`);
    if (!el) return;
    el.hidden = !bad.length;
    $("heat-dmg-t").textContent = bad.length ? `The fire wrecked: ${names.join(", ")}${bad.length > 6 ? `, and ${bad.length - 6} more` : ""}. ` +
      "On a real machine: new printed parts, likely a new router - and the shop's lucky." : "";
  }

  // ---- the extinguisher's trip: wait (the fire grows) -> out (lifts off, glides over) -> spray -> back ----
  const FLY = { wait: 6, out: 2.4, spray: 3.5, putOut: 1.5, back: 2.4 };   // wait: the fire grows (user: let it get bigger)
  function heatFlyTick(dt) {
    const F = HEAT.fly, ex = shop && shop.userData.extinguisher;
    if (!F) return;
    if (!ex) { heatPutOut(); HEAT.fly = null; return; }   // (an empty shop: no extinguisher to fly; it's out anyway)
    const fire = Heat.burning(HEAT.st)[0] || F.fire;
    if (!fire) { if (F.phase === "wait") HEAT.fly = null; else if (F.phase !== "back") { F.phase = "back"; F.t = 0; } }
    F.t += dt;
    if (fire && !F.fire) F.fire = fire;
    const o = ex.obj, home = ex.home, ft = F.fire, top = ft ? heatTopAt(ft.x, ft.y) : null;
    const tgt = ft ? workToWorld(ft.x, ft.y, top === null ? ft.z : Math.max(ft.z, top)) : home.p.clone();
    // where it hovers: clear of the machine (the router is usually right over the fire - user 2026-10-26: "the
    // extinguisher is going through the router"), picked once per trip (heatHover); over the machine on the way (an
    // arc 900 up)
    if (!F.hover && ft) F.hover = heatHover(tgt, home.p);
    const hover = F.hover || V3(tgt.x, tgt.y - 1500, home.p.z - 840 + WAIST), away = V3(hover.x - tgt.x, hover.y - tgt.y, 0).normalize();
    // upright, its hose side (-X) toward the fire, leaning 15 deg toward it (the hose does the aiming)
    const aimQ = new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), Math.atan2(-away.y, -away.x) + Math.PI)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(V3(-away.y, away.x, 0), -0.25));
    // the hose held up and out: its end 250 mm off the body toward the fire, raised so the horn is ~120 mm over the
    // fire's level (the body hangs at the waist, about table height: the horn went under the table edge - user
    // 2026-10-26), the horn pointing down across at it (local mm; it stands near upright, so local z ~ world z)
    const hoseOut = (u) => {
      o.updateMatrixWorld();
      const fl = o.worldToLocal(tgt.clone()), h = V3(fl.x, fl.y, 0);
      if (h.lengthSq() < 1) h.set(-1, 0, 0);
      const E = h.normalize().multiplyScalar(ex.R + 250);
      E.z = Math.min(Math.max(tgt.z + 120 - o.position.z, 120), 520);
      return ex.hose(u, E, fl.sub(E).normalize());
    };
    const ease = (u) => u * u * (3 - 2 * u);
    const arc = (a, b, u) => { const mid = a.clone().lerp(b, 0.5); mid.z = Math.max(a.z, b.z) + 900; const s = 1 - u;
      return a.clone().multiplyScalar(s * s).add(mid.multiplyScalar(2 * s * u)).add(b.clone().multiplyScalar(u * u)); };
    if (F.phase === "wait" && F.t >= FLY.wait) { F.phase = "out"; F.t = 0; if (SND.s) SND.s.event("release"); }
    if (F.phase === "out") {
      const u = ease(Math.min(1, F.t / FLY.out));
      o.position.copy(arc(home.p, hover, u)); o.quaternion.copy(home.q).slerp(aimQ, u);
      F.tip = hoseOut(ease(Math.min(1, Math.max(0, (F.t / FLY.out - 0.5) * 2))));   // the hose comes out on the way in
      if (F.t >= FLY.out) { F.phase = "spray"; F.t = 0; }
    } else if (F.phase === "spray") {
      o.position.copy(hover).add(V3(Math.sin(F.t * 9) * 4, Math.cos(F.t * 7) * 4, 0)); o.quaternion.copy(aimQ);
      F.tip = hoseOut(1);
      const nz = o.localToWorld(F.tip.clone()), dir = tgt.clone().sub(nz).normalize(), rnd = Math.random;
      for (let i = 0; i < 220 * dt; i++) heatEmit("powder", nz.clone(), dir.clone().multiplyScalar(nz.distanceTo(tgt) * (2.2 + 0.8 * rnd())).add(V3((rnd() - 0.5) * 160, (rnd() - 0.5) * 160, (rnd() - 0.5) * 160)),
        { life: 1.6 + rnd(), s0: 8, s1: 120, a0: 0.55, col: [0.93, 0.93, 0.9], drag: 2.6, rise: 4, floor: tgt.z + 2, cx: tgt.x, cy: tgt.y });   // reaches the fire and billows there
      if (SND.s && (F.hiss || 0) <= 0) { SND.s.event("hiss"); F.hiss = 0.3; }
      F.hiss = (F.hiss || 0) - dt;
      if (!F.done && F.t >= FLY.putOut) { F.done = true; heatPutOut(); }
      if (F.t >= FLY.spray) { F.phase = "back"; F.t = 0; F.from = o.position.clone(); F.fromQ = o.quaternion.clone(); }
    } else if (F.phase === "back") {
      if (!F.from) { F.from = o.position.clone(); F.fromQ = o.quaternion.clone(); }
      const u = ease(Math.min(1, F.t / FLY.back));
      o.position.copy(arc(F.from, home.p, u)); o.quaternion.copy(F.fromQ).slerp(home.q, u);
      hoseOut(1 - ease(Math.min(1, F.t / (FLY.back * 0.5))));   // the hose back on the body first
      if (F.t >= FLY.back) {
        o.position.copy(home.p); o.quaternion.copy(home.q); ex.hose(0); if (SND.s) SND.s.event("switch");
        HEAT.fly = null;
        if (Heat.burning(HEAT.st).length) heatFlySoon();   // it caught again meanwhile (the bit still rubbing): back out
      }
    }
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // where it hovers: held as a person would (user 2026-10-26: "closer to the ground ... around waist height"): the
  // handle ~1 m up, so the body's middle WAIST mm above the floor (its home is 840 up), and where its body doesn't
  // overlap any part or the table: in front first (-Y: in front of the beam, where you'd stand), then the front corners
  // and sides (toward its home first), behind last, 450..1500 mm out. None clear: 1.5 m straight out in front.
  const WAIST = 720;
  function heatHover(tgt, homeP) {
    const boxes = [];
    for (const m of meshes) {
      if (!m.visible || !m.geometry || m.userData.motion === "hose") continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      boxes.push(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
    const z = homeP.z - 840 + WAIST, side = Math.sign(homeP.x - tgt.x) || 1;
    const dirs = [[0, -1], [0.6 * side, -0.8], [-0.6 * side, -0.8], [side, 0], [-side, 0], [0.6 * side, 0.8], [0, 1]];
    const body = new THREE.Box3();
    for (let r = 450; r <= 1500; r += 75) for (const [dx, dy] of dirs) {
      const p = V3(tgt.x + dx * r, tgt.y + dy * r, z);
      body.min.set(p.x - 140, p.y - 140, p.z - 260); body.max.set(p.x + 140, p.y + 140, p.z + 330);
      if (!boxes.some((b) => b.intersectsBox(body))) return p;
    }
    return V3(tgt.x, tgt.y - 1500, z);
  }
  function heatPutOut() {
    if (!HEAT.st) return;
    Heat.extinguish(HEAT.st);
    heatDamageNote();
    heatSay("Out. Never leave a running router: a bit that rubs (sitting still, a feed too slow for the rpm, a dull bit) makes " +
      "the heat. Keep an extinguisher in reach (ABC) and the dust out of the machine.");
  }
  // a video's (Video Fire: TIME=s): the spot under the bit heats to catching over TIME s; (Video Extinguish:): now
  function heatFire(time) {
    const p = CTL.sim && JOB.tl && JOB.at ? fjWork(ctlLive()) : null;
    if (!p) return false;
    Heat.ramp(heatState(), p.x, p.y, p.z, time);
    return true;
  }
  function heatSend() { if (!HEAT.fly && HEAT.st && Heat.burning(HEAT.st).length) HEAT.fly = { phase: "out", t: 0 }; return !!HEAT.fly; }
  $("heat-repair").addEventListener("click", heatRepair);
  window.LR4Heat = { state: () => HEAT.st, tick: heatFxTick, repair: heatRepair,
    damage: () => [...HEAT.dmg].map(([m, D]) => ({ name: m.userData.name, h: +D.h.toFixed(2), char: +D.char.toFixed(2), melt: +D.melt.toFixed(2) })), fire: heatFire, extinguish: heatSend, note: () => HEAT.note, flying: () => (HEAT.fly ? HEAT.fly.phase : null),
    burning: () => (HEAT.st ? Heat.burning(HEAT.st).length : 0), bit: () => (HEAT.st ? HEAT.st.bit : null),
    scorched: () => (HEAT.st ? [...HEAT.st.cells.values()].filter((c) => c.scorch > 0).length : 0),
    particles: () => (HEAT.points ? Object.values(HEAT.points).reduce((n, P) => n + P.list.length, 0) : 0),
    extinguisher: () => { const ex = shop && shop.userData.extinguisher; return ex ? ex.obj.position.toArray() : null; } };
