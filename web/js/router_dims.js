// lr4-sandbox: a router's dimensions for the on-model editor (Build your router's close-up, user 2026-10-29: "measurements
// and clickable areas right on the model" instead of number fields). In the model frame of router_body.js (mm, z up
// from the collet nut's bottom, +x = the switch / dial end).
//   dims(router, clampDef) -> [{ id, label, v, kind: "len" | "dia" | "rad" | "ch" | "ang", a, b: [x, y, z] (measured from a to b),
//     off: [x, y, z] (the dimension line's offset from a / b), views: ["front" | "right" | "top"] (where you stand at the machine), g: its part,
//     k: the builder input's data-k | null (shown only), f: drag factor (the value
//     changes f mm per mm b moves along a->b; 0 = no handle; an angle: its handle on b, turned round c) }]
//   router: a cleaned preset (LR4Routers.ROUTERS[id]); clampDef: the build's nut-below-the-clamp (rtClamps().def)
(function (root) {
  "use strict";
  const BODY = root.LR4RouterBody || (typeof require === "function" ? require("./router_body.js") : null);   // the dial's place
  const LABEL = { collet_nut: "Collet nut", shaft: "Exposed shaft", bearing_cap: "Bearing cap", housing: "Motor housing",
    collar: "Collar", transition: "Transition", motor_cap: "Motor cap", dial: "Speed dial", switch: "Switch", shaft_lock: "Shaft lock", brushes: "Brush caps", mount: "Mount" };

  // the turned part, nut up: [label, d, length, z0, key]; the transition's d = its top Ø (round) or the collar's (shaped
  // to the cap: no Ø of its own); a spindle's housing is its can
  function sections(m) {
    const n = m.collet_nut, S = m.shaft || { d: 0, exposed: 0 }, secs = [[LABEL.collet_nut, n.af, n.h, 0, "collet_nut"]];
    let z = n.h, d0 = 0;
    if (S.exposed > 0) { secs.push([LABEL.shaft, S.d, S.exposed, z, "shaft"]); z += S.exposed; }
    for (const k of ["bearing_cap", "housing", "collar"]) {
      const s = m[k];
      if (s && s.d > 0 && s.l > 0) { secs.push([m.kind === "spindle" && k === "housing" ? "Can" : LABEL[k], s.d, s.l, z, k]); z += s.l; d0 = s.d; }
    }
    const T = m.kind !== "spindle" && m.transition;
    if (T && T.l > 0) secs.push([LABEL.transition, T.shape === "cap" ? d0 : T.d, T.l, z, "transition"]);
    return secs;
  }

  function dims(r, clampDef) {
    const m = r && r.model, out = [];
    if (!m || !m.collet_nut) return out;
    const spin = m.kind === "spindle";
    let G = null;                                     // the part (regions()) the next ones belong to
    const add = (o) => out.push(Object.assign({ views: ["front"], f: 1, g: G }, o));
    const secs = sections(m), last = secs[secs.length - 1], top = last[3] + last[2], R = Math.max(...secs.map((s) => s[1] / 2));
    const h = spin ? null : m.motor_cap, at = (h && h.at) || [0, 0];
    for (const [l, d, len, z0, k] of secs) {
      const tr = k === "transition";
      G = k;
      const lk = { k: k === "collet_nut" ? "model.collet_nut.h" : k === "shaft" ? "model.shaft.exposed" : `model.${k}.l` };
      const dk = { k: k === "collet_nut" ? "model.collet_nut.af" : `model.${k}.d` };
      // lengths: one chain up the cord (-x) side
      add(Object.assign({ id: `len-${k}`, label: k === "collet_nut" ? "Collet nut height" : `${l} length`, v: len, kind: "len", a: [-R, 0, z0], b: [-R, 0, z0 + len], off: [-14, 0, 0] }, lk));
      // Ø across its middle (the transition's at its top), along x in the side view, y in the front view
      if (tr && m.transition.shape === "cap") continue;   // shaped to the cap: no Ø of its own
      const zm = tr ? z0 + len : z0 + len / 2, nm = k === "collet_nut" ? "Collet nut across flats" : tr ? "Transition top Ø" : `${l} Ø`;
      add(Object.assign({ id: `dia-${k}`, label: nm, v: d, kind: "dia", a: [-d / 2, -R - 2, zm], b: [d / 2, -R - 2, zm], off: [0, 0, 0], f: 2, views: ["front"] }, dk));
      add(Object.assign({ id: `diaf-${k}`, label: nm, v: d, kind: "dia", a: [R + 2, -d / 2, zm], b: [R + 2, d / 2, zm], off: [0, 0, 0], f: 2, views: ["right"] }, dk));
      if (k === "housing" && !spin) {                 // its collet-end chamfer: a leader to the corner (typed)
        const c = m.housing.ch || 0, g = m.housing.d / 2;
        add({ id: "housing-ch", label: "Motor housing chamfer", v: c, kind: "ch", a: [g - c / 2, -R - 2, z0 + c / 2], b: [g - c / 2, -R - 2, z0 + c / 2], off: [12, 0, -6], k: "model.housing.ch", f: 0 });
      }
    }
    if (m.transition && m.transition.l > 0 && !spin) {   // the transition's edge into the cap (fillet R / chamfer C)
      G = "transition";
      const T = m.transition, rt = T.shape === "cap" ? (h ? Math.min(h.L, h.W) / 2 - (h.bot_r ?? 2) : T.d / 2) : T.d / 2;
      const ev = BODY ? Math.min(T.e || 0, BODY.transitionEdgeMax(m)) : T.e;   // what's drawn (capped to what fits)
      if (T.edge !== "none") add({ id: "transition-e", label: T.edge === "fillet" ? "Transition fillet" : "Transition chamfer", v: ev, kind: T.edge === "fillet" ? "rad" : "ch",
        a: [rt, -R - 2, top - 1], b: [rt, -R - 2, top - 1], off: [12, 0, -4], k: "model.transition.e", f: 0 });
    }
    let z1 = top;
    G = "motor_cap";
    if (h) {
      const H = h.H, x0 = at[0] - h.L / 2, x1 = at[0] + h.L / 2, y0 = at[1] - h.W / 2, y1 = at[1] + h.W / 2;
      z1 = top + H;
      add({ id: "cap-L", label: "Motor cap length", v: h.L, kind: "len", a: [x0, 0, z1], b: [x1, 0, z1], off: [0, 0, 12], k: "model.motor_cap.L", f: 2 });
      add({ id: "cap-Lt", label: "Motor cap length", v: h.L, kind: "len", a: [x0, y0, z1], b: [x1, y0, z1], off: [0, -12, 0], k: "model.motor_cap.L", f: 2, views: ["top"] });
      add({ id: "cap-W", label: "Motor cap width", v: h.W, kind: "len", a: [at[0], y0, z1], b: [at[0], y1, z1], off: [0, 0, 12], k: "model.motor_cap.W", f: 2, views: ["right"] });
      add({ id: "cap-Wt", label: "Motor cap width", v: h.W, kind: "len", a: [x1, y0, z1], b: [x1, y1, z1], off: [12, 0, 0], k: "model.motor_cap.W", f: 2, views: ["top"] });
      add({ id: "cap-H", label: "Motor cap height", v: H, kind: "len", a: [x1, 0, top], b: [x1, 0, z1], off: [12, 0, 0], k: "model.motor_cap.H", views: ["front"] });
      add({ id: "cap-Hf", label: "Motor cap height", v: H, kind: "len", a: [0, y1, top], b: [0, y1, z1], off: [0, 12, 0], k: "model.motor_cap.H", views: ["right"] });
      // fillets: a leader to the corner (typed, no handle); 0.29 = 1 - cos 45 - a box's only (a drawn cap has none)
      if (!h.shape) {
        const e = Math.min(h.top_r ?? 6, H / 2), u = Math.min(h.bot_r ?? 2, H / 2 - e);
        const fit = (v) => Math.min(v ?? 10, h.W / 2, h.L / 2), rf = fit(h.front_r), rb = fit(h.back_r);
        add({ id: "r-top", label: "Top fillet", v: e, kind: "rad", a: [x1 - e * 0.29, 0, z1 - e * 0.29], b: [x1 - e * 0.29, 0, z1 - e * 0.29], off: [10, 0, 10], k: "model.motor_cap.top_r", f: 0 });
        add({ id: "r-bot", label: "Under fillet", v: u, kind: "rad", a: [x0 + u * 0.29, 0, top + u * 0.29], b: [x0 + u * 0.29, 0, top + u * 0.29], off: [-10, 0, -8], k: "model.motor_cap.bot_r", f: 0 });
        add({ id: "r-front", label: "Front fillet", v: rf, kind: "rad", a: [x1 - rf * 0.29, y1 - rf * 0.29, z1], b: [x1 - rf * 0.29, y1 - rf * 0.29, z1], off: [10, 10, 0], k: "model.motor_cap.front_r", f: 0, views: ["top"] });
        add({ id: "r-back", label: "Back fillet", v: rb, kind: "rad", a: [x0 + rb * 0.29, y1 - rb * 0.29, z1], b: [x0 + rb * 0.29, y1 - rb * 0.29, z1], off: [-10, 10, 0], k: "model.motor_cap.back_r", f: 0, views: ["top"] });
      }
      // the dial, where router_body.js puts it; its switch-end rim (on the end) / its top (on top) stays put as it
      // grows, so the handle is on the other side (f 1)
      const D = BODY && BODY.expand(m).dial;
      G = "dial";
      if (D && D.d > 0) {
        const [cx, cy, cz] = D.at, rd = D.d / 2, ht = D.t / 2, dk = { k: "model.dial.d" }, tk = { k: "model.dial.t", f: 2 };
        if (D.axis === "z") {                         // lying flat, its rim out of the switch end
          add(Object.assign({ id: "dial-d", label: "Dial Ø", v: D.d, kind: "dia", a: [cx + rd, cy, cz], b: [cx - rd, cy, cz], off: [0, 0, 0], views: ["top"] }, dk));
          add(Object.assign({ id: "dial-df", label: "Dial Ø", v: D.d, kind: "dia", a: [cx + rd, cy + rd, cz + ht], b: [cx + rd, cy - rd, cz + ht], off: [0, 0, 8], f: 2, views: ["right"] }, dk));
          add(Object.assign({ id: "dial-t", label: "Dial thickness", v: D.t, kind: "len", a: [cx + rd, cy - rd, cz - ht], b: [cx + rd, cy - rd, cz + ht], off: [0, -10, 0], views: ["right"] }, tk));
        } else if (D.axis === "x") {                  // standing on top, turned across the head: its rim up through the top
          add(Object.assign({ id: "dial-d", label: "Dial Ø", v: D.d, kind: "dia", a: [cx, cy, cz + rd], b: [cx, cy, cz - rd], off: [0, 0, 0], views: ["right"] }, dk));
          add(Object.assign({ id: "dial-t", label: "Dial thickness", v: D.t, kind: "len", a: [cx - ht, cy + rd, z1], b: [cx + ht, cy + rd, z1], off: [0, 8, 0], views: ["top"] }, tk));
        } else {                                      // standing on top in line with the head, its rim up through the top
          add(Object.assign({ id: "dial-d", label: "Dial Ø", v: D.d, kind: "dia", a: [cx, cy, cz + rd], b: [cx, cy, cz - rd], off: [0, 0, 0], views: ["front"] }, dk));
          add(Object.assign({ id: "dial-t", label: "Dial thickness", v: D.t, kind: "len", a: [cx + rd, cy - ht, z1], b: [cx + rd, cy + ht, z1], off: [8, 0, 0], views: ["top"] }, tk));
        }
      }
    }
    G = "switch";                                     // the switch: its center under the head's top, at the switch end
    const SW = h && BODY && BODY.expand(m).switch;
    if (SW) add({ id: "switch-down", label: "Switch below the top", v: z1 - SW.at[2], kind: "len", a: [SW.at[0], SW.at[1], z1], b: [SW.at[0], SW.at[1], SW.at[2]],
      off: [10, 0, 0], k: "model.switch.down", views: ["front", "right"] });
    G = spin ? "housing" : "motor_cap";
    const xo = h ? at[0] + h.L / 2 : R;
    if (spin) add({ id: "overall", label: "Overall height", v: top, kind: "len", a: [R, 0, 0], b: [R, 0, top], off: [16, 0, 0], k: null, f: 0 });
    else add({ id: "overall", label: "Overall height", v: z1, kind: "len", a: [xo, 0, 0], b: [xo, 0, z1], off: [30, 0, 0], k: "model.overall" });
    // where it's clamped: the nut's bottom up to the lower clamp's bottom (no mount: nothing to clamp)
    G = "mount";
    if (r.mount !== "none" && clampDef != null) {
      const c = m.clamp ?? clampDef;
      add({ id: "clamp", label: "Nut below the clamp", v: c, kind: "len", a: [-R, 0, 0], b: [-R, 0, c], off: [-34, 0, 0], k: "model.clamp" });
    }
    // the brush caps: the first one's height + Ø (front / right views)
    const Bc = m.brushes;
    G = "brushes";
    if (Bc) {
      const tip = [0, Bc.r + Bc.out, Bc.z];             // the +y one (they're either side)
      add({ id: "brush-z", label: "Brush cap height", v: Bc.z, kind: "len", a: [tip[0], tip[1], 0], b: tip, off: [12, 0, 0], k: "model.brushes.z", views: ["front", "right"] });
      add({ id: "brush-d", label: "Brush cap Ø", v: Bc.d, kind: "dia", a: [tip[0], tip[1], Bc.z - Bc.d / 2], b: [tip[0], tip[1], Bc.z + Bc.d / 2], off: [4, 0, 0], k: "model.brushes.d", f: 2, views: ["front", "right"] });
    }
    // the shaft lock button: a peg from the axis at height z, a deg round from +x (counter-clockwise from above), Ø d,
    // reaching r out from the center
    const L = m.shaft_lock;
    G = "shaft_lock";
    if (L && L.r > 0) {
      const c = Math.cos((L.a * Math.PI) / 180), s = Math.sin((L.a * Math.PI) / 180), tip = [L.r * c, L.r * s, L.z], n = [-s, c, 0];
      const sx = c >= 0 ? 1 : -1;                     // its height line on the side it sticks out
      add({ id: "lock-z", label: "Shaft lock height", v: L.z, kind: "len", a: [tip[0], tip[1], 0], b: tip, off: [sx * 12, 0, 0], k: "model.shaft_lock.z" });
      if (L.d > 0) add({ id: "lock-d", label: "Shaft lock Ø", v: L.d, kind: "dia", a: [tip[0], tip[1], L.z - L.d / 2], b: [tip[0], tip[1], L.z + L.d / 2], off: [sx * 4, 0, 0], k: "model.shaft_lock.d", f: 2 });
      add({ id: "lock-r", label: "Shaft lock reach", v: L.r, kind: "len", a: [0, 0, L.z], b: tip, off: [0, 0, 0], k: "model.shaft_lock.r", views: ["top"] });
      if (L.d > 0) add({ id: "lock-dt", label: "Shaft lock Ø", v: L.d, kind: "dia", a: [tip[0] - n[0] * L.d / 2, tip[1] - n[1] * L.d / 2, L.z], b: [tip[0] + n[0] * L.d / 2, tip[1] + n[1] * L.d / 2, L.z], off: [c * 6, s * 6, 0], k: "model.shaft_lock.d", f: 2, views: ["top"] });
      add({ id: "lock-a", label: "Shaft lock angle", v: L.a, kind: "ang", a: tip, b: tip, off: [c * 14, s * 14, 0], k: "model.shaft_lock.a", f: 1, c: [0, 0, L.z], views: ["top"] });   // c: dragged round it
    }
    for (const d of out) d.v = +(+d.v).toFixed(1);
    return out;
  }

  // the parts you can pick (the close-up: click one, its numbers + sliders): [{ id, label, shape }] - shape: the
  // highlight, { cyl: { c, axis, d, l } } (centered at c along axis) or { box: [x0, x1, y0, y1, z0, z1] } or null
  function regions(r) {
    const m = r && r.model, out = [];
    if (!m || !m.collet_nut) return out;
    const secs = sections(m), last = secs[secs.length - 1], top = last[3] + last[2];
    const h = m.kind !== "spindle" ? m.motor_cap : null;
    for (const [l, d, len, z0, k] of secs) {
      if (k === "transition" && m.transition.shape === "cap" && h) {
        const at = h.at || [0, 0];
        out.push({ id: k, label: l, shape: { box: [at[0] - h.L / 2, at[0] + h.L / 2, at[1] - h.W / 2, at[1] + h.W / 2, z0, z0 + len] } });
      } else out.push({ id: k, label: l, shape: { cyl: { c: [0, 0, z0 + len / 2], axis: [0, 0, 1], d: k === "transition" ? Math.max(d, secs[secs.length - 2][1]) : d, l: Math.max(len, 1) } } });
    }
    if (h) {
      const at = h.at || [0, 0];
      out.push({ id: "motor_cap", label: LABEL.motor_cap, shape: { box: [at[0] - h.L / 2, at[0] + h.L / 2, at[1] - h.W / 2, at[1] + h.W / 2, top, top + h.H] } });
      const D = BODY && BODY.expand(m).dial;
      if (D && D.d > 0) out.push({ id: "dial", label: LABEL.dial, shape: { cyl: { c: D.at, axis: D.axis === "z" ? [0, 0, 1] : D.axis === "x" ? [1, 0, 0] : [0, 1, 0], d: D.d, l: D.t } } });
      const SW = BODY && BODY.expand(m).switch;
      if (SW) { const [x, y, z] = SW.at, [a, b, c] = SW.size; out.push({ id: "switch", label: LABEL.switch, shape: { box: [x - a / 2 - 1, x + a / 2 + 2, y - b / 2, y + b / 2, z - c / 2, z + c / 2] } }); }
    }
    const L = m.shaft_lock;
    if (L && L.r > 0) {
      const c = Math.cos((L.a * Math.PI) / 180), s = Math.sin((L.a * Math.PI) / 180);
      out.push({ id: "shaft_lock", label: LABEL.shaft_lock, shape: { cyl: { c: [(L.r / 2) * c, (L.r / 2) * s, L.z], axis: [c, s, 0], d: L.d, l: L.r } } });
    }
    const Bc = m.brushes;
    if (Bc) {
      out.push({ id: "brushes", label: LABEL.brushes, shape: { cyl: { c: [0, Bc.r + Bc.out / 2, Bc.z], axis: [0, 1, 0], d: Bc.d + 2 * (Bc.ring || 0), l: Bc.out } } });
    }
    if (r.mount !== "none") out.push({ id: "mount", label: LABEL.mount, shape: null });
    return out;
  }
  // a click on the router: the mesh's part (userData.rtPart: router_body.js PARTS) + the point in the model frame -> a
  // region id (or null); part null = a mount / shoe mesh by name
  function pick(r, part, p, name) {
    const m = r && r.model;
    if (!m || !m.collet_nut) return null;
    if (!part) return /^(Tool_Mount_|Dust_Shoe)/.test(name || "") && r.mount !== "none" ? "mount" : null;
    const spin = m.kind === "spindle";
    if (part === "shaft_lock" || part === "lock_boss") return "shaft_lock";
    if (part === "brush_cap" || part === "brush_ring") return "brushes";
    if (part === "dial") return "dial";
    if (part === "collet_nut" || part === "collet" || part === "thread") return "collet_nut";
    if (part === "switch" || part === "switch_off") return spin ? "housing" : "switch";
    if (/^(motor_cap|strain_relief|cord|trim)$/.test(part)) return spin ? "housing" : "motor_cap";
    const secs = sections(m), hit = secs.filter(([, , len, z0]) => len > 0 && p[2] >= z0 - 0.01 && p[2] <= z0 + len + 0.01);
    return hit.length ? hit[hit.length - 1][4] : part;
  }

  const api = { LABEL, sections, dims, regions, pick };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4RouterDims = api;
})(typeof self !== "undefined" ? self : this);
