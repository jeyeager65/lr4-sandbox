// fluidnc_sim.js: FluidNC's output stream -> events (status reports, ok / error / ALARM, [MSG:], other [TAG:],
// the greeting), ANSI escapes stripped, chunks split into lines.   node tests/test_fluidnc_sim.js
// (The module itself boots in tests/test_page_fluidnc.js: headless Chrome, not in npm test.)
"use strict";
const S = require("../web/js/fluidnc_sim.js");

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log("FAIL " + msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// status reports
let s = S.parseLine("<Idle|MPos:1.000,-2.500,3.250|FS:0,0>");
ok(s.type === "status" && s.state === "Idle" && s.sub === undefined, "Idle report");
ok(same(s.MPos, [1, -2.5, 3.25]) && same(s.FS, [0, 0]), "MPos + FS as numbers");
s = S.parseLine("<Hold:0|MPos:0.000,0.000,0.000|FS:1500,0|Pn:XYP|WCO:10.000,20.000,-5.000|Ov:100,100,100|Ln:42>");
ok(s.state === "Hold" && s.sub === 0, "Hold:0 -> state + sub");
ok(s.Pn === "XYP" && same(s.WCO, [10, 20, -5]) && same(s.Ov, [100, 100, 100]) && s.Ln === 42, "Pn / WCO / Ov / Ln");
s = S.parseLine("<Run|WPos:1.0,2.0,3.0|Bf:15,128|SD:12.50,/sd/StrutPlates.gcode>");
ok(same(s.WPos, [1, 2, 3]) && same(s.Bf, [15, 128]) && s.SD.pct === 12.5 && s.SD.file === "/sd/StrutPlates.gcode", "WPos / Bf / SD");
s = S.parseLine("<Alarm|MPos:0.000,0.000,0.000|FS:0,0>\r");
ok(s.type === "status" && s.state === "Alarm", "CR at the end ignored");

// replies and messages
ok(S.parseLine("ok").type === "ok", "ok");
s = S.parseLine("error:20");
ok(s.type === "error" && s.code === 20, "error:20");
s = S.parseLine("ALARM:1");
ok(s.type === "alarm" && s.code === 1, "ALARM:1");
s = S.parseLine("[MSG:INFO: Homing done]");
ok(s.type === "msg" && s.level === "INFO" && s.text === "Homing done", "[MSG:INFO: ...]");
s = S.parseLine("[MSG:Machine: WASM test machine]");
ok(s.type === "msg" && s.level === "" && s.text === "Machine: WASM test machine", "[MSG:...] with a colon in the text");
s = S.parseLine("[MSG:ERR: Bad GCode: G999]");
ok(s.type === "msg" && s.level === "ERR", "[MSG:ERR: ...]");
s = S.parseLine("[VER:4.1 FluidNC v4.1.1 (wasm-sim-6735500a) (wasm-wasm) :]");
ok(s.type === "tag" && s.tag === "VER" && /^4\.1 FluidNC/.test(s.text), "[VER:...] tag");
s = S.parseLine("[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]");
ok(s.type === "tag" && s.tag === "GC", "[GC:...] tag");
s = S.parseLine("Grbl 4.1 [FluidNC v4.1.1 (wasm-sim-6735500a) (wasm-wasm) '$' for help]");
ok(s.type === "greeting", "greeting");
ok(S.parseLine("$X").type === "text" && S.parseLine("  ").type === "blank", "plain text / blank");
s = S.parseLine("\x1b[2K\r\x1b[1mok\x1b[0m");
ok(s.type === "ok", "ANSI escapes + CR stripped");

// chunks -> lines
const got = [];
const feed = S.splitter((l) => got.push(l));
for (const c of ["o", "k\r\n<Idle|MPos:0", ".000,0.000,0.000|FS:0,0>\n[MSG:", "x]\nerror:2", "\n", "partial"]) feed(c);
ok(same(got, ["ok", "<Idle|MPos:0.000,0.000,0.000|FS:0,0>", "[MSG:x]", "error:2"]), "chunks split into lines: " + JSON.stringify(got));

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
