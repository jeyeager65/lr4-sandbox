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

  // ---- Design's steps (Part 37): six <details> that open in any order, one at a time (the open one kept per
  // browser); a closed step shows a one-line summary, step 1 a red dot while its warnings say something; "Next: ..."
  // opens the next. The controls inside are never hidden themselves (js/vr.js reads them by id). ----
  const steps = [...document.querySelectorAll("#steps > details.step")];
  function showStep(d, scroll) {
    for (const s of steps) if (s !== d) s.open = false;
    if (d) { d.open = true; if (scroll) d.scrollIntoView({ block: "start", behavior: "smooth" }); }
  }
  for (const d of steps) d.addEventListener("toggle", () => {
    if (d.open) { showStep(d); try { localStorage.setItem("lr4-step", d.id); } catch (e) { /* not kept */ } }
    else if (!steps.some((s) => s.open)) { try { localStorage.setItem("lr4-step", ""); } catch (e) { /* not kept */ } }
    stepSums();
  });
  {
    let id = null;
    try { id = localStorage.getItem("lr4-step"); } catch (e) { /* step 1 */ }
    const d = id === null ? steps[0] : steps.find((s) => s.id === id);
    if (d) showStep(d);
  }
  const pressed = (id) => { const b = document.querySelector(`#${id} button[aria-pressed="true"]`); return b ? b.textContent.trim() : ""; };
  const checkedOpts = () => [...document.querySelectorAll("#opts input:checked")].map((i) => i.parentElement.textContent.trim().split(/ [+(]/)[0]);
  function stepSums() {                              // the closed steps' one-liners, from the controls themselves
    const u = $("u-mm").getAttribute("aria-pressed") === "true" ? "mm" : "in", sv = $("strut-variant");
    const s = {
      size: `${$("cut-x").value} × ${$("cut-y").value} ${u}` + ($("braces").selectedOptions[0] ? ` · ${$("braces").selectedOptions[0].textContent}` : "") +
        (!sv.hidden && pressed("strut-variant") ? ` · ${pressed("strut-variant").replace(/ \(.*/, "")} struts` : ""),
      opts: [...checkedOpts(), !$("peter-variant").hidden && pressed("peter-variant") ? `${pressed("peter-variant")} Peter plates` : ""].filter(Boolean).join(", ") || "Bare machine",
      shop: `${pressed("table-variant")}${$("table-top").value ? ` · top at ${$("table-top").value} ${u}` : ""}`,
      ab: $("ab-on").checked ? "Real-world (out of square until homed)" : "Ideal",
      look: [LR4Filaments.PRESETS[FIL.s.preset].label, pressed("scenery"), pressed("lighting"), pressed("detail")].filter(Boolean).join(" · "),
      files: "BOM, cut list, strut plates, config.yaml",
    };
    for (const [k, v] of Object.entries(s)) $("sum-" + k).textContent = v;
    $("dot-size").hidden = $("st-size").open || !$("warnings").textContent.trim();
  }
  {
    const panel = document.querySelector(".panel");
    for (const ev of ["input", "change", "click"]) panel.addEventListener(ev, () => requestAnimationFrame(stepSums));
    new MutationObserver(stepSums).observe($("warnings"), { childList: true, subtree: true, characterData: true });
    for (const id of ["strut-variant", "peter-variant"]) new MutationObserver(stepSums).observe($(id), { attributes: true, subtree: true });
    stepSums();
  }
  // ---- Layers (Part 37): the parts tree (show / hide per group, ⤢ = Inspect) in a popover on the view ----
  const layersPop = $("layers-pop"), layersBtn = $("v-layers");
  function showLayers(on) { layersPop.hidden = !on; layersBtn.setAttribute("aria-expanded", String(on)); }
  layersBtn.addEventListener("click", () => showLayers(layersPop.hidden));
  $("layers-x").addEventListener("click", () => showLayers(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !layersPop.hidden) { showLayers(false); layersBtn.focus(); } });
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

  // ---- the page shell (Part 35): Design | Run, the theme, Run's columns and console, "?" help. The mode, theme and
  // folds live on <html> (data-mode, data-theme, l-off / r-off, con-open / con-big); index.html's head sets them from
  // localStorage before the first paint, this keeps them and the buttons in step. ----
  {
    const root = document.documentElement;
    const kv = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
                 set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* not kept */ } } };
    const modeBtns = { design: $("t-design"), run: $("t-run") };
    function setMode(m, save = true) {
      root.dataset.mode = m;
      for (const [k, b] of Object.entries(modeBtns)) b.setAttribute("aria-pressed", String(k === m));
      if (save) kv.set("lr4-mode", m);
    }
    for (const [k, b] of Object.entries(modeBtns)) b.addEventListener("click", () => setMode(k));
    if (kv.get("lr4-mode") === null && kv.get("lr4-tab") === "t-run") setMode("run");   // the old Run tab
    else setMode(root.dataset.mode === "run" ? "run" : "design", false);
    $("tb-files").addEventListener("click", () => { setMode("design"); showPanel(true); showStep($("st-files"), true); });

    const themeBtns = [...document.querySelectorAll("#theme button")];
    function setTheme(t) {
      if (t === "light" || t === "dark") root.dataset.theme = t;
      else delete root.dataset.theme;
      for (const b of themeBtns) b.setAttribute("aria-pressed", String(b.dataset.v === (root.dataset.theme || "auto")));
    }
    for (const b of themeBtns) b.addEventListener("click", () => { setTheme(b.dataset.v); kv.set("lr4-theme", b.dataset.v); });
    setTheme(root.dataset.theme);
    $("set-keys").addEventListener("click", () => { showViewPop(false); $("keys-dlg").showModal(); });

    // ⛶ view only: nothing but the 3D view (not kept: a reload brings the panels back)
    const vOnly = $("v-only");
    function viewOnly(on) {
      document.body.classList.toggle("view-only", on);
      vOnly.setAttribute("aria-pressed", String(on));
      vOnly.title = on ? "Show the panels again (Esc)" : "Only the view: hide the panels (Esc brings them back)";
      vOnly.setAttribute("aria-label", on ? "Show the panels" : "Only the view");
      if (on) showViewPop(false);
    }
    vOnly.addEventListener("click", () => viewOnly(!document.body.classList.contains("view-only")));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("view-only") && !document.querySelector("dialog[open]")) viewOnly(false);
    });

    // Run's columns fold to strips; below 1200 px they fold by themselves (the user's folds are kept for wide windows)
    const narrow = matchMedia("(max-width: 1199px)");
    const userOff = { l: kv.get("lr4-col-l") === "off", r: kv.get("lr4-col-r") === "off" };
    function fold(side, off) {
      root.classList.toggle(side + "-off", off);
      const b = $("col-" + side), name = side === "l" ? "Machine" : "Job";
      b.setAttribute("aria-expanded", String(!off));
      b.textContent = (side === "l") === off ? "»" : "«";
      b.title = off ? "Unfold the column" : "Fold the column";
      b.setAttribute("aria-label", `${off ? "Unfold" : "Fold"} the ${name} column`);
    }
    for (const side of ["l", "r"]) $("col-" + side).addEventListener("click", () => {
      const off = !root.classList.contains(side + "-off");
      fold(side, off);
      if (!narrow.matches) { userOff[side] = off; kv.set("lr4-col-" + side, off ? "off" : "on"); }
    });
    const fitCols = () => { for (const side of ["l", "r"]) fold(side, narrow.matches || userOff[side]); };
    narrow.addEventListener("change", fitCols);
    fitCols();
    // phone (Part 39): Jog and Files open as sheets from the bottom (html.ph-jog / html.ph-files, one at a time)
    function sheet(k) {
      for (const s of ["jog", "files"]) root.classList.toggle("ph-" + s, s === k);
      $("ph-jog").setAttribute("aria-expanded", String(k === "jog"));
      $("ph-files").setAttribute("aria-expanded", String(k === "files"));
    }
    $("ph-jog").addEventListener("click", () => sheet(root.classList.contains("ph-jog") ? null : "jog"));
    $("ph-files").addEventListener("click", () => sheet(root.classList.contains("ph-files") ? null : "files"));
    for (const b of document.querySelectorAll(".sheet-x")) b.addEventListener("click", () => sheet(null));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && /\bph-(jog|files)\b/.test(root.className)) sheet(null); });
    // the folded Job strip: unfold it at the SD card, the loaded job's Preview or On the table
    for (const b of document.querySelectorAll("[data-unfold]")) b.addEventListener("click", () => {
      fold("r", false);
      const k = b.dataset.unfold;
      if (k === "sd") { $("src-sd").click(); $("sd-box").scrollIntoView({ block: "nearest" }); }
      else if (k === "pv") { if (JOB.tl && !JOB.preview) previewStart(); }
      else $("setup-sec").scrollIntoView({ block: "start" });
    });
    // left folded: the work position floats on the view
    const md = { x: $("md-x"), y: $("md-y"), z: $("md-z") };
    const mdSync = () => { for (const a of "xyz") md[a].textContent = $("w" + a).textContent; };
    new MutationObserver(mdSync).observe($("wx").parentElement.parentElement, { subtree: true, childList: true, characterData: true });
    mdSync();

    // the console: folded = one line (state, last message, input), open = the log (drag the top edge), big = half the window
    const con = { mode: "fold", h: +kv.get("lr4-con-h") || 0 };
    function conMode(m, save = true) {
      con.mode = m;
      root.classList.toggle("con-open", m === "open");
      root.classList.toggle("con-big", m === "big");
      const f = $("con-fold");
      f.textContent = m === "fold" ? "▴" : "▾";
      f.title = m === "fold" ? "Open the console" : "Fold the console";
      f.setAttribute("aria-label", f.title);
      f.setAttribute("aria-expanded", String(m !== "fold"));
      $("con-big").setAttribute("aria-pressed", String(m === "big"));
      if (save) kv.set("lr4-con", m);
      const log = $("ctl-log");
      log.scrollTop = log.scrollHeight;
    }
    $("con-fold").addEventListener("click", () => conMode(con.mode === "fold" ? "open" : "fold"));
    $("con-big").addEventListener("click", () => conMode(con.mode === "big" ? "open" : "big"));
    $("con-clear").addEventListener("click", () => { $("ctl-log").textContent = ""; $("con-last").textContent = ""; });
    if (con.h) root.style.setProperty("--con-h", con.h + "px");
    { const m = kv.get("lr4-con"); conMode(m === "open" || m === "big" ? m : "fold", false); }
    const grip = $("con-grip");
    grip.addEventListener("pointerdown", (e) => {
      const y0 = e.clientY, h0 = $("ctl-log").getBoundingClientRect().height;
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        con.h = Math.round(Math.min(innerHeight * 0.7, Math.max(48, h0 + y0 - ev.clientY)));
        root.style.setProperty("--con-h", con.h + "px");
        if (con.mode === "big") conMode("open");
      };
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
        kv.set("lr4-con-h", String(con.h));
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
    // the folded line: FluidNC's state (from the status line) and the log's last line
    new MutationObserver(() => {
      const last = $("ctl-log").lastElementChild, l = $("con-last");
      l.textContent = last ? last.textContent : "";
      l.classList.toggle("err", !!last && last.classList.contains("err"));
    }).observe($("ctl-log"), { childList: true });
    new MutationObserver(() => {
      const m = /^<([A-Za-z]+)/.exec($("ctl-state").textContent), st = $("con-st");
      st.textContent = m ? m[1] : "";
      st.classList.toggle("err", !!m && m[1] === "Alarm");
    }).observe($("ctl-state"), { childList: true, characterData: true, subtree: true });

    // "?" help: one popover next to its button, the text from the hidden .help block it names (Esc / outside closes)
    const pop = document.createElement("div");
    pop.className = "help-pop";
    pop.id = "help-pop";
    pop.setAttribute("role", "dialog");
    pop.hidden = true;
    document.body.appendChild(pop);
    let helpBtn = null;
    function help(b) {
      if (helpBtn) helpBtn.setAttribute("aria-expanded", "false");
      helpBtn = b;
      pop.hidden = !b;
      if (!b) return;
      pop.innerHTML = $(b.dataset.help).innerHTML;
      pop.setAttribute("aria-label", b.getAttribute("aria-label"));
      b.setAttribute("aria-expanded", "true");
      const r = b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left - 20)) + "px";
      pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : r.bottom + 6) + "px";
    }
    for (const b of document.querySelectorAll(".q[data-help]")) {
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-controls", "help-pop");
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); help(helpBtn === b ? null : b); });
    }
    document.addEventListener("pointerdown", (e) => { if (helpBtn && !pop.contains(e.target) && e.target !== helpBtn) help(null); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && helpBtn) { const b = helpBtn; help(null); b.focus(); } });
    for (const el of document.querySelectorAll(".col-body, .panel")) el.addEventListener("scroll", () => help(null), { passive: true });
  }
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
    jog: ctlJogBy,
    carry: { meshes: () => meshes.filter((m) => m.userData.group === "Pendant" && /^Pendant_(case|screen)/.test(m.userData.name)),
      done: () => move(JOB.preview ? null : CTL.pose) } });   // back on its stand
  window.LR4VR.page = vr;
  // ---- automation handle for scripted videos (tools/record_demo.js); nothing on the page uses it ----
  // ---- share link, picture, measure in the main view, reset, keyboard ----
  // The link: #26x50&braces=6&struts=temp&peter=honeycomb&hose=0&pendant=1&table=762&room=6096,7315,3048&preset=fiber&spools=PLA_292a2e~PLA_cc1f1a~PET-CF_2a2a2c&parts=Core.3&units=mm
  // (size in inches as before; only what's set - options are on unless =0). Applied through LR4Machine, as a video does.
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
    for (const [k, v] of Object.entries(LR4Filaments.toLink(FIL.s))) add(k, v);   // Part 40: spools, overrides, look, plates
    for (const [k, v] of Object.entries(Imperfect.toLink(AB.set))) add(k, v);       // As built (ab=1 = Real-world, abx = its errors)
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
    const fil = LR4Filaments.fromLink(o);              // Part 40 (main= / accent= from older links still work, via set)
    if (fil) { FIL.s = fil; filSave(); applyColours(); }
    const ab = Imperfect.fromLink(o);                  // As built, when the link has it
    if (ab) LR4AsBuilt.set(ab);
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
    else if (k === "v") click("v-only");
    else if (k === "l") click("v-layers");
    else if (k === "?") $("keys-dlg").showModal();
    else if (k === " " && JOB.preview && !$("job-on").hidden) click("job-play");
    else if (k === "Escape" && MEAS.main) mainMeasure(false);
    else return;
    e.preventDefault();
  });

