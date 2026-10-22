// Your own island: a 10 x 10 grid of empty land west of the harbor that you build by writing Python. The
// blueprint (import build) describes the whole island; running it shows a plan of what changes, and "Build it"
// makes the island match, paying only for what is new. Crops grow in real time (also while the game is closed),
// Bolt harvests them by driving through, and the mill and bakery turn wheat, apples, pumpkins and honey into
// things worth far more at the harbor.

const Home = (() => {
  const $ = (id) => document.getElementById(id);
  let api; // the hub's api (save, persistSave, showModal, hideModal, toast, sfx)

  // ---------- the grid ----------
  const N = 10, CELL = 2, X0 = -9, Z0 = 7; // square (x, y) is centred at world (X0 + 2x, Z0 - 2y): x runs west to east, y from the shore inland
  const centre = (x, y, w = 1) => ({ x: X0 + CELL * x + (w - 1) * CELL / 2, z: Z0 - CELL * y - (w - 1) * CELL / 2 });
  const cellAt = (wx, wz) => ({ x: Math.round((wx - X0) / CELL), y: Math.round((Z0 - wz) / CELL) });
  const key = (x, y) => x + "," + y;

  // Everything you can build. grow: seconds to ripen; good: what a harvest gives; w: squares wide (2 = a 2 x 2 building, x and y name its front-left square).
  const PIECES = {
    path: { name: "Stone path", icon: "🪨", coins: 2, col: "#b9b2a4", desc: "Cobbles to drive on." },
    fence: { name: "Fence", icon: "🚧", coins: 4, col: "#8a5a34", desc: "Joins up with the fences and hedges next to it." },
    hedge: { name: "Hedge", icon: "🌳", coins: 6, col: "#3f7a3a", desc: "A green wall. Joins up like a fence." },
    flowers: { name: "Flower bed", icon: "🌷", coins: 5, col: "#e58ab0", desc: "Pretty, and bees need them: a hive wants 3 flower beds within 2 squares." },
    wheat: { name: "Wheat", icon: "🌾", coins: 8, col: "#d9b44a", crop: true, grow: 240, good: "wheat", yield: [2, 3], desc: "Ripe in 4 minutes. The mill turns 3 wheat into flour." },
    carrot: { name: "Carrots", icon: "🥕", coins: 10, col: "#e8862a", crop: true, grow: 360, good: "carrot", yield: [1, 3], desc: "Ripe in 6 minutes." },
    pumpkin: { name: "Pumpkin patch", icon: "🎃", coins: 15, col: "#d2691e", crop: true, grow: 720, good: "pumpkin", yield: [1, 2], desc: "Ripe in 12 minutes. Pumpkin pie is the best thing the bakery makes." },
    tree: { name: "Apple tree", icon: "🍎", coins: 25, col: "#2f6b2c", grow: 480, good: "apple", yield: [2, 4], desc: "Apples every 8 minutes. Drive up to the trunk to shake them down." },
    well: { name: "Well", icon: "🪣", coins: 40, mats: { stone: 3 }, col: "#7f8a96", desc: "Crops on the 8 squares around a well grow twice as fast." },
    scarecrow: { name: "Scarecrow", icon: "🧑‍🌾", coins: 30, mats: { plank: 1 }, col: "#c9a15a", desc: "Crops within 2 squares give one extra at harvest." },
    hive: { name: "Beehive", icon: "🐝", coins: 60, mats: { plank: 2 }, col: "#f2c230", grow: 600, good: "honey", yield: [1, 2], desc: "Honey every 10 minutes, but only with 3 flower beds within 2 squares." },
    lamp: { name: "Lamp post", icon: "🏮", coins: 20, mats: { scrap: 1 }, col: "#ffe08a", desc: "Lights up at night." },
    statue: { name: "Bolt statue", icon: "🗿", coins: 120, mats: { gem: 1 }, col: "#e6b422", desc: "A golden Bolt on a plinth. Pure showing off." },
    house: { name: "House", icon: "🏠", coins: 250, mats: { plank: 6, stone: 4 }, col: "#9a5b3c", w: 2, desc: "Two squares by two. Somewhere to live." },
    mill: { name: "Windmill", icon: "🌬️", coins: 300, mats: { plank: 6, scrap: 2 }, col: "#e8e2d6", w: 2, machine: true, desc: "Two by two. Grinds 3 wheat into 1 flour." },
    bakery: { name: "Bakery", icon: "🥖", coins: 400, mats: { stone: 8, plank: 2 }, col: "#b8553d", w: 2, machine: true, desc: "Two by two. Bakes bread, pies and cakes." },
  };
  const ORDER = Object.keys(PIECES);
  const BARE = { path: 1, wheat: 1, carrot: 1, pumpkin: 1, flowers: 1, house: 1, mill: 1, bakery: 1, well: 1, statue: 1 }; // no grass grows through these
  const JOIN = { fence: 1, hedge: 1 };
  // what the machines make: inp comes out of the barn, s = seconds each
  const MAKES = {
    mill: [{ id: "flour", out: "flour", inp: { wheat: 3 }, s: 20 }],
    bakery: [{ id: "bread", out: "bread", inp: { flour: 2 }, s: 30 }, { id: "applepie", out: "applepie", inp: { flour: 1, apple: 3 }, s: 40 },
      { id: "carrotcake", out: "carrotcake", inp: { flour: 1, carrot: 2 }, s: 40 }, { id: "honeycake", out: "honeycake", inp: { flour: 1, honey: 1 }, s: 40 },
      { id: "pumpkinpie", out: "pumpkinpie", inp: { flour: 1, pumpkin: 1 }, s: 45 }],
  };
  const BARN_CAP = 200;
  const STARTER = `import build

# This is your island: 10 squares by 10.
# x goes 0 to 9 from left to right, y goes 0 to 9 from the shore inland.
# The blueprint IS the island. Run it to see the plan, then build it.
# Run it again later and you only pay for what changed.

# a stone path from the shore up the middle
for y in range(10):
    build.place("path", 4, y)

# a little wheat field on the left
for x in range(1, 4):
    for y in range(1, 3):
        build.place("wheat", x, y)
`;
  const API = [
    ["build.place(thing, x, y)", "put something on square (x, y). Later places win, so you can paint over"],
    ["build.clear(x, y)", "leave square (x, y) empty"],
    ["build.get(x, y)", "what this blueprint has put on (x, y) so far, or None"],
    ["build.size()", "how many squares across the island is (10)"],
    ["build.cost(thing)", "how many coins one costs"],
    ["build.things()", "a list of everything you can build"],
  ];

  // ---------- state ----------
  function st() {
    const s = api.save(); if (!s.home) s.home = { name: "", grid: {}, code: STARTER, barn: {}, jobs: {}, stats: {}, flags: {}, built: 0 };
    const h = s.home; h.grid = h.grid || {}; h.barn = h.barn || {}; h.jobs = h.jobs || {}; h.stats = h.stats || {}; h.flags = h.flags || {}; return h;
  }
  const unlocked = () => !!(api.save().home || (RPG.state.quests && RPG.state.quests.papers));
  const islandName = () => st().name || (api.save().settings.name ? api.save().settings.name + "'s Isle" : "Your Island");
  const now = () => Date.now();
  const G = (g) => RPG.GOODS[g] || { name: g, icon: "📦", base: 1 };
  const gn = (g, n) => `${G(g).icon} ${n !== undefined ? n + " " : ""}${G(g).name}${n !== undefined && n !== 1 && G(g).plural !== false ? "s" : ""}`;

  // squares a piece covers, anchored at its front-left square
  const covers = (x, y, w) => { const out = []; for (let i = 0; i < w; i++) for (let j = 0; j < w; j++) out.push(key(x + i, y + j)); return out; };
  // the grid is a map of anchors, "x,y" → { t, at }; index() says which anchor covers each square
  function index(grid) { const ix = {}; for (const k in grid) { const [x, y] = k.split(",").map(Number); for (const c of covers(x, y, PIECES[grid[k].t].w || 1)) ix[c] = k; } return ix; }
  const near = (grid, x, y, r, t) => { let n = 0; for (const k in grid) { if (grid[k].t !== t) continue; const [a, b] = k.split(",").map(Number); if (Math.max(Math.abs(a - x), Math.abs(b - y)) <= r && (a !== x || b !== y)) n++; } return n; };
  const speedOf = (grid, x, y) => near(grid, x, y, 1, "well") ? 2 : 1;
  const hiveOk = (grid, x, y) => near(grid, x, y, 2, "flowers") >= 3;
  // how ripe something is, 0 to 1 (1 = ready). A hive without flowers never fills.
  function ripeness(grid, k, t) { // also used by the farmhands' model of the island, at a time later in their shift
    const c = grid[k]; if (!c) return 0; const P = PIECES[c.t]; if (!P.grow) return 1;
    const [x, y] = k.split(",").map(Number); if (c.t === "hive" && !hiveOk(grid, x, y)) return 0;
    return Math.min(1, (t - (c.at == null ? t : c.at)) / 1000 * speedOf(grid, x, y) / P.grow);
  }
  const stage = (k) => ripeness(st().grid, k, now());

  // ---------- the blueprint: Python module `build` ----------
  class BuildError extends Error {}
  function installModule() {
    if (Sk.builtinFiles.files["src/lib/build.js"]) return;
    Sk.builtinFiles.files["src/lib/build.js"] = `
var $builtinmodule = function (name) {
  var mod = {};
  function call(fn, args) { try { return Sk.ffi.remapToPy(window.__buildcall(fn, args)); } catch (e) { if (e && e.buildError) throw new Sk.builtin.RuntimeError("BUILD: " + e.message); throw e; } }
  function js(a) { return a === undefined ? undefined : Sk.ffi.remapToJs(a); }
  mod.place = new Sk.builtin.func(function (t, x, y) { return call("place", [js(t), js(x), js(y)]); });
  mod.clear = new Sk.builtin.func(function (x, y) { return call("clear", [js(x), js(y)]); });
  mod.get = new Sk.builtin.func(function (x, y) { return call("get", [js(x), js(y)]); });
  mod.cost = new Sk.builtin.func(function (t) { return call("cost", [js(t)]); });
  mod.size = new Sk.builtin.func(function () { return call("size", []); });
  mod.things = new Sk.builtin.func(function () { return call("things", []); });
  return mod;
};`;
    window.__buildcall = (fn, args) => {
      try { return window.__buildplan[fn](...args); } catch (e) { if (e instanceof BuildError) e.buildError = true; throw e; }
    };
  }
  const isInt = (v) => typeof v === "number" && Math.floor(v) === v;
  class Plan {
    constructor() { this.grid = {}; this.calls = 0; }
    xy(x, y, what, eg) {
      if (x === undefined || y === undefined) throw new BuildError(`${what} needs an x and a y, like ${eg}.`);
      if (!isInt(x) || !isInt(y)) throw new BuildError(`x and y have to be whole numbers. You gave ${x} and ${y}.`);
      if (x < 0 || y < 0 || x >= N || y >= N) throw new BuildError(`(${x}, ${y}) is off your island. x and y go from 0 to ${N - 1}.`);
    }
    place(t, x, y) {
      if (++this.calls > 2000) throw new BuildError("That's more than 2000 places. Is a loop running away?");
      if (typeof t !== "string" || !PIECES[t]) throw new BuildError(`There's nothing called ${JSON.stringify(t)} to build. Try one of: ${ORDER.join(", ")}.`);
      this.xy(x, y, "build.place()", 'build.place("wheat", 3, 4)'); const w = PIECES[t].w || 1;
      if (x + w > N || y + w > N) throw new BuildError(`A ${PIECES[t].name.toLowerCase()} is ${w} squares wide, so its x and y can be at most ${N - w}.`);
      const ix = index(this.grid); for (const c of covers(x, y, w)) if (ix[c]) delete this.grid[ix[c]]; // painting over: whatever was there goes
      this.grid[key(x, y)] = { t };
      return null;
    }
    clear(x, y) { this.xy(x, y, "build.clear()", "build.clear(3, 4)"); const k = index(this.grid)[key(x, y)]; if (k) delete this.grid[k]; return null; }
    get(x, y) { this.xy(x, y, "build.get()", "build.get(3, 4)"); const k = index(this.grid)[key(x, y)]; return k ? this.grid[k].t : null; }
    cost(t) { if (!PIECES[t]) throw new BuildError(`There's nothing called ${JSON.stringify(t)} to build.`); return PIECES[t].coins; }
    size() { return N; }
    things() { return ORDER.slice(); }
  }
  function friendly(err) {
    const s = String(err), line = (s.match(/on line (\d+)/) || [])[1];
    let raw = s.replace(/^RuntimeError: BUILD: /, "").replace(/ on line \d+$/, ""), tip = null;
    if (/BUILD: /.test(s)) tip = null;
    else if (/NameError: name 'build'/.test(s)) tip = "Put  import build  on the first line.";
    else if (/AttributeError: 'module' object has no attribute '(\w+)'/.test(s)) tip = `build has no command called ${s.match(/attribute '(\w+)'/)[1]}. The list is under the code box.`;
    else if (/NameError/.test(s)) tip = "Something isn't defined. Check the spelling, and put quotes round the names of things: \"wheat\", not wheat.";
    else if (/SyntaxError|bad input|bad token/.test(s)) tip = "Python can't read this line. Check the colon at the end of for / if / def lines, and the quotes and brackets.";
    else if (/Indentation|unindent|indented block/.test(s)) tip = "Indent with 4 spaces inside for / while / if / def blocks.";
    else if (/TimeLimitError/.test(s)) tip = "Your blueprint ran for ages. A while loop that never stops?";
    else if (/TypeError.*takes/.test(s)) tip = "Wrong number of things in the parentheses. build.place needs three: the thing, x and y.";
    return { raw, tip, line: line ? +line : null };
  }
  async function runBlueprint(code) {
    const plan = new Plan(), out = [];
    if (typeof Sk === "undefined") return { plan, out, error: { raw: "The Python engine hasn't loaded.", tip: "Check the internet connection and reload." } };
    installModule();
    Sk.configure({ output: t => { const l = String(t).replace(/\n$/, ""); if (l) out.push(l); }, read: x => { if (!Sk.builtinFiles || !Sk.builtinFiles.files[x]) throw "File not found: '" + x + "'"; return Sk.builtinFiles.files[x]; }, __future__: Sk.python3, execLimit: 4000 });
    window.__buildplan = plan; let error = null;
    try { await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<blueprint>", false, code, true)); } catch (e) { error = friendly(e); }
    window.__buildplan = null;
    return { plan, out, error };
  }
  // what building a plan would change: new things cost, things that come down give half their coins back
  function diff(plan) {
    const cur = st().grid, add = [], keep = [], gone = [];
    for (const k in plan.grid) (cur[k] && cur[k].t === plan.grid[k].t ? keep : add).push(k);
    for (const k in cur) if (!(plan.grid[k] && plan.grid[k].t === cur[k].t)) gone.push(k);
    let coins = 0; const mats = {};
    for (const k of add) { const P = PIECES[plan.grid[k].t]; coins += P.coins; for (const m in P.mats || {}) mats[m] = (mats[m] || 0) + P.mats[m]; }
    const refund = gone.reduce((s, k) => s + Math.floor(PIECES[cur[k].t].coins / 2), 0), net = coins - refund, short = [];
    if (net > RPG.state.coins) short.push(`${net - RPG.state.coins} more 🪙`);
    for (const m in mats) if (RPG.have(m) < mats[m]) short.push(gn(m, mats[m] - RPG.have(m)));
    return { add, keep, gone, coins, refund, net, mats, short };
  }
  function apply(plan, d) {
    const h = st(), t = now();
    if (d.short.length) return false;
    settle();
    for (const m in d.mats) RPG.take(m, d.mats[m]);
    if (d.net > 0) RPG.spend(d.net); else if (d.net < 0) RPG.addCoins(-d.net);
    for (const k of d.gone) { const j = h.jobs[k]; if (j) { for (const g in j.inp) bank(g, j.inp[g] * (j.n - j.done)); delete h.jobs[k]; } } // a machine that comes down hands its unfinished work back
    const grid = {};
    for (const k of d.keep) grid[k] = h.grid[k];
    for (const k of d.add) grid[k] = { t: plan.grid[k].t, at: t };
    h.grid = grid; h.built = (h.built || 0) + d.add.length; if (d.add.length) h.flags.built = true;
    fresh = d.add.slice(); api.persistSave(); checkFlags(); return true;
  }
  let fresh = []; // squares built a moment ago: the 3D view pops them in

  // ---------- the barn and the machines ----------
  const barnHas = (g) => st().barn[g] || 0;
  function bank(g, n) { const b = st().barn, k = Math.max(0, Math.min(n, BARN_CAP - (b[g] || 0))); if (k) b[g] = (b[g] || 0) + k; return k; }
  function unbank(g, n) { const b = st().barn; if ((b[g] || 0) < n) return false; b[g] -= n; if (!b[g]) delete b[g]; return true; }
  // machines work in real time: a job is n of one recipe started at t0; whatever is finished goes to the barn
  function settle() {
    const h = st(); let moved = false;
    for (const k in h.jobs) {
      const j = h.jobs[k], due = Math.min(j.n, Math.floor((now() - j.t0) / 1000 / j.s));
      if (due > j.done) { const n = due - j.done; bank(j.out, n); j.done = due; h.stats[j.out] = (h.stats[j.out] || 0) + n; moved = true; }
      if (j.done >= j.n) delete h.jobs[k];
    }
    if (moved) { api.persistSave(); checkFlags(); }
  }
  function startJob(k, recipe, n) {
    const h = st(); settle(); if (h.jobs[k]) return 0;
    n = Math.min(n, ...Object.keys(recipe.inp).map(g => Math.floor(barnHas(g) / recipe.inp[g]))); if (n <= 0) return 0;
    for (const g in recipe.inp) unbank(g, recipe.inp[g] * n);
    h.jobs[k] = { r: recipe.id, out: recipe.out, inp: recipe.inp, n, done: 0, s: recipe.s, t0: now() }; api.persistSave(); return n;
  }
  function machineMenu(p) {
    settle(); const h = st(), k = p.id, c = h.grid[k]; if (!c) return; const P = PIECES[c.t], j = h.jobs[k];
    const rows = MAKES[c.t].map(r => {
      const can = Math.min(...Object.keys(r.inp).map(g => Math.floor(barnHas(g) / r.inp[g])));
      const need = Object.keys(r.inp).map(g => `${gn(g, r.inp[g])} <span class="muted">(${barnHas(g)} in the barn)</span>`).join(" + ");
      return `<tr><td>${G(r.out).icon} <b>${G(r.out).name}</b><br><span class="muted">${r.s} s each · worth ${G(r.out).base} 🪙</span></td><td>${need}</td><td>${j ? "" : `<button class="small" data-mk="${r.id}" data-n="1" ${can ? "" : "disabled"}>Make 1</button> ${can > 1 ? `<button class="small primary" data-mk="${r.id}" data-n="${can}">Make ${can}</button>` : ""}`}</td></tr>`;
    }).join("");
    const left = j ? Math.max(0, Math.ceil(j.n * j.s - (now() - j.t0) / 1000)) : 0;
    api.showModal(`<h2>${P.icon} ${P.name}</h2>
      ${j ? `<p>⚙️ Working: <b>${j.done} of ${j.n} ${G(j.out).name.toLowerCase()}</b> done, about ${left >= 60 ? Math.ceil(left / 60) + " min" : left + " s"} to go. Finished ones go straight to the barn, even while you're away.</p>` : `<p>Takes what it needs from the barn in the farm shed, and keeps working while you're away. What it makes goes back to the barn.</p>`}
      <div class="tablewrap"><table class="goods"><tr><th>Makes</th><th>Needs</th><th></th></tr>${rows}</table></div>
      <div class="row"><button id="closeBtn">Done</button></div>`);
    $("modalBody").querySelectorAll("button[data-mk]").forEach(b => b.onclick = () => { const r = MAKES[c.t].find(x => x.id === b.dataset.mk), n = startJob(k, r, +b.dataset.n); if (n) { api.sfx("pick"); api.toast(`${P.icon} Making ${gn(r.out, n)}.`); } machineMenu(p); });
    $("closeBtn").onclick = api.hideModal;
  }
  // the farm shed on the shore: the barn, shipping to Marisol, swapping with your backpack
  function shedMenu() {
    settle(); const h = st(), goods = Object.keys(h.barn).filter(g => h.barn[g] > 0);
    const worth = goods.reduce((s, g) => s + G(g).base * h.barn[g], 0);
    const bp = ["apple", "wheat", "carrot", "pumpkin", "honey", "flour"].filter(g => RPG.have(g) > 0);
    api.showModal(`<h2>🧺 Farm shed</h2><p>Everything Bolt harvests, and everything the machines make, lands in the barn. Ship it to Marisol at a fair price (farm goods have no bad days), or take some in your backpack for the Workshop and quests.</p>
      ${goods.length ? `<div class="tablewrap"><table class="goods"><tr><th>In the barn</th><th>Worth</th><th></th></tr>${goods.map(g => `<tr><td>${gn(g, h.barn[g])}</td><td>${G(g).base * h.barn[g]} 🪙</td><td><button class="small" data-take="${g}">Take</button> <button class="small" data-ship="${g}">Ship</button></td></tr>`).join("")}</table></div>
        <div class="row"><button id="shipAll" class="primary">🚢 Ship everything (+${worth} 🪙)</button></div>` : `<p class="muted">The barn is empty. Plant something with the blueprint, then drive Bolt through it when it's ripe.</p>`}
      ${bp.length ? `<p class="muted">In your backpack: ${bp.map(g => `<button class="small" data-put="${g}">Put ${gn(g, RPG.have(g))} in the barn</button>`).join(" ")}</p>` : ""}
      <p class="muted">${Object.keys(h.jobs).length ? "⚙️ " + Object.keys(h.jobs).map(k => { const j = h.jobs[k]; return `${G(j.out).name}: ${j.done} of ${j.n}`; }).join(" · ") + " · " : ""}The barn holds ${BARN_CAP} of each thing.</p>
      <div class="row"><button id="handsBtn">🤖 Farmhands${window.Bots && Bots.crew.some(b => b.post === "farm") ? ` (${Bots.crew.filter(b => b.post === "farm").length})` : ""}</button><button id="closeBtn">Done</button></div>`);
    $("handsBtn").onclick = () => Farmhands.panel(shedMenu);
    const ship = (g, n) => { if (!n || !unbank(g, n)) return 0; const got = G(g).base * n; RPG.addCoins(got); RPG.state.stats.sold += got; RPG.state.stats.soldToday += got; h.stats.shipped = (h.stats.shipped || 0) + got; return got; };
    $("modalBody").querySelectorAll("button[data-ship]").forEach(b => b.onclick = () => { const got = ship(b.dataset.ship, barnHas(b.dataset.ship)); api.sfx("gem"); api.toast(`🚢 Shipped for ${got} 🪙`); api.persistSave(); shedMenu(); });
    $("modalBody").querySelectorAll("button[data-take]").forEach(b => b.onclick = () => { const g = b.dataset.take, k = RPG.add(g, barnHas(g)); unbank(g, k); api.persistSave(); api.toast(k ? `🎒 Took ${gn(g, k)}.` : "🎒 Your backpack has no room for more of those."); shedMenu(); });
    $("modalBody").querySelectorAll("button[data-put]").forEach(b => b.onclick = () => { const g = b.dataset.put, k = bank(g, RPG.have(g)); RPG.take(g, k); api.persistSave(); shedMenu(); });
    const sa = $("shipAll"); if (sa) sa.onclick = () => { let got = 0; for (const g of goods) got += ship(g, barnHas(g)); api.sfx("win"); api.toast(`🚢 Shipped the lot for ${got} 🪙`); api.persistSave(); shedMenu(); };
    $("closeBtn").onclick = api.hideModal;
  }

  // ---------- harvesting: Bolt drives through ripe crops ----------
  let pollT = null;
  function poll() {
    if (!window.Render3D || !Render3D.roam.active || Render3D.roam.sailing || !window.Hub || Hub.island !== "home" || Hub.room) return;
    const p = Render3D.roam.pose(); if (!p) return; const h = st();
    for (const k in h.grid) {
      const c = h.grid[k], P = PIECES[c.t]; if (!P.good) continue;
      const [x, y] = k.split(",").map(Number), w = centre(x, y);
      if (Math.hypot(p.x - w.x, p.z - w.z) > (P.crop ? 0.95 : 1.4) || stage(k) < 1) continue;
      let n = P.yield[0] + Math.floor(Math.random() * (P.yield[1] - P.yield[0] + 1));
      if (P.crop && near(h.grid, x, y, 2, "scarecrow")) n += 1;
      const got = bank(P.good, n); c.at = now();
      h.stats[P.good] = (h.stats[P.good] || 0) + got; h.stats.harvests = (h.stats.harvests || 0) + 1;
      if (Render3D.roam.fx) Render3D.roam.fx(w.x, w.z, got ? `+${got} ${G(P.good).icon}` : "barn full", P.col);
      api.sfx(got ? "pick" : "bump"); api.persistSave();
    }
  }

  // ---------- contracts: things the townsfolk ask you to build ----------
  function enclosed(grid) { // is any crop shut in by fences and hedges, so a flood from it can't reach the edge?
    const ix = index(grid), wall = (x, y) => { const k = ix[key(x, y)]; return k && JOIN[grid[k].t]; };
    for (const k in grid) {
      if (!PIECES[grid[k].t].crop) continue; const [sx, sy] = k.split(",").map(Number), seen = new Set([k]), q = [[sx, sy]]; let out = false;
      while (q.length && !out) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= N || b >= N) { out = true; break; } const kk = key(a, b); if (seen.has(kk) || wall(a, b)) continue; seen.add(kk); q.push([a, b]); } }
      if (!out) return true;
    }
    return false;
  }
  function mirrored(grid) { // left matches right: whatever covers (x, y) also covers (9 - x, y), with at least 20 squares used
    const ix = index(grid), at = (x, y) => { const k = ix[key(x, y)]; return k ? grid[k].t : null; }; let n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (at(x, y) !== at(N - 1 - x, y)) return false; if (at(x, y)) n++; }
    return n >= 20;
  }
  function checker(grid) { // a 4 x 4 checkerboard of two different one-square things
    const ix = index(grid), at = (x, y) => { const k = ix[key(x, y)]; return k && !(PIECES[grid[k].t].w > 1) ? grid[k].t : null; };
    for (let y = 0; y + 4 <= N; y++) for (let x = 0; x + 4 <= N; x++) {
      const a = at(x, y), b = at(x + 1, y); if (!a || !b || a === b) continue; let ok = true;
      for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 4 && ok; i++) if (at(x + i, y + j) !== ((i + j) % 2 ? b : a)) ok = false;
      if (ok) return true;
    }
    return false;
  }
  function wellOk(grid) {
    return Object.keys(grid).some(a => { if (grid[a].t !== "well") return false; const [x, y] = a.split(",").map(Number); let n = 0; for (const b in grid) { if (!PIECES[grid[b].t].crop) continue; const [u, v] = b.split(",").map(Number); if (Math.max(Math.abs(u - x), Math.abs(v - y)) === 1) n++; } return n >= 4; });
  }
  function progress(k) {
    const h = st(), g = h.grid;
    switch (k) {
      case "visit": case "built": return h.flags[k] ? 1 : 0;
      case "fence": return enclosed(g) ? 1 : 0;
      case "well": return wellOk(g) ? 1 : 0;
      case "bees": return Object.keys(g).some(a => g[a].t === "hive" && hiveOk(g, ...a.split(",").map(Number))) ? 1 : 0;
      case "mirror": return mirrored(g) ? 1 : 0;
      case "checker": return checker(g) ? 1 : 0;
      case "pieces": return Object.keys(g).length;
      case "house": return Object.values(g).some(c => c.t === "house") ? 1 : 0;
      default: settle(); return h.stats[k] || 0;
    }
  }
  const FLAG_TOAST = { fence: "🚧 A field with a fence all the way round!", well: "🪣 A well with four crops round it!", bees: "🐝 The bees have their flowers!", mirror: "🪞 Your island is a perfect mirror image!", checker: "🏁 A checkerboard!" };
  function checkFlags() {
    const h = st();
    for (const k in FLAG_TOAST) if (progress(k) && !h.flags[k]) { h.flags[k] = true; api.toast(FLAG_TOAST[k]); }
  }

  // ---------- the blueprint editor ----------
  function blueprint() {
    const h = st();
    api.showModal(`<h2>📐 Blueprint for ${esc(islandName())}</h2>
      <p class="muted">Write the island in Python and press <b>Run</b> to see the plan: <b style="color:#3fbf6a">green</b> squares are new, <b style="color:#e0523a">red crosses</b> come down (you get half their coins back). Then <b>Build it</b>.</p>
      <div class="bpgrid"><textarea id="bpCode" wrap="off" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"></textarea>
        <div><canvas id="bpMap" width="300" height="300"></canvas><div id="bpInfo" class="muted">This is the island now. Press Run to see your plan.</div></div></div>
      <div id="bpOut"></div>
      <div class="row"><button id="bpRun" class="primary">▶ Run</button><button id="bpBuild" disabled>🔨 Build it</button><button id="bpName" class="small">✏️ Name the island</button><button id="closeBtn">Close</button></div>
      <details><summary class="muted">Everything you can build, and every build command</summary>
        <div style="display:grid;gap:4px;margin-top:6px">${API.map(([c, d]) => `<div><code>${c}</code> <span class="muted">${d}</span></div>`).join("")}</div>
        <div class="tablewrap" style="margin-top:8px"><table class="goods"><tr><th>Name in code</th><th>Costs</th><th>What it does</th></tr>${ORDER.map(t => { const P = PIECES[t]; return `<tr><td>${P.icon} <code>"${t}"</code></td><td>${P.coins} 🪙${P.mats ? " + " + Object.keys(P.mats).map(m => gn(m, P.mats[m])).join(" + ") : ""}</td><td>${P.desc}</td></tr>`; }).join("")}</table></div></details>`);
    const ta = $("bpCode"); ta.value = h.draft || h.code || STARTER; let last = null;
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; } e.stopPropagation(); });
    ta.addEventListener("input", () => { h.draft = ta.value; last = null; $("bpBuild").disabled = true; });
    drawMap($("bpMap"), h.grid, null);
    $("bpRun").onclick = async () => {
      $("bpRun").disabled = true; const res = await runBlueprint(ta.value); $("bpRun").disabled = false;
      const out = res.out.length ? `<pre class="bpprint">${esc(res.out.slice(0, 60).join("\n"))}</pre>` : "";
      if (res.error) {
        last = null; $("bpBuild").disabled = true; drawMap($("bpMap"), res.plan.grid, null); $("bpInfo").textContent = "The plan up to the error.";
        $("bpOut").innerHTML = `<div class="bperr">${res.error.line ? "Line " + res.error.line + ": " : ""}${esc(res.error.raw)}${res.error.tip ? `<div>💡 ${res.error.tip}</div>` : ""}</div>${out}`; api.sfx("bump"); return;
      }
      const d = diff(res.plan); last = { plan: res.plan, d }; drawMap($("bpMap"), res.plan.grid, d);
      const matTxt = Object.keys(d.mats).map(m => gn(m, d.mats[m])).join(", ");
      $("bpInfo").innerHTML = `${Object.keys(res.plan.grid).length} things · <b style="color:#3fbf6a">${d.add.length} new</b> · ${d.keep.length} kept · <b style="color:#e0523a">${d.gone.length} coming down</b>`;
      $("bpOut").innerHTML = `${out}<p>${d.add.length || d.gone.length ? `Costs <b>${d.coins} 🪙</b>${matTxt ? " + " + matTxt : ""}${d.refund ? `, minus ${d.refund} 🪙 back for what comes down` : ""}: <b>${d.net >= 0 ? d.net + " 🪙" : "you get " + -d.net + " 🪙 back"}</b>.` : "Nothing changes: the island already matches this blueprint."}
        ${d.short.length ? `<br><b style="color:#e0523a">Not enough yet:</b> you need ${d.short.join(" and ")}.` : ""}</p>`;
      $("bpBuild").disabled = !(d.add.length || d.gone.length) || d.short.length > 0; $("bpBuild").textContent = "🔨 Build it"; api.sfx("click");
    };
    $("bpBuild").onclick = () => {
      if (!last) return; const { plan, d } = last;
      if (d.gone.length >= 5 && !last.sure) { last.sure = true; $("bpBuild").textContent = `⚠️ Really take down ${d.gone.length} things? Click again`; api.sfx("bump"); return; } // the blueprint is the island: a big teardown gets asked twice
      if (!apply(plan, d)) { api.toast("Not enough to build that yet."); return; }
      h.code = ta.value; delete h.draft; api.persistSave(); api.hideModal(); api.sfx("unlock");
      api.toast(`🔨 Built! ${d.add.length} new${d.gone.length ? `, ${d.gone.length} taken down` : ""}.`);
      if (window.Hub) Hub.rebuildIsland();
    };
    $("bpName").onclick = nameMenu;
    $("closeBtn").onclick = api.hideModal;
  }
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  function nameMenu() {
    const h = st();
    api.showModal(`<h2>✏️ Name your island</h2><p><input id="isName" maxlength="24" value="${esc(islandName())}" class="bpname"></p><div class="row"><button id="isSave" class="primary">Save</button><button id="isBack">Back</button></div>`);
    const i = $("isName"); i.addEventListener("keydown", e => e.stopPropagation()); i.focus(); i.select();
    $("isSave").onclick = () => { h.name = i.value.trim().slice(0, 24); api.persistSave(); api.toast(`🏝️ Welcome to ${esc(islandName())}.`); blueprint(); };
    $("isBack").onclick = blueprint;
  }
  // a top-down picture of a plan: one square per grid square, with the changes marked
  function drawMap(cv, grid, d) {
    const g = cv.getContext("2d"), S = cv.width / N; g.fillStyle = "#5d8a3e"; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = "rgba(255,255,255,0.13)"; g.lineWidth = 1; for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(i * S, 0); g.lineTo(i * S, cv.height); g.stroke(); g.beginPath(); g.moveTo(0, i * S); g.lineTo(cv.width, i * S); g.stroke(); }
    const px = (x, y, w) => [x * S, (N - y - w) * S]; // y = 0 is the shore, at the bottom
    const add = new Set(d ? d.add : []);
    for (const k in grid) {
      const [x, y] = k.split(",").map(Number), P = PIECES[grid[k].t], w = P.w || 1, [a, b] = px(x, y, w);
      g.fillStyle = P.col; g.fillRect(a + 2, b + 2, w * S - 4, w * S - 4);
      g.font = `${Math.round(S * (w > 1 ? 0.9 : 0.6))}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(P.icon, a + w * S / 2, b + w * S / 2 + 1);
      if (add.has(k)) { g.strokeStyle = "#5fff8f"; g.lineWidth = 2.5; g.strokeRect(a + 2, b + 2, w * S - 4, w * S - 4); }
    }
    if (d) for (const k of d.gone) { const c = st().grid[k], [x, y] = k.split(",").map(Number), w = PIECES[c.t].w || 1, [a, b] = px(x, y, w); g.strokeStyle = "#ff5a4a"; g.lineWidth = 3; g.beginPath(); g.moveTo(a + 5, b + 5); g.lineTo(a + w * S - 5, b + w * S - 5); g.moveTo(a + w * S - 5, b + 5); g.lineTo(a + 5, b + w * S - 5); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,0.8)"; g.font = `bold ${Math.round(S * 0.3)}px sans-serif`; g.textBaseline = "alphabetic";
    g.textAlign = "center"; for (let i = 0; i < N; i++) g.fillText(i, i * S + S / 2, cv.height - 4); // x along the bottom
    g.textAlign = "left"; for (let j = 1; j < N; j++) g.fillText(j, 3, (N - j) * S - S / 2 + 4); // y up the side
    g.fillStyle = "rgba(120,190,230,0.9)"; g.fillRect(0, cv.height - 2, cv.width, 2); // the shore
  }

  // ---------- the island, for the 3D renderer ----------
  // Built like the harbor and Gull Isle: render3d shapes the land from this, puts every decor thing down, and asks
  // stage() how ripe each crop is.
  const TOWN = {
    size: 72, radius: 24, seed: 4.1, start: { x: 0, z: 13 }, plaza: { x: 0, z: 12.6, r: 3.4 }, bay: { x: 0, z: 26.5, r: 7.5 },
    hills: [{ x: -15, z: -15, r: 5, h: 1.6 }, { x: 15, z: -14, r: 4.5, h: 1.3 }, { x: 17, z: 4, r: 3.5, h: 0.9 }],
    flats: [{ x: 0, z: 12.6, r: 4.2, y: 1.0 }, { rect: true, x: 0, z: -2, hw: 10.4, hh: 10.4, m: 3, y: 1.0 }],
    spots: [], strollers: [], bots: [], gears: [],
    moor: { kind: "moor", x: 1.05, z: 24.3, label: "⛵ Your boat", boat: { x: 2.9, z: 23.8, ry: -Math.PI / 2 }, land: { x: 0, z: 23.6, yaw: Math.PI / 2 } },
    get name() { return islandName(); },
    get decor() { return decorFor(st().grid, fresh); },
    get props() {
      const out = [{ kind: "blueprint", x: 3.6, z: 11.4, ry: 0, padY: 1.0, label: "📐 Blueprint table" }, { kind: "shed", x: -4.4, z: 11.6, ry: 0, padY: 1.0, label: "🧺 Farm shed" }, this.moor];
      if (window.Bots && Bots.crew.length && window.Farmhands) out.push({ kind: "botdock", x: Farmhands.PAD.x, z: Farmhands.PAD.z, ry: 0, label: "🤖 Farmhand pad" }); // where farmhands charge (farmhand.js)
      return out.concat(machineProps(st().grid));
    },
    bare(x, z) { return bareIn(st().grid, x, z); },
    stage: (k) => stage(k),
    busy: (k) => !!st().jobs[k], // a machine at work: the sails turn, the chimney smokes
    doneFresh() { fresh = []; },
  };
  function bareIn(g, x, z) { const c = cellAt(x, z); if (c.x < 0 || c.y < 0 || c.x >= N || c.y >= N) return false; const k = index(g)[key(c.x, c.y)]; return !!(k && BARE[g[k].t]); }
  function machineProps(g) { const out = []; for (const k in g) { const P = PIECES[g[k].t]; if (!P.machine) continue; const [x, y] = k.split(",").map(Number), p = centre(x, y, 2); out.push({ kind: g[k].t, id: k, x: p.x, z: p.z, ry: 0, padY: 1.0, label: P.icon + " " + P.name }); } return out; }
  function decorFor(g, fresh) {
      const ix = index(g), out = [{ kind: "dock", x: 0, z: 17, len: 8 }, { kind: "lamp", x: -2.6, z: 15.2 }, { kind: "lamp", x: 2.6, z: 15.2 },
        { kind: "tree", x: -17, z: 9, s: 2.4, ry: 1 }, { kind: "tree", x: 16, z: 10, s: 2.2, ry: 2 }, { kind: "tree", x: -18, z: -6, s: 2.5, ry: 3 }, { kind: "tree", x: 18, z: -5, s: 2.2, ry: 4 },
        { kind: "rock", x: -13, z: 16, s: 1.5, ry: 1 }, { kind: "rock", x: 12, z: 17, s: 1.7, ry: 2 }, { kind: "rock", x: -20, z: 2, s: 1.6, ry: 0 }, { kind: "rock", x: 4, z: -19, s: 1.6, ry: 3 }];
      const jt = (x, y) => { const k = ix[key(x, y)]; return !!(k && JOIN[g[k].t]); };
      for (const k in g) {
        const [x, y] = k.split(",").map(Number), c = g[k], P = PIECES[c.t], w = P.w || 1, p = centre(x, y, w);
        if (P.machine) continue; // the mill and bakery are props: you walk up and use them
        if (c.t === "house") { out.push({ kind: "house", x: p.x, z: p.z, s: 2.6, ry: 0, padY: 1.0, home: k }); continue; }
        if (c.t === "lamp") { out.push({ kind: "lamp", x: p.x, z: p.z, home: k }); continue; }
        out.push({ kind: "piece", t: c.t, k, x: p.x, z: p.z, w, mini: P.col, ry: 0, fresh: fresh.includes(k),
          links: JOIN[c.t] ? { e: jt(x + 1, y), w: jt(x - 1, y), n: jt(x, y + 1), s: jt(x, y - 1) } : null });
      }
      return out;
  }

  // ---------- family visits ----------
  // Your island travels with the family sync as a short string: three characters a piece (x, y, and which piece).
  function snapshot() {
    const h = st(); if (!Object.keys(h.grid).length) return null;
    return { name: islandName(), g: Object.keys(h.grid).map(k => k.replace(",", "") + ORDER.indexOf(h.grid[k].t).toString(36)).join(""), harvests: h.stats.harvests || 0, shipped: h.stats.shipped || 0 };
  }
  function parseGrid(s) {
    const g = {}; for (let i = 0; i + 2 < String(s || "").length + 0; i += 3) { const x = +s[i], y = +s[i + 1], t = ORDER[parseInt(s[i + 2], 36)]; if (t && x >= 0 && y >= 0 && x < N && y < N) g[key(x, y)] = { t, at: 0 }; }
    return g;
  }
  // a family member's island, to walk around: everything ripe, nothing to take
  function visitTown(snap, who) {
    const clean = (x) => String(x || "").replace(/[<>&"]/g, "").slice(0, 40); // their names come from another player's save
    const g = parseGrid(snap.g), T = TOWN; who = clean(who) || "Family"; snap = { ...snap, name: clean(snap.name) };
    return { size: T.size, radius: T.radius, seed: T.seed, start: T.start, plaza: T.plaza, bay: T.bay, hills: T.hills, flats: T.flats, spots: [], strollers: [], bots: [], gears: [], visit: true, who,
      moor: { ...T.moor }, name: snap.name || who + "'s island",
      get decor() { return decorFor(g, []); },
      get props() { return [{ kind: "shed", x: -4.4, z: 11.6, ry: 0, padY: 1.0, label: `🧺 ${who}'s farm shed` }, this.moor].concat(machineProps(g)); },
      bare: (x, z) => bareIn(g, x, z), stage: () => 1, busy: () => false, doneFresh() {}, grid: g };
  }
  function visitPiece(T, p) { // what you see when you use something on a visit
    if (p.kind === "shed") { const s0 = T.snap || {}, s = { harvests: Number(s0.harvests) | 0, shipped: Number(s0.shipped) | 0 }; api.toast(`🧺 ${T.who}'s barn. ${s.harvests ? `${s.harvests} harvests so far` : "Not much harvested yet"}${s.shipped ? `, ${s.shipped} 🪙 shipped to Marisol` : ""}.`); return true; }
    if (p.kind === "mill" || p.kind === "bakery") { api.toast(`${PIECES[p.kind].icon} ${T.who}'s ${PIECES[p.kind].name.toLowerCase()}. It only works for them.`); return true; }
    return false;
  }

  // ---------- hub glue ----------
  function init(a) { api = a; }
  function arrive() { const h = st(); settle(); if (!h.flags.visit) { h.flags.visit = true; api.persistSave(); } clearInterval(pollT); pollT = setInterval(poll, 200); if (window.Farmhands) Farmhands.start(); }
  function leave() { clearInterval(pollT); pollT = null; if (window.Farmhands) Farmhands.stop(); }
  function interact(p) {
    if (p.kind === "blueprint") { blueprint(); return true; }
    if (p.kind === "shed") { shedMenu(); return true; }
    if (p.kind === "mill" || p.kind === "bakery") { machineMenu(p); return true; }
    return false;
  }
  // one line for the town panel
  function summary() {
    const h = st(), g = h.grid; settle(); const crops = Object.keys(g).filter(k => PIECES[g[k].t].good), ripe = crops.filter(k => stage(k) >= 1).length;
    const barn = Object.values(h.barn).reduce((a, b) => a + b, 0), jobs = Object.keys(h.jobs).length;
    return `${Object.keys(g).length} things built · ${ripe ? `<b>${ripe} ready to harvest</b>` : crops.length ? "nothing ripe yet" : "nothing planted yet"} · ${barn} in the barn${jobs ? ` · ⚙️ ${jobs} machine${jobs > 1 ? "s" : ""} working` : ""}`;
  }

  // what the farmhands (farmhand.js) need to do real work on the island
  const farm = { st, bank, unbank, startJob, ripeness, near, BARN_CAP, G, gn, harvestYield: (k) => { const h = st(), c = h.grid[k], P = PIECES[c.t], [x, y] = k.split(",").map(Number); return P.yield[0] + Math.floor(Math.random() * (P.yield[1] - P.yield[0] + 1)) + (P.crop && near(h.grid, x, y, 2, "scarecrow") ? 1 : 0); } };
  return { init, arrive, leave, interact, blueprint, summary, progress, unlocked, islandName, settle, TOWN, PIECES, MAKES, N, centre, farm, snapshot, visitTown, visitPiece, parseGrid,
    debug: { runBlueprint, diff, apply, stage, st, poll, setAt(k, t) { const c = st().grid[k]; if (c) c.at = t; } } };
})();
window.Home = Home;
