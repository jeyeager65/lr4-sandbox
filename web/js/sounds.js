// Machine sounds (Parts 21-22: the engine, steppers, router, cutting, shop vac; Part 23 adds the joke mode).
// Everything is synthesized with Web Audio: no sample files. The page feeds it, once a frame, the machine's pose (mm,
// from move(): Playback, homing, the sliders, FluidNC's motor steps), the time since the last frame, the time scale in
// use (so what you hear is the real machine at its real speed, not the 10x replay), the router's set speed and how
// fast the bit is taking material off.
// Steppers: the LR4's drivers are TMC2209s (user), V1E's config.yaml runs them in StealthChop: each coil gets a smooth
// sine, so a motor hums at its electrical frequency = full-step rate / 4 (full steps = mm/s x steps_per_mm /
// microsteps; JP3_LR: X / Y 50, Z 200 steps/mm at 8 microsteps -> X at 50 mm/s = 78 Hz), nearly a pure tone, with the
// detent ripple at the full-step rate (its 4th harmonic) on top. run_mode: SpreadCycle gets a harsher, richer wave.
// Each axis is one voice through the frame's resonance, a second motor (Y, Z: one each side) a hair detuned. Under it,
// the mechanics: the wheels rolling on the tubes (X, Y) and the leadscrew nut (Z) whir with any motion, so a slow
// probe (Z at 1.7 mm/s = 10 Hz electrical: below hearing) is still heard.
// Faster than real time (user: "time-lapse"): everything keeps its real pitch and loudness, and the per-axis speeds
// and the cutting load are smoothed over sqrt(scale) x longer (62x: ~0.5 s), so the moves blend instead of chattering.
// Router (the user's Kobalt trim router, a brushed universal motor): a buzzy tone at the rotation rate (18000 RPM =
// 300 Hz), the commutator's whine 14x above it, fan noise rising with speed; spins up in ~0.5 s, runs down in ~1.5 s,
// sags a few % under load. On / off + speed: M3 / M4 S.. / M5, or (a hand-switched router) the file's messages: "Turn
// On Router at Dial 3" / "Turn Off Router", the dial read through the Kobalt table (routerPlan).
// Cutting, as loud as the material removal rate (mm^3/s, from the stock heightmap): the tooth-pass buzz (each flute
// biting: a gritty tone at RPM / 60 x flutes, the "brrrr"), the chip spray (hiss above 3.5 kHz with a random
// flutter), and a rasp (band-passed noise pulsed at the tooth rate, lower for plunges than side cuts); the router bogs
// down ~12% at full load.
// Shop vac (the user's DeWalt StealthSonic: quieter than most, still loud): muffled airflow noise, a damped motor
// whine and the hose's whoosh; on with the router (a tool-triggered outlet), ~1 s up, coasts down for ~3 s.
// Joke mode (Part 23, user: "a person making robot noises", synthesized only - no recordings): the same levels voiced
// by a mouth (jokeGraph, jokeSay): vwoooop rapids, brrrrr cutting, bzzzt plunges, rrrRRRR spin-up, mmmm while the router
// runs, bip! at each switch, beep... boop? at the probe, hmmm? at an M0. The trace is the same, so a video can have
// either voice (wav({ voice })).
// Clicks (event()): "switch" = an Omron SS-GL13 microswitch snapping (homing trips): a 2 ms burst + a 4.3 kHz ping;
// "tap" = the bit touching the touch plate (probe trip): a softer, lower metal tap.
// All the smoothing (spin-up, run-down, load) happens here per update, so the video's trace has it too.
// The demo video (tools/record_demo.js): record(true) keeps a trace of every voice per frame on the frames' own clock
// (the sum of dt, so a slow render still lines up); wav() plays that trace through the same graph in an
// OfflineAudioContext -> 16-bit WAV bytes for ffmpeg.
//   const snd = LR4Sound.create({ motors: { x: 1, y: 2, z: 2 }, modes: { x: "StealthChop" ... } })
//   snd.start()                      on a click (browsers only allow audio after one); false = no Web Audio
//   snd.setOn(on), snd.setVolume(0..1)
//   snd.update(pose [x, y, z] mm, dt s, scale, steps { x: { perMm, micro } ... }, { rpm, mrr, flutes })   once a frame
//   snd.event("switch" | "tap" | "hold")   a one-off click, now (and in the trace); "hold" = only the joke voice
//   snd.setVoice("machine" | "robot")      realistic or the joke mode (Part 23); create({ voice }) too
//   snd.levels()                     what each voice is set to (tests)
//   snd.record(on), await snd.wav({ rate }) -> Uint8Array
(function (root) {
  "use strict";
  const AXES = ["x", "y", "z"];
  const SMOOTH = 0.06;                 // s: speed low-pass at 1x (frames jitter; FluidNC's pose moves in step bursts); x sqrt(scale)
  const JUMP = 500;                    // mm/s: faster than an LR4 can move = the pose was set (a reset, a new layout): no sound
  const MIN_HZ = 8, MAX_HZ = 2000;     // stepper electrical Hz: below = a creep (silent), above held at the top
  // harmonics of the stepper tone: StealthChop = near sine + the detent ripple (4th); SpreadCycle = chopper-rough
  const WAVES = { StealthChop: [0, 1, 0.1, 0.06, 0.35, 0.04, 0.03, 0.02, 0.1], SpreadCycle: [0, 1, 0.4, 0.3, 0.5, 0.2, 0.18, 0.12, 0.2, 0.1, 0.08] };
  const MASTER = 0.25;                 // headroom: the compressor does the rest
  const TC = 0.025;                    // s: how fast the audio params follow each update
  const MIX = { step: 0.55, whir: 0.3, router: 0.5, cut: 1.0, vac: 0.3, click: 0.9 };   // relative loudness (a GUESS: by ear)
  const WHIR = { x: 650, y: 560, z: 950 };   // Hz: band centre of each axis' mechanical whir (wheels on tube / leadscrew nut)
  // one-off clicks: [ping Hz, ping decay s, burst highpass Hz, thud Hz (0 = none), loudness]
  const CLICKS = { switch: [4300, 0.018, 2500, 0, 1], tap: [2600, 0.035, 1200, 170, 0.7] };
  const ROUTER = { up: 0.5, down: 1.5, sag: 0.12, whine: 14, rpmRef: 18000 };   // s, s, fraction at full load, x rotation
  const VAC = { up: 0.9, down: 3.0 };                // s
  const MRR_FULL = 150;                // mm^3/s = full cutting load (1/8" bit slotting ~3 mm deep at 1000 mm/min)
  // the user's router: Kobalt trim router dial -> RPM (lib/fclib/fluidnc_post.py ROUTERS["kobalt"]); half steps interpolate
  const KOBALT = [[1, 10000], [2, 14000], [3, 18000], [4, 22000], [5, 26000], [6, 35000]];
  const DEFAULT_RPM = 18000;           // a job that never says (no M3, no "Turn On Router"): dial 3

  // ---- pure helpers (tests/test_sounds.js) ----
  const fullStepHz = (mmPerSec, perMm, micro) => Math.abs(mmPerSec) * perMm / Math.max(1, micro);
  // the voice for one axis: pitch = the electrical frequency (full steps / 4); louder with speed up to ~80 Hz; the
  // whir from 0.15 mm/s, growing with speed
  function voice(mmPerSec, st) {
    const v = Math.abs(mmPerSec), hz = fullStepHz(v, st.perMm, st.micro) / 4;
    const whir = v < 0.15 ? 0 : Math.min(1, 0.3 + 0.7 * Math.sqrt(v / 60));
    if (hz < MIN_HZ) return { hz: MIN_HZ, gain: 0, whir };
    const g = Math.min(1, 0.35 + 0.65 * Math.min(1, (hz - MIN_HZ) / 70));
    return { hz: Math.min(hz, MAX_HZ), gain: g, whir };
  }
  const smoothTc = (scale) => SMOOTH * Math.sqrt(Math.max(1, scale || 1));
  // smoothed per-axis speed (mm/s of the real machine, >= 0) from two poses; scale = machine s per wall s
  function velocity(prev, cur, dt, scale, v) {
    const k = 1 - Math.exp(-dt / smoothTc(scale)), s = Math.max(scale || 1, 1e-6);
    return AXES.map((a, i) => {
      const old = v ? v[i] : 0;
      if (dt > 0 && prev && AXES.some((q, j) => Math.abs(cur[j] - prev[j]) / dt / s > JUMP)) return old;
      const raw = dt > 0 && prev ? Math.abs(cur[i] - prev[i]) / dt / s : 0;
      return old + ((Number.isFinite(raw) ? raw : 0) - old) * k;
    });
  }
  const ease = (from, to, dt, tc) => from + (to - from) * (1 - Math.exp(-dt / tc));
  // steps per mm + microsteps + run_mode per axis from a config.yaml's text (axes: x: motor0: tmc_2209 ...)
  function stepsFromYaml(text) {
    const out = {}, lines = String(text || "").split(/\r?\n/);
    let axis = null, ind = -1;
    for (const l of lines) {
      const m = /^(\s*)([a-z]):\s*$/.exec(l);
      if (m && AXES.includes(m[2])) { axis = m[2]; ind = m[1].length; out[axis] = out[axis] || {}; continue; }
      if (axis && l.trim() && l.search(/\S/) <= ind) axis = null;
      if (!axis) continue;
      const per = /^\s*steps_per_mm:\s*([\d.]+)/.exec(l), mic = /^\s*microsteps:\s*(\d+)/.exec(l), rm = /^\s*run_mode:\s*(\w+)/.exec(l);
      if (per && out[axis].perMm === undefined) out[axis].perMm = Number(per[1]);
      if (mic && out[axis].micro === undefined) out[axis].micro = Number(mic[1]);
      if (rm && out[axis].mode === undefined) out[axis].mode = rm[1];
    }
    for (const a of AXES) {
      const o = out[a] || {};
      out[a] = { perMm: o.perMm || (a === "z" ? 200 : 50), micro: o.micro || 8, mode: /^spread/i.test(o.mode || "") ? "SpreadCycle" : "StealthChop" };
    }
    return out;
  }
  // dial -> RPM (Kobalt table, or a file's own "dial 3 = ~18000 RPM" pairs first)
  function dialRpm(d, own) {
    const t = own && own.length ? own : KOBALT;
    if (own && own.length) { const e = own.find((q) => Math.abs(q[0] - d) < 1e-6); if (e) return e[1]; }
    const tb = KOBALT;
    if (d <= tb[0][0]) return tb[0][1];
    for (let i = 1; i < tb.length; i++) if (d <= tb[i][0]) { const [a, ra] = tb[i - 1], [b, rb] = tb[i]; return ra + (rb - ra) * (d - a) / (b - a); }
    return t === tb ? tb[tb.length - 1][1] : tb[tb.length - 1][1];
  }
  // a G-code file -> when the router runs: [{ line (1-based), rpm (0 = off) }] sorted, + said (false: the file never
  // says, so the router runs the whole job at DEFAULT_RPM)
  function routerPlan(text) {
    const lines = String(text || "").split(/\r?\n/), ev = [], own = [];
    for (let n = 0; n < lines.length; n++) {
      const l = lines[n], cm = (l.match(/\(([^)]*)\)/g) || []).join(" ") + " " + (l.split(";")[1] || "");
      for (const m of cm.matchAll(/dial\s*([\d.]+)\s*=\s*~?\s*([\d,]+)\s*RPM/gi)) own.push([Number(m[1]), Number(m[2].replace(/,/g, ""))]);
    }
    for (let n = 0; n < lines.length; n++) {
      const l = lines[n], code = l.replace(/\([^)]*\)/g, " ").split(";")[0].toUpperCase();
      const cm = (l.match(/\(([^)]*)\)/g) || []).join(" ") + " " + (l.split(";")[1] || "");
      const m3 = /\bM0*[34](?!\d)/.test(code), m5 = /\bM0*5(?!\d)/.test(code), s = /\bS\s*([\d.]+)/.exec(code);
      if (m3) ev.push({ line: n + 1, rpm: s ? Number(s[1]) : DEFAULT_RPM });
      else if (m5) ev.push({ line: n + 1, rpm: 0 });
      else if (s && ev.length && ev[ev.length - 1].rpm > 0 && /\bS/.test(code) && !/\bM/.test(code)) ev.push({ line: n + 1, rpm: Number(s[1]) });
      const on = /turn\s+on\s+(?:the\s+)?router(?:[^)]*?dial\s*([\d.]+))?/i.exec(cm), off = /turn\s+off\s+(?:the\s+)?router/i.test(cm);
      if (on) ev.push({ line: n + 1, rpm: on[1] ? dialRpm(Number(on[1]), own) : own.length ? own[0][1] : DEFAULT_RPM });
      else if (off) ev.push({ line: n + 1, rpm: 0 });
    }
    return { events: ev, said: ev.length > 0 };
  }
  // the router's set speed at a file line (plan from routerPlan)
  function routerAt(plan, line) {
    if (!plan || !plan.said) return DEFAULT_RPM;
    let r = 0;
    for (const e of plan.events) { if (e.line > line) break; r = e.rpm; }
    return r;
  }
  // 16-bit PCM WAV from Float32 channels
  function wavBytes(chans, rate) {
    const n = chans[0].length, ch = chans.length, data = n * ch * 2, b = new DataView(new ArrayBuffer(44 + data));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); b.setUint32(4, 36 + data, true); str(8, "WAVE"); str(12, "fmt ");
    b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, ch, true); b.setUint32(24, rate, true);
    b.setUint32(28, rate * ch * 2, true); b.setUint16(32, ch * 2, true); b.setUint16(34, 16, true);
    str(36, "data"); b.setUint32(40, data, true);
    for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2)
      b.setInt16(o, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true);
    return new Uint8Array(b.buffer);
  }

  // ---- joke mode (Part 23; user: "a person making robot noises", synthesized only) ----
  // What the mouth says this frame, from the same levels the machine voices get. One thing at a time, as a person
  // would, loudest first: plunging "bzzzz" (then "t"), cutting "brrrrr" (lower and rougher under load), moving
  // "vwoooo" (higher the faster, then "p"), the router changing speed "rrrRRRR" / "RRRrrr" (pitch = its speed),
  // a quiet "mmmm" while it runs. prev = the last frame's { rpm, t } (spin-up = the speed changing).
  const VOWELS = { oo: [300, 870, 2240], er: [490, 1350, 1690], ih: [390, 1990, 2550], ee: [270, 2290, 3010], mm: [250, 1000, 2300] };
  const SPIN = 1500;                   // RPM/s: faster than this = spinning up / down ("rrrRRRR")
  function jokeSay(lv, prev, t) {
    const mv = lv.move || { v: 0, plunge: false }, C = lv.cut, R = lv.router, rk = Math.min(1.5, R.rpm / ROUTER.rpmRef);
    const spin = prev && t > prev.t ? Math.abs(R.rpm - prev.rpm) / (t - prev.t) : 0;
    if (C.gain > 0.05 && mv.plunge) return { kind: "z", vowel: "ih", hz: 165, voiced: 0.55 + 0.3 * Math.min(1, C.gain), trill: 0, fric: 0.6, fricHz: 5200 };
    if (C.gain > 0.05) {
      const ld = Math.min(1.5, C.load || 0);
      return { kind: "brr", vowel: "er", hz: 112 * (1 - 0.15 * ld), voiced: 0.55 + 0.45 * Math.min(1, C.gain), trill: 0.85, trillHz: 24 + 6 * ld, fric: 0.05 * ld, fricHz: 1500 };
    }
    if (mv.v > 0.4) return { kind: "oo", vowel: "oo", hz: 110 + 170 * Math.min(1, Math.sqrt(mv.v / 150)), voiced: Math.min(1, 0.45 + mv.v / 40), trill: 0, fric: 0 };
    if (R.gain > 0.02 && spin > SPIN) return { kind: "rrr", vowel: "er", hz: 75 + 120 * rk, voiced: 0.35 + 0.5 * Math.min(1, rk), trill: 0.8, trillHz: 30, fric: 0 };
    if (R.gain > 0.05) return { kind: "mm", vowel: "mm", hz: 92 + 20 * rk, voiced: 0.22, trill: 0, fric: 0 };
    return { kind: "", vowel: "", hz: 0, voiced: 0, trill: 0, fric: 0 };
  }
  // the one-offs, on a second mouth: [vowel, start s, length s, Hz from, Hz to, loudness] per note
  const JOKE_EVENTS = {
    switch: [["ih", 0, 0.09, 560, 640, 0.8]],                                        // "bip!"
    tap: [["ee", 0, 0.2, 440, 440, 0.8], ["oo", 0.42, 0.32, 320, 470, 0.8]],          // "beep... boop?"
    hold: [["mm", 0, 0.35, 150, 140, 0.6], ["mm", 0.35, 0.55, 140, 185, 0.6]],      // "hmmm?" (M0)
  };

  // noise + node helpers shared by both graphs
  function kit(ctx) {
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; };
    const osc = (type, f) => { const o = ctx.createOscillator(); if (typeof type === "string") o.type = type; else o.setPeriodicWave(type); o.frequency.value = f; o.start(); return o; };
    let seed = 12345;                                  // white noise, 2 s looped (seeded: the video renders the same each time)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; nd[i] = seed / 2147483648 - 1; }
    const noise = (off) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(0, off); return s; };
    const comp = ctx.createDynamicsCompressor(), master = gain(0);
    master.connect(comp).connect(ctx.destination);
    return { gain, filt, osc, noise, nb, master };
  }

  // the joke graph: { master, set(levels, t), play(kind, t) } like graph(). A mouth = a buzzy voice (sawtooth with a
  // little vibrato) through three formant band-passes (the vowel), pulsed by a trill (the tongue's "rrr"), plus a
  // fricative (band-passed noise: v, z) and short bursts for the consonants that end a sound (p, t) or start one (b).
  function jokeGraph(ctx) {
    const { gain, filt, osc, noise, nb, master } = kit(ctx);
    const TCM = 0.015;                                 // s: the mouth moves faster than the machine's params
    const out = gain(1);
    out.connect(master);
    const src = osc("sawtooth", 110), vib = osc("sine", 5.3), vibG = gain(14);   // cents
    vib.connect(vibG).connect(src.detune);
    const trillAm = gain(1), trillLfo = osc("triangle", 26), trillG = gain(0);
    trillLfo.connect(trillG).connect(trillAm.gain);
    const voiced = gain(0);
    src.connect(trillAm).connect(voiced);
    const forms = VOWELS.oo.map((f, i) => {
      const b = filt("bandpass", f, f / (70 + 30 * i)), g = gain([1, 0.55, 0.3][i] * 9);   // makeup: band-passes are quiet
      voiced.connect(b).connect(g).connect(out);
      return b;
    });
    const fric = filt("bandpass", 1200, 1.2), fricG = gain(0);
    noise(0.3).connect(fric).connect(fricG).connect(out);
    const burst = (t, hp, lp, peak, len) => {          // a consonant: a short shaped noise burst
      const b = ctx.createBufferSource(), h = filt("highpass", hp, 0.7), l = filt("lowpass", lp, 0.7), g = gain(0);
      b.buffer = nb; b.connect(h).connect(l).connect(g).connect(out);
      b.start(t, (t * 7.31) % 1.8, len + 0.05);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, len / 3);
    };
    let cur = "", last = jokeSay({ cut: { gain: 0 }, router: { rpm: 0, gain: 0 } }), pend = null, pendT = 0, onset = -1, prev = null;
    return {
      master,
      play(kind, t) {
        for (const [vw, at, len, h0, h1, loud] of JOKE_EVENTS[kind] || []) {
          const o = ctx.createOscillator(), g = gain(0), t0 = t + at, t1 = t0 + len;
          o.type = "sawtooth"; o.frequency.setValueAtTime(h0, t0); o.frequency.linearRampToValueAtTime(h1, t1);
          VOWELS[vw].forEach((f, i) => { const b = filt("bandpass", f, f / (70 + 30 * i)), fg = gain([1, 0.55, 0.3][i] * 9); o.connect(b).connect(fg).connect(g); });
          g.connect(out);
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(loud, t0 + 0.02);
          g.gain.setValueAtTime(loud, t1 - 0.04); g.gain.linearRampToValueAtTime(0, t1);
          o.start(t0); o.stop(t1 + 0.02);
        }
      },
      set(lv, t) {
        const want = jokeSay(lv, prev, t);
        prev = { rpm: lv.router.rpm, t };
        // a new sound once it has been wanted for 60 ms (frames flicker between cutting and moving)
        if (want.kind === cur) pend = null;
        else if (want.kind !== pend) { pend = want.kind; pendT = t; }
        if (pend !== null && t - pendT >= 0.06) {
          if (cur === "oo") burst(t, 150, 900, 0.5, 0.025);           // "p"
          if (cur === "z") burst(t, 3000, 9000, 0.35, 0.02);          // "t"
          if (pend === "brr") burst(t, 100, 600, 0.45, 0.02);         // "b"
          if (pend === "oo") onset = t;                               // "vw" + the swoop up
          cur = pend; pend = null;
        }
        if (want.kind === cur) last = want;
        const s = last, go = (p, v) => p.setTargetAtTime(v, t, TCM);
        const sw = cur === "oo" && onset >= 0 ? Math.min(1, (t - onset) / 0.18) : 1;   // vw: from 60% pitch, a buzz of v
        if (s.hz) go(src.frequency, s.hz * (0.6 + 0.4 * sw));
        go(voiced.gain, s.voiced * (cur === "oo" ? 0.4 + 0.6 * sw : 1));
        go(trillG.gain, s.trill || 0);
        if (s.trillHz) go(trillLfo.frequency, s.trillHz);
        if (s.vowel) VOWELS[s.vowel].forEach((f, i) => go(forms[i].frequency, f));
        const vf = cur === "oo" && sw < 1 ? 0.35 * (1 - sw) : 0;
        go(fricG.gain, Math.max(s.fric || 0, vf));
        go(fric.frequency, vf > (s.fric || 0) ? 900 : s.fricHz || 1200);
      },
    };
  }

  // the sound graph in a context (live or offline): { master, set(levels, t) }
  function graph(ctx, motors, modes) {
    const { gain, filt, osc, noise, nb, master } = kit(ctx);
    const wave = (h) => ctx.createPeriodicWave(new Float32Array(h.length), Float32Array.from(h));

    // steppers (+ their mechanics' whir)
    const voices = {};
    for (const a of AXES) {
      const g = gain(), body = filt("peaking", a === "z" ? 900 : 1400, 2.5), air = filt("lowpass", 5000);
      body.gain.value = 8;                           // the frame rings
      const oscs = [];
      for (let m = 0; m < motors[a]; m++) {
        const o = osc(wave(WAVES[(modes && modes[a])] || WAVES.StealthChop), MIN_HZ), og = gain(1 / motors[a]);
        o.detune.value = m * 7;                      // cents: two motors never quite in step
        o.connect(og).connect(body);
        oscs.push(o);
      }
      body.connect(air).connect(g).connect(master);
      const wb = filt("bandpass", WHIR[a], a === "z" ? 2 : 1.2), wg = gain();
      noise(0.2 + AXES.indexOf(a) * 0.5).connect(wb).connect(wg).connect(master);
      voices[a] = { oscs, g, wb, wg };
    }
    // router: rotation buzz + commutator whine + fan noise
    const rg = gain();
    const rot = osc("sawtooth", 300), rotLp = filt("lowpass", 2400, 0.7), rotG = gain(0.5);
    rot.connect(rotLp).connect(rotG).connect(rg);
    const wh = osc("sine", 300 * ROUTER.whine), whG = gain(0.12);
    wh.connect(whG).connect(rg);
    const fan = filt("bandpass", 2000, 0.6), fanG = gain(0.8);
    noise(0).connect(fan).connect(fanG).connect(rg);
    rg.connect(master);
    // cutting: the tooth-pass buzz, the chip spray, the rasp (noise pulsed at the tooth-pass rate)
    const cg = gain();
    cg.connect(master);
    const buzz = osc("sawtooth", 300), buzzLp = filt("lowpass", 2200, 1.5), buzzG = gain(0.55);
    buzz.connect(buzzLp).connect(buzzG).connect(cg);
    const hiss = filt("highpass", 3500, 0.7), hissG = gain(0.3), flutter = ctx.createBufferSource(), flutterG = gain(0.3);
    flutter.buffer = nb; flutter.loop = true; flutter.playbackRate.value = 0.02; flutter.start(0, 0.9);   // slow random: chips, not air
    flutter.connect(flutterG).connect(hissG.gain);
    noise(1.7).connect(hiss).connect(hissG).connect(cg);
    const cutBp = filt("bandpass", 1800, 1.1), cutAm = gain(0.6), tooth = osc("square", 300), toothG = gain(0.4), raspG = gain(0.6);
    noise(0.7).connect(cutBp).connect(cutAm).connect(raspG).connect(cg);
    tooth.connect(toothG).connect(cutAm.gain);
    // shop vac: muffled airflow, a damped motor whine, the hose's whoosh
    const vg = gain();
    const air = filt("lowpass", 1100, 0.5), airG = gain(1);
    noise(1.3).connect(air).connect(airG).connect(vg);
    const hose = filt("bandpass", 520, 4), hoseG = gain(0.6);
    noise(0.4).connect(hose).connect(hoseG).connect(vg);
    const vm = osc("triangle", 380), vmLp = filt("lowpass", 900), vmG = gain(0.06);
    vm.connect(vmLp).connect(vmG).connect(vg);
    vg.connect(master);
    const clickG = gain(MIX.click);
    clickG.connect(master);
    let nClick = 0;

    return {
      master,
      play(kind, t) {                                // a click at time t (s, context time)
        const c = CLICKS[kind];
        if (!c) return;
        const [ping, decay, hp, thud, loud] = c, end = t + Math.max(decay * 4, 0.06);
        const env = (g, peak, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.0006); g.gain.setTargetAtTime(0, t + 0.0006, d); };
        const b = ctx.createBufferSource(), bh = filt("highpass", hp, 0.7), bg = gain();
        b.buffer = nb; b.connect(bh).connect(bg).connect(clickG);
        b.start(t, (nClick++ * 0.137) % 1.9, 0.02); env(bg, loud, 0.0015);
        const o = ctx.createOscillator(), og = gain();
        o.frequency.value = ping; o.connect(og).connect(clickG); o.start(t); o.stop(end); env(og, 0.5 * loud, decay);
        if (thud) { const q = ctx.createOscillator(), qg = gain(); q.frequency.value = thud; q.connect(qg).connect(clickG); q.start(t); q.stop(end); env(qg, 0.6 * loud, 0.012); }
      },
      set(lv, t) {
        const go = (p, v) => p.setTargetAtTime(v, t, TC);
        for (const a of AXES) {
          for (const o of voices[a].oscs) go(o.frequency, lv[a].hz);
          go(voices[a].g.gain, lv[a].gain * MIX.step * (a === "z" ? 0.8 : 1));
          go(voices[a].wg.gain, lv[a].whir * MIX.whir);   // its band stays put: a band sweeping over noise sounds like a voice ("whoa")
        }
        const R = lv.router, f = Math.max(R.hz, 1);
        go(rot.frequency, f); go(wh.frequency, f * ROUTER.whine); go(fan.frequency, 500 + f * 5);
        go(rg.gain, R.gain * MIX.router);
        const C = lv.cut;
        go(cutBp.frequency, C.hz); go(tooth.frequency, Math.max(C.tooth, 1)); go(buzz.frequency, Math.max(C.tooth, 1));
        go(cg.gain, C.gain * MIX.cut);
        const V = lv.vac;
        go(vm.frequency, 380 * (0.6 + 0.4 * V.spin));   // the hose's band stays put (a sweep sounds like "whoa")
        go(vg.gain, V.gain * MIX.vac);
      },
    };
  }

  function create(opts = {}) {
    const motors = Object.assign({ x: 1, y: 2, z: 2 }, opts.motors), modes = Object.assign({}, opts.modes);   // modes: { x: "StealthChop" }
    let ctx = null, G = null, graphs = {}, on = false, vol = opts.volume ?? 0.5, sayer = opts.voice === "robot" ? "robot" : "machine";
    let pose = null, vel = null, trace = null, clock = 0, events = [], held = false;
    const make = (c, v) => (v === "robot" ? jokeGraph(c) : graph(c, motors, modes));
    let rpm = 0, load = 0, vac = 0;                  // the router's actual speed, the cutting load (0..), the vac's spin (0..1)
    let lv = { router: { rpm: 0, hz: 0, gain: 0 }, cut: { gain: 0, hz: 1800, tooth: 1, load: 0 }, vac: { spin: 0, gain: 0 } };
    for (const a of AXES) lv[a] = { hz: MIN_HZ, gain: 0, whir: 0 };

    const api = {
      start() {
        if (!ctx) {
          const AC = root.AudioContext || root.webkitAudioContext;
          if (!AC) return false;
          ctx = new AC();
          G = graphs[sayer] = make(ctx, sayer);
        }
        if (ctx.state === "suspended") ctx.resume();
        return true;
      },
      setOn(v) {
        on = !!v;
        if (on && !api.start()) { on = false; return false; }
        if (ctx) G.master.gain.setTargetAtTime(on ? vol * MASTER : 0, ctx.currentTime, 0.05);
        return on;
      },
      setVolume(v) { vol = Math.min(1, Math.max(0, v)); if (ctx && on) G.master.gain.setTargetAtTime(vol * MASTER, ctx.currentTime, 0.05); },
      volume: () => vol,
      on: () => on,
      // "machine" (realistic) or "robot" (the joke mode); each graph is made once and kept, the other one muted
      setVoice(v) {
        sayer = v === "robot" ? "robot" : "machine";
        if (ctx) {
          if (G) G.master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          G = graphs[sayer] || (graphs[sayer] = make(ctx, sayer));
          if (on) G.master.gain.setTargetAtTime(vol * MASTER, ctx.currentTime, 0.05);
        }
        return sayer;
      },
      voice: () => sayer,
      // o: { rpm (the router's set speed, 0 = off), mrr (mm^3/s the bit is removing, real time), flutes, hold (an M0
      // popup is up: the joke voice says "hmmm?" as it opens) }
      update(p, dt, scale, steps, o = {}) {
        if (!p) return;
        vel = velocity(pose, p, dt, scale, vel);
        pose = p.slice();
        const next = {};
        AXES.forEach((a, i) => { next[a] = voice(vel[i], steps[a]); });
        if (dt > 0) {
          const target = o.rpm || 0;
          rpm = ease(rpm, target, dt, target > rpm ? ROUTER.up : ROUTER.down);
          load = ease(load, rpm > 2000 ? Math.min(1.6, (o.mrr || 0) / MRR_FULL) : 0, dt, 0.12 * Math.sqrt(Math.max(1, scale || 1)));
          vac = ease(vac, target > 0 ? 1 : 0, dt, target > 0 ? VAC.up : VAC.down);
        }
        const eff = rpm * (1 - ROUTER.sag * Math.min(load, 1.5)), hz = eff / 60;
        const plunge = Math.abs(vel[2]) > 0.5 * Math.hypot(vel[0], vel[1]) + 0.2;
        next.router = { rpm: eff, hz, gain: rpm < 300 ? 0 : Math.min(1, Math.pow(rpm / ROUTER.rpmRef, 1.2)) };
        next.cut = { load, gain: load > 0.01 ? Math.min(1.2, Math.pow(load, 0.6)) : 0,
          hz: (plunge ? 850 : 1800) * Math.sqrt(Math.max(eff, 1) / ROUTER.rpmRef), tooth: hz * (o.flutes || 2) };
        next.vac = { spin: vac, gain: vac < 0.02 ? 0 : Math.pow(vac, 1.5) };
        next.move = { v: Math.hypot(vel[0], vel[1], vel[2]), plunge };
        lv = next;
        if (!!o.hold !== held) { held = !!o.hold; if (held) api.event("hold"); }
        if (trace && dt > 0) trace.push([clock, lv]);   // at the frame's start: entry k = video frame k
        clock += dt;
        if (ctx && on) G.set(lv, ctx.currentTime);
      },
      event(kind) {
        if (!CLICKS[kind] && !JOKE_EVENTS[kind]) return;
        if (trace) events.push([clock, kind]);
        if (ctx && on) G.play(kind, ctx.currentTime);
      },
      levels: () => JSON.parse(JSON.stringify(lv)),
      velocity: () => (vel ? vel.slice() : [0, 0, 0]),
      // the video: keep every frame's voices from now on (record(false) stops; the trace stays for wav())
      record(v) { if (v) { trace = []; events = []; clock = 0; } else if (trace) trace.done = true; },
      events: () => events.slice(),
      traceLength: () => (trace ? trace.length : 0),
      timeline() {                                   // per second of the trace: the loudest of each voice ("step" = tone or whir)
        const out = [];
        for (const [t, l] of trace || []) {
          const k = Math.floor(t), r = out[k] || (out[k] = { s: k, step: 0, router: 0, cut: 0, vac: 0 });
          for (const a of AXES) r.step = Math.max(r.step, l[a].gain, l[a].whir || 0);
          r.router = Math.max(r.router, l.router.gain); r.cut = Math.max(r.cut, l.cut.gain); r.vac = Math.max(r.vac, l.vac.gain);
        }
        return out.filter(Boolean).map((r) => `${r.s}:${[r.step, r.router, r.cut, r.vac].map((v) => v.toFixed(1)).join("/")}`).join(" ");
      },
      stats() {                                      // the trace per voice: { share of frames sounding, peak gain }
        const out = {}, n = trace ? trace.length : 0;
        for (const k of [...AXES, "router", "cut", "vac"]) {
          let on = 0, peak = 0;
          for (const [, l] of trace || []) { const g = Math.max(l[k].gain, l[k].whir || 0); if (g > 0.05) on++; peak = Math.max(peak, g); }
          out[k] = { on: n ? +(on / n).toFixed(3) : 0, peak: +peak.toFixed(2) };
        }
        out.clicks = events.length; out.frames = n;
        return out;
      },
      async wav(o = {}) {
        if (!trace || !trace.length) return null;
        const rate = o.rate || 48000, secs = trace[trace.length - 1][0] + 0.5;
        const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
        const oc = new OAC(1, Math.ceil(secs * rate), rate), g = make(oc, o.voice || sayer);
        g.master.gain.value = (o.volume ?? vol) * MASTER;
        for (const [t, l] of trace) g.set(l, t);
        for (const [t, k] of events) g.play(k, t);
        const buf = await oc.startRendering();
        return wavBytes([buf.getChannelData(0)], rate);
      },
      context: () => ctx,
    };
    return api;
  }

  const out = { CLICKS, JOKE_EVENTS, VOWELS, jokeSay, create, voice, velocity, fullStepHz, stepsFromYaml, dialRpm, routerPlan, routerAt, wavBytes, AXES, KOBALT, DEFAULT_RPM };
  if (typeof module !== "undefined" && module.exports) module.exports = out;
  else root.LR4Sound = out;
})(typeof self !== "undefined" ? self : this);
