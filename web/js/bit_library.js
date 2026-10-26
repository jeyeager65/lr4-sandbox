// My bits (user 2026-10-26): the bits you own, kept in this browser for every machine (not a machine setting), picked
// from wherever a bit is set (Run > On the table > Bit, a job's bit change). Starts with the bits in V1 Engineering's
// store ("Sharp stuff", 2026-10-26) + a 3/4" surfacing bit - not a 1": the user doesn't want to encourage big bits on an
// LR4. Specs from the store's pages where they give them; a field they don't give stays 0 (not said).
// A bit = the page's bit form { shape, d, angle, tip, cr, flutes, len } + { id, name, flen (flute length, drawing),
// url (its store page) }. Plain JS + a Storage-like object: tests/test_bit_library.js.
(function (root) {
  "use strict";
  const KEY = "lr4-bits", IN = 25.4, STORE = "https://www.v1e.com/products/";
  const bit = (id, name, o) => Object.assign({ id, name, shape: "flat", d: IN / 8, angle: 90, tip: 0, cr: 0, flutes: 0, len: 0, flen: 0, url: "" }, o);
  const DEFAULTS = [
    bit("v1e-18-1f", '1/8" single flute', { flutes: 1, flen: 17, url: STORE + "1-8-single-flute" }),   // "3mm cutting width", 17 mm max depth
    bit("v1e-18-1f-long", '1/8" single flute, extra long', { flutes: 1, flen: 32, url: STORE + "1-8-single-flute-extra-long" }),
    bit("v1e-18-2f-down", '1/8" 2-flute downcut', { flutes: 2, flen: 19.5, url: STORE + "1-8-2-flute-downcut-endmill" }),
    bit("v1e-116-2f", '1/16" 2-flute', { d: IN / 16, flutes: 2, flen: 7.5, url: STORE + "1-16-2-flute-endmill" }),
    bit("v1e-14-1f-up", '1/4" single flute upcut', { d: IN / 4, flutes: 1, flen: 17, url: STORE + "1-4-single-flute-carbide-upcut-endmill" }),
    bit("v1e-18-ball", '1/8" ball end', { shape: "ball", url: STORE + "1-8-ball-end-altin-coated" }),
    // 1.6 mm ball to the 1/8" shank over 17 mm: 2 x atan((1.5875 - 0.8) / 17) = 5.3 deg included
    bit("v1e-taper-ball", "Ultra detail tapered ballnose", { shape: "taperball", tip: 1.6, angle: 5.3, flutes: 2, flen: 17, url: STORE + "ultra-detail-tapered-ballnose-endmill" }),
    bit("v1e-18-v45", '1/8" 45° V-bit', { shape: "vbit", angle: 45, url: STORE + "1-8-45-degree-v-bit" }),   // 45 taken as the included angle
    bit("surf-34", '3/4" surfacing bit', { d: IN * 3 / 4, flutes: 2 }),
  ];
  const FIELDS = ["shape", "d", "angle", "tip", "cr", "flutes", "len"];
  const clean = (b) => {                             // a stored / imported bit -> a valid one (or null)
    if (!b || !(+b.d > 0)) return null;
    const o = bit(String(b.id || ""), String(b.name || "").trim() || "Bit", {});
    for (const k of Object.keys(o)) if (b[k] !== undefined && k !== "id" && k !== "name") o[k] = typeof o[k] === "number" ? Math.max(0, +b[k] || 0) : String(b[k]);
    return o;
  };
  // the form's fields the same (2 decimals): this form shows that bit
  const same = (a, b) => !!a && !!b && FIELDS.every((k) => (k === "shape" ? a[k] === b[k] : Math.abs((+a[k] || 0) - (+b[k] || 0)) < 0.005));

  function create(ls, now = () => Date.now()) {
    const get = () => { try { return ls.getItem(KEY); } catch (e) { return null; } };
    const put = (l) => { try { ls.setItem(KEY, JSON.stringify(l)); } catch (e) { /* not kept */ } };
    function list() {
      let l = null;
      try { l = JSON.parse(get() || "null"); } catch (e) { /* none */ }
      if (!Array.isArray(l)) return DEFAULTS.map((b) => Object.assign({}, b));   // never saved: the defaults
      return l.map(clean).filter(Boolean);
    }
    const find = (id) => list().find((b) => b.id === id) || null;
    function add(b, name) {                          // a new bit from a form's -> its id
      const o = clean(Object.assign({}, b, { name: name || b.name, id: "b" + now().toString(36) + Math.floor(Math.random() * 1296).toString(36) }));
      if (!o) return null;
      o.url = ""; put([...list(), o]);
      return o.id;
    }
    function update(id, b) {                         // its fields from a form (name kept unless given)
      const l = list(), i = l.findIndex((q) => q.id === id);
      if (i < 0) return false;
      l[i] = clean(Object.assign({}, l[i], b, { id }));
      put(l); return true;
    }
    function remove(id) { const l = list(), n = l.filter((q) => q.id !== id); put(n); return n.length < l.length; }
    function reset() { try { ls.removeItem(KEY); } catch (e) { /* none */ } }
    // a file's tool (cnc-gcode-tools def) -> the first of your bits of that shape + diameter (+ angle for V / chamfer)
    function matchDef(def) {
      if (!def || !(def.diameter > 0)) return null;
      return list().find((b) => b.shape === (def.shape || "flat") && Math.abs(b.d - def.diameter) < 0.02 &&
        (!["vbit", "chamfer"].includes(b.shape) || !(def.angle > 0) || Math.abs(b.angle - def.angle) < 0.5)) || null;
    }
    return { list, find, add, update, remove, reset, matchDef };
  }

  const api = { KEY, DEFAULTS, create, clean, same };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.BitLibrary = api;
    const ms = root.MS;                              // machines.js (loaded first): lr4-bits passes through, per browser
    root.BITS = create(ms ? { getItem: (k) => ms.get(k), setItem: (k, v) => ms.set(k, v), removeItem: (k) => ms.remove(k) } : root.localStorage);
  }
})(typeof self !== "undefined" ? self : this);
