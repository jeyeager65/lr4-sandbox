// Part 41 in headless Chrome: the front plate design. The template with its Example layer shown, uploaded through the
// file input: read (layers, curves), checked, in the strut job (T2 V-bit first) and carved into the 3D front plate.
// Another size sets it aside (the plate plain, the job without it); back to the size, it's back. A design with text
// not turned into paths is refused. Kept per machine (still there after a reload).
//   node tests/test_page_design.js   (not in npm test: needs Chrome + Python + parts/; ~1-2 min)
"use strict";
const fs = require("fs"), path = require("path");
const { CHROME, sleep, server, chromePage } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9190 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9800 + Math.floor(Math.random() * 100));
  const shot = process.env.LR4_SHOT;                 // a path: a screenshot of the carved plate there
  const loaded = async () => {
    for (let i = 0; i < 160; i++) {
      await sleep(500);
      try { if (await page.val("document.getElementById('status').hidden && !!window.MS && !!S.strut")) return true; } catch (e) { /* loading */ }
    }
    return false;
  };
  try {
    await sleep(800);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    ok(await loaded(), "page loaded");
    // the top bar's Get the files: from Run with the panel folded, back to Configure, unfolded, at step 6 (it threw
    // from 0.45.0 to 0.51.0: a removed showPanel)
    const tb = await page.val(`(() => { document.getElementById("t-run").click();
      if (!document.documentElement.classList.contains("p-off")) document.getElementById("col-p").click();
      try { document.getElementById("tb-files").click(); } catch (e) { return { err: String(e) }; }
      return { mode: document.documentElement.dataset.mode, off: document.documentElement.classList.contains("p-off"),
        open: document.getElementById("st-files").open }; })()`);
    ok(!tb.err && tb.mode !== "run" && !tb.off && tb.open, `Get the files opens Configure > 6 ${JSON.stringify(tb)}`);
    // upload the template with the Example shown
    const up = (svg, name) => page.val(`(async () => {
      const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(svg)}], ${JSON.stringify(name)}, { type: "image/svg+xml" }));
      const inp = document.getElementById("pd-file"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
      for (let i = 0; i < 100 && !(DESIGN.rec && DESIGN.rec.name === ${JSON.stringify(name)}); i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 300));
      return { ok: DESIGN.ok, checks: [...document.querySelectorAll("#pd-checks li")].map((l) => l.className + ": " + l.textContent),
        name: document.getElementById("pd-name").textContent };
    })()`);
    const tmpl = await page.val(`PlateDesign.template(polygonClipping, S.strut, { nbraces: S.n === S.auto ? 0 : S.n, wing: WING, dogbones: DOGBONE })`);
    const strut = await page.val("S.strut");
    ok(PlateDesignLen(tmpl) === +strut.toFixed(1), `template for this plate: ${PlateDesignLen(tmpl)} mm`);
    const a = await up(tmpl.replace(/(inkscape:label="Example"[^>]*) style="display:none"/, "$1"), "example.svg");
    ok(a.ok && a.name === "example.svg" && a.checks.some((c) => /^ok: In the strut plate G-code: 2 engraved lines, 1 pocket, 2 cut-throughs/.test(c)),
      `Example uploaded: ${a.checks.join(" | ")}`);
    const j = await page.val(`(() => { const g = camJob().gcode; return { t2: g.indexOf("\\nT2\\n"), t1: g.indexOf("\\nT1\\n"), tooldef: /ToolDef 2: SHAPE=vbit/.test(g),
      probes: (g.match(/^G38\\.2 /gm) || []).length, eng: /T2 Front plate engraving/.test(g), pk: /T1 Front plate pockets/.test(g), th: /T1 Front plate cut-throughs/.test(g),
      long: Math.max(...g.split("\\n").map((l) => new TextEncoder().encode(l).length)) }; })()`);
    ok(j.tooldef && j.t2 > 0 && j.t1 > j.t2 && j.probes === 2 && j.eng && j.pk && j.th && j.long <= 127, `strut job: T2 V-bit first, probed twice, the design's ops (${JSON.stringify(j)})`);
    const tl = await page.val(`(async () => { const r = await GcodePlay.load(camJob().gcode); const t = r.tools;
      return { t1: t.get(1) && t.get(1).shape, t2: t.get(2) && t.get(2).shape, angle: t.get(2) && t.get(2).angle, segs: r.segs.length,
        tools: [...new Set(r.segs.map((q) => q.toolNumber))].join() }; })()`);
    ok(tl.t1 === "flat" && tl.t2 === "vbit" && tl.angle === 90 && tl.tools === "2,1", `the page's parser: T1 flat, T2 ${tl.angle}° V-bit, moves by T${tl.tools} (${tl.segs} moves)`);
    // the 3D front plate: carved (the face lower where the pocket is), its outline the same
    const p = await page.val(`(() => {
      const m = meshes.find((q) => q.userData.name === "StrutPlate_Front"); m.geometry.computeBoundingBox();
      const plain = plateGeo.length !== undefined && new THREE.ExtrudeGeometry(plateShapes(platePolys.front), { depth: STRUT_T, bevelEnabled: false, curveSegments: 1 });
      plain.applyMatrix4(new THREE.Matrix4().set(...LR4Model.plateFrame(cfg, "StrutPlate_Front", S), 0, 0, 0, 1)); plain.computeBoundingBox();
      const b = m.geometry.boundingBox, c = plain.boundingBox, same = ["min", "max"].every((k) => ["x", "y", "z"].every((ax) => Math.abs(b[k][ax] - c[k][ax]) < 0.05));
      return { tris: m.geometry.attributes.position.count / 3, plain: plain.attributes.position.count / 3, same, cache: !!DESIGN.cache };
    })()`);
    ok(p.cache && p.tris > p.plain * 3 && p.same, `3D front plate carved: ${p.tris} triangles (plain ${p.plain}), same outline box`);
    if (shot) {
      await page.val(`(async () => { LR4Inspect.open("StrutPlate_Front"); await new Promise((r) => setTimeout(r, 2500)); return true; })()`);
      const s = await page.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(shot, Buffer.from(s.data, "base64"));
      await page.val("LR4Inspect.close(), true");
    }
    // painted: the uncut face in the paint, the cuts in the material
    const pt = await page.val(`(() => { FIL.s.plates.front.paint = "#ff0000"; applyColours(true);
      const g = meshes.find((q) => q.userData.name === "StrutPlate_Front").geometry, c = g.attributes.color.array, mask = g.userData.paint;
      let red = 0, other = 0; for (let i = 0; i < mask.length; i++) (c[3 * i] > 0.99 && c[3 * i + 1] < 0.01 ? red++ : other++);
      const painted = mask.reduce((s, v) => s + v, 0); FIL.s.plates.front.paint = null; applyColours(true);
      return { red, other, painted, after: g.attributes.color.array[0] }; })()`);
    ok(pt.red === pt.painted && pt.red > 0 && pt.other > 0 && pt.after < 0.99, `painted: ${pt.red} face vertices red, ${pt.other} in the material (cuts, walls, edges); off again`);
    // another size: set aside; back: the design again
    const other = await page.val(`(async () => { const i = document.getElementById("cut-x"); i.value = "30"; i.dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 2500)); return { ok: DESIGN.ok, strut: S.strut, checks: [...document.querySelectorAll("#pd-checks li")].map((l) => l.textContent),
        t2: /\\nT2\\n/.test(camJob().gcode), tris: meshes.find((q) => q.userData.name === "StrutPlate_Front").geometry.attributes.position.count / 3 }; })()`);
    ok(!other.ok && !other.t2 && other.checks.some((c) => /^Made for a [\d.]+ mm plate/.test(c)), `another size (${other.strut} mm): set aside, the job without it (${other.checks[0]})`);
    const back = await page.val(`(async () => { const i = document.getElementById("cut-x"); i.value = "26"; i.dispatchEvent(new Event("input"));
      await new Promise((r) => setTimeout(r, 2500)); return { ok: DESIGN.ok, t2: /\\nT2\\n/.test(camJob().gcode) }; })()`);
    ok(back.ok && back.t2, "back to 26 x 50: the design again");
    // kept per machine: a reload brings it back
    await page.send("Page.navigate", { url: "about:blank" }); await sleep(300);
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    await loaded(); await sleep(1500);
    ok(await page.val("DESIGN.ok && DESIGN.rec.name === 'example.svg'"), "after a reload: still there");
    // text not turned into paths: refused
    const t = await up(tmpl.replace(/(inkscape:label="Engrave"[^>]*>)/, `$1<text x="300" y="-30" font-size="8">Hello</text>`), "text.svg");
    ok(!t.ok && t.checks.some((c) => /^bad: 1 text object not turned into paths/.test(c)), `text in Engrave: refused (${t.checks.join(" | ")})`);
    // Remove (answered yes)
    const r = await page.val(`(async () => { askBox.auto = () => true; document.getElementById("pd-remove").click(); await new Promise((r) => setTimeout(r, 800));
      askBox.auto = null; return { rec: DESIGN.rec, name: document.getElementById("pd-name").textContent, t2: /\\nT2\\n/.test(camJob().gcode) }; })()`);
    ok(!r.rec && r.name === "none" && !r.t2, "Remove: no design, the job plain");
  } catch (e) {
    ok(false, "error: " + e.message);
  } finally {
    await page.close(); srv.kill();
    console.log(`${checks - fails}/${checks} passed`);
    process.exit(fails ? 1 : 0);
  }
})();

function PlateDesignLen(svg) { const m = /LR4 front strut plate ([\d.]+) mm/.exec(svg); return m ? +m[1] : null; }
