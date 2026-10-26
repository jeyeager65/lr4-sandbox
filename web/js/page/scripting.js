// lr4-sandbox page, part 12 of 14: the handle for scripted videos, machine sounds, the frame loop, load().
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- for scripts (Part 29: the video sets the machine - tools/record_demo.js): My machine and Show by name / id,
  // through the panel's own controls (so they're kept and drawn as if clicked) ----
  window.LR4Machine = {
    // o = { router, skirt, hose, fan (bool), peter, struts, base (a button's data-v: base "sheet" / "torsion"), braces ("auto" or a count the menu has),
    // table (mm, top of the MDF), room ([x, y, ceiling] mm), main, accent (#rrggbb) } -> problems (strings; the rest is set)
    apply(o) {
      const bad = [], el = (id) => document.getElementById(id), fire = (e, t) => e.dispatchEvent(new Event(t));
      for (const k of ["router", "skirt", "hose", "fan"]) {
        if (o[k] === undefined) continue;
        const c = el("opt-" + k);
        if (c.checked !== !!o[k]) { c.checked = !!o[k]; fire(c, "change"); }
      }
      for (const [k, box] of [["peter", "peter-variant"], ["struts", "strut-variant"], ["base", "table-variant"]]) {
        if (o[k] === undefined) continue;
        const bs = el(box).hidden ? [] : [...el(box).querySelectorAll("button")], b = bs.find((x) => x.dataset.v === String(o[k]));
        if (b) b.click();
        else bad.push(`${k.toUpperCase()}=${o[k]}: ${bs.length ? "one of " + bs.map((x) => x.dataset.v).join(", ") : "no choice at this size / file set"}`);
      }
      if (o.braces !== undefined) {
        const sel = el("braces"), auto = (/(\d+) braces/.exec(sel.options[0] ? sel.options[0].textContent : "") || [])[1];
        const v = /^auto$/i.test(String(o.braces)) || String(o.braces) === auto ? "0" : String(o.braces);   // the auto count = Auto
        if ([...sel.options].some((x) => x.value === v)) { if (sel.value !== v) { sel.value = v; fire(sel, "change"); } }
        else bad.push(`BRACES=${o.braces}: auto (${auto}) or ${[...sel.options].slice(1).map((x) => x.value).join(", ")}`);
      }
      if (o.table !== undefined) {
        if (!(o.table >= 300 && o.table <= 1500)) bad.push(`TABLE: ${o.table} mm is outside 300 - 1500`);
        else { const t = el("table-top"); t.value = +(o.table / (U.unit === "in" ? IN : 1)).toFixed(3); fire(t, "change"); }
      }
      if (o.room) ["w", "d", "h"].forEach((k, i) => { const r = el("room-" + k); r.value = +(o.room[i] / roomU()).toFixed(2); fire(r, "change"); });
      for (const role of ["main", "accent"]) {
        if (o[role] === undefined) continue;
        if (!/^#[0-9a-f]{6}$/i.test(o[role])) { bad.push(`${role.toUpperCase()}=${o[role]}: #rrggbb`); continue; }
        const c = o[role].toLowerCase();                // spool 1 (main) / spool 2 (accent; the classic router-mount PETG too)
        FIL.s.spools[0 + (role === "accent")].color = c;
        if (role === "accent" && FIL.s.preset === "classic" && FIL.s.spools[2]) FIL.s.spools[2].color = c;
        filSave(); applyColours();
      }
      return bad;
    } };
  window.LR4Show = {
    tree: () => tree.asms.map((a) => ({ id: a.id, label: a.label, kinds: a.kinds.map((k) => ({ id: k.id, parts: k.parts.map((q) => q.id) })) })),
    off: () => [...showOff],
    // { preset, hide: [ids], show: [ids] } -> the ids (and preset) it didn't know. An id: an assembly, "asm.kind", a part
    // (mesh name) or a part pattern with * (Y_Clip_*). Showing a part also turns on its assembly + kind (as Inspect does).
    apply({ preset, hide = [], show = [] }) {
      const bad = [], all = Object.keys(tree.place);
      const ids = (id) => {
        if (id.includes("*")) { const re = new RegExp("^" + id.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"); return all.filter((p) => re.test(p)); }
        return isGroupId(id) || tree.place[id] ? [id] : [];
      };
      if (preset) {
        if (LR4ShowTree.PRESETS.some(([p]) => p === preset)) { showOff.clear(); for (const x of LR4ShowTree.preset(tree, preset)) showOff.add(x); }
        else bad.push("PRESET=" + preset);
      }
      for (const id of hide) { const xs = ids(id); if (!xs.length) bad.push(id); for (const x of xs) showOff.add(x); }
      for (const id of show) {
        const xs = ids(id);
        if (!xs.length) bad.push(id);
        for (const x of xs) {
          showOff.delete(x);
          if (tree.place[x]) for (const [a, k] of tree.place[x]) { showOff.delete(a); showOff.delete(a + "." + k); }
          else if (x.includes(".")) showOff.delete(x.split(".")[0]);
        }
      }
      applyVisibility();
      return bad;
    } };
  window.LR4Demo = {
    THREE, camera, controls,
    machineBox() {                                   // the machine (no hose, legs or floor-standing scenery)
      const b = new THREE.Box3();
      for (const m of meshes) if (m.visible && m.userData.motion !== "hose" && !m.userData.floor) { m.updateMatrixWorld(); b.expandByObject(m); }
      return b;
    },
    floorZ() { const l = meshes.find((m) => m.userData.name === "TableLegs"); return l ? new THREE.Box3().setFromObject(l).min.z : 0; },
    boxes(re) {                                      // { name: [min xyz, max xyz, shown] } of the parts whose name matches re
      const out = {};
      for (const m of meshes) if (new RegExp(re).test(m.userData.name)) { const b = new THREE.Box3().setFromObject(m); out[m.userData.name] = [b.min.toArray(), b.max.toArray(), m.visible]; }
      return out;
    },
    room: () => shopRoom,
    recording(on) { document.body.classList.toggle("rec", on); controls.enableDamping = !on; resize(); },
    sound(on, voice) {                               // voice: "machine" | "robot" (the joke mode); omitted = the page's pick
      if (voice) { $("snd-voice").value = voice; $("snd-voice").dispatchEvent(new Event("change")); }
      soundEngine().record(on); return true;
    },   // keep the sound with the frames from now (the frozen clock's dt)
    async soundWav() {                               // -> number of base64 chunks (soundChunk(i)); 0 = no sound
      const b = SND.s && await SND.s.wav();
      this._wav = [];
      if (!b) return 0;
      for (let i = 0; i < b.length; i += 3 << 20) {
        let t = "";
        const part = b.subarray(i, i + (3 << 20));
        for (let j = 0; j < part.length; j += 0x8000) t += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
        this._wav.push(btoa(t));
      }
      return this._wav.length;
    },
    soundChunk(i) { return this._wav[i]; },
    soundStats: () => (SND.s ? SND.s.stats() : null),
    soundTimeline: () => (SND.s ? SND.s.timeline() : ""),
    soundLevels: () => (SND.s ? SND.s.levels() : null),
    soundVel: () => (SND.s ? SND.s.velocity() : null),
    poseNow: () => HOME.pose && [HOME.pose.x, HOME.pose.y, HOME.pose.z],
    soundState: () => (SND.s && SND.s.context() ? SND.s.context().state : "none"),
    async playFile(name, text) {                     // as "Play a G-code file...": resolves once it is loaded
      JOB.file = { kind: "file", name, text };
      jobSetup(JOB.pageJob);
      for (let i = 0; i < 600 && !(JOB.tl && JOB.src && JOB.src.name === name); i++) await new Promise((r) => setTimeout(r, 50));
      if (!JOB.tl) throw new Error($("job-src").textContent);
      return { total: JOB.tl.total, stock: JOB.tl.stock, at: JOB.at, pauses: JOB.tl.events.filter((e) => e.kind === "pause").length };
    },
    speed(x) {                                       // any playback speed (adds it to the menu)
      const sel = $("job-speed");
      if (![...sel.options].some((o) => +o.value === x)) sel.add(new Option(`${x}×`, String(x)));
      sel.value = String(x);
    },
    async preview() { if (!JOB.preview) await previewStart(); return !!JOB.preview; },   // Preview on (playing)
    previewEnd() { previewEnd(); },
    play() { if (!JOB.playing) $("job-play").click(); },   // Preview: play; else FluidNC's Run (ncPlay for videos)
    home() { ctlHome(); return !!CTL.sim; },        // FluidNC's own $H (Part 34: no Basic homing)
    homing: () => CTL.homing,
    nearHome(mm = 30) {                              // the machine mm off each home switch: a short $H, in real time
      const t = meta.travel, s = Homing.settings(yamlBase ? yamlBase.text : null);
      move(["x", "y", "z"].map((a) => (s[a].positive ? t[a][1] - mm : t[a][0] + mm)));
      return true;
    },
    async layout() {                                 // after homing: the job laid out again from the homed spot
      if (CTL.homed) { const p = ctlRaw(); CTL.runFrom = { x: p[0], y: p[1], z: p[2] }; }   // from where FluidNC is
      await jobSetup(JOB.pageJob);
      return { stock: JOB.tl && JOB.tl.stock, at: JOB.at };
    },
    resume() { $("job-resume").click(); },
    pose(x, y, z) {                                  // the machine at work X, Y, Z (mm), the job's bit with it
      const tv = meta.travel, at = JOB.at, st = JOB.tl.stock, tableZ = at[2] + (st ? st.zmin : 0);
      const z0 = jobZ0(), clamp = (v, r) => Math.min(Math.max(v, r[0]), r[1]), mx = clamp(x + tv.x[0] + z0[0], tv.x), my = clamp(y + tv.y[0] + z0[1], tv.y);
      const tip = Math.min(at[2] + z - tableZ, meta.tip_above_table + tv.z[1]);   // no higher than Z can go
      move([mx, my, tip - meta.tip_above_table]);
      for (const b of JOB.bits ? JOB.bits.values() : []) if (b.visible) b.position.set(at[0] + mx - tv.x[0] - z0[0], at[1] + my - tv.y[0] - z0[1], tableZ + tip);
    },
    park() {                                         // where the job ended -> gantry at the back, Z at the top
      const p = GcodePlay.at(JOB.tl, JOB.tl.total), tv = meta.travel, at = JOB.at, st = JOB.tl.stock;
      const tableZ = at[2] + (st ? st.zmin : 0);
      return { from: [p.x, p.y, p.z], to: [p.x, tv.y[1] - tv.y[0] - jobZ0()[1], meta.tip_above_table + tv.z[1] - (at[2] - tableZ)] };
    },
    job() {                                          // + cut: the bit on a cutting move; section: messages / pauses passed
      const tl = JOB.tl, nc = !JOB.preview, t = nc ? this.ncT() : JOB.t;
      const p = tl ? GcodePlay.at(tl, t) : null, i = tl ? Math.min(p.index, tl.segs.length - 1) : -1, sg = tl && tl.segs[i];
      return { t, total: tl ? tl.total : 0, playing: nc ? !!FJ.job && !FJ.job.held : JOB.playing, paused: !$("job-pop").hidden,
        closeUp: !!JOB.camSaved || !!camTween, cut: !!sg && sg.type === "cut", line: sg ? sg.srcLine || 0 : 0,
        tip: p && JOB.at ? [JOB.at[0] + p.x, JOB.at[1] + p.y, JOB.at[2] + p.z] : null,
        cam: [camera.position.toArray(), controls.target.toArray()],
        msg: (() => {                                // the latest MSG / PRINT line played
          let m = null;
          for (const e of tl ? tl.events : []) { if (e.time > t) break; if (e.kind === "msg" || e.kind === "print") m = e; }
          return m && { key: `${m.index}:${m.lineNum}`, text: m.text };
        })(),
        popText: $("job-pop").hidden ? "" : $("job-pop-msg").textContent,
        section: tl ? tl.events.filter((e) => (e.kind === "msg" || e.kind === "pause") && e.index <= i).length : 0 };
    },
    rate(x) { JOB.rate = SND.rec = x || null; },     // playback speed without touching the menu (null = the menu's); FluidNC: the sound's
    badge(text) { const b = $("rec-badge"); b.hidden = !text; b.textContent = text || ""; },
    caption(text) { const b = $("rec-caption"); b.hidden = !text; b.textContent = text || ""; },
    msg(text) { const b = $("rec-msg"); b.hidden = !text; b.textContent = text || ""; },
    homingOrder(str) {                               // a video's HOMING=z,x,y: Home sends $HZ, $HX, $HY
      HOME.order = str ? Homing.order(str) : null;
      return HOME.order;
    },
    gantryCenter() {                                 // the gantry + beam + core's box centre (world mm): the gantry shot
      const b = new THREE.Box3();
      for (const m of meshes) if (m.visible && ["gantry", "beam", "core"].includes(m.userData.motion)) { m.updateMatrixWorld(); b.expandByObject(m); }
      return b.isEmpty() ? null : b.getCenter(new THREE.Vector3()).toArray();
    },
    sideCenter(end) {                                // a Y carriage (ymin / ymax: the gantry's parts at that end), world mm
      const all = new THREE.Box3(), parts = [];
      for (const m of meshes) if (m.visible && m.userData.motion === "gantry") { m.updateMatrixWorld(); const b = new THREE.Box3().setFromObject(m); all.union(b); parts.push(b); }
      if (all.isEmpty()) return null;
      const b = new THREE.Box3(), x = end === "ymax" ? all.max.x : all.min.x;
      for (const p of parts) if (Math.abs((p.min.x + p.max.x) / 2 - x) < 120) b.union(p);
      return (b.isEmpty() ? all : b).getCenter(new THREE.Vector3()).toArray();
    },
    coreCenter() {                                   // the router + core's box centre (world mm)
      const b = new THREE.Box3();
      for (const m of meshes) if (m.visible && m.userData.motion === "core") { m.updateMatrixWorld(); b.expandByObject(m); }
      return b.isEmpty() ? null : b.getCenter(new THREE.Vector3()).toArray();
    },
    zero(x, y) {                                     // work zero x, y mm from the cut area's front-left corner (null = there)
      JOB.zero = x === null || x === undefined ? null : [x, y];
      const h = CTL.homed && CTL.pose && { x: CTL.pose[0], y: CTL.pose[1], z: CTL.pose[2] }, tv = meta.travel;         // -> the jog from the homed spot to it (move() poses)
      return h ? { from: [h.x, h.y, h.z], to: [tv.x[0] + (JOB.zero ? x : 0), tv.y[0] + (JOB.zero ? y : 0), h.z] } : null;
    },
    movePose(x, y, z) { move([x, y, z]); },
    // FluidNC mode (Part 25): FluidNC runs in its own threads on the real clock, at its time scale. A video keeps it
    // running at a scale under what the frames need (from the real time each frame takes to render and
    // capture), and ncUntil(m) tops it up to m machine ms before each frame - so each frame shows the machine at a known
    // machine time. (All but stopping it between frames was jerky at slow feeds: its step thread's next wake-up was
    // already scheduled at the crawl's pace.)
    async fluidnc(timeout = 90000) {                 // (re)start FluidNC; resolves once it is booted and reporting
      if (!window.crossOriginIsolated) return false;
      ctlBoot();                                     // (re)start it where the machine is now (a video moves it first)
      for (const t0 = Date.now(); Date.now() - t0 < timeout;) {
        if (CTL.sim && CTL.cfg && !CTL.booting && CTL.state) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    },
    NC_CRAWL: 0.05,
    ncCrawl() { ncScale(this.NC_CRAWL); return ncTime(); },
    async ncUntil(m, step, kmax = 5) {               // step: machine ms a frame -> the machine clock after (ms)
      if (!CTL.sim) return 0;
      const now = realNow(), out = this._ncOut ? now - this._ncOut : 100;   // real ms since the last call returned
      this._ncW = this._ncW ? 0.8 * this._ncW + 0.2 * Math.min(out, 1000) : out;
      const k = Math.min(kmax, Math.max(0.01, 0.6 * step / this._ncW));
      ncScale(k);
      for (;;) {                                     // timers to the last few ms, then spin (timers are ~4 ms coarse)
        const left = (m - ncTime()) / k;
        if (left <= 0) break;
        if (left > 6) await new Promise((r) => setTimeout(r, left - 5));
      }
      this._ncOut = realNow();
      CTL.recRaw = ctlLive();                        // the frame shows the machine as it is now, not as it runs on
      CTL.recE = abFromMotors();                     // its rack / tilt at the same moment (Part 32)
      return ncTime();
    },
    ncTime: () => ncTime(),
    ncTrace: () => ({ m: +ncTime().toFixed(1), k: +NCK.k.toFixed(3), w: Math.round(LR4Demo._ncW || 0), p: ctlRaw().map((v) => +v.toFixed(2)), s: CTL.state }),
    async ncFile(name, text) {                       // a G-code file onto FluidNC's SD card, picked (as ▶ would)
      const path = SdCard.pathOf(name);
      await SdCard.store.put(path, text);
      SdCard.writeLive(CTL.sim, path, text);
      await sdRefresh();
      await sdSelect(path);
      if (!JOB.tl) throw new Error($("job-src").textContent);
      return { total: JOB.tl.total, stock: JOB.tl.stock, at: JOB.at, pauses: JOB.tl.events.filter((e) => e.kind === "pause").length };
    },
    async ncPlay() { this.ncCrawl(); this._ncRan = false; await fjRun(); this._ncRan = !!FJ.job; return this._ncRan; },
    ncT() {                                          // the job's time (s, G-code estimate) where FluidNC's motors are
      const tl = JOB.tl, J = FJ.job;
      if (!tl) return 0;
      if (!J) return this._ncRan ? tl.total : 0;
      const T = J.P || J.T, i = Math.min(T.i, tl.segs.length - 1), a = i > 0 ? tl.t[i - 1] : 0;   // P: As built's
      return T.carved >= tl.segs.length ? tl.total : a + Math.min(1, T.f) * (tl.t[i] - a);
    },
    ncSend(line) {                                   // sent; its reply (ncReply: null, true or the error code) comes as frames run
      this._ncR = null;                              // (FluidNC all but stops between frames, so don't wait for it here)
      CTL.sim.command(line, 600000).then((r) => { this._ncR = r.ok ? true : r.code; }, () => { this._ncR = "no reply"; });
      return true;
    },
    ncReply() { return this._ncR; },
    ncMoving() {                                     // the motors moved since the last call, or FluidNC isn't idle
      const p = ctlRaw().map((v) => v.toFixed(3)).join(), moved = p !== this._ncP;
      this._ncP = p;
      return moved || !/^(Idle|Alarm)/.test(CTL.state);
    },
    ncPark() {                                       // the jog to the back with Z at the top (mm/min; null = there already)
      const p = ctlRaw(), tv = meta.travel, d = [0, tv.y[1] - 3 - p[1], tv.z[1] - 1 - p[2]];
      if (Math.hypot(...d) < 5) return null;
      const f = CTL.cfg.rates.y || 3000;
      return { cmd: `$J=G91 G21 Y${d[1].toFixed(3)} Z${d[2].toFixed(3)} F${f}`, secs: Math.hypot(d[1], d[2]) / (f / 60) };
    },
    title(text) { const b = $("rec-title"); b.hidden = !text; b.firstChild.textContent = text || ""; },
    // the pendant in videos (Part 24): on (the option; resolves once FluidTouch is talking to the controller), its screen
    // in a corner (pip: { on, corner br|bl|tr|tl, size % of the width }), and where to look at it from
    async pendant(timeout = 40000) {
      pendantSet(true);
      for (const t0 = Date.now(); Date.now() - t0 < timeout;) {
        if (FT.ft && FT.log.some((l) => /First status report|Connection established/.test(l))) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    },
    pip(o = {}) {
      const b = $("rec-pip");
      b.hidden = !o.on || !FT.ft;
      b.className = "rec-pip " + (/^(br|bl|tr|tl)$/.test(o.corner) ? o.corner : "br");
      b.style.setProperty("--pip-w", `${Math.min(60, Math.max(10, Number(o.size) || 26))}%`);
      FT.pipFrame = -1;
      return !b.hidden;
    },
    pendantView() {                                  // { t: the screen's centre, n: straight out of it } (world mm)
      const c = LR4Pendant.point(0.5, 0.5, 0), e = LR4Pendant.point(0.5, 0.5, 1);
      return c && e ? { t: c.toArray(), n: e.sub(c).toArray() } : null;
    },
  };                             // testing without a headset: page_shot --eval "LR4VR.page.preview('one')"

  // ---- machine sounds (Parts 21-23; js/sounds.js; Part 23 = the joke voice), once a frame: the machine's pose (move() sets HOME.pose in every
  // mode) -> the steppers, at the real machine's speed (the motion / the time scale in use); the router's set speed at
  // the job's line (M3 / M5, or the file's "Turn On Router at Dial N"; only while a job runs or holds) + the shop vac
  // with it; the cutting load = how fast the stock's heightmap loses material; clicks: the switches as they trip
  // (clickSwitch), the probe touching the plate (a probe move ending in Preview, else the probe pin).
  // The engine exists once Sound is turned on, or a video records (LR4Demo.sound). ----
  const SND = { s: null, yaml: undefined, steps: null, planSrc: null, plan: null, vol: null, sim: null, seg: -1, rec: null };
  function soundSteps() {                            // steps/mm, microsteps, run_mode per axis of the config.yaml in use
    const y = CTL.yaml ? CTL.yaml : yamlBase && yamlBase.text;
    if (y !== SND.yaml || !SND.steps) { SND.yaml = y; SND.steps = LR4Sound.stepsFromYaml(y); }
    return SND.steps;
  }
  function soundEngine() {
    if (!SND.s) {
      const st = soundSteps();
      SND.s = LR4Sound.create({ volume: Number($("snd-vol").value), voice: $("snd-voice").value, modes: { x: st.x.mode, y: st.y.mode, z: st.z.mode } });
    }
    return SND.s;
  }
  // machine seconds per wall second: FluidNC's speed; Preview as it really ran (probes play slower than the speed set)
  function soundScale(dt) {
    if (!JOB.preview) return SND.rec || Number($("ctl-speed").value);   // SND.rec: a video's pace
    if (JOB.playing && dt > 0 && SND.jt !== undefined && JOB.t > SND.jt) return (JOB.t - SND.jt) / dt;
    return JOB.playing ? Number($("job-speed").value) : 1;
  }
  function soundJob() {                              // { rpm (set speed now), seg (the job's move index), flutes } or null
    const tl = JOB.tl, active = tl && (JOB.playing || FJ.job || !$("job-pop").hidden);
    if (!active) return null;
    const text = JOB.src && JOB.src.text;
    if (text !== SND.planSrc) { SND.planSrc = text; SND.plan = LR4Sound.routerPlan(text); }
    const i = Math.min(FJ.job ? (FJ.job.P || FJ.job.T).i : GcodePlay.at(tl, JOB.t).index, tl.segs.length - 1), sg = tl.segs[Math.max(0, i)];
    const def = sg && tl.tools && tl.tools.get(sg.toolNumber);
    return { rpm: LR4Sound.routerAt(SND.plan, sg ? sg.srcLine || 0 : 0), seg: i, flutes: (def && def.flutes) || 2 };
  }
  function soundRemoved() {                          // mm^3 the stock lost since the last frame (0 after a reset)
    const sim = JOB.sim;
    if (!sim || !sim.heights) { SND.vol = null; return 0; }
    let sum = 0;
    const h = sim.heights;
    for (let i = 0; i < h.length; i++) sum += h[i];
    const v = sum * sim.dx * sim.dy, prev = SND.sim === sim ? SND.vol : null;
    SND.vol = v; SND.sim = sim;
    return prev === null ? 0 : Math.max(0, prev - v);
  }
  function soundTick() {                             // its own wall time: tick's dt is capped (a slow frame would sound fast)
    const p = HOME.pose, now = performance.now(), dt = SND.t ? Math.min((now - SND.t) / 1000, 1) : 0;
    SND.t = now;
    if (!SND.s || !p) return;
    const j = soundJob(), scale = soundScale(dt), removed = soundRemoved();
    SND.jt = JOB.t;
    if (j && JOB.preview) {                          // Preview: a probe move just ended = the bit touched the plate
      const sg = JOB.tl.segs[SND.seg];
      if (SND.seg >= 0 && j.seg > SND.seg && sg && sg.type === "probe") SND.s.event("tap");
    }
    SND.seg = j ? j.seg : -1;
    SND.s.update([p.x, p.y, p.z], dt, scale, soundSteps(),
      { rpm: j ? j.rpm : 0, mrr: dt > 0 ? removed / dt / scale : 0, flutes: j ? j.flutes : 2, hold: !$("job-pop").hidden });
  }
  function soundToggle() {
    const on = soundEngine().setOn(!SND.s.on());
    $("v-sound").setAttribute("aria-pressed", String(on));
    $("v-sound").textContent = on ? "🔊 Sound on" : "🔈 Sound off";
  }
  $("v-sound").addEventListener("click", soundToggle);
  {
    const v = $("snd-vol"), out = $("snd-vol-out");
    try { const k = MS.get("lr4-snd-vol"); if (k !== null) v.value = k; } catch (e) { /* default */ }
    const show = () => { out.textContent = `${Math.round(v.value * 100)}%`; };
    show();
    v.addEventListener("input", () => {
      show();
      if (SND.s) SND.s.setVolume(Number(v.value));
      try { MS.set("lr4-snd-vol", v.value); } catch (e) { /* not kept */ }
    });
    const vc = $("snd-voice");                       // Part 23: realistic or the joke voice (kept)
    try { const k = MS.get("lr4-snd-voice"); if (k) vc.value = k; } catch (e) { /* default */ }
    vc.addEventListener("change", () => {
      if (SND.s) SND.s.setVoice(vc.value);
      try { MS.set("lr4-snd-voice", vc.value); } catch (e) { /* not kept */ }
    });
  }

  let lastT = performance.now();
  const camPos = new THREE.Vector3();
  let frameN = 0;
  let building = true;                                // load(): no frames until the build's stages are done (each
  function tick() {                                   // frame mid-build was a full draw: slow, and nothing to see yet)
    const now = performance.now(), raw = (now - lastT) / 1000, dt = Math.min(raw, 0.1);
    lastT = now;
    if (building) return;
    if (shop) LR4Shop.cutaway(shop, camera.getWorldPosition(camPos), vr.active() ? 20000 : camera.far);   // hide walls the camera is outside of (VR's far is in metres: the sky as built)
    jobTick();
    handTick();
    touchAnimTick(Math.min(raw, 0.5));               // the touch plate + clip going out / coming home (job.js): in about
                                                     // real time on a slow GPU too (a job's Resume waits for it)
    ctlTick();
    soundTick();
    if (pendant && pendantOn() && (FT.ft || ++frameN % 8 === 0)) pendantScreen();
    ftPopDraw();
    if (vr.active()) vr.tick(dt);
    else { smApply(dt); camStep(); controlsTick(); }
    lighting();
    renderer.render(scene, camera);
  }
  resize();
  renderer.setAnimationLoop(tick);                    // the headset's frame loop while VR is on
  load().catch((err) => { statusEl.textContent = "Could not load the model: " + err.message; });
