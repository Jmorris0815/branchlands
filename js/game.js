// Game controller (v2): screens, progression, stars, achievements, settings, and the play modes.

const Game = (() => {
  const OLD_KEY = "branchlands.v1", LEGACY_KEY = "branchlands.v2", ACTIVE_KEY = "branchlands.active", slotKey = (i) => "branchlands.slot" + i;
  let slot = Number(localStorage.getItem(ACTIVE_KEY)) || 1;
  const DEFAULTS = () => ({ v: 2, completed: {}, xp: 0, code: {}, hintsUsed: {}, gems: {}, ach: {}, quests: {}, intro: false,
    settings: { sound: true, speed: "normal", theme: "system", name: "", repo: "Jmorris0815/branchlands", ghName: "", ollama: "http://localhost:11434", model: "", gfx: "auto" } });
  let save = DEFAULTS();
  let current = null, sim = null, grid = null, git = null, review = null, oracleModule = null, authorState = null;
  let ol = { model: "", history: [], ok: false };
  const $ = (id) => document.getElementById(id);
  const sfx = (n) => Audio_.play(n);

  const RANKS = [[0, "Castaway"], [100, "Tinkerer"], [300, "Looper"], [600, "Decider"], [1000, "Toolsmith"], [1500, "Time Traveler"], [2000, "Reviewer"], [2600, "Mindmaker"], [3200, "Polyglot"]];
  const QUESTS = {
    1: "Install Python on your own computer. In your terminal make hello.py that prints your name, then run:  python hello.py",
    2: "Write apples.py on your computer: a loop that prints 'apple 1' to 'apple 100'. Run it from the terminal.",
    3: "Write guess.py: the computer picks a number, you guess, it says higher or lower. (while + if)",
    4: "Put your stairs trick in a file tools.py with def step(): and import it from another file.",
    5: "Do it for real: in the family game folder run git init, git add ., git commit -m \"first commit\". (The game can verify commits on GitHub below.)",
    6: "Open a REAL pull request on the family repo (see CONTRIBUTING.md). The other person reviews. Merge it. The game checks GitHub for it.",
    7: "Keep Ollama running and give your Oracle a new personality every week. Try a bigger model when the small one gets boring.",
    8: "Rewrite one of your Python files in JavaScript and run it with node. Same program, two languages.",
  };
  const ACH = [
    { id: "first_light", name: "First Light", desc: "Finish 1-1", icon: "🔦", test: s => !!s.completed["1-1"] },
    { id: "looper", name: "Looper", desc: "Finish The Orchard", icon: "🍎", test: () => zoneDone(2) },
    { id: "decider", name: "Decider", desc: "Finish Fog Bridge", icon: "🌫️", test: () => zoneDone(3) },
    { id: "toolsmith", name: "Toolsmith", desc: "Finish The Workshop", icon: "🔧", test: () => zoneDone(4) },
    { id: "time_traveler", name: "Time Traveler", desc: "Check out a commit from the past", icon: "⏳", test: s => !!s.completed["5-1"] },
    { id: "peacemaker", name: "Peacemaker", desc: "Resolve a merge conflict", icon: "🕊️", test: s => !!s.completed["5-3"] },
    { id: "team_player", name: "Team Player", desc: "Pull before you push", icon: "🔁", test: s => !!s.completed["5-4"] },
    { id: "reviewer", name: "Reviewer", desc: "Review three pull requests", icon: "🧐", test: s => ["6-1", "6-2", "6-3"].every(i => s.completed[i]) },
    { id: "author", name: "PR Author", desc: "Open your own pull request", icon: "✍️", test: s => !!s.completed["6-4"] },
    { id: "mindmaker", name: "Mindmaker", desc: "Build a brain with memory", icon: "🧠", test: s => !!s.completed["7-2"] },
    { id: "oracle", name: "Real Oracle", desc: "Talk to a model on your own computer", icon: "🔮", test: s => !!s.completed["7-3"] },
    { id: "polyglot", name: "Polyglot", desc: "Finish Mirror Sea", icon: "🪞", test: () => zoneDone(8) },
    { id: "perfect5", name: "Perfectionist", desc: "Three stars on five levels", icon: "⭐", test: s => Object.values(s.completed).filter(c => c.stars === 3).length >= 5 },
    { id: "gem10", name: "Gem Hunter", desc: "Collect ten gems", icon: "💎", test: s => Object.values(s.gems).reduce((a, b) => a + b, 0) >= 10 },
    { id: "selftaught", name: "Self Taught", desc: "Finish a whole zone without hints", icon: "🎓", test: s => ZONES.some(z => zoneDone(z.n) && zoneLevels(z.n).every(l => !s.hintsUsed[l.id])) },
    { id: "real_commit", name: "Real Commit", desc: "A commit by you in the family repo, verified on GitHub", icon: "🌱", test: s => !!s.quests.ghCommit },
    { id: "real_pr", name: "Real Pull Request", desc: "A merged PR by you in the family repo", icon: "🚀", test: s => !!s.quests.ghPr },
  ];

  // ---------- persistence ----------
  function loadSave() {
    save = DEFAULTS();
    try {
      const legacy = localStorage.getItem(LEGACY_KEY); // one save from before slots existed becomes Save 1
      if (legacy && !localStorage.getItem(slotKey(1))) { localStorage.setItem(slotKey(1), legacy); localStorage.removeItem(LEGACY_KEY); }
      const s = JSON.parse(localStorage.getItem(slotKey(slot)));
      if (s) { save = { ...DEFAULTS(), ...s, settings: { ...DEFAULTS().settings, ...(s.settings || {}) } }; return true; }
      const old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (old && slot === 1) { save.xp = old.xp || 0; save.code = old.code || {}; save.hintsUsed = old.hintsUsed || {}; for (const id in old.completed || {}) save.completed[id] = { stars: 1 }; save.intro = true; persist(); return true; }
    } catch (e) { }
    return false;
  }
  function persist() { try { save.meta = { last: Date.now() }; localStorage.setItem(slotKey(slot), JSON.stringify(save)); } catch (e) { } }

  // ---------- progression ----------
  const zoneLevels = (n) => LEVELS.filter(l => l.zone === n);
  const zoneDone = (n) => zoneLevels(n).filter(l => !l.optional).every(l => save.completed[l.id]);
  const zoneUnlocked = (n) => n === 1 || zoneDone(n - 1);
  function levelUnlocked(l) { if (l.id === "custom" || l.sandbox) return true; if (!zoneUnlocked(l.zone)) return false; const zl = zoneLevels(l.zone); const i = zl.indexOf(l); return i === 0 || !!save.completed[zl[i - 1].id] || !!zl[i - 1].optional && (i < 2 || !!save.completed[zl[i - 2].id]); }
  function firstOpenLevel() { return LEVELS.find(l => levelUnlocked(l) && !save.completed[l.id]) || LEVELS[0]; }
  function rank() { let r = RANKS[0][1]; for (const [x, n] of RANKS) if (save.xp >= x) r = n; return r; }
  function zoneStatus(n) { const zl = zoneLevels(n); const cur = ZONES.find(z => zoneUnlocked(z.n) && !zoneDone(z.n)); return { unlocked: zoneUnlocked(n), done: zoneDone(n), doneCount: zl.filter(l => save.completed[l.id]).length, total: zl.length, current: cur && cur.n === n }; }

  // ---------- helpers ----------
  function countLines(code, lang) { return code.split("\n").filter(s => { const t = s.trim(); if (!t) return false; if (lang === "js") return !t.startsWith("//"); return !t.startsWith("#") && !/^(import|from)\s/.test(t); }).length; }
  function hasDefAndCall(code, lang) {
    let m = lang === "js" ? code.match(/\bfunction\s+(\w+)\s*\(/) || code.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/) : code.match(/^\s*def\s+(\w+)\s*\(/m);
    if (!m) return false; const re = new RegExp("(^|[^\\w.])" + m[1] + "\\s*\\(", "g"); return (code.match(re) || []).length >= 2;
  }
  function log(msg, cls) { const c = $("console"); const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = msg; c.appendChild(d); c.scrollTop = c.scrollHeight; }
  function toast(html) { const d = document.createElement("div"); d.className = "toast"; d.innerHTML = html; $("toasts").appendChild(d); setTimeout(() => d.remove(), 5000); }
  function starsText(n) { return "★".repeat(n) + "☆".repeat(3 - n); }
  function resolveGrid(l) { return l.generate ? l.generate() : l.grid; }
  function themeOf(l) { return (ZONES[(l.zone || 1) - 1] || ZONES[0]).theme; }
  // Renderer switch: the realistic 3D renderer (js/render3d.js, Three.js) when it has loaded and the
  // Graphics setting allows it, otherwise the 2D canvas renderer (js/render.js). Same interface either way.
  let r3dInited = false;
  const R = {
    init() { Render.init($("world"), $("fx")); R.init3d(); },
    init3d() { if (!r3dInited && window.Render3D) { r3dInited = true; Render3D.init($("world"), $("fx")); } },
    pick() {
      const isPhone = document.documentElement.dataset.device === "phone";
      const g = !save.settings.gfx || save.settings.gfx === "auto" ? (isPhone ? "fast" : "realistic") : save.settings.gfx;
      const has = r3dInited && Render3D.ok, want = has && g !== "classic";
      if (has) { Render3D.setQuality(g === "fast" ? "fast" : "realistic"); Render3D.setActive(want); }
      return want ? Render3D : Render;
    },
    load(s, t) { const r = R.pick(); if (r.setLook) r.setLook(RPG.look()); r.load(s, t); },
    play(e, sp, cb) { return R.pick().play(e, sp, cb); },
    cancel() { Render.cancel(); if (r3dInited) Render3D.cancel(); },
    confetti() { Render.confetti(); R.celebrate(); },
    celebrate() { if (r3dInited && Render3D.ok && save.settings.gfx !== "classic") Render3D.celebrate(); },
    reload() { if (current && current.mode === "hub" && !$("screen-level").hidden) { Hub.open(); return; } if (current && current.mode === "robot" && !$("screen-level").hidden && !$("runBtn").disabled && grid) { R.cancel(); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current)); } },
  };
  window.addEventListener("render3d-ready", () => { if (save) { R.init3d(); R.reload(); } });

  // ---------- save slots, home screen, Harbor Town hub ----------
  function slotInfo(i) { try { const s = JSON.parse(localStorage.getItem(slotKey(i))); if (!s) return null; return { name: (s.settings && s.settings.name) || "Castaway", done: Object.keys(s.completed || {}).length, coins: s.rpg ? s.rpg.coins : 0, last: s.meta && s.meta.last, xp: s.xp || 0 }; } catch (e) { return null; } }
  function renderHome() {
    const el = $("slots"); el.innerHTML = "";
    for (let i = 1; i <= 3; i++) {
      const info = slotInfo(i); const d = document.createElement("div"); d.className = "slot" + (info ? "" : " empty");
      d.innerHTML = info
        ? `<h3>Save ${i} · ${info.name}</h3><div class="muted">${info.done}/${LEVELS.length} missions · ${info.xp} XP · 🪙 ${info.coins}</div><div class="muted">${info.last ? "Last played " + new Date(info.last).toLocaleString() : ""}</div><div class="row"><button class="primary" data-play="${i}">▶ Continue</button><button class="danger small" data-del="${i}">Delete</button></div>`
        : `<h3>Save ${i}</h3><div class="muted">Empty</div><div class="row"><button class="primary" data-new="${i}">＋ New game</button></div>`;
      el.appendChild(d);
    }
    el.querySelectorAll("[data-play]").forEach(b => b.onclick = () => { sfx("click"); startSlot(+b.dataset.play, false); });
    el.querySelectorAll("[data-new]").forEach(b => b.onclick = () => { sfx("click"); startSlot(+b.dataset.new, true); });
    el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { if (b.textContent !== "Really delete?") { b.textContent = "Really delete?"; return; } localStorage.removeItem(slotKey(+b.dataset.del)); sfx("error"); renderHome(); });
  }
  function startSlot(i, fresh) {
    slot = i; localStorage.setItem(ACTIVE_KEY, String(i));
    if (fresh) { save = DEFAULTS(); persist(); } else loadSave();
    applySettings(); RPG.init(save, rpgApi); Family.init(save, famApi); if (Family.connected()) Family.sync(); $("xp").textContent = save.xp + " XP"; $("rank").textContent = rank();
    if (!save.intro) showIntro(openHub); else openHub();
  }
  const rpgApi = { persist, sfx, toast, zoneUnlocked, levelUnlocked, openLevel: (l) => { hideModal(); openLevel(l); }, completed: () => save.completed };
  const hubApi = { R, showModal, hideModal, openLevel: (l) => { hideModal(); openLevel(l); }, showScreen, openTown: (tab) => { showScreen("town"); RPG.renderTown(tab); }, zoneUnlocked, completed: () => save.completed, save: () => save, persistSave: persist, sfx, toast, ollama: () => ({ endpoint: save.settings.ollama, model: save.settings.model }) };
  const famApi = { persist, toast, onReview(rv) {
    if (rv.status === "approved") {
      toast(`<b>${rv.reviewer_name} approved your pull request</b>${rv.comment || "Nice work."}`); sfx("win");
      const lv = LEVEL_BY_ID[rv.level_id];
      if (lv && !save.completed[lv.id]) { save.completed[lv.id] = { stars: 3, lines: 0 }; save.xp += lv.xp; RPG.addXp("review", lv.xp * 2); persist(); $("xp").textContent = save.xp + " XP"; $("rank").textContent = rank(); toast(`<b>${lv.id} ${lv.title} complete</b>A real review by a real person. +${lv.xp} XP`); if (current && current.id === lv.id) renderLevels(); }
    } else { toast(`<b>${rv.reviewer_name} asked for changes</b>${rv.comment || ""}`); sfx("error"); }
  } };
  const HUB_LEVEL = { id: "hub", zone: 1, mode: "hub", title: "Harbor Town", hints: [], xp: 0 };
  function openHub() {
    current = HUB_LEVEL; R.cancel(); showScreen("level"); location.hash = "hub";
    document.querySelectorAll(".mode").forEach(e => e.hidden = true); $("mode-robot").hidden = false;
    $("levels").innerHTML = `<button id="hubTown">📜 Quest board</button><button id="hubMap">🗺️ World map</button><button id="hubSaves">💾 Saves</button>`;
    $("hubTown").onclick = () => hubApi.openTown("board"); $("hubMap").onclick = () => showScreen("map"); $("hubSaves").onclick = () => showScreen("home");
    $("dpad").hidden = false; Hub.open(); window.scrollTo({ top: 0 }); if (Family.connected()) Family.sync();
  }
  function applySettings() {
    const t = save.settings.theme; if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    Audio_.enabled = save.settings.sound; $("soundBtn").textContent = save.settings.sound ? "🔊" : "🔇";
    $("speed").value = save.settings.speed; $("olEndpoint").value = save.settings.ollama;
    $("xp").textContent = save.xp + " XP"; $("rank").textContent = rank();
  }

  // ---------- screens ----------
  function showScreen(name) {
    for (const s of ["home", "map", "level", "editor", "town"]) $("screen-" + s).hidden = s !== name;
    if (name === "map") { WorldMap.start(); renderMapInfo(null); renderQuests(); } else WorldMap.stop();
    if (name !== "level") { R.cancel(); Hub.close(); location.hash = name === "home" ? "" : name; }
    if (name === "home") renderHome();
    if (name === "town") RPG.renderTown();
  }
  function renderMapInfo(zone) {
    const el = $("mapInfo");
    if (!zone) {
      const next = firstOpenLevel(); const z = ZONES[next.zone - 1]; const done = LEVELS.filter(l => save.completed[l.id]).length;
      el.innerHTML = `<h3>Branchlands</h3><h2>${save.settings.name ? "Welcome back, " + save.settings.name + "." : "A world you fix by writing real code."}</h2>
        <p>${done === 0 ? "Your robot washed up on Lighthouse Rock. It only understands Python, and it only does exactly what you type." : done + " of " + LEVELS.length + " missions done. Rank: <b>" + rank() + "</b>."} Hover a zone on the map to see what it teaches.</p>
        <div class="row"><button id="continueBtn" class="primary">▶ ${done === 0 ? "Start" : "Continue"}: ${next.id} ${next.title}</button><button id="sandboxBtn">🧪 Sandbox</button><button id="editorBtn">✎ Level editor</button></div>
        <p class="muted" style="margin-top:10px">Next reason to unlock: <b>${zoneDone(z.n) ? "all done" : z.name}</b></p>`;
      $("continueBtn").onclick = () => openLevel(next); $("sandboxBtn").onclick = () => openLevel(SANDBOX_LEVEL); $("editorBtn").onclick = () => openEditor();
      return;
    }
    const st = zoneStatus(zone.n); const zl = zoneLevels(zone.n);
    el.innerHTML = `<h3>Zone ${zone.n}</h3><h2>${zone.emoji} ${zone.name}</h2><p class="reason">${st.unlocked ? "“" + zone.reason + "”" : "Reason locked. Finish " + ZONES[zone.n - 2].name + " first."}</p><p>${zone.blurb}</p>
      <p class="muted">${zl.map(l => (save.completed[l.id] ? "<span style='color:var(--ok)'>✓</span> " : "○ ") + l.title + (save.completed[l.id] ? " <span style='color:var(--amber)'>" + starsText(save.completed[l.id].stars) + "</span>" : "")).join("<br>")}</p>
      ${st.unlocked ? `<div class="row"><button id="enterBtn" class="primary">Enter ${zone.name} →</button></div>` : ""}`;
    if (st.unlocked) $("enterBtn").onclick = () => openLevel(zl.find(l => !save.completed[l.id]) || zl[0]);
  }
  function renderQuests() {
    const el = $("questPanel"); const done = ZONES.filter(z => zoneDone(z.n));
    let html = `<h3>Real-world quests</h3>`;
    if (!done.length) html += `<p class="muted">Finish a zone and a quest appears here: the same skill, done for real on your own computer and in the family repo.</p>`;
    done.forEach(z => { html += `<label class="quest"><input type="checkbox" data-q="${z.n}" ${save.quests[z.n] ? "checked" : ""}><span><span class="qz">${z.emoji} ${z.name}</span><br>${QUESTS[z.n]}</span></label>`; });
    html += `<div class="toolbar" style="margin-top:8px"><button id="ghCheck" class="small">Check GitHub for my commits & PRs</button><span class="muted" style="font-size:12px">${save.settings.repo || "no repo set"} · ${save.settings.ghName || "name not set (⚙️)"}</span></div><div id="ghRes"></div>`;
    el.innerHTML = html;
    el.querySelectorAll("input[data-q]").forEach(cb => cb.onchange = () => { save.quests[cb.dataset.q] = cb.checked; persist(); sfx("click"); });
    $("ghCheck").onclick = checkGitHub;
    if (save.quests.ghLast) $("ghRes").innerHTML = save.quests.ghLast;
  }
  async function checkGitHub() {
    const res = $("ghRes"); res.innerHTML = `<div class="ghres">Checking…</div>`;
    try {
      const r = await Quests.checkGitHub(save.settings.repo, save.settings.ghName || save.settings.name);
      const who = save.settings.ghName || save.settings.name || "anyone";
      const html = `<div class="ghres"><b>${save.settings.repo}</b> · ${r.totalCommits} commits total · branches: ${r.branches.join(", ")}<br>
        <b>${r.commits.length}</b> commit(s) by ${who}: <ul>${r.commits.slice(0, 5).map(c => `<li><code>${c.sha}</code> ${c.msg}</li>`).join("")}</ul>
        <b>${r.prs.length}</b> pull request(s) by ${who}, <b>${r.merged}</b> merged: <ul>${r.prs.slice(0, 5).map(p => `<li>#${p.n} ${p.title} ${p.merged ? "✅ merged" : "(" + p.state + ")"}</li>`).join("")}</ul></div>`;
      res.innerHTML = html; save.quests.ghLast = html;
      if (r.commits.length) save.quests.ghCommit = true; if (r.merged) save.quests.ghPr = true;
      if (r.commits.length) save.quests[5] = true; if (r.merged) save.quests[6] = true;
      persist(); checkAchievements(); renderQuests();
    } catch (e) { res.innerHTML = `<div class="ghres">Couldn't reach GitHub: ${e.message}. ${location.hostname.includes("claude.ai") ? "The claude.ai preview blocks outside requests; open the game from GitHub Pages or localhost to verify quests." : "Check the repo name in ⚙️ Settings."}</div>`; }
  }

  // ---------- level screen ----------
  function renderLevels() {
    const el = $("levels"); el.innerHTML = "";
    if (!current || current.id === "custom" || current.sandbox) { el.innerHTML = `<span class="muted">${current && current.sandbox ? "Sandbox" : "Custom level"}</span>`; return; }
    zoneLevels(current.zone).forEach(l => {
      const b = document.createElement("button"); const ok = levelUnlocked(l); const c = save.completed[l.id];
      b.className = "lvl" + (l === current ? " active" : "") + (c ? " done" : "") + (ok ? "" : " locked");
      b.innerHTML = `${c ? "✓" : ok ? "" : "🔒"} ${l.id} ${l.title}${l.optional ? " <span class='muted'>(optional)</span>" : ""}${c ? `<span class="stars">${starsText(c.stars)}</span>` : ""}`;
      b.onclick = () => { if (ok) { sfx("click"); openLevel(l); } };
      el.appendChild(b);
    });
  }
  function renderMission() {
    const z = ZONES[(current.zone || 1) - 1];
    const rules = [];
    if (current.maxLines) rules.push(`Max <b>${current.maxLines}</b> lines of code (${current.lang === "js" ? "blank lines and comments" : "imports, blanks and comments"} don't count)`);
    if (current.requireDef) rules.push(`Must define a function with <b>${current.lang === "js" ? "function" : "def"}</b> and call it`);
    if (current.generate) rules.push("The map changes every run");
    if (current.par && !current.sandbox) rules.push(`Three stars at <b>${current.par}</b> lines or fewer`);
    const goalText = { reach: "Stand on the 🏠 tile.", collect: "Pick up every item.", deliver: "Pick up every item, then stand on 🏠.", switches: "Press every switch, then stand on 🏠.", free: "Nothing. Play." };
    const best = save.completed[current.id];
    $("mission").innerHTML = `
      <div class="mzone" style="border-color:${z.color}">${z.emoji} Zone ${z.n}: ${z.name} <span class="mreason">${z.reason}</span></div>
      <h2>${current.id === "custom" ? "" : current.id + " "}${current.title} ${current.xp ? `<span class="xpchip">+${current.xp} XP</span>` : ""}${best ? `<span class="best"> · best ${starsText(best.stars)}${best.lines ? " at " + best.lines + " lines" : ""}</span>` : ""}</h2>
      <p class="story">${current.story}</p>
      ${current.goal ? `<p class="goal"><b>Goal:</b> ${goalText[current.goal.type]}</p>` : ""}
      ${current.steps ? `<ol class="steps">${current.steps.map(s => `<li><code>${s}</code></li>`).join("")}</ol>` : ""}
      ${current.tests ? `<ul class="tests">${current.tests.map((t, i) => `<li id="test-${i}">○ "${t.q}" → ${t.desc}</li>`).join("")}</ul>` : ""}
      ${rules.length ? `<ul class="rules">${rules.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
      <div class="hints"><button id="hintBtn" class="small">💡 Hint</button><div id="hintBox"></div></div>`;
    const used = save.hintsUsed[current.id] || 0; const box = $("hintBox");
    for (let i = 0; i < used && i < current.hints.length; i++) { const p = document.createElement("p"); p.textContent = current.hints[i]; box.appendChild(p); }
    if (used >= current.hints.length) $("hintBtn").disabled = true;
    $("hintBtn").onclick = () => {
      const n = (save.hintsUsed[current.id] || 0); if (n >= current.hints.length) return;
      if (current.id !== "custom") { save.hintsUsed[current.id] = n + 1; persist(); }
      const p = document.createElement("p"); p.textContent = current.hints[n]; box.appendChild(p); sfx("click");
      if (n + 1 >= current.hints.length) $("hintBtn").disabled = true;
    };
  }

  function openLevel(l) {
    Hub.close(); current = l; R.cancel(); showScreen("level");
    if (l.id !== "custom" && !l.sandbox) location.hash = l.id; else if (l.sandbox) location.hash = "sandbox";
    renderLevels(); renderMission();
    document.querySelectorAll(".mode").forEach(e => e.hidden = true);
    $("console").textContent = ""; $("langSel").hidden = !l.sandbox; $("code").disabled = false;
    ({ robot: setupRobot, git: setupGit, review: setupReview, author: setupAuthor, oracle: setupOracle, ollama: setupOllama })[l.mode]();
    buildSymbar(l.lang); $("dpad").hidden = true;
    window.scrollTo({ top: 0 });
  }

  // ---------- ROBOT mode (Python or JavaScript) ----------
  function setupRobot() {
    $("mode-robot").hidden = false; $("mode-code").hidden = false;
    grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current));
    $("code").value = save.code[current.id] || current.starter;
    $("langSel").value = current.lang; updateLineCount();
    $("runBtn").textContent = "▶ Run (Ctrl+Enter)"; $("runBtn").onclick = () => runRobot();
    $("resetBtn").onclick = () => { R.cancel(); grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current)); $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = current.starter; updateLineCount(); };
    $("langSel").onchange = () => { current.lang = $("langSel").value; current.starter = current.lang === "js" ? "// everything: move jump turn_left turn_right turn_around pick press wait say sees scan done has_key\nrobot.say(\"hello world\");\nrobot.move(3);\n" : SANDBOX_LEVEL.starter; $("code").value = current.starter; updateLineCount(); buildSymbar(current.lang); };
  }
  function updateLineCount() {
    const n = countLines($("code").value, current.lang); const lc = $("lineCount");
    lc.textContent = n + " line" + (n === 1 ? "" : "s") + (current.maxLines ? " / " + current.maxLines : "") + (current.par && !current.sandbox ? " · ★★★ ≤ " + current.par : "");
    lc.className = current.maxLines && n > current.maxLines ? "over" : "";
  }
  async function runRobot(codeOverride) {
    const code = typeof codeOverride === "string" ? codeOverride : $("code").value;
    if (typeof codeOverride !== "string" && current.id !== "custom") { save.code[current.id] = code; persist(); }
    $("console").textContent = "";
    const lines = countLines(code, current.lang);
    if (current.maxLines && lines > current.maxLines) { log(`Too long: ${lines} lines, limit is ${current.maxLines}. A loop would make this shorter.`, "err"); sfx("error"); return false; }
    if (current.requireDef && !hasDefAndCall(code, current.lang)) { log(`This level needs a function: define one with ${current.lang === "js" ? "function" : "def"} and call it at least once.`, "err"); sfx("error"); return false; }
    R.cancel();
    grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current));
    $("runBtn").disabled = true;
    let events, error, output, evalMsg, gems;
    if (current.lang === "js") { const r = await JSR.run(code, current, grid, RPG.gear()); events = r.events || []; error = r.error; output = r.output; evalMsg = r.evalMsg; gems = r.gems || 0; }
    else { const r = await PY.run(code, sim); events = sim.events; error = r.error; output = r.output; evalMsg = sim.evaluate(); gems = sim.gems; }
    if (output) log(output.trimEnd(), "out");
    await R.play(events, $("speed").value, ev => { sfx(ev.type === "pick" && ev.item === "*" ? "gem" : ev.type === "pick" ? "pick" : ev.type); if (ev.type === "say") log("🤖 " + ev.text, "out"); });
    $("runBtn").disabled = false;
    if (error) { log(error.raw, "err"); if (error.tip) log("Tip: " + error.tip, "tip"); sfx("error"); return false; }
    if (evalMsg === "sandbox") { log("Sandbox: robot ended at (" + (sim ? sim.robot.x : "?") + ", " + (sim ? sim.robot.y : "?") + "). Nothing to win here.", "tip"); return false; }
    if (evalMsg) { log("Not yet: " + evalMsg, "warn"); sfx("error"); return false; }
    log("✅ Mission complete!" + (gems ? " +" + gems + " gem" + (gems > 1 ? "s" : "") : ""), "ok");
    complete({ lines, gems, events }); return true;
  }

  // ---------- GIT mode ----------
  function setupGit() {
    $("mode-git").hidden = false;
    git = new GitSim(); if (current.preset) git.preset(current.preset);
    const term = $("term"); term.innerHTML = "";
    termLine("Time Tower terminal. Type help to see the commands.", "tip");
    if (current.preset) termLine("This repo already has history. Start with: git log" + (current.preset === "remote" ? "   (and git status)" : ""), "tip");
    git.drawGraph($("graph"));
    const input = $("termIn"); input.value = ""; input.focus();
    input.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const line = input.value.trim(); input.value = ""; if (!line) return;
      termLine("$ " + line, "cmd"); sfx("click");
      if (line === "clear") { term.innerHTML = ""; return; }
      const before = git.commitCount(); git.run(line).forEach(s => termLine(s, s.startsWith("error") || s.startsWith("!") || s.startsWith("CONFLICT") ? "err" : "")); if (git.commitCount() > before) RPG.onCommit(git.commitCount() - before);
      git.drawGraph($("graph"));
      if (!git.solved && current.check(git)) { git.solved = true; termLine("✅ The Tower door opens.", "ok"); complete({}); }
    };
  }
  function termLine(s, cls) { const d = document.createElement("div"); d.className = cls || ""; d.textContent = s; $("term").appendChild(d); $("term").scrollTop = $("term").scrollHeight; }

  // ---------- REVIEW mode ----------
  function setupReview() {
    $("mode-review").hidden = false; $("mode-robot").hidden = false; $("mode-code").hidden = false;
    grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current));
    review = { requested: false }; const pr = current.pr;
    $("prHead").innerHTML = `<b>Pull request</b> · <span class="branch">${pr.branch}</span> → <span class="branch">main</span><br><span class="muted">${pr.author} wants to merge 1 commit: “${pr.title}”</span>`;
    $("code").value = pr.code; $("code").disabled = true; updateLineCount();
    $("reviewComment").value = ""; $("reviewStatus").textContent = "Read the code. Then either request changes (with a comment) or approve & merge. Merging runs it.";
    $("runBtn").textContent = "✅ Approve & merge"; $("runBtn").onclick = async () => {
      if (!pr.correct && !review.requested) { log("Review first: write what's wrong and click Request changes.", "warn"); sfx("error"); return; }
      const ok = await runRobot($("code").value);
      if (!ok && pr.correct) log("Dad: it worked when I ran it. Try Reset world and run again before approving.", "dad");
    };
    $("resetBtn").onclick = () => { R.cancel(); grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current)); $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = pr.code; updateLineCount(); };
    $("requestBtn").onclick = () => {
      const c = $("reviewComment").value.trim();
      if (c.length < 10) { $("reviewStatus").textContent = "Write a real comment (at least 10 characters). Say WHAT is wrong and WHERE."; sfx("error"); return; }
      review.requested = true; $("code").disabled = false; $("code").focus(); sfx("click");
      $("reviewStatus").textContent = "Changes requested: “" + c + "”. Now fix the code and click Approve & merge.";
      log("📝 You requested changes: " + c, "tip");
      if (pr.correct) log("Dad: Hm, what's wrong with it? Did you run it?", "dad");
    };
  }

  // ---------- AUTHOR mode: write code AND the pull request ----------
  function setupAuthor() {
    $("mode-author").hidden = false; $("mode-robot").hidden = false; $("mode-code").hidden = false;
    grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current));
    authorState = { tested: false };
    $("code").value = save.code[current.id] || current.starter; updateLineCount();
    $("prTitle").value = ""; $("prBody").value = ""; $("prTested").checked = false; $("prStatus").textContent = "";
    $("runBtn").textContent = "▶ Run (test it first)"; $("runBtn").onclick = async () => { const ok = await runRobotNoComplete(); authorState.tested = ok; if (ok) log("It works. Now write the pull request on the right and open it.", "tip"); };
    $("resetBtn").onclick = () => { R.cancel(); grid = resolveGrid(current); sim = new Sim(current, grid, RPG.gear()); R.load(sim.snapshot(), themeOf(current)); $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = current.starter; updateLineCount(); };
    $("openPrBtn").onclick = async () => {
      const title = $("prTitle").value.trim(), body = $("prBody").value.trim();
      const vague = /^(fix|fixes|stuff|update|changes|code|wip|test|asdf)$/i;
      if (title.length < 8 || vague.test(title)) { $("prStatus").textContent = "Dad: that title doesn't tell me what you did. Say what, e.g. 'Collect three apples with a loop'."; sfx("error"); return; }
      if (body.length < 30) { $("prStatus").textContent = "Dad: the description is too thin. What does the code do? Why a loop? (at least 30 characters)"; sfx("error"); return; }
      if (!$("prTested").checked) { $("prStatus").textContent = "Dad: tick the testing box only after you've actually run it from a fresh Reset world."; sfx("error"); return; }
      $("prStatus").textContent = "Dad is reviewing… (he runs it)";
      const ok = await runRobotNoComplete();
      if (!ok) { $("prStatus").textContent = "Dad requested changes: it doesn't reach the goal yet. Fix, re-test, and re-open."; log("Dad: Changes requested. See the 'Not yet' line above.", "dad"); sfx("error"); return; }
      if (Family.connected() && Family.others().length) { // a real person reviews it, inside their own game
        $("prStatus").textContent = "Sending to your family for review…";
        try {
          const rv = await Family.requestReview(current.id, title, body, $("code").value);
          $("prStatus").textContent = `Sent to ${rv.reviewer_name}. The mission completes when they approve it (they'll see it in Harbor Town → Family). You can keep playing.`;
          log(`Pull request sent to ${rv.reviewer_name} for review. 📬`, "dad"); sfx("unlock"); return;
        } catch (e) { log("Couldn't reach the family server (" + e.message + "). Dad reviews it here instead.", "warn"); }
      }
      $("prStatus").textContent = "Dad approved: “Clear title, good description, and it works. Merged.”";
      log("Dad approved and merged your pull request. 🎉", "dad");
      complete({ lines: countLines($("code").value, current.lang), gems: 0 });
    };
  }
  async function runRobotNoComplete() { // run without awarding; returns success
    const saved = complete; let ok = false; complete = () => { ok = true; };
    try { await runRobot(); } finally { complete = saved; }
    return ok;
  }

  // ---------- ORACLE mode (rule-based / memory bots in Python) ----------
  function setupOracle() {
    $("mode-oracle").hidden = false; $("mode-code").hidden = false;
    $("code").value = save.code[current.id] || current.starter; updateLineCount();
    $("chat").innerHTML = ""; oracleModule = null;
    chatLine($("chat"), "🔮 Oracle: Write reply(message) and press Run. I will ask you four things, in order.", "oracle");
    $("runBtn").textContent = "▶ Run (Ctrl+Enter)"; $("runBtn").onclick = runOracle;
    $("resetBtn").onclick = () => { $("chat").innerHTML = ""; $("console").textContent = ""; };
    $("starterBtn").onclick = () => { $("code").value = current.starter; updateLineCount(); };
    $("chatIn").onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const q = $("chatIn").value.trim(); $("chatIn").value = ""; if (!q) return;
      chatLine($("chat"), "You: " + q, "you");
      if (!oracleModule) { chatLine($("chat"), "🔮 Oracle: press Run first so your brain exists.", "oracle"); return; }
      const r = PY.call(oracleModule, "reply", [q]); sfx("say");
      chatLine($("chat"), r.error ? "💥 " + r.error : "🤖 " + r.value, r.error ? "err" : "bot");
    };
  }
  function chatLine(box, s, cls) { const d = document.createElement("div"); d.className = "line " + (cls || ""); d.textContent = s; box.appendChild(d); box.scrollTop = box.scrollHeight; }
  async function runOracle() {
    const code = $("code").value; if (current.id !== "custom") { save.code[current.id] = code; persist(); }
    $("console").textContent = ""; $("chat").innerHTML = "";
    const res = await PY.run(code, null);
    if (res.output) log(res.output.trimEnd(), "out");
    if (res.error) { log(res.error.raw, "err"); if (res.error.tip) log("Tip: " + res.error.tip, "tip"); sfx("error"); return; }
    oracleModule = res.module; let pass = 0;
    current.tests.forEach((t, i) => {
      chatLine($("chat"), "🔮 Oracle: " + t.q, "oracle");
      const r = PY.call(oracleModule, "reply", [t.q]); const el = $("test-" + i);
      if (r.error) { chatLine($("chat"), "💥 " + r.error, "err"); el.textContent = "✗ \"" + t.q + "\" → crashed"; el.className = "fail"; return; }
      const ok = typeof r.value === "string" && t.ok(r.value);
      chatLine($("chat"), "🤖 " + String(r.value), ok ? "bot" : "bot dim");
      el.textContent = (ok ? "✓" : "✗") + " \"" + t.q + "\" → " + t.desc; el.className = ok ? "pass" : "fail"; if (ok) pass++;
    });
    if (pass === current.tests.length) { chatLine($("chat"), "🔮 Oracle: A mind, however small. The gate opens. Keep talking to it below.", "oracle"); log("✅ All answered.", "ok"); complete({}); }
    else { log(`${pass}/${current.tests.length} answered. Add more rules and run again.`, "warn"); sfx("error"); }
  }

  // ---------- OLLAMA mode: a real local model ----------
  function setupOllama() {
    $("mode-ollama").hidden = false; $("mode-code").hidden = false;
    $("code").value = save.code[current.id] || current.starter; updateLineCount(); $("lineCount").textContent = "system prompt";
    $("runBtn").textContent = "▶ Apply personality"; $("runBtn").onclick = () => { ol.history = []; $("olChat").innerHTML = ""; chatLine($("olChat"), "Personality applied. Say hello.", "oracle"); if (current.id !== "custom") { save.code[current.id] = $("code").value; persist(); } };
    $("resetBtn").onclick = () => { ol.history = []; $("olChat").innerHTML = ""; };
    $("starterBtn").onclick = () => { $("code").value = current.starter; };
    $("olSetup").innerHTML = `<b>Setup (one time, on this computer):</b> 1) Install Ollama from <code>ollama.com</code>. 2) In a terminal: <code>ollama pull llama3.2:1b</code> (small, fast). 3) Let the browser talk to it: Windows <code>setx OLLAMA_ORIGINS "*"</code> then quit and restart Ollama from the tray; Mac/Linux <code>OLLAMA_ORIGINS=* ollama serve</code>. 4) Click Connect. ${location.protocol === "https:" && !location.hostname.includes("localhost") ? "<br><b>Note:</b> this page is https and Ollama is http; Chrome allows localhost, but if Connect fails, open the game from <code>http://localhost</code> instead." : ""}`;
    $("olChat").innerHTML = ""; $("olStatus").textContent = ""; ol = { model: save.settings.model, history: [], ok: false };
    $("olConnect").onclick = async () => {
      $("olStatus").textContent = "connecting…"; save.settings.ollama = $("olEndpoint").value.trim(); persist();
      try {
        const models = await Quests.ollamaTags(save.settings.ollama);
        const sel = $("olModel"); sel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join("") || "<option value=''>no models: ollama pull llama3.2:1b</option>";
        if (models.includes(save.settings.model)) sel.value = save.settings.model; ol.model = sel.value; ol.ok = !!ol.model;
        $("olStatus").textContent = models.length ? "connected · " + models.length + " model(s)" : "connected, but no models yet";
        sfx("doors");
      } catch (e) { $("olStatus").textContent = "not reachable: " + e.message + ". Is Ollama running? Did you set OLLAMA_ORIGINS?"; sfx("error"); }
    };
    $("olModel").onchange = () => { ol.model = $("olModel").value; save.settings.model = ol.model; persist(); ol.ok = !!ol.model; };
    $("olChatIn").onkeydown = async (e) => {
      if (e.key !== "Enter") return;
      const q = $("olChatIn").value.trim(); $("olChatIn").value = ""; if (!q) return;
      chatLine($("olChat"), "You: " + q, "you");
      if (!ol.ok) { chatLine($("olChat"), "Connect to Ollama first (button above).", "err"); return; }
      ol.history.push({ role: "user", content: q });
      const d = document.createElement("div"); d.className = "line bot dim"; d.textContent = "🤖 …"; $("olChat").appendChild(d);
      try {
        const reply = await Quests.ollamaChat(save.settings.ollama, ol.model, [{ role: "system", content: $("code").value }, ...ol.history.slice(-12)]);
        d.className = "line bot"; d.textContent = "🤖 " + reply.trim(); ol.history.push({ role: "assistant", content: reply }); sfx("say");
        if (!save.completed[current.id]) { log("A real model answered from your own computer.", "ok"); complete({}); }
      } catch (err) { d.className = "line err"; d.textContent = "💥 " + err.message; sfx("error"); }
      $("olChat").scrollTop = $("olChat").scrollHeight;
    };
  }

  // ---------- completion, stars, achievements ----------
  function starsFor(level, lines) {
    if (level.mode !== "robot" && level.mode !== "author") return (save.hintsUsed[level.id] || 0) === 0 ? 3 : 2;
    if (!level.par) return 3;
    return lines <= level.par ? 3 : lines <= level.par + 3 ? 2 : 1;
  }
  function checkAchievements() {
    const got = [];
    for (const a of ACH) if (!save.ach[a.id] && a.test(save)) { save.ach[a.id] = Date.now(); got.push(a); }
    if (got.length) { persist(); got.forEach((a, i) => setTimeout(() => { toast(`<b>${a.icon} ${a.name}</b>${a.desc}`); sfx("star"); }, 600 + i * 900)); }
  }
  let complete = function ({ lines, gems, events }) {
    if (current.id === "custom" || current.sandbox) { sfx("win"); showModal(`<h2>Solved your custom level</h2><p>Nice. Export it from the editor and open a pull request so it lands in the real game.</p><div class="row"><button id="closeBtn">Close</button><button id="toEditor">Back to editor</button></div>`); $("closeBtn").onclick = hideModal; $("toEditor").onclick = () => { hideModal(); openEditor(current); }; return; }
    const prev = save.completed[current.id]; const first = !prev;
    const stars = starsFor(current, lines || 0);
    let gained = 0;
    if (first) gained += current.xp + (gems || 0) * 5 + (stars === 3 ? 10 : 0);
    else if (stars > prev.stars) gained += (stars - prev.stars) * 10;
    save.xp += gained;
    save.completed[current.id] = { stars: Math.max(stars, prev ? prev.stars : 0), lines: prev && prev.lines && lines ? Math.min(prev.lines, lines) : (lines || (prev && prev.lines) || 0) };
    if (gems) save.gems[current.id] = Math.max(gems, save.gems[current.id] || 0);
    persist(); $("xp").textContent = save.xp + " XP"; $("rank").textContent = rank(); renderLevels(); if (current.mode !== "oracle") renderMission();
    const z = ZONES[current.zone - 1]; const zoneNowDone = zoneDone(current.zone) && first;
    const next = LEVELS[LEVELS.indexOf(current) + 1];
    let html = `<h2>${first ? "+" + gained + " XP" : gained ? "+" + gained + " XP (better score)" : "Done again"} · ${current.title}</h2>
      <div class="starsbig">${[1, 2, 3].map(i => `<span class="${i <= stars ? "" : "off"}">★</span>`).join("")}</div>
      <p class="muted" style="text-align:center">${stars === 3 ? "Perfect." : current.par ? `Three stars at ${current.par} lines or fewer${lines ? " (you used " + lines + ")" : ""}.` : "Three stars for solving without hints."}</p>`;
    if (zoneNowDone) {
      html += `<div class="unlock"><div class="big">${z.emoji}</div><h3>Reason unlocked</h3><p class="reasonline">“${z.reason}”</p>
        <p class="questbox"><b>Real-world quest:</b> ${QUESTS[z.n]}</p>
        ${next ? `<p>Zone ${next.zone}: <b>${ZONES[next.zone - 1].name}</b> is open on the map.</p>` : "<p>You finished every zone. Make your own in the Level Editor and open a pull request.</p>"}</div>`;
      R.confetti(); sfx("unlock");
    } else sfx("win");
    html += RPG.onComplete(current, { first, lines, events });
    html += `<div class="row">${next && levelUnlocked(next) ? `<button id="nextBtn" class="primary">Next: ${next.id} ${next.title} →</button>` : ""}<button id="hubBtn2">⚓ Harbor</button><button id="mapBtn2">World map</button><button id="closeBtn">Stay here</button></div>`;
    R.celebrate();
    showModal(html);
    if (next && levelUnlocked(next)) $("nextBtn").onclick = () => { hideModal(); openLevel(next); };
    $("mapBtn2").onclick = () => { hideModal(); showScreen("map"); }; $("hubBtn2").onclick = () => { hideModal(); openHub(); };
    $("closeBtn").onclick = hideModal;
    checkAchievements();
  };
  function showModal(html) { $("modalBody").innerHTML = html; $("modal").hidden = false; }
  function hideModal() { $("modal").hidden = true; }

  function showCodex() {
    const rows = ZONES.map(z => `<li class="${zoneDone(z.n) ? "got" : zoneUnlocked(z.n) ? "open" : "locked"}">${zoneDone(z.n) ? z.emoji : zoneUnlocked(z.n) ? "○" : "🔒"} <b>${z.name}</b> · ${zoneDone(z.n) || zoneUnlocked(z.n) ? z.reason : "Finish the zone before to reveal."}</li>`).join("");
    const ach = ACH.map(a => `<div class="ach ${save.ach[a.id] ? "" : "locked"}"><span class="ai">${a.icon}</span><span><b>${a.name}</b>${a.desc}</span></div>`).join("");
    showModal(`<h2>Codex of Reasons</h2><p class="muted">Eight reasons people write code. Each zone teaches one.</p><ul class="codex">${rows}</ul>
      <h2 style="margin-top:14px">Achievements · ${Object.keys(save.ach).length}/${ACH.length}</h2><div class="achgrid">${ach}</div>
      <div class="row"><button id="closeBtn">Close</button></div>`);
    $("closeBtn").onclick = hideModal;
  }
  function showSettings() {
    const s = save.settings;
    showModal(`<h2>Settings</h2><div class="settings">
      <div class="row2"><label>Player name<input id="sName" type="text" value="${s.name.replace(/"/g, "&quot;")}" placeholder="Sonny"></label>
      <label>Theme<select id="sTheme"><option value="system" ${s.theme === "system" ? "selected" : ""}>system</option><option value="light" ${s.theme === "light" ? "selected" : ""}>light</option><option value="dark" ${s.theme === "dark" ? "selected" : ""}>dark</option></select></label></div>
      <div class="row2"><label>Sound<select id="sSound"><option value="1" ${s.sound ? "selected" : ""}>on</option><option value="0" ${!s.sound ? "selected" : ""}>off</option></select></label>
      <label>Graphics<select id="sGfx"><option value="auto" ${!s.gfx || s.gfx === "auto" ? "selected" : ""}>auto (3D on PC, fast 3D on phone)</option><option value="realistic" ${s.gfx === "realistic" ? "selected" : ""}>realistic 3D (shadows, bloom)</option><option value="fast" ${s.gfx === "fast" ? "selected" : ""}>fast 3D</option><option value="classic" ${s.gfx === "classic" ? "selected" : ""}>classic 2D</option></select></label></div>
      <div class="row2"><label>Screen<select id="sDev"><option value="auto">auto-detect</option><option value="phone" ${localStorage.getItem("bh-device") === "phone" ? "selected" : ""}>phone</option><option value="desktop" ${localStorage.getItem("bh-device") === "desktop" ? "selected" : ""}>desktop</option></select></label>
      <label>Default speed<select id="sSpeed"><option value="slow" ${s.speed === "slow" ? "selected" : ""}>slow</option><option value="normal" ${s.speed === "normal" ? "selected" : ""}>normal</option><option value="fast" ${s.speed === "fast" ? "selected" : ""}>fast</option></select></label></div>
      <h3 style="margin:6px 0 0;font:500 13px var(--display);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Real-world quests</h3>
      <div class="row2"><label>Family repo (owner/name)<input id="sRepo" type="text" value="${s.repo}"></label><label>Your GitHub login or git user.name<input id="sGh" type="text" value="${s.ghName.replace(/"/g, "&quot;")}" placeholder="Jmorris0815"></label></div>
      <label>Ollama endpoint<input id="sOl" type="text" value="${s.ollama}"></label>
      <h3 style="margin:6px 0 0;font:500 13px var(--display);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Progress</h3>
      <label>Export / import (copy this to move progress to another computer)<textarea id="sData" rows="3">${JSON.stringify(save)}</textarea></label>
      <div class="row"><button id="sImport" class="small">Import from box</button><button id="sReset" class="danger small">Reset all progress</button><span class="sp"></span><button id="sSave" class="primary">Save</button></div></div>`);
    $("sSave").onclick = () => { const dev = $("sDev").value, cur = localStorage.getItem("bh-device") || "auto"; if (dev !== cur) { BHDevice.set(dev === "auto" ? "" : dev); persist(); location.reload(); return; } Object.assign(save.settings, { name: $("sName").value.trim(), theme: $("sTheme").value, sound: $("sSound").value === "1", speed: $("sSpeed").value, repo: $("sRepo").value.trim(), ghName: $("sGh").value.trim(), ollama: $("sOl").value.trim(), gfx: $("sGfx").value }); persist(); applySettings(); hideModal(); R.reload(); if (!$("screen-map").hidden) { renderMapInfo(null); renderQuests(); } };
    $("sImport").onclick = () => { try { const d = JSON.parse($("sData").value); if (d && d.completed) { save = { ...DEFAULTS(), ...d }; persist(); location.reload(); } } catch (e) { $("sData").value = "That wasn't valid progress data."; } };
    $("sReset").onclick = () => { if ($("sReset").textContent !== "Really reset?") { $("sReset").textContent = "Really reset?"; return; } localStorage.removeItem(slotKey(slot)); localStorage.removeItem(OLD_KEY); location.hash = ""; location.reload(); };
  }
  function showIntro(after) {
    showModal(`<h2>Branchlands</h2><p>You wash up on an island with a robot named Bolt. Bolt's battery is dead and the island is broken: the lighthouse is dark, the orchard is overgrown, the bridge is missing planks, and the Time Tower, which runs on something called Git, has fractured into timelines.</p>
      <p>Bolt will do anything you type. Exactly what you type. Nothing else. That turns out to be the whole trick.</p>
      <p>Each zone you fix teaches one <b>reason</b> people write code, and hands you a quest to do the same thing for real on your own computer.</p>
      <label style="display:block;margin:10px 0;font-size:13px;color:var(--muted)">What should Bolt call you?<input id="introName" type="text" style="width:100%;font:inherit;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)" placeholder="your name"></label>
      <div class="row"><button id="introGo" class="primary">Wake up Bolt →</button></div>`);
    $("introGo").onclick = () => { save.settings.name = $("introName").value.trim(); save.intro = true; persist(); hideModal(); sfx("doors"); (after || openHub)(); };
  }

  // ---------- editor ----------
  function openEditor(fromLevel) {
    showScreen("editor"); Editor.init(playCustom);
    if (fromLevel) Editor.loadLevel({ ...fromLevel, grid: (fromLevel === current && grid) ? grid : resolveGrid(fromLevel) });
  }
  function playCustom(lv) { lv.id = "custom"; lv.mode = "robot"; openLevel(lv); location.hash = "lvl=" + Editor.encode(lv); }

  // ---------- editor keys ----------
  // ---------- phone symbol bar: the keys a phone keyboard hides, plus the robot's vocabulary ----------
  const SYMS = {
    py: [["⇥", "    "], ["(", "("], [")", ")"], [":", ":"], ['"', '"'], ["=", " = "], [",", ", "], [".", "."], ["robot.", "robot."], ["move()", "move()", 1], ["turn_left()", "turn_left()"], ["turn_right()", "turn_right()"], ["pick()", "pick()"], ['sees("")', 'sees("")', 2], ["for", "for i in range(3):\n    "], ["while", 'while not robot.sees("wall"):\n    '], ["if", 'if robot.sees(""):\n    ', 8], ["def", "def name():\n    "]],
    js: [["{", "{"], ["}", "}"], ["(", "("], [")", ")"], [";", ";"], ['"', '"'], ["=", " = "], [".", "."], ["robot.", "robot."], ["move()", "move()", 1], ["turn_left()", "turn_left()"], ["pick()", "pick()"], ['sees("")', 'sees("")', 2], ["for", "for (let i = 0; i < 3; i++) {\n    "], ["if", 'if (robot.sees("")) {\n    ', 10], ["function", "function name() {\n    "]],
  };
  function buildSymbar(lang) {
    const bar = $("symbar"); if (!bar) return; bar.innerHTML = "";
    for (const [label, text, back] of SYMS[lang === "js" ? "js" : "py"]) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (text.length > 3) b.className = "kw";
      b.onmousedown = e => e.preventDefault();
      b.onclick = () => { const ta = $("code"); const s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + text + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + text.length - (back || 0); ta.focus(); if (current && current.mode !== "ollama") updateLineCount(); };
      bar.appendChild(b);
    }
  }
  function editorTabs(ta) {
    ta.addEventListener("keydown", e => {
      if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; }
      else if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
        const s = ta.selectionStart; const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1; const line = ta.value.slice(lineStart, s);
        const ind = (line.match(/^\s*/) || [""])[0] + (/[:{]\s*$/.test(line) ? "    " : "");
        e.preventDefault(); ta.value = ta.value.slice(0, s) + "\n" + ind + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 1 + ind.length;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $("runBtn").click(); }
    });
    ta.addEventListener("input", () => { if (current && current.mode !== "ollama") updateLineCount(); });
  }

  // ---------- boot ----------
  function route() {
    const h = location.hash.replace("#", "");
    if (h.startsWith("lvl=")) { try { const lv = Editor.decode(h.slice(4)); lv.id = "custom"; lv.mode = "robot"; openLevel(lv); return; } catch (e) { } }
    if (h === "editor") { openEditor(); return; }
    if (h === "sandbox") { openLevel(SANDBOX_LEVEL); return; }
    if (h === "map") { showScreen("map"); return; }
    if (h === "hub") { openHub(); return; }
    if (h === "town") { showScreen("town"); return; }
    const l = LEVEL_BY_ID[h]; if (l && levelUnlocked(l)) { openLevel(l); return; }
    showScreen("home");
  }
  function init() {
    LEVELS.forEach(l => { if (l.mode === "ollama") l.optional = true; });
    loadSave(); applySettings(); RPG.init(save, rpgApi); RPG.bind(); Hub.init(hubApi); Family.init(save, famApi); if (Family.connected()) Family.sync();
    $("famBadge").onclick = () => hubApi.openTown("family");
    R.init($("world"), $("fx")); editorTabs($("code"));
    $("world").addEventListener("click", e => { if (Hub.active) { const t = Render.pickTile(e); if (t) Hub.walkTo(t.x, t.y); } });
    document.addEventListener("tileclick", e => { if (Hub.active && e.detail) Hub.walkTo(e.detail.x, e.detail.y); });
    $("dpad").querySelectorAll("button").forEach(b => b.onclick = () => { const d = b.dataset.d; if (d === "e") Hub.pressE(); else { const [dx, dy] = d.split(",").map(Number); Hub.step(dx, dy); } });
    WorldMap.init($("map"), zoneStatus, (z) => { const st = zoneStatus(z.n); if (st.unlocked) { sfx("click"); openLevel(zoneLevels(z.n).find(l => !save.completed[l.id]) || zoneLevels(z.n)[0]); } else renderMapInfo(z); }, (z) => renderMapInfo(z));
    $("homeBtn").onclick = () => showScreen("home"); $("mapBtn").onclick = () => showScreen("map"); $("hubBtn").onclick = openHub; $("townBack").onclick = openHub;
    $("backBtn").onclick = openHub; $("edBack").onclick = () => showScreen("map");
    $("codexBtn").onclick = showCodex; $("settingsBtn").onclick = showSettings;
    $("soundBtn").onclick = () => { save.settings.sound = !save.settings.sound; persist(); applySettings(); sfx("click"); };
    $("remixBtn").onclick = () => openEditor(current);
    $("speed").onchange = () => { save.settings.speed = $("speed").value; persist(); };
    $("modal").addEventListener("click", e => { if (e.target === $("modal")) hideModal(); });
    window.addEventListener("hashchange", () => { const h = location.hash.replace("#", ""); if (h === "" && !$("screen-home").hidden) return; if (h === "") showScreen("home"); });
    route();
    if (typeof Sk === "undefined") toast("<b>Python engine didn't load</b>Check your internet connection and refresh.");
  }
  return { init, openLevel, openEditor, showScreen, get save() { return save; } };
})();
document.addEventListener("DOMContentLoaded", Game.init);
