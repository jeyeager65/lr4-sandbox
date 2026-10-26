// My machines (Part 42): web/js/machines.js on a fake localStorage - the first load makes "My LR4" and moves an older
// page's keys into it, machine keys go under the active machine's prefix (browser keys don't), a shared link opens a
// fresh temporary machine, add / copy / rename / delete, the export file round trip (typed arrays as base64).
//   node tests/test_machines.js   (in npm test)
"use strict";
const M = require("../web/js/machines.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };

class Store {                                         // the parts of Storage machines.js uses
  constructor(o = {}) { this.m = new Map(Object.entries(o)); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
let t = 1000;
const now = () => (t += 1000);

// first load: an older page's plain keys move into "My LR4"; browser keys stay
const ls = new Store({ "lr4-opts": '{"router":false}', "lr4-theme": "dark", "detail": "lite", "lr4-jobdef:sd:a.nc": "{}" });
const a = M.create(ls, "", now);
ok(a.list().length === 1 && a.list()[0].name === "My LR4" && a.id === a.list()[0].id && !a.temp, `first load: one machine "${a.name}"`);
ok(ls.getItem("lr4-opts") === null && a.get("lr4-opts") === '{"router":false}' && a.get("detail") === "lite" && a.get("lr4-jobdef:sd:a.nc") === "{}",
  "plain machine keys moved into it");
ok(ls.getItem("lr4-theme") === "dark" && a.get("lr4-theme") === "dark", "browser keys stay plain");
a.set("lr4-hand", "{}");
ok(ls.getItem(`lr4@${a.id}/lr4-hand`) === "{}" && a.key("lr4-mode") === "lr4-mode", "set goes under the machine's prefix; browser keys pass through");
ok(a.db("lr4-sandbox-sd") === `lr4-sandbox-sd@${a.id}` && a.spoilKey("660x1270") === `lr4@${a.id}/660x1270`, "databases + spoilboard keys per machine");

// a second machine: defaults or a copy; switching; rename; delete
const b = a.add("Shop LR4"), c = a.add("My LR4", a.id);
ok(a.list().map((m) => m.name).join() === "My LR4,Shop LR4,My LR4 (2)", `names: ${a.list().map((m) => m.name).join(", ")}`);
ok(Object.keys(a.settingsOf(b)).length === 0 && a.settingsOf(c)["lr4-opts"] === '{"router":false}', "New = defaults, Duplicate = a copy");
a.use(b);
const a2 = M.create(ls, "", now);
ok(a2.id === b && a2.name === "Shop LR4" && a2.get("lr4-opts") === null && a2.get("lr4-theme") === "dark", "the next load opens the one picked");
ok(a2.rename(b, "My LR4") === "My LR4 (3)" && a2.rename(b, "Garage") === "Garage", "rename keeps names unique");
ok(a2.remove(c) && !a2.find(c) && Object.keys(a2.settingsOf(c)).length === 0, "delete drops it and its keys");
a2.remove(a.id);
ok(!a2.remove(b) && a2.list().length === 1, "the last machine stays");

// a shared link: the temporary machine, fresh each time; yours untouched; saving it copies it
const s = M.create(ls, "#26x50&units=in", now);
ok(s.temp && s.id === M.SHARED && s.mine().id === b && s.name === "Shared build", "a link with settings opens the shared build");
s.set("lr4-opts", "{}");
ok(ls.getItem(`lr4@shared/lr4-opts`) === "{}" && a2.settingsOf(b)["lr4-opts"] === undefined, "its settings stay off yours");
const s2 = M.create(ls, "#26x50&units=mm", now);
ok(s2.get("lr4-opts") === null, "the next link starts fresh");
ok(!M.create(ls, "#26x50", now).temp, "a bare size link (#26x50) is no shared build");
s2.set("lr4-filaments", "x");
const kept = s2.add("From Bob", M.SHARED);
ok(s2.settingsOf(kept)["lr4-filaments"] === "x" && !s2.list().some((m) => m.id === M.SHARED), "Save as one of my machines copies it (shared never listed)");

// export / import
const heights = new Float32Array([0, -0.25, 1.5]), bytes = new TextEncoder().encode("G0 X1\n");
const file = JSON.parse(JSON.stringify(M.exportOf({ name: "Garage", settings: { "lr4-opts": "{}" },
  sd: [{ path: "/a.nc", bytes, mtime: 5 }], spoilboard: [{ key: "660x1270", nx: 1, ny: 1, heights }] })));
const back = M.importOf(file);
ok(back.name === "Garage" && back.settings["lr4-opts"] === "{}" && back.flash === null, "import: name + settings");
ok(new TextDecoder().decode(back.sd[0].bytes) === "G0 X1\n" && back.spoilboard[0].heights instanceof Float32Array && back.spoilboard[0].heights[2] === 1.5,
  "import: file bytes + spoilboard heights come back typed");
let threw = false;
try { M.importOf({ format: "x" }); } catch (e) { threw = true; }
ok(threw, "not a machine file -> an error");
ok(M.importOf(Object.assign({}, file, { settings: { "lr4-theme": "dark", "lr4-opts": "{}" } })).settings["lr4-theme"] === undefined, "import keeps machine keys only");
ok(M.fileName("Bob's LR4 #2") === "Bobs_LR4_2.lr4.json", "file name");

console.log(`${checks - fails}/${checks} passed`);
process.exit(fails ? 1 : 0);
