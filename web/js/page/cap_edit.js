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
  const CE = { view: "top", sel: -1, sec: 0, cam: {}, mode: null, drag: null, scaleA: null, photos: null };
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
  const cam = () => CE.cam[CE.view] || (fit(), CE.cam[CE.view]);
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
    $("ce-note").textContent = VIEWS[CE.view].note;   // (first: the layout settles before the size is read)
    const s = svg(), sh = shapeNow(), v = VIEWS[CE.view], pts = ptsOf(sh), [W, H] = box(), c = cam();
    s.replaceChildren();
    s.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const ph = photo();
    if (ph && ph.src) {                              // the photo, its top-left at (x, y) mm, mmpp mm a pixel, turned rot deg about its middle
      const [sx, sy] = toS(ph.x, ph.y), k = ph.mmpp * c.k, cxp = ph.w / 2, cyp = ph.h / 2;
      el("image", { href: ph.src, width: ph.w, height: ph.h, opacity: ph.op ?? 0.6, preserveAspectRatio: "none",
        transform: `translate(${sx} ${sy}) scale(${k}) rotate(${ph.rot || 0} ${cxp} ${cyp})` }, s);
    }
    let step = 1;                                    // a grid at 1 / 5 / 10 / 50 mm, whichever is 14 px or more
    for (const g of [1, 5, 10, 50, 100]) { step = g; if (g * c.k >= 14) break; }
    const gr = el("g", { class: "ce-grid" }, s), [x0, y1] = toM({ clientX: s.getBoundingClientRect().left, clientY: s.getBoundingClientRect().top });
    const x1 = x0 + W / c.k, y0 = y1 - H / c.k;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const [X] = toS(x, 0); el("line", { x1: X, y1: 0, x2: X, y2: H, class: x === 0 ? "ax" : "" }, gr); }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const [, Y] = toS(0, y); el("line", { x1: 0, y1: Y, x2: W, y2: Y, class: y === 0 ? "ax" : "" }, gr); }
    const t = el("text", { x: 8, y: H - 8, class: "ce-step" }, s); t.textContent = `grid ${step} mm`;
    guides(s, sh);
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
  // the other views' extents (dashed) + the end sections' places
  function guides(s, sh) {
    const g = el("g", { class: "ce-guide" }, s), V = S.views(S.clean(sh) || sh), [W, H] = box();
    const vline = (x) => { const [X] = toS(x, 0); el("line", { x1: X, y1: 0, x2: X, y2: H }, g); };
    const hline = (y) => { const [, Y] = toS(0, y); el("line", { x1: 0, y1: Y, x2: W, y2: Y }, g); };
    if (CE.view === "top" || CE.view === "front") {
      vline(V.x0); vline(V.x1);
      const secs = sections(sh);
      if (secs.length > 1) for (const e of secs) { const [X] = toS(e.at, 0); el("line", { x1: X, y1: 0, x2: X, y2: H, class: "sec" }, g); }
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
    sel.value = Math.min(CE.sec, secs.length - 1);
    $("ce-sec-at").closest(".field").hidden = secs.length < 2;
    $("ce-sec-at").value = secs.length > 1 ? secs[Math.min(CE.sec, secs.length - 1)].at : "";
    $("ce-sec-del").disabled = secs.length < 2;
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
  function show(view) {
    CE.view = view; CE.sel = -1; CE.mode = null; CE.scaleA = null;
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
  $("ce-fit").addEventListener("click", () => { fit(); draw(); });
  $("ce-sec").addEventListener("change", (e) => { CE.sec = +e.target.value; CE.sel = -1; table(); draw(); });
  $("ce-sec-add").addEventListener("click", () => {   // another section, a copy of this one, 20 mm on (or the cap's other half)
    const sh = shapeNow(), secs = sections(sh), V = S.views(S.clean(sh)), cur = secs[Math.min(CE.sec, secs.length - 1)];
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
    if (commit(sh)) { CE.sec = 0; table(); draw(); }
  });
  $("ce-sec-at").addEventListener("change", (e) => {
    const v = Number(e.target.value), sh = shapeNow(), secs = sections(sh);
    if (!Number.isFinite(v) || secs.length < 2) return;
    secs[Math.min(CE.sec, secs.length - 1)].at = v;
    sh.section = secs;
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
  function capEditOpen(on) {
    const was = !$("ce").hidden;
    $("ce").hidden = !on;
    for (const b of document.querySelectorAll('[data-act="shape"]')) b.setAttribute("aria-pressed", String(on));   // the motor cap's Edit shape (router_inspect.js)
    if (on && !was) { CE.cam = {}; show(CE.view); }
    if (typeof rtiShow === "function") rtiShow();   // the inspector steps aside for it (router_inspect.js)
    if (on !== was) fitRoom(); else viewRoom();
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
  window.capEditRoom = viewRoom;
  window.capEditFit = fitRoom;
  window.capEditView = () => Object.assign({ view: CE.view }, cam());   // (tests: the view's px a mm)
})();
