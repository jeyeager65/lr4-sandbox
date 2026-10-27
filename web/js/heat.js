// Heat (Part 44b, user 2026-10-26): a router bit makes heat where it rubs instead of cutting - dwelling on one spot,
// a feed too slow for the rpm (chipload = feed / (rpm x flutes) under ~0.025 mm), a plunge held at depth. Chips carry
// the heat away when it cuts properly; rubbing heats the bit, and the stock where the hot bit sits follows it. Moving on
// cools a spot. A hot spot smokes, then scorches, then (Fire on) catches. Constants ILLUSTRATIVE (said so on the page):
// tuned so a dwell with the router on smokes in ~5 s, scorches in ~9 s and catches in ~15 s, a proper cut stays cool.
// State per stock: the bit's temperature, a sparse grid of hot cells (CELL mm) in work mm, the fires.
// Plain JS: tests/test_heat.js.
(function (root) {
  "use strict";
  const C = {
    T_AIR: 20,          // °C
    Q_RUB: 40,          // °C/s the bit heats rubbing fully at 18000 rpm, in the stock
    RPM_REF: 18000,
    TAU_BIT: 15,        // s: the bit cooling in air
    TAU_CHIPS: 3,       // s: chips carrying the heat off while it cuts properly
    TAU_CONTACT: 0.7,   // s: the stock under the bit taking the bit's heat
    TAU_CELL: 6,        // s: a spot cooling once the bit has gone
    H_GOOD: 0.025,      // mm / tooth: thinner chips than this rub
    Q_SHANK: 120,       // °C/s more per mm of shank buried in the wood (Part 44c: past the flutes, the spinning shank
                        // rubs the wood it's jammed against - friction, it burns fast; capped at 2 mm; illustrative)
    SMOKE: 180, SCORCH: 260, IGNITE: 380,   // °C (wood chars ~250-300, MDF / pine ignite ~300-400)
    BURN: 450,          // °C a burning spot holds until it's put out
    CELL: 3,            // mm
    GROW: 4,            // s: a fire growing to size 1 (it keeps growing to SIZE_MAX)
    SIZE_MAX: 2.5,
    R0: 4, R_GROW: 3, R_MAX: 30,   // mm: a fire's radius on the stock, growing R_GROW mm/s (the spots in it burn, scorch)
    FIRE_MM: 15,        // one fire per spot: a new one only this far outside a burning one's radius
  };
  const DEFAULTS = { on: false, fire: false, auto: true };
  function settings(saved) {
    const s = Object.assign({}, DEFAULTS);
    if (saved && typeof saved === "object") for (const k of Object.keys(DEFAULTS)) if (saved[k] !== undefined) s[k] = !!saved[k];
    return s;
  }
  const key = (i, j) => `${i},${j}`;
  function create() {
    return { bit: C.T_AIR, cells: new Map(), fires: [], seen: { smoke: false, scorch: false, ignite: false }, ramp: null, t: 0 };
  }
  // the chipload (mm / tooth) and how much the bit rubs (0 cutting properly .. 1 dwelling), router on
  function rubbing(o) {
    const fl = Math.max(1, o.flutes || 2), tps = Math.max(0, o.rpm || 0) / 60 * fl;
    if (!(tps > 0)) return { chip: Infinity, rub: 0 };
    const chip = Math.max(o.vh || 0, Math.abs(o.vz || 0)) / tps;
    return { chip, rub: Math.min(1, Math.max(0, 1 - chip / C.H_GOOD)) };
  }
  // one moment (dt s): o = { dt, p (work mm: the tip), r (bit radius), rpm, flutes, vh, vz (mm/s), eng ({ d, c }:
  // lost_steps.js engage), top (x, y) -> the stock's top there (null = off it), fire (it can catch) }
  // (eng.o: how deep it is just outside the bit - in its own hole d and c read 0)
  // -> { events: ["smoke" | "scorch" | "ignite" | "would-ignite" at most once each per state], hot (the hottest cell) }
  function step(st, o) {
    const dt = o.dt || 0, out = { events: [] };
    st.t += dt;
    const eng = o.eng || { d: 0, c: 0 }, deep = Math.max(eng.d, eng.c, eng.o || 0), contact = deep > 0, rb = rubbing(o);
    const depthK = contact ? 0.5 + 0.5 * Math.min(1, deep / 3) : 0;
    const spin = Math.max(0, o.rpm || 0) / C.RPM_REF;
    const q = contact ? C.Q_RUB * spin * rb.rub * depthK + C.Q_SHANK * spin * Math.min(2, eng.s || 0) : 0;
    const chips = contact && o.rpm > 0 ? (1 - rb.rub) / C.TAU_CHIPS : 0;
    st.bit += (q - (st.bit - C.T_AIR) * (1 / C.TAU_BIT + chips)) * dt;
    // the cells under the bit's tip take its heat (while it's in the stock)
    if (contact) {
      const r = Math.max(o.r || 1.5, C.CELL / 2), i0 = Math.floor((o.p.x - r) / C.CELL), i1 = Math.floor((o.p.x + r) / C.CELL);
      const j0 = Math.floor((o.p.y - r) / C.CELL), j1 = Math.floor((o.p.y + r) / C.CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const x = (i + 0.5) * C.CELL, y = (j + 0.5) * C.CELL;
        if (Math.hypot(x - o.p.x, y - o.p.y) > r + C.CELL / 2 || (o.top && o.top(x, y) === null)) continue;
        let c = st.cells.get(key(i, j));
        if (!c) { c = { i, j, x, y, T: C.T_AIR, scorch: 0, z: o.p.z }; st.cells.set(key(i, j), c); }
        c.z = o.p.z; c.at = st.t;                    // touched now: kept (below)
        if (st.bit > c.T) c.T += (st.bit - c.T) * Math.min(1, dt / C.TAU_CONTACT);
      }
    }
    // a scripted ramp (a video's (Video Fire:)): the spot under the bit to IGNITE over its time
    if (st.ramp) {
      const R = st.ramp, c = cellAt(st, R.x, R.y, R.z);
      R.left -= dt;
      const want = R.left <= 0 ? C.IGNITE + 1 : C.T_AIR + (C.IGNITE + 1 - C.T_AIR) * (1 - R.left / R.time);
      c.T = Math.max(c.T, want);
      if (R.left <= 0) st.ramp = null;
    }
    let hot = null;
    for (const [k, c] of st.cells) {
      // one fire per spot: cells within FIRE_MM of a burning one burn with it
      const fire = st.fires.find((f) => !f.out && Math.hypot(f.x - c.x, f.y - c.y) <= (f.r || C.R0) + C.FIRE_MM);
      if (c.T >= C.IGNITE && !fire) {                // (before cooling: a ramp's last step lands just on IGNITE)
        if (o.fire) { st.fires.push({ x: c.x, y: c.y, z: c.z, t: 0, r: C.R0, out: false }); if (!st.seen.ignite) out.events.push("ignite"); st.seen.ignite = true; }
        else if (!st.seen.ignite) { st.seen.ignite = true; out.events.push("would-ignite"); }
      }
      if (fire && Math.hypot(fire.x - c.x, fire.y - c.y) <= Math.max(C.CELL * 1.5, fire.r)) c.T = Math.max(c.T, C.BURN);
      else c.T -= (c.T - C.T_AIR) * Math.min(1, dt / C.TAU_CELL);
      if (c.T > C.SCORCH) c.scorch = Math.min(1, c.scorch + (c.T - C.SCORCH) / 150 * dt);
      // gone once cool - not one the bit touches now: a new cell warms only (bit - T) x dt / TAU_CONTACT a sample, under
      // the 2 degrees with short samples (2026-10-27: a recording's slow machine time never kept one - no fire)
      if (c.T < C.T_AIR + 2 && c.scorch === 0 && c.at !== st.t) { st.cells.delete(k); continue; }
      if (!hot || c.T > hot.T) hot = c;
    }
    for (const f of st.fires) {                      // burning: it spreads over the stock (new cells in its radius)
      if (f.out) continue;
      f.t += dt; f.r = Math.min(C.R_MAX, (f.r || C.R0) + C.R_GROW * dt);
      for (let i = Math.floor((f.x - f.r) / C.CELL); i <= Math.floor((f.x + f.r) / C.CELL); i++)
        for (let j = Math.floor((f.y - f.r) / C.CELL); j <= Math.floor((f.y + f.r) / C.CELL); j++) {
          const x = (i + 0.5) * C.CELL, y = (j + 0.5) * C.CELL;
          if (Math.hypot(x - f.x, y - f.y) <= f.r && !st.cells.has(key(i, j)) && !(o.top && o.top(x, y) === null)) cellAt(st, x, y, f.z).T = C.BURN;
        }
    }
    if (hot && hot.T >= C.SMOKE && !st.seen.smoke) { st.seen.smoke = true; out.events.push("smoke"); }
    if (hot && hot.scorch > 0 && !st.seen.scorch) { st.seen.scorch = true; out.events.push("scorch"); }
    if (!hot || hot.T < C.SMOKE - 40) st.seen.smoke = st.seen.ignite = false;   // cooled off: warn again next time
    out.hot = hot;
    return out;
  }
  function cellAt(st, x, y, z) {
    const i = Math.floor(x / C.CELL), j = Math.floor(y / C.CELL), k = key(i, j);
    let c = st.cells.get(k);
    if (!c) { c = { i, j, x: (i + 0.5) * C.CELL, y: (j + 0.5) * C.CELL, T: C.T_AIR, scorch: 0, z }; st.cells.set(k, c); }
    return c;
  }
  // a video's fire: the spot (work mm) heats to catching over time s
  function ramp(st, x, y, z, time) { st.ramp = { x, y, z, time: Math.max(0.01, time), left: Math.max(0.01, time) }; }
  // the powder: fires out, the spots round them (within mm) and the bit cooled
  function extinguish(st, mm = 80) {
    for (const f of st.fires) {
      if (f.out) continue;
      f.out = true;
      for (const c of st.cells.values()) if (Math.hypot(c.x - f.x, c.y - f.y) <= mm) c.T = Math.min(c.T, C.T_AIR + 30);
    }
    st.bit = Math.min(st.bit, C.T_AIR + 40);
    st.ramp = null;
  }
  // smoke 0..1 of a cell (none under SMOKE, full at IGNITE); a fire's size 0..1 as it grows
  const smokeOf = (c) => Math.min(1, Math.max(0, (c.T - C.SMOKE) / (C.IGNITE - C.SMOKE)));
  const fireSize = (f) => (f.out ? 0 : Math.min(C.SIZE_MAX, 0.2 + f.t / C.GROW));
  const burning = (st) => st.fires.filter((f) => !f.out);
  const api = { C, DEFAULTS, settings, create, rubbing, step, ramp, extinguish, smokeOf, fireSize, burning, cellAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Heat = api;
})(typeof self !== "undefined" ? self : this);
