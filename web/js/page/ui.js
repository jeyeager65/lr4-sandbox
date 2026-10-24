// lr4-sandbox page, part 11 of 12: views, panel tabs, SpaceMouse, VR, share link / picture / keyboard.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- views ----
  const views = { iso: [1, -1.15, 0.85], front: [0, -1, 0.18], top: [0, -0.001, 1], side: [1, 0, 0.18], back: [-0.6, 1, 0.55] };
  for (const [k, d] of Object.entries(views)) document.getElementById("v-" + k).addEventListener("click", () => frame(d));
  document.getElementById("v-fit").addEventListener("click", () => {
    const d = camera.position.clone().sub(controls.target);
    fitView([d.x, d.y, d.z]);
  });
  document.getElementById("pick-clear").addEventListener("click", () => select(null));

  // ---- panel tabs (the last one kept per browser) and the view settings popover ----
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  function showTab(t, focus) {
    for (const b of tabs) {
      const on = b === t;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) t.focus();
    try { localStorage.setItem("lr4-tab", t.id); } catch (e) { /* not kept */ }
  }
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => showTab(b));
    b.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); showTab(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
  try { const t = document.getElementById(localStorage.getItem("lr4-tab")); if (tabs.includes(t)) showTab(t); } catch (e) { /* Machine */ }
  const viewPop = document.getElementById("view-pop"), viewMore = document.getElementById("v-more");
  function showViewPop(on) { viewPop.hidden = !on; viewMore.setAttribute("aria-expanded", String(on)); }
  viewMore.addEventListener("click", () => showViewPop(viewPop.hidden));
  document.addEventListener("pointerdown", (e) => {
    if (!viewPop.hidden && !viewPop.contains(e.target) && e.target !== viewMore) showViewPop(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !viewPop.hidden) { showViewPop(false); viewMore.focus(); } });
  const panelBtn = document.getElementById("v-panel");
  function showPanel(on) {
    document.body.classList.toggle("panel-off", !on);
    panelBtn.setAttribute("aria-pressed", String(!on));
    panelBtn.title = on ? "Hide the panel" : "Show the panel";
    panelBtn.setAttribute("aria-label", panelBtn.title);
  }
  panelBtn.addEventListener("click", () => {
    const on = document.body.classList.contains("panel-off");
    showPanel(on);
    try { localStorage.setItem("lr4-panel", on ? "on" : "off"); } catch (e) { /* not kept */ }
  });
  try { if (localStorage.getItem("lr4-panel") === "off") showPanel(false); } catch (e) { /* shown */ }
  const vrPop = document.getElementById("vr-pop"), vrMin = document.getElementById("vr-min");
  function minVrPop(min) {
    vrPop.classList.toggle("min", min);
    vrMin.textContent = min ? "▾" : "✕";
    vrMin.title = min ? "Show the VR help" : "Minimize";
    vrMin.setAttribute("aria-label", vrMin.title);
    vrMin.setAttribute("aria-expanded", String(!min));
  }
  vrMin.addEventListener("click", () => {
    const min = !vrPop.classList.contains("min");
    minVrPop(min);
    try { localStorage.setItem("lr4-vr-pop", min ? "min" : "open"); } catch (e) { /* not kept */ }
  });
  try { if (localStorage.getItem("lr4-vr-pop") === "min") minVrPop(true); } catch (e) { /* open */ }
  document.getElementById("about-btn").addEventListener("click", () => document.getElementById("about-dlg").showModal());

  // ---- SpaceMouse (3Dconnexion) over WebHID, Chrome / Edge. Object mode: push the cap and the model goes
  // that way (X pans across, lift/press pans up/down, push away/pull zooms); tilt and twist orbit round the
  // target. Left button = fit all, right button = iso. ----
  const sm = { t: [0, 0, 0], r: [0, 0, 0], last: 0, dev: null };
  const smStatus = document.getElementById("sm-status"), smSpeed = document.getElementById("sm-speed");
  const smInvT = document.getElementById("sm-inv-t"), smInvR = document.getElementById("sm-inv-r");
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } } };
  if (store.get("sm-speed")) smSpeed.value = store.get("sm-speed");
  smInvT.checked = store.get("sm-inv-t") === "1";
  smInvR.checked = store.get("sm-inv-r") === "1";
  const smSpeedOut = () => (document.getElementById("sm-speed-out").textContent = `${Number(smSpeed.value).toFixed(1)}×`);
  smSpeedOut();
  smSpeed.addEventListener("input", () => { smSpeedOut(); store.set("sm-speed", smSpeed.value); });
  smInvT.addEventListener("change", () => store.set("sm-inv-t", smInvT.checked ? "1" : "0"));
  smInvR.addEventListener("change", () => store.set("sm-inv-r", smInvR.checked ? "1" : "0"));
  const hidAllowed = () => !!navigator.hid && !(document.featurePolicy && !document.featurePolicy.allowsFeature("hid"));
  function smOnReport(e) {
    const v = e.data, n = v.byteLength >> 1, w = (i) => v.getInt16(i * 2, true);
    if (e.reportId === 1) {
      sm.t = [w(0), w(1), w(2)];
      if (n >= 6) sm.r = [w(3), w(4), w(5)];      // newer devices send all six axes in report 1
    } else if (e.reportId === 2) {
      sm.r = [w(0), w(1), w(2)];
    } else if (e.reportId === 3) {
      const b = v.getUint8(0);
      if (b & 1) document.getElementById("v-fit").click();
      if (b & 2) frame(views.iso);
    }
    sm.last = performance.now();
  }
  async function smOpen(dev) {
    if (!dev.opened) await dev.open();
    dev.addEventListener("inputreport", smOnReport);
    sm.dev = dev;
    smStatus.textContent = dev.productName || "SpaceMouse connected";
  }
  const SM_FILTERS = [{ vendorId: 0x256f }, { vendorId: 0x046d, usagePage: 0x01, usage: 0x08 }];   // 3Dconnexion, older Logitech-made
  document.getElementById("sm-connect").addEventListener("click", async () => {
    if (!hidAllowed()) {
      smStatus.textContent = navigator.hid ? "Blocked in this embedded page: open the page from your PC" : "Needs Chrome or Edge (WebHID)";
      return;
    }
    try {
      const [dev] = await navigator.hid.requestDevice({ filters: SM_FILTERS });
      if (dev) await smOpen(dev); else smStatus.textContent = "No device chosen";
    } catch (err) { smStatus.textContent = "Could not open: " + err.message; }
  });
  if (hidAllowed()) {
    navigator.hid.getDevices().then((ds) => {
      const d = ds.find((x) => x.vendorId === 0x256f || x.vendorId === 0x046d);
      if (d) smOpen(d).catch(() => {});
    }).catch(() => {});
    navigator.hid.addEventListener("disconnect", (e) => {
      if (e.device === sm.dev) { sm.dev = null; sm.t = [0, 0, 0]; sm.r = [0, 0, 0]; smStatus.textContent = "Disconnected"; }
    });
  }
  const ZUP = new THREE.Vector3(0, 0, 1);
  function smApply(dt) {
    if (!sm.dev || performance.now() - sm.last > 250) return;   // stale report: the cap is at rest
    const dead = (x) => (Math.abs(x) < 12 ? 0 : x / 350);            // raw counts run to about +-350
    const k = Number(smSpeed.value) * dt, st = smInvT.checked ? -1 : 1, sr = smInvR.checked ? -1 : 1;
    const [tx, ty, tz] = sm.t.map(dead), [rx, , rz] = sm.r.map(dead);
    if (!(tx || ty || tz || rx || rz)) return;
    const offset = camera.position.clone().sub(controls.target);
    let dist = offset.length();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const pan = right.multiplyScalar(-tx * st * dist * 0.9 * k).add(up.multiplyScalar(tz * st * dist * 0.9 * k));
    controls.target.add(pan);
    dist *= Math.exp(ty * st * 1.6 * k);                              // push away = zoom in, pull = zoom out
    offset.setLength(Math.min(Math.max(dist, 50), 20000));
    offset.applyAxisAngle(ZUP, -rz * sr * 1.8 * k);                   // twist: spin about the vertical
    const pitchAxis = new THREE.Vector3().crossVectors(offset, ZUP).normalize();
    const tilted = offset.clone().applyAxisAngle(pitchAxis, rx * sr * 1.4 * k);
    if (Math.abs(tilted.clone().normalize().z) < 0.995) offset.copy(tilted);   // stop short of the poles
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
  }

  // ---- VR (js/vr.js): the same scene and page state; its menu drives the page's controls ----
  const vr = LR4VR.setup({ THREE, scene, renderer, camera, controls, meshes: () => meshes, select, background: paintBackground, resize,
    hidePart: (m) => showSet(partId(m), false),
    showHidden: () => document.getElementById("unhide").click(),
    hiddenCount: () => partHides().length,
    asmOf, groupLabel: asmLabel,
    scenery: (on) => { shopVR = on; updateShop(); return !!shop; },
    room: () => (shop ? shopRoom : null),       // the workshop at 1:1, not on the tabletop
    poke: ftPoke,
    carry: { meshes: () => meshes.filter((m) => m.userData.group === "Pendant" && /^Pendant_(case|screen)/.test(m.userData.name)),
      done: () => move(CTL.mode === "fluidnc" ? CTL.pose : null) } });   // back on its stand
  window.LR4VR.page = vr;
  // ---- automation handle for scripted videos (tools/record_demo.js); nothing on the page uses it ----
  // ---- share link, picture, measure in the main view, reset, keyboard ----
  // The link: #26x50&braces=6&struts=temp&peter=honeycomb&hose=0&pendant=1&table=762&room=6096,7315,3048&main=292a2e&units=mm
  // (size in inches as before; only what's set - options are on unless =0). Applied through LR4Machine, as a video does.
  const COL0 = { main: "#292a2e", accent: "#cc1f1a" };
  function shareLink() {
    const q = [`${+(S.cutX / IN).toFixed(3)}x${+(S.cutY / IN).toFixed(3)}`], add = (k, v) => q.push(`${k}=${encodeURIComponent(v)}`);
    if ($("braces").value !== "0") add("braces", $("braces").value);
    for (const [box, k] of [["strut-variant", "struts"], ["peter-variant", "peter"], ["table-variant", "base"]]) {
      const b = !$(box).hidden && $(box).querySelector('button[aria-pressed="true"]');
      if (b) add(k, b.dataset.v);
    }
    for (const k of ["router", "skirt", "hose", "fan"]) if (!$("opt-" + k).checked) add(k, 0);
    if ($("ft-on").checked) add("pendant", 1);
    const t = parseFloat($("table-top").value);
    if (t > 0) add("table", +(t * (U.unit === "in" ? IN : 1)).toFixed(1));
    const room = ["w", "d", "h"].map((k) => parseFloat($("room-" + k).value));
    if (room.every((v) => v > 0)) add("room", room.map((v) => Math.round(v * roomU())).join(","));
    for (const role of ["main", "accent"]) if (pick[role].value.toLowerCase() !== COL0[role]) add(role, pick[role].value.slice(1));
    if (U.unit === "mm") add("units", "mm");
    return q.join("&");
  }
  function applyLink(o) {                             // o: the hash's settings (default) or what waited for the files
    if (!o) {
      const m = /^#\d+(?:\.\d+)?x\d+(?:\.\d+)?&(.+)$/.exec(location.hash);
      if (!m) return;
      o = Object.fromEntries(new URLSearchParams(m[1]));
    }
    applyLink.left = null;
    if (o.units === "mm" && U.unit !== "mm") $("u-mm").click();
    if (o.pendant !== undefined && $("ft-on").checked !== (o.pendant !== "0")) $("ft-on").click();
    const set = {};
    for (const k of ["router", "skirt", "hose", "fan"]) if (o[k] !== undefined) set[k] = o[k] !== "0";
    for (const k of ["braces", "struts", "peter", "base"]) if (o[k] !== undefined) set[k] = o[k];
    if (o.table !== undefined) set.table = Number(o.table);
    if (o.room) { const r = o.room.split(",").map(Number); if (r.length === 3 && r.every((v) => v > 0)) set.room = r; }
    for (const role of ["main", "accent"]) if (o[role]) set[role] = "#" + o[role];
    const bad = LR4Machine.apply(set), left = {};
    for (const b of bad) {
      const k = b.split("=")[0].toLowerCase();
      if (k === "peter" || k === "struts") left[k] = o[k];
      else console.warn("link: " + b);
    }
    if (Object.keys(left).length) applyLink.left = left;
  }
  const flashText = (b, text) => { const was = b.dataset.was || (b.dataset.was = b.textContent); b.textContent = text;
    clearTimeout(b._t); b._t = setTimeout(() => (b.textContent = was), 2000); };
  $("copy-link").addEventListener("click", async (e) => {
    const url = location.href.split("#")[0] + "#" + shareLink();
    history.replaceState(null, "", url);
    let ok = true;
    try { await navigator.clipboard.writeText(url); } catch (err) { ok = false; }
    flashText(e.target, ok ? "Link copied" : "The link is in the address bar");
  });
  $("reset-all").addEventListener("click", () => {
    if (!confirm("Put every setting back to the default? Your part files and SD card stay.")) return;
    try {
      for (const k of Object.keys(localStorage))
        if (/^(lr4-|print-|peter-style|detail$)/.test(k) && !/^lr4-(sd-sel)$/.test(k)) localStorage.removeItem(k);
    } catch (e) { /* storage blocked: nothing kept anyway */ }
    location.replace(location.href.split("#")[0]);
  });

  function saveImage() {                              // preserveDrawingBuffer: the canvas holds the last frame
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `LR4_${+(S.cutX / IN).toFixed(2)}x${+(S.cutY / IN).toFixed(2)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }
  $("v-shot").addEventListener("click", saveImage);
  $("v-views").addEventListener("change", (e) => { $(e.target.value).click(); e.target.value = ""; });   // narrow screens

  function mainMeasure(on) {                          // the toolbar's 📏: Measure on the whole machine
    MEAS.on = MEAS.main = on;
    $("v-meas").setAttribute("aria-pressed", String(on));
    $("meas-main").hidden = !on;
    canvas.classList.toggle("measuring", on);
    measureClear();
  }
  $("v-meas").addEventListener("click", () => (INSPECT ? $("insp-meas").click() : mainMeasure(!MEAS.main)));

  $("keys-btn").addEventListener("click", () => $("keys-dlg").showModal());
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    if (e.target.closest && e.target.closest("input, select, textarea, button, summary, [contenteditable]")) {
      if (e.key !== "Escape") return;
    }
    const click = (id) => { const b = $(id); if (b && !b.hidden && !b.disabled) b.click(); };
    const views = { 1: "v-iso", 2: "v-front", 3: "v-top", 4: "v-side", 5: "v-back" };
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (views[k]) click(views[k]);
    else if (k === "f") click("v-fit");
    else if (k === "m") click("v-meas");
    else if (k === "p") saveImage();
    else if (k === "h") click("v-panel");
    else if (k === "?") $("keys-dlg").showModal();
    else if (k === " " && CTL.mode !== "fluidnc" && !$("job-on").hidden) click("job-play");
    else if (k === "Escape" && MEAS.main) mainMeasure(false);
    else return;
    e.preventDefault();
  });

