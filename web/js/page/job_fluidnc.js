// lr4-sandbox page, part 8 of 12: Run G-code on FluidNC, the SD card.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- Run G-code on FluidNC (Part 17): the picked file runs from FluidNC's SD card ($SD/Run=/file). The page
  // follows its motors (sampled every 4 ms) and carves from that motion (js/motion_carve.js: the file's own moves
  // while the machine is on them, else its sampled path). M0 holds it -> the pause popup with its MSG (Resume sends ~);
  // the touch plate goes on the stock at the hold before a probe and comes off at the one after it, as you would; a
  // change to a bit the file doesn't define holds it (!) so the bit can be given. The job's work zero is wherever it
  // starts (the strut job: G10 L20 at the homed spot), so it needs $H first, as Playback starts from Home. ----
  const fjPath = () => (!JOB.src ? null : JOB.src.kind === "sd" ? JOB.src.name : JOB.src.kind === "page" ? PAGE_SD : null);
  function fjButtons() {
    const on = CTL.mode === "fluidnc";
    $("job-play").textContent = !on ? (JOB.playing ? "Pause" : "Play") : !FJ.job ? "Run ($SD/Run)" : FJ.job.held ? "Resume ~" : "Hold !";
    $("job-reset").textContent = on ? "Stop (reset)" : "Start over";
    $("job-reset").disabled = on && !FJ.job;
    $("job-speed").hidden = on;
    $("job-t").disabled = on;
  }
  function fjWork(p) {                               // the page's pose (mm from the parked pose) -> the job's work mm
    const tv = meta.travel, st = JOB.tl.stock, z0 = jobZ0();
    return { x: p[0] - tv.x[0] - z0[0], y: p[1] - tv.y[0] - z0[1], z: p[2] + meta.tip_above_table + (st ? st.zmin : 0) };
  }
  function fjSample() {                              // every 4 ms while a job runs: the tool's spot from the motors
    if (!FJ.job || !CTL.sim || CTL.sim.stopped || !JOB.tl) return;
    const now = ncTime();                            // dt in machine seconds
    FJ.pts.push(Object.assign(fjWork(ctlRaw()), { dt: (now - FJ.job.at) / 1000 }));
    FJ.job.at = now;
  }
  async function fjRun() {
    if (!(await fjPrepare())) return;
    ctlLastSent = `$SD/Run=${FJ.job.path}`;
    ctlAdd("> " + ctlLastSent, "in");
    CTL.sim.send(ctlLastSent);                       // its ok comes when the file ends; an error ends the job (ctlLine)
  }
  // a $SD/Run from the pendant (FluidTouch's Files tab, held back until this settles): the same set-up as Run, for the
  // file it names (picked here first if it's another one on the card); FluidNC runs it either way
  async function fjFromPendant(file) {
    const path = file.replace(/^\/sd(?=\/)/i, "");
    if (CTL.mode !== "fluidnc" || !CTL.sim || FJ.job) return;
    if (fjPath() !== path) {
      if (!SDC.recs.some((r) => r.path === path)) { $("job-status").textContent = `The pendant runs ${path}: not on this card's list, so the page can't follow it.`; return; }
      await sdSelect(path);
    }
    if (fjPath() !== path) return;
    if (await fjPrepare()) {
      ctlAdd(`> $SD/Run=${file} (from the pendant)`, "in");
      $("job-status").textContent = `Running ${path} on FluidNC (started on the pendant)…`;
    }
  }
  async function fjPrepare() {                       // get the page ready to follow the picked file; false = it can't
    const sim = CTL.sim, path = fjPath();
    if (!sim || !JOB.tl || !path) return false;
    if (!CTL.homed) {
      $("job-status").textContent = "Home it first ($H): the job zeroes where the machine is when it starts, and the " +
        "page lays the stock out from the homed spot, as Basic mode does.";
      return false;
    }
    const p = ctlRaw(), here = { x: p[0], y: p[1], z: p[2] }, from = jobSpot();   // lay the job out from where it starts
    if (!from || ["x", "y", "z"].some((a) => Math.abs(here[a] - from[a]) > 0.005)) {
      CTL.runFrom = here;
      $("job-status").textContent = "Reading the job from where the machine is…";
      await jobSetup(JOB.pageJob);
      if (!JOB.tl || FJ.job) return false;
    }
    if (JOB.src.kind === "page") {                   // make sure the card has this very file
      try { await SdCard.store.put(PAGE_SD, JOB.src.text); SDC.saved = JOB.src.text; } catch (e) { /* the live card is enough */ }
      SdCard.writeLive(sim, PAGE_SD, JOB.src.text);
      sdRefresh();
    }
    if (JOB.sim) JOB.sim.reset();
    jobUpdateMesh(true);
    FJ.job = { path, T: MotionCarve.tracker(JOB.tl.segs), seenSD: false, held: false, k: 0, at: ncTime(), plate: null };
    FJ.pts = []; FJ.lastMsg = "";
    clearInterval(FJ.timer);
    FJ.timer = setInterval(fjSample, 4);
    $("job-pop").hidden = true;
    $("job-status").textContent = `Running ${path} on FluidNC…`;
    fjButtons();
    // G54 = the cutting area's front-left corner on the stock top, where Playback puts work zero (as you'd jog there
    // and zero); a file that zeroes itself (the strut job's G10 L20) moves it, in both
    const tv = meta.travel, hp = CTL.homePose, hs = Homing.settings(CTL.yaml), st = JOB.tl.stock;
    const z0 = jobZ0();                              // + a video's work zero (LR4Demo.zero)
    const wz = [hs.x.mpos + tv.x[0] + z0[0] - hp.x, hs.y.mpos + tv.y[0] + z0[1] - hp.y, hs.z.mpos - meta.tip_above_table - (st ? st.zmin : 0) - hp.z];
    await sim.command(`G10 L2 P1 X${wz[0].toFixed(3)} Y${wz[1].toFixed(3)} Z${wz[2].toFixed(3)}`).catch(() => {});
    return true;
  }
  function fjReload() {                              // the job reloaded mid-run (stock / bits given): carve on from here
    if (JOB.sim) JOB.sim.reset();
    jobUpdateMesh(true);
    if (FJ.job.plate) jobTouch(JOB.tl.plates.find((q) => q.index === FJ.job.plate.index) || null);
  }
  function fjTick() {                                // once a frame: carve what the motors did since the last frame
    const J = FJ.job, tl = JOB.tl;
    fjSample();
    const rate = Math.max(...["x", "y", "z"].map((a) => CTL.cfg.rates[a] || 0)) / 60;   // mm/s of machine time (fjSample's dt)
    const pts = FJ.pts.splice(0);
    for (const q of pts) {
      const acts = J.T.feed(q, rate * q.dt * 1.5 + 1);
      if (JOB.sim && acts.length) MotionCarve.carve(JOB.sim, tl.segs, acts);
      if (JOB.spoil && acts.length && MotionCarve.carve(JOB.spoil, tl.segs, acts)) J.spoilCut = true;
    }
    jobUpdateMesh(false);
    if (J.spoilCut) { J.spoilCut = false; meshUpdate(SPOIL.sim, SPOIL.mesh, false); spoilSaveSoon(); }
    JOB.done.geometry.setDrawRange(0, 2 * J.T.carved);
    JOB.partial.geometry.setDrawRange(0, 0);
    const w = J.T.last;
    if (w) { $("wx").textContent = w.x.toFixed(3); $("wy").textContent = w.y.toFixed(3); $("wz").textContent = w.z.toFixed(3); }
    for (; J.k < tl.events.length && tl.events[J.k].index <= J.T.i; J.k++) {
      const e = tl.events[J.k];                      // a tool change (M6): hold it there for the bit
      if (e.kind === "tool" && !J.held) { CTL.sim.realtime("!"); J.toolStop = e; }
    }
  }
  function fjPlate(pl) {                             // the touch plate on the stock (pl: a tl.plates entry) or away
    FJ.job.plate = pl;
    CTL.jobPlate = pl;
    ctlProbe();
    jobTouch(pl);
    jobCloseUp(pl);
    if (!pl && CTL.pose) move(CTL.pose);             // the plate back on the core (move() places it)
  }
  function fjHold() {                                // FluidNC is holding (M0, or ! from here): the popup
    fjTick();                                        // the motion up to now first: the status can beat the frame
    const J = FJ.job, tl = JOB.tl, segs = tl.segs, c = J.T.i;
    const noCut = (a, b) => { for (let i = a; i < b; i++) if (segs[i].type === "cut") return false; return true; };
    const attach = tl.plates.find((q) => q.index >= c && noCut(c, q.index));
    const remove = !attach && J.plate && noCut(J.plate.index + 1, c + 1);
    if (attach) fjPlate(attach); else if (remove) fjPlate(null);
    const tool = J.toolStop;
    J.toolStop = null;
    $("job-pop-h").textContent = tool ? "Tool change" : FJ.lastMsg ? "Paused (M0)" : "Feed hold";
    $("job-pop-msg").textContent = tool ? tool.text : FJ.lastMsg || "Held. Resume to carry on.";
    $("job-resume").textContent = "Resume (cycle start)";
    $("job-pop-bit").hidden = true;
    if (tool) toolAsk(tool);
    $("job-pop").hidden = false;
    $("job-status").textContent = $("job-pop-msg").textContent;
  }
  function fjStatus(ev) {                            // each status report while a job runs
    const J = FJ.job;
    if (ev.SD) { J.seenSD = true; $("job-o").textContent = `${ev.SD.pct.toFixed(0)}%`; $("job-t").value = Math.round(ev.SD.pct * 10); }
    const hold = /^Hold/.test(ev.state || "");
    if (hold && !J.held) { J.held = true; fjHold(); fjButtons(); }
    else if (!hold && J.held && ev.state !== "Door") { J.held = false; $("job-pop").hidden = true; if (JOB.toolAsk) toolPut(); FJ.lastMsg = ""; fjButtons(); }
    if (ev.state === "Alarm") fjDone("FluidNC alarmed: the job stopped. Send $X (Unlock) to carry on.");
    else if (J.seenSD && !ev.SD && ev.state === "Idle") fjDone("Done.");
  }
  function fjDone(text) {
    if (!FJ.job) return;
    const J = FJ.job;
    clearInterval(FJ.timer);
    fjTick();                                        // the last of the motion
    if (J.plate) fjPlate(null);
    FJ.job = null;
    jobCloseUp(null);
    $("job-pop").hidden = true;
    $("job-status").textContent = text;
    $("job-install").hidden = !(text === "Done." && JOB.src && JOB.src.kind === "page");
    fjButtons();
  }
  // for tests/test_page_sdjob.js: the job, its carving, and Playback's carve of the same moves to compare with
  window.LR4Job = { tl: () => JOB.tl, src: () => JOB.src, sim: () => JOB.sim, spoil: () => SPOIL.sim, hand: () => HAND, handSim: () => HAND.sim, running: () => !!FJ.job, held: () => !!(FJ.job && FJ.job.held),
    files: () => SDC.recs.map((r) => r.path), yamlNote: () => yamlBase && yamlBase.note, flashList: () => $("flash-list").textContent, select: sdSelect, add: sdAdd, refresh: sdRefresh, PAGE_SD,
    playbackHeights() {
      const s = Imperfect.attach(new StockSimulator(JOB.tl.stock, JOB.tl.tools, { maxCells: JOB.cells, snapshots: false }),
        JOB.sim && JOB.sim._asBuilt ? JOB.sim._asBuilt.toTable : [0, 0, 0], abState);
      if (JOB.sim && JOB.sim._asBuilt) Imperfect.follow(s, JOB.sim._asBuilt.rest);
      s.setSegments(JOB.tl.segs);
      s.advanceTo(JOB.tl.segs.length);
      return s;
    } };
  $("job-t").addEventListener("input", (e) => {
    if (!JOB.tl) return;
    $("job-pop").hidden = true;
    jobSeek(e.target.value / 1000 * JOB.tl.total);
    JOB.k = GcodePlay.pending(JOB.tl, JOB.t);
  });
  try { $("job-closeup").checked = localStorage.getItem("lr4-probe-closeup") !== "0"; } catch (e) { /* on */ }
  $("job-closeup").addEventListener("change", (e) => {
    try { localStorage.setItem("lr4-probe-closeup", e.target.checked ? "1" : "0"); } catch (err) { /* not kept */ }
    if (!e.target.checked) jobCloseUp(null);
  });
  $("job-moves").addEventListener("change", (e) => { if (JOB.ahead) JOB.ahead.visible = JOB.done.visible = JOB.partial.visible = e.target.checked; });
  // ---- the SD card (js/sd_card.js): G-code files kept in this browser. A name loads it; ▶ plays it (Playback) or runs it
  // (FluidNC, which boots with the same files on its card); the strut plate G-code is kept on it as PAGE_SD. ----
  const sdText = (r) => new TextDecoder().decode(r.bytes);
  SDC.tree = { cur: "", closed: new Set() };
  function sdRow(r) {                                // one file on the card's tree
    const row = document.createElement("div"), name = document.createElement("button"), size = document.createElement("small");
    row.className = "sd-row"; row.setAttribute("role", "option");
    const sel = JOB.file ? JOB.file.kind === "sd" && JOB.file.name === r.path : r.path === PAGE_SD && pageLive();
    row.setAttribute("aria-selected", String(sel));
    name.type = "button"; name.className = "sd-name"; name.textContent = r.path.split("/").pop(); name.title = `Load ${r.path}`;
    size.textContent = r.bytes.length >= 1e6 ? `${(r.bytes.length / 1e6).toFixed(1)} MB` : `${Math.ceil(r.bytes.length / 1e3)} KB`;
    row.append(name, size);
    if (UI_FILE.test(r.path)) {                      // a web UI, not a job: it opens under Controller > Web UIs
      name.title = `${r.path} is a web UI: open it under Run > Controller > Web UIs`;
      name.addEventListener("click", () => { $("ui-box").open = true; $("ui-box").scrollIntoView({ block: "center", behavior: "smooth" }); });
    } else {
      name.addEventListener("click", () => sdSelect(r.path));
      const go = document.createElement("button");  // load it and start: Play (Playback) or $SD/Run (FluidNC)
      go.type = "button"; go.className = "sd-act"; go.textContent = "▶";
      go.title = `${CTL.mode === "fluidnc" ? "Run" : "Play"} ${r.path}`; go.setAttribute("aria-label", go.title);
      go.addEventListener("click", () => sdStart(r.path));
      row.append(go);
    }
    const dl = document.createElement("button"), del = document.createElement("button");
    dl.type = del.type = "button"; dl.className = del.className = "sd-act";
    dl.textContent = "⬇"; dl.title = `Download ${r.path}`; dl.setAttribute("aria-label", dl.title);
    dl.addEventListener("click", () => save(r.path.split("/").pop(), r.bytes, "sd-status"));
    del.textContent = "✕"; del.title = `Delete ${r.path}`; del.setAttribute("aria-label", del.title);
    del.addEventListener("click", () => sdDelete(r.path));
    row.append(dl, del);
    return row;
  }
  async function sdRefresh() {
    let dirs = [];
    try { SDC.recs = await SdCard.store.all(); dirs = await SdCard.store.dirs(); }
    catch (e) { SDC.recs = []; $("sd-status").textContent = "This browser keeps no files for the page (site data blocked?)."; }
    $("sd-count").textContent = `${SDC.recs.length} file${SDC.recs.length === 1 ? "" : "s"}`;
    cardTree($("sd-list"), SDC.recs, dirs, SDC.tree, sdRow, sdDeleteDir, sdRefresh);
    $("sd-where").textContent = cardWhere(SDC.tree);
    uiRefresh();
  }
  async function sdDeleteDir(d) {                    // a folder and everything in it
    const gone = await SdCard.store.removeTree(d);
    SdCard.removeTreeLive(CTL.sim, d);
    if (gone.includes(PAGE_SD)) SDC.saved = null;
    if (JOB.file && JOB.file.kind === "sd" && gone.includes(JOB.file.name)) { JOB.file = null; jobSetup(JOB.pageJob); }
    sdRefresh();
  }
  $("sd-mkdir").addEventListener("click", () => cardMkdir(SdCard, SDC.tree, sdRefresh, "sd-status"));
  const pageLive = () => U.struts === "temp" && !!JOB.pageJob;   // the strut job is the page's own (Temporary struts)
  async function sdSelect(path) {
    if (UI_FILE.test(path)) return;                  // web UIs open under Controller > Web UIs
    const r = SDC.recs.find((q) => q.path === path);
    if (!r) return;
    JOB.file = path === PAGE_SD && pageLive() ? null : { kind: "sd", name: path, text: sdText(r) };
    try { localStorage.setItem("lr4-sd-sel", path); } catch (e) { /* not kept */ }
    sdRefresh();
    await jobSetup(JOB.pageJob);
  }
  async function sdStart(path) {                     // ▶: load the file, then Play it / run it on FluidNC
    if (FJ.job) { $("sd-status").textContent = "A job is running on FluidNC: stop it first."; return; }
    await sdSelect(path);
    $("h-job").scrollIntoView({ block: "start", behavior: "smooth" });
    if (!JOB.tl || !JOB.src || (JOB.src.kind === "sd" ? JOB.src.name !== path : path !== PAGE_SD)) return;
    if (CTL.mode === "fluidnc") { if (CTL.sim) fjRun(); else $("sd-status").textContent = "FluidNC is still starting."; }
    else { if (JOB.t >= JOB.tl.total) jobSeek(0); if (!JOB.playing) $("job-play").click(); }
  }
  async function sdAdd(files) {
    const uis = files.filter((f) => UI_FILE.test(f.name));   // web UIs dropped on the card: as from Web UIs
    if (uis.length) { await uiAdd(uis, "sd"); files = files.filter((f) => !uis.includes(f)); if (!files.length) return; }
    let first = null;
    for (const f of files) {
      const path = SDC.tree.cur + SdCard.pathOf(f.name), bytes = new Uint8Array(await f.arrayBuffer());
      await SdCard.store.put(path, bytes);
      SdCard.writeLive(CTL.sim, path, bytes);
      if (!UI_FILE.test(path)) first = first || path;   // a web UI isn't a job to load
    }
    await sdRefresh();
    if (first) sdSelect(first);
    $("sd-status").textContent = files.length ? `Added ${files.length} file${files.length > 1 ? "s" : ""}.` : "";
  }
  async function sdDelete(path) {
    await SdCard.store.remove(path);
    SdCard.removeLive(CTL.sim, path);
    if (path === PAGE_SD) SDC.saved = null;
    if (JOB.file && JOB.file.kind === "sd" && JOB.file.name === path) { JOB.file = null; jobSetup(JOB.pageJob); }
    sdRefresh();
  }
  async function sdSyncBack() {                       // FluidNC changed its card ($SD/Delete ...): keep the store in step
    const d = await SdCard.sync(CTL.sim).catch(() => ({ put: [], remove: [] }));
    if (!d.put.length && !d.remove.length && !d.dirs) return;
    if (JOB.file && JOB.file.kind === "sd" && d.remove.includes(JOB.file.name)) { JOB.file = null; jobSetup(JOB.pageJob); }
    sdRefresh();
  }
  function sdSavePage(j) {                           // the strut plate G-code onto the card (debounced: sizes drag)
    clearTimeout(SDC.saveTimer);
    if (!j || j.gcode === SDC.saved) return;
    SDC.saveTimer = setTimeout(async () => {
      try {
        await SdCard.store.put(PAGE_SD, j.gcode);
        SdCard.writeLive(CTL.sim, PAGE_SD, j.gcode);
        SDC.saved = j.gcode;
        sdRefresh();
      } catch (e) { /* no storage: the page job still plays */ }
    }, 600);
  }
  $("job-file").addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) sdAdd(f); });
  {
    const box = $("sd-box"), list = $("sd-list");
    box.addEventListener("dragover", (e) => { e.preventDefault(); list.classList.add("drop"); });
    box.addEventListener("dragleave", () => list.classList.remove("drop"));
    box.addEventListener("drop", (e) => { e.preventDefault(); list.classList.remove("drop"); if (e.dataTransfer.files.length) sdAdd([...e.dataTransfer.files]); });
  }
  flashRefresh();
  sdRefresh().then(() => {                           // the file picked last time
    let p = null;
    try { p = localStorage.getItem("lr4-sd-sel"); } catch (e) { /* none */ }
    if (p && p !== PAGE_SD && !UI_FILE.test(p) && SDC.recs.some((r) => r.path === p)) sdSelect(p);
  });
  $("job-back").addEventListener("click", () => {
    JOB.file = null;
    try { localStorage.setItem("lr4-sd-sel", PAGE_SD); } catch (e) { /* not kept */ }
    jobSetup(JOB.pageJob);
    sdRefresh();
  });
  $("job-install").addEventListener("click", () => {
    const b = document.querySelector('#strut-variant button[data-v="mdf"]');
    if (b) b.click();
  });
  $("job-temp").addEventListener("click", () => {    // the same switch as Config > Parts > Strut plates
    const b = document.querySelector('#strut-variant button[data-v="temp"]');
    if (b) b.click();
  });

