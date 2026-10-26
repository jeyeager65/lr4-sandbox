// My machines (Part 42, user 2026-10-25): several named machines in one browser - yours, a second build, a shared one.
// A machine = everything about it: size + options + table, filaments (+ saved presets), As built, Scene, the
// spoilboard's cuts, the SD card + Flash (its config.yaml), the front plate design (Part 41). Per browser (not per machine): theme, page mode / layout /
// folds, sound, the part files, the Downloads folder.
// Storage: each machine's localStorage keys under its own prefix (lr4@<id>/lr4-opts ...), its SD / Flash databases
// named <db>@<id>, its spoilboard records keyed <prefix><size>. The first load makes "My LR4" and moves the plain
// settings keys of older pages into it (the old SD / Flash / spoilboard databases are left behind - user 2026-10-25:
// no need for backwards compatibility yet). Switching machines reloads the page. A shared link (#WxH&settings) opens as the temporary machine "shared", fresh each time: nothing of yours
// changes until it is saved as one of yours. A help video (Part 43b: #help=<id>) plays on the temporary machine "help",
// fresh each time the same way; Exit goes back to yours.
// The page reads and writes its settings through MS (MS.get / set / remove: machine keys go to the active machine,
// the rest pass through). Plain JS + a Storage-like object (tests/test_machines.js); copying the databases needs
// IndexedDB (SdCard / HandSetup, in the page).
(function (root) {
  "use strict";
  const MACHINE_KEY = /^(lr4-(asbuilt|cam|config-size|design|filaments|fil-presets|hand|jobdef:.*|lighting|opts|pendant|room|scenery|table-top|sd-sel)|detail|peter-style|peter-style-files|print-main|print-accent)$/;
  const LIST = "lr4-machines", ACTIVE = "lr4-machine", SHARED = "shared", HELP = "help", FIRST = "My LR4";
  const DBS = ["lr4-sandbox-sd", "lr4-sandbox-flash", "lr4-sandbox-design"];   // design: the front plate's SVG (Part 41)
  const isMachineKey = (k) => MACHINE_KEY.test(k);
  const prefix = (id) => `lr4@${id}/`;
  const dbOf = (id, name) => `${name}@${id}`;
  const isShareHash = (h) => /^#\d+(?:\.\d+)?x\d+(?:\.\d+)?&/.test(h || "");
  const isHelpHash = (h) => /^#help=[\w.%-]+$/.test(h || "");

  // ls: localStorage (or anything with getItem / setItem / removeItem / key / length); hash: location.hash
  function create(ls, hash, now = () => Date.now()) {
    const get = (k) => { try { return ls.getItem(k); } catch (e) { return null; } };
    const put = (k, v) => { try { ls.setItem(k, v); } catch (e) { /* not kept */ } };
    const del = (k) => { try { ls.removeItem(k); } catch (e) { /* nothing kept */ } };
    const allKeys = () => { const out = []; try { for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); } catch (e) { /* none */ } return out; };

    const newId = () => "m" + now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
    function list() {
      let l = null;
      try { l = JSON.parse(get(LIST) || "null"); } catch (e) { /* none yet */ }
      if (!Array.isArray(l)) l = [];
      return l.filter((m) => m && typeof m.id === "string" && m.id && m.id !== SHARED && m.id !== HELP && typeof m.name === "string");
    }
    const saveList = (l) => put(LIST, JSON.stringify(l));
    const find = (id) => list().find((m) => m.id === id) || null;

    // a machine's keys: { "lr4-opts": "..." } (plain names)
    function settingsOf(mid) {
      const p = prefix(mid), out = {};
      for (const k of allKeys()) if (k && k.startsWith(p) && isMachineKey(k.slice(p.length))) out[k.slice(p.length)] = get(k);
      return out;
    }
    function clearSettings(mid) { for (const k of Object.keys(settingsOf(mid))) del(prefix(mid) + k); }
    function writeSettings(mid, s) { for (const [k, v] of Object.entries(s || {})) if (isMachineKey(k) && typeof v === "string") put(prefix(mid) + k, v); }

    if (!list().length) {                            // the first load: "My LR4", with an older page's plain keys moved in
      const m = { id: newId(), name: FIRST, created: now() };
      for (const k of allKeys()) if (k && isMachineKey(k)) { put(prefix(m.id) + k, get(k)); del(k); }
      saveList([m]); put(ACTIVE, m.id);
    }
    const help = isHelpHash(hash), temp = help || isShareHash(hash);
    const pick = () => { const a = get(ACTIVE) || ""; return find(a) ? a : list()[0].id; };
    const id = help ? HELP : temp ? SHARED : pick();
    if (temp) clearSettings(id);                     // fresh each time a link / help video opens

    function uniqueName(name, skip) {                // "My LR4" taken -> "My LR4 (2)"
      const base = String(name || "").trim() || "Machine", taken = new Set(list().filter((m) => m.id !== skip).map((m) => m.name.toLowerCase()));
      if (!taken.has(base.toLowerCase())) return base;
      for (let i = 2; ; i++) if (!taken.has(`${base} (${i})`.toLowerCase())) return `${base} (${i})`;
    }
    // a new machine: the defaults (from = undefined) or a copy of machine `from`'s settings -> its id
    function add(name, from) {
      const m = { id: newId(), name: uniqueName(name), created: now() };
      if (from !== undefined) writeSettings(m.id, settingsOf(from));
      saveList([...list(), m]);
      return m.id;
    }
    function rename(mid, name) {
      const l = list(), m = l.find((q) => q.id === mid);
      if (!m) return null;
      m.name = uniqueName(name, mid); saveList(l);
      return m.name;
    }
    function remove(mid) {                           // its settings + its place in the list (the page drops its databases)
      const l = list().filter((m) => m.id !== mid);
      if (!l.length) return false;                   // the last one stays
      clearSettings(mid); saveList(l);
      if (get(ACTIVE) === mid) put(ACTIVE, l[0].id);
      return true;
    }
    const use = (mid) => put(ACTIVE, mid);

    const name = help ? "Help" : temp ? "Shared build" : find(id).name;
    return {
      id, temp, help, name, SHARED, HELP,
      // the active machine's view of the store: machine keys under its prefix, the rest as they are
      key: (k) => (isMachineKey(k) ? prefix(id) + k : k),
      get: (k) => get(isMachineKey(k) ? prefix(id) + k : k),
      set: (k, v) => put(isMachineKey(k) ? prefix(id) + k : k, String(v)),
      remove: (k) => del(isMachineKey(k) ? prefix(id) + k : k),
      db: (n) => dbOf(id, n),
      spoilKey: (k) => prefix(id) + k,
      // machine settings (keys) the active machine has: Reset clears these
      clear: () => clearSettings(id),
      list, find, add, rename, remove, use, uniqueName, settingsOf, writeSettings, clearSettings,
      mine: () => find(pick()),                      // the one a plain load opens (while viewing a shared build: yours)
    };
  }

  // ---- export / import: a machine as JSON (settings + optionally its SD / Flash files; never the spoilboard - user
  // 2026-10-25: the cuts are that browser's). File bytes as base64. ----
  const TA = { Uint8Array, Float32Array, Float64Array, Int16Array, Uint16Array, Int32Array };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const t = atob(s), u8 = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u8[i] = t.charCodeAt(i); return u8; };
  function pack(v) {
    if (ArrayBuffer.isView(v)) return { $ta: v.constructor.name, b64: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pack(x)]));
    return v;
  }
  function unpack(v) {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === "object") {
      if (typeof v.$ta === "string" && typeof v.b64 === "string" && TA[v.$ta]) { const u8 = unb64(v.b64); return new TA[v.$ta](u8.buffer, 0, u8.byteLength / TA[v.$ta].BYTES_PER_ELEMENT); }
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unpack(x)]));
    }
    return v;
  }
  const FORMAT = "lr4-sandbox-machine";
  // { name, settings, sd?, flash?, design? } -> the file's object (records packed)
  function exportOf(m) {
    const o = { format: FORMAT, version: 1, name: m.name, exported: new Date().toISOString(), settings: m.settings || {} };
    for (const k of ["sd", "flash", "design"]) if (m[k]) o[k] = pack(m[k]);
    return o;
  }
  // a parsed file -> { name, settings, sd, flash, design } or throws (not a machine file)
  function importOf(o) {
    if (!o || o.format !== FORMAT || typeof o.settings !== "object") throw new Error("not an LR4 Sandbox machine file");
    const settings = {};
    for (const [k, v] of Object.entries(o.settings)) if (isMachineKey(k) && typeof v === "string") settings[k] = v;
    return { name: String(o.name || "Imported machine"), settings,
      sd: o.sd ? unpack(o.sd) : null, flash: o.flash ? unpack(o.flash) : null, design: o.design ? unpack(o.design) : null };
  }
  const fileName = (name) => (String(name).replace(/[^A-Za-z0-9 _()-]+/g, "").trim().replace(/\s+/g, "_") || "machine") + ".lr4.json";

  const api = { create, isMachineKey, isShareHash, isHelpHash, prefix, dbOf, DBS, SHARED, HELP, exportOf, importOf, pack, unpack, fileName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.LR4Machines = api;
    const ms = root.MS = create(root.localStorage, root.location ? root.location.hash : "");
    // a shared build / help video starts with empty cards and spoilboard: dropped before the page opens them (IndexedDB
    // runs requests on one database name in the order they're made)
    if (ms.temp && root.indexedDB) {
      for (const n of DBS) root.indexedDB.deleteDatabase(dbOf(ms.id, n));
      const r = root.indexedDB.open("lr4-spoilboard", 1);   // HandSetup.board's store
      r.onupgradeneeded = () => r.result.createObjectStore("boards", { keyPath: "key" });
      r.onsuccess = () => {
        const d = r.result, t = d.transaction("boards", "readwrite"), st = t.objectStore("boards");
        st.openCursor().onsuccess = (e) => { const c = e.target.result; if (!c) return; if (String(c.key).startsWith(prefix(ms.id))) c.delete(); c.continue(); };
        t.oncomplete = t.onerror = () => d.close();
      };
    }
  }
})(typeof self !== "undefined" ? self : this);
