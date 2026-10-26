// Lost steps (Part 44a, user 2026-10-26): a stepper slips when the cut asks more of it than it has - too deep, too fast
// for the bit, a dull bit, the router off - or the axis drags (dry lead screws, gritty rails). FluidNC never knows: it
// counts the steps it sent, so the rest of the job runs shifted by what the motor lost (a layer shift), with a thunk
// at each slip. Per motor: X has one; Y two (the cut's load split by where the router is along X, the lever rule, so
// the motor nearer the router slips more often; the gantry resists racking, so the other side soon follows and it
// stays near square); Z two lead screws (dry ones lose a lot to friction, the core's weight on the way up, a plunge on
// the way down: Z slips most). Constants are ILLUSTRATIVE (said so on the page): a NEMA17 at V1E's 0.8 A, a Kienzle-
// style feed force for MDF / wood, not measured. Settings (As built > Lost steps, Imperfect settings.slip): on, and a
// drag per axis 0 (clean, lubed) .. 1 (dry, gritty).
// Plain JS: tests/test_lost_steps.js.
(function (root) {
  "use strict";
  const C = {
    T0: 0.3,            // N·m a motor pulls at low speed (0.8 A run current; GUESS)
    F_KNEE: 800,        // full steps/s where its torque has halved (24 V, TMC2209; GUESS)
    FULL_REV: 200,      // full steps a turn
    QUANTUM: 4,         // full steps lost per slip (one electrical cycle: the rotor drops back to the next pole pair)
    KC: 45,             // N / mm^1.7: feed force = KC x chip^0.7 x engaged depth (MDF / softwood, illustrative)
    KP: 270,            // the same for a plunge (the bit's center rubs: 6x)
    SIDE: 0.4,          // the cut's push sideways (across the move) as a fraction of the feed force
    H_MAX: 0.3,         // mm / tooth cap (the router off: the bit drags through the stock)
    DRAG_XY: 20,        // N friction per Y side / the X axis at drag 1 (gritty V-wheels, a binding rail)
    ETA: [0.38, 0.1],   // Z lead screw efficiency, lubed .. dry
    DRAG_Z: 20,         // N per Z side at drag 1 (a dry nut binding, both ways)
    W_Z: 25,            // N the core + router weigh on the Z screws (going up)
    K_RACK: 30,         // N / mm: the gantry / beam fighting a rack between its two motors
    NOISE: 0.25,        // the stock's variation on the cut's force (grain, glue, density), +-
    NOISE_MM: 20,       // mm of travel per noise wiggle
    V_MIN: 0.05,        // mm/s: slower than this an axis is holding, not driving (holding torque: no slip)
  };
  const DEFAULTS = { on: false, x: 0.3, y: 0.3, z: 0.5 };
  const AXES = ["x", "y", "z"];
  const SIDES = { x: 1, y: 2, z: 2 };

  function settings(saved) {
    const s = Object.assign({}, DEFAULTS);
    if (saved && typeof saved === "object") {
      if (saved.on !== undefined) s.on = !!saved.on;
      for (const a of AXES) if (Number.isFinite(+saved[a]) && saved[a] !== null && saved[a] !== "") s[a] = Math.min(1, Math.max(0, +saved[a]));
    }
    return s;
  }
  // steps per axis ({ x: { perMm, micro } }, sounds.js stepsFromYaml) -> full steps / mm (V1E: X / Y 6.25, Z 25)
  const fullPerMm = (st) => (st && st.perMm > 0 ? st.perMm / Math.max(1, st.micro || 1) : 6.25);
  // the force one motor can push its axis at full steps / s f: the torque curve through the pulley / lead screw
  function capacity(axis, f, st, drag) {
    const T = C.T0 / (1 + Math.abs(f) / C.F_KNEE), mmRev = C.FULL_REV / fullPerMm(st);
    const eta = axis === "z" ? C.ETA[0] + (C.ETA[1] - C.ETA[0]) * drag : 1;
    return T * 2 * Math.PI * eta / (mmRev / 1000);
  }
  // how deep the bit is in the stock: heightAt(x, y) = the stock's top there (null = no stock). Samples on the half of
  // the bit leading the move (ux, uy = its direction; none = all round) and at the center (a plunge). len = the
  // flutes' length (deeper than that rubs the shank: counted as cutting). -> { d (mean depth, mm), c (center depth) }
  function engage(heightAt, p, ux, uy, r, len) {
    const depth = (x, y) => { const h = heightAt(x, y); return h === null || h === undefined ? 0 : Math.min(Math.max(h - p.z, 0), len || Infinity); };
    const moving = Math.hypot(ux, uy) > 1e-6, a0 = moving ? Math.atan2(uy, ux) : 0;
    let sum = 0, n = 0;
    for (const k of [0.5, 1]) for (let i = 0; i < (moving ? 7 : 12); i++) {
      const a = moving ? a0 + (i / 6 - 0.5) * Math.PI : (i / 12) * 2 * Math.PI;
      sum += depth(p.x + k * r * Math.cos(a), p.y + k * r * Math.sin(a)); n++;
    }
    return { d: sum / n, c: depth(p.x, p.y) };
  }
  // a smooth wiggle in [-1, 1] along the travelled distance (seeded value noise)
  function noiseAt(seed, s) {
    const h = (i) => { let x = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967295 * 2 - 1; };
    const i = Math.floor(s), t = s - i, w = t * t * (3 - 2 * t);
    return h(i) * (1 - w) + h(i + 1) * w;
  }
  function create(seed = 44) {
    return { seed, dist: 0, lost: { x: [0], y: [0, 0], z: [0, 0] }, cont: { x: [0], y: [0, 0], z: [0, 0] }, slips: 0 };
  }
  // each motor's load and what it can push (N) for one moment of the job:
  // o = { v: { x, y, z } mm/s commanded, set (settings), steps (per axis { perMm, micro }), rpm, flutes, r (bit radius),
  //       eng ({ d, c } from engage), u (the router's place along X between the Y / Z sides, 0 = side 1 .. 1 = side 2),
  //       noise (-1..1) } -> { load: { x: [N], y: [s1, s2], z: [s1, s2] }, cap: same }
  function loads(st, o) {
    const v = o.v, vh = Math.hypot(v.x, v.y), set = o.set, fl = Math.max(1, o.flutes || 2), u = Math.min(1, Math.max(0, o.u ?? 0.5));
    const tps = Math.max(0, o.rpm || 0) / 60 * fl;                     // teeth per second
    const chip = (vel) => Math.min(C.H_MAX, tps > 0 ? Math.abs(vel) / tps : C.H_MAX);
    const k = 1 + C.NOISE * (o.noise || 0), eng = o.eng || { d: 0, c: 0 };
    const feed = vh > C.V_MIN && eng.d > 0 ? k * C.KC * Math.pow(chip(vh), 0.7) * (fl / 2) * eng.d : 0;
    const ux = vh > 0 ? Math.abs(v.x) / vh : 0, uy = vh > 0 ? Math.abs(v.y) / vh : 0;
    const fx = feed * ux + C.SIDE * feed * uy, fy = feed * uy + C.SIDE * feed * ux;
    const plunge = v.z < -C.V_MIN && eng.c > 0 ? k * C.KP * (o.r || 1.5) * Math.pow(chip(v.z), 0.7) * fl / 2 : 0;
    const fz = v.z > C.V_MIN ? C.W_Z : Math.max(0, plunge - C.W_Z / 2);   // up: the core's weight; down: it helps a plunge some
    const f = (a) => Math.abs(v[a]) * fullPerMm(o.steps && o.steps[a]);
    const cap = (a) => capacity(a, f(a), o.steps && o.steps[a], set[a]);
    const rack = (a) => C.K_RACK * Math.abs(st.lost[a][1] - st.lost[a][0]);   // on the side that's ahead (lost less)
    const ahead = (a, i) => (Math.abs(st.lost[a][i]) < Math.abs(st.lost[a][1 - i]) ? rack(a) : 0);
    return {
      load: { x: [fx + C.DRAG_XY * set.x], y: [0, 1].map((i) => fy * (i ? u : 1 - u) + C.DRAG_XY * set.y + ahead("y", i)),
        z: [0, 1].map((i) => fz * (i ? u : 1 - u) + C.DRAG_Z * set.z + ahead("z", i)) },
      cap: { x: [cap("x")], y: [cap("y"), cap("y")], z: [cap("z"), cap("z")] },
    };
  }
  // one moment (dt s) of the job: an overloaded motor drops behind part of its commanded move (all of it at 1.25x its
  // load: stalled), in whole slips (QUANTUM full steps). Moves st.lost (mm, + = behind in +). -> { slips: [{ axis,
  // side, mm }], load, cap }. A motor only slips while its axis drives (holding torque is far more than running).
  function step(st, o) {
    const dt = o.dt || 0, out = { slips: [] };
    st.dist += Math.hypot(o.v.x, o.v.y, o.v.z) * dt;
    const lc = loads(st, Object.assign({ noise: noiseAt(st.seed, st.dist / C.NOISE_MM) }, o));
    out.load = lc.load; out.cap = lc.cap;
    if (!o.set.on) return out;
    for (const a of AXES) {
      const va = o.v[a];
      if (Math.abs(va) <= C.V_MIN) { st.cont[a].fill(0); continue; }
      const q = C.QUANTUM / fullPerMm(o.steps && o.steps[a]);
      for (let i = 0; i < SIDES[a]; i++) {
        const rho = lc.load[a][i] / Math.max(1e-9, lc.cap[a][i]);
        if (rho <= 1) { st.cont[a][i] = 0; continue; }
        st.cont[a][i] += Math.abs(va) * dt * Math.min(1, (rho - 1) * 3 + 0.25);
        while (st.cont[a][i] >= q) {
          st.cont[a][i] -= q;
          const mm = Math.sign(va) * q;
          st.lost[a][i] += mm; st.slips++;
          out.slips.push({ axis: a, side: i, mm });
        }
      }
    }
    return out;
  }
  // homed: each side pulled to its own switch, so the slips' rack is gone (the gantry stops fighting it)
  function homed(st, axes) {
    for (const a of AXES) if (!axes || axes.includes(a)) { st.lost[a].fill(0); st.cont[a].fill(0); }
  }
  const api = { C, DEFAULTS, settings, fullPerMm, capacity, engage, noiseAt, create, loads, step, homed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LostSteps = api;
})(typeof self !== "undefined" ? self : this);
