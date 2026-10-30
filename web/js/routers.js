// Routers (Part 45a, user 2026-10-27): the routers the page knows, where each one's speed comes from, and the speed
// dial. MANUAL routers (Kobalt, Makita, ...) run at their dial: a file's S does nothing, its "Turn On Router at Dial N"
// pause only asks (a note when the dial is elsewhere). G-CODE routers (Sienci AutoSpin T1: 5 V PWM like a spindle)
// run at the file's S. The presets (dial tables / S range, body, mount) are web/data/routers.js (fluidnc_post.py's
// tables match it: tests/test_routers_data.py); the page builds each one's body (js/router_body.js, Part 45b). 45c:
// the Makita / T1 mount + shoe. Settings per machine (lr4-router via MS). Plain JS (tests/test_routers.js).
(function (root) {
  "use strict";
  const SC = root.StrutCam || (typeof require === "function" ? require("./strut_cam.js") : null);
  const RD = root.LR4RouterData || (typeof require === "function" ? require("../data/routers.js") : null);
  // Sienci AutoSpin T1 (Makita-size body, fits the V1E Makita 701 mount + shoe): the controller's 5 V PWM sets the
  // speed, 0-100 % = 0-31250 RPM; Sienci: under 10000 isn't accurate. Its own dial (standalone use) is ignored
  // while the controller drives it. GUESS: S = RPM straight (FluidNC speed_map 0=0% 31250=100%).
  const ROUTERS = Object.fromEntries(Object.entries(RD.routers).map(([k, r]) => [k, Object.assign({ name: r.name, source: r.source },
    r.dial ? { dial: r.dial } : {}, r.s ? { s: r.s } : {}, { body: r.body, mount: r.mount, hidden: !!r.hidden })]));   // hidden: not in Run's list (user 2026-10-28: only the Kobalt for now)
  const DEFAULTS = { router: "kobalt", dial: 3 };
  const DIAL = [1, 6];                               // every manual table runs 1..6
  const DIAL_STOP = 0.5;                             // the real dials click in half steps (user 2026-10-28)

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  function settings(o) {                             // a stored / shared object -> a valid { router, dial }
    o = o && typeof o === "object" ? o : {};
    const router = ROUTERS[o.router] ? o.router : DEFAULTS.router, d = Number(o.dial);
    return { router, dial: Number.isFinite(d) ? Math.round(clamp(d, DIAL[0], DIAL[1]) / DIAL_STOP) * DIAL_STOP : DEFAULTS.dial };
  }
  const manual = (id) => (ROUTERS[id] || ROUTERS[DEFAULTS.router]).source === "manual";
  function dialRpm(dial, id) {                       // the router's table, half steps (any step) interpolated
    const r = ROUTERS[id] && ROUTERS[id].dial ? id : DEFAULTS.router;
    return SC.dialRpm(clamp(dial, DIAL[0], DIAL[1]), r);
  }
  // the bit's speed with the job's router on: planned = the file's rpm there (M3 S / its dial pause through the
  // Kobalt table; sounds.js routerPlan), 0 = off. Manual: the dial. G-code: S, up to the router's top speed.
  function rpm(set, planned) {
    if (!(planned > 0)) return 0;
    const s = settings(set), r = ROUTERS[s.router];
    return r.source === "manual" ? dialRpm(s.dial, s.router) : Math.min(planned, r.s[1]);
  }
  // a note for the router-on event ev ({ rpm, dial? }) with these settings, or "" (nothing to say)
  function note(set, ev) {
    if (!ev || !(ev.rpm > 0)) return "";
    const s = settings(set), r = ROUTERS[s.router], k = (v) => `~${(Math.round(v / 100) * 100).toLocaleString("en-US")} RPM`;
    if (r.source === "manual") {
      if (ev.dial === undefined || Math.abs(ev.dial - s.dial) < 0.25) return "";
      return `The file asks for dial ${ev.dial}; the ${r.name}'s dial is at ${s.dial} (${k(dialRpm(s.dial, s.router))}): ` +
        `it runs at the dial. Turn the dial on the router (drag it) to match.`;
    }
    if (ev.dial !== undefined) return `This file was posted for a manual router (dial ${ev.dial}); the ${r.name} takes its ` +
      `speed from the G-code's S: ${k(rpm(s, ev.rpm))}.`;
    if (ev.rpm > r.s[1]) return `S${ev.rpm} is past the ${r.name}'s top speed: it runs at ${k(r.s[1])}.`;
    if (ev.rpm < r.s[0]) return `S${ev.rpm}: under ${r.s[0]} RPM the ${r.name}'s speed isn't accurate (Sienci).`;
    return "";
  }
  // the bit's turn on screen, rev/s - not the real speed: the hex nut repeats every 60 deg, so past ~2.5 rev/s at
  // 30 fps it wagon-wheels. 1.5 at 10000 RPM, 2 at 18000 (dial 3), 2.5 from 30000; 0 off.
  function spinRps(v) {
    if (!(v > 0)) return 0;
    return v <= 18000 ? Math.max(1.5, 1.5 + 0.5 * (v - 10000) / 8000) : Math.min(2.5, 2 + 0.5 * (v - 18000) / 12000);
  }
  // the dial's turn (deg about the router's axis): numbers DIAL_STEP apart round the wheel's edge
  const DIAL_STEP = 50;
  const dialDeg = (dial) => (clamp(dial, DIAL[0], DIAL[1]) - DIAL[0]) * DIAL_STEP;

  // ---- Build your router (My LR4 > Router, user 2026-10-29): any router edited or made in the page. EDITS: { id:
  // preset } (the data file's shape) per machine - a preset's id = an edited preset (Reset puts it back), "custom-..."
  // = one the user made or imported. define() puts one in ROUTERS (and strut_cam's dial tables); clean() makes any
  // stored / imported object a valid preset or null. ----
  const ORIG = JSON.parse(JSON.stringify(RD.routers));
  const EDITS_KEY = "lr4-routers";
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : d; };
  const pair = (v, d) => Array.isArray(v) ? [num(v[0], 0, 500, d[0]), num(v[1], 0, 500, d[1])] : d;
  function clean(p) {
    if (!p || typeof p !== "object" || !p.body || typeof p.body !== "object") return null;
    const base = ORIG.kobalt, b = JSON.parse(JSON.stringify(p.body)), q = { name: String(p.name || "My router").slice(0, 40) };
    q.source = p.source === "gcode" ? "gcode" : "manual";
    if (q.source === "manual") {
      const t = Array.isArray(p.dial) && p.dial.length === 6 ? p.dial : base.dial;
      q.dial = t.map((e, i) => [i + 1, num(Array.isArray(e) ? e[1] : e, 1000, 60000, base.dial[i][1])]);
      for (let i = 1; i < 6; i++) q.dial[i][1] = Math.max(q.dial[i][1], q.dial[i - 1][1]);   // never slower up the dial
    } else {
      const s = Array.isArray(p.s) ? p.s : [10000, 30000];
      q.s = [num(s[0], 0, 60000, 10000), 0]; q.s[1] = num(s[1], q.s[0] + 1, 60000, 30000);
    }
    q.mount = ["kobalt", "makita", "dewalt", "none"].includes(p.mount) ? p.mount : "makita";
    if (p.dial_source) q.dial_source = String(p.dial_source).slice(0, 200);
    const n = Array.isArray(b.nut) ? b.nut : base.body.nut;
    b.nut = [num(n[0], 5, 60, 22), num(n[1], 3, 40, 14), n[2] === "round" ? "round" : "hex"];
    if (b.kind === "spindle") {                      // nut, nose, can (js/router_body.js spindle); its top = overall
      const s = { kind: "spindle", nut: b.nut, nose: pair(b.nose, [0, 0]), can: pair(b.can, [65, 195]), cooling: b.cooling === "water" ? "water" : "air" };
      s.can = [num(s.can[0], 20, 150, 65), num(s.can[1], 30, 500, 195)];
      s.overall = s.nut[1] + (s.nose[0] > 0 && s.nose[1] > 0 ? s.nose[1] : 0) + s.can[1];
      if (b.cord && typeof b.cord === "object") s.cord = b.cord;
      if (b.clamp !== undefined) s.clamp = num(b.clamp, 0, 300, 36.5);
      s.colors = Object.assign({ body: [0.80, 0.82, 0.85], head: [0.10, 0.10, 0.11], cap: [0.07, 0.07, 0.08], dial: [0.07, 0.07, 0.08] }, b.colors);
      q.body = s;
      return q;
    }
    for (const k of ["spindle", "nose", "grip", "cast"]) b[k] = pair(b[k], [0, 0]);
    if (!(b.grip[0] > 0 && b.grip[1] > 0)) b.grip = [65, 95];
    if (b.head && !b.slabs) {
      const h = b.head, H = Object.assign({}, h);
      for (const [k, lo, hi, d] of [["L", 20, 300, 80], ["W", 20, 300, 72], ["top_r", 0, 100, 8], ["front_r", 0, 150, 14],
        ["back_r", 0, 150, 14], ["bot_r", 0, 100, 4]]) H[k] = num(h[k], lo, hi, d);
      if (h.H !== undefined) H.H = num(h.H, 10, 300, 80);
      const dp = typeof h.dial === "string" ? { place: h.dial } : h.dial || {};
      H.dial = { place: dp.place === "top" ? "top" : "end", d: num(dp.d, 8, 80, 24), t: num(dp.t, 2, 30, 6) };
      b.head = H;
    } else if (!b.slabs) return null;               // a body needs one or the other
    let top = b.nut[1];
    for (const k of ["spindle", "nose", "grip", "cast"]) if (b[k][0] > 0 && b[k][1] > 0) top += b[k][1];
    // the grip's collet-end chamfer (45 deg) + the transition up to the head (js/router_body.js stack). Old files'
    // sections above the collar (lathe [d at its top, z]) become the transition: their top Ø over their whole length.
    b.grip_ch = num(b.grip_ch, 0, 20, 0);
    if (!b.grip_ch) delete b.grip_ch;
    let T = b.trans && typeof b.trans === "object" ? b.trans : null;
    if (!T && Array.isArray(b.lathe) && b.lathe.length) {
      const last = b.lathe.filter(Array.isArray).slice(-1)[0];
      if (last) T = { l: (+last[1] || top) - top, d: +last[0] || 0, shape: "round", edge: "none" };
    }
    delete b.lathe;
    if (T) {
      const t = { l: num(T.l, 0, 200, 0), shape: T.shape === "head" ? "head" : "round", edge: ["fillet", "chamfer"].includes(T.edge) ? T.edge : "none" };
      t.d = num(T.d, 1, 300, (b.cast[0] > 0 && b.cast[1] > 0 ? b.cast : b.grip)[0]);
      t.e = num(T.e, 0, 50, 3);
      if (t.l > 0) { b.trans = t; top += t.l; } else delete b.trans;
    }
    // each section's look (the page: its color + finish): grip, collar, transition
    const FIN = ["metal", "plastic", "rubber"], looks = {};
    for (const k of ["grip", "cast", "trans"]) {
      const L = b.looks && b.looks[k];
      if (!L || typeof L !== "object") continue;
      const c = Array.isArray(L.c) && L.c.length === 3 && L.c.every((v) => Number.isFinite(+v)) ? L.c.map((v) => Math.min(Math.max(+v, 0), 1)) : null;
      looks[k] = { c: c || (b.colors && b.colors.body) || [0.8, 0.82, 0.85], f: FIN.includes(L.f) ? L.f : "metal" };
    }
    if (Object.keys(looks).length) b.looks = looks; else delete b.looks;
    if (b.lock && typeof b.lock === "object") b.lock = { z: num(b.lock.z, 0, 300, 25), a: num(b.lock.a, -360, 360, -50), d: num(b.lock.d, 4, 40, 16), r: num(b.lock.r, 5, 80, 30) };
    else delete b.lock;
    b.overall = num(b.overall, top + 10, 600, top + 80);
    if (b.head && !b.slabs) { b.head.H = num(b.head.H, 10, 300, b.overall - top); b.overall = +(top + b.head.H).toFixed(2); }   // the head always sits on the turned part
    if (b.head && !b.slabs) {                     // ... and covers it: at least as long / wide as its widest section
      const wide = Math.max(...["spindle", "nose", "grip", "cast"].map((k) => (b[k][1] > 0 ? b[k][0] : 0)), b.trans && b.trans.shape === "round" ? b.trans.d : 0);
      b.head.L = Math.max(b.head.L, wide); b.head.W = Math.max(b.head.W, wide);
    }
    if (b.clamp !== undefined) b.clamp = num(b.clamp, 0, 300, 36.5); else delete b.clamp;   // height in the mount (page/router.js rtDrop)
    b.colors = Object.assign({ body: [0.80, 0.82, 0.85], head: [0.3, 0.3, 0.32], cap: [0.07, 0.07, 0.08], dial: [0.07, 0.07, 0.08] }, b.colors);
    q.body = b;
    return q;
  }
  function define(id, p) {                           // put preset p (cleaned) in as router id; null = back to the data file's
    const q = p ? clean(p) : ORIG[id] ? JSON.parse(JSON.stringify(ORIG[id])) : null;
    if (!q) { delete ROUTERS[id]; delete SC.ROUTERS[id]; return null; }
    ROUTERS[id] = Object.assign({ name: q.name, source: q.source }, q.dial ? { dial: q.dial } : {}, q.s ? { s: q.s } : {},
      { body: q.body, mount: q.mount, hidden: false, edited: !!p, custom: !ORIG[id] });
    if (q.dial) SC.ROUTERS[id] = { name: q.name, dial: q.dial }; else delete SC.ROUTERS[id];
    return q;
  }
  function preset(id) {                              // router id as a data-file preset (for editing / export)
    const r = ROUTERS[id];
    if (!r) return null;
    return JSON.parse(JSON.stringify(Object.assign({ name: r.name, source: r.source }, r.dial ? { dial: r.dial } : {},
      r.s ? { s: r.s } : {}, { mount: r.mount, body: r.body })));
  }
  function newId(name) {
    const s = "custom-" + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "router");
    let id = s;
    for (let i = 2; ROUTERS[id]; i++) id = `${s}-${i}`;
    return id;
  }
  function loadEdits(store) {                        // store: MS (get / set); the page calls this before anything reads ROUTERS
    let e = {};
    try { e = JSON.parse(store.get(EDITS_KEY) || "{}") || {}; } catch (err) { /* none */ }
    for (const [id, p] of Object.entries(e)) if (!define(id, p)) delete e[id];
    return e;
  }
  if (root.MS && root.MS.get) loadEdits(root.MS);    // the page: before job.js / page/router.js list them

  const api = { ROUTERS, DEFAULTS, DIAL, DIAL_STOP, DIAL_STEP, EDITS_KEY, settings, manual, dialRpm, rpm, note, spinRps, dialDeg,
    clean, define, preset, newId, loadEdits };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Routers = api;
})(typeof self !== "undefined" ? self : this);
