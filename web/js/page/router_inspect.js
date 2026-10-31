// lr4-sandbox page: the router editor's inspector (Part 48b, private/ROUTER_BUILDER_REVIEW.md: "pick on the model, edit
// in one inspector"). Docked on the right of the router editor: every setting of what's picked (RX.sel, router_edit.js;
// nothing picked = the Router itself: name, kind, speeds, collets), from the one table LR4RouterSchema - sizes as a
// slider + a number, options as buttons, its color + finish (Look). Changes go through the builder's rbSet / rbLook
// (router_build.js), so its rules and undo hold. Part 48c: the outline in the left column lists the parts (pick one
// there too), "+ Add a part" / ✕ put optional ones on and take them off. The page's scripts share one global scope. ----
  const RTI = { sig: "", slide: null, outline: "" };
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
  const rtiCtx = () => { const C = typeof rtClamps === "function" && rtClamps(); return { clampDef: C ? C.def : undefined }; };   // the build's clamp height

  // ---- the Fit checklist (Part 48d) on the Router item: the numbers that matter for the machine, ticked as you measure
  // them (kept per router in this machine: kv lr4-rb-fit), each with how to measure it and a drawing ----
  const FIT_KEY = "lr4-rb-fit";
  const fitDone = () => { try { return JSON.parse(kvGet(FIT_KEY) || "{}")[rbCur()] || []; } catch (e) { return []; } };
  function fitMark(id, on) {
    let all = {};
    try { all = JSON.parse(kvGet(FIT_KEY) || "{}") || {}; } catch (e) { /* new */ }
    const got = new Set(all[rbCur()] || []);
    if (on) got.add(id); else got.delete(id);
    all[rbCur()] = [...got];
    kvSet(FIT_KEY, JSON.stringify(all));
  }
  // the drawings: a side view of a router (its head, the round part, the nut) with what's measured in the accent
  const FIT_BODY = '<rect x="52" y="8" width="56" height="22" rx="5"/><rect x="62" y="30" width="36" height="34"/><rect x="72" y="64" width="16" height="6"/>';
  const ARR = (x1, y1, x2, y2) => `<line class="a" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><circle class="a" cx="${x1}" cy="${y1}" r="1.6"/><circle class="a" cx="${x2}" cy="${y2}" r="1.6"/>`;
  const FIT_SVG = {
    grip: FIT_BODY + ARR(62, 47, 98, 47) + '<path class="t" d="M58 40v14M102 40v14"/>',
    clamp: FIT_BODY + '<rect class="t" x="56" y="50" width="48" height="7" rx="1"/>' + ARR(112, 70, 112, 57) + '<path class="t" d="M88 70h28M104 57h12"/>',
    overall: FIT_BODY + ARR(118, 8, 118, 70) + '<path class="t" d="M108 8h14M90 70h32"/>',
    head: FIT_BODY + ARR(52, 4, 108, 4) + ARR(116, 8, 116, 30),
    collets: '<path d="M64 20l6 40h20l6-40z"/><path d="M70 28l20 0M68 40h24"/><rect class="a" x="77" y="6" width="6" height="64" rx="1"/>',
    speeds: '<circle cx="80" cy="38" r="26"/><circle cx="80" cy="38" r="4"/>' + [1, 2, 3, 4, 5, 6].map((n, i) => { const a = (-210 + i * 48) * Math.PI / 180;
      return `<text class="a" x="${(80 + 18 * Math.cos(a)).toFixed(1)}" y="${(41 + 18 * Math.sin(a)).toFixed(1)}" text-anchor="middle">${n}</text>`; }).join(""),
  };
  function fitHtml(m) {
    const S = LR4RouterSchema, spin = m.kind === "spindle", items = S.FIT.filter((f) => !f.only || (f.only === "s") === spin);
    return '<h4 class="rti-fit-h"><span>Fit</span> <em id="rti-fit-n"></em></h4><p class="foot rti-fit-why">What decides how it sits in the machine. ' +
      "Measure these on yours; the rest is how it looks.</p>" + items.map((f) => `<div class="rti-fit" data-fit="${f.id}">` +
      `<label class="check"><input type="checkbox" aria-label="${rtiEsc(f.label)} measured"> ${rtiEsc(f.label)}</label><b class="rti-fv"></b>` +
      `<button type="button" data-go="${spin && f.spinGo ? f.spinGo : f.go}" data-key="${rtiEsc(f.key)}" title="Go to its setting">Set</button>` +
      `<details><summary>How to measure</summary><div class="rti-how"><svg viewBox="0 0 160 76" aria-hidden="true">${FIT_SVG[f.id] || ""}</svg>` +
      `<p>${rtiEsc(f.how)}</p></div></details></div>`).join("");
  }
  function fitSync(p, sh) {
    const done = new Set(fitDone()), els = [...rtiBody.querySelectorAll(".rti-fit")];
    for (const el of els) {
      const f = LR4RouterSchema.FIT.find((q) => q.id === el.dataset.fit);
      el.querySelector(".rti-fv").textContent = f.value(p, sh);
      el.querySelector("input").checked = done.has(f.id);
      el.classList.toggle("done", done.has(f.id));
    }
    const n = $("rti-fit-n");
    if (n) n.textContent = `${els.filter((el) => done.has(el.dataset.fit)).length} of ${els.length} measured`;
  }
  // Start from a preset: the shape, mount and speeds of a built-in router, the name kept (one undo step)
  function presetHtml(p) {
    const opts = Object.entries(LR4RouterData.routers).map(([k, r]) => `<option value="${rtiEsc(k)}">${rtiEsc(r.name)}</option>`).join("");
    return '<div class="rti-row rti-preset"><span>Start from</span><select aria-label="Start from a preset"><option value="">a preset…</option>' + opts +
      '</select></div><p class="foot">Shapes this router like the one you pick (its name stays): then change what differs.</p>';
  }

  // ---- the outline (Part 48c): the parts nut up, the picked one lit; an optional one has ✕; + Add a part ----
  function rtoShow() {
    const S = LR4RouterSchema, m = LR4Routers.preset(rbCur()).model, sel = rtiPart();
    const items = S.PARTS.filter((P) => S.partShown(P.id, m)).map((P) => {
      const l = rtiEsc(S.partLabel(P.id, m));
      return `<div class="rto-it${P.under ? " rto-sub" : ""}"><button type="button" class="rto-b" data-id="${P.id}">${l}</button>` +
        (P.feature ? `<button type="button" class="rto-rm" data-rm="${P.feature}" aria-label="Take off: ${l}" title="Take it off">✕</button>` : "") + "</div>";
    }).join("");
    const adds = S.FEATURES.filter((F) => (!F.only || (F.only === "s") === (m.kind === "spindle")) && !F.has(m));
    const menu = adds.map((F) => `<button type="button" role="menuitem" data-add="${F.id}">${rtiEsc(F.label)}</button>`).join("");
    if (items + menu !== RTI.outline) {
      RTI.outline = items + menu;
      $("rto").innerHTML = items;
      $("rto-menu").innerHTML = menu;
    }
    $("rto-add").hidden = !adds.length;
    if (!adds.length) rtoMenu(false);
    for (const b of $("rto").querySelectorAll(".rto-b")) b.toggleAttribute("aria-current", b.dataset.id === sel);
  }
  function rtoMenu(on) { $("rto-menu").hidden = !on; $("rto-add").setAttribute("aria-expanded", String(on)); }
  $("rto").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]"), b = e.target.closest("[data-id]");
    if (rm) {                                         // off (undo puts it back); picked: back to the router
      const F = LR4RouterSchema.FEATURES.find((f) => f.id === rm.dataset.rm);
      if (F && RX.sel === F.part) rxPick(null);
      rbFeature(rm.dataset.rm, false);
      rbMsg(`Took off: ${F ? F.label : rm.dataset.rm}. Undo puts it back.`);
    } else if (b) rxPick(b.dataset.id === "router" ? null : b.dataset.id);
  });
  $("rto-add").addEventListener("click", () => rtoMenu($("rto-menu").hidden));
  $("rto-menu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    const F = LR4RouterSchema.FEATURES.find((f) => f.id === b.dataset.add);
    rtoMenu(false);
    rbFeature(F.id, true);
    rxPick(F.part);                                   // picked: its numbers + settings
  });
  document.addEventListener("pointerdown", (e) => { if (!$("rto-menu").hidden && !e.target.closest(".rto-add")) rtoMenu(false); });
  $("rto-menu").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); rtoMenu(false); $("rto-add").focus(); } });

  // the rows, again when the item or its set of rows changes (a choice can bring rows in: the dial's window)
  function rtiShow() {
    const view = typeof rbViewing === "function" && rbViewing(), on = view && $("ce").hidden;   // (the shape editor docks there for now)
    rtiEl.hidden = !on;
    if (view) rtoShow();
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
    const sh = S.shown(p, rtiCtx());
    let html = '<div class="rti-notes" aria-live="polite"></div>' + (id === "router" ? presetHtml(p) + fitHtml(m) : "");
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
        } else if (r.kind === "bool" || r.kind === "has") {
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
    const p = LR4Routers.preset(rbCur()), sh = LR4RouterSchema.shown(p, rtiCtx()), val = (k) => LR4RouterSchema.value(p, k, sh);
    if (rtiEl.dataset.part === "router") $("rti-h").textContent = p.name;
    const notes = typeof rbNotes === "function" ? rbNotes(rtiEl.dataset.part) : [], nb = rtiBody.querySelector(".rti-notes");
    if (nb) { const h = notes.map((t) => `<p class="foot">${rtiEsc(t)}</p>`).join(""); if (nb.innerHTML !== h) nb.innerHTML = h; }
    fitSync(p, sh);
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
    const fit = t.closest(".rti-fit");
    if (fit && t.type === "checkbox") { fitMark(fit.dataset.fit, t.checked); return rtiSync(); }
    if (t.closest(".rti-preset")) { if (t.value) rbFromPreset(t.value); t.value = ""; return; }
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
    if (b.dataset.go) {                               // a Fit item's Set: its part picked, its row in view
      if (b.dataset.go === "router") rxPick(null); else rxPick(b.dataset.go);
      const r = rtiBody.querySelector(`[data-k="${b.dataset.key}"]`);
      if (r) { r.scrollIntoView({ block: "center" }); const f = r.querySelector("input, select, button"); if (f) f.focus(); }
      return;
    }
    if (b.dataset.act === "shape") { if (typeof capEditToggle === "function") capEditToggle(); return; }   // the shape editor (cap_edit.js)
    const row = b.closest(".rti-opt");
    if (row && b.dataset.v) rbSet(row.dataset.k, b.dataset.v);
  });
  $("rti-x").addEventListener("click", () => { if (typeof rxPick === "function") rxPick(null); });
  // tests
  window.LR4RouterInspect = { part: () => (rtiEl.hidden ? null : rtiEl.dataset.part), rows: () => [...rtiBody.querySelectorAll("[data-k]")].map((el) => el.dataset.k),
    fit: () => [...rtiBody.querySelectorAll(".rti-fit")].map((el) => [el.dataset.fit, el.querySelector(".rti-fv").textContent, el.querySelector("input").checked]) };
