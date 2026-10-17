# Branchlands: company program

*Version 0.2, 17 October 2026. Owner: Justin Morris.*

## 1. The one-line pitch

**A game kids play with a parent where every zone unlocks a new reason to write code, and the last zones are real Git, real pull requests, and a real AI, because nobody else teaches those to a twelve-year-old.**

## 2. Why this, why now

The research (see `docs/research-report.md`) and the competitor teardown (`docs/competitor-teardown.md`) say the same thing from two directions:

- Plenty of products teach typed Python to kids (CodeCombat, Hedy, Codédex, Tynker). Only CodeCombat is a game kids genuinely want to play, and it costs about $10 a month.
- **No kids' product teaches Git, pull requests, code review or multi-person collaboration.** MakeCode Arcade can commit to GitHub solo. Codingal sells live Git classes. That is the whole field. Meanwhile "most engineers fail to learn" PR workflow, which is exactly the user-stated pain.
- Nothing is built for a parent and child working the *same* repo. The best family precedent found was one father-son C# game on itch.io.
- AI is arriving in every classroom product as a tutor bolted on the side. Nothing lets the kid *build* the AI character.

Branchlands owns the gap: **collaboration and AI as game content, not as a feature.**

## 3. Product

### 3.1 Core loop

Type Python → robot acts → world changes → zone completes → a **Reason** unlocks ("Stop doing boring stuff by hand") → a **real-world quest** sends the skill to the kid's own computer and repo → next zone opens.

The prototype in this repo implements the loop end to end: 8 zones, 35 levels, seven play modes (robot world in Python or JavaScript, Git terminal with merge conflicts and push/pull, PR review, PR authoring, rule and memory chatbots, a real local LLM via Ollama), a world map, star ratings, achievements, a level editor with share links, and GitHub-verified real-world quests.

### 3.2 Mechanics borrowed from the teardown (as patterns, not content)

| Pattern | Where it comes from | Branchlands version |
|---|---|---|
| Simulate the world, then play it back | CodeCombat (world in a Web Worker, scrubbed playback) | `sim.js` runs code synchronously into an event log; `render.js` animates it |
| Declarative goals | CodeCombat `GoalManager` (`getToLocations`, `linesOfCode`...) | `goal: {type}` plus `maxLines` and `requireDef` |
| Constraints that force the concept | CodeCombat `linesOfCode`; Lightbot | "Max 4 lines" makes loops the only way through |
| Gradual language, one new thing per level | Hedy's per-level grammar | one new `robot.*` call or keyword per level |
| Git as a DAG you can see | Learn Git Branching | `gitsim.js` draws the commit graph live |
| Real tool behind the toy | Oh My Git! drives real git | roadmap: Zone 5 talks to the real local repo |
| Never lock a kid out | Learn Git Branching never locks levels | zones unlock in order, but hints are unlimited and nothing is paywalled in-game |

### 3.3 What is deliberately not borrowed

Combat theming (Common Sense Media flags CodeCombat for it). Gems/loot boxes. Leaderboards against strangers. Block-to-text "transition" modes; Branchlands is typed from minute one.

### 3.4 Roadmap

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 0. Prototype | done | this repo: 35 levels, 8 zones, editor, Ollama Oracle, JS zone, GitHub quest check | a kid can play 1-1 through 8-5 unassisted |
| 1. Family alpha | 1–6 | Justin + son use the repo for real: his branches, his PRs, his levels | 10 merged PRs authored by the kid; 3 new levels he designed |
| 2. Real Git zone | 6–12 | Zone 5 reads the player's actual repo via a tiny local helper (`branchlands serve`); today the game already verifies commits and merged PRs through the public GitHub API | first local commit marks 5-1 done in-game without GitHub |
| 3. Co-op | 12–20 | two browsers, one world: author/reviewer roles, live PR review on a shared level, deliberate merge-conflict level | two families outside ours finish Zone 6 together |
| 4. The real Oracle | 20–26 | 7-3 (Ollama system-prompt Oracle) ships in the prototype; next: the Oracle becomes an NPC inside the robot world, plus 7-4: train a tiny classifier (Machine Learning for Kids pattern) | NPC in the kid's own game answers from a model running on their machine |
| 5. Content + art | 26–40 | 60+ levels (35 and a level editor exist), community level packs from share links, pixel art pass, music | 2 hours of play per zone |
| 6. Launch | 40–52 | public web app, homeschool co-op pilots, Discord | 500 families, 20 paying |

### 3.5 Technical stack (keep it boring)

Static HTML/CSS/JS, no build step (so a kid can read every file). Skulpt for Python-in-browser (same engine Hedy uses). GitHub Pages for hosting. Later: a small Node helper for the real-Git zone, Ollama for local models, Supabase (already in the family's toolbox) for optional accounts and shared worlds. REA was evaluated and is not part of the product; it is a teardown tool (see §6).

## 4. Business

### 4.1 Customers

1. **Technical parents** (developers, IT, makers) with kids 8–14 who want to pass the craft on. They find it on Hacker News, Reddit r/daddit and r/learnprogramming, and the GitHub repo itself.
2. **Homeschool families and co-ops.** Pricing research shows they already pay $15–20/month per platform (Tynker, CodeMonkey homeschool plans).
3. Later: **code clubs and after-school programs** that want a Git curriculum and have none.

### 4.2 Pricing (hypothesis to test in Phase 1–3)

| Tier | Price | What |
|---|---|---|
| Solo | free, open source | all single-player zones, forever |
| Family co-op | $8/month or $60/year | shared worlds, PR-review zone with a real second player, progress sync, Oracle with cloud model fallback |
| Club | $200/year per 10 seats | teacher dashboard, level packs, printable quests |

Free single-player is non-negotiable: it is the funnel, the GitHub stars, and the moral position. Co-op is the thing worth paying for because it needs servers and it is the thing nobody else has.

### 4.3 Costs to launch

Near zero for Phases 0–2 (static hosting, founder time). Phase 3–5: one pixel artist on contract (~$3–5k), one curriculum reviewer with classroom experience (~$2k), hosting under $50/month. Total to launch: under $15k plus time.

### 4.4 Distribution

Open-source repo as marketing (REA's own trajectory, 0 to 300k stars in six months, shows how far a good README travels). A "Show HN: I built a game to teach my son Git" post at the end of Phase 1 with the kid's real merged PRs as the story. Homeschool YouTube and Facebook groups for Phase 3.

### 4.5 KPIs

Activation: % of new players who finish Zone 1 in the first session (target 70%). Retention: % who return and finish Zone 2 within a week (target 40%). The number that matters: **real pull requests opened by kids** (the quest at the end of Zone 6), tracked by an opt-in badge.

## 5. Legal and safety constraints (these shape the design)

- **GitHub is 13+ with no parental-consent path.** Under-13 play is single-player plus a shared parent account with the kid's own `user.name`. The product never asks a kid to create a GitHub account.
- **COPPA.** The prototype stores nothing server-side. If accounts are added, under-13 accounts require verifiable parental consent; simplest path is parent-created family accounts with child profiles that hold no PII beyond a nickname.
- **AI assistant terms.** Claude, Cursor and similar are 18+; Copilot via GitHub is 13+. The Oracle therefore runs **local models (Ollama)** by default, with any cloud fallback billed to and controlled by the parent.
- **Reverse engineering.** Teardowns target open-source projects or public, unauthenticated front-ends, for architecture only. No paid content, no asset copying, no login bypass. REA's own disclaimer prohibits otherwise, and so do we.
- **Content.** No combat, no chat with strangers, no user-generated text visible to other families without parent approval.

## 6. What REA actually did for us

We ran `rea-agents@6.5.0` on Windows against two targets (details and raw output locations in `docs/competitor-teardown.md`):

- `analyze-javascript-application` on a build of Learn Git Branching: a 133-module, 1,084-edge dependency and storage map in 30 seconds. Correct about localStorage use; noisy about "endpoints" (Backbone `.get()` false positives).
- `analyze-web-bundle` against CodeCombat's live `/play` page in headless Chrome: webpack runtime, Backbone router, 36 chunks, and a 105-entry client route table that exposes their product surface (AI Junior, HackStack, League, live classes, teacher licensing) without touching any paid content.

Verdict: a good non-invasive architecture map of a proprietary front end, and strictly worse than reading source when source exists. We used it for the map and read source for the mechanics.

## 7. Team and roles for Phase 1

- **Justin**: product, code, the parent in the parent-child loop.
- **Son**: player one, level designer, PR author. His merged PRs are the alpha's success metric.
- **Claude Code**: pair programmer on the parent's account, with the Learning output style when explaining code to the kid.

## 8. Decisions already made

Typed Python first, JavaScript second (Zone 8+ swaps `robot` for a JS API on the same maps). Open source, MIT. Public repo so branch protection is free. No accounts until co-op needs them. Ollama before any cloud model.

## 9. Open questions

- Does the line-limit mechanic frustrate 8-year-olds, or motivate them? (Test in Phase 1.)
- Real-Git zone: local helper process vs. GitHub API vs. isomorphic-git in the browser?
- Should Zone 6 co-op be synchronous (both online) or asynchronous (true PR style)? Probably both, async first.
