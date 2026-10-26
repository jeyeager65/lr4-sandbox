// lr4-sandbox page, part 5 of 14: config.yaml, SD / Flash folders, Web UIs, the Controller (FluidNC), the pendant.
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
  // ---- folders on the SD card and the Flash (user 2026-10-23; one folder at a time since 2026-10-25, the lists can be
  // long): the list shows the current folder (folders first, then files); a folder's name goes into it, files dropped
  // on it go into it (onDropIn), ✕ deletes it and everything in it. The folder bar above (cardPath) shows where you
  // are and goes back up; Add / New folder go into the current folder (as on the machine: no search across folders). ----
  // cardTree(list, files, dirs, st = { cur }, fileRow(r) -> row, onDelDir(path), refresh, onDropIn(files))
  function cardTree(list, files, dirs, st, fileRow, onDelDir, refresh, onDropIn) {
    const all = new Set(dirs);
    for (const r of files) for (const p of SdCard.parents(r.path)) all.add(p);
    if (st.cur && !all.has(st.cur)) st.cur = "";
    const parent = (p) => p.slice(0, p.lastIndexOf("/"));
    const base = (p) => p.slice(p.lastIndexOf("/") + 1);
    const inside = (d) => files.filter((f) => f.path.startsWith(d + "/")).length;
    list.innerHTML = "";
    delete list.dataset.empty;
    for (const d of [...all].filter((x) => parent(x) === st.cur).sort()) {
      const row = document.createElement("div"), name = document.createElement("button"), n = document.createElement("small");
      row.className = "sd-row sd-dir";
      if (list.getAttribute("role") === "listbox") row.setAttribute("role", "option");
      name.type = "button"; name.className = "sd-name";
      name.textContent = base(d) + "/";
      name.title = `Go into ${d}`;
      name.addEventListener("click", () => { st.cur = d; refresh(); });
      const k = inside(d);
      n.textContent = k ? `${k} file${k === 1 ? "" : "s"}` : "empty";
      if (onDropIn) {                                 // drop files on a folder: into it
        row.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); row.classList.add("drop-in"); });
        row.addEventListener("dragleave", () => row.classList.remove("drop-in"));
        row.addEventListener("drop", (e) => {
          e.preventDefault(); e.stopPropagation(); row.classList.remove("drop-in");
          if (!e.dataTransfer.files.length) return;
          st.cur = d;
          onDropIn([...e.dataTransfer.files]);
        });
      }
      row.append(name, n, rowMore(d, [[`Delete ${base(d)}/ and everything in it`, async () => { if (await askBox({ title: `Delete ${d}?`, text: "The folder and everything in it go.", ok: "Delete" })) onDelDir(d); }]]));
      list.appendChild(row);
    }
    for (const r of files.filter((f) => parent(f.path) === st.cur)) list.appendChild(fileRow(r));
    if (!list.childElementCount) list.dataset.empty = st.cur ? "This folder is empty: drop files here or Add them." : "No files yet.";
  }
  // ⋯ on a row: the rarely used actions (Download, Delete) in one small menu under it, so the name keeps the room.
  // items = [[label, run], ...]; one #row-menu for every list; outside / Esc closes it
  function rowMore(what, items) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "sd-act sd-more"; b.textContent = "⋯";
    b.title = `More for ${what}`; b.setAttribute("aria-label", b.title); b.setAttribute("aria-haspopup", "menu");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = $("row-menu");
      if (!m.hidden && m.owner === b) { m.hidden = true; return; }
      m.textContent = ""; m.owner = b;
      for (const [label, run] of items) {
        const it = document.createElement("button");
        it.type = "button"; it.setAttribute("role", "menuitem"); it.textContent = label;
        it.addEventListener("click", () => { m.hidden = true; run(); });
        m.append(it);
      }
      m.hidden = false;
      const r = b.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
      m.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
      m.style.top = `${r.bottom + hh + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - hh - 4)}px`;
    });
    return b;
  }
  document.addEventListener("pointerdown", (e) => { const m = $("row-menu"); if (!m.hidden && !e.target.closest("#row-menu, .sd-more")) m.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("row-menu").hidden = true; });
  // a file name that wraps after _ . - (a <wbr> after each), not mid-word; its textContent stays the name
  function breakable(el, text) {
    el.textContent = "";
    for (const part of text.split(/(?<=[_.-])/)) el.append(part, document.createElement("wbr"));
  }
  // the folder bar over a list: the card's name (the top) / each folder down to the current one, each a button back up
  function cardPath(nav, label, st, refresh) {
    nav.textContent = "";
    const parts = st.cur ? st.cur.split("/").slice(1) : [];
    const step = (text, path) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = text;
      if (path === st.cur) { b.setAttribute("aria-current", "location"); b.title = "Files and New folder go in here"; }
      else { b.title = `Go to ${path || "the top"}`; b.addEventListener("click", () => { st.cur = path; refresh(); }); }
      nav.append(b);
    };
    step("/", "");
    parts.forEach((q, i) => { step(q, "/" + parts.slice(0, i + 1).join("/")); nav.append(document.createTextNode("/")); });
    nav.title = `${label}${st.cur || "/"}: Add files and New folder go here`;
  }
  async function cardMkdir(card, st, refresh, status) {   // New folder: in the folder picked, or at the top
    const name = (await askBox({ title: "New folder", text: `In ${st.cur || "the top"}. Its name:`, value: "" }) || "").trim();
    if (!name) return;
    const clean = SdCard.cleanName(name).replace(/\./g, "_");
    const path = `${st.cur}/${clean}`;
    await card.store.mkdir(path);
    card.mkdirLive(CTL.sim, path);
    st.cur = path;
    $(status).textContent = `Made ${path}.`;
    refresh();
  }
  FLASH.tree = { cur: "" };
  async function flashRefresh() {                    // the Flash's files and folders under the controller
    let recs = [], dirs = [];
    try { recs = await SdCard.flash.store.all(); dirs = await SdCard.flash.store.dirs(); } catch (e) { /* none */ }
    cardTree($("flash-list"), recs, dirs, FLASH.tree, (r) => {
      const row = document.createElement("div"), name = document.createElement("span");
      row.className = "sd-row"; name.className = "sd-name"; name.title = r.path;
      breakable(name, r.path.split("/").pop() + (r.path === FLASH_YAML ? (r.origin === "user" ? " (yours)" : " (V1E's)") : ""));
      const size = document.createElement("small"), items = [["Download", () => save(r.path.split("/").pop(), r.bytes, "flash-status")]];
      size.textContent = r.bytes.length >= 1e6 ? `${(r.bytes.length / 1e6).toFixed(1)} MB` : `${Math.ceil(r.bytes.length / 1e3)} KB`;
      if (r.path !== FLASH_YAML)                     // config.yaml stays: the page boots FluidNC with it
        items.push(["Delete", async () => { await SdCard.flash.store.remove(r.path); SdCard.flash.removeLive(CTL.sim, r.path); flashRefresh(); }]);
      row.append(name, size, rowMore(r.path, items));
      return row;
    }, async (d) => {
      if (recs.some((r) => r.path === FLASH_YAML && r.path.startsWith(d + "/"))) return;
      await SdCard.flash.store.removeTree(d); SdCard.flash.removeTreeLive(CTL.sim, d); flashRefresh();
    }, flashRefresh, flashAdd);
    cardPath($("flash-path"), "Flash", FLASH.tree, flashRefresh);
    uiRefresh();
  }
  async function flashAdd(files) {
    const added = [];
    for (const f of files) {
      const path = FLASH.tree.cur + SdCard.pathOf(f.name);
      if (path === FLASH_YAML || path === "/sim_config.yaml") { $("flash-status").textContent = `${path} is the page's: load your config.yaml under Configure > Get the files.`; continue; }
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
      if (ev.WCO) CTL.wco = ev.WCO;                  // FluidNC sends WCO / Ov every few reports and on a change
      if (ev.Ov) CTL.ov = ev.Ov;
      const m = ev.MPos || (ev.WPos && CTL.wco ? ev.WPos.map((v, i) => v + CTL.wco[i]) : null);
      if (m) CTL.mpos = m;
      CTL.state = ev.state;
      runState();
      if ($("con-status").checked) ctlAdd(ev.line, "dim");
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
    if (ev.type === "msg" && /^Homed:/.test(ev.text)) {
      $("home-status").textContent = `FluidNC ${ev.text}.`;
      if (SLIP.st) LostSteps.homed(SLIP.st, ev.text.slice(6).toLowerCase());   // squared again: no rack from slips (Part 44a)
    }
    if (ev.type === "alarm") { CTL.homed = false; CTL.axesHomed = null; CTL.alarms = (CTL.alarms || 0) + 1; dro(); }
    if (ev.type === "alarm") { ctlMsg(`FluidNC ${ev.line}: Unlock ($X) to carry on.`); alarmShow(ev.code); }
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
      const k = CTL.cfg.pins.motors.findIndex((q) => q.axis === a), m = CTL.cfg.pins.motors[k];
      return CTL.boot[i] + (m ? CTL.sim.motorSteps(m.step) / CTL.cfg.steps[a].to - (CTL.lost[k] || 0) : 0);
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
      const off = m.motor === Imperfect.side2Motor(AB.set) && (m.axis === "y" || m.axis === "z") ? st[m.axis] : 0;   // the Max end's motor
      for (const [kind, g] of Object.entries(m.limits)) {
        const below = kind === "neg" || (kind === "all" && !h[m.axis].positive);
        sim.setSwitch(g, m.step, m.dir, (t[m.axis][below ? 0 : 1] + off - CTL.bootM[k] + (CTL.lost[k] || 0)) * tr.steps[m.axis].to, below);
      }
    }
    ctlProbe();
  }
  function ctlProbe() {
    const sim = CTL.sim, pr = CTL.cfg && CTL.cfg.pins.probe, kz = CTL.cfg ? CTL.cfg.pins.motors.findIndex((m) => m.axis === "z") : -1, z = kz >= 0 ? CTL.cfg.pins.motors[kz] : null;
    if (!sim || !pr || !z) return;
    if (!CTL.jobPlate && !HAND.plate) { sim.clearSwitch(pr.gpio); return; }
    const tp = touchPlate(), top = tp.stock + tp.plate;   // the plate's top above the table (the job's stock, or under the bit)
    // As built: the tip sits dz off motor0's height along a tilted beam (at the tip's X now)
    AB.probeDz = AB.set.on && AB.geo && CTL.pose ? Imperfect.tipErr(AB.E, AB.geo, CTL.pose[0] - meta.travel.x[0]).dz : 0;
    sim.setSwitch(pr.gpio, z.step, z.dir, (top - meta.tip_above_table - AB.probeDz - CTL.boot[2] + (CTL.lost[kz] || 0)) * CTL.cfg.steps.z.to, true);
  }
  // $H, or with a homing order (a video's HOMING=z,x,y) FluidNC's axis homing commands one after another: $HZ, $HX, $HY
  // axis: one axis only ($HX ...; Run's Home X / Y / Z): the machine counts as homed only once $H (or all three) did it
  async function ctlHome(axis) {
    if (!CTL.sim) return;
    const cmds = axis ? ["$H" + axis] : Homing.commands(HOME.order);
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
    if (axis) {
      CTL.axesHomed = new Set([...(CTL.axesHomed || []), axis]);
      if (CTL.axesHomed.size < 3) { $("home-status").textContent = `Homed ${[...CTL.axesHomed].join(", ")} ($H${axis}); home the rest (or All) before a job.`; return; }
    }
    ctlHomed("");
  }
  function ctlHomed(by) {                            // $H finished (from here, or from the pendant: by = " on the pendant")
    CTL.homed = true;
    CTL.axesHomed = new Set(["X", "Y", "Z"]);
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
  function ctlJogBy(d) {                             // one jog by d = [x, y, z] mm (VR's core handle, let go)
    if (!CTL.sim) return;
    const f = Math.min(Number($("jog-feed").value), ...["x", "y", "z"].filter((a, i) => Math.abs(d[i]) > 0.05).map((a) => CTL.cfg.rates[a] || 1000));
    CTL.sim.command(`$J=G91 G21 X${d[0].toFixed(2)} Y${d[1].toFixed(2)} Z${d[2].toFixed(2)} F${f}`).then((r) => {
      if (!r.ok) ctlAdd(`jog: error:${r.code}${r.code === 15 ? " (past the travel)" : ""}`, "err");
    }).catch(() => {});
  }
  function ctlStop() {
    if (FJ.job) fjDone("FluidNC stopped.");
    if (CTL.sim) CTL.sim.stop();
    Object.assign(CTL, { sim: null, mpos: null, state: "", pins: 0, pose: null, homed: false, homePose: null, runFrom: null,
      axesHomed: null, wco: null, ov: null });
    alarmShow(null);
    runState();
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
    CTL.lost = tr.pins.motors.map(() => 0); SLIP.st = null;   // where the machine is now: nothing lost (Part 44a)
    CTL.bootM = tr.pins.motors.map((m) => CTL.boot["xyz".indexOf(m.axis)] + (AB.set.on && m.motor === Imperfect.side2Motor(AB.set) && (m.axis === "y" || m.axis === "z") ? AB.E[m.axis] : 0));
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
    if (t === "~" && FJ.job && touchBusy()) return touchSettled();   // the pendant's cycle start waits for the plate too
    const m = /^\$SD\/Run=(\S+)/i.exec(t);
    return m ? fjFromPendant(m[1]).catch(() => {}) : null;
  }
  const ftEnd = () => CTL.sim;                       // what the pendant talks to (Part 34: only FluidNC)

  function pendantSet(on) {                          // the option: the pendant model + FluidTouch, or neither
    $("ft-on").checked = on;
    $("ft-pop-btn").hidden = !on; $("ft-off-note").hidden = on;
    try { MS.set("lr4-pendant", on ? "1" : "0"); } catch (e) { /* not kept */ }
    if (on) ftStart(CTL.sim);
    else ftStop();
    if (meta) { applyVisibility(); renderBom(); }
  }
  {
    let k = null;
    try { k = MS.get("lr4-pendant"); } catch (e) { /* default */ }
    $("ft-on").checked = k === "1";                   // off unless turned on: most people have no pendant
    $("ft-pop-btn").hidden = !pendantOn(); $("ft-off-note").hidden = pendantOn();
    $("ft-on").addEventListener("change", () => pendantSet(pendantOn()));
  }
  // the page is built (scene.js load()): FluidNC starts with the config.yaml in use. It is the only machine (Part 34,
  // user 2026-10-24): where it can't run, that's an error the page shows - Preview still plays jobs.
  function ctlStartup() {
    runState();
    if (!window.crossOriginIsolated) {
      ctlMsg("Error: FluidNC can't run here: this page isn't cross-origin isolated (reload once; private windows in " +
        "some browsers have no service workers). The machine can't move; 👁 Preview on a file still plays it.");
      $("ctl-msg").classList.add("err");
      return;
    }
    if (!CTL.sim && !CTL.booting) ctlBoot();
  }
  function ctlSend(text) {                           // a line to FluidNC, as typed in the console (echoed there)
    if (!CTL.sim || !text.trim()) return;
    ctlLastSent = text.trim();
    ctlAdd("> " + ctlLastSent, "in");
    if (/^\$(SD|LocalFS|Upload)\b/i.test(ctlLastSent)) {   // its card / Flash changed?
      const back = () => { sdSyncBack(); flashSyncBack(); };
      CTL.sim.command(ctlLastSent).then(back, back);
    }
    else CTL.sim.send(ctlLastSent);
  }
  function setupController() {
    $("ctl-form").addEventListener("submit", (e) => { e.preventDefault(); ctlSend($("ctl-in").value); $("ctl-in").value = ""; });
    for (const b of document.querySelectorAll("#ctl-box [data-ctl]")) b.addEventListener("click", () => ctlSend(b.dataset.ctl));
    setInterval(() => { if (CTL.sim && !document.hidden) CTL.sim.realtime("?"); }, 500);   // auto reports only come on a change
    $("ctl-speed").addEventListener("change", () => ncScale(Number($("ctl-speed").value)));
    for (const b of document.querySelectorAll("#pos-jog [data-jog]"))
      b.addEventListener("click", () => ctlJogPad(b.dataset.jog[0], b.dataset.jog[1] === "+" ? 1 : -1));
    $("jog-stop").addEventListener("click", () => CTL.sim && CTL.sim.realtime(0x85));
  }
  setupController();

  // ---- Run's left column (Part 36): the state pill + its Controller menu, Hold / Resume + Stop (a job on FluidNC),
  // the DRO (click a value, type, Enter = G90 G0 / G53 G0), Home / Zero per axis, FluidNC's feed / rapid overrides
  // (realtime 0x90-0x97), the jog step chips; alarms put a card over the view with the fix ----
  const ALARMS = {                                   // FluidNC's alarm codes -> what happened, what to do
    1: ["Hard limit", "A limit switch tripped while moving. Unlock, jog off the switch, then home."],
    2: ["Soft limit", "The move goes past the travel. Unlock and check the job's work zero."],
    3: ["Reset while moving", "A reset stopped the machine mid-move, so the position may be off. Unlock, then home."],
    4: ["Probe fail", "The probe was already touching before the probe move. Check the touch plate and its clip."],
    5: ["Probe fail", "The probe didn't touch within its distance. Is the plate under the bit and the clip on?"],
    6: ["Homing fail", "A reset during homing. Unlock, then home again."],
    7: ["Homing fail", "The door opened during homing."],
    8: ["Homing fail", "The switch didn't release on the pull-off. Check the switch and its pulloff_mm."],
    9: ["Homing fail", "A switch didn't trip within the search distance. Check the switch and its wiring, then home again."],
    10: ["Spindle control", "The spindle didn't respond."],
    11: ["Control pin on", "A control pin (door, hold, reset) was on at start-up."],
    12: ["Ambiguous switch", "Two axes share a switch that's already pressed. Jog off it, then home."],
    13: ["Hard stop", "The machine was stopped hard. Unlock, then home."],
    14: ["Unhomed", "This config.yaml needs homing first. Home all."],
    15: ["Init", "FluidNC didn't start cleanly. Power cycle it."],
  };
  function alarmShow(code) {
    CTL.alarm = code == null ? null : code;
    CTL.alarmSeen = false;
    const card = $("alarm-card");
    card.hidden = code == null;
    if (code == null) return;
    const a = ALARMS[code] || ["Alarm", "Unlock ($X) to carry on."];
    $("alarm-h").textContent = `ALARM ${code} · ${a[0]}`;
    $("alarm-msg").textContent = a[1];
    runState();
  }
  function runState() {                              // the pill, Hold / Stop and the overrides, from the state
    const st = CTL.state || (CTL.sim ? "" : CTL.booting ? "Starting" : "Off"), job = FJ.job, pill = $("st-pill");
    const held = !!job && (job.held || /^Hold/.test(st));
    pill.textContent = `${st || "–"}${CTL.homed && st !== "Alarm" ? " · homed" : ""} ▾`;
    pill.className = "st-pill" + (st === "Alarm" ? " alarm" : /^(Run|Jog|Home)/.test(st) ? " run" : /^Hold|Door/.test(st) ? " hold" : "");
    for (const b of document.querySelectorAll("[data-run=hold]")) {
      b.disabled = !job;
      b.textContent = b.id ? (held ? "▶ Resume" : "❚❚ Hold") : held ? "▶" : "❚❚";
      b.title = held ? "Resume (cycle start ~)" : "Feed hold (!)";
      b.classList.toggle("pri", !!job && !held);
    }
    for (const b of document.querySelectorAll("[data-run=stop]")) b.disabled = !job;
    const ov = CTL.ov || [100, 100, 100];
    $("ov-feed").textContent = `${ov[0]}%`;
    $("ov-feed").classList.toggle("on", ov[0] !== 100);
    for (const b of document.querySelectorAll("#ov-rapid button")) b.setAttribute("aria-pressed", String(+b.dataset.pct === ov[1]));
    if (CTL.alarm != null && st === "Alarm") CTL.alarmSeen = true;   // (the ALARM line can beat the state's report)
    if (CTL.alarm != null && CTL.alarmSeen && st && st !== "Alarm") alarmShow(null);   // unlocked / reset: the card goes
  }
  function runHold() {
    if (!CTL.sim || !FJ.job) return;
    if (FJ.job.held || /^Hold/.test(CTL.state)) resumeWhenSettled(() => CTL.sim && CTL.sim.realtime("~"));
    else CTL.sim.realtime("!");
  }
  function runStop() {                               // Stop = soft reset: FluidNC drops the job (ALARM:3 if it was moving)
    if (CTL.sim && FJ.job) { CTL.sim.realtime(0x18); fjDone("Stopped (reset)."); }
  }
  const ctlZero = (axes) => ctlSend(`G10 L20 P1 ${[...axes].map((a) => a + "0").join(" ")}`);
  const DRO_HINT = "mm · click a value to move there";
  function droEdit(b) {                              // click a value: type where to go; Enter sends it, Esc / away cancels
    if (!CTL.sim || FJ.job || JOB.preview || b.hidden) return;
    const inp = document.createElement("input"), hint = $("dro-hint");
    inp.className = "dv-in"; inp.inputMode = "decimal"; inp.autocomplete = "off";
    inp.value = b.textContent === "–" ? "" : String(Number(b.textContent));
    inp.setAttribute("aria-label", `${b.dataset.k === "m" ? "Machine" : "Work"} ${b.dataset.ax}, mm`);
    const ok = () => inp.value.trim() !== "" && Number.isFinite(Number(inp.value));
    const cmd = () => `${b.dataset.k === "m" ? "G53 G0" : "G90 G0"} ${b.dataset.ax}${Number(inp.value)}`;
    const say = () => { hint.textContent = ok() ? `Enter = ${cmd()} · Esc cancels` : "type mm · Esc cancels"; hint.classList.add("on"); };
    const done = (go) => {
      if (!inp.isConnected) return;
      if (go && ok()) ctlSend(cmd());
      inp.remove(); b.hidden = false;
      hint.textContent = DRO_HINT; hint.classList.remove("on");
      if (go) b.focus();
    };
    inp.addEventListener("input", say);
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); done(true); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
    });
    inp.addEventListener("blur", () => done(false));
    b.hidden = true; b.after(inp);
    inp.focus(); inp.select(); say();
  }
  function popToggle(btn, pop, on) {                 // a small menu under its button; outside / Esc closes it
    on = on === undefined ? pop.hidden : on;
    pop.hidden = !on;
    btn.setAttribute("aria-expanded", String(on));
  }
  {
    for (const b of document.querySelectorAll("#dro .dv")) b.addEventListener("click", () => droEdit(b));
    for (const b of document.querySelectorAll("[data-home]")) b.addEventListener("click", () => ctlHome(b.dataset.home));
    for (const b of document.querySelectorAll("[data-zero]")) b.addEventListener("click", () => ctlZero(b.dataset.zero));
    for (const b of document.querySelectorAll("[data-ov]")) b.addEventListener("click", () => CTL.sim && CTL.sim.realtime(Number(b.dataset.ov)));
    for (const b of document.querySelectorAll("[data-run]")) b.addEventListener("click", () =>
      ({ hold: runHold, stop: runStop, home: () => ctlHome(), zero: () => ctlZero("XYZ") })[b.dataset.run]());
    for (const b of document.querySelectorAll("#jog-steps [data-step]")) b.addEventListener("click", () => {
      $("jog-step").value = b.dataset.step;
      for (const q of document.querySelectorAll("#jog-steps [data-step]")) q.setAttribute("aria-pressed", String(q === b));
    });
    const pill = $("st-pill"), menu = $("st-menu");
    pill.addEventListener("click", () => popToggle(pill, menu));
    $("st-unlock").addEventListener("click", () => { popToggle(pill, menu, false); ctlSend("$X"); });
    $("st-reset").addEventListener("click", () => {
      popToggle(pill, menu, false);
      if (FJ.job) runStop(); else if (CTL.sim) CTL.sim.realtime(0x18);
    });
    $("st-power").addEventListener("click", () => {  // as at the switch (As built: the gantry comes up racked)
      popToggle(pill, menu, false);
      if (AB.set.on) abPowerCycle(); else { if (JOB.preview) previewEnd(); ctlBoot(); }
    });
    $("alarm-unlock").addEventListener("click", () => ctlSend("$X"));
    $("alarm-home").addEventListener("click", () => { alarmShow(null); ctlHome(); });
    $("alarm-x").addEventListener("click", () => alarmShow(null));
    const pw = $("pw-btn"), pwPop = $("pw-pop");
    pw.addEventListener("click", () => popToggle(pw, pwPop));
    document.addEventListener("pointerdown", (e) => {
      if (!menu.hidden && !e.target.closest("#st-menu, #st-pill, #help-pop")) popToggle(pill, menu, false);
      if (!pwPop.hidden && !e.target.closest("#pw-pop, #pw-btn, #help-pop")) popToggle(pw, pwPop, false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!menu.hidden) popToggle(pill, menu, false);
      if (!pwPop.hidden) popToggle(pw, pwPop, false);
    });
  }
  // for tests/test_page_fluidnc.js: the controller's state and the model's pose (mm from the parked pose)
  window.LR4Ctl = { mode: () => CTL.mode, state: () => CTL.state, mpos: () => CTL.mpos, boot: () => CTL.boot,
    cfg: () => CTL.cfg, pose: () => HOME.pose && [HOME.pose.x, HOME.pose.y, HOME.pose.z], travel: () => meta && meta.travel,
    tip: () => meta && meta.tip_above_table, TOUCH_PLATE, sync: () => ctlTick(), homed: () => CTL.homed,
    plate: () => !!(CTL.jobPlate || HAND.plate), stop: () => ctlStop(), start: () => ctlBoot() };   // stop / start: FluidNC down and up (tests)

