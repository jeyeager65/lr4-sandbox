// lr4-sandbox page, part 13 of 14: the video director (Part 43a). A (Video ...) script (js/demo_script.js) played in the
// page: the settings, shots and orbits, titles, captions, Home / Zero, the job's pace (Speed, REAL easing, the badge),
// M0 resumes, MSG lines, Show / Inspect / AsBuilt, the park at the end - moved here from tools/record_demo.js word for
// word (same calls in the same order, so the videos come out the same: the event log, record_demo.js --log).
// The director asks a clock for every frame (it thinks in frames of 1 / fps s):
//   record = the page's clock frozen and stepped one frame at a time; each frame is handed to tools/record_demo.js
//            (LR4Director.next) and the next one starts once it is grabbed. FluidNC is topped up to each frame's
//            machine time (LR4Demo.ncUntil).
//   live   = the real clock (requestAnimationFrame); FluidNC runs at the job's pace itself, at most 5x (kmax).
window.LR4Director = (() => {
  const DS = window.LR4DemoScript, D = window.LR4Demo;
  const el = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ease = (k) => k * k * (3 - 2 * k);
  const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const videoKind = (sc) => (sc.settings.kind === "ui" ? "ui" : "machine");   // (Video: KIND=machine|ui), Part 43
  let S = null;                                      // the run: { o, script, job, g, clock, lines, events, frames, ... }

  async function waitLoaded(timeout = 180000) {      // the status box hidden twice, 1.5 s apart, and the part files placed
    const t0 = Date.now();
    for (;;) {
      await sleep(1000);
      if (el("status") && el("status").hidden) {
        await sleep(1500);
        // (?parts=) the top bar's Parts chip says "Parts N/N ✓" (or there is none)
        if (el("status").hidden && (el("parts-chip").hidden || /✓/.test(el("parts-chip").textContent))) return true;
      }
      if (Date.now() - t0 > timeout) throw new Error("page didn't load: " + el("status").innerText);
    }
  }

  // ---- the clocks ----
  function recordClock() {                           // tools/record_demo.js: frozen, a frame at a time, each one handed over
    let vt = 0;
    const c = { kind: "record", out: null, go: null,
      install() { vt = performance.now(); performance.now = () => vt; },
      async frame(cam, ms, nc) {
        // FluidNC to this frame's machine time, then the clock step with no draw between (a draw seeing the new pose
        // before the clock moved would hear it as a jump, and the frame itself as a stop)
        if (nc) await D.ncUntil(...nc);
        if (cam) { camera.position.set(...cam[0]); controls.target.set(...cam[1]); }
        vt += ms;
        await raf2();                                // a tick with the step, then a draw
        const st = D.job();
        await new Promise((go) => { c.go = go; hand({ frame: true, st }); });   // grabbed: on to the next
        return st;
      } };
    return c;
  }
  // the real clock: frames kept to the wall clock (none dropped: a slow page plays slower); FluidNC runs at the pace
  // itself, at most kmax. Held (the player's pause, or the director's Wait / Inspect mid-job): a feed hold in a job (its
  // step timer must not be near-stopped - its next wake-up would come that much later: Part 25), else a crawl.
  // free: the viewer took the camera (a drag); shot(): a new Shot starts (the player hands the camera back).
  function liveClock(kmax = 5) {
    let t0 = null, n = 0, rate = 1, hold = false, paused = false, ours = false, back = 0;
    const apply = () => {
      const want = paused || rate < 0.01;
      if (want !== hold || !want) {
        hold = want;
        if (want && CTL.sim && FJ.job && !FJ.job.held && !/^Hold/.test(CTL.state)) { CTL.sim.realtime("!"); ours = true; }
        else if (want) ncScale(0.02);
        else {
          if (ours && CTL.sim) CTL.sim.realtime("~");
          ours = false;
          ncScale(Math.min(kmax, rate));
        }
      }
    };
    const c = { kind: "live", free: false, shot: () => c.follow(),
      install() {},
      get paused() { return paused; },
      pause(on) { paused = !!on; apply(); if (!on) { t0 = null; n = 0; } },
      async frame(cam, ms, nc) {
        const r = nc ? nc[1] / ms : 1;
        if (Math.abs(r - rate) > 1e-9 || NCK.k === D.NC_CRAWL) { rate = r; apply(); }
        if (cam && !c.free) {
          if (back > 0) {                            // handed back: a short blend from where the viewer left it
            const k = 1 - --back / 18;
            camera.position.lerp(new THREE.Vector3(...cam[0]), ease(k)); controls.target.lerp(new THREE.Vector3(...cam[1]), ease(k));
          } else { camera.position.set(...cam[0]); controls.target.set(...cam[1]); }
        }
        if (t0 === null) t0 = performance.now();
        n++;
        do await new Promise((q) => requestAnimationFrame(q)); while (paused || performance.now() - t0 < n * ms - 2);
        return D.job();
      },
      follow() { if (c.free) back = 18; c.free = false; } };
    return c;
  }
  function hand(m) {                                 // to the recorder waiting in next()
    const c = S && S.clock, out = c && c.out;
    if (!out) return;
    c.out = null;
    out(Object.assign(m, { log: S.lines.splice(0) }));
  }

  // ---- the run ----
  const say = (s) => { S.lines.push(s); if (S.logOn) ev("log " + s); };
  const ev = (what) => S.events.push(`${(S.frames / S.o.fps).toFixed(2)} ${what}`);
  const call = (name, ...args) => {                  // an LR4Demo call the event log keeps (title, caption, Home ...)
    ev(`${name} ${args.map((a) => JSON.stringify(a)).join(", ")}`);
    return D[name](...args);
  };

  // the page set up as the script says: detail, background, My machine, as built, FluidNC (re)booted near its switches,
  // the pendant, the file on the SD card -> { job } (the lines said go to the recorder)
  async function prepare(text, name, o) {
    S = { o, text, name, script: DS.parse(text), lines: [], events: [], frames: 0, logOn: false };
    for (const w of S.script.warnings) say("(Video): " + w);
    const script = S.script;
    if (o.live && script.settings.machine) {        // live: MACHINE= as typed in the size fields (the recorder opens #WxH)
      const [w, h] = script.settings.machine, f = (id, v) => { const e = el(id); e.value = +(U.unit === "in" ? v : v * IN).toFixed(3); e.dispatchEvent(new Event("input")); };
      if (Math.abs(U.cutX - w * IN) > 0.5 || Math.abs(U.cutY - h * IN) > 0.5) { f("cut-x", w); f("cut-y", h); await waitLoaded(); }
    }
    const b = document.querySelector(`#detail button[data-v="${o.detail}"]`);
    if (b && b.getAttribute("aria-pressed") !== "true") { b.click(); await waitLoaded(); }
    { const s = document.querySelector(`#scenery button[data-v="${o.scenery}"]`); if (s) s.click(); }
    await sleep(1500);
    const mach = DS.machineOf(script.settings);      // the file's My machine settings (Part 29): table, room, options ...
    if (Object.keys(mach).length) {
      for (const p of LR4Machine.apply(mach)) say("(Video): " + p);
      say("machine: " + Object.entries(mach).map(([k, v]) => `${k}=${Array.isArray(v) ? v.map((q) => Math.round(q)).join("x") : v}`).join(" "));
      await waitLoaded();                            // braces / struts / table rebuild the machine
    }
    document.body.classList.toggle("rec-ui", videoKind(script) === "ui");   // ui (Part 43c): the whole page, as it is
    if (!o.live && videoKind(script) === "ui") controls.enableDamping = false;
    else if (!o.live) D.recording(true);             // the 3D view, whole window
    else if (videoKind(script) === "machine" && el("v-only").getAttribute("aria-pressed") !== "true") { el("v-only").click(); resize(); }   // live: ⛶ view only
    await sleep(500);
    const introAll = DS.hasOwnIntro(script) ? script.intro : DS.defaultIntro(o);
    const homeCmd = introAll.find((q) => q.kind === "home" || (q.kind === "click" && /^home(-[xyz])?$/.test(q.kv.id)));   // (a clicked Home too)
    if (o.homing && !D.homingOrder(String(o.homing))) say(`(Video): HOMING=${o.homing}: not an order (e.g. z,x,y)`);
    else if (o.homing) say(`homing order: ${o.homing}`);
    for (const q of introAll.filter((c) => c.kind === "asbuilt")) { asbuilt(q); }   // the machine as built, before FluidNC boots on it
    if (o.home && homeCmd) D.nearHome(Number(homeCmd.kv.offset) || 30);   // FluidNC (re)boots a little way off the switches
    if (!await D.fluidnc()) throw new Error("FluidNC didn't start (is the page cross-origin isolated? serve it with tools/serve.py)");
    say("mode: FluidNC");
    if (o.pendant) {                                 // FluidTouch on the table, talking to FluidNC; its screen in a corner
      if (!await D.pendant()) say("pendant: FluidTouch didn't connect (is the page cross-origin isolated? serve it with tools/serve.py)");
      else { await sleep(2500); D.pip({ on: true }); say("pendant: on, its screen at the bottom right"); }
    }
    const job = S.job = await D.ncFile(name, text);
    say(`job: ${(job.total / 60).toFixed(1)} min of moves, ${job.pauses} M0 pauses; script: ${script.intro.length} intro + ${script.at.length} later (Video) lines`);
    const mb = D.machineBox(), c = mb.getCenter(new THREE.Vector3()), s = mb.getSize(new THREE.Vector3());
    S.g = { c: c.toArray(), s: s.toArray(), floor: D.floorZ(), fov: camera.fov, aspect: camera.aspect,
      cam: camera.position.toArray(), tgt: controls.target.toArray() };
    return { job, lines: S.lines.splice(0) };
  }
  function asbuilt(cmd) {                            // (Video AsBuilt:) the machine as built (Part 32)
    const q = DS.asbuiltOf(cmd);
    LR4AsBuilt.set(q.set);
    if (q.E) LR4AsBuilt.setE(Object.assign(LR4AsBuilt.E(), Object.fromEntries(Object.entries(q.E).filter(([, v]) => v !== undefined))));
    say(`as built: ${LR4AsBuilt.note()}`);
  }

  // the video itself, frame by frame on S.clock (record_demo.js's director, Part 25 - 33)
  async function direct() {
    const { o, script, g } = S, clock = S.clock, job = S.job;
    clock.install();
    await raf2();                                    // the tick that sees the clock stop goes by before the sound trace starts
    let ncM = D.ncCrawl(), ncS = 1;                  // FluidNC: the next frame's machine time (ms), machine s per video s
    if (o.sound) { const v = el("snd-vol"); v.value = o.volume; v.dispatchEvent(new Event("input")); D.sound(true, o.voice); }
    S.logOn = true;
    const dt = 1000 / o.fps;
    let evBadge = "-", last = null, captionEnd = 0;  // captionEnd: the caption comes off at this frame (0 = none showing)
    const frame = async (cam) => {
      ncM += ncS * dt;
      uiPlace();
      const st = await clock.frame(cam || null, dt, [ncM, ncS * dt, o.kmax]);
      if (S.frames % o.fps === 0) ev(`sec rate=${+ncS.toPrecision(3)} line=${st.line} t=${st.t.toFixed(1)} badge=${evBadge}`);
      if (o.trace && S.frames < 600) S.lines.push("nc " + S.frames + " " + JSON.stringify(D.ncTrace()));
      last = st;
      if (captionEnd && S.frames + 1 >= captionEnd) { captionEnd = 0; call("caption", null); }
      S.frames++;
      return st;
    };
    const n = (sec) => Math.max(1, Math.round(sec * o.fps));
    const hold = async (secs, cam) => { for (let i = 0, m = n(secs); i < m; i++) await frame(cam); };

    // ---- ui videos (Part 43c): the page's own controls by element id - a ring round one (Point), a pointer that moves
    // to one and clicks it (Click; Step only opens what isn't open). The page then does what a user's click does. ----
    const ui = { ptr: null, at: null, ring: null, ringEl: null, ringEnd: 0 };
    const uiEl = (cmd) => {
      const e = el(cmd.kv.id);
      if (!e) say(`(Video): line ${cmd.line}: the page has no element #${cmd.kv.id}`);
      return e;
    };
    function uiPlace() {
      if (ui.ptr) { ui.ptr.style.left = ui.at[0] + "px"; ui.ptr.style.top = ui.at[1] + "px"; }
      if (ui.ring && !ui.ring.hidden && ui.ringEl) {
        const r = ui.ringEl.getBoundingClientRect(), p = 6;
        Object.assign(ui.ring.style, { left: r.left - p + "px", top: r.top - p + "px", width: r.width + 2 * p + "px", height: r.height + 2 * p + "px" });
      }
      if (ui.ringEnd && S.frames >= ui.ringEnd) ringOff();
    }
    const ringOff = () => { ui.ringEnd = 0; if (ui.ring) ui.ring.hidden = true; };
    function point(cmd, e) {                         // the ring (+ TEXT as a caption) for TIME s
      ev(`point #${cmd.kv.id}`);
      if (!ui.ring) { ui.ring = document.createElement("div"); ui.ring.className = "rec-ring"; document.body.append(ui.ring); }
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
      ui.ringEl = e; ui.ring.hidden = false; ui.ringEnd = S.frames + n(DS.secsOf(cmd, 3));
      if (cmd.kv.text) caption({ kv: { text: cmd.kv.text, time: cmd.kv.time } });
    }
    const POINTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L3 19 L7.6 14.8 L10.6 21.6 L13.6 20.3 L10.7 13.6 L17 13.4 Z"/></svg>';
    async function pointerTo(cmd, e, cam) {          // the pointer moves to e's middle over TIME s (0.8)
      if (!ui.ptr) {
        ui.ptr = document.createElement("div"); ui.ptr.className = "rec-pointer"; ui.ptr.innerHTML = POINTER;
        document.body.append(ui.ptr);
        ui.at = [innerWidth * 0.6, innerHeight * 0.6];
      }
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = e.getBoundingClientRect(), a = ui.at.slice(), b = [r.left + r.width / 2, r.top + r.height / 2], m = n(DS.secsOf(cmd, 0.8));
      if (!r.width && !r.height) say(`(Video): line ${cmd.line}: #${cmd.kv.id} isn't on screen (a closed step or menu?)`);
      for (let f = 1; f <= m; f++) { const k = ease(f / m); ui.at = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; await frame(cam); }
    }
    const isOpen = (e) => (e.tagName === "DETAILS" ? e.open : e.getAttribute("aria-pressed") === "true" || e.getAttribute("aria-expanded") === "true");
    async function clickCmd(cmd, cam) {              // Click / Step -> what the click started: "home" | "job" | ""
      const e = uiEl(cmd);
      if (!e) return "";
      const target = e.tagName === "DETAILS" ? e.querySelector("summary") : e;   // a Design step: its header
      await pointerTo(cmd, target, cam);
      ev(`${cmd.kind} #${cmd.kv.id}`);
      if (cmd.kind === "step" && isOpen(e)) { await hold(0.3, cam); return ""; }   // open already: just pointed at
      ui.ptr.classList.add("down");
      await hold(0.12, cam);
      target.click();
      ui.ptr.classList.remove("down");
      // a Home / Run control: its homing or job starts after FluidNC answers - wait for it (a few s), else go on
      const starts = cmd.kind === "click" && /^(home|home-[xyz]|job-play|start-go)$/.test(cmd.kv.id);
      for (let i = 0, m = n(starts ? 6 : 0.3); i < m && !D.homing() && !FJ.job; i++) await frame(cam);
      return D.homing() ? "home" : FJ.job ? "job" : "";
    }
    const uiDone = () => { ringOff(); if (ui.ptr) ui.ptr.remove(); if (ui.ring) ui.ring.remove(); };

    // shots: [camera position, target]
    const c = g.c, span = Math.max(g.s[0], g.s[1]);
    const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
    const turn = ([p, t], k) => {                    // p turned k of a turn about the target (Z), counter-clockwise
      const a = k * 2 * Math.PI, dx = p[0] - t[0], dy = p[1] - t[1];
      return [[t[0] + dx * Math.cos(a) - dy * Math.sin(a), t[1] + dx * Math.sin(a) + dy * Math.cos(a), p[2]], t];
    };
    const from = (t, dir, dist) => { const d = norm(dir); return [t.map((v, i) => v + d[i] * dist), t]; };
    const viewOf = (st, at) => {                     // the stock in the room, framed front-right from above
      const sc = st ? [at[0] + (st.xmin + st.xmax) / 2, at[1] + (st.ymin + st.ymax) / 2, at[2] + st.zmax] : [at[0], at[1], at[2]];
      const half = st ? Math.hypot(st.xmax - st.xmin, st.ymax - st.ymin) / 2 : 150;
      return { t: sc, dist: half * 1.35 / Math.tan(g.fov * Math.PI / 360) };
    };
    let stockView = viewOf(job.stock, job.at), coreAt = null;
    const sideAt = {};                               // ymin / ymax shots: that end's Y carriage (fetched as the shot starts)
    const sideFetch = (sh) => {
      if (sh.name === "ymin" || sh.name === "ymax") sideAt[sh.name] = D.sideCenter(sh.name);
      if (sh.name === "gantry" || sh.name === "gantrytop") sideAt.gantry = D.gantryCenter();
    };
    const pendAt = o.pendant ? D.pendantView() : null;   // the pendant stays put on the table
    const showCmd = (cmd) => {                       // (Video Show:) by the Show tree's ids
      const bad = LR4Show.apply(DS.showOf(cmd));
      if (bad.length) say(`(Video): line ${cmd.line}: Show doesn't know ${bad.join(", ")}`);
    };
    const pipCmd = (cmd) => D.pip({ on: !/^(off|no|0)$/i.test(cmd.kv.show || "on"), corner: (cmd.kv.corner || "br").toLowerCase(), size: Number(cmd.kv.size) || 26 });
    const VIEWS = { iso: [1, -1.15, 0.85], front: [0, -1, 0.18], top: [0, -0.001, 1], side: [1, 0, 0.18], back: [-0.6, 1, 0.55] };
    const shotAt = (sh) => {                         // where a shot looks from / at now
      const d = sh.dist;
      if (sh.name === "workshop") return from(c, [0, -span * 1.55, g.floor + 1700 - c[2]], d || Math.hypot(span * 1.55, g.floor + 1700 - c[2]));
      if (sh.name === "machine") return from(c, [0, -0.95, 0.5], d || span * 1.07);
      if (sh.name === "stock") return from(stockView.t, [0.42, -0.78, 0.72], d || stockView.dist);
      if (sh.name === "tool") return from((last && last.tip) || stockView.t, [0.42, -0.78, 0.55], d || 320);
      if (sh.name === "core") return from(coreAt || c, [0.55, -0.85, 0.45], d || 700);
      if (sh.name === "gantry") return from(sideAt.gantry || c, [0, -0.8, 0.65], d || 1800);
      if (sh.name === "gantrytop") return from(sideAt.gantry || c, [0, -0.001, 1], d || 2000);
      if (sh.name === "ymin" || sh.name === "ymax") return from(sideAt[sh.name] || c, [sh.name === "ymin" ? -0.75 : 0.75, -0.55, 0.35], d || 450);
      if (sh.name === "pendant") return pendAt ? from(pendAt.t, pendAt.n, d || 420) : from(c, [0, -0.95, 0.5], span * 1.07);
      return from(c, VIEWS[sh.name], d || span * 1.3);
    };
    const blend = (A, B, k) => [lerp(A[0], B[0], ease(k)), lerp(A[1], B[1], ease(k))];
    let cam = [g.cam, g.tgt];                        // where the camera is (the intro sets it every frame)
    // a shot, as a camera per frame: blend from where the camera is over secs, then orbit (turns once in orbit secs)
    const mkShot = (sh, start) => {
      const bf = n(sh.secs), of = sh.orbit ? n(sh.orbit) : 0;
      return { frames: bf + of, at: (f) => {
        const to = shotAt(sh);
        if (f < bf) return blend(start, to, (f + 1) / bf);
        return of ? turn(to, Math.min(1, (f - bf) / of)) : to;
      } };
    };

    // (Video Inspect:): runs its own frames (mid-job, the job holds meanwhile). ID opens the page's inspect view and the
    // camera blends to the page's framing of it (ID=off: back to the machine and the camera from before the first one);
    // EXPLODE / SECTION animate over TIME; ORBIT turns once round it. -> the camera at the end
    let inspBack = null;
    const inspectCmd = async (cmd, start) => {
      const q = DS.inspectOf(cmd);
      let to = start;
      if (q.id && /^off$/i.test(q.id)) { LR4Inspect.close(); to = inspBack || start; inspBack = null; }
      else if (q.id) {
        if (!inspBack) inspBack = start;
        LR4Inspect.open(q.id);
        if (LR4Inspect.id() !== q.id) say(`(Video): line ${cmd.line}: Inspect doesn't know ${q.id}`);
        to = [camera.position.toArray(), controls.target.toArray()];   // the page's framing
        if (q.dist) to = from(to[1], to[0].map((v, i) => v - to[1][i]), q.dist);
      }
      const st0 = LR4Inspect.tools.state(), sec = q.section;
      const secFrom = sec && sec !== "off" ? (st0.axis === sec.axis && st0.flip === q.flip ? st0.at : q.flip ? 0 : 1) : null;   // from uncut
      if (sec === "off") LR4Inspect.tools.section("");
      if (q.view) LR4Inspect.tools.look(q.view);
      say(`inspect ${q.id || ""}${q.explode !== undefined ? ` explode ${q.explode}` : ""}${sec ? ` section ${sec === "off" ? "off" : sec.axis + "@" + sec.at}` : ""}`);
      for (let f = 0, bf = n(q.secs); f < bf; f++) {
        const k = ease((f + 1) / bf);
        if (q.explode !== undefined) LR4Inspect.tools.explode(st0.explode + (q.explode - st0.explode) * k);
        if (secFrom !== null) LR4Inspect.tools.section(sec.axis, secFrom + (sec.at - secFrom) * k, q.flip);
        await frame(blend(start, to, (f + 1) / bf));
      }
      for (let f = 0, of = q.orbit ? n(q.orbit) : 0; f < of; f++) await frame(turn(to, (f + 1) / of));
      return to;
    };

    // the job's pace
    const fit = (secs) => Math.max(1, Math.round(job.total / secs));
    const pace = { base: fit(o.job), real: o.real, badge: true, temp: null, wait: 0 };
    const paceCmd = (cmd) => {
      const kv = cmd.kv;
      if (kv.real !== undefined) pace.real = Number(kv.real);
      if (kv.badge !== undefined) { pace.badge = !/^(off|no|0)$/i.test(kv.badge); if (!pace.badge) D.badge(null); }
      const r = kv.x !== undefined ? Number(kv.x) : kv.fit !== undefined ? fit(Number(kv.fit)) : null;
      if (r === null) return;
      if (kv.for !== undefined) pace.temp = { rate: r, left: n(Number(kv.for)) }; else pace.base = r;
    };
    const caption = (cmd) => { call("caption", DS.titleText(cmd)); captionEnd = S.frames + n(DS.secsOf(cmd, 4)); };

    const ncJog = async (cmd, maxSecs) => {          // FluidNC: a jog, frames till it stops (where the camera is)
      call("ncSend", cmd);
      D.ncMoving();
      for (let i = 0, tries = 1; i < n(maxSecs); i++) {
        await frame(cam);
        const r = D.ncReply();
        if (r === 8 && tries++ < 10) { call("ncSend", cmd); continue; }   // not idle yet (a job just ended)
        if (r !== null && r !== true) { say(`${cmd}: error:${r}`); return; }
        if (i > 2 && r === true && !D.ncMoving()) break;
      }
    };
    // work zero (Video Zero): the jog from the homed spot to it, in real time, then the job laid out from there
    let zero = null;
    const jogToZero = async () => {
      const j = call("zero", zero[0], zero[1]);
      if (!j) return;
      const dist = Math.hypot(j.to[0] - j.from[0], j.to[1] - j.from[1]);
      { const l = await D.layout(); stockView = viewOf(l.stock, l.at); }   // the stock where it will be cut, before the jog
      say(`jog to work zero (${zero.map((v) => v.toFixed(1)).join(", ")} mm, ${dist.toFixed(0)} mm away)`);
      await ncJog(`$J=G91 G21 X${(j.to[0] - j.from[0]).toFixed(3)} Y${(j.to[1] - j.from[1]).toFixed(3)} F3000`, 60);
      const lay = await D.layout();
      stockView = viewOf(lay.stock, lay.at);
    };

    // the intro: the file's own (or the default one), in order
    const intro = DS.hasOwnIntro(script) ? script.intro : [...DS.defaultIntro(o), ...script.intro];
    let homed = false, byClick = false;              // byClick: a Click started the job (ui videos): the intro ends there
    intro: for (const cmd of intro.filter((q) => o.home || q.kind !== "home")) {
      if (cmd.kind === "shot") {
        const sh = DS.shotOf(cmd), s = mkShot(sh, cam);
        say(`shot ${sh.name}${sh.orbit ? ` orbit ${sh.orbit}` : ""}`);
        if (clock.shot) clock.shot();
        if (sh.name === "core") coreAt = D.coreCenter();
        sideFetch(sh);
        for (let f = 0; f < s.frames; f++) { cam = s.at(f); await frame(cam); }
      } else if (cmd.kind === "home") {              // still (close on the core, or VIEW=); $H in real time
        say("homing");
        coreAt = D.coreCenter();
        const hv = (cmd.kv.view || "core").toLowerCase(), hsh = { name: hv, secs: DS.secsOf(cmd, 1.5), orbit: 0, dist: Number(cmd.kv.dist) || (hv === "core" ? 700 : null) };
        sideFetch(hsh);
        const s = mkShot(hsh, cam);
        for (let f = 0; f < s.frames; f++) { cam = s.at(f); await frame(cam); }
        await hold(0.5, cam);
        call("home", true);
        for (let i = 0; i < n(120) && D.homing(); i++) await frame(cam);
        await hold(0.7, cam);
        homed = true;
        if (zero) call("zero", zero[0], zero[1]);    // the stock at its work zero from now on
        const lay = await D.layout();                // the job now starts from the homed spot
        stockView = viewOf(lay.stock, lay.at);
        if (zero) await jogToZero();
      } else if (cmd.kind === "zero") {
        zero = DS.zeroOf(cmd);
        if (homed || !o.home) await jogToZero();     // else right after homing
      } else if (cmd.kind === "title") {
        call("title", DS.titleText(cmd));
        await hold(DS.secsOf(cmd, 3), cam);
        call("title", null);
      } else if (cmd.kind === "text") caption(cmd);
      else if (cmd.kind === "pendant") pipCmd(cmd);
      else if (cmd.kind === "show") showCmd(cmd);
      else if (cmd.kind === "asbuilt") { /* set before the intro (prepare) */ }
      else if (cmd.kind === "inspect") cam = await inspectCmd(cmd, cam);
      else if (cmd.kind === "wait") await hold(DS.secsOf(cmd, 1), cam);
      else if (cmd.kind === "point") { const e = uiEl(cmd); if (e) { point(cmd, e); await hold(DS.secsOf(cmd, 3), cam); ringOff(); } }
      else if (cmd.kind === "click" || cmd.kind === "step") {
        const got = await clickCmd(cmd, cam);
        if (got === "home") {                        // Home clicked: frames till it is done, then as (Video Home:)
          say("homing (clicked)");
          for (let i = 0; i < n(120) && D.homing(); i++) await frame(cam);
          await hold(0.7, cam);
          homed = CTL.homed;
          if (homed) {
            if (zero) call("zero", zero[0], zero[1]);
            const lay = await D.layout();
            stockView = viewOf(lay.stock, lay.at);
            if (zero) await jogToZero();
          }
        } else if (got === "job") { byClick = true; break intro; }
      }
      else paceCmd(cmd);
    }

    if (!homed && !byClick) {                        // FluidNC runs nothing till it has homed
      say("homing (FluidNC must, before a job)");
      call("home", true);
      for (let i = 0; i < n(120) && D.homing(); i++) await frame(cam);
      await D.layout();
    }
    say(`job (at ${(S.frames / o.fps).toFixed(1)} s, ${pace.base}x)`);
    const ncJob0 = ncM;
    let ncHeld = 0;                                  // machine ms spent in M0 holds
    if (byClick) { ev("job started by a click"); D._ncRan = true; }   // the page's own ▶ ran it (ui videos)
    else if (!await call("ncPlay")) throw new Error("FluidNC didn't start the job: " + el("job-status").textContent);
    let held = 0, endHold = 0, s, rate = 0, badge = "", section = -1, realLeft = 0, ramp = -1, k = 0;
    let shot = null, shotF = 0, titleEnd = 0, msgKey = null, msgEnd = 0, inspShot = null;   // inspShot: the shot from before an Inspect
    const setRate = (r) => {
      ncS = r;
      if (Math.abs(r - rate) > 1e-9) { rate = r; D.rate(r); }
      const b = !pace.badge ? "" : pace.wait > 0 ? badge : r < 1.05 ? "1× real time" : `${Math.round(r)}×`;
      if (b !== badge) { badge = b; evBadge = b || "-"; D.badge(b || null); }
    };
    setRate(pace.temp ? pace.temp.rate : pace.base);
    for (;;) {
      s = await frame(shot ? shot.at(Math.min(shotF++, shot.frames - 1)) : null);   // null: the page's camera (its close-ups)
      // the file's (Video ...) lines as playback reaches them
      for (; k < script.at.length && s.line >= script.at[k].line; k++) {
        const cmd = script.at[k];
        if (cmd.kind === "shot") {
          const sh = DS.shotOf(cmd);
          if (clock.shot) clock.shot();
          if (sh.name === "core") coreAt = D.coreCenter();
          sideFetch(sh);
          shot = sh.name === "page" ? null : mkShot(sh, s.cam); shotF = 0;
          if (shot && !sh.orbit) { const keep = shot; shot = { frames: Infinity, at: (f) => keep.at(Math.min(f, keep.frames - 1)) }; }
        } else if (cmd.kind === "text") caption(cmd);
        else if (cmd.kind === "pendant") pipCmd(cmd);
        else if (cmd.kind === "show") showCmd(cmd);
        else if (cmd.kind === "asbuilt") asbuilt(cmd);
        else if (cmd.kind === "inspect") {           // the job held while it runs; the view stays on the set until ID=off / a Shot
          const r0 = rate, off = /^off$/i.test(cmd.kv.id || "");
          pace.wait = 1; setRate(1e-9);
          if (!inspShot && !off && cmd.kv.id) inspShot = { shot, shotF };
          const end = await inspectCmd(cmd, (shot ? shot.at(Math.max(0, shotF - 1)) : null) || s.cam);
          pace.wait = 0; setRate(r0);
          if (off && inspShot) { ({ shot, shotF } = inspShot); inspShot = null; }
          else { shot = { frames: Infinity, at: () => end }; shotF = 0; }
        }
        else if (cmd.kind === "title") { titleEnd = S.frames + n(DS.secsOf(cmd, 3)); call("title", DS.titleText(cmd)); }
        else if (cmd.kind === "wait") pace.wait = n(DS.secsOf(cmd, 1));
        else if (cmd.kind === "point") { const e = uiEl(cmd); if (e) point(cmd, e); }
        else if (cmd.kind === "click" || cmd.kind === "step") {   // the job held while the pointer moves and clicks
          const r0 = rate;
          pace.wait = 1; setRate(1e-9);
          await clickCmd(cmd, shot ? shot.at(Math.max(0, shotF - 1)) : null);
          pace.wait = 0; setRate(r0);
        }
        else paceCmd(cmd);
      }
      if (titleEnd && S.frames >= titleEnd) { titleEnd = 0; call("title", null); }
      // the file's MSG / PRINT lines on top (not the one an M0 popup is already showing)
      if (o.messages && s.msg && s.msg.key !== msgKey) {
        msgKey = s.msg.key;
        if (s.msg.text !== s.popText) { call("msg", s.msg.text); msgEnd = S.frames + n(o.messagetime); }
      }
      if (msgEnd && S.frames >= msgEnd) { msgEnd = 0; call("msg", null); }
      // real time at each section's first cut, then ease up to the job's speed; the badge says which
      if (pace.real > 0 && s.cut && s.section !== section) { section = s.section; realLeft = n(pace.real); ramp = -1; }
      let r;
      if (pace.wait > 0) { pace.wait--; r = 1e-9; }
      else if (pace.temp) { r = pace.temp.rate; if (--pace.temp.left <= 0) pace.temp = null; }
      else if (realLeft > 0) { r = 1; if (!s.paused && --realLeft === 0) ramp = 0; }
      else if (ramp >= 0) { const q = Math.min(1, ++ramp / n(1.5)); r = Math.exp(Math.log(pace.base) * ease(q)); if (q >= 1) ramp = -1; }
      else r = pace.base;
      setRate(r);
      if (s.paused) ncHeld += ncS * dt;
      if (s.paused) { if (++held >= n(o.pause)) { call("resume"); held = 0; } }
      else held = 0;
      if (s.t >= s.total && !s.paused && ++endHold > n(1)) break;
    }
    D.badge(null); call("msg", null);
    say(`FluidNC ran the job in ${((ncM - ncJob0) / 60000).toFixed(1)} min of machine time, ${(ncHeld / 60000).toFixed(1)} of it in M0 holds (the G-code estimate: ${(job.total / 60).toFixed(1)} min)`);
    const endCam = shot ? shot.at(Math.min(shotF, shot.frames - 1)) : null;
    if (o.park) {                                    // the gantry to the back, Z up, by a jog on FluidNC (~4 s of video)
      const pk = D.ncPark();
      if (pk) {
        say("park");
        ncS = Math.max(1, pk.secs / 4); D.rate(ncS);
        cam = endCam || D.job().cam;
        await ncJog(pk.cmd, 15);
        ncS = 1;
      }
    }
    await hold(o.hold, endCam);
    uiDone();
  }

  return {
    waitLoaded, prepare, direct, recordClock, liveClock, videoKind,
    // the page's player (js/page/help.js): the whole video on `clock` (liveClock); started() once it is set up
    async play(text, name, o, clock, started) {
      await prepare(text, name, o);
      S.lines.splice(0);
      S.clock = clock;
      if (started) started();
      await direct();
    },
    running: () => !!S && !!S.clock && S.logOn,
    events: () => (S ? S.events.slice() : []),
    // tools/record_demo.js: prepare(...) first, then recStart() -> the first frame drawn; next() after grabbing each
    // one -> { frame, st, log } | { done, log } | { error, log }
    recStart() {
      S.clock = recordClock();
      const first = new Promise((r) => { S.clock.out = r; });
      direct().then(() => hand({ done: true }), (e) => hand({ error: String(e && e.stack || e) }));
      return first;
    },
    next() {
      const c = S.clock, p = new Promise((r) => { c.out = r; }), go = c.go;
      c.go = null;
      if (go) go();
      return p;
    },
    frames: () => (S ? S.frames : 0),
    note(s) { if (S) ev("log " + s); },              // a line the recorder printed, into the event log
  };
})();
