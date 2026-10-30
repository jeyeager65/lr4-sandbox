// lr4-sandbox: a router's dimensions for the on-model editor (Build your router's close-up, user 2026-10-29: "measurements
// and clickable areas right on the model" instead of number fields). In the body frame of router_body.js (mm, z up
// from the collet nut's bottom, +x = the switch / dial end).
//   dims(router, clampDef) -> [{ id, label, v, kind: "len" | "dia" | "rad" | "ch" | "ang", a, b: [x, y, z] (measured from a to b),
//     off: [x, y, z] (the dimension line's offset from a / b), views: ["side" | "front" | "top"],
//     k: the builder input's data-k | null (shown only), f: drag factor (the value
//     changes f mm per mm b moves along a->b; 0 = no handle; an angle: its handle on b, turned round c) }]
//   router: a cleaned preset (LR4Routers.ROUTERS[id]); clampDef: the build's nut-below-the-clamp (rtClamps().def)
(function (root) {
  "use strict";
  const BODY = root.LR4RouterBody || (typeof require === "function" ? require("./router_body.js") : null);   // the dial's place
  const STACK = [["spindle", "Spindle"], ["nose", "Nose"], ["grip", "Grip"], ["cast", "Collar"]];

  // the turned part, nut up: [label, d, length, z0, key]; the transition's d = its top Ø (round) or the collar's (shaped
  // to the head: no Ø of its own)
  function sections(b) {
    const secs = [["Nut", b.nut[0], b.nut[1], 0, "nut"]], spin = b.kind === "spindle";
    let z = b.nut[1], d0 = 0;
    for (const [k, l] of spin ? [["nose", "Nose"], ["can", "Can"]] : STACK) {
      const [d, len] = b[k] || [0, 0];
      if (d > 0 && len > 0) { secs.push([l, d, len, z, k]); z += len; d0 = d; }
    }
    const T = !spin && b.trans;
    if (T && T.l > 0) secs.push(["Transition", T.shape === "head" ? d0 : T.d, T.l, z, "trans"]);
    return secs;
  }
  const secId = (k) => k;                             // a region's id

  function dims(r, clampDef) {
    const b = r && r.body, out = [];
    if (!b || !b.nut) return out;
    const spin = b.kind === "spindle";
    let G = null;                                     // the region (regions()) the next ones belong to
    const add = (o) => out.push(Object.assign({ views: ["side"], f: 1, g: G }, o));
    const secs = sections(b), last = secs[secs.length - 1], top = last[3] + last[2], R = Math.max(...secs.map((s) => s[1] / 2));
    const h = !spin && b.head && !b.slabs ? b.head : null;
    const at = (h && h.at) || [0, 0];
    for (const [l, d, len, z0, k] of secs) {
      const tr = k === "trans";
      G = secId(k);
      const lk = { k: tr ? "body.trans.l" : `body.${k}.1` }, dk = { k: tr ? "body.trans.d" : `body.${k}.0` };
      // lengths: one chain up the cord (-x) side
      add(Object.assign({ id: `len-${k}`, label: `${l} length`, v: len, kind: "len", a: [-R, 0, z0], b: [-R, 0, z0 + len], off: [-14, 0, 0] }, lk));
      // Ø across its middle (the transition's at its top), along x in the side view, y in the front view
      if (tr && b.trans.shape === "head") continue;   // shaped to the head: no Ø of its own
      const zm = tr ? z0 + len : z0 + len / 2, nm = k === "nut" ? `${l} across flats` : tr ? "Transition top Ø" : `${l} Ø`;
      add(Object.assign({ id: `dia-${k}`, label: nm, v: d, kind: "dia", a: [-d / 2, -R - 2, zm], b: [d / 2, -R - 2, zm], off: [0, 0, 0], f: 2, views: ["side"] }, dk));
      add(Object.assign({ id: `diaf-${k}`, label: nm, v: d, kind: "dia", a: [R + 2, -d / 2, zm], b: [R + 2, d / 2, zm], off: [0, 0, 0], f: 2, views: ["front"] }, dk));
      if (k === "grip") {                             // its collet-end chamfer: a leader to the corner (typed)
        const c = b.grip_ch || 0, g = b.grip[0] / 2;
        add({ id: "grip-ch", label: "Grip chamfer", v: c, kind: "ch", a: [g - c / 2, -R - 2, z0 + c / 2], b: [g - c / 2, -R - 2, z0 + c / 2], off: [12, 0, -6], k: "body.grip_ch", f: 0 });
      }
    }
    if (b.trans && b.trans.l > 0 && !spin) {          // the transition's edge into the head (fillet R / chamfer C)
      G = "trans";
      const T = b.trans, rt = (T.shape === "head" ? (h ? Math.min(h.L, h.W) / 2 - (h.bot_r ?? 2) : T.d / 2) : T.d / 2);
      const ev = BODY ? Math.min(T.e || 0, BODY.transEdgeMax(BODY.expand(b))) : T.e;   // what's drawn (capped to what fits)
      if (T.edge !== "none") add({ id: "trans-e", label: T.edge === "fillet" ? "Transition fillet" : "Transition chamfer", v: ev, kind: T.edge === "fillet" ? "rad" : "ch",
        a: [rt, -R - 2, top - 1], b: [rt, -R - 2, top - 1], off: [12, 0, -4], k: "body.trans.e", f: 0 });
    }
    let z1 = top;
    G = "head";
    if (h) {
      const H = h.H || b.overall - top, x0 = at[0] - h.L / 2, x1 = at[0] + h.L / 2, y0 = at[1] - h.W / 2, y1 = at[1] + h.W / 2;
      z1 = top + H;
      add({ id: "head-L", label: "Head length", v: h.L, kind: "len", a: [x0, 0, z1], b: [x1, 0, z1], off: [0, 0, 12], k: "body.head.L", f: 2 });
      add({ id: "head-Lt", label: "Head length", v: h.L, kind: "len", a: [x0, y0, z1], b: [x1, y0, z1], off: [0, -12, 0], k: "body.head.L", f: 2, views: ["top"] });
      add({ id: "head-W", label: "Head width", v: h.W, kind: "len", a: [at[0], y0, z1], b: [at[0], y1, z1], off: [0, 0, 12], k: "body.head.W", f: 2, views: ["front"] });
      add({ id: "head-Wt", label: "Head width", v: h.W, kind: "len", a: [x1, y0, z1], b: [x1, y1, z1], off: [12, 0, 0], k: "body.head.W", f: 2, views: ["top"] });
      add({ id: "head-H", label: "Head height", v: H, kind: "len", a: [x1, 0, top], b: [x1, 0, z1], off: [12, 0, 0], k: "body.head.H", views: ["side"] });
      add({ id: "head-Hf", label: "Head height", v: H, kind: "len", a: [0, y1, top], b: [0, y1, z1], off: [0, 12, 0], k: "body.head.H", views: ["front"] });
      // fillets: a leader to the corner (typed, no handle); 0.29 = 1 - cos 45
      const e = Math.min(h.top_r ?? 6, H / 2), u = Math.min(h.bot_r ?? 2, H / 2 - e);
      const fit = (v) => Math.min(v ?? 10, h.W / 2, h.L / 2), rf = fit(h.front_r), rb = fit(h.back_r);
      add({ id: "r-top", label: "Top fillet", v: e, kind: "rad", a: [x1 - e * 0.29, 0, z1 - e * 0.29], b: [x1 - e * 0.29, 0, z1 - e * 0.29], off: [10, 0, 10], k: "body.head.top_r", f: 0 });
      add({ id: "r-bot", label: "Under fillet", v: u, kind: "rad", a: [x0 + u * 0.29, 0, top + u * 0.29], b: [x0 + u * 0.29, 0, top + u * 0.29], off: [-10, 0, -8], k: "body.head.bot_r", f: 0 });
      add({ id: "r-front", label: "Front fillet", v: rf, kind: "rad", a: [x1 - rf * 0.29, y1 - rf * 0.29, z1], b: [x1 - rf * 0.29, y1 - rf * 0.29, z1], off: [10, 10, 0], k: "body.head.front_r", f: 0, views: ["top"] });
      add({ id: "r-back", label: "Back fillet", v: rb, kind: "rad", a: [x0 + rb * 0.29, y1 - rb * 0.29, z1], b: [x0 + rb * 0.29, y1 - rb * 0.29, z1], off: [-10, 10, 0], k: "body.head.back_r", f: 0, views: ["top"] });
      // the dial, where router_body.js puts it; its switch-end rim (on the end) / its top (on top) stays put as it
      // grows, so the handle is on the other side (f 1)
      const D = BODY && BODY.expand(b).dial;
      G = "dial";
      if (D && D.d > 0) {
        const [cx, cy, cz] = D.at, rd = D.d / 2, ht = D.t / 2, dk = { k: "body.head.dial.d" }, tk = { k: "body.head.dial.t", f: 2 };
        if (D.axis === "z") {                         // lying flat, its rim out of the switch end
          add(Object.assign({ id: "dial-d", label: "Dial Ø", v: D.d, kind: "dia", a: [cx + rd, cy, cz], b: [cx - rd, cy, cz], off: [0, 0, 0], views: ["top"] }, dk));
          add(Object.assign({ id: "dial-df", label: "Dial Ø", v: D.d, kind: "dia", a: [cx + rd, cy + rd, cz + ht], b: [cx + rd, cy - rd, cz + ht], off: [0, 0, 8], f: 2, views: ["front"] }, dk));
          add(Object.assign({ id: "dial-t", label: "Dial thickness", v: D.t, kind: "len", a: [cx + rd, cy - rd, cz - ht], b: [cx + rd, cy - rd, cz + ht], off: [0, -10, 0], views: ["front"] }, tk));
        } else {                                      // standing across the head, its rim up through the top
          add(Object.assign({ id: "dial-d", label: "Dial Ø", v: D.d, kind: "dia", a: [cx, cy, cz + rd], b: [cx, cy, cz - rd], off: [0, 0, 0], views: ["side"] }, dk));
          add(Object.assign({ id: "dial-t", label: "Dial thickness", v: D.t, kind: "len", a: [cx + rd, cy - ht, z1], b: [cx + rd, cy + ht, z1], off: [8, 0, 0], views: ["top"] }, tk));
        }
      }
      G = "head";
    } else if (!spin && b.overall) z1 = b.overall;   // a photo-modelled head: its overall only
    if (spin) G = "can";
    const xo = h ? at[0] + h.L / 2 : R;
    if (spin) add({ id: "overall", label: "Overall height", v: top, kind: "len", a: [R, 0, 0], b: [R, 0, top], off: [16, 0, 0], k: null, f: 0 });
    else add({ id: "overall", label: "Overall height", v: z1, kind: "len", a: [xo, 0, 0], b: [xo, 0, z1], off: [30, 0, 0], k: "body.overall" });
    // where it's clamped: the nut's bottom up to the lower clamp's bottom (no mount: nothing to clamp)
    G = "mount";
    if (r.mount !== "none" && clampDef != null) {
      const c = b.clamp ?? clampDef;
      add({ id: "clamp", label: "Nut below the clamp", v: c, kind: "len", a: [-R, 0, 0], b: [-R, 0, c], off: [-34, 0, 0], k: "body.clamp" });
    }
    // the spindle lock button: a peg from the axis at height z, a deg round from +x (counter-clockwise from above), Ø d,
    // reaching r out from the center
    const L = b.lock;
    G = "lock";
    if (L && L.r > 0) {
      const c = Math.cos((L.a * Math.PI) / 180), s = Math.sin((L.a * Math.PI) / 180), tip = [L.r * c, L.r * s, L.z], n = [-s, c, 0];
      const sx = c >= 0 ? 1 : -1;                     // its height line on the side it sticks out
      add({ id: "lock-z", label: "Lock height", v: L.z, kind: "len", a: [tip[0], tip[1], 0], b: tip, off: [sx * 12, 0, 0], k: "body.lock.z" });
      add({ id: "lock-d", label: "Lock Ø", v: L.d, kind: "dia", a: [tip[0], tip[1], L.z - L.d / 2], b: [tip[0], tip[1], L.z + L.d / 2], off: [sx * 4, 0, 0], k: "body.lock.d", f: 2 });
      add({ id: "lock-r", label: "Lock reach", v: L.r, kind: "len", a: [0, 0, L.z], b: tip, off: [0, 0, 0], k: "body.lock.r", views: ["top"] });
      add({ id: "lock-dt", label: "Lock Ø", v: L.d, kind: "dia", a: [tip[0] - n[0] * L.d / 2, tip[1] - n[1] * L.d / 2, L.z], b: [tip[0] + n[0] * L.d / 2, tip[1] + n[1] * L.d / 2, L.z], off: [c * 6, s * 6, 0], k: "body.lock.d", f: 2, views: ["top"] });
      add({ id: "lock-a", label: "Lock angle", v: L.a, kind: "ang", a: tip, b: tip, off: [c * 14, s * 14, 0], k: "body.lock.a", f: 1, c: [0, 0, L.z], views: ["top"] });   // c: dragged round it
    }
    for (const d of out) d.v = +(+d.v).toFixed(1);
    return out;
  }

  // the parts you can pick (the close-up: click one, its numbers + sliders): [{ id, label, shape }] - shape: the
  // highlight, { cyl: { c, axis, d, l } } (centered at c along axis) or { box: [x0, x1, y0, y1, z0, z1] } or null
  function regions(r) {
    const b = r && r.body, out = [];
    if (!b || !b.nut) return out;
    const secs = sections(b), last = secs[secs.length - 1], top = last[3] + last[2];
    const h = b.kind !== "spindle" && b.head && !b.slabs ? b.head : null;
    for (const [l, d, len, z0, k] of secs) {
      if (k === "trans" && b.trans.shape === "head" && h) {
        const at = h.at || [0, 0];
        out.push({ id: "trans", label: l, shape: { box: [at[0] - h.L / 2, at[0] + h.L / 2, at[1] - h.W / 2, at[1] + h.W / 2, z0, z0 + len] } });
      } else out.push({ id: secId(k), label: l, shape: { cyl: { c: [0, 0, z0 + len / 2], axis: [0, 0, 1], d: k === "trans" ? Math.max(d, secs[secs.length - 2][1]) : d, l: Math.max(len, 1) } } });
    }
    if (h) {
      const at = h.at || [0, 0], H = h.H || b.overall - top;
      out.push({ id: "head", label: "Head", shape: { box: [at[0] - h.L / 2, at[0] + h.L / 2, at[1] - h.W / 2, at[1] + h.W / 2, top, top + H] } });
      const D = BODY && BODY.expand(b).dial;
      if (D && D.d > 0) out.push({ id: "dial", label: "Dial", shape: { cyl: { c: D.at, axis: D.axis === "z" ? [0, 0, 1] : [0, 1, 0], d: D.d, l: D.t } } });
    } else if (b.kind !== "spindle") out.push({ id: "head", label: "Head", shape: null });   // photo-modelled: its overall
    const L = b.lock;
    if (L && L.r > 0) {
      const c = Math.cos((L.a * Math.PI) / 180), s = Math.sin((L.a * Math.PI) / 180);
      out.push({ id: "lock", label: "Spindle lock", shape: { cyl: { c: [(L.r / 2) * c, (L.r / 2) * s, L.z], axis: [c, s, 0], d: L.d, l: L.r } } });
    }
    if (r.mount !== "none") out.push({ id: "mount", label: "Mount", shape: null });
    return out;
  }
  // a click on the router: the mesh's name + the point in the body frame -> a region id (or null)
  function pick(r, name, p) {
    const b = r && r.body;
    if (!b || !b.nut || !name) return null;
    if (/^(Tool_Mount_|Dust_Shoe)/.test(name)) return r.mount !== "none" ? "mount" : null;
    if (!/^Router_/.test(name) || name === "Router_Bit" || name === "Router_Cord_Run") return null;
    const L = b.lock;
    if (L && L.r > 0 && Math.abs(p[2] - L.z) < L.d / 2 + 1.5) {   // on the lock's peg / button: off the round body
      const c = Math.cos((L.a * Math.PI) / 180), s = Math.sin((L.a * Math.PI) / 180), t = p[0] * c + p[1] * s;
      if (t > 0 && Math.hypot(p[0] - t * c, p[1] - t * s) < L.d / 2 + 1.5 && t > 1) {
        const at = sections(b).find(([, , len, z0]) => p[2] >= z0 && p[2] <= z0 + len);
        if (!at || t > at[1] / 2 + 0.5) return "lock";
      }
    }
    if (name === "Router_Dial") return "dial";
    if (name === "Router_Nut") return "nut";
    if (/^Router_(Head|Switch|Cord)$/.test(name)) return b.kind === "spindle" ? "can" : "head";
    const secs = sections(b), last = secs[secs.length - 1];
    if (p[2] > last[3] + last[2]) return b.kind === "spindle" ? "can" : "head";
    const hit = secs.filter(([, , len, z0]) => len > 0 && p[2] >= z0 - 0.01 && p[2] <= z0 + len + 0.01);
    return hit.length ? secId(hit[hit.length - 1][4]) : secId(secs[0][4]);
  }

  const api = { dims, regions, pick };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LR4RouterDims = api;
})(typeof self !== "undefined" ? self : this);
