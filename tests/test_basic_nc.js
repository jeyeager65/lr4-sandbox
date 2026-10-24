// web/js/basic_nc.js: Basic mode's FluidNC stand-in, driven as FluidTouch would - HTTP upgrade, masked text frames,
// FluidNC's replies in binary frames.
//   node tests/test_basic_nc.js   (in npm test)
"use strict";
const crypto = require("crypto");
const B = require("../web/js/basic_nc.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("  FAIL " + msg); } };

// SHA-1 + the accept key (RFC 6455's own example)
for (const s of ["", "abc", "x".repeat(55), "y".repeat(56), "z".repeat(200)]) {
  const want = crypto.createHash("sha1").update(s).digest("hex"), got = Buffer.from(B.sha1(Buffer.from(s))).toString("hex");
  ok(got === want, `sha1 of ${s.length} chars: ${got}`);
}
ok(B.acceptKey("dGhlIHNhbXBsZSBub25jZQ==") === "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", "RFC 6455 accept key");

// jog parsing (FluidTouch's forms)
const j = B.parseJog("G91 X1.500 Y-2 F3000");
ok(j && j.rel && j.x === 1.5 && j.y === -2 && j.z === undefined && j.f === 3000, "relative jog: " + JSON.stringify(j));
const g = B.parseJog("G53 Z10 F600");
ok(g && !g.rel && g.machine && g.z === 10, "machine jog: " + JSON.stringify(g));
const i = B.parseJog("G20 G91 X1 F10");
ok(i && Math.abs(i.x - 25.4) < 1e-9 && Math.abs(i.f - 254) < 1e-9, "inch jog in mm");
ok(B.parseJog("G91 X1") === null && B.parseJog("G91 F100") === null && B.parseJog("G1 X1 F100") === null, "bad jogs: no F, no axis, G1");

// a client: masked frames in, frames out
const mask = (text) => {
  const p = Buffer.from(text, "latin1"), m = crypto.randomBytes(4), n = p.length, h = n < 126 ? 2 : 4;
  const f = Buffer.alloc(h + 4 + n);
  f[0] = 0x81; if (n < 126) f[1] = 0x80 | n; else { f[1] = 0x80 | 126; f.writeUInt16BE(n, 2); }
  m.copy(f, h);
  for (let k = 0; k < n; k++) f[h + 4 + k] = p[k] ^ m[k & 3];
  return new Uint8Array(f);
};
const calls = [];
const page = {
  status: () => ({ state: "Idle", mpos: [1, 2.5, -3], feed: 0, rpm: 0, sd: null }),
  home: (axes) => { calls.push("home" + (axes || "")); return Promise.resolve(null); },
  jog: (o) => { calls.push("jog " + JSON.stringify(o)); return null; },
  jogCancel: () => calls.push("cancel"), hold: () => calls.push("hold"), resume: () => calls.push("resume"), reset: () => calls.push("reset"),
  files: (dir) => (dir === "/" ? [{ name: "LR4_strut_plates.gcode", size: 1234 }, { name: "fluidtouch", size: -1 }] : []),
  run: (p) => { calls.push("run " + p); return null; },
  del: (p) => { calls.push("del " + p); return "error: no such file"; },
};
const nc = B.create(page);
let rx = Buffer.alloc(0), closed = false;
const id = nc.vconn.open(80, (b) => { rx = Buffer.concat([rx, Buffer.from(b)]); }, () => { closed = true; });
ok(id > 0, "open");
nc.vconn.send(id, new Uint8Array(Buffer.from("GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
  "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")));
const head = rx.toString("latin1");
ok(/^HTTP\/1\.1 101/.test(head) && head.includes("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), "upgrade answered");
rx = rx.subarray(head.indexOf("\r\n\r\n") + 4);
// read the server's frames: text frames as they are, binary as lines
function take() {
  const out = [];
  let k = 0;
  while (rx.length - k >= 2) {
    let n = rx[k + 1] & 127, h = 2;
    if (n === 126) { n = rx.readUInt16BE(k + 2); h = 4; }
    out.push([rx[k] & 15, rx.subarray(k + h, k + h + n).toString("latin1")]);
    k += h + n;
  }
  rx = rx.subarray(k);
  return out;
}
let fr = take();
ok(fr.length === 2 && fr[0][0] === 1 && fr[0][1] === "currentID:" + id && fr[1][1] === "CURRENT_ID:" + id, "ids: " + JSON.stringify(fr));
const say = async (t) => {
  nc.vconn.send(id, mask(t));
  await new Promise((r) => setTimeout(r, 0));          // file / run / home replies come a tick later
  return take().flatMap(([op, s]) => (op === 2 ? s.split("\n").filter(Boolean) : [s]));
};

(async () => {
  ok((await say("$Build/Info\n")).some((l) => /^\[VER:.* v4\.0\.0-basic/.test(l)), "$Build/Info has a version FluidTouch reads");
  ok((await say("$G\n")).join("|") === "[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]|ok", "$G");
  const st = await say("?");
  ok(st.join("") === "<Idle|MPos:1.000,2.500,-3.000|FS:0,0>", "status: " + st);
  ok((await say("PING:5000"))[0] === "PING:60000:60000", "PING");
  ok((await say("$J=G91 X1.000 F1000\n")).join() === "ok" && calls.pop().includes('"x":1'), "jog -> page");
  await say("\x85"); ok(calls.pop() === "cancel", "0x85 = jog cancel");
  await say("!"); await say("~"); await say("\x18");
  ok(calls.splice(-3).join() === "hold,resume,reset", "! ~ ctrl-x");
  const ls = await say("$Files/ListGcode=/sd/\n");
  ok(ls.length === 2 && ls[1] === "ok" && JSON.parse(ls[0].slice(6, -1)).files[0].name === "LR4_strut_plates.gcode" &&
    JSON.parse(ls[0].slice(6, -1)).path === "/sd/", "file list as [JSON:...] + ok: " + ls[0]);
  ok((await say("$SD/Run=/sd/LR4_strut_plates.gcode\n")).join() === "ok" && calls.pop() === "run /LR4_strut_plates.gcode", "$SD/Run -> page (path off the card)");
  ok((await say("$SD/Delete=/sd/nope.gcode\n")).join() === "error: no such file", "$SD/Delete error passed on");
  ok(/^error: not in Basic mode/.test((await say("G10 L20 P0 X0\n"))[0]), "anything else: not in Basic mode");
  ok((await say("$X\n")).join() === "ok", "$X");
  const two = await say("$G\n$X\n");                  // two lines in one frame
  ok(two.join("|") === "[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]|ok|ok", "two lines in one frame");
  ok((await say("$H\n")).join() === "ok" && calls.pop() === "home", "$H -> page, then ok");
  ok((await say("$HZ\n")).join() === "ok" && calls.pop() === "homeZ" && (await say("$hxy\n")).join() === "ok" && calls.pop() === "homeXY", "$HZ / $HXY -> page.home(those axes)");
  ok((await say("$Report/Interval=50\n"))[0] === "[MSG:INFO: websocket auto report interval set to 50 ms]", "auto reports on");
  await new Promise((r) => setTimeout(r, 130));
  ok(take().filter(([, s]) => s.startsWith("<Idle")).length >= 2, "auto reports arrive");
  nc.message("Turn On Router at Dial 3 [then] resume");
  ok(take()[0][1] === "[MSG:INFO: Turn On Router at Dial 3 then resume]\n", "message to the pendant (no ] inside)");
  nc.stop();
  ok(closed && nc.stopped && nc.vconn.open(80, () => {}, () => {}) === 0, "stop closes and refuses");
  console.log(fails ? `basic_nc: ${fails} of ${checks} failed` : `basic_nc: all ${checks} passed`);
  process.exit(fails ? 1 : 0);
})();
