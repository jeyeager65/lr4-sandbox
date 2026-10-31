// lr4-sandbox page: the router editor's inspector (Part 48b, private/ROUTER_BUILDER_REVIEW.md: "pick on the model, edit
// in one inspector"). Docked on the right of the router editor: every setting of what's picked (RX.sel, router_edit.js;
// nothing picked = the Router itself: name, kind, speeds, collets), from the one table LR4RouterSchema - sizes as a
// slider + a number, options as buttons, its color + finish (Look). Changes go through the builder's rbSet / rbLook
// (router_build.js), so its rules and undo hold. The page's scripts share one global scope. ----
  const RTI = { sig: "", slide: null };
  const rtiEl = $("rti"), rtiBody = $("rti-body");
  const rtiPart = () => {                              // the item shown: what's picked, if it's an item, else the Router
    const id = typeof RX !== "undefined" && RX.sel, p = LR4Routers.preset(rbCur());
    return id && LR4RouterSchema.PARTS.some((P) => P.id === id) && LR4RouterSchema.partShown(id, p.model) ? id : "router";
  };
  const rtiCsg = () => !!(window.LR4Csg && LR4Csg.ready());   // the dial's slot + surround need the geometry booleans
  function rtiRange(r, v) {                           // a slider's travel, fixed while the rows stand: the row's range,
    if (r.kind === "ang" || r.kind === "count" || r.max - r.min <= 60) return [r.min, r.max];   // a long one cut to ~2x the value
    return [r.min, Math.min(r.max, Math.max(r.min + 20, Math.ceil(Math.abs(+v || 0) * 2), 60))];
  }
  const rtiEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));


  // the rows, again when the item or its set of rows changes (a choice can bring rows in: the dial's window)
  function rtiShow() {
    const on = typeof rbViewing === "function" && rbViewing() && $("ce").hidden;   // (the shape editor docks there for now)
    rtiEl.hidden = !on;
    if (typeof capEditRoom === "function") capEditRoom();
    if (!on) { RTI.sig = ""; return; }
    const id = rtiPart(), p = LR4Routers.preset(rbCur()), m = p.model, S = LR4RouterSchema;
    const rows = S.rows(id, p, { csg: rtiCsg() }), sig = id + "|" + rows.map((r) => r.k + ":" + S.labelOf(r, m)).join(",");
    if (sig === RTI.sig) return rtiSync();
    RTI.sig = sig;
    const top = rtiBody.scrollTop, same = rtiEl.dataset.part === id;
    rtiEl.dataset.part = id;
    $("rti-h").textContent = id === "router" ? p.name : S.partLabel(id, m);
    $("rti-x").hidden = id === "router";
    const sh = S.shown(p);
    let html = "";
    for (const g of S.groups(rows)) {
      html += `<h4>${rtiEsc(g)}</h4>`;
      for (const r of rows.filter((q) => q.group === g)) {
        const l = rtiEsc(S.labelOf(r, m)), k = rtiEsc(r.k), v = S.value(p, r.k, sh), tip = r.help ? ` title="${rtiEsc(r.help)}"` : "";
        if (["len", "ang", "count", "num", "rpm"].includes(r.kind)) {
          const [lo, hi] = rtiRange(r, v), slide = r.kind !== "rpm";
          html += `<label class="rti-row${slide ? "" : " rti-ns"}" data-k="${k}"${tip}><span>${l}</span>` +
            (slide ? `<input type="range" min="${lo}" max="${hi}" step="${r.step || 0.5}" aria-label="${l}">` : "") +
            `<input type="number" step="any" aria-label="${l}"><em>${rtiEsc(r.unit)}</em></label>`;
        } else if (r.kind === "choice") {
          html += `<div class="rti-opt" data-k="${k}" role="group" aria-label="${l}"${tip}><span>${l}</span>` +
            r.opts.map(([ov, ol]) => `<button type="button" data-v="${rtiEsc(ov)}" aria-pressed="false">${rtiEsc(ol)}</button>`).join("") + "</div>";
        } else if (r.kind === "bool") {
          html += `<label class="check rti-bool" data-k="${k}"${tip}><input type="checkbox"> ${l}</label>`;
        } else if (r.kind === "select") {
          html += `<label class="rti-row rti-sel" data-k="${k}"${tip}><span>${l}</span><select>` +
            r.opts.map(([ov, ol]) => `<option value="${rtiEsc(ov)}">${rtiEsc(ol)}</option>`).join("") + "</select></label>";
        } else if (r.kind === "text" || r.kind === "list") {
          html += `<label class="rti-row rti-text" data-k="${k}"${tip}><span>${l}</span><input type="text" maxlength="${r.kind === "text" ? 40 : 120}"><em>${rtiEsc(r.unit)}</em></label>`;
        } else if (r.kind === "look") {
          html += `<div class="rti-row rti-look" data-k="${k}"${tip}><span>${l}</span><input type="color" aria-label="${l} color">` +
            `<select aria-label="${l} finish">${LR4Routers.FINISHES.map((f) => `<option value="${f}">${f[0].toUpperCase() + f.slice(1)}</option>`).join("")}</select></div>`;
        } else if (r.kind === "action") {
          html += `<div class="rti-act" data-k="${k}"${tip}><button type="button" data-act="${k}">${rtiEsc(r.label2 || l)}</button></div>`;
        }
      }
    }
    rtiBody.innerHTML = html;
    if (same) rtiBody.scrollTop = top;
    // the "?": this item's help, each row with its line
    $("help-rti").innerHTML = `<p><b>${rtiEsc(id === "router" ? "The router" : S.partLabel(id, m))}</b>${id === "router" ? ": what isn't a part's shape - its name, speeds and collets. Click a part on the model to edit it." : " - its settings. Sizes in mm; drag a slider or type a number."}</p>` +
      rows.filter((r) => r.help).map((r) => `<p><b>${rtiEsc(S.labelOf(r, m))}:</b> ${rtiEsc(r.help)}</p>`).join("");
    rtiSync();
  }
  // the values from the router (not the one being typed / slid)
  function rtiSync() {
    if (rtiEl.hidden || !RTI.sig) return;
    const p = LR4Routers.preset(rbCur()), sh = LR4RouterSchema.shown(p), val = (k) => LR4RouterSchema.value(p, k, sh);
    if (rtiEl.dataset.part === "router") $("rti-h").textContent = p.name;
    for (const el of rtiBody.querySelectorAll("[data-k]")) {
      const v = val(el.dataset.k);
      if (el.classList.contains("rti-opt")) { for (const b of el.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === String(v))); continue; }
      if (el.classList.contains("rti-bool")) { el.querySelector("input").checked = !!v; continue; }
      if (el.classList.contains("rti-look")) {
        const L = p.model.looks[el.dataset.k.slice(6)];
        const [c, f] = el.querySelectorAll("input, select");
        if (L && document.activeElement !== c) c.value = rbHex(L.c);
        if (L) f.value = L.f;
        continue;
      }
      for (const inp of el.querySelectorAll("input, select")) {
        if (document.activeElement === inp || RTI.slide === inp) continue;
        inp.value = v === undefined || v === null ? "" : v;
      }
    }
  }
  // edits: into the builder (rbSet / rbLook); a number on input (one rebuild when typing pauses), a choice at once
  rtiBody.addEventListener("input", (e) => {
    const t = e.target, row = t.closest("[data-k]");
    if (!row) return;
    const k = row.dataset.k;
    if (row.classList.contains("rti-look")) { if (t.type === "color") rbLook(k.slice(6), { c: t.value }); return; }
    if (row.classList.contains("rti-text")) { if (k === "name") rbSet(k, t.value); return; }   // the collet list: on change
    if (t.type !== "range" && t.type !== "number") return;
    if (t.value === "") return;
    const v = Number(t.value);
    if (!Number.isFinite(v)) return;
    for (const o of row.querySelectorAll("input")) if (o !== t) o.value = v;   // the slider + the number together
    RTI.slide = t.type === "range" ? t : null;
    rbSet(k, v);
  });
  rtiBody.addEventListener("change", (e) => {
    const t = e.target, row = t.closest("[data-k]");
    RTI.slide = null;
    if (!row) return;
    const k = row.dataset.k;
    if (row.classList.contains("rti-look")) { if (t.tagName === "SELECT") rbLook(k.slice(6), { f: t.value }); return; }
    if (row.classList.contains("rti-bool")) return rbSet(k, t.checked);
    if (row.classList.contains("rti-sel")) return rbSet(k, t.value);
    if (row.classList.contains("rti-text") && k !== "name") return rbSet(k, t.value);
  });
  rtiBody.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "shape") { $("rb-shape").click(); return; }   // the shape editor (cap_edit.js)
    const row = b.closest(".rti-opt");
    if (row && b.dataset.v) rbSet(row.dataset.k, b.dataset.v);
  });
  $("rti-x").addEventListener("click", () => { if (typeof rxPick === "function") rxPick(null); });
  // tests
  window.LR4RouterInspect = { part: () => (rtiEl.hidden ? null : rtiEl.dataset.part), rows: () => [...rtiBody.querySelectorAll("[data-k]")].map((el) => el.dataset.k) };
