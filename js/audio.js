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
  };
  return { play: (n) => { if (sfx[n]) sfx[n](); }, set enabled(v) { enabled = v; }, get enabled() { return enabled; } };
})();
window.Audio_ = Audio_;
