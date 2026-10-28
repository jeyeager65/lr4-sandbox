// lr4-sandbox page: the router + its speed dial (Part 45a, user 2026-10-27; LR4Routers in js/routers.js). The page's
// scripts share one global scope. RT: machine.js.
  // ---- which router (Run > Router), its dial on the model: drag it (up / right = faster), click = the next whole
  // number, the mouse wheel = half steps; a big readout while it turns. A manual router's dial sets the speed (sound,
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
    if (RT.set.router !== was.router) RT.noted = null;   // a note again for the new router
    rtSave();
    rtLook();
    if (why) rtReadout();
    return RT.set;
  }
  // the dial wheel's look (user's photos 2026-10-28: the Makita's and the Kobalt's are the same style): rounded ridges
  // all round its edge, white numbers 1..6 on flat lands DIAL_STEP deg apart (number d at the texture's u 0.25 +
  // (d - 1) x step / 360). RING: ridge pitch (8 to a step, so every land sits on the same phase), land half-width,
  // ridge height (mm). RING_COLOR: the wheel + its groove bottoms per router (Kobalt black, Makita red; others GUESS black)
  const RING = { pitch: LR4Routers.DIAL_STEP / 8, land: 9, rise: 0.45 };
  const RING_COLOR = { makita: ["#c8322b", "#8e1f1a"], other: ["#202022", "#0b0b0c"] };
  const ringColor = (id) => RING_COLOR[id] || RING_COLOR.other;
  const ringTheta = (d) => 90 + (d - LR4Routers.DIAL[0]) * LR4Routers.DIAL_STEP;   // deg round the cylinder (u x 360)
  function ringLand(deg) {                           // on a number's land: |deg - its centre| < RING.land
    const D = LR4Routers.DIAL;
    for (let d = D[0]; d <= D[1]; d++) { const k = Math.abs((((deg - ringTheta(d)) % 360) + 540) % 360 - 180); if (k < RING.land) return true; }
    return false;
  }
  // radius out from the wheel at deg: lands flush with the ridge tops, grooves down to the wheel's own radius
  const ringRise = (deg) => ringLand(deg) ? RING.rise : RING.rise * Math.pow(Math.abs(Math.cos(Math.PI * (deg - ringTheta(1)) / RING.pitch)), 0.5);
  function rtRingGeo(r, h) {
    const geo = new THREE.CylinderGeometry(r, r, h, 720, 1, true), p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const th = uv.getX(i) * 2 * Math.PI, R = r + ringRise(uv.getX(i) * 360);
      p.setX(i, R * Math.sin(th)); p.setZ(i, R * Math.cos(th));
    }
    geo.computeVertexNormals();
    return geo.rotateX(Math.PI / 2);
  }
  function rtRingTex(col) {
    const c = document.createElement("canvas"), W = 2048, H = 96, g = c.getContext("2d");
    c.width = W; c.height = H;
    g.fillStyle = col[0]; g.fillRect(0, 0, W, H);
    g.fillStyle = col[1];                            // the groove bottoms a little darker
    for (let deg = ringTheta(1) + RING.pitch / 2 - 360; deg < 360; deg += RING.pitch) {
      const x = ((deg % 360) + 360) % 360 / 360 * W;
      if (!ringLand(deg)) g.fillRect(x - 3, 0, 6, H);
    }
    const D = LR4Routers.DIAL;
    g.fillStyle = "#f4f4f4"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 50px sans-serif";
    for (let d = D[0]; d <= D[1]; d++) g.fillText(String(d), ringTheta(d) / 360 * W, H / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // the ring on the Router_Dial mesh (made once per rebuild), turned to the dial; Run's row
  function rtLook() {
    const dm = meshes.find((m) => m.userData.name === "Router_Dial"), rb = meshes.find((m) => m.userData.name === "Router_Bit");
    if (dm && rb) {
      let ring = dm.userData.ring;
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
      const col = ringColor(RT.set.router), key = col.join();   // one texture per color, kept
      RT.texs = RT.texs || {};
      if (!RT.texs[key]) RT.texs[key] = rtRingTex(col);
      if (ring.material.map !== RT.texs[key]) { ring.material.map = RT.texs[key]; ring.material.needsUpdate = true; }
    }
    const sel = $("rt-router"), man = LR4Routers.manual(RT.set.router);
    if (!sel.options.length) for (const [k, r] of Object.entries(LR4Routers.ROUTERS)) sel.add(new Option(r.name, k));
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
    let drag = null, hover = false;
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
      if (LR4Routers.manual(RT.set.router)) rtSet({ dial: Math.round((RT.set.dial + (e.deltaY < 0 ? 0.5 : -0.5)) * 2) / 2 }, "wheel");
      else rtReadout();
    }, { capture: true, passive: false });
    $("rt-router").addEventListener("change", (e) => rtSet({ router: e.target.value }));
    $("rt-dial").addEventListener("input", (e) => rtSet({ dial: Number(e.target.value) }, "drag"));
  }
  rtLook();                                          // a model built before this file loaded (rebuild calls it after)
  // tests / videos: the settings, set them, the dial's ring turn (rad) + where the dial is on screen (client px)
  window.LR4Router = { state: () => Object.assign({}, RT.set), set: (o) => rtSet(o || {}),
    ring() { const dm = meshes.find((m) => m.userData.name === "Router_Dial"); return dm && dm.userData.ring ? +dm.userData.ring.rotation.z.toFixed(4) : null; },
    screen() { return LR4Power.screen("Router_Dial"); } };
