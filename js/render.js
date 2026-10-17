// Canvas renderer + event playback.

const Render = (() => {
  const T = 44; // tile px
  let canvas, ctx, state, zoneColor = "#d9c7a0", bubble = null, cancelFlag = false;

  function init(c) { canvas = c; ctx = c.getContext("2d"); }

  function load(snapshot, color) {
    state = snapshot; zoneColor = color || zoneColor; bubble = null;
    canvas.width = state.grid[0].length * T; canvas.height = state.grid.length * T;
    draw();
  }

  function tileColor(c) {
    if (c === "#") return "#4a4a58";
    if (c === "~") return "#5aa7e0";
    return zoneColor;
  }

  function draw(robotPos) {
    if (!state) return;
    const g = state.grid;
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
      const c = g[y][x];
      ctx.fillStyle = tileColor(c); ctx.fillRect(x * T, y * T, T, T);
      ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.strokeRect(x * T, y * T, T, T);
      if (c === "#") { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(x * T + 4, y * T + 4, T - 8, T / 2 - 6); }
      if (c === "~") { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x * T + 6, y * T + T / 2, T / 2, 3); }
      let glyph = null;
      if (c === "G") glyph = "🏠";
      if (c === "S") glyph = state.switches[x + "," + y] ? "✅" : "🔘";
      const it = state.items[x + "," + y];
      if (it === "A") glyph = "🍎"; if (it === "L") glyph = "🔍";
      if (glyph) { ctx.font = Math.floor(T * 0.6) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(glyph, x * T + T / 2, y * T + T / 2 + 2); }
    }
    const r = robotPos || state.robot;
    const cx = r.x * T + T / 2, cy = r.y * T + T / 2;
    drawRobot(cx, cy, state.robot.dir);
    if (bubble) {
      ctx.font = "13px sans-serif"; const w = ctx.measureText(bubble).width + 14;
      const bx = Math.min(Math.max(cx - w / 2, 2), canvas.width - w - 2), by = Math.max(cy - T * 0.95, 2);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, w, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#222"; ctx.textAlign = "left"; ctx.fillText(bubble, bx + 7, by + 11);
    }
  }


  function drawRobot(cx, cy, dir) {
    const [dx, dy] = DIRS[dir];
    ctx.save(); ctx.translate(cx, cy);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, T * 0.36, T * 0.3, T * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    // antenna
    ctx.strokeStyle = "#8c8ca8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -T * 0.3); ctx.lineTo(0, -T * 0.44); ctx.stroke();
    ctx.fillStyle = "#ff5e5e"; ctx.beginPath(); ctx.arc(0, -T * 0.46, 3.5, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = "#3b4a9e"; ctx.strokeStyle = "#1d2560"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-T * 0.3, -T * 0.3, T * 0.6, T * 0.6, 8); ctx.fill(); ctx.stroke();
    // face plate
    ctx.fillStyle = "#dfe6ff"; ctx.beginPath(); ctx.roundRect(-T * 0.22, -T * 0.22, T * 0.44, T * 0.3, 5); ctx.fill();
    // eyes look in the facing direction
    const ex = dx * 4, ey = dy * 3;
    ctx.fillStyle = "#1d2560";
    ctx.beginPath(); ctx.arc(-T * 0.1 + ex, -T * 0.08 + ey, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(T * 0.1 + ex, -T * 0.08 + ey, 3.2, 0, Math.PI * 2); ctx.fill();
    // mouth
    ctx.fillStyle = "#ffcc00"; ctx.fillRect(-T * 0.12, T * 0.14, T * 0.24, 4);
    // direction nose
    ctx.fillStyle = "#ffcc00"; ctx.beginPath(); ctx.arc(dx * T * 0.36, dy * T * 0.36, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const sleep = ms => ms <= 0 ? Promise.resolve() : new Promise(r => setTimeout(r, ms));
  function tween(from, to, ms) {
    // setTimeout rather than requestAnimationFrame so playback still finishes in a background tab
    if (ms <= 0) return Promise.resolve();
    return new Promise(res => {
      const t0 = performance.now();
      (function frame() {
        if (cancelFlag) return res();
        const k = Math.min(1, (performance.now() - t0) / ms);
        draw({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
        k < 1 ? setTimeout(frame, 16) : res();
      })();
    });
  }

  async function play(events, speed, onEvent) {
    cancelFlag = false;
    const instant = document.hidden;           // background tab: no animation, just apply events
    const base = instant ? 0 : speed === "fast" ? 60 : 170;
    for (const ev of events) {
      if (cancelFlag) break;
      if (onEvent) onEvent(ev);
      switch (ev.type) {
        case "move": await tween(ev.from, ev.to, base); state.robot.x = ev.to.x; state.robot.y = ev.to.y; break;
        case "jump": await tween(ev.from, ev.to, base * 1.6); state.robot.x = ev.to.x; state.robot.y = ev.to.y; break;
        case "turn": state.robot.dir = ev.dir; draw(); await sleep(base * 0.6); break;
        case "pick": delete state.items[ev.x + "," + ev.y]; bubble = "got it!"; draw(); await sleep(base); bubble = null; break;
        case "press": state.switches[ev.x + "," + ev.y] = true; draw(); await sleep(base); break;
        case "nothing": bubble = "nothing here"; draw(); await sleep(base * 0.8); bubble = null; break;
        case "bump": bubble = "bonk"; draw(); await sleep(base * 0.8); bubble = null; break;
        case "say": bubble = ev.text; draw(); await sleep(base * 4); bubble = null; break;
        case "fall": await tween(ev.from, ev.to, base); state.robot.x = ev.to.x; state.robot.y = ev.to.y; bubble = "splash!"; draw(); await sleep(base * 3); break;
      }
    }
    draw();
  }

  function cancel() { cancelFlag = true; }
  return { init, load, draw, play, cancel };
})();
window.Render = Render;
