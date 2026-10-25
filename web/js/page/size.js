// lr4-sandbox page, part 4 of 12: size inputs, V1E calculator, cut list, strut plate drawing + downloads.
// The page's scripts share one global scope (js/page/*.js, loaded in order by index.html): names declared
// at the top level here are seen by the later files.
  // ---- size inputs, V1E calculator, cut list, strut plate drawing + downloads ----
  const EMT_STICK = 3048, KERF = 3, XZ = 6.5;
  const U = { unit: "in", cutX: 26 * IN, cutY: 50 * IN, braces: 0, struts: "mdf", base: "sheet" };
  const $ = (id) => document.getElementById(id);
  const disp = (mm) => U.unit === "in" ? mm / IN : mm;
  function frac(v) {                                  // 32.625 -> 32 5/8
    const t = Math.round(v * 8), w = Math.floor(t / 8), e = t - w * 8;
    if (!e) return `${w}`;
    const g = e % 4 === 0 ? 4 : e % 2 === 0 ? 2 : 1;
    return `${w} ${e / g}/${8 / g}`;
  }
  const show = (v) => U.unit === "in" ? `${frac(v)}"` : `${+v.toFixed(3)} mm`;
  const other = (mm) => U.unit === "in" ? `${Math.round(mm)} mm` : `${(mm / IN).toFixed(2)}"`;
  function sticks(lengths) {                          // first-fit decreasing over 10 ft sticks
    const bins = [];
    for (const L of [...lengths].sort((a, b) => b - a)) {
      const i = bins.findIndex((b) => b + L + KERF <= EMT_STICK);
      if (i >= 0) bins[i] += L + KERF; else bins.push(L + KERF);
    }
    return bins.length;
  }
  function calcNumbers() {                           // calculator.js: mm, plus the display (inches: up to 1/8")
    const c = LR4Calc.calc(S.cutX, S.cutY, XZ), i = LR4Calc.inches(c);
    const d = U.unit === "in" ? i : Object.fromEntries(Object.entries(c).map(([k, v]) => [k, LR4Calc.up8(v)]));  // V1E's mm display
    return { ...c, belt: c.belt_total, d: { ...d, belt: d.belt_total } };
  }
  function updateCalc() {
    const c = calcNumbers();
    const row = (label, d, mm) => `<tr><td>${label}</td><td>${show(d)}<small>${other(mm)}</small></td></tr>`;
    $("calc").tBodies[0].innerHTML =
      row("Strut plates (2)", c.d.strut, c.strut) +
      row('X rails, 1" EMT (2)', c.d.xrails, c.xrails) +
      row('Y rail, 1" EMT', c.d.yrail, c.yrail) +
      row("Belt along X", c.d.xbelt, c.xbelt) +
      row("Belts along Y (2)", c.d.ybelt, c.ybelt) +
      row("Belt total, GT2 10 mm", c.d.belt, c.belt) +
      `<tr><td>Footprint (min)</td><td>${show(c.d.xtable)} &times; ${show(c.d.ytable)}</td></tr>` +
      `<tr><td>Table in the model</td><td>${frac(S.TW / IN)} &times; ${frac(S.TL / IN)}"</td></tr>` +
      `<tr><td>EMT, 10 ft sticks</td><td>${sticks([c.xrails, c.xrails, c.yrail])}</td></tr>`;
  }
  function drawPlates() {
    const H = StrutPlate.H, L = S.strut, padX = 4, label = 34, gapY = 22;
    let y = 0;
    const parts = [];
    for (const [name, mp, w] of [["FRONT", platePolys.front, WING], ["BOTTOM", platePolys.bottom, 5.5]]) {
      const yTop = y + label + w + H;
      const d = mp.flatMap((poly) => poly).map((r) => "M" + r.slice(0, -1).map(([px, py]) =>
        `${(px + padX).toFixed(2)},${(yTop - py).toFixed(2)}`).join("L") + "Z").join("");
      parts.push(`<text class="plate-name" x="${padX}" y="${y + 26}">${name}</text>`, `<path class="plate-fill" d="${d}"/>`);
      y = yTop + w + gapY;
    }
    const yp = y + 6, yd = y + 58, x0 = padX, x1 = padX + L, h0 = padX + 9, h1 = padX + 9 + S.pitch;
    const dim = (mm, d) => U.unit === "in" ? `${frac(mm / IN)}" (${mm.toFixed(d)} mm)` : `${mm.toFixed(d)} mm`;
    parts.push(`<path class="dim" d="M${h0},${yp - 8}V${yp + 8}M${h1},${yp - 8}V${yp + 8}M${h0},${yp}H${h1}"/>`,
      `<text class="dim-text" x="${h1 + 10}" y="${yp + 10}">${dim(S.pitch, 2)} pitch</text>`,
      `<path class="dim" d="M${x0},${yd - 8}V${yd + 8}M${x1},${yd - 8}V${yd + 8}M${x0},${yd}H${x1}"/>`,
      `<text class="dim-text" x="${(x0 + x1) / 2}" y="${yd + 34}" text-anchor="middle">${dim(L, 0)}</text>`);
    $("plate-draw").innerHTML = `<svg viewBox="0 0 ${L + 2 * padX} ${yd + 42}" role="img" ` +
      `aria-label="Front and bottom strut plates, ${L} mm long, ${S.n} braces">${parts.join("")}</svg>`;
  }
  function updateText() {
    $("tb-size").textContent = U.unit === "in" ? `${+(S.cutX / IN).toFixed(2)} × ${+(S.cutY / IN).toFixed(2)} in cutting area`
      : `${Math.round(S.cutX)} × ${Math.round(S.cutY)} mm cutting area`;
    $("sub").textContent = `V1E LowRider 4 for a ${+(S.cutX / IN).toFixed(2)} × ${+(S.cutY / IN).toFixed(2)} in cutting area, ` +
      `on a ${frac(S.TW / IN)} × ${frac(S.TL / IN)} in ${S.base === "torsion" ? "torsion box" : "MDF sheet"} table. Every printed part is the official STL, placed from its holes.`;
    const sel = $("braces"), want = String(U.braces);
    const pitch = (n) => { const mm = (S.strut - 18) / (n - 1); return U.unit === "in" ? `${frac(mm / IN)}"` : `${mm.toFixed(1)} mm`; };
    sel.innerHTML = `<option value="0">Auto: ${S.auto} braces, ${pitch(S.auto)} pitch</option>` +
      [S.auto - 1, S.auto + 1, S.auto + 2].filter((n) => n >= 3).map((n) =>
        `<option value="${n}">${n} braces, ${pitch(n)} pitch</option>`).join("");
    sel.value = [...sel.options].some((o) => o.value === want) ? want : "0";
    const v = cfg.verified, warn = [];
    if (S.strut < v.strut[0] || S.strut > v.strut[1] || S.n < v.braces[0] || S.n > v.braces[1])
      warn.push(`Outside the sizes checked against FreeCAD builds (strut ${v.strut[0]}–${v.strut[1]} mm, ` +
        `${v.braces[0]}–${v.braces[1]} braces): parts are placed by extrapolation.`);
    if (S.cutX > 1600 || S.cutY > 3000) warn.push("Big machine: V1E suggests staying within about 4 × 8 ft of cutting area.");
    if (S.pitch - 18 < 60) warn.push(`Brace gaps are only ${(S.pitch - 18).toFixed(0)} mm. Use fewer braces.`);
    if (S.tempBlocked)
      warn.push(`Temporary struts need 4 or more braces (this size has ${S.n}), so the MDF plates are shown.`);
    if (!LR4Model.jp3Fits(cfg, S))
      warn.push(`The Jackpot3 box doesn't fit between braces 1 and 2 at ${S.bay0.toFixed(1)} mm pitch ` +
        `(needs ${cfg.jp3.min_pitch.toFixed(1)} mm), so it's hidden. Use fewer braces or mount it elsewhere.`);
    $("warnings").innerHTML = warn.map((w) => `<p class="warn">${w}</p>`).join("");
  }
  let pending = 0;
  function applySize(now) {
    clearTimeout(pending);
    const go = () => {
      S = LR4Model.size(U.cutX, U.cutY, U.braces, U.struts, U.base);
      updateText();
      updateCalc();
      rebuild();
      drawPlates();
      camNote();
      updateYaml();
    };
    if (now) go(); else pending = setTimeout(go, 250);
  }
  const lenFields = { "cut-x": "cutX", "cut-y": "cutY" };
  function fillInputs() {
    for (const [id, k] of Object.entries(lenFields)) $(id).value = +disp(U[k]).toFixed(U.unit === "in" ? 3 : 1);
    document.querySelectorAll(".u").forEach((u) => (u.textContent = U.unit === "in" ? "in" : "mm"));
    $("u-in").setAttribute("aria-pressed", String(U.unit === "in"));
    $("u-mm").setAttribute("aria-pressed", String(U.unit === "mm"));
  }
  function setupSize() {
    try {                                            // last size used in this browser
      const saved = JSON.parse(localStorage.getItem("lr4-config-size") || "null");
      if (saved && saved.cutX > 0 && saved.cutY > 0) Object.assign(U, saved);
    } catch (e) { /* defaults */ }
    const hm = /^#(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:&|$)/.exec(location.hash);   // deep link: #48x96 = 48 x 96 in (+ applyLink)
    if (hm) Object.assign(U, { cutX: +hm[1] * IN, cutY: +hm[2] * IN, braces: 0 });
    const keep = () => { try { localStorage.setItem("lr4-config-size", JSON.stringify(U)); } catch (e) { /* not kept */ } };
    for (const [id, k] of Object.entries(lenFields)) $(id).addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (!isFinite(v) || v <= 0) return;
      const mm = U.unit === "in" ? v * IN : v;
      if (mm < 200 || mm > 4000) return;             // ignore half-typed numbers
      U[k] = mm; U.braces = 0; keep(); applySize();
    });
    $("braces").addEventListener("change", (e) => { U.braces = parseInt(e.target.value, 10); keep(); applySize(true); });
    // Strut plates: Permanent (the MDF plates the machine cuts) or Temporary (V1E's 4 printed Temp_Strut_v1 it runs
    // on until then: the end braces sit 180 mm from the next) - fit_config.py cfg.temp, config_model.js S.struts
    const sv = $("strut-variant");
    sv.hidden = !cfg.temp;
    if (!cfg.temp) U.struts = "mdf";
    const markStruts = () => sv.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === U.struts)));
    sv.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (U.struts === b.dataset.v) return;
      U.struts = b.dataset.v; keep(); markStruts(); applySize(true);
    }));
    markStruts();
    // Table base (Part 33): the MDF sheet or the plywood torsion box under the spoilboard + rail strips (table_model.js)
    if (!LR4Table.KINDS.includes(U.base)) U.base = "sheet";
    const tv = $("table-variant");
    const markBase = () => tv.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === U.base)));
    tv.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      if (U.base === b.dataset.v) return;
      U.base = b.dataset.v; keep(); markBase(); applySize(true);
    }));
    markBase();
    $("u-in").addEventListener("click", () => { U.unit = "in"; keep(); fillInputs(); updateCalc(); updateText(); drawPlates(); });
    $("u-mm").addEventListener("click", () => { U.unit = "mm"; keep(); fillInputs(); updateCalc(); updateText(); drawPlates(); });
    fillInputs();
    applySize(true);
  }

  // downloads: a plain browser download
  const dlStatus = (t, id = "dl-status") => { $(id).textContent = t; };
  function save(filename, data, id = "dl-status") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    dlStatus(`Saved ${filename}`, id);
  }

