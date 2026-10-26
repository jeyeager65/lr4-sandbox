// lr4-sandbox page, part 14 of 14: Help videos (Part 43b), replayed live in the page - no MP4s, no YouTube links. Each one
// is a (Video ...) G-code script in help/ (help/index.json: id, title, secs, blurb), the same file record_demo.js turns
// into the YouTube video. Offered from the top bar's Help menu and the welcome card. Playing one reloads the page as
// the temporary machine "Help: <title>" (#help=<id>, machines.js: fresh each time, its own settings / SD card /
// spoilboard), so your machine is never touched; Exit reloads back to yours. The video runs on the script's own
// settings (MACHINE=, TABLE=, ...): the same for every viewer.
// The player: a start card (its click turns the sound on - browsers only allow sound after a click on the page), then
// a bar over the view: ⏸ / ▶, Follow (after a drag took the camera; the next Shot hands it back too), ✕ Exit. A
// click on the view pauses (look round), ▶ goes on. Live replays run at most 5x (FluidNC's own pace; a script asking
// more runs at 5x). An SD card file with (Video ...) lines gets "▶ Play as a video" (Run > SD card): the same, from
// your file (kept in this browser till it plays).
  const HELP = { list: null, id: null, entry: null, text: null, clock: null, paused: false, done: false };
  const HELP_FILE = "lr4-help-file";                 // per browser: an SD card file to play as a video (name + text)
  const helpId = () => { const m = /^#help=([\w.-]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; };
  async function helpIndex() {
    if (!HELP.list) {
      try { HELP.list = (await (await fetch(lr4v("help/index.json"))).json()).videos || []; } catch (e) { HELP.list = []; }
    }
    return HELP.list;
  }
  const helpSecs = (s) => (s >= 90 ? `about ${Math.round(s / 60)} min` : `about ${Math.round(s / 10) * 10 || s} s`);
  function helpGo(id) {                              // reload as the help machine for this video
    location.hash = "help=" + encodeURIComponent(id);
    location.reload();
  }
  function helpExit() { location.replace(location.href.split("#")[0]); }   // back to your machine, as it was
  async function helpMenu() {
    const list = await helpIndex(), host = $("hv-list");
    host.replaceChildren(...list.map((v) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "listitem"); b.className = "hv-row";
      b.innerHTML = `<b></b><em></em><span></span>`;
      b.children[0].textContent = v.title; b.children[1].textContent = helpSecs(v.secs); b.children[2].textContent = v.blurb;
      b.title = `Play "${v.title}" in this page (on a temporary machine: yours stays as it is)`;
      b.addEventListener("click", () => helpGo(v.id));
      return b;
    }));
    if (!list.length) host.textContent = "No help videos found.";
    const missing = $("parts-chip").classList.contains("missing");
    $("hv-parts").hidden = !missing;
  }
  {
    const btn = $("hv-btn"), pop = $("hv-pop");
    btn.addEventListener("click", () => { helpMenu(); popToggle(btn, pop); });
    document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !e.target.closest("#hv-pop, #hv-btn, #help-pop")) popToggle(btn, pop, false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) popToggle(btn, pop, false); });
    $("hv-parts-btn").addEventListener("click", () => { popToggle(btn, pop, false); welcome(true); });
    $("wc-tour").addEventListener("click", () => helpGo("tour"));
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
  window.LR4Help = { list: helpIndex, go: helpGo, exit: helpExit, pause: helpPause, follow: helpFollow,
    state: () => ({ id: HELP.id, playing: !!HELP.clock && !HELP.done, paused: HELP.paused, done: HELP.done, free: !!(HELP.clock && HELP.clock.free) }),
    playFile(name, text) { MS.set(HELP_FILE, JSON.stringify({ name, text })); helpGo("file"); } };
