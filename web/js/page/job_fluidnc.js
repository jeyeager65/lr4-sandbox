// lr4-sandbox page, part 8 of 14: Run G-code on FluidNC (+ Preview's buttons), the SD card.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- Run G-code on FluidNC (Part 17): the picked file runs from FluidNC's SD card ($SD/Run=/file). The page
  // follows its motors (sampled every 4 ms) and carves from that motion (js/motion_carve.js: the file's own moves
  // while the machine is on them, else its sampled path). M0 holds it -> the pause popup with its MSG (Resume sends ~);
  // the touch plate goes on the stock at the hold before a probe and comes off at the one after it, as you would; a
  // change to a bit the file doesn't define holds it (!) so the bit can be given. The job's work zero is wherever it
  // starts (the strut job: G10 L20 at the homed spot), so it needs $H first. ----
  const fjPath = () => (JOB.src && JOB.src.kind === "sd" ? JOB.src.name : null);
  // Part 36: the job box (▶ Start = the check, then $SD/Run; 👁 Preview; the running job's progress), Preview's player
  // in place of the right column (job-play = its Play / Pause; clicked outside Preview it still runs the job: tests,
  // videos), Hold / Resume + Stop in the left column (runState)
  function fjButtons() {
    const pv = !!JOB.preview, run = !!FJ.job;
    $("job-play").textContent = pv ? (JOB.playing ? "❚❚ Pause" : "▶ Play") : "Run ($SD/Run)";
    $("job-start").disabled = $("job-pv").disabled = $("job-prev").disabled = $("job-unload").disabled = run;
    $("pv-box").hidden = !pv; $("run-main").hidden = pv; $("pv-banner").hidden = !pv;
    document.documentElement.classList.toggle("pv-on", pv);
    $("job-bar").hidden = $("job-prog").hidden = !run;
    $("job-pill").hidden = !run;
    if (run) { $("job-pill").textContent = FJ.job.held ? "Held" : "Running"; $("job-pill").classList.toggle("hold", !!FJ.job.held); }
    else $("job-bar-i").style.width = "0";
    runState();
  }
  function fjProgress(pct) {                         // FluidNC's SD:pct while it runs; the time left from the file's clock
    const J = FJ.job, el = (ncTime() - J.t0) / 1000, ov = CTL.ov ? CTL.ov[0] / 100 : 1;
    const left = pct > 0.5 ? el * (100 - pct) / pct : JOB.tl ? JOB.tl.total / ov : 0;
    $("job-bar-i").style.width = `${Math.min(100, pct).toFixed(1)}%`;
    $("job-prog").textContent = `${pct.toFixed(0)}% · ${clock(el)} in · ~${clock(left)} left (machine time)`;
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
    if (!(await fjPrepare()) || !FJ.job) return;     // (gone meanwhile: stopped, or a second Run beat it)
    ctlLastSent = `$SD/Run=${FJ.job.path}`;
    ctlAdd("> " + ctlLastSent, "in");
    CTL.sim.send(ctlLastSent);                       // its ok comes when the file ends; an error ends the job (ctlLine)
  }
  // a $SD/Run from the pendant (FluidTouch's Files tab, held back until this settles): the same set-up as Run, for the
  // file it names (picked here first if it's another one on the card); FluidNC runs it either way
  async function fjFromPendant(file) {
    const path = file.replace(/^\/sd(?=\/)/i, "");
    if (!CTL.sim || FJ.job) return;
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
    if (JOB.preview) previewEnd();                   // Run: the machine, not the preview
    const sim = CTL.sim, path = fjPath();
    if (!sim || !JOB.tl || !path) return false;
    if (!CTL.homed) {
      $("job-status").textContent = "Home it first ($H): the job zeroes where the machine is when it starts, and the " +
        "page lays the stock out from the homed spot. Preview plays it without homing.";
      return false;
    }
    const p = ctlRaw(), here = { x: p[0], y: p[1], z: p[2] }, from = jobSpot();   // lay the job out from where it starts
    if (!from || ["x", "y", "z"].some((a) => Math.abs(here[a] - from[a]) > 0.005)) {
      CTL.runFrom = here;
      $("job-status").textContent = "Reading the job from where the machine is…";
      await jobSetup(JOB.pageJob);
      if (!JOB.tl || FJ.job) return false;
    }
    if (JOB.sim) JOB.sim.reset();
    jobUpdateMesh(true);
    // T carves (on the G-code's moves within 0.1 mm) and says how far the job has got (messages, M0s, tool stops, the
    // sound, videos). As built on Real-world (Part 43d): P says that instead - the same samples within 2 mm, as the
    // machine runs a little off the G-code's own path there (a probe on a warped board sets Z where the page's ideal one
    // wouldn't, a gantry left racked), where T has left the path (it carves the motors' own lines then) and would stay
    // at the move it left. Only then: on small arcs a 2 mm band holds P back (a 3 mm circle is all inside it).
    FJ.job = { path, T: MotionCarve.tracker(JOB.tl.segs), P: AB.set.on ? MotionCarve.tracker(JOB.tl.segs, { tol: 2 }) : null, seenSD: false, held: false, k: 0, at: ncTime(), t0: ncTime(), plate: null };
    FJ.pts = []; FJ.lastMsg = "";
    clearInterval(FJ.timer);
    FJ.timer = setInterval(fjSample, 4);
    $("job-pop").hidden = true;
    $("job-status").textContent = `Running ${path} on FluidNC…`;
    fjButtons();
    // G54 = the cutting area's front-left corner on the stock top, where Preview puts work zero too (as you'd jog there
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
      if (J.P) {                                     // As built: the motors are off the path by its errors, so the
        J.P.feed(q, rate * q.dt * 1.5 + 1);          // exact tracker carves straight lines from sample to sample, with
        for (const a of acts) if (a.line && J.P.i > a.seg) a.seg = J.P.i;   // the bit of the move the job is on (the 2 mm
      }                                              // tracker) - not the last move it matched (2026-10-26: T1's V-bit
                                                     // carved the 1in surfacing passes as thin lines)
      if (JOB.sim && acts.length) MotionCarve.carve(JOB.sim, tl.segs, acts);
      if (JOB.spoil && acts.length && MotionCarve.carve(JOB.spoil, tl.segs, acts)) J.spoilCut = true;
    }
    jobUpdateMesh(false);
    if (J.spoilCut) { J.spoilCut = false; meshUpdate(SPOIL.sim, SPOIL.mesh, false); spoilSaveSoon(); }
    JOB.done.geometry.setDrawRange(0, 2 * J.T.carved);
    JOB.partial.geometry.setDrawRange(0, 0);
    const w = J.T.last;
    if (w) { $("wx").textContent = w.x.toFixed(3); $("wy").textContent = w.y.toFixed(3); $("wz").textContent = w.z.toFixed(3); }
    for (; J.k < tl.events.length && tl.events[J.k].index <= (J.P || J.T).i; J.k++) {
      const e = tl.events[J.k];                      // a tool change (M6): hold it there for the bit - also when the
      if (e.kind === "tool") {                       // hold beat this tick there (slow frames): fjHold's own tick then
        J.toolStop = e;                              // still finds it, so the popup asks for the bit, not "Paused (M0)"
        if (!J.held) CTL.sim.realtime("!");
      }
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
    const J = FJ.job, tl = JOB.tl, segs = tl.segs, c = (J.P || J.T).i;
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
    if (ev.SD) { J.seenSD = true; fjProgress(ev.SD.pct); }
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
    fjButtons();
  }
  // for tests/test_page_sdjob.js: the job, its carving, and Preview's carve of the same moves to compare with
  window.LR4Job = { tl: () => JOB.tl, src: () => JOB.src, sim: () => JOB.sim, spoil: () => SPOIL.sim, hand: () => HAND, handSim: () => HAND.sim, running: () => !!FJ.job, held: () => !!(FJ.job && FJ.job.held),
    files: () => SDC.recs.map((r) => r.path), yamlNote: () => yamlBase && yamlBase.note, flashList: () => $("flash-list").textContent, select: sdSelect, add: sdAdd, refresh: sdRefresh, get PAGE_SD() { return PAGE_SD; },
    playbackHeights() {
      const s = Imperfect.attach(new StockSimulator(JOB.tl.stock, JOB.tl.tools, { maxCells: JOB.cells, snapshots: false }),
        JOB.sim && JOB.sim._asBuilt ? JOB.sim._asBuilt.toTable : [0, 0, 0], abState);
      if (JOB.sim && JOB.sim._asBuilt) Imperfect.follow(s, JOB.sim._asBuilt.rest);
      s.setSegments(JOB.tl.segs);
      s.advanceTo(JOB.tl.segs.length);
      return s;
    } };
  $("job-t").addEventListener("input", (e) => {
    if (!JOB.tl || !JOB.preview) return;            // (disabled outside Preview)
    $("job-pop").hidden = true;
    jobSeek(e.target.value / 1000 * JOB.tl.total);
    JOB.k = GcodePlay.pending(JOB.tl, JOB.t);
  });
  try { $("job-closeup").checked = MS.get("lr4-probe-closeup") !== "0"; } catch (e) { /* on */ }
  $("job-closeup").addEventListener("change", (e) => {
    try { MS.set("lr4-probe-closeup", e.target.checked ? "1" : "0"); } catch (err) { /* not kept */ }
    if (!e.target.checked) jobCloseUp(null);
  });
  $("job-moves").addEventListener("change", (e) => { if (JOB.ahead) JOB.ahead.visible = JOB.done.visible = JOB.partial.visible = e.target.checked; });
  // ---- the SD card (js/sd_card.js): G-code files kept in this browser. A name loads it; ▶ runs it
  // (FluidNC, which boots with the same files on its card); the strut plate G-code is kept on it as PAGE_SD. ----
  const sdText = (r) => new TextDecoder().decode(r.bytes);
  SDC.tree = { cur: "" };
  function sdRow(r) {                                // one file on the card's tree
    const row = document.createElement("div"), name = document.createElement("button"), size = document.createElement("small");
    row.className = "sd-row"; row.setAttribute("role", "option");
    const sel = !!JOB.file && JOB.file.kind === "sd" && JOB.file.name === r.path;
    row.setAttribute("aria-selected", String(sel));
    name.type = "button"; name.className = "sd-name"; breakable(name, r.path.split("/").pop()); name.title = `Load ${r.path}`;
    size.textContent = r.bytes.length >= 1e6 ? `${(r.bytes.length / 1e6).toFixed(1)} MB` : `${Math.ceil(r.bytes.length / 1e3)} KB`;
    row.append(name, size);
    if (UI_FILE.test(r.path)) {                      // a web UI, not a job: it opens from the top bar's Pendant & WebUI
      name.title = `${r.path} is a web UI: open it from Pendant & WebUI (top bar)`;
      name.addEventListener("click", () => popToggle($("pw-btn"), $("pw-pop"), true));
    } else {
      name.addEventListener("click", () => sdSelect(r.path));
      const pv = document.createElement("button"), go = document.createElement("button");
      pv.type = go.type = "button"; pv.className = "sd-act"; go.className = "sd-act sd-go";
      pv.textContent = "👁"; pv.title = `Preview ${r.path} (the machine doesn't move)`; pv.setAttribute("aria-label", pv.title);
      pv.addEventListener("click", () => sdPreview(r.path));
      go.textContent = "▶"; go.title = `Start ${r.path} on FluidNC`; go.setAttribute("aria-label", go.title);
      go.addEventListener("click", () => sdStart(r.path, go));
      row.append(go, pv);
    }
    const more = [["Download", () => save(r.path.split("/").pop(), r.bytes, "sd-status")], ["Delete", () => sdDelete(r.path)]];
    // Part 43b: a video script ((Video ...) lines near the top) plays as a help video, on the temporary help machine
    if (!UI_FILE.test(r.path) && /\(\s*Video\b/i.test(new TextDecoder().decode(r.bytes.subarray(0, 65536))))
      more.unshift(["▶ Play as a video", () => LR4Help.playFile(r.path.split("/").pop(), sdText(r))]);
    row.append(rowMore(r.path, more));
    return row;
  }
  async function sdRefresh() {
    let dirs = [];
    try { SDC.recs = await SdCard.store.all(); dirs = await SdCard.store.dirs(); }
    catch (e) { SDC.recs = []; $("sd-status").textContent = "This browser keeps no files for the page (site data blocked?)."; }
    $("sd-count").textContent = `${SDC.recs.length} file${SDC.recs.length === 1 ? "" : "s"}`;
    cardTree($("sd-list"), SDC.recs, dirs, SDC.tree, sdRow, sdDeleteDir, sdRefresh, sdAdd);
    cardPath($("sd-path"), "SD card", SDC.tree, sdRefresh);
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
  async function sdSelect(path) {
    if (UI_FILE.test(path)) return;                  // web UIs open from Pendant & WebUI
    const r = SDC.recs.find((q) => q.path === path);
    if (!r) return;
    JOB.file = { kind: "sd", name: path, text: sdText(r) };
    try { MS.set("lr4-sd-sel", path); } catch (e) { /* not kept */ }
    sdRefresh();
    await jobSetup(JOB.pageJob);
  }
  const isLoaded = (path) => !!(JOB.tl && JOB.src && JOB.src.kind === "sd" && JOB.src.name === path);
  async function sdStart(path, by) {                 // ▶: load the file, then the Start check by its row
    if (FJ.job) { $("sd-status").textContent = "A job is running on FluidNC: stop it first."; return; }
    if (!isLoaded(path)) await sdSelect(path);
    if (!isLoaded(path)) return;
    startAsk(by);
  }
  async function sdPreview(path) {                   // 👁: load it, then Preview
    if (FJ.job) { $("sd-status").textContent = "A job is running on FluidNC: Preview after it."; return; }
    if (JOB.preview) previewEnd();
    if (!isLoaded(path)) await sdSelect(path);
    if (isLoaded(path)) previewStart();
  }
  // ---- ▶ Start's check (user 2026-10-24): the file + what's off (not homed, no work zero, bigger than the stock,
  // another bit in the router, past the travel), one Start button. by = the button it opens by ----
  function startChecks() {
    const tl = JOB.tl, out = [], st = tl.stock, txt = JOB.src.text || "";
    out.push(CTL.homed ? ["ok", "Homed"] : ["bad", "Not homed: Home all first (the job is laid out from the homed spot)"]);
    out.push(/^\s*[^;(]*\b(G10\s*L20|G92|G38\.[2-5])/im.test(txt) ? ["ok", "The file sets its own work zero (G10 L20 / G92 / probe)"]
      : ["warn", "Work zero: the page sets G54 at the cutting area's front-left corner, Z on the stock top (your own Zero is replaced)"]);
    if (st) {
      const b = tl.segs.reduce((r, s) => [Math.min(r[0], s.end.x), Math.max(r[1], s.end.x), Math.min(r[2], s.end.y), Math.max(r[3], s.end.y)],
        [Infinity, -Infinity, Infinity, -Infinity]);
      const w = b[1] - b[0], h = b[3] - b[2], fits = b[0] >= st.xmin - 0.5 && b[1] <= st.xmax + 0.5 && b[2] >= st.ymin - 0.5 && b[3] <= st.ymax + 0.5;
      out.push([fits ? "ok" : "warn", `${fits ? "Fits on" : "Bigger than"} the stock (${w.toFixed(0)} × ${h.toFixed(0)} of ` +
        `${(st.xmax - st.xmin).toFixed(0)} × ${(st.ymax - st.ymin).toFixed(0)} mm)`]);
    } else out.push(["warn", "No stock on the table: only the spoilboard gets cut"]);
    const t1 = tl.tools.get(tl.segs[0].toolNumber);
    if (t1) {
      const want = HandSetup.fromDef(t1), have = HAND.bit, same = have && have.shape === want.shape && Math.abs(have.d - want.d) < 0.01;
      out.push([same ? "ok" : "warn", same ? `${HandSetup.bitName(want)} in the router` : `The file wants ${HandSetup.bitName(want)}; the router has ${have ? HandSetup.bitName(have) : "no bit"}`]);
    }
    if (!JOB.fits) out.push(["warn", "Some moves are past this machine's travel"]);
    if (!CTL.sim) out.push(["bad", CTL.booting ? "FluidNC is still starting" : "FluidNC isn't running"]);
    return out;
  }
  function startAsk(by) {
    const pop = $("start-pop"), list = $("start-chk");
    if (!JOB.tl || FJ.job) return;
    if (JOB.preview) previewEnd();
    $("start-h").textContent = `Start ${JOB.src.kind === "sd" ? JOB.src.name.split("/").pop() : "the strut plate job"}?`;
    list.textContent = "";
    const chk = startChecks();
    for (const [k, t] of chk) { const li = document.createElement("li"); li.className = k; li.textContent = t; list.append(li); }
    $("start-go").disabled = chk.some(([k]) => k === "bad");
    pop.hidden = false;
    const r = (by || $("job-start")).getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
    pop.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
    pop.style.top = `${r.bottom + hgt + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - hgt - 6)}px`;
    $("start-go").focus();
  }
  const startClose = () => { $("start-pop").hidden = true; };
  $("start-no").addEventListener("click", startClose);
  $("start-go").addEventListener("click", () => { startClose(); if (CTL.sim && JOB.tl && !FJ.job) fjRun(); });
  $("job-start").addEventListener("click", (e) => startAsk(e.currentTarget));
  $("job-pv").addEventListener("click", () => previewStart());
  document.addEventListener("pointerdown", (e) => { if (!$("start-pop").hidden && !e.target.closest("#start-pop, .sd-go, #job-start")) startClose(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") startClose(); });
  // the right column's SD card | Flash
  for (const [id, show] of [["src-sd", "sd-box"], ["src-flash", "flash-box"]]) $(id).addEventListener("click", () => {
    for (const [b, p] of [["src-sd", "sd-box"], ["src-flash", "flash-box"]]) { $(b).setAttribute("aria-pressed", String(p === show)); $(p).hidden = p !== show; }
  });
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
  // the strut plate G-code onto the card (debounced: sizes drag) under this size's name; the page's file for the last
  // size goes (unless it was changed on the card), so the card keeps one, not one per size. Writes run one after
  // another (SDC.saving) and each reads the card as it is then: a size change mid-write can't leave two behind.
  function sdSavePage(j) {
    clearTimeout(SDC.saveTimer);
    if (!j) return;
    SDC.saveTimer = setTimeout(() => {
      SDC.saving = (SDC.saving || Promise.resolve()).then(() => sdWritePage(j)).catch((e) => console.warn("strut plate file", e));
    }, 600);
  }
  async function sdWritePage(j) {
    if (j !== JOB.pageJob) return;                   // a newer job came meanwhile: its own write follows
    const path = pageSdPath(), old = PAGE_SD;
    if (j.gcode === SDC.saved && path === old) return;
    await SdCard.store.put(path, j.gcode);
    SdCard.writeLive(CTL.sim, path, j.gcode);
    if (old !== path) {
      const was = (await SdCard.store.all()).find((r) => r.path === old);
      if (was && (old === PAGE_OLD || sdText(was) === SDC.saved) && !(FJ.job && FJ.job.path === old)) {
        await SdCard.store.remove(old); SdCard.removeLive(CTL.sim, old);
      }
      try { if (MS.get("lr4-sd-sel") === old) MS.set("lr4-sd-sel", path); } catch (e) { /* not kept */ }
    }
    PAGE_SD = path;
    SDC.saved = j.gcode;
    // the strut plate file loaded (not running): it follows the new size / settings, as the card's copy did
    if (JOB.file && JOB.file.kind === "sd" && (JOB.file.name === old || JOB.file.name === path) && !FJ.job && !JOB.preview &&
        (JOB.file.name !== path || JOB.file.text !== j.gcode)) {
      JOB.file = { kind: "sd", name: path, text: j.gcode };
      jobSetup(JOB.pageJob);
    }
    await sdRefresh();
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
    try { p = MS.get("lr4-sd-sel"); } catch (e) { /* none */ }
    if (p && !UI_FILE.test(p) && SDC.recs.some((r) => r.path === p)) sdSelect(p);
  });
  $("job-unload").addEventListener("click", () => {   // no job loaded: its stock, moves and bits off (user 2026-10-24)
    if (FJ.job) { $("job-status").textContent = "A job is running on FluidNC: stop it first."; return; }
    Object.assign(JOB, { file: null, stockOff: null });
    try { MS.remove("lr4-sd-sel"); } catch (e) { /* nothing kept */ }
    jobSetup(JOB.pageJob);
    sdRefresh();
  });
  $("job-temp").addEventListener("click", async () => {   // the strut plate file for this size, as picking it on the card
    clearTimeout(SDC.saveTimer);                     // this size's file on the card first (after any write under way)
    SDC.saving = (SDC.saving || Promise.resolve()).then(() => JOB.pageJob && sdWritePage(JOB.pageJob)).catch((e) => console.warn("strut plate file", e));
    await SDC.saving;
    sdSelect(PAGE_SD);
  });

