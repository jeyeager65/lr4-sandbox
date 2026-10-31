// lr4-sandbox page: Build your router on the model (user 2026-10-29: "measurements and clickable areas right on the
// model to adjust it. All these number fields isn't working well"). In the router's Close-up (router_build.js): the
// router's dimensions (LR4RouterDims) drawn on it, CAD style; click a number to type it, drag a ● handle to pull that
// end. Flat views (Side / Front / Top: a narrow lens, no orbiting) so they read like a drawing, or 3D. Every change
// goes through the builder's own input (its data-k), so the builder's rules - the motor cap on the turned part, overall
// = the stack + the cap - hold here too. The page's scripts share one global scope (RT, rbViewing: router*.js). ----
  const RX = { view: "front", drag: null, edit: null, fov: null, hover: null, sel: null, ghost: null, ghostKey: "", lit: [], slide: null };
  const RX_VIEWS = [["front", "Front"], ["right", "Right"], ["top", "Top"], ["3d", "3D"]];   // where you stand at the machine (user 2026-10-30)
  const RX_LENS = 8;                                  // the flat views' field of view (deg): near enough to a drawing
  const rxStage = document.querySelector(".stage");
  const rxBox = document.createElement("div");
  rxBox.className = "rbx"; rxBox.id = "rbx"; rxBox.hidden = true;
  rxBox.innerHTML = '<svg class="rbx-svg" aria-hidden="true"></svg><div class="rbx-views" id="rbx-views" role="group" aria-label="View">' +
    RX_VIEWS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join("") +
    '</div><div class="rbx-undo"><button type="button" data-undo="rb-undo" disabled title="Undo (Ctrl+Z)">↶</button>' +
    '<button type="button" data-undo="rb-redo" disabled title="Redo (Ctrl+Shift+Z)">↷</button>' +
    '<button type="button" id="rbx-tc" title="Watch a bit change on this router: the bit set in Run > On the table goes in">Change bit</button></div><p class="rbx-tip" id="rbx-tip">Click a part to edit it · click a number to type it · drag a ● to pull that end</p>' +
    '<div class="rbx-card" id="rbx-card" hidden></div>';
  rxStage.insertBefore(rxBox, document.getElementById("insp"));   // under Inspect's panels
  const rxSvg = rxBox.querySelector("svg");

  function rxRouter() { return LR4Routers.ROUTERS[RT.set.router]; }
  function rxDims() {
    const C = rtClamps(), all = LR4RouterDims.dims(rxRouter(), C ? C.def : null), v = RX.view === "3d" ? "front" : RX.view;
    return all.filter((d) => d.views.includes(v) && (!RX.sel || d.g === RX.sel));   // a part picked: just its own
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
    const W = canvas.clientWidth, H = canvas.clientHeight;
    rxGhost();
    rxCardSync();
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

  // a change: into the builder's input, as if typed there (its handler saves, rebuilds, keeps the rules)
  const rxInput = (d) => d.k && document.querySelector(`#rte input[data-k="${d.k}"]`);
  function rxSet(d, v) {
    const el = rxInput(d);
    if (!el || !Number.isFinite(v)) return;
    el.value = +(d.kind === "ang" ? v : Math.max(0, v)).toFixed(1);   // an angle may be negative (clockwise)
    el.dispatchEvent(new Event("input", { bubbles: true }));
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

  // the views: Front = from the machine's front (the router's -y side, +x to the right), Right = from its switch end, Top
  function rxLook(v) {
    RX.view = v;
    for (const b of rxBox.querySelectorAll(".rbx-views button")) b.setAttribute("aria-pressed", String(b.dataset.v === v));
    const f = RT.body && RT.body.f;
    if (!f || !INSPECT) return;
    const c = Math.cos(f.a), s = Math.sin(f.a), flat = v !== "3d";
    const dir = { front: [s, -c, 0.0001], right: [c, s, 0.0001], top: [s * 0.002, -c * 0.002, 1], "3d": [c * 0.8 + s, s * 0.8 - c, 0.7] }[v];
    if (RX.fov === null) RX.fov = camera.fov;
    camera.fov = flat ? RX_LENS : RX.fov;
    camera.updateProjectionMatrix();
    freeTurn(!flat);                                  // 3D: Inspect's free turn; flat: no orbiting (pan + zoom still)
    controls.enableRotate = !flat;
    fitView(dir);
    const ins = document.getElementById("insp");      // framed in the part of the view the right panels leave
    if (document.documentElement.classList.contains("rte-on")) { if (typeof capEditFit === "function") capEditFit(); }   // the router editor: the room between its panels
    else if (!ins.classList.contains("min")) {
      camera.updateMatrixWorld();
      const dist = camera.position.distanceTo(controls.target);
      const mm = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / canvas.clientHeight;
      const sh = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(((ins.offsetWidth + 12) / 2) * mm);
      camera.position.add(sh); controls.target.add(sh);
    }
    controls.update();
    rxDraw();
  }
  rxBox.querySelector(".rbx-views").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) rxLook(b.dataset.v);
  });

  // on with the Close-up (router_build.js rbViewMark), off when it ends
  function rxMark() {
    const on = typeof rbViewing === "function" && rbViewing();
    if (on === !rxBox.hidden) return;
    rxBox.hidden = !on;
    if (on) { rxLook(RX.view); rxDraw(); return; }
    RX.drag = RX.edit = null;
    rxPick(null);
    for (const el of [...rxBox.querySelectorAll("[data-x]")]) el.remove();
    if (RX.fov !== null) { camera.fov = RX.fov; RX.fov = null; camera.updateProjectionMatrix(); }
    controls.enableRotate = true;
  }

  // ---- a part picked (user 2026-10-29: "click and highlight each part and edit the values / sliders for the selected
  // part"): a click on the router in the close-up picks a region (LR4RouterDims.regions / pick: the mesh's part, a
  // turned section by the height you click, the motor cap, dial, shaft lock, mount); it's lit (a see-through shell, or the mount's own glow),
  // only its numbers are drawn, and a card shows a slider + a number for each of its sizes (and its options). A click
  // off the router (or ✕) lets it go. hose_bom.js's click calls rxClick first. ----
  const rxCard = document.getElementById("rbx-card");
  // a region's options: the builder's own button groups, mirrored in the card
  const RX_OPTS = { dial: [["rb-dialplace", "Dial"]], housing: [["rb-cooling", "Cooling"]] };
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
  function rxPick(id) {
    RX.sel = id && LR4RouterDims.regions(rxRouter()).some((g) => g.id === id) ? id : null;
    if (RX.sel && typeof select === "function") select(null);   // not the part chip as well
    rxCardBuild();
    if (!rxBox.hidden) rxDraw(); else rxGhost();
  }
  function rxGhost() {                                // the picked part lit
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
  // the card: one row per size (a size drawn in two views is one row)
  function rxCardDims() {
    const C = rtClamps(), seen = new Set();
    return LR4RouterDims.dims(rxRouter(), C ? C.def : null).filter((d) => {
      const k = d.k;
      if (d.g !== RX.sel || !k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  function rxRange(d) {                               // the slider's travel [min, max, step], fixed while the card is up
    if (d.kind === "ang") return [-180, 180, 1];
    if (d.kind === "rad" || d.kind === "ch") return [0, Math.max(20, Math.ceil(d.v * 2)), 0.5];
    if (d.kind === "dia") return [4, Math.max(120, Math.ceil(d.v * 1.5)), 0.5];
    return [0, Math.min(300, Math.max(60, Math.ceil(d.v * 2))), 0.5];
  }
  function rxCardBuild() {
    const g = !rxBox.hidden && rxRegion();
    rxCard.hidden = !g;
    rxCard.textContent = "";
    if (!g) return;
    const h = document.createElement("div");
    h.className = "rbx-card-h";
    h.innerHTML = '<strong></strong><button type="button" class="rbx-x" aria-label="Done with this part" title="Done (or click off the router)">✕</button>';
    h.querySelector("strong").textContent = g.label;
    rxCard.append(h);
    for (const d of rxCardDims()) {
      const [lo, hi, st] = rxRange(d), row = document.createElement("label"), u = d.kind === "ang" ? "°" : "mm";
      row.className = "rbx-row"; row.dataset.k = d.k;
      row.innerHTML = `<span></span><input type="range" min="${lo}" max="${hi}" step="${st}"><input type="number" step="any"><em>${u}</em>`;
      const short = d.label.toLowerCase().startsWith(g.label.toLowerCase() + " ") ? d.label.slice(g.label.length + 1) : d.label;
      row.querySelector("span").textContent = short.charAt(0).toUpperCase() + short.slice(1);
      for (const el of row.querySelectorAll("input")) { el.value = d.v; el.setAttribute("aria-label", d.label); }
      rxCard.append(row);
    }
    for (const [src, label] of RX_OPTS[g.id] || []) {   // its options: the builder's buttons, mirrored
      const o = document.createElement("div");
      o.className = "rbx-opt"; o.dataset.src = src;
      o.innerHTML = `<span>${label}</span>`;
      for (const b of document.querySelectorAll(`#${src} button`)) {
        const c = document.createElement("button");
        c.type = "button"; c.dataset.v = b.dataset.v; c.textContent = b.textContent;
        o.append(c);
      }
      rxCard.append(o);
    }
    if (g.id === "mount") {                           // which mount (None: no shoe, no clamp)
      const o = document.createElement("label");
      o.className = "rbx-row rbx-sel";
      o.innerHTML = "<span>Mount</span>";
      const sel = $("rb-mount").cloneNode(true);
      sel.removeAttribute("id"); sel.value = $("rb-mount").value;
      sel.addEventListener("change", () => { $("rb-mount").value = sel.value; $("rb-mount").dispatchEvent(new Event("change")); });
      o.append(sel);
      rxCard.append(o);
    }
  }
  function rxCardSync() {                             // the card's values from the router (not the one being moved)
    if (rxCard.hidden) return;
    if (!rxRegion()) return rxPick(null);             // the part's gone (the lock off, now a spindle)
    const cur = new Map(rxCardDims().map((d) => [d.k, d]));
    for (const row of rxCard.querySelectorAll(".rbx-row[data-k]")) {
      const d = cur.get(row.dataset.k);
      if (!d) continue;
      for (const el of row.querySelectorAll("input")) if (document.activeElement !== el && RX.slide !== el) el.value = d.v;
    }
    for (const o of rxCard.querySelectorAll(".rbx-opt")) {
      const on = document.querySelector(`#${o.dataset.src} button[aria-pressed="true"]`);
      for (const b of o.querySelectorAll("button")) b.setAttribute("aria-pressed", String(!!on && b.dataset.v === on.dataset.v));
    }
  }
  rxCard.addEventListener("input", (e) => {
    const row = e.target.closest(".rbx-row[data-k]");
    if (!row || (e.target.type === "number" && e.target.value === "")) return;
    const d = rxCardDims().find((q) => q.k === row.dataset.k);
    if (!d) return;
    const v = Number(e.target.value);
    for (const el of row.querySelectorAll("input")) if (el !== e.target) el.value = v;   // the slider + the number together
    RX.slide = e.target.type === "range" ? e.target : null;
    rxSet(d, v);
  });
  rxCard.addEventListener("change", () => { RX.slide = null; });
  rxCard.addEventListener("click", (e) => {
    if (e.target.closest(".rbx-x")) return rxPick(null);
    const b = e.target.closest(".rbx-opt button");
    if (!b) return;
    const src = document.querySelector(`#${b.closest(".rbx-opt").dataset.src} button[data-v="${b.dataset.v}"]`);
    if (src) src.click();
    rxDraw();
  });
