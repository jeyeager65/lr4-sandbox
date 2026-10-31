// Routers (Part 45a, user 2026-10-27): the routers the page knows, where each one's speed comes from, and the speed
// dial. MANUAL routers (Kobalt, Makita, ...) run at their dial: a file's S does nothing, its "Turn On Router at Dial N"
// pause only asks (a note when the dial is elsewhere). G-CODE routers (Sienci AutoSpin T1: 5 V PWM like a spindle)
// run at the file's S. The presets (speed tables / S range, model, mount) are web/data/routers.js (fluidnc_post.py's
// tables match it: tests/test_routers_data.py); the page builds each one's model (js/router_body.js, Part 45b). 45c:
// the Makita / T1 mount + shoe. Settings per machine (lr4-router via MS). Plain JS (tests/test_routers.js).
(function (root) {
  "use strict";
  const SC = root.StrutCam || (typeof require === "function" ? require("./strut_cam.js") : null);
  const RD = root.LR4RouterData || (typeof require === "function" ? require("../data/routers.js") : null);
  const CS = root.LR4CapShape || (typeof require === "function" ? require("./cap_shape.js") : null);   // the motor cap's shape (Part 46b)
  // Sienci AutoSpin T1 (Makita-size body, fits the V1E Makita 701 mount + shoe): the controller's 5 V PWM sets the
  // speed, 0-100 % = 0-31250 RPM; Sienci: under 10000 isn't accurate. Its own dial (standalone use) is ignored
  // while the controller drives it. GUESS: S = RPM straight (FluidNC speed_map 0=0% 31250=100%).
  const ROUTERS = {};                                // define() fills it from the data file (below)
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
    const r = ROUTERS[id] && ROUTERS[id].speeds ? id : DEFAULTS.router;
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
  // = one the user made or imported. define() puts one in ROUTERS (and strut_cam's speed tables); clean() makes any
  // stored / imported object a valid preset or null (no old names read: user 2026-10-29, no back compat). ----
  const ORIG = JSON.parse(JSON.stringify(RD.routers));
  const EDITS_KEY = "lr4-routers";
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : d; };
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
  // every part's look { c: sRGB, f: metal | plastic | rubber } (the page: its material); a preset's own over these
  const FINISHES = ["metal", "plastic", "rubber"];
  const SILVER = [0.80, 0.82, 0.85], STEEL = [0.72, 0.73, 0.75], DARK = [0.07, 0.07, 0.08];
  const LOOKS = { shaft: { c: STEEL, f: "metal" }, collet: { c: [0.78, 0.66, 0.42], f: "metal" }, collet_nut: { c: STEEL, f: "metal" },
    bearing_cap: { c: SILVER, f: "metal" }, housing: { c: SILVER, f: "metal" }, collar: { c: SILVER, f: "metal" },
    transition: { c: SILVER, f: "metal" }, motor_cap: { c: [0.30, 0.30, 0.32], f: "plastic" }, dial: { c: DARK, f: "plastic" },
    switch: { c: [0.17, 0.17, 0.18], f: "plastic" }, shaft_lock: { c: [0.12, 0.12, 0.13], f: "plastic" }, lock_boss: { c: SILVER, f: "metal" },
    brush_cap: { c: [0.16, 0.16, 0.17], f: "plastic" }, brush_ring: { c: [0.5, 0.5, 0.5], f: "plastic" },
    strain_relief: { c: DARK, f: "rubber" }, cord: { c: DARK, f: "rubber" }, trim: { c: DARK, f: "plastic" } };
  const LOOK_PARTS = Object.keys(LOOKS);
  function looks(m) {                                // the preset's looks, every part filled in
    const out = {};
    for (const k of LOOK_PARTS) {
      const L = obj(m.looks && m.looks[k]), c = L && Array.isArray(L.c) && L.c.length === 3 && L.c.every((v) => Number.isFinite(+v)) ? L.c.map((v) => clamp(+v, 0, 1)) : null;
      out[k] = { c: c || LOOKS[k].c.slice(), f: L && FINISHES.includes(L.f) ? L.f : LOOKS[k].f };
    }
    if (!obj(m.looks && m.looks.lock_boss)) out.lock_boss = { c: out.housing.c.slice(), f: out.housing.f };   // the boss: as the housing, unless set
    if (!obj(m.looks && m.looks.brush_ring)) out.brush_ring = { c: out.motor_cap.c.slice(), f: out.motor_cap.f };   // the brush caps' border: as the head
    return out;
  }
  const section = (v, d, lo, hi) => { const s = obj(v); return s ? { d: num(s.d, lo, hi, d.d), l: num(s.l, 0, 500, d.l) } : null; };
  function clean(p) {
    if (!obj(p) || !obj(p.model)) return null;
    const base = ORIG.kobalt, b = JSON.parse(JSON.stringify(p.model)), q = { name: String(p.name || "My router").slice(0, 40) };
    q.source = p.source === "gcode" ? "gcode" : "manual";
    if (q.source === "manual") {
      const t = Array.isArray(p.speeds) && p.speeds.length === 6 ? p.speeds : base.speeds;
      q.speeds = t.map((e, i) => [i + 1, num(Array.isArray(e) ? e[1] : e, 1000, 60000, base.speeds[i][1])]);
      for (let i = 1; i < 6; i++) q.speeds[i][1] = Math.max(q.speeds[i][1], q.speeds[i - 1][1]);   // never slower up the dial
    } else {
      const s = Array.isArray(p.s) ? p.s : [10000, 30000];
      q.s = [num(s[0], 0, 60000, 10000), 0]; q.s[1] = num(s[1], q.s[0] + 1, 60000, 30000);
    }
    q.mount = ["kobalt", "makita", "dewalt", "none"].includes(p.mount) ? p.mount : "makita";
    if (p.speeds_source) q.speeds_source = String(p.speeds_source).slice(0, 200);
    const m = { label: String(b.label || q.name).slice(0, 120) }, B = base.model;
    // the bit end: collet nut, collet, shaft (missing ones: the Kobalt's)
    const n = obj(b.collet_nut) || B.collet_nut;
    m.collet_nut = { type: String(n.type || "").slice(0, 20), af: num(n.af, 5, 60, 22), h: num(n.h, 3, 40, 14), below: num(n.below, 0, 20, 1.5) };
    m.collet_nut.below = Math.min(m.collet_nut.below, m.collet_nut.h - 1);
    const c = obj(b.collet) || B.collet, sizes = (Array.isArray(c.sizes) ? c.sizes : B.collet.sizes).map((v) => num(v, 1, 20, 6.35)).filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => x - y);
    m.collet = { type: String(c.type || "").slice(0, 20), sizes: sizes.length ? sizes : [6.35], l: num(c.l, 5, 60, 18), d: num(c.d, 4, 40, 11.5), taper: num(c.taper, 0, 30, 8) };
    m.collet.d = Math.max(m.collet.d, Math.max(...m.collet.sizes) + 1.5);
    const S = obj(b.shaft) || B.shaft, T = obj(S.thread) || B.shaft.thread;
    m.shaft = { d: num(S.d, 4, 60, 12), exposed: num(S.exposed, 0, 60, 4), thread: { d: num(T.d, 4, 60, 13), pitch: num(T.pitch, 0.25, 4, 0.75), length: num(T.length, 1, 40, 8) } };
    const F = obj(S.flats);
    if (F) m.shaft.flats = { af: num(F.af, 2, m.shaft.d - 0.5, m.shaft.d * 0.8), z: num(F.z, 0, 200, m.collet_nut.h), l: num(F.l, 0.5, 40, 3) };
    if (b.kind === "spindle") {                      // the can = the housing; its top = the end cap (router_body.js spindle)
      m.kind = "spindle";
      const bc = section(b.bearing_cap, { d: 0, l: 0 }, 0, 200);
      if (bc && bc.d > 0 && bc.l > 0) m.bearing_cap = bc;
      m.housing = section(b.housing, { d: 65, l: 180 }, 20, 150) || { d: 65, l: 180 };
      m.housing.l = Math.max(m.housing.l, 30);
      m.cooling = b.cooling === "water" ? "water" : "air";
    } else {
      for (const k of ["bearing_cap", "housing", "collar"]) { const s = section(b[k], { d: 0, l: 0 }, 0, 200); if (s && s.d > 0 && s.l > 0) m[k] = s; }
      if (!m.housing) m.housing = { d: 65, l: 95 };
      const ch = num(obj(b.housing) && b.housing.ch, 0, 20, 0);
      if (ch) m.housing.ch = ch;
      const V = obj(b.housing) && obj(b.housing.vent);   // the open end the fan blows out of: a tube wall, spokes from the hub
      if (V && num(V.depth, 0, 60, 0) > 0) m.housing.vent = { depth: num(V.depth, 0, 60, 10), wall: num(V.wall, 0.8, 10, 2.5),
        spokes: Math.round(num(V.spokes, 0, 24, 12)), w: num(V.w, 1, 20, 3), inset: num(V.inset, 0, 50, 0.5) };
      const Tr = obj(b.transition);                  // the transition up to the motor cap
      if (Tr) {
        const t = { l: num(Tr.l, 0, 200, 0), shape: Tr.shape === "cap" ? "cap" : "round", edge: ["fillet", "chamfer"].includes(Tr.edge) ? Tr.edge : "none" };
        t.d = num(Tr.d, 1, 300, (m.collar || m.housing).d);
        t.e = num(Tr.e, 0, 50, 3);
        if (t.l > 0) m.transition = t;
      }
      const h = obj(b.motor_cap) || {}, H = {};
      for (const [k, lo, hi, d] of [["L", 20, 300, 80], ["W", 20, 300, 72], ["H", 10, 300, 80], ["top_r", 0, 100, 8], ["front_r", 0, 150, 14],
        ["back_r", 0, 150, 14], ["bot_r", 0, 100, 4]]) H[k] = num(h[k], lo, hi, d);
      if (Array.isArray(h.at)) H.at = [num(h.at[0], -200, 200, 0), num(h.at[1], -200, 200, 0)];
      const sh = CS && h.shape ? CS.clean(h.shape) : null;   // drawn in the shape editor: its size is the shape's
      if (sh) { const z = CS.size(sh); Object.assign(H, { shape: sh, L: z.L, W: z.W, H: z.H, at: [z.at[0], 0] }); }
      else {
        const wide = Math.max(...["bearing_cap", "housing", "collar"].map((k) => (m[k] ? m[k].d : 0)), m.transition && m.transition.shape === "round" ? m.transition.d : 0);
        H.L = Math.max(H.L, wide); H.W = Math.max(H.W, wide);   // the cap covers the turned part
      }
      m.motor_cap = H;
      const D = obj(b.dial) || {};
      m.dial = { place: ["top", "window"].includes(D.place) ? D.place : "end", d: num(D.d, 8, 80, 24), t: num(D.t, 2, 30, 6) };
      if (m.dial.place === "window") {               // lying flat inside the cap, its rim seen through a window (the Kobalt's, user 2026-10-30)
        const Wn = obj(D.win) || {}, dd = m.dial.d;
        Object.assign(m.dial, { in: num(D.in, -20, 60, 1), drop: num(D.drop, 0, 60, 2),
          win: { l: num(Wn.l, 2, 120, +(dd * 0.35).toFixed(1)), w: num(Wn.w, 2, 120, +(dd * 0.8).toFixed(1)), open: Wn.open !== false,
          bevel: num(Wn.bevel, 0, 10, 2), r: num(Wn.r, 0, 60, 0) } });   // bevel: the 45 deg edge from the top into the window; r: its corners (plan)
      }
      // its style (user 2026-10-30, an option): numbers on the ridged rim, or on a domed top (dome.top: the flat top's
      // share of the radius); the slot it shows through + the surround round that (Part 46d: end / top; js/router_body.js)
      m.dial.style = D.style === "dome" ? "dome" : "rim";
      if (m.dial.style === "dome") m.dial.dome = { top: num(obj(D.dome) && D.dome.top, 0, 0.95, 0.45) };
      if (m.dial.place !== "window") {
        const Sl = obj(D.slot), Su = obj(D.surround) || {}, kind = ["sunk", "raised"].includes(Su.kind) ? Su.kind : "none";
        if (D.slot === false) m.dial.slot = false;
        else if (Sl) {
          m.dial.slot = {};
          for (const [k, lo, hi] of [["w", 2, 120], ["h", 1, 60], ["r", 0, 60]]) if (Sl[k] !== undefined && Sl[k] !== null && Sl[k] !== "") m.dial.slot[k] = num(Sl[k], lo, hi, undefined);
        }
        if (D.set !== undefined) m.dial.set = num(D.set, -10, 10, 0.3);
        if (kind !== "none") m.dial.surround = Object.assign({ kind, depth: num(Su.depth, 0.2, 30, 2), margin: num(Su.margin, 0, 40, 3),
          edge: Su.edge === "fillet" ? "fillet" : "chamfer", e: num(Su.e, 0, 10, 1), out: Su.out === "top" ? "top" : "none" },
          Su.r !== undefined && Su.r !== null && Su.r !== "" ? { r: num(Su.r, 0, 60, 0) } : {});
      }
      if (Array.isArray(D.ring) && D.ring.length === 2 && D.ring.every((v) => /^#[0-9a-f]{6}$/i.test(v))) m.dial.ring = D.ring.slice();
      const Sw = obj(b.switch);                      // the switch: its centre `down` under the head's top (else placed by the dial)
      if (Sw && Number.isFinite(+Sw.down)) m.switch = { down: num(Sw.down, 0, 300, 20) };
      const Bc = obj(b.brushes);                     // the motor's brush caps (user 2026-10-30: "pretty much all of these trim routers"):
      if (Bc) m.brushes = { n: Math.round(num(Bc.n, 1, 4, 2)), z: num(Bc.z, 0, 400, 100), a: num(Bc.a, -360, 360, 90), d: num(Bc.d, 3, 40, 12),
        r: num(Bc.r, 5, 120, 30), out: num(Bc.out, 0.5, 30, 5), ring: num(Bc.ring, 0, 15, 0), inset: num(Bc.inset, -10, 10, 1), slot: num(Bc.slot, -180, 180, 15) };   // slot: its screwdriver slot, deg from upright   // n round the axis from a deg, each d across, its base r out,
      // standing out (no border); ring: a border that wide round each in the head's color, flush with the body - r then = the
      // body's surface (user 2026-10-30: most cross into the transition; "shouldn't stick out"), the cap `inset` in it
      const L = obj(b.shaft_lock);
      if (L) {                                       // d: the boss's Ø (0 = none: the button straight out of the turned part); in: where it starts out from the axis;
        // arm: a bracket that wide from the boss up to the housing (0 = none); pin: the Ø of the button's pin into the shaft's hole (0 = none);
        // button: its Ø; out: how far it stands out
        const tr = num(L.travel, 0.5, 10, 3), d = L.d === 0 ? 0 : num(L.d, 4, 40, 16), r = num(L.r, 5, 80, 30);
        m.shaft_lock = { z: num(L.z, 0, 300, 25), a: num(L.a, -360, 360, -50), d, in: num(L.in, 0, r - 1, 0), arm: num(L.arm, 0, 60, 0), pin: num(L.pin, 0, 12, 0), r, travel: tr,
          button: num(L.button, 2, 30, d ? +(d * 0.7).toFixed(1) : 10), out: num(L.out, 0.5, 20, tr + 1) };
      }
      const SR = obj(b.strain_relief);
      if (SR) {
        m.strain_relief = { l: num(SR.l, 5, 150, 40), d: num(SR.d, 4, 40, 12), bend: num(SR.bend, -90, 90, 45) };
        if (Array.isArray(SR.at) && SR.at.length === 3) m.strain_relief.at = SR.at.map((v) => num(v, -300, 600, 0));
      }
    }
    const C = obj(b.cord);
    if (C) m.cord = { d: num(C.d, 2, 20, 7.4), out: num(C.out, 0, 100, 15) };
    if (b.clamp !== undefined) m.clamp = num(b.clamp, 0, 300, 36.5);   // height in the mount (page/router.js rtDrop)
    m.looks = looks(b);
    q.model = m;
    return q;
  }
  // put preset p (cleaned) in as router id; null = back to the data file's. A p that won't clean (an old file's / edit's
  // schema) returns null: a data-file router keeps its own preset, a custom one is gone
  function define(id, p) {
    const q = p ? clean(p) : ORIG[id] ? clean(ORIG[id]) : null;
    if (!q && p && ORIG[id]) { define(id, null); return null; }
    if (!q) { delete ROUTERS[id]; delete SC.ROUTERS[id]; return null; }
    ROUTERS[id] = Object.assign({ name: q.name, source: q.source }, q.speeds ? { speeds: q.speeds } : {}, q.s ? { s: q.s } : {},
      { model: q.model, mount: q.mount, edited: !!p, custom: !ORIG[id] });
    if (q.speeds) SC.ROUTERS[id] = { name: q.name, speeds: q.speeds }; else delete SC.ROUTERS[id];
    return q;
  }
  function preset(id) {                              // router id as a data-file preset (for editing / export)
    const r = ROUTERS[id];
    if (!r) return null;
    return JSON.parse(JSON.stringify(Object.assign({ name: r.name, source: r.source }, r.speeds ? { speeds: r.speeds } : {},
      r.s ? { s: r.s } : {}, { mount: r.mount, model: r.model })));
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
  for (const id of Object.keys(ORIG)) define(id, null);   // every preset cleaned: its looks + defaults filled in
  if (root.MS && root.MS.get) loadEdits(root.MS);    // the page: before job.js / page/router.js list them

  const api = { ROUTERS, DEFAULTS, DIAL, DIAL_STOP, DIAL_STEP, EDITS_KEY, LOOK_PARTS, FINISHES, settings, manual, dialRpm, rpm, note, spinRps, dialDeg,
    clean, define, preset, newId, loadEdits };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Routers = api;
})(typeof self !== "undefined" ? self : this);
