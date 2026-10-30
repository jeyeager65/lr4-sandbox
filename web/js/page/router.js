// lr4-sandbox page: the router + its speed dial (Part 45a, user 2026-10-27; LR4Routers in js/routers.js). The page's
// scripts share one global scope. RT: machine.js.
  // ---- which router (Run > Router), its dial on the model: drag it (up / right = faster), click = the next whole
  // number, the mouse wheel = a stop (0.5) a notch, every way snaps to the 0.5 stops; a big readout while it turns. A manual router's dial sets the speed (sound,
  // chip load, heat, the bit's turn follow it); a G-code router (AutoSpin T1) takes the file's S and ignores its
  // dial. Kept per machine (lr4-router). The dial's numbers are a ring on Router_Dial (a child: it rides every pose
  // and the tram lean; not in meshes, so no picking or printed look), turned about the router's axis. ----
  const RT_KEY = "lr4-router";
  try { RT.set = LR4Routers.settings(JSON.parse(MS.get(RT_KEY) || "null")); } catch (e) { /* defaults */ }
  function rtSave() { try { MS.set(RT_KEY, JSON.stringify(RT.set)); } catch (e) { /* not kept */ } }
  const rtRpmText = (v) => `~${(Math.round(v / 100) * 100).toLocaleString("en-US")} RPM`;
  function rtSet(o, why) {                           // o: { router?, dial? }; why: "drag" / "wheel" / "click" (readout)
    const was = RT.set;
    RT.set = LR4Routers.settings(Object.assign({}, RT.set, o));
    if (RT.set.router !== was.router) { RT.noted = null; rtSwap(); }   // a note again for the new router; its body
    rtSave();
    rtLook();
    if (RT.set.router !== was.router && typeof rbShow === "function") rbShow();   // My LR4 > Router (router_build.js)
    if (RT.set.router !== was.router && typeof optsRefresh === "function") optsRefresh();   // mount None: no shoe / hose (panel.js)
    if (why) rtReadout();
    return RT.set;
  }
  // the dial wheel's look (user's photos 2026-10-28: the Makita's and the Kobalt's are the same style): rounded ridges
  // all round its edge, white numbers 1..6 on flat lands DIAL_STEP deg apart (number d at the texture's u 0.25 +
  // (d - 1) x step / 360). RING: ridge pitch (8 to a step, so every land sits on the same phase), land half-width,
  // ridge height (mm). ringColor: the wheel + its groove bottoms per router (the preset's ring: Kobalt black, Makita red)
  const RING = { pitch: LR4Routers.DIAL_STEP / 8, land: 9, rise: 0.45 };
  const ringColor = (id) => { const r = LR4Routers.ROUTERS[id]; return (r && r.body && r.body.ring) || ["#202022", "#0b0b0c"]; };

  // ---- the router's body from its preset (Part 45b; web/data/routers.js, js/router_body.js) in place of the size
  // build's exported Router_* meshes. Frame = the build's Kobalt: the bit's centre, the nut's bottom and the switch
  // end's direction from lr4_config's boxes (ref size; each part keeps its own fitted move, so poses / sizes / the
  // tram lean all work as before). Router_Bit stays the build's. A new router swaps the geometry in place (rtSwap:
  // mid-job too) ----
  const RT_PART = { Router_Kobalt: "body", Router_Head: "head", Router_Cap: "cap", Router_Dial: "dial",
    Router_Switch: "switch", Router_Cord: "cord", Router_Nut: "nut" };
  const RT_COLOR = { body: "body", head: "head", dial: "dial" };   // the rest: the preset's cap color
  function rtFrame() {
    if (RT.frameOf === cfg) return RT.frame;
    const rec = (n) => cfg.parts.find((p) => p.key === n), b = rec("Router_Bit"), n = rec("Router_Nut"), s = rec("Router_Switch");
    const mid = (r, k) => (r.lo_ref[k] + r.hi_ref[k]) / 2;
    RT.frameOf = cfg;
    RT.frame = null;
    if (b && n && s && b.lo_ref && n.lo_ref && s.lo_ref) {
      const o = [mid(b, 0), mid(b, 1), n.lo_ref[2]];
      RT.frame = { o, a: Math.atan2(mid(s, 1) - o[1], mid(s, 0) - o[0]) };   // the Kobalt's switch: on its +x axis
    }
    return RT.frame;
  }
  // the router's height in the mount (My LR4 > Router, user 2026-10-29: kept with the router): body.clamp = mm from
  // the nut's bottom up to the bottom of the lower clamp (Tool_Mount_B). The build's Kobalt = RT_CLAMP.def; another
  // value moves the router - and the bit with it (rtBitShift) - up or down: the mount stays where it is.
  function rtClamps() {                              // the clamps in the nut frame of the build: { def, lo: [z0, z1], hi: [z0, z1] } (from the lower clamp's bottom)
    if (typeof cfg === "undefined" || !cfg || !cfg.parts) return null;   // (no model yet)
    if (RT.clampOf === cfg) return RT.clamps;
    const rec = (n) => cfg.parts.find((p) => p.key === n), n = rec("Router_Nut"), B = rec("Tool_Mount_B_Kobalt"), T = rec("Tool_Mount_T_Kobalt");
    RT.clampOf = cfg;
    RT.clamps = n && B && T && B.lo_ref ? { def: +(B.lo_ref[2] - n.lo_ref[2]).toFixed(1), lo: [0, B.hi_ref[2] - B.lo_ref[2]],
      hi: [T.lo_ref[2] - B.lo_ref[2], T.hi_ref[2] - B.lo_ref[2]] } : null;
    return RT.clamps;
  }
  const rtDrop = (r) => { const C = rtClamps(); return C ? C.def - (r.body.clamp ?? C.def) : 0; };   // + = the router up
  function rtBody() {                                // the current router's built pieces (kept until it changes)
    const r = LR4Routers.ROUTERS[RT.set.router], f0 = rtFrame();
    if (!r || !r.body || !f0) return null;
    const dz = rtDrop(r);
    if (!RT.fz || RT.fz.f0 !== f0 || RT.fz.dz !== dz) RT.fz = { f0, dz, f: { o: [f0.o[0], f0.o[1], f0.o[2] + dz], a: f0.a } };
    const f = RT.fz.f;
    if (!RT.body || RT.body.id !== RT.set.router || RT.body.f !== f) {
      if (RT.body) for (const e of Object.values(RT.body.geo)) RT.body.old.push(e.geo);   // freed on the swap
      RT.body = { id: RT.set.router, f, b: LR4RouterBody.build(r.body), geo: {}, old: RT.body ? RT.body.old : [] };
    }
    return RT.body;
  }
  // the turned part's sections (router_body.js stack: 0 nose + spindle, 1 grip, 2 collar, 3 transition; user 2026-10-29:
  // "color or apply a material to each of the 3 sections"): body.looks[grip | cast | trans] = { c: sRGB, f: finish },
  // else the body color in metal. Per vertex: color (linear) + rm (roughness, metalness), read by rtLookMat's shader
  const RT_FIN = { metal: [0.36, 1.0], plastic: [0.55, 0.0], rubber: [0.9, 0.0] }, RT_SEC = [null, "grip", "cast", "trans"];
  function rtLooks(geo, sec, b) {
    const n = sec.length, col = new Float32Array(n * 3), rm = new Float32Array(n * 2), c = new THREE.Color();
    const look = RT_SEC.map((k) => (k && b.looks && b.looks[k]) || { c: b.colors.body, f: "metal" });
    const lin = look.map((L) => c.setRGB(...L.c).convertSRGBToLinear().toArray()), fin = look.map((L) => RT_FIN[L.f] || RT_FIN.metal);
    for (let i = 0; i < n; i++) {
      const j = sec[i] | 0;
      col.set(lin[j] || lin[0], i * 3);
      rm.set(fin[j] || fin[0], i * 2);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("rm", new THREE.BufferAttribute(rm, 2));
  }
  function rtLookMat(mat) {                          // the body's material: vertex colors, roughness + metalness per vertex
    if (mat.userData.rtLooks) return;
    mat.userData.rtLooks = true;
    Object.assign(mat, { vertexColors: true, roughness: 1, metalness: 1 });
    mat.color.set(0xffffff);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRM = rm;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vRM;")
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vRM.x;")
        .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vRM.y;");
    };
    mat.customProgramCacheKey = () => "rtLooks";
    mat.needsUpdate = true;
  }
  function rtBodyGeo(o) {                            // scene.js rebuild: a Router_* part's geometry + look, or null
    const k = RT_PART[o.name], B = k && rtBody();
    if (!B) return null;
    const r = LR4Routers.ROUTERS[RT.set.router], f = B.f;
    const make = (part) => {                         // a piece -> its dressed geometry (kept until the router changes)
      if (!B.geo[part]) {
        const m = LR4RouterBody.place(B.b.parts[part], f), geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(m.pos, 3));
        geo.setIndex(m.idx);
        if (part === "body" && m.sec) rtLooks(geo, m.sec, r.body);   // each section's color + finish (vertex attributes)
        const fin = part === "body" ? FINISH.aluminium : null;
        B.geo[part] = { geo: dress(geo, fin, false), fin, hasUV: false, tris: m.idx.length / 3 };
      }
      return B.geo[part];
    };
    const e = make(k);
    const ud = { color: r.body.colors[RT_COLOR[k] || k] || r.body.colors.cap };   // (switch: its own if the preset has one)
    if (k === "body") ud.label = `Router (${r.name})`;
    if (k === "switch") ud.rocker = B.b.rocker ? { on: e.geo, off: make("switch_off").geo,   // power.js: on / off; its face: rtRockerFace
      c: LR4RouterBody.placeV(B.b.rocker.c, f), a: f.a, tip: B.b.rocker.a * Math.PI / 180, size: B.b.rocker.size } : null;
    if (k === "head") ud.pocket = (B.b.pockets || [])[0] ? Object.assign({}, B.b.pockets[0], { f }) : null;   // rtPocketClip
    if (k === "head") ud.decals = (B.b.labels || []).map((l) => Object.assign({}, l, { c: LR4RouterBody.placeV(l.c, f), n: LR4RouterBody.placeV(l.n, f, true) }));
    if (k === "dial") {                              // the wheel's centre, axis and the rim that shows (ref frame)
      const d = B.b.dial;
      ud.dial = !d ? null : { c: LR4RouterBody.placeV(d.c, f),   // (a spindle: no dial)
 axis: LR4RouterBody.placeV(d.axis, f, true), out: LR4RouterBody.placeV(d.out, f, true), r: d.r, t: d.t, dome: d.dome };
    }
    return Object.assign({}, e, { ud });
  }
  // the cord leaves where this router's does: the build's tip moved by (this router's - the build's). RT_BUILD_TIP = the
  // FreeCAD Kobalt's stub end (hw.kobalt_k7tr03: 14 below the top, bent 45 deg) in the router frame
  const RT_BUILD_TIP = [-108.1, 27.4, 196.0];
  function rtHose(h) {
    const B = rtBody();
    if (!B || !h.cord || !h.cord.tip) return;
    if (!h.cord.tip0) Object.assign(h.cord, { tip0: h.cord.tip.slice(), tip20: h.cord.tip2.slice() });
    const kob = RT_BUILD_TIP;                        // where the size build's cord tip is, in the router frame
    const w = (v) => LR4RouterBody.placeV(v, B.f, true), c = B.b.cord;
    const dt = w(c.tip.map((v, i) => v - kob[i])), L = Math.hypot(...h.cord.tip20.map((v, i) => v - h.cord.tip0[i]));
    h.cord.tip = h.cord.tip0.map((v, i) => v + dt[i]);
    const dir = w(c.dir);
    h.cord.tip2 = h.cord.tip.map((v, i) => v + dir[i] * L);
  }
  function rtSwap() {                                // a new router: its pieces into the Router_* meshes, where they are
    if (typeof meshes === "undefined") return;
    for (const m of meshes) {
      if (!RT_PART[m.userData.name]) continue;
      const g = rtBodyGeo({ name: m.userData.name });
      if (!g) return;
      m.geometry = g.geo;
      Object.assign(m.userData, g.ud);
      if (m.userData.name === "Router_Kobalt" && g.geo.attributes.rm) rtLookMat(m.material);
      if (m.userData.ring) { m.remove(m.userData.ring.parent === m ? m.userData.ring : m.userData.ring.parent); m.userData.ring.geometry.dispose(); m.userData.ring = null; }
      for (const d of (m.userData.decalObjs || []).concat(m.userData.faceObj ? [m.userData.faceObj] : [])) { m.remove(d); d.geometry.dispose(); d.material.dispose(); }
      m.userData.faceObj = null;
      if (m.material.userData.pocket) { m.material.clippingPlanes = null; m.material.userData.pocket = false; m.material.needsUpdate = true; }   // the new one's, if any: rtPocketClip
      m.userData.decalObjs = null;
      if (!g.fin) m.material.color.setRGB(...g.ud.color).convertSRGBToLinear();
    }
    if (RT.body) { for (const geo of RT.body.old) geo.dispose(); RT.body.old = []; }
    if (RT.body && RT.body.b.noSwitch) PWR.body = true;   // a spindle has no switch of its own to leave off
    if (meta && meta.hose) rtHose(meta.hose);
    if (typeof powerLook === "function") powerLook();   // the rocker as the switch is (power.js; it moves the machine back too)
    else if (meta) move(HOME.pose ? [HOME.pose.x, HOME.pose.y, HOME.pose.z] : undefined);
  }
  const ringTheta = (d) => 90 + (d - LR4Routers.DIAL[0]) * LR4Routers.DIAL_STEP;   // deg round the cylinder (u x 360)
  function ringLand(deg) {                           // on a number's land: |deg - its centre| < RING.land
    const D = LR4Routers.DIAL;
    for (let d = D[0]; d <= D[1]; d++) { const k = Math.abs((((deg - ringTheta(d)) % 360) + 540) % 360 - 180); if (k < RING.land) return true; }
    return false;
  }
  // radius out from the wheel at deg: lands flush with the ridge tops, grooves down to the wheel's own radius
  const ringRise = (deg) => ringLand(deg) ? RING.rise : RING.rise * Math.pow(Math.abs(Math.cos(Math.PI * (deg - ringTheta(1)) / RING.pitch)), 0.5);
  // a domed dial's band (Kobalt): the rim + the shoulder up to the flat top, ridged like the ring, numbered on the
  // shoulder (geometry.userData.v = where up the band). Same frame as rtRingGeo: axis z, centred, u = deg / 360.
  function rtDomeRingGeo(D) {
    const prof = LR4RouterBody.dialProfile({ d: D.r * 2 + 0.1, t: D.t, dome: D.dome }, 16).slice(0, -1);
    const s = [0];
    for (let j = 1; j < prof.length; j++) s.push(s[j - 1] + Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]));
    const N = 720, M = prof.length, R0 = prof[0][0], pos = [], uv = [], idx = [];
    for (let j = 0; j < M; j++) for (let i = 0; i <= N; i++) {
      const u = i / N, th = u * 2 * Math.PI, [r, h] = prof[j], R = r + (h <= D.t / 2 + 1e-6 ? ringRise(u * 360) : 0);   // ridged rim, smooth dome
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
    geo.userData.v = +((s[k] + 0.45 * (s[M - 1] - s[k])) / s[M - 1]).toFixed(3);   // on the dome, toward its outer edge (room for them, user)
    geo.userData.vRim = +(s[k - 1] / s[M - 1]).toFixed(3);                    // the ridged rim's top
    return geo;
  }
  function rtRingGeo(r, h) {
    const geo = new THREE.CylinderGeometry(r, r, h, 720, 1, true), p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const th = uv.getX(i) * 2 * Math.PI, R = r + ringRise(uv.getX(i) * 360);
      p.setX(i, R * Math.sin(th)); p.setZ(i, R * Math.cos(th));
    }
    geo.computeVertexNormals();
    return geo.rotateX(Math.PI / 2);
  }
  function rtRingTex(col, v, vRim) {                    // v: the numbers' height up the band (0 bottom .. 1 top); 0.5 = a plain rim
    const c = document.createElement("canvas"), W = 2048, H = v === 0.5 ? 96 : 192, g = c.getContext("2d");
    c.width = W; c.height = H;
    g.fillStyle = col[0]; g.fillRect(0, 0, W, H);
    g.fillStyle = col[1];                            // the groove bottoms a little darker
    for (let deg = ringTheta(1) + RING.pitch / 2 - 360; deg < 360; deg += RING.pitch) {
      const x = ((deg % 360) + 360) % 360 / 360 * W;
      if (!ringLand(deg)) g.fillRect(x - 3, vRim ? H * (1 - vRim) : 0, 6, H);   // (a domed band: on its rim only)
    }
    const D = LR4Routers.DIAL;
    g.fillStyle = "#f4f4f4"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 50px sans-serif";
    for (let d = D[0]; d <= D[1]; d++) g.fillText(String(d), ringTheta(d) / 360 * W, H * (1 - v) + 2);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // the ring on the Router_Dial mesh (made once per rebuild), turned to the dial; Run's row
  // the preset's lettering (KOBALT on the head's sides): canvas-text planes, children of Router_Head
  function rtDecals() {
    const hm = meshes.find((m) => m.userData.name === "Router_Head");
    if (!hm || hm.userData.decalObjs || !hm.userData.decals) return;
    hm.userData.decalObjs = hm.userData.decals.map((l) => {
      const c = document.createElement("canvas"), W = 1024, H = Math.round(W * l.h / l.w), g = c.getContext("2d");
      c.width = W; c.height = H;
      g.fillStyle = l.color; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `900 ${Math.round(H * 0.95)}px "Arial Black", Arial, sans-serif`;
      const tw = g.measureText(l.text).width;
      if (tw > W * 0.98) g.font = `900 ${Math.round(H * 0.95 * W * 0.98 / tw)}px "Arial Black", Arial, sans-serif`;
      g.fillText(l.text, W / 2, H / 2 + H * 0.04);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.55, metalness: 0.4,
        polygonOffset: true, polygonOffsetFactor: -2 }));
      const n = new THREE.Vector3(...l.n).normalize(), up = new THREE.Vector3(0, 0, 1);
      p.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(up.clone().cross(n), up, n));   // reads left to right from outside
      p.position.set(...l.c);
      p.castShadow = false;
      hm.add(p);
      return p;
    });
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
      t.encoding = THREE.sRGBEncoding;
      p = m.userData.faceObj = new THREE.Mesh(new THREE.PlaneGeometry(R.size[1], R.size[2]),
        new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
      p.castShadow = false;
      m.add(p);
    }
    const a = R.a + (on ? R.tip : -R.tip), n = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), up = new THREE.Vector3(0, 0, 1);
    p.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(up.clone().cross(n), up, n));
    p.position.set(...R.c).addScaledVector(n, R.size[0] / 2 + 0.05);
  }
  // the preset's pocket (Kobalt: round the dial) cut out of Router_Head: 5 clip planes, a fragment goes only when it's
  // inside all of them (clipIntersection) = inside the box; router_body built its floor + walls. Planes in world space,
  // so they're set again after every pose (machine.js move)
  function rtPocketClip() {
    const hm = meshes.find((m) => m.userData.name === "Router_Head");
    if (!hm) return;
    const q = hm.userData.pocket, mat = hm.material;
    if (!q) { if (mat.userData.pocket) { mat.clippingPlanes = null; mat.userData.pocket = false; mat.needsUpdate = true; } return; }
    if (!mat.userData.pocket) {
      const P = LR4RouterBody.placeV, f = q.f, n = (v) => new THREE.Vector3(...P(v, f, true)), p = (v) => new THREE.Vector3(...P(v, f));
      const big = 1e4;                               // (open at +x: that side's plane far away)
      mat.userData.local = [[n([-1, 0, 0]), p([q.x[0], 0, 0])], [n([1, 0, 0]), p([q.x[1] + big, 0, 0])],
        [n([0, -1, 0]), p([0, q.y[0], 0])], [n([0, 1, 0]), p([0, q.y[1], 0])], [n([0, 0, -1]), p([0, 0, q.z])]]
        .map(([nn, pp]) => new THREE.Plane().setFromNormalAndCoplanarPoint(nn, pp));
      mat.clippingPlanes = mat.userData.local.map((pl) => pl.clone());
      mat.clipIntersection = true;
      mat.userData.pocket = true;
      mat.needsUpdate = true;
    }
    hm.updateMatrixWorld(true);
    mat.userData.local.forEach((pl, i) => mat.clippingPlanes[i].copy(pl).applyMatrix4(hm.matrixWorld));
  }
  function rtBitShift() {                            // the build's bit rides with the router (its tip: bitTip reads the geometry)
    const rb = meshes.find((m) => m.userData.name === "Router_Bit"), r = LR4Routers.ROUTERS[RT.set.router];
    if (!rb || !r) return;
    const want = rtDrop(r), had = rb.geometry.userData.rtDz || 0;
    if (Math.abs(want - had) < 1e-6) return;
    rb.geometry.translate(0, 0, want - had);
    rb.geometry.userData.rtDz = want;
  }
  function rtLook() {
    rtBitShift();
    if (RT.rbFor !== RT.clampOf && rtClamps() && typeof rbShow === "function") { RT.rbFor = RT.clampOf; rbShow(); }   // the Router step's clamp, once a model is in
    rtDecals();
    rtPocketClip();
    const dm = meshes.find((m) => m.userData.name === "Router_Dial"), rb = meshes.find((m) => m.userData.name === "Router_Bit");
    if (dm && rb && !(RT.body && RT.body.b.noSwitch)) {   // (a spindle: no dial, no ring)
      let ring = dm.userData.ring;
      const D = dm.userData.dial;                    // the preset's wheel (rtBodyGeo): any axis
      if (!ring && D) {
        const ax = new THREE.Vector3(...D.axis).normalize(), ox = new THREE.Vector3(...D.out).normalize();
        const pivot = new THREE.Object3D();          // x = the rim that shows, z = the wheel's axis
        pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ox, ax.clone().cross(ox), ax));
        pivot.position.set(...D.c);
        ring = new THREE.Mesh(D.dome ? rtDomeRingGeo(D) : rtRingGeo(D.r + 0.05, D.t * 0.96), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }));
        ring.userData.v = ring.geometry.userData.v || 0.5;
        ring.userData.vRim = ring.geometry.userData.vRim || 0;
        ring.userData.out = 0;
        ring.castShadow = false;
        pivot.add(ring);
        dm.add(pivot);
        dm.userData.ring = ring;
      }
      if (!ring) {
        const g = dm.geometry, gb = rb.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!gb.boundingBox) gb.computeBoundingBox();
        const b = g.boundingBox, c = b.getCenter(new THREE.Vector3()), a = gb.boundingBox.getCenter(new THREE.Vector3());
        const r = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2, h = b.max.z - b.min.z;
        ring = new THREE.Mesh(rtRingGeo(r + 0.05, h * 0.96), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }));
        ring.position.copy(c);
        ring.userData.out = Math.atan2(c.y - a.y, c.x - a.x);   // the edge out of the housing: away from the router's axis
        ring.castShadow = false;
        dm.add(ring);
        dm.userData.ring = ring;
      }
      ring.rotation.z = ring.userData.out - LR4Routers.dialDeg(RT.set.dial) * Math.PI / 180;
      const col = ringColor(RT.set.router), v = ring.userData.v || 0.5, vRim = ring.userData.vRim || 0, key = col.join() + v + "/" + vRim;   // one texture per color + band, kept
      RT.texs = RT.texs || {};
      if (!RT.texs[key]) RT.texs[key] = rtRingTex(col, v, vRim);
      if (ring.material.map !== RT.texs[key]) { ring.material.map = RT.texs[key]; ring.material.needsUpdate = true; }
    }
    const sel = $("rt-router"), man = LR4Routers.manual(RT.set.router);
    if (!sel.options.length) for (const [k, r] of Object.entries(LR4Routers.ROUTERS)) if (!r.hidden || k === RT.set.router) sel.add(new Option(r.name, k));
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
    el.innerHTML = man ? `<b>Dial ${RT.set.dial.toFixed(1)}</b><span>${rtRpmText(LR4Routers.dialRpm(RT.set.dial, RT.set.router))}</span>` :
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
  rtLook();                                          // a model built before this file loaded (rebuild calls it after)
  // tests / videos: the settings, set them, the dial's ring turn (rad) + where the dial is on screen (client px)
  window.LR4Router = { state: () => Object.assign({}, RT.set), set: (o) => rtSet(o || {}),
    ring() { const dm = meshes.find((m) => m.userData.name === "Router_Dial"); return dm && dm.userData.ring ? +dm.userData.ring.rotation.z.toFixed(4) : null; },
    screen() { return LR4Power.screen("Router_Dial"); } };
