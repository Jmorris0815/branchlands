// World simulation (v2). Student code runs against this model synchronously and
// produces an event log; the renderer plays the log back afterwards.
// Works in the page and inside a Web Worker (no DOM access).

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N
const DIR_NAMES = ["east", "south", "west", "north"];
const MAX_STEPS = 800;

class RobotFail extends Error { constructor(msg) { super(msg); this.name = "RobotFail"; } }

class Sim {
  constructor(level, resolvedGrid, gear) {
    this.level = level; this.gear = gear || {}; this.shieldUsed = false;
    const rows = resolvedGrid || (level.generate ? level.generate() : level.grid);
    this.grid = rows.map(r => (typeof r === "string" ? r.split("") : r.slice()));
    this.h = this.grid.length; this.w = this.grid[0].length;
    this.robot = { x: 1, y: 1, dir: level.startDir || 0 };
    this.items = {};      // "x,y" -> 'A' | 'L' | '*' | 'K'
    this.switches = {};   // "x,y" -> pressed?
    this.doors = {};      // "x,y" -> open?
    this.gates = {};      // "x,y" -> open?
    this.pads = {};       // "x,y" -> digit
    this.crabs = [];      // {id,x,y,dx}
    this.goal = null;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.grid[y][x], k = x + "," + y;
      if (c === "R") { this.robot.x = x; this.robot.y = y; this.grid[y][x] = "."; }
      else if ("AL*K".includes(c)) { this.items[k] = c; this.grid[y][x] = "."; }
      else if (c === "S") this.switches[k] = false;
      else if (c === "D") this.doors[k] = false;
      else if (c === "X") this.gates[k] = false;
      else if ("1234".includes(c)) this.pads[k] = c;
      else if (c === "C") { this.crabs.push({ id: this.crabs.length, x, y, dx: 1 }); this.grid[y][x] = "."; }
      else if (c === "G") this.goal = { x, y };
    }
    this.required = Object.values(this.items).filter(v => v === "A" || v === "L").length;
    this.totalGems = Object.values(this.items).filter(v => v === "*").length;
    this.bag = 0; this.gems = 0; this.keys = 0;
    this.events = []; this.steps = 0;
  }

  snapshot() {
    return { grid: this.grid.map(r => r.slice()), robot: { ...this.robot }, items: { ...this.items }, switches: { ...this.switches },
      doors: { ...this.doors }, gates: { ...this.gates }, pads: { ...this.pads }, crabs: this.crabs.map(c => ({ ...c })), goal: this.goal, w: this.w, h: this.h };
  }

  key(p) { return p.x + "," + p.y; }
  tile(x, y) { if (y < 0 || y >= this.h || x < 0 || x >= this.w) return "#"; return this.grid[y][x]; }
  ahead(n = 1) { const [dx, dy] = DIRS[this.robot.dir]; return { x: this.robot.x + dx * n, y: this.robot.y + dy * n }; }
  crabAt(x, y) { return this.crabs.find(c => c.x === x && c.y === y); }
  blocked(x, y) { // solid for walking (walls, closed doors, closed gates)
    const t = this.tile(x, y), k = x + "," + y;
    if (t === "#") return true;
    if (t === "D" && !this.doors[k]) return true;
    if (t === "X" && !this.gates[k]) return true;
    return false;
  }
  // What is on the tile ahead, as a word.
  nameOf(x, y) {
    const t = this.tile(x, y), k = x + "," + y;
    if (this.crabAt(x, y)) return "crab";
    if (t === "#") return "wall";
    if (t === "~") return "water";
    if (t === "D") return this.doors[k] ? "floor" : "door";
    if (t === "X") return this.gates[k] ? "floor" : "gate";
    const it = this.items[k];
    if (it === "A") return "apple"; if (it === "L") return "lens"; if (it === "*") return "gem"; if (it === "K") return "key";
    if (t === "G") return "goal";
    if (t === "S") return this.switches[k] ? "pressed" : "switch";
    if ("1234".includes(t)) return "teleporter";
    return "floor";
  }

  // Every robot action costs a step and lets the crabs move.
  tick() {
    if (++this.steps > MAX_STEPS) throw new RobotFail("The robot got tired after " + MAX_STEPS + " actions. Is there an endless loop?");
  }
  afterAction() {
    for (const c of this.crabs) {
      let nx = c.x + c.dx;
      if (this.blocked(nx, c.y) || this.tile(nx, c.y) === "~") { c.dx = -c.dx; nx = c.x + c.dx; if (this.blocked(nx, c.y) || this.tile(nx, c.y) === "~") continue; }
      const from = { x: c.x, y: c.y }; c.x = nx;
      this.events.push({ type: "crab", id: c.id, from, to: { x: c.x, y: c.y } });
      if (c.x === this.robot.x && c.y === this.robot.y) { if (this.shield(c)) continue; this.events.push({ type: "pinch", x: c.x, y: c.y }); throw new RobotFail("Pinched! A crab walked into the robot at (" + c.x + ", " + c.y + "). Use robot.sees(\"crab\") and robot.wait()."); }
    }
  }
  shield(c) { // Crab Shell upgrade: survive one pinch per run, the crab scuttles off
    if (!this.gear.crabShell || this.shieldUsed) return false; this.shieldUsed = true; this.crabs = this.crabs.filter(x => x !== c); this.events.push({ type: "shield", id: c.id, x: c.x, y: c.y }); return true;
  }
  crabWillEnter(x, y) { return this.crabs.some(c => c.y === y && c.x + c.dx === x && !this.blocked(c.x + c.dx, c.y)); }

  enter(to, how) { // robot arrives on a tile; handles water, crabs, gates, teleporters, doors
    const from = { x: this.robot.x, y: this.robot.y, dir: this.robot.dir };
    this.robot.x = to.x; this.robot.y = to.y;
    const t = this.tile(to.x, to.y), k = this.key(to);
    this.events.push({ type: how, from, to: { ...to }, over: how === "jump" ? this.ahead(-1) : undefined });
    if (t === "~") throw new RobotFail("Splash! The robot fell in the water at (" + to.x + ", " + to.y + "). Use robot.sees(\"water\") and robot.jump().");
    const crab = this.crabAt(to.x, to.y);
    if (crab && !this.shield(crab)) { this.events.push({ type: "pinch", x: to.x, y: to.y }); throw new RobotFail("Pinched! The robot walked into a crab at (" + to.x + ", " + to.y + ")."); }
    if (this.pads[k]) {
      const twin = Object.keys(this.pads).find(kk => kk !== k && this.pads[kk] === this.pads[k]);
      if (twin) { const [tx, ty] = twin.split(",").map(Number); const f = { x: this.robot.x, y: this.robot.y }; this.robot.x = tx; this.robot.y = ty; this.events.push({ type: "teleport", from: f, to: { x: tx, y: ty } }); }
    }
  }

  // ---- API exposed to student code ----
  move(n = 1) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < n; i++) {
      this.tick();
      const to = this.ahead(), k = this.key(to), t = this.tile(to.x, to.y);
      if (t === "X" && !this.gates[k] && this.keys > 0) { this.keys--; this.gates[k] = true; this.events.push({ type: "unlock", x: to.x, y: to.y }); }
      if (this.blocked(to.x, to.y)) { this.events.push({ type: "bump", x: this.robot.x, y: this.robot.y, dir: this.robot.dir, what: this.nameOf(to.x, to.y) }); this.afterAction(); continue; }
      this.enter(to, "move");
      this.afterAction();
    }
  }
  jump() {
    this.tick();
    let to = this.ahead(2);
    if ((this.blocked(to.x, to.y) || this.tile(to.x, to.y) === "~") && this.gear.springTreads) { const far = this.ahead(3); if (!this.blocked(far.x, far.y) && this.tile(far.x, far.y) !== "~") to = far; } // Spring Treads upgrade
    if (this.blocked(to.x, to.y) || this.tile(to.x, to.y) === "~") { this.events.push({ type: "bump", x: this.robot.x, y: this.robot.y, dir: this.robot.dir, what: "nothing to land on" }); this.afterAction(); return; }
    this.enter(to, "jump");
    this.afterAction();
  }
  turn(delta) { this.tick(); this.robot.dir = (this.robot.dir + delta + 4) % 4; this.events.push({ type: "turn", dir: this.robot.dir }); this.afterAction(); }
  turn_left() { this.turn(-1); }
  turn_right() { this.turn(1); }
  turn_around() { this.turn(2); }
  wait() { this.tick(); this.events.push({ type: "wait" }); this.afterAction(); }
  pick() {
    this.tick();
    const k = this.key(this.robot), it = this.items[k];
    if (it) {
      delete this.items[k];
      if (it === "*") this.gems++; else if (it === "K") this.keys++; else this.bag++;
      this.events.push({ type: "pick", x: this.robot.x, y: this.robot.y, item: it });
    } else if (this.gear.longArm && this.items[this.key(this.ahead())]) { // Long Arm upgrade: grab from the tile ahead
      const p = this.ahead(), k2 = this.key(p), it2 = this.items[k2]; delete this.items[k2];
      if (it2 === "*") this.gems++; else if (it2 === "K") this.keys++; else this.bag++;
      this.events.push({ type: "pick", x: p.x, y: p.y, item: it2, reach: true });
    } else this.events.push({ type: "nothing", x: this.robot.x, y: this.robot.y });
    this.afterAction();
  }
  press() {
    this.tick();
    const k = this.key(this.robot);
    if (k in this.switches) {
      this.switches[k] = true; this.events.push({ type: "press", x: this.robot.x, y: this.robot.y });
      if (Object.values(this.switches).every(v => v)) { for (const d in this.doors) this.doors[d] = true; this.events.push({ type: "doors" }); }
    } else this.events.push({ type: "nothing", x: this.robot.x, y: this.robot.y });
    this.afterAction();
  }
  say(text) { this.tick(); this.events.push({ type: "say", text: String(text).slice(0, 60) }); }
  sees(what) {
    this.tick();
    const p = this.ahead(), name = this.nameOf(p.x, p.y);
    const w = String(what).toLowerCase();
    switch (w) {
      case "wall": return name === "wall";
      case "water": case "gap": return name === "water";
      case "apple": return name === "apple";
      case "lens": return name === "lens";
      case "gem": return name === "gem";
      case "key": return name === "key";
      case "item": return ["apple", "lens", "gem", "key"].includes(name);
      case "goal": case "home": return this.tile(p.x, p.y) === "G";
      case "switch": return name === "switch";
      case "door": return name === "door";
      case "gate": return name === "gate";
      case "teleporter": case "pad": return name === "teleporter";
      case "crab": return name === "crab" || this.crabWillEnter(p.x, p.y);
      case "floor": return !this.blocked(p.x, p.y) && this.tile(p.x, p.y) !== "~";
      default: throw new RobotFail("robot.sees() doesn't know '" + what + "'. Try: wall, water, apple, gem, key, item, goal, switch, door, gate, teleporter, crab, floor.");
    }
  }
  scan() { this.tick(); if (this.gear.wideScanner) return [1, 2, 3].map(n => { const p = this.ahead(n); return this.nameOf(p.x, p.y); }); const p = this.ahead(); return this.nameOf(p.x, p.y); }
  done() { this.tick(); return !!this.goal && this.robot.x === this.goal.x && this.robot.y === this.goal.y; }
  has_key() { return this.keys > 0; }
  facing() { return DIR_NAMES[this.robot.dir]; }
  bag_count() { return this.bag; }
  x() { return this.robot.x; }
  y() { return this.robot.y; }

  // ---- goal evaluation: null = success, string = why not ----
  evaluate() {
    const g = this.level.goal || { type: "reach" };
    const atGoal = !!this.goal && this.robot.x === this.goal.x && this.robot.y === this.goal.y;
    const left = Object.values(this.items).filter(v => v === "A" || v === "L").length;
    const allSwitches = Object.values(this.switches).every(v => v);
    const here = "It's at (" + this.robot.x + ", " + this.robot.y + ") facing " + this.facing() + ".";
    switch (g.type) {
      case "free": return "sandbox";
      case "reach": return atGoal ? null : "The robot needs to stop on the 🏠 tile. " + here;
      case "collect": return left === 0 ? null : left + " item(s) still on the ground.";
      case "deliver": if (left) return left + " item(s) still on the ground."; return atGoal ? null : "Got everything, now bring it to the 🏠 tile. " + here;
      case "switches": if (!allSwitches) return "Some switches are still off."; return atGoal ? null : "Switches done, now reach the 🏠 tile.";
    }
    return null;
  }
}

// Plain-object robot API (used by the JavaScript runner in the worker).
function robotApi(sim) {
  const api = {};
  for (const name of ["move", "jump", "turn_left", "turn_right", "turn_around", "wait", "pick", "press", "say", "sees", "scan", "done", "has_key", "facing", "bag_count", "x", "y"]) api[name] = (...a) => sim[name](...a);
  // camelCase aliases for JavaScript habits
  api.turnLeft = api.turn_left; api.turnRight = api.turn_right; api.turnAround = api.turn_around; api.hasKey = api.has_key; api.bagCount = api.bag_count;
  return api;
}

const _g = typeof self !== "undefined" ? self : window;
_g.Sim = Sim; _g.RobotFail = RobotFail; _g.DIRS = DIRS; _g.robotApi = robotApi; _g.MAX_STEPS = MAX_STEPS;
