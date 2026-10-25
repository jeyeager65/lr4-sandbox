// lr4-sandbox page, part 2 of 12: the file panel, My machine, Show, print colours.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- the file panel: drop / pick zips, folders or files; what's loaded, missing or a different version ----
  let JSZipLib = null;
  function loadJSZip() {
    if (JSZipLib) return JSZipLib;
    return JSZipLib = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = () => res(window.JSZip);
      s.onerror = () => { JSZipLib = null; rej(new Error("could not load the zip reader")); };
      document.head.appendChild(s);
    });
  }
  async function setupFiles() {
    needed = new Map();
    for (const p of cfg.parts) {
      if (!p.src) continue;
      for (const r of p.src.kind === "peter" ? [p.src.open, p.src.closed] : [p.src])
        (needed.get(r.file) || needed.set(r.file, []).get(r.file)).push(p.meta.name);
    }
    progress("Loading your part files…", null, "kept in this browser");
    try {
      for (const f of await LR4Files.store.all()) if (needed.has(f.path)) userFiles.set(f.path, f);
    } catch (e) { console.warn("IndexedDB", e); }
    document.getElementById("parts-chip").hidden = false;
    const drop = document.getElementById("drop");
    const fromList = (list) => [...list].map((f) => ({ name: f.webkitRelativePath || f.name, read: () => f.arrayBuffer() }));
    for (const id of ["f-files", "f-dir"]) document.getElementById(id).addEventListener("change", (e) => {
      addFiles(fromList(e.target.files));
      e.target.value = "";
    });
    // Part 38: the whole window takes part files, any time, either mode (the SD card, Flash and web UI lists take
    // their own drops: no overlay there, and the part files skip it)
    const ownDrop = (e) => !!(e.target.closest && e.target.closest("#sd-box, #flash-box, #ui-box"));
    const hasFiles = (e) => [...(e.dataTransfer && e.dataTransfer.types || [])].includes("Files");
    window.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.toggle("over", hasFiles(e) && !ownDrop(e)); });
    window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) drop.classList.remove("over"); });
    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      if (ownDrop(e)) return;
      const entries = [...e.dataTransfer.items].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
      addFiles(entries.length ? await fromEntries(entries) : fromList(e.dataTransfer.files));
    });
    welcomeSetup();
    document.getElementById("f-forget").addEventListener("click", async () => {
      try { await LR4Files.store.clear(); } catch (e) { /* nothing kept */ }
      userFiles.clear();
      dropSrcGeometry();
      rebuild();
      renderFiles();
    });
    renderFiles();
  }
  async function fromEntries(entries) {               // dropped folders: walk them (readEntries returns batches)
    const out = [];
    const walk = async (en) => {
      if (en.isFile) {
        if (LR4Files.wanted(en.name)) out.push({ name: en.fullPath, read: () => new Promise((res, rej) => en.file((f) => f.arrayBuffer().then(res, rej), rej)) });
        return;
      }
      const rd = en.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => rd.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    };
    for (const en of entries) await walk(en);
    return out;
  }
  async function addFiles(items) {
    items = items.filter((it) => LR4Files.wanted(it.name));
    if (!items.length) return;
    statusEl.hidden = false;
    let n = 0;
    try {
      const zip = items.some((it) => /\.zip$/i.test(it.name)) ? await loadJSZip() : null;
      const match = LR4Files.matcher(cfg.files.files, needed.keys());
      const got = await LR4Files.identify(items, match, zip, (name) => progress("Reading your files…", null, `${++n}: ${name.split("/").pop()}`));
      const keep = got.filter((g) => !(userFiles.get(g.path) && userFiles.get(g.path).ok && !g.ok));   // never trade a match for a near miss
      for (const g of keep) userFiles.set(g.path, g);
      if (keep.length) WELCOME.loadedSome = true;
      try { await LR4Files.store.put(keep); } catch (e) { console.warn("IndexedDB", e); }
      progress("Building the machine…", 1, `${keep.length} file(s) used`);
      await nextFrame();
      dropSrcGeometry();
      rebuild();
      if (applyLink.left) applyLink(applyLink.left);  // a link's Peter Plates / struts waited for the files
    } catch (e) {
      console.error(e);
      document.getElementById("files-list").insertAdjacentHTML("afterbegin", `<p class="warn">Could not read the files: ${e.message}</p>`);
    }
    statusEl.hidden = true;
    renderFiles();
  }
  function renderFiles() {
    const host = document.getElementById("files-list"), F = cfg.files;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    let have = 0, diff = 0, html = "";
    const bySrc = {};
    for (const p of needed.keys()) (bySrc[F.files[p].source] = bySrc[F.files[p].source] || []).push(p);
    for (const [src, paths] of Object.entries(bySrc)) {
      const S = F.sources[src], items = [];
      let n = 0;
      for (const p of paths.sort()) {
        const f = userFiles.get(p), short = p.split("/").pop();
        if (f) { n++; have++; }
        if (!f) items.push(`<li>${esc(short)}</li>`);
        else if (!f.ok) { diff++; items.push(`<li class="diff">${esc(short)} - a different version${f.name.toLowerCase() !== short.toLowerCase() ? ` (${esc(f.name)})` : ""}</li>`); }
      }
      const list = n || items.length <= 5;          // none of a source yet: just the link, not every name
      html += `<div class="files-src"><b><a href="${esc(S.url)}" target="_blank" rel="noopener">${esc(S.title)}</a></b> <em>${n} of ${paths.length}</em>`
        + (items.length && list ? `<ul>${items.join("")}</ul>` : "") + "</div>";
    }
    const total = needed.size;
    const head = have === total && !diff ? `<p class="sub">All ${total} files loaded.</p>`
      : `<p class="sub">${have} of ${total} files loaded${have < total ? " - the missing parts show as grey boxes" : ""}.</p>`;
    const warn = diff ? `<p class="warn">${diff} file(s) differ from the ones this page was solved for (as of ${esc(F.tested)}) - placed anyway, check they fit.</p>` : "";
    host.innerHTML = head + warn + html;
    // Part 38: the welcome card's Download buttons (n of m per Printables source) and the top bar's Parts chip
    document.getElementById("wc-src").innerHTML = Object.entries(bySrc).map(([src, paths]) => {
      const S = F.sources[src], n = paths.filter((p) => userFiles.has(p)).length, all = n === paths.length;
      return `<div class="wc-row${all ? " ok" : ""}"><a class="btn" href="${esc(S.url)}" target="_blank" rel="noopener">${esc(S.title)} ↗</a>` +
        `<em>${n} of ${paths.length}${all ? " ✓" : ""}</em></div>`;
    }).join("");
    const chip = document.getElementById("parts-chip"), ok = have === total;
    chip.textContent = ok ? `Parts ${have}/${total} ✓` : `Parts ${have}/${total} · add files`;
    chip.classList.toggle("warn", !ok || !!diff);
    if (ok && WELCOME.loadedSome) welcome(false);    // everything there after a load: the card closes itself
  }
  // ---- the welcome card (Part 38): over the view on a first visit with files missing (until Skip for now), and from
  // the Parts chip any time. Downloads folder (Chrome / Edge: showDirectoryPicker): picked once, its handle kept in
  // IndexedDB; the page reads the zips there whose names look like the Printables sources (and any loose STL / DXF
  // it needs), now or on a later visit with one click (the browser asks for permission again). ----
  const WELCOME = { loadedSome: false, dir: null };
  const kvGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const kvSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* not kept */ } };
  function welcome(on) {
    const w = document.getElementById("welcome");
    w.hidden = !on;
    document.getElementById("parts-chip").setAttribute("aria-expanded", String(on));
  }
  const DIR_DB = { name: "lr4-sandbox-dirs", store: "dirs" };
  function dirDb(mode, fn) {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DIR_DB.name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DIR_DB.store);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const d = r.result, t = d.transaction(DIR_DB.store, mode), q = fn(t.objectStore(DIR_DB.store));
        t.oncomplete = () => { d.close(); res(q && q.result); };
        t.onerror = () => { d.close(); rej(t.error); };
      };
    });
  }
  const SRC_NAME = /lowrider|lr4|kobalt|jackpot|peter/i;   // the Printables zips' names (a GUESS at how they're named)
  async function scanDir(dir) {                       // the folder's top level: likely zips + loose files the page needs
    const note = document.getElementById("f-dl-note"), base = new Set([...needed.keys()].map((p) => p.split("/").pop().toLowerCase()));
    const items = [];
    note.textContent = `Looking in ${dir.name}…`;
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== "file") continue;
      if ((/\.zip$/i.test(name) && SRC_NAME.test(name)) || base.has(name.toLowerCase()))
        items.push({ name, read: () => h.getFile().then((f) => f.arrayBuffer()) });
    }
    note.textContent = items.length ? `${dir.name}: reading ${items.length} file(s)…` : `Nothing for the page in ${dir.name} (the Printables zips' names have LowRider, Kobalt, Jackpot or Peter in them).`;
    if (items.length) { await addFiles(items); note.textContent = `Read ${items.length} file(s) from ${dir.name}.`; }
  }
  function welcomeSetup() {
    const chip = document.getElementById("parts-chip");
    chip.addEventListener("click", () => welcome(document.getElementById("welcome").hidden));
    document.getElementById("wc-x").addEventListener("click", () => welcome(false));
    document.getElementById("wc-skip").addEventListener("click", () => { kvSet("lr4-welcome", "skip"); welcome(false); });
    const dl = document.getElementById("f-dl"), again = document.getElementById("f-dl-again");
    if (window.showDirectoryPicker && window.indexedDB) {
      dl.hidden = false;
      dl.addEventListener("click", async () => {
        let dir;
        try { dir = await showDirectoryPicker({ id: "lr4-downloads", startIn: "downloads" }); } catch (e) { return; }   // cancelled
        WELCOME.dir = dir;
        try { await dirDb("readwrite", (st) => st.put(dir, "downloads")); again.hidden = false; } catch (e) { /* not kept */ }
        scanDir(dir);
      });
      again.addEventListener("click", async () => {
        const dir = WELCOME.dir;
        if (!dir) return;
        try { if ((await dir.requestPermission({ mode: "read" })) !== "granted") return; } catch (e) { return; }
        scanDir(dir);
      });
      dirDb("readonly", (st) => st.get("downloads")).then((dir) => { if (dir) { WELCOME.dir = dir; again.hidden = false; again.textContent = `Check ${dir.name} again`; } }).catch(() => {});
    }
    renderFiles();
    const missing = [...needed.keys()].some((p) => !userFiles.has(p));
    const dev = new URLSearchParams(location.search).get("parts");   // tests / videos load the files themselves
    if (missing && !dev && kvGet("lr4-welcome") !== "skip") welcome(true);
  }

  // ---- My machine (Part 26): what's on the machine. Off = gone from the model AND the BOM (and the Show tree). The
  // skirt and the hose need the router (the hose threads into its shoe); the shoe goes with the hose (user 2026-10-23:
  // no hose = no shoe, skirt or bristles - the skirt needs both); the pendant is the FluidTouch option. Kept
  // in this browser (lr4-opts; the pendant in lr4-pendant). ----
  const OPT = { router: true, skirt: true, hose: true, fan: true };
  const OPT_PARTS = { router: /^(Router_(?!Cord_Run)|Tool_Mount_|Dust_Shoe|Dust_Skirt|Bristles_TPU)/, skirt: DUST_PARTS,
    hose: /^(Vacuum_Hose|Router_Cord_Run|Cable_Sleeve|Hose_Holder|Hose_Hook|Dust_Shoe|Dust_Skirt|Bristles_TPU)/, fan: /^Jackpot3_Fan/ };
  const pendantOn = () => document.getElementById("ft-on").checked;   // My machine > FluidTouch pendant (kept)
  const optsOn = () => ({ router: OPT.router, skirt: OPT.router && OPT.hose && OPT.skirt, hose: OPT.router && OPT.hose, fan: OPT.fan,
    pendant: pendantOn() });
  function fitted(m) {
    const n = m.userData.name || "", o = optsOn();
    if (m.userData.group === "Pendant") return o.pendant;
    return Object.keys(OPT_PARTS).every((k) => o[k] || !OPT_PARTS[k].test(n));
  }
  function setupOpts() {                              // once
    try { Object.assign(OPT, JSON.parse(localStorage.getItem("lr4-opts") || "{}")); } catch (e) { /* defaults */ }
    const mark = () => {
      for (const k of Object.keys(OPT)) document.getElementById("opt-" + k).checked = OPT[k];
      for (const k of ["skirt", "hose"]) document.getElementById("opt-" + k).disabled = !OPT.router || (k === "skirt" && !OPT.hose);
    };
    for (const k of Object.keys(OPT)) document.getElementById("opt-" + k).addEventListener("change", (e) => {
      OPT[k] = e.target.checked;
      try { localStorage.setItem("lr4-opts", JSON.stringify(OPT)); } catch (err) { /* not kept */ }
      mark();
      if (meta) { applyVisibility(); renderBom(); }
    });
    mark();
  }
  setupOpts();

  // ---- Show (Part 26): the view only, never the BOM. A tree of what's on the machine (js/show_tree.js: assembly >
  // kind > part, stable ids) with presets; showOff = the ids turned off (an assembly, "asm.kind" or a part name).
  // Not kept: every load shows everything. Part hides from VR / the card are part ids here too. ----
  let tree = { asms: [], place: {} }, treeKey = "";
  const showOff = new Set(), treeOpen = new Set();
  const partId = (m) => (m.userData.name || "").replace(/~thread$/, "");
  const isGroupId = (id) => tree.asms.some((a) => a.id === id || a.kinds.some((k) => k.id === id));
  const partHides = () => [...showOff].filter((id) => !isGroupId(id));
  const asmOf = (m) => ((tree.place[partId(m)] || [])[0] || [])[0];
  const asmLabel = (m) => (tree.asms.find((a) => a.id === asmOf(m)) || {}).label || m.userData.group;
  // G-code playback: probing = the touch plate is out, so the shoe's bottom (skirt + bristles) is off, as you would
  // take it off (user); jobBit = the file's own bit (from its ToolDef) is drawn instead of the model's Router_Bit
  let probing = false, jobBit = false, bitOK = true;   // bitOK: the job's bit shows where the model's would (Show, inspect)
  const PROBE_OFF = /^(Dust_Skirt|Bristles_TPU)/;
  function applyVisibility() {
    const listed = meshes.filter((m) => m.userData.name && fitted(m) && variantOK(m) && !m.userData.missingHw);   // Part 38: not with its missing part
    const key = listed.map((m) => m.userData.name).join();
    if (key !== treeKey) { treeKey = key; tree = LR4ShowTree.build(listed.map((m) => m.userData)); renderShow(); }
    if (INSPECT) {                                     // its set, again (the parts change with the size / options)
      INSPECT.set = LR4ShowTree.inspectSet(tree, INSPECT.id);
      INSPECT.ex = null;                              // the explode follows the set
      if (!INSPECT.set.size) return inspectEnd();
    }
    const inTree = new Set(listed);
    for (const m of meshes) m.visible = inTree.has(m) && LR4ShowTree.on(tree, showOff, partId(m))
      && (!INSPECT || INSPECT.set.has(partId(m)))
      && !(TOUCH_ANIM.skirt >= 1 && PROBE_OFF.test(m.userData.name)) && !(jobBit && m.userData.name === "Router_Bit");   // off once it's slid out (job.js)
    const rb = meshes.find((m) => m.userData.name === "Router_Bit");
    bitOK = !!rb && inTree.has(rb) && LR4ShowTree.on(tree, showOff, partId(rb)) && (!INSPECT || INSPECT.set.has(partId(rb)));
    if (!bitOK && JOB.bits) for (const b of JOB.bits.values()) b.visible = false;
    // Part 31: the spoilboard's height field is drawn instead of the Spoilboard (Part 33: its own part); the hand-installed
    // bit rides in the router unless the job's own bits show
    const tm = meshes.find((m) => m.userData.name === "Spoilboard");
    if (tm) {                                         // under the height field it only casts the shadow (the field's
      const f = !!SPOIL.mesh;                         // shader doesn't), and isn't picked (userData.shadowOnly)
      if (f) SPOIL.mesh.visible = tm.visible;
      tm.material.colorWrite = tm.material.depthWrite = !f;
      tm.userData.shadowOnly = f;
    }
    if (HAND.bitMesh) {
      HAND.bitMesh.visible = bitOK && !jobBit;
      if (rb && HAND.bitMesh.visible) rb.visible = false;
    }
    if (HAND.mesh) HAND.mesh.visible = !JOB.stock && $("hs-show-stock").checked;
    if (JOB.stock) JOB.stock.visible = $("hs-show-stock").checked;
    syncShow();
    inspectScene();
    if (selected && !selected.visible) select(null);
  }
  function setupShow() {                              // once: presets, the tree's clicks
    const pre = document.getElementById("show-presets");
    for (const [id, label] of LR4ShowTree.PRESETS) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.v = id; b.textContent = label;
      b.addEventListener("click", () => showPreset(id));
      pre.appendChild(b);
    }
    const host = document.getElementById("show-tree");
    host.addEventListener("change", (e) => { const id = e.target.dataset.id; if (id) showSet(id, e.target.checked); });
    host.addEventListener("click", (e) => {
      const ins = e.target.closest(".ins");
      if (ins) return inspect(ins.dataset.id);
      const tw = e.target.closest(".tw");
      if (!tw) return;
      const id = tw.dataset.id, open = !treeOpen.has(id);
      if (open) treeOpen.add(id); else treeOpen.delete(id);
      tw.setAttribute("aria-expanded", String(open));
      tw.textContent = open ? "▾" : "▸";
      host.querySelector(`[data-kids="${CSS.escape(id)}"]`).hidden = !open;
    });
    document.getElementById("unhide").addEventListener("click", () => { for (const id of partHides()) showOff.delete(id); applyVisibility(); });
  }
  function showSet(id, on) { if (on) showOff.delete(id); else showOff.add(id); applyVisibility(); }
  function showPreset(name) { showOff.clear(); for (const id of LR4ShowTree.preset(tree, name)) showOff.add(id); applyVisibility(); }
  function renderShow() {                             // the tree's rows (when the parts on the machine change)
    const host = document.getElementById("show-tree");
    host.textContent = "";
    const row = (into, cls, id, label, n, kids) => {
      const r = document.createElement("div");
      r.className = "row " + cls;
      r.innerHTML = (kids ? `<button type="button" class="tw"></button>` : "") + `<label><input type="checkbox"><span></span></label><em></em>`
        + `<button type="button" class="ins">⤢</button>`;
      const i = r.querySelector("input");
      i.dataset.id = id;
      if (cls === "a") i.id = "g-" + id;              // vr.js: the assembly toggles
      r.querySelector("span").textContent = label;
      r.querySelector("em").textContent = n;
      const ins = r.querySelector(".ins");
      ins.dataset.id = id;
      ins.title = "Inspect: " + label;
      ins.setAttribute("aria-label", "Inspect " + label);
      into.appendChild(r);
      if (!kids) return null;
      const tw = r.querySelector(".tw");
      tw.dataset.id = id;
      tw.setAttribute("aria-expanded", String(treeOpen.has(id)));
      tw.setAttribute("aria-label", "Parts in " + label);
      tw.textContent = treeOpen.has(id) ? "▾" : "▸";
      const k = document.createElement("div");
      k.dataset.kids = id;
      k.hidden = !treeOpen.has(id);
      into.appendChild(k);
      return k;
    };
    for (const a of tree.asms) {
      const ak = row(host, "a", a.id, a.label, a.n, true);
      for (const k of a.kinds) {
        const kk = row(ak, "k", k.id, k.label, k.n, true);
        for (const q of k.parts) row(kk, "p", q.id, q.label, q.n > 1 ? "×" + q.n : "", false);
      }
    }
  }
  function syncShow() {                               // checkboxes from showOff; a part row greyed when it isn't drawn
    const host = document.getElementById("show-tree");
    for (const i of host.querySelectorAll("input[data-id]")) {
      const id = i.dataset.id, r = i.closest(".row");
      i.checked = !showOff.has(id);
      if (r.classList.contains("p")) { r.classList.toggle("dim", !LR4ShowTree.on(tree, showOff, id)); continue; }
      const a = tree.asms.find((x) => x.id === id), k = !a && tree.asms.flatMap((x) => x.kinds).find((x) => x.id === id);
      const kids = a ? a.kinds.flatMap((x) => [x.id, ...x.parts.map((q) => q.id)]) : k ? k.parts.map((q) => q.id) : [];
      i.indeterminate = i.checked && kids.some((x) => showOff.has(x));
    }
    const p = LR4ShowTree.presetOf(tree, showOff);
    document.querySelectorAll("#show-presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === p)));
    const un = document.getElementById("unhide"), n = partHides().length;
    un.hidden = !n;
    un.textContent = `Show ${n} hidden part${n === 1 ? "" : "s"}`;
  }

  // ---- print colours: the printed parts come in two colours (main, accent); the pickers recolour each set.
  // The choice is kept in this browser only. ----
  const PRINT_ROLE = { main: [0.16, 0.16, 0.18], accent: [0.80, 0.12, 0.10] };   // build.py PRINT_MAIN / PRINT_ACCENT
  const PRINT_DEFAULT = { main: "#292a2e", accent: "#cc1f1a" };
  const pick = { main: document.getElementById("c-main"), accent: document.getElementById("c-accent") };
  function assignRoles() {
    for (const m of meshes) {
      const p = m.userData;
      if (p.source !== "printed" || p.standin) continue;   // stand-ins (Part 38) stay grey
      for (const [role, c] of Object.entries(PRINT_ROLE))
        if (p.color.every((v, i) => Math.abs(v - c[i]) < 0.02)) p.role = role;
    }
  }
  function applyColours(only) {
    for (const role of Object.keys(pick)) {
      if (only && only !== role) continue;
      const col = new THREE.Color(pick[role].value).convertSRGBToLinear();
      for (const m of meshes) if (m.userData.role === role) m.material.color.copy(col);
    }
  }
  function setupColours() {                           // once
    for (const role of Object.keys(pick)) {
      let saved = null;
      try { saved = localStorage.getItem("print-" + role); } catch (e) { /* storage blocked: defaults */ }
      if (saved && /^#[0-9a-f]{6}$/i.test(saved)) pick[role].value = saved;
      pick[role].addEventListener("input", () => {
        applyColours(role);
        try { localStorage.setItem("print-" + role, pick[role].value); } catch (e) { /* not kept */ }
      });
    }
    document.getElementById("c-reset").addEventListener("click", () => {
      for (const role of Object.keys(pick)) {
        pick[role].value = PRINT_DEFAULT[role];
        try { localStorage.removeItem("print-" + role); } catch (e) { /* fine */ }
      }
      applyColours();
    });
  }

