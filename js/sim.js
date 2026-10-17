// World simulation. Student code runs against this model synchronously and
// produces an event log; the renderer plays the log back afterwards.
// (Same simulate-then-playback idea CodeCombat uses, in ~150 lines.)

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N
const DIR_NAMES = ["east", "south", "west", "north"];
const MAX_STEPS = 600;

class RobotFail extends Error { constructor(msg) { super(msg); this.name = "RobotFail"; } }

class Sim {
  constructor(level) {
    this.level = level;
    const rows = level.generate ? level.generate() : level.grid;
    this.grid = rows.map(r => (typeof r === "string" ? r.split("") : r.slice()));
    this.h = this.grid.length; this.w = this.grid[0].length;
    this.robot = { x: 1, y: 1, dir: 0 };
    this.items = {};      // "x,y" -> 'A' | 'L'
    this.switches = {};   // "x,y" -> pressed?
    this.goal = null;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.grid[y][x];
      if (c === "R") { this.robot = { x, y, dir: 0 }; this.grid[y][x] = "."; }
      else if (c === "A" || c === "L") { this.items[x + "," + y] = c; this.grid[y][x] = "."; }
      else if (c === "S") { this.switches[x + "," + y] = false; }
      else if (c === "G") { this.goal = { x, y }; }
    }
    this.totalItems = Object.keys(this.items).length;
    this.bag = 0;
    this.events = [];
    this.steps = 0;
    this.failed = null;
  }

  snapshot() { // initial state for the renderer
    return { grid: this.grid.map(r => r.slice()), robot: { ...this.robot }, items: { ...this.items }, switches: { ...this.switches }, goal: this.goal };
  }

  tick() { if (++this.steps > MAX_STEPS) throw new RobotFail("The robot got tired after " + MAX_STEPS + " actions. Is there an endless loop?"); }
  tile(x, y) { if (y < 0 || y >= this.h || x < 0 || x >= this.w) return "#"; return this.grid[y][x]; }
  ahead(n = 1) { const [dx, dy] = DIRS[this.robot.dir]; return { x: this.robot.x + dx * n, y: this.robot.y + dy * n }; }
  key(p) { return p.x + "," + p.y; }

  // ---- API exposed to Python ----
  move(n = 1) {
    n = Math.max(0, Math.floor(n));
    for (let i = 0; i < n; i++) {
      this.tick();
      const to = this.ahead();
      const t = this.tile(to.x, to.y);
      if (t === "#") { this.events.push({ type: "bump", x: this.robot.x, y: this.robot.y, dir: this.robot.dir }); return; }
      const from = { ...this.robot };
      this.robot.x = to.x; this.robot.y = to.y;
      if (t === "~") { this.events.push({ type: "fall", from, to }); throw new RobotFail("Splash! The robot fell in the water at (" + to.x + ", " + to.y + "). Use robot.sees(\"water\") and robot.jump()."); }
      this.events.push({ type: "move", from, to });
    }
  }
  jump() {
    this.tick();
    const over = this.ahead(1), to = this.ahead(2);
    const t = this.tile(to.x, to.y);
    if (t === "#" || t === "~") { this.events.push({ type: "bump", x: this.robot.x, y: this.robot.y, dir: this.robot.dir }); return; }
    const from = { ...this.robot };
    this.robot.x = to.x; this.robot.y = to.y;
    this.events.push({ type: "jump", from, to, over });
  }
  turn(delta) { this.tick(); this.robot.dir = (this.robot.dir + delta + 4) % 4; this.events.push({ type: "turn", dir: this.robot.dir }); }
  turn_left() { this.turn(-1); }
  turn_right() { this.turn(1); }
  turn_around() { this.turn(2); }
  pick() {
    this.tick();
    const k = this.key(this.robot);
    if (this.items[k]) { delete this.items[k]; this.bag++; this.events.push({ type: "pick", x: this.robot.x, y: this.robot.y }); }
    else this.events.push({ type: "nothing", x: this.robot.x, y: this.robot.y });
  }
  press() {
    this.tick();
    const k = this.key(this.robot);
    if (k in this.switches) { this.switches[k] = true; this.events.push({ type: "press", x: this.robot.x, y: this.robot.y }); }
    else this.events.push({ type: "nothing", x: this.robot.x, y: this.robot.y });
  }
  say(text) { this.tick(); this.events.push({ type: "say", text: String(text) }); }
  sees(what) {
    this.tick();
    const p = this.ahead(), t = this.tile(p.x, p.y), k = this.key(p);
    switch (String(what).toLowerCase()) {
      case "wall": return t === "#";
      case "water": case "gap": return t === "~";
      case "apple": return this.items[k] === "A";
      case "lens": return this.items[k] === "L";
      case "item": return !!this.items[k];
      case "goal": case "home": return t === "G";
      case "switch": return t === "S";
      case "floor": return t === "." || t === "G" || t === "S";
      default: throw new RobotFail("robot.sees() doesn't know '" + what + "'. Try: wall, water, apple, item, goal, switch, floor.");
    }
  }
  done() { this.tick(); return !!this.goal && this.robot.x === this.goal.x && this.robot.y === this.goal.y; }
  facing() { return DIR_NAMES[this.robot.dir]; }
  bag_count() { return this.bag; }

  // ---- goal evaluation ----
  evaluate() {
    const g = this.level.goal || { type: "reach" };
    const atGoal = !!this.goal && this.robot.x === this.goal.x && this.robot.y === this.goal.y;
    const allItems = Object.keys(this.items).length === 0;
    const allSwitches = Object.values(this.switches).every(v => v);
    switch (g.type) {
      case "reach": return atGoal ? null : "The robot needs to stop on the 🏠 tile. It's at (" + this.robot.x + ", " + this.robot.y + ") facing " + this.facing() + ".";
      case "collect": return allItems ? null : (this.totalItems - this.bag) + " item(s) still on the ground.";
      case "deliver": if (!allItems) return (this.totalItems - this.bag) + " item(s) still on the ground."; return atGoal ? null : "Got everything, now bring it to the 🏠 tile.";
      case "switches": if (!allSwitches) return "Some switches are still off."; return atGoal ? null : "Switches done, now reach the 🏠 tile.";
    }
    return null;
  }
}

window.Sim = Sim; window.RobotFail = RobotFail; window.DIRS = DIRS;
