// Branchlands level data.
// Every ZONE unlocks a new REASON to code. Every LEVEL is a small mission.
// Grid legend: '#' wall  '.' floor  '~' water (deadly unless jumped)  'A' apple
//              'L' lens  'G' goal/home  'S' switch  'R' robot start (floor)

const ZONES = [
  { n: 1, name: "Lighthouse Rock", emoji: "🔦", color: "#d9c7a0",
    reason: "Machines only do exactly what you say.",
    blurb: "Your robot washed ashore with a dead battery and one rule: it only understands Python. Light the lighthouse." },
  { n: 2, name: "The Orchard", emoji: "🍎", color: "#b8d9a0",
    reason: "Stop doing boring stuff by hand.",
    blurb: "Hundreds of apples. Two hands. One loop." },
  { n: 3, name: "Fog Bridge", emoji: "🌫️", color: "#a9c4d9",
    reason: "Make decisions when you can't see ahead.",
    blurb: "The bridge rearranges itself every time you cross. Your code has to look before it leaps." },
  { n: 4, name: "The Workshop", emoji: "🔧", color: "#d9b8a0",
    reason: "Build a tool once, use it forever.",
    blurb: "Stairs, stairs, and more stairs. Teach the robot a trick once and reuse it." },
  { n: 5, name: "Time Tower", emoji: "⏳", color: "#c9b8d9",
    reason: "Never lose your work. Undo any mistake.",
    blurb: "The Tower runs on Git. Every commit is a save crystal. Every branch is another timeline." },
  { n: 6, name: "Two-Player Gate", emoji: "🤝", color: "#d9d0a0",
    reason: "Build things bigger than one person.",
    blurb: "The gate only opens when two people agree. Review a pull request. Then open a real one." },
  { n: 7, name: "The Oracle", emoji: "🔮", color: "#b8d9d6",
    reason: "Make things that think.",
    blurb: "Write a brain. A small one first. Then a real model." },
];

// ---------- helpers for generated maps ----------
function gridFromRows(rows) { return rows.map(r => r.split("")); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Corridor of random length with G at the end. Optional random gaps/apples.
function corridor(opts) {
  const len = randInt(opts.minLen, opts.maxLen);
  const w = len + 3; // walls + start + corridor + goal
  const top = "#".repeat(w), mid = ["#", "R"];
  let lastGap = false;
  for (let i = 0; i < len; i++) {
    let c = ".";
    const last = i === len - 1;
    if (opts.gaps && !last && !lastGap && i > 0 && Math.random() < 0.33) { c = "~"; lastGap = true; }
    else { lastGap = false; if (opts.apples && Math.random() < 0.4) c = "A"; }
    mid.push(c);
  }
  mid[mid.length - 1] = "G";
  mid.push("#");
  return gridFromRows([top, mid.join(""), top]);
}

// Staircase: `steps` repeats of (east 2, north 1). Apples optionally on the risers.
function stairs(steps, apples) {
  const w = 2 * steps + 4, h = steps + 4;
  const g = Array.from({ length: h }, () => Array(w).fill("#"));
  let x = 1, y = h - 2;
  g[y][x] = "R";
  for (let s = 0; s < steps; s++) {
    g[y][x + 1] = "."; g[y][x + 2] = "."; x += 2;
    y -= 1; g[y][x] = apples ? "A" : ".";
  }
  g[y][x + 1] = "."; g[y][x + 2] = "G";
  return g;
}

const LEVELS = [
  // ---------------- ZONE 1: Lighthouse Rock ----------------
  { id: "1-1", zone: 1, title: "First Steps", xp: 10, mode: "robot",
    story: "The robot blinks awake. It will do anything you type, and nothing you don't. Walk it to the lighthouse door (the 🏠 tile).",
    goal: { type: "reach" },
    grid: ["########", "#......#", "#R....G#", "#......#", "########"],
    starter: "import robot\n\nrobot.move(1)\n",
    hints: ["robot.move(5) walks five tiles in the direction it faces.", "The robot starts facing east (right)."],
  },
  { id: "1-2", zone: 1, title: "The Corner", xp: 15, mode: "robot",
    story: "A wall blocks the straight path. Robots can turn: robot.turn_left() and robot.turn_right().",
    goal: { type: "reach" },
    grid: ["########", "#....G.#", "#....#.#", "#R...#.#", "########"],
    starter: "import robot\n\nrobot.move(3)\n# now turn and keep going\n",
    hints: ["After moving 3, the robot faces east. turn_left() makes it face north.", "Then move 2, turn_right(), move 1."],
  },
  { id: "1-3", zone: 1, title: "The Lens", xp: 20, mode: "robot",
    story: "The lighthouse lens fell on the beach. Stand on it, robot.pick() it up, and carry it home.",
    goal: { type: "deliver" },
    grid: ["#########", "#R..L...#", "#.......#", "#...#...#", "#.......#", "#......G#", "#########"],
    starter: "import robot\n\nrobot.move(3)\nrobot.pick()\n",
    hints: ["pick() only works when the robot is standing on the item.", "From the lens: move(3) more to the far wall, turn_right(), move(4)."],
  },

  // ---------------- ZONE 2: The Orchard ----------------
  { id: "2-1", zone: 2, title: "Apple Row", xp: 20, mode: "robot", maxLines: 4,
    story: "Eight apples in a row. Your code may be at most 4 lines. Typing move/pick eight times is not going to fit.",
    goal: { type: "collect" },
    grid: ["############", "#R.AAAAAAAA#", "############"],
    starter: "import robot\n\nfor i in range(3):\n    robot.move(1)\n    robot.pick()\n",
    hints: ["range(9) repeats nine times.", "Picking on an empty tile is harmless."],
  },
  { id: "2-2", zone: 2, title: "Three Rows", xp: 30, mode: "robot", maxLines: 10,
    story: "Three rows. Same pattern each time: sweep east, robot.turn_around(), walk back, turn_left(), move(2), turn_left(). Put a loop inside a loop.",
    goal: { type: "collect" },
    grid: ["############", "#R.AAAAAAA.#", "#..........#", "#..AAAAAAA.#", "#..........#", "#..AAAAAAA.#", "############"],
    starter: "import robot\n\nfor row in range(3):\n    for i in range(8):\n        robot.move(1)\n        robot.pick()\n    # walk back and drop down a row\n",
    hints: ["Bumping a wall doesn't hurt; the robot just stays put.", "After the sweep: turn_around(), move(8), turn_left(), move(2), turn_left()."],
  },
  { id: "2-3", zone: 2, title: "How Far?", xp: 30, mode: "robot", maxLines: 3,
    story: "This path is a different length every time you press Run. You can't count it. Use while and robot.sees('wall').",
    goal: { type: "reach" },
    generate: () => corridor({ minLen: 4, maxLen: 11 }),
    starter: "import robot\n\nwhile not robot.sees(\"wall\"):\n    robot.move(1)\n",
    hints: ["sees('wall') looks at the tile directly in front of the robot.", "This one is already almost solved. Read it, run it, understand it."],
  },

  // ---------------- ZONE 3: Fog Bridge ----------------
  { id: "3-1", zone: 3, title: "Gap Jumper", xp: 35, mode: "robot", maxLines: 7,
    story: "Planks are missing and they move every run. robot.jump() leaps over one water tile. Falling in ends the run. Look, then decide.",
    goal: { type: "reach" },
    generate: () => corridor({ minLen: 8, maxLen: 12, gaps: true }),
    starter: "import robot\n\nwhile not robot.done():\n    if robot.sees(\"water\"):\n        robot.jump()\n    else:\n        robot.move(1)\n",
    hints: ["robot.done() is True when the robot stands on the goal.", "if / else: the robot chooses one of two actions each step."],
  },
  { id: "3-2", zone: 3, title: "Apples Over Water", xp: 40, mode: "robot", maxLines: 8,
    story: "Random gaps AND random apples. Collect every apple and reach the end. Everything you learned so far, together.",
    goal: { type: "deliver" },
    generate: () => corridor({ minLen: 8, maxLen: 12, gaps: true, apples: true }),
    starter: "import robot\n\nwhile not robot.done():\n    # look ahead, jump or move, then pick\n",
    hints: ["Same loop as 3-1, plus robot.pick() after every move.", "pick() on a plain tile does nothing, so just always pick."],
  },

  // ---------------- ZONE 4: The Workshop ----------------
  { id: "4-1", zone: 4, title: "Stairs", xp: 40, mode: "robot", maxLines: 9, requireDef: true,
    story: "Four identical steps: move(2), turn_left(), move(1), turn_right(). Teach the robot the trick ONCE with def, call it in a loop, then walk the last two tiles home.",
    goal: { type: "reach" },
    generate: () => stairs(4, false),
    starter: "import robot\n\ndef step():\n    robot.move(2)\n    # finish the step here\n\nfor i in range(4):\n    step()\n",
    hints: ["A function is a named recipe. def step(): ... then step() runs the recipe.", "This level requires a def. That's the whole point."],
  },
  { id: "4-2", zone: 4, title: "Tall Stairs", xp: 50, mode: "robot", maxLines: 11, requireDef: true,
    story: "Seven steps with an apple on each riser. Reuse your tool. Add a pick() inside it.",
    goal: { type: "deliver" },
    generate: () => stairs(7, true),
    starter: "import robot\n\n# write def step() again, with a pick() in it\n",
    hints: ["Copy your 4-1 function, add robot.pick() after the move(1).", "range(7) this time."],
  },

  // ---------------- ZONE 5: Time Tower (git simulator) ----------------
  { id: "5-1", zone: 5, title: "Save Crystal", xp: 60, mode: "git",
    story: "The Tower's lamp runs on a tiny program. Build it, SAVE it with a commit, break it, commit again, then travel back in time to the working version.",
    steps: [
      "git init",
      "write lamp.py light = ON",
      "git add lamp.py",
      "git commit -m \"lamp works\"",
      "write lamp.py light = BROKEN",
      "git add lamp.py  then  git commit -m \"oops\"",
      "git log   (find the hash of the first commit)",
      "git checkout <that hash>   (lamp.py is ON again)",
    ],
    check: (g) => g.commitCount() >= 2 && g.headDetached() && /ON/.test(g.files["lamp.py"] || ""),
    hints: ["Type help to see every command.", "A hash is the 7-character id shown by git log."],
  },
  { id: "5-2", zone: 5, title: "Two Timelines", xp: 70, mode: "git",
    story: "You want to try adding wings to the robot without wrecking the working version. Open a second timeline (a branch), build there, then merge it back.",
    preset: "one-commit",
    steps: [
      "git branch wings",
      "git checkout wings",
      "write wings.py flap = True",
      "git add wings.py  then  git commit -m \"add wings\"",
      "git checkout main",
      "git merge wings",
    ],
    check: (g) => g.branches.wings && g.headBranch() === "main" && g.isAncestor(g.branches.wings, g.branches.main) && !!g.files["wings.py"],
    hints: ["git log shows which branch you're on.", "merge pulls another timeline's commits into the one you're standing on."],
  },

  // ---------------- ZONE 6: Two-Player Gate (code review) ----------------
  { id: "6-1", zone: 6, title: "The Review", xp: 60, mode: "review",
    story: "Dad opened a pull request. It has a bug. Read it, request changes with a comment, fix it, then approve and merge. Merging runs the code.",
    goal: { type: "reach" },
    grid: ["########", "#....G.#", "#....#.#", "#R...#.#", "########"],
    pr: { title: "Fix: walk to the lighthouse", author: "dad", branch: "dad/fix-lighthouse",
      code: "import robot\n\n# wrote this at 11pm, pretty sure it works\nrobot.move(3)\nrobot.turn_right()\nrobot.move(2)\nrobot.turn_right()\nrobot.move(1)\n" },
    hints: ["Trace it: after move(3) the robot faces east. turn_right() faces SOUTH. Is the goal south?", "One word is wrong."],
  },

  // ---------------- ZONE 7: The Oracle ----------------
  { id: "7-1", zone: 7, title: "A Small Brain", xp: 80, mode: "oracle",
    story: "Write a function reply(message) that answers the Oracle. Every chatbot ever made started exactly like this: rules. Pass all four questions.",
    tests: [
      { q: "hello there", desc: "greets back", ok: r => /\b(hi|hello|hey)\b/i.test(r) },
      { q: "what is 2 + 2", desc: "answers 4", ok: r => /\b4\b|four/i.test(r) },
      { q: "do you like apples?", desc: "says yes or no", ok: r => /\b(yes|no)\b/i.test(r) },
      { q: "bye", desc: "says goodbye", ok: r => /bye/i.test(r) },
    ],
    starter: "def reply(message):\n    m = message.lower()\n    if \"hello\" in m:\n        return \"Hello! I am your robot.\"\n    return \"I don't know what that means yet.\"\n",
    hints: ["Add more if-blocks: if \"2 + 2\" in m: return \"4\"", "The last return is the fallback when nothing matches."],
  },
];

const LEVEL_BY_ID = Object.fromEntries(LEVELS.map(l => [l.id, l]));
