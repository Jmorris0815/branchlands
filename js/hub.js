// Harbor Town hub: the place you start every session. Walk Bolt with the arrow keys / WASD or click a tile,
// talk to NPCs (scripted conversations with clues and quests; free chat when Ollama is running),
// shop at the stalls, read the quest board, and step through a zone portal when it is open.
// The hub is drawn by the same renderer as the levels: it is just a grid plus a list of props.

const Hub = (() => {
  const $ = (id) => document.getElementById(id);
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let api; // { R, showModal, hideModal, openLevel, showScreen, openTown, zoneUnlocked, completed, save, sfx, toast, ollama }
  const GRID = [
    "##################",
    "#......#......#..#",
    "#......#......#..#",
    "#......#......#..#",
    "#.####.#.####.#..#",
    "#................#",
    "#................#",
    "#....~~~~~~~~....#",
    "#...~~~~~~~~~~...#",
    "#................#",
    "##################",
  ];
  const PROPS = [
    { kind: "portal", zone: 1, x: 3, y: 2 }, { kind: "portal", zone: 2, x: 10, y: 2 }, { kind: "portal", zone: 3, x: 16, y: 2 }, { kind: "portal", zone: 4, x: 16, y: 6 },
    { kind: "portal", zone: 5, x: 16, y: 9 }, { kind: "portal", zone: 6, x: 9, y: 9 }, { kind: "portal", zone: 7, x: 1, y: 9 }, { kind: "portal", zone: 8, x: 1, y: 6 },
    { kind: "npc", id: "marisol", x: 8, y: 6, label: "⚓ Marisol", color: "#c8553d" }, { kind: "npc", id: "pip", x: 12, y: 2, label: "🧑‍🌾 Old Pip", color: "#6a8c3a" },
    { kind: "npc", id: "odo", x: 4, y: 7, label: "🛶 Odo", color: "#4a6b86" }, { kind: "npc", id: "wrenna", x: 13, y: 6, label: "🔧 Wrenna", color: "#b07a2a" },
    { kind: "npc", id: "clock", x: 13, y: 9, label: "🕰️ Clockwright", color: "#6c5a8e" }, { kind: "npc", id: "dad", x: 6, y: 9, label: "🧔 Dad", color: "#3f7a6a" },
    { kind: "npc", id: "oracle", x: 3, y: 9, label: "🔮 Oracle", color: "#5fb8b0" }, { kind: "npc", id: "nyx", x: 3, y: 5, label: "🏴‍☠️ Nyx", color: "#2f3e5c" },
    { kind: "stall", tab: "market", x: 6, y: 5, label: "🏪 Market" }, { kind: "stall", tab: "workshop", x: 11, y: 5, label: "🔧 Workshop" },
    { kind: "stall", tab: "paint", x: 14, y: 7, label: "🎨 Style" }, { kind: "stall", tab: "pack", x: 1, y: 1, label: "🎒 Storehouse" },
    { kind: "stall", tab: "board", x: 10, y: 6, label: "📜 Quest board" }, { kind: "stall", tab: "skills", x: 6, y: 1, label: "📈 Skills" },
    { kind: "sign", x: 8, y: 1, label: "🗺️ World map" },
    { kind: "stall", tab: "family", x: 15, y: 1, label: "👨‍👩‍👦 Family" },
  ];
  let pos = { x: 9, y: 5 }, dir = 0, busy = false, active = false;

  function props() { return PROPS.map(p => p.kind === "portal" ? { ...p, locked: !api.zoneUnlocked(p.zone), label: ZONES[p.zone - 1].emoji + " " + ZONES[p.zone - 1].name, color: ZONES[p.zone - 1].color } : p); }
  function snapshot() { return { grid: GRID.map(r => r.split("")), robot: { ...pos, dir }, items: {}, switches: {}, doors: {}, gates: {}, pads: {}, crabs: [], goal: null, w: GRID[0].length, h: GRID.length, props: props(), hub: true }; }
  const propAt = (x, y) => PROPS.find(p => p.x === x && p.y === y);
  const walkable = (x, y) => !!GRID[y] && GRID[y][x] === "." && !propAt(x, y);
  const nearby = () => PROPS.filter(p => Math.abs(p.x - pos.x) + Math.abs(p.y - pos.y) === 1);

  function init(a) { api = a; window.addEventListener("keydown", onKey); }
  function open() { active = true; busy = false; const s = api.save(); if (s.hub) { pos = { x: s.hub.x, y: s.hub.y }; dir = s.hub.dir || 0; } api.R.load(snapshot(), "sand"); renderPanel(); }
  function close() { active = false; }
  function remember() { const s = api.save(); s.hub = { x: pos.x, y: pos.y, dir }; api.persistSave(); }

  async function step(dx, dy) {
    if (busy) return;
    const nd = DIRS.findIndex(d => d[0] === dx && d[1] === dy), to = { x: pos.x + dx, y: pos.y + dy }, ev = [];
    if (nd !== dir) { dir = nd; ev.push({ type: "turn", dir }); }
    const p = propAt(to.x, to.y);
    busy = true;
    if (p) { await api.R.play(ev, "fast"); busy = false; interact(p); return; }
    if (!walkable(to.x, to.y)) { await api.R.play(ev.concat([{ type: "bump", x: pos.x, y: pos.y, dir, what: GRID[to.y] && GRID[to.y][to.x] === "~" ? "water" : "wall" }]), "fast"); busy = false; return; }
    ev.push({ type: "move", from: { ...pos }, to }); pos = to;
    await api.R.play(ev, "fast"); busy = false; remember(); renderPanel();
  }
  async function walkTo(tx, ty) {
    if (busy || !active) return;
    const target = propAt(tx, ty);
    if (!target && !walkable(tx, ty)) return;
    const key = (x, y) => x + "," + y, goal = (x, y) => target ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : (x === tx && y === ty);
    const prev = { [key(pos.x, pos.y)]: null }, q = [[pos.x, pos.y]]; let found = null;
    while (q.length) { const [x, y] = q.shift(); if (goal(x, y)) { found = [x, y]; break; } for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (walkable(nx, ny) && !(key(nx, ny) in prev)) { prev[key(nx, ny)] = [x, y]; q.push([nx, ny]); } } }
    if (!found) return;
    const path = []; let c = found; while (c && key(c[0], c[1]) !== key(pos.x, pos.y)) { path.unshift(c); c = prev[key(c[0], c[1])]; }
    busy = true;
    for (const [x, y] of path) {
      if (!active) break;
      const nd = DIRS.findIndex(d => d[0] === x - pos.x && d[1] === y - pos.y), ev = [];
      if (nd !== dir) { dir = nd; ev.push({ type: "turn", dir }); }
      ev.push({ type: "move", from: { ...pos }, to: { x, y } }); pos = { x, y };
      await api.R.play(ev, "fast");
    }
    if (target) { const nd = DIRS.findIndex(d => d[0] === tx - pos.x && d[1] === ty - pos.y); if (nd >= 0 && nd !== dir) { dir = nd; await api.R.play([{ type: "turn", dir }], "fast"); } }
    busy = false; remember(); renderPanel();
    if (target) interact(target);
  }
  function onKey(e) {
    if (!active || !$("modal").hidden) return;
    const t = e.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    const k = e.key.toLowerCase();
    const m = { arrowright: [1, 0], d: [1, 0], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowup: [0, -1], w: [0, -1] }[k];
    if (m) { e.preventDefault(); step(m[0], m[1]); return; }
    if (k === "e" || k === "enter" || k === " ") { const f = propAt(pos.x + DIRS[dir][0], pos.y + DIRS[dir][1]) || nearby()[0]; if (f) { e.preventDefault(); interact(f); } }
  }
  function interact(p) {
    api.sfx("click");
    if (p.kind === "npc") talk(p.id);
    else if (p.kind === "stall") api.openTown(p.tab);
    else if (p.kind === "sign") api.showScreen("map");
    else if (p.kind === "portal") portal(p);
  }
  function portal(p) {
    const z = ZONES[p.zone - 1];
    if (!api.zoneUnlocked(p.zone)) {
      api.showModal(`<h2>${z.emoji} ${z.name} · sealed</h2><p>The portal hums but won't open. <b>Finish ${ZONES[p.zone - 2].name}</b> and it will. ${ZONES[p.zone - 2].emoji}</p><p class="muted">${z.blurb}</p><div class="row"><button id="closeBtn">Back</button></div>`);
      $("closeBtn").onclick = api.hideModal; return;
    }
    const zl = LEVELS.filter(l => l.zone === p.zone), done = zl.filter(l => api.completed()[l.id]).length, next = zl.find(l => !api.completed()[l.id]) || zl[0];
    api.showModal(`<h2>${z.emoji} ${z.name}</h2><p class="reason">“${z.reason}”</p><p>${z.blurb}</p><p class="muted">${done} of ${zl.length} missions done.</p>
      <div class="row"><button id="goBtn" class="primary">Enter → ${next.id} ${next.title}</button>${zl.map(l => api.completed()[l.id] ? `<button class="small" data-l="${l.id}">${l.id} ✓</button>` : "").join("")}<button id="closeBtn">Not now</button></div>`);
    $("goBtn").onclick = () => { api.hideModal(); api.openLevel(next); };
    $("modalBody").querySelectorAll("button[data-l]").forEach(b => b.onclick = () => { api.hideModal(); api.openLevel(LEVEL_BY_ID[b.dataset.l]); });
    $("closeBtn").onclick = api.hideModal;
  }

  function renderPanel() {
    const el = $("mission"); if (!el || !active) return;
    const near = nearby(); const s = api.save();
    el.innerHTML = `<div class="zonechip">⚓ Harbor Town</div><h2>${s.settings.name ? "Welcome back, " + s.settings.name + "." : "Harbor Town"}</h2>
      <p>Walk Bolt with the <b>arrow keys</b> or <b>WASD</b>, or <b>click a tile</b>. Walk up to someone and press <b>E</b> (or click them) to talk, shop, or step through a portal. Dark portals are sealed until you finish the zone before them.</p>
      <div id="nearby">${near.length ? near.map(p => `<button class="primary" data-near="${p.x},${p.y}">${p.kind === "portal" ? ZONES[p.zone - 1].emoji + " Enter " + ZONES[p.zone - 1].name : (p.kind === "npc" ? "🗣️ Talk to " : "Open ") + p.label}</button>`).join(" ") : `<span class="muted">Nobody within reach. The quest board and Marisol are by the harbor.</span>`}</div>
      <p class="muted" style="margin-top:10px">🪙 ${RPG.state.coins} · total level ${RPG.totalLevel()} · ${LEVELS.filter(l => api.completed()[l.id]).length}/${LEVELS.length} missions</p>`;
    el.querySelectorAll("button[data-near]").forEach(b => b.onclick = () => { const [x, y] = b.dataset.near.split(",").map(Number); const p = propAt(x, y); const nd = DIRS.findIndex(d => d[0] === x - pos.x && d[1] === y - pos.y); if (nd >= 0) dir = nd; api.R.play([{ type: "turn", dir }], "fast").then(() => interact(p)); });
  }

  // ---------- conversations ----------
  const ctx = () => {
    const c = api.completed(); const next = LEVELS.find(l => !c[l.id] && !l.optional && api.zoneUnlocked(l.zone)) || LEVELS[0];
    return { c, next, done: id => !!c[id], z: n => api.zoneUnlocked(n), name: api.save().settings.name || "friend", coins: RPG.state.coins, lvl: id => RPG.skillLevel(id) };
  };
  const DIALOG = {
    marisol: {
      greet: k => k.done("1-1") ? `Back again, ${k.name}. The harbor's open: sell what Bolt drags in, buy what you need, and come to me when you don't know what's next.` : `Castaway! You and that robot washed up on my beach. It only does exactly what you type, you know. Lighthouse Rock is through the portal behind you; start there.`,
      topics: [
        { q: "What should I do next?", a: k => `Next is <b>${k.next.id} ${k.next.title}</b> in ${ZONES[k.next.zone - 1].name}. ${k.next.story} <i>Clue: ${k.next.hints[0]}</i>`, go: k => k.next.id },
        { q: "How do I make money here?", a: () => `Everything Bolt picks up lands in your backpack: apples, gems, lenses. Finishing a mission drops goods too. Sell them at the 🏪 Market. Prices change every day and fall when you flood the market with one thing, so spread it out. Crafting at the 🔧 Workshop turns cheap goods into dear ones: three apples are twelve coins, one cider is twenty-two.` },
        { q: "What is this place?", a: () => `Branchlands. Eight islands, each broken a different way, each fixed with a different reason to write code. The lighthouse is dark, the orchard's overgrown, the bridge is missing planks, the Time Tower fractured into timelines, and the Oracle hasn't said a word in years. The portals around town open one at a time.` },
        { q: "Who's who in town?", a: () => `Pip keeps the orchard and knows loops. Odo ferries across the fog and knows how to decide without looking. Wrenna builds tools and upgrades. The Clockwright runs the Time Tower and speaks fluent Git. Dad reviews code. The Oracle is… the Oracle. Nyx sails the Mirror Sea and swears JavaScript is just Python with braces.` },
      ],
    },
    pip: {
      greet: k => k.z(2) ? `Twelve rows of trees and one old man. Your robot could pick this whole orchard in a line or two, if it knew how to repeat itself.` : `Orchard's sealed till the lighthouse is lit. Come back when you've got Lighthouse Rock done.`,
      topics: [
        { q: "How do loops work?", a: () => `Say it once, do it many times. <code>for i in range(5):</code> then indent what repeats. If you don't know how many times, <code>while not robot.sees("wall"):</code> keeps going until it's true. The line limits in my orchard are there to force it: four lines won't walk twelve trees without a loop.` },
        { q: "Any clue for the orchard rows?", a: k => `Mission 2-3's map changes every run, so you can't count. Don't count. <code>while not robot.sees("wall"): robot.move()</code> walks any length of row. ${k.done("2-3") ? "You already know; you did it." : ""}` },
        { q: "Nested loops?", a: () => `A loop inside a loop. Outer loop: each row. Inner loop: each tree in the row. Turn at the end of the row and you've got a lawnmower. That's 2-5.` },
      ],
    },
    odo: {
      greet: k => k.z(3) ? `Fog's thick today. Always is. The bridge is never the same twice, so your code can't be either: it has to look before it steps.` : `I ferry people who've finished the orchard. You haven't. Pip's waiting.`,
      topics: [
        { q: "How do I decide without seeing the map?", a: () => `<code>if robot.sees("water"): robot.jump()</code> <code>else: robot.move()</code>. The robot looks one tile ahead and picks. Put that inside a loop and it crosses any bridge. <code>robot.sees()</code> knows: wall, water, apple, gem, key, item, goal, switch, door, gate, teleporter, crab, floor.` },
        { q: "The crabs!", a: () => `A crab walking into Bolt is a pinch and a failed run. <code>if robot.sees("crab"): robot.wait()</code>. Crabs patrol back and forth; wait one beat and it's gone. Wrenna sells a Crab Shell that survives one pinch per run if you'd rather buy your way out.` },
        { q: "Teleporters?", a: () => `Step on a numbered pad and you come out on its twin. Same number, other end. Handy when the straight path is water.` },
      ],
    },
    wrenna: {
      greet: k => k.z(4) ? `Tools. You make one once and use it forever. That's a function, and that's also my whole shop: come buy upgrades for Bolt, or craft something worth selling.` : `Workshop opens after the fog bridge. Odo decides who crosses, not me.`,
      topics: [
        { q: "What's a function?", a: () => `<code>def step():</code> and indent the moves. Now <code>step()</code> does all of them. Give it a parameter, <code>def walk(n):</code>, and it does n of them. Some of my missions refuse to run without a <code>def</code>: that's the point.` },
        { q: "What do the upgrades do?", a: () => RPG.GEAR.map(g => `${g.icon} <b>${g.name}</b>: ${g.desc} (${RPG.state.gear[g.id] ? "you own it" : "🪙 " + g.cost})`).join("<br>"), tab: "workshop" },
        { q: "Crafting?", a: () => `Cider from apples. Crates from planks and scrap. A clockstone from fog stone and a time shard. A prism from two gems and a lens, and the prism is what makes the Wide Scanner. Each recipe needs a skill level; crafting trains the skill too.`, tab: "workshop" },
      ],
    },
    clock: {
      greet: k => k.z(5) ? `The Tower keeps every version of itself. Commit, and the moment is saved; checkout, and you're standing in it. Nothing you do in there is ever lost, which is the one thing most people never learn.` : `The Tower's doors answer to toolsmiths. Finish Wrenna's workshop.`,
      topics: [
        { q: "Git cheat sheet?", a: () => `<code>git status</code> what changed · <code>git add .</code> stage it · <code>git commit -m "why"</code> save a moment · <code>git log</code> the moments · <code>git checkout &lt;id&gt;</code> stand in one · <code>git branch name</code> + <code>git switch name</code> a parallel timeline · <code>git merge name</code> join them · <code>git pull</code> before <code>git push</code>.` },
        { q: "What's a merge conflict?", a: () => `Two timelines changed the same line. Git writes both into the file between <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> and refuses to guess. You open the file, keep what's right, delete the markers, <code>git add</code>, <code>git commit</code>. Mission 5-3 makes you do exactly that.` },
        { q: "Why do you want time shards?", a: () => `Every commit drops one. Small commits, often. A shard a commit is how I keep track of who understood that.` },
      ],
    },
    dad: {
      greet: k => k.z(6) ? `Hey. Before anything goes into the real game, somebody else reads it. That's a pull request. I'll read yours; you read mine. Neither of us merges our own.` : `Gate's closed till you've been through the Time Tower. Go see the Clockwright.`,
      topics: [
        { q: "How do I review code?", a: () => `Read it like it's going to run on your own machine, because it is. Find the line, say what's wrong, say why. "Line 4 moves 4 but the gap is 5" beats "doesn't work". And if nothing's wrong, approve it. One of my PRs in 6-x has no bug on purpose.` },
        { q: "How do I write a good PR?", a: () => `Title says what changed. Body says why, and what you tested. "Collect three apples with a loop. Replaced 9 move lines with a for loop. Ran from a fresh Reset world, reached the goal." I reject vague ones. So does every reviewer you'll ever meet.` },
        { q: "The real one?", a: () => `CONTRIBUTING.md in the family repo. Branch, commit, push, open a pull request, I review, you fix, I approve, you merge. The game checks GitHub for your merged PRs on the world map.` },
      ],
    },
    oracle: {
      greet: k => k.z(7) ? `…You wrote <code>reply(message)</code> and a thing answered. Write it better and it remembers. Plug in a model running on your own machine and it thinks. Ask.` : `…` ,
      topics: [
        { q: "How do I make a bot?", a: () => `A function that takes a message and returns a message. <code>if "hello" in message.lower(): return "hi"</code>. That is a rule bot. Give it a dictionary to remember names and it has memory. That's 7-1 and 7-2.` },
        { q: "The real Oracle (Ollama)?", a: () => `Install Ollama, pull a small model, let the browser talk to it (<code>setx OLLAMA_ORIGINS "*"</code> on Windows, then restart Ollama) and connect in 7-3. Then you write its personality: the system prompt. When it's connected, every NPC in this town can answer anything, not just these buttons.` },
        { q: "Is it alive?", a: () => `No. It predicts the next word very well. Which is sometimes enough to be useful and never enough to be trusted without checking. Remember that in all things.` },
      ],
    },
    nyx: {
      greet: k => k.z(8) ? `Same robot, same islands, different tongue. JavaScript. Braces instead of indents, <code>let</code> instead of nothing, <code>;</code> if you're polite. You already know how to think; you're just learning to spell.` : `Mirror Sea's for people who've met the Oracle. Have you?`,
      topics: [
        { q: "Python vs JavaScript?", a: () => `<code>for i in range(3):</code> → <code>for (let i = 0; i &lt; 3; i++) {</code> · <code>def f():</code> → <code>function f() {</code> · <code>if x:</code> → <code>if (x) {</code> · <code>and / or / not</code> → <code>&amp;&amp; / || / !</code> · <code>print()</code> → <code>console.log()</code> · <code>True</code> → <code>true</code>. Indents become braces. Everything else is the same idea.` },
        { q: "Why learn two?", a: () => `Because the ideas are the point, not the spelling. Loops, decisions, functions: once you see them in two languages you own them. Also the whole web runs on this one.` },
        { q: "Mirror glass?", a: () => `Drops from every Mirror Sea mission. Ten panes and five hundred coins earned and I'll call you a trader.` },
      ],
    },
  };

  let chat = [];
  function talk(id, text) {
    const p = PROPS.find(x => x.id === id), d = DIALOG[id], k = ctx();
    const npc = RPG.NPC ? RPG.NPC[id] : null; const name = npc ? npc.name : p.label;
    const quests = RPG.questsFor(id);
    const body = text || d.greet(k);
    let h = `<div class="talk"><div class="portrait" style="background:${p.color}">${p.label.split(" ")[0]}</div><div><h2>${name}</h2><p class="say">${body}</p></div></div><div class="topics">`;
    d.topics.forEach((t, i) => h += `<button class="small" data-t="${i}">${t.q}</button>`);
    if (quests.length) h += `<button class="small" data-work="1">📜 Any work for me? (${quests.length})</button>`;
    h += `</div><div class="free"><input id="freeIn" type="text" placeholder="${api.ollama().model ? "Ask " + name.split(",")[0] + " anything (Ollama)" : "Free chat needs Ollama running (see the Oracle)"}" ${api.ollama().model ? "" : "disabled"}></div>
      <div class="row"><button id="closeBtn">Bye</button></div>`;
    api.showModal(h);
    $("modalBody").querySelectorAll("button[data-t]").forEach(b => b.onclick = () => { const t = d.topics[b.dataset.t]; api.sfx("click"); const a = t.a(k); talk(id, a + (t.go ? ` <button class="small primary" id="goLvl">Go to ${t.go(k)}</button>` : "") + (t.tab ? ` <button class="small" id="goTab">Open the ${t.tab}</button>` : "")); if ($("goLvl")) $("goLvl").onclick = () => { api.hideModal(); api.openLevel(LEVEL_BY_ID[t.go(k)]); }; if ($("goTab")) $("goTab").onclick = () => { api.hideModal(); api.openTown(t.tab); }; });
    const w = $("modalBody").querySelector("button[data-work]"); if (w) w.onclick = () => work(id);
    $("closeBtn").onclick = () => { api.hideModal(); chat = []; };
    const fi = $("freeIn"); if (fi && !fi.disabled) fi.onkeydown = async (e) => { if (e.key !== "Enter" || !fi.value.trim()) return; const q = fi.value.trim(); fi.value = ""; fi.disabled = true; fi.placeholder = "…"; const r = await freeTalk(id, q, k); talk(id, `<span class="muted">You: ${q.replace(/</g, "&lt;")}</span><br>${r.replace(/</g, "&lt;")}`); };
  }
  function work(id) {
    const p = PROPS.find(x => x.id === id), quests = RPG.questsFor(id), name = RPG.NPC[id].name;
    let h = `<div class="talk"><div class="portrait" style="background:${p.color}">${p.label.split(" ")[0]}</div><div><h2>${name}</h2><p class="say">${quests.length ? "Here's what I need." : "Nothing right now."}</p></div></div>`;
    for (const q of quests) h += `<div class="qcard"><b>${q.title}</b><p class="story">“${q.story}”</p><ul class="steps">${q.steps.map(s => `<li class="${s.done ? "done" : ""}">${s.done ? "✅" : "○"} ${s.text}</li>`).join("")}</ul><div class="toolbar"><span class="muted">Reward: ${q.reward}</span><span class="sp"></span>${q.ready ? `<button class="primary" data-turn="${q.id}">Here you go</button>` : ""}</div></div>`;
    h += `<div class="row"><button id="backBtn">Back</button><button id="closeBtn">Bye</button></div>`;
    api.showModal(h);
    $("modalBody").querySelectorAll("button[data-turn]").forEach(b => b.onclick = () => { const r = RPG.turnInById(b.dataset.turn); if (r) { api.sfx("win"); api.toast(`<b>Quest complete</b>${r}`); } work(id); renderPanel(); });
    $("backBtn").onclick = () => talk(id); $("closeBtn").onclick = api.hideModal;
  }
  async function freeTalk(id, q, k) {
    const o = api.ollama(); const name = RPG.NPC[id].name;
    const persona = `You are ${name}, a character in Branchlands, a kids' game that teaches coding (Python, loops, if/else, functions, Git, pull requests, chatbots, JavaScript). Stay in character, be warm and brief (2-4 sentences), and give real, correct coding help when asked. The player is ${k.name}, has ${k.coins} coins, and should next play mission ${k.next.id} "${k.next.title}" (hint: ${k.next.hints[0]}). Never ask for personal information. Your scripted knowledge: ${DIALOG[id].topics.map(t => t.q + " -> " + t.a(k).replace(/<[^>]+>/g, "")).join(" | ")}`;
    chat.push({ role: "user", content: q });
    try { const r = await Quests.ollamaChat(o.endpoint, o.model, [{ role: "system", content: persona }, ...chat.slice(-8)]); chat.push({ role: "assistant", content: r }); return r; }
    catch (e) { return "(The free-talk line is down: " + (e.message || e) + ". Is Ollama running with OLLAMA_ORIGINS set?)"; }
  }

  function pressE() { const f = propAt(pos.x + DIRS[dir][0], pos.y + DIRS[dir][1]) || nearby()[0]; if (f) interact(f); }
  return { init, open, close, walkTo, step, pressE, get active() { return active; }, GRID, PROPS };
})();
window.Hub = Hub;
