// Compare two director event logs (tools/record_demo.js --log): the same events in the same order, and the time
// between one event and the next the same to within --tol s. FluidNC runs on its own threads and its status comes on
// the real clock, so two recordings of one file differ: the end of homing moved 0.73 s between two runs of the same
// recorder on tests/video_short.gcode (2026-10-25), shifting everything after it. So times are compared as gaps, and
// each second's speed / badge against the other log's second at the same shift. Numbers in "log" lines that are
// timings (render time, machine minutes, sound stats, frame counts) are not compared.
//   node tools/video_log_diff.js before.log after.log [--tol 0.5]   -> exit 1 if they differ
"use strict";
const fs = require("fs");
const a = process.argv.slice(2), tolI = a.indexOf("--tol"), tol = tolI >= 0 ? Number(a.splice(tolI, 2)[1]) : 0.5;
if (a.length < 2) { console.log("usage: node tools/video_log_diff.js before.log after.log [--tol 0.5]"); process.exit(2); }
const VOLATILE = [/^log job \(at [\d.]+ s/, / rendered in [\d.]+ min/, /^log sound: /, /^log FluidNC ran the job in /, /\.mp4: \d+ frames/];
const read = (f) => fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
  const i = l.indexOf(" "), t = Number(l.slice(0, i)), e = l.slice(i + 1);
  return { t, e, key: VOLATILE.some((re) => re.test(e)) ? e.replace(/\S+\.mp4:.*$/, "<out>").replace(/[\d.]+/g, "#") : e };
});
const A = read(a[0]), B = read(a[1]);
const EA = A.filter((x) => !x.e.startsWith("sec ")), EB = B.filter((x) => !x.e.startsWith("sec "));
let bad = 0, gap = 0, prev = 0;
const shifts = [];                                   // [time in A, B - A] at each matched event
for (let i = 0; i < Math.max(EA.length, EB.length); i++) {
  const x = EA[i], y = EB[i];
  if (!x || !y || x.key !== y.key) { bad++; console.log(`event ${i}: ${x ? `${x.t} ${x.e}` : "-"}  vs  ${y ? `${y.t} ${y.e}` : "-"}`); if (bad > 20) break; continue; }
  // homing ends when FluidNC's status says so (real-time reports): the event after it gets a second's leeway
  const sh = y.t - x.t, d = Math.max(0, Math.abs(sh - prev) - (i > 0 && /^home /.test(EA[i - 1].e) ? 1 : 0));
  shifts.push([x.t, sh]);
  gap = Math.max(gap, d);
  if (d > tol) console.log(`event ${i} "${x.e.slice(0, 80)}": ${(sh - prev).toFixed(2)} s later than the one before it (at ${x.t} vs ${y.t})`);
  if (d > tol) bad++;
  prev = sh;
}
const SB = new Map(B.filter((x) => x.e.startsWith("sec ")).map((x) => [Math.round(x.t), x.e])), pick = (e) => (e || "").replace(/ line=\d+ t=[\d.]+/, "");
const shiftAt = (t) => { let s = 0; for (const [ta, sh] of shifts) { if (ta > t) break; s = sh; } return s; };
let secBad = 0, secN = 0, lineD = 0;
for (const x of A.filter((q) => q.e.startsWith("sec "))) {
  const near = [0, -1, 1].map((d) => SB.get(Math.round(x.t + shiftAt(x.t)) + d)).filter(Boolean);   // a frame or two either way
  if (!near.length || !/rate=\d+ /.test(x.e)) continue;   // not mid-ramp (the speed eases up over 1.5 s)
  secN++;
  if (!near.some((e) => pick(e) === pick(x.e))) { secBad++; if (secBad <= 10) console.log(`second ${x.t}: ${x.e}  vs  ${near[0]}`); }
  lineD = Math.max(lineD, Math.min(...near.map((e) => Math.abs(+/line=(\d+)/.exec(e)[1] - +/line=(\d+)/.exec(x.e)[1]))));
}
const last = (L) => (L.length ? L[L.length - 1].t : 0);
console.log(`${EA.length} / ${EB.length} events, ${bad} differ; gaps between events differ by at most ${gap.toFixed(2)} s (tolerance ${tol});`,
  `${secN} seconds compared, ${secBad} with another speed or badge; G-code line apart at most ${lineD};`,
  `length ${last(A).toFixed(2)} / ${last(B).toFixed(2)} s`);
process.exit(bad || secBad > 3 ? 1 : 0);
