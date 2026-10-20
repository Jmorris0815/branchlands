// Botworks: helper robots that run the player's own Python. Build one at the Bot Dock by the harbor, write its
// program (import bot), and it goes to work in Harbor Town: fishing off the pier, picking apples in Pip's
// orchard, digging on the west beach, selling at the market, feeding the Fish Sorter. Each shift is worked out
// first (the code runs once, start to finish, against a model of the town) and then played back in 3D, so what
// you see is exactly what the code did. Bots keep working while the game is closed: the next visit works out
// how many shifts fit into the time away and pays for them.

const Bots = (() => {
  const $ = (id) => document.getElementById(id);
  let api, deps; // api: the hub's api (save, persistSave, showModal, hideModal, toast, sfx); deps: { FISH, sorterCode() }

  // Where bots can go. Three slots per place so a crew doesn't pile up; look is the point a bot faces while working.
  const PLACES = {
    dock: { name: "the Bot Dock", slots: [{ x: 10.9, z: 13.35, look: [10.9, 12] }, { x: 11.6, z: 13.35, look: [11.6, 12] }, { x: 12.3, z: 13.35, look: [12.3, 12] }] },
    pier: { name: "the pier", slots: [{ x: 0.95, z: 19.3, look: [4, 19.3] }, { x: -0.95, z: 21.2, look: [-4, 21.2] }, { x: -0.95, z: 22.6, look: [-4, 22.6] }] },
    sorter: { name: "the Fish Sorter", slots: [{ x: 3.5, z: 14.7, look: [5, 15] }, { x: 3.5, z: 15.6, look: [5, 15.2] }, { x: 3.2, z: 16.4, look: [5, 15.4] }] },
    market: { name: "the market", slots: [{ x: -7.4, z: 1.1, look: [-8.7, 1.3] }, { x: -7.5, z: 2.3, look: [-8.7, 1.4] }, { x: -7.3, z: 0, look: [-8.7, 1.2] }] },
    orchard: { name: "Pip's orchard", slots: [{ x: -15.2, z: -12.2, look: [-16.3, -11.1] }, { x: -17.4, z: -14.4, look: [-18.5, -13.3] }, { x: -15.2, z: -14.4, look: [-14.1, -15.5] }] },
    beach: { name: "the west beach", slots: [{ x: -22.5, z: 5, look: [-26, 5] }, { x: -22.8, z: 7, look: [-26, 7.2] }, { x: -22, z: 3.5, look: [-26, 3.2] }] },
  };
  // Upgrades for each bot: the value at each level, what the next level costs, and the Robotics level it needs.
  const UP = {
    cargo: { name: "Cargo basket", icon: "🧺", vals: [3, 5, 8, 12], fmt: v => v + " items", costs: [0, 120, 300, 700], mats: [null, { plank: 2 }, { plank: 4, scrap: 3 }, { crate: 1 }], req: [0, 1, 3, 5] },
    battery: { name: "Battery", icon: "🔋", vals: [90, 130, 180, 240], fmt: v => v + " s of work", costs: [0, 150, 350, 800], mats: [null, { scrap: 3 }, { glass: 3 }, { clockstone: 1 }], req: [0, 2, 4, 6] },
    wheels: { name: "Wheels", icon: "🛞", vals: [1.6, 2.1, 2.7, 3.3], fmt: v => v + " m/s", costs: [0, 100, 280, 650], mats: [null, { scrap: 2 }, { stone: 4 }, { shard: 2 }], req: [0, 1, 3, 5] },
    rod: { name: "Fishing rod", icon: "🎣", vals: [1, 2, 3, 4], fmt: v => ["sardines and mackerel", "sea bass too", "salmon too", "golden koi too"][v - 1], costs: [0, 150, 400, 900], mats: [null, { plank: 2 }, { lens: 1 }, { prism: 1 }], req: [0, 2, 4, 7] },
  };
  // The dock itself: how fast it charges a flat bot, how much the crate holds.
  const DOCK = { charge: [60, 40, 25, 15], crate: [30, 60, 120, 250], costs: [0, 200, 500, 1000], mats: [null, { scrap: 4 }, { plank: 6, glass: 2 }, { clockstone: 1, crate: 1 }], req: [0, 2, 4, 6] };
  const BUILD = [{ coins: 0, req: 0 }, { coins: 350, mats: { scrap: 4 }, req: 3 }, { coins: 900, mats: { crate: 1 }, req: 6 }];
  const COLORS = ["#e8702a", "#3f9ad8", "#3fbf6a", "#c95ad8", "#e6b422", "#e04a5a", "#5fc8c0", "#f2f2f2"];
  const NAMES = ["Sprocket", "Widget", "Gizmo", "Rivet", "Pixel", "Chip", "Nugget", "Cog"];
  const ROD_SPEED = [1, 1.2, 1.45, 1.75];
  const MAX_AWAY = 4 * 3600, FULL_PACE = 1200; // offline: the first 20 minutes at full pace, then about a third of the pace, up to 4 hours
  const STARTER = `import bot

# Your bot's first shift: catch three fish, sell them, come home.
bot.go("pier")
bot.fish()
bot.fish()
bot.fish()
bot.go("market")
bot.sell_all()
bot.go("dock")
`;
  // Every command, for the help list in the code editor (and the error tips).
  const API = [
    ["bot.go(place)", "drive to a place: \"dock\", \"pier\", \"sorter\", \"market\", \"orchard\" or \"beach\""],
    ["bot.fish()", "at the pier: wait for a bite, give back the fish"],
    ["bot.pick()", "in the orchard: pick an apple"],
    ["bot.dig()", "on the beach: dig, give back what you found (or None)"],
    ["bot.sell(item)", "at the market: sell one thing from the cargo, give back the coins"],
    ["bot.sell_all()", "at the market: sell the whole cargo"],
    ["bot.sort()", "at the Fish Sorter: run your sort(fish) on every fish in the cargo"],
    ["bot.unload()", "at the dock: put the cargo in the crate for you to collect"],
    ["bot.release(item)", "throw something back"],
    ["bot.cargo()", "a list of what it carries; each thing is a dictionary"],
    ["bot.full()", "True when the cargo basket is full"],
    ["bot.space()", "how many more things fit"],
    ["bot.battery()", "battery left, 0 to 100"],
    ["bot.cost(place)", "how much battery the drive to place takes"],
    ["bot.where()", "the place it is at"],
    ["bot.say(text)", "a speech bubble over its head"],
    ["bot.wait(seconds)", "stand still for a bit"],
  ];

  // ---------- save ----------
  function st() {
    const s = api.save();
    if (!s.bots) s.bots = { crew: [], dock: 0, crate: {}, last: Date.now(), flags: {}, total: { coins: 0, shifts: 0 } };
    const b = s.bots; b.flags = b.flags || {}; b.crate = b.crate || {}; b.total = b.total || { coins: 0, shifts: 0 };
    return b;
  }
  const crateCount = () => Object.values(st().crate).reduce((a, n) => a + n, 0);
  const crateCap = () => DOCK.crate[st().dock];
  const val = (b, k) => UP[k].vals[b.up[k]];
  const robo = () => RPG.skillLevel("robotics");
  const flag = (k) => { const s = st(); if (s.flags[k]) return false; s.flags[k] = true; return true; };

  // ---------- the simulation ----------
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const FLAT = { flat: true };
  class BotError extends Error {}
  const ITEM = {
    apple: { kind: "fruit", base: 4 }, scrap: { kind: "junk", base: 6 }, glass: { kind: "glass", base: 18 }, gem: { kind: "gem", base: 30 }, boot: { kind: "junk", base: 1 },
  };
  function dist(a, b) { const p = PLACES[a].slots[0], q = PLACES[b].slots[0]; return Math.hypot(p.x - q.x, p.z - q.z) * 1.3 + 0.5; }

  class Sim {
    constructor(b, seed, crateRoom) {
      this.b = b; this.r = rng(seed); this.cap = val(b, "battery"); this.batt = this.cap; this.speed = val(b, "wheels"); this.size = val(b, "cargo"); this.rod = val(b, "rod");
      this.t = 0; this.at = "dock"; this.cargo = []; this.ev = []; this.coins = 0; this.got = {}; this.n = 0; this.calls = 0; this.flat = false; this.out = []; this.room = crateRoom;
      this.s = { fish: 0, soldFish: 0, cheapSold: 0, cheapKept: 0, sorted: 0, apples: 0, gems: 0, unloaded: 0, koi: 0 };
    }
    names() { return this.cargo.map(c => c.name); }
    // spend battery on an action that takes sec seconds; if the battery runs out partway, the bot stops right there
    act(a, sec, extra) {
      const e = Object.assign({ a, t: this.t, at: this.at, b0: this.batt / this.cap }, extra || {});
      if (sec >= this.batt) { e.d = this.batt; e.frac = sec ? this.batt / sec : 1; this.t += this.batt; this.batt = 0; this.flat = true; e.b1 = 0; e.carry = this.names(); this.ev.push(e); this.flatEv = e; throw FLAT; }
      e.d = sec; this.t += sec; this.batt -= sec; e.b1 = this.batt / this.cap; this.ev.push(e); return e;
    }
    ask() { if (++this.calls > 20000) throw new BotError("Your bot was asked 20,000 questions in one shift without doing anything. Is there a loop with no bot command that takes time inside it?"); }
    need(place, what) { if (this.at !== place) throw new BotError(`bot.${what}() only works at ${PLACES[place].name}, and your bot is at ${PLACES[this.at].name}. Use bot.go("${place}") first.`); }
    roomFor(what) { if (this.cargo.length >= this.size) throw new BotError(`The cargo basket is full (${this.size} of ${this.size}), so bot.${what}() has nowhere to put it. Sell, sort or unload first. bot.full() tells you when it's full.`); }
    item(name, extra) { const base = extra && extra.base !== undefined ? extra.base : (RPG.GOODS[name] ? RPG.GOODS[name].base : ITEM[name].base); return Object.assign({ id: ++this.n, name, kind: (ITEM[name] || {}).kind || "fish", price: Math.max(1, Math.round(base * (0.6 + this.r() * 0.8))), base }, extra || {}); }
    find(it) { const id = it && typeof it === "object" ? it.id : null, i = this.cargo.findIndex(c => c.id === id); if (i < 0) throw new BotError("That isn't in the cargo any more. Give bot.sell() or bot.release() one of the things from bot.cargo()."); return i; }
    place(p) { p = String(p).toLowerCase().trim(); if (!PLACES[p]) throw new BotError(`There's no place called "${p}". Places: ${Object.keys(PLACES).map(k => `"${k}"`).join(", ")}.`); return p; }
    go(p) {
      p = this.place(p); this.ask(); if (p === this.at) return;
      const from = this.at; this.act("go", dist(from, p) / this.speed, { from, to: p }); this.at = p; this.ev[this.ev.length - 1].carry = this.names();
    }
    bite() {
      const pool = deps.FISH.filter(f => !f.gull && (f.lvl || 1) <= this.rod);
      const w = f => f.boot ? f.w * Math.max(0.3, 1 - (this.rod - 1) * 0.2) : f.w;
      let k = this.r() * pool.reduce((a, f) => a + w(f), 0), f = pool[0]; for (const x of pool) { k -= w(x); if (k <= 0) { f = x; break; } }
      if (f.boot) return this.item("boot", { cm: 28 });
      return this.item(f.id, { cm: Math.round(f.cm[0] + this.r() * this.r() * (f.cm[1] - f.cm[0])) });
    }
    fish() {
      this.need("pier", "fish"); this.roomFor("fish");
      const e = this.act("fish", (3.5 + this.r() * 5) / ROD_SPEED[this.rod - 1]), f = this.bite();
      this.cargo.push(f); e.item = f.name; e.carry = this.names(); if (f.kind === "fish") this.s.fish++; if (f.name === "koi") this.s.koi++;
      return f;
    }
    pick() { this.need("orchard", "pick"); this.roomFor("pick"); const e = this.act("pick", 2.5 + this.r() * 1.5), f = this.item("apple"); this.cargo.push(f); e.item = "apple"; e.carry = this.names(); return f; }
    dig() {
      this.need("beach", "dig"); this.roomFor("dig"); const e = this.act("dig", 3), k = this.r();
      const name = k < 0.42 ? null : k < 0.75 ? "scrap" : k < 0.93 ? "glass" : "gem"; e.item = name; if (!name) { e.carry = this.names(); return null; }
      const f = this.item(name); this.cargo.push(f); e.carry = this.names(); if (name === "gem") this.s.gems++; return f;
    }
    earn(f) { this.coins += f.price; if (f.kind === "fish") { this.s.soldFish++; if (f.price < f.base) this.s.cheapSold++; } }
    sell(it) { this.need("market", "sell"); const i = this.find(it), f = this.cargo[i]; this.cargo.splice(i, 1); this.earn(f); const e = this.act("sell", 0.8, { coins: f.price, item: f.name }); e.carry = this.names(); return f.price; }
    sell_all() {
      this.need("market", "sell_all"); const got = this.cargo.splice(0); let c = 0; for (const f of got) { this.earn(f); c += f.price; }
      const e = this.act("sell", 0.6 + 0.35 * got.length, { coins: c, item: got.length ? got[0].name : null }); e.carry = this.names(); return c;
    }
    release(it) { const i = this.find(it), f = this.cargo[i]; this.cargo.splice(i, 1); if (f.kind === "fish" && f.price < f.base) this.s.cheapKept++; const e = this.act("release", 0.4, { item: f.name }); e.carry = this.names(); return null; }
    sort() {
      this.need("sorter", "sort"); if (!this.sortMod) throw new BotError("The Fish Sorter has no code yet. Finish its first job by the water, then bot.sort() runs your sort(fish) on the cargo.");
      const out = { keep: 0, sell: 0, sea: 0 }; let coins = 0; const keep = [];
      for (const f of this.cargo) {
        if (f.kind !== "fish") { keep.push(f); continue; }
        const r = PY.call(this.sortMod, "sort", [{ name: f.name, cm: f.cm, price: f.price, base: f.base }]); if (r.error) throw new BotError("Your sort() crashed on a " + f.name + ": " + r.error);
        const v = typeof r.value === "string" ? r.value.trim().toLowerCase() : r.value;
        if (!(v in out)) throw new BotError(`Your sort() gave back ${JSON.stringify(r.value === undefined ? null : r.value)} for a ${f.name}. It has to return "keep", "sell" or "sea".`);
        out[v]++; this.s.sorted++; if (v === "sell") { this.earn(f); coins += f.price; } else if (v === "keep") keep.push(f); else if (f.price < f.base) this.s.cheapKept++;
      }
      const n = this.cargo.length; this.cargo = keep; const e = this.act("sort", 1 + 0.7 * n, { coins, sorted: out }); e.carry = this.names(); return out;
    }
    unload(auto) {
      if (!auto) this.need("dock", "unload");
      const moved = {}; let k = 0; const left = [];
      for (const f of this.cargo) { if (this.room <= 0) { left.push(f); continue; } const g = f.name === "boot" ? "scrap" : f.name; moved[g] = (moved[g] || 0) + 1; this.room--; k++; if (f.kind === "fish" && f.price < f.base) this.s.cheapKept++; if (f.name === "apple") this.s.apples++; }
      this.cargo = left; this.s.unloaded += k; for (const g in moved) this.got[g] = (this.got[g] || 0) + moved[g];
      if (auto) { this.ev.push({ a: "unload", t: this.t, d: 1.5, at: this.at, items: moved, b0: this.batt / this.cap, b1: this.batt / this.cap, carry: this.names() }); this.t += 1.5; return k; }
      const e = this.act("unload", 1.5, { items: moved }); e.carry = this.names(); return k;
    }
    say(text) { this.ask(); this.ev.push({ a: "say", t: this.t, d: 0, at: this.at, text: String(text).slice(0, 60), b0: this.batt / this.cap, b1: this.batt / this.cap, carry: this.names() }); }
    wait(s) { const n = Math.max(0, Math.min(30, Number(s) || 0)); this.act("wait", n); }
    battery() { this.ask(); return Math.floor(this.batt / this.cap * 100); }
    cost(p) { this.ask(); p = this.place(p); return p === this.at ? 0 : Math.ceil(dist(this.at, p) / this.speed / this.cap * 100); }
    // after the program: drive home (if there's battery for it), get towed if not, unload, charge
    finish(error) {
      this.error = error; if (error) this.ev.push({ a: "error", t: this.t, d: 2.5, at: this.at, text: "?!", b0: this.batt / this.cap, b1: this.batt / this.cap, carry: this.names() }), this.t += 2.5;
      if (!this.flat && this.at !== "dock") { try { this.go("dock"); } catch (e) { if (e !== FLAT) throw e; } }
      this.left = this.batt / this.cap; this.work = this.t;
      if (this.flat) { const f = this.flatEv; this.lost = this.cargo.length; this.ev.push({ a: "flat", t: this.t, d: 4, at: f.at, from: f.from, to: f.to, frac: f.frac, b0: 0, b1: 0, carry: this.names() }); this.t += 4; this.cargo = []; this.ev.push({ a: "tow", t: this.t, d: 0, at: "dock", b0: 0, b1: 0, carry: [] }); this.at = "dock"; }
      if (this.cargo.length) this.unload(true);
      const dk = st().dock, d = Math.max(5, DOCK.charge[dk] * Math.max(0.15, 1 - this.batt / this.cap));
      this.xp = error && this.work < 1 ? 0 : this.flat || error ? 1 : Math.max(2, Math.round(this.coins / 4 + this.s.unloaded / 2));
      this.ev.push({ a: "charge", t: this.t, d, at: "dock", b0: this.batt / this.cap, b1: 1, carry: [], xp: this.xp }); this.t += d;
    }
  }
  // Skulpt gets a `bot` module whose functions call the Sim that's running.
  function installModule() {
    if (Sk.builtinFiles.files["src/lib/bot.js"]) return;
    const plain = ["fish", "pick", "dig", "sell_all", "sort", "unload", "cargo", "full", "space", "battery", "where", "name"];
    Sk.builtinFiles.files["src/lib/bot.js"] = `
var $builtinmodule = function (name) {
  var mod = {};
  function sim() { var s = window.__botsim; if (!s) throw new Sk.builtin.RuntimeError("no bot is running"); return s; }
  function call(fn, args) { try { return Sk.ffi.remapToPy(window.__botcall(fn, args)); } catch (e) { if (e && e.flat) throw new Sk.builtin.RuntimeError("BATTERY_FLAT"); if (e && e.botError) throw new Sk.builtin.RuntimeError("BOT: " + e.message); throw e; } }
  ${plain.map(n => `mod.${n} = new Sk.builtin.func(function () { return call("${n}", []); });`).join("\n  ")}
  ${["go", "sell", "release", "say", "wait", "cost"].map(n => `mod.${n} = new Sk.builtin.func(function (a) { return call("${n}", [a === undefined ? undefined : Sk.ffi.remapToJs(a)]); });`).join("\n  ")}
  return mod;
};`;
    window.__botcall = (fn, args) => {
      const S = window.__botsim;
      try {
        if (fn === "cargo") { S.ask(); return S.cargo.map(c => ({ ...c })); }
        if (fn === "full") { S.ask(); return S.cargo.length >= S.size; }
        if (fn === "space") { S.ask(); return S.size - S.cargo.length; }
        if (fn === "where") { S.ask(); return S.at; }
        if (fn === "name") { S.ask(); return S.b.name; }
        if (["go", "sell", "release", "cost"].includes(fn) && args[0] === undefined) throw new BotError(`bot.${fn}() needs something in the parentheses.`);
        const r = S[fn](...args); return r === undefined ? null : r && typeof r === "object" && r.id ? { ...r } : r;
      } catch (e) { if (e instanceof BotError) e.botError = true; throw e; }
    };
  }
  function friendly(err) {
    const s = String(err), line = (s.match(/on line (\d+)/) || [])[1];
    let raw = s.replace(/^RuntimeError: BOT: /, "").replace(/ on line \d+$/, ""), tip = null;
    if (/BOT: /.test(s)) tip = null;
    else if (/NameError: name 'bot'/.test(s)) tip = "Put  import bot  on the first line.";
    else if (/AttributeError: 'module' object has no attribute '(\w+)'/.test(s)) tip = `bot has no command called ${s.match(/attribute '(\w+)'/)[1]}. The list is under the code box.`;
    else if (/NameError/.test(s)) tip = "Something isn't defined. Check the spelling and capital letters.";
    else if (/SyntaxError|bad input|bad token/.test(s)) tip = "Python can't read this line. Check the colon at the end of for / while / if / def lines, and the quotes and brackets.";
    else if (/Indentation|unindent|indented block/.test(s)) tip = "Indent with 4 spaces inside for / while / if / def blocks.";
    else if (/TimeLimitError/.test(s)) { raw = "Your code ran for ages without the bot doing anything."; tip = "A while loop with no bot command inside? Every loop needs something that uses battery, like go, fish or wait."; }
    else if (/TypeError.*(subscript|attribute).*NoneType|NoneType/.test(s)) tip = "Something gave back None. bot.dig() gives back None when it finds nothing: check  if thing:  before you use it.";
    else if (/KeyError/.test(s)) tip = "That key isn't in the dictionary. Things in the cargo have \"name\", \"kind\", \"price\" and \"base\" (and fish have \"cm\").";
    return { raw, tip, line: line ? +line : null };
  }
  const sortCache = { code: null, mod: null };
  async function simulate(b, seed, crateRoom) {
    const S = new Sim(b, seed, crateRoom === undefined ? Math.max(0, crateCap() - crateCount()) : crateRoom);
    if (typeof Sk === "undefined") { S.finish({ raw: "The Python engine hasn't loaded.", tip: "Check the internet connection and reload." }); return S; }
    installModule();
    const conf = (out) => Sk.configure({ output: out, read: x => { if (!Sk.builtinFiles || !Sk.builtinFiles.files[x]) throw "File not found: '" + x + "'"; return Sk.builtinFiles.files[x]; }, __future__: Sk.python3, execLimit: 3000 });
    if (/bot\.sort\s*\(/.test(b.code)) {
      const code = deps.sorterCode();
      if (code && sortCache.code !== code) { conf(() => {}); try { sortCache.mod = await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<sorter>", false, code, true)); sortCache.code = code; } catch (e) { sortCache.mod = null; sortCache.code = null; } }
      S.sortMod = code ? sortCache.mod : null;
    }
    conf(t => { const l = String(t).replace(/\n$/, ""); if (l) { S.out.push(l); S.ev.push({ a: "print", t: S.t, d: 0, at: S.at, text: l, b0: S.batt / S.cap, b1: S.batt / S.cap, carry: S.names() }); } });
    window.__botsim = S; let error = null;
    try { await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<bot>", false, b.code, true)); }
    catch (e) { if (!/BATTERY_FLAT/.test(String(e)) && e !== FLAT) error = friendly(e); }
    window.__botsim = null;
    S.finish(error);
    return S;
  }
  // what a finished shift earned toward Wrenna's contracts
  function shiftFlags(b, S) {
    const ok = !S.error && !S.flat, out = [];
    const f = (k, cond) => { if (cond) out.push(k); };
    f("shift_ok", ok && (S.coins > 0 || S.s.unloaded > 0)); f("coins40", ok && S.coins >= 40);
    f("tight", ok && S.left < 0.15 && S.work > 40); f("picky", !S.error && S.s.soldFish >= 3 && S.s.cheapSold === 0 && S.s.cheapKept >= 1);
    f("sorted", !S.error && S.s.sorted >= 3); f("apples10", S.s.apples >= 10); f("gem", S.s.gems > 0); f("koi", S.s.koi > 0);
    f("func", ok && /^\s*def\s+\w+\s*\(/m.test(b.code) && S.coins > 0);
    return out;
  }

  // ---------- the crew at work (live, while the town is open) ----------
  const live = {}; // bot id → { S, t0, i (next event to pay out), pops }
  let timer = null, busy = false, speed = 1, report = null;
  const now = () => Date.now();
  const tau = L => (now() - L.t0) / 1000 * speed;
  function start() {
    clearInterval(timer); timer = setInterval(tick, 400);
    catchUp().then(rep => { if (rep && rep.bots.some(x => x.shifts || x.err)) { report = rep; showReport(); } tick(); });
  }
  function stop() {
    clearInterval(timer); timer = null;
    for (const b of st().crew) { const L = live[b.id]; if (L) payUpTo(b, L, tau(L)); delete live[b.id]; }
    st().last = now(); api.persistSave();
  }
  async function tick() {
    if (busy) return; const s = st();
    for (const b of s.crew) {
      const L = live[b.id];
      if (L) { const t = tau(L); payUpTo(b, L, t); if (t >= L.S.t) { endShift(b, L.S, true); delete live[b.id]; } continue; }
      if (!b.on || b.stuck || !b.code) continue;
      busy = true;
      try {
        const S = await simulate(b, hash(b.id) ^ (b.shiftNo++ * 7919));
        if (S.error && S.work < 1) { b.stuck = S.error; api.toast(`🤖 <b>${b.name}</b> can't start: ${S.error.raw}`); api.persistSave(); }
        else if (timer) live[b.id] = { S, t0: now(), i: 0, pops: [] }; // (not if the town closed while it was thinking)
      } finally { busy = false; }
    }
    s.last = now();
  }
  // pay out every event that has finished by time t (coins at the market and sorter, things into the crate)
  function payUpTo(b, L, t) {
    const ev = L.S.ev, s = st();
    while (L.i < ev.length && ev[L.i].t + ev[L.i].d <= t) {
      const e = ev[L.i++];
      if (e.coins) { RPG.addCoins(e.coins); b.stats.coins += e.coins; s.total.coins += e.coins; L.pops.push({ text: "+" + e.coins + " 🪙", at: now() }); }
      if (e.items) { let n = 0; for (const g in e.items) { const k = Math.min(e.items[g], Math.max(0, crateCap() - crateCount())); if (k) { s.crate[g] = (s.crate[g] || 0) + k; n += k; } } if (n) L.pops.push({ text: "+" + n + " 📦", at: now() }); }
      if (e.a === "fish" && (e.item === "koi" || e.item === "salmon")) api.toast(`🤖 ${b.name} caught a ${RPG.GOODS[e.item].name.toLowerCase()}!`);
      if (e.xp) RPG.addXp("robotics", e.xp);
    }
  }
  // a shift is over: log it, count it, and see whether it finished one of Wrenna's contracts
  function endShift(b, S, show) {
    const s = st(); b.stats.shifts++; s.total.shifts++; if (S.flat) b.stats.flats++; if (S.error) b.stats.errors++; else b.stats.ok = (b.stats.ok || 0) + 1;
    if (S.coins > (b.stats.best || 0)) b.stats.best = S.coins;
    b.log.unshift({ at: now(), coins: S.coins, items: S.got, flat: S.flat, lost: S.lost || 0, err: S.error ? S.error.raw : null, line: S.error ? S.error.line : null, left: Math.round(S.left * 100), out: S.out.slice(-3) }); b.log.length = Math.min(b.log.length, 8);
    for (const k of shiftFlags(b, S)) if (flag(k) && show) api.toast(`🤖 <b>${b.name}</b>: ${FLAG_TEXT[k]}`);
    if (s.crew.length >= 3 && s.crew.every(x => x.stats.ok)) flag("crew3");
    if (show && S.flat) api.toast(`🔋 <b>${b.name}</b> ran flat${S.lost ? ` and lost ${S.lost} thing${S.lost > 1 ? "s" : ""} in the cargo` : ""}. Wrenna towed it home. Check <code>bot.battery()</code> or <code>bot.cost("dock")</code> before the battery runs out.`);
    api.persistSave();
  }
  const FLAG_TEXT = { shift_ok: "first good shift! It came home with something to show for it.", coins40: "40 coins in one shift.", tight: "home with under 15% battery left. Cutting it fine on purpose.", picky: "sold only the fish worth their price.", sorted: "the Fish Sorter ran your code for it.", apples10: "ten apples in the crate in one shift.", gem: "dug up a gem on the beach!", koi: "a golden koi off the pier!", func: "a shift that runs on a function you wrote." };

  // ---------- while you were away ----------
  async function catchUp() {
    const s = st(), t = now(), away = (t - (s.last || t)) / 1000; s.last = t;
    if (away < 30 || !s.crew.length) return null;
    const capped = Math.min(away, MAX_AWAY), eff = Math.min(capped, FULL_PACE) + Math.max(0, capped - FULL_PACE) * 0.35;
    const rep = { away, bots: [], coins: 0, items: {} }; busy = true;
    try {
      for (const b of s.crew) {
        const R = { b, shifts: 0, coins: 0, items: {}, flats: 0, err: null }; rep.bots.push(R);
        if (!b.on || !b.code || b.stuck) { R.off = true; continue; }
        const runs = []; let used = 0;
        while (runs.length < 6 && used < eff) { const S = await simulate(b, hash(b.id) ^ (b.shiftNo++ * 7919), 1e9); if (S.error && S.work < 1) { b.stuck = S.error; R.err = S.error.raw; break; } runs.push(S); used += S.t; }
        if (!runs.length) continue;
        const avg = used / runs.length, n = Math.max(0, Math.floor(eff / avg)); if (!n) continue;
        const take = runs.slice(0, Math.min(n, runs.length)), k = n / take.length;
        R.shifts = n; R.coins = Math.round(take.reduce((a, S) => a + S.coins, 0) * k); R.flats = Math.round(take.filter(S => S.flat).length * k);
        const err = take.find(S => S.error); if (err) R.err = err.error.raw;
        for (const S of take) for (const g in S.got) R.items[g] = (R.items[g] || 0) + S.got[g] * k;
        const xp = Math.round(take.reduce((a, S) => a + S.xp, 0) * k);
        RPG.addCoins(R.coins); RPG.addXp("robotics", Math.round(xp / 2)); b.stats.coins += R.coins; b.stats.shifts += n; s.total.coins += R.coins; s.total.shifts += n; rep.coins += R.coins;
        for (const g in R.items) { const want = Math.round(R.items[g]), k2 = Math.min(want, Math.max(0, crateCap() - crateCount())); R.items[g] = k2; if (k2) s.crate[g] = (s.crate[g] || 0) + k2; rep.items[g] = (rep.items[g] || 0) + k2; }
        for (const S of take) for (const f of shiftFlags(b, S)) flag(f);
        if (!take.some(S => S.error)) b.stats.ok = (b.stats.ok || 0) + 1;
        b.log.unshift({ at: t, away: true, shifts: n, coins: R.coins, items: R.items, flat: R.flats > 0, err: R.err }); b.log.length = Math.min(b.log.length, 8);
      }
      if (rep.coins >= 500) flag("night500");
      if (s.crew.length >= 3 && s.crew.every(x => x.stats.ok)) flag("crew3");
    } finally { busy = false; }
    api.persistSave();
    return rep;
  }
  const dur = (sec) => sec >= 3600 ? Math.floor(sec / 3600) + " h " + Math.floor(sec % 3600 / 60) + " min" : Math.max(1, Math.round(sec / 60)) + " min";
  const things = (m) => Object.entries(m).filter(([, n]) => n > 0).map(([g, n]) => `${n} ${RPG.GOODS[g] ? RPG.GOODS[g].icon : "❔"}`).join(" ") || "nothing";
  function showReport() {
    const rep = report; if (!rep || !$("modal").hidden) return; report = null;
    api.showModal(`<h2>🤖 While you were away</h2><p>You were gone ${dur(rep.away)}${rep.away > MAX_AWAY ? " (bots work up to 4 hours unattended)" : ""}. Your crew kept working${rep.away > FULL_PACE ? ", slower once it got late" : ""}.</p>
      <div class="tablewrap"><table class="goods"><tr><th>Bot</th><th>Shifts</th><th>Coins</th><th>Into the crate</th><th></th></tr>
      ${rep.bots.map(R => `<tr><td><span style="color:${R.b.color}">●</span> ${R.b.name}</td><td>${R.off ? "off" : R.shifts}</td><td>${R.coins ? "+" + R.coins + " 🪙" : "–"}</td><td>${things(R.items)}</td><td>${R.err ? `<span style="color:#e05a4a">⚠ ${R.err.replace(/</g, "&lt;")}</span>` : R.flats ? `🔋 ran flat ${R.flats}×` : R.off ? "" : "✓"}</td></tr>`).join("")}</table></div>
      <p><b>+${rep.coins} 🪙</b> in all. ${crateCount() ? `The crate at the Bot Dock has ${crateCount()} things in it.` : ""}</p>
      <div class="row"><button id="repDock" class="primary">Open the Bot Dock</button><button id="closeBtn">Back to town</button></div>`);
    api.sfx("gem"); $("repDock").onclick = () => hq(); $("closeBtn").onclick = api.hideModal;
  }

  // ---------- what the 3D town draws: where each bot is and what it's doing right now ----------
  function poses() {
    const s = st(); if (!s.crew.length) return [];
    return s.crew.map((b, i) => {
      const base = { id: b.id, name: b.name, color: b.color, slot: i };
      const L = live[b.id];
      if (!L) return { ...base, place: "dock", act: !b.on ? "off" : b.stuck ? "stuck" : "charge", k: 0, carry: [], batt: 1, say: b.stuck ? "Fix my code!" : null };
      const t = tau(L), ev = L.S.ev; let j = 0; for (let q = 0; q < ev.length; q++) { if (ev[q].t <= t) j = q; else break; }
      let e = ev[j]; while (j > 0 && e.d === 0 && ["say", "print", "tow"].indexOf(e.a) < 0) e = ev[--j];
      base.et = e.t;
      const k = e.d ? Math.min(1, (t - e.t) / e.d) : 1, done = t >= e.t + e.d;
      let say = null; for (let q = j; q >= 0 && q > j - 8; q--) { const x = ev[q]; if ((x.a === "say" || x.a === "print") && t - x.t < 3.2) { say = x.text; break; } if (x.a === "error" && t - x.t < 3) { say = "?!"; break; } }
      const pops = L.pops.filter(p => now() - p.at < 1400); L.pops = pops;
      const batt = e.b0 + (e.b1 - e.b0) * k;
      if (e.a === "go") return { ...base, act: "go", from: e.from, to: e.to, k: done ? 1 : k * (e.frac || 1), place: done ? e.to : e.from, carry: e.carry, batt, say, pops };
      if (e.a === "flat") return { ...base, act: "flat", from: e.from, to: e.to, k: e.frac || 1, place: e.at, carry: e.carry, batt: 0, say: "zzz", pops };
      const act = done && ["fish", "pick", "dig", "sell", "sort", "unload", "release", "wait"].includes(e.a) ? "stand" : e.a;
      const carry = !done && e.item && ["fish", "pick", "dig"].includes(e.a) ? e.carry.slice(0, -1) : e.carry; // it isn't in the basket until it's caught
      return { ...base, act, place: e.at, k, item: e.item, carry, batt, say, pops };
    });
  }

  // ---------- the Bot Dock (crew, code, upgrades, crate) ----------
  function newBot() {
    const s = st(), i = s.crew.length, used = s.crew.map(b => b.name);
    return { id: "b" + (i + 1) + "-" + now().toString(36).slice(-4), name: NAMES.find(n => !used.includes(n)) || "Bot " + (i + 1), color: COLORS[i % COLORS.length], code: STARTER, on: true, up: { cargo: 0, battery: 0, wheels: 0, rod: 0 }, stats: { shifts: 0, coins: 0, flats: 0, errors: 0, best: 0, ok: 0 }, log: [], shiftNo: 0, stuck: null };
  }
  const matText = (m) => m ? Object.entries(m).map(([g, n]) => `${n} ${RPG.GOODS[g].icon}`).join(" ") : "";
  const hasMats = (m) => !m || Object.entries(m).every(([g, n]) => RPG.have(g) >= n);
  const takeMats = (m) => { if (m) for (const [g, n] of Object.entries(m)) RPG.take(g, n); };
  function status(b) {
    const L = live[b.id]; if (!b.on) return "switched off"; if (b.stuck) return "⚠ stuck: needs a code fix"; if (!L) return "charging at the dock";
    const p = poses().find(x => x.id === b.id) || {}; const where = PLACES[p.place] ? PLACES[p.place].name : "";
    return { go: `driving to ${PLACES[p.to] ? PLACES[p.to].name : "?"}`, fish: "fishing off the pier", pick: "picking apples", dig: "digging on the beach", sell: "selling at the market", sort: "at the Fish Sorter", unload: "unloading at the dock", charge: "charging at the dock", flat: "flat battery!", error: "confused by its code", wait: "waiting", stand: "at " + where }[p.act] || "at " + where;
  }
  function hq() {
    const s = st(), R = robo(), next = BUILD[s.crew.length];
    const bar = (v, c) => `<span style="display:inline-block;width:70px;height:8px;border-radius:4px;background:rgba(128,128,128,0.3);vertical-align:middle"><span style="display:block;height:8px;border-radius:4px;width:${Math.round(v * 100)}%;background:${c}"></span></span>`;
    const card = (b) => { const p = poses().find(x => x.id === b.id) || { batt: 1 }; return `<div class="card"><div class="ct"><span class="big" style="color:${b.color}">🤖</span> <b>${b.name}</b></div>
      <div class="muted">${status(b)}</div><div class="muted">🔋 ${bar(p.batt, p.batt < 0.25 ? "#e05a4a" : "#3fbf6a")} · ${b.stats.shifts} shifts · ${b.stats.coins} 🪙 earned</div>
      <div class="row"><button class="small primary" data-code="${b.id}">✏️ Code</button><button class="small" data-up="${b.id}">🔧 Upgrade</button><button class="small" data-log="${b.id}">📋 Log</button><button class="small" data-watch="${b.id}">👀 Watch</button><button class="small" data-on="${b.id}">${b.on ? "⏸ Stop" : "▶ Start"}</button></div></div>`; };
    const build = next ? `<div class="card"><div class="ct"><span class="big">➕</span> <b>Build bot ${s.crew.length + 1}</b></div><div class="muted">${next.coins ? `🪙 ${next.coins} ${matText(next.mats)} · needs Robotics ${next.req}` : "Free: Wrenna has the parts for your first one."}</div>
      <div class="row"><button class="small primary" id="buildBot" ${(R < next.req || RPG.state.coins < next.coins || !hasMats(next.mats)) ? "disabled" : ""}>Build it</button></div></div>` : "";
    const cr = crateCount();
    api.showModal(`<h2>🤖 Bot Dock</h2><p class="muted">Robotics level <b>${R}</b> · ${s.total.shifts} shifts worked · ${s.total.coins} 🪙 earned by bots. Bots run your Python, keep working while you play, and while the game is closed (up to 4 hours).</p>
      <div class="cards">${s.crew.map(card).join("")}${build}</div>
      <h3>📦 Crate</h3><p>${cr ? things(s.crate) : "Empty. Bots fill it with <code>bot.unload()</code> at the dock, and whatever they still carry when a shift ends."} <span class="muted">(${cr} of ${crateCap()})</span></p>
      <div class="row"><button id="crateGet" class="${cr ? "primary" : ""}" ${cr ? "" : "disabled"}>Take it all into your backpack</button><button id="dockUp" class="small">⚡ Dock level ${s.dock + 1}: charges in ${DOCK.charge[s.dock]} s, crate holds ${crateCap()}</button><button id="closeBtn">Close</button></div>`);
    const mb = $("modalBody");
    mb.querySelectorAll("button[data-code]").forEach(x => x.onclick = () => editor(x.dataset.code));
    mb.querySelectorAll("button[data-up]").forEach(x => x.onclick = () => upgrades(x.dataset.up));
    mb.querySelectorAll("button[data-log]").forEach(x => x.onclick = () => logView(x.dataset.log));
    mb.querySelectorAll("button[data-watch]").forEach(x => x.onclick = () => { api.hideModal(); if (window.Render3D && Render3D.roam.watch) Render3D.roam.watch(x.dataset.watch); });
    mb.querySelectorAll("button[data-on]").forEach(x => x.onclick = () => { const b = byId(x.dataset.on); b.on = !b.on; b.stuck = null; if (!b.on && live[b.id]) { payUpTo(b, live[b.id], tau(live[b.id])); delete live[b.id]; } api.persistSave(); hq(); });
    const bb = $("buildBot"); if (bb) bb.onclick = () => { if (next.coins && !RPG.spend(next.coins)) return; takeMats(next.mats); const b = newBot(); s.crew.push(b); flag("built1"); if (s.crew.length >= 2) flag("built2"); api.persistSave(); api.sfx("unlock"); editor(b.id, true); };
    $("crateGet").onclick = () => { let moved = 0, left = 0; for (const g in s.crate) { const k = RPG.add(g, s.crate[g]); moved += k; s.crate[g] -= k; left += s.crate[g]; if (!s.crate[g]) delete s.crate[g]; } api.persistSave(); api.toast(`📦 ${moved} things into your backpack.${left ? ` ${left} didn't fit: your backpack is full.` : ""}`); api.sfx("pick"); hq(); };
    $("dockUp").onclick = () => upgrades(null);
    $("closeBtn").onclick = api.hideModal;
  }
  const byId = (id) => st().crew.find(b => b.id === id);
  function upgrades(id) {
    const s = st(), b = id ? byId(id) : null, R = robo();
    const row = (name, icon, lvl, max, now_, nxt, cost, mats, req, key) => `<tr><td>${icon} ${name}</td><td>${now_}</td><td>${lvl < max ? `→ ${nxt}` : "max"}</td><td>${lvl < max ? `🪙 ${cost} ${matText(mats)}${R < req ? ` · Robotics ${req}` : ""}` : ""}</td><td>${lvl < max ? `<button class="small" data-buy="${key}" ${R < req || RPG.state.coins < cost || !hasMats(mats) ? "disabled" : ""}>Buy</button>` : "✓"}</td></tr>`;
    const rows = b ? Object.entries(UP).map(([k, u]) => { const l = b.up[k], m = u.vals.length - 1; return row(u.name, u.icon, l, m, u.fmt(u.vals[l]), l < m ? u.fmt(u.vals[l + 1]) : "", u.costs[l + 1], u.mats[l + 1], u.req[l + 1], k); }).join("")
      : row("Charger", "⚡", s.dock, 3, DOCK.charge[s.dock] + " s", DOCK.charge[s.dock + 1] + " s", DOCK.costs[s.dock + 1], DOCK.mats[s.dock + 1], DOCK.req[s.dock + 1], "dock") + `<tr><td>📦 Crate</td><td>${crateCap()}</td><td>${s.dock < 3 ? "→ " + DOCK.crate[s.dock + 1] : "max"}</td><td colspan="2" class="muted">comes with the charger</td></tr>`;
    api.showModal(`<h2>🔧 ${b ? b.name + "'s upgrades" : "Bot Dock upgrades"}</h2>${b ? `<p class="muted">Paint: ${COLORS.map(c => `<button class="small" data-col="${c}" style="background:${c};width:26px;height:22px;border:${c === b.color ? "3px solid var(--ink,#222)" : "1px solid #888"}"></button>`).join(" ")} · Name: <input id="botName" maxlength="14" value="${b.name.replace(/"/g, "")}" style="width:110px"></p>` : ""}
      <div class="tablewrap"><table class="goods"><tr><th></th><th>Now</th><th>Next</th><th>Costs</th><th></th></tr>${rows}</table></div>
      <p class="muted">Materials come from missions and the market. Robotics levels up with every shift your bots work.</p><div class="row"><button id="backBtn" class="primary">Back to the dock</button></div>`);
    const mb = $("modalBody");
    mb.querySelectorAll("button[data-buy]").forEach(x => x.onclick = () => {
      const k = x.dataset.buy;
      if (k === "dock") { const c = DOCK.costs[s.dock + 1]; if (!RPG.spend(c)) return; takeMats(DOCK.mats[s.dock + 1]); s.dock++; }
      else { const u = UP[k], l = b.up[k]; if (!RPG.spend(u.costs[l + 1])) return; takeMats(u.mats[l + 1]); b.up[k]++; }
      flag("upgraded"); api.persistSave(); api.sfx("unlock"); upgrades(id);
    });
    mb.querySelectorAll("button[data-col]").forEach(x => x.onclick = () => { b.color = x.dataset.col; api.persistSave(); upgrades(id); });
    const nm = $("botName"); if (nm) { nm.addEventListener("keydown", e => e.stopPropagation()); nm.onchange = () => { const v = nm.value.trim().slice(0, 14); if (v) { b.name = v; api.persistSave(); } }; }
    $("backBtn").onclick = () => { if (nm && nm.value.trim()) b.name = nm.value.trim().slice(0, 14); api.persistSave(); hq(); };
  }
  function logView(id) {
    const b = byId(id);
    api.showModal(`<h2>📋 ${b.name}'s shift log</h2><p class="muted">Best shift: ${b.stats.best} 🪙 · ${b.stats.shifts} shifts · ran flat ${b.stats.flats}× · ${b.stats.errors} with errors.</p>
      ${b.log.length ? `<div class="tablewrap"><table class="goods"><tr><th>When</th><th>Coins</th><th>Crate</th><th>Battery left</th><th>Notes</th></tr>${b.log.map(l => `<tr><td>${l.away ? `away (${l.shifts} shifts)` : new Date(l.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td><td>${l.coins}</td><td>${things(l.items || {})}</td><td>${l.away ? "–" : l.flat ? "🔋 flat" : l.left + "%"}</td><td>${l.err ? `<span style="color:#e05a4a">⚠ ${l.line ? "line " + l.line + ": " : ""}${l.err.replace(/</g, "&lt;")}</span>` : l.lost ? `lost ${l.lost} in the cargo` : ""}${l.out && l.out.length ? `<div class="muted" style="font-family:var(--mono)">${l.out.map(o => o.replace(/</g, "&lt;")).join("<br>")}</div>` : ""}</td></tr>`).join("")}</table></div>` : "<p>No shifts yet.</p>"}
      <div class="row"><button id="codeBtn" class="primary">✏️ Code</button><button id="backBtn">Back to the dock</button></div>`);
    $("codeBtn").onclick = () => editor(id); $("backBtn").onclick = hq;
  }
  function editor(id, fresh) {
    const b = byId(id);
    api.showModal(`<h2>✏️ ${b.name}'s program</h2>${fresh ? `<p><b>${b.name} is built!</b> This is its program: real Python. It already works. Press <b>Test shift</b> to see what it does, then make it better.</p>` : ""}
      <textarea id="botCode" wrap="off" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off" style="width:100%;min-height:220px;resize:vertical;font:14px/1.5 var(--mono);background:var(--term-bg);color:var(--term-ink);border:1px solid var(--line);border-radius:8px;padding:10px;tab-size:4;white-space:pre;overflow:auto"></textarea>
      <div id="botOut"></div>
      <div class="row"><button id="botTest">🧪 Test shift</button><button id="botSave" class="primary">💾 Save and send to work</button><button id="botBack">Back to the dock</button></div>
      <details><summary class="muted">Every bot command (click one to add it)</summary><div style="display:grid;gap:4px;margin-top:6px">${API.map(([c, d]) => `<div><button class="small" data-ins="${c}" style="font-family:var(--mono)">${c}</button> <span class="muted">${d}</span></div>`).join("")}
        <p class="muted">Things in the cargo are dictionaries: <code>fish["name"]</code>, <code>fish["cm"]</code>, <code>fish["price"]</code>, <code>fish["base"]</code> (its usual price), <code>fish["kind"]</code> ("fish", "fruit", "junk", "glass" or "gem"). A shift ends when the program ends or the battery runs out. If it's not home by then, it gets towed and the cargo is lost.</p></div></details>`);
    const ta = $("botCode"); ta.value = b.code;
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; } e.stopPropagation(); });
    $("modalBody").querySelectorAll("button[data-ins]").forEach(x => x.onclick = () => { const s = ta.selectionStart, line = ta.value.lastIndexOf("\n", s - 1) + 1, ind = (ta.value.slice(line, s).match(/^\s*/) || [""])[0]; const t = x.dataset.ins.replace("(place)", '("pier")').replace("(item)", "(fish)").replace("(text)", '("hi!")').replace("(seconds)", "(2)"); const ins = (s === line || /^\s*$/.test(ta.value.slice(line, s)) ? "" : "\n" + ind) + t; ta.value = ta.value.slice(0, s) + ins + ta.value.slice(s); ta.focus(); ta.selectionStart = ta.selectionEnd = s + ins.length; });
    $("botTest").onclick = async () => { $("botTest").disabled = true; const S = await simulate({ ...b, code: ta.value }, (Math.random() * 1e9) | 0); $("botTest").disabled = false; $("botOut").innerHTML = testView(S, b); };
    $("botSave").onclick = () => { const changed = b.code !== ta.value; b.code = ta.value; b.stuck = null; b.on = true; if (changed && live[b.id]) { const L = live[b.id]; if (L.i === 0 || tau(L) < 1) delete live[b.id]; } api.persistSave(); api.toast(`💾 ${b.name} will run the new code ${live[b.id] ? "from its next shift" : "now"}.`); api.sfx("click"); hq(); };
    $("botBack").onclick = () => { if (ta.value !== b.code) { b.draft = ta.value; } hq(); };
    if (b.draft && b.draft !== b.code) { ta.value = b.draft; $("botOut").innerHTML = `<p class="muted">Your unsaved changes are back. Save to send them to work.</p>`; }
  }
  // the test shift as a timeline: every action, how long it took, the battery after it
  function testView(S, b) {
    const t = (x) => Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0"), nm = (g) => g ? (RPG.GOODS[g] ? RPG.GOODS[g].icon + " " + RPG.GOODS[g].name.toLowerCase() : g === "boot" ? "🥾 old boot" : g) : "nothing";
    const lines = S.ev.filter(e => e.a !== "charge" && e.a !== "tow").slice(0, 120).map(e => {
      const W = { go: () => `drives from ${e.from} to ${e.to}${e.frac ? " … and the battery dies on the way" : ""}`, fish: () => e.frac ? "fishing … battery dies" : `fishes: ${nm(e.item)}`, pick: () => `picks ${nm(e.item)}`, dig: () => `digs: ${nm(e.item)}`, sell: () => `sells for ${e.coins} 🪙`, sort: () => `sorter: ${e.sorted.keep} keep, ${e.sorted.sell} sell (${e.coins} 🪙), ${e.sorted.sea} back to sea`, unload: () => `unloads ${things(e.items)}`, release: () => `throws back ${nm(e.item)}`, say: () => `says “${e.text}”`, print: () => `prints: ${e.text}`, wait: () => "waits", error: () => "stops: error", flat: () => "🔋 flat! Towed home, cargo lost" }, what = W[e.a] ? W[e.a]() : e.a;
      return `<tr><td>${t(e.t)}</td><td>${what.replace(/</g, "&lt;").replace(/&lt;(\/?)(b)&gt;/g, "<$1$2>")}</td><td>${Math.round((e.b1 !== undefined ? e.b1 : 1) * 100)}%</td></tr>`;
    }).join("");
    const err = S.error ? `<div style="background:#3a1f22;color:#ffd0c0;border-radius:8px;padding:8px 10px;margin:8px 0;font:13px/1.4 var(--mono)">${S.error.line ? "Line " + S.error.line + ": " : ""}${S.error.raw.replace(/</g, "&lt;")}${S.error.tip ? `<div style="font-family:inherit;margin-top:4px">💡 ${S.error.tip}</div>` : ""}</div>` : "";
    const fl = shiftFlags(b, S).filter(k => !st().flags[k]).map(k => FLAG_TEXT[k]);
    return `${err}<p><b>Test shift:</b> ${S.coins} 🪙, ${things(S.got)} into the crate, ${S.flat ? "🔋 ran flat" : `home with ${Math.round(S.left * 100)}% battery`}, ${t(S.work)} of work. <span class="muted">Only a test: nothing was paid. Fish bite differently every shift.</span></p>
      ${fl.length ? `<p>🏅 A real shift like this would count for: ${fl.join(" ")}</p>` : ""}
      <div class="tablewrap" style="max-height:220px;overflow:auto"><table class="goods"><tr><th>Time</th><th>What it did</th><th>🔋</th></tr>${lines}</table></div>`;
  }
  // one line for the town panel
  function summary() {
    const s = st(); if (!s.crew.length) return null;
    return s.crew.map(b => `<span style="color:${b.color}">●</span> ${b.name}: ${status(b)}`).join(" · ");
  }

  return {
    init(a, d) { api = a; deps = d; }, start, stop, hq, poses, summary, PLACES, get crew() { return st().crew; },
    flags: () => st().flags,
    debug: { simulate: (b, seed) => simulate(b, seed || 1), set speed(v) { speed = v; }, get speed() { return speed; }, live, tick, catchUp, setLast: (t) => { st().last = t; } },
  };
})();
window.Bots = Bots;
