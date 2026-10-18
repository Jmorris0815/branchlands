# 🌿 Branchlands

**A world you fix by writing real code. Every zone unlocks a new reason to code.**

Branchlands is a browser game for kids (about 8 to 14) and the grown-up building it with them.
You type real Python (and later JavaScript) into an in-game editor, a robot named Bolt carries it out,
and an island opens up zone by zone. Later zones put a Git terminal, pull-request reviews, a chatbot you
write yourself, and a real language model running on your own computer into the game, because
repositories, commits, branches, reviews and "things that think" are reasons to code too.

It is also the family project itself: this repo is meant to be worked on by two people, with branches,
pull requests and reviews, and the game checks GitHub to see that you really did it. See [CONTRIBUTING.md](CONTRIBUTING.md).

**Play:** https://jmorris0815.github.io/branchlands/

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

You start every session on the Harbor, a walkable 3D town. Move Bolt with the **arrow keys / WASD** or
**click a tile**; walk up to someone and press **E** (or click them). Around the harbor:

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
- **Style (🎨).** Paints, hats, eye colours and movement trails, all visible on Bolt in 2D and 3D. The rare ones are quest rewards.
- **Quest board (📜).** Forty multi-step missions from the townsfolk (three-star hunts, whole-zone clears, crafting runs, commit counts, trading targets, total-level milestones), plus three daily contracts that change
  every day. Rewards: coins, skill XP, paints, titles.

**Saves.** The home screen has three save slots, like a console: new game, continue, delete. Everything,
including Harbor Town, lives in the slot; export it from ⚙️ Settings to move it to another computer.

## Graphics: a real 3D island

Every level is drawn by a realistic 3D renderer (`js/render3d.js`, built on [Three.js](https://threejs.org)):
an island in an ocean under a physically based sky, a sun that casts real shadows, a wave shader for the
water, bloom on anything that glows (gems, crystals, teleporters, Bolt's eyes), a headlight on the robot,
and a different weather per zone (bright noon on Lighthouse Rock, thick low fog on Fog Bridge, sunset in
the Workshop, twilight at the Oracle, pale winter light on Mirror Sea). Drag to orbit, scroll to zoom.

There are no art files: every texture is generated by a few lines of canvas code, every model is built from
primitives, so a kid can read how the rocks, trees and crates are made. The engine loads from a CDN; if it
can't (offline, old browser), the game falls back to the original 2D renderer automatically.
⚙️ Settings → Graphics switches between **realistic 3D** (shadows, bloom), **fast 3D** (laptops, Chromebooks)
and **classic 2D**. Where the realism goes next (AI-generated skies, a rigged robot, cinematic zone intros)
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
js/render.js      canvas renderer, tile art, playback, particles, confetti
js/gitsim.js      the in-game Git: commit DAG, branches, merges, conflicts, a simulated origin
js/map.js         the world map
js/editor.js      level editor, export, share links
js/quests.js      GitHub quest verification, Ollama client
js/audio.js       synthesized sound effects
js/game.js        save slots, screens, progression, stars, achievements, settings, and the play modes
js/rpg.js         Harbor Town economy: skills, loot, market, crafting, upgrades, paint, quests, daily contracts
js/hub.js         the walkable hub: grid, props, movement, NPC conversations (scripted + Ollama)
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

Playable end to end (35 levels, all verified by a scripted playthrough). Realistic 3D renderer with a 2D fallback, Harbor Town hub with economy, skills, quests and NPCs, three save slots. Not built yet: accounts,
two-browser co-op, Git against your real local folder, an LLM NPC inside the robot world, a rigged robot model, music.
The plan is in [docs/PROGRAM.md](docs/PROGRAM.md).

## License

MIT. See [LICENSE](LICENSE). Python-in-the-browser by [Skulpt](https://skulpt.org) (MIT).
