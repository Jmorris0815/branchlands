// World map: the island, zone nodes, paths. Click a node to enter a zone.
const WorldMap = (() => {
  const W = 900, H = 480;
  let canvas, ctx, nodes = [], hover = -1, selected = -1, raf = null, t = 0, getStatus, onEnter, onHover;

  function init(c, statusFn, enterFn, hoverFn) {
    canvas = c; ctx = c.getContext("2d"); getStatus = statusFn; onEnter = enterFn; onHover = hoverFn;
    canvas.width = W; canvas.height = H;
    nodes = ZONES.map(z => ({ ...z.map, zone: z }));
    canvas.addEventListener("mousemove", e => { const i = hit(e); if (i !== hover) { hover = i; canvas.style.cursor = i >= 0 ? "pointer" : "default"; if (onHover) onHover(i >= 0 ? nodes[i].zone : null); } });
    canvas.addEventListener("mouseleave", () => { hover = -1; if (onHover) onHover(null); });
    canvas.addEventListener("click", e => { const i = hit(e); if (i >= 0) { selected = i; onEnter(nodes[i].zone); } });
  }
  function hit(e) {
    const r = canvas.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    for (let i = nodes.length - 1; i >= 0; i--) { const n = nodes[i]; if (Math.hypot(n.x - x, n.y - y) < 34) return i; }
    return -1;
  }
  function start() { if (raf) return; (function loop() { t++; draw(); raf = requestAnimationFrame(loop); })(); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2b6fa8"); g.addColorStop(1, "#1b4d78");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 2;
    for (let y = 20; y < H; y += 34) { ctx.beginPath(); for (let x = 0; x <= W; x += 10) { const yy = y + Math.sin((x + t * 1.3 + y * 3) / 40) * 4; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
    // islands (one blob per zone, beach ring + grass/zone color)
    nodes.forEach(n => {
      const st = getStatus(n.zone.n);
      ctx.fillStyle = "#e9dcb5"; ctx.beginPath(); ctx.ellipse(n.x, n.y + 8, 78, 54, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.unlocked ? n.zone.color : "#9aa6a0"; ctx.beginPath(); ctx.ellipse(n.x, n.y + 6, 64, 42, 0, 0, Math.PI * 2); ctx.fill();
      // little trees/rocks
      ctx.fillStyle = "rgba(0,0,0,0.12)"; for (let i = 0; i < 5; i++) { const a = i * 1.26 + n.zone.n; ctx.beginPath(); ctx.arc(n.x + Math.cos(a) * 48, n.y + 6 + Math.sin(a) * 30, 5, 0, Math.PI * 2); ctx.fill(); }
    });
    // paths
    ctx.setLineDash([6, 8]); ctx.lineWidth = 3;
    for (let i = 0; i < nodes.length - 1; i++) { const a = nodes[i], b = nodes[i + 1]; ctx.strokeStyle = getStatus(b.zone.n).unlocked ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 30, b.x, b.y); ctx.stroke(); }
    ctx.setLineDash([]);
    // nodes
    nodes.forEach((n, i) => {
      const st = getStatus(n.zone.n), big = i === hover ? 1.12 : 1, r = 26 * big;
      if (st.done) { ctx.strokeStyle = "#ffd866"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.stroke(); }
      else if (st.unlocked && !st.done && st.current) { ctx.strokeStyle = "rgba(255,255,255," + (0.5 + 0.5 * Math.sin(t / 12)) + ")"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(n.x, n.y, r + 7 + Math.sin(t / 12) * 2, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = st.unlocked ? "#fffaf0" : "#6c7a74"; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = Math.floor(26 * big) + "px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(st.unlocked ? n.zone.emoji : "🔒", n.x, n.y + 2);
      ctx.font = "600 14px Fredoka, system-ui, sans-serif"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 4; ctx.lineJoin = "round";
      ctx.strokeText(n.zone.name, n.x, n.y + 46); ctx.fillText(n.zone.name, n.x, n.y + 46);
      if (st.unlocked) { ctx.font = "12px Nunito, system-ui, sans-serif"; const s = st.doneCount + "/" + st.total + (st.done ? "  ★" : ""); ctx.strokeText(s, n.x, n.y + 62); ctx.fillStyle = st.done ? "#ffd866" : "#fff"; ctx.fillText(s, n.x, n.y + 62); }
    });
  }
  return { init, start, stop, draw };
})();
window.WorldMap = WorldMap;
