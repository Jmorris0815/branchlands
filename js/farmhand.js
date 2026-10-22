// Farmhands: Botworks bots posted to your own island. A farmhand runs its own Python (import farm): find what's
// ripe, harvest it, put it in the barn, start the mill and the bakery, ship the goods. Like the harbor bots, a
// shift is worked out first against a model of the island (the code runs once, start to finish) and then played
// back in 3D, and the real island only changes as each action finishes on screen. Farmhands work while you are on
// the island; when you come back after a while away they catch up on a few shifts in one go.

const Farmhands = (() => {
  const $ = (id) => document.getElementById(id);
  let api;
  const now = () => Date.now();
  const F = () => Home.farm;
  const BASKET = 3, FARM_SPEED = 1.7; // a farm basket holds 3 times what the cargo upgrade says (crops are small); farm tracks are short and smooth
  const MIN_CHARGE = 12, IDLE = 20, CATCH_UP = 3; // seconds on the pad at least; a rest when there was nothing to do; shifts caught up after time away
  const STARTER = `import farm

# Harvest what's ripe and put it in the barn.
# Stop early so the battery lasts the trip home.
for crop in farm.ripe():
    if farm.battery() < 30:
        break
    if farm.full():
        farm.store()
    farm.harvest(crop["x"], crop["y"])
farm.store()
`;
  const API = [
    ["farm.ripe()", "a list of everything ready to harvest; each is a dictionary with \"x\", \"y\", \"thing\" and \"good\""],
    ["farm.harvest(x, y)", "drive to square (x, y) and harvest it; gives back how many it picked (0 if it wasn't ripe)"],
    ["farm.look(x, y)", "what is on square (x, y): a dictionary with \"thing\" and \"ripe\" (0 to 100), or None"],
    ["farm.store()", "drive to the farm shed and put the basket in the barn"],
    ["farm.barn()", "what is in the barn: a dictionary like {\"wheat\": 12}"],
    ["farm.make(thing, n)", "drive to the mill or bakery and start making n of thing (\"flour\", \"bread\", \"applepie\", ...); gives back how many it started"],
    ["farm.ship(thing, n)", "at the shed: ship n of thing from the barn to Marisol; gives back the coins"],
    ["farm.ship_all()", "at the shed: ship everything in the barn"],
    ["farm.cargo()", "a list of what is in the basket, like [\"wheat\", \"wheat\", \"apple\"]"],
    ["farm.full()", "True when the basket is full"],
    ["farm.space()", "how many more things fit in the basket"],
    ["farm.battery()", "battery left, 0 to 100"],
    ["farm.where()", "where it is: \"pad\", \"shed\", a machine like \"mill\", or a square like \"3,4\""],
    ["farm.say(text)", "a speech bubble over its head"],
    ["farm.wait(seconds)", "stand still for a bit"],
  ];

  // ---------- save ----------
  const crew = () => Bots.crew.filter(b => b.post === "farm");
  const byId = (id) => Bots.byId(id);
  function ready(b) { if (!b.farm) b.farm = { code: STARTER, stats: { shifts: 0, harvests: 0, coins: 0, made: 0 }, log: [], shiftNo: 0, last: now() }; return b.farm; }
  const canPost = () => !!(window.Home && Home.unlocked() && Object.keys(F().st().grid).length);
  function post(id, on) {
    const b = byId(id); if (!b) return;
    if (on) { Bots.bench(id); b.post = "farm"; ready(b).last = now(); api.toast(`🏝️ <b>${b.name}</b> is off to ${Home.islandName()}. Give it a farm program at the farm shed.`); }
    else { b.post = null; delete live[id]; api.toast(`⚓ <b>${b.name}</b> is back at the Bot Dock.`); }
    api.persistSave(); if (window.Hub && Hub.refresh) Hub.refresh();
  }

  // ---------- where things are on the island ----------
  // Places are named: "pad" (where farmhands charge), "shed", a machine's square "m:x,y", or a crop's square "x,y".
  const SHED = { x: -4.4, z: 11.6 }, PAD = { x: -8.6, z: 12.2 }; // PAD: the farmhands' own little Bot Dock (a prop on the island, see home.js)
  let placeCache = { sig: null, map: null };
  function places() {
    const g = F().st().grid, sig = Object.keys(g).map(k => k + g[k].t).join("|");
    if (placeCache.sig === sig) return placeCache.map;
    const map = {
      pad: { name: "the charging pad", slots: [-0.7, 0, 0.7].map(d => ({ x: PAD.x + d, z: PAD.z + 0.85, look: [PAD.x + d, PAD.z - 0.5] })) },
      shed: { name: "the farm shed", slots: [-0.7, 0, 0.7].map(d => ({ x: SHED.x + d, z: SHED.z + 2.5, look: [SHED.x, SHED.z] })) },
    };
    for (const k in g) {
      const P = Home.PIECES[g[k].t], [x, y] = k.split(",").map(Number);
      if (P.machine) { const c = Home.centre(x, y, 2); map["m:" + k] = { name: "the " + P.name.toLowerCase(), slots: [-0.6, 0, 0.6].map(d => ({ x: c.x + d, z: c.z + 2.3, look: [c.x, c.z] })) }; continue; }
      if (!P.good) continue;
      const c = Home.centre(x, y);
      map[k] = P.crop ? { name: "square " + k, slots: [[-0.35, 0.45], [0.35, 0.45], [0, -0.4]].map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz, look: [c.x + dx, c.z - 2] })) }
        : { name: "square " + k, slots: [[0, 1.0], [-0.8, 0.7], [0.8, 0.7]].map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz, look: [c.x, c.z] })) };
    }
    return placeCache = { sig, map }, map;
  }
  const spot = (p) => (places()[p] || places().pad).slots[0];
  const dist = (a, b) => { const p = spot(a), q = spot(b); return Math.hypot(p.x - q.x, p.z - q.z) * 1.3 + 0.5; };

  // ---------- the model of one shift ----------
  const FLAT = { flat: true };
  class FarmError extends Error {}
  class Sim {
    constructor(b, seed) {
      const h = F().st(); this.b = b; this.r = Bots.rng(seed); this.cap = Bots.val(b, "battery"); this.batt = this.cap; this.speed = Bots.val(b, "wheels") * FARM_SPEED; this.size = Bots.val(b, "cargo") * BASKET;
      this.t0 = now(); this.t = 0; this.at = "pad"; this.cargo = []; this.ev = []; this.calls = 0; this.flat = false; this.out = [];
      this.grid = JSON.parse(JSON.stringify(h.grid)); this.barnM = { ...h.barn }; this.jobs = JSON.parse(JSON.stringify(h.jobs));
      this.s = { harvests: 0, picked: 0, stored: 0, coins: 0, made: 0 };
    }
    get clock() { return this.t0 + this.t * 1000; }
    act(a, sec, extra) {
      const e = Object.assign({ a, t: this.t, at: this.at, b0: this.batt / this.cap }, extra || {});
      if (sec >= this.batt) { e.d = this.batt; e.frac = sec ? this.batt / sec : 1; this.t += this.batt; this.batt = 0; this.flat = true; e.b1 = 0; e.carry = this.cargo.slice(); this.ev.push(e); this.flatEv = e; throw FLAT; }
      e.d = sec; this.t += sec; this.batt -= sec; e.b1 = this.batt / this.cap; e.carry = this.cargo.slice(); this.ev.push(e); return e;
    }
    ask() { if (++this.calls > 20000) throw new FarmError("Your farmhand was asked 20,000 questions in one shift without doing anything. Is there a loop with no farm command that takes time inside it?"); }
    go(p) { this.ask(); if (p === this.at) return; const from = this.at; this.act("go", dist(from, p) / this.speed, { from, to: p }); this.at = p; }
    square(x, y, what) {
      if (!Number.isInteger(x) || !Number.isInteger(y)) throw new FarmError(`farm.${what}(x, y) needs two whole numbers, like farm.${what}(3, 4).`);
      if (x < 0 || y < 0 || x >= Home.N || y >= Home.N) throw new FarmError(`Square (${x}, ${y}) is off the island. x and y go from 0 to ${Home.N - 1}.`);
      return x + "," + y;
    }
    ripeAt(k) { return F().ripeness(this.grid, k, this.clock); }
    ripe() {
      this.ask(); const out = [];
      for (const k in this.grid) { const P = Home.PIECES[this.grid[k].t]; if (!P.good || this.ripeAt(k) < 1) continue; const [x, y] = k.split(",").map(Number); out.push({ x, y, thing: this.grid[k].t, good: P.good }); }
      return out.sort((a, b) => a.y - b.y || a.x - b.x);
    }
    look(x, y) { this.ask(); const k = this.square(x, y, "look"), c = this.grid[k]; if (!c) return null; return { thing: c.t, ripe: Math.floor(this.ripeAt(k) * 100) }; }
    harvest(x, y) {
      const k = this.square(x, y, "harvest"), c = this.grid[k];
      if (!c || !Home.PIECES[c.t].good) throw new FarmError(`There's nothing to harvest on square (${x}, ${y})${c ? ` (it has a ${Home.PIECES[c.t].name.toLowerCase()})` : ""}. farm.ripe() lists what's ready.`);
      if (this.cargo.length >= this.size) throw new FarmError(`The basket is full (${this.size} of ${this.size}). Use farm.store() to empty it into the barn first. farm.full() tells you when it's full.`);
      this.go(k); const P = Home.PIECES[c.t];
      if (this.ripeAt(k) < 1) { this.act("look", 0.6, { item: null }); this.say("not ripe yet"); return 0; }
      const n = F().harvestYield(k), got = Math.min(n, this.size - this.cargo.length);
      for (let i = 0; i < got; i++) this.cargo.push(P.good);
      c.at = this.clock; this.s.harvests++; this.s.picked += got;
      this.act(P.crop ? "dig" : "pick", P.crop ? 1.6 : 2.4, { item: P.good, k, n: got, good: P.good, lost: n - got });
      return got;
    }
    store() {
      if (!this.cargo.length) { this.ask(); return 0; } // nothing to put away: no trip
      this.go("shed"); const moved = {}; let k = 0;
      for (const g of this.cargo) { if ((this.barnM[g] || 0) >= F().BARN_CAP) continue; this.barnM[g] = (this.barnM[g] || 0) + 1; moved[g] = (moved[g] || 0) + 1; k++; }
      this.cargo = []; this.s.stored += k; this.act("unload", 1.2 + 0.1 * k, { items: moved }); return k;
    }
    barn() { this.ask(); return { ...this.barnM }; }
    make(thing, n) {
      thing = String(thing).toLowerCase().trim(); n = n === undefined ? 1 : Math.floor(Number(n)) || 0;
      let type = null, recipe = null; for (const m in Home.MAKES) { const r = Home.MAKES[m].find(r => r.id === thing || r.out === thing); if (r) { type = m; recipe = r; } }
      if (!recipe) throw new FarmError(`Nothing on the island makes "${thing}". The windmill makes "flour"; the bakery makes ${Home.MAKES.bakery.map(r => `"${r.id}"`).join(", ")}.`);
      const k = Object.keys(this.grid).find(q => this.grid[q].t === type);
      if (!k) throw new FarmError(`You need a ${Home.PIECES[type].name.toLowerCase()} on the island to make ${thing}. Add one to the blueprint.`);
      this.go("m:" + k); const j = this.jobs[k];
      if (j && Math.min(j.n, Math.floor((this.clock - j.t0) / 1000 / j.s)) < j.n) { this.act("look", 0.6); this.say("still busy"); return 0; }
      const can = Math.min(n, ...Object.keys(recipe.inp).map(g => Math.floor((this.barnM[g] || 0) / recipe.inp[g])));
      if (can <= 0) { this.act("look", 0.6); this.say("not enough in the barn"); return 0; }
      for (const g in recipe.inp) { this.barnM[g] -= recipe.inp[g] * can; if (!this.barnM[g]) delete this.barnM[g]; }
      this.jobs[k] = { n: can, t0: this.clock, s: recipe.s }; this.s.made += can;
      this.act("sort", 1.5, { k, recipe: recipe.id, n: can, item: recipe.out }); return can;
    }
    shipN(goods) {
      this.go("shed"); let coins = 0; const sent = {};
      for (const [g, n] of goods) { const k = Math.min(n, this.barnM[g] || 0); if (k <= 0) continue; this.barnM[g] -= k; if (!this.barnM[g]) delete this.barnM[g]; coins += F().G(g).base * k; sent[g] = k; }
      this.s.coins += coins; this.act("sell", 1 + 0.15 * Object.keys(sent).length, { coins, sent }); return coins;
    }
    ship(thing, n) { thing = String(thing).toLowerCase().trim(); return this.shipN([[thing, n === undefined || n === null ? Infinity : Math.floor(Number(n)) || 0]]); }
    ship_all() { return this.shipN(Object.entries(this.barnM)); }
    say(text) { this.ask(); this.ev.push({ a: "say", t: this.t, d: 0, at: this.at, text: String(text).slice(0, 60), b0: this.batt / this.cap, b1: this.batt / this.cap, carry: this.cargo.slice() }); }
    wait(s) { this.act("wait", Math.max(0, Math.min(30, Number(s) || 0))); }
    battery() { this.ask(); return Math.floor(this.batt / this.cap * 100); }
    where() { this.ask(); return this.at.startsWith("m:") ? this.grid[this.at.slice(2)].t : this.at; }
    finish(error) {
      this.error = error; if (error) { this.ev.push({ a: "error", t: this.t, d: 2.5, at: this.at, text: "?!", b0: this.batt / this.cap, b1: this.batt / this.cap, carry: this.cargo.slice() }); this.t += 2.5; }
      if (!this.flat && this.cargo.length) { try { this.store(); } catch (e) { if (e !== FLAT) throw e; } } // whatever is left goes in the barn on the way home
      if (!this.flat) { try { this.go("pad"); } catch (e) { if (e !== FLAT) throw e; } }
      this.left = this.batt / this.cap; this.work = this.t;
      if (this.flat) { const f = this.flatEv; this.lost = this.cargo.length; this.ev.push({ a: "flat", t: this.t, d: 4, at: f.at, from: f.from, to: f.to, frac: f.frac, b0: 0, b1: 0, carry: this.cargo.slice() }); this.t += 4; this.cargo = []; this.ev.push({ a: "tow", t: this.t, d: 0, at: "pad", b0: 0, b1: 0, carry: [] }); this.at = "pad"; }
      const idle = !this.error && !this.s.harvests && !this.s.made && !this.s.coins && this.work < 3;
      const d = Math.max(MIN_CHARGE, 40 * (1 - this.batt / this.cap)) + (idle ? IDLE : 0);
      this.xp = error && this.work < 1 ? 0 : this.flat || error ? 1 : Math.min(8, Math.round(this.s.harvests / 2 + this.s.made / 2 + this.s.coins / 30));
      this.ev.push({ a: "charge", t: this.t, d, at: "pad", b0: this.batt / this.cap, b1: 1, carry: [], xp: this.xp }); this.t += d;
    }
  }

  // ---------- the Python module ----------
  function installModule() {
    if (Sk.builtinFiles.files["src/lib/farm.js"]) return;
    const plain = ["ripe", "store", "barn", "ship_all", "cargo", "full", "space", "battery", "where"];
    Sk.builtinFiles.files["src/lib/farm.js"] = `
var $builtinmodule = function (name) {
  var mod = {};
  function call(fn, args) { try { return Sk.ffi.remapToPy(window.__farmcall(fn, args)); } catch (e) { if (e && e.flat) throw new Sk.builtin.RuntimeError("BATTERY_FLAT"); if (e && e.farmError) throw new Sk.builtin.RuntimeError("FARM: " + e.message); throw e; } }
  function js(a) { return a === undefined ? undefined : Sk.ffi.remapToJs(a); }
  ${plain.map(n => `mod.${n} = new Sk.builtin.func(function () { return call("${n}", []); });`).join("\n  ")}
  ${["say", "wait"].map(n => `mod.${n} = new Sk.builtin.func(function (a) { return call("${n}", [js(a)]); });`).join("\n  ")}
  ${["harvest", "look", "make", "ship"].map(n => `mod.${n} = new Sk.builtin.func(function (a, b) { return call("${n}", [js(a), js(b)]); });`).join("\n  ")}
  return mod;
};`;
    window.__farmcall = (fn, args) => {
      const S = window.__farmsim;
      try {
        if (fn === "cargo") { S.ask(); return S.cargo.slice(); }
        if (fn === "full") { S.ask(); return S.cargo.length >= S.size; }
        if (fn === "space") { S.ask(); return S.size - S.cargo.length; }
        if (["harvest", "look"].includes(fn) && (args[0] === undefined || args[1] === undefined)) throw new FarmError(`farm.${fn}(x, y) needs the square's x and y, like farm.${fn}(3, 4).`);
        if (["make", "ship"].includes(fn) && args[0] === undefined) throw new FarmError(`farm.${fn}() needs to know what, like farm.${fn}("${fn === "make" ? "flour" : "wheat"}"${fn === "make" ? ", 2" : ""}).`);
        const r = S[fn](...args); return r === undefined ? null : r;
      } catch (e) { if (e instanceof FarmError) e.farmError = true; throw e; }
    };
  }
  function friendly(err) {
    const s = String(err), line = (s.match(/on line (\d+)/) || [])[1];
    let raw = s.replace(/^RuntimeError: FARM: /, "").replace(/ on line \d+$/, ""), tip = null;
    if (/FARM: /.test(s)) tip = null;
    else if (/NameError: name 'farm'/.test(s)) tip = "Put  import farm  on the first line.";
    else if (/NameError: name 'bot'/.test(s)) tip = "On the island it's  import farm  and farm.something(), not bot.";
    else if (/AttributeError: 'module' object has no attribute '(\w+)'/.test(s)) tip = `farm has no command called ${s.match(/attribute '(\w+)'/)[1]}. The list is under the code box.`;
    else if (/NameError/.test(s)) tip = "Something isn't defined. Check the spelling and capital letters.";
    else if (/SyntaxError|bad input|bad token/.test(s)) tip = "Python can't read this line. Check the colon at the end of for / while / if / def lines, and the quotes and brackets.";
    else if (/Indentation|unindent|indented block/.test(s)) tip = "Indent with 4 spaces inside for / while / if / def blocks.";
    else if (/TimeLimitError/.test(s)) { raw = "Your code ran for ages without the farmhand doing anything."; tip = "A while loop with no farm command inside? Every loop needs something that takes time, like harvest, store or wait."; }
    else if (/KeyError/.test(s)) tip = "That key isn't in the dictionary. Things from farm.ripe() have \"x\", \"y\", \"thing\" and \"good\".";
    else if (/NoneType/.test(s)) tip = "Something gave back None. farm.look(x, y) gives back None on an empty square: check  if spot:  first.";
    return { raw, tip, line: line ? +line : null };
  }
  async function simulate(b, seed, code) {
    const S = new Sim(b, seed);
    if (typeof Sk === "undefined") { S.finish({ raw: "The Python engine hasn't loaded.", tip: "Check the internet connection and reload." }); return S; }
    installModule();
    Sk.configure({ output: t => { const l = String(t).replace(/\n$/, ""); if (l) { S.out.push(l); S.ev.push({ a: "say", t: S.t, d: 0, at: S.at, text: l.slice(0, 60), b0: S.batt / S.cap, b1: S.batt / S.cap, carry: S.cargo.slice() }); } },
      read: x => { if (!Sk.builtinFiles || !Sk.builtinFiles.files[x]) throw "File not found: '" + x + "'"; return Sk.builtinFiles.files[x]; }, __future__: Sk.python3, execLimit: 3000 });
    window.__farmsim = S; let error = null;
    try { await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<farm>", false, code === undefined ? ready(b).code : code, true)); }
    catch (e) { if (!/BATTERY_FLAT/.test(String(e)) && e !== FLAT) error = friendly(e); }
    window.__farmsim = null;
    S.finish(error);
    return S;
  }

  // ---------- doing it for real, as each action finishes ----------
  const live = {}; // bot id → { S, t0, i, pops, short }
  let timer = null, busy = false, speed = 1;
  const tau = (L) => (now() - L.t0) / 1000 * speed;
  function apply(b, L, e) {
    const h = F().st(), fm = ready(b);
    if (e.k && e.good) { // a harvest: only if it's still ripe for real (Bolt may have driven through it meanwhile)
      const c = h.grid[e.k];
      if (c && F().ripeness(h.grid, e.k, now()) >= 1) { c.at = now(); h.stats[e.good] = (h.stats[e.good] || 0) + e.n; h.stats.harvests = (h.stats.harvests || 0) + 1; fm.stats.harvests++; }
      else L.short[e.good] = (L.short[e.good] || 0) + e.n;
    }
    if (e.items) { let n = 0; for (const g in e.items) { const want = Math.max(0, e.items[g] - (L.short[g] || 0)); L.short[g] = Math.max(0, (L.short[g] || 0) - e.items[g]); n += F().bank(g, want); } if (n) L.pops.push({ text: "+" + n + " 🧺", at: now() }); }
    if (e.recipe) { const r = Object.values(Home.MAKES).flat().find(r => r.id === e.recipe), k = F().startJob(e.k, r, e.n); fm.stats.made += k; if (k) L.pops.push({ text: "⚙️ " + k + " " + F().G(r.out).icon, at: now() }); }
    if (e.sent) { let coins = 0; for (const g in e.sent) { const k = Math.min(e.sent[g], h.barn[g] || 0); if (k && F().unbank(g, k)) coins += F().G(g).base * k; } if (coins) { RPG.addCoins(coins); RPG.state.stats.sold += coins; RPG.state.stats.soldToday += coins; h.stats.shipped = (h.stats.shipped || 0) + coins; fm.stats.coins += coins; L.pops.push({ text: "+" + coins + " 🪙", at: now() }); } }
    if (e.xp) RPG.addXp("robotics", e.xp);
  }
  function payUpTo(b, L, t) { const ev = L.S.ev; let any = false; while (L.i < ev.length && ev[L.i].t + ev[L.i].d <= t) { apply(b, L, ev[L.i++]); any = true; } if (any) api.persistSave(); }
  function endShift(b, S, show) {
    const fm = ready(b); fm.stats.shifts++;
    if (!S.error && !S.flat && (S.s.harvests || S.s.made || S.s.coins)) { const f = Bots.flags(); if (!f.farm1) { f.farm1 = true; if (show) api.toast(`🤖 <b>${b.name}</b> worked its first shift on your island! ${S.s.picked} things harvested.`); } }
    if (S.s.harvests || S.error || S.flat) { fm.log.unshift({ at: now(), picked: S.s.picked, stored: S.s.stored, made: S.s.made, coins: S.s.coins, flat: S.flat, err: S.error ? S.error.raw : null, line: S.error ? S.error.line : null, left: Math.round(S.left * 100) }); fm.log.length = Math.min(fm.log.length, 8); }
    if (show && S.flat) api.toast(`🔋 <b>${b.name}</b> ran flat out in the fields${S.lost ? ` and dropped ${S.lost} thing${S.lost > 1 ? "s" : ""}` : ""}. Check <code>farm.battery()</code> before a long trip.`);
    fm.last = now(); api.persistSave();
  }
  function start() {
    clearInterval(timer); timer = setInterval(tick, 400);
    catchUp().then(tick);
  }
  function stop() {
    clearInterval(timer); timer = null;
    for (const b of crew()) { const L = live[b.id]; if (L) { payUpTo(b, L, tau(L)); ready(b).last = now(); } delete live[b.id]; }
    api.persistSave();
  }
  async function tick() {
    if (busy || !timer) return;
    for (const b of crew()) {
      const L = live[b.id];
      if (L) { const t = tau(L); payUpTo(b, L, t); if (t >= L.S.t) { endShift(b, L.S, true); delete live[b.id]; } continue; }
      const fm = ready(b); if (!b.on || fm.stuck || !fm.code) continue;
      busy = true;
      try {
        const S = await simulate(b, Bots.hash(b.id + "farm") ^ (fm.shiftNo++ * 7919));
        if (S.error && S.work < 1) { fm.stuck = S.error; api.toast(`🤖 <b>${b.name}</b> can't start its farm program: ${S.error.raw}`); api.persistSave(); }
        else if (timer) live[b.id] = { S, t0: now(), i: 0, pops: [], short: {} };
      } finally { busy = false; }
    }
  }
  // back after a while: a few shifts happen at once (crops kept growing while you were away)
  async function catchUp() {
    const done = [];
    busy = true;
    try {
      for (const b of crew()) {
        const fm = ready(b); if (!b.on || fm.stuck || !fm.code || now() - (fm.last || now()) < 60000) continue;
        const R = { b, picked: 0, coins: 0, made: 0 };
        for (let i = 0; i < CATCH_UP; i++) {
          const S = await simulate(b, Bots.hash(b.id + "farm") ^ (fm.shiftNo++ * 7919));
          if (S.error && S.work < 1) { fm.stuck = S.error; break; }
          const L = { S, i: 0, pops: [], short: {} }; for (const e of S.ev) apply(b, L, e); endShift(b, S, false);
          R.picked += S.s.picked; R.coins += S.s.coins; R.made += S.s.made;
          if (!S.s.harvests && !S.s.made && !S.s.coins) break; // nothing left to do
        }
        fm.last = now(); if (R.picked || R.coins || R.made) done.push(R);
      }
    } finally { busy = false; }
    api.persistSave();
    if (done.length) api.toast("🏝️ While you were away: " + done.map(R => `<b>${R.b.name}</b> harvested ${R.picked}${R.made ? `, started ${R.made} at the machines` : ""}${R.coins ? `, shipped for ${R.coins} 🪙` : ""}`).join(" · "));
  }

  // ---------- for the 3D island ----------
  function poses() {
    return crew().map((b, i) => {
      const base = { id: b.id, name: b.name, color: b.color, slot: i }, L = live[b.id], fm = ready(b);
      if (!L) return { ...base, place: "pad", act: !b.on ? "off" : fm.stuck ? "stuck" : "charge", k: 0, carry: [], batt: 1, say: fm.stuck ? "Fix my code!" : null };
      const t = tau(L), ev = L.S.ev; let j = 0; for (let q = 0; q < ev.length; q++) { if (ev[q].t <= t) j = q; else break; }
      let e = ev[j]; while (j > 0 && e.d === 0 && ["say", "tow"].indexOf(e.a) < 0) e = ev[--j];
      base.et = e.t;
      const k = e.d ? Math.min(1, (t - e.t) / e.d) : 1, done = t >= e.t + e.d;
      let say = null; for (let q = j; q >= 0 && q > j - 8; q--) { const x = ev[q]; if (x.a === "say" && t - x.t < 3.2) { say = x.text; break; } if (x.a === "error" && t - x.t < 3) { say = "?!"; break; } }
      const pops = L.pops.filter(p => now() - p.at < 1400); L.pops = pops;
      const batt = e.b0 + (e.b1 - e.b0) * k;
      if (e.a === "go") return { ...base, act: "go", from: e.from, to: e.to, k: done ? 1 : k * (e.frac || 1), place: done ? e.to : e.from, carry: e.carry, batt, say, pops };
      if (e.a === "flat") return { ...base, act: "flat", from: e.from, to: e.to, k: e.frac || 1, place: e.at, carry: e.carry, batt: 0, say: "zzz", pops };
      const act = done && ["dig", "pick", "sell", "sort", "unload", "wait", "look"].includes(e.a) ? "stand" : e.a === "look" ? "stand" : e.a;
      const carry = !done && e.n ? e.carry.slice(0, e.carry.length - e.n) : e.carry; // it isn't in the basket until it's picked
      return { ...base, act, place: e.at, k, item: e.item, carry, batt, say, pops };
    });
  }
  function status(b) {
    const L = live[b.id], fm = ready(b); if (!b.on) return "🏝️ on your island, switched off"; if (fm.stuck) return "🏝️ ⚠ stuck: its farm program needs a fix"; if (!L) return "🏝️ charging on your island";
    const p = poses().find(x => x.id === b.id) || {}, nm = (q) => (places()[q] || {}).name || q;
    return "🏝️ " + ({ go: `driving to ${nm(p.to)}`, dig: "harvesting", pick: "harvesting", unload: "filling the barn", sell: "shipping goods", sort: "starting a machine", charge: "charging on the pad", flat: "flat battery!", error: "confused by its code" }[p.act] || "working on your island");
  }

  // ---------- the farmhands panel (in the farm shed) and the code editor ----------
  const things = (m) => Object.entries(m).filter(([, n]) => n > 0).map(([g, n]) => `${n} ${F().G(g).icon}`).join(" ") || "nothing";
  function panel(back) {
    const all = Bots.crew, here = crew(), away = all.filter(b => b.post !== "farm");
    const card = (b) => { const fm = ready(b), last = fm.log[0]; return `<div class="card"><div class="ct"><span class="big" style="color:${b.color}">🤖</span> <b>${b.name}</b></div>
      <div class="muted">${status(b)}</div><div class="muted">${fm.stats.shifts} shifts · ${fm.stats.harvests} harvests · ${fm.stats.coins} 🪙 shipped${last ? ` · last: ${last.err ? "⚠ " + last.err.replace(/</g, "&lt;") : `${last.picked} picked`}` : ""}</div>
      <div class="row"><button class="small primary" data-fcode="${b.id}">✏️ Farm program</button><button class="small" data-fwatch="${b.id}">👀 Watch</button><button class="small" data-fon="${b.id}">${b.on ? "⏸ Stop" : "▶ Start"}</button><button class="small" data-fhome="${b.id}">⚓ Back to the harbor</button></div></div>`; };
    api.showModal(`<h2>🤖 Farmhands</h2><p>Bots from the Bot Dock can work your island instead of the harbor. They run a farm program (<code>import farm</code>): harvest what's ripe, fill the barn, start the mill and bakery, ship the goods. Their upgrades count here too, and a farm basket holds three times as much.</p>
      ${here.length ? `<div class="cards">${here.map(card).join("")}</div>` : `<p class="muted">No farmhands yet.</p>`}
      ${away.length ? `<p>${away.map(b => `<button class="small" data-fpost="${b.id}"><span style="color:${b.color}">●</span> Bring ${b.name} over from the harbor</button>`).join(" ")}</p>` : all.length ? "" : `<p class="muted">Build your first bot at the Bot Dock in Harbor Town (Wrenna has the parts), then bring it here.</p>`}
      <div class="row"><button id="fBack" class="primary">${back ? "Back" : "Done"}</button></div>`);
    const mb = $("modalBody");
    mb.querySelectorAll("button[data-fcode]").forEach(x => x.onclick = () => editor(x.dataset.fcode, () => panel(back)));
    mb.querySelectorAll("button[data-fwatch]").forEach(x => x.onclick = () => { api.hideModal(); if (window.Render3D && Render3D.roam.watch) Render3D.roam.watch(x.dataset.fwatch); });
    mb.querySelectorAll("button[data-fon]").forEach(x => x.onclick = () => { const b = byId(x.dataset.fon); b.on = !b.on; ready(b).stuck = null; if (!b.on && live[b.id]) { payUpTo(b, live[b.id], tau(live[b.id])); delete live[b.id]; } api.persistSave(); panel(back); });
    mb.querySelectorAll("button[data-fhome]").forEach(x => x.onclick = () => { post(x.dataset.fhome, false); panel(back); });
    mb.querySelectorAll("button[data-fpost]").forEach(x => x.onclick = () => { post(x.dataset.fpost, true); panel(back); });
    $("fBack").onclick = back || api.hideModal;
  }
  function editor(id, back) {
    const b = byId(id), fm = ready(b); back = back || (() => panel());
    api.showModal(`<h2>✏️ ${b.name}'s farm program</h2><p class="muted">Squares are numbered like the blueprint: x from 0 to 9 left to right, y from 0 to 9 from the shore inland. Basket: ${Bots.val(b, "cargo") * BASKET} things · battery: ${Bots.val(b, "battery")} s of work.</p>
      <textarea id="farmCode" wrap="off" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" style="width:100%;min-height:220px;resize:vertical;font:14px/1.5 var(--mono);background:var(--term-bg);color:var(--term-ink);border:1px solid var(--line);border-radius:8px;padding:10px"></textarea>
      <div id="farmOut"></div>
      <div class="row"><button id="farmTest">🧪 Test shift</button><button id="farmSave" class="primary">💾 Save and send to work</button><button id="farmBack">Back</button></div>
      <details><summary class="muted">Every farm command (click one to add it)</summary><div style="display:grid;gap:4px;margin-top:6px">${API.map(([c, d]) => `<div><button class="small" data-ins="${c}" style="font-family:var(--mono)">${c}</button> <span class="muted">${d}</span></div>`).join("")}</div></details>`);
    const ta = $("farmCode"); ta.value = fm.draft && fm.draft !== fm.code ? fm.draft : fm.code;
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; } e.stopPropagation(); });
    $("modalBody").querySelectorAll("button[data-ins]").forEach(x => x.onclick = () => { const s = ta.selectionStart, line = ta.value.lastIndexOf("\n", s - 1) + 1, ind = (ta.value.slice(line, s).match(/^\s*/) || [""])[0]; const t = x.dataset.ins.replace("(x, y)", "(3, 4)").replace("(thing, n)", x.dataset.ins.includes("make") ? '("flour", 1)' : '("wheat", 5)').replace("(text)", '("hello")').replace("(seconds)", "(2)"); ta.value = ta.value.slice(0, s) + (s > line ? "\n" + ind : "") + t + ta.value.slice(s); ta.focus(); });
    $("farmTest").onclick = async () => { $("farmTest").disabled = true; const S = await simulate(b, (Math.random() * 1e9) | 0, ta.value); $("farmTest").disabled = false; $("farmOut").innerHTML = testView(S); };
    $("farmSave").onclick = () => { const changed = fm.code !== ta.value; fm.code = ta.value; fm.draft = null; fm.stuck = null; b.on = true; if (changed && live[b.id] && live[b.id].i === 0) delete live[b.id]; api.persistSave(); api.toast(`💾 ${b.name} will run the new farm program ${live[b.id] ? "after this shift" : "now"}.`); back(); };
    $("farmBack").onclick = () => { if (ta.value !== fm.code) fm.draft = ta.value; api.persistSave(); back(); };
  }
  function testView(S) {
    const t = (x) => Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0"), nm = (q) => (places()[q] || {}).name || q, esc = (x) => String(x).replace(/</g, "&lt;");
    const lines = S.ev.filter(e => e.a !== "charge" && e.a !== "tow").slice(0, 120).map(e => {
      const W = { go: () => `drives to ${nm(e.to)}${e.frac ? " … and the battery dies on the way" : ""}`, dig: () => `harvests ${e.n} ${F().G(e.good).icon} on square ${e.k}${e.lost ? ` (${e.lost} didn't fit)` : ""}`, pick: () => `harvests ${e.n} ${F().G(e.good).icon} on square ${e.k}${e.lost ? ` (${e.lost} didn't fit)` : ""}`,
        unload: () => `puts ${things(e.items)} in the barn`, sell: () => `ships ${things(e.sent)} for ${e.coins} 🪙`, sort: () => `starts making ${e.n} ${F().G(e.item).icon}`, look: () => "has a look", say: () => `says “${esc(e.text)}”`, wait: () => `waits ${Math.round(e.d)} s`, error: () => "gets confused", flat: () => "🔋 battery flat" };
      return `<tr><td>${t(e.t)}</td><td>${(W[e.a] || (() => e.a))()}</td><td>${Math.round((e.b1 !== undefined ? e.b1 : 1) * 100)}%</td></tr>`;
    }).join("");
    const err = S.error ? `<div style="background:#3a1f22;color:#ffd0c0;border-radius:8px;padding:8px 10px;margin:8px 0;font:13px/1.4 var(--mono)">${S.error.line ? "Line " + S.error.line + ": " : ""}${esc(S.error.raw)}${S.error.tip ? `<div style="font-family:inherit;margin-top:4px">💡 ${esc(S.error.tip)}</div>` : ""}</div>` : "";
    return `${err}<p><b>Test shift:</b> ${S.s.picked} harvested, ${S.s.stored} into the barn${S.s.made ? `, ${S.s.made} started at the machines` : ""}${S.s.coins ? `, shipped for ${S.s.coins} 🪙` : ""}, ${S.flat ? "🔋 ran flat" : `home with ${Math.round(S.left * 100)}% battery`}, ${t(S.work)} of work. <span class="muted">Only a test: the island didn't change.</span></p>
      ${lines ? `<div class="tablewrap" style="max-height:220px;overflow:auto"><table class="goods"><tr><th>Time</th><th>What it did</th><th>🔋</th></tr>${lines}</table></div>` : `<p class="muted">It had nothing to do. Nothing is ripe right now?</p>`}`;
  }
  function summary() { const c = crew(); return c.length ? c.map(b => `<span style="color:${b.color}">●</span> ${b.name}: ${status(b).replace(/^🏝️ /, "")}`).join(" · ") : null; }

  return { init(a) { api = a; }, PAD, start, stop, poses, status, panel, editor, post, canPost, summary, get PLACES() { return places(); }, STARTER,
    debug: { simulate: (b, code, seed) => simulate(b, seed || 1, code), live, tick, catchUp, set speed(v) { speed = v; }, get speed() { return speed; } } };
})();
window.Farmhands = Farmhands;
