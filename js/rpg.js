// Harbor Town: the RuneScape layer. Skills that level by coding, loot from the robot's own actions,
// a market whose prices move, a workshop that crafts goods and sells upgrades that change what the
// robot can do, paint jobs, a quest board with NPC missions and daily contracts.
// State lives in save.rpg (so export/import in Settings carries it). Pure game logic + the Town screen.

const RPG = (() => {
  const $ = (id) => document.getElementById(id);
  let save, api, S; // api = { persist, sfx, toast, zoneUnlocked, levelUnlocked, openLevel, completed() }

  // ---------- tables ----------
  const SKILLS = [
    { id: "commands", name: "Commands", icon: "🦾", zone: 1, how: "Lighthouse Rock levels" },
    { id: "loops", name: "Loops", icon: "🔁", zone: 2, how: "Orchard levels" },
    { id: "logic", name: "Logic", icon: "🧭", zone: 3, how: "Fog Bridge levels" },
    { id: "functions", name: "Functions", icon: "🧰", zone: 4, how: "Workshop levels" },
    { id: "git", name: "Git", icon: "⏳", zone: 5, how: "Time Tower levels and every commit you make there" },
    { id: "review", name: "Review", icon: "🤝", zone: 6, how: "Two-Player Gate levels" },
    { id: "ai", name: "AI", icon: "🔮", zone: 7, how: "Oracle levels" },
    { id: "js", name: "JavaScript", icon: "🪞", zone: 8, how: "Mirror Sea levels" },
    { id: "fishing", name: "Fishing", icon: "🎣", zone: 0, how: "casting a line at a fishing spot in town or on Gull Isle" },
  ];
  const GOODS = {
    apple: { name: "Apple", icon: "🍎", base: 4, from: "picked up in the Orchard" },
    gem: { name: "Gem", icon: "💎", base: 30, from: "picked up anywhere you find one" },
    lens: { name: "Lens", icon: "🔍", base: 25, from: "picked up on Lighthouse Rock" },
    scrap: { name: "Scrap gear", icon: "⚙️", base: 6, from: "keys you use, and Lighthouse / Gate missions" },
    stone: { name: "Fog stone", icon: "🪨", base: 5, from: "finishing Fog Bridge missions" },
    plank: { name: "Plank", icon: "🪵", base: 8, from: "finishing Workshop missions" },
    shard: { name: "Time shard", icon: "⏳", base: 20, from: "every commit in the Time Tower" },
    ink: { name: "Oracle ink", icon: "🖋️", base: 15, from: "finishing Oracle missions" },
    glass: { name: "Mirror glass", icon: "🪞", base: 18, from: "finishing Mirror Sea missions" },
    sardine: { name: "Sardine", icon: "🐟", base: 3, from: "caught off the pier", fish: true },
    mackerel: { name: "Mackerel", icon: "🐟", base: 7, from: "caught off the pier", fish: true },
    bass: { name: "Sea bass", icon: "🐠", base: 13, from: "caught at Fishing 2", fish: true },
    salmon: { name: "Salmon", icon: "🍣", base: 20, from: "caught at Fishing 3", fish: true },
    koi: { name: "Golden koi", icon: "🐡", base: 85, from: "a rare catch from Fishing 4", fish: true },
    swordfish: { name: "Swordfish", icon: "🗡️", base: 48, from: "caught off Gull Isle at Fishing 5", fish: true },
    cider: { name: "Cider", icon: "🍺", base: 22, from: "crafted in the Workshop from apples", crafted: true },
    prism: { name: "Prism", icon: "🔺", base: 130, from: "crafted from gems and a lens", crafted: true },
    crate: { name: "Crate", icon: "📦", base: 60, from: "crafted from planks and scrap", crafted: true },
    clockstone: { name: "Clockstone", icon: "🕰️", base: 95, from: "crafted from fog stone and a time shard", crafted: true },
    stew: { name: "Fish stew", icon: "🍲", base: 34, from: "cooked in the Workshop from sardines and mackerel", crafted: true },
  };
  const BASIC = Object.keys(GOODS).filter(g => !GOODS[g].crafted && !GOODS[g].fish); // fish come from fishing, not missions
  const ZONE_DROP = { 1: ["scrap", 1, 3], 2: ["apple", 2, 4], 3: ["stone", 2, 5], 4: ["plank", 2, 5], 5: ["shard", 1, 3], 6: ["scrap", 2, 4], 7: ["ink", 2, 4], 8: ["glass", 2, 5] };
  const RECIPES = [
    { id: "cider", out: "cider", inp: { apple: 3 }, req: ["loops", 3] },
    { id: "crate", out: "crate", inp: { plank: 4, scrap: 2 }, req: ["functions", 4] },
    { id: "clockstone", out: "clockstone", inp: { stone: 3, shard: 1 }, req: ["git", 4] },
    { id: "prism", out: "prism", inp: { gem: 2, lens: 1 }, req: ["logic", 8] },
    { id: "stew", out: "stew", inp: { sardine: 3, mackerel: 2 }, req: ["fishing", 3] },
  ];
  const GEAR = [
    { id: "longArm", name: "Long Arm", icon: "🦾", desc: "robot.pick() also grabs the item on the tile ahead.", cost: 150, req: ["commands", 4] },
    { id: "springTreads", name: "Spring Treads", icon: "🦘", desc: "robot.jump() clears two tiles when one is not enough.", cost: 300, mats: { plank: 4 }, req: ["loops", 6] },
    { id: "wideScanner", name: "Wide Scanner", icon: "📡", desc: "robot.scan() returns a list of the next three tiles instead of one.", cost: 250, mats: { prism: 1 }, req: ["logic", 8] },
    { id: "crabShell", name: "Crab Shell", icon: "🛡️", desc: "Survive one crab pinch per run. The crab scuttles off.", cost: 200, mats: { stone: 6 }, req: ["logic", 10] },
    { id: "gemMagnet", name: "Gem Magnet", icon: "🧲", desc: "Every gem you pick up counts double in your backpack.", cost: 400, req: ["functions", 6] },
    { id: "bigPack", name: "Bigger Backpack", icon: "🎒", desc: "Carry 60 of each good instead of 20.", cost: 120 },
    { id: "hugePack", name: "Cargo Hold", icon: "🧳", desc: "Carry 200 of each good.", cost: 600, needs: "bigPack", req: ["git", 4] },
  ];
  const PAINTS = [
    { id: "default", name: "Lighthouse Blue", color: "#3b55c8", cost: 0 },
    { id: "sunset", name: "Sunset Orange", color: "#e8702a", cost: 80 },
    { id: "moss", name: "Moss Green", color: "#4f8a3a", cost: 80 },
    { id: "berry", name: "Berry", color: "#b23a7a", cost: 80 },
    { id: "midnight", name: "Midnight", color: "#1c2240", cost: 150, req: ["logic", 8] },
    { id: "ghost", name: "Ghost White", color: "#e8ecf4", cost: 250, req: ["review", 3] },
    { id: "gold", name: "Gold Plate", color: "#d8a520", cost: 600, req: ["total", 50] },
  ];
  const COSMETICS = {
    hat: [
      { id: "none", name: "No hat", icon: "🤖", cost: 0 },
      { id: "cap", name: "Harbor Cap", icon: "🧢", cost: 60 },
      { id: "propeller", name: "Propeller Beanie", icon: "🚁", cost: 90 },
      { id: "hardhat", name: "Tinker's Hard Hat", icon: "⛑️", cost: 120, req: ["functions", 4] },
      { id: "antlers", name: "Antlers", icon: "🦌", cost: 150 },
      { id: "lantern", name: "Fog Lantern", icon: "🏮", cost: 200, req: ["logic", 6] },
      { id: "halo", name: "Halo", icon: "😇", cost: 400, req: ["total", 40] },
      { id: "straw", name: "Pip's Straw Hat", icon: "👒", quest: "Orchard Perfect" },
      { id: "pirate", name: "Captain's Tricorn", icon: "🏴‍☠️", quest: "Bilingual" },
      { id: "wizard", name: "Oracle's Hood", icon: "🧙", quest: "Real Voice" },
      { id: "crown", name: "Keeper's Crown", icon: "👑", quest: "Keeper of the Light" },
    ],
    eyes: [
      { id: "cyan", name: "Cyan", icon: "🔵", color: "#5de0ff", cost: 0 },
      { id: "white", name: "Headlamp White", icon: "⚪", color: "#ffffff", cost: 60 },
      { id: "green", name: "Orchard Green", icon: "🟢", color: "#5fff8a", cost: 80 },
      { id: "gold", name: "Lighthouse Gold", icon: "🟡", color: "#ffd24a", quest: "Island Hopper" },
      { id: "violet", name: "Timeline Violet", icon: "🟣", color: "#c57bff", quest: "Fifty Commits" },
      { id: "red", name: "Mirror Red", icon: "🔴", color: "#ff5a5a", quest: "Glass Trader" },
    ],
    trail: [
      { id: "none", name: "No trail", icon: "·", cost: 0 },
      { id: "sparkle", name: "Gold Sparkle", icon: "✨", color: "#ffd866", cost: 100 },
      { id: "hearts", name: "Hearts", icon: "💗", color: "#ff7bb0", cost: 120 },
      { id: "bubbles", name: "Sea Bubbles", icon: "🫧", color: "#7fd3ff", quest: "Fog Walker" },
      { id: "leaves", name: "Orchard Leaves", icon: "🍃", color: "#7fd36a", quest: "Apple Baron" },
      { id: "embers", name: "Oracle Embers", icon: "🔥", color: "#ff8a3d", quest: "Memory" },
      { id: "stars", name: "Time Stars", icon: "🌟", color: "#c9a7ff", quest: "Time Merchant" },
    ],
  };
  const COS_NAMES = { hat: "Hats", eyes: "Eyes", trail: "Trails" };
  const NPC = {
    marisol: { name: "Marisol, Harbor Master", icon: "⚓" }, pip: { name: "Old Pip, Orchard Keeper", icon: "🧑‍🌾" }, odo: { name: "Odo the Ferryman", icon: "🛶" },
    wrenna: { name: "Wrenna the Tinker", icon: "🔧" }, clock: { name: "The Clockwright", icon: "🕰️" }, dad: { name: "Dad", icon: "🧔" }, oracle: { name: "The Oracle", icon: "🔮" }, nyx: { name: "Captain Nyx", icon: "🏴‍☠️" },
    juno: { name: "Juno, Trader", icon: "🧺" }, gully: { name: "Old Gully, Castaway", icon: "🦜" },
  };
  const QUESTS = [
    { id: "papers", npc: "marisol", title: "Harbor Papers", story: "Nobody trades in my harbor until I've seen them drive. Walk Bolt round the corner and bring me a lens from the rocks.", steps: [{ type: "complete", level: "1-2" }, { type: "gather", good: "lens", n: 1 }], reward: { coins: 40, xp: { commands: 60 } } },
    { id: "light", npc: "marisol", title: "A Lens for the Light", after: "papers", story: "The lighthouse takes two lenses and the sea took both. Replay the rocks; the lens grows back. (Everything you pick up is yours to keep or sell.)", steps: [{ type: "gather", good: "lens", n: 2 }, { type: "sell", coins: 10 }], reward: { coins: 90, xp: { commands: 90 } } },
    { id: "appledebt", npc: "pip", title: "Pip's Apple Debt", zone: 2, story: "I owe the harbor twelve apples and my back's gone. Your robot doesn't have a back. A loop will do it in a line or two.", steps: [{ type: "gather", good: "apple", n: 12 }], reward: { coins: 120, xp: { loops: 150 } } },
    { id: "cider", npc: "pip", title: "Cider Season", after: "appledebt", story: "Apples are four coins. Cider is twenty-two. That's the whole secret of the Workshop.", steps: [{ type: "craft", good: "cider", n: 3 }, { type: "sell", coins: 80 }], reward: { coins: 200, xp: { loops: 200 } } },
    { id: "lanterns", npc: "odo", title: "Fog Lanterns", zone: 3, story: "The bridge posts need fog stone, and I only ferry people who can cross without looking. Three stars on the third crossing.", steps: [{ type: "par", level: "3-3" }, { type: "gather", good: "stone", n: 6 }], reward: { coins: 180, xp: { logic: 200 } } },
    { id: "crabs", npc: "odo", title: "Crab Insurance", after: "lanterns", story: "Wrenna sells a shell that laughs at crabs. Buy one, then show me the far crossing.", steps: [{ type: "gear", id: "crabShell" }, { type: "complete", level: "3-5" }], reward: { coins: 250, xp: { logic: 220 } } },
    { id: "order", npc: "wrenna", title: "Tinker's Order", zone: 4, story: "Eight planks and one crate, built properly. A function is a tool you make once; a crate is the same idea in wood.", steps: [{ type: "gather", good: "plank", n: 8 }, { type: "craft", good: "crate", n: 1 }], reward: { coins: 220, xp: { functions: 220 } } },
    { id: "prism", npc: "wrenna", title: "The Prism", after: "order", story: "Two gems and a lens make a prism; a prism makes a scanner that sees three tiles. Build both.", steps: [{ type: "craft", good: "prism", n: 1 }, { type: "gear", id: "wideScanner" }], reward: { coins: 300, xp: { functions: 250 }, paint: "midnight" } },
    { id: "shards", npc: "clock", title: "Shards of Yesterday", zone: 5, story: "Every commit leaves a shard of the moment behind. Bring me five, and make ten commits while you're in there. Small ones. Often.", steps: [{ type: "commits", n: 10 }, { type: "gather", good: "shard", n: 5 }], reward: { coins: 300, xp: { git: 300 } } },
    { id: "eyes", npc: "dad", title: "Second Pair of Eyes", zone: 6, story: "Review my code, then write me a pull request I'd actually approve. Title, what changed, why, and tell me you tested it.", steps: [{ type: "complete", level: "6-2" }, { type: "complete", level: "6-4" }], reward: { coins: 250, xp: { review: 250 }, paint: "ghost" } },
    { id: "ink", npc: "oracle", title: "Ink for the Oracle", zone: 7, story: "A mind needs memory and memory needs ink. Four inkwells, and teach the little bot to remember your name.", steps: [{ type: "gather", good: "ink", n: 4 }, { type: "complete", level: "7-2" }], reward: { coins: 350, xp: { ai: 300 } } },
    { id: "mirror", npc: "nyx", title: "Mirror Trade", zone: 8, story: "Same robot, same sea, different language. Ten panes of mirror glass, and prove you can run a shop: five hundred coins earned, lifetime.", steps: [{ type: "gather", good: "glass", n: 10 }, { type: "sell", coins: 500 }], reward: { coins: 500, xp: { js: 300 } } },
    { id: "merchant", npc: "marisol", title: "Merchant of the Harbor", after: "light", story: "A thousand coins through my market and forty levels of skill. Then you're not a castaway, you're a merchant.", steps: [{ type: "sell", coins: 1000 }, { type: "total", level: 40 }], reward: { coins: 400, title: "Merchant" } },
    { id: "builder", npc: "wrenna", title: "Master Builder", after: "prism", story: "Own every upgrade I make and I'll put your name on the workshop door.", steps: [{ type: "gear", id: "longArm" }, { type: "gear", id: "springTreads" }, { type: "gear", id: "wideScanner" }, { type: "gear", id: "crabShell" }, { type: "gear", id: "gemMagnet" }], reward: { coins: 1000, title: "Master Builder", paint: "gold" } },
    // ---- second wave: the long game ----
    { id: "stars5", npc: "marisol", title: "Three Stars Over the Harbor", after: "papers", story: "Anyone can finish a mission. Finishing it in the fewest lines is the craft. Show me five perfect runs.", steps: [{ type: "stars", n: 5 }], reward: { coins: 150, cos: "hat:cap" } },
    { id: "contracts3", npc: "marisol", title: "Contract Worker", after: "papers", story: "The board posts three contracts a day. Do three and I'll know you come back.", steps: [{ type: "contracts", n: 3 }], reward: { coins: 200, xp: { commands: 80 } } },
    { id: "saver", npc: "marisol", title: "Harbor Bank", after: "light", story: "Spending is easy. Hold five hundred coins at once without spending them and you've learned the harder thing.", steps: [{ type: "coins", n: 500 }], reward: { coins: 100, title: "Saver" } },
    { id: "hopper", npc: "marisol", title: "Island Hopper", zone: 4, story: "Four islands lit from end to end: the rock, the orchard, the bridge and the workshop. Then your eyes get the lighthouse gold.", steps: [{ type: "zonedone", zone: 1 }, { type: "zonedone", zone: 2 }, { type: "zonedone", zone: 3 }, { type: "zonedone", zone: 4 }], reward: { coins: 400, cos: "eyes:gold" } },
    { id: "grind10", npc: "marisol", title: "Daily Grind", after: "contracts3", story: "Ten contracts. That's two weeks of showing up. Merchants are made of showing up.", steps: [{ type: "contracts", n: 10 }], reward: { coins: 500, xp: { commands: 150 } } },
    { id: "keeper", npc: "marisol", title: "Keeper of the Light", zone: 8, story: "Every island. Every mission. When the last portal goes quiet, the lighthouse is yours, and so is the crown.", steps: [{ type: "zonedone", zone: 5 }, { type: "zonedone", zone: 6 }, { type: "zonedone", zone: 7 }, { type: "zonedone", zone: 8 }, { type: "missions", n: 35 }], reward: { coins: 1500, cos: "hat:crown", title: "Keeper of the Light" } },
    { id: "baron", npc: "pip", title: "Apple Baron", after: "cider", story: "Forty apples. Not for me; for the whole harbor. Your loop doesn't get tired. Neither does the market, sadly for the price.", steps: [{ type: "gather", good: "apple", n: 40 }], reward: { coins: 300, xp: { loops: 250 }, cos: "trail:leaves" } },
    { id: "orchardperfect", npc: "pip", title: "Orchard Perfect", after: "appledebt", story: "Every orchard mission in par lines or fewer. Then you get my hat, and I'll finally sit down.", steps: [{ type: "zonestars", zone: 2 }], reward: { coins: 350, xp: { loops: 300 }, cos: "hat:straw" } },
    { id: "replay20", npc: "pip", title: "Practice Makes Loops", zone: 2, story: "Twenty runs to the end, any missions. Replays count. The first time you do a thing you learn it; the twentieth you own it.", steps: [{ type: "runs", n: 20 }], reward: { coins: 120, xp: { loops: 120 } } },
    { id: "fogwalker", npc: "odo", title: "Fog Walker", zone: 3, story: "All five crossings. When you can do the bridge without seeing it, the sea leaves bubbles where you walk.", steps: [{ type: "zonedone", zone: 3 }], reward: { coins: 250, xp: { logic: 250 }, cos: "trail:bubbles" } },
    { id: "gemdiver", npc: "odo", title: "Gem Diver", zone: 3, story: "Gems hide in the fog. Six of them, and keep them, don't sell them; Wrenna will want two for a prism.", steps: [{ type: "gather", good: "gem", n: 6 }], reward: { coins: 300, xp: { logic: 150 } } },
    { id: "mason", npc: "odo", title: "Stone Mason", zone: 5, story: "Fog stone and a time shard make a clockstone. Two of them and the bridge posts stop sinking.", steps: [{ type: "craft", good: "clockstone", n: 2 }], reward: { coins: 400, xp: { logic: 200 }, cos: "eyes:green" } },
    { id: "spring", npc: "wrenna", title: "Spring in Your Step", zone: 4, story: "Spring Treads. Two tiles in one jump. Buy them and clear the long gap on the fifth crossing.", steps: [{ type: "gear", id: "springTreads" }, { type: "complete", level: "3-5" }], reward: { coins: 200, xp: { functions: 150 } } },
    { id: "magnet", npc: "wrenna", title: "Magnetic Personality", zone: 4, story: "The Gem Magnet doubles every gem you lift. Pays for itself in a week. Buy it and bring me four gems to prove it.", steps: [{ type: "gear", id: "gemMagnet" }, { type: "gather", good: "gem", n: 4 }], reward: { coins: 300, xp: { functions: 150 } } },
    { id: "cratecompany", npc: "wrenna", title: "Crate Company", after: "order", story: "Five crates built, three hundred coins through the market. That's a business, not a hobby. Hard hat's yours.", steps: [{ type: "craft", good: "crate", n: 5 }, { type: "sell", coins: 300 }], reward: { coins: 350, xp: { functions: 200 }, cos: "hat:hardhat" } },
    { id: "toolbelt", npc: "wrenna", title: "Full Toolbelt", zone: 4, story: "Functions to level ten. Make tools, use tools, until it's boring. Boring is the goal.", steps: [{ type: "skill", skill: "functions", level: 10 }], reward: { coins: 500, xp: { functions: 100 } } },
    { id: "commits50", npc: "clock", title: "Fifty Commits", after: "shards", story: "Fifty moments saved. Small ones. People who commit in fifties never lose a day's work again, and they see time in violet.", steps: [{ type: "commits", n: 50 }], reward: { coins: 600, xp: { git: 400 }, cos: "eyes:violet" } },
    { id: "timemerchant", npc: "clock", title: "Time Merchant", after: "shards", story: "Ten shards in your pack at once. Don't sell them the moment they drop; let them pile up and you'll see the stars.", steps: [{ type: "gather", good: "shard", n: 10 }], reward: { coins: 300, xp: { git: 200 }, cos: "trail:stars" } },
    { id: "branchkeeper", npc: "clock", title: "Branch Keeper", zone: 5, story: "Every Tower mission: commit, checkout, branch, merge, a conflict resolved, a push after a pull. Then you've been a time traveler.", steps: [{ type: "zonedone", zone: 5 }], reward: { coins: 400, xp: { git: 300 }, title: "Time Traveler" } },
    { id: "reviewer", npc: "dad", title: "Reviewer's Eye", zone: 6, story: "Review until it's a reflex. Review skill five.", steps: [{ type: "skill", skill: "review", level: 5 }], reward: { coins: 250, xp: { review: 150 } } },
    { id: "shipit", npc: "dad", title: "Ship It", zone: 6, story: "All four Gate missions, and I'll stop hovering. Mostly.", steps: [{ type: "zonedone", zone: 6 }], reward: { coins: 300, xp: { review: 300 }, title: "Dad's Approval" } },
    { id: "memory", npc: "oracle", title: "Memory", zone: 7, story: "…a bot that forgets is a parrot. AI skill five and your trail will glow like my embers.", steps: [{ type: "skill", skill: "ai", level: 5 }, { type: "complete", level: "7-2" }], reward: { coins: 300, xp: { ai: 200 }, cos: "trail:embers" } },
    { id: "realvoice", npc: "oracle", title: "Real Voice", zone: 7, story: "…connect a model running on your own machine and write its personality. Then wear my hood.", steps: [{ type: "complete", level: "7-3" }], reward: { coins: 500, xp: { ai: 400 }, cos: "hat:wizard", title: "Mindmaker" } },
    { id: "bilingual", npc: "nyx", title: "Bilingual", zone: 8, story: "Every Mirror Sea mission in JavaScript. Then you're a polyglot and you get the hat. The hat is non-negotiable.", steps: [{ type: "zonedone", zone: 8 }], reward: { coins: 500, xp: { js: 400 }, cos: "hat:pirate", title: "Polyglot" } },
    { id: "glasstrader", npc: "nyx", title: "Glass Trader", after: "mirror", story: "Two thousand coins through the market, lifetime. Buy low, craft, sell on a HOT day. Red eyes for a real trader.", steps: [{ type: "sell", coins: 2000 }], reward: { coins: 800, xp: { js: 200 }, cos: "eyes:red" } },
    { id: "captain", npc: "nyx", title: "Captain's Favor", zone: 8, story: "Total level eighty. Every skill pulling its weight. Then you outrank me, and I'll say so.", steps: [{ type: "total", level: 80 }], reward: { coins: 1000, title: "Captain" } },
  ];

  // ---------- state ----------
  const fresh = () => ({ coins: 25, inv: {}, xp: {}, gear: {}, paints: { default: true }, paint: "default", cos: { hat: { owned: { none: true }, on: "none" }, eyes: { owned: { cyan: true }, on: "cyan" }, trail: { owned: { none: true }, on: "none" } }, quests: {}, titles: [], runsToday: {},
    stats: { runs: 0, commits: 0, sold: 0, soldToday: 0, crafted: {} }, market: { flood: {} }, daily: { date: "", tasks: [], done: {}, hot: "" } });
  function init(saveObj, apiObj) {
    save = saveObj; api = apiObj; if (!save.rpg) save.rpg = fresh(); S = save.rpg; const f = fresh(); for (const k in f) if (S[k] === undefined) S[k] = f[k];
    if (!S.seeded) { // a save from before Harbor Town existed: credit skill XP for missions already finished
      for (const id in save.completed || {}) { const lv = LEVEL_BY_ID[id]; if (lv) addXp(skillOf(lv.zone).id, lv.xp * 2); }
      S.seeded = true; persist();
    }
    daily(); hud();
  }
  const persist = () => api.persist();
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }

  // ---------- skills ----------
  const xpTo = (L) => Math.floor(25 * Math.pow(L - 1, 1.5));
  function skillLevel(id) { const xp = S.xp[id] || 0; let l = 1; while (l < 99 && xp >= xpTo(l + 1)) l++; return l; }
  const totalLevel = () => SKILLS.reduce((a, s) => a + skillLevel(s.id), 0);
  function addXp(id, n) { S.xp[id] = (S.xp[id] || 0) + n; }
  const skillOf = (zone) => SKILLS[(zone || 1) - 1];
  function meets(req) { if (!req) return true; const [k, v] = req; return (k === "total" ? totalLevel() : skillLevel(k)) >= v; }
  function reqText(req) { if (!req) return ""; const [k, v] = req; return k === "total" ? `total level ${v}` : `${SKILLS.find(s => s.id === k).name} ${v}`; }

  // ---------- inventory ----------
  const cap = () => S.gear.hugePack ? 200 : S.gear.bigPack ? 60 : 20;
  const have = (g) => S.inv[g] || 0;
  function add(g, n) { const room = Math.max(0, cap() - have(g)); const k = Math.min(room, n); S.inv[g] = have(g) + k; return k; }
  function take(g, n) { if (have(g) < n) return false; S.inv[g] -= n; if (!S.inv[g]) delete S.inv[g]; return true; }
  const gname = (g, n) => `${GOODS[g].icon} ${n !== undefined ? n + " " : ""}${GOODS[g].name}${n !== undefined && n !== 1 && !GOODS[g].fish ? "s" : ""}`.replace("Mirror glasss", "Mirror glass").replace("Fog stones", "Fog stone");

  // ---------- market ----------
  let extraFlood = null; // the whole family's sales today, from the family server
  function setExtraFlood(f) { extraFlood = f || null; }
  function daily() {
    const d = today();
    if (S.daily.date !== d) {
      const r = rng("contracts" + d); const open = BASIC.filter(g => zoneOf(g) <= highestZone());
      const tasks = [];
      const g1 = open[Math.floor(r() * open.length)] || "lens"; const n1 = 3 + Math.floor(r() * 6); tasks.push({ type: "gather", good: g1, n: n1, reward: Math.round(n1 * GOODS[g1].base * 1.6 + 15) });
      const robotLevels = LEVELS.filter(l => l.mode === "robot" && api.levelUnlocked(l)); const lv = robotLevels[Math.floor(r() * robotLevels.length)] || LEVELS[0]; tasks.push({ type: "run", level: lv.id, reward: 30 + lv.xp });
      const c = 30 + Math.floor(r() * 5) * 15; tasks.push({ type: "sellToday", coins: c, reward: Math.round(c * 0.5 + 20) });
      S.daily = { date: d, tasks, done: {}, hot: open[Math.floor(r() * open.length)] || "apple" };
      S.market.flood = {}; S.runsToday = {}; S.stats.soldToday = 0; persist();
    }
    return S.daily;
  }
  const zoneOf = (g) => ({ lens: 1, scrap: 1, apple: 2, gem: 2, stone: 3, plank: 4, shard: 5, ink: 7, glass: 8 })[g] || 1;
  function highestZone() { let z = 1; for (let n = 1; n <= 8; n++) if (api.zoneUnlocked(n)) z = n; return z; }
  function price(g) { const d = daily(); const r = rng(d.date + g)(); const hot = d.hot === g ? 1.4 : 1; const flood = Math.max(S.market.flood[g] || 0, (extraFlood && extraFlood[g]) || 0); return Math.max(1, Math.round(GOODS[g].base * (0.75 + 0.5 * r) * hot * Math.max(0.35, 1 - 0.02 * flood))); }
  const buyPrice = (g) => Math.round(price(g) * 1.5) + 1;
  function sell(g, n) {
    n = Math.min(n, have(g)); if (n <= 0) return 0; let got = 0;
    for (let i = 0; i < n; i++) { got += price(g); S.market.flood[g] = (S.market.flood[g] || 0) + 1; }
    take(g, n); S.coins += got; S.stats.sold += got; S.stats.soldToday += got; persist(); hud(); if (window.Family) Family.sold(g, n, got); return got;
  }
  function buy(g, n) { const p = buyPrice(g); if (S.coins < p * n || have(g) + n > cap()) return false; S.coins -= p * n; add(g, n); persist(); hud(); return true; }

  // ---------- workshop ----------
  function canCraft(r) { return meets(r.req) && Object.keys(r.inp).every(g => have(g) >= r.inp[g]) && have(r.out) < cap(); }
  function craft(r) { if (!canCraft(r)) return false; for (const g in r.inp) take(g, r.inp[g]); add(r.out, 1); S.stats.crafted[r.out] = (S.stats.crafted[r.out] || 0) + 1; addXp(r.req[0], 12); persist(); hud(); return true; }
  function canBuyGear(g) { return !S.gear[g.id] && meets(g.req) && (!g.needs || S.gear[g.needs]) && S.coins >= g.cost && Object.keys(g.mats || {}).every(m => have(m) >= g.mats[m]); }
  function buyGear(g) { if (!canBuyGear(g)) return false; S.coins -= g.cost; for (const m in g.mats || {}) take(m, g.mats[m]); S.gear[g.id] = true; persist(); hud(); return true; }
  function buyPaint(p) { if (S.paints[p.id]) { S.paint = p.id; persist(); return true; } if (!meets(p.req) || S.coins < p.cost) return false; S.coins -= p.cost; S.paints[p.id] = true; S.paint = p.id; persist(); hud(); return true; }
  const paintColor = () => (PAINTS.find(p => p.id === S.paint) || PAINTS[0]).color;
  function cosItem(cat, id) { return COSMETICS[cat].find(c => c.id === id) || COSMETICS[cat][0]; }
  function wearCos(cat, id) { const c = cosItem(cat, id), st = S.cos[cat]; if (st.owned[id]) { st.on = id; persist(); return true; } if (c.quest || !meets(c.req) || S.coins < c.cost) return false; S.coins -= c.cost; st.owned[id] = true; st.on = id; persist(); hud(); return true; }
  function look() { return { paint: paintColor(), hat: S.cos.hat.on, eyes: cosItem("eyes", S.cos.eyes.on).color, trail: S.cos.trail.on === "none" ? null : cosItem("trail", S.cos.trail.on).color }; }
  const gear = () => ({ longArm: !!S.gear.longArm, springTreads: !!S.gear.springTreads, wideScanner: !!S.gear.wideScanner, crabShell: !!S.gear.crabShell });

  // ---------- quests ----------
  function available(q) { if (S.quests[q.id]) return false; if (q.zone && !api.zoneUnlocked(q.zone)) return false; if (q.after && !S.quests[q.after]) return false; return true; }
  function stepState(st) {
    const lv = st.level && LEVEL_BY_ID[st.level];
    switch (st.type) {
      case "complete": return { done: !!api.completed()[st.level], text: `Finish ${st.level} ${lv ? lv.title : ""}`, go: st.level };
      case "par": { const c = api.completed()[st.level]; return { done: !!c && c.stars === 3, text: `Three stars on ${st.level} ${lv.title} (${lv.par} lines or fewer)`, go: st.level }; }
      case "gather": return { done: have(st.good) >= st.n, text: `Bring ${gname(st.good, st.n)} (${Math.min(have(st.good), st.n)}/${st.n})` };
      case "craft": { const c = S.stats.crafted[st.good] || 0; return { done: c >= st.n, text: `Craft ${gname(st.good, st.n)} (${Math.min(c, st.n)}/${st.n})` }; }
      case "sell": return { done: S.stats.sold >= st.coins, text: `Earn ${st.coins} coins at the market, lifetime (${Math.min(S.stats.sold, st.coins)}/${st.coins})` };
      case "skill": return { done: skillLevel(st.skill) >= st.level, text: `Reach ${reqText([st.skill, st.level])}` };
      case "total": return { done: totalLevel() >= st.level, text: `Reach total level ${st.level} (now ${totalLevel()})` };
      case "gear": { const g = GEAR.find(x => x.id === st.id); return { done: !!S.gear[st.id], text: `Own the ${g.icon} ${g.name}` }; }
      case "stars": { const n = Object.values(api.completed()).filter(c => c.stars === 3).length; return { done: n >= st.n, text: `Earn three stars on ${st.n} missions (${Math.min(n, st.n)}/${st.n})` }; }
      case "zonedone": { const zl = LEVELS.filter(l => l.zone === st.zone && !l.optional); const d = zl.filter(l => api.completed()[l.id]).length; return { done: d === zl.length, text: `Finish every mission in ${ZONES[st.zone - 1].name} (${d}/${zl.length})` }; }
      case "zonestars": { const zl = LEVELS.filter(l => l.zone === st.zone && !l.optional && l.par); const d = zl.filter(l => api.completed()[l.id] && api.completed()[l.id].stars === 3).length; return { done: d === zl.length, text: `Three stars on every ${ZONES[st.zone - 1].name} mission (${d}/${zl.length})` }; }
      case "coins": return { done: S.coins >= st.n, text: `Hold ${st.n} coins at once (${Math.min(S.coins, st.n)}/${st.n})` };
      case "contracts": return { done: (S.stats.contracts || 0) >= st.n, text: `Complete ${st.n} daily contracts (${Math.min(S.stats.contracts || 0, st.n)}/${st.n})` };
      case "missions": { const n = Object.keys(api.completed()).length; return { done: n >= st.n, text: `Finish ${st.n} missions in total (${Math.min(n, st.n)}/${st.n})` }; }
      case "runs": return { done: S.stats.runs >= st.n, text: `Run ${st.n} missions to the end, replays count (${Math.min(S.stats.runs, st.n)}/${st.n})` };
      case "commits": return { done: S.stats.commits >= st.n, text: `Make ${st.n} commits in the Time Tower (${Math.min(S.stats.commits, st.n)}/${st.n})` };
    }
    return { done: false, text: "?" };
  }
  function turnIn(q) {
    if (!q.steps.every(s => stepState(s).done)) return false;
    for (const s of q.steps) if (s.type === "gather") take(s.good, s.n);
    const r = q.reward; S.coins += r.coins || 0; for (const k in r.xp || {}) addXp(k, r.xp[k]);
    if (r.paint) S.paints[r.paint] = true; if (r.title && !S.titles.includes(r.title)) S.titles.push(r.title);
    if (r.cos) { const [cat, id] = r.cos.split(":"); S.cos[cat].owned[id] = true; }
    S.quests[q.id] = today(); persist(); hud(); return true;
  }
  function rewardText(r) { const out = []; if (r.coins) out.push(`🪙 ${r.coins}`); for (const k in r.xp || {}) out.push(`${SKILLS.find(s => s.id === k).icon} ${r.xp[k]} ${SKILLS.find(s => s.id === k).name} XP`); if (r.paint) out.push(`🎨 ${PAINTS.find(p => p.id === r.paint).name} paint`); if (r.cos) { const [cat, id] = r.cos.split(":"); const c = cosItem(cat, id); out.push(`${c.icon} ${c.name}`); } if (r.title) out.push(`🏷️ title “${r.title}”`); return out.join(" · "); }
  function contractState(t) {
    if (t.type === "gather") return { done: have(t.good) >= t.n, text: `Deliver ${gname(t.good, t.n)} (${Math.min(have(t.good), t.n)}/${t.n})` };
    if (t.type === "run") { const lv = LEVEL_BY_ID[t.level]; return { done: (S.runsToday[t.level] || 0) > 0, text: `Finish ${t.level} ${lv ? lv.title : ""} today`, go: t.level }; }
    return { done: S.stats.soldToday >= t.coins, text: `Sell ${t.coins} coins of goods today (${Math.min(S.stats.soldToday, t.coins)}/${t.coins})` };
  }
  function claim(i) { const d = daily(); const t = d.tasks[i]; if (!t || d.done[i] || !contractState(t).done) return false; if (t.type === "gather") take(t.good, t.n); S.coins += t.reward; d.done[i] = true; S.stats.contracts = (S.stats.contracts || 0) + 1; persist(); hud(); return true; }

  // ---------- hooks from the game ----------
  function onComplete(level, { first, lines, events }) {
    if (!level || level.id === "custom" || level.sandbox) return "";
    daily(); S.runsToday[level.id] = (S.runsToday[level.id] || 0) + 1; const dim = S.runsToday[level.id] > 5 ? 0.5 : 1;
    const drops = {};
    for (const ev of events || []) if (ev.type === "pick") { const g = { A: "apple", "*": "gem", L: "lens", K: "scrap" }[ev.item]; if (g) drops[g] = (drops[g] || 0) + (g === "gem" && S.gear.gemMagnet ? 2 : 1); }
    const zd = ZONE_DROP[level.zone]; if (zd) drops[zd[0]] = (drops[zd[0]] || 0) + (first ? zd[2] : zd[1]);
    const got = [], lost = [];
    for (const g in drops) { const n = Math.max(1, Math.floor(drops[g] * dim)); const k = add(g, n); if (k) got.push(`${GOODS[g].icon}×${k}`); if (n - k) lost.push(`${n - k} ${GOODS[g].name}`); }
    const sk = skillOf(level.zone); let xp = first ? level.xp * 2 : Math.max(8, Math.round(level.xp * 0.4)); if (level.par && lines && lines <= level.par) xp = Math.round(xp * 1.25);
    const before = skillLevel(sk.id); addXp(sk.id, xp); const after = skillLevel(sk.id);
    let coins = 0; if (first) { coins = level.xp; S.coins += coins; }
    S.stats.runs++; persist(); hud();
    const parts = [];
    if (got.length) parts.push("Loot " + got.join(" ")); parts.push(`+${xp} ${sk.icon} ${sk.name} XP` + (after > before ? ` <b>→ level ${after}!</b>` : ""));
    if (coins) parts.push(`🪙 +${coins} first-time bounty`);
    let html = `<p class="loot">${parts.join(" · ")}</p>`;
    if (lost.length) html += `<p class="loot muted">Backpack full: left behind ${lost.join(", ")}. Sell at the Harbor market or buy a bigger pack.</p>`;
    if (dim < 1) html += `<p class="loot muted">You've run this mission ${S.runsToday[level.id]} times today; drops are halved until tomorrow.</p>`;
    const ready = QUESTS.filter(q => available(q) && q.steps.every(s => stepState(s).done)).length + daily().tasks.filter((t, i) => !daily().done[i] && contractState(t).done).length;
    if (ready) html += `<p class="loot"><b>⚓ ${ready} quest${ready > 1 ? "s" : ""} ready to turn in at Harbor Town.</b></p>`;
    return html;
  }
  function onCommit(n = 1) { daily(); S.stats.commits += n; const k = add("shard", n); addXp("git", 8 * n); persist(); hud(); if (k) api.toast(`⏳ +${k} Time shard · +${8 * n} Git XP`); }

  // ---------- HUD + Town screen ----------
  function hud() { const c = $("coins"); if (c) c.textContent = "🪙 " + S.coins; const t = $("townCoins"); if (t) t.textContent = `🪙 ${S.coins} · total level ${totalLevel()}` + (S.titles.length ? " · " + S.titles[S.titles.length - 1] : ""); }
  let tab = "board";
  function renderTown(t) {
    if (t) tab = t; daily(); hud();
    document.querySelectorAll("#townTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    const body = $("townBody");
    const family = () => { if (window.Family && Family.connected() && !Family.last) Family.sync().then(() => { if (tab === "family") renderTown("family"); }); return window.Family ? Family.render() : ""; };
    body.innerHTML = ({ board, skills, pack, market, workshop, paint, family })[tab]();
  }
  function board() {
    const open = QUESTS.filter(available); const done = QUESTS.filter(q => S.quests[q.id]); const d = daily();
    let h = `<h3>Daily contracts · ${d.date}</h3><p class="muted">New every day. Today's hot item at the market: <b>${gname(d.hot)}</b> (+40%).</p><div class="cards">`;
    d.tasks.forEach((t, i) => { const st = contractState(t); h += `<div class="card ${d.done[i] ? "done" : ""}"><div class="ct">${st.done || d.done[i] ? "✅" : "○"} ${st.text}</div><div class="cr">🪙 ${t.reward}</div>${d.done[i] ? `<span class="muted">claimed</span>` : st.done ? `<button class="primary small" data-act="claim" data-i="${i}">Claim</button>` : st.go ? `<button class="small" data-act="go" data-level="${st.go}">Go</button>` : ""}</div>`; });
    h += `</div><h3>Quest board</h3>`;
    if (!open.length) h += `<p class="muted">No open quests. Unlock more zones on the map.</p>`;
    for (const q of open) {
      const steps = q.steps.map(stepState); const ready = steps.every(s => s.done); const npc = NPC[q.npc];
      h += `<div class="qcard"><div class="qhead"><span class="npc">${npc.icon}</span><div><b>${q.title}</b><div class="muted">${npc.name}</div></div></div><p class="story">“${q.story}”</p><ul class="steps">${steps.map(s => `<li class="${s.done ? "done" : ""}">${s.done ? "✅" : "○"} ${s.text}${!s.done && s.go ? ` <button class="small" data-act="go" data-level="${s.go}">Go</button>` : ""}</li>`).join("")}</ul><div class="toolbar"><span class="muted">Reward: ${rewardText(q.reward)}</span><span class="sp"></span>${ready ? `<button class="primary" data-act="turnin" data-q="${q.id}">Turn in</button>` : ""}</div></div>`;
    }
    if (done.length) h += `<h3>Completed · ${done.length}/${QUESTS.length}</h3><p class="muted">${done.map(q => `${NPC[q.npc].icon} ${q.title}`).join(" · ")}</p>`;
    return h;
  }
  function skills() {
    let h = `<h3>Skills · total level ${totalLevel()}</h3><p class="muted">Every skill levels up by doing the thing: finish a zone's missions (first time pays double; three stars pays 25% more), replay them for more, craft in the Workshop.</p><div class="cards skills">`;
    for (const s of SKILLS) { const L = skillLevel(s.id), xp = S.xp[s.id] || 0, lo = xpTo(L), hi = L < 99 ? xpTo(L + 1) : lo + 1; const pct = Math.min(100, Math.round((xp - lo) / (hi - lo) * 100)); h += `<div class="card skill"><div class="ct"><span class="big">${s.icon}</span> <b>${s.name}</b></div><div class="lvl">${L}</div><div class="bar"><i style="width:${pct}%"></i></div><div class="muted">${xp} XP · ${L < 99 ? hi - xp + " to next" : "max"} · ${s.how}</div></div>`; }
    return h + "</div>";
  }
  function pack() {
    const keys = Object.keys(GOODS).filter(g => have(g));
    let h = `<h3>Backpack · ${cap()} of each</h3>`;
    if (!keys.length) h += `<p class="muted">Empty. Everything Bolt picks up and every mission you finish drops goods here.</p>`;
    h += `<div class="cards">${keys.map(g => `<div class="card"><div class="ct"><span class="big">${GOODS[g].icon}</span> <b>${GOODS[g].name}</b></div><div class="lvl">${have(g)}</div><div class="muted">${GOODS[g].from} · sells for 🪙 ${price(g)}</div></div>`).join("")}</div>`;
    h += `<h3>Where goods come from</h3><p class="muted">${Object.keys(GOODS).map(g => `${GOODS[g].icon} ${GOODS[g].name}: ${GOODS[g].from}`).join(" · ")}</p>`;
    return h;
  }
  function market() {
    const d = daily();
    let h = `<h3>Harbor market</h3><p class="muted">Prices move every day. Sell a lot of one thing and its price drops until tomorrow. Buying costs more than selling (that's the merchant's cut). Lifetime earned: 🪙 ${S.stats.sold}. Today: 🪙 ${S.stats.soldToday}.</p>
      <div class="tablewrap"><table class="goods"><tr><th>Good</th><th>You have</th><th>Sells for</th><th>Buy for</th><th></th></tr>`;
    for (const g in GOODS) {
      const p = price(g), base = GOODS[g].base, trend = p > base * 1.1 ? "▲" : p < base * 0.9 ? "▼" : "•"; const hot = d.hot === g;
      h += `<tr><td>${GOODS[g].icon} ${GOODS[g].name}${hot ? ' <span class="hot">HOT</span>' : ""}</td><td>${have(g)}</td><td><b>🪙 ${p}</b> <span class="muted">${trend}</span></td><td>${GOODS[g].crafted ? "<span class='muted'>craft only</span>" : GOODS[g].fish ? "<span class='muted'>catch only</span>" : "🪙 " + buyPrice(g)}</td>
        <td class="acts">${have(g) ? `<button class="small" data-act="sell" data-g="${g}" data-n="1">Sell 1</button><button class="small" data-act="sell" data-g="${g}" data-n="10">Sell 10</button><button class="small" data-act="sell" data-g="${g}" data-n="999">All</button>` : ""}${!GOODS[g].crafted && !GOODS[g].fish ? `<button class="small" data-act="buy" data-g="${g}" ${S.coins < buyPrice(g) || have(g) >= cap() ? "disabled" : ""}>Buy 1</button>` : ""}</td></tr>`;
    }
    return h + "</table></div>";
  }
  function workshop() {
    let h = `<h3>Crafting</h3><p class="muted">Turn cheap goods into expensive ones. Each recipe needs a skill level; crafting also trains that skill.</p><div class="cards">`;
    for (const r of RECIPES) { const ok = canCraft(r); h += `<div class="card"><div class="ct"><span class="big">${GOODS[r.out].icon}</span> <b>${GOODS[r.out].name}</b> <span class="muted">sells 🪙 ${price(r.out)}</span></div><div class="muted">Needs ${Object.keys(r.inp).map(g => gname(g, r.inp[g]) + " (" + have(g) + ")").join(", ")} · ${reqText(r.req)}</div><div class="toolbar"><button class="small primary" data-act="craft" data-r="${r.id}" ${ok ? "" : "disabled"}>Craft 1</button><button class="small" data-act="craftmax" data-r="${r.id}" ${ok ? "" : "disabled"}>Craft all</button></div></div>`; }
    h += `</div><h3>Upgrades</h3><p class="muted">Upgrades change what <code>robot</code> can do. They work in every level, in Python and JavaScript.</p><div class="cards">`;
    for (const g of GEAR) { const own = !!S.gear[g.id]; const ok = canBuyGear(g); h += `<div class="card ${own ? "done" : ""}"><div class="ct"><span class="big">${g.icon}</span> <b>${g.name}</b></div><div>${g.desc}</div><div class="muted">${own ? "Owned" : `🪙 ${g.cost}${g.mats ? " + " + Object.keys(g.mats).map(m => gname(m, g.mats[m])).join(", ") : ""}${g.req ? " · needs " + reqText(g.req) : ""}${g.needs ? " · after " + GEAR.find(x => x.id === g.needs).name : ""}`}</div>${own ? "" : `<div class="toolbar"><button class="small primary" data-act="gear" data-id="${g.id}" ${ok ? "" : "disabled"}>Buy</button></div>`}</div>`; }
    return h + "</div>";
  }
  function paint() {
    let h = `<h3>Style: paint</h3><p class="muted">Bolt's colour, hat, eyes and trail. Quest rewards unlock the rare ones.</p><div class="cards paints">`;
    for (const p of PAINTS) { const own = !!S.paints[p.id], on = S.paint === p.id; h += `<div class="card ${on ? "done" : ""}"><div class="swatch" style="background:${p.color}"></div><b>${p.name}</b><div class="muted">${own ? (on ? "Wearing" : "Owned") : `🪙 ${p.cost}${p.req ? " · needs " + reqText(p.req) : ""}`}</div><button class="small ${on ? "" : "primary"}" data-act="paint" data-id="${p.id}" ${on || (!own && (!meets(p.req) || S.coins < p.cost)) ? "disabled" : ""}>${own ? "Wear" : "Buy"}</button></div>`; }
    h += "</div>";
    for (const cat of ["hat", "eyes", "trail"]) {
      h += `<h3>${COS_NAMES[cat]}</h3><div class="cards paints">`;
      for (const c of COSMETICS[cat]) {
        const own = !!S.cos[cat].owned[c.id], on = S.cos[cat].on === c.id, can = own || (!c.quest && meets(c.req) && S.coins >= c.cost);
        h += `<div class="card ${on ? "done" : ""}"><div class="ct"><span class="big">${c.icon}</span> <b>${c.name}</b></div><div class="muted">${own ? (on ? "Wearing" : "Owned") : c.quest ? "Reward from the quest “" + c.quest + "”" : `🪙 ${c.cost}${c.req ? " · needs " + reqText(c.req) : ""}`}</div><button class="small ${on ? "" : "primary"}" data-act="cos" data-cat="${cat}" data-id="${c.id}" ${on || !can ? "disabled" : ""}>${own ? "Wear" : "Buy"}</button></div>`;
      }
      h += "</div>";
    }
    return h;
  }
  function click(e) {
    const fb = e.target.closest("button[data-fam]"); if (fb) { Family.click(fb); return; }
    const b = e.target.closest("button[data-act]"); if (!b) return; const a = b.dataset.act; let msg = "";
    if (a === "sell") { const n = sell(b.dataset.g, +b.dataset.n); msg = n ? `Sold for 🪙 ${n}` : ""; api.sfx("gem"); }
    else if (a === "buy") { msg = buy(b.dataset.g, 1) ? "Bought." : "Not enough coins or no room."; api.sfx("click"); }
    else if (a === "craft") { msg = craft(RECIPES.find(r => r.id === b.dataset.r)) ? "Crafted." : "Missing something."; api.sfx("pick"); }
    else if (a === "craftmax") { const r = RECIPES.find(x => x.id === b.dataset.r); let k = 0; while (craft(r)) k++; msg = `Crafted ${k}.`; api.sfx("pick"); }
    else if (a === "gear") { msg = buyGear(GEAR.find(g => g.id === b.dataset.id)) ? "Installed on Bolt." : "Can't buy that yet."; api.sfx("unlock"); }
    else if (a === "paint") { buyPaint(PAINTS.find(p => p.id === b.dataset.id)); api.sfx("click"); }
    else if (a === "cos") { wearCos(b.dataset.cat, b.dataset.id); api.sfx("click"); }
    else if (a === "turnin") { const q = QUESTS.find(q => q.id === b.dataset.q); if (turnIn(q)) { api.sfx("win"); api.toast(`<b>Quest complete: ${q.title}</b>${rewardText(q.reward)}`); } }
    else if (a === "claim") { if (claim(+b.dataset.i)) { api.sfx("win"); msg = "Contract paid."; } }
    else if (a === "go") { api.openLevel(LEVEL_BY_ID[b.dataset.level]); return; }
    if (msg) api.toast(msg);
    renderTown();
  }
  function bind() { $("townBody").addEventListener("click", click); document.querySelectorAll("#townTabs button").forEach(b => b.onclick = () => { api.sfx("click"); renderTown(b.dataset.tab); }); }

  function questsFor(npc) { return QUESTS.filter(q => q.npc === npc && available(q)).map(q => { const steps = q.steps.map(stepState); return { id: q.id, title: q.title, story: q.story, steps, ready: steps.every(s => s.done), reward: rewardText(q.reward) }; }); }
  function turnInById(id) { const q = QUESTS.find(q => q.id === id); return q && turnIn(q) ? rewardText(q.reward) : ""; }

  return { init, bind, renderTown, onComplete, onCommit, gear, paintColor, look, hud, skillLevel, totalLevel, questsFor, turnInById, setExtraFlood, have, cap,
    take: (g, n) => { const r = take(g, n); persist(); hud(); return r; }, add: (g, n) => { const r = add(g, n); persist(); hud(); return r; },
    addCoins: (n) => { S.coins += n; persist(); hud(); }, spend: (n) => { if (S.coins < n) return false; S.coins -= n; persist(); hud(); return true; }, addXp: (id, n) => { addXp(id, n); persist(); },
    SKILLS, GOODS, GEAR, QUESTS, NPC, COSMETICS, get state() { return S; } };
})();
window.RPG = RPG;
