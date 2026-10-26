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
    chip.innerHTML = `Parts <span class="pc-n">${have}/${total} </span>${ok ? "✓" : "<span class=\"pc-add\">· add files</span>"}`;   // phones: no count, + for add files (css)
    chip.classList.toggle("missing", !ok);
    chip.classList.toggle("warn", !ok || !!diff);
    if (ok && WELCOME.loadedSome) welcome(false);    // everything there after a load: the card closes itself
  }
  // ---- the welcome card (Part 38): over the view on a first visit with files missing (until Skip for now), and from
  // the Parts chip any time. Downloads folder (Chrome / Edge: showDirectoryPicker): picked once, its handle kept in
  // IndexedDB; the page reads the zips there whose names look like the Printables sources (and any loose STL / DXF
  // it needs), now or on a later visit with one click (the browser asks for permission again). ----
  const WELCOME = { loadedSome: false, dir: null };
  const kvGet = (k) => { try { return MS.get(k); } catch (e) { return null; } };
  const kvSet = (k, v) => { try { MS.set(k, v); } catch (e) { /* not kept */ } };
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
    try { Object.assign(OPT, JSON.parse(MS.get("lr4-opts") || "{}")); } catch (e) { /* defaults */ }
    const mark = () => {
      for (const k of Object.keys(OPT)) document.getElementById("opt-" + k).checked = OPT[k];
      for (const k of ["skirt", "hose"]) document.getElementById("opt-" + k).disabled = !OPT.router || (k === "skirt" && !OPT.hose);
    };
    for (const k of Object.keys(OPT)) document.getElementById("opt-" + k).addEventListener("change", (e) => {
      OPT[k] = e.target.checked;
      try { MS.set("lr4-opts", JSON.stringify(OPT)); } catch (err) { /* not kept */ }
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

  // ---- Part 40: filaments. The printed parts are in filaments (material + color: js/filaments.js; "spools" in the
  // code); a part's filament comes from the preset's rule (main / accent by its data color, the router mounts, the fiber
  // parts) unless the user picked one (Printed in: the selection chip, Inspect). The bristles are always TPU. Presets are
  // starting points; the user's own are saved (lr4-fil-presets). Kept in this browser (lr4-filaments) + the share link. Also the printed look (scene.js PRINT) and the strut plates' material. ----
  const PRINT_ROLE = { main: [0.16, 0.16, 0.18], accent: [0.80, 0.12, 0.10] };   // build.py PRINT_MAIN / PRINT_ACCENT
  const FIL = { s: LR4Filaments.defaults(), map: new Map(), saved: [] };
  function filSave() { try { MS.set("lr4-filaments", JSON.stringify(FIL.s)); } catch (e) { /* not kept */ } }
  function filSavePresets() { try { MS.set("lr4-fil-presets", JSON.stringify(FIL.saved)); } catch (e) { /* not kept */ } }
  function filLoad() {
    let s = null;
    try { s = JSON.parse(MS.get("lr4-filaments") || "null"); } catch (e) { /* defaults */ }
    if (!s) {                                         // before Part 40: two colors (print-main / print-accent)
      s = LR4Filaments.defaults();
      try {
        const c0 = MS.get("print-main"), c1 = MS.get("print-accent");
        if (c0) s.spools[0].color = c0;
        if (c1) s.spools[1].color = s.spools[2].color = c1;
      } catch (e) { /* defaults */ }
    }
    FIL.s = LR4Filaments.clean(s);
    try { FIL.saved = LR4Filaments.cleanSaved(JSON.parse(MS.get("lr4-fil-presets") || "[]")); } catch (e) { FIL.saved = []; }
  }
  const isPrinted = (m) => !m.userData.standin && !!m.userData.role && !!(m.material.userData && m.material.userData.print);
  function assignRoles() {
    for (const m of meshes) {
      const p = m.userData;
      if (p.source !== "printed" || p.standin || p.role) continue;   // stand-ins (Part 38) stay grey; the pendant has its own
      for (const [role, c] of Object.entries(PRINT_ROLE))
        if (p.color.every((v, i) => Math.abs(v - c[i]) < 0.02)) p.role = role;
      if (!p.role) p.role = "main";
    }
  }
  const _cx = new THREE.Vector3();
  function partCx(m) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    return m.geometry.boundingBox.getCenter(_cx).x + (m.userData.base ? m.userData.base.t[0] : 0);
  }
  function applyColours(quiet) {                      // every printed mesh from its spool, the look, the plates
    const list = meshes.filter(isPrinted), on = LR4Filaments.lookOn(FIL.s, lite);
    FIL.map = LR4Filaments.assign(list.map((m) => ({ name: m.userData.name, role: m.userData.role, cx: partCx(m) })), FIL.s);
    PRINT.lines.value = on ? 1 : 0;
    PRINT.layer.value = FIL.s.layer;
    PRINT.bed.value = FIL.s.bed === "pei" ? 1 : 0;
    for (const m of list) {
      const i = FIL.map.get(m.userData.name), sp = i >= 0 ? FIL.s.spools[i] : null;
      const L = LR4Filaments.MATERIALS[sp ? sp.mat : "TPU"], mat = m.material, u = mat.userData.print;
      if (sp) mat.color.set(sp.color).convertSRGBToLinear();
      else mat.color.setRGB(...m.userData.color).convertSRGBToLinear();
      mat.roughness = L.rough;
      mat.clearcoat = L.clear;
      mat.clearcoatRoughness = 0.25;
      u.uFiber.value = on ? L.fiber : 0;
      u.uRim.value = L.rim;
    }
    for (const m of meshes) {                         // the strut plates (permanent struts only)
      const k = { StrutPlate_Front: "front", StrutPlate_Bottom: "bottom" }[m.userData.name];
      if (!k) continue;
      const p = FIL.s.plates[k], P = LR4Filaments.PLATES[p.mat], mat = m.material, map = P.grain ? woodTex(P.grain) : null, see = !!P.opacity;
      mat.color.set(p.color).convertSRGBToLinear();
      if (mat.map !== map || mat.transparent !== see) {
        Object.assign(mat, { map, bumpMap: map, bumpScale: 0.25, transparent: see, depthWrite: !see, needsUpdate: true });
      }
      mat.opacity = P.opacity || 1;
      mat.roughness = P.rough;
    }
    if (!quiet) filUI();
  }
  // a "Printed in" menu for these parts (mesh names): By the preset, or a spool, each with its color swatch + name (a
  // native select can't show colors); several parts may be mixed. host: the .pick-fil label's .fil-dd
  const spoolText = (i) => LR4Filaments.filamentName(FIL.s, i);
  function swatchEl(color) { const e = document.createElement("i"); e.className = "fil-sw"; e.style.background = color; return e; }
  function filSelect(host, names) {
    const own = names.map((n) => FIL.s.parts[n]), same = own.every((v) => v === own[0]);
    const rule = names.length === 1 ? FIL.map.get(names[0]) : null;
    const cur = !same ? "mixed" : own[0] === undefined ? "" : String(own[0]);
    const items = [["", rule !== null && rule >= 0 ? `By the preset (${spoolText(rule)})` : "By the preset", rule !== null && rule >= 0 ? FIL.s.spools[rule].color : null],
      ...FIL.s.spools.map((sp, i) => [String(i), spoolText(i), sp.color])];
    const btn = host.querySelector(".fil-dd-btn"), menu = host.querySelector(".fil-dd-menu");
    const shown = items.find(([v]) => v === cur);
    btn.textContent = "";
    if (shown && shown[2]) btn.append(swatchEl(shown[2]));
    btn.append(document.createTextNode(shown ? shown[1] : "Mixed"));
    btn.dataset.v = cur;
    menu.textContent = "";
    for (const [v, t, c] of items) {
      const o = document.createElement("button");
      o.type = "button"; o.setAttribute("role", "option"); o.dataset.v = v;
      o.setAttribute("aria-selected", String(v === cur));
      if (c) o.append(swatchEl(c));
      o.append(document.createTextNode(t));
      o.addEventListener("click", () => {
        menu.hidden = true;
        for (const n of names) { if (v === "") delete FIL.s.parts[n]; else FIL.s.parts[n] = +v; }
        filSave();
        applyColours();
        if (INSPECT) inspectScene();
      });
      menu.append(o);
    }
    btn.onclick = () => { menu.hidden = !menu.hidden; if (!menu.hidden) (menu.querySelector('[aria-selected="true"]') || menu.firstChild).focus(); };
  }
  document.addEventListener("pointerdown", (e) => {   // a click outside closes an open menu
    for (const m of document.querySelectorAll(".fil-dd-menu:not([hidden])")) if (!m.parentNode.contains(e.target)) m.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") for (const m of document.querySelectorAll(".fil-dd-menu:not([hidden])")) { m.hidden = true; m.parentNode.querySelector(".fil-dd-btn").focus(); }
  });
  function filPick(m) {                               // the selection chip (hose_bom.js select)
    const box = document.getElementById("pick-fil"), show = !!(m && isPrinted(m) && FIL.map.get(m.userData.name) >= 0);
    box.hidden = !show;
    if (show) filSelect(box.querySelector(".fil-dd"), [m.userData.name]);
  }
  function filInspect(list) {                         // Inspect's card: every printed part in the set
    const box = document.getElementById("insp-fil"), names = list.filter((m) => isPrinted(m) && FIL.map.get(m.userData.name) >= 0).map((m) => m.userData.name);
    box.hidden = !names.length;
    if (names.length) filSelect(box.querySelector(".fil-dd"), names);
  }
  function filUI() {                                  // the Look step's controls from FIL.s
    const s = FIL.s, $ = (id) => document.getElementById(id);
    const press = (id, v) => $(id).querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    const ed = LR4Filaments.edited(s, FIL.saved), mineOn = !!(s.saved && FIL.saved.some((p) => p.name === s.saved));
    press("fil-preset", ed || mineOn ? "" : s.preset);
    const mine = $("fil-mine");
    mine.hidden = !FIL.saved.length;
    mine.querySelectorAll("button").forEach((b) => b.remove());
    for (const p of FIL.saved) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.v = p.name; b.textContent = p.name;
      b.setAttribute("aria-pressed", String(!ed && s.saved === p.name));
      mine.append(b);
    }
    $("fil-edited").hidden = !ed;
    $("fil-from").textContent = LR4Filaments.sourceOf(s, FIL.saved).label;
    $("fil-ed-what").textContent = mineOn ? "Unsaved changes to" : "Edited from";   // yours: save over it; a built-in: save as
    $("fil-update").hidden = !mineOn;
    if (mineOn) $("fil-update").textContent = `Save "${s.saved}"`;
    $("fil-save").textContent = mineOn ? "Save as new…" : "Save as a preset…";
    $("fil-del").hidden = !(mineOn && !ed);
    $("fil-rename").hidden = !mineOn;
    if (mineOn) $("fil-del").textContent = `Delete "${s.saved}"`;
    press("fil-bed", s.bed);
    const on = LR4Filaments.lookOn(s, lite);
    press("fil-look", on ? "on" : "off");
    if (document.activeElement !== $("fil-layer")) $("fil-layer").value = s.layer;
    $("fil-layer-chips").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === s.layer)));
    const count = s.spools.map(() => 0);
    for (const v of FIL.map.values()) if (v >= 0) count[v]++;
    const host = $("fil-spools");
    host.textContent = "";
    s.spools.forEach((sp, i) => {
      const row = document.createElement("div");
      row.className = "fil-row";
      const nm = spoolText(i);
      row.innerHTML = `<input type="color" list="fil-palette" aria-label="${nm}: color">`
        + `<select aria-label="${nm}: material">${LR4Filaments.NAMES.filter((n) => n !== "TPU").map((n) => `<option>${n}</option>`).join("")}</select>`
        + `<span class="fil-n">${nm}</span><em>${count[i]} part${count[i] === 1 ? "" : "s"}</em>`
        + (s.spools.length > 1 ? `<button type="button" aria-label="Remove ${nm}" title="Remove (its parts go back to the preset)">✕</button>` : "");
      const [col, mat] = [row.querySelector("input"), row.querySelector("select")];
      col.value = sp.color;
      mat.value = sp.mat;
      col.addEventListener("input", () => {
        sp.color = col.value;
        host.querySelectorAll(".fil-n").forEach((e, j) => (e.textContent = spoolText(j)));
        filSave(); applyColoursSoon();
      });
      mat.addEventListener("change", () => { sp.mat = mat.value; filSave(); applyColours(); });
      const x = row.querySelector("button");
      if (x) x.addEventListener("click", () => { FIL.s = LR4Filaments.removeSpool(s, i); filSave(); applyColours(); });
      host.append(row);
    });
    const ph = $("fil-plates");
    ph.textContent = "";
    for (const k of ["front", "bottom"]) {
      const p = s.plates[k], row = document.createElement("div");
      row.className = "fil-row";
      row.innerHTML = `<span class="fil-n">${k === "front" ? "Front" : "Bottom"}</span><select aria-label="${k} plate material">`
        + Object.entries(LR4Filaments.PLATES).map(([v, P]) => `<option value="${v}">${P.label}</option>`).join("")
        + `</select><input type="color" aria-label="${k} plate color">`;
      const [mat, col] = [row.querySelector("select"), row.querySelector("input")];
      mat.value = p.mat;
      col.value = p.color;
      mat.addEventListener("change", () => { s.plates[k] = { mat: mat.value, color: LR4Filaments.PLATES[mat.value].color }; filSave(); applyColours(); });
      col.addEventListener("input", () => { p.color = col.value; filSave(); applyColoursSoon(); });
      ph.append(row);
    }
    if (selected) filPick(selected);
  }
  let colourTimer = 0;                                // a color picker fires input while dragging: one redraw a frame,
  function applyColoursSoon() {                       // and the rows aren't rebuilt under the open picker
    if (!colourTimer) colourTimer = requestAnimationFrame(() => { colourTimer = 0; applyColours(true); });
  }
  function setupColours() {                           // once
    filLoad();
    const $ = (id) => document.getElementById(id), dl = $("fil-palette");
    for (const [name, c] of LR4Filaments.PALETTE) { const o = document.createElement("option"); o.value = c; o.label = name; dl.append(o); }
    for (const [h, n] of LR4Filaments.LAYER.presets) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.v = h; b.textContent = h;
      b.title = `${h} mm (${n} mm nozzle)`;
      $("fil-layer-chips").append(b);
    }
    $("fil-layer-chips").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { FIL.s.layer = +b.dataset.v; filSave(); applyColours(); }
    });
    $("fil-layer").addEventListener("change", () => {
      const v = parseFloat($("fil-layer").value), L = LR4Filaments.LAYER;
      if (v >= L.min && v <= L.max) FIL.s.layer = +v.toFixed(3);
      filSave(); applyColours();
    });
    $("fil-preset").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { FIL.s = LR4Filaments.setPreset(FIL.s, b.dataset.v); filSave(); applyColours(); }
    });
    for (const [id, k] of [["fil-bed", "bed"], ["fil-look", "look"]])
      $(id).addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (b) { FIL.s[k] = b.dataset.v; filSave(); applyColours(); }
      });
    $("fil-add").addEventListener("click", () => {
      if (FIL.s.spools.length >= 12) return;
      FIL.s.spools.push({ mat: "PLA", color: LR4Filaments.PALETTE[FIL.s.spools.length % LR4Filaments.PALETTE.length][1] });
      filSave(); applyColours();
    });
    $("fil-mine").addEventListener("click", (e) => {
      const b = e.target.closest("button"), p = b && FIL.saved.find((x) => x.name === b.dataset.v);
      if (p) { FIL.s = LR4Filaments.useSaved(FIL.s, p); filSave(); applyColours(); }
    });
    $("fil-reset").addEventListener("click", () => { FIL.s = LR4Filaments.resetTo(FIL.s, FIL.saved); filSave(); applyColours(); });
    const form = $("fil-save-form");
    let renaming = false;                             // the name box saves a new preset, or renames yours
    function askName(rename) {
      renaming = rename;
      form.hidden = false;
      form.querySelector('button[type="submit"]').textContent = rename ? "Rename" : "Save";
      $("fil-save-name").value = rename ? FIL.s.saved : "";
      $("fil-save-name").focus();
      $("fil-save-name").select();
    }
    $("fil-save").addEventListener("click", () => askName(false));
    $("fil-rename").addEventListener("click", () => askName(true));
    $("fil-save-x").addEventListener("click", () => { form.hidden = true; });
    let okTimer = 0;
    function saved(name) {                            // keep it, say so for a few seconds
      [FIL.saved, FIL.s] = LR4Filaments.saveAs(FIL.saved, FIL.s, name);
      form.hidden = true;
      filSavePresets(); filSave(); applyColours();
      $("fil-ok").textContent = `Saved to "${name}" ✓`;
      clearTimeout(okTimer);
      okTimer = setTimeout(() => ($("fil-ok").textContent = ""), 4000);
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("fil-save-name").value.trim();
      if (!name) return;
      const old = renaming && FIL.s.saved;
      if (old === name) { form.hidden = true; return; }
      if (FIL.saved.some((p) => p.name === name) && !await askBox({ title: `Replace "${name}"?`, text: "You already have a preset with that name.", ok: "Replace" })) return;
      if (old) {                                      // rename: the stored preset keeps its filaments (edits stay unsaved)
        FIL.saved = FIL.saved.filter((p) => p.name !== name).map((p) => (p.name === old ? Object.assign({}, p, { name }) : p));
        FIL.s = Object.assign({}, FIL.s, { saved: name });
        form.hidden = true;
        filSavePresets(); filSave(); applyColours();
        $("fil-ok").textContent = `Renamed to "${name}" ✓`;
        clearTimeout(okTimer);
        okTimer = setTimeout(() => ($("fil-ok").textContent = ""), 4000);
        return;
      }
      saved(name);
    });
    $("fil-update").addEventListener("click", () => { if (FIL.s.saved) saved(FIL.s.saved); });
    $("fil-del").addEventListener("click", async () => {
      const name = FIL.s.saved;
      if (!name || !await askBox({ title: `Delete the preset "${name}"?`, text: "The filaments stay as they are.", ok: "Delete" })) return;
      FIL.saved = FIL.saved.filter((p) => p.name !== name);
      FIL.s = Object.assign({}, FIL.s, { saved: null });
      filSavePresets(); filSave(); applyColours();
    });
  }

