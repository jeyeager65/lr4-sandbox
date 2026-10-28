// Routers (Part 45a, user 2026-10-27): the routers the page knows, where each one's speed comes from, and the speed
// dial. MANUAL routers (Kobalt, Makita, ...) run at their dial: a file's S does nothing, its "Turn On Router at Dial N"
// pause only asks (a note when the dial is elsewhere). G-CODE routers (Sienci AutoSpin T1: 5 V PWM like a spindle)
// run at the file's S. The dial tables are StrutCam.ROUTERS (twin of lib/fclib/fluidnc_post.py ROUTERS). The model is
// still the Kobalt for every router (Part 45b: a router body from parameters; 45c: the Makita / T1 mount + shoe).
// Settings per machine (lr4-router via MS). Plain JS (tests/test_routers.js).
(function (root) {
  "use strict";
  const SC = root.StrutCam || (typeof require === "function" ? require("./strut_cam.js") : null);
  const MANUAL = Object.fromEntries(Object.entries(SC.ROUTERS).map(([k, r]) => [k, { name: r.name, source: "manual", dial: r.dial }]));
  // Sienci AutoSpin T1 (Makita-size body, fits the V1E Makita 701 mount + shoe): the controller's 5 V PWM sets the
  // speed, 0-100 % = 0-31250 RPM; Sienci: under 10000 isn't accurate. Its own dial (standalone use) is ignored
  // while the controller drives it. GUESS: S = RPM straight (FluidNC speed_map 0=0% 31250=100%).
  const ROUTERS = Object.assign({}, MANUAL, { t1: { name: "Sienci AutoSpin T1", source: "gcode", s: [10000, 31250] } });
  const DEFAULTS = { router: "kobalt", dial: 3 };
  const DIAL = [1, 6];                               // every manual table runs 1..6

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  function settings(o) {                             // a stored / shared object -> a valid { router, dial }
    o = o && typeof o === "object" ? o : {};
    const router = ROUTERS[o.router] ? o.router : DEFAULTS.router, d = Number(o.dial);
    return { router, dial: Number.isFinite(d) ? Math.round(clamp(d, DIAL[0], DIAL[1]) * 10) / 10 : DEFAULTS.dial };
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

  const api = { ROUTERS, DEFAULTS, DIAL, DIAL_STEP, settings, manual, dialRpm, rpm, note, spinRps, dialDeg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4Routers = api;
})(typeof self !== "undefined" ? self : this);
