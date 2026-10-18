// Canvas renderer, tile art, event playback, particles.

const Render = (() => {
  const T = 44;
  let canvas, ctx, fx, fctx, state, theme = "sand", bubble = null, cancelFlag = false, particles = [], crabPos = {}, tickNo = 0, paint = "#3b4a9e";
  function setPaint(c) { paint = c; }
  function pickTile(e) { if (!state) return null; const r = canvas.getBoundingClientRect(); return { x: Math.floor((e.clientX - r.left) / r.width * state.w), y: Math.floor((e.clientY - r.top) / r.height * state.h) }; }

  const THEMES = {
    sand: { floor: "#e3d3a8", floor2: "#dccb9c", wall: "#6b5a46", wallTop: "#8a7558" },
    grass: { floor: "#b9dba3", floor2: "#aed397", wall: "#4f6b3f", wallTop: "#6a8c55" },
    stone: { floor: "#b3c9db", floor2: "#a8bfd2", wall: "#4a5563", wallTop: "#65717f" },
    wood: { floor: "#dbbfa3", floor2: "#d2b393", wall: "#5e4532", wallTop: "#7d5e46" },
    crystal: { floor: "#a9dbd6", floor2: "#9cd1cb", wall: "#3d5a64", wallTop: "#587c88" },
    ice: { floor: "#cfe3ef", floor2: "#c1d9e8", wall: "#4b6a80", wallTop: "#6b8aa0" },
  };

  function init(c, overlay) { canvas = c; ctx = c.getContext("2d"); fx = overlay; fctx = overlay.getContext("2d"); }

  function load(snapshot, themeName) {
    state = snapshot; theme = THEMES[themeName] ? themeName : "sand"; bubble = null; particles = [];
    crabPos = {}; (state.crabs || []).forEach(c => crabPos[c.id] = { x: c.x, y: c.y });
    canvas.width = state.w * T; canvas.height = state.h * T; fx.width = canvas.width; fx.height = canvas.height;
    draw();
  }

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  function drawTile(x, y, c) {
    const th = THEMES[theme], px = x * T, py = y * T, k = x + "," + y;
    if (c === "#") {
      ctx.fillStyle = th.wall; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = th.wallTop; ctx.fillRect(px + 3, py + 3, T - 6, T * 0.45);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(px + 6, py + T * 0.62, T * 0.4, 4); ctx.fillRect(px + T * 0.55, py + T * 0.78, T * 0.3, 4);
      return;
    }
    if (c === "~") {
      ctx.fillStyle = "#4f9fd8"; ctx.fillRect(px, py, T, T);
      ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 2;
      const off = ((tickNo + x * 3) % 20) / 20 * 6;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(px + 6 + off, py + 14 + i * 16); ctx.quadraticCurveTo(px + 14 + off, py + 8 + i * 16, px + 22 + off, py + 14 + i * 16); ctx.quadraticCurveTo(px + 30 + off, py + 20 + i * 16, px + 36, py + 14 + i * 16); ctx.stroke(); }
      return;
    }
    ctx.fillStyle = (x + y) % 2 ? th.floor2 : th.floor; ctx.fillRect(px, py, T, T);
    if (c === "G") { ctx.fillStyle = "rgba(255,220,100,0.35)"; ctx.fillRect(px, py, T, T); glyph("🏠", px, py); }
    if (c === "S") { ctx.fillStyle = state.switches[k] ? "#5fcf8f" : "#c0392b"; rr(px + 12, py + 14, T - 24, T - 24, 6); ctx.fill(); ctx.fillStyle = "rgba(0,0,0,0.25)"; rr(px + 16, py + 18, T - 32, T - 32, 4); ctx.fill(); }
    if (c === "D") { if (state.doors[k]) { ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(px + 4, py + 4, T - 8, T - 8); } else { ctx.fillStyle = "#7a4a2a"; rr(px + 6, py + 4, T - 12, T - 6, 8); ctx.fill(); ctx.fillStyle = "#f0b24a"; ctx.beginPath(); ctx.arc(px + T - 14, py + T / 2, 3, 0, Math.PI * 2); ctx.fill(); } }
    if (c === "X") { if (!state.gates[k]) { ctx.fillStyle = "#555e66"; for (let i = 0; i < 4; i++) ctx.fillRect(px + 7 + i * 9, py + 4, 4, T - 8); ctx.fillRect(px + 4, py + T / 2 - 2, T - 8, 4); } }
    if ("1234".includes(c)) { ctx.strokeStyle = "#8a4fd8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, T * 0.32, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = "#c9a7ff"; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, T * 0.18, tickNo / 6, tickNo / 6 + 4.5); ctx.stroke(); }
    const it = state.items[k];
    if (it === "A") glyph("🍎", px, py); if (it === "L") glyph("🔍", px, py); if (it === "*") glyph("💎", px, py); if (it === "K") glyph("🔑", px, py);
  }
  function glyph(g, px, py, s = 0.6) { ctx.font = Math.floor(T * s) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(g, px + T / 2, py + T / 2 + 2); }

  function drawProp(p) {
    const px = p.x * T, py = p.y * T, icon = p.label.split(" ")[0], name = p.label.replace(/^\S+\s/, "");
    if (p.kind === "portal") { ctx.strokeStyle = p.locked ? "#8a8a8a" : p.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2 - 3, T * 0.34, 0, Math.PI * 2); if (!p.locked) { ctx.fillStyle = p.color + "77"; ctx.fill(); } ctx.stroke(); glyph(p.locked ? "🔒" : icon, px, py - 3, 0.42); }
    else if (p.kind === "npc") { ctx.fillStyle = p.color; rr(px + 11, py + 10, T - 22, T - 18, 8); ctx.fill(); glyph(icon, px, py - 4, 0.5); }
    else { ctx.fillStyle = "#8a5a3a"; rr(px + 6, py + 12, T - 12, T - 20, 4); ctx.fill(); ctx.fillStyle = p.kind === "sign" ? "#4a6b86" : "#c8553d"; ctx.fillRect(px + 4, py + 8, T - 8, 5); glyph(icon, px, py - 2, 0.48); }
    ctx.font = "700 9px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(px + 2, py + T - 12, T - 4, 11); ctx.fillStyle = "#222"; ctx.fillText(name.slice(0, 11), px + T / 2, py + T - 3);
  }
  function drawProp(p) {
    const px = p.x * T, py = p.y * T, icon = p.label.split(" ")[0], name = p.label.replace(/^\S+\s/, "");
    if (p.kind === "portal") { ctx.strokeStyle = p.locked ? "#8a8a8a" : p.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2 - 3, T * 0.34, 0, Math.PI * 2); if (!p.locked) { ctx.fillStyle = p.color + "77"; ctx.fill(); } ctx.stroke(); glyph(p.locked ? "🔒" : icon, px, py - 3, 0.42); }
    else if (p.kind === "npc") { ctx.fillStyle = p.color; rr(px + 11, py + 10, T - 22, T - 18, 8); ctx.fill(); glyph(icon, px, py - 4, 0.5); }
    else { ctx.fillStyle = "#8a5a3a"; rr(px + 6, py + 12, T - 12, T - 20, 4); ctx.fill(); ctx.fillStyle = p.kind === "sign" ? "#4a6b86" : "#c8553d"; ctx.fillRect(px + 4, py + 8, T - 8, 5); glyph(icon, px, py - 2, 0.48); }
    ctx.font = "700 9px Nunito, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(px + 2, py + T - 12, T - 4, 11); ctx.fillStyle = "#222"; ctx.fillText(name.slice(0, 11), px + T / 2, py + T - 3);
  }
  function drawRobot(cx, cy, dir) {
    const [dx, dy] = DIRS[dir];
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, T * 0.36, T * 0.3, T * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8c8ca8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -T * 0.3); ctx.lineTo(0, -T * 0.44); ctx.stroke();
    ctx.fillStyle = "#ff5e5e"; ctx.beginPath(); ctx.arc(0, -T * 0.46, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = paint; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-T * 0.3, -T * 0.3, T * 0.6, T * 0.6, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#dfe6ff"; ctx.beginPath(); ctx.roundRect(-T * 0.22, -T * 0.22, T * 0.44, T * 0.3, 5); ctx.fill();
    const ex = dx * 4, ey = dy * 3; ctx.fillStyle = "#1d2560";
    ctx.beginPath(); ctx.arc(-T * 0.1 + ex, -T * 0.08 + ey, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(T * 0.1 + ex, -T * 0.08 + ey, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffcc00"; ctx.fillRect(-T * 0.12, T * 0.14, T * 0.24, 4);
    ctx.beginPath(); ctx.arc(dx * T * 0.36, dy * T * 0.36, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawCrab(cx, cy) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = "#e0523a"; ctx.beginPath(); ctx.ellipse(0, 2, T * 0.26, T * 0.17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#b03a26"; ctx.lineWidth = 3;
    for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(s * 8, -2 + i * 5); ctx.lineTo(s * 17, 2 + i * 6); ctx.stroke(); } ctx.beginPath(); ctx.arc(s * 14, -9, 4.5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-4, -5, 3, 0, Math.PI * 2); ctx.arc(4, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(-4, -5, 1.4, 0, Math.PI * 2); ctx.arc(4, -5, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw(robotPos) {
    if (!state) return; tickNo++;
    for (let y = 0; y < state.h; y++) for (let x = 0; x < state.w; x++) drawTile(x, y, state.grid[y][x]);
    for (const p of state.props || []) drawProp(p);
    for (const p of state.props || []) drawProp(p);
    for (const id in crabPos) drawCrab(crabPos[id].x * T + T / 2, crabPos[id].y * T + T / 2);
    const r = robotPos || state.robot;
    const cx = r.x * T + T / 2, cy = r.y * T + T / 2;
    drawRobot(cx, cy, state.robot.dir);
    if (bubble) {
      ctx.font = "13px sans-serif"; const w = ctx.measureText(bubble).width + 14;
      const bx = Math.min(Math.max(cx - w / 2, 2), canvas.width - w - 2), by = Math.max(cy - T * 0.95, 2);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5; rr(bx, by, w, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#222"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(bubble, bx + 7, by + 11);
    }
  }

  // ---- particles on the overlay canvas ----
  function burst(x, y, color, n = 12, speed = 2.2) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random()); particles.push({ x: x * T + T / 2, y: y * T + T / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, color }); }
  }
  let fxRunning = false;
  function stepParticles() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    particles = particles.filter(p => p.life > 0);
    for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.04; fctx.globalAlpha = Math.max(0, p.life); fctx.fillStyle = p.color; fctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
    fctx.globalAlpha = 1;
    if (particles.length) setTimeout(stepParticles, 16); else fxRunning = false;
  }
  function fxStart() { if (!fxRunning && particles.length) { fxRunning = true; stepParticles(); } }

  const sleep = ms => ms <= 0 ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  function tween(from, to, ms, arc) {
    if (ms <= 0) return Promise.resolve();
    return new Promise(res => {
      const t0 = performance.now();
      (function frame() {
        if (cancelFlag) return res();
        const k = Math.min(1, (performance.now() - t0) / ms);
        const lift = arc ? -Math.sin(k * Math.PI) * 0.5 : 0;
        draw({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k + lift });
        k < 1 ? setTimeout(frame, 16) : res();
      })();
    });
  }

  async function play(events, speed, onEvent) {
    cancelFlag = false;
    const instant = document.hidden;
    const base = instant ? 0 : speed === "fast" ? 55 : speed === "slow" ? 320 : 160;
    for (const ev of events) {
      if (cancelFlag) break;
      if (onEvent) onEvent(ev);
      switch (ev.type) {
        case "move": await tween(ev.from, ev.to, base); state.robot.x = ev.to.x; state.robot.y = ev.to.y; break;
        case "jump": await tween(ev.from, ev.to, base * 1.6, true); state.robot.x = ev.to.x; state.robot.y = ev.to.y; break;
        case "teleport": burst(ev.from.x, ev.from.y, "#c9a7ff", 16); fxStart(); await sleep(base * 1.2); state.robot.x = ev.to.x; state.robot.y = ev.to.y; burst(ev.to.x, ev.to.y, "#c9a7ff", 16); fxStart(); draw(); await sleep(base); break;
        case "turn": state.robot.dir = ev.dir; draw(); await sleep(base * 0.6); break;
        case "wait": bubble = "..."; draw(); await sleep(base); bubble = null; break;
        case "pick": delete state.items[ev.x + "," + ev.y]; bubble = ev.item === "*" ? "gem!" : ev.item === "K" ? "a key!" : "got it!"; burst(ev.x, ev.y, ev.item === "*" ? "#7fd3ff" : "#ffd866", 10); fxStart(); draw(); await sleep(base); bubble = null; break;
        case "press": state.switches[ev.x + "," + ev.y] = true; draw(); await sleep(base); break;
        case "doors": for (const d in state.doors) state.doors[d] = true; bubble = "doors open!"; draw(); await sleep(base * 2); bubble = null; break;
        case "unlock": state.gates[ev.x + "," + ev.y] = true; burst(ev.x, ev.y, "#ffd866", 10); fxStart(); draw(); await sleep(base); break;
        case "nothing": bubble = "nothing here"; draw(); await sleep(base * 0.8); bubble = null; break;
        case "bump": bubble = ev.what === "door" ? "locked door" : ev.what === "gate" ? "need a key" : "bonk"; draw(); await sleep(base * 0.8); bubble = null; break;
        case "say": bubble = ev.text; draw(); await sleep(base * 4); bubble = null; break;
        case "crab": crabPos[ev.id] = { x: ev.to.x, y: ev.to.y }; draw(); break;
        case "pinch": bubble = "ouch!"; burst(ev.x, ev.y, "#e0523a", 14); fxStart(); draw(); await sleep(base * 3); break;
        case "shield": delete crabPos[ev.id]; bubble = "shield!"; burst(ev.x, ev.y, "#7fb3ff", 14); fxStart(); draw(); await sleep(base * 1.5); bubble = null; break;
        case "shield": delete crabPos[ev.id]; bubble = "shield!"; burst(ev.x, ev.y, "#7fb3ff", 14); fxStart(); draw(); await sleep(base * 1.5); bubble = null; break;
      }
    }
    draw();
  }

  function cancel() { cancelFlag = true; }
  function confetti() {
    const c = document.createElement("canvas"); c.className = "confetti"; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    const g = c.getContext("2d"); const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: 4 + Math.random() * 5, a: Math.random() * 6, color: ["#5fcf8f", "#f0b24a", "#7fb3ff", "#ff7b72", "#c9a7ff"][Math.floor(Math.random() * 5)] }));
    let frames = 0;
    const t0 = performance.now();
    (function f() { if (!c.isConnected) return; g.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.x += p.vx; p.y += p.vy; p.a += 0.1; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.color; g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); g.restore(); } if (++frames < 150 && performance.now() - t0 < 3500) requestAnimationFrame(f); else c.remove(); })();
    setTimeout(() => c.remove(), 4000);
  }
  return { init, load, draw, play, cancel, confetti, setPaint, pickTile, T };
})();
window.Render = Render;
