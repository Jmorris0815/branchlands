// Game controller: progression, UI, and the four play modes.

const Game = (() => {
  const SAVE_KEY = "branchlands.v1";
  let save = { completed: {}, xp: 0, code: {}, hintsUsed: {} };
  let current = null;       // current level
  let sim = null, git = null, reviewState = null, oracleModule = null;
  const $ = (id) => document.getElementById(id);

  // ---------- persistence ----------
  function loadSave() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = { ...save, ...s }; } catch (e) { } }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }

  // ---------- progression ----------
  const zoneLevels = (n) => LEVELS.filter(l => l.zone === n);
  const zoneDone = (n) => zoneLevels(n).every(l => save.completed[l.id]);
  const zoneUnlocked = (n) => n === 1 || zoneDone(n - 1);
  const levelUnlocked = (l) => { if (!zoneUnlocked(l.zone)) return false; const zl = zoneLevels(l.zone); const i = zl.indexOf(l); return i === 0 || !!save.completed[zl[i - 1].id]; };
  function firstOpenLevel() { return LEVELS.find(l => levelUnlocked(l) && !save.completed[l.id]) || LEVELS[0]; }

  const QUESTS = {
    1: "Install Python on your own computer. In your terminal make hello.py that prints your name, then run:  python hello.py",
    2: "Write apples.py on your computer: a loop that prints 'apple 1' to 'apple 100'. Run it from the terminal.",
    3: "Write guess.py: the computer picks a number, you guess, it says higher/lower. (while + if)",
    4: "Put your stairs trick in a file tools.py with def step(): and import it from another file.",
    5: "Do it for real: open the family game folder in your terminal, run git init, git add ., git commit -m \"first commit\".",
    6: "Open a REAL pull request on the family repo (see CONTRIBUTING.md). The other person reviews. Then merge it.",
    7: "Install Ollama, run a small model, and give it a system prompt that makes it talk like your robot.",
  };

  // ---------- rendering: zones + levels ----------
  function renderZones() {
    const el = $("zones"); el.innerHTML = "";
    ZONES.forEach(z => {
      const d = document.createElement("button");
      const unlocked = zoneUnlocked(z.n), done = zoneDone(z.n);
      d.className = "zone" + (unlocked ? "" : " locked") + (done ? " done" : "") + (current && current.zone === z.n ? " active" : "");
      d.innerHTML = `<span class="zemoji">${unlocked ? z.emoji : "🔒"}</span><span class="zname">${z.n}. ${z.name}</span><span class="zreason">${unlocked ? z.reason : "???"}</span>`;
      d.onclick = () => { if (unlocked) openLevel(zoneLevels(z.n).find(l => !save.completed[l.id]) || zoneLevels(z.n)[0]); };
      el.appendChild(d);
    });
    $("xp").textContent = save.xp + " XP";
  }
  function renderLevels() {
    const el = $("levels"); el.innerHTML = "";
    if (!current) return;
    zoneLevels(current.zone).forEach(l => {
      const b = document.createElement("button");
      const ok = levelUnlocked(l);
      b.className = "lvl" + (l === current ? " active" : "") + (save.completed[l.id] ? " done" : "") + (ok ? "" : " locked");
      b.textContent = (save.completed[l.id] ? "✓ " : ok ? "" : "🔒 ") + l.id + "  " + l.title;
      b.onclick = () => ok && openLevel(l);
      el.appendChild(b);
    });
  }

  // ---------- mission panel ----------
  function renderMission() {
    const z = ZONES[current.zone - 1];
    const rules = [];
    if (current.maxLines) rules.push(`Max <b>${current.maxLines}</b> lines of code (imports, blanks and comments don't count)`);
    if (current.requireDef) rules.push("Must define a function with <b>def</b> and call it");
    if (current.generate) rules.push("The map changes every run");
    const goalText = { reach: "Stand on the 🏠 tile.", collect: "Pick up every item.", deliver: "Pick up every item, then stand on 🏠.", switches: "Press every switch, then stand on 🏠." };
    $("mission").innerHTML = `
      <div class="mzone" style="border-color:${z.color}">${z.emoji} Zone ${z.n}: ${z.name} <span class="mreason">${z.reason}</span></div>
      <h2>${current.id} ${current.title} <span class="xpchip">+${current.xp} XP</span></h2>
      <p class="story">${current.story}</p>
      ${current.goal ? `<p class="goal"><b>Goal:</b> ${goalText[current.goal.type]}</p>` : ""}
      ${current.steps ? `<ol class="steps">${current.steps.map(s => `<li><code>${s}</code></li>`).join("")}</ol>` : ""}
      ${current.tests ? `<ul class="tests">${current.tests.map((t, i) => `<li id="test-${i}">○ "${t.q}" → ${t.desc}</li>`).join("")}</ul>` : ""}
      ${rules.length ? `<ul class="rules">${rules.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
      <div class="hints"><button id="hintBtn" class="small">💡 Hint</button><div id="hintBox"></div></div>`;
    $("hintBtn").onclick = () => {
      const n = (save.hintsUsed[current.id] || 0);
      if (n >= current.hints.length) return;
      save.hintsUsed[current.id] = n + 1; persist();
      const box = $("hintBox"); const p = document.createElement("p"); p.textContent = current.hints[n]; box.appendChild(p);
      if (n + 1 >= current.hints.length) $("hintBtn").disabled = true;
    };
  }

  // ---------- open level ----------
  function openLevel(l) {
    current = l; Render.cancel();
    renderZones(); renderLevels(); renderMission();
    document.querySelectorAll(".mode").forEach(e => e.hidden = true);
    $("console").textContent = "";
    if (l.mode === "robot") setupRobot();
    if (l.mode === "git") setupGit();
    if (l.mode === "review") setupReview();
    if (l.mode === "oracle") setupOracle();
    location.hash = l.id;
  }

  // ---------- helpers ----------
  function countLines(code) { return code.split("\n").filter(s => { const t = s.trim(); return t && !t.startsWith("#") && !/^(import|from)\s/.test(t); }).length; }
  function hasDefAndCall(code) { const m = code.match(/^\s*def\s+(\w+)\s*\(/m); if (!m) return false; const re = new RegExp("(^|[^\\w])" + m[1] + "\\s*\\(", "g"); return (code.match(re) || []).length >= 2; }
  function log(msg, cls) { const c = $("console"); const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = msg; c.appendChild(d); c.scrollTop = c.scrollHeight; }
  function editorTabs(ta) {
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; }
      if (e.key === "Enter") { // keep indentation
        const s = ta.selectionStart; const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1; const line = ta.value.slice(lineStart, s);
        const ind = (line.match(/^\s*/) || [""])[0] + (line.trim().endsWith(":") ? "    " : "");
        e.preventDefault(); ta.value = ta.value.slice(0, s) + "\n" + ind + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 1 + ind.length;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("runBtn").click(); }
    });
    ta.addEventListener("input", updateLineCount);
  }
  function updateLineCount() {
    const ta = $("code"); const n = countLines(ta.value);
    const lc = $("lineCount"); lc.textContent = n + " line" + (n === 1 ? "" : "s") + (current.maxLines ? " / " + current.maxLines : "");
    lc.className = current.maxLines && n > current.maxLines ? "over" : "";
  }

  // ---------- ROBOT mode ----------
  function setupRobot() {
    $("mode-robot").hidden = false; $("mode-editor").hidden = false;
    sim = new Sim(current);
    Render.load(sim.snapshot(), ZONES[current.zone - 1].color);
    $("code").value = save.code[current.id] || current.starter;
    $("code").disabled = false;
    updateLineCount();
    $("runBtn").onclick = runRobot;
    $("resetBtn").onclick = () => { Render.cancel(); sim = new Sim(current); Render.load(sim.snapshot(), ZONES[current.zone - 1].color); $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = current.starter; updateLineCount(); };
  }
  async function runRobot(codeOverride) {
    const code = typeof codeOverride === "string" ? codeOverride : $("code").value;
    if (typeof codeOverride !== "string") { save.code[current.id] = code; persist(); }
    $("console").textContent = "";
    if (current.maxLines && countLines(code) > current.maxLines) { log(`Too long: ${countLines(code)} lines, limit is ${current.maxLines}. A loop would make this shorter.`, "err"); return false; }
    if (current.requireDef && !hasDefAndCall(code)) { log("This level needs a function: define one with def and call it at least once.", "err"); return false; }
    Render.cancel();
    sim = new Sim(current); Render.load(sim.snapshot(), ZONES[current.zone - 1].color);
    $("runBtn").disabled = true;
    const res = await PY.run(code, sim);
    if (res.output) log(res.output.trimEnd(), "out");
    await Render.play(sim.events, $("speed").value, ev => { if (ev.type === "say") log("🤖 " + ev.text, "out"); });
    $("runBtn").disabled = false;
    if (res.error) { log(res.error.raw, "err"); if (res.error.tip) log("Tip: " + res.error.tip, "tip"); return false; }
    const why = sim.evaluate();
    if (why) { log("Not yet: " + why, "warn"); return false; }
    log("✅ Mission complete!", "ok"); complete(); return true;
  }

  // ---------- GIT mode ----------
  function setupGit() {
    $("mode-git").hidden = false;
    git = new GitSim(); if (current.preset) git.preset(current.preset);
    const term = $("term"); term.innerHTML = "";
    termLine("Welcome to the Time Tower terminal. Type help to see the commands.", "tip");
    if (current.preset === "one-commit") termLine("This repo already has one commit on main. Try: git log", "tip");
    git.drawGraph($("graph"));
    const input = $("termIn"); input.value = ""; input.focus();
    input.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const line = input.value.trim(); input.value = "";
      if (!line) return;
      termLine("$ " + line, "cmd");
      if (line === "clear") { term.innerHTML = ""; return; }
      git.run(line).forEach(s => termLine(s, s.startsWith("error") ? "err" : ""));
      git.drawGraph($("graph"));
      if (!git.solved && current.check(git)) { git.solved = true; termLine("✅ The Tower door opens.", "ok"); complete(); }
    };
  }
  function termLine(s, cls) { const d = document.createElement("div"); d.className = cls || ""; d.textContent = s; $("term").appendChild(d); $("term").scrollTop = $("term").scrollHeight; }

  // ---------- REVIEW mode ----------
  function setupReview() {
    $("mode-review").hidden = false; $("mode-robot").hidden = false; $("mode-editor").hidden = false;
    sim = new Sim(current); Render.load(sim.snapshot(), ZONES[current.zone - 1].color);
    reviewState = { requested: false };
    const pr = current.pr;
    $("prHead").innerHTML = `<b>Pull request #1</b> · <span class="branch">${pr.branch}</span> → <span class="branch">main</span><br><span class="muted">${pr.author} wants to merge 1 commit: “${pr.title}”</span>`;
    $("code").value = pr.code; $("code").disabled = true; updateLineCount();
    $("reviewComment").value = ""; $("reviewStatus").textContent = "Step 1: read the code. Step 2: leave a comment and request changes. Step 3: fix it. Step 4: approve & merge.";
    $("runBtn").onclick = async () => { // "Approve & merge" runs the code
      if (!reviewState.requested) { log("Review first: write what's wrong and click Request changes. Even if you think it's fine.", "warn"); return; }
      await runRobot();
    };
    $("resetBtn").onclick = () => { Render.cancel(); sim = new Sim(current); Render.load(sim.snapshot(), ZONES[current.zone - 1].color); $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = pr.code; updateLineCount(); };
    $("requestBtn").onclick = () => {
      const c = $("reviewComment").value.trim();
      if (c.length < 10) { $("reviewStatus").textContent = "Write a real comment (at least 10 characters). Say WHAT is wrong and WHERE."; return; }
      reviewState.requested = true; $("code").disabled = false; $("code").focus();
      $("reviewStatus").textContent = "Changes requested: “" + c + "”. Now fix the code and click Approve & merge.";
      log("📝 You requested changes: " + c, "tip");
    };
  }

  // ---------- ORACLE mode ----------
  function setupOracle() {
    $("mode-oracle").hidden = false; $("mode-editor").hidden = false;
    $("code").value = save.code[current.id] || current.starter; $("code").disabled = false; updateLineCount();
    $("chat").innerHTML = ""; oracleModule = null;
    chatLine("🔮 Oracle: Write reply(message) and press Run. I will ask you four things.", "oracle");
    $("runBtn").onclick = runOracle;
    $("resetBtn").onclick = () => { $("chat").innerHTML = ""; $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = current.starter; updateLineCount(); };
    $("chatIn").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const q = $("chatIn").value.trim(); $("chatIn").value = ""; if (!q) return;
      chatLine("You: " + q, "you");
      if (!oracleModule) { chatLine("🔮 Oracle: press Run first so your brain exists.", "oracle"); return; }
      const r = PY.call(oracleModule, "reply", [q]);
      chatLine(r.error ? "💥 " + r.error : "🤖 " + r.value, r.error ? "err" : "bot");
    };
  }
  function chatLine(s, cls) { const d = document.createElement("div"); d.className = "line " + (cls || ""); d.textContent = s; $("chat").appendChild(d); $("chat").scrollTop = $("chat").scrollHeight; }
  async function runOracle() {
    const code = $("code").value; save.code[current.id] = code; persist();
    $("console").textContent = ""; $("chat").innerHTML = "";
    const res = await PY.run(code, null);
    if (res.output) log(res.output.trimEnd(), "out");
    if (res.error) { log(res.error.raw, "err"); if (res.error.tip) log("Tip: " + res.error.tip, "tip"); return; }
    oracleModule = res.module;
    let pass = 0;
    current.tests.forEach((t, i) => {
      chatLine("🔮 Oracle: " + t.q, "oracle");
      const r = PY.call(oracleModule, "reply", [t.q]);
      const el = $("test-" + i);
      if (r.error) { chatLine("💥 " + r.error, "err"); el.textContent = "✗ \"" + t.q + "\" → crashed"; el.className = "fail"; return; }
      const ok = typeof r.value === "string" && t.ok(r.value);
      chatLine("🤖 " + String(r.value), ok ? "bot" : "bot dim");
      el.textContent = (ok ? "✓" : "✗") + " \"" + t.q + "\" → " + t.desc; el.className = ok ? "pass" : "fail";
      if (ok) pass++;
    });
    if (pass === current.tests.length) { chatLine("🔮 Oracle: A mind, however small. The gate opens.", "oracle"); log("✅ All four answered.", "ok"); complete(); }
    else log(`${pass}/${current.tests.length} answered. Add more rules and run again. Then talk to your bot in the chat box.`, "warn");
  }

  // ---------- completion ----------
  function complete() {
    const first = !save.completed[current.id];
    if (first) { save.completed[current.id] = true; save.xp += current.xp; persist(); }
    renderZones(); renderLevels();
    const z = ZONES[current.zone - 1];
    const zoneNowDone = zoneDone(current.zone);
    const next = LEVELS[LEVELS.indexOf(current) + 1];
    let html = `<h2>${first ? "+" + current.xp + " XP" : "Done again"} · ${current.title}</h2>`;
    if (zoneNowDone && first) {
      html += `<div class="unlock"><div class="big">${z.emoji}</div><h3>Reason unlocked</h3><p class="reasonline">“${z.reason}”</p>
        <p class="quest"><b>Real-world quest:</b> ${QUESTS[z.n]}</p>
        ${next ? `<p>Zone ${next.zone}: <b>${ZONES[next.zone - 1].name}</b> is open.</p>` : "<p>You finished the prototype. The next zones are in docs/PROGRAM.md.</p>"}</div>`;
    }
    html += `<div class="row">${next ? `<button id="nextBtn" class="primary">Next level →</button>` : ""}<button id="closeBtn">Stay here</button></div>`;
    showModal(html);
    if (next) $("nextBtn").onclick = () => { hideModal(); openLevel(next); };
    $("closeBtn").onclick = hideModal;
  }
  function showModal(html) { $("modalBody").innerHTML = html; $("modal").hidden = false; }
  function hideModal() { $("modal").hidden = true; }

  function showCodex() {
    const rows = ZONES.map(z => `<li class="${zoneDone(z.n) ? "got" : zoneUnlocked(z.n) ? "open" : "locked"}">${zoneDone(z.n) ? z.emoji : "🔒"} <b>${z.name}</b><br>${zoneDone(z.n) || zoneUnlocked(z.n) ? z.reason : "Finish the zone before to reveal."}${zoneDone(z.n) ? `<br><span class="quest">Quest: ${QUESTS[z.n]}</span>` : ""}</li>`).join("");
    showModal(`<h2>Codex of Reasons</h2><p class="muted">Seven reasons people write code. Each zone teaches one.</p><ul class="codex">${rows}</ul><div class="row"><button id="closeBtn">Close</button><button id="wipeBtn" class="danger">Reset all progress</button></div>`);
    $("closeBtn").onclick = hideModal;
    $("wipeBtn").onclick = () => { if ($("wipeBtn").textContent !== "Really reset?") { $("wipeBtn").textContent = "Really reset?"; return; } localStorage.removeItem(SAVE_KEY); save = { completed: {}, xp: 0, code: {}, hintsUsed: {} }; hideModal(); openLevel(LEVELS[0]); };
  }

  // ---------- boot ----------
  function init() {
    loadSave();
    Render.init($("world"));
    editorTabs($("code"));
    $("codexBtn").onclick = showCodex;
    $("modal").addEventListener("click", e => { if (e.target === $("modal")) hideModal(); });
    const h = location.hash.replace("#", "");
    const fromHash = LEVEL_BY_ID[h];
    openLevel(fromHash && levelUnlocked(fromHash) ? fromHash : firstOpenLevel());
    if (typeof Sk === "undefined") log("Python engine didn't load. Check your internet connection and refresh.", "err");
  }
  return { init, openLevel };
})();
document.addEventListener("DOMContentLoaded", Game.init);
