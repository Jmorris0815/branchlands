// Tiny synthesized sound effects (no audio files). Toggle with Audio.enabled.
const Audio_ = (() => {
  let ctx = null, enabled = true;
  function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { enabled = false; } } if (ctx && ctx.state === "suspended") ctx.resume(); return ctx; }
  function tone(freq, dur, type = "square", vol = 0.08, when = 0, slide = 0) {
    if (!enabled) return; const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + when);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + when + dur);
    g.gain.setValueAtTime(vol, c.currentTime + when); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + 0.02);
  }
  function noise(dur, vol = 0.1) {
    if (!enabled) return; const c = ac(); if (!c) return;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(c.destination); s.start();
  }
  const sfx = {
    move: () => tone(520, 0.06, "square", 0.04),
    turn: () => tone(390, 0.05, "triangle", 0.05),
    jump: () => tone(300, 0.18, "square", 0.05, 0, 500),
    pick: () => { tone(660, 0.08, "triangle", 0.07); tone(990, 0.1, "triangle", 0.07, 0.07); },
    gem: () => { tone(880, 0.08, "sine", 0.08); tone(1320, 0.08, "sine", 0.08, 0.08); tone(1760, 0.14, "sine", 0.08, 0.16); },
    bump: () => tone(110, 0.12, "sawtooth", 0.06),
    splash: () => { noise(0.35, 0.12); tone(200, 0.3, "sine", 0.05, 0, -150); },
    pinch: () => { tone(160, 0.1, "sawtooth", 0.08); tone(120, 0.2, "sawtooth", 0.08, 0.1); },
    press: () => tone(240, 0.1, "square", 0.06, 0, 120),
    doors: () => { tone(330, 0.12, "triangle", 0.07); tone(440, 0.12, "triangle", 0.07, 0.12); tone(550, 0.2, "triangle", 0.07, 0.24); },
    teleport: () => tone(800, 0.3, "sine", 0.06, 0, -600),
    say: () => tone(700, 0.05, "sine", 0.04),
    error: () => { tone(200, 0.15, "sawtooth", 0.06); tone(150, 0.25, "sawtooth", 0.06, 0.15); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, i * 0.1)),
    unlock: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, "triangle", 0.08, i * 0.11)),
    click: () => tone(1000, 0.03, "square", 0.03),
    star: () => tone(1500, 0.08, "sine", 0.06),
    gear: () => [988, 1319, 1568, 1976].forEach((f, i) => tone(f, 0.12, "triangle", 0.07, i * 0.06)),
    ring: () => { tone(880, 0.1, "sine", 0.08); tone(1320, 0.16, "sine", 0.07, 0.06); },
    beep: () => tone(660, 0.16, "square", 0.05),
    go: () => tone(1320, 0.4, "square", 0.06),
    boom: () => { noise(0.4, 0.16); tone(70, 0.35, "sine", 0.14, 0, -30); },
    roar: () => { tone(90, 0.9, "sawtooth", 0.07, 0, -40); tone(60, 1.1, "sawtooth", 0.06, 0.1, -20); noise(0.8, 0.05); },
    clang: () => { tone(520, 0.25, "square", 0.05, 0, -200); tone(780, 0.18, "triangle", 0.06); noise(0.08, 0.08); },
    zap: () => { tone(1400, 0.25, "sawtooth", 0.05, 0, -1100); tone(900, 0.2, "square", 0.03, 0.05, -600); },
    land: () => { noise(0.1, 0.05); tone(95, 0.12, "sine", 0.09, 0, -40); },
    thunder: () => { if (!enabled) return; const c = ac(); if (!c) return; const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime; s.buffer = noiseBuf(c, 3, true); f.type = "lowpass"; f.frequency.value = 240; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9); s.connect(f); f.connect(g); g.connect(c.destination); s.start(); s.stop(t + 3); },
  };
  // ---------- ambience, engine and music (all synthesized) ----------
  // Harbor Town: rolling surf (filtered noise that swells), wind, gulls now and then, a soft chord pad with a
  // plucked tune over it. Levels get a quieter version. Bolt's engine hums higher the faster he drives.
  let amb = null, eng = null, pending = null;
  function noiseBuf(c, secs, brown) { const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; }
  function loopNoise(c, brown) { const s = c.createBufferSource(); s.buffer = noiseBuf(c, 4, brown); s.loop = true; s.start(); return s; }
  function lfo(c, freq, depth, target, base) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(target); target.value = base; o.start(); return o; }
  function gull(c, out) {
    const t = c.currentTime, n = 2 + Math.floor(Math.random() * 3), f0 = 1100 + Math.random() * 500;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(), g = c.createGain(), w = t + i * 0.22, bp = c.createBiquadFilter(); o.type = "sawtooth"; o.frequency.setValueAtTime(f0 * 1.25, w); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, w + 0.18);
      bp.type = "bandpass"; bp.frequency.value = f0; bp.Q.value = 3; g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(0.05, w + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, w + 0.2);
      o.connect(bp); bp.connect(g); g.connect(out); o.start(w); o.stop(w + 0.25);
    }
  }
  const SCALE = [0, 2, 4, 7, 9], CHORDS = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]]; // pentatonic tune over C, Am, F, G
  function music(c, out, root, calm) {
    const pad = c.createGain(); pad.gain.value = calm ? 0.025 : 0.035; const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; pad.connect(lp); lp.connect(out);
    const echo = c.createDelay(); echo.delayTime.value = 0.36; const fb = c.createGain(); fb.gain.value = 0.32; echo.connect(fb); fb.connect(echo); echo.connect(out);
    let bar = 0; const hz = n => 440 * Math.pow(2, (root + n - 69) / 12);
    const playBar = () => {
      const t = c.currentTime + 0.05, ch = CHORDS[bar % 4], len = 2.4;
      for (const n of ch) for (const det of [-4, 4]) { const o = c.createOscillator(), g = c.createGain(); o.type = "sawtooth"; o.frequency.value = hz(n); o.detune.value = det; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.6); o.connect(g); g.connect(pad); o.start(t); o.stop(t + len + 0.7); }
      if (!calm || bar % 2 === 0) for (let i = 0; i < 6; i++) { if (Math.random() < 0.3) continue; const w = t + i * 0.4, n = 12 + SCALE[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0), o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = hz(n); g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(calm ? 0.035 : 0.05, w + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, w + 0.9); o.connect(g); g.connect(out); g.connect(echo); o.start(w); o.stop(w + 1); }
      bar++;
    };
    playBar(); const timer = setInterval(playBar, 2400);
    return () => clearInterval(timer);
  }
  function startAmbient(kind) {
    if (amb && amb.kind === kind) return;
    if (amb) { const a = amb; amb = null; a.master.gain.setTargetAtTime(0, a.c.currentTime, 0.4); setTimeout(() => { a.stops.forEach(f => f()); a.master.disconnect(); }, 1800); }
    if (!kind || !enabled) return; const c = ac(); if (!c) return;
    const master = c.createGain(); master.gain.value = 0; master.connect(c.destination); master.gain.setTargetAtTime(1, c.currentTime, 0.8);
    const stops = [];
    if (kind === "harbor") {
      const surf = loopNoise(c, true), sf = c.createBiquadFilter(), sg = c.createGain(); sf.type = "lowpass"; surf.connect(sf); sf.connect(sg); sg.connect(master);
      const l1 = lfo(c, 0.12, 0.05, sg.gain, 0.07), l2 = lfo(c, 0.12, 300, sf.frequency, 650);
      const wind = loopNoise(c, false), wf = c.createBiquadFilter(), wg = c.createGain(); wf.type = "bandpass"; wf.Q.value = 0.7; wind.connect(wf); wf.connect(wg); wg.connect(master);
      const l3 = lfo(c, 0.05, 0.008, wg.gain, 0.012), l4 = lfo(c, 0.07, 250, wf.frequency, 500);
      const gt = setInterval(() => { if (Math.random() < 0.45) gull(c, master); }, 4000);
      stops.push(() => { [surf, wind, l1, l2, l3, l4].forEach(n => n.stop()); clearInterval(gt); });
      stops.push(music(c, master, 60, false));
    } else stops.push(music(c, master, 57, true));
    amb = { kind, c, master, stops };
  }
  function ambient(kind) {
    if (!kind) pending = null;
    if (kind && (!ctx || ctx.state !== "running")) { pending = kind; ac(); if (!ctx || ctx.state !== "running") return; }
    startAmbient(kind);
  }
  // engine: v = 0 (idle) .. 1 (full speed); call every frame while driving, or engine(null) to stop
  function engine(v) {
    if (v === null || !enabled) { if (eng) { const e = eng; eng = null; e.g.gain.setTargetAtTime(0, e.c.currentTime, 0.1); setTimeout(() => { e.o.stop(); e.n.stop(); }, 600); } return; }
    const c = ctx; if (!c || c.state !== "running") return;
    if (!eng) { const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), n = loopNoise(c, true), ng = c.createGain(); o.type = "sawtooth"; f.type = "lowpass"; f.frequency.value = 300; g.gain.value = 0; ng.gain.value = 0.5; o.connect(f); n.connect(ng); ng.connect(f); f.connect(g); g.connect(c.destination); o.start(); eng = { c, o, f, g, n }; }
    const t = c.currentTime; eng.o.frequency.setTargetAtTime(48 + v * 70, t, 0.08); eng.f.frequency.setTargetAtTime(220 + v * 600, t, 0.08); eng.g.gain.setTargetAtTime(0.012 + v * 0.03, t, 0.08);
  }
  // rain: v = 0 (dry) .. 1 (downpour), called every frame in town
  let rainSnd = null, rainLast = -1;
  function rain(v) {
    const c = ctx; if (!c || c.state !== "running") return; if (!enabled) v = 0;
    if (Math.abs(v - rainLast) < 0.01) return; rainLast = v;
    if (!rainSnd && v > 0.01) { const s = loopNoise(c, false), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain(); hp.type = "highpass"; hp.frequency.value = 900; lp.type = "lowpass"; lp.frequency.value = 7000; g.gain.value = 0; s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(c.destination); rainSnd = { s, g }; }
    if (!rainSnd) return;
    if (v <= 0.01) { const r = rainSnd; rainSnd = null; r.g.gain.setTargetAtTime(0, c.currentTime, 0.2); setTimeout(() => r.s.stop(), 1500); return; }
    rainSnd.g.gain.setTargetAtTime(v * 0.05, c.currentTime, 0.3);
  }
  // browsers only allow sound after a click or key press
  const wake = () => { const c = ac(); if (c && pending) { const k = pending; const go = () => { if (pending === k) { pending = null; startAmbient(k); } }; if (c.state === "running") go(); else c.resume().then(go); } };
  window.addEventListener("pointerdown", wake); window.addEventListener("keydown", wake);
  return { play: (n) => { if (sfx[n]) sfx[n](); }, ambient, engine, rain,
    set enabled(v) { enabled = v; if (!v) { startAmbient(null); engine(null); } }, get enabled() { return enabled; } };
})();
window.Audio_ = Audio_;
