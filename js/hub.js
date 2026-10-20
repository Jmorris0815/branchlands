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
    { kind: "npc", id: "marisol", model: "villager2", wx: 3.2, wz: 13, label: "⚓ Marisol", color: "#c8553d" }, { kind: "npc", id: "pip", model: "villager", wx: -12.5, wz: -9.5, label: "🧑‍🌾 Old Pip", color: "#6a8c3a" },
    { kind: "npc", id: "odo", model: "villager3", wx: -16, wz: 7, label: "🛶 Odo", color: "#4a6b86" }, { kind: "npc", id: "wrenna", model: "villager5", inside: "workshop", wx: 1.5, wz: -1.6, label: "🔧 Wrenna", color: "#b07a2a" },
    { kind: "npc", id: "clock", model: "villager4", inside: "tower", wx: -1.2, wz: -1.0, label: "🕰️ Clockwright", color: "#6c5a8e" }, { kind: "npc", id: "dad", model: "villager", wx: 6, wz: 9, label: "🧔 Dad", color: "#3f7a6a" },
    { kind: "npc", id: "oracle", model: "villager4", wx: -6.5, wz: -13.5, label: "🔮 Oracle", color: "#5fb8b0" }, { kind: "npc", id: "nyx", model: "villager3", wx: 16.5, wz: 10, label: "🏴‍☠️ Nyx", color: "#2f3e5c" },
    { kind: "stall", tab: "market", wx: -8.7, wz: 1.3, label: "🏪 Market" }, { kind: "stall", tab: "workshop", wx: 9.5, wz: 3.5, label: "🔧 Workshop" },
    { kind: "stall", tab: "paint", wx: 8, wz: -6.5, label: "🎨 Style" }, { kind: "stall", tab: "pack", wx: -8.5, wz: -6, label: "🎒 Storehouse" },
    { kind: "stall", tab: "board", wx: -4, wz: 10.5, label: "📜 Quest board" }, { kind: "stall", tab: "skills", wx: 5.5, wz: -11, label: "📈 Skills" },
    { kind: "sign", wx: 0, wz: -9.5, label: "🗺️ World map" },
    { kind: "stall", tab: "family", wx: -12.5, wz: -2, label: "👨‍👩‍👦 Family" },
    { kind: "race", wx: 2.6, wz: 10.4, label: "🏁 Harbor Rally" },
    // doors into buildings (drive through them)
    { kind: "door", to: "workshop", wx: 13.95, wz: -0.9, label: "🔧 Wrenna's Workshop" },
    { kind: "door", to: "tower", wx: 10.7, wz: -12.55, label: "🕰️ The Time Tower" },
    { kind: "door", to: "shop", wx: -10.6, wz: 4.4, label: "🧺 Juno's Trading Post" },
    { kind: "npc", id: "juno", model: "villager6", inside: "shop", wx: 2.35, wz: -1.3, label: "🧺 Juno", color: "#d08a3a" },
    // your boat, tied up at the end of the pier (boat: where it floats, land: where you step off)
    { kind: "moor", wx: 1.05, wz: 22.8, label: "⛵ Your boat", boat: { x: 2.9, z: 22.2, ry: -Math.PI / 2 }, land: { x: 0, z: 22, yaw: Math.PI / 2 } },
    { kind: "sorter", wx: 5.3, wz: 15.1, ry: 0, label: "🐟 Fish Sorter" },
    { kind: "botdock", wx: 11.6, wz: 12.5, ry: 0, label: "🤖 Bot Dock" }, // your helper bots charge here (bots.js)
    // fishing spots: stand by one and cast into the water
    { kind: "fish", wx: -0.95, wz: 19.4, ry: Math.PI, label: "🎣 Fishing spot" },
    { kind: "fish", island: "gull", wx: -0.95, wz: 13.4, ry: Math.PI, label: "🎣 Fishing spot" },
    { kind: "npc", id: "gully", island: "gull", model: "villager3", wx: -2.6, wz: 5, label: "🦜 Old Gully", color: "#3a7a8a" },
  ];
  // Rooms you can drive into. Each has a size (w × d), what stands in it (things), the people and things you can
  // use (props: npcs come from PROPS with inside: <room>), and where Bolt appears (start, by the way out).
  const INTERIORS = {
    shop: { title: "Juno's Trading Post", w: 11, d: 8, wall: 0xe8d6b0, start: { x: 0, z: 2.6 }, outside: { x: -9.4, z: 3.9, yaw: 0.4 },
      things: [{ kind: "rug", x: 0, z: 1 }, { kind: "counter", x: 0, z: -1.6 }, { kind: "post", x: -1, z: -1.6, r: 0.62 }, { kind: "post", x: 1, z: -1.6, r: 0.62 },
        { kind: "shelf", x: -3.4, z: -3.65, r: 0.5 }, { kind: "shelf", x: 3.4, z: -3.65, r: 0.5 }, { kind: "fruit", x: -3.3, z: 0.6, r: 0.8 }, { kind: "fruit", x: 3.3, z: 0.6, r: 0.8, ry: 0.2 },
        { kind: "sacks", x: -4.7, z: 2.8, r: 0.6 }, { kind: "crates", x: 4.1, z: 2.9, r: 0.8 }, { kind: "barrel", x: -5, z: -1.2, r: 0.45 }, { kind: "barrel", x: 5, z: -1.4, r: 0.45 },
        { kind: "lantern", x: -2, z: 0 }, { kind: "lantern", x: 2, z: -0.5 }],
      props: [{ kind: "spot", tab: "market", x: -2.2, z: 2.2, label: "🏪 Sell and buy: the Market", color: "#f0b24a" }, { kind: "spot", tab: "pack", x: 2.2, z: 2.2, label: "🎒 Your storehouse", color: "#7fd0a8" },
        { kind: "exit", x: 0, z: 3.8, ry: Math.PI, label: "🚪 Back to town" }] },
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
    flats: [{ x: 0, z: 0, r: 9.5, y: 1.0 }, { x: 5.1, z: 15.1, r: 1.9 }, { x: 11.6, z: 12.9, r: 2.2 }],
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
    strollers: [{ from: 0, model: "villager6" }, { from: 5, model: "villager" }, { from: 9, model: "villager5", tint: 0xd8e4ff }, { from: 13, model: "villager", tint: 0xffe2c8 }, { from: 14, model: "villager5" }],
    // twenty golden gears hidden round the island; lift is how high one floats (about 1.9 needs a jump)
    gears: [
      { id: "dock", x: 0, z: 22.6 }, { id: "orchard", x: -15.2, z: -12.2 }, { id: "crate", x: -10.5, z: -7.5, lift: 1.55 }, { id: "plaza", x: 0, z: -6.4, lift: 1.9 },
      { id: "lighthouse", x: 24.4, z: -3.2 }, { id: "hilltop", x: -8, z: -17.6, lift: 1.9 }, { id: "tower", x: 15.6, z: -14.6 }, { id: "westbeach", x: -23, z: 6 },
      { id: "eastbeach", x: 23.5, z: 8.5 }, { id: "cottage", x: -9, z: 16.2 }, { id: "northshore", x: 0, z: -23.5 }, { id: "rocks", x: -20, z: -9.5 },
      { id: "shipyard", x: 17, z: 12.5 }, { id: "westwood", x: -17.5, z: -1 }, { id: "gate7", x: -10.5, z: -20 }, { id: "pines", x: 6, z: -19.5 },
      { id: "cove", x: -4.5, z: 17 }, { id: "cratepier", x: 2.6, z: 15.5, lift: 1.55 }, { id: "crystals", x: -6.5, z: -16, lift: 1.9 }, { id: "fisher", x: 11, z: 15.5 },
    ],
    // the Harbor Rally: start pose, then each ring in order (the last is the finish), and the medal times in seconds
    race: { start: { x: 0.6, z: 10.6, yaw: -0.21 }, medals: { gold: 22, silver: 28, bronze: 38 },
      rings: [{ x: 7, z: 12 }, { x: 15, z: 7 }, { x: 12, z: 0 }, { x: 9, z: -9 }, { x: 3, z: -8 }, { x: -3, z: -8.5 }, { x: -11, z: -12 }, { x: -12, z: 0 }, { x: -17, z: 4 }, { x: -6, z: 10 }, { x: 0, z: 15 }, { x: 0, z: 21.5 }] },
    bots: [{ from: 3, color: "#c8553d" }, { from: 7, color: "#3f9a6a", s: 0.7 }, { from: 11, color: "#e6b422", s: 0.75 }],
    get props() { return props().filter(p => !p.inside && !p.island).map(p => ({ ...p, x: p.wx, z: p.wz })); },
    name: "Harbor Town",
  };
  // Gull Isle: a small wild island past the horizon. Sail out of the harbor in your boat and keep going.
  const P = (x, z, ry = 0) => ({ kind: "stone", x, z, s: 1, ry });
  const GULL = {
    name: "Gull Isle", size: 64, radius: 17, seed: 2.4, start: { x: 0, z: 6 }, plaza: { x: 0, z: -1, r: 4.5 }, bay: { x: 0, z: 19, r: 6.5 },
    hills: [{ x: -6, z: -8, r: 5, h: 2.2 }, { x: 7, z: -7, r: 4.5, h: 1.6 }],
    flats: [{ x: 0, z: -1, r: 5.5, y: 1.1 }],
    decor: [
      { kind: "dock", x: 0, z: 11, len: 7 }, { kind: "wreck", x: 11, z: 7, ry: 0.9 },
      P(-4.2, -1), P(-3, -4), P(0, -5.2), P(3, -4), P(4.2, -1), P(-3, 2), // the old stone circle (open to the south)
      H(6.5, 2.5, 2.2), { kind: "lamp", x: 2.4, z: 5.2 }, { kind: "lamp", x: -2.4, z: 7.2 },
      T(-10, -4), T(-11, 2, 2.5), T(8, -11), T(4, -12, 2.4), T(-3, -13), T(12, -5), T(10, 1.5, 2.4), T(-8.5, 7), T(-12, -9, 2.4), T(-1, -9.5, 1.9), T(14, 0),
      RK(-15, -4), RK(-9, -13.5), RK(5.5, -15), RK(13.5, -10), RK(15, 4), RK(-14, 8), RK(-4, 12.5, 1.4),
      { kind: "crystal", x: -6.5, z: -9.5, s: 1.4 }, { kind: "crystal", x: -4.5, z: -7, s: 1.2 }, { kind: "crate", x: 9, z: 4.5, ry: 0.5 }, { kind: "crate", x: 2.2, z: 9.6, ry: 0.2 },
    ],
    spots: [], strollers: [], bots: [],
    gears: [
      { id: "g-hill", x: -6, z: -8, lift: 1.9 }, { id: "g-circle", x: 0, z: -1, lift: 1.9 }, { id: "g-pier", x: 0, z: 12.6 }, { id: "g-wreck", x: 8.5, z: 9.5 }, { id: "g-north", x: 0, z: -11.5 },
      { id: "g-east", x: 13, z: -2 }, { id: "g-west", x: -14, z: 1 }, { id: "g-cove", x: -7, z: 8.5 }, { id: "g-hut", x: 9, z: 0, lift: 1.55 }, { id: "g-ridge", x: 7, z: -7, lift: 1.9 },
    ],
    chests: [{ id: "c-circle", x: 2.6, z: -2.8 }, { id: "c-wreck", x: 9.4, z: 3.6 }, { id: "c-hill", x: -7.5, z: -10.5 }, { id: "c-west", x: -12.5, z: 4.5 }, { id: "c-north", x: 3, z: -12.5 }],
    moor: { kind: "moor", x: 1.05, z: 17.3, label: "⛵ Your boat", boat: { x: 2.9, z: 16.8, ry: -Math.PI / 2 }, land: { x: 0, z: 16.6, yaw: Math.PI / 2 } },
    get props() {
      const t = town();
      return PROPS.filter(p => p.island === "gull").map(p => ({ ...p, x: p.wx, z: p.wz })).concat(
        this.chests.map(c => ({ kind: "chest", id: c.id, x: c.x, z: c.z, label: "💰 Treasure chest", open: (t.chests || []).includes(c.id) })), [this.moor]);
    },
  };
  const TOWNS = { harbor: TOWN, gull: GULL, home: Home.TOWN }; // home: your own island, built from your blueprint (home.js)
  let active = false, nearProp = null, saveT = null, room = null, island = "harbor", photoOn = false; const keys = new Set(); // room: the interior Bolt is in, or null in town

  function props() { return PROPS.map(p => p.kind === "portal" ? { ...p, locked: !api.zoneUnlocked(p.zone), label: ZONES[p.zone - 1].emoji + " " + ZONES[p.zone - 1].name, color: ZONES[p.zone - 1].color } : p); }

  function init(a) { api = a; Bots.init(a, { FISH, sorterCode }); Home.init(a); window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", () => { keys.clear(); sendInput(); if (window.Render3D) Render3D.roam.boost(false); }); initJoy(); }
  function open() {
    active = true; nearProp = null; const s = api.save(); if (window.Audio_) Audio_.ambient("harbor");
    $("screen-level").classList.add("roam"); $("joy").hidden = false; $("talkBtn").hidden = false; $("jumpBtn").hidden = false; $("boostBtn").hidden = false;
    const r = api.R.pick();
    if (!r) { renderPanel(); return; } // 3D still loading: render3d-ready calls open() again
    r.setLook(RPG.look()); room = null; island = TOWNS[s.island] ? s.island : "harbor"; r.roam.start(TOWNS[island], hooks, s.hub3 || null);
    clearInterval(saveT); saveT = setInterval(() => { if (active) { remember(); renderPanel(); } }, 4000);
    if (island === "home") Home.arrive();
    Bots.start(); renderPanel();
  }
  function close() {
    if (!active) return; photo(false); active = false; clearInterval(saveT); keys.clear(); if (window.Audio_) { Audio_.engine(null); Audio_.ambient("level"); }
    Bots.stop(); Home.leave(); if (window.Render3D && Render3D.roam.active) { remember(); Render3D.roam.stop(); }
    $("screen-level").classList.remove("roam"); $("joy").hidden = true; $("talkBtn").hidden = true; $("jumpBtn").hidden = true; $("boostBtn").hidden = true;
  }
  function remember() { if (!window.Render3D) return; const p = room ? INTERIORS[room].outside : Render3D.roam.pose(); if (p) { api.save().hub3 = p; api.save().island = room ? "harbor" : island; api.persistSave(); } } // inside a room, a reload puts you just outside its door

  // ---------- free roam (3D) ----------
  const hooks = {
    onNear: p => { nearProp = p; renderPanel(); },      // Bolt is within talking distance of p (or null)
    onInteract: p => interact(p),                        // the player clicked / drove up to p
    onEnter: p => { if ($("modal").hidden) interact(p); }, // Bolt drove into a portal ring
    gearTaken: id => town().gears.includes(id),
    onSail: () => sailAway(),
    onGear: id => gotGear(id),
    workers: () => room || island !== "harbor" ? [] : Bots.poses(), // helper bots at work (bots.js decides where, render3d draws them)
    places: Bots.PLACES,
    marks: () => { const m = {}; for (const p of PROPS) if (p.kind === "npc") { const qs = RPG.questsFor(p.id); if (qs.some(q => q.ready)) m[p.id] = "?"; else if (qs.length) m[p.id] = "!"; } return m; }, // over their heads and on the minimap
  };
  // what you have done around town: gears found, rally best time and medals
  function town() { const s = api.save(); if (!s.town) s.town = { gears: [], best: null, medals: {} }; return s.town; }
  function gotGear(id) {
    const t = town(), T = TOWNS[island], N = T.gears.length; if (!t.gears.includes(id)) t.gears.push(id); RPG.addCoins(15); api.persistSave();
    const n = gearsFound(), flag = island === "harbor" ? "allGears" : "allGears_" + island, [prize, title] = island === "harbor" ? [300, "Gear Hunter"] : [200, "Beachcomber"];
    if (n >= N && !t[flag]) { t[flag] = true; RPG.addCoins(prize); const st = RPG.state; if (st.titles && !st.titles.includes(title)) st.titles.push(title); api.persistSave(); api.toast(`<b>⚙️ All ${N} golden gears on ${T.name}!</b> +${prize} 🪙 and the title ${title}.`); api.sfx("unlock"); }
    else api.toast(`⚙️ Golden gear ${n} of ${N} on ${T.name} · +15 🪙`);
    renderPanel();
  }
  const gearsFound = () => TOWNS[island].gears.filter(g => town().gears.includes(g.id)).length;
  function openChest(p) {
    const t = town(); t.chests = t.chests || [];
    if (t.chests.includes(p.id)) { api.toast("This chest is empty. You found what was in it already."); return; }
    t.chests.push(p.id); const coins = 25 + Math.floor(Math.random() * 36), goods = Object.keys(RPG.GOODS).filter(g => !RPG.GOODS[g].crafted), g = goods[Math.floor(Math.random() * goods.length)], got = RPG.add(g, 2 + Math.floor(Math.random() * 3));
    RPG.addCoins(coins); api.persistSave(); Render3D.roam.openChest(p.id); api.sfx("gem");
    api.toast(`<b>💰 Treasure!</b> +${coins} 🪙${got ? ` and ${RPG.GOODS[g].icon} ${got} ${RPG.GOODS[g].name}${got > 1 && !/s$/.test(RPG.GOODS[g].name) ? "s" : ""}` : ""} · ${t.chests.length} of ${GULL.chests.length} chests`);
  }
  // ---------- fishing ----------
  // What bites: w = how often, cm = size range, lvl = Fishing level needed, gull = only off Gull Isle.
  // pulls, zone (width of the green) and speed (of the needle) make the reel game harder for bigger fish.
  const FISH = [
    { id: "boot", name: "Old boot", w: 8, cm: [26, 31], pulls: 1, zone: 0.4, speed: 0.9, color: 0x4a3626, xp: 4, boot: true },
    { id: "sardine", w: 30, cm: [12, 21], pulls: 1, zone: 0.34, speed: 1.0, color: 0xc4d2de, xp: 10 },
    { id: "mackerel", w: 24, cm: [25, 42], pulls: 2, zone: 0.3, speed: 1.2, color: 0x4f8aa0, xp: 18 },
    { id: "bass", w: 16, cm: [35, 66], pulls: 2, zone: 0.25, speed: 1.45, color: 0x7d8a8f, xp: 30, lvl: 2 },
    { id: "salmon", w: 11, cm: [50, 86], pulls: 3, zone: 0.22, speed: 1.6, color: 0xe0866a, xp: 45, lvl: 3 },
    { id: "koi", w: 2, cm: [30, 56], pulls: 4, zone: 0.16, speed: 2.0, color: 0xffb020, xp: 120, lvl: 4 },
    { id: "swordfish", w: 8, cm: [120, 220], pulls: 4, zone: 0.17, speed: 1.9, color: 0x35506e, xp: 85, lvl: 5, gull: true },
  ];
  const fishName = f => f.name || RPG.GOODS[f.id].name, fishIcon = f => f.boot ? "🥾" : RPG.GOODS[f.id].icon;
  const journal = () => { const t = town(); return t.fish || (t.fish = {}); };
  function biteFish() { // which fish took the bait: weighted by rarity, better odds and a wider green as Fishing levels up
    const L = RPG.skillLevel("fishing"), pool = FISH.filter(f => (!f.lvl || L >= f.lvl) && (!f.gull || island === "gull"));
    const w = f => f.w * (f.id === "koi" ? 1 + L * 0.15 + (island === "gull" ? 1 : 0) : f.boot ? Math.max(0.3, 1 - L * 0.1) : 1);
    let k = Math.random() * pool.reduce((a, f) => a + w(f), 0), f = pool[0]; for (const x of pool) { k -= w(x); if (k <= 0) { f = x; break; } }
    const cm = Math.round(f.cm[0] + Math.random() * Math.random() * (f.cm[1] - f.cm[0])); // big ones are rarer
    return { ...f, cm, scale: f.boot ? 1 : Math.min(1.7, Math.max(0.3, cm / 100 * 0.95)), zone: Math.min(0.5, f.zone + (L - 1) * 0.012), at: 0.3 + Math.random() * 0.4 };
  }
  function goFish() {
    if (!window.Render3D || Render3D.roam.fish.on) return;
    if (!Render3D.roam.fish.start({ bite: biteFish, window: 1.1, done: fishDone })) { api.toast("🎣 No open water here. Stand at the edge of the pier and try again."); return; }
    renderPanel();
  }
  function fishDone(res) {
    renderPanel(); if (!res.ok) { if (res.why === "snap") api.toast(`🎣 Snap! The ${fishName(res.fish).toLowerCase()} broke the line. Tap only when the needle is in the green.`); else if (res.why === "slow" || res.why === "tired") api.toast("🎣 The fish got away. Press E (or tap Talk) to cast again."); return; }
    const f = res.fish, j = journal(), e = j[f.id] || (j[f.id] = { n: 0, best: 0 }), first = !e.n, record = !f.boot && e.n && f.cm > e.best; e.n++; if (!f.boot && f.cm > e.best) e.best = f.cm;
    const L0 = RPG.skillLevel("fishing"); RPG.addXp("fishing", f.xp); const L1 = RPG.skillLevel("fishing");
    const got = f.boot ? RPG.add("scrap", 1) : RPG.add(f.id, 1); api.persistSave(); api.sfx(f.id === "koi" || f.id === "swordfish" ? "unlock" : "gem");
    let msg = f.boot ? `<b>🥾 An old boot!</b> There was a scrap gear inside${got ? "" : ", but your backpack is full"}.` : `<b>${fishIcon(f)} ${fishName(f)}, ${f.cm} cm!</b>${first ? " New in your fish journal." : record ? " A new record!" : ""}${got ? "" : " Your backpack is full, so you let it go."}`;
    msg += ` +${f.xp} 🎣 XP`; if (L1 > L0) { msg += `<br><b>🎣 Fishing level ${L1}!</b>`; const nu = FISH.filter(x => x.lvl === L1); if (nu.length) msg += ` ${nu.map(x => fishIcon(x) + " " + fishName(x)).join(" and ")} can bite now${nu.some(x => x.gull) ? " off Gull Isle" : ""}.`; }
    api.toast(msg);
    const kinds = FISH.filter(x => !x.boot), all = kinds.every(x => j[x.id] && j[x.id].n), t = town();
    if (all && !t.angler) { t.angler = true; RPG.addCoins(200); const st = RPG.state; if (st.titles && !st.titles.includes("Angler")) st.titles.push("Angler"); api.persistSave(); setTimeout(() => { api.toast(`<b>📖 Every fish in the journal!</b> +200 🪙 and the title Angler.`); api.sfx("unlock"); }, 2600); }
  }
  function fishJournal() {
    const j = journal(), L = RPG.skillLevel("fishing");
    api.showModal(`<h2>📖 Fish journal</h2><p>Fishing level <b>${L}</b>. Stand at a 🎣 fishing spot and press E (or tap Talk). Wait for the bobber to plunge, tap, then tap each time the needle crosses the green.</p>
      <div class="cards">${FISH.map(f => { const e = j[f.id], locked = f.lvl && L < f.lvl; return `<div class="card"><div class="ct"><span class="big">${e && e.n ? fishIcon(f) : "❔"}</span> <b>${e && e.n ? fishName(f) : locked ? "???" : fishName(f)}</b></div>
        <div class="muted">${e && e.n ? `caught ${e.n}${f.boot ? "" : ` · best ${e.best} cm`}` : locked ? `bites at Fishing ${f.lvl}${f.gull ? ", off Gull Isle" : ""}` : f.gull ? "only off Gull Isle" : "not caught yet"}</div></div>`; }).join("")}</div>
      <div class="row"><button id="closeBtn">Done</button></div>`);
    $("closeBtn").onclick = api.hideModal;
  }
  // ---------- Marisol's fish sorter: write sort(fish) in Python and the conveyor does what your code says ----------
  // Each job is a rule. A crate of fish goes down the belt, your function decides each one, the rule checks it.
  const SORT_JOBS = [
    { id: "s1", title: "Sardine Supper", coins: 60, xp: 60, names: ["sardine", "mackerel", "bass", "salmon"],
      ask: `Odo's ferry wants every sardine for supper. Send each <b>sardine</b> to <b>keep</b> and everything else to <b>sell</b>.`,
      rule: f => f.name === "sardine" ? "keep" : "sell" },
    { id: "s2", title: "Too Small to Keep", coins: 90, xp: 90, names: ["sardine", "sardine", "mackerel", "bass"], edge: [["sardine", 19], ["sardine", 20], ["mackerel", 25]],
      ask: `Little fish go back to grow. Anything <b>shorter than 20 cm</b> goes back to the <b>sea</b>. Everything else is sold.`,
      rule: f => f.cm < 20 ? "sea" : "sell" },
    { id: "s3", title: "Three Bins", coins: 120, xp: 120, names: ["sardine", "sardine", "mackerel", "salmon", "koi"], edge: [["koi", 31], ["sardine", 19], ["sardine", 20]],
      ask: `Golden koi are lucky: <b>keep</b> every koi. Fish shorter than 20 cm go back to the <b>sea</b>. Everything else, <b>sell</b>.`,
      rule: f => f.name === "koi" ? "keep" : f.cm < 20 ? "sea" : "sell" },
    { id: "s4", title: "Market Day", coins: 160, xp: 160, names: ["mackerel", "bass", "salmon", "sardine", "boot"], edge: [["boot", 28], ["bass", 40, "same"]],
      ask: `Every fish now has today's <code>price</code> and its usual <code>base</code> price. <b>Sell</b> it when the price is at least the base. Otherwise <b>keep</b> it for tomorrow. Old boots are always <b>keep</b>: Wrenna wants the scrap.`,
      rule: f => f.name === "boot" || f.price < f.base ? "keep" : "sell" },
  ];
  const STARTER = `def sort(fish):
    # fish["name"]  "sardine", "mackerel", "bass", "salmon", "koi", "boot"
    # fish["cm"]    how long it is
    # fish["price"] today's price, fish["base"] the usual price
    # return "keep", "sell" or "sea"
    return "sell"
`;
  const sorterCode = () => { const t = sorter(), done = SORT_JOBS.filter(j => t.sorter[j.id]); return done.length ? t.sortCode[done[done.length - 1].id] || null : null; }; // what bot.sort() runs
  const sorter = () => { const t = town(); t.sorter = t.sorter || {}; t.sortCode = t.sortCode || {}; return t; };
  const nextJob = () => SORT_JOBS.find(j => !sorter().sorter[j.id]) || SORT_JOBS[SORT_JOBS.length - 1];
  function crate(job) { // twelve fish: the tricky ones first, then random ones, then shuffled
    const look = id => FISH.find(f => f.id === id), mk = (id, cm, same) => { const f = look(id), base = id === "boot" ? 1 : RPG.GOODS[id].base;
      return { name: id, cm: cm || Math.round(f.cm[0] + Math.random() * (f.cm[1] - f.cm[0])), base, price: same ? base : Math.max(1, Math.round(base * (0.6 + Math.random() * 0.8))) }; };
    const out = (job.edge || []).map(([id, cm, same]) => mk(id, cm, same));
    while (out.length < 12) { const id = job.names[Math.floor(Math.random() * job.names.length)], f = look(id); out.push(mk(id, id === "sardine" && Math.random() < 0.5 ? 14 + Math.floor(Math.random() * 10) : 0)); if (f.boot) out[out.length - 1].cm = 28; }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function sorterMenu(id) {
    const t = sorter(), job = SORT_JOBS.find(j => j.id === id) || nextJob(), i = SORT_JOBS.indexOf(job), code = t.sortCode[job.id] || (i && t.sortCode[SORT_JOBS[i - 1].id]) || STARTER;
    api.showModal(`<h2>🐟 Fish Sorter · ${job.title}</h2>
      <p class="muted">Job ${i + 1} of ${SORT_JOBS.length}${t.sorter[job.id] ? " · done ✓" : ""}. ${SORT_JOBS.map((j, k) => `<button class="small" data-job="${j.id}" ${k && !t.sorter[SORT_JOBS[k - 1].id] && !t.sorter[j.id] ? "disabled" : ""}>${t.sorter[j.id] ? "✓ " : ""}${k + 1}</button>`).join(" ")}</p>
      <p>${job.ask}</p>
      <textarea id="sortCode" wrap="off" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" style="width:100%;min-height:190px;resize:vertical;font:14px/1.5 var(--mono);background:var(--term-bg);color:var(--term-ink);border:1px solid var(--line);border-radius:8px;padding:10px;tab-size:4"></textarea>
      <div id="sortErr"></div>
      <div class="row"><button id="sortRun" class="primary">▶ Run the sorter</button><button id="closeBtn">Close</button></div>
      <p class="muted">Your code decides one fish at a time. Twelve fish come down the belt, and every one has to land in the right bin.</p>`);
    const ta = $("sortCode"); ta.value = code;
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; } e.stopPropagation(); });
    ta.addEventListener("input", () => { sorter().sortCode[job.id] = ta.value; });
    $("modalBody").querySelectorAll("button[data-job]").forEach(b => b.onclick = () => { sorter().sortCode[job.id] = ta.value; api.persistSave(); sorterMenu(b.dataset.job); });
    $("sortRun").onclick = () => runSorter(job, ta.value); $("closeBtn").onclick = () => { api.persistSave(); api.hideModal(); };
  }
  async function runSorter(job, code) {
    const t = sorter(); t.sortCode[job.id] = code; api.persistSave();
    const err = (raw, tip) => { $("sortErr").innerHTML = `<div class="err" style="background:#3a1f22;color:#ffd0c0;border-radius:8px;padding:8px 10px;margin:8px 0;font:13px/1.4 var(--mono)">${raw.replace(/</g, "&lt;")}${tip ? `<div style="font-family:var(--body,inherit);margin-top:4px">💡 ${tip}</div>` : ""}</div>`; api.sfx("bump"); };
    if (!window.PY || typeof Sk === "undefined") return err("The Python engine hasn't loaded yet.", "Check the internet connection and try again in a moment.");
    $("sortRun").disabled = true;
    const res = await PY.run(code, null); $("sortRun").disabled = false;
    if (res.error) return err(res.error.raw, res.error.tip);
    if (!res.module.$d.sort) return err("There's no function called sort.", "Start with  def sort(fish):  and give back a bin with return.");
    const fish = crate(job), rows = [];
    for (const f of fish) {
      const r = PY.call(res.module, "sort", [{ ...f }]); if (r.error) return err(r.error, "Your function crashed on a " + f.name + " (" + f.cm + " cm). Check the spelling of the keys, like fish[\"cm\"].");
      const got = typeof r.value === "string" ? r.value.trim().toLowerCase() : r.value;
      if (!["keep", "sell", "sea"].includes(got)) return err(`sort() gave back ${JSON.stringify(r.value === undefined ? null : r.value)} for a ${f.name}.`, `It has to return "keep", "sell" or "sea" for every fish. Is there a path through your ifs with no return?`);
      rows.push({ f, got, want: job.rule(f) });
    }
    const right = rows.filter(r => r.got === r.want).length, pass = right === rows.length;
    api.hideModal();
    const play = rows.map(r => { const F = FISH.find(x => x.id === r.f.name); return { color: F.color, scale: Math.min(0.55, Math.max(0.2, r.f.cm / 100 * 0.6)), boot: !!F.boot, bin: r.got, ok: r.got === r.want }; });
    if (!window.Render3D || !Render3D.roam.sorter(play, () => sortResults(job, rows, right, pass))) sortResults(job, rows, right, pass);
  }
  function sortResults(job, rows, right, pass) {
    const t = sorter(), first = pass && !t.sorter[job.id]; if (first) { t.sorter[job.id] = true; RPG.addCoins(job.coins); RPG.addXp("logic", job.xp); }
    api.persistSave(); api.sfx(pass ? "win" : "bump");
    const i = SORT_JOBS.indexOf(job), next = SORT_JOBS[i + 1], icon = id => { const F = FISH.find(x => x.id === id); return fishIcon(F); };
    api.showModal(`<h2>${pass ? "✅ Every fish in the right bin!" : `🐟 ${right} of ${rows.length} right`}</h2>
      ${first ? `<p>+${job.coins} 🪙 and ${job.xp} 🧭 Logic XP.${next ? ` Next job: <b>${next.title}</b>.` : " That was the last job. The harbor runs on your code now."}</p>` : pass ? "<p>Still works. Code that works every time is the whole point.</p>" : `<p>Look at the red rows: what did those fish have in common?</p>`}
      <div class="tablewrap"><table class="goods"><tr><th>Fish</th><th>cm</th>${job.id === "s4" ? "<th>price / base</th>" : ""}<th>Your code</th><th>Should be</th></tr>
      ${rows.map(r => `<tr style="${r.got === r.want ? "" : "background:rgba(220,70,60,0.18)"}"><td>${icon(r.f.name)} ${r.f.name}</td><td>${r.f.cm}</td>${job.id === "s4" ? `<td>${r.f.price} / ${r.f.base}</td>` : ""}<td>${r.got}</td><td>${r.got === r.want ? "✓" : "❌ " + r.want}</td></tr>`).join("")}</table></div>
      <div class="row">${pass && next ? `<button id="sortNext" class="primary">Next job: ${next.title}</button>` : ""}<button id="sortEdit" class="${pass && next ? "" : "primary"}">${pass ? "Back to the code" : "Fix the code"}</button><button id="closeBtn">Done</button></div>`);
    $("sortEdit").onclick = () => sorterMenu(job.id); $("closeBtn").onclick = () => { api.hideModal(); renderPanel(); };
    const nb = $("sortNext"); if (nb) nb.onclick = () => sorterMenu(next.id);
  }
  // sail far enough from one island and the current carries you to the other
  function sailAway(to) {
    if (!to && Home.unlocked()) return sailMenu();
    to = to || (island === "harbor" ? "gull" : "harbor"); const T = TOWNS[to]; api.toast(`⛵ Sailing to ${T.name}…`); api.sfx("teleport");
    fade(() => { if (island === "home") Home.leave(); island = to; nearProp = null; Render3D.roam.start(T, hooks, { x: 0, z: T.radius + 13, yaw: Math.PI / 2, sail: true }); if (to === "home") Home.arrive(); remember(); renderPanel(); });
  }
  function sailMenu() {
    const where = [["harbor", "⚓", "Harbor Town", "the market, the Workshop, everyone you know"], ["gull", "🏝️", "Gull Isle", "Old Gully, treasure chests, swordfish"], ["home", "🏡", Home.islandName(), "your own island"]];
    api.showModal(`<h2>⛵ Where to?</h2><p>The current will take you anywhere you like.</p><div style="display:grid;gap:8px">${where.map(([id, ic, name, what]) => `<button data-sail="${id}" class="${id === island ? "" : "primary"}" style="text-align:left">${ic} <b>${name}</b> <span class="muted">· ${id === island ? "turn back" : what}</span></button>`).join("")}</div>`);
    $("modalBody").querySelectorAll("button[data-sail]").forEach(b => b.onclick = () => { api.hideModal(); sailAway(b.dataset.sail); });
  }
  // after a blueprint is built: the island is made again around Bolt, standing where he was
  function rebuildIsland() {
    if (!active || island !== "home" || !window.Render3D) return; const pose = Render3D.roam.pose();
    fade(() => { nearProp = null; Render3D.roam.start(TOWNS.home, hooks, pose); renderPanel(); });
  }
  function sailToggle() {
    if (Render3D.roam.race.on) return; const on = !Render3D.roam.sailing; if (!Render3D.roam.sail(on)) return;
    api.sfx(on ? "splash" : "doors"); if (on) api.toast(Home.unlocked() ? "⛵ Steer out to sea and keep going. Past the horizon the current asks where you want to go." : island === "harbor" ? "⛵ Steer out to sea and keep going. Gull Isle is past the horizon." : "⛵ Sail away from the island and the current takes you home."); renderPanel();
  }
  // photo mode: no labels or map, the clock stops, drag to frame the shot
  function photo(on) {
    if (!window.Render3D || on === photoOn || (on && Render3D.roam.race.on)) return; photoOn = on; Render3D.roam.photo(on); $("screen-level").classList.toggle("photo", on);
    const old = $("photoBar"); if (old) old.remove();
    if (on) {
      $("world3d").parentNode.insertAdjacentHTML("beforeend", `<div id="photoBar" class="photobar"><b>📷 Photo mode</b>${room ? "" : `<label>Time of day <input id="phTime" type="range" min="0" max="1" step="0.005" value="${Render3D.townTime}"></label>`}<button id="phSave" class="primary small">Save photo</button><button id="phDone" class="small">Done</button><span class="muted">drag to look, scroll to zoom</span></div>`);
      const tm = $("phTime"); if (tm) tm.oninput = () => { Render3D.townTime = +tm.value; };
      $("phSave").onclick = () => { const url = Render3D.roam.snapshot(); if (!url) return; const a = document.createElement("a"); a.href = url; a.download = "branchlands-" + new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".jpg"; document.body.appendChild(a); a.click(); a.remove(); api.sfx("star"); api.toast("📷 Photo saved to your downloads."); };
      $("phDone").onclick = () => photo(false);
    } else { const tod = api.save().settings.tod; if (tod && tod !== "cycle") Render3D.setTimeMode(tod); }
  }
  const MEDALS = [["gold", "🥇", "Gold", 150], ["silver", "🥈", "Silver", 80], ["bronze", "🥉", "Bronze", 40]];
  const fmt = t => Math.floor(t / 60) + ":" + (t % 60).toFixed(2).padStart(5, "0");
  const medalOf = t => { const m = MEDALS.find(([k]) => t < TOWN.race.medals[k]); return m ? { key: m[0], icon: m[1], name: m[2] } : null; };
  function raceMenu() {
    const t = town(), M = TOWN.race.medals, phone = document.documentElement.dataset.device === "phone", m = t.best ? medalOf(t.best) : null;
    api.showModal(`<h2>🏁 Harbor Rally</h2><p>Twelve rings round the island, from the plaza to the end of the pier. The next ring glows gold, and the arrow over Bolt points at it.</p>
      <p>${phone ? "Hold <b>Boost</b> for speed while the blue bar lasts. Tap <b>Jump</b> to hop crates and rocks." : "Hold <b>Shift</b> to boost while the blue bar lasts. <b>Space</b> jumps crates and rocks. <b>Esc</b> stops the race."}</p>
      <p>🥇 under ${M.gold} s (+150 🪙) · 🥈 under ${M.silver} s (+80 🪙) · 🥉 under ${M.bronze} s (+40 🪙), paid once each.</p>
      <p class="muted">${t.best ? `Your best: <b>${fmt(t.best)}</b> ${m ? m.icon : ""}` : "No time on the board yet."}</p>
      <div class="row"><button id="raceGo" class="primary">Start the race</button><button id="closeBtn">Not now</button></div>`);
    $("raceGo").onclick = startRace; $("closeBtn").onclick = api.hideModal;
  }
  function startRace() { api.hideModal(); if (window.Render3D && Render3D.roam.race.start({ ...TOWN.race, best: town().best }, raceDone)) renderPanel(); }
  function raceDone(time) {
    const t = town(), prev = t.best, m = medalOf(time); let coins = 0;
    for (const [k, , , c] of MEDALS.slice().reverse()) if (time < TOWN.race.medals[k] && !t.medals[k]) { t.medals[k] = true; coins += c; }
    const better = !prev || time < prev; if (better) t.best = time; api.persistSave(); if (coins) RPG.addCoins(coins);
    const nextUp = MEDALS.slice().reverse().find(([k]) => time >= TOWN.race.medals[k]);
    api.showModal(`<h2>${m ? m.icon + " " + m.name + "!" : "🏁 Finished"}</h2><p>Time: <b>${fmt(time)}</b>${better ? (prev ? ` · new best (was ${fmt(prev)})` : " · your first time on the board") : ` · best ${fmt(prev)}`}</p>
      ${coins ? `<p>+${coins} 🪙 for a new medal.</p>` : ""}${nextUp ? `<p class="muted">${nextUp[1]} ${nextUp[2]} is under ${TOWN.race.medals[nextUp[0]]} s. Boost on the straights and save the bar for the long run past the market.</p>` : ""}
      <div class="row"><button id="raceGo" class="primary">Race again</button><button id="closeBtn">Done</button></div>`);
    $("raceGo").onclick = startRace; $("closeBtn").onclick = () => { api.hideModal(); renderPanel(); };
    renderPanel();
  }
  function sendInput() {
    const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const y = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    if (window.Render3D) Render3D.roam.input(x, y);
  }
  function interactNear() { if (window.Render3D && Render3D.roam.fish.on) { Render3D.roam.fish.tap(); return; } const p = window.Render3D && Render3D.roam.near(); if (p && $("modal").hidden) interact(p); }
  function onKeyUp(e) { const k = e.key.toLowerCase(); keys.delete(k); if (k === "shift" && window.Render3D) Render3D.roam.boost(false); sendInput(); }
  // phone: a thumb joystick over the bottom-left of the picture, a Talk button bottom-right
  function initJoy() {
    const j = $("joy"), k = $("joyKnob"); if (!j) return; let id = null, cx = 0, cy = 0;
    const set = e => { const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), m = Math.min(d, 44), ux = d ? dx / d : 0, uy = d ? dy / d : 0; k.style.transform = `translate(${ux * m}px, ${uy * m}px)`; if (window.Render3D) Render3D.roam.input(ux * m / 44, -uy * m / 44); };
    j.addEventListener("pointerdown", e => { id = e.pointerId; j.setPointerCapture(id); const r = j.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e); e.preventDefault(); });
    j.addEventListener("pointermove", e => { if (e.pointerId === id) set(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; k.style.transform = ""; if (window.Render3D) Render3D.roam.input(0, 0); };
    j.addEventListener("pointerup", end); j.addEventListener("pointercancel", end);
    $("talkBtn").onclick = () => interactNear();
    $("jumpBtn").addEventListener("pointerdown", e => { e.preventDefault(); if (window.Render3D) { if (Render3D.roam.fish.on) Render3D.roam.fish.tap(); else Render3D.roam.jump(); } });
    const bb = $("boostBtn"), boost = on => e => { e.preventDefault(); if (on) bb.setPointerCapture(e.pointerId); bb.classList.toggle("on", on); if (window.Render3D) Render3D.roam.boost(on); };
    bb.addEventListener("pointerdown", boost(true)); bb.addEventListener("pointerup", boost(false)); bb.addEventListener("pointercancel", boost(false));
  }

  function onKey(e) {
    if (!active || !$("modal").hidden) return;
    const t = e.target.tagName; if (photoOn) { if (e.key === "Escape" || e.key.toLowerCase() === "p") photo(false); return; } if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    const k = e.key.toLowerCase();
    const m = ["arrowright", "d", "arrowdown", "s", "arrowleft", "a", "arrowup", "w"].includes(k);
    if (m) { e.preventDefault(); keys.add(k); sendInput(); }
    else if (k === " ") { e.preventDefault(); if (window.Render3D) { if (Render3D.roam.fish.on) Render3D.roam.fish.tap(); else Render3D.roam.jump(); } }
    else if (k === "shift") { keys.add(k); if (window.Render3D) Render3D.roam.boost(true); }
    else if (k === "escape" && window.Render3D && Render3D.roam.fish.on) Render3D.roam.fish.stop();
    else if (k === "escape" && window.Render3D && Render3D.roam.race.on) { Render3D.roam.race.stop(); api.toast("🏁 Race stopped."); renderPanel(); }
    else if (k === "e" || k === "enter") { e.preventDefault(); interactNear(); }
    else if (k === "p") photo(true);
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
    if (island === "home" && Home.interact(p)) return; // the blueprint table, the farm shed, the windmill and bakery
    if (p.kind === "door") return enterRoom(p.to);
    if (p.kind === "exit") return leaveRoom();
    if (p.kind === "spot") return p.map ? api.showScreen("map") : api.openTown(p.tab);
    if (p.kind === "race") return raceMenu();
    if (p.kind === "moor") return sailToggle();
    if (p.kind === "chest") return openChest(p);
    if (p.kind === "fish") return goFish();
    if (p.kind === "botdock") return Bots.hq();
    if (p.kind === "sorter") return Render3D.roam.sorting ? null : sorterMenu();
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
      if (island === "home" && !room) return homePanel(el, p, phone);
      el.innerHTML = `<div class="zonechip">${island === "gull" ? "🏝️ Gull Isle" : "⚓ Harbor Town"}</div><h2>${s.settings.name ? "Welcome back, " + s.settings.name + "." : "Harbor Town"}</h2>
        <p>${phone ? "Drive Bolt with the <b>joystick</b>, drag the picture with your other thumb to look around, and tap <b>Talk</b> when you reach someone." : "Drive Bolt with <b>WASD</b> or the <b>arrow keys</b>, or <b>click</b> where to go. Drag to look around, scroll to zoom. Drive up to someone and press <b>E</b> to talk, shop, or step through a portal. <b>Space</b> jumps, <b>Shift</b> boosts. Dark gates are sealed until you finish the zone before them."}</p>
        <p class="muted">⚙️ ${gearsFound()} of ${TOWNS[island].gears.length} golden gears found here${island === "gull" ? ` · 💰 ${(town().chests || []).length} of ${GULL.chests.length} chests` : town().best ? ` · 🏁 rally best ${fmt(town().best)}` : " · 🏁 the Harbor Rally flag is by the pier"} · ⛵ your boat is at the end of the pier · <b>!</b> over someone means a quest, <b>?</b> a reward waiting.</p>
        <div class="row"><button id="photoBtn" class="small">📷 Photo mode</button><button id="journalBtn" class="small">📖 Fish journal</button><button id="botsBtn" class="small">🤖 Bots</button></div>
        ${Bots.summary() ? `<p class="muted">🤖 ${Bots.summary()}</p>` : ""}
        <div id="nearby">${p ? `<button class="primary" data-near="1">${p.kind === "portal" ? ZONES[p.zone - 1].emoji + (p.locked ? " Sealed: " : " Enter ") + ZONES[p.zone - 1].name : p.kind === "door" ? "🚪 Go into " + p.label : p.kind === "exit" ? "🚪 Back to town" : p.kind === "fish" ? (Render3D.roam.fish.on ? "🎣 Tap now (or press E)" : "🎣 Go fishing") : (p.kind === "npc" ? "🗣️ Talk to " : "Use: ") + p.label}</button>` : room ? `<span class="muted">You're in ${INTERIORS[room].title}. Drive to the glowing rings to use things, talk to whoever is here, and leave by the door.</span>` : `<span class="muted">Nobody within reach. The quest board and Marisol are down by the harbour, the shops ring the plaza, the portals stand along the shore. Lit doorways lead inside: Wrenna's Workshop and the Time Tower.</span>`}</div>
        <p class="muted" style="margin-top:10px">🪙 ${RPG.state.coins} · total level ${RPG.totalLevel()} · ${LEVELS.filter(l => api.completed()[l.id]).length}/${LEVELS.length} missions</p>`;
      const b = el.querySelector("button[data-near]"); if (b) b.onclick = () => interactNear();
      const pb = $("photoBtn"); if (pb) pb.onclick = () => photo(true);
      const jb = $("journalBtn"); if (jb) jb.onclick = fishJournal;
      const bb = $("botsBtn"); if (bb) bb.onclick = () => Bots.hq();
      return;
    }
  }

  function homePanel(el, p, phone) {
    el.innerHTML = `<div class="zonechip">🏡 ${Home.islandName()}</div><h2>Your island</h2>
      <p>Ten squares by ten, and all of it yours. Write the island in Python at the <b>📐 Blueprint table</b>, then build it. When crops turn ripe, ${phone ? "drive" : "drive Bolt"} straight through them to harvest. Apple trees and beehives: drive up close.</p>
      <p class="muted">🏡 ${Home.summary()}</p>
      <p class="muted">🧺 The farm shed keeps what you harvest; ship it to Marisol from there. The windmill and bakery keep working while you're away. ⛵ Your boat is at the end of the pier.</p>
      <div class="row"><button id="photoBtn" class="small">📷 Photo mode</button><button id="bpBtn" class="small">📐 Blueprint</button></div>
      <div id="nearby">${p ? `<button class="primary" data-near="1">Use: ${p.label}</button>` : `<span class="muted">Nothing within reach.</span>`}</div>
      <p class="muted" style="margin-top:10px">🪙 ${RPG.state.coins} · total level ${RPG.totalLevel()}</p>`;
    const b = el.querySelector("button[data-near]"); if (b) b.onclick = () => interactNear();
    $("photoBtn").onclick = () => photo(true); $("bpBtn").onclick = () => Home.blueprint();
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
        { q: "What's that machine by the water?", a: () => `The fish sorter. Fish go down the belt and land in a bin: keep, sell or back to the sea. It runs on a Python function called <code>sort(fish)</code>, and nobody here can write one. Four jobs, and I pay for every one you get right. Walk up to it and press E.` },
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
        { q: "How do I fish?", a: () => `There's a rod and a bucket halfway down the pier. Stand there and press E. The bobber twitches a few times before a real bite. Tap when it goes under with a big splash, then tap each time the needle crosses the green. Sell what you catch to Juno, or keep it for a stew.` },
      ],
    },
    wrenna: {
      greet: k => k.z(4) ? `Tools. You make one once and use it forever. That's a function, and that's also my whole shop: come buy upgrades for Bolt, or craft something worth selling.` : `Workshop opens after the fog bridge. Odo decides who crosses, not me.`,
      topics: [
        { q: "What's a function?", a: () => `<code>def step():</code> and indent the moves. Now <code>step()</code> does all of them. Give it a parameter, <code>def walk(n):</code>, and it does n of them. Some of my missions refuse to run without a <code>def</code>: that's the point.` },
        { q: "What do the upgrades do?", a: () => RPG.GEAR.map(g => `${g.icon} <b>${g.name}</b>: ${g.desc} (${RPG.state.gear[g.id] ? "you own it" : "🪙 " + g.cost})`).join("<br>"), tab: "workshop" },
        { q: "Can I build a robot?", a: () => Bots.crew.length ? `You've got ${Bots.crew.length === 1 ? "one" : Bots.crew.length}. Every shift they work, you get better at Robotics, and I've got upgrades for each of them: bigger baskets, batteries, wheels, rods. Write them a function and they'll work all night.` : `Built one already, just needs a brain. It's at the Bot Dock past Dad's house, east of the pier. You write its program in Python, it does the work: fishing, picking, digging, selling. Even while you're away.`, dock: true },
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
        { q: "Tell me about my island", a: () => Home.unlocked() ? `${Home.islandName()}: ten squares by ten. You don't build it by hand. You write it. The blueprint is a program, and the island is whatever the program says, so a loop gives you a whole row of fences in one line. Run it, look at the plan, build it. Change the code later and you only pay for what's different. Sail out past the horizon and the current will ask where you're going.` : `Get your harbor papers from Marisol first. Then we'll talk about land.` },
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
    juno: {
      greet: () => `Welcome to the Trading Post! Marisol's my aunt: she runs the harbor, I run the haggling. Sell here, buy here, and ask me how prices work.`,
      topics: [
        { q: "Why do prices drop when I sell a lot?", a: () => `Supply and demand. If you dump forty apples on me in one go, apples get cheap, because now I have forty apples. Spread your selling over different goods and different days, and prices bounce back by tomorrow.`, tab: "market" },
        { q: "How do I make more coins?", a: () => `Buy low, craft, sell high. Three apples are worth about twelve coins, one cider is twenty-two. A prism is worth more than the two gems and the lens that made it. That's what the 🔧 Workshop is for.` },
        { q: "Anything fun to spend time on?", a: () => `Twenty golden gears are hidden round Harbor Town, the 🏁 Rally pays medals, and old Gully swears there are treasure chests on Gull Isle. Take your boat from the end of the pier and sail south till the harbor disappears.` },
      ],
    },
    gully: {
      greet: () => `Ahoy! A robot in a boat. Nobody sails out to Gull Isle. I washed up here forty years ago and never found a reason to leave.`,
      topics: [
        { q: "What is this place?", a: () => `The stone circle is older than the lighthouse. Whoever built it liked patterns: six stones, evenly spaced, one gap facing the sea. A loop in stone, if you ask me.` },
        { q: "Treasure?", a: () => `Five chests from the wreck of the old <i>Maybe</i>, scattered round the island, and ten golden gears that the gulls keep stealing and dropping. A careful robot would check every corner. A clever one would write <code>while chests_left &gt; 0:</code>.` },
        { q: "How do I get home?", a: () => `Board your boat at the post on the pier and sail away from the island, any way you like. Keep going and the current carries you back to Harbor Town.` },
        { q: "Are there fish out here?", a: () => `The best in the sea. Swordfish come right up to my pier, but they won't look at a hook until you're Fishing level five. Golden koi turn up now and then, and more often out here than in the harbor. Wait for the big splash, then tap in the green. Don't rush it.` },
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
    api.showModal(h); if (window.Render3D) Render3D.roam.talking(id);
    $("modalBody").querySelectorAll("button[data-t]").forEach(b => b.onclick = () => { const t = d.topics[b.dataset.t]; api.sfx("click"); const a = t.a(k); talk(id, a + (t.go ? ` <button class="small primary" id="goLvl">Go to ${t.go(k)}</button>` : "") + (t.tab ? ` <button class="small" id="goTab">Open the ${t.tab}</button>` : "") + (t.dock ? ` <button class="small primary" id="goDock">🤖 Open the Bot Dock</button>` : "")); if ($("goDock")) $("goDock").onclick = () => Bots.hq(); if ($("goLvl")) $("goLvl").onclick = () => { api.hideModal(); api.openLevel(LEVEL_BY_ID[t.go(k)]); }; if ($("goTab")) $("goTab").onclick = () => { api.hideModal(); api.openTown(t.tab); }; });
    const w = $("modalBody").querySelector("button[data-work]"); if (w) w.onclick = () => work(id);
    $("closeBtn").onclick = () => { api.hideModal(); chat = []; if (window.Render3D) Render3D.roam.talking(null); };
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

  return { init, open, close, pressE: interactNear, enterRoom, leaveRoom, photo, rebuildIsland, get room() { return room; }, get island() { return island; }, get active() { return active; }, PROPS, TOWN, GULL, TOWNS, INTERIORS };
})();
window.Hub = Hub;
