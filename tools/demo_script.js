// Video scripts in G-code comments, for tools/record_demo.js (user 2026-10-22: "make these recordings use gcode files,
// special comments to set settings, display text, etc."; the syntax follows cnc-gcode-tools' CNCSIM / Stock / ToolDef
// comments). FluidNC and the page ignore them: one file is the job and the video.
//   (Video: KEY=VALUE ...)           settings, any line before the first move; the command line's flags win:
//       SIZE=2560x1440 FPS=30 VOLUME=0.6 SOUND=on VOICE=machine|robot (robot = the joke voice) DETAIL=full SCENERY=shop MACHINE=26x50 (cut area, in)
//       PAUSE=2 (s each M0 popup shows, then it resumes)  MESSAGES=on MSGTIME=4 (MSG / PRINT lines shown on top, s)
//       PARK=on (drive the gantry back at the end)  HOLD=3 (s on the result)
//   (Video Shot: VIEW=name TIME=s ORBIT=s DIST=mm)   the camera: blends there over TIME (1.5), then turns once round
//       it over ORBIT; DIST = how far from what it looks at. VIEW: workshop, machine, stock, tool (close on the bit,
//       follows it), core (close on the router / core), iso, front, top, side, back, page (mid-job only: the page's own
//       camera again, with its probe close-ups)
//   (Video Home: OFFSET=30 DIST=700)  $H in real time, the machine starting OFFSET mm off its switches; the camera
//       close on the core (DIST mm) and still. Before the first move only.
//   (Video Zero: X=100 Y=150)         work zero this far from the cutting area's front-left corner (the X / Y home
//       spot; mm, or 4in): after homing the machine jogs there and the job starts from it. The (Stock:) bounds are
//       relative to work zero, so this also places the stock on the spoilboard. Before the first move only.
//   (Video Title: TIME=3 TEXT=First line|Second line)   a full-screen card; | = a new line; TEXT last (the rest of
//       the line, as ToolDef's NAME)
//   (Video Text: TIME=4 TEXT=...)     a caption at the bottom, over what comes next
//   (Video Wait: TIME=s)              hold (mid-job: the job holds too)
//   (Video Speed: X=62 | FIT=75 | FOR=8 REAL=5 BADGE=on)   the job's pace: X times, or fit its moves into FIT s of
//       video; FOR = only for that many s of video, then back; REAL = s at 1x at each section's first cut (after a
//       message or an M0), then easing up (0 = off); BADGE = the speed badge
// Lines before the first move are the intro, run in order; later ones run when playback reaches their line (Shot,
// Text, Title, Wait, Speed). A file whose intro has no Shot / Home / Title / Text / Wait gets the default intro
// (workshop orbit, home, machine orbit, stock).
"use strict";

const SETTINGS = { size: "wxh", machine: "wxh", fps: "num", volume: "num", pause: "num", msgtime: "num", hold: "num",
  sound: "bool", park: "bool", messages: "bool", detail: "word", scenery: "word", voice: "word" };
const KINDS = ["shot", "home", "zero", "title", "text", "wait", "speed"];
const INTRO_ONLY = new Set(["home", "zero"]);
const SHOTS = new Set(["workshop", "machine", "stock", "tool", "core", "iso", "front", "top", "side", "back", "page"]);
const MOTION = /(^|[^A-Z])G0*(0|1|2|3|38\.\d)(?![\d.])/;
const IN = 25.4;

// "KEY=VALUE KEY=VALUE TEXT=the rest" -> { key: value } (keys lower case; TEXT / NAME take the rest of the line)
function keyvals(s) {
  const out = {}, ms = [...s.matchAll(/([A-Za-z_]+)\s*=\s*/g)];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i], k = m[1].toLowerCase(), from = m.index + m[0].length;
    out[k] = (["text", "name"].includes(k) ? s.slice(from) : s.slice(from, i + 1 < ms.length ? ms[i + 1].index : undefined)).trim();
    if (["text", "name"].includes(k)) break;
  }
  return out;
}

// a line's (Video ...) comment -> { kind ("" = settings), kv } or null
function videoOf(line) {
  const m = /\(\s*Video(?:\s+([A-Za-z]+))?\s*:([^)]*)\)/i.exec(line);
  return m ? { kind: (m[1] || "").toLowerCase(), kv: keyvals(m[2]) } : null;
}

const num = (x) => x !== undefined && x !== "" && Number.isFinite(Number(x));
const mm = (x) => { const m = /^(-?[\d.]+)\s*(in|mm)?$/i.exec(String(x || "").trim()); return m ? Number(m[1]) * (/in/i.test(m[2] || "") ? IN : 1) : NaN; };

// text -> { settings, intro: [cmd], at: [cmd], firstMove (line), warnings }; cmd = { kind, kv, line (1-based) }
function parse(text) {
  const lines = String(text || "").split(/\r?\n/), out = { settings: {}, intro: [], at: [], firstMove: 0, warnings: [] };
  for (let n = 0; n < lines.length; n++) {
    const l = lines[n], code = l.replace(/\([^)]*\)/g, " ").split(";")[0].toUpperCase();
    if (!out.firstMove && MOTION.test(code)) out.firstMove = n + 1;
    const v = videoOf(l);
    if (!v) continue;
    const line = n + 1, before = !out.firstMove, warn = (t) => out.warnings.push(`line ${line}: ${t}`);
    if (!v.kind) {
      if (!before) { warn("(Video: ...) settings go before the first move"); continue; }
      for (const [k, val] of Object.entries(v.kv)) {
        const t = SETTINGS[k];
        if (!t) { warn(`unknown setting ${k.toUpperCase()}`); continue; }
        if (t === "wxh") { const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(val); if (m) out.settings[k] = [Number(m[1]), Number(m[2])]; else warn(`${k.toUpperCase()} wants WxH`); }
        else if (t === "num") { if (num(val)) out.settings[k] = Number(val); else warn(`${k.toUpperCase()} wants a number`); }
        else if (t === "bool") out.settings[k] = !/^(off|no|false|0)$/i.test(val);
        else out.settings[k] = val.toLowerCase();
      }
      continue;
    }
    if (!KINDS.includes(v.kind)) { warn(`unknown (Video ${v.kind}:)`); continue; }
    const cmd = { kind: v.kind, kv: v.kv, line };
    const bad = check(cmd, before);
    if (bad) { warn(bad); continue; }
    (before ? out.intro : out.at).push(cmd);
  }
  return out;
}

function check(c, intro) {
  const kv = c.kv, k = c.kind;
  if (INTRO_ONLY.has(k) && !intro) return `(Video ${k}:) goes before the first move`;
  for (const key of ["time", "orbit", "dist", "offset", "fit", "for", "real"]) if (kv[key] !== undefined && !num(kv[key])) return `${key.toUpperCase()} wants a number`;
  switch (k) {
    case "shot": {
      const v = (kv.view || "").toLowerCase();
      if (!SHOTS.has(v)) return `Shot VIEW= one of ${[...SHOTS].join(", ")}`;
      return v === "page" && intro ? "Shot VIEW=page: mid-job only" : null;
    }
    case "zero": return Number.isFinite(mm(kv.x)) && Number.isFinite(mm(kv.y)) ? null : "Zero wants X= and Y= (mm, or 4in)";
    case "title": case "text": return kv.text ? null : `${k[0].toUpperCase() + k.slice(1)} wants TEXT=`;
    case "wait": return num(kv.time) ? null : "Wait wants TIME=";
    case "speed":
      if (kv.x !== undefined && (!num(kv.x) || Number(kv.x) <= 0)) return "Speed X= wants a number > 0";
      if (kv.x === undefined && kv.fit === undefined && kv.real === undefined && kv.badge === undefined) return "Speed wants X=, FIT=, REAL= or BADGE=";
      if (kv.for !== undefined && kv.x === undefined && kv.fit === undefined) return "Speed FOR= goes with X= or FIT=";
      return null;
  }
  return null;
}

// a Shot cmd -> { name, secs (blend), orbit (s, 0 = none), dist (mm or null) }
function shotOf(c, blend = 1.5) {
  const kv = c.kv;
  return { name: (kv.view || "core").toLowerCase(), secs: num(kv.time) ? Number(kv.time) : blend,
    orbit: num(kv.orbit) ? Number(kv.orbit) : 0, dist: num(kv.dist) ? Number(kv.dist) : null };
}
const titleText = (c) => c.kv.text.split("|").map((s) => s.trim()).join("\n");
const secsOf = (c, d) => (num(c.kv.time) ? Number(c.kv.time) : d);
const zeroOf = (c) => [mm(c.kv.x), mm(c.kv.y)];

// the intro when a file has none of its own (record_demo's flags: orbit, home)
function defaultIntro(o) {
  const c = (kind, kv) => ({ kind, kv, line: 0 });
  return [c("shot", { view: "workshop", time: "1", orbit: String(o.orbit) }), ...(o.home ? [c("home", { offset: "30" })] : []),
    c("shot", { view: "machine", time: "2", orbit: String(o.orbit) }), c("shot", { view: "stock", time: "2.5" }), c("wait", { time: "0.5" })];
}
const hasOwnIntro = (s) => s.intro.some((c) => ["shot", "home", "title", "text", "wait"].includes(c.kind));

module.exports = { parse, keyvals, videoOf, shotOf, titleText, secsOf, zeroOf, defaultIntro, hasOwnIntro, mm, SHOTS };
