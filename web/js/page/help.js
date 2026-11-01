// lr4-sandbox page, part 14 of 14: Learn (Part 47; was the Help videos, Part 43b) - short clips replayed live in the
// page, no MP4s, no YouTube links. Each one is a (Video ...) G-code script in help/ (help/index.json: the files + a
// demo's measured secs; title, group, type and line from the file's own (Video Learn: ...) header, Part 47b), the
// same file record_demo.js turns into the YouTube video. Listed in the Learn mode (top bar
// Configure | Run | Learn) by group; the welcome card's tour link opens it there. Two types: "demo" reloads the page as
// the temporary machine "Help: <title>" (#help=<id>, machines.js: fresh each time, its own settings / SD card /
// spoilboard), so your machine is never touched; Exit reloads back to yours, in Learn (#learn). "mine" plays on your
// own machine and puts back what it moved (Part 47.2). A demo runs on the script's own settings (MACHINE=, TABLE=,
// ...): the same for every viewer.
// The player: a start card (its click turns the sound on - browsers only allow sound after a click on the page), then
// a bar over the view: ⏸ / ▶, Follow (after a drag took the camera; the next Shot hands it back too), ✕ Exit. A
// click on the view pauses (look round), ▶ goes on. Live replays run at most 5x (FluidNC's own pace; a script asking
// more runs at 5x). An SD card file with (Video ...) lines gets "▶ Play as a video" (Run > SD card): the same, from
// your file (kept in this browser till it plays; its Exit goes back to the mode you were in, not Learn).
  const HELP = { list: null, id: null, entry: null, text: null, clock: null, paused: false, done: false };
  const HELP_FILE = "lr4-help-file";                 // per browser: an SD card file to play as a video (name + text)
  const helpId = () => { const m = /^#help=([\w.-]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; };
  // the clips (Part 47b): help/index.json lists the files; each one's title, group, kind and line come from its own
  // (Video Learn: ...) header (demo_script.js learnOf). A file that doesn't parse clean isn't listed (console says why)
  function helpClip(file, text, extra) {
    const sc = LR4DemoScript.parse(text), L = LR4DemoScript.learnOf(sc, file);
    return Object.assign({ id: file.replace(/\.[^.]+$/, ""), file, text, title: L.title, group: L.group, type: L.type, blurb: L.blurb,
      mine: L.mine, errors: L.errors, secs: LR4DemoScript.playSecs(sc) }, extra || {});
  }
  function helpIndex() {                             // (one load, however many ask while it's on its way)
    if (!HELP.loading) HELP.loading = (async () => {
      const list = [];
      try {
        const files = (await (await fetch(lr4v("help/index.json"))).json()).files || [];
        const got = await Promise.all(files.map(async (f) => {
          try { return helpClip(f.file, await (await fetch(lr4v("help/" + f.file))).text(), f.secs ? { secs: f.secs } : null); }
          catch (e) { return null; }
        }));
        for (const c of got) {
          if (c && !c.errors.length) list.push(c);
          else if (c) console.warn(`help/${c.file}: not listed - ${c.errors.join("; ")}`);
        }
      } catch (e) { /* none */ }
      return (HELP.list = list);
    })();
    return HELP.loading;
  }
  const helpSecs = (s) => (s >= 90 ? `about ${Math.round(s / 60)} min` : `about ${Math.round(s / 10) * 10 || s} s`);
  function helpGo(id) {                              // reload as the help machine for this video
    location.hash = "help=" + encodeURIComponent(id);
    location.reload();
  }
  // back to your machine, as it was (a Demo: in Learn - #learn, which ui.js drops; a hash-only replace() wouldn't reload)
  function helpExit() {
    const base = location.href.split("#")[0];
    if (!HELP.id || HELP.id === "file") return location.replace(base);
    history.replaceState(null, "", base + "#learn");
    location.reload();
  }

  // ---- the Learn mode's list (Part 47.1): the clips by group, empty groups hidden; a filter box from 20 clips ----
  const LEARN_GROUPS = ["Getting started", "Setting up", "Running a job", "Bits and collets", "Probing / zero", "Maintenance", "My clips"];
  const LEARN_FILTER_AT = 20;
  const LEARN_TYPES = { demo: "Demo", mine: "On your machine" };
  const learnGroup = (v) => v.group || "My clips";
  const learnPlay = (v) => (v.type === "mine" ? mineGo(v) : helpGo(v.id));
  // BitChange's BIT= on this router: the new bit (HandSetup form) | null = the same one back
  function learnBit(kv) {
    const k = LR4DemoScript.shankOf(kv && kv.bit), r = LR4Routers.ROUTERS[RT.set.router];
    if (!k || !r) return null;
    let d = k.d;
    if (k.other) { const sizes = r.model.collet.sizes, sh = tcShank(tcBitNow().d, sizes); d = sizes.find((v) => Math.abs(v - sh) > 0.01) ?? sh; }
    return { shape: "flat", d, angle: 90, len: 0 };
  }
  function learnRow(v) {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "listitem"); b.className = "hv-row"; b.dataset.id = v.id;
    b.innerHTML = `<b></b><em></em><span></span><i></i>`;
    b.children[0].textContent = v.title; b.children[1].textContent = v.secs ? helpSecs(v.secs) : "";
    b.children[2].textContent = v.blurb;
    b.children[3].textContent = LEARN_TYPES[v.type] || LEARN_TYPES.demo;
    b.title = v.type === "mine" ? `Play "${v.title}" on your machine (it puts back what it moves)`
      : `Play "${v.title}" in this page (on a temporary machine: yours stays as it is)`;
    b.addEventListener("click", () => learnPlay(v));
    return b;
  }
  async function learnList() {
    const list = await helpIndex(), host = $("ln-list"), f = $("ln-filter");
    f.hidden = list.length < LEARN_FILTER_AT;
    const q = f.hidden ? "" : f.value.trim().toLowerCase();
    const shown = list.filter((v) => !q || `${v.title} ${v.blurb} ${learnGroup(v)}`.toLowerCase().includes(q));
    const groups = [...LEARN_GROUPS, ...new Set(shown.map(learnGroup).filter((g) => !LEARN_GROUPS.includes(g)))];
    host.replaceChildren(...groups.map((g) => {
      const items = shown.filter((v) => learnGroup(v) === g);
      if (!items.length) return null;
      const sec = document.createElement("section");
      sec.className = "ln-group";
      sec.innerHTML = `<h2></h2><div class="hv-list" role="list"></div>`;
      sec.firstChild.textContent = g;
      sec.lastChild.setAttribute("aria-label", g);
      sec.lastChild.append(...items.map(learnRow));
      return sec;
    }).filter(Boolean));
    if (!shown.length) host.textContent = list.length ? "No clip matches." : "No clips found.";
    $("ln-parts").hidden = !$("parts-chip").classList.contains("missing");
  }
  // ---- On your machine (Part 47.2): a clip that plays on your own router / mount / collets and changes nothing.
  // Each player: () => a message (can't play here) | { steps() captions, at() step now, seek(k), hold(on), stop(),
  // done: Promise }; the Learn column shows its steps (the current one lit, a click jumps there), ⏸, Stop and Next
  // (the next clip in its group). Leaving Learn stops it and puts everything back. ----
  const MINE = { on: null, v: null, timer: 0 };
  const mineBusy = () => (/^(Run|Jog|Home|Hold)/.test(CTL.state || "") ? "The machine is moving: try again once it's idle." : null);
  // keyed by the mine clip's command (its kv: BitChange BIT= HOLD= NUTS=, TouchPlate HOLD=); the director's intro
  // runs them too (a demo with a bit change: LR4Help.playCmd)
  const MINE_PLAY = {
    bitchange(kv, cam = true) {                      // tool_change.js on your router; yours back after (it changes nothing)
      if (typeof tcPlay !== "function" || LR4ToolChange.busy()) return "A bit change is already playing.";
      const r = LR4Routers.ROUTERS[RT.set.router];
      if (!r || !RT.body || !tcMesh("Router_ColletNut")) return "No router to change a bit on: turn it on under Configure > 2 Options.";
      const hold = kv && kv.hold ? kv.hold.toLowerCase() : undefined, nuts = kv && kv.nuts ? kv.nuts.toLowerCase() : undefined;
      const done = tcPlay({ bit: learnBit(kv), cam, hold, nuts });
      if (!LR4ToolChange.busy()) return "No router to change a bit on.";
      const T = LR4ToolChange;
      return { done, steps: T.steps, at: T.at, seek: T.seek, hold: T.hold, stop: T.stop };
    },
    touchplate(kv) {                                 // job.js's probing animation: the shoe's bottom, the clip, the plate - out and back
      if (typeof handPlate !== "function" || !meta || !HOME.pose) return "The machine isn't loaded yet.";
      if (!meshes.some((m) => m.userData.name === "TouchPlate")) return "No touch plate on this machine.";
      if (HAND.plate || touchOut()) return "The touch plate is out: put it away first (Run > Touch plate under the bit).";
      const A = TOUCH_ANIM, keep = Object.assign({}, TOUCH_PLATE);
      const ST = ["The dust shoe's bottom off", "The clip onto the collet nut", "The plate out under the bit",
        "The plate back in its slot", "The clip back on its bolt", "The shoe's bottom back on"];
      const C = { stopped: false, wait: 0 }, hold = kv && kv.hold !== undefined ? Number(kv.hold) : 1.5;
      const phase = () => (A.out ? (A.skirt < 1 ? 0 : A.clip < 1 ? 1 : 2) : A.plate > 0 ? 3 : A.clip > 0 ? 4 : 5);
      const out = () => { if (!HAND.plate) handPlate(true); };
      const back = () => { if (HAND.plate) handPlate(false); };
      const end = () => { A.hold = false; Object.assign(TOUCH_PLATE, keep); };
      handPlate(true);
      const done = new Promise((res) => {
        (function tick() {
          if (C.stopped) return res(false);
          if (!A.hold) {
            if (A.out && A.plate >= 1 && (C.wait += 0.1) >= hold) back();   // a moment out (HOLD=), then home
            if (!A.out && !touchBusy()) { end(); return res(true); }
          }
          setTimeout(tick, 100);
        })();
      });
      return { done, steps: () => ST, at: phase, hold: (on) => { A.hold = !!on; },
        seek(k) {
          C.wait = 0;
          if (k <= 2) { out(); touchJump(k > 0 ? 1 : 0, k > 1 ? 1 : 0, 0); return; }
          out(); touchJump(1, 1, 1); back();
          if (k >= 4) touchJump(1, k === 4 ? 1 : 0, 0);
        },
        stop() { C.stopped = true; back(); touchJump(0, 0, 0); end(); } };
    },
  };
  function mineGo(v) {
    mineStop();
    const msg = $("ln-msg"), why = mineBusy() || (v.mine && MINE_PLAY[v.mine.kind] ? MINE_PLAY[v.mine.kind](v.mine.kv) : "This clip can't play here.");
    if (typeof why === "string") { mineBox(v); msg.textContent = why; $("ln-pause").hidden = true; return; }
    MINE.on = why; MINE.v = v; MINE.k = -1;
    mineBox(v);
    msg.textContent = "";
    why.done.then(() => { if (MINE.on === why) mineDone(); });
    MINE.timer = setInterval(mineLit, 120);
    mineLit();
  }
  function mineBox(v) {                              // the box over the list: title, steps, ⏸ / Stop / Next
    $("ln-now").hidden = false;
    $("ln-now-t").textContent = v.title;
    $("ln-pause").hidden = false; $("ln-pause").textContent = "⏸ Pause"; $("ln-pause").setAttribute("aria-pressed", "false");
    $("ln-stop").textContent = "■ Stop";
    const nx = learnNext(v);
    $("ln-next").hidden = !nx;
    $("ln-next").title = nx ? `Next in ${learnGroup(v)}: ${nx.title}` : "";
    const steps = MINE.on ? MINE.on.steps() : [];
    $("ln-steps").replaceChildren(...steps.map((c, i) => {
      if (!c) return null;                           // (a step with no caption goes on with the one before)
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = c; b.dataset.k = i;
      b.title = "Jump to this step";
      b.addEventListener("click", () => { if (MINE.on) { MINE.on.seek(i); mineLit(); } });
      li.append(b);
      return li;
    }).filter(Boolean));
  }
  function mineLit() {                               // the step playing now lit (or the captioned one it belongs to)
    if (!MINE.on) return;
    const k = MINE.on.at();
    if (k === MINE.k) return;
    MINE.k = k;
    let lit = null;
    for (const b of $("ln-steps").querySelectorAll("button")) if (+b.dataset.k <= k) lit = b;
    for (const b of $("ln-steps").querySelectorAll("button")) {
      b.classList.toggle("on", b === lit);
      if (b === lit) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    }
  }
  function mineDone() {
    clearInterval(MINE.timer);
    MINE.on = null;
    for (const b of $("ln-steps").querySelectorAll("button")) { b.classList.remove("on"); b.removeAttribute("aria-current"); }
    $("ln-pause").hidden = true;
    $("ln-stop").textContent = "Close";
    $("ln-msg").textContent = "Done - everything is back as it was.";
  }
  function mineStop() {                              // stop + put back (leaving Learn, another clip, Stop)
    clearInterval(MINE.timer);
    const on = MINE.on;
    MINE.on = null;
    if (on) on.stop();
  }
  function mineClose() { mineStop(); $("ln-now").hidden = true; MINE.v = null; }
  function learnNext(v) {                            // the next clip in v's group
    const g = (HELP.list || []).filter((x) => learnGroup(x) === learnGroup(v)), i = g.findIndex((x) => x.id === v.id);
    return i >= 0 ? g[i + 1] || null : null;
  }
  {
    $("ln-pause").addEventListener("click", () => {
      if (!MINE.on) return;
      const on = $("ln-pause").getAttribute("aria-pressed") !== "true";
      MINE.on.hold(on);
      $("ln-pause").setAttribute("aria-pressed", String(on));
      $("ln-pause").textContent = on ? "▶ Go on" : "⏸ Pause";
    });
    $("ln-stop").addEventListener("click", mineClose);
    $("ln-next").addEventListener("click", () => { const nx = MINE.v && learnNext(MINE.v); mineClose(); if (nx) learnPlay(nx); });
    LR4OnMode((m) => { if (m !== "learn") mineClose(); });
  }
  // ---- "Watch how" (Part 47.3): a "?" popover whose topic has a clip ends with a link to it in Learn. The one table,
  // topic (the help div's id, data-help) -> clip id; the "?" popovers stay the page's help, Learn is the library ----
  const LEARN_TOPICS = {
    "help-ab": "asbuilt", "help-ab-home": "why_home", "help-ab-ls": "safety", "help-ab-heat": "safety",
    "help-bit": "bit_change", "help-job-bit": "bit_change", "help-plate": "touch_plate", "help-pd": "front_plate",
    "help-ctl": "tour",
  };
  async function watchLink(pop, topic, close) {
    const id = LEARN_TOPICS[topic], v = id && (await helpIndex()).find((x) => x.id === id);
    if (!v || pop.hidden || pop.dataset.topic !== topic || pop.querySelector(".watch")) return;   // (another popover by now)
    const p = document.createElement("p"), b = document.createElement("button");
    p.className = "watch";
    b.type = "button"; b.className = "link";
    b.textContent = `▶ Watch how: ${v.title}`;
    b.title = `Open it in Learn (${v.type === "mine" ? "plays on your machine, changes nothing" : "a demo on a temporary machine"})`;
    b.addEventListener("click", () => { close(); $("t-learn").click(); learnShow(id); });
    p.append(b);
    pop.append(p);
  }
  async function learnShow(id) {                     // Learn, that clip's row lit and focused
    LR4ShowMode("learn");
    await learnList();
    const row = id && $("ln-list").querySelector(`.hv-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "nearest" });
    row.classList.add("lit");
    setTimeout(() => row.classList.remove("lit"), 2500);
    row.focus();
  }
  {
    LR4OnMode((m) => { if (m === "learn") learnList(); });
    if (document.documentElement.dataset.mode === "learn") learnList();
    $("ln-filter").addEventListener("input", learnList);
    $("ln-parts-btn").addEventListener("click", () => welcome(true));
    $("wc-tour").addEventListener("click", () => { welcome(false); $("t-learn").click(); learnShow("tour"); });
  }

  // ---- playing one (the help machine) ----
  function helpPause(on) {                           // the director holds; FluidNC too (the live clock: a feed hold in a job)
    if (!HELP.clock || HELP.done || on === HELP.paused) return;
    HELP.paused = on;
    HELP.clock.pause(on);
    $("hv-play").textContent = on ? "▶" : "⏸";
    $("hv-play").title = on ? "Go on (Space)" : "Pause (Space, or click the view)";
    $("hv-play").setAttribute("aria-label", on ? "Play" : "Pause");
    $("hv-bar").classList.toggle("paused", on);
  }
  function helpFollow(free) {                        // a drag on the view takes the camera; Follow (or the next Shot) gives it back
    if (!HELP.clock) return;
    if (free) HELP.clock.free = true; else HELP.clock.follow();
    controls.enableDamping = free;
    $("hv-follow").hidden = !free;
  }
  async function helpPlay() {                        // the start card's ▶: sound on (the click allows it), then the director
    $("hv-start").hidden = true;
    $("hv-bar").hidden = false;
    const o = Object.assign(JSON.parse(JSON.stringify(LR4DemoScript.DEFAULTS)), LR4DemoScript.parse(HELP.text).settings,
      { live: true, sound: false });              // live: the page plays its own sound (no recording trace)
    o.kmax = 5;                                      // FluidNC's limit in the browser (user 2026-10-25: cap at 5x)
    try {
      const s = soundEngine();
      if (!s.on()) soundToggle();
      if (o.voice) s.setVoice(o.voice);
    } catch (e) { /* no sound */ }
    HELP.clock = LR4Director.liveClock(o.kmax);
    HELP.clock.shot = () => helpFollow(false);
    controls.enableDamping = false;
    $("hv-msg").textContent = "Setting up…";
    try {
      await LR4Director.play(HELP.text, HELP.entry.file || HELP.id + ".gcode", o, HELP.clock, () => { $("hv-msg").textContent = ""; });
      HELP.done = true;
      $("hv-msg").textContent = "The end";
      $("hv-play").hidden = true;
      $("hv-again").hidden = false;
    } catch (e) {
      $("hv-msg").textContent = "Stopped: " + e.message;
      console.error(e);
    }
  }
  async function helpStart() {                       // #help=<id>: the help machine, the start card once the page is up
    const id = helpId();
    if (!id) return;
    let entry;
    if (id === "file") {                             // an SD card file (▶ Play as a video)
      let f = null;
      try { f = JSON.parse(MS.get(HELP_FILE) || "null"); } catch (e) { /* none */ }
      entry = f && { id, title: f.name, blurb: "Your G-code file, played as a video", file: f.name, text: f.text };
    } else entry = (await helpIndex()).find((v) => v.id === id);
    document.body.classList.add("help-on");
    $("mc-btn").textContent = `Help: ${entry ? entry.title : id}`;
    $("mc-btn").disabled = true;
    if (!entry) { $("hv-start-h").textContent = "No such help video"; $("hv-start-p").textContent = id; $("hv-go").hidden = true; $("hv-start").hidden = false; return; }
    HELP.id = id; HELP.entry = entry;
    try { HELP.text = entry.text || await (await fetch(lr4v("help/" + (entry.file || id + ".gcode")))).text(); }
    catch (e) { $("hv-start-h").textContent = "Couldn't load the video"; $("hv-go").hidden = true; $("hv-start").hidden = false; return; }
    $("hv-title").textContent = entry.title;
    $("hv-start-h").textContent = entry.title;
    $("hv-start-p").textContent = `${entry.blurb}${entry.secs ? ` (${helpSecs(entry.secs)})` : ""}`;
    $("hv-start-parts").hidden = !$("parts-chip").classList.contains("missing");
    // a ui video starts from Configure (the director does too, but only once it plays): not Run behind the start card
    // and its first seconds when you came from Run (user 2026-10-26: the tour showed Run while it talked about Configure)
    if (/\(\s*Video:[^)\n]*\bKIND\s*=\s*ui\b/i.test(HELP.text)) LR4ShowMode("design");
    await LR4Director.waitLoaded();
    $("hv-start").hidden = false;
    $("hv-go").focus();
  }
  {
    $("hv-go").addEventListener("click", helpPlay);
    $("hv-again").addEventListener("click", () => helpGo(HELP.id));
    for (const b of document.querySelectorAll(".hv-exit")) b.addEventListener("click", helpExit);
    $("hv-play").addEventListener("click", () => helpPause(!HELP.paused));
    $("hv-follow").addEventListener("click", () => helpFollow(false));
    let down = null;                                 // on the view: a drag takes the camera, a click pauses
    canvas.addEventListener("pointerdown", (e) => { down = HELP.clock && !HELP.done ? [e.clientX, e.clientY] : null; });
    canvas.addEventListener("pointermove", (e) => {
      if (down && !HELP.clock.free && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) helpFollow(true);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) <= 5) helpPause(true);
      down = null;
    });
    document.addEventListener("keydown", (e) => {
      if (!HELP.clock || e.target.closest("input, textarea, select")) return;
      if (e.key === " ") { e.preventDefault(); helpPause(!HELP.paused); }
    });
    if (helpId()) helpStart();
  }
  window.LR4Help = { list: helpIndex, go: helpGo, exit: helpExit, pause: helpPause, follow: helpFollow, learn: learnShow, groups: LEARN_GROUPS,
    topics: LEARN_TOPICS, watchLink,
    // the director's (Video BitChange:) / (Video TouchPlate:) in a demo's intro: resolves when it's done
    playCmd(c) {
      const run = MINE_PLAY[c.kind] && MINE_PLAY[c.kind](c.kv, false);
      if (typeof run === "string" || !run) { console.warn(`(Video ${c.kind}:) ${run || "unknown"}`); return Promise.resolve(false); }
      return run.done;
    },
    clip: helpClip,
    mine: { play: (id) => helpIndex().then((l) => mineGo(l.find((v) => v.id === id))), stop: mineClose,
      state: () => ({ on: !!MINE.on, id: MINE.v ? MINE.v.id : null, k: MINE.on ? MINE.on.at() : -1, msg: $("ln-msg").textContent,
        steps: [...$("ln-steps").querySelectorAll("button")].map((b) => b.textContent), lit: $("ln-steps").querySelector("button.on")?.textContent || null }) },
    state: () => ({ id: HELP.id, playing: !!HELP.clock && !HELP.done, paused: HELP.paused, done: HELP.done, free: !!(HELP.clock && HELP.clock.free) }),
    playFile(name, text) { MS.set(HELP_FILE, JSON.stringify({ name, text })); helpGo("file"); } };
