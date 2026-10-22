// Showdowns: three bosses you beat by writing one Python function. Each boss sends rounds at you (tentacles, golem
// moves, knots), your function answers every round, and the boss checks the answer against its rules. A new phase
// brings a new rule, so code that won phase one has to grow to win phase two. The whole fight is worked out first
// (your function is called once per round), then played back in 3D, so what you see is exactly what the code did.
// Rounds are random every fight: a function that only works for one set of tentacles won't get far.
//
// The story: something called the Tangle is knotting up the sea. It knotted Old Knotty the kraken in the harbor,
// it rusted Gearjaw, the guardian of Gull Isle's stone circle, and it grows on Storm Reef, past the horizon.

const Bosses = (() => {
  const $ = (id) => document.getElementById(id);
  let api; // the hub's api: save, persistSave, showModal, hideModal, toast, sfx
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (R, a) => a[Math.floor(R() * a.length)];
  const int = (R, lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  function shuffle(R, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const pyStr = (v) => v === null || v === undefined ? "None" : v === true ? "True" : v === false ? "False" : typeof v === "string" ? `"${v}"` : Array.isArray(v) ? "[" + v.map(pyStr).join(", ") + "]" : typeof v === "object" ? "{" + Object.entries(v).map(([k, x]) => `"${k}": ${pyStr(x)}`).join(", ") + "}" : String(v);

  // ---------- Old Knotty, the kraken in the harbor ----------
  // Five lanes of water off the end of the pier. Tentacles come up in some of them; your fire(tentacles) gives back
  // the lanes to fire the cannon at, one ball each. The cannon only has as many balls as the red tentacles need.
  function tentacles(R, n, opts) {
    const lanes = shuffle(R, [0, 1, 2, 3, 4]).slice(0, n);
    return lanes.map((lane, i) => ({ lane, color: opts.blue && i < opts.blue ? "blue" : "red", hp: opts.hp ? int(R, 1, opts.hp) : 1 })).sort(() => R() - 0.5);
  }
  const KRAKEN = {
    id: "kraken", name: "Old Knotty", title: "the Kraken", icon: "🐙", island: "harbor", fn: "fire", arg: "tentacles",
    where: "the end of the pier, in Harbor Town",
    blurb: "Something has been tying Odo's nets in knots. Out past the pier, five lanes of dark water churn. Ring the bell and it comes up.",
    phases: [
      { name: "Tentacles", need: 3, rule: "Tentacles come up in the lanes (0 to 4, left to right). Fire one cannonball at <b>every</b> tentacle, or it slams the pier.",
        gen: (R, i) => i === 0 ? [{ lane: 1, color: "red", hp: 1 }, { lane: 3, color: "red", hp: 1 }] : tentacles(R, int(R, 1, 3), {}) },
      { name: "Armour", need: 3, rule: "<b>Blue</b> tentacles are armoured. A ball bounces off them and comes straight back at Bolt. Only fire at the <b>red</b> ones: check <code>t[\"color\"]</code>.",
        gen: (R) => tentacles(R, int(R, 2, 4), { blue: int(R, 1, 2) }) },
      { name: "Tough skin", need: 3, rule: "Some tentacles take more than one hit: <code>t[\"hp\"]</code> says how many. Fire at that lane that many times. The cannon has exactly enough balls, so every shot counts.",
        gen: (R) => tentacles(R, int(R, 2, 4), { blue: int(R, 0, 1), hp: 3 }) },
      { name: "Fury", need: 2, rule: "Everything at once: more tentacles, armour and tough skin. If your function follows every rule, this is just more of the same.",
        gen: (R) => tentacles(R, int(R, 4, 5), { blue: int(R, 1, 2), hp: 3 }) },
    ],
    starter: `def fire(tentacles):
    # tentacles is a list. Each tentacle is a dictionary:
    #   t["lane"]   which lane it's in: 0 to 4, left to right
    #   t["color"]  "red" or "blue"
    #   t["hp"]     how many hits it takes to sink it
    # Give back a list of lanes to fire at, like [1, 3].
    lanes = []
    lanes.append(0)
    return lanes
`,
    data: `<code>tentacles</code> is a list of dictionaries, like <code>[{"lane": 1, "color": "red", "hp": 1}, {"lane": 3, "color": "blue", "hp": 1}]</code>. Give back a list of lanes, like <code>[1, 4]</code>. Each lane in the list is one cannonball.`,
    tell(T) { return T.map(t => `lane ${t.lane} ${t.color === "red" ? "🔴" : "🔵"}${t.hp > 1 ? "×" + t.hp : ""}`).join(" · "); },
    show(v) { return `[${(Array.isArray(v) ? v : [v]).join(", ")}]`; },
    check(T, out) {
      if (!Array.isArray(out)) return { crash: { raw: `fire() gave back ${pyStr(out)}, not a list.`, tip: "Give back a list of lanes, even for one lane: return [2]. An empty list is [ ]." } };
      const lanes = out.map(Number);
      const bad = out.find(v => typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 4); if (bad !== undefined) return { crash: { raw: `fire() gave back ${pyStr(out)}, and ${pyStr(bad)} isn't a lane.`, tip: "Lanes are the numbers 0 to 4. Use t[\"lane\"] from each tentacle, not the whole tentacle." } };
      const st = T.map(t => ({ ...t, left: t.hp })), balls = T.filter(t => t.color === "red").reduce((a, t) => a + t.hp, 0), shots = [];
      lanes.forEach((lane, k) => {
        if (k >= balls) { shots.push({ lane, res: "none" }); return; }
        const t = st.find(x => x.lane === lane);
        shots.push({ lane, res: !t ? "empty" : t.color === "blue" ? "bounce" : t.left <= 0 ? "wasted" : (--t.left ? "hit" : "sink") });
      });
      const up = st.filter(t => t.color === "red" && t.left > 0), bounce = shots.find(s => s.res === "bounce");
      const ok = !bounce && !up.length;
      let why = "";
      if (bounce) why = `You fired at the blue tentacle in lane ${bounce.lane}. Armour: the ball came straight back at Bolt.`;
      else if (up.length) { const t = up[0]; why = `The red tentacle in lane ${t.lane} was still up${t.hp > 1 ? ` (it needed ${t.hp} hits and got ${t.hp - t.left})` : ""}, so it slammed the pier.`; if (shots.some(s => s.res === "none")) why += ` The cannon ran out after ${balls} ball${balls > 1 ? "s" : ""}: some went to the wrong lanes.`; else if (shots.some(s => s.res === "empty" || s.res === "wasted")) why += " Some balls went into empty water."; }
      return { ok, why, shots, up: up.map(t => t.lane) };
    },
    tip(rounds) { // a nudge, from what went wrong most often
      const bad = rounds.filter(r => !r.ok && !r.crash); if (!bad.length) return null; const last = bad[bad.length - 1];
      if (/blue/.test(last.why)) return "Inside your loop, check the colour before you add the lane: <code>if t[\"color\"] == \"red\":</code>";
      if (/needed \d+ hits/.test(last.why)) return "A tentacle with <code>t[\"hp\"]</code> of 3 needs its lane in the list three times. A loop inside your loop can do that: <code>for i in range(t[\"hp\"]):</code>";
      return "Loop over the tentacles and add each one's lane to your list: <code>for t in tentacles:</code> then <code>lanes.append(t[\"lane\"])</code>.";
    },
    arena: { bolt: { x: 0, z: 22.7, yaw: -Math.PI / 2 }, lanes: [3.8, 1.9, 0, -1.9, -3.8], laneZ: 26.8, head: { x: 0, z: 31.5 } },
  };

  // ---------- Gearjaw, the guardian of Gull Isle ----------
  // Each round Gearjaw makes a move; react(move) gives back what Bolt does about it.
  const GOLEM_RULES = [
    "A <b>swipe</b> comes from one side: dodge the other way (swipe from the left → <code>\"right\"</code>). A <b>slam</b> shakes the ground: <code>\"jump\"</code>. When it <b>vents</b> steam its chest is open: <code>\"attack\"</code>.",
    "Its eye fires a <b>laser</b>. Dodging doesn't help against light: <code>\"shield\"</code>.",
    "Gearjaw starts to <b>fake</b> moves. When <code>move[\"fake\"]</code> is <code>True</code> it's only pretending, hoping you'll dodge: <code>\"attack\"</code> instead.",
    "It runs hotter and hotter. At <code>move[\"heat\"]</code> of <b>100 or more</b> it's overheated and can't defend, whatever move it starts: <code>\"attack\"</code>. Which <code>if</code> should come first?",
  ];
  function golemMove(R, p) {
    const names = p === 0 ? ["swipe", "swipe", "slam", "vent"] : ["swipe", "swipe", "slam", "laser", "laser", "vent"];
    const name = pick(R, names);
    return { name, side: name === "swipe" ? pick(R, ["left", "right"]) : null, heat: p < 3 ? int(R, 10, 85) : (R() < 0.6 ? int(R, 100, 140) : int(R, 40, 99)), fake: p >= 2 && name !== "vent" && R() < 0.6 };
  }
  function golemWant(m) {
    if (m.heat >= 100) return "attack";
    if (m.fake) return "attack";
    if (m.name === "vent") return "attack";
    if (m.name === "swipe") return m.side === "left" ? "right" : "left";
    if (m.name === "slam") return "jump";
    return "shield";
  }
  const GOLEM = {
    id: "golem", name: "Gearjaw", title: "the Rusted Guardian", icon: "⚙️", island: "gull", fn: "react", arg: "move",
    where: "the stone circle on Gull Isle",
    blurb: "The guardian of the stone circle has slept for a hundred years. The Tangle woke it up wrong. It doesn't know friends from enemies any more.",
    phases: [
      { name: "Swipes and slams", need: 4, rule: GOLEM_RULES[0], gen: (R, i) => i === 0 ? { name: "swipe", side: "left", heat: 30, fake: false } : golemMove(R, 0) },
      { name: "Laser eye", need: 4, rule: GOLEM_RULES[1], gen: (R, i) => i === 0 ? { name: "laser", side: null, heat: 55, fake: false } : golemMove(R, 1) },
      { name: "Feints", need: 4, rule: GOLEM_RULES[2], gen: (R, i) => i === 0 ? { name: "swipe", side: "right", heat: 60, fake: true } : golemMove(R, 2) },
      { name: "Overheat", need: 3, rule: GOLEM_RULES[3], gen: (R, i) => i === 0 ? { name: "laser", side: null, heat: 112, fake: false } : golemMove(R, 3) },
    ],
    starter: `def react(move):
    # move["name"]  what Gearjaw does: "swipe", "slam" or "vent" (and more later)
    # move["side"]  for a swipe: "left" or "right"
    # move["heat"]  how hot it's running
    # move["fake"]  True if it's only pretending
    # Give back what Bolt does: "left", "right", "jump", "shield" or "attack".
    if move["name"] == "swipe":
        return "left"
    return "jump"
`,
    data: `<code>move</code> is a dictionary, like <code>{"name": "swipe", "side": "left", "heat": 40, "fake": False}</code>. Give back one word: <code>"left"</code>, <code>"right"</code>, <code>"jump"</code>, <code>"shield"</code> or <code>"attack"</code>.`,
    tell(m) { const n = { swipe: `swipe from the ${m.side}`, slam: "slam", laser: "laser eye", vent: "vents steam" }[m.name]; return `${n}${m.fake ? " (fake!)" : ""} · heat ${m.heat}${m.heat >= 100 ? " 🔥" : ""}`; },
    show(v) { return pyStr(v); },
    check(m, out) {
      const v = typeof out === "string" ? out.trim().toLowerCase() : out;
      if (!["left", "right", "jump", "shield", "attack"].includes(v)) return { crash: { raw: `react() gave back ${pyStr(out)} for ${pyStr(m)}.`, tip: "It has to give back \"left\", \"right\", \"jump\", \"shield\" or \"attack\" for every move. Is there a way through your ifs that never reaches a return?" } };
      const want = golemWant(m), ok = v === want;
      let why = "";
      if (!ok) {
        if (m.heat >= 100) why = `Heat was ${m.heat}. At 100 or more Gearjaw is overheated and can't defend, so whatever the move, the answer is "attack". Check the heat before anything else.`;
        else if (m.fake) why = `That ${m.name} was a fake (move["fake"] was True). It wanted Bolt to ${v === "attack" ? "…" : v}. Attack a fake.`;
        else if (v === "attack") why = `Bolt attacked into a real ${m.name} and got knocked back. Only attack on a vent, a fake or overheating.`;
        else if (m.name === "swipe") why = `The swipe came from the ${m.side}. ${v === m.side ? `Dodging ${v} took Bolt straight into it.` : `"${v}" doesn't dodge a swipe.`} Dodge to the ${want}.`;
        else if (m.name === "slam") why = `A slam shakes the whole ground. Only "jump" gets clear of it.`;
        else if (m.name === "laser") why = `You can't dodge light. A laser needs "shield".`;
        else why = `Gearjaw vented steam and its chest was wide open. That's the moment to "attack".`;
      }
      return { ok, why, want, did: v };
    },
    tip(rounds) {
      const bad = rounds.filter(r => !r.ok && !r.crash); if (!bad.length) return null; const last = bad[bad.length - 1];
      if (/Heat was/.test(last.why)) return "Put <code>if move[\"heat\"] >= 100:</code> as the very first check. The first <code>if</code> that matches wins, so order matters.";
      if (/fake/.test(last.why)) return "Check <code>if move[\"fake\"]:</code> before you look at the name of the move.";
      if (/laser/.test(last.why)) return "Add another branch: <code>elif move[\"name\"] == \"laser\":</code> <code>return \"shield\"</code>.";
      if (/swipe/.test(last.why)) return "A swipe from the left means dodge right: <code>if move[\"side\"] == \"left\":</code> <code>return \"right\"</code>.";
      return "One <code>if</code> / <code>elif</code> for every move, each with its own <code>return</code>.";
    },
    arena: { bolt: { x: 0, z: 1.6, yaw: Math.PI / 2 }, boss: { x: 0, z: -2.6 } },
  };

  // ---------- the Tangle, on Storm Reef ----------
  // It throws knots: lists of numbers, with lists inside lists. untie(knot) gives back what the whole knot adds up to.
  function knot(R, depth, n, force) {
    const out = []; const k = n || int(R, 2, 4);
    for (let i = 0; i < k; i++) out.push(depth > 1 && (R() < 0.45 || (force && i === k - 1)) ? knot(R, depth - 1, int(R, 1, 3), force) : int(R, 1, 9));
    return out;
  }
  const total = (k) => Array.isArray(k) ? k.reduce((a, x) => a + total(x), 0) : k;
  const depthOf = (k) => Array.isArray(k) ? 1 + Math.max(0, ...k.map(depthOf)) : 0;
  const TANGLE = {
    id: "tangle", name: "The Tangle", title: "Heart of the Storm", icon: "🌀", island: "reef", fn: "untie", arg: "knot",
    where: "the middle of Storm Reef",
    blurb: "A knot of storm as big as a house, turning over the reef. Everything it touches gets tied up. Untie its knots one by one and it comes apart.",
    phases: [
      { name: "Loose knots", need: 3, rule: "Each knot is a list of numbers. Untie it by giving back what they add up to.", gen: (R) => knot(R, 1, int(R, 2, 5)) },
      { name: "Double knots", need: 3, rule: "Now some knots have <b>lists inside the list</b>, like <code>[[2, 3], [4]]</code>. Add up everything inside them too. <code>type(x) == list</code> tells you when something is a list.",
        gen: (R) => Array.from({ length: int(R, 2, 3) }, () => knot(R, 1, int(R, 1, 3))) },
      { name: "Deep knots", need: 3, rule: "Lists inside lists inside lists, as deep as it likes. A list inside a knot is a smaller knot, and you already have a function that unties knots…",
        gen: (R) => knot(R, 4, int(R, 2, 3), true) },
      { name: "Heart of the storm", need: 2, rule: "The biggest knots it has. If untie() can untie any knot, these are no different.", gen: (R) => knot(R, 6, int(R, 3, 4), true) },
    ],
    starter: `def untie(knot):
    # knot is a list of numbers, like [3, 1, 4].
    # Give back what the knot adds up to.
    total = 0
    return total
`,
    data: `<code>knot</code> is a list, like <code>[3, 1, 4]</code>, and later lists inside lists, like <code>[1, [2, 3], [[4]]]</code>. Give back one number: everything in it added up.`,
    tell(k) { const s = pyStr(k); return s.length > 46 ? s.slice(0, 45) + "…" : s; },
    show(v) { return pyStr(v); },
    check(k, out) {
      if (typeof out !== "number") return { crash: { raw: `untie() gave back ${pyStr(out)} for the knot ${pyStr(k)}.`, tip: "Give back one number: return total. Did your function forget to return?" } };
      const want = total(k), ok = Math.abs(out - want) < 1e-9;
      let why = "";
      if (!ok) { const outer = k.filter(x => !Array.isArray(x)).reduce((a, x) => a + x, 0); why = `It adds up to ${want}, and untie() said ${out}.`; if (out === outer && depthOf(k) > 1) why += " That's only the numbers on the outside: the lists inside count too."; else if (out === 0) why += " Did the loop add anything to total?"; }
      return { ok, why, want };
    },
    tip(rounds) {
      const bad = rounds.filter(r => !r.ok && !r.crash); if (!bad.length) return null; const last = bad[bad.length - 1], d = depthOf(last.input);
      if (d >= 3) return "A function can call itself. Inside untie, when <code>x</code> is a list, add <code>untie(x)</code> to the total: that unties the smaller knot, however deep it goes.";
      if (d === 2) return "Inside your loop: <code>if type(x) == list:</code> then add up the numbers in <code>x</code> with another loop.";
      return "<code>for x in knot:</code> then <code>total = total + x</code>, and <code>return total</code> at the end, outside the loop.";
    },
    arena: { bolt: { x: 0, z: 3.0, yaw: Math.PI / 2 }, boss: { x: 0, z: -2.8 } },
  };
  const BOSSES = { kraken: KRAKEN, golem: GOLEM, tangle: TANGLE };
  const ORDER = ["kraken", "golem", "tangle"];
  const hpMax = (B) => B.phases.reduce((a, p) => a + p.need, 0);

  // ---------- save ----------
  function st() {
    const s = api.save(); if (!s.bosses) s.bosses = { compass: false };
    for (const id of ORDER) if (!s.bosses[id]) s.bosses[id] = { won: false, wins: 0, tries: 0, seen: 0, best: null, code: null };
    return s.bosses;
  }
  const won = (id) => !!st()[id].won;
  // which bosses you can face: Old Knotty once Odo has told you about the nets; Gearjaw after him; the Tangle after both
  const open = (id) => id === "kraken" || won(ORDER[ORDER.indexOf(id) - 1]);

  // ---------- the story: short scenes, one speaker at a time ----------
  const WHO = {
    kraken: { name: "Old Knotty", icon: "🐙" }, golem: { name: "Gearjaw", icon: "⚙️" }, tangle: { name: "The Tangle", icon: "🌀" }, bolt: { name: "Bolt", icon: "🤖" },
    odo: { name: "Odo the Ferryman", icon: "🛶" }, gully: { name: "Old Gully", icon: "🦜" }, dad: { name: "Dad", icon: "🧔" }, marisol: { name: "Marisol", icon: "⚓" }, wrenna: { name: "Wrenna", icon: "🔧" },
  };
  function scene(lines, done) {
    let i = 0;
    const show = () => {
      const [who, text] = lines[i], W = WHO[who];
      api.showModal(`<div class="scene"><div class="scenewho">${W.icon}</div><div class="sceneline"><b>${W.name}</b><p>${text}</p></div></div>
        <div class="row"><button id="scNext" class="primary">${i < lines.length - 1 ? "Next ▸" : "OK"}</button>${i < lines.length - 1 ? `<button id="scSkip" class="small">Skip</button>` : ""}</div>`);
      $("scNext").onclick = () => { i++; if (i < lines.length) show(); else { api.hideModal(); if (done) done(); } };
      const sk = $("scSkip"); if (sk) sk.onclick = () => { api.hideModal(); if (done) done(); };
    };
    show();
  }
  const INTRO = {
    kraken: [["odo", "That bell's for fog, normally. Ring it now and something else answers."], ["kraken", "<i>A huge eye opens under the water. Tentacles rise, wrapped in black knotted rope.</i>"], ["odo", "It's Old Knotty! He's been in this harbor since my grandad's day, gentle as a cow. Look at those knots on him. He doesn't know what he's doing."], ["odo", "The harbor cannon's at the end of the pier, and it fires where your code says. Knock those tentacles down and maybe the knots come loose."]],
    golem: [["gully", "Don't get too close. That's Gearjaw. It guarded the stone circle before there was a harbor."], ["golem", "<i>Rust flakes fall as it stands. One red eye flickers on. Its jaw grinds like a broken gearbox.</i>"], ["gully", "Something got into its works: those same black knots. It moves the way it always did, though. Read the move, react right, and keep hitting it when it's open."]],
    tangle: [["bolt", "<i>The sea goes dark. The wind drops. In the middle of the reef, something turns over and over, like rope tying itself.</i>"], ["tangle", "<i>The knots pull tight. It throws one at you.</i>"], ["dad", "<i>(on the radio)</i> That's it, kiddo. That's what's been tying up the sea. Every knot it throws is a sum. Untie them all."]],
  };
  const OUTRO = {
    kraken: [["kraken", "<i>The last knot snaps. The rope sinks away. Old Knotty blinks, slowly, and lifts one tentacle out of the water. It waves.</i>"], ["odo", "Ha! There he is. That's the old fellow I know."], ["odo", "He's been pointing north-east, see? Gull Isle. Gully radioed this morning: the guardian in the stone circle is moving again. Same knots, I'll bet."], ["bolt", "<i>A small tentacle pokes out of the water by the pier. A baby kraken! It climbs onto the boards and follows Bolt.</i>"]],
    golem: [["golem", "<i>The red eye blinks out. A clunk, a hiss of steam, and the eye comes back on: blue this time.</i>"], ["golem", "GUARDIAN… ONLINE. KNOT… REMOVED. THANK YOU, SMALL ROBOT."], ["golem", "THE KNOTS COME FROM STORM REEF. THE TANGLE GROWS THERE. TAKE THIS. IT POINTS THROUGH THE STORM."], ["gully", "A storm compass! With that your boat can find Storm Reef. Sail out and the current will offer it."]],
    tangle: [["tangle", "<i>The last knot comes apart in your hands. All at once the whole Tangle loosens, unravels, and blows away like smoke.</i>"], ["bolt", "<i>The clouds open. Sunlight hits the reef for the first time in years. Where the Tangle was, a crystal hums: a heartstone.</i>"], ["dad", "<i>(on the radio)</i> You did it. The sea's calm all the way to the harbor. Get home, kiddo. Everybody wants to see you."]],
  };

  // ---------- the fight: run the function on every round ----------
  function friendly(raw, B) {
    const s = String(raw), line = (s.match(/on line (\d+)/) || [])[1];
    let tip = null;
    if (/RecursionError|call stack/.test(s)) tip = `untie() kept calling itself forever. When x is a number, add it; only call ${B.fn}() again on a list.`;
    else if (/TimeLimitError/.test(s)) tip = "Your function ran for ages. A while loop that never ends?";
    else if (/unsupported operand.*'int' and 'list'|unsupported operand.*'list' and 'int'|can only concatenate/.test(s)) tip = B.id === "tangle" ? "Something in the knot is a list, not a number, and you can't add a list to a number. Check  if type(x) == list:  first." : "You tried to add a list and a number together. Check which one you have.";
    else if (/KeyError/.test(s)) tip = B.id === "kraken" ? "Tentacles have the keys \"lane\", \"color\" and \"hp\". Check the spelling and the quotes." : "move has the keys \"name\", \"side\", \"heat\" and \"fake\". Check the spelling and the quotes.";
    else if (/TypeError.*(indices|subscript)/.test(s)) tip = "Use the key in quotes inside square brackets, like t[\"lane\"].";
    else if (/NameError/.test(s)) tip = "Something isn't defined. Check spelling and capital letters.";
    else if (/TypeError.*argument/.test(s)) tip = `${B.fn}() gets exactly one thing: def ${B.fn}(${B.arg}):`;
    return { raw: s.replace(/ on line \d+$/, ""), tip, line: line ? +line : null };
  }
  async function simulate(B, code, from, seed) {
    if (!window.PY || typeof Sk === "undefined") return { compile: { raw: "The Python engine hasn't loaded yet.", tip: "Check the internet connection and try again in a moment." } };
    const res = await PY.run(code, null);
    if (res.error) return { compile: res.error };
    if (!res.module.$d[B.fn]) return { compile: { raw: `There's no function called ${B.fn}.`, tip: `Start with  def ${B.fn}(${B.arg}):  and give back an answer with return.` } };
    const R = rng(seed), rounds = [], out = { rounds, from, hearts0: 3, hpMax: hpMax(B), output: res.output };
    let hearts = 3, p = from, hp = B.phases.slice(from).reduce((a, x) => a + x.need, 0); out.hp0 = hp;
    const lim = Sk.execLimit;
    try {
      while (p < B.phases.length && hearts > 0) {
        const ph = B.phases[p]; let got = 0, i = 0;
        while (got < ph.need && hearts > 0) {
          const input = ph.gen(R, i, p), first = i === 0; i++;
          Sk.execLimit = 1500; Sk.execStart = Date.now();
          const r = PY.call(res.module, B.fn, [JSON.parse(JSON.stringify(input))]);
          if (r.error) { rounds.push({ p, first, input, crash: friendly(r.error, B), hp, hearts }); out.crash = rounds[rounds.length - 1].crash; out.reached = p; return out; }
          const c = B.check(input, r.value);
          if (c.crash) { rounds.push({ p, first, input, value: r.value, crash: c.crash, hp, hearts }); out.crash = c.crash; out.reached = p; return out; }
          if (c.ok) { got++; hp--; } else hearts--;
          rounds.push({ p, first, input, value: r.value, ...c, hp, hearts });
        }
        if (hearts > 0) p++;
      }
    } finally { Sk.execLimit = lim; }
    out.won = hearts > 0; out.hearts = hearts; out.reached = Math.min(p, B.phases.length - 1);
    return out;
  }

  // ---------- the boss menu: story, what you know so far, your code ----------
  function menu(id) {
    const B = BOSSES[id], s = st()[id];
    if (!open(id)) { api.showModal(`<h2>${B.icon} ${B.name} is asleep</h2><p>${id === "golem" ? "Rust and moss, and a red eye that flickers now and then. Old Gully says it only started twitching when the knots appeared in the harbor. Deal with whatever is under Harbor Town's pier first." : "The storm is too thick to face this yet."}</p><div class="row"><button id="closeBtn">OK</button></div>`); $("closeBtn").onclick = api.hideModal; return; }
    if (!s.tries && !s.introSeen) { s.introSeen = true; api.persistSave(); return scene(INTRO[id], () => menu(id)); }
    const seen = Math.max(s.seen, 0), code = s.draft || s.code || B.starter;
    const rules = B.phases.map((ph, k) => k <= seen ? `<li><b>Phase ${k + 1} · ${ph.name}.</b> ${ph.rule}</li>` : `<li class="muted"><b>Phase ${k + 1} · ???</b> Reach it to find out.</li>`).join("");
    api.showModal(`<div class="bossgrid"><div>
        <h2>${B.icon} ${B.name} <span class="muted" style="font-size:0.7em">${B.title}</span></h2>
        <p>${B.blurb}</p>
        ${s.won ? `<p class="bosswon">✅ Beaten ${s.wins} time${s.wins > 1 ? "s" : ""}${s.best ? ` · best fight: ${s.best.hearts} ❤️ left` : ""}. Fight again any time.</p>` : s.tries ? `<p class="muted">${s.tries} tr${s.tries > 1 ? "ies" : "y"} so far. Every fight is different: the rounds are random.</p>` : ""}
        <h3>What you know</h3><ol class="bossrules">${rules}</ol>
        <p class="muted">${B.data}</p>
      </div><div>
        <textarea id="bossCode" wrap="off" spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="off"></textarea>
        <div id="bossErr"></div>
        <div class="row">${seen > 0 ? `<label class="muted">Start at <select id="bossFrom">${B.phases.slice(0, seen + 1).map((ph, k) => `<option value="${k}" ${k === seen ? "selected" : ""}>phase ${k + 1}</option>`).join("")}</select></label>` : ""}
          <button id="bossGo" class="primary">⚔️ Fight!</button><button id="bossTest">🧪 Test it</button><button id="closeBtn">Not now</button></div>
        <p class="muted">Three hearts. Every round your code gets right knocks the boss down a notch; every one it gets wrong costs a heart. ${seen > 0 ? "Phases you've reached are checkpoints." : ""}</p>
      </div></div>`);
    const ta = $("bossCode"); ta.value = code;
    ta.addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const k = ta.selectionStart; ta.value = ta.value.slice(0, k) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = k + 4; ta.dispatchEvent(new Event("input")); } e.stopPropagation(); });
    ta.addEventListener("input", () => { s.draft = ta.value; });
    const from = () => { const f = $("bossFrom"); return f ? +f.value : 0; };
    $("bossGo").onclick = () => fight(id, ta.value, from());
    $("bossTest").onclick = () => test(id, ta.value, from());
    $("closeBtn").onclick = () => { api.persistSave(); api.hideModal(); };
  }
  const errBox = (e) => `<div class="bperr">${e.line ? "Line " + e.line + ": " : ""}${esc(e.raw)}${e.tip ? `<div>💡 ${esc(e.tip)}</div>` : ""}</div>`;
  // a dry run: the same fight as a table, no 3D
  async function test(id, code, from) {
    const B = BOSSES[id], s = st()[id]; s.draft = code; api.persistSave(); $("bossTest").disabled = true;
    const F = await simulate(B, code, from, (Math.random() * 1e9) | 0); $("bossTest").disabled = false;
    if (F.compile) { $("bossErr").innerHTML = errBox(F.compile); api.sfx("bump"); return; }
    $("bossErr").innerHTML = `<p><b>Test:</b> ${F.won ? `✅ your code would win with ${F.hearts} ❤️ left.` : F.crash ? "💥 your code crashed partway." : `❌ out of hearts in phase ${F.reached + 1}.`} <span class="muted">Nothing counts until you fight for real.</span></p>${F.crash ? errBox(F.crash) : ""}${roundsTable(B, F, 8)}`;
  }
  function roundsTable(B, F, maxRows) {
    const rows = F.rounds.slice(-(maxRows || 99));
    return `<div class="tablewrap" style="max-height:240px;overflow:auto"><table class="goods"><tr><th>#</th><th>${B.name}</th><th>${B.fn}() said</th><th></th></tr>
      ${rows.map((r) => `<tr style="${r.ok ? "" : "background:rgba(220,70,60,0.16)"}"><td>${F.rounds.indexOf(r) + 1}<span class="muted"> · p${r.p + 1}</span></td><td><code>${esc(B.tell(r.input))}</code></td><td><code>${r.crash ? "💥" : esc(B.show(r.value))}</code></td><td>${r.crash ? "crashed" : r.ok ? "✓" : "❌ " + esc(r.why)}</td></tr>`).join("")}</table></div>`;
  }
  async function fight(id, code, from) {
    const B = BOSSES[id], s = st()[id]; s.draft = code; api.persistSave(); $("bossGo").disabled = true;
    const F = await simulate(B, code, from, (Math.random() * 1e9) | 0);
    if (!$("bossGo")) return; $("bossGo").disabled = false;
    if (F.compile) { $("bossErr").innerHTML = errBox(F.compile); api.sfx("bump"); return; }
    s.tries++; s.code = code; s.draft = null; s.seen = Math.max(s.seen, F.reached); api.persistSave();
    api.hideModal();
    const spec = {
      kind: id, name: B.name, icon: B.icon, hpMax: F.hpMax, hp0: F.hp0, hearts0: 3, arena: B.arena, won: !!F.won, crash: F.crash || null,
      rounds: F.rounds.map(r => ({ ...r, phase: B.phases[r.p].name, phaseNo: r.p + 1, rule: r.first ? B.phases[r.p].rule.replace(/<[^>]+>/g, "") : null, tell: B.tell(r.input), said: r.crash ? "💥 crashed" : `${B.fn}() → ${B.show(r.value)}`, line: r.crash ? "Your code crashed: " + r.crash.raw : r.ok ? null : r.why })),
    };
    const after = () => results(id, F, code);
    if (!window.Render3D || !Render3D.roam.boss || !Render3D.roam.boss.start(spec, after)) after();
  }
  function results(id, F, code) {
    const B = BOSSES[id], s = st()[id], first = F.won && !s.won;
    if (F.won) { s.won = true; s.wins++; if (!s.best || F.hearts > s.best.hearts) s.best = { hearts: F.hearts, rounds: F.rounds.length }; if (id === "golem") st().compass = true; }
    api.persistSave(); api.sfx(F.won ? "unlock" : "bump");
    const show = () => {
      const tip = !F.won && !F.crash ? B.tip(F.rounds) : null;
      api.showModal(`<h2>${F.won ? `🏆 ${B.name} is beaten!` : F.crash ? "💥 Your code crashed mid-fight" : `💔 Out of hearts in phase ${F.reached + 1}`}</h2>
        ${F.won ? `<p>${F.hearts} ❤️ left after ${F.rounds.length} rounds.${first ? " " + reward(id) : ""}</p>` : F.crash ? errBox(F.crash) : `<p>${B.name} got the better of Bolt this time. The red rows show what went wrong.</p>`}
        ${tip ? `<p>💡 ${tip}</p>` : ""}
        ${!F.won && F.reached > F.from ? `<p class="muted">You reached phase ${F.reached + 1}: next time you can start there.</p>` : ""}
        ${roundsTable(B, F)}
        <div class="row"><button id="bossAgain" class="primary">${F.won ? "Back to the code" : "Fix the code"}</button><button id="closeBtn">Done</button></div>`);
      $("bossAgain").onclick = () => menu(id); $("closeBtn").onclick = api.hideModal;
    };
    if (first) scene(OUTRO[id], () => { if (window.Render3D && Render3D.roam.boss) Render3D.roam.boss.calm(id); show(); if (window.Hub && Hub.refresh) Hub.refresh(); });
    else show();
  }
  function reward(id) {
    return { kraken: "Old Knotty is free. A baby kraken wants to follow you: see Odo for your reward.", golem: "Gearjaw gave you a <b>storm compass</b>: Storm Reef is on the map now. Old Gully has a reward for you.", tangle: "The sea is calm. Go and see Dad." }[id];
  }

  // ---------- Storm Reef: the Tangle's island, past the horizon (once you have the storm compass) ----------
  const RK = (x, z, s = 1.7) => ({ kind: "rock", x, z, s, ry: (x + z) % 6 }), CR = (x, z, s = 1.3) => ({ kind: "crystal", x, z, s }), ST = (x, z, ry = 0) => ({ kind: "stone", x, z, s: 1.1, ry });
  const REEF = {
    name: "Storm Reef", size: 60, radius: 15, seed: 7.7, start: { x: 0, z: 8 }, plaza: { x: 0, z: -1.5, r: 5 }, bay: { x: 0, z: 17, r: 6 },
    hills: [{ x: -7, z: -6, r: 4.5, h: 1.6 }, { x: 7, z: -7, r: 4, h: 1.9 }],
    flats: [{ x: 0, z: -1.5, r: 5.6, y: 1.0 }],
    get storm() { return !won("tangle"); }, // rain and lightning until the Tangle is untied
    get decor() {
      return [{ kind: "dock", x: 0, z: 9.5, len: 7 }, { kind: "tangle", x: 0, z: -2.8, calm: won("tangle") },
        ST(-5.2, -2.5, 0.3), ST(-3.6, -6, 1), ST(3.6, -6, 2), ST(5.2, -2.5, 3), ST(-4.2, 2.4, 4), ST(4.2, 2.4, 5),
        RK(-12, -3), RK(-9, -10), RK(-2, -13.5, 2.2), RK(6, -12.5), RK(11.5, -6), RK(12.5, 2.5), RK(-12, 5), RK(9, 7.5, 1.4), RK(-8, 8.5, 1.4),
        CR(-7, -6.5), CR(-6, -8.5, 1.1), CR(7.5, -8, 1.5), CR(10, -3, 1.1), CR(-10.5, 0.5, 1.2), { kind: "wreck", x: -9.5, z: 10.5, ry: 2.1 }];
    },
    spots: [], strollers: [], bots: [], gears: [],
    moor: { kind: "moor", x: 1.05, z: 15.8, label: "⛵ Your boat", boat: { x: 2.9, z: 15.3, ry: -Math.PI / 2 }, land: { x: 0, z: 15.1, yaw: Math.PI / 2 } },
    get props() { return [{ kind: "boss", boss: "tangle", x: 2.4, z: 4.6, ry: Math.PI, label: won("tangle") ? "💎 The heartstone" : "🌀 Face the Tangle" }, this.moor]; },
  };

  // ---------- quests read these ----------
  function progress(key) { return key === "compass" ? (st().compass ? 1 : 0) : won(key) ? 1 : 0; }
  function summary() { const s = st(); return ORDER.map(id => `${BOSSES[id].icon} ${s[id].won ? "✓" : s[id].tries ? s[id].tries + " tries" : "–"}`).join(" · "); }
  function snapshot() { const s = st(); return ORDER.filter(id => s[id].won); } // for the family board

  return {
    init(a) { api = a; }, menu, progress, summary, snapshot, won, open, REEF, BOSSES,
    reefOpen: () => !!st().compass, scene, WHO,
    debug: { simulate: (id, code, from = 0, seed = 1) => simulate(BOSSES[id], code, from, seed), total, knot, golemWant, results, st },
  };
})();
window.Bosses = Bosses;
