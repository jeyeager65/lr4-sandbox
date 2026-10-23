// The virtual SD card: G-code files kept in this browser (IndexedDB, like the part files in parts_files.js), shown in
// the Run tab, played by Playback and copied onto FluidNC's card (/native_sd) when it boots. Changes go both ways:
// adding / deleting here writes the running FluidNC's filesystem too, and what FluidNC changes on its card ($SD/Delete,
// later a WebUI upload) comes back with sync(). Paths are "/name" (folders allowed: "/jobs/a.gcode"), as FluidNC
// lists them under /sd. Names are cleaned (cleanName): FluidNC drops the spaces in a $ command's value.
// SdCard.flash is the same for FluidNC's Flash (LocalFS, /native_localfs): config.yaml lives there (user 2026-10-21).
// cleanName / diff / walk are plain JS (tests/test_motion_carve.js); the stores need IndexedDB.
(function (root) {
  "use strict";
  const DIR = "/native_sd";                            // FluidNC's SD card in the module's filesystem (fluidnc_sim.js)

  // a file name -> one FluidNC can take in $SD/Run=/name: no spaces or control / reserved characters, kept short
  function cleanName(name) {
    const base = String(name).split(/[\\/]/).pop().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    const out = base.replace(/\s+/g, "_").replace(/[^A-Za-z0-9._+()-]/g, "-").replace(/^[.-]+/, "").slice(-120);
    return out || "file.gcode";
  }
  const pathOf = (name) => "/" + cleanName(name);

  // the files under dir in an Emscripten FS -> [{ path ("/a/b.gcode"), bytes (Uint8Array), mtime (ms) }]
  function walk(FS, dir = DIR, skip = []) {
    const out = [];
    const go = (d, rel) => {
      let names;
      try { names = FS.readdir(d); } catch (e) { return; }
      for (const n of names) {
        if (n === "." || n === "..") continue;
        const p = `${d}/${n}`, st = FS.stat(p);
        if (FS.isDir(st.mode)) go(p, `${rel}/${n}`);
        else if (!skip.includes(`${rel}/${n}`)) out.push({ path: `${rel}/${n}`, bytes: FS.readFile(p), mtime: +st.mtime || Date.now() });
      }
    };
    go(dir, "");
    return out;
  }
  // the folders under dir -> ["/jobs", "/ui", "/ui/figui"] (empty ones too: walk() only sees files)
  function walkDirs(FS, dir = DIR) {
    const out = [];
    const go = (d, rel) => {
      let names;
      try { names = FS.readdir(d); } catch (e) { return; }
      for (const n of names) {
        if (n === "." || n === "..") continue;
        const p = `${d}/${n}`;
        if (FS.isDir(FS.stat(p).mode)) { out.push(`${rel}/${n}`); go(p, `${rel}/${n}`); }
      }
    };
    go(dir, "");
    return out;
  }
  // "/a/b/c.gcode" -> ["/a", "/a/b"]
  const parents = (path) => { const s = path.split("/").slice(1, -1); return s.map((_, i) => "/" + s.slice(0, i + 1).join("/")); };
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // what to change in the store so it matches the card: { put: [records], remove: [paths] }
  function diff(stored, card) {
    const have = new Map(stored.map((r) => [r.path, r])), seen = new Set(), put = [];
    for (const f of card) {
      seen.add(f.path);
      const r = have.get(f.path);
      if (!r || !same(r.bytes, f.bytes)) put.push({ path: f.path, bytes: f.bytes, mtime: f.mtime || Date.now() });
    }
    return { put, remove: stored.filter((r) => !seen.has(r.path)).map((r) => r.path) };
  }

  const STORE = "files";
  function db(DB) {
    return new Promise((res, rej) => {
      const r = globalThis.indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "path" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(DB, mode, fn) {
    const d = await db(DB);
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), st = t.objectStore(STORE), out = fn(st);
      t.oncomplete = () => { d.close(); res(out && out.result); };
      t.onerror = () => { d.close(); rej(t.error); };
    });
  }
  const toBytes = (data) => (typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data));
  // one card: its IndexedDB store and its folder in FluidNC's filesystem. skip: paths on the live card that aren't
  // the user's (the Flash's sim_config.yaml) - never synced back. Records may carry extra fields (put(path, data, extra)).
  // Folders are records too ({ path: "/jobs", dir: true }), so empty ones last; all() is the files only, dirs() the
  // folders (a file's folders needn't have a record: it implies them).
  function card(DB, dir, skip = []) {
    const raw = async () => ((await tx(DB, "readonly", (st) => st.getAll())) || []).sort((a, b) => a.path.localeCompare(b.path));
    const store = {
      all: async () => (await raw()).filter((r) => !r.dir),
      dirs: async () => (await raw()).filter((r) => r.dir).map((r) => r.path),
      get: (path) => tx(DB, "readonly", (st) => st.get(path)),
      put: (path, data, extra) => tx(DB, "readwrite", (st) => { st.put(Object.assign({}, extra, { path, bytes: toBytes(data), mtime: Date.now() })); }),
      putAll: (recs) => tx(DB, "readwrite", (st) => { for (const r of recs) st.put(r); }),
      remove: (paths) => tx(DB, "readwrite", (st) => { for (const p of [].concat(paths)) st.delete(p); }),
      // a folder and the ones it's in
      mkdir: (path) => tx(DB, "readwrite", (st) => { for (const p of [...parents(path), path]) st.put({ path: p, dir: true, bytes: new Uint8Array(0), mtime: Date.now() }); }),
      // a folder and everything in it -> the file paths removed
      async removeTree(path) {
        const gone = (await raw()).filter((r) => r.path === path || r.path.startsWith(path + "/"));
        await store.remove(gone.map((r) => r.path));
        return gone.filter((r) => !r.dir).map((r) => r.path);
      },
    };
    // the running FluidNC (sim from fluidnc_sim.start): write / delete one file or folder, or bring its changes back
    const writeLive = (sim, path, data) => { if (sim && !sim.stopped) sim.writeFile(dir + path, toBytes(data)); };
    const removeLive = (sim, path) => { if (sim && !sim.stopped) try { sim.FS.unlink(dir + path); } catch (e) { /* not there */ } };
    const mkdirLive = (sim, path) => { if (sim && !sim.stopped) sim.FS.mkdirTree(dir + path); };
    function removeTreeLive(sim, path) {
      if (!sim || sim.stopped) return;
      const FS = sim.FS, go = (p) => {
        let names;
        try { names = FS.readdir(p); } catch (e) { return; }
        for (const n of names) {
          if (n === "." || n === "..") continue;
          const q = `${p}/${n}`;
          if (FS.isDir(FS.stat(q).mode)) go(q); else FS.unlink(q);
        }
        FS.rmdir(p);
      };
      try { go(dir + path); } catch (e) { /* not there */ }
    }
    // the card -> the store; returns { put, remove, dirs } (what changed; dirs: a folder came or went)
    async function sync(sim) {
      if (!sim || sim.stopped) return { put: [], remove: [], dirs: false };
      const d = diff(await store.all(), walk(sim.FS, dir, skip));
      if (d.put.length) await store.putAll(d.put);
      if (d.remove.length) await store.remove(d.remove);
      const had = new Set(await store.dirs()), live = walkDirs(sim.FS, dir);
      const add = live.filter((p) => !had.has(p)), gone = [...had].filter((p) => !live.includes(p));
      if (add.length) await store.putAll(add.map((p) => ({ path: p, dir: true, bytes: new Uint8Array(0), mtime: Date.now() })));
      if (gone.length) await store.remove(gone);
      d.dirs = add.length + gone.length > 0;
      return d;
    }
    // every stored file as start()'s opts.files ({ "/native_sd/a.gcode": bytes }); folders as its opts.dirs
    const files = (recs) => Object.fromEntries(recs.map((r) => [dir + r.path, r.bytes]));
    const dirs = (paths) => paths.map((p) => dir + p);
    return { DIR: dir, store, writeLive, removeLive, mkdirLive, removeTreeLive, sync, files, dirs };
  }
  const sd = card("lr4-sandbox-sd", DIR);
  const flash = card("lr4-sandbox-flash", "/native_localfs", ["/sim_config.yaml"]);

  const api = Object.assign({ cleanName, pathOf, walk, walkDirs, parents, diff, card, flash }, sd);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SdCard = api;
})(typeof self !== "undefined" ? self : this);
