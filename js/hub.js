// Harbor Town hub: the place you start every session. A free-roam 3D island: drive Bolt anywhere with
// WASD / arrows / the joystick (or click where to go), drive up to someone and press E (or tap Talk) to talk,
// shop, read the quest board, or step through a zone portal. Townsfolk have scripted conversations with clues
// and quests, and free chat when Ollama is running. The island itself is built by render3d.js from TOWN below.

const Hub = (() => {
  const $ = (id) => document.getElementById(id);
  let api; // { R, showModal, hideModal, openLevel, showScreen, openTown, zoneUnlocked, completed, save, sfx, toast, ollama }
  // wx, wz: where each one stands in the town (x runs east, z runs south, the fountain is 0,0; one unit is one
  // level tile). Move something by changing its numbers.
  const PROPS = [
    { kind: "portal", zone: 1, wx: 19.5, wz: -7.5 }, { kind: "portal", zone: 2, wx: -19, wz: -6.5 }, { kind: "portal", zone: 3, wx: -20.5, wz: 3 }, { kind: "portal", zone: 4, wx: 20, wz: 5 },
    { kind: "portal", zone: 5, wx: 12, wz: -17.5 }, { kind: "portal", zone: 6, wx: 14.5, wz: 12.5 }, { kind: "portal", zone: 7, wx: -10.5, wz: -17.5 }, { kind: "portal", zone: 8, wx: -15, wz: 12 },
    { kind: "npc", id: "marisol", wx: 3.2, wz: 13, label: "⚓ Marisol", color: "#c8553d" }, { kind: "npc", id: "pip", wx: -12.5, wz: -9.5, label: "🧑‍🌾 Old Pip", color: "#6a8c3a" },
    { kind: "npc", id: "odo", wx: -16, wz: 7, label: "🛶 Odo", color: "#4a6b86" }, { kind: "npc", id: "wrenna", inside: "workshop", wx: 1.5, wz: -1.6, label: "🔧 Wrenna", color: "#b07a2a" },
    { kind: "npc", id: "clock", inside: "tower", wx: -1.2, wz: -1.0, label: "🕰️ Clockwright", color: "#6c5a8e" }, { kind: "npc", id: "dad", wx: 6, wz: 9, label: "🧔 Dad", color: "#3f7a6a" },
    { kind: "npc", id: "oracle", wx: -6.5, wz: -13.5, label: "🔮 Oracle", color: "#5fb8b0" }, { kind: "npc", id: "nyx", wx: 16.5, wz: 10, label: "🏴‍☠️ Nyx", color: "#2f3e5c" },
    { kind: "stall", tab: "market", wx: -9.5, wz: 2.5, label: "🏪 Market" }, { kind: "stall", tab: "workshop", wx: 9.5, wz: 3.5, label: "🔧 Workshop" },
    { kind: "stall", tab: "paint", wx: 8, wz: -6.5, label: "🎨 Style" }, { kind: "stall", tab: "pack", wx: -8.5, wz: -6, label: "🎒 Storehouse" },
    { kind: "stall", tab: "board", wx: -4, wz: 10.5, label: "📜 Quest board" }, { kind: "stall", tab: "skills", wx: 5.5, wz: -11, label: "📈 Skills" },
    { kind: "sign", wx: 0, wz: -9.5, label: "🗺️ World map" },
    { kind: "stall", tab: "family", wx: -12.5, wz: -2, label: "👨‍👩‍👦 Family" },
    // doors into buildings (drive through them)
    { kind: "door", to: "workshop", wx: 13.95, wz: -0.9, label: "🔧 Wrenna's Workshop" },
    { kind: "door", to: "tower", wx: 10.7, wz: -12.55, label: "🕰️ The Time Tower" },
  ];
  // Rooms you can drive into. Each has a size (w × d), what stands in it (things), the people and things you can
  // use (props: npcs come from PROPS with inside: <room>), and where Bolt appears (start, by the way out).
  const INTERIORS = {
    workshop: { title: "Wrenna's Workshop", w: 12, d: 9, wall: 0xe2d2b4, start: { x: 0, z: 3.2 }, outside: { x: 12.6, z: -0.8, yaw: Math.PI },
      things: [{ kind: "rug", x: 0, z: 0.6 }, { kind: "bench", x: -3.2, z: -3.6, r: 1.1 }, { kind: "toolwall", x: -3.2, z: -4.38 }, { kind: "anvil", x: 3.6, z: -2.4, r: 0.6 }, { kind: "fireplace", x: 4.6, z: -4.1, r: 0.9 },
        { kind: "lift", x: 3.8, z: 1.6, r: 0.9, ry: -0.5 }, { kind: "barrel", x: -5.3, z: 3.6, r: 0.45 }, { kind: "barrel", x: -4.6, z: 3.9, r: 0.45 }, { kind: "shelf", x: -5.75, z: -0.5, ry: Math.PI / 2, r: 0.5 }, { kind: "shelf", x: 5.75, z: 0.2, ry: -Math.PI / 2, r: 0.5 },
        { kind: "lantern", x: -2, z: -1 }, { kind: "lantern", x: 2.5, z: 1.2 }],
      props: [{ kind: "spot", tab: "workshop", x: -3.2, z: -2.4, label: "🔧 Workbench: upgrades and crafting", color: "#f0b24a" }, { kind: "spot", tab: "paint", x: 2.6, z: 2.7, label: "🎨 Paint bay: style Bolt", color: "#c9a7ff" },
        { kind: "exit", x: 0, z: 4.3, ry: Math.PI, label: "🚪 Back to town" }] },
    tower: { title: "The Time Tower", w: 10, d: 10, wall: 0xc9ccd4, floor: "stone", start: { x: 0, z: 3.4 }, outside: { x: 10.1, z: -11.8, yaw: Math.PI * 0.75 },
      things: [{ kind: "rug", x: 0, z: 0.5 }, { kind: "pendulum", x: 0, z: -3.6 }, { kind: "desk", x: -3, z: -2.2, r: 0.9, ry: 0.4 }, { kind: "shelf", x: -4.75, z: 1, ry: Math.PI / 2, r: 0.5 }, { kind: "shelf", x: 4.75, z: 1, ry: -Math.PI / 2, r: 0.5 },
        { kind: "lantern", x: -1.8, z: 0 }, { kind: "lantern", x: 2, z: -1.5 }],
      gears: [{ x: 0, y: 2.1, z: -4.85, r: 1.1, teeth: 18, speed: 0.25 }, { x: 1.95, y: 2.75, z: -4.8, r: 0.62, teeth: 11, speed: -0.45, color: 0xc9a227 }, { x: -1.9, y: 1.4, z: -4.8, r: 0.7, teeth: 12, speed: -0.39 }, { x: 3.2, y: 1.5, z: -4.75, r: 0.4, teeth: 8, speed: 0.7, color: 0xc9a227 }],
      banners: [{ x: -4.85, z: -2.2, ry: Math.PI / 2, lines: ["a1b2c3", "d4e5f6", "main", "merge!"] }, { x: 4.85, z: -2.2, ry: -Math.PI / 2, lines: ["git add", "commit", "branch", "push"], bg: "#3d2c4a" }],
      props: [{ kind: "spot", map: true, x: 2.6, z: -1.6, label: "🗺️ Star chart: the world map", color: "#7fb3ff" }, { kind: "exit", x: 0, z: 4.3, ry: Math.PI, label: "🚪 Back to town" }] },
  };
  // The rest of the 3D island: scenery you cannot talk to. render3d.js shapes the land from this (a wobbly coast of
  // radius `radius`, a bay for the harbour, `hills`, flat `plaza` cobbles and flat pads under every building).
  const H = (x, z, s = 2.6) => ({ kind: "house", x, z, s }), T = (x, z, s = 2.2) => ({ kind: "tree", x, z, s, ry: (x * 7 + z * 3) % 6 }), RK = (x, z, s = 1.7) => ({ kind: "rock", x, z, s, ry: (x + z) % 6 });
  const TOWN = {
    size: 80, radius: 27, start: { x: 0, z: 4 }, plaza: { x: 0, z: 0, r: 8.5 }, bay: { x: 0, z: 27, r: 10 },
    hills: [{ x: -8, z: -16, r: 7, h: 1.8 }, { x: 14, z: -13, r: 6, h: 1.4 }, { x: 21, z: -2, r: 4, h: 1.2 }],
    flats: [{ x: 0, z: 0, r: 9.5, y: 1.0 }],
    decor: [
      { kind: "fountain", x: 0, z: 0 }, { kind: "dock", x: 0, z: 14.5, len: 9 },
      { kind: "boat", x: 3.6, z: 20, ry: 0.5 }, { kind: "boat", x: -3.4, z: 21.5, ry: -0.3 }, { kind: "boat", x: -24.5, z: 8.5, ry: 1.2 }, { kind: "ship", x: 21, z: 16, ry: 2.4 },
      { kind: "lighthouse", x: 22, z: -3 }, { kind: "tower", x: 11.5, z: -13.5 },
      H(-12, 5), H(12.5, -5.5), H(-9, -11.5), H(7, -14.5), H(-14.5, -3.5), H(9, 10.5), H(-7, 13.5), H(15.5, -1),
      { kind: "lamp", x: 9.8, z: 0 }, { kind: "lamp", x: 4.9, z: 8.5 }, { kind: "lamp", x: -4.9, z: 8.5 }, { kind: "lamp", x: -9.8, z: 0 }, { kind: "lamp", x: -4.9, z: -8.5 }, { kind: "lamp", x: 4.9, z: -8.5 },
      T(-5, -17), T(3, -16.5, 2.5), T(17, -11), T(18, 9, 2.5), T(-18, 10), T(-12, 9.5, 2.4), T(-20, -1), T(9, 14), T(-9.5, 15, 2.5), T(2, -13.5, 1.9), T(14, -3), T(-13, -6, 2),
      T(-18.5, -15.5, 2), T(-16.3, -15.5, 2), T(-14.1, -15.5, 2), T(-18.5, -13.3, 2), T(-16.3, -13.3, 2), T(-14.1, -13.3, 2), T(-18.5, -11.1, 2), T(-16.3, -11.1, 2), T(-14.1, -11.1, 2), // Pip's orchard
      RK(-21.6, -7.9), RK(-16.3, -16.3), RK(-7.9, -21.6), RK(2, -22.9), RK(11.5, -19.9), RK(18.8, -13.2), RK(24, -6), RK(22.2, 6), RK(17.6, 14.8), RK(-19.9, 11.5), RK(-22.9, 2),
      { kind: "crate", x: -10.5, z: -7.5 }, { kind: "crate", x: -10, z: -5, ry: 0.6 }, { kind: "crate", x: -2.4, z: 13.2, ry: 0.3 }, { kind: "crate", x: 2.6, z: 15.5 },
      { kind: "crystal", x: -8.5, z: -15.5, s: 1.5 }, { kind: "crystal", x: -4.5, z: -16, s: 1.5 }, { kind: "crystal", x: -3.5, z: -12.5, s: 1.3 },
    ],
    // places townsfolk and helper robots wander between (they find their own way)
    spots: [{ x: 4, z: 5 }, { x: -4, z: 5 }, { x: -6, z: -3 }, { x: 6, z: -2 }, { x: 0, z: 8.5 }, { x: 0, z: 15 }, { x: 0, z: 20 }, { x: -6, z: 10 }, { x: 7, z: 12 },
      { x: -12, z: 0 }, { x: 12, z: 0 }, { x: 3, z: -8 }, { x: -3, z: -8.5 }, { x: -11, z: -12 }, { x: 15, z: 7 }, { x: -17, z: 4 }, { x: 9, z: -9 }],
    strollers: [{ from: 0 }, { from: 5 }, { from: 9 }, { from: 13, tint: 0xcfd8ff }, { from: 14 }],
    bots: [{ from: 3, color: "#c8553d" }, { from: 7, color: "#3f9a6a", s: 0.7 }, { from: 11, color: "#e6b422", s: 0.75 }],
    get props() { return props().filter(p => !p.inside).map(p => ({ ...p, x: p.wx, z: p.wz })); },
  };
  let active = false, nearProp = null, saveT = null, room = null; const keys = new Set(); // room: the interior Bolt is in, or null in town

  function props() { return PROPS.map(p => p.kind === "portal" ? { ...p, locked: !api.zoneUnlocked(p.zone), label: ZONES[p.zone - 1].emoji + " " + ZONES[p.zone - 1].name, color: ZONES[p.zone - 1].color } : p); }

  function init(a) { api = a; window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", () => { keys.clear(); sendInput(); }); initJoy(); }
  function open() {
    active = true; nearProp = null; const s = api.save(); if (window.Audio_) Audio_.ambient("harbor");
    $("screen-level").classList.add("roam"); $("joy").hidden = false; $("talkBtn").hidden = false;
    const r = api.R.pick();
    if (!r) { renderPanel(); return; } // 3D still loading: render3d-ready calls open() again
    r.setLook(RPG.look()); room = null; r.roam.start(TOWN, hooks, s.hub3 || null);
    clearInterval(saveT); saveT = setInterval(() => { if (active) remember(); }, 4000);
    renderPanel();
  }
  function close() {
    if (!active) return; active = false; clearInterval(saveT); keys.clear(); if (window.Audio_) { Audio_.engine(null); Audio_.ambient("level"); }
    if (window.Render3D && Render3D.roam.active) { remember(); Render3D.roam.stop(); }
    $("screen-level").classList.remove("roam"); $("joy").hidden = true; $("talkBtn").hidden = true;
  }
  function remember() { if (!window.Render3D) return; const p = room ? INTERIORS[room].outside : Render3D.roam.pose(); if (p) { api.save().hub3 = p; api.persistSave(); } } // inside a room, a reload puts you just outside its door

  // ---------- free roam (3D) ----------
  const hooks = {
    onNear: p => { nearProp = p; renderPanel(); },      // Bolt is within talking distance of p (or null)
    onInteract: p => interact(p),                        // the player clicked / drove up to p
    onEnter: p => { if ($("modal").hidden) interact(p); }, // Bolt drove into a portal ring
  };
  function sendInput() {
    const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const y = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    if (window.Render3D) Render3D.roam.input(x, y);
  }
  function interactNear() { const p = window.Render3D && Render3D.roam.near(); if (p && $("modal").hidden) interact(p); }
  function onKeyUp(e) { keys.delete(e.key.toLowerCase()); sendInput(); }
  // phone: a thumb joystick over the bottom-left of the picture, a Talk button bottom-right
  function initJoy() {
    const j = $("joy"), k = $("joyKnob"); if (!j) return; let id = null, cx = 0, cy = 0;
    const set = e => { const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), m = Math.min(d, 44), ux = d ? dx / d : 0, uy = d ? dy / d : 0; k.style.transform = `translate(${ux * m}px, ${uy * m}px)`; if (window.Render3D) Render3D.roam.input(ux * m / 44, -uy * m / 44); };
    j.addEventListener("pointerdown", e => { id = e.pointerId; j.setPointerCapture(id); const r = j.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e); e.preventDefault(); });
    j.addEventListener("pointermove", e => { if (e.pointerId === id) set(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; k.style.transform = ""; if (window.Render3D) Render3D.roam.input(0, 0); };
    j.addEventListener("pointerup", end); j.addEventListener("pointercancel", end);
    $("talkBtn").onclick = () => interactNear();
  }

  function onKey(e) {
    if (!active || !$("modal").hidden) return;
    const t = e.target.tagName; if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    const k = e.key.toLowerCase();
    const m = ["arrowright", "d", "arrowdown", "s", "arrowleft", "a", "arrowup", "w"].includes(k);
    if (m) { e.preventDefault(); keys.add(k); sendInput(); } else if (k === "e" || k === "enter" || k === " ") { e.preventDefault(); interactNear(); }
  }
  function enterRoom(id) {
    const R = INTERIORS[id]; if (!R || !window.Render3D) return; remember(); fade(() => {
      room = id; nearProp = null;
      const people = PROPS.filter(p => p.inside === id).map(p => ({ ...p, x: p.wx, z: p.wz }));
      Render3D.roam.enter({ ...R, props: R.props.concat(people) }, hooks, null); renderPanel(); api.sfx("doors");
    });
  }
  function leaveRoom() { const R = INTERIORS[room]; if (!R) return; fade(() => { room = null; nearProp = null; Render3D.roam.start(TOWN, hooks, R.outside); remember(); renderPanel(); api.sfx("doors"); }); }
  function fade(fn) { const f = document.createElement("div"); f.className = "roomfade"; $("world3d").parentNode.appendChild(f); requestAnimationFrame(() => f.classList.add("on")); setTimeout(() => { fn(); f.classList.remove("on"); setTimeout(() => f.remove(), 400); }, 260); }
  function interact(p) {
    api.sfx("click");
    if (p.kind === "door") return enterRoom(p.to);
    if (p.kind === "exit") return leaveRoom();
    if (p.kind === "spot") return p.map ? api.showScreen("map") : api.openTown(p.tab);
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
    const s = api.save();
    {
      const p = nearProp, phone = document.documentElement.dataset.device === "phone";
      el.innerHTML = `<div class="zonechip">⚓ Harbor Town</div><h2>${s.settings.name ? "Welcome back, " + s.settings.name + "." : "Harbor Town"}</h2>
        <p>${phone ? "Drive Bolt with the <b>joystick</b>, drag the picture with your other thumb to look around, and tap <b>Talk</b> when you reach someone." : "Drive Bolt with <b>WASD</b> or the <b>arrow keys</b>, or <b>click</b> where to go. Drag to look around, scroll to zoom. Drive up to someone and press <b>E</b> to talk, shop, or step through a portal. Dark gates are sealed until you finish the zone before them."}</p>
        <div id="nearby">${p ? `<button class="primary" data-near="1">${p.kind === "portal" ? ZONES[p.zone - 1].emoji + (p.locked ? " Sealed: " : " Enter ") + ZONES[p.zone - 1].name : p.kind === "door" ? "🚪 Go into " + p.label : p.kind === "exit" ? "🚪 Back to town" : (p.kind === "npc" ? "🗣️ Talk to " : "Use: ") + p.label}</button>` : room ? `<span class="muted">You're in ${INTERIORS[room].title}. Drive to the glowing rings to use things, talk to whoever is here, and leave by the door.</span>` : `<span class="muted">Nobody within reach. The quest board and Marisol are down by the harbour, the shops ring the plaza, the portals stand along the shore. Lit doorways lead inside: Wrenna's Workshop and the Time Tower.</span>`}</div>
        <p class="muted" style="margin-top:10px">🪙 ${RPG.state.coins} · total level ${RPG.totalLevel()} · ${LEVELS.filter(l => api.completed()[l.id]).length}/${LEVELS.length} missions</p>`;
      const b = el.querySelector("button[data-near]"); if (b) b.onclick = () => interactNear();
      return;
    }
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

  return { init, open, close, pressE: interactNear, enterRoom, leaveRoom, get room() { return room; }, get active() { return active; }, PROPS, TOWN, INTERIORS };
})();
window.Hub = Hub;
