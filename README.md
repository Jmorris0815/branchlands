# 🌿 Branchlands

**A world you fix by writing real code. Every zone unlocks a new reason to code.**

Branchlands is a browser game for kids (about 8 to 14) and the grown-up building it with them.
You type real Python (and later JavaScript) into an in-game editor, a robot named Bolt carries it out,
and an island opens up zone by zone. Later zones put a Git terminal, pull-request reviews, a chatbot you
write yourself, and a real language model running on your own computer into the game, because
repositories, commits, branches, reviews and "things that think" are reasons to code too.

It is also the family project itself: this repo is meant to be worked on by two people, with branches,
pull requests and reviews, and the game checks GitHub to see that you really did it. See [CONTRIBUTING.md](CONTRIBUTING.md).

**Play:** https://branchlands.netlify.app (latest build) · https://jmorris0815.github.io/branchlands/ (what is merged to main)

## What's in the game

| Zone | Reason to code it teaches | What you actually do |
|---|---|---|
| 1. Lighthouse Rock | Machines only do exactly what you say. | `robot.move()`, turns, pick up the lens, press switches, unlock a gate with a key |
| 2. The Orchard | Stop doing boring stuff by hand. | `for`, `while`, nested loops; line limits make loops the only way through |
| 3. Fog Bridge | Make decisions when you can't see ahead. | `if` / `else`, `robot.sees()`, maps that reshuffle every run, patrolling crabs, teleporter pads |
| 4. The Workshop | Build a tool once, use it forever. | `def`, functions with parameters, levels that refuse to run without one, a boss level |
| 5. Time Tower | Never lose your work. Undo any mistake. | an in-game Git with a live commit graph: commit, checkout the past, branch, merge, **resolve a merge conflict**, **pull before you push** |
| 6. Two-Player Gate | Build things bigger than one person. | review three pull requests from "Dad" (one has no bug; approve it), then **write your own PR** with a title and description he reviews |
| 7. The Oracle | Make things that think. | write `reply(message)` in Python, give it memory with a dict, then plug in a **real local model via Ollama** and write its personality |
| 8. Mirror Sea | The same ideas work in every language. | the same robot, the same maps, in **JavaScript** |

Plus: a world map, star ratings per level (fewer lines = more stars), gems, 17 achievements, ranks,
a sandbox with every tile, a **level editor** that exports levels for a pull request or as a share link,
synthesized sound, light and dark themes, and **real-world quests** that the game verifies against the
family GitHub repo (your commits, your merged PRs).

## Harbor Town: the RuneScape layer

You start every session in Harbor Town, a free-roam 3D island with the camera behind Bolt, like the lobby of
a big game: a plaza with a fountain, market stalls, cottages, a pier with boats, a lighthouse, a clock tower,
Pip's orchard, and eight stone gates along the shore. Drive Bolt with **WASD / the arrow keys**, **click where to
go** (he finds his own way round things), or the **joystick** on a phone; drag to look around, scroll to zoom.
Drive up to someone and press **E** (tap **Talk** on a phone). Townsfolk turn to face you when you arrive.
Lit doorways lead inside: **Wrenna's Workshop** (workbench, paint bay, a robot on the repair lift, a fire) and
the **Time Tower** (turning brass gears, a pendulum, Git timeline banners, the Clockwright). Rooms are described in
`INTERIORS` in `js/hub.js`. Town days last ten minutes: golden sunsets, lamps that come on at dusk, moonlight and
stars (⚙️ Settings → Time of day can pin it). Townsfolk breathe, look at Bolt, and nod and gesture while you talk;
strollers and Bolt's robot cousins wander between spots, gulls circle, crabs scuttle, fish jump.
Where everything stands is one list in `js/hub.js` (`TOWN`); move a house by changing two numbers. Around town:

- **Eight zone portals.** Dark ones are sealed until you finish the zone before. Step through to play.
- **Townsfolk with real conversations.** Marisol (harbor master), Old Pip (loops), Odo (decisions and crabs),
  Wrenna (functions and upgrades), the Clockwright (Git), Dad (reviews and pull requests), the Oracle (bots),
  Captain Nyx (JavaScript). Each has topics that hand out clues, lore and quests. When Ollama is connected,
  every one of them also answers anything you type, in character, from a model on your own computer.
- **Skills (📈).** Eight skills that level from 1 to 99 by doing the thing: Commands, Loops, Logic, Functions,
  Git, Review, AI, JavaScript. First completions pay double, three-star runs pay 25% more, replays keep paying.
- **Loot and the Storehouse (🎒).** Everything Bolt picks up is yours (apples, gems, lenses, scrap), every
  mission drops zone goods (fog stone, planks, Oracle ink, mirror glass) and every Time Tower commit drops a
  time shard. Backpacks have a cap; bigger packs are an upgrade.
- **Market (🏪).** Prices drift every day, one good is HOT (+40%), and dumping a lot of one thing drops its
  price until tomorrow. Buying costs more than selling. That is the whole lesson in supply and demand.
- **Workshop (🔧).** Craft cheap goods into dear ones (3 apples → cider), and buy upgrades that really change
  `robot`: **Long Arm** picks from the tile ahead, **Spring Treads** jump two tiles, **Wide Scanner** makes
  `robot.scan()` return three tiles, **Crab Shell** survives a pinch, **Gem Magnet** doubles gem loot.
  Upgrades have skill requirements, like any RPG.
- **Style (🎨).** Paints, hats, eye colours and movement trails, all visible on Bolt. The rare ones are quest rewards.
- **Quest board (📜).** Forty multi-step missions from the townsfolk (three-star hunts, whole-zone clears, crafting runs, commit counts, trading targets, total-level milestones), plus three daily contracts that change
  every day. Rewards: coins, skill XP, paints, titles.

**Saves.** The home screen has three save slots, like a console: new game, continue, delete. Everything,
including Harbor Town, lives in the slot; export it from ⚙️ Settings to move it to another computer.

## Family world: one code, one world

In Harbor Town, the **👨‍👩‍👦 Family** stall creates a family and hands you a six-letter code. Anyone who joins
with that code (another device, another save slot) shares one world:

- **One market.** Everyone's sales move the same prices, so dumping apples hurts your sibling's price too.
- **A family board.** Total level, coins, missions, three-star count, titles, last seen.
- **Trading post.** Offer goods to your family for coins; they buy from their game, you get paid on your next sync.
- **Real pull-request reviews.** With a family connected, mission 6-4's pull request is not graded by the
  scripted Dad: it goes to the other person, who reads the code inside their own game and approves it or asks
  for changes with a comment. The mission completes when they approve. Reviewing pays Review XP.

No accounts and no email: the code is the key, plus a per-player token kept in the save. The server is a
single Supabase edge function (`bl-family`) over five `bl_` tables with row-level security and no public
policies; only game state (coins, levels, goods, review text) ever leaves the browser.

## Graphics

The realistic renderer draws real 3D models from `assets/models/` (Bolt, the cottage, zone walls, crabs, pick-ups, townsfolk, market stalls). They were generated on the family's DGX Spark from text prompts with the pipeline in `tools/assets3d/` (concept picture → Hunyuan3D mesh → small textured glTF); `tools/assets3d/preview.html?all=1` shows the whole set. Anything without a model file falls back to a built-in shape.

Harbor Town is one continuous island: the ground is a height field shaped from a few sine waves, hills, a bay
and flat pads under the buildings (`makeHeight` in `js/render3d.js`), Bolt drives over it with real speed,
turning and lean, the sun and its shadow box follow him, and a chase camera swings in behind him. The coding
levels keep the overhead view on purpose: you need to count tiles there.

Every level is drawn by a realistic 3D renderer (`js/render3d.js`, built on [Three.js](https://threejs.org)):
an island in an ocean under a physically based sky, a sun that casts real shadows, a wave shader for the
water, bloom on anything that glows (gems, crystals, teleporters, Bolt's eyes), a headlight on the robot,
and a different weather per zone (bright noon on Lighthouse Rock, thick low fog on Fog Bridge, sunset in
the Workshop, twilight at the Oracle, pale winter light on Mirror Sea). Drag to orbit, scroll to zoom.

Apart from the generated models there are no art files: every texture is a few lines of canvas code and the
lamps, pier, boats, lighthouse, tower and fountain are built from primitives, so a kid can read how they are made. The engine loads from a CDN; if it
can't (offline), the world waits for it; a browser without WebGL gets a notice. There is no 2D mode.
⚙️ Settings → Graphics switches between **full** (shadows, bloom, everything) and **fast** (older laptops,
Chromebooks, phones). Where the realism goes next (AI-generated skies, a rigged robot, cinematic zone intros)
is in [docs/PROGRAM.md](docs/PROGRAM.md#36-visual-direction).

## Run it locally

No build step. Any static server works:

```
python -m http.server 8000
```

Open <http://localhost:8000>. Python runs in the browser (Skulpt) and JavaScript runs in a Web Worker, so
you need an internet connection the first time for the Python engine and the fonts. Progress lives in the
browser's localStorage; export it from ⚙️ Settings to move it to another computer.

### The Real Oracle (zone 7-3) needs Ollama

1. Install [Ollama](https://ollama.com). 2. `ollama pull llama3.2:1b` (small and fast; any model works).
3. Let the browser talk to it: on Windows run `setx OLLAMA_ORIGINS "*"` then quit and restart Ollama from the tray.
   On Mac/Linux start it with `OLLAMA_ORIGINS=* ollama serve`. 4. In the game click **Connect**.
Nothing leaves your computer; the model runs locally.

## Project layout

```
index.html        page (map, level, editor screens)
css/style.css     styles (light + dark)
js/levels.js      zones, levels, maps, starter code, hints   <- easiest place to contribute
js/sim.js         world model: robot API, tiles, crabs, goals, event log (runs in page and worker)
js/python.js      Skulpt bridge: `import robot`, friendly errors
js/worker.js      runs student JavaScript off the main thread
js/jsrunner.js    worker wrapper with a 3-second kill switch
js/gitsim.js      the in-game Git: commit DAG, branches, merges, conflicts, a simulated origin
js/map.js         the world map
js/editor.js      level editor, export, share links
js/quests.js      GitHub quest verification, Ollama client
js/audio.js       synthesized sound effects
js/game.js        save slots, screens, progression, stars, achievements, settings, and the play modes
js/rpg.js         Harbor Town economy: skills, loot, market, crafting, upgrades, paint, quests, daily contracts
js/hub.js         Harbor Town: the TOWN layout, driving keys / joystick, NPC conversations (scripted + Ollama)
js/family.js      shared family world: family code, shared market, board, trading, real PR reviews (Supabase edge function)
js/device.js      phone/desktop detection (sets data-device for the phone layout)
docs/             company program, competitor teardown (with REA), research report
```

## Adding a level

Easiest: in the game, open **✎ Level editor** (or press **remix** on any level), paint it, play-test it,
click **Export for levels.js**, paste the result into `LEVELS` in `js/levels.js`, and open a pull request.
Or send the **share link** to your teammate first and let them play it before you PR it.

Grid legend: `#` wall, `.` floor, `~` water, `R` robot start, `G` goal, `A` apple, `L` lens, `*` gem, `K` key,
`X` gate, `S` switch, `D` door, `C` crab, `1`–`4` teleporter pairs. Optional fields: `maxLines`, `par`,
`requireDef`, `startDir`, `lang: "js"`, `generate: () => grid` for maps that change every run.

Robot API: `move(n) jump() turn_left() turn_right() turn_around() wait() pick() press() say(text)
sees(what) scan() done() has_key() bag_count() x() y()`. `sees()` knows: wall, water, apple, gem, key,
item, goal, switch, door, gate, teleporter, crab, floor.

## Status

Playable end to end (35 levels, all verified by a scripted playthrough). Realistic 3D renderer (3D only), Harbor Town hub with economy, skills, quests and NPCs, three save slots, phone play, a shared family world with real two-person PR reviews. Not built yet: accounts, Git against your real local folder, an LLM NPC inside the robot world, a rigged robot model, music.
The plan is in [docs/PROGRAM.md](docs/PROGRAM.md).

## License

MIT. See [LICENSE](LICENSE). Python-in-the-browser by [Skulpt](https://skulpt.org) (MIT).
