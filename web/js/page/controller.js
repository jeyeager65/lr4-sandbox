// lr4-sandbox page, part 5 of 12: config.yaml, SD / Flash folders, Web UIs, the Controller (FluidNC), the pendant.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- FluidNC config.yaml: V1E's JP3_LR file (pinned commit, fetched on demand - not shipped) or the user's own,
  // with X / Y max_travel_mm set for this size (LR4Model.fluidncConfig) ----
  const V1E_COMMIT = "3bb36506b0fcd2b0caca7c108ec150ccbb0c055c";
  const V1E_YAML = `https://raw.githubusercontent.com/V1EngineeringInc/FluidNC_Configs/${V1E_COMMIT}/LowRider%20CNC/Jackpot3/JP3_LR/config.yaml`;
  let yamlBase = null;                                // {text, note}
  // FluidNC's Flash (SdCard.flash, user 2026-10-21): /config.yaml there = the config.yaml in use at this size (what
  // Download gives), kept in this browser with where it came from (origin "v1e" / "user", the user's own text in base).
  // At load your own comes back from it; FluidNC boots its translated copy (/sim_config.yaml, Config/Filename) and a
  // config.yaml changed on its Flash becomes yours (FluidNC restarts with it, as a board would).
  const FLASH = { saved: null, timer: 0, loaded: null };
  const FLASH_YAML = "/config.yaml";
  FLASH.loaded = SdCard.flash.store.get(FLASH_YAML).then((r) => {
    if (r && r.origin === "user" && !yamlBase) {
      FLASH.saved = new TextDecoder().decode(r.bytes);
      yamlBase = { text: r.base || FLASH.saved, note: `From your ${r.name || "config.yaml"} (kept on the Flash).` };
    }
  }).catch(() => { /* no storage: V1E's */ });
  function flashSaveYaml(text) {                     // the config in use -> the Flash (debounced: sizes drag)
    clearTimeout(FLASH.timer);
    FLASH.timer = setTimeout(async () => {
      await FLASH.loaded;
      if (text === FLASH.saved) return;
      const own = !!(yamlBase && /^From your/.test(yamlBase.note));
      const name = own ? (yamlBase.note.match(/^From your (.+?)( \(|\.$)/) || [0, "config.yaml"])[1] : "config.yaml";
      try {
        await SdCard.flash.store.put(FLASH_YAML, text, { origin: own ? "user" : "v1e", base: own ? yamlBase.text : null, name });
        SdCard.flash.writeLive(CTL.sim, FLASH_YAML, text);
        FLASH.saved = text;
        flashRefresh();
      } catch (e) { /* not kept */ }
    }, 600);
  }
  // ---- folders on the SD card and the Flash (user 2026-10-23): both lists are a tree. A folder row: ▾/▸ folds it,
  // its name makes it where Add / New folder go (again: back to the top), ✕ deletes it and everything in it. ----
  // cardTree(list, files, dirs, st = { cur, closed: Set }, fileRow(r) -> row, onDelDir(path), refresh)
  function cardTree(list, files, dirs, st, fileRow, onDelDir, refresh) {
    const all = new Set(dirs);
    for (const r of files) for (const p of SdCard.parents(r.path)) all.add(p);
    if (st.cur && !all.has(st.cur)) st.cur = "";
    const parent = (p) => p.slice(0, p.lastIndexOf("/"));
    const base = (p) => p.slice(p.lastIndexOf("/") + 1);
    list.innerHTML = "";
    const pad = (row, depth) => { row.style.paddingLeft = `${6 + depth * 16}px`; };
    const go = (dir, depth) => {
      for (const d of [...all].filter((p) => parent(p) === dir).sort()) {
        const row = document.createElement("div"), fold = document.createElement("button"), name = document.createElement("button"), del = document.createElement("button");
        row.className = "sd-row sd-dir"; pad(row, depth);
        if (list.getAttribute("role") === "listbox") row.setAttribute("role", "option");
        row.setAttribute("aria-current", String(st.cur === d));
        const shut = st.closed.has(d);
        fold.type = name.type = del.type = "button"; fold.className = "sd-fold"; name.className = "sd-name"; del.className = "sd-act";
        fold.textContent = shut ? "▸" : "▾"; fold.title = shut ? `Open ${d}` : `Fold ${d}`; fold.setAttribute("aria-label", fold.title);
        fold.addEventListener("click", () => { if (shut) st.closed.delete(d); else st.closed.add(d); refresh(); });
        name.textContent = base(d) + "/";
        name.title = st.cur === d ? `Adding to ${d}: click to add to the top instead` : `Add files and folders to ${d}`;
        name.addEventListener("click", () => { st.cur = st.cur === d ? "" : d; refresh(); });
        del.textContent = "✕"; del.title = `Delete ${d} and everything in it`; del.setAttribute("aria-label", del.title);
        del.addEventListener("click", () => { if (confirm(`Delete ${d} and everything in it?`)) onDelDir(d); });
        row.append(fold, name, del);
        list.appendChild(row);
        if (!shut) go(d, depth + 1);
      }
      for (const r of files.filter((f) => parent(f.path) === dir)) {
        const row = fileRow(r);
        pad(row, depth);
        list.appendChild(row);
      }
    };
    go("", 0);
  }
  const cardWhere = (st) => (st.cur ? `Adding to ${st.cur}` : "");
  async function cardMkdir(card, st, refresh, status) {   // New folder: in the folder picked, or at the top
    const name = (prompt(`New folder in ${st.cur || "the top"}:`) || "").trim();
    if (!name) return;
    const clean = SdCard.cleanName(name).replace(/\./g, "_");
    const path = `${st.cur}/${clean}`;
    await card.store.mkdir(path);
    card.mkdirLive(CTL.sim, path);
    st.cur = path;
    $(status).textContent = `Made ${path}.`;
    refresh();
  }
  FLASH.tree = { cur: "", closed: new Set() };
  async function flashRefresh() {                    // the Flash's files and folders under the controller
    let recs = [], dirs = [];
    try { recs = await SdCard.flash.store.all(); dirs = await SdCard.flash.store.dirs(); } catch (e) { /* none */ }
    cardTree($("flash-list"), recs, dirs, FLASH.tree, (r) => {
      const row = document.createElement("div"), name = document.createElement("span"), dl = document.createElement("button");
      row.className = "sd-row"; name.className = "sd-name"; name.title = r.path;
      name.textContent = r.path.split("/").pop() + (r.path === FLASH_YAML ? (r.origin === "user" ? " (yours)" : " (V1E's)") : "");
      dl.type = "button"; dl.className = "sd-act"; dl.textContent = "⬇"; dl.title = `Download ${r.path}`; dl.setAttribute("aria-label", dl.title);
      dl.addEventListener("click", () => save(r.path.split("/").pop(), r.bytes, "flash-status"));
      row.append(name, dl);
      if (r.path !== FLASH_YAML) {                   // config.yaml stays: the page boots FluidNC with it
        const del = document.createElement("button");
        del.type = "button"; del.className = "sd-act"; del.textContent = "✕"; del.title = `Delete ${r.path}`; del.setAttribute("aria-label", del.title);
        del.addEventListener("click", async () => { await SdCard.flash.store.remove(r.path); SdCard.flash.removeLive(CTL.sim, r.path); flashRefresh(); });
        row.append(del);
      }
      return row;
    }, async (d) => {
      if (recs.some((r) => r.path === FLASH_YAML && r.path.startsWith(d + "/"))) return;
      await SdCard.flash.store.removeTree(d); SdCard.flash.removeTreeLive(CTL.sim, d); flashRefresh();
    }, flashRefresh);
    $("flash-where").textContent = cardWhere(FLASH.tree);
    uiRefresh();
  }
  async function flashAdd(files) {
    const added = [];
    for (const f of files) {
      const path = FLASH.tree.cur + SdCard.pathOf(f.name);
      if (path === FLASH_YAML || path === "/sim_config.yaml") { $("flash-status").textContent = `${path} is the page's: load your config.yaml under Build.`; continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      await SdCard.flash.store.put(path, bytes);
      SdCard.flash.writeLive(CTL.sim, path, bytes);
      added.push(path);
    }
    if (added.length) $("flash-status").textContent = `Added ${added.join(", ")}.`;
    flashRefresh();
  }
  $("flash-file").addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) flashAdd(f); });
  $("flash-mkdir").addEventListener("click", () => cardMkdir(SdCard.flash, FLASH.tree, flashRefresh, "flash-status"));
  async function flashSyncBack() {                   // FluidNC changed its Flash: a new config.yaml is the user's now
    const d = await SdCard.flash.sync(CTL.sim).catch(() => ({ put: [], remove: [] }));
    if (!d.put.length && !d.remove.length && !d.dirs) return;
    const y = d.put.find((r) => r.path === FLASH_YAML);
    if (y) {
      const text = new TextDecoder().decode(y.bytes);
      if (text !== FLASH.saved) {
        yamlBase = { text, note: "From your config.yaml (changed on FluidNC's Flash)." };
        FLASH.saved = text;
        await SdCard.flash.store.put(FLASH_YAML, text, { origin: "user", base: text, name: "config.yaml" }).catch(() => {});
        ctlAdd("config.yaml changed on the Flash: it's the config.yaml in use now.", "dim");
        updateYaml();
      }
    }
    flashRefresh();
  }
  // ---- Web UIs (fluidnc/vnet_host.js + device/): any .html / .html.gz on FluidNC's card or Flash opens in a window of
  // its own, served by FluidNC's web server through this tab (user 2026-10-23: the UIs are files on the card / Flash,
  // run as released - never patched). The address is the one a board serves it at: the Flash's index.html(.gz) at /,
  // /sd/ui/<name>/index.html(.gz) at /ui/<name>/ (HTTP/UIDir: FluidNC after 4.1.1), anything else by WebDAV at
  // /sd/<path> or /flash/<path> with the .gz left off (FluidNC sends the .gz, Content-Encoding gzip). A UI that calls
  // FluidNC by a relative path only works at / or /ui/<name>/, as on a board. ----
  const UI = { titles: new Map(), timer: 0 };
  const VNET = window.VnetHost ? VnetHost.serve({ sim: () => CTL.sim || null, changed: uiChanged }) : null;
  window.LR4Vnet = VNET;
  const UI_FILE = /\.html?(\.gz)?$/i;
  function uiUrl(where, path) {                       // where FluidNC serves a UI file
    if (where === "flash" && /^\/index\.html?(\.gz)?$/i.test(path)) return "/";
    const m = /^\/ui\/([^/]+)\/index\.html?(\.gz)?$/i.exec(path);
    if (where === "sd" && m) return `/ui/${m[1]}/`;
    return `/${where}${path.replace(/\.gz$/i, "")}`;
  }
  // which UI a file is (cached by path + size): FigUI / WebUI 3 / WebUI 2 by markers in their release builds (FigUI
  // 1.4.1, WebUI 3.0.11, WebUI 2.2.3; their <title>s say "FluidNC" / "ESP3D"), else the page's <title>, else ""
  async function uiTitle(r) {
    const key = `${r.path}:${r.bytes.length}`;
    if (UI.titles.has(key)) return UI.titles.get(key);
    let text = "";
    try {
      let bytes = r.bytes;
      if (/\.gz$/i.test(r.path)) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
      const html = new TextDecoder().decode(bytes), m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
      if (/figui-packed|\bFigUI\b/.test(html)) text = "FigUI";
      else if (/webui-v3/.test(html)) text = "WebUI 3";
      else if (/ESP3D/i.test(html)) text = "WebUI 2";
      else if (m) { const d = document.createElement("textarea"); d.innerHTML = m[1]; text = d.value.trim(); }
    } catch (e) { /* not gzip / not text */ }
    UI.titles.set(key, text);
    return text;
  }
  async function uiRefresh() {
    const list = $("ui-list");
    if (!list) return;
    const recs = [];
    for (const [where, store] of [["flash", SdCard.flash.store], ["sd", SdCard.store]]) {
      try { for (const r of await store.all()) if (UI_FILE.test(r.path)) recs.push({ where, store, r, url: uiUrl(where, r.path) }); }
      catch (e) { /* no storage */ }
    }
    for (const u of recs) u.title = await uiTitle(u.r);
    const ready = !!(VNET && CTL.sim);
    list.innerHTML = "";
    for (const u of recs) {
      const row = document.createElement("div"), name = document.createElement("span"), at = document.createElement("small");
      row.className = "sd-row"; name.className = "sd-name";
      name.textContent = u.title || u.r.path.split("/").pop();
      name.title = `${u.where === "flash" ? "Flash" : "SD card"}: ${u.r.path}`;
      at.textContent = u.url;
      const open = document.createElement("button"), del = document.createElement("button");
      open.type = del.type = "button"; open.className = "ui-open"; del.className = "sd-act";
      // before FluidNC is up, the window shows "Waiting for the sandbox" and reloads itself until it is
      open.textContent = "Open"; open.disabled = !VNET || !window.crossOriginIsolated;
      open.title = ready ? `Open ${u.url} in a window of its own` : !VNET ? "This browser has no service workers here"
        : `Open ${u.url} (FluidNC is still starting)`;
      open.addEventListener("click", () => {
        const w = VNET.open(u.url, "lr4-ui-" + u.url.replace(/[^A-Za-z0-9]+/g, "_"));
        $("ui-status").textContent = w ? "" : "The browser blocked the window: allow pop-ups for this page.";
      });
      del.textContent = "✕"; del.title = `Delete ${u.r.path} from the ${u.where === "flash" ? "Flash" : "SD card"}`; del.setAttribute("aria-label", del.title);
      del.addEventListener("click", async () => {
        await u.store.remove(u.r.path);
        (u.where === "flash" ? SdCard.flash : SdCard).removeLive(CTL.sim, u.r.path);
        if (u.where === "flash") flashRefresh(); else sdRefresh();
      });
      row.append(name, at, open, del);
      list.appendChild(row);
    }
  }
  function uiChanged() {                             // a Web UI wrote to FluidNC (upload, delete, settings): sync back
    clearTimeout(UI.timer);
    UI.timer = setTimeout(() => { if (CTL.sim) { sdSyncBack(); flashSyncBack(); } }, 300);
  }
  // Releases are all called index.html.gz: on the SD card each goes in a folder of its own, /ui/<figui|webui3|webui2|
  // its title>/ (served at /ui/<name>/, and at /sd/ui/<name>/index.html by 4.1.1's WebDAV); on the Flash it's the
  // one served at / (a new one replaces it).
  async function uiAdd(files, where) {
    const card = where === "flash" ? SdCard.flash : SdCard, added = [];
    const cur = (where === "flash" ? FLASH.tree : SDC.tree).cur;   // the folder picked in that list, if any
    for (const f of files) {
      let path = cur + SdCard.pathOf(f.name);
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (where === "flash" && path === FLASH_YAML) continue;
      if (where === "sd" && !cur && /^\/index\.html?(\.gz)?$/i.test(path)) {
        const t = await uiTitle({ path, bytes });
        const slug = { "FigUI": "figui", "WebUI 3": "webui3", "WebUI 2": "webui2" }[t] || t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ui";
        path = `/ui/${slug}${path}`;
      }
      await card.store.put(path, bytes);
      card.writeLive(CTL.sim, path, bytes);
      added.push(path);
    }
    if (where === "flash") flashRefresh(); else sdRefresh();
    $("ui-status").textContent = `Added ${added.join(", ")} to the ${where === "flash" ? "Flash" : "SD card"}.`;
  }
  for (const where of ["flash", "sd"])
    $("ui-file-" + where).addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) uiAdd(f, where); });
  {                                                  // drop a UI on the list: onto the SD card
    const box = $("ui-box"), list = $("ui-list");
    box.addEventListener("dragover", (e) => { e.preventDefault(); list.classList.add("drop"); });
    box.addEventListener("dragleave", () => list.classList.remove("drop"));
    box.addEventListener("drop", (e) => { e.preventDefault(); list.classList.remove("drop"); if (e.dataTransfer.files.length) uiAdd([...e.dataTransfer.files], "sd"); });
  }
  async function yamlText() {
    await FLASH.loaded;
    if (!yamlBase) {
      const r = await fetch(V1E_YAML);
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      yamlBase = { text: await r.text(), note: `From V1 Engineering's FluidNC_Configs (AGPL-3.0), LowRider CNC/Jackpot3/JP3_LR/config.yaml at ${V1E_COMMIT.slice(0, 7)}: https://github.com/V1EngineeringInc/FluidNC_Configs` };
    }
    return LR4Model.fluidncConfig(yamlBase.text, cfg, S, yamlBase.note);
  }
  const yamlFail = (e) => dlStatus(yamlBase ? `Not patched: ${e.message}`
    : `Couldn't read V1E's config.yaml from GitHub here (${e.message}). Download it from the link below and use "Use my own config.yaml".`, "yaml-status");
  $("dl-yaml").addEventListener("click", async () => {
    try { save("config.yaml", (await yamlText()).text, "yaml-status"); } catch (e) { yamlFail(e); }
  });
  $("copy-yaml").addEventListener("click", async () => {
    let r;
    try { r = await yamlText(); } catch (e) { yamlFail(e); return; }
    try { await navigator.clipboard.writeText(r.text); dlStatus("config.yaml copied.", "yaml-status"); }
    catch (e) { dlStatus("Copy blocked here. Use Download config.yaml.", "yaml-status"); }
  });
  $("f-yaml").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    const prev = yamlBase;
    yamlBase = { text: await f.text(), note: `From your ${f.name}.` };
    try { const r = await yamlText(); updateYaml(); dlStatus(`Using your ${f.name} (x ${r.x[0]}, y ${r.y[0]} -> this size). Download or copy it.`, "yaml-status"); }
    catch (e) { yamlBase = prev; dlStatus(`${f.name}: ${e.message}`, "yaml-status"); }
  });
  function updateYaml() {
    ctlConfigChanged();
    abNote();                                        // the pulloffs may have changed (Part 32)
    yamlText().then((r) => flashSaveYaml(r.text)).catch(() => { /* no config.yaml yet */ });
    // max_travel_mm = trip -> stop less pulloff_mm (as LR4Model.fluidncConfig writes it); FluidNC's soft range
    // [mpos, mpos + max_travel] then ends at the stop. Short of the cutting area at most sizes (26 x 50: ~2.4 mm)
    const t = LR4Model.travel(cfg, S), s = Homing.settings(yamlBase ? yamlBase.text : null);
    const mt = { x: t.x[1] - t.x[0] - s.x.pulloff, y: t.y[1] - t.y[0] - s.y.pulloff };
    $("yaml-xy").textContent = `X ${mt.x.toFixed(1)} mm, Y ${mt.y.toFixed(1)} mm`;
    const short = [["X", S.cutX - mt.x], ["Y", S.cutY - mt.y]].filter(([, d]) => d > 0.05);
    $("yaml-short").textContent = short.length ? `That's ${short.map(([a, d]) => `${a} ${d.toFixed(1)} mm`).join(", ")} short ` +
      "of the cutting area: with soft_limits on (V1E's file has them off), FluidNC won't jog or cut that last bit at the far " +
      "end, though the tool physically reaches it." : "";
  }

  // ---- Controller (Run tab): FluidNC, the firmware in the page (the only machine since Part 34)
  // (js/fluidnc_sim.js), booted with js/sim_config.js's copy of the config.yaml in use. In FluidNC mode the machine
  // follows its motors: each frame, each axis' first motor's step count (from the pose it booted at; status reports
  // come ~1 s apart while homing). Every limit switch is a virtual one on its motor (sim.setSwitch: the trip at the
  // travel's end, travel.x[0] etc., each Y / Z motor its own), so $H homes on them and squares the gantry; the touch
  // plate (checkbox: on the strut job's stock) trips the probe at the bit's end on it. The jog pad jogs ($J=G91);
  // Home sends $H. Until it has homed, its MPos is greyed: it doesn't know where it is. Machine speed = FluidNC's time scale. A new size or
  // config.yaml restarts it. window.LR4FluidNC = the running sim. ----
  // the touch plate: on the job's stock (its (Stock:) thickness, its probe's plate), else the strut job's (strut_cam:
  // 6.35 mm MDF, a 0.5 mm Tiny Touch Plate)
  const TOUCH_PLATE = { stock: StrutCam.DEFAULTS.t, plate: StrutCam.DEFAULTS.plate };
  function touchPlate() {
    const tl = JOB.tl, st = tl && tl.stock, pl = tl && tl.plates[0];
    TOUCH_PLATE.stock = st ? st.zmax - st.zmin : StrutCam.DEFAULTS.t;
    TOUCH_PLATE.plate = pl && pl.thick > 0 ? pl.thick : StrutCam.DEFAULTS.plate;
    if (HAND.plate && !CTL.jobPlate) TOUCH_PLATE.stock = HAND.plate.z;   // the button's plate: on what's under the bit
    return TOUCH_PLATE;
  }
  function ctlAdd(text, cls) {
    const log = $("ctl-log"), d = document.createElement("div");
    d.textContent = text;
    if (cls) d.className = cls;
    log.appendChild(d);
    while (log.childElementCount > 500) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  const ctlMsg = (t) => { $("ctl-msg").textContent = t; };
  let ctlLastSent = "";
  const CTL_CLS = { error: "err", alarm: "err", msg: "dim", greeting: "dim" };
  function ctlLine(ev) {
    if (ev.type === "status") {
      $("ctl-state").textContent = ev.line;
      const m = ev.MPos || (ev.WPos && ev.WCO ? ev.WPos.map((v, i) => v + ev.WCO[i]) : null);
      if (m) CTL.mpos = m;
      CTL.state = ev.state;
      if (FT.homing && ev.state === "Home") FT.homing = "on";
      else if (FT.homing === "on" && ev.state === "Idle") { FT.homing = null; ctlHomed(" on the pendant"); }
      else if (FT.homing && ev.state === "Alarm") FT.homing = null;
      dro();
      if (FJ.job) fjStatus(ev);
      return;
    }
    if (ev.type === "msg" && FJ.job && !/^(INFO|DBG|WARN|ERR|VRB|Homed)\b/.test(ev.text)) {   // a (MSG, ...) from the file
      FJ.lastMsg = ev.text.replace(/^MSG,\s*/, "");   // FluidNC passes "(MSG, text)" on as "MSG, text"
      if (!FJ.job.held) $("job-status").textContent = ev.text;
    }
    if (ev.type === "error" && FJ.job) fjDone(`FluidNC: ${ev.line}${FJ.job.seenSD ? " - the job stopped." : ` (${FJ.job.path})`}`);
    if (ev.type === "msg" && /^Homed:/.test(ev.text)) $("home-status").textContent = `FluidNC ${ev.text}.`;
    if (ev.type === "alarm") { CTL.homed = false; CTL.alarms = (CTL.alarms || 0) + 1; dro(); }
    if (ev.type === "alarm") ctlMsg(`FluidNC ${ev.line}: send $X (Unlock) in the console to carry on.`);
    if (ev.type === "blank" || (ev.type === "text" && ev.line === ctlLastSent)) return;   // the console's echo
    ctlAdd(ev.line, CTL_CLS[ev.type]);
  }
  // the motors -> the page's pose (mm from the parked pose): the pose at boot + each axis' first motor's steps / steps per
  // mm, held inside the travel (past a hard stop the real machine would stall; a note says so). Once a frame (tick).
  function ctlRaw() {                               // the motors' pose, not held inside the travel
    return CTL.recRaw ? CTL.recRaw.slice() : ctlLive();   // a video's frame: the pose at its machine time (LR4Demo.ncUntil)
  }
  function ctlLive() {
    return ["x", "y", "z"].map((a, i) => {
      const m = CTL.cfg.pins.motors.find((q) => q.axis === a);
      return CTL.boot[i] + (m ? CTL.sim.motorSteps(m.step) / CTL.cfg.steps[a].to : 0);
    });
  }
  function ctlTick() {
    const sim = CTL.sim;
    if (!sim || !sim.pins || !meta || !CTL.boot) return;
    const t = meta.travel, past = [];
    const p = ctlRaw();
    const q = p.map((v, i) => {
      const r = t["xyz"[i]], c = Math.min(Math.max(v, r[0]), r[1]);
      if (Math.abs(c - v) > 0.5) past.push(`${"XYZ"[i]} ${Math.abs(c - v).toFixed(1)} mm`);
      return c;
    });
    const E = CTL.recRaw ? CTL.recE : abFromMotors(), moved = E && (Math.abs(E.y - AB.E.y) > 1e-4 || Math.abs(E.z - AB.E.z) > 1e-4);
    if (moved) { AB.E = E; abNoteSoon(); }
    if (moved || !CTL.pose || q.some((v, i) => Math.abs(v - CTL.pose[i]) > 1e-3)) {
      const was = CTL.pose;
      CTL.pose = q;
      if (JOB.preview && was) previewEnd("FluidNC moved: the preview ended.");   // the machine wins over the preview
      if (!JOB.preview) move(q);
    }
    if (AB.set.on && AB.geo && Math.abs(Imperfect.tipErr(AB.E, AB.geo, q[0] - t.x[0]).dz - AB.probeDz) > 0.002) ctlProbe();   // the tip's height along a tilted beam
    const warn = past.length ? `Past the hard stop (${past.join(", ")}): the real machine would hit it there. ` +
      "This config.yaml's soft_limits are off, so FluidNC doesn't stop it." : "";
    if (warn ? $("ctl-msg").textContent !== warn : /^Past the hard stop/.test($("ctl-msg").textContent)) ctlMsg(warn);
    // a switch closing flashes it (and its lever) and ticks; opening, a tock. The mask has up to 49 bits (a double): no & / ~ on it,
    // they cut it to 32 bits (the switches' gpios are above 31, so FluidNC mode never clicked before Part 25)
    const pins = sim.pinMask(), was = CTL.pins, bit = (n, g) => Math.floor(n / 2 ** g) % 2 === 1;
    const closed = (g) => bit(pins, g) && !bit(was, g), opened = (g) => !bit(pins, g) && bit(was, g);
    CTL.pins = pins;
    if (pins !== was) {
      CTL.cfg.pins.motors.forEach((m, i) => {
        if (Object.values(m.limits).some(closed)) { clickSwitch(m.axis); delete CTL.rel[i]; }
        if (Object.values(m.limits).some(opened)) CTL.rel[i] = { axis: m.axis, at: p["xyz".indexOf(m.axis)] };
      });
      const pr = CTL.cfg.pins.probe;                 // the bit touching the plate
      if (pr && closed(pr.gpio) && SND.s) SND.s.event("tap");
    }
    // the tock once the lever is back RELEASE_MM from where the pin opened (the simulated pin has no lever travel)
    for (const [i, r] of Object.entries(CTL.rel)) {
      if (Math.abs(p["xyz".indexOf(r.axis)] - r.at) >= Homing.RELEASE_MM) { clickSwitch(r.axis, true); delete CTL.rel[i]; }
    }
  }
  // the switches: each motor's limit pins trip at its axis' end of the travel (neg: travel[0], pos: travel[1], all: the
  // homing end); the probe at the tip on the touch plate (the table top + its thickness) while that's ticked
  // Part 32: each motor from its own side's pose at boot (CTL.bootM; side 2 = side 1 + AB.E), side 2's Y / Z switches
  // stop mm on (abStops)
  function ctlSwitches() {
    const sim = CTL.sim, tr = CTL.cfg, t = meta.travel, h = Homing.settings(CTL.yaml), st = AB.set.on ? abStops() : { y: 0, z: 0 };
    for (const [k, m] of tr.pins.motors.entries()) {
      sim.addMotor(m.step, m.dir);
      const off = m.motor === 1 && (m.axis === "y" || m.axis === "z") ? st[m.axis] : 0;
      for (const [kind, g] of Object.entries(m.limits)) {
        const below = kind === "neg" || (kind === "all" && !h[m.axis].positive);
        sim.setSwitch(g, m.step, m.dir, (t[m.axis][below ? 0 : 1] + off - CTL.bootM[k]) * tr.steps[m.axis].to, below);
      }
    }
    ctlProbe();
  }
  function ctlProbe() {
    const sim = CTL.sim, pr = CTL.cfg && CTL.cfg.pins.probe, z = CTL.cfg && CTL.cfg.pins.motors.find((m) => m.axis === "z");
    if (!sim || !pr || !z) return;
    if (!CTL.jobPlate && !HAND.plate) { sim.clearSwitch(pr.gpio); return; }
    const tp = touchPlate(), top = tp.stock + tp.plate;   // the plate's top above the table (the job's stock, or under the bit)
    // As built: the tip sits dz off motor0's height along a tilted beam (at the tip's X now)
    AB.probeDz = AB.set.on && AB.geo && CTL.pose ? Imperfect.tipErr(AB.E, AB.geo, CTL.pose[0] - meta.travel.x[0]).dz : 0;
    sim.setSwitch(pr.gpio, z.step, z.dir, (top - meta.tip_above_table - AB.probeDz - CTL.boot[2]) * CTL.cfg.steps.z.to, true);
  }
  // $H, or with a homing order (a video's HOMING=z,x,y) FluidNC's axis homing commands one after another: $HZ, $HX, $HY
  async function ctlHome() {
    if (!CTL.sim) return;
    const cmds = Homing.commands(HOME.order);
    $("home-status").textContent = `FluidNC is homing (${cmds.join(", ")})…`;
    CTL.homing = true;
    for (const c of cmds) {
      ctlLastSent = c;
      ctlAdd("> " + c, "in");
      let r;
      const al = CTL.alarms || 0;                    // an ALARM (e.g. 9, homing fail) can come with an ok: stop there
      try { r = await CTL.sim.command(c, 600000); } catch (e) { CTL.homing = false; return; }
      if (!r.ok || (CTL.alarms || 0) > al) {
        CTL.homing = false;
        $("home-status").textContent = `Homing failed (${c}: ${r.ok ? "alarm" : `error:${r.code}`}). Send $X to unlock.`;
        return;
      }
    }
    CTL.homing = false;
    ctlHomed("");
  }
  function ctlHomed(by) {                            // $H finished (from here, or from the pendant: by = " on the pendant")
    CTL.homed = true;
    ctlTick();
    CTL.homePose = { x: CTL.pose[0], y: CTL.pose[1], z: CTL.pose[2] };   // the job's start (jobStartAt)
    CTL.runFrom = null;
    $("home-status").textContent = `Homed by FluidNC ($H${by}): MPos is mpos_mm at the pulled-off spot.`;
    dro();
    jobSetup(JOB.pageJob);
  }
  // the jog pad: $J=G91 by the step at the feed (Z at most its max rate); FluidNC queues them; ■ cancels (0x85)
  function ctlJogPad(axis, sign) {
    if (!CTL.sim) return;
    const step = Number($("jog-step").value), a = axis.toLowerCase();
    const f = Math.min(Number($("jog-feed").value), CTL.cfg.rates[a] || 1000);
    CTL.sim.command(`$J=G91 G21 ${axis}${sign * step} F${f}`).then((r) => {
      if (!r.ok) ctlAdd(`jog ${axis}${sign > 0 ? "+" : "-"}: error:${r.code}${r.code === 15 ? " (past the travel)" : ""}`, "err");
    }).catch(() => {});
  }
  function ctlStop() {
    if (FJ.job) fjDone("FluidNC stopped.");
    if (CTL.sim) CTL.sim.stop();
    Object.assign(CTL, { sim: null, mpos: null, state: "", pins: 0, pose: null, homed: false, homePose: null, runFrom: null });
    window.LR4FluidNC = null;
    $("ctl-state").textContent = "";
  }
  async function ctlBoot() {                         // (re)start FluidNC with the config.yaml in use
    const me = CTL.booting = {};
    ctlStop();
    ctlMsg("Starting FluidNC…");
    let tr;
    let yaml;
    try {
      yaml = (await yamlText()).text;
      if (AB.set.on && AB.set.pull) yaml = Imperfect.withPulloffs(yaml, AB.set.pull);   // As built: a video's per-motor pulloffs
      tr = SimConfig.translate(yaml);
    }
    catch (e) { if (CTL.booting === me) { CTL.booting = null; ctlMsg(`No config.yaml for FluidNC: ${e.message}`); } return; }
    if (CTL.booting !== me) return;
    ctlAdd(`Starting FluidNC with ${yamlBase && /^From your/.test(yamlBase.note) ? "your" : "V1E's JP3_LR"} config.yaml…`, "dim");
    let sim;
    let files = {}, dirs = [];                       // the SD card and the Flash, as kept in this browser
    try {
      files = Object.assign(SdCard.files(await SdCard.store.all()), SdCard.flash.files(await SdCard.flash.store.all()));
      dirs = [...SdCard.dirs(await SdCard.store.dirs()), ...SdCard.flash.dirs(await SdCard.flash.store.dirs())];
    } catch (e) { /* no storage: empty */ }
    Object.assign(files, { "/native_localfs/config.yaml": yaml, "/native_localfs/sim_config.yaml": tr.text,
      "/native_nvs/Config.Filename": "sim_config.yaml" });   // it boots the translated copy; config.yaml is the real one
    try { sim = await FluidNCSim.start({ files, dirs, onLine: ctlLine }); }
    catch (e) {
      if (CTL.booting === me) { CTL.booting = null; ctlAdd("FluidNC didn't start: " + e.message, "err"); ctlMsg("FluidNC didn't start."); }
      return;
    }
    if (CTL.booting !== me) { sim.stop(); return; }
    CTL.booting = null;
    Object.assign(CTL, { sim, cfg: tr, yaml, boot: [HOME.pose.x, HOME.pose.y, HOME.pose.z] });
    // each motor where its side is (Part 32: side 2 = side 1 + AB.E: the machine as it is at this power-up)
    CTL.bootM = tr.pins.motors.map((m) => CTL.boot["xyz".indexOf(m.axis)] + (AB.set.on && m.motor === 1 && (m.axis === "y" || m.axis === "z") ? AB.E[m.axis] : 0));
    window.LR4FluidNC = sim;
    try {                                            // SD card / Flash files added while it booted (it boots with the page)
      const now = Object.assign(SdCard.files(await SdCard.store.all()), SdCard.flash.files(await SdCard.flash.store.all()));
      for (const [p, bytes] of Object.entries(now)) if (!(p in files)) {
        try { sim.FS.mkdirTree(p.slice(0, p.lastIndexOf("/"))); } catch (e) { /* there */ }
        sim.writeFile(p, bytes);
      }
    } catch (e) { /* no storage */ }
    if (CTL.sim !== sim) return;                     // restarted meanwhile
    ftStart(sim);                                    // the pendant (re)connects to this FluidNC
    uiRefresh();                                     // Web UIs can open now
    if (!sim.pins) ctlAdd("This FluidNC build has no simulated switches (rebuild web/fluidnc).", "err");
    ctlSwitches();
    ncScale(Number($("ctl-speed").value));
    await sim.command("$RI=50").catch(() => {});
    sim.realtime("?");
    $("home-status").textContent = "Not homed: FluidNC doesn't know where the machine is until it homes. Its MPos " +
      "counts from wherever the machine was when it started.";
    ctlMsg("FluidNC is running." +
      (tr.dropped.length ? ` Left out of the simulator's copy: ${tr.dropped.join(", ")}.` : ""));
    const i = sim.info, src = $("ctl-src");
    src.innerHTML = "";
    src.append(`FluidNC ${i.branch || ""} ${String(i.commit || "").slice(0, 8)}${i.dirty ? " (local build)" : ""}, GPL-3.0: `);
    for (const [t, href] of [["source", i.source], ["license", "fluidnc/LICENSE"]]) {
      const a = document.createElement("a");
      a.textContent = t; a.href = href; a.target = "_blank"; a.rel = "noopener";
      src.append(a, t === "source" ? " · " : "");
    }
  }
  function ctlConfigChanged() {                      // a new size or config.yaml: restart FluidNC with it
    if (!CTL.sim) return;
    yamlText().then((r) => {
      if (CTL.sim && SimConfig.translate(r.text).text !== CTL.cfg.text) {
        ctlAdd("New size / config.yaml: restarting FluidNC.", "dim");
        ctlBoot();
      }
    }).catch(() => {});
  }
  function ftStart(sim) {
    if (!pendantOn() || !sim) return;
    if (FT.ft && !FT.ft.stopped) { FT.ft.setFluidNC(sim); return; }
    if (FT.starting || !window.FluidTouchSim) return;
    FT.starting = FluidTouchSim.start({ fluidnc: sim, onCommand: ftCommand, onPrint: (l) => { FT.log.push(l); if (FT.log.length > 300) FT.log.shift(); },
      onRestart: () => { ftStop(); if (ftEnd()) ftStart(ftEnd()); } })   // ESP.restart from its settings
      .then((ft) => {
        if (!ftEnd()) { ft.stop(); return; }
        FT.ft = ft; FT.frame = FT.popFrame = -1;
        ft.setFluidNC(ftEnd());                      // FluidNC may have restarted meanwhile
        $("ft-pop-btn").disabled = false;
        pendantScreen(true);
      })
      .catch((e) => ctlAdd("FluidTouch (the pendant) didn't start: " + e.message, "err"))
      .finally(() => { FT.starting = null; });
  }
  function ftStop() {
    if (FT.ft) FT.ft.stop();
    Object.assign(FT, { ft: null, drag: null, poker: null });
    $("ft-pop-btn").disabled = true;
    $("ft-pop").hidden = true;
    pendantScreen(true);
  }
  function ftCommand(text) {                         // what FluidTouch sends, before FluidNC gets it
    const t = text.trim();
    if (/^\$H$/i.test(t)) {                         // Home All: the page follows it in the status reports (ctlLine)
      FT.homing = "sent"; CTL.homed = false;
      $("home-status").textContent = "FluidNC is homing ($H from the pendant)…";
      return null;
    }
    const m = /^\$SD\/Run=(\S+)/i.exec(t);
    return m ? fjFromPendant(m[1]).catch(() => {}) : null;
  }
  const ftEnd = () => CTL.sim;                       // what the pendant talks to (Part 34: only FluidNC)

  function pendantSet(on) {                          // the option: the pendant model + FluidTouch, or neither
    $("ft-on").checked = on;
    $("ft-pop-btn").hidden = !on;
    try { localStorage.setItem("lr4-pendant", on ? "1" : "0"); } catch (e) { /* not kept */ }
    if (on) ftStart(CTL.sim);
    else ftStop();
    if (meta) { applyVisibility(); renderBom(); }
  }
  {
    let k = null;
    try { k = localStorage.getItem("lr4-pendant"); } catch (e) { /* default */ }
    $("ft-on").checked = k === "1";                   // off unless turned on: most people have no pendant
    $("ft-pop-btn").hidden = !pendantOn();
    $("ft-on").addEventListener("change", () => pendantSet(pendantOn()));
  }
  // the page is built (scene.js load()): FluidNC starts with the config.yaml in use. It is the only machine (Part 34,
  // user 2026-10-24): where it can't run, that's an error the page shows - Preview still plays jobs.
  function ctlStartup() {
    if (!window.crossOriginIsolated) {
      ctlMsg("Error: FluidNC can't run here: this page isn't cross-origin isolated (reload once; private windows in " +
        "some browsers have no service workers). The machine can't move; Run G-code > Preview still plays a job.");
      $("ctl-msg").classList.add("err");
      return;
    }
    if (!CTL.sim && !CTL.booting) ctlBoot();
  }
  function setupController() {
    const sendLine = (text) => {
      if (!CTL.sim || !text.trim()) return;
      ctlLastSent = text.trim();
      ctlAdd("> " + ctlLastSent, "in");
      if (/^\$(SD|LocalFS|Upload)\b/i.test(ctlLastSent)) {   // its card / Flash changed?
        const back = () => { sdSyncBack(); flashSyncBack(); };
        CTL.sim.command(ctlLastSent).then(back, back);
      }
      else CTL.sim.send(ctlLastSent);
    };
    $("ctl-form").addEventListener("submit", (e) => { e.preventDefault(); sendLine($("ctl-in").value); $("ctl-in").value = ""; });
    for (const b of document.querySelectorAll("#ctl-box [data-ctl]")) b.addEventListener("click", () => sendLine(b.dataset.ctl));
    for (const b of document.querySelectorAll("#ctl-box [data-rt]"))
      b.addEventListener("click", () => CTL.sim && CTL.sim.realtime(/^\d+$/.test(b.dataset.rt) ? Number(b.dataset.rt) : b.dataset.rt));
    setInterval(() => { if (CTL.sim && !document.hidden) CTL.sim.realtime("?"); }, 500);   // auto reports only come on a change
    $("ctl-speed").addEventListener("change", () => ncScale(Number($("ctl-speed").value)));
    for (const b of document.querySelectorAll("#pos-jog [data-jog]"))
      b.addEventListener("click", () => ctlJogPad(b.dataset.jog[0], b.dataset.jog[1] === "+" ? 1 : -1));
    $("jog-stop").addEventListener("click", () => CTL.sim && CTL.sim.realtime(0x85));
  }
  setupController();
  // for tests/test_page_fluidnc.js: the controller's state and the model's pose (mm from the parked pose)
  window.LR4Ctl = { mode: () => CTL.mode, state: () => CTL.state, mpos: () => CTL.mpos, boot: () => CTL.boot,
    cfg: () => CTL.cfg, pose: () => HOME.pose && [HOME.pose.x, HOME.pose.y, HOME.pose.z], travel: () => meta && meta.travel,
    tip: () => meta && meta.tip_above_table, TOUCH_PLATE, sync: () => ctlTick(), homed: () => CTL.homed,
    plate: () => !!(CTL.jobPlate || HAND.plate), stop: () => ctlStop(), start: () => ctlBoot() };   // stop / start: FluidNC down and up (tests)

