// A throwaway Chrome profile for the headless tools / page tests, cleaned up for sure (user 2026-10-31: 159 leftover
// profiles = 30 GB in %TEMP%: the old cleanup deleted 0.5 s after the kill, while Chrome still held its files, and
// scripts that process.exit()ed never got there).
//   const P = profile("fluidnc_test_");  spawn(CHROME, [`--user-data-dir=${P.dir}`, ...]) -> P.own(chrome)
//   await P.drop();                      // kill Chrome, wait for it to exit, delete (retried)
// Making one also sweeps that prefix's leftovers over an hour old (a crashed run's); on exit anything left is deleted.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");

const OLD = 60 * 60 * 1000;
const live = new Set();
const rm = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); return true; } catch (e) { return false; } };

// Chrome + its helpers (GPU, renderers: they hold the profile too); Windows: the whole tree, synchronously
function kill(c) {
  if (!c || c.exitCode !== null || c.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
  else try { c.kill(); } catch (e) { /* gone */ }
}
function sweep(prefix) {
  const tmp = os.tmpdir(), now = Date.now();
  let names = [];
  try { names = fs.readdirSync(tmp); } catch (e) { return; }
  for (const n of names) {
    if (!n.startsWith(prefix)) continue;
    const p = path.join(tmp, n);
    try { if (now - fs.statSync(p).mtimeMs > OLD) rm(p); } catch (e) { /* gone / held */ }
  }
}

function profile(prefix) {
  sweep(prefix);
  const P = { dir: fs.mkdtempSync(path.join(os.tmpdir(), prefix)), chrome: null };
  P.own = (chrome) => { P.chrome = chrome; return chrome; };
  P.drop = async () => {
    const c = P.chrome;
    if (c && c.exitCode === null && c.signalCode === null) {
      const gone = new Promise((r) => c.once("exit", r));
      kill(c);
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
    }
    if (rm(P.dir)) live.delete(P);
  };
  live.add(P);
  return P;
}

process.on("exit", () => {                           // (sync only: kill, then the retried delete)
  for (const P of live) { kill(P.chrome); rm(P.dir); }
});

module.exports = { profile, sweep };
