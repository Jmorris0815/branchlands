// Branchlands level data (v2).
// Every ZONE unlocks a new REASON to code. Every LEVEL is a small mission.
// Grid legend:
//   '#' wall   '.' floor   '~' water (deadly unless jumped)   'R' robot start
//   'A' apple  'L' lens    '*' gem (bonus)   'K' key   'G' goal/home
//   'S' switch 'D' door (opens when every switch is pressed)   'X' gate (needs a key)
//   '1'-'4' teleporter pairs   'C' crab (walks sideways one tile per robot action)

const ZONES = [
  { n: 1, name: "Lighthouse Rock", emoji: "🔦", color: "#e3d3a8", theme: "sand",
    reason: "Machines only do exactly what you say.",
    blurb: "Your robot washed ashore with a dead battery and one rule: it only understands Python. Light the lighthouse.",
    map: { x: 120, y: 400 } },
  { n: 2, name: "The Orchard", emoji: "🍎", color: "#b9dba3", theme: "grass",
    reason: "Stop doing boring stuff by hand.",
    blurb: "Hundreds of apples. Two hands. One loop.", map: { x: 260, y: 300 } },
  { n: 3, name: "Fog Bridge", emoji: "🌫️", color: "#b3c9db", theme: "stone",
    reason: "Make decisions when you can't see ahead.",
    blurb: "The bridge rearranges itself every time you cross. Look before you leap.", map: { x: 420, y: 360 } },
  { n: 4, name: "The Workshop", emoji: "🔧", color: "#dbbfa3", theme: "wood",
    reason: "Build a tool once, use it forever.",
    blurb: "Stairs, stairs, and more stairs. Teach the robot a trick once and reuse it.", map: { x: 560, y: 250 } },
  { n: 5, name: "Time Tower", emoji: "⏳", color: "#cdbfdb", theme: "stone",
    reason: "Never lose your work. Undo any mistake.",
    blurb: "The Tower runs on Git. Every commit is a save crystal. Every branch is another timeline.", map: { x: 700, y: 330 } },
  { n: 6, name: "Two-Player Gate", emoji: "🤝", color: "#dbd6a3", theme: "sand",
    reason: "Build things bigger than one person.",
    blurb: "The gate only opens when two people agree. Review pull requests. Then write one.", map: { x: 790, y: 190 } },
  { n: 7, name: "The Oracle", emoji: "🔮", color: "#a9dbd6", theme: "crystal",
    reason: "Make things that think.",
    blurb: "Write a brain. A small one first. Then a real model running on your own computer.", map: { x: 640, y: 110 } },
  { n: 8, name: "Mirror Sea", emoji: "🪞", color: "#a3c6db", theme: "ice",
    reason: "The same ideas work in every language.",
    blurb: "Across the water, the robot speaks JavaScript. Everything you know still works. Only the words change.", map: { x: 460, y: 80 } },
];

// ---------- map generators ----------
function gridFromRows(rows) { return rows.map(r => r.split("")); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Straight corridor with G at the end. Options: gaps, apples, gems, switches (+door before G).
function corridor(opts) {
  const len = randInt(opts.minLen, opts.maxLen);
  const w = len + 3;
  const top = "#".repeat(w), mid = ["#", "R"];
  let lastGap = false, switches = 0;
  for (let i = 0; i < len; i++) {
    let c = ".";
    const last = i === len - 1, beforeLast = i === len - 2;
    if (opts.switches && beforeLast) c = "D";
    else if (opts.gaps && !last && !beforeLast && !lastGap && i > 0 && Math.random() < 0.33) { c = "~"; lastGap = true; }
    else {
      lastGap = false;
      if (opts.switches && !last && !beforeLast && i > 0 && switches < 3 && Math.random() < 0.3) { c = "S"; switches++; }
      else if (opts.apples && Math.random() < 0.4) c = "A";
      else if (opts.gems && Math.random() < 0.15) c = "*";
    }
    mid.push(c);
  }
  if (opts.switches && switches === 0) mid[2] = "S";
  mid[mid.length - 1] = "G";
  mid.push("#");
  return gridFromRows([top, mid.join(""), top]);
}

// Staircase: `steps` repeats of (east 2, north 1). Options: apples on risers, random gap on first flat tile, gems.
function stairs(steps, opts = {}) {
  const w = 2 * steps + 4, h = steps + 4;
  const g = Array.from({ length: h }, () => Array(w).fill("#"));
  let x = 1, y = h - 2;
  g[y][x] = "R";
  for (let s = 0; s < steps; s++) {
    g[y][x + 1] = (opts.gaps && s > 0 && Math.random() < 0.5) ? "~" : "."; g[y][x + 2] = "."; x += 2;
    y -= 1; g[y][x] = opts.apples ? "A" : (opts.gems && Math.random() < 0.4 ? "*" : ".");
  }
  g[y][x + 1] = "."; g[y][x + 2] = "G";
  return g;
}

// Comb: n vertical teeth of height 3 off a corridor, apple at the tip of each.
function comb(n) {
  const w = 3 * n + 2, h = 6;
  const g = Array.from({ length: h }, () => Array(w).fill("#"));
  for (let x = 1; x < w - 1; x++) g[4][x] = ".";
  for (let k = 0; k < n; k++) { const x = 1 + 3 * k; g[3][x] = "."; g[2][x] = "."; g[1][x] = "A"; }
  g[4][1] = "R";
  return g;
}

// Teleporter rooms: the pad sends you to a second room where the goal is randomly north or south.
function teleportRooms() {
  const north = Math.random() < 0.5;
  return gridFromRows(north
    ? ["#########", "#R.1#.G.#", "#...#...#", "#...#.1.#", "#########"]
    : ["#########", "#R.1#.1.#", "#...#...#", "#...#.G.#", "#########"]);
}

// Crab crossing: vertical path, crab rows in between.
function crabCrossing(rows) {
  const w = 7, h = rows * 2 + 3;
  const g = Array.from({ length: h }, () => Array(w).fill("#"));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) g[y][x] = ".";
  g[1][3] = "R"; g[h - 2][3] = "G";
  for (let r = 0; r < rows; r++) { const y = 2 + r * 2; g[y][r % 2 ? w - 2 : 1] = "C"; }
  return g;
}

const SANDBOX_GRID = [
  "################",
  "#R...A...~~..*.#",
  "#.##.A.#.~~..#.#",
  "#.#K.A.#.....#.#",
  "#.#..X.#.1...#.#",
  "#....S.#.....#.#",
  "#.C....D...2.#.#",
  "#......#.....#.#",
  "#..*...#.C...#.#",
  "#......#.1.2.G.#",
  "################",
];

const LEVELS = [
  // ================= ZONE 1: Lighthouse Rock =================
  { id: "1-1", zone: 1, title: "First Steps", xp: 10, par: 1,
    story: "The robot blinks awake. It will do anything you type, and nothing you don't. Walk it to the lighthouse door (the 🏠 tile).",
    goal: { type: "reach" },
    grid: ["########", "#......#", "#R....G#", "#......#", "########"],
    starter: "import robot\n\nrobot.move(1)\n",
    hints: ["robot.move(5) walks five tiles in the direction it faces.", "The robot starts facing east (right)."] },
  { id: "1-2", zone: 1, title: "The Corner", xp: 15, par: 5,
    story: "A wall blocks the straight path. Robots can turn: robot.turn_left() and robot.turn_right().",
    goal: { type: "reach" },
    grid: ["########", "#....G.#", "#....#.#", "#R...#.#", "########"],
    starter: "import robot\n\nrobot.move(3)\n# now turn and keep going\n",
    hints: ["After moving 3, the robot faces east. turn_left() makes it face north.", "Then move 2, turn_right(), move 1."] },
  { id: "1-3", zone: 1, title: "The Lens", xp: 20, par: 5,
    story: "The lighthouse lens fell on the beach. Stand on it, robot.pick() it up, and carry it home.",
    goal: { type: "deliver" },
    grid: ["#########", "#R..L...#", "#.......#", "#...#...#", "#.......#", "#......G#", "#########"],
    starter: "import robot\n\nrobot.move(3)\nrobot.pick()\n",
    hints: ["pick() only works when the robot is standing on the item.", "From the lens: move(3) more to the far wall, turn_right(), move(4)."] },
  { id: "1-4", zone: 1, title: "Switch On", xp: 20, par: 3,
    story: "The door 🚪 is sealed. Stand on the switch 🔘 and robot.press() it. Every switch pressed opens every door.",
    goal: { type: "reach" },
    grid: ["##########", "#R..S.D.G#", "##########"],
    starter: "import robot\n\nrobot.move(3)\n",
    hints: ["Move 3, press(), then move 4. The door is just floor once it opens.", "Bonking a closed door doesn't hurt. It just doesn't work."] },
  { id: "1-5", zone: 1, title: "Key and Gate", xp: 25, par: 11,
    story: "A locked gate ⛓️ only opens for a robot carrying a key 🔑. Pick up the key, then walk into the gate.",
    goal: { type: "reach" },
    grid: ["##########", "#R...#...#", "#.K..#.G.#", "#....X...#", "##########"],
    starter: "import robot\n\nrobot.turn_right()\nrobot.move(1)\n",
    hints: ["Key is at (2,2). From start: turn_right, move 1, turn_left, move 1, pick.", "Then: turn_right, move 1, turn_left, move 3 (through the gate), move 2, turn_left, move 1."] },

  // ================= ZONE 2: The Orchard =================
  { id: "2-1", zone: 2, title: "Apple Row", xp: 20, maxLines: 4, par: 3,
    story: "Eight apples in a row. Your code may be at most 4 lines. Typing move/pick eight times is not going to fit.",
    goal: { type: "collect" },
    grid: ["############", "#R.AAAAAAAA#", "############"],
    starter: "import robot\n\nfor i in range(3):\n    robot.move(1)\n    robot.pick()\n",
    hints: ["range(9) repeats nine times.", "Picking on an empty tile is harmless."] },
  { id: "2-2", zone: 2, title: "Three Rows", xp: 30, maxLines: 10, par: 9,
    story: "Three rows. Same pattern each time: sweep east, robot.turn_around(), walk back, turn_left(), move(2), turn_left(). Put a loop inside a loop.",
    goal: { type: "collect" },
    grid: ["############", "#R.AAAAAAA.#", "#..........#", "#..AAAAAAA.#", "#..........#", "#..AAAAAAA.#", "############"],
    starter: "import robot\n\nfor row in range(3):\n    for i in range(8):\n        robot.move(1)\n        robot.pick()\n    # walk back and drop down a row\n",
    hints: ["Bumping a wall doesn't hurt; the robot just stays put.", "After the sweep: turn_around(), move(8), turn_left(), move(2), turn_left()."] },
  { id: "2-3", zone: 2, title: "How Far?", xp: 30, maxLines: 3, par: 2,
    story: "This path is a different length every time you press Run. You can't count it. Use while and robot.sees('wall').",
    goal: { type: "reach" },
    generate: () => corridor({ minLen: 4, maxLen: 11 }),
    starter: "import robot\n\nwhile not robot.sees(\"wall\"):\n    robot.move(1)\n",
    hints: ["sees('wall') looks at the tile directly in front of the robot.", "This one is already almost solved. Read it, run it, understand it."] },
  { id: "2-4", zone: 2, title: "Square Dance", xp: 35, maxLines: 5, par: 5,
    story: "Apples all the way around the field. Four sides, four moves each, then a turn. A loop inside a loop, in 5 lines.",
    goal: { type: "collect" },
    grid: ["#######", "#RAAAA#", "#A...A#", "#A...A#", "#A...A#", "#AAAAA#", "#######"],
    starter: "import robot\n\nfor side in range(4):\n    # walk one side, then turn right\n",
    hints: ["Each side is 4 moves. for i in range(4): move(1); pick()", "After each side: robot.turn_right()"] },
  { id: "2-5", zone: 2, title: "Long Haul", xp: 35, maxLines: 4, par: 3,
    story: "An orchard road of unknown length, apples and gems 💎 scattered along it. Gems are bonus XP. Bring everything home.",
    goal: { type: "deliver" },
    generate: () => corridor({ minLen: 8, maxLen: 14, apples: true, gems: true }),
    starter: "import robot\n\nwhile not robot.sees(\"wall\"):\n",
    hints: ["Move, then pick, every time, until the wall.", "The goal tile is the last tile before the wall, so stopping at the wall is standing on home."] },

  // ================= ZONE 3: Fog Bridge =================
  { id: "3-1", zone: 3, title: "Gap Jumper", xp: 35, maxLines: 7, par: 5,
    story: "Planks are missing and they move every run. robot.jump() leaps over one water tile. Falling in ends the run. Look, then decide.",
    goal: { type: "reach" },
    generate: () => corridor({ minLen: 8, maxLen: 12, gaps: true }),
    starter: "import robot\n\nwhile not robot.done():\n    if robot.sees(\"water\"):\n        robot.jump()\n    else:\n        robot.move(1)\n",
    hints: ["robot.done() is True when the robot stands on the goal.", "if / else: the robot chooses one of two actions each step."] },
  { id: "3-2", zone: 3, title: "Apples Over Water", xp: 40, maxLines: 8, par: 6,
    story: "Random gaps AND random apples. Collect every apple and reach the end. Everything you learned so far, together.",
    goal: { type: "deliver" },
    generate: () => corridor({ minLen: 8, maxLen: 12, gaps: true, apples: true }),
    starter: "import robot\n\nwhile not robot.done():\n    # look ahead, jump or move, then pick\n",
    hints: ["Same loop as 3-1, plus robot.pick() after every move.", "pick() on a plain tile does nothing, so just always pick."] },
  { id: "3-3", zone: 3, title: "Crab Crossing", xp: 45, maxLines: 7, par: 5, startDir: 1,
    story: "Crabs 🦀 patrol the beach, one tile per robot action. Walking into one, or being walked into, ends the run. robot.sees('crab') is True if a crab is ahead or about to be. robot.wait() lets a turn pass.",
    goal: { type: "reach" },
    generate: () => crabCrossing(2),
    starter: "import robot\n\nwhile not robot.done():\n    if robot.sees(\"crab\"):\n        robot.wait()\n    else:\n        robot.move(1)\n",
    hints: ["The robot starts facing south, so move(1) walks down.", "This starter already works. Watch it, then try removing the wait() to see why it's needed."] },
  { id: "3-4", zone: 3, title: "Teleport Pad", xp: 45, maxLines: 8, par: 6,
    story: "Step on a pad 🌀 and you appear on its twin. Where the goal is after that changes every run: north or south. Turn, look, decide.",
    goal: { type: "reach" },
    generate: teleportRooms,
    starter: "import robot\n\nrobot.move(2)\n# you just teleported. which way is open?\nrobot.turn_left()\nif robot.sees(\"wall\"):\n    robot.turn_around()\nrobot.move(2)\n",
    hints: ["After the teleport the robot still faces east. turn_left() faces north.", "If north is a wall, turn_around() faces south. Either way, move(2)."] },
  { id: "3-5", zone: 3, title: "Switch Hunt", xp: 50, maxLines: 9, par: 7,
    story: "Switches are scattered along a road that changes every run, and the door at the end stays shut until all of them are pressed. If the robot keeps bonking the door, it missed one.",
    goal: { type: "reach" },
    generate: () => corridor({ minLen: 9, maxLen: 13, switches: true }),
    starter: "import robot\n\nwhile not robot.done():\n    if robot.sees(\"switch\"):\n        robot.move(1)\n        robot.press()\n    else:\n        robot.move(1)\n",
    hints: ["sees('switch') looks ahead. Step onto it, THEN press.", "A loop that only bonks forever ends with 'the robot got tired'. That means a switch was missed."] },

  // ================= ZONE 4: The Workshop =================
  { id: "4-1", zone: 4, title: "Stairs", xp: 40, maxLines: 9, par: 8, requireDef: true,
    story: "Four identical steps: move(2), turn_left(), move(1), turn_right(). Teach the robot the trick ONCE with def, call it in a loop, then walk the last two tiles home.",
    goal: { type: "reach" },
    generate: () => stairs(4),
    starter: "import robot\n\ndef step():\n    robot.move(2)\n    # finish the step here\n\nfor i in range(4):\n    step()\n",
    hints: ["A function is a named recipe. def step(): ... then step() runs the recipe.", "This level requires a def. That's the whole point."] },
  { id: "4-2", zone: 4, title: "Tall Stairs", xp: 50, maxLines: 11, par: 9, requireDef: true,
    story: "Seven steps with an apple on each riser. Reuse your tool. Add a pick() inside it.",
    goal: { type: "deliver" },
    generate: () => stairs(7, { apples: true }),
    starter: "import robot\n\n# write def step() again, with a pick() in it\n",
    hints: ["Copy your 4-1 function, add robot.pick() after the move(1).", "range(7) this time."] },
  { id: "4-3", zone: 4, title: "The Comb", xp: 50, maxLines: 11, par: 10, requireDef: true,
    story: "Four side paths, an apple at the end of each. One tooth = turn_left, move 3, pick, turn_around, move 3, turn_left, move 3. Make tooth() a function.",
    goal: { type: "collect" },
    generate: () => comb(4),
    starter: "import robot\n\ndef tooth():\n    robot.turn_left()\n    robot.move(3)\n    robot.pick()\n    # come back down and walk to the next tooth\n\nfor i in range(4):\n    tooth()\n",
    hints: ["After pick(): turn_around(), move(3), turn_left(), move(3).", "After the last tooth the move(3) just bonks the wall. That's fine."] },
  { id: "4-4", zone: 4, title: "Parameters", xp: 60, maxLines: 13, par: 12, requireDef: true,
    story: "Three rows of different lengths: 3, 5 and 7 apples. One function with a parameter, def row(n):, handles all three. Call row(3), row(5), row(7).",
    goal: { type: "collect" },
    grid: ["############", "#R.AAA.....#", "#..........#", "#..AAAAA...#", "#..........#", "#..AAAAAAA.#", "############"],
    starter: "import robot\n\ndef row(n):\n    for i in range(n + 2):\n        robot.move(1)\n        robot.pick()\n    # walk back, drop down a row\n\nrow(3)\nrow(5)\nrow(7)\n",
    hints: ["Back: turn_around(), move(n + 2), turn_left(), move(2), turn_left().", "n is just a name for whatever number you passed in."] },
  { id: "4-5", zone: 4, title: "Keeper's Puzzle", xp: 80, maxLines: 13, par: 12, requireDef: true,
    story: "Boss level. Six steps, and some flats have a missing plank that moves every run. Your step() needs a decision inside it: jump the water, or move. Gems on the risers are bonus.",
    goal: { type: "reach" },
    generate: () => stairs(6, { gaps: true, gems: true }),
    starter: "import robot\n\ndef step():\n    for i in range(2):\n        if robot.sees(\"water\"):\n            robot.jump()\n        else:\n            robot.move(1)\n    # then up one and face east again\n\nfor i in range(6):\n    step()\nrobot.move(2)\n",
    hints: ["Up one = turn_left(), move(1), turn_right(). Add a pick() before turning back if you want the gem.", "A jump covers two tiles, so the second loop pass just bonks. Harmless."] },

  // ================= ZONE 5: Time Tower (git) =================
  { id: "5-1", zone: 5, title: "Save Crystal", xp: 60, mode: "git",
    story: "The Tower's lamp runs on a tiny program. Build it, SAVE it with a commit, break it, commit again, then travel back in time to the working version.",
    steps: ["git init", "write lamp.py light = ON", "git add lamp.py", "git commit -m \"lamp works\"", "write lamp.py light = BROKEN", "git add .  then  git commit -m \"oops\"", "git log   (find the hash of the first commit)", "git checkout <that hash>   (lamp.py is ON again)"],
    check: (g) => g.commitCount() >= 2 && g.headDetached() && /ON/.test(g.files["lamp.py"] || ""),
    hints: ["Type help to see every command.", "A hash is the 7-character id shown by git log."] },
  { id: "5-2", zone: 5, title: "Two Timelines", xp: 70, mode: "git", preset: "one-commit",
    story: "You want to try adding wings to the robot without wrecking the working version. Open a second timeline (a branch), build there, then merge it back.",
    steps: ["git branch wings", "git checkout wings", "write wings.py flap = True", "git add wings.py  then  git commit -m \"add wings\"", "git checkout main", "git merge wings"],
    check: (g) => g.branches.wings && g.headBranch() === "main" && g.isAncestor(g.branches.wings, g.branches.main) && !!g.files["wings.py"],
    hints: ["git log shows which branch you're on.", "merge pulls another timeline's commits into the one you're standing on."] },
  { id: "5-3", zone: 5, title: "The Paradox", xp: 90, mode: "git", preset: "conflict",
    story: "Dad changed the lamp to BLUE on his branch. You change it to GREEN on main. Merge his branch and Git will stop: two timelines disagree about the same line. That's a merge conflict. You decide what's true, then commit.",
    steps: ["write lamp.py light = GREEN", "git add .  then  git commit -m \"green lamp\"", "git merge dad   (conflict!)", "cat lamp.py   (see the <<<<<<< ======= >>>>>>> markers)", "write lamp.py light = BLUE and GREEN", "git add lamp.py", "git commit -m \"merge dad\""],
    check: (g) => g.headBranch() === "main" && !g.merging && g.isAncestor(g.branches.dad, g.branches.main) && !/<<<<<<</.test(g.files["lamp.py"] || "") && !!g.commits[g.branches.main] && g.commits[g.branches.main].parents.length === 2,
    hints: ["git status tells you which file is in conflict.", "After you write the fixed file: git add it, then git commit. The merge finishes."] },
  { id: "5-4", zone: 5, title: "Dad Pushed First", xp: 90, mode: "git", preset: "remote",
    story: "There's a shared copy of the repo called origin. You committed wings. Dad already pushed a hat. Try to push: Git refuses, because origin has history you don't. Pull his work in first, then push.",
    steps: ["git push   (rejected)", "git pull   (brings Dad's commit in and merges)", "git log", "git push   (now it works)"],
    check: (g) => g.remote && g.remote.main === g.branches.main && g.isAncestor(g.remoteSeed, g.branches.main) && g.isAncestor(g.localSeed, g.branches.main),
    hints: ["pull = fetch their commits + merge them into yours.", "Always pull before you push. Make it a habit now and you'll never fight your teammates."] },

  // ================= ZONE 6: Two-Player Gate (review) =================
  { id: "6-1", zone: 6, title: "The Review", xp: 60, mode: "review", goal: { type: "reach" },
    story: "Dad opened a pull request. It has a bug. Read it, request changes with a comment, fix it, then approve and merge. Merging runs the code.",
    grid: ["########", "#....G.#", "#....#.#", "#R...#.#", "########"],
    pr: { title: "Fix: walk to the lighthouse", author: "dad", branch: "dad/fix-lighthouse",
      code: "import robot\n\n# wrote this at 11pm, pretty sure it works\nrobot.move(3)\nrobot.turn_right()\nrobot.move(2)\nrobot.turn_right()\nrobot.move(1)\n" },
    hints: ["Trace it: after move(3) the robot faces east. turn_right() faces SOUTH. Is the goal south?", "One word is wrong."] },
  { id: "6-2", zone: 6, title: "Off By One", xp: 70, mode: "review", goal: { type: "collect" }, maxLines: 4,
    story: "Another PR from Dad. The loop looks right. Count the apples. Count the loop. The most common bug in programming is being off by exactly one.",
    grid: ["############", "#R.AAAAAAAA#", "############"],
    pr: { title: "Collect the apple row", author: "dad", branch: "dad/apple-row",
      code: "import robot\n\nfor i in range(8):\n    robot.move(1)\n    robot.pick()\n" },
    hints: ["The robot starts one tile before the first apple. How many moves to reach the LAST apple?", "range(9)."] },
  { id: "6-3", zone: 6, title: "Actually Fine", xp: 70, mode: "review", goal: { type: "reach" },
    story: "Dad's PR has a scary comment in it. Scary comments are not bugs. Run it. If it works, approve it without requesting changes. Good reviewers don't invent problems.",
    grid: ["########", "#....G.#", "#....#.#", "#R...#.#", "########"],
    pr: { title: "Lighthouse path, take two", author: "dad", branch: "dad/lighthouse-2", correct: true,
      code: "import robot\n\n# TODO: not sure this is right?? probably broken\nrobot.move(3)\nrobot.turn_left()\nrobot.move(2)\nrobot.turn_right()\nrobot.move(1)\n" },
    hints: ["Trace it or just run it. The reviewer's job is to find out, not to guess.", "If it reaches the goal, click Approve & merge. That's the whole level."] },
  { id: "6-4", zone: 6, title: "Your Turn", xp: 90, mode: "author", goal: { type: "deliver" }, maxLines: 8,
    story: "Now you open the pull request. Write the code, then write the PR: a title, what you changed, and how you tested it. Dad reviews. Vague PRs get sent back.",
    grid: ["##########", "#R.A.A.A.G#", "##########"],
    starter: "import robot\n\n",
    hints: ["A good PR title says what, not 'fix' or 'stuff'. 'Collect three apples with a loop' is a title.", "The description should let someone who never saw the code understand what you did."] },

  // ================= ZONE 7: The Oracle =================
  { id: "7-1", zone: 7, title: "A Small Brain", xp: 80, mode: "oracle",
    story: "Write a function reply(message) that answers the Oracle. Every chatbot ever made started exactly like this: rules. Pass all four questions.",
    tests: [
      { q: "hello there", desc: "greets back", ok: r => /\b(hi|hello|hey)\b/i.test(r) },
      { q: "what is 2 + 2", desc: "answers 4", ok: r => /\b4\b|four/i.test(r) },
      { q: "do you like apples?", desc: "says yes or no", ok: r => /\b(yes|no)\b/i.test(r) },
      { q: "bye", desc: "says goodbye", ok: r => /bye/i.test(r) },
    ],
    starter: "def reply(message):\n    m = message.lower()\n    if \"hello\" in m:\n        return \"Hello! I am your robot.\"\n    return \"I don't know what that means yet.\"\n",
    hints: ["Add more if-blocks: if \"2 + 2\" in m: return \"4\"", "The last return is the fallback when nothing matches."] },
  { id: "7-2", zone: 7, title: "Memory", xp: 100, mode: "oracle",
    story: "A brain that forgets everything between sentences isn't much of a brain. Give yours a memory: a dictionary outside the function that survives between calls.",
    tests: [
      { q: "my name is Sonny", desc: "accepts a name", ok: r => typeof r === "string" && r.length > 0 },
      { q: "what is my name?", desc: "remembers Sonny", ok: r => /sonny/i.test(r) },
      { q: "I like pizza", desc: "accepts a favorite", ok: r => typeof r === "string" && r.length > 0 },
      { q: "what do I like?", desc: "remembers pizza", ok: r => /pizza/i.test(r) },
    ],
    starter: "memory = {}\n\ndef reply(message):\n    m = message.lower()\n    if m.startswith(\"my name is \"):\n        memory[\"name\"] = message[11:]\n        return \"Nice to meet you, \" + memory[\"name\"]\n    if \"my name\" in m:\n        return \"You are \" + memory.get(\"name\", \"a mystery\")\n    return \"Tell me more.\"\n",
    hints: ["message[7:] cuts off the first 7 characters. 'I like pizza'[7:] is 'pizza'.", "memory.get('food', 'nothing yet') returns a default if the key is missing."] },
  { id: "7-3", zone: 7, title: "The Real Oracle", xp: 150, mode: "ollama",
    story: "Rules and memory got you this far. Now plug in a real language model running on YOUR computer with Ollama. You don't write the brain this time. You write its personality: the system prompt.",
    starter: "You are Bolt, a small beach robot from Branchlands. You are cheerful, you love apples, and you explain Python to kids in one or two short sentences. If someone asks you to write code, write Python.",
    hints: ["Install Ollama from ollama.com, then in a terminal:  ollama pull llama3.2:1b", "Browsers need permission to talk to Ollama. On Windows run  setx OLLAMA_ORIGINS \"*\"  then restart Ollama from the tray."] },

  // ================= ZONE 8: Mirror Sea (JavaScript) =================
  { id: "8-1", zone: 8, title: "Same Robot, New Words", xp: 40, lang: "js", par: 1,
    story: "Across the sea the robot speaks JavaScript. No import needed; robot is already here. Lines end with semicolons. Walk to the goal.",
    goal: { type: "reach" },
    grid: ["########", "#......#", "#R....G#", "#......#", "########"],
    starter: "robot.move(1);\n",
    hints: ["robot.move(5);", "The semicolon is JavaScript's full stop. Forgetting it usually still works, but get in the habit."] },
  { id: "8-2", zone: 8, title: "Braces", xp: 50, lang: "js", maxLines: 4, par: 4,
    story: "Python uses indentation to show what's inside a loop. JavaScript uses curly braces { }. The idea is identical. Eight apples, four lines.",
    goal: { type: "collect" },
    grid: ["############", "#R.AAAAAAAA#", "############"],
    starter: "for (let i = 0; i < 3; i++) {\n    robot.move(1);\n    robot.pick();\n}\n",
    hints: ["i < 9 repeats nine times, same as range(9).", "The closing } counts as a line. That's why the limit is 4, not 3."] },
  { id: "8-3", zone: 8, title: "If, Else, Same Thing", xp: 60, lang: "js", maxLines: 8, par: 7,
    story: "The Fog Bridge again, in JavaScript. while and if work exactly the same; the condition just goes in parentheses and the body in braces.",
    goal: { type: "reach" },
    generate: () => corridor({ minLen: 8, maxLen: 12, gaps: true }),
    starter: "while (!robot.done()) {\n    if (robot.sees(\"water\")) {\n        robot.jump();\n    } else {\n        robot.move(1);\n    }\n}\n",
    hints: ["! means not. !robot.done() is 'while not done'.", "This starter works. Read it next to your Python from 3-1."] },
  { id: "8-4", zone: 8, title: "function", xp: 70, lang: "js", maxLines: 11, par: 10, requireDef: true,
    story: "def becomes function. Everything else about the stairs is the same trick you already own.",
    goal: { type: "reach" },
    generate: () => stairs(4),
    starter: "function step() {\n    robot.move(2);\n    // finish the step\n}\n\nfor (let i = 0; i < 4; i++) {\n    step();\n}\n",
    hints: ["turn_left, move 1, turn_right inside the function. Then robot.move(2); at the end.", "Braces count as lines; the limit allows for them."] },
  { id: "8-5", zone: 8, title: "Polyglot", xp: 100, lang: "js", maxLines: 15, par: 14, requireDef: true,
    story: "Boss. The comb, in JavaScript, with a parameter: function tooth(height). You've now solved the same problem in two languages. That's what being a programmer is.",
    goal: { type: "collect" },
    generate: () => comb(4),
    starter: "function tooth(height) {\n    robot.turn_left();\n    for (let i = 0; i < height; i++) {\n        robot.move(1);\n    }\n    robot.pick();\n    // back down and over\n}\n\nfor (let i = 0; i < 4; i++) {\n    tooth(3);\n}\n",
    hints: ["Back: turn_around(); move(height); turn_left(); move(3);", "Compare with your Python 4-3. Line by line."] },
];

LEVELS.forEach(l => { if (!l.mode) l.mode = "robot"; if (!l.lang) l.lang = "py"; });
const LEVEL_BY_ID = Object.fromEntries(LEVELS.map(l => [l.id, l]));

const SANDBOX_LEVEL = { id: "sandbox", zone: 1, title: "Sandbox", xp: 0, mode: "robot", lang: "py", sandbox: true,
  story: "Free play. Every tile type is here. Nothing to win; try things. Switch languages with the selector.",
  goal: { type: "free" }, grid: SANDBOX_GRID,
  starter: "import robot\n\n# everything: move jump turn_left turn_right turn_around pick press wait say\n# sees(\"wall|water|apple|gem|key|goal|door|gate|switch|crab|teleporter\")\n# done() has_key() bag_count() x() y() scan()\nrobot.say(\"hello world\")\nrobot.move(3)\n",
  hints: ["Try print(robot.scan()) to see what's ahead.", "Edit any level in the Level Editor and play it here."] };
