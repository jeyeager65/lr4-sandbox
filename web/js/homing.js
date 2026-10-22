// Homing ($H) as FluidNC does it (Machine/Homing.cpp, Limit.cpp), for the page's Home button: the homing settings
// from a config.yaml (V1E's JP3_LR values as the fallback) and a plan of the moves from any pose, as a timeline
// GcodePlay.at / step can play (segs + end times + an anim stub). Per cycle (Z first, then X + Y together): seek to
// the switch, pull off, feed back to it, pull off again, with a settle pause after each; every axis stops at its own
// switch, so the two Y motors square the gantry. MPos = mpos_mm at the pulled-off spot. tests/test_homing.js checks it.
// Poses are the page's pose space (mm from the parked pose, meta.travel's frame): the switch trips are travel.x[0],
// travel.y[0] (toward min) and travel.z[1] (Z up, positive_direction).
(function (root) {
  "use strict";
  const AXES = ["x", "y", "z"];
  // V1E's JP3_LR config.yaml (FluidNC_Configs @ 3bb3650): used when the yaml in use has no homing block for an axis
  const V1E = {
    x: { cycle: 2, positive: false, mpos: 3, pulloff: 4, feed: 300, seek: 1500, settle: 500 },
    y: { cycle: 2, positive: false, mpos: 3, pulloff: 4, feed: 300, seek: 1500, settle: 500 },
    z: { cycle: 1, positive: true, mpos: 3, pulloff: 4, feed: 300, seek: 800, settle: 500 },
  };
  // the page plays homing faster than life (seek x4, feed + settle x10); "real speed" = { seek: 1, feed: 1 }
  const FAST = { seek: 4, feed: 10 };

  // config.yaml text (needs cnc-gcode-tools' parseFluidNCConfig loaded) or its parsed values ({"/axes/x/...": n})
  // -> { x: {cycle, positive, mpos, pulloff (largest of the axis' motors), feed, seek (mm/min), settle (ms),
  // from: "yaml" | "fallback"}, y, z }
  function settings(yaml) {
    let v = yaml || {};
    if (typeof yaml === "string") v = typeof parseFluidNCConfig === "function" ? parseFluidNCConfig(yaml).values : {};
    const out = {};
    for (const a of AXES) {
      const h = (k) => v[`/axes/${a}/homing/${k}`];
      if (h("cycle") === undefined) { out[a] = Object.assign({ from: "fallback" }, V1E[a]); continue; }
      const pick = (k, d) => (Number.isFinite(h(k)) ? h(k) : d);
      const pulls = Object.keys(v).filter((k) => new RegExp(`^/axes/${a}/motor\\d+/pulloff_mm$`).test(k)).map((k) => v[k]);
      out[a] = { cycle: pick("cycle", 0), positive: !!pick("positive_direction", V1E[a].positive), mpos: pick("mpos_mm", V1E[a].mpos),
        pulloff: pulls.length ? Math.max(...pulls) : V1E[a].pulloff, feed: pick("feed_mm_per_min", V1E[a].feed),
        seek: pick("seek_mm_per_min", V1E[a].seek), settle: pick("settle_ms", V1E[a].settle), from: "yaml" };
    }
    return out;
  }

  // the switch trip and the homed (pulled-off) spot of an axis, in pose space
  const RELEASE_MM = 0.5;   // the lever's travel back before the switch opens (a GUESS; 0.2 tocked too soon - user)
  const trip = (s, tv, a) => (s[a].positive ? tv[a][1] : tv[a][0]);
  const spot = (s, tv, a) => trip(s, tv, a) + (s[a].positive ? -1 : 1) * s[a].pulloff;

  // pose {x, y, z} -> { segs [{start, end, phase, cycle, time}], t (end times, s), total, events [{time, kind: "trip"
  // (the switch pressed) | "release" (opening again, RELEASE_MM into the pull-off), axis, phase}], home {x, y, z} (the homed spots; axes with cycle 0 aren't homed and stay put), anim (stub for
  // GcodePlay.at / step) }. speed = FAST (default) or { seek, feed } multipliers.
  function plan(pose, tv, s, speed) {
    const k = Object.assign({}, FAST, speed);
    const segs = [], events = [], home = {};
    let p = { x: pose.x, y: pose.y, z: pose.z }, now = 0;
    const push = (seg) => { segs.push(seg); now += seg.time; };
    // the axes in `to` move together, each at its own rate (mm/min) and stopping on its own; tripping = clicks
    function moveTo(to, rates, phase, cycle, tripping) {
      const dur = {};
      for (const a in to) dur[a] = Math.abs(to[a] - p[a]) / (rates[a] / 60);
      if (tripping) for (const a in to) events.push({ time: now + dur[a], kind: "trip", axis: a, phase });
      if (phase === "pulloff") for (const a in to) events.push({ time: now + Math.min(dur[a], RELEASE_MM / (rates[a] / 60)), kind: "release", axis: a, phase });
      const at = (t) => {
        const q = Object.assign({}, p);
        for (const a in to) q[a] = dur[a] > 0 ? p[a] + (to[a] - p[a]) * Math.min(1, t / dur[a]) : to[a];
        return q;
      };
      const marks = [...new Set(Object.values(dur).filter((d) => d > 0))].sort((m, n) => m - n);
      let t0 = 0;
      for (const t1 of marks) { push({ start: at(t0), end: at(t1), phase, cycle, time: t1 - t0 }); t0 = t1; }
      p = at(Infinity);
    }
    const settle = (axes, cycle) => {
      const ms = Math.max(...axes.map((a) => s[a].settle)) / k.feed;
      if (ms > 0) push({ start: Object.assign({}, p), end: Object.assign({}, p), phase: "settle", cycle, time: ms / 1000 });
    };
    const cycles = [...new Set(AXES.map((a) => s[a].cycle).filter((c) => c > 0))].sort((m, n) => m - n);
    for (const c of cycles) {
      const axes = AXES.filter((a) => s[a].cycle === c);
      const each = (f) => Object.fromEntries(axes.map((a) => [a, f(a)]));
      const seek = each((a) => s[a].seek * k.seek), feed = each((a) => s[a].feed * k.feed);
      moveTo(each((a) => trip(s, tv, a)), seek, "seek", c, true);      settle(axes, c);
      moveTo(each((a) => spot(s, tv, a)), feed, "pulloff", c, false);  settle(axes, c);
      moveTo(each((a) => trip(s, tv, a)), feed, "feed", c, true);      settle(axes, c);
      moveTo(each((a) => spot(s, tv, a)), feed, "pulloff", c, false);  settle(axes, c);
      for (const a of axes) home[a] = spot(s, tv, a);
    }
    const t = [];
    segs.reduce((sum, g, i) => (t[i] = sum + g.time), 0);
    const total = t.length ? t[t.length - 1] : 0;
    const anim = {                                   // what GcodePlay.at / step use of cnc-gcode-tools' Animator
      speed: 1,
      indexAtTime(x) { let lo = 0, hi = t.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; } return lo; },
      advanceTime(x, dt) { return x + dt * this.speed; },
    };
    events.sort((m, n) => m.time - n.time);
    return { segs, t, total, events, home, anim, settings: s, speed: k };   // speed: the multipliers it was planned at
  }

  // machine position after homing: mpos_mm at the homed spot, + the pose's distance from it (machine axes = pose
  // axes). null for an axis that isn't homed.
  function mpos(s, home, pose) {
    const o = {};
    for (const a of AXES) o[a] = home && home[a] !== undefined ? s[a].mpos + pose[a] - home[a] : null;
    return o;
  }
  // FluidNC's soft range for an axis: [mpos, mpos + max_travel] (positive_direction: [mpos - max_travel, mpos])
  const softRange = (sa, maxTravel) => (sa.positive ? [sa.mpos - maxTravel, sa.mpos] : [sa.mpos, sa.mpos + maxTravel]);

  const api = { V1E, FAST, RELEASE_MM, settings, plan, trip, spot, mpos, softRange };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Homing = api;
})(typeof self !== "undefined" ? self : this);
