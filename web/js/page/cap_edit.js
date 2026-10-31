// The motor cap's shape editor (Part 46b, user 2026-10-30): the motor cap's Edit shape in the router editor's inspector
// (docked on the right in its place; ✕ shuts it). Three views (Top, Front, Cross-section: js/cap_shape.js has the data), each its points in a table too (the same
// data): drag a point, click the outline to add one, Delete removes the picked one; each point's span to the next
// straight / arc / curve, a corner radius between two straight spans, a curve's handle dragged (Auto puts it back).
// A photo under a view to trace: Photo, Set scale (click two points on it, type how far apart they are), Move,
// turn, see-through; kept in this browser per router + view. Every change is a builder edit (undo, Export).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id), S = LR4CapShape, NS = "http://www.w3.org/2000/svg";
  const VIEWS = {   // named by where you stand at the machine (user 2026-10-30); axis: an open half's mirror line ("x": y = 0, "y": x = 0)
    top: { closed: false, axis: "x", lx: "Left–right", ly: "Out from the middle", note: "From above, one half (mirrored front to back): left–right along the gantry, the router's axis at 0" },
    front: { closed: true, axis: null, lx: "Left–right", ly: "Up", note: "From the machine's front, all the way round: up from the cap's bottom (the top of the turned part)" },
    section: { closed: false, axis: "y", lx: "Out from the middle", ly: "Up", note: "A slice across the cap seen from the right, one half (mirrored): stretched to each spot's width (Top) and height (Front)" },
  };
  const CE = { view: "top", sel: -1, sec: 0, cam: {}, mode: null, drag: null, scaleA: null, photos: null, over: true, home: null, lens: null, key: "" };
  try { CE.over = MS.get("lr4-ce-over") !== "0"; } catch (e) { /* default: over the model */ }
  // Part 48g (user 2026-10-31: "a cutaway slider ... slide to a point and add a cross section there"): the Cross-section
  // view's Cut at slider moves the cut along the cap; near a section (1 mm) it snaps there and picks it; between them
  // (CE.free = its X) nothing is edited - the cut shows the blend, + Section here adds one there, shaped as the blend.
  CE.free = null;
  const PHOTO_KEY = "lr4-cap-photos";

  // ---- the shape: the current router's (a box from its sizes until it has one) ----
  function capOf(m) { return m.motor_cap; }
  function shapeNow() {
    const c = capOf(LR4Routers.preset(rbCur()).model);
    return c.shape ? JSON.parse(JSON.stringify(c.shape)) : S.STARTS.box(Object.assign({}, c, { at: (c.at || [0, 0])[0] }));
  }
  const sections = (sh) => (Array.isArray(sh.section) && sh.section.length && sh.section[0].pts ? sh.section : [{ at: null, pts: sh.section }]);
  function ptsOf(sh) { return CE.view === "section" ? sections(sh)[Math.min(CE.sec, sections(sh).length - 1)].pts : sh[CE.view]; }
  function setPts(sh, pts) {
    if (CE.view !== "section") { sh[CE.view] = pts; return sh; }
    const secs = sections(sh);
    secs[Math.min(CE.sec, secs.length - 1)].pts = pts;
    sh.section = secs.length === 1 ? secs[0].pts : secs;
    return sh;
  }
  function commit(sh) {                              // the shape -> the router (its sizes follow)
    const ok = S.clean(sh);
    if (!ok) return false;
    rbEdit((p) => { const c = capOf(p.model), z = S.size(ok); c.shape = ok; c.L = z.L; c.W = z.W; c.H = z.H; c.at = [z.at[0], 0]; });
    return true;
  }
  function edit(fn) {                                // fn(pts) changes the current view's points (a copy)
    const sh = shapeNow(), pts = ptsOf(sh).map((p) => Object.assign({}, p));
    if (fn(pts) === false) return;
    if (commit(setPts(sh, pts))) draw();
  }

  // ---- the drawing: mm <-> screen ----
  const svg = () => $("ce-svg");
  function box() { const r = svg().getBoundingClientRect(); return [r.width || 400, r.height || 300]; }
  function fit() {
    const sh = shapeNow(), v = VIEWS[CE.view], pl = S.path(ptsOf(sh), v.closed, v.axis).concat([[0, 0]]);
    if (v.axis === "x") pl.push(...pl.map(([x, y]) => [x, -y]));
    if (v.axis === "y") pl.push(...pl.map(([x, y]) => [-x, y]));
    const xs = pl.map((p) => p[0]), ys = pl.map((p) => p[1]), [W, H] = box();
    const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
    const k = Math.min(W / ((bx[1] - bx[0]) * 1.25 || 1), H / ((by[1] - by[0]) * 1.25 || 1));
    CE.cam[CE.view] = { cx: (bx[0] + bx[1]) / 2, cy: (by[0] + by[1]) / 2, k: Math.max(k, 0.2) };
  }
  // Part 48e (user 2026-10-31, the review's "shape editor in the view"): Over the model, the drawing (.ce-draw) moves
  // onto the stage and its mm <-> px comes from the router editor's camera, snapped to the view's side (Top = the plan,
  // Front, Right = the cross-section) with the Flat lens, so the outline sits on the model. Orbit off the snap and the
  // drawing waits; the view's button snaps back. "In a panel" = the docked editor (more room for a photo).
  const SNAP = { top: "top", front: "front", section: "right" }, VIEW_OF = { top: "top", front: "front", right: "section" };
  const overOn = () => CE.over && !$("ce").hidden && typeof rbViewing === "function" && rbViewing() && typeof rxScreen === "function";
  function live() {                                   // over the model: the view's cam from the 3D camera (null: not snapped there)
    if (!overOn() || typeof RX === "undefined" || RX.anim || RX.view !== SNAP[CE.view]) return null;
    const m = LR4Routers.preset(rbCur()).model, h = m.motor_cap, z0 = LR4RouterBody.stackTop(m);
    const sec = CE.view === "section" ? CE.free ?? sections(shapeNow())[Math.min(CE.sec, sections(shapeNow()).length - 1)].at : null;
    const xs = sec ?? (h.at || [0, 0])[0];             // the slice: at its place along the cap (or the cap's middle)
    const P = { top: (x, y) => [x, y, z0 + h.H], front: (x, y) => [x, 0, z0 + y], section: (x, y) => [xs, x, z0 + y] }[CE.view];
    const a = rxScreen(P(0, 0)), b = rxScreen(P(100, 0)), c = rxScreen(P(0, 100));
    if (!a || !b || !c) return null;
    const k = Math.hypot(b[0] - a[0], b[1] - a[1]) / 100, [W, H] = box();
    if (!(k > 0) || c[1] > a[1]) return null;         // (up the screen = up the drawing)
    return { cx: (W / 2 - a[0]) / k, cy: (a[1] - H / 2) / k, k };
  }
  const cam = () => (overOn() ? live() || { cx: 0, cy: 0, k: 1 } : CE.cam[CE.view] || (fit(), CE.cam[CE.view]));
  function toS(x, y) { const c = cam(), [W, H] = box(); return [W / 2 + (x - c.cx) * c.k, H / 2 - (y - c.cy) * c.k]; }
  function toM(e) {
    const r = svg().getBoundingClientRect(), c = cam(), [W, H] = box();
    return [c.cx + (e.clientX - r.left - W / 2) / c.k, c.cy - (e.clientY - r.top - H / 2) / c.k];
  }
  const snap = (v, e) => (e && e.altKey ? +v.toFixed(2) : Math.round(v * 2) / 2);
  function el(tag, at, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(at)) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  }
  const d = (pl) => pl.map((p, i) => `${i ? "L" : "M"}${toS(p[0], p[1]).map((v) => v.toFixed(1)).join(" ")}`).join("");

  function draw() {
    if ($("ce").hidden) return;
    capCut();                                         // (the cutaway follows the view / section at once, not a frame later)
    $("ce-note").textContent = VIEWS[CE.view].note;   // (first: the layout settles before the size is read)
    const s = svg(), sh = shapeNow(), v = VIEWS[CE.view], pts = ptsOf(sh), [W, H] = box(), c = cam(), over = overOn();
    s.replaceChildren();
    s.setAttribute("viewBox", `0 0 ${W} ${H}`);
    s.classList.toggle("ce-mode", !!CE.mode);         // over the model: the background takes clicks only for the photo's tools
    if (over && !live()) {                            // orbited off the view: the drawing waits
      $("ce-pop").hidden = true;
      $("ce-wait").hidden = typeof RX !== "undefined" && !!RX.anim;   // (still turning: no message)
      return;
    }
    $("ce-wait").hidden = true;
    const ph = photo();
    if (ph && ph.src) {                              // the photo, its top-left at (x, y) mm, mmpp mm a pixel, turned rot deg about its middle
      const [sx, sy] = toS(ph.x, ph.y), k = ph.mmpp * c.k, cxp = ph.w / 2, cyp = ph.h / 2;
      el("image", { href: ph.src, width: ph.w, height: ph.h, opacity: ph.op ?? 0.6, preserveAspectRatio: "none",
        transform: `translate(${sx} ${sy}) scale(${k}) rotate(${ph.rot || 0} ${cxp} ${cyp})` }, s);
    }
    let step = 1;                                    // a grid at 1 / 5 / 10 / 50 mm, whichever is 14 px or more
    for (const g of [1, 5, 10, 50, 100]) { step = g; if (g * c.k >= 14) break; }
    const gr = el("g", { class: "ce-grid" + (over ? " ce-off" : "") }, s), [x0, y1] = toM({ clientX: s.getBoundingClientRect().left, clientY: s.getBoundingClientRect().top });
    const x1 = x0 + W / c.k, y0 = y1 - H / c.k;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const [X] = toS(x, 0); el("line", { x1: X, y1: 0, x2: X, y2: H, class: x === 0 ? "ax" : "" }, gr); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const [, Y] = toS(0, y); el("line", { x1: 0, y1: Y, x2: W, y2: Y, class: y === 0 ? "ax" : "" }, gr); }
    const t = el("text", { x: 8, y: H - 8, class: "ce-step" }, s); t.textContent = `grid ${step} mm`;
    guides(s, sh);
    if (CE.view === "section") others(s, sh, v);
    if (CE.view === "section" && CE.free !== null) { $("ce-pop").hidden = true; return; }
    const pl = S.path(pts, v.closed, v.axis);
    if (v.axis) el("path", { d: d(pl.map(([x, y]) => (v.axis === "x" ? [x, -y] : [-x, y]))), class: "ce-mirror" }, s);
    el("path", { d: d(pl) + (v.closed ? "Z" : ""), class: "ce-line" }, s);
    const hit = el("path", { d: d(pl) + (v.closed ? "Z" : ""), class: "ce-hit" }, s);
    hit.addEventListener("pointerdown", (e) => { if (!CE.mode) { e.stopPropagation(); addAt(e); } });
    const i = CE.sel;
    if (i >= 0 && i < pts.length && (pts[i].s === "curve" || (pts[(i - 1 + pts.length) % pts.length] || {}).s === "curve")) {
      const h = S.handle(pts, v.closed, v.axis, i), p = [pts[i].x, pts[i].y];
      for (const sg of [1, -1]) {
        const q = [p[0] + sg * h[0], p[1] + sg * h[1]], [a, b] = toS(...p), [qx, qy] = toS(...q);
        el("line", { x1: a, y1: b, x2: qx, y2: qy, class: "ce-hl" }, s);
        const r = el("rect", { x: qx - 4, y: qy - 4, width: 8, height: 8, class: "ce-h" + (pts[i].t ? " own" : "") }, s);
        r.addEventListener("pointerdown", (e) => { e.stopPropagation(); CE.drag = { kind: "handle", i, sg }; s.setPointerCapture(e.pointerId); RB.cut = true; });
      }
    }
    pts.forEach((p, j) => {
      const [X, Y] = toS(p.x, p.y), cc = el("circle", { cx: X, cy: Y, r: j === CE.sel ? 7 : 5, class: "ce-pt" + (j === CE.sel ? " sel" : "") }, s);
      cc.addEventListener("pointerdown", (e) => { if (CE.mode) return; e.stopPropagation(); CE.sel = j; CE.drag = { kind: "pt", i: j }; s.setPointerCapture(e.pointerId); RB.cut = true; draw(); table(); });
    });
    if (CE.scaleA) { const [X, Y] = toS(...CE.scaleA); el("circle", { cx: X, cy: Y, r: 4, class: "ce-mark" }, s); }
    pop(pts, v);
  }
  // the picked point's size beside it on the drawing: a corner between two straight lines - how much it's rounded; an
  // arc from it - its radius (+ flip) (user 2026-10-30: "add a radius to the selected point")
  function pop(pts, v) {
    const el = $("ce-pop"), i = CE.sel, n = pts.length, p = pts[i];
    const last = !v.closed && i === n - 1, prev = p && (v.closed || i > 0) ? pts[(i - 1 + n) % n].s || "line" : null;
    const kind = !p || last || CE.mode ? null : (p.s || "line") === "arc" ? "arc" : (p.s || "line") === "line" && prev === "line" ? "corner" : null;
    el.hidden = !kind;
    if (!kind) return;
    $("ce-pop-l").textContent = kind === "arc" ? "Radius" : "Round";
    $("ce-pop-v").setAttribute("aria-label", kind === "arc" ? `Arc radius from point ${i + 1}, mm` : `Round the corner at point ${i + 1}, mm`);
    $("ce-pop-v").placeholder = kind === "arc" ? "" : "sharp";
    if (document.activeElement !== $("ce-pop-v")) $("ce-pop-v").value = kind === "arc" ? Math.abs(p.r || 0) : p.r > 0 ? p.r : "";
    $("ce-pop-flip").hidden = kind !== "arc";
    el.dataset.kind = kind;
    const [X, Y] = toS(p.x, p.y), [W, H] = box(), w = el.offsetWidth || 150, h = el.offsetHeight || 30;
    el.style.left = Math.max(4, Math.min(W - w - 4, X + 14)) + "px";
    el.style.top = Math.max(4, Math.min(H - h - 4, Y - h - 12)) + "px";
  }
  $("ce-pop-v").addEventListener("input", (e) => {   // as you type (one undo step while typing)
    const val = e.target.value.trim() === "" ? 0 : Number(e.target.value), i = CE.sel, kind = $("ce-pop").dataset.kind;
    if (!Number.isFinite(val) || val < 0) return;
    edit((pts) => {
      const p = pts[i];
      if (!p) return false;
      if (kind === "arc") p.r = (p.r < 0 ? -1 : 1) * val; else if (val > 0) p.r = val; else delete p.r;
    });
    table();
  });
  $("ce-pop-flip").addEventListener("click", () => { const i = CE.sel; edit((pts) => { if (pts[i]) pts[i].r = -(pts[i].r || 0); }); table(); });
  // the cross-section's other sections (more than one: blended along the cap), dashed + their X at the widest point
  function others(s, sh, v) {
    const secs = sections(sh), cur = CE.free !== null ? -1 : Math.min(CE.sec, secs.length - 1);
    if (secs.length < 2 && cur >= 0) return;
    const g = el("g", { class: "ce-other" }, s), used = [];
    secs.forEach((e, j) => {
      if (j === cur) return;
      const pl = S.path(e.pts, v.closed, v.axis);
      el("path", { d: d(pl) }, g);
      el("path", { d: d(pl.map(([x, y]) => [-x, y])) }, g);
      const w = pl.reduce((a, q) => (q[0] > a[0] + 0.01 || (Math.abs(q[0] - a[0]) <= 0.01 && q[1] > a[1]) ? q : a), pl[0]);
      if (e.at === null) return;
      const [X, Y0] = toS(w[0], w[1]);
      let Y = Y0 + 4;
      while (used.some((u) => Math.abs(u - Y) < 13)) Y += 13;   // (labels at the same spot: stacked)
      used.push(Y);
      const t = el("text", { x: X + 6, y: Y }, g);
      t.textContent = `X ${+e.at.toFixed(1)}`;
    });
  }
  // the other views' extents (dashed) + the end sections' places
  function guides(s, sh) {
    const g = el("g", { class: "ce-guide" }, s), V = S.views(S.clean(sh) || sh), [W, H] = box();
    const vline = (x) => { const [X] = toS(x, 0); el("line", { x1: X, y1: 0, x2: X, y2: H }, g); };
    const hline = (y) => { const [, Y] = toS(0, y); el("line", { x1: 0, y1: Y, x2: W, y2: Y }, g); };
    if (CE.view === "top" || CE.view === "front") {
      vline(V.x0); vline(V.x1);
      const secs = sections(sh);
      if (secs.length > 1) secs.forEach((e, j) => {   // (the picked one solid: it's the one the Cross-section view edits)
        const [X] = toS(e.at, 0);
        el("line", { x1: X, y1: 0, x2: X, y2: H, class: "sec" + (j === Math.min(CE.sec, secs.length - 1) ? " on" : "") }, g);
      });
    }
    if (CE.view === "section") { vline(V.W / 2); vline(-V.W / 2); hline(V.zmin); hline(V.zmax); }
    if (CE.view === "front") hline(0);
    const m = LR4Routers.preset(rbCur()).model, T = m.transition, R = (T && T.l > 0 && T.d > 0 ? T.d : (m.collar || m.housing).d) / 2;
    if (CE.view === "top") {                         // the turned part it sits on (dotted): round the router's axis
      const [X, Y] = toS(0, 0); el("circle", { cx: X, cy: Y, r: R * cam().k, class: "ce-body" }, s);
    } else for (const x of [-R, R]) { const [X, Y] = toS(x, 0); el("line", { x1: X, y1: Y, x2: X, y2: H, class: "ce-body" }, s); }
  }
  function addAt(e) {                                // a point on the nearest span's chord, the span's kind kept
    const [x, y] = toM(e), v = VIEWS[CE.view];
    edit((pts) => {
      const n = pts.length, spans = v.closed ? n : n - 1;
      let best = 0, bd = Infinity;
      for (let i = 0; i < spans; i++) {
        const a = pts[i], b = pts[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, L2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / L2)), dd = Math.hypot(x - a.x - ex * t, y - a.y - ey * t);
        if (dd < bd) { bd = dd; best = i; }
      }
      const a = pts[best], q = { x: snap(x, e), y: snap(y, e), s: a.s || "line" };
      if (a.s === "arc" && a.r) q.r = a.r;
      pts.splice(best + 1, 0, q);
      CE.sel = best + 1;
    });
    table();
  }
  function removeSel() {
    const v = VIEWS[CE.view];
    edit((pts) => {
      const i = CE.sel;
      if (i < 0 || pts.length <= 3 || (!v.closed && (i === 0 || i === pts.length - 1))) return false;
      pts.splice(i, 1);
      CE.sel = Math.min(i, pts.length - 1);
    });
    table();
  }

  // ---- the points table ----
  function table() {
    const tb = $("ce-rows"), sh = shapeNow(), pts = ptsOf(sh), v = VIEWS[CE.view];
    $("ce-hx").textContent = v.lx; $("ce-hy").textContent = v.ly;
    tb.replaceChildren();
    const n = pts.length, prevS = (i) => (v.closed || i > 0 ? (pts[(i - 1 + n) % n].s || "line") : null);
    pts.forEach((p, i) => {
      const tr = document.createElement("tr"), last = !v.closed && i === n - 1, fixed = !v.closed && (i === 0 || last), s0 = p.s || "line";
      tr.className = i === CE.sel ? "sel" : "";
      const num = (k, val, dis, lbl) => `<td><input type="number" step="0.5" data-i="${i}" data-k="${k}" value="${val ?? ""}"${dis ? " disabled" : ""} aria-label="${lbl} of point ${i + 1}"></td>`;
      const lockX = fixed && v.axis === "y", lockY = fixed && v.axis === "x";
      // the line to the next point; an arc: its radius beside it (+ a flip: which way it bulges)
      let span = "<td class=\"na\">(the end)</td>";
      if (!last) {
        span = `<td><select data-i="${i}" data-k="s" aria-label="The line from point ${i + 1} to the next">${S.SPANS.map((q) =>
          `<option value="${q}"${s0 === q ? " selected" : ""}>${{ line: "Straight", arc: "Arc", curve: "Curve" }[q]}</option>`).join("")}</select>`;
        if (s0 === "arc") span += ` <label class="ce-arc">radius <input type="number" step="0.5" min="0" data-i="${i}" data-k="ar" value="${Math.abs(p.r || 0)}" aria-label="Arc radius, point ${i + 1}"></label>` +
          `<button type="button" class="ce-flip" data-i="${i}" data-flip title="Bulge the other way" aria-label="Bulge the arc the other way">⇄</button>`;
        span += "</td>";
      }
      // a corner between two straight lines: how much to round it
      const corner = !last && s0 === "line" && prevS(i) === "line"
        ? `<td><input type="number" step="0.5" min="0" data-i="${i}" data-k="cr" value="${p.r > 0 ? p.r : ""}" placeholder="sharp" aria-label="Round the corner at point ${i + 1}"></td>` : "<td></td>";
      // a point a curve runs through: smooth, or its handle moved (Reset)
      const onCurve = (!last && s0 === "curve") || prevS(i) === "curve";
      const curve = onCurve ? `<td>${p.t ? `<button type="button" data-i="${i}" data-auto title="Back to the smooth curve">Reset</button>` : "<span class=\"na\">smooth</span>"}</td>` : "<td></td>";
      tr.innerHTML = `<td>${i + 1}</td>${num("x", p.x, lockX, v.lx)}${num("y", p.y, lockY, v.ly)}${span}${corner}${curve}`;
      tr.addEventListener("pointerdown", () => { if (CE.sel !== i) { CE.sel = i; draw(); for (const r of tb.children) r.classList.toggle("sel", r === tr); } });
      tb.append(tr);
    });
    const secs = sections(sh);
    $("ce-secs").hidden = CE.view !== "section";
    const sel = $("ce-sec");
    sel.length = 0;
    secs.forEach((e, i) => sel.add(new Option(secs.length > 1 ? `${i + 1}: at X = ${e.at}` : "One for the whole cap", i)));
    const free = CE.free !== null, V = S.views(S.clean(sh) || sh), cur = secs[Math.min(CE.sec, secs.length - 1)];
    if (free) sel.add(new Option("Between sections", -1));
    sel.value = free ? -1 : Math.min(CE.sec, secs.length - 1);
    $("ce-sec-at").closest(".field").hidden = secs.length < 2 || free;
    $("ce-sec-at").value = secs.length > 1 ? cur.at : "";
    $("ce-sec-del").disabled = secs.length < 2 || free;
    $("ce-sec-add").textContent = free ? "+ Section here" : "+ Section";
    const cut = $("ce-cut"), x = CE.free ?? cur.at ?? (V.x0 + V.x1) / 2;
    cut.min = +V.x0.toFixed(1); cut.max = +V.x1.toFixed(1); cut.value = x;
    $("ce-cut-out").textContent = `X = ${+x.toFixed(1)}`;
    $("ce-free").hidden = !free || CE.view !== "section";
    $("ce-free-x").textContent = +x.toFixed(1);
    document.querySelector("#ce .ce-tbl").hidden = free && CE.view === "section";
  }
  $("ce-rows").addEventListener("change", (e) => {
    const t = e.target, i = +t.dataset.i, k = t.dataset.k;
    if (!k) return;
    edit((pts) => {
      const p = pts[i];
      if (k === "s") {                               // a new kind of line: what the old one kept goes (an arc's radius, a curve's handle)
        p.s = t.value; delete p.t; delete p.r;
        if (p.s === "arc") { const q = pts[(i + 1) % pts.length]; p.r = +(Math.hypot(q.x - p.x, q.y - p.y) * 0.75).toFixed(1); }
        return;
      }
      const val = t.value.trim() === "" ? 0 : Number(t.value);
      if (!Number.isFinite(val)) return false;
      if (k === "ar") p.r = (p.r < 0 ? -1 : 1) * Math.abs(val);   // the arc's radius, its bulge kept
      else if (k === "cr") { if (val > 0) p.r = val; else delete p.r; }   // the corner's rounding (blank / 0 = sharp)
      else p[k] = val;
    });
    table();
  });
  $("ce-rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-auto], [data-flip]");
    if (!b) return;
    const i = +b.dataset.i;
    edit((pts) => { if (b.hasAttribute("data-flip")) pts[i].r = -(pts[i].r || 0); else delete pts[i].t; });
    table();
  });

  // ---- dragging: a point, a handle, the photo, or the view (pan) ----
  $("ce-svg").addEventListener("pointerdown", (e) => {
    const s = svg();
    if (CE.mode === "scale") { scalePick(e); return; }
    CE.drag = CE.mode === "move" && photo() ? { kind: "photo", at: toM(e) } : { kind: "pan", at: [e.clientX, e.clientY] };
    s.setPointerCapture(e.pointerId);
  });
  $("ce-svg").addEventListener("pointermove", (e) => {
    const D = CE.drag;
    if (!D) return;
    if (D.kind === "pan") {
      const c = cam();
      c.cx -= (e.clientX - D.at[0]) / c.k; c.cy += (e.clientY - D.at[1]) / c.k; D.at = [e.clientX, e.clientY];
      draw(); return;
    }
    if (D.kind === "photo") { const m = toM(e), ph = photo(); ph.x += m[0] - D.at[0]; ph.y += m[1] - D.at[1]; D.at = m; draw(); return; }
    const [x, y] = toM(e), v = VIEWS[CE.view];
    edit((pts) => {
      const p = pts[D.i];
      if (D.kind === "handle") { p.t = [(x - p.x) * D.sg, (y - p.y) * D.sg].map((q) => +q.toFixed(2)); return; }
      const fixed = !v.closed && (D.i === 0 || D.i === pts.length - 1);
      if (!(fixed && v.axis === "y")) p.x = snap(x, e);
      if (!(fixed && v.axis === "x")) p.y = snap(y, e);
    });
    RB.cut = false;
    tableValues();
  });
  const endDrag = () => { if (CE.drag && CE.drag.kind === "photo") photoSave(); if (CE.drag && CE.drag.kind !== "pan") table(); CE.drag = null; };
  $("ce-svg").addEventListener("pointerup", endDrag);
  $("ce-svg").addEventListener("pointercancel", endDrag);
  $("ce-svg").addEventListener("wheel", (e) => {   // zoom about the pointer
    e.preventDefault();
    const c = cam(), m = toM(e), f = Math.exp(-e.deltaY * 0.0015);
    c.k = Math.min(Math.max(c.k * f, 0.1), 60);
    const m2 = toM(e); c.cx += m[0] - m2[0]; c.cy += m[1] - m2[1];
    draw();
  }, { passive: false });
  function tableValues() {                           // a drag: just the numbers
    const pts = ptsOf(shapeNow());
    for (const inp of $("ce-rows").querySelectorAll("input[data-k]")) {
      const p = pts[+inp.dataset.i];
      if (p && document.activeElement !== inp) inp.value = p[inp.dataset.k] ?? "";
    }
  }
  document.addEventListener("keydown", (e) => {
    if ($("ce").hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
  });

  // ---- the photo under a view ----
  function photos() {
    if (!CE.photos) { try { CE.photos = JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}") || {}; } catch (e) { CE.photos = {}; } }
    return CE.photos;
  }
  function photo() { const a = photos()[rbCur()]; return a ? a[CE.view] : null; }
  function photoSave() {
    try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photos())); $("ce-pnote").hidden = true; }
    catch (e) { $("ce-pnote").textContent = "The photo is too big to keep in this browser: it's here until you leave the page."; $("ce-pnote").hidden = false; }
  }
  function photoBar() {
    const ph = photo();
    for (const id of ["ce-scale", "ce-move", "ce-rot", "ce-op", "ce-pdel"]) $(id).disabled = !ph;
    if (ph) { $("ce-rot").value = ph.rot || 0; $("ce-op").value = ph.op ?? 0.6; }
    $("ce-scale").setAttribute("aria-pressed", String(CE.mode === "scale"));
    $("ce-move").setAttribute("aria-pressed", String(CE.mode === "move"));
    $("ce-scalebox").hidden = !(CE.mode === "scale" && CE.scaleB);
  }
  $("ce-pfile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height)), w = Math.round(img.width * k), h = Math.round(img.height * k);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h; cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const z = S.size(S.clean(shapeNow()) || shapeNow()), span = CE.view === "section" ? z.W : z.L, mmpp = span * 1.3 / w;
      const c = cam(), all = photos();
      all[rbCur()] = all[rbCur()] || {};
      all[rbCur()][CE.view] = { src: cv.toDataURL("image/jpeg", 0.85), w, h, mmpp, x: c.cx - w * mmpp / 2, y: c.cy + h * mmpp / 2, rot: 0, op: 0.6 };
      photoSave();
      CE.mode = "scale"; CE.scaleA = null; CE.scaleB = null;
      $("ce-msg").textContent = "Set its scale: click two points on the photo you know the distance between.";
      photoBar(); draw();
    };
    img.src = url;
  });
  $("ce-photo").addEventListener("click", () => $("ce-pfile").click());
  $("ce-scale").addEventListener("click", () => {
    CE.mode = CE.mode === "scale" ? null : "scale"; CE.scaleA = null; CE.scaleB = null;
    $("ce-msg").textContent = CE.mode ? "Click two points on the photo you know the distance between." : "";
    photoBar(); draw();
  });
  $("ce-move").addEventListener("click", () => { CE.mode = CE.mode === "move" ? null : "move"; $("ce-msg").textContent = CE.mode ? "Drag the photo to line it up." : ""; photoBar(); });
  function scalePick(e) {
    const m = toM(e);
    if (!CE.scaleA) { CE.scaleA = m; draw(); return; }
    CE.scaleB = m;
    $("ce-msg").textContent = "";
    photoBar();
    $("ce-dist").value = (Math.hypot(m[0] - CE.scaleA[0], m[1] - CE.scaleA[1])).toFixed(1);
    $("ce-dist").focus(); $("ce-dist").select();
  }
  $("ce-scale-ok").addEventListener("click", () => {
    const ph = photo(), A = CE.scaleA, B = CE.scaleB, want = Number($("ce-dist").value), now = A && B && Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (ph && now > 0 && want > 0) {               // scale about A: A stays put
      const f = want / now;
      ph.mmpp *= f; ph.x = A[0] + (ph.x - A[0]) * f; ph.y = A[1] + (ph.y - A[1]) * f;
      photoSave();
      $("ce-msg").textContent = "Scaled. Move lines it up with the drawing.";
    }
    CE.mode = null; CE.scaleA = null; CE.scaleB = null;
    photoBar(); draw();
  });
  $("ce-dist").addEventListener("keydown", (e) => { if (e.key === "Enter") $("ce-scale-ok").click(); });
  $("ce-rot").addEventListener("input", (e) => { const ph = photo(); if (ph) { ph.rot = Number(e.target.value) || 0; draw(); } });
  $("ce-rot").addEventListener("change", photoSave);
  $("ce-op").addEventListener("input", (e) => { const ph = photo(); if (ph) { ph.op = Number(e.target.value); draw(); } });
  $("ce-op").addEventListener("change", photoSave);
  $("ce-pdel").addEventListener("click", () => {
    const a = photos()[rbCur()];
    if (a) delete a[CE.view];
    CE.mode = null; photoSave(); photoBar(); draw();
  });

  // ---- the bar: views, starting shapes, sections, close ----
  function show(view, fromCamera) {
    CE.view = view; CE.sel = -1; CE.mode = null; CE.scaleA = null; CE.free = null;
    if (overOn() && !fromCamera && typeof rxLook === "function" && RX.view !== SNAP[view]) rxLook(SNAP[view]);
    for (const b of $("ce-views").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === view));
    $("ce-msg").textContent = "";
    photoBar(); table(); draw();
  }
  $("ce-views").addEventListener("click", (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) show(v); });
  $("ce-start").addEventListener("change", (e) => {
    const k = e.target.value;
    e.target.value = "";
    if (!S.STARTS[k]) return;
    const c = capOf(LR4Routers.preset(rbCur()).model);
    RB.cut = true;
    if (commit(S.STARTS[k](Object.assign({}, c, { at: (c.at || [0, 0])[0] })))) { CE.cam = {}; CE.sel = -1; table(); draw(); }
  });
  $("ce-fit").addEventListener("click", () => { if (overOn()) capFit(); else { fit(); draw(); } });
  $("ce-sec").addEventListener("change", (e) => { if (+e.target.value < 0) return; CE.sec = +e.target.value; CE.free = null; CE.sel = -1; table(); draw(); });
  $("ce-cut").addEventListener("input", (e) => {    // the cut slid: a section within 1 mm picked, else between them
    const x = Number(e.target.value), secs = sections(shapeNow());
    let j = -1, bd = 1.01;
    secs.forEach((q, i) => { if (q.at !== null && Math.abs(q.at - x) < bd) { bd = Math.abs(q.at - x); j = i; } });
    if (j >= 0) { CE.sec = j; CE.free = null; } else CE.free = x;
    CE.sel = -1; table(); draw();
  });
  // a new section at X between two others: the blend of them where both have the same points (a copy's), else the nearer's
  function blendAt(secs, x) {
    const by = [...secs].sort((p, q) => p.at - q.at), a = by.filter((q) => q.at <= x).pop(), b = by.find((q) => q.at >= x);
    const copy = (q) => q.pts.map((pt) => Object.assign({}, pt));
    if (!a || !b || a === b) return copy(a || b);
    const t = (x - a.at) / (b.at - a.at), near = t < 0.5 ? a : b;
    if (a.pts.length !== b.pts.length || a.pts.some((pt, i) => (pt.s || "line") !== (b.pts[i].s || "line"))) return copy(near);
    const mix = (u, v) => +(u + (v - u) * t).toFixed(2);
    return a.pts.map((pa, i) => {
      const pb = b.pts[i], o = Object.assign({}, near.pts[i], { x: mix(pa.x, pb.x), y: mix(pa.y, pb.y) });
      if (pa.r || pb.r) o.r = mix(pa.r || 0, pb.r || 0); else delete o.r;
      return o;
    });
  }
  $("ce-sec-add").addEventListener("click", () => {   // another section, a copy of this one, 20 mm on (or the cap's other half)
    const sh = shapeNow(), secs = sections(sh), V = S.views(S.clean(sh)), cur = secs[Math.min(CE.sec, secs.length - 1)];
    if (CE.free !== null) {                           // between sections: one here, shaped as the cap is here
      const x = +CE.free.toFixed(1);
      if (secs.length === 1 && secs[0].at === null) secs[0].at = +(x > (V.x0 + V.x1) / 2 ? V.x0 : V.x1).toFixed(1);   // (the one: to the far end)
      secs.push({ at: x, pts: blendAt(secs, x) });
      secs.sort((a, b) => a.at - b.at);
      sh.section = secs;
      RB.cut = true;
      if (commit(sh)) { CE.free = null; CE.sec = secs.findIndex((e) => e.at === x); table(); draw(); }
      return;
    }
    const at0 = cur.at ?? V.x0 + V.L * 0.25, at = Math.min(at0 + Math.max(20, V.L / 4), V.x1);
    if (secs.length === 1) secs[0].at = +at0.toFixed(1);
    secs.push({ at: +at.toFixed(1), pts: cur.pts.map((p) => Object.assign({}, p)) });
    secs.sort((a, b) => a.at - b.at);
    sh.section = secs;
    RB.cut = true;
    if (commit(sh)) { CE.sec = secs.findIndex((e) => e.at === +at.toFixed(1)); table(); draw(); }
  });
  $("ce-sec-del").addEventListener("click", () => {
    const sh = shapeNow(), secs = sections(sh);
    if (secs.length < 2) return;
    secs.splice(Math.min(CE.sec, secs.length - 1), 1);
    sh.section = secs.length === 1 ? secs[0].pts : secs;
    RB.cut = true;
    if (commit(sh)) { CE.sec = 0; CE.free = null; table(); draw(); }
  });
  $("ce-sec-at").addEventListener("change", (e) => {
    const v = Number(e.target.value), sh = shapeNow(), secs = sections(sh);
    if (!Number.isFinite(v) || secs.length < 2) return;
    secs[Math.min(CE.sec, secs.length - 1)].at = v;
    sh.section = secs;
    CE.free = null;
    if (commit(sh)) { table(); draw(); }
  });
  $("ce-plain").addEventListener("click", () => {    // back to the box from its sizes (the shape dropped)
    RB.cut = true;
    rbEdit((p) => { delete capOf(p.model).shape; });
    CE.cam = {}; table(); draw();
  });
  // the model's view centred in the room between the router editor's column (left) and this (right)
  function viewRoom() {
    if (typeof camera === "undefined") return;
    const st = document.querySelector(".stage").getBoundingClientRect(), W = Math.max(st.width, 1), H = Math.max(st.height, 1);
    const box = (id) => { const e = $(id); return e && !e.hidden ? e.getBoundingClientRect() : null; };
    const l = box("rte"), r = box("ce") || box("rti"), x0 = l ? l.right - st.left : 0, x1 = r ? r.left - st.left : W;
    if ((l || r) && x1 - x0 > 200) camera.setViewOffset(W, H, W / 2 - (x0 + x1) / 2, 0, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    return [Math.max(x1 - x0, 200), H];
  }
  // the router framed in that room: back off till its radius fits the room's width as well as its height
  function fitRoom() {
    const [w, H] = viewRoom(), v = camera.fov * Math.PI / 360, hh = Math.atan(Math.tan(v) * w / H);
    if (typeof radius === "undefined" || !(radius > 0)) return;
    const dist = radius / Math.sin(Math.min(v, hh)) * 1.05, dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.update();
  }
  // over the model / in the panel: the drawing moved onto the stage (the router editor's overlay) or back; the Flat lens
  // on while it's over the model, back as it was after
  function overPlace() {
    const on = overOn(), dr = $("ce-draw");
    if (!CE.home) CE.home = { parent: dr.parentNode, next: dr.nextSibling };
    const host = on ? $("rbx") : CE.home.parent;
    if (dr.parentNode !== host) { if (on) host.append(dr); else host.insertBefore(dr, CE.home.next); }
    dr.classList.toggle("ce-over", on);
    $("ce").classList.toggle("ce-over", on);
    $("ce-overb").setAttribute("aria-pressed", String(CE.over));
    if (typeof RX !== "undefined" && typeof rxLens === "function") {
      if (on && CE.lens === null) { CE.lens = RX.flat; if (!RX.flat) rxLens(true); }
      if (!on && CE.lens !== null) { if (RX.flat !== CE.lens) rxLens(true); CE.lens = null; }
    }
    if (on && typeof rxLook === "function" && RX.view !== SNAP[CE.view]) rxLook(SNAP[CE.view]);
  }
  $("ce-overb").addEventListener("click", () => {
    CE.over = !CE.over;
    try { MS.set("lr4-ce-over", CE.over ? "1" : "0"); } catch (e) { /* not kept */ }
    overPlace(); fitRoom(); draw();
  });
  $("ce-wait-go").addEventListener("click", () => { if (typeof rxLook === "function") rxLook(SNAP[CE.view]); });
  // over the model: the camera closes in on the motor cap (once the snap has landed: it frames the whole router)
  function capFit(tries = 3) {
    if (!overOn() || typeof rxWorld !== "function") return;
    if (RX.anim) { if (tries) setTimeout(() => capFit(tries - 1), 150); return; }
    const m = LR4Routers.preset(rbCur()).model, h = m.motor_cap, z0 = LR4RouterBody.stackTop(m);
    const c = rxWorld([(h.at || [0, 0])[0], 0, z0 + h.H / 2]);
    if (!c) return;
    const [w, H] = viewRoom(), v = camera.fov * Math.PI / 360, hh = Math.atan(Math.tan(v) * w / H);
    const dir = camera.position.clone().sub(controls.target).normalize(), r = Math.hypot(h.L, h.W, h.H) * 0.62;
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(dir, r / Math.sin(Math.min(v, hh)));
    controls.update();
    draw();
  }
  // Part 48f (user 2026-10-31, several cross-sections: "show a cutaway view at that point"): while the Cross-section
  // view is open (over the model or in the panel) the router is cut at the picked section's X - what's past it (toward
  // the Right camera) above the cap's bottom: two clip planes, only their intersection cut - and the cut face filled (a
  // flat copy of each cut mesh's back faces), so the drawn slice sits on the cap's real one there.
  const CUT = { key: "", planes: null, mats: new Map(), fills: [], fill: null };
  function uncut() {
    for (const [mat, o] of CUT.mats) Object.assign(mat, o, { needsUpdate: true });
    CUT.mats.clear();
    for (const f of CUT.fills) if (f.parent) f.parent.remove(f);
    CUT.fills = [];
  }
  function capCut() {
    let at = null, m = null;
    if (!$("ce").hidden && CE.view === "section" && typeof rxWorld === "function" && typeof meshes !== "undefined") {
      const secs = sections(shapeNow());
      m = LR4Routers.preset(rbCur()).model;
      at = CE.free ?? secs[Math.min(CE.sec, secs.length - 1)].at ?? (m.motor_cap.at || [0, 0])[0];
    }
    const list = at === null ? [] : meshes.filter((q) => q.visible && q.isMesh && /^Router_/.test(q.userData.name || ""));
    const key = list.map((q) => q.uuid + q.geometry.uuid).join();
    if (key !== CUT.key) {
      uncut();
      CUT.key = key;
      if (key) {
        CUT.planes = CUT.planes || [new THREE.Plane(), new THREE.Plane()];
        CUT.fill = CUT.fill || new THREE.MeshBasicMaterial({ side: THREE.BackSide, clippingPlanes: CUT.planes, clipIntersection: true,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });   // (over faces it lies on: the part under the cap)
        CUT.fill.color.set(css("--muted") || "#888888");
        for (const q of list) {
          q.traverse((o) => {                       // (its own parts too: the dial's ring, the switch's marks)
            if (!o.isMesh || o.userData.cutFill) return;
            for (const mat of [].concat(o.material)) {
              if (CUT.mats.has(mat)) continue;
              CUT.mats.set(mat, { clippingPlanes: mat.clippingPlanes, clipIntersection: mat.clipIntersection, side: mat.side });
              Object.assign(mat, { clippingPlanes: CUT.planes, clipIntersection: true, side: THREE.FrontSide, needsUpdate: true });   // (front only: its own back faces would fight the fill)
            }
          });
          const f = new THREE.Mesh(q.geometry, CUT.fill);
          f.raycast = () => {};
          f.userData.cutFill = true;
          q.add(f); CUT.fills.push(f);
        }
      }
    }
    if (!key) return;
    const z0 = LR4RouterBody.stackTop(m) + 0.5, W = rxWorld([at, 0, z0]), X1 = rxWorld([at + 1, 0, z0]), Z1 = rxWorld([at, 0, z0 + 1]);
    if (!W || !X1 || !Z1) return;
    CUT.planes[0].setFromNormalAndCoplanarPoint(W.clone().sub(X1).normalize(), W);   // kept: x <= at
    CUT.planes[1].setFromNormalAndCoplanarPoint(W.clone().sub(Z1).normalize(), W);   // kept: below the cap (+0.5: not on its bottom face)
  }
  function capEditOpen(on) {
    const was = !$("ce").hidden;
    $("ce").hidden = !on;
    overPlace();
    for (const b of document.querySelectorAll('[data-act="shape"]')) b.setAttribute("aria-pressed", String(on));   // the motor cap's Edit shape (router_inspect.js)
    if (on && !was) { CE.cam = {}; show(CE.view); }
    if (typeof rtiShow === "function") rtiShow();   // the inspector steps aside for it (router_inspect.js)
    if (on !== was) fitRoom(); else viewRoom();
    capCut();
  }
  $("ce-close").addEventListener("click", () => { $("ce").dataset.shut = "1"; capEditOpen(false); });   // shut: stays shut on the tab
  window.capEditToggle = () => { const on = $("ce").hidden; if (on) delete $("ce").dataset.shut; else $("ce").dataset.shut = "1"; capEditOpen(on); };
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => requestAnimationFrame(() => { if (!$("ce").hidden && !CE.drag) draw(); })).observe($("ce-svg"));
    new ResizeObserver(() => requestAnimationFrame(viewRoom)).observe(document.querySelector(".stage"));
  }   // the panel's layout / the window
  // the builder calls this after any change (undo, another router): the editor follows
  window.capEditShow = () => { if (!$("ce").hidden && !CE.drag) { table(); draw(); } };
  window.capEditOpen = capEditOpen;
  // the router editor's camera: a snap to Top / Front / Right switches the drawing's view; each frame, a redraw if the
  // camera moved (zoom, pan) - router_edit.js calls these
  window.capEditSnap = (v) => {
    if (!overOn() || !VIEW_OF[v]) return;
    if (VIEW_OF[v] !== CE.view) show(VIEW_OF[v], true);
    setTimeout(capFit, 420);                          // after the snap's turn (router_edit.js: ~0.35 s)
  };
  window.capEditTick = () => {
    capCut();
    if (!overOn() || CE.drag) return;
    const c = live(), key = c ? [c.cx, c.cy, c.k].map((q) => q.toFixed(2)).join() : "-";
    if (key !== CE.key) { CE.key = key; draw(); }
  };
  window.capEditOver = () => overOn();
  window.capEditCut = () => (CUT.key ? { planes: CUT.planes.map((q) => q.clone()), fills: CUT.fills.length } : null);   // (tests)
  window.capEditRoom = viewRoom;
  window.capEditFit = fitRoom;
  window.capEditView = () => Object.assign({ view: CE.view }, cam());   // (tests: the view's px a mm)
})();
