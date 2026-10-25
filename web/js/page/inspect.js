// lr4-sandbox page, part 10 of 12: Inspect, Inspect tools, measure, touching the pendant's screen.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- Inspect (Part 27): one tree row's set (LR4ShowTree.inspectSet: its parts + the bolts joining them + the
  // bearings / idlers those bolts hold) in place of the machine: no workshop, no job, framed, orbiting the set's centre,
  // the parts where they are on the machine now. From a row's ⤢ or a double-click (its assembly; inside, the part).
  // The Show checkboxes and the pick chip still work in it; Back (or Esc) puts the camera back. ----
  let INSPECT = null;                                 // { id, label, saved: { pos, target, center, radius }, set }
  function rowLabel(id) {
    for (const a of tree.asms) {
      if (a.id === id) return a.label;
      const k = a.kinds.find((x) => x.id === id);
      if (k) return `${a.label} › ${k.label}`;
      for (const kk of a.kinds) { const q = kk.parts.find((x) => x.id === id); if (q) return q.label; }
    }
    return id;
  }
  function inspect(id) {
    if (!id || !LR4ShowTree.members(tree, id).length) return;
    if (MEAS.main) mainMeasure(false);               // inspect has its own Measure
    const saved = INSPECT ? INSPECT.saved
      : { pos: camera.position.clone(), target: controls.target.clone(), center: center.clone(), radius };
    const up = tree.place[id] ? tree.place[id].flatMap(([a, k]) => [a, a + "." + k]) : [id.split(".")[0]];
    for (const x of [id, ...up]) showOff.delete(x);   // what you inspect is shown
    if (!INSPECT) document.getElementById("insp-card").open = !matchMedia("(max-width: 760px)").matches;   // phones: list closed
    INSPECT = { id, label: rowLabel(id), saved, set: null };
    document.body.classList.add("inspecting");
    document.getElementById("insp").hidden = false;
    applyVisibility();
    freeTurn(true);                                   // turns any way (a trackball), not just round Z
    const d = camera.position.clone().sub(controls.target);
    fitView([d.x, d.y, d.z]);
    INSPECT.step = radius * 0.35;                     // explode: the slider's full travel moves a part this far per step
    setExplode();
  }
  function inspectEnd() {
    if (!INSPECT) return;
    const s = INSPECT.saved;
    INSPECT = null;
    inspectToolsReset();
    document.body.classList.remove("inspecting");
    document.getElementById("insp").hidden = true;
    applyVisibility();
    center.copy(s.center); radius = s.radius;
    camera.position.copy(s.pos); controls.target.copy(s.target);
    freeTurn(false);                                  // upright again
    upright();
  }
  function inspectScene() {                           // the set (after applyVisibility's tree), scenery, the parts list
    if (shop) shop.visible = !INSPECT;
    if (JOB.group) JOB.group.visible = !INSPECT;
    if (!INSPECT) return;
    document.getElementById("insp-h").textContent = INSPECT.label;
    const ud = meshes.filter((m) => INSPECT.set.has(partId(m)) && fitted(m) && variantOK(m)).map((m) => m.userData);
    const host = document.getElementById("insp-list");
    host.textContent = "";
    let n = 0;
    for (const s of LR4ShowTree.partsList(ud)) {
      const h = document.createElement("h3"), t = document.createElement("table");
      h.textContent = s.title;
      for (const [q, l] of s.rows) {
        const r = t.insertRow();
        r.insertCell().textContent = q === null ? "?" : q;
        r.cells[0].className = "num";
        r.insertCell().textContent = l;
        if (q === null) r.title = "Count not in the data (the reference build has none of these)";
        if (s.title !== "Fasteners") n += q || 0;
      }
      host.append(h, t);
    }
    document.getElementById("insp-n").textContent = `${n} part${n === 1 ? "" : "s"}`;
    if (LOOK.v !== "solid") setLook(LOOK.v);          // new meshes (size / options) drawn the same way
    if (INSPECT.step) setExplode();
  }
  document.getElementById("insp-back").addEventListener("click", inspectEnd);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && INSPECT && !(e.target.closest && e.target.closest("input, select, textarea, dialog"))) inspectEnd();
  });
  canvas.addEventListener("dblclick", (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes.filter((m) => m.visible && !m.userData.shadowOnly), false)[0];
    if (hit && !MEAS.on) inspect(INSPECT ? partId(hit.object) : asmOf(hit.object));
  });
  // the selection chip's Inspect (Part 37): the part's assembly, or the part itself while inspecting
  document.getElementById("pick-insp").addEventListener("click", () => { if (selected) inspect(INSPECT ? partId(selected) : asmOf(selected)); });
  window.LR4Inspect = { open: inspect, close: inspectEnd, id: () => INSPECT && INSPECT.id,
    shown: () => meshes.filter((m) => m.visible && !m.userData.shadowOnly).map((m) => m.userData.name) };

  // ---- Inspect tools (Part 28): exploded slider, section cut, measure. Explode: LR4ShowTree.explode's unit steps along
  // the bolt lines (meta.axis / chain; a family bolt's chain names mapped to this size's names) times the slider; the
  // offsets ride on top of the machine's motion (userData.ex, added in move()). Section: one global clipping plane across
  // the set's box (the parts drawn two-sided while cut, so you see into them; no caps). Measure: two clicks, snapped to the
  // nearest vertex of the triangle hit or a hole centre (meta.holes: each screw's axis where it enters / leaves a part)
  // within SNAP_PX. ----
  const SNAP_PX = 14;
  const SEC = { axis: "", flip: false, plane: new THREE.Plane() };
  const MEAS = { on: false, pts: [], group: new THREE.Group() };
  MEAS.group.renderOrder = 10;
  scene.add(MEAS.group);
  const jointOf = (n) => { const a = n.split("__")[0], b = (/_to_(.+)$/.exec(n.slice(a.length + 2)) || [])[1]; return [a, b]; };
  function chainNames(ud) {                           // a bolt's chain / hole parts in this size's names
    const [ra, rb] = jointOf(ud.ref || ud.name), [a, b] = jointOf(ud.name);
    return (n) => (n === ra ? a : n === rb && b ? b : n);
  }
  const exVec = (m) => new THREE.Vector3(...(m.userData.ex || [0, 0, 0]));
  function centreOf(m) {                              // world centre of a mesh, without its explode offset
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.updateMatrixWorld();
    return m.localToWorld(m.geometry.boundingBox.getCenter(new THREE.Vector3())).sub(exVec(m));
  }
  function explodeUnits() {
    const info = { bolts: {}, centre: {}, size: {}, anchor: INSPECT.id, slide: {} };
    const byName = new Map(meshes.map((m) => [m.userData.name, m]));
    for (const m of meshes) {
      const id = partId(m), ud = m.userData;
      if (!INSPECT.set.has(id) || /~thread$/.test(ud.name) || ud.motion === "hose" || info.centre[id]) continue;
      info.centre[id] = centreOf(m).toArray();
      info.size[id] = m.geometry.boundingBox.getSize(new THREE.Vector3()).length();
      if (ud.axis && ud.chain) {                      // held: the bearings / idlers on it that its chain doesn't name
        const nm = chainNames(ud), chain = ud.chain.map(nm);
        const held = (tree.joins[id] || []).filter((p) => tree.kind[p] === "hardware" && !chain.includes(p));
        info.bolts[id] = { axis: ud.axis, chain, held };
        const host = byName.get(chain[0]);
        for (const h of held) {                       // each bearing on the screw line through it (meta.axes)
          const hm = byName.get(h);
          if (!hm || !host || info.slide[h]) continue;
          let axis = ud.axis;
          if (ud.axes) {
            const c = m.worldToLocal(centreOf(hm).add(exVec(m)));
            const dist = (a) => { const p = c.clone().sub(new THREE.Vector3(a[0], a[1], a[2])), d = new THREE.Vector3(a[3], a[4], a[5]);
              return p.addScaledVector(d, -p.dot(d)).length(); };
            axis = ud.axes.reduce((b, a) => (dist(a) < dist(b) ? a : b)).slice(3);
          }
          info.slide[h] = slotOpening(hm, host, axis);
        }
      }
    }
    return LR4ShowTree.explode(INSPECT.set, info);
  }
  function nutOf(m) {                                 // a bolt mesh's nuts as a child mesh, split off once: the mesh's
    const ud = m.userData;                            // connected pieces centred on a nut centre (meta.nuts)
    if (ud.nut !== undefined) return ud.nut;
    ud.nut = null;
    const g = m.geometry;
    if (!ud.nuts) return null;
    if (!g.userData.split) {                          // per geometry (a family's instances share it)
      const P = g.attributes.position, n = P.count, key = new Map(), canon = new Int32Array(n);
      const I = g.index ? g.index.array : Uint32Array.from({ length: n }, (_, i) => i);   // non-indexed: 3 per triangle
      for (let i = 0; i < n; i++) {                   // same point = same vertex (STL-style meshes repeat them per face)
        const k = `${Math.round(P.getX(i) * 100)},${Math.round(P.getY(i) * 100)},${Math.round(P.getZ(i) * 100)}`;
        if (!key.has(k)) key.set(k, i);
        canon[i] = key.get(k);
      }
      const par = Int32Array.from({ length: n }, (_, i) => i);
      const root = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
      for (let t = 0; t < I.length; t += 3) {
        const a = root(canon[I[t]]);
        par[root(canon[I[t + 1]])] = a; par[root(canon[I[t + 2]])] = a;
      }
      const sum = new Map();                          // piece -> [x, y, z, count] over its vertices
      for (let i = 0; i < n; i++) {
        if (canon[i] !== i) continue;
        const r = root(i), q = sum.get(r) || [0, 0, 0, 0];
        q[0] += P.getX(i); q[1] += P.getY(i); q[2] += P.getZ(i); q[3]++;
        sum.set(r, q);
      }
      const isNut = new Set([...sum].filter(([, q]) => ud.nuts.some(([x, y, z, af]) =>
        Math.hypot(q[0] / q[3] - x, q[1] / q[3] - y, q[2] / q[3] - z) < 0.45 * af)).map(([r]) => r));
      const keep = [], nut = [];
      for (let t = 0; t < I.length; t += 3) (isNut.has(root(canon[I[t]])) ? nut : keep).push(I[t], I[t + 1], I[t + 2]);
      const part = (idx) => {
        const q = new THREE.BufferGeometry();
        if (g.index) { for (const [k, v] of Object.entries(g.attributes)) q.setAttribute(k, v); q.setIndex(idx); return q; }
        for (const [k, v] of Object.entries(g.attributes)) {   // non-indexed: copy the triangles' vertices
          const a = new v.array.constructor(idx.length * v.itemSize);
          idx.forEach((i, j) => { for (let c = 0; c < v.itemSize; c++) a[j * v.itemSize + c] = v.array[i * v.itemSize + c]; });
          q.setAttribute(k, new THREE.BufferAttribute(a, v.itemSize, v.normalized));
        }
        return q;
      };
      g.userData.split = nut.length && keep.length ? { bolt: part(keep), nut: part(nut) } : null;
    }
    const sp = g.userData.split;
    if (!sp) return null;
    m.geometry = sp.bolt;
    ud.nut = new THREE.Mesh(sp.nut, m.material);
    m.add(ud.nut);
    return ud.nut;
  }
  // which way a bearing comes out of its slot (user 2026-10-22): up, at the angle it sits in the slot - world up made
  // square to its axle (the slot is square to the axle); an upright axle: straight out from the host's centre
  function slotOpening(m, host, axis) {
    const d = new THREE.Vector3(...axis).normalize(), u = new THREE.Vector3(0, 0, 1);
    u.addScaledVector(d, -u.dot(d));
    if (u.lengthSq() < 1e-4) { u.copy(centreOf(m).sub(centreOf(host))); u.addScaledVector(d, -u.dot(d)); }
    return u.lengthSq() > 1e-9 ? u.normalize().toArray() : [0, 0, 1];
  }
  function setExplode() {
    const k = INSPECT ? +document.getElementById("insp-ex").value * INSPECT.step : 0;
    const u = k ? INSPECT.ex || (INSPECT.ex = explodeUnits()) : {};
    for (const m of meshes) {
      if (m.userData.motion === "hose") continue;
      const o = u[partId(m)], nx = o ? o.map((v) => v * k) : null;
      if (m.userData.nuts && m.userData.axis && (o || m.userData.nut)) {   // the nut off the end of its bolt, past the last part
        const nut = nutOf(m);
        if (nut) nut.position.set(...m.userData.axis).multiplyScalar(o ? k * (m.userData.chain.length + 1) : 0);
      }
      if (!m.userData.ex && !nx) continue;
      m.position.sub(exVec(m));
      m.userData.ex = nx;
      m.position.add(exVec(m));
    }
    setSection();
  }
  function setBox() {                                 // the set's box as drawn (with the explode)
    const box = new THREE.Box3();
    for (const m of meshes) if (m.visible) { m.updateMatrixWorld(); box.expandByObject(m); }
    return box;
  }
  // View (user 2026-10-22): Solid; X-ray = the set's printed and cut parts see-through, the hardware (bolts, bearings,
  // rails, motors) solid, so what's inside shows; Lines = every part as its edges (EdgesGeometry, 25 deg; front and
  // back, no surfaces). Materials change in place and come back on Solid / Back; the section caps skip see-through or
  // line-only parts. Edges are made once per geometry (geometry.userData.edges).
  const LOOK = { v: "solid", saved: new Map(), lines: [] };
  function setLook(v) {
    LOOK.v = INSPECT && ["xray", "lines"].includes(v) ? v : "solid";
    document.querySelectorAll("#insp-look button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === LOOK.v)));
    for (const [mat, o] of LOOK.saved) Object.assign(mat, o, { needsUpdate: true });
    LOOK.saved.clear();
    for (const l of LOOK.lines) { l.parent.remove(l); l.material.dispose(); }
    LOOK.lines = [];
    const save = (mat, o) => { if (!LOOK.saved.has(mat)) LOOK.saved.set(mat, Object.fromEntries(Object.keys(o).map((k) => [k, mat[k]]))); Object.assign(mat, o, { needsUpdate: true }); };
    const ink = new THREE.Color(css("--ink") || "#e6e9ec").convertSRGBToLinear();
    if (LOOK.v !== "solid") for (const m of meshes) {
      const id = partId(m), k = tree.kind[id];
      if (!INSPECT.set.has(id)) continue;
      if (LOOK.v === "xray") { if (k === "printed" || k === "cut") save(m.material, { transparent: true, opacity: 0.22, depthWrite: false }); continue; }
      for (const o of [m, m.userData.nut].filter(Boolean)) {   // lines: the part's edges in its colour, toward the ink
        const g = o.geometry;
        if (!g.userData.edges) g.userData.edges = new THREE.EdgesGeometry(g, 25);
        const l = new THREE.LineSegments(g.userData.edges, new THREE.LineBasicMaterial({ color: m.material.color.clone().lerp(ink, 0.45) }));
        o.add(l); LOOK.lines.push(l);
      }
      save(m.material, { visible: false });
    }
    setSection();
  }
  function setSection() {
    const on = !!(INSPECT && SEC.axis), cut = document.getElementById("insp-cut");
    cut.hidden = !on;
    document.querySelectorAll("#insp-sec button").forEach((b) => b.setAttribute("aria-pressed",
      String(b.dataset.v === "flip" ? SEC.flip : b.dataset.v === (on ? SEC.axis : ""))));
    renderer.clippingPlanes = on ? [SEC.plane] : [];
    capsSync(on);
    if (on) placeSection();
  }
  function placeSection() {                           // the plane across the set as it's drawn now, and the caps on it
    const i = "xyz".indexOf(SEC.axis), box = setBox(), lo = box.min.getComponent(i), hi = box.max.getComponent(i);
    const v = lo + (hi - lo) * +document.getElementById("insp-cut").value, n = new THREE.Vector3().setComponent(i, SEC.flip ? 1 : -1);
    SEC.plane.set(n, SEC.flip ? -v : v);              // keeps n . p + c >= 0: below the cut, or above it flipped
    // the caps: a square on the plane over the set (0.05 mm into the kept side, so the clipping doesn't eat it)
    const size = box.getSize(new THREE.Vector3()).length() * 1.2 || 1;
    const c = SEC.plane.projectPoint(box.getCenter(new THREE.Vector3()), new THREE.Vector3()).addScaledVector(n, 0.05);   // not in place: r147 overwrites
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const k of CAPS.list) { k.cap.position.copy(c); k.cap.quaternion.copy(q); k.cap.scale.set(size, size, 1); }
  }
  // section caps (the stencil way, as three.js' webgl_clipping_stencil): for each cut part, its back faces add 1 and
  // its front faces take 1 off the stencil, so the plane's pixels inside the solid are left non-zero; a square on the
  // plane in the part's colour is drawn only there (and resets them). Before the parts (renderOrder < 0), so the parts
  // in front still hide it. Open meshes (threads, the hose, belts) aren't capped.
  const CAPS = { list: [], key: "", group: new THREE.Group(), geo: new THREE.PlaneGeometry(1, 1) };
  scene.add(CAPS.group);
  const stencilMat = (side, op) => new THREE.MeshBasicMaterial({ side, depthWrite: false, depthTest: false, colorWrite: false,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
  function capsSync(on) {
    const ms = on ? meshes.filter((m) => m.visible && !/~thread$/.test(m.userData.name || "") && m.userData.motion !== "hose"
      && !/^Belt_/.test(m.userData.name || "") && !m.material.transparent && m.material.visible) : [];
    const key = ms.map((m) => m.userData.name).join();
    if (key === CAPS.key) return;
    CAPS.key = key;
    for (const k of CAPS.list) {
      k.m.remove(k.back, k.front); CAPS.group.remove(k.cap);
      k.back.material.dispose(); k.front.material.dispose(); k.cap.material.dispose();
    }
    CAPS.list = ms.map((m, i) => {
      const o = -10000 + i * 3, back = new THREE.Mesh(m.geometry, stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp));
      const front = new THREE.Mesh(m.geometry, stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp));
      back.renderOrder = o; front.renderOrder = o + 1;
      m.add(back, front);                             // they ride with the part (motion, explode)
      const cap = new THREE.Mesh(CAPS.geo, new THREE.MeshStandardMaterial({ color: m.material.color.clone().lerp(new THREE.Color(1, 1, 1), 0.3),   // a lighter cut face
        roughness: 0.9, metalness: 0, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp }));
      cap.renderOrder = o + 2;
      CAPS.group.add(cap);
      return { m, back, front, cap };
    });
  }
  // ---- measure ----
  function measureClear() {
    MEAS.pts = [];
    for (const c of [...MEAS.group.children]) { MEAS.group.remove(c); c.geometry.dispose(); c.material.dispose(); }
    document.getElementById(MEAS.main ? "meas-main" : "meas-out").textContent = MEAS.on ? "Click a point (snaps to corners and hole centres)." : "";
  }
  function measureSnap(e) {                           // -> { p: world point, what } or null
    const r = canvas.getBoundingClientRect(), px = [e.clientX - r.left, e.clientY - r.top];
    ndc.set((px[0] / r.width) * 2 - 1, -(px[1] / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const keep = (p) => !renderer.clippingPlanes.length || SEC.plane.distanceToPoint(p) >= 0;
    const hit = ray.intersectObjects(meshes.filter((m) => m.visible && !m.userData.shadowOnly), false).find((h) => keep(h.point));
    const scr = (p) => { const q = p.clone().project(camera); return [(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height, q.z]; };
    let best = null;
    const offer = (p, what) => {
      if (!keep(p)) return;
      const s = scr(p), d = Math.hypot(s[0] - px[0], s[1] - px[1]);
      if (s[2] < 1 && d <= SNAP_PX && (!best || d < best.d)) best = { p, what, d };
    };
    if (hit && hit.face) {
      const pos = hit.object.geometry.attributes.position;
      for (const k of ["a", "b", "c"]) offer(hit.object.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, hit.face[k])), "corner");
    }
    const byName = new Map(meshes.map((m) => [m.userData.name, m]));
    for (const m of meshes) {                         // hole centres, on the parts as they sit (exploded too)
      const ud = m.userData;
      if (!m.visible || !ud.holes) continue;
      const nm = chainNames(ud), bx = exVec(m);
      m.updateMatrixWorld();
      for (const [part, x, y, z] of ud.holes) {
        const pm = byName.get(nm(part));
        if (pm && !pm.visible) continue;
        offer(m.localToWorld(new THREE.Vector3(x, y, z)).sub(bx).add(pm ? exVec(pm) : bx), "hole centre");
      }
    }
    return best || (hit ? { p: hit.point.clone(), what: "surface" } : null);
  }
  function measureClick(e) {
    const s = measureSnap(e);
    if (!s) return;
    if (MEAS.pts.length === 2) measureClear();
    MEAS.pts.push(s);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.6, radius * 0.006), 16, 12),
      new THREE.MeshBasicMaterial({ color: css("--accent") || "#c8241b", depthTest: false }));
    dot.position.copy(s.p); dot.renderOrder = 10;
    MEAS.group.add(dot);
    const out = document.getElementById(MEAS.main ? "meas-main" : "meas-out");
    if (MEAS.pts.length === 1) { out.textContent = `First point (${s.what}). Click the second.`; return; }
    const [a, b] = MEAS.pts.map((q) => q.p), d = b.clone().sub(a), L = d.length();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: css("--accent") || "#c8241b", depthTest: false }));
    line.renderOrder = 10;
    MEAS.group.add(line);
    const f = (v) => v.toFixed(2);
    out.textContent = `${f(L)} mm (${(L / IN).toFixed(3)} in) · ΔX ${f(Math.abs(d.x))} ΔY ${f(Math.abs(d.y))} ΔZ ${f(Math.abs(d.z))}`
      + ` · ${MEAS.pts[0].what} → ${MEAS.pts[1].what}`;
  }
  function setupInspectTools() {                      // once
    document.getElementById("insp-ex").addEventListener("input", setExplode);
    document.getElementById("insp-cut").addEventListener("input", setSection);
    document.getElementById("insp-look").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLook(b.dataset.v); });
    document.getElementById("insp-sec").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.v === "flip") SEC.flip = !SEC.flip; else SEC.axis = b.dataset.v;
      setSection();
    });
    document.getElementById("insp-meas").addEventListener("click", (e) => {
      MEAS.on = !MEAS.on;
      e.target.setAttribute("aria-pressed", String(MEAS.on));
      document.getElementById("meas-out").hidden = !MEAS.on;
      canvas.classList.toggle("measuring", MEAS.on);
      measureClear();
    });
  }
  setupInspectTools();
  function inspectToolsReset() {                      // leaving inspect: everything back
    document.getElementById("insp-ex").value = 0;
    SEC.axis = ""; SEC.flip = false;
    setLook("solid");
    MEAS.on = false;
    document.getElementById("insp-meas").setAttribute("aria-pressed", "false");
    document.getElementById("meas-out").hidden = true;
    canvas.classList.remove("measuring");
    measureClear();
    setExplode();
  }
  window.LR4Inspect.tools = { explode: (v) => { document.getElementById("insp-ex").value = v; setExplode(); },
    section: (axis, at, flip) => { SEC.axis = axis || ""; SEC.flip = !!flip; document.getElementById("insp-cut").value = at ?? 0.5; setSection(); },
    measure: (on) => { if (MEAS.on !== !!on) document.getElementById("insp-meas").click(); },
    snap: (x, y) => measureSnap({ clientX: x, clientY: y }), click: (x, y) => measureClick({ clientX: x, clientY: y }),
    result: () => document.getElementById("meas-out").textContent,
    state: () => ({ explode: +document.getElementById("insp-ex").value, axis: SEC.axis, at: +document.getElementById("insp-cut").value, flip: SEC.flip,
      caps: CAPS.list.length, look: LOOK.v, xray: LOOK.v === "xray" }),
    look: (v) => setLook(v), xray: (on) => setLook(on ? "xray" : "solid"),
    offsets: () => Object.fromEntries(meshes.filter((m) => m.userData.ex).map((m) => [m.userData.name, m.userData.ex])),
    nuts: () => meshes.filter((m) => m.userData.nuts).map((m) => [m.userData.name, !!m.userData.nut, m.userData.nut ? +m.userData.nut.position.length().toFixed(2) : null]) };

  // ---- touching the pendant's screen (FluidTouch): a press on it in the view wins over orbiting and picking ----
  const ftScreen = () => { const m = FT.ft && meshes.find((q) => q.userData.name === "Pendant_screen"); return m && m.visible ? m : null; };
  function ftViewHit(e, all) {                       // -> [x, y] in FluidTouch's pixels, or null (all: blocked by parts in front)
    const m = ftScreen();
    if (!m) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(all ? meshes.filter((q) => q.visible && !q.userData.shadowOnly) : [m], false)[0];
    return h && h.object === m && h.uv ? [h.uv.x * FT.ft.width, (1 - h.uv.y) * FT.ft.height] : null;
  }
  {
    const stage = canvas.parentElement;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target !== canvas || e.button !== 0) return;
      const p = ftViewHit(e, true);
      if (!p) return;
      e.stopPropagation(); e.preventDefault();       // OrbitControls and the picker never see it
      FT.drag = e.pointerId; FT.last = p;
      canvas.setPointerCapture(e.pointerId);
      FT.ft.touch(p[0], p[1], true);
    }, true);
    stage.addEventListener("pointermove", (e) => {
      if (FT.drag === e.pointerId) {
        e.stopPropagation();
        const p = ftViewHit(e, false);
        if (p && FT.ft) { FT.last = p; FT.ft.touch(p[0], p[1], true); }
      } else if (e.target === canvas && !e.buttons && FT.ft) canvas.style.cursor = ftViewHit(e, false) ? "pointer" : "";
    }, true);
    const up = (e) => {
      if (FT.drag !== e.pointerId) return;
      e.stopPropagation();
      FT.drag = null;
      if (FT.ft) FT.ft.touch(FT.last[0], FT.last[1], false);
    };
    stage.addEventListener("pointerup", up, true);
    stage.addEventListener("pointercancel", up, true);
  }
  {                                                  // the pop-out: FluidTouch's 800 x 480 screen over the view
    const pc = $("ft-pop-c");
    let held = null;
    const at = (e) => { const r = pc.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * pc.width, (e.clientY - r.top) / r.height * pc.height]; };
    pc.addEventListener("pointerdown", (e) => {
      if (!FT.ft || e.button !== 0) return;
      held = e.pointerId; pc.setPointerCapture(e.pointerId); e.preventDefault();
      FT.ft.touch(...at(e), true);
    });
    pc.addEventListener("pointermove", (e) => { if (held === e.pointerId && FT.ft) FT.ft.touch(...at(e), true); });
    const lift = (e) => { if (held !== e.pointerId) return; held = null; if (FT.ft) FT.ft.touch(...at(e), false); };
    pc.addEventListener("pointerup", lift);
    pc.addEventListener("pointercancel", lift);
    $("ft-pop-btn").addEventListener("click", () => { $("ft-pop").hidden = !$("ft-pop").hidden; FT.popFrame = -1; });
    $("ft-pop-x").addEventListener("click", () => { $("ft-pop").hidden = true; });
  }
  function ftPopDraw() {                             // the pop-out window, and the video's picture-in-picture
    if (!FT.ft) return;
    const f = FT.ft.frame();
    if (!$("ft-pop").hidden && f !== FT.popFrame) { FT.popFrame = f; FT.ft.draw($("ft-pop-c").getContext("2d")); }
    if (!$("rec-pip").hidden && f !== FT.pipFrame) { FT.pipFrame = f; FT.ft.draw($("rec-pip-c").getContext("2d")); }
  }
  // VR: a controller's tip (p, scene mm; S = rig mm per metre) pressed into the screen touches it there: down within
  // 3 mm in front of the glass (life size), up again past 6 mm or off the screen; one finger at a time.
  // -> "down" (just touched: vr.js buzzes), "on", or false
  const ftV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  function ftPoke(who, p, S) {
    const m = ftScreen();
    const lift = () => { if (FT.poker === who) { FT.poker = null; if (FT.ft) FT.ft.touch(FT.last[0], FT.last[1], false); } return false; };
    if (!m || !p || (FT.poker !== null && FT.poker !== who)) return lift();
    const c = pendant.info.screen.corners, k = S / 1000;
    const [l, ex, ey, n] = ftV;
    m.worldToLocal(l.copy(p)).sub(n.set(...c[0]));
    ex.set(...c[1]).sub(n); ey.set(...c[3]).sub(n);
    const u = l.dot(ex) / ex.lengthSq(), v = l.dot(ey) / ey.lengthSq(), d = l.dot(n.crossVectors(ex, ey).normalize());
    const was = FT.poker === who;
    if (u < 0 || u > 1 || v < 0 || v > 1 || d > (was ? 6 : 3) * k || d < -25 * k) return lift();
    FT.poker = who; FT.last = [u * FT.ft.width, (1 - v) * FT.ft.height];
    FT.ft.touch(FT.last[0], FT.last[1], true);
    return was ? "on" : "down";
  }
  // for tests: the pendant's FluidTouch; a screen point (u, v from its bottom-left; d mm out of the glass) in scene mm
  window.LR4Pendant = { set: pendantSet, ft: () => FT.ft, log: () => FT.log, poke: ftPoke, popOpen: () => !$("ft-pop").hidden,
    point(u, v, d) {
      const m = ftScreen();
      if (!m) return null;
      const c = pendant.info.screen.corners.map((q) => new THREE.Vector3(...q));
      const ex = c[1].clone().sub(c[0]), ey = c[3].clone().sub(c[0]), n = ex.clone().cross(ey).normalize();
      m.updateMatrixWorld();
      return m.localToWorld(c[0].clone().addScaledVector(ex, u).addScaledVector(ey, v).addScaledVector(n, d || 0));
    } };

