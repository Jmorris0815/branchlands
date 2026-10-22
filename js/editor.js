// Level editor: paint a map, set the rules, play-test, export JSON or a share link.
const Editor = (() => {
  const TILES = [["#", "wall"], [".", "floor"], ["~", "water"], ["R", "robot start"], ["G", "goal"], ["A", "apple"], ["*", "gem"], ["K", "key"], ["X", "gate"], ["S", "switch"], ["D", "door"], ["C", "crab"], ["1", "pad 1"], ["2", "pad 2"], ["3", "pad 3"], ["4", "pad 4"]];
  const GLYPH = { "#": "", ".": "", "~": "〰", R: "🤖", G: "🏠", A: "🍎", "*": "💎", K: "🔑", X: "🔒", S: "🔘", D: "🚪", C: "🦀", 1: "①", 2: "②", 3: "③", 4: "④" };
  const S = 32;
  let canvas, ctx, rows = [], brush = "#", painting = false, onPlay;
  const $ = id => document.getElementById(id);

  function blank(w, h) { return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? "#" : ".")); }

  function init(playFn) {
    onPlay = playFn; canvas = $("edCanvas"); ctx = canvas.getContext("2d");
    const pal = $("edPalette"); pal.innerHTML = "";
    TILES.forEach(([c, name]) => { const b = document.createElement("button"); b.className = "tilebtn" + (c === brush ? " active" : ""); b.dataset.c = c; b.innerHTML = `<span class="tg">${GLYPH[c] || (c === "#" ? "▇" : c === "." ? "·" : c)}</span>${name}`; b.onclick = () => { brush = c; pal.querySelectorAll(".tilebtn").forEach(x => x.classList.toggle("active", x.dataset.c === c)); }; pal.appendChild(b); });
    canvas.addEventListener("mousedown", e => { painting = true; paint(e); });
    canvas.addEventListener("mousemove", e => { if (painting) paint(e); });
    window.addEventListener("mouseup", () => painting = false);
    canvas.addEventListener("touchstart", e => { painting = true; paint(e.touches[0]); e.preventDefault(); }, { passive: false });
    canvas.addEventListener("touchmove", e => { paint(e.touches[0]); e.preventDefault(); }, { passive: false });
    $("edResize").onclick = () => { const w = Math.min(18, Math.max(4, +$("edW").value || 8)), h = Math.min(12, Math.max(3, +$("edH").value || 5)); const nr = blank(w, h); for (let y = 1; y < Math.min(h - 1, rows.length - 1); y++) for (let x = 1; x < Math.min(w - 1, rows[0].length - 1); x++) nr[y][x] = rows[y][x]; rows = nr; draw(); };
    $("edClear").onclick = () => { rows = blank(rows[0].length, rows.length); draw(); };
    $("edPlay").onclick = () => { const lv = build(); const err = validate(lv); if (err) { $("edStatus").textContent = err; return; } onPlay(lv); };
    $("edExport").onclick = () => { const lv = build(); const err = validate(lv); if (err) { $("edStatus").textContent = err; return; } $("edOut").value = exportJs(lv); $("edStatus").textContent = "Copy this into js/levels.js (inside LEVELS), then open a pull request."; };
    $("edLink").onclick = async () => { const lv = build(); const err = validate(lv); if (err) { $("edStatus").textContent = err; return; } const link = location.origin + location.pathname + "#lvl=" + encode(lv); $("edOut").value = link; try { await navigator.clipboard.writeText(link); $("edStatus").textContent = "Share link copied. Send it to your teammate; it opens straight into your level."; } catch (e) { $("edStatus").textContent = "Share link is in the box below. Copy it."; } };
    $("edImport").onclick = () => { const v = $("edOut").value.trim(); const m = v.match(/#lvl=([A-Za-z0-9_-]+)/); try { const lv = m ? decode(m[1]) : JSON.parse(v); loadLevel(lv); $("edStatus").textContent = "Loaded."; } catch (e) { $("edStatus").textContent = "Couldn't read that. Paste a share link or the JSON."; } };
    if (!rows.length) { rows = blank(10, 6); rows[2][1] = "R"; rows[2][8] = "G"; }
    draw();
  }
  function paint(e) {
    const r = canvas.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) * canvas.width / r.width / S), y = Math.floor((e.clientY - r.top) * canvas.height / r.height / S);
    if (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length) return;
    if (brush === "R") rows.forEach(row => row.forEach((c, i) => { if (c === "R") row[i] = "."; }));
    rows[y][x] = brush; draw();
  }
  function draw() {
    canvas.width = rows[0].length * S; canvas.height = rows.length * S;
    rows.forEach((row, y) => row.forEach((c, x) => {
      ctx.fillStyle = c === "#" ? "#5a5a6a" : c === "~" ? "#4f9fd8" : (x + y) % 2 ? "#e3d3a8" : "#dccb9c"; ctx.fillRect(x * S, y * S, S, S);
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.strokeRect(x * S, y * S, S, S);
      const g = GLYPH[c]; if (g && c !== "~") { ctx.font = "18px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#222"; ctx.fillText(g, x * S + S / 2, y * S + S / 2 + 1); }
    }));
  }
  function build() {
    const hints = $("edHints").value.split("\n").map(s => s.trim()).filter(Boolean);
    const lv = { id: "custom", zone: +$("edZone").value || 1, title: $("edTitle").value.trim() || "Untitled", xp: 30, mode: "robot", lang: $("edLang").value,
      story: $("edStory").value.trim() || "A custom level.", goal: { type: $("edGoal").value }, grid: rows.map(r => r.join("")), startDir: +$("edDir").value || 0,
      starter: $("edStarter").value, hints: hints.length ? hints : ["No hints. You made this one."] };
    const ml = +$("edMax").value; if (ml > 0) lv.maxLines = ml; if ($("edDef").checked) lv.requireDef = true;
    return lv;
  }
  function validate(lv) {
    const flat = lv.grid.join("");
    if (!flat.includes("R")) return "Place a robot start (R).";
    if ((lv.goal.type === "reach" || lv.goal.type === "deliver") && !flat.includes("G")) return "Place a goal (G) for this goal type.";
    if (lv.goal.type === "collect" && !/[AL]/.test(flat)) return "Add at least one apple for a collect goal.";
    if (lv.grid.some(r => r.length !== lv.grid[0].length)) return "All rows must be the same width.";
    return null;
  }
  function exportJs(lv) {
    const o = { ...lv }; delete o.id; delete o.mode;
    return "{ id: \"X-Y\", " + JSON.stringify(o, null, 2).slice(1).replace(/\n/g, "\n  ").replace(/"(\w+)":/g, "$1:") + ",";
  }
  function encode(lv) { return btoa(unescape(encodeURIComponent(JSON.stringify(lv)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function decode(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  function loadLevel(lv) {
    const grid = lv.generate ? lv.generate() : lv.grid;
    rows = grid.map(r => (typeof r === "string" ? r.split("") : r.slice()));
    $("edW").value = rows[0].length; $("edH").value = rows.length;
    $("edTitle").value = lv.title || ""; $("edStory").value = lv.story || ""; $("edGoal").value = (lv.goal && lv.goal.type) || "reach"; $("edMax").value = lv.maxLines || "";
    $("edDef").checked = !!lv.requireDef; $("edStarter").value = lv.starter || ""; $("edHints").value = (lv.hints || []).join("\n"); $("edZone").value = lv.zone || 1; $("edDir").value = lv.startDir || 0; $("edLang").value = lv.lang || "py";
    if (canvas) draw();
  }
  return { init, loadLevel, decode, encode };
})();
window.Editor = Editor;
