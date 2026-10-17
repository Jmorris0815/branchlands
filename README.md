# 🌿 Branchlands

**A world you fix by writing real Python. Every zone unlocks a new reason to code.**

Branchlands is a browser game for kids (about 8 to 14) and the grown-up building it with them.
You type real Python into an in-game editor, a robot carries it out, and the world opens up zone by zone.
Later zones put a Git terminal, a pull-request review, and a chatbot you write yourself into the game,
because repositories, commits, branches, reviews and "things that think" are reasons to code too.

It is also the family project itself: this repo is meant to be worked on by two people, with branches,
pull requests and reviews. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Play it

No build step. Any static server works:

```
python -m http.server 8000
```

Then open <http://localhost:8000>. Python runs in the browser (Skulpt, loaded from a CDN), so you need
an internet connection the first time. Progress is saved in the browser's localStorage.

## The seven zones

| Zone | Reason to code it teaches | Python / tool |
|---|---|---|
| 1. Lighthouse Rock | Machines only do exactly what you say. | `robot.move()`, `turn_left()`, `pick()` |
| 2. The Orchard | Stop doing boring stuff by hand. | `for`, `while`, line limits that force loops |
| 3. Fog Bridge | Make decisions when you can't see ahead. | `if` / `else`, `robot.sees()`, randomized maps |
| 4. The Workshop | Build a tool once, use it forever. | `def`, levels that require a function |
| 5. Time Tower | Never lose your work. Undo any mistake. | an in-game Git: `init`, `add`, `commit`, `log`, `checkout`, `branch`, `merge` |
| 6. Two-Player Gate | Build things bigger than one person. | review a buggy pull request, request changes, fix, approve, merge |
| 7. The Oracle | Make things that think. | write `reply(message)` in Python, pass the Oracle's questions, then chat with your bot |

Finishing a zone shows a **real-world quest** that moves the skill out of the game and onto the kid's own
computer and this repo (first `.py` file, first commit, first real pull request, first local AI model).

## Project layout

```
index.html        page
css/style.css     styles (light + dark)
js/levels.js      zones, levels, maps, starter code, hints   <- easiest place to contribute
js/sim.js         world model: robot API, goals, event log
js/python.js      Skulpt bridge: `import robot` module, friendly errors
js/render.js      canvas renderer and playback
js/gitsim.js      the tiny in-game Git (real commit DAG)
js/game.js        progression, UI, the four play modes
docs/             company program, competitor teardown, research report
```

## Adding a level

Open `js/levels.js`, copy an entry in `LEVELS`, change the `id`, `grid` (or `generate`), `goal`,
`starter` and `hints`. Grid legend: `#` wall, `.` floor, `~` water, `A` apple, `L` lens, `G` goal,
`S` switch, `R` robot start. Optional: `maxLines`, `requireDef`. Reload. That's it.

## Status

Prototype. Everything above is playable. Not built yet: real accounts, multiplayer, real Git against
the local repo, an LLM-backed Oracle (Ollama), art and sound. The plan is in [docs/PROGRAM.md](docs/PROGRAM.md).

## License

MIT. See [LICENSE](LICENSE). Python-in-the-browser by [Skulpt](https://skulpt.org) (MIT).
