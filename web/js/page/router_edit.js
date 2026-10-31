// lr4-sandbox page: Build your router on the model (user 2026-10-29: "measurements and clickable areas right on the
// model to adjust it. All these number fields isn't working well"). In the router's Close-up (router_build.js): the
// router's dimensions (LR4RouterDims) drawn on it, CAD style; click a number to type it, drag a ● handle to pull that
// end. Camera snaps (Front / Right / Top / Iso) and a Flat lens (Part 48a). Every change goes through the builder's
// rbSet (an LR4RouterSchema key), so its rules - the motor cap on the turned part, overall = the stack + the cap - hold
// here too. The page's scripts share one global scope (RT, rbViewing: router*.js). ----
  const RX = { view: "front", face: "front", drag: null, edit: null, fov: null, hover: null, sel: null, ghost: null, ghostKey: "", lit: [], slide: null, anim: null, faded: new Map(), flat: false };
  // Part 48a (user 2026-10-31: "those top, side views should just be camera in 3d view"): the views are camera snaps -
  // orbit, pan and zoom always work, dragging away just leaves the snap. Flat = a narrow lens (near a drawing) to
  // measure by eye. The numbers drawn are the ones facing the camera (RX.face, picked when an orbit ends).
  const RX_VIEWS = [["front", "Front"], ["right", "Right"], ["top", "Top"], ["iso", "Iso"]];   // where you stand at the machine (user 2026-10-30)
  const RX_LENS = 8;                                  // the Flat lens (deg)
  try { RX.flat = MS.get("lr4-rx-flat") === "1"; } catch (e) { /* default */ }
  const rxStage = document.querySelector(".stage");
  const rxBox = document.createElement("div");
  rxBox.className = "rbx"; rxBox.id = "rbx"; rxBox.hidden = true;
  rxBox.innerHTML = '<svg class="rbx-svg" aria-hidden="true"></svg><div class="rbx-views" id="rbx-views" role="group" aria-label="Camera">' +
    RX_VIEWS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false" title="Turn the camera to the ${l === "Iso" ? "corner (3D)" : l.toLowerCase()} view">${l}</button>`).join("") +
    '<button type="button" id="rbx-flat" class="rbx-lens" aria-pressed="false" title="Flat: a narrow lens, so sizes read like a drawing">Flat</button>' +
    '</div><div class="rbx-undo"><button type="button" data-undo="rb-undo" disabled title="Undo (Ctrl+Z)">↶</button>' +
    '<button type="button" data-undo="rb-redo" disabled title="Redo (Ctrl+Shift+Z)">↷</button>' +
    '<button type="button" id="rbx-tc" title="Watch a bit change on this router: the bit set in Run > On the table goes in">Change bit</button></div><p class="rbx-tip" id="rbx-tip">Click a part to edit it · click a number to type it · drag a ● to pull that end · drag the view to turn it</p>' +
    '';
  rxStage.insertBefore(rxBox, document.getElementById("insp"));   // under Inspect's panels
  const rxSvg = rxBox.querySelector("svg");

  function rxRouter() { return LR4Routers.ROUTERS[RT.set.router]; }
  // nothing picked: only the overall height, the head's size and the grip Ø (the fit); a part picked: its own
  const RX_BASE = new Set(["overall", "cap-L", "cap-Lt", "cap-W", "cap-Wt", "cap-H", "cap-Hf", "dia-housing", "diaf-housing"]);
  function rxDims() {
    const C = rtClamps(), all = LR4RouterDims.dims(rxRouter(), C ? C.def : null);
    return all.filter((d) => d.views.includes(RX.face) && (RX.sel ? d.g === RX.sel : RX_BASE.has(d.id)));
  }
  function rxRef(p) {                                 // body frame -> the router mesh's own (router.js's frame + the clamp drop)
    const f = RT.body && RT.body.f;
    if (!f) return null;
    const c = Math.cos(f.a), s = Math.sin(f.a);
    return new THREE.Vector3(f.o[0] + p[0] * c - p[1] * s, f.o[1] + p[0] * s + p[1] * c, f.o[2] + p[2]);
  }
  const rxMesh = () => meshes.find((m) => m.userData.name === "Router_Housing");   // the router's housing (it rides the machine's pose)
  function rxWorld(p) {                               // body frame -> the scene
    const w = rxRef(p), m = rxMesh();
    if (w && m) { m.updateMatrixWorld(); w.applyMatrix4(m.matrixWorld); }
    return w;
  }
  function rxScreen(p) {                              // body frame -> px in the stage
    const w = rxWorld(p);
    if (!w) return null;
    w.project(camera);
    return [(w.x + 1) / 2 * canvas.clientWidth, (1 - w.y) / 2 * canvas.clientHeight];
  }
  const rxAdd = (p, o, k = 1) => [p[0] + o[0] * k, p[1] + o[1] * k, p[2] + o[2] * k];
  const rxFmt = (d) => (d.kind === "dia" ? "Ø" : d.kind === "rad" ? "R" : d.kind === "ch" ? "C" : "") + (+d.v.toFixed(1)) + (d.kind === "ang" ? "°" : "");

  // the drawing: each frame while it's on (the camera moves, the router changes under it); scripting.js's tick
  function rxTick() { if (!rxBox.hidden) rxDraw(); }
  function rxDraw() {
    if (RX.sel && !rxValid(RX.sel)) return rxPick(null);   // the part's gone (the lock taken off, now a spindle)
    const W = canvas.clientWidth, H = canvas.clientHeight;
    rxGhost();
    rxSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    let svg = "";
    const labels = [];
    for (const d of rxDims()) {
      const A = rxScreen(d.a), B = rxScreen(d.b), A2 = rxScreen(rxAdd(d.a, d.off)), B2 = rxScreen(rxAdd(d.b, d.off));
      if (!A || !B) continue;
      const hot = RX.hover === d.id || (RX.drag && RX.drag.d.id === d.id) || (RX.edit && RX.edit.d.id === d.id);
      const cls = "rbx-d" + (hot ? " hot" : "");
      let at;
      if (d.kind === "rad" || d.kind === "ch" || d.kind === "ang") {     // a leader from the corner (the lock's tip) out to its number
        svg += `<g class="${cls}"><circle cx="${A[0]}" cy="${A[1]}" r="2.5"/><line x1="${A[0]}" y1="${A[1]}" x2="${A2[0]}" y2="${A2[1]}"/></g>`;
        at = A2;
        if (d.kind === "ang" && d.f && d.k) labels.push({ d, at: A, handle: true });   // the lock's tip: turned round the axis
      } else {
        const ext = (P, P2) => (Math.hypot(P2[0] - P[0], P2[1] - P[1]) > 2 ? `<line class="ext" x1="${P[0]}" y1="${P[1]}" x2="${P2[0]}" y2="${P2[1]}"/>` : "");
        const ux = B2[0] - A2[0], uy = B2[1] - A2[1], n = Math.hypot(ux, uy) || 1, ax = (ux / n) * 7, ay = (uy / n) * 7, px = -ay * 0.45, py = ax * 0.45;
        const arrow = (P, s) => `<path class="arr" d="M${P[0]} ${P[1]} L${P[0] + s * ax + px} ${P[1] + s * ay + py} L${P[0] + s * ax - px} ${P[1] + s * ay - py}Z"/>`;
        svg += `<g class="${cls}">${ext(A, A2)}${ext(B, B2)}<line x1="${A2[0]}" y1="${A2[1]}" x2="${B2[0]}" y2="${B2[1]}"/>${n > 18 ? arrow(A2, 1) + arrow(B2, -1) : ""}</g>`;
        at = [(A2[0] + B2[0]) / 2, (A2[1] + B2[1]) / 2];
        if (d.f && d.k) labels.push({ d, at: B2, handle: true });
      }
      labels.push({ d, at });
    }
    rxSvg.innerHTML = svg;
    // the numbers + handles: buttons, reused by key so a drag / hover keeps its element
    const keep = new Set(), placed = [];
    labels.sort((p, q) => (p.handle ? 1 : 0) - (q.handle ? 1 : 0));   // the numbers first: they get first pick of the spots
    for (const { d, at, handle } of labels) {
      const key = (handle ? "h:" : "n:") + d.id;
      keep.add(key);
      let el = rxBox.querySelector(`[data-x="${key}"]`);
      if (!el) {
        el = document.createElement("button");
        el.type = "button"; el.dataset.x = key;
        el.className = handle ? "rbx-h" : "rbx-n";
        rxBox.appendChild(el);
      }
      el.dataset.id = d.id;
      const ro = !d.k;
      if (!handle && !(RX.edit && RX.edit.el === el)) el.textContent = rxFmt(d);
      el.title = ro ? `${d.label} (set by the parts below it)` : handle ? `Drag: ${d.label}` : `${d.label}: click to type`;
      el.disabled = ro;
      el.classList.toggle("hot", RX.hover === d.id || (RX.drag && RX.drag.d.id === d.id));
      let x = at[0];
      if (!handle) {                                  // a number on top of another: slid sideways until it's clear
        const w = el.offsetWidth + 4, h = el.offsetHeight + 2;
        const hit = (cx) => placed.some(([px, py, pw, ph]) => Math.abs(px - cx) * 2 < pw + w && Math.abs(py - at[1]) * 2 < ph + h);
        for (const k of [0, 1, -1, 2, -2, 3, -3]) if (!hit(at[0] + k * w)) { x = at[0] + k * w; break; }
        placed.push([x, at[1], w, h]);
      }
      el.style.left = x + "px"; el.style.top = at[1] + "px";
    }
    for (const el of [...rxBox.querySelectorAll("[data-x]")]) if (!keep.has(el.dataset.x) && !(RX.edit && RX.edit.el === el)) el.remove();
  }

  // a change: into the builder (rbSet: it saves, rebuilds, keeps the rules)
  function rxSet(d, v) {
    if (!d.k || !Number.isFinite(v)) return;
    rbSet(d.k, +(d.kind === "ang" ? v : Math.max(0, v)).toFixed(1));   // an angle may be negative (clockwise)
    rxDraw();                                         // now, not on the next frame
  }
  const rxFind = (id) => rxDims().find((d) => d.id === id);

  function rxType(el) {                               // a number clicked: a box on the spot
    const d = rxFind(el.dataset.id);
    if (!d || !d.k) return;
    const box = document.createElement("input");
    box.type = "number"; box.step = "any"; box.className = "rbx-in"; box.value = d.v;
    box.setAttribute("aria-label", d.label + (d.kind === "ang" ? " (degrees)" : " (mm)"));
    el.textContent = ""; el.appendChild(box);
    RX.edit = { d, el };
    box.focus(); box.select();
    let done = false;
    const end = (ok) => {
      if (done) return;
      done = true;
      RX.edit = null;
      box.remove();
      if (ok && box.value !== "") rxSet(d, Number(box.value));
      else rxDraw();
    };
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); end(true); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); }
    });
    box.addEventListener("blur", () => end(true));
    box.addEventListener("click", (e) => e.stopPropagation());
  }
  rxBox.querySelector("#rbx-tc").addEventListener("click", async (e) => {   // a bit change on this router (tool_change.js)
    const btn = e.currentTarget, b = bitForm($("hs-bit"));
    if (typeof tcPlay !== "function" || btn.disabled) return;
    btn.disabled = true;
    await tcPlay({ bit: b });
    btn.disabled = false;
    if (b) handBit(b);                                // what went in is in the router now
  });
  rxBox.addEventListener("click", (e) => {
    const el = e.target.closest(".rbx-n");
    if (el && !RX.edit) rxType(el);
  });
  rxBox.addEventListener("pointerover", (e) => { const el = e.target.closest("[data-id]"); RX.hover = el ? el.dataset.id : null; });
  rxBox.addEventListener("pointerout", () => { RX.hover = null; });

  // a handle dragged: the mm it moves along its dimension (the end b, away from a) x the factor (2 for a centered size)
  rxBox.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".rbx-h");
    if (!el) return;
    const d = rxFind(el.dataset.id);
    if (!d) return;
    e.preventDefault();
    if (d.kind === "ang") {                         // round the axis: the pointer's angle about it on screen
      const C = rxScreen(d.c), rect = canvas.getBoundingClientRect(), at = (x, y) => Math.atan2(y - rect.top - C[1], x - rect.left - C[0]) * 180 / Math.PI;
      const T0 = rxScreen(d.b), r = Math.hypot(d.b[0], d.b[1]), a1 = (d.v + 1) * Math.PI / 180, T1 = rxScreen([r * Math.cos(a1), r * Math.sin(a1), d.c[2]]);
      const sa = (P) => Math.atan2(P[1] - C[1], P[0] - C[0]) * 180 / Math.PI, dd = ((sa(T1) - sa(T0) + 540) % 360) - 180;
      if (Math.abs(dd) < 0.05) return;                // seen edge-on
      RX.drag = { d, v0: d.v, ang: at, a0: at(e.clientX, e.clientY), sg: Math.sign(dd) };
      el.setPointerCapture(e.pointerId);
      return;
    }
    const A = rxScreen(d.b), L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1], d.b[2] - d.a[2]) || 1;
    const u = [(d.b[0] - d.a[0]) / L, (d.b[1] - d.a[1]) / L, (d.b[2] - d.a[2]) / L], B = rxScreen(rxAdd(d.b, u, 10));
    const px = [(B[0] - A[0]) / 10, (B[1] - A[1]) / 10], pp = px[0] * px[0] + px[1] * px[1];   // px per mm along it
    if (pp < 1e-4) return;                            // seen end-on: nothing to drag along
    RX.drag = { d, v0: d.v, x: e.clientX, y: e.clientY, px, pp };
    el.setPointerCapture(e.pointerId);
  });
  rxBox.addEventListener("pointermove", (e) => {
    const g = RX.drag;
    if (!g) return;
    if (g.ang) {                                      // whole degrees, -180 .. 180
      const v = Math.round((((g.v0 + g.sg * (((g.ang(e.clientX, e.clientY) - g.a0 + 540) % 360) - 180)) + 540) % 360) - 180);
      if (v !== g.last) { g.last = v; rxSet(g.d, v); }
      return;
    }
    const mm = ((e.clientX - g.x) * g.px[0] + (e.clientY - g.y) * g.px[1]) / g.pp;
    const v = Math.round((g.v0 + mm * g.d.f) * 2) / 2;   // 0.5 mm steps
    if (v !== g.last) { g.last = v; rxSet(g.d, v); }
  });
  const rxDrop = () => { RX.drag = null; };
  rxBox.addEventListener("pointerup", rxDrop);
  rxBox.addEventListener("pointercancel", rxDrop);

  // the camera snaps: Front = from the machine's front (the router's -y side, +x to the right), Right = from its switch
  // end, Top, Iso = the front-right corner from above. Animated (~0.35 s; none with reduced motion), orbiting stays on.
  function rxDir(v) {                                 // a snap's camera direction in the scene (the router's frame turned by f.a)
    const f = RT.body && RT.body.f, c = Math.cos(f.a), s = Math.sin(f.a);
    return { front: [s, -c, 0.0001], right: [c, s, 0.0001], top: [s * 0.002, -c * 0.002, 1], iso: [c * 0.8 + s, s * 0.8 - c, 0.7] }[v];
  }
  function rxViewMark() { for (const b of rxBox.querySelectorAll(".rbx-views [data-v]")) b.setAttribute("aria-pressed", String(b.dataset.v === RX.view)); }
  function rxLook(v, now) {
    if (v === "3d") v = "iso";                        // (the old name)
    RX.view = v;
    rxViewMark();
    const f = RT.body && RT.body.f;
    if (!f || !INSPECT) return;
    rxLens();
    freeTurn(false);                                  // OrbitControls: Z stays up, so a snap reads square
    controls.enableRotate = true;
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    fitView(rxDir(v));
    if (typeof capEditFit === "function") capEditFit();   // the room between the editor's panels
    const p1 = camera.position.clone(), t1 = controls.target.clone();
    RX.anim = null;
    const quick = now || matchMedia("(prefers-reduced-motion: reduce)").matches || p0.distanceTo(p1) < 0.5;
    if (quick) { controls.update(); rxFace(); rxDraw(); return; }
    const o0 = p0.clone().sub(t0), o1 = p1.clone().sub(t1), d0 = o0.length(), d1 = o1.length();
    const q = new THREE.Quaternion().setFromUnitVectors(o0.clone().normalize(), o1.clone().normalize()), I = new THREE.Quaternion();
    const A = RX.anim = { t: performance.now() };
    const step = (end) => {
      if (RX.anim !== A || rxBox.hidden) return;
      const k = end === true ? 1 : Math.min(1, (performance.now() - A.t) / 350), e = k * k * (3 - 2 * k);
      const dir = o0.clone().normalize().applyQuaternion(I.clone().slerp(q, e));
      controls.target.lerpVectors(t0, t1, e);
      camera.position.copy(controls.target).addScaledVector(dir, d0 + (d1 - d0) * e);
      controls.update();
      if (k < 1) return requestAnimationFrame(step);
      camera.position.copy(p1); controls.target.copy(t1); controls.update();
      RX.anim = null;
      rxFace(); rxDraw();
    };
    camera.position.copy(p0); controls.target.copy(t0);
    requestAnimationFrame(step);
    setTimeout(() => step(true), 400);               // lands even where frames stall (a background tab)
  }
  // which numbers face the camera: the router's axis nearest the view direction (back = front's, under = top's)
  function rxFace() {
    const f = RT.body && RT.body.f, m = rxMesh();
    if (!f) return;
    const d = camera.position.clone().sub(controls.target);
    if (m) d.applyQuaternion(m.getWorldQuaternion(new THREE.Quaternion()).invert());
    const c = Math.cos(f.a), s = Math.sin(f.a), x = Math.abs(d.x * c + d.y * s), y = Math.abs(-d.x * s + d.y * c), z = Math.abs(d.z);
    RX.face = z >= Math.max(x, y) ? "top" : x > y ? "right" : "front";
  }
  // Flat: the narrow lens, the distance scaled so the router stays the same size on screen
  function rxLens(toggle) {
    if (RX.fov === null) RX.fov = camera.fov;
    if (toggle) { RX.flat = !RX.flat; try { MS.set("lr4-rx-flat", RX.flat ? "1" : "0"); } catch (e) { /* not kept */ } }
    const want = RX.flat ? RX_LENS : RX.fov;
    $("rbx-flat").setAttribute("aria-pressed", String(RX.flat));
    if (camera.fov === want) return;
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(want / 2));
    camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
    camera.fov = want;
    camera.updateProjectionMatrix();
    controls.update();
  }
  rxBox.querySelector(".rbx-views").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "rbx-flat") { rxLens(true); rxDraw(); return; }
    rxLook(b.dataset.v);
  });
  // an orbit: the snap's button lets go once the camera's turned off it; the numbers re-picked when it ends
  controls.addEventListener("start", () => { if (!rxBox.hidden) RX.anim = null; });
  controls.addEventListener("end", () => {
    if (rxBox.hidden) return;
    if (RX.view && RT.body && RT.body.f) {
      const d = camera.position.clone().sub(controls.target).normalize(), w = new THREE.Vector3(...rxDir(RX.view)).normalize();
      if (d.dot(w) < 0.9994) { RX.view = null; rxViewMark(); }   // over ~2°
    }
    rxFace();
    rxDraw();
  });

  // on with the Close-up (router_build.js rbViewMark), off when it ends
  function rxMark() {
    const on = typeof rbViewing === "function" && rbViewing();
    if (on === !rxBox.hidden) return;
    rxBox.hidden = !on;
    if (on) { rxLook(RX.view || "front", true); return; }
    RX.drag = RX.edit = RX.anim = null;
    rxPick(null);
    rxFade();
    for (const el of [...rxBox.querySelectorAll("[data-x]")]) el.remove();
    if (RX.fov !== null) { camera.fov = RX.fov; RX.fov = null; camera.updateProjectionMatrix(); }
    controls.enableRotate = true;
  }
  // the mount + shoe (their bolts, the core) see-through while a part they'd hide is picked (not the mount itself, the cap or
  // the dial: above it)
  const RX_FADE = /^(?!Router_)./;                    // the close-up shows the router + those
  function rxFade() {
    const on = !rxBox.hidden && !!RX.sel && !["mount", "motor_cap", "dial"].includes(RX.sel);
    if (!on) {
      for (const [mat, o] of RX.faded) Object.assign(mat, o, { needsUpdate: true });
      RX.faded.clear();
      return;
    }
    for (const m of meshes) {
      if (!m.visible || !RX_FADE.test(m.userData.name || "") || RX.faded.has(m.material)) continue;
      const mat = m.material;
      RX.faded.set(mat, { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
      Object.assign(mat, { transparent: true, opacity: 0.18, depthWrite: false, needsUpdate: true });
    }
  }

  // ---- a part picked (user 2026-10-29: "click and highlight each part and edit the values / sliders for the selected
  // part"): a click on the router in the close-up picks a region (LR4RouterDims.regions / pick: the mesh's part, a
  // turned section by the height you click, the motor cap, dial, shaft lock, mount); it's lit (a see-through shell, or the mount's own glow),
  // only its numbers are drawn, and the inspector (router_inspect.js, Part 48b) shows all its settings. A click off the
  // router (or ✕) lets it go: the inspector shows the router itself. hose_bom.js's click calls rxClick first. ----
  function rxRegion() { return RX.sel && LR4RouterDims.regions(rxRouter()).find((g) => g.id === RX.sel); }
  function rxClick(hit) {                             // true: the close-up took the click
    if (typeof rbViewing !== "function" || !rbViewing()) return false;
    const f = RT.body && RT.body.f, P = hit && hit.point, ud = hit && hit.object && hit.object.userData;
    let id = null;
    if (f && P && ud) {
      const m = rxMesh(), L = m ? m.worldToLocal(P.clone()) : P;   // back into the router's own frame
      const c = Math.cos(f.a), s = Math.sin(f.a), dx = L.x - f.o[0], dy = L.y - f.o[1];
      id = LR4RouterDims.pick(rxRouter(), ud.rtPart || null, [dx * c + dy * s, -dx * s + dy * c, L.z - f.o[2]], ud.name);
    }
    rxPick(id);
    return !!id;
  }
  function rxValid(id) {                              // a region on the model, or any item of the outline (the flats, the vent)
    const r = rxRouter(), S = LR4RouterSchema;
    return !!r && id !== "router" && (LR4RouterDims.regions(r).some((g) => g.id === id) || (S.PARTS.some((P) => P.id === id) && S.partShown(id, r.model)));
  }
  function rxPick(id) {
    RX.sel = id && rxValid(id) ? id : null;
    if (RX.sel && typeof select === "function") select(null);   // not the part chip as well
    if (typeof rtiShow === "function") rtiShow();
    if (!rxBox.hidden) rxDraw(); else rxGhost();
  }
  function rxGhost() {                                // the picked part lit (and the mount faded)
    rxFade();
    const g = !rxBox.hidden && rxRegion(), f = RT.body && RT.body.f, sh = g && g.shape;
    // a part with a mesh of its own: a copy of it a little bigger (it hugs the real shape); the rest: a shell
    const own = g && sh && { motor_cap: "Router_MotorCap", dial: "Router_Dial", collet_nut: "Router_ColletNut", shaft_lock: "Router_ShaftLock",
      transition: "Router_Transition", collar: "Router_Collar", bearing_cap: "Router_BearingCap" }[g.id];
    const om = own && meshes.find((m) => m.userData.name === own && m.visible);
    const host = om || rxMesh(), key = sh && f && host ? JSON.stringify([sh, f.o, f.a, om ? om.geometry.uuid : ""]) : "";
    const litRe = g && !sh && g.id === "mount" ? /^Tool_Mount_/ : null;
    for (const m of RX.lit) if (m !== selected) m.material.emissive.setHex(0x000000);
    RX.lit = litRe ? meshes.filter((m) => m.visible && litRe.test(m.userData.name || "")) : [];
    for (const m of RX.lit) { m.material.emissive.set(css("--accent") || "#c8241b"); m.material.emissiveIntensity = 0.35; }
    if (key === RX.ghostKey) return;
    RX.ghostKey = key;
    if (RX.ghost) {
      RX.ghost.parent.remove(RX.ghost);
      if (!RX.ghost.userData.shared) RX.ghost.geometry.dispose();
      RX.ghost.material.dispose(); RX.ghost = null;
    }
    if (!key) return;
    const mat = new THREE.MeshBasicMaterial({ color: css("--accent") || "#c8241b", transparent: true, opacity: 0.28, depthWrite: false });
    if (om) {
      if (!om.geometry.boundingBox) om.geometry.computeBoundingBox();
      const bb = om.geometry.boundingBox, cen = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3());
      const k = 1 + 2.4 / Math.max(20, Math.min(size.x, size.y, size.z));   // ~1.2 mm proud
      RX.ghost = new THREE.Mesh(om.geometry, mat);
      RX.ghost.userData.shared = true;
      RX.ghost.scale.setScalar(k);
      RX.ghost.position.copy(cen).multiplyScalar(1 - k);   // grown about its own center
      RX.ghost.renderOrder = 5;
      RX.ghost.raycast = () => {};
      om.add(RX.ghost);
      return;
    }
    const c = Math.cos(f.a), s = Math.sin(f.a), rot = (v) => new THREE.Vector3(v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]);
    let geo, at;
    if (sh.cyl) {                                     // 1.2 mm proud all round, so it shows over the part
      const q = sh.cyl, r = q.d / 2 + 1.2;
      geo = new THREE.CylinderGeometry(r, r, q.l + 2, 64);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rot(q.axis).normalize()));
      at = rxRef(q.c);
    } else {
      const [x0, x1, y0, y1, z0, z1] = sh.box;
      geo = new THREE.BoxGeometry(x1 - x0 + 2.4, y1 - y0 + 2.4, z1 - z0 + 2.4);
      geo.rotateZ(f.a);
      at = rxRef([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
    }
    RX.ghost = new THREE.Mesh(geo, mat);
    RX.ghost.position.copy(at);
    RX.ghost.renderOrder = 5;
    RX.ghost.raycast = () => {};                     // never picked
    host.add(RX.ghost);                               // in the router's frame: it follows the machine's pose
  }
