// Part 31 in headless Chrome (serve.py's headers), on FluidNC (Part 34): the machine set up by hand.
//  - stock put on the table by hand (On the table > Stock); a jog above it cuts nothing, jogs into it carve;
//  - the touch plate button lays the plate on what's under the bit (the stock here) and away again;
//  - a job with no (Stock:) runs on the hand stock; its cut through the stock carves the spoilboard, which keeps it
//    after a reload (IndexedDB);
//  - M6 to a bit the file doesn't define holds with the bit form; Resume puts it in and the job carves with it;
//  - the surfacing job (to the SD card) on the bare spoilboard lowers it to its depth: the 1 mm mark goes;
//  - New spoilboard starts fresh.
// Screenshot: build/hand_spoilboard.png.
//   node tests/test_page_hand.js   (not in npm test: needs Chrome + Python; ~3 min)
"use strict";
const fs = require("fs"), path = require("path");
const { ROOT, CHROME, sleep, server, chromePage, HELPERS } = require("./test_page_fluidnc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

const H_HELPERS = `
  window.H = {
    speed(k) { const sp = document.getElementById("ctl-speed"); sp.value = String(k); sp.dispatchEvent(new Event("change")); },
    async home() {                                   // FluidNC (booted with the page) homes at 10x
      await T.booted(null); await T.idle(); H.speed(10);
      document.getElementById("home").click(); await T.sleep(500);
      await T.until(() => LR4Ctl.homed() && /^Homed by FluidNC|^Homing failed/.test(document.getElementById("home-status").textContent), 180000);
      await T.idle(); LR4Ctl.sync();
      return LR4Ctl.homed();
    },
    async jog(dx, dy, dz, f = 3000) {                // a $J on FluidNC; resolves once it is idle again
      const p0 = LR4Ctl.pose();
      const r = await LR4FluidNC.command("$J=G91 G21 X" + dx.toFixed(3) + " Y" + dy.toFixed(3) + " Z" + dz.toFixed(3) + " F" + f);
      // it has started (Jog, or the model moved) before waiting for Idle: an early Idle report isn't the end of it
      await T.until(() => { LR4Ctl.sync(); return LR4Ctl.state() === "Jog" || LR4Ctl.pose().some((v, i) => Math.abs(v - p0[i]) > 0.01); }, 5000);
      await T.idle(); LR4Ctl.sync(); await T.sleep(200);
      return r.ok;
    },
    // to X / Y inches from the home trips (the old sliders' scale), the bit's tip zTip mm above the table
    async at(xIn, yIn, zTip) {
      const p = LR4Ctl.pose(), t = LR4Ctl.travel();
      return H.jog(xIn === null ? 0 : xIn * 25.4 + t.x[0] - p[0], yIn === null ? 0 : yIn * 25.4 + t.y[0] - p[1], zTip === null ? 0 : zTip - LR4Ctl.tip() - p[2]);
    },
    min(sim) { let m = Infinity; for (const v of sim.heights) m = Math.min(m, v); return m; },
    async play(text, name) {                         // Run on FluidNC (homed first)
      await LR4Job.add([new File([text], name)]);
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/" + name && LR4Job.tl(), 15000);
      document.getElementById("job-play").click();
      await T.until(() => LR4Job.running(), 20000);  // started (a stale "Done." from the last job isn't this one's)
    },
    pop: () => !document.getElementById("job-pop").hidden,
    done: () => !LR4Job.running() && /^Done\\./.test(document.getElementById("job-status").textContent),
  };
  window.confirm = () => true;
  true`;
const THROUGH = ["G21 G90", "T1", "G0 Z5", "G0 X20 Y20", "G1 Z-13 F600", "G1 X80 F1500", "G0 Z5", "M30", ""].join("\n");
const TWO = ["G21 G90", "T1", "G0 Z5", "G0 X20 Y40", "G1 Z-1 F600", "G1 X80 F1500", "G0 Z5", "T2 M6", "G0 X20 Y60",
  "G1 Z-1 F600", "G1 X80 F1500", "G0 Z5", "M30", ""].join("\n");

(async () => {
  if (!CHROME) { console.log("Chrome not found (set CHROME)"); process.exit(1); }
  const port = 9090 + Math.floor(Math.random() * 100), srv = server("headers", port);
  const page = await chromePage(9700 + Math.floor(Math.random() * 100));
  const load = async () => {
    await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/web/index.html?parts=/parts/#26x50` });
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500);
      try { up = await page.val("window.crossOriginIsolated === true && !!window.LR4Job && !!LR4Ctl.travel() && document.getElementById('status').hidden && !!LR4Job.spoil()"); } catch (e) { /* loading */ }
    }
    if (up) { await page.val(HELPERS); await page.val(H_HELPERS); }
    return up;
  };
  try {
    await sleep(800);
    ok(await load(), "page loaded, the spoilboard set up");
    // fresh board, home, then the hand stock: 100-300 x 100-300, 12 mm
    const a = await page.val(`(async () => {
      document.getElementById("t-run").click();
      document.getElementById("hs-new").click();
      // a known bit (the router's bit is kept in this browser: a run before may have left the 25.4 mm surfacing one,
      // which sticks out less, so Z can't reach 8 mm above the table)
      for (const [k, v] of [["shape", "flat"], ["d", 6.35], ["len", 0]]) document.querySelector('#hs-bit [data-k="' + k + '"]').value = v;
      document.getElementById("hs-bit-use").click();
      const out0 = { homed: await H.home() };
      for (const [id, v] of [["hs-x0", 100], ["hs-x1", 300], ["hs-y0", 100], ["hs-y1", 300], ["hs-t", 12]]) document.getElementById(id).value = v;
      document.getElementById("hs-use").click();
      await T.sleep(300);
      const s = LR4Job.handSim(), out = Object.assign(out0, { on: !!s, top: s && Math.max(...s.heights), name: document.getElementById("hs-stock-name").textContent });
      // a jog above the stock cuts nothing: to (203, 203), the tip 30 mm up
      await H.at(8, 8, 30);
      out.slid = H.min(s);
      // jogs into it carve: down 22 mm to 8 mm, then a slot 50.8 mm along X
      out.jogs = [await H.jog(0, 0, -22, 600), await H.jog(50.8, 0, 0, 1500)]; out.pose = LR4Ctl.pose(); out.state = LR4Ctl.state();
      out.cut = H.min(s); out.tip = LR4Job.hand().last;
      document.getElementById("ctl-plate").click(); await T.sleep(200);
      out.plate = { on: LR4Ctl.plate(), z: LR4Ctl.TOUCH_PLATE.stock, note: document.getElementById("hs-plate-note").textContent };
      await H.at(null, null, 30);
      document.getElementById("ctl-plate").click(); await T.sleep(200);
      out.plateOff = LR4Ctl.plate();
      out.spoil0 = H.min(LR4Job.spoil());
      return out;
    })()`);
    ok(a.on && Math.abs(a.top - 12) < 1e-6 && /200 × 200 × 12/.test(a.name), `hand stock on the table: ${JSON.stringify(a.name)}`);
    ok(a.homed && a.slid === 12, `homed; a jog above the stock cuts nothing: ${a.slid}`);
    ok(Math.abs(a.cut - 8) < 0.05, `the jogs carved it to 8 mm: ${a.cut} (tip ${JSON.stringify(a.tip)}, jogs ok ${a.jogs}, pose ${a.pose}, ${a.state})`);
    ok(a.plate.on && Math.abs(a.plate.z - 12) < 0.05 && /stock/.test(a.plate.note) && !a.plateOff, `touch plate on the stock, then away: ${JSON.stringify(a.plate)}`);
    ok(a.spoil0 === 0, "spoilboard untouched so far");

    // a job with no stock: the hand stock; its 13 mm cut goes 1 mm into the spoilboard
    const b = await page.val(`(async () => {
      await H.play(${JSON.stringify(THROUGH)}, "through.nc");
      await T.until(H.done, 60000);
      await T.sleep(2500);                              // the spoilboard saves 1.5 s after a cut
      return { stock: LR4Job.tl().stock, src: document.getElementById("job-src").textContent, spoil: H.min(LR4Job.spoil()) };
    })()`);
    ok(b.stock && b.stock.zmin === -12 && b.stock.xmin === 100 && /set up by hand/.test(b.src), `job on the hand stock: ${JSON.stringify(b.stock)}`);
    ok(Math.abs(b.spoil + 1) < 0.05, `through cut marks the spoilboard 1 mm: ${b.spoil}`);
    ok(await load(), "reloaded");
    const c = await page.val(`(async () => { await T.until(() => H.min(LR4Job.spoil()) < -0.5, 10000); return H.min(LR4Job.spoil()); })()`);
    ok(Math.abs(c + 1) < 0.05, `the spoilboard kept its cut over the reload: ${c}`);

    // M6 to an undefined T2: the popup asks; 3 mm in, it carves with it
    const d = await page.val(`(async () => {
      document.getElementById("t-run").click();
      await H.home();
      await H.play(${JSON.stringify(TWO)}, "two.nc");
      await T.until(H.pop, 120000);
      const out = { h: document.getElementById("job-pop-h").textContent, bit: !document.getElementById("job-pop-bit").hidden };
      document.querySelector('#job-pop-bit [data-k="d"]').value = 3;
      document.getElementById("job-resume").click();
      await T.until(H.done, 60000);
      out.t2 = LR4Job.tl().tools.get(2).diameter; out.router = LR4Job.hand().bit.d;
      return out;
    })()`);
    ok(/M6 T2/.test(d.h) && d.bit && d.t2 === 3 && d.router === 3, `M6 holds with the bit form; T2 = 3 mm, in the router: ${JSON.stringify(d)}`);

    // surfacing, stock off: 1.5 mm below the level takes the 1 mm mark away
    const e = await page.val(`(async () => {
      document.getElementById("hs-off").click();
      document.getElementById("hs-sz").value = 1.5;
      document.getElementById("hs-surf").click();
      await T.until(() => LR4Job.src() && LR4Job.src().name === "/LR4_surfacing.gcode" && LR4Job.tl(), 15000);
      const out = { stock: !!LR4Job.tl().stock, bit: LR4Job.tl().tools.get(1).diameter };
      H.speed(20);                                    // a long job: FluidNC at 20x
      document.getElementById("job-play").click();
      await T.until(() => LR4Job.running(), 20000);
      await T.until(H.done, 600000);
      await T.sleep(2000);                            // the note follows the save
      const s = LR4Job.spoil();
      out.min = H.min(s);
      out.note = document.getElementById("hs-spoil-note").textContent;
      const m = /Level now ([\\d.]+) mm below/.exec(out.note);
      out.level = m ? -Number(m[1]) : 0;
      document.getElementById("hs-show-stock").click();
      return out;
    })()`);
    ok(!e.stock && e.bit === 25.4, `surfacing job: bare spoilboard, 25.4 mm bit: ${JSON.stringify(e)}`);
    ok(Math.abs(e.level + 1.5) < 0.01 && Math.abs(e.min + 1.5) < 0.01, `surfaced to -1.5, the mark gone: level ${e.level}, min ${e.min}`);
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    const out = path.join(ROOT, "build", "hand_spoilboard.png");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, "base64"));

    const f = await page.val(`(async () => { document.getElementById("hs-new").click(); await T.sleep(200); return H.min(LR4Job.spoil()); })()`);
    ok(f === 0, "New spoilboard: fresh");
  } catch (e) {
    ok(false, "threw: " + (e && e.stack || e));
  } finally {
    await page.close();
    srv.kill();
    console.log(fails ? `${fails} of ${checks} failed` : `${checks}/${checks} checks passed`);
    process.exit(fails ? 1 : 0);
  }
})();
