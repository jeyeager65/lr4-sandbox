// VR mode for the configurator: WebXR in three r147, PC VR through SteamVR / OpenXR (PS VR2, Index, Quest Link).
// Opt-in: the "Enter VR" button shows only when the browser offers immersive-vr (https or 127.0.0.1). One scene, two UIs:
// the in-world menu drives the page's own controls (units, size inputs, braces, part groups, Peter Plates, travel
// sliders), so the desktop page keeps the same state and leaving VR finds it as VR left it. While VR is on the desktop
// window drops its side panel for a popup card (body.vr-on, #vr-pop).
// The scene is mm with Z up; the headset is metres with Y up. The player rig (camera, controllers, floor grid) is turned
// +90 deg about X (rig Y -> world Z, rig -Z -> world +Y) and scaled: 1000 mm per metre = 1:1, more = the machine smaller.
// Things in the rig are in metres; things in the scene (handles, the tabletop stand, cards) are in mm.
// Controls:
//   trigger   press a menu / card button, grab a handle (red sphere = the core, diamond = the table corner), or point
//             at a part to open its card (name, Hide part, Hide group)
//   touch     put a controller into a part: its card opens (a buzz says which)
//   grip      hold one: drag the machine around; hold both: pull apart / together to zoom, twist to rotate;
//             a quick tap of the menu hand's grip shows / hides the menu
//   stick     left / right = snap turn; 1:1 - forward aims a teleport, let go to jump; tabletop - forward / back zooms
(function (root) {
  "use strict";
  const IN = 25.4;
  const CUT_MIN = 200, CUT_MAX = 4000;     // mm: the page's size inputs ignore anything outside this
  const BENCH = 760;                       // mm under the model at 1:1 when nothing marks the floor (userData.floor: the page's table legs)
  const STAND_H = 0.8, STAND_D = 0.95;     // m: tabletop stand height, its distance in front of the player
  const TABLE_FIT = 0.9;                   // m: the machine's longer side on the stand
  const S_MIN = 100, S_MAX = 40000;        // rig mm per metre: 10x life size .. 1:40
  const PRESETS = [[24, 48], [48, 48], [48, 96], [60, 120]];   // in
  const W = 512, H = 704;                  // menu canvas px
  const CW = 512, CH = 224;                // part card canvas px

  // ---- pure helpers (tests/test_vr.js) ----
  const snap = (v, step) => Math.round(v / step) * step;
  const clampCut = (mm) => Math.min(CUT_MAX, Math.max(CUT_MIN, mm));
  const clampS = (s) => Math.min(S_MAX, Math.max(S_MIN, s));
  const hit = (buttons, x, y) => buttons.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) || null;
  const tabletopScale = (longMm) => Math.max(1000, longMm / TABLE_FIT);   // rig mm per metre
  const fmtLen = (mm, unit) => unit === "in" ? String(+(mm / IN).toFixed(2)) : String(Math.round(mm));
  const fmtScale = (S) => Math.abs(S - 1000) < 5 ? "1:1" : S > 1000 ? `1:${(S / 1000).toFixed(1)}` : `${(1000 / S).toFixed(1)}:1`;

  // two-hand grab: the rig (yaw about Z, uniform scale, position) that puts the hands' rig-local points a, b (already
  // turned Z-up, metres) on the world points A, B (mm) they held when the grab started; { s, yaw, t: [x, y, z] }
  function twoHand(a, b, A, B) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], D = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const s = clampS(Math.hypot(...D) / Math.max(Math.hypot(...d), 1e-6));
    const yaw = Math.atan2(D[1], D[0]) - Math.atan2(d[1], d[0]);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], c = Math.cos(yaw), sn = Math.sin(yaw);
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    return { s, yaw, t: [M[0] - s * (c * m[0] - sn * m[1]), M[1] - s * (sn * m[0] + c * m[1]), M[2] - s * m[2]] };
  }

  // the menu: buttons (with what they do) and plain text, from a snapshot of the page state
  //   s = { unit, cutX, cutY (mm), braces: { label }, peter: [{ v, label, on }], groups: [{ id, label, on }], mode, hidden }
  function layout(s) {
    const B = [], T = [];
    const btn = (x, y, w, h, label, act, on) => B.push({ x, y, w, h, label, act, on: !!on, id: JSON.stringify(act) });
    const txt = (x, y, text, o) => T.push(Object.assign({ x, y, text }, o));
    const u = s.unit === "in" ? "in" : "mm";
    txt(16, 38, `LR4  ${fmtLen(s.cutX, u)} × ${fmtLen(s.cutY, u)} ${u}`, { big: true, maxW: 340 });
    btn(372, 8, 60, 42, "in", { a: "unit", u: "in" }, u === "in");
    btn(436, 8, 60, 42, "mm", { a: "unit", u: "mm" }, u === "mm");
    const steps = u === "in" ? [1, 6] : [25 / IN, 150 / IN];          // in (mm unit: 25 / 150 mm)
    const stepLabel = (k) => u === "in" ? String(k) : String(Math.round(k * IN));
    [["x", "Cut X", s.cutX], ["y", "Cut Y", s.cutY]].forEach(([axis, name, mm], i) => {
      const y = 60 + i * 60;
      txt(16, y + 34, name);
      btn(104, y, 64, 50, "−" + stepLabel(steps[1]), { a: "cut", axis, d: -steps[1] });
      btn(172, y, 56, 50, "−" + stepLabel(steps[0]), { a: "cut", axis, d: -steps[0] });
      txt(282, y + 34, fmtLen(mm, u), { center: true, mono: true });
      btn(336, y, 56, 50, "+" + stepLabel(steps[0]), { a: "cut", axis, d: steps[0] });
      btn(396, y, 64, 50, "+" + stepLabel(steps[1]), { a: "cut", axis, d: steps[1] });
    });
    PRESETS.forEach(([x, y], i) => btn(16 + i * 122, 184, 116, 46, `${x}×${y}`, { a: "preset", x, y },
      Math.abs(s.cutX - x * IN) < 1 && Math.abs(s.cutY - y * IN) < 1));
    txt(16, 280, "Braces");
    btn(104, 246, 56, 50, "−", { a: "braces", d: -1 }); btn(404, 246, 56, 50, "+", { a: "braces", d: 1 });
    txt(282, 280, s.braces.label.replace(/,.*$/, ""), { center: true, maxW: 232 });
    if (s.peter.length) {
      txt(16, 340, "Peter");
      const w = Math.floor((480 - 104) / s.peter.length) - 4;
      s.peter.forEach((p, i) => btn(104 + i * (w + 4), 308, w, 46, p.label, { a: "peter", v: p.v }, p.on));
    }
    s.groups.slice(0, 10).forEach((g, i) => btn(16 + (i % 2) * 242, 370 + Math.floor(i / 2) * 50, 236, 44, g.label,
      { a: "group", id: g.id }, g.on));
    B.forEach((b) => (b.toggle = b.act.a === "group"));   // on / off chips, not a choice
    btn(16, 634, 116, 54, s.mode === "table" ? "Tabletop" : "1:1", { a: "mode" }, s.mode === "table");
    btn(136, 634, 116, 54, "Re-center", { a: "recenter" });
    btn(256, 634, 116, 54, `Unhide ${s.hidden || 0}`, { a: "unhide" });
    B[B.length - 1].dim = !s.hidden;
    btn(376, 634, 120, 54, "Exit VR", { a: "exit" });
    return { buttons: B, texts: T };
  }

  // a part's card: { title, sub } + Hide part / Hide group / Close
  function cardLayout(info) {
    const B = [], T = [{ x: 24, y: 58, text: info.title, big: true, maxW: 464 }, { x: 24, y: 104, text: info.sub || "", maxW: 464 }];
    const btn = (x, w, label, act) => B.push({ x, y: 146, w, h: 62, label, act, id: JSON.stringify(act) });
    btn(16, 164, "Hide part", { a: "hide" });
    btn(186, 186, info.group ? "Hide group" : "—", { a: "hidegroup" });
    btn(378, 118, "Close", { a: "close" });
    if (!info.group) B[1].dim = true;
    return { buttons: B, texts: T };
  }

  // ---- the page side: api = { THREE, scene, renderer, camera, controls, meshes(), select(mesh | null), background(),
  //      resize(), hidePart(mesh), showHidden(), hiddenCount(), groupLabel(key) } ----
  function setup(api) {
    const THREE = api.THREE, { scene, renderer, camera, controls } = api, xr = renderer.xr;
    const $ = (id) => document.getElementById(id);
    const button = $("v-vr"), pop = $("vr-pop");
    if ($("vr-exit")) $("vr-exit").addEventListener("click", () => act({ a: "exit" }));
    for (const u of ["in", "mm"]) if ($("vr-u-" + u)) $("vr-u-" + u).addEventListener("click", () => act({ a: "unit", u }));
    xr.enabled = true;
    xr.setReferenceSpaceType("local-floor");

    const BASE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const ZUP = new THREE.Vector3(0, 0, 1);
    const rig = new THREE.Group();
    rig.name = "vr-rig";
    const grid = new THREE.GridHelper(20, 40, 0x6d747b, 0x3b4148);          // rig: the physical floor, metres
    rig.add(grid);

    // scene helpers (mm): handles, teleport marker, the size outline, the stand, a size tag and the part card
    const handleMat = () => new THREE.MeshBasicMaterial({ color: 0xc8241b, transparent: true, opacity: 0.85, depthTest: false });
    const coreH = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), handleMat());
    const cornerH = new THREE.Mesh(new THREE.OctahedronGeometry(1.25), handleMat());
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: 0x4fc3f7, side: THREE.DoubleSide }));
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3].map(() => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0xffd54f, depthTest: false }));
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, STAND_H, 48),     // metres, scaled to mm by place()
      new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.85 }));
    stand.rotation.x = Math.PI / 2;
    const tag = canvasPlane(512, 128), card = canvasPlane(CW, CH);
    for (const o of [coreH, cornerH, outline, tag.mesh]) o.renderOrder = 999;
    card.mesh.renderOrder = 1001;
    const helpers = new THREE.Group();
    helpers.add(coreH, cornerH, marker, outline, stand, tag.mesh, card.mesh);
    helpers.visible = false;
    marker.visible = outline.visible = tag.mesh.visible = card.mesh.visible = false;

    function canvasPlane(w, h) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, h / w),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
      return { c, g: c.getContext("2d"), tex, mesh, w, h, lay: { buttons: [], texts: [] } };
    }

    // the menu: a tablet on the menu hand's grip, 0.2 m wide, tilted to face the player
    const menu = canvasPlane(W, H);
    menu.mesh.scale.setScalar(0.2);
    menu.mesh.position.set(0, 0.07, 0.02);
    menu.mesh.rotation.x = -0.6;
    menu.mesh.renderOrder = 1000;
    let hover = null, menuDirty = true, menuAt = 0, cardPart = null, cardHover = null;

    let active = false, mode = "one", S = 1000, saved = null, lastMeshes = null, wgrab = null;
    const ray = new THREE.Raycaster(), tmpM = new THREE.Matrix4(), v1 = new THREE.Vector3();

    // ---- controllers: a pointer line each, a small body on the grip ----
    const ctrls = [0, 1].map((i) => {
      const c = xr.getController(i), grip = xr.getControllerGrip(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
      line.scale.z = 3;
      c.add(line);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.6 }));
      body.position.z = 0.03;
      grip.add(body);
      rig.add(c, grip);
      const st = { c, grip, line, src: null, grab: null, turned: false, aim: null, squeeze: null, touching: null, touchAt: 0 };
      c.addEventListener("connected", (e) => { st.src = e.data; placeMenu(); });
      c.addEventListener("disconnected", () => { st.src = null; st.squeeze = null; placeMenu(); regrab(); });
      c.addEventListener("selectstart", () => press(st));
      c.addEventListener("selectend", () => release(st));
      c.addEventListener("squeezestart", () => { st.squeeze = { t: performance.now(), p: local(st) }; regrab(); });
      c.addEventListener("squeezeend", () => {
        const q = st.squeeze;
        st.squeeze = null;
        regrab();
        if (q && st === menuHand() && performance.now() - q.t < 300 && q.p.distanceTo(local(st)) < 0.03)
          menu.mesh.visible = !menu.mesh.visible;      // a tap, not a drag
      });
      return st;
    });
    const menuHand = () => ctrls.find((s) => s.src && s.src.handedness === "left") || ctrls.find((s) => s.src) || ctrls[0];
    function placeMenu() { menuHand().grip.add(menu.mesh); }
    placeMenu();
    const local = (st) => new THREE.Vector3().setFromMatrixPosition(st.c.matrix);          // rig metres (the pose)
    const world = (st) => st.c.getWorldPosition(new THREE.Vector3());                       // scene mm

    // ---- page state through its own controls ----
    const unit = () => ($("u-in") && $("u-in").getAttribute("aria-pressed") === "false" ? "mm" : "in");
    const cut = () => ["cut-x", "cut-y"].map((id) => parseFloat($(id).value) * (unit() === "in" ? IN : 1));
    function setCut(xmm, ymm) {
      [["cut-x", clampCut(xmm)], ["cut-y", clampCut(ymm)]].forEach(([id, mm]) => {
        $(id).value = unit() === "in" ? +(mm / IN).toFixed(3) : +mm.toFixed(1);
        $(id).dispatchEvent(new Event("input"));
      });
      menuDirty = true;
    }
    function state() {
      const sel = $("braces"), opt = sel.options[sel.selectedIndex];
      const pv = $("peter-variant");
      const peter = pv && !pv.hidden ? [...pv.querySelectorAll("button")].map((b) => ({ v: b.dataset.v, label: b.textContent,
        on: b.getAttribute("aria-pressed") === "true" })) : [];
      const groups = [...document.querySelectorAll("#groups > label")].filter((l) => !l.hidden).map((l) => ({
        id: l.querySelector("input").id, label: l.querySelector("span").textContent, on: l.querySelector("input").checked }));
      const [cutX, cutY] = cut();
      return { unit: unit(), cutX, cutY, mode: mode === "table" ? "table" : "one", peter, groups, hidden: api.hiddenCount(),
        braces: { label: opt ? opt.textContent : "" } };
    }
    function act(a) {
      if (a.a === "cut") { const [x, y] = cut(); setCut(x + (a.axis === "x" ? a.d * IN : 0), y + (a.axis === "y" ? a.d * IN : 0)); }
      else if (a.a === "preset") setCut(a.x * IN, a.y * IN);
      else if (a.a === "unit") $(a.u === "mm" ? "u-mm" : "u-in").click();
      else if (a.a === "braces") {
        const sel = $("braces"), i = Math.min(sel.options.length - 1, Math.max(0, sel.selectedIndex + a.d));
        if (i !== sel.selectedIndex) { sel.selectedIndex = i; sel.dispatchEvent(new Event("change")); }
      } else if (a.a === "peter") { const b = $("peter-variant").querySelector(`button[data-v="${a.v}"]`); if (b) b.click(); }
      else if (a.a === "group") $(a.id).click();
      else if (a.a === "mode") { mode = mode === "table" ? "one" : "table"; place(true); }
      else if (a.a === "recenter") place(true);
      else if (a.a === "unhide") api.showHidden();
      else if (a.a === "hide") { if (cardPart) api.hidePart(cardPart); closeCard(); }
      else if (a.a === "hidegroup") {
        const g = cardPart && $("g-" + cardPart.userData.group);
        if (g && g.checked) g.click();
        closeCard();
      } else if (a.a === "close") closeCard();
      else if (a.a === "exit") { const s = xr.getSession(); if (s) s.end(); else leave(); }
      menuDirty = true;
    }

    function drawPanel(p, lay, hov) {
      const g = p.g;
      p.lay = lay;
      g.clearRect(0, 0, p.w, p.h);
      g.fillStyle = "rgba(28,32,36,0.94)";
      g.beginPath(); g.roundRect ? g.roundRect(0, 0, p.w, p.h, 24) : g.rect(0, 0, p.w, p.h); g.fill();
      g.textBaseline = "alphabetic";
      for (const b of lay.buttons) {
        g.fillStyle = b.id === hov && !b.dim ? "#4a525b" : b.toggle ? (b.on ? "#3a4148" : "#24292e") : b.on ? "#c8241b" : "#2e343a";
        g.fillRect(b.x, b.y, b.w, b.h);
        if (b.toggle && b.on) { g.fillStyle = "#c8241b"; g.fillRect(b.x, b.y, 6, b.h); }
        g.fillStyle = (b.toggle && !b.on) || b.dim ? "#7d868f" : "#e6e9ec";
        g.font = "600 24px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif";
        g.textAlign = "center";
        g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 8, b.w - 8);
      }
      for (const t of lay.texts) {
        g.fillStyle = t.big ? "#ffffff" : "#c3cad1";
        g.font = t.big ? "700 34px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif"
          : t.mono ? "500 26px 'IBM Plex Mono', Consolas, monospace" : "500 24px 'Barlow', sans-serif";
        g.textAlign = t.center ? "center" : "left";
        g.fillText(t.text, t.x, t.y, t.maxW || p.w - 32);
      }
      p.tex.needsUpdate = true;
    }
    function drawMenu() {
      const st = state();
      drawPanel(menu, layout(st), hover);
      for (const u of ["in", "mm"]) if ($("vr-u-" + u)) $("vr-u-" + u).setAttribute("aria-pressed", String(st.unit === u));
      if ($("vr-size")) $("vr-size").textContent = `${fmtLen(st.cutX, st.unit)} × ${fmtLen(st.cutY, st.unit)} ${st.unit} · ` +
        `${st.braces.label.replace(/,.*$/, "")} · ${st.mode === "table" ? "tabletop " : ""}${fmtScale(S)}`;
      menuDirty = false;
      menuAt = performance.now();
    }

    function drawTag(title, sub) {
      const g = tag.g;
      g.clearRect(0, 0, 512, 128);
      g.fillStyle = "rgba(28,32,36,0.9)"; g.fillRect(0, 0, 512, 128);
      g.fillStyle = "#c8241b"; g.fillRect(0, 0, 8, 128);
      g.textAlign = "left"; g.fillStyle = "#ffffff";
      g.font = "700 40px 'Barlow Semi Condensed', 'Arial Narrow', sans-serif";
      g.fillText(title, 24, 56, 472);
      g.fillStyle = "#c3cad1"; g.font = "500 26px 'Barlow', sans-serif";
      g.fillText(sub || "", 24, 100, 472);
      tag.tex.needsUpdate = true;
    }

    // ---- the part card: opened by touching a part or pointing at it with the trigger ----
    const partInfo = (m) => {
      const p = m.userData;
      return { title: p.label || p.name, group: p.group, sub: [p.source === "printed" ? "Printed part" : p.source === "made"
        ? "Cut part" : "Hardware", api.groupLabel(p.group)].filter(Boolean).join(" · ") };
    };
    function openCard(m, at) {
      cardPart = m;
      api.select(m);
      card.at = at.clone();
      drawPanel(card, cardLayout(partInfo(m)), null);
      card.mesh.visible = true;
      if ($("vr-pick")) $("vr-pick").textContent = "Part: " + partInfo(m).title;
    }
    function closeCard() {
      cardPart = null;
      card.mesh.visible = false;
      api.select(null);
      for (const st of ctrls) st.touching = null;
      if ($("vr-pick")) $("vr-pick").textContent = "Touch a part, or point at it and pull the trigger, to see what it is.";
    }
    function billboard(o, at, k, min) {                  // faces the player, the same apparent size at any distance
      const h = head(), d = h.distanceTo(at);
      o.position.copy(at).lerp(h, 0.08);
      o.scale.setScalar(Math.max(d * k, min));
      o.up.set(0, 0, 1);
      o.lookAt(h);
    }

    // touch: the smallest visible part whose box holds the controller tip, confirmed by short rays (near its surface,
    // or inside it: every ray hits)
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
    const box = new THREE.Box3();
    function touched(p) {
      const r = 0.015 * S, found = [];
      for (const m of api.meshes()) {
        if (!m.visible || !m.geometry) continue;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld).expandByScalar(r);
        if (!box.containsPoint(p)) continue;
        const s = box.getSize(v1);
        found.push([s.x * s.y * s.z, m]);
      }
      found.sort((x, y) => x[0] - y[0]);
      for (const [, m] of found.slice(0, 4)) {
        const side = m.material.side;
        m.material.side = THREE.DoubleSide;             // raycasts skip back faces: from inside a part they'd miss
        let hits = 0, near = false;
        for (const d of DIRS) {
          ray.set(p, d);
          const h = ray.intersectObject(m, false)[0];
          if (h) { hits++; if (h.distance < r) near = true; }
        }
        m.material.side = side;
        if (near || hits === DIRS.length) return m;
      }
      return null;
    }

    // ---- placing the player ----
    function boxOf(filter) {
      const b = new THREE.Box3();
      for (const m of api.meshes()) if (m.visible && filter(m)) { m.updateMatrixWorld(); b.expandByObject(m); }
      return b;
    }
    const modelBox = () => boxOf((m) => m.userData.motion !== "hose");
    function setS(s) { S = clampS(s); rig.scale.setScalar(S); }
    function place(reset) {
      const b = modelBox();
      if (b.isEmpty()) return;
      const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
      grid.visible = !(api.scenery && api.scenery(mode !== "table"));   // the workshop's floor replaces the grid at 1:1
      if (mode === "table") {
        if (reset) { rig.quaternion.copy(BASE); setS(tabletopScale(Math.max(size.x, size.y))); }
        const off = new THREE.Vector3(0, STAND_H, -STAND_D).multiplyScalar(S).applyQuaternion(rig.quaternion);
        rig.position.set(c.x, c.y, b.min.z).sub(off);
        stand.scale.setScalar(S);                       // the stand belongs to the model: it moves and zooms with it
        stand.position.set(c.x, c.y, b.min.z - STAND_H * S / 2);
      } else {
        const legs = api.meshes().filter((m) => m.userData.floor);
        const floor = legs.length ? Math.min(...legs.map((m) => new THREE.Box3().setFromObject(m).min.z)) : b.min.z - BENCH;
        if (reset) {
          rig.quaternion.copy(BASE);
          setS(1000);
          const rm = api.room && api.room();             // start inside the workshop's walls
          rig.position.set(c.x, rm ? Math.max(b.min.y - 900, rm.y0 + 350) : b.min.y - 900, floor);
        } else if (Math.abs(S - 1000) < 5) rig.position.z = floor;   // rebuilt (size, table height): feet stay on the floor
      }
      stand.visible = mode === "table";
      menuDirty = true;
    }
    const head = () => camera.getWorldPosition(new THREE.Vector3());
    function turnAbout(p, angle) {
      const q = new THREE.Quaternion().setFromAxisAngle(ZUP, angle);
      rig.position.sub(p).applyQuaternion(q).add(p);
      rig.quaternion.premultiply(q);
    }
    function zoomAbout(p, k) {                        // the world point p stays where it is
      const s0 = S;
      setS(S * k);
      rig.position.sub(p).multiplyScalar(S / s0).add(p);
    }
    const pivot = () => mode === "table" ? modelBox().getCenter(new THREE.Vector3()) : head();

    // grab the world with the grips: anchors are the world points the hands held when the set of hands changed
    function regrab() {
      const hands = ctrls.filter((s) => s.squeeze && s.src);
      wgrab = hands.length ? { hands, A: hands.map(world) } : null;
    }
    function applyGrab() {
      const g = wgrab;
      if (g.hands.length === 1) { rig.position.add(g.A[0].clone().sub(world(g.hands[0]))); return; }
      const [a, b] = g.hands.map((st) => local(st).applyQuaternion(BASE));
      const r = twoHand(a.toArray(), b.toArray(), g.A[0].toArray(), g.A[1].toArray());
      setS(r.s);
      rig.quaternion.setFromAxisAngle(ZUP, r.yaw).multiply(BASE);
      rig.position.fromArray(r.t);
    }

    // ---- pointing ----
    function aim(st) {
      st.c.updateMatrixWorld();
      ray.ray.origin.setFromMatrixPosition(st.c.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM.extractRotation(st.c.matrixWorld)).normalize();
      return ray;
    }
    function panelHit(st) {                            // the menu (not from its own hand when the other hand is there) or the card
      const ps = [];
      if (menu.mesh.visible && !(st === menuHand() && ctrls.some((o) => o !== st && o.src))) ps.push(menu);
      if (card.mesh.visible) ps.push(card);
      if (!ps.length) return null;
      const h = aim(st).intersectObjects(ps.map((p) => p.mesh), false)[0];
      if (!h || !h.uv) return null;
      const p = ps.find((q) => q.mesh === h.object), b = hit(p.lay.buttons, h.uv.x * p.w, (1 - h.uv.y) * p.h);
      return { p, b: b && !b.dim ? b : null, d: h.distance };
    }
    function handleHit(st) {
      const h = aim(st).intersectObjects([coreH, cornerH].filter((o) => o.visible), false)[0];
      return h ? { o: h.object, d: h.distance } : null;
    }
    const pulse = (st, k = 0.4) => { try { st.src.gamepad.hapticActuators[0].pulse(k, 25); } catch (e) { /* no haptics */ } };
    const sx = $("sx"), sy = $("sy"), sz = $("sz");
    function press(st) {
      if (!active || st.grab) return;
      const ph = panelHit(st);
      if (ph) { if (ph.b) { pulse(st); act(ph.b.act); } return; }
      const hh = handleHit(st);
      if (hh) {
        pulse(st);
        const p0 = world(st);
        st.grab = hh.o === coreH ? { kind: "core", p0, s0: [+sx.value, +sy.value, +sz.value] }
          : { kind: "corner", p0, cut0: cut(), at0: cornerH.position.clone(), min: boxOf((m) => m.userData.group === "Table").min, next: cut() };
        return;
      }
      const h = aim(st).intersectObjects(api.meshes().filter((m) => m.visible), false)[0];
      if (h) openCard(h.object, h.point); else closeCard();
    }
    function release(st) {
      const g = st.grab;
      st.grab = null;
      if (!g || g.kind !== "corner") return;
      outline.visible = false;
      tag.mesh.visible = false;
      if (Math.abs(g.next[0] - g.cut0[0]) > 1 || Math.abs(g.next[1] - g.cut0[1]) > 1) setCut(g.next[0], g.next[1]);
    }
    function drag(st) {
      const g = st.grab, d = world(st).sub(g.p0);    // world mm = model mm
      if (g.kind === "core") {
        sx.value = g.s0[0] + d.x / IN; sy.value = g.s0[1] + d.y / IN; sz.value = g.s0[2] + d.z;
        sx.dispatchEvent(new Event("input"));
        return;
      }
      g.next = [clampCut(snap(g.cut0[0] + d.x, IN / 2)), clampCut(snap(g.cut0[1] + d.y, IN / 2))];
      const dx = g.next[0] - g.cut0[0], dy = g.next[1] - g.cut0[1], z = g.at0.z, p = outline.geometry.attributes.position;
      cornerH.position.set(g.at0.x + dx, g.at0.y + dy, z);
      [[g.min.x, g.min.y], [g.at0.x + dx, g.min.y], [g.at0.x + dx, g.at0.y + dy], [g.min.x, g.at0.y + dy]]
        .forEach(([x, y], i) => p.setXYZ(i, x, y, z));
      p.needsUpdate = true;
      outline.geometry.computeBoundingSphere();
      outline.visible = true;
      drawTag(`${fmtLen(g.next[0], unit())} × ${fmtLen(g.next[1], unit())} ${unit()}`, "Let go to rebuild at this size");
      tag.at = cornerH.position.clone();
      tag.mesh.visible = true;
    }

    // ---- per frame (the page's tick calls this instead of OrbitControls while VR is on) ----
    function tick(dt) {
      const ms = api.meshes(), now = performance.now();
      if (ms !== lastMeshes) {                         // rebuilt: the old parts are gone; tabletop stays on its stand
        if (lastMeshes) place(false);
        lastMeshes = ms; closeCard(); menuDirty = true;
      }
      if (cardPart && !cardPart.visible) closeCard();
      if (wgrab) { applyGrab(); menuDirty = true; }
      rig.updateMatrixWorld();
      const r = 0.03 * S;                              // handles ~3 cm across in the hand, whatever the scale
      const core = boxOf((m) => m.userData.motion === "core");
      coreH.visible = !core.isEmpty();
      if (coreH.visible) coreH.position.set((core.min.x + core.max.x) / 2, (core.min.y + core.max.y) / 2, core.max.z + r * 2);
      coreH.scale.setScalar(r);
      if (!ctrls.some((s) => s.grab && s.grab.kind === "corner")) {
        const t = boxOf((m) => m.userData.group === "Table");
        cornerH.visible = !t.isEmpty();
        cornerH.position.set(t.max.x, t.max.y, t.max.z + r * 2);
      }
      cornerH.scale.setScalar(r);
      marker.scale.setScalar(0.25 * S);
      let hov = null, chov = null;
      const hovH = new Set(ctrls.filter((s) => s.grab).map((s) => (s.grab.kind === "core" ? coreH : cornerH)));
      for (const st of ctrls) {
        if (!st.src) { st.line.visible = false; continue; }
        st.line.visible = true;
        let len = 3;
        if (st.grab) drag(st);
        const ph = panelHit(st), hh = !ph && handleHit(st);
        if (ph) { len = ph.d / S; if (ph.b) { if (ph.p === menu) hov = ph.b.id; else chov = ph.b.id; } }
        else if (hh) { len = hh.d / S; hovH.add(hh.o); }
        if (!st.grab && !st.squeeze && now - st.touchAt > 100) {          // touch, 10 times a second
          st.touchAt = now;
          const tip = world(st), m = touched(tip);
          if (m && m !== st.touching && m !== cardPart) { pulse(st, 0.6); openCard(m, tip); }
          st.touching = m;
        }
        const gp = st.src.gamepad, ax = gp && gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : gp ? [gp.axes[0] || 0, gp.axes[1] || 0] : [0, 0];
        if (Math.abs(ax[0]) > 0.7 && !st.turned) { turnAbout(pivot(), ax[0] > 0 ? -Math.PI / 6 : Math.PI / 6); st.turned = true; }
        if (Math.abs(ax[0]) < 0.3) st.turned = false;
        if (mode === "table") {
          if (Math.abs(ax[1]) > 0.2) { zoomAbout(pivot(), Math.exp(ax[1] * dt * 1.2)); menuDirty = true; }
        } else if (ax[1] < -0.6) {                     // aim a teleport at the floor (the rig's y = 0)
          const t = aim(st).ray.intersectPlane(new THREE.Plane(ZUP, -rig.position.z - 1), new THREE.Vector3());
          st.aim = t && t.distanceTo(head()) < 15 * S ? t : null;
          if (st.aim) { marker.position.copy(st.aim); len = ray.ray.origin.distanceTo(st.aim) / S; }
        } else if (Math.abs(ax[1]) < 0.3 && st.aim) {   // let go: jump so the head lands over the mark
          const h = head();
          rig.position.x += st.aim.x - h.x; rig.position.y += st.aim.y - h.y;
          st.aim = null;
        }
        st.line.scale.z = len;
      }
      marker.visible = ctrls.some((s) => s.aim);
      for (const o of [coreH, cornerH]) o.material.opacity = hovH.has(o) ? 1 : 0.7;
      if (hov !== hover) { hover = hov; menuDirty = true; }
      if (menuDirty && now - menuAt > 100 || now - menuAt > 1000) drawMenu();
      if (chov !== cardHover && cardPart) { cardHover = chov; drawPanel(card, cardLayout(partInfo(cardPart)), chov); }
      if (tag.mesh.visible && tag.at) billboard(tag.mesh, tag.at, 0.28, 60);
      if (card.mesh.visible && card.at) billboard(card.mesh, card.at, 0.32, 60);
    }

    // ---- entering / leaving ----
    function begin() {
      saved = { p: camera.position.clone(), q: camera.quaternion.clone(), near: camera.near, far: camera.far, fov: camera.fov,
        bg: scene.background };
      active = true;
      controls.enabled = false;
      scene.add(rig, helpers);
      rig.add(camera);
      camera.position.set(0, 1.6, 0);
      camera.quaternion.identity();
      camera.near = 0.02; camera.far = 200;             // metres: the rig carries the mm scale
      camera.updateProjectionMatrix();
      scene.background = new THREE.Color(0x1d2125);
      helpers.visible = true;
      document.body.classList.add("vr-on");          // the desktop window: no side panel, a popup card instead
      if (pop) pop.hidden = false;
      lastMeshes = api.meshes();
      place(true);
      closeCard();
      drawMenu();
      if (button) button.textContent = "Exit VR";
    }
    function leave() {
      if (!active) return;
      active = false;
      for (const st of ctrls) { st.grab = null; st.aim = null; st.squeeze = null; }
      wgrab = null;
      closeCard();
      rig.remove(camera);
      scene.remove(rig, helpers);
      camera.position.copy(saved.p); camera.quaternion.copy(saved.q);
      camera.near = saved.near; camera.far = saved.far; camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      scene.background = saved.bg;
      api.background();
      if (api.scenery) api.scenery(true);
      controls.enabled = true;
      document.body.classList.remove("vr-on");
      if (pop) pop.hidden = true;
      if (button) button.textContent = "Enter VR";
      api.resize();
    }
    async function enter() {
      const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
      session.addEventListener("end", leave);
      await xr.setSession(session);
      begin();
    }
    if (button) {
      if (navigator.xr && window.isSecureContext)
        navigator.xr.isSessionSupported("immersive-vr").then((ok) => { button.hidden = !ok; }).catch(() => {});
      button.addEventListener("click", () => {
        if (active) { const s = xr.getSession(); if (s) s.end(); else leave(); return; }
        enter().catch((err) => { button.title = "Could not start VR: " + err.message; button.textContent = "VR failed"; });
      });
    }

    // testing without a headset: the VR scene from the player's eyes at the desktop camera ("one" / "table"), the menu
    // on a stand-in hand in front; preview(null) leaves. probe(...) runs the touch test / opens a card / zooms.
    function preview(m) {
      if (!m) { leave(); return; }
      mode = m;
      if (!active) begin(); else place(true);
      const g = ctrls[0].grip;
      g.visible = true;                               // three shows a grip only once a controller connects
      g.position.set(-0.12, 1.32, -0.32); g.rotation.set(0.5, 0.3, 0);
      g.updateMatrix();                               // XR groups don't update their own matrix (the pose sets it)
      camera.fov = 75; camera.position.set(0, 1.6, 0); camera.rotation.set(-0.3, 0, 0);
      camera.updateProjectionMatrix();
      tick(0);
    }
    const probe = {
      touch: (name) => {                              // the center of a named part's box: what touched() finds there
        const m = api.meshes().find((q) => q.visible && (name ? q.userData.name === name : q.userData.group === "Core"
          && q.userData.source === "printed"));
        const p = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
        const t = touched(p);
        if (t) openCard(t, p);
        tick(0);
        return t && t.userData.name;
      },
      zoom: (k) => { zoomAbout(pivot(), k); tick(0); return S; },
      turn: (deg) => { turnAbout(pivot(), deg * Math.PI / 180); tick(0); },
      card: () => cardPart && cardPart.userData.name,
    };

    return { active: () => active, tick, preview, act, probe, rig, state };   // state: what the menu reads from the page
  }

  const out = { setup, layout, cardLayout, twoHand, snap, clampCut, clampS, hit, tabletopScale, fmtLen, fmtScale, PRESETS, IN };
  if (typeof module !== "undefined" && module.exports) module.exports = out;
  else root.LR4VR = out;
})(typeof self !== "undefined" ? self : this);
