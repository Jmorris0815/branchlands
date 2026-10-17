# Competitor teardown: kids' learn-to-code games (with a REA hands-on)

Date: 2026-10-17. Scratch dir: `C:/Users/~/AppData/Local/Temp/claude/C--Users--/8f7a6e82-47c0-4520-b2ed-a1c81faf9ec2/scratchpad/teardown` (clones under `clones/`, REA output under `rea-out/`). All file paths below are relative to `clones/<repo>/` unless absolute. Nothing was logged into; no paid content or assets were extracted; only open-source repos and the unauthenticated public front-end of codecombat.com/play were examined, for architecture and mechanics only.

Clone commits examined: codecombat `6076267b` (2026-10-15), hedy `c2f65965` (2026-10-17), hedylang (HEAD, shallow), learnGitBranching v0.8.0 (HEAD, shallow), oh-my-git (HEAD, shallow).

---

## 1. REA hands-on results

### Commands run

```
npx -y rea-agents@6.5.0 --help
npx -y rea-agents@6.5.0 doctor --format md
npx -y rea-agents@6.5.0 analyze-javascript-application --help
npx -y rea-agents@6.5.0 analyze-web-bundle --help
# learnGitBranching: yarn install --ignore-scripts; node scripts/generate.js; npx vite build  -> build/
npx -y rea-agents@6.5.0 analyze-javascript-application <abs>/clones/learnGitBranching/build --format json > rea-out/lgb-app.json
# isolated headless Chrome (scratch user-data-dir, NOT the user's browsers):
chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch>/chrome-profile https://codecombat.com/play
npx -y rea-agents@6.5.0 list-browser-targets http://127.0.0.1:9333 --format json
npx -y rea-agents@6.5.0 analyze-web-bundle http://127.0.0.1:9333 <targetId> --observation-ms 3000 --format json > rea-out/codecombat-web.json
```

### Real CLI command list (rea 6.5.0, 130+ commands; grouped)

- Overview/aggregate: `analyze`, `inspect`, `inspect-artifact`, `decompile`, `function`, `instructions`, `search`, `trace`, `xrefs`, `read-bytes`, `search-bytes`, `doctor`, `setup`, `providers`, `capabilities`, `update`, `uninstall`, `completions`, `mcp`.
- JavaScript/web (the ones relevant to us): `analyze-javascript-application` (local dir or ASAR), `analyze-web-bundle` (needs a loopback CDP endpoint + target id), `list-browser-targets`, `inspect-web-page`, `inspect-web-event-listeners`, `export-web-scripts`, `recover-javascript-sources`, `trace-web-module-imports`, `trace-web-source-location`, `trace-application-feature`, `trace-javascript-semantics`, `compare-application-versions`, `compare-javascript-export-shapes`, `compare-source-to-bundle`, `import-reference-source`, `observe-web-execution`, `observe-web-session`, `capture-browser-scenario` (Playwright), `capture-web-screenshot`, `compare-web-captures`, `compare-web-screenshots`, `discover-webmcp-tools`, `inspect-web-network-capture`, `observe-javascript-runtime`, `list-javascript-runtime-targets`, `reconcile-javascript-runtime`, `inspect-analysis-view`, `evaluate-reconstruction-coverage`, `build-reconstruction-obligation-ledger`, `evidence-export/import`, `inspect-evidence-bundle`, `compare`.
- Electron: `capture-electron-scenario`, `inspect-electron-fuses`, `inspect-electron-page`, `list-electron-targets`.
- Native/binary (need Hopper/Ghidra/IDA/rizin/objdump): `inspect-binary-layout`, `inspect-native-*`, `annotate-native-function`, `debug-with-gdb`, `debug-with-rizin`, `execute-rizin-command`, `cutter-command`, `inspect-with-objdump`, `observe-native-calls`, `trace-native-*`, `inspect-macho`, `demangle-swift`, `inspect-go-binary`, `inspect-rust-binary`, `inspect-pe-resources`, `inspect-managed-*` (.NET), `instrument-with-frida`, `list-frida-*`.
- Android/ADB/APK: 25+ `*-adb-*` commands, `inspect-android-*`, `decode-android-resources` (apktool), `identify-flutter-build`, `inspect-dart-aot`, `project-android-application-graph`.
- Apple: `decode-interface-builder`, `inspect-asset-catalog`, `inspect-plist`, `inspect-keyed-archive`, `inspect-signature`, `project-apple-application-graph`.
- Misc: WASM (`inspect-wasm-artifact`, `compare-wasm-interfaces`), EVM, firmware, pcap/tshark, sigrok, SQLite, HarmonyOS.
- Global options: `--format <toon|json|yaml|md|jsonl>`, `--filter-output`, `--token-limit/--token-offset/--token-count`, `--schema`, `--llms`, `--mcp` (stdio MCP server).

`doctor` on this machine: node 24.15.0 / win32 x64 healthy; Hopper, Ghidra, IDA, jadx all `missing_analysis_engine`; four `config_drift` warnings about agent registrations (we did not run `setup`, so nothing was written to Claude/Codex configs). Static JS and CDP web analysis worked without any native engine, as expected.

### Output A: `analyze-javascript-application` on learnGitBranching `build/`

- Ran in 30 s; wrote a 45.7 MB JSON Evidence envelope (`rea-out/lgb-app.json`). Top-level: `evidence_id`, `subject` (sha256 of the dir), `provider`, `normalized_result{graph, semantic_graph, summary, statistics, limitations}`, `confidence: "derived"`, `authority: "shipped-artifact"`.
- `statistics`: 67 relevant files, 66 parsed, 3.9 MB text, 389,653 AST nodes, 951 findings, 0 parse failures.
- `graph` (JavaScriptApplicationGraph): 284 nodes / 1,084 edges. Node kinds: `javascript-module` 133, `endpoint` 74, `javascript-asset` 66, `storage` 6, `artifact` 2, `electron-renderer` 1 (the GTM `<script>` tag), `unknown` 2. Edge relations: `calls` 524, `imports` 347, `contains` 135, `exposes` 70, `persists_to` 6, `loads` 1, `maps_to` 1. Per module it records `module_format: esm`, import/export counts, export names, and exact source ranges with sha256 provenance.
- `semantic_graph` (JavaScriptSemanticRelationGraph): 21,368 nodes (`call-site` 7,293, `expression` 6,038, `function` 2,466, `binding` 2,302, `parameter` 2,099, `return-site` 1,023, `property-slot` 81, `module` 66), 11,721 relations, 2,395 fingerprints, 21,556 explicit `unknowns`.
- `summary` is Electron-oriented (browser windows, preload, contextBridge, IPC channels, utility processes, native addons) and is all zeros for a plain web app.
- Storage findings were correct and useful: `localStorage.setItem/getItem`, `sessionStorage` (LGB persists `solvedMap`, command history, aliases, certificate name there; confirmed in `src/js/stores/LevelStore.js`).
- Weak spot: the 74 "endpoint" nodes are nearly all false positives. REA treats Backbone-style `.get('visBranch')`, `.get('gitEngine')`, `.get('animationSpeed')` as "call:get" HTTP-method candidates, each flagged `confidence: low`, `interpretation: candidate`. Only 3 of them were real-looking. REA is honest about this in its own limitations text.
- Resource limit hit: `assets/vendor-CDOAWGeL.js` (477 KB: React/jQuery/Raphael) "exhausted its heap"; REA recorded the limitation and continued (`--max-heap-mb` would raise it).
- Minified names: the semantic graph labels are `t`, `e`, `n` etc. There is no de-minification; module boundaries, import graph, exports and source ranges are what you get.

### Output B: `analyze-web-bundle` on https://codecombat.com/play (public, unauthenticated)

- `list-browser-targets` found the page (Chrome/154 headless). `analyze-web-bundle` ran in 14 s and wrote 389 KB (`rea-out/codecombat-web.json`).
- `capture`: 36 scripts observed and analyzed, 2,664,806 AST nodes, 0 parse failures; chunk URLs like `https://codecombat.com/javascripts/chunks/9966-6fc32d4cbdb41850eaf9.bundle.js` (738 KB), a 3.46 MB main bundle, and `https://codecombat.com/user-data?sha=production-2026-10-09-18-03-50` (so their release id is in the URL).
- `inferences`: `bundle_runtime: webpack` (high, 3 bundles), `route_framework: "Generic route registration API"` (medium; detector `call:t.history.route` = Backbone.Router), 1,034 `endpoint_candidate` all `confidence: low`.
- `observations.routes` (105) is the most useful artifact: it recovered the client-side route table from the bundle without executing it, e.g. `/ai-junior`, `/ai-junior/creation/:projectId`, `project/:scenarioId/:userId/:projectId`, `/hackstack`, `/hackstack-algebra`, `/hackstack-cyber`, `/codequest`, `/league`, `ladders/:idOrSlug?`, `/live-classes`, `/editor/cinematic/:slug`, `/editor/cutscene`, `/editor/interactive/:slug?`, `/premium`, `/parents`, `/schools`, `/junior`, `teacher/:teacherId/classes/:classroomId/projects`, `licenses/stats`, `/payments/manage-billing`, `/payments/home-subscriptions-success`, `/outcomes-report/:kind/:country?/:idOrSlug`, `/ed-link/login-redirect`. That is a product map: AI Junior, HackStack (AI), CodeQuest, League/ladders, live classes, teacher licensing, Ed-Link SSO.
- `observations.endpoints` (verified mechanism): `/contact` (POST), `/db/user/-/lead-priority` (GET), `/auth/reset` (POST). Source maps: `not_requested` (we did not pass `--fetch-source-maps`; the public bundle may not expose them anyway).
- The headless Chrome was killed afterwards; the scratch profile dir is inside the teardown folder.

### Verdict

- REA works on Windows for static JS and CDP web capture with zero native dependencies, is fast, and produces deterministic, sha-stamped Evidence with explicit `limitations`/`unknowns`. Its best outputs for *this* project were: the module/import graph with export names, storage usage, the recovered client route table, chunk inventory, and framework detection.
- For an open-source competitor it is strictly worse than reading the source: it cannot see level definitions, goal logic, or content, and its "endpoint" heuristics are noisy (Backbone `.get()` false positives). For a proprietary competitor's public front-end it is a legitimate, non-invasive way to get an architecture map (routes, chunks, frameworks, storage, real API endpoints) without logging in or executing code. It does not (and we did not try to) bypass anything; it only reads what the browser already downloaded.
- Time spent: about 20 minutes including the LGB build. Not tried: `recover-javascript-sources`, `trace-application-feature`, `inspect-analysis-view` (they take a workflow-JSON argument and need the 45 MB evidence file as input; the output above was sufficient).

---

## 2. Open-source competitor teardown

### 2.1 CodeCombat (`clones/codecombat`, MIT code; levels/art are separately licensed, see `LICENSE-LEVELS.md`)

Tech stack: CoffeeScript + a growing JS/Vue 2.7 codebase on Backbone 1.1 (`package.json`: `backbone ~1.1.1`, `vue 2.7.10`, `coffee-script`, `lodash 2.4`, `ace-builds`, `treema` for schema-driven editors), webpack 5, MongoDB/Express server (`server/`), `ozaria/` is the sister product sharing the repo. Build runs `setup-aether.js` first (webpack-bundles Aether and copies esper language plugins for `lua`, `python`, `coffeescript` into the public dir).

How student code runs (safe execution):
- Student code never runs with `eval`. `app/lib/aether/` is their transpiler/sandbox; `app/lib/aether/interpreter.coffee` builds `new esper.Engine({strict: lang not in ['python','lua'], language: aether.language.id})` and parses with `realm.parser(code, inFunctionBody: true)`. esper.js is a JS-hosted, step-able interpreter; Python/Lua/CoffeeScript are esper language plugins (`esper.plugin 'lang-' + id`). Supported languages: `app/lib/aether/languages/{javascript,python,coffeescript,lua,java,cpp,html}.coffee`.
- `app/lib/aether/protectBuiltins.coffee` clones the JS builtins (`Object, Array, String, Math, JSON, Error…`) so a player cannot mutate them, and `eval` is explicitly excluded ("# Nope! # 'eval'").
- Simulation runs off the main thread. `app/lib/God.coffee` ("Each LevelView or Simulator has a God which listens for spells cast and summons new Angels… to oversee simulation of the World on worker threads") spawns `Angel`s; `app/lib/Angel.coffee` has one Web Worker each with watchdogs: `infiniteLoopIntervalDuration: 10000`, `infiniteLoopTimeoutDuration: 7500`, `abortTimeoutDuration: 500`; a non-responsive worker is `fireWorker()`ed and reported as an infinite loop. The worker bundle is assembled in `webpack.base.config.js` (`world: glob.sync('./app/lib/world/**/*.*')` plus `aether` "For worker_world").
- Simulate-then-playback model: `app/lib/world/world.coffee` `loadFrames()` simulates the whole world to a frame array (`@frames.length / @frameRate`, `maxTotalFrames`), streaming `serializeFramesSoFar` back to the UI, which then scrubs/plays it (level scripts can `playback: {scrub: {toRatio, toTime}}`). `headless: true` mode "just simulates for goal states" (used for the multiplayer ladder simulator, `app/lib/simulator/Simulator.coffee`).

Level definition (schema in `app/schemas/models/level.js`; actual levels live in MongoDB, not the repo). A level has `thangs` (entities composed of `components`, each `{original, majorVersion, config}` per `app/schemas/models/thang_component.js`), `systems` (`app/lib/world/systems/{action,collision,movement}.coffee`), `scripts` (cinematic/tutorial steps with `say`, `tutorial`, `playback`, `lock`, `letterbox`, `highlight`, `happensAfter`/`notAfter` prereqs), `goals`, `documentation.{specificArticles, generalArticles, hints}`, `concepts`, `type` (enum `campaign, ladder, hero, hero-ladder, hero-coop, course, course-ladder, game-dev, web-dev, intro`), `kind` (`demo, usage, mastery, advanced, practice, challenge`), `requiresSubscription`, `replayable`, `practice`, `practiceThresholdMinutes`, `shareable`, `requiredProperties`/`restrictedProperties` (gear the hero must/must not equip), `maximumHealth`. Default new-level stub (level.js ~line 365):

```js
{ documentation: {}, scripts: [], thangs: [], systems: [], victory: {}, type: 'hero',
  goals: [{ id: 'humans-survive', name: 'Your hero must survive.', saveThangs: ['Hero Placeholder'],
            howMany: 1, worldEndsAfter: 3, hiddenGoal: true }],
  concepts: ['basic_syntax'] }
```

Success detection: declarative goals evaluated by `app/lib/world/GoalManager.coffee` from world events during simulation. Goal types (level.js lines 30-90): `killThangs`, `saveThangs`, `getToLocations{who,targets}`, `getAllToLocations`, `keepFromLocations`, `leaveOffSides`, `keepFromLeavingOffSides`, `collectThangs`, `keepFromCollectingThangs`, `codeProblems`, `linesOfCode` (`{humans: 10}` statement budget), `html` goals with a jQuery `selector` for web-dev levels, plus modifiers `howMany`, `optional`, `hiddenGoal`, `worldEndsAfter`, `team`, `concepts`. `GoalManager.checkOverallStatus` = success iff every non-optional goal succeeded (and any concept goal, for course levels). The test fixture `test/app/lib/world/GoalManager.spec.coco.js` shows the event flow: `gm.submitWorldGenerationEvent('world:thang-died', {thang:{id:'Guy1'}}, 10)` -> `goalStates.killguy.status === 'success'`, `keyFrame === 20` (the frame at which it succeeded, used to end the world and for the victory cut).

Progression and motivation hooks:
- Campaign map (`app/schemas/models/campaign.schema.js`): levels have map `position`, `nextLevels`, `rewards`, `showIfUnlocked`; newer "modules" have `levelToUnlock`, and "tiles" have ordered unlock `rules` (including a stars rule: "stars only: where clicking the locked tile sends the player to go earn stars… Stars count no matter which campaign they came from").
- Economy: `user.js` has `points`, `earned: {heroes, items, levels, gems}`, `purchased: {…, gems}`, `stats.codePoints`, `stats.hsStarsPerCampaign`; heroes/items are `thang_type.js` with `gems` cost, `heroClass` (Warrior/Ranger/Wizard), `tier`, `unlockLevelName`. Achievements (`achievement.js`) are Mongo-query-driven (`query`, `collection`, `worth`, `proportionalTo`, `rewards`).
- Story/characters: scripts make thangs `say` with a `mood` enum (`explain, confused, curious, dance-happy, … joke, tip, alarm`), tutorial character "Vega", cinematics/cutscenes (`cinematic.schema.js`, `cutscene.schema.js`, routes `/editor/cinematic`).
- Hints: `HintsState.coffee` merges `docs.hintsB or docs.hints` + specific + general articles, shown in `HintsView`; nothing in the hint code checks premium. Adaptive practice: `practiceThresholdMinutes` routes slow players to practice levels.
- Multiplayer: `hero-ladder`/`course-ladder` types with headless simulation of other players' code (`/league`, `ladders/:idOrSlug?` routes seen via REA).

Premium gating (`app/views/play/CampaignView.js`): `this.requiresSubscription = !me.isPremium()`; per-level `level.requiresSubscription && !me.isStudent()`; modules have `lockReason = 'need-premium'`; `isPremiumCampaign(slug)` is `/campaign-(game|web)-dev-\d/` (game-dev and web-dev campaigns are premium); `promptForSubscription(...)` fires when a premium campaign is visited or the free world is complete; `paywallReached()` persisted in localStorage. Students in a licensed classroom bypass the paywall (`me.isStudent()`). Public pricing could not be fetched (codecombat.com/premium is JS-rendered; third-party aggregators cite ~$9.99/mo for home Premium, unverified).

### 2.2 Hedy (`clones/hedy` web app + `clones/hedylang` core; EUPL)

Tech stack: Flask (`app.py`, `website/*.py` blueprints), DynamoDB-style storage abstraction (`website/dynamo.py`, `database.py`), Jinja + htmx + Tailwind, TypeScript front-end (`static/js/*.ts` bundled to `static/js/appbundle.js`), CodeMirror 6 editor with Lezer grammars per level (`highlighting/lezer-grammars/level1.grammar` …). The language core moved out of the web repo into the `hedylang` pip package (`requirements-prod.txt`: `hedylang==0.0.8`, `lark==1.1.9`); `app.py` does `import hedy` and uses `hedy.HEDY_MAX_LEVEL` (currently 18 — `for_teachers.py` comments: "every language gets the same 18 levels").

Gradual-language level model (the core idea):
- One Lark grammar per level, built by merging: `hedylang/src/hedy/grammar.py::create_grammar(level, lang, skip_faulty)` starts from `level1.lark` then for each level merges `level{N}-Additions.lark` ("Rules that are redefined in the second file are overridden. Rules that are new in the second file are added."), then appends per-language keyword terminals (keywords are localized: `{print}`, `{ask}` in 47 languages). Level 1 grammar (`grammars/level1.lark`):

```lark
command: print | ask | echo | play | turtle | error_invalid_space | error_invalid | empty_line
print: _PRINT (text)?
ask: _ASK _SPACE? (text)?
echo: _ECHO (text)?
turtle: _FORWARD ((NUMBER | text))? -> forward | _TURN ((left | right ))? -> turn | ...
error_invalid.-100: textwithoutspaces text?
```

Level 2 additions (`level2-Additions.lark`): `command: += … assign | sleep -= echo >> error_invalid` (the `+=`/`-=`/`>>` mini-syntax adds variables and `sleep`, removes `echo`, and pushes the catch-all error rule to the end). Every level also has explicit *error* productions (`error_ask_dep_2`, `error_non_decimal`, …) so the transpiler can say "you used the level-1 form of ask; in level 2 write `name is ask …`" rather than a generic syntax error. This is the single most transferable idea: deliberate, versioned, kid-readable error messages encoded in the grammar.
- Hedy transpiles to Python and runs it client-side with Skulpt (`static/vendor/skulpt.min.js`; `static/js/app.ts` ~line 979: `Sk.configure({output, read, inputfun: inputFromInlineModal, __future__: Sk.python3, execLimit: …})`). `execLimit` is 10 s normally, 30 s when the program uses `sleep`, 5 min for levels < 7 ("we don't support loops yet"), and 100 min when using turtle/music/`if_pressed`. Program stop is signalled by setting `Sk.execLimit = 1`. A Skulpt debugger (`static/js/skulpt_debugger.js`) powers step-through.

Content model: adventures, not levels, are the unit of content. `content/adventures/en.yaml` (schema `adventures.schema.json`) has 58 adventures (`story`, `parrot`, `dice`, `fortune`, `haunted`, `harry_potter`, `restaurant`, `music`, `turtle`, `debugging`, `functions`…), each with `levels: {1: {story_text, example_code, story_text_2, example_code_2, answer_code}, 2: …}`. Example (`parrot`, level 2):

```yaml
story_text: "In the previous level you've made a parrot that will repeat after you. In this level we'll make the parrot interactive using a variable and `{ask}` command..."
example_code: |
  ```
  {print} I'm Hedy the parrot
  name _ _ what is your name?
  {print} name
  _
  ```
answer_code: |
  name is {ask} what is your name?
  {sleep} 2
```

So the *same* adventure recurs across levels, each time rewritten with the new syntax; the fill-in-the-blank `_` placeholders are the exercise.

Success detection: there is none in the game sense. Hedy is a programming environment with worked examples; "success" is the teacher looking at the student's saved program (`website/programs.py`, teacher dashboard `for_teachers.py::build_student_adventures` with "ticked" adventures). There are quizzes per level and Parsons problems (`content/research/Parsons_Problems_in_Hedy_2022.pdf`) but no automatic goal check per adventure.

Unlocks/progression: by default every level is open. Inside a class, the teacher's customizations gate it. `website/database.py` lines 299-321 document the class-customization record: `levels` (list of enabled levels), `opening_dates` (`{level: ISO date}`), `other_settings` (e.g. `hide_quiz`, deprecated), `sorted_adventures` (per level ordered list of `{from_teacher, name}` so teachers can reorder or inject their own adventures), `level_thresholds: {"quiz": int}` ("the minimum quiz grade that unlocks the next level"). `app.py` ~1255 removes levels whose `opening_dates` are in the future and 403s with `level_not_class` if a student requests a closed level.

Teacher/class features: classes with join links, student accounts without email, per-class customizations above, teacher-authored adventures (`website/for_teachers.py`), public adventure sharing with clone counts rendered as stars (`website/public_adventures.py`: `cloned_times_to_stars`), live student dashboard (`last_programs_for_user_all_levels`), 47 UI languages with keyword translation, printable cheatsheets/workbooks (`content/cheatsheets`, `content/workbooks`), micro:bit flashing (`static/js/microbit.ts`, `uflash`).

Motivation hooks: almost none. No XP, no characters beyond "Hedy the parrot" in a story, no gems. The hook is the gradual syntax (less to get wrong), turtle/music output, and the teacher relationship. Free and open source ("Hedy is free to use, open source"; hedy.org says "suitable for kids aged 10 and up"). Nothing is gated behind payment.

### 2.3 Learn Git Branching (`clones/learnGitBranching`, MIT)

Tech stack: plain JS (ES5-style modules), Backbone + Flux stores + React 17 views, Raphael SVG for the commit graph, jQuery, Vite 8 build, Jasmine tests, Netlify deploy. Fully client-side; progress lives in `localStorage` (`LevelStore.js`: `solvedMap`, alias map, certificate name). Git is **not real git**: `src/js/git/index.js` (3,768 lines) is a simulated git engine over an in-memory commit DAG (`GitEngine.prototype.makeOrigin`, `exportTree`, `rebaseInteractiveTest`…) with a Mercurial command alias layer (`src/js/mercurial`). Commands are matched by regex in `src/js/git/commands.js` (e.g. `regex: /^git +cherry-pick($|\s)/`) and each command returns an animation chain (`animationFactory.genCommitBirthAnimation`).

Level definition (`src/levels/<sequence>/<name>.js`, one file per level, indexed in `src/levels/index.js` as `levelFiles = {intro: ['./intro/commits', './intro/branching', …], rampup: […], move: […], mixed: […], advanced: […], remote: […], remoteAdvanced: […]}`; a build step generates a lazy-load manifest so each level is its own chunk, which is exactly what REA saw as `assets/fetchRebase-*.js` etc.). A level is a serialized start tree, a goal tree, the canonical solution, and localized dialogs. `src/levels/intro/commits.js`:

```js
exports.level = {
  "name": { "en_US": "Introduction to Git Commits", ... 29 locales },
  "goalTreeString": "{\"branches\":{\"main\":{\"target\":\"C3\",\"id\":\"main\"}},\"commits\":{\"C0\":{\"parents\":[],\"id\":\"C0\",\"rootCommit\":true},\"C1\":{\"parents\":[\"C0\"],\"id\":\"C1\"},\"C2\":{\"parents\":[\"C1\"],\"id\":\"C2\"},\"C3\":{\"parents\":[\"C2\"],\"id\":\"C3\"}},\"HEAD\":{\"target\":\"main\",\"id\":\"HEAD\"}}",
  "solutionCommand": "git commit;git commit",
  "startTree": "{\"branches\":{\"main\":{\"target\":\"C1\",\"id\":\"main\"}},\"commits\":{...},\"HEAD\":{\"target\":\"main\",\"id\":\"HEAD\"}}",
  "hint": { "en_US": "Just type in 'git commit' twice to finish!", ... },
  "startDialog": { "en_US": { "childViews": [ { "type": "ModalAlert", "options": { "markdowns": [ ... ] } }, { "type": "GitDemonstrationView", "options": { "beforeDemonstration": ..., "command": "git commit" } } ] } }
};
```

Remote levels add an `originTree` and a fake collaborator command: `src/levels/remote/fakeTeamwork.js` has `"solutionCommand": "git clone;git fakeTeamwork 2;git commit ;git pull"` — `git fakeTeamwork N` makes the simulated origin advance N commits so the student must `pull`/rebase. This is the only "collaboration" in the product and it is a single-player stub.

Success detection: after every command, `src/js/level/index.js::afterCommandDefer` does `TreeCompare.dispatchFromLevel(this.level, this.mainVis.gitEngine.printTree())`. `src/js/graph/treeCompare.js::dispatchShallow` picks a comparison mode by level flag: default = all branches + HEAD + tags must match; `compareOnlyMain`; `compareOnlyMainHashAgnostic` (commit IDs may differ, since rebases/cherry-picks create new IDs; used by 4 levels); `compareOnlyMainHashAgnosticWithAsserts` + `goalAsserts` (3 levels); `compareAllBranchesHashAgnostic`; `compareAllBranchesAndEnforceBranchCleanup` ("we enforce that you clean up any branches that you have locally that the goal does not have"); `compareOnlyBranches`; `onlyEvaluateAsserts`; `compareWorkingChanges` for the staging-area levels. Origin trees are compared separately via `levelBlob.originCompare`.

Scoring/progression: `levelSolved()` counts `this.gitCommandsIssued.length` against the solution's command count and stores `LevelActions.setLevelSolved(id, isBest)`; the solved-levels map drives a "best solution" badge in the level picker. Finish animation speeds up each time (`speed = 1.5/1.8/2.1` by `getNumLevelsSolved()`), levels are *never locked* — any level can be played in any order; `levels` opens the picker, `show goal`/`hint`/`show solution`/`undo`/`reset` are always available. Solving every level unlocks a printable certificate (`LevelStore.areAllLevelsSolved()`, `hasSeenCertificate`). Sandbox mode (`src/js/sandbox/commands.js`) adds `build level`, `export tree`, `import tree`, `import level` (a level is just JSON, so students can author and share levels), plus `alias`. The level builder (`src/js/level/builder.js`: `define start`, `define goal`, `define name`, `define hint`, `finish`) captures `gitEngine.printTree()` as the goal.

Hooks: visual DAG animation, instant feedback, per-level "best" star, certificate. No story, no characters, no XP. Nothing paid; no accounts (the only tracking is GTM analytics).

### 2.4 Oh My Git! (`clones/oh-my-git`, Blue Oak license; Godot 3 / GDScript)

Tech stack: Godot 3 desktop game that drives **real git**. `scenes/shell.gd::_shell_binary()` returns `bash` on Linux/macOS and the bundled `dependencies\windows\git\bin\bash.exe` on Windows; every command is run through that shell in a per-level temp dir with a controlled `HOME`. `scripts/gitconfig` is the sandboxed `~/.gitconfig` (`user.name = You`, `user.email = you@time.agency`, `core.editor = ~/fake-editor`, `init.defaultBranch = main`, `receive.denyCurrentBranch = ignore`, `commit.gpgsign = false`, `advice.detachedHead = false`). `scripts/fake-editor` (Perl) sends the file over a loopback TCP socket to Godot's in-game text editor and blocks until the player saves, so `git commit`/`git rebase -i` open the game's own editor. `scripts/hint` likewise pipes hint text back on `HINT_TCP_PORT`. The repo visualisation (`scenes/repository.gd`) is just `git --no-replace-objects cat-file --batch-check --batch-all-objects` plus `cat-file -p`, `rev-parse`, `show -s --format=%B`, re-polled after every command and force-laid-out as a node graph (`apply_forces`, `update_node_positions`).

Level definition: one plain-text file per level under `levels/<chapter>/<slug>`; chapter order in `levels/sequence` (`intro, files, branches, merge, index, remotes, changing-the-past, shit-happens, workflows, bisect, stash, tags, sandbox`) and level order in `levels/<chapter>/sequence`. Format (parsed by `scenes/level.gd::load`): `title`, `cards` (which command cards the player gets), `[description]`, `[cli]` (text shown to terminal users), `[setup]` / `[setup yours]` / `[setup remote]` (bash that builds one or more repos; `git init` is implicit), `[win]` / `[win yours]` (bash checks, one per repo), `[congrats]`. `levels/intro/commit`:

```
title = Your first commit
cards = commit-auto

[description]
You can use your time machine to make snapshots of objects around you! ...

[setup]
echo "The glass is full of water." > glass

[win]
# Make a snapshot of the glass (a "commit")
git rev-parse HEAD

# Change the contents of the glass!
! test "$(cat glass)" = "The glass is full of water."

# And make a second commit!
git rev-parse HEAD^ && ! test "$(git show main:glass)" = "The glass is full of water."
```

Success detection: each comment-headed block in `[win]` is a separately displayed objective; `level.gd::check_win()` wraps the block as `function win { … }; win 2>/dev/null >/dev/null && echo yes || echo no` and runs it in the real repo after every command; `main.gd` shows "Next Level" when all blocks pass and appends the slug to `game.state["solved_levels"]`.

Card mechanic: `resources/cards.json` defines ~40 cards `{id, command, description}` with placeholders, e.g. `{"id": "checkout", "command": "git checkout [commit, ref]", "description": "Drag this card to a commit or to a branch to travel to it!"}`, `git clone ../[remote] .`, `git config --global user.name [string]`. `scenes/card.gd::dropped_on()` substitutes the dropped node's id for `[...]`, `try_play()` sends the resulting real command to the terminal (`terminal.send_command(full_command)`) and spends `game.energy` (an unused-in-practice energy stat, default 2). Cards glow until first played (`played_cards` persisted). The design intent: a card is a *typed, drag-and-drop affordance for a real CLI command*; the terminal shows the exact text, and the `[cli]` text nudges the player to type it instead.

Progression/hooks: all levels are visible in `level_select.gd`; solved ones are marked. `game.gd` state = `{history, solved_levels, received_hints, cli_badge, played_cards}`. The **CLI badge** (`scenes/cli_badge.gd`, `main.gd` line 188: `if not game.used_cards and not slug in game.state["cli_badge"]`) is a sparkling gold badge for solving a level without using any card — a graceful ramp from GUI to terminal. Story framing is "time travel agency"; `[description]` is written in second person with a "teacher". No XP, no currency, no accounts, free (itch.io), project in "low-maintenance mode" per README. Remotes are simulated with sibling local repos (`[setup remote]` → `git clone ../remote`), so collaboration is again single-player.

---

## 3. Proprietary competitor scan (public pages only; no login)

| Product | Target | Language(s) | Hook | Pricing (public page, 2026-10-17) | Differentiator / notes | Git/GitHub? |
|---|---|---|---|---|---|---|
| **Codédex** (codedex.io) | Teens and adults; site is JS-rendered so the homepage/pricing/FAQ returned only titles to WebFetch. Third-party listing (CSforAll) says "kids and adults alike" | Python ("The Legend of Python"), JS, HTML/CSS, SQL, NumPy, Gen AI, intermediate Python | RPG map: "journey through the fantasy land of Python, earn experience points (XP) to unlock new regions, and collect all the badges"; story mode + challenge mode; community forum; certificates | Free "Explorer" tier (Legend of Python: 20 free challenges, 5 free projects); "Codédex Club… is $12.99/month" (codedex.io blog, Apr 2025, via search snippet; localized prices e.g. ₹279/MX$130); certificates are Club-only | The best-executed "XP map" UX in the set; pixel-art world, Discord community, projects | No Git course visible in public listings; no GitHub integration mentioned |
| **CodeMonkey** (codemonkey.com) | "Kids from 5-14 years old"; blog ranges 7-16 for Coding Adventure | Blocks (CodeMonkey Jr., Beaver Achiever), CoffeeScript ("Coding Adventure"), Python (Banana Tales, Coding Chatbots), JS/web for HS | "Write code. Catch bananas. Save the world." Monkey helps collect bananas; stars per challenge; Challenge Builder / Game Builder UGC | /pricing 404; app.codemonkey.com/plans shows only school plans (Classroom: 3 teacher + 35 student accounts; School/District custom quote). Home plans not on a public page; third parties cite ~$6-7/mo individual, ~$12/mo family (unverified) | Teacher-first: dashboard, auto-grading, solutions, standards, free trial = first 30 challenges | None. "Collaboration" only as a soft skill |
| **Tynker** (tynker.com) | "children ages 5 to 18"; Tynker Junior 5-7 | Blocks → JavaScript, Python (turtle), p5.js "Processing 1", C mentioned | "Story Based" lessons, gamified courses, Minecraft modding/skins (Bedrock), LEGO/Barbie/Hot Wheels/PBS licenses, "Featured Makers" | Home: Quarterly $18/mo ($54 billed quarterly), Yearly $15/mo ($180/yr), Lifetime $468 one-time; all "up to 3 children", parent dashboard, 30-day money-back; school plans by quote | Breadth (5,000+ lessons, 70+ courses) and licensed IP; mobile apps | None |
| **Kodable** (kodable.com) | K-5 (Basics K+, Creator Grade 2+, Bug World, Typing K-5) | Concept-first (sequencing/loops/functions) with no named language in Basics; Bug World names JavaScript; "Personalized AI Tutor" in Creator | "Fuzzy characters", vacation-themed typing, "Defend, Debug, and Code", recess-replay claim | Parents: $24.99/mo, $9.99/mo billed $119.99/yr, Lifetime $199.99; 7-day trial, 4 child profiles. Schools: Kickstart free; Premium $1,750/yr/site (250 students); Premium+ $2,500; All Access $3,500 (includes at-home) | Claims "half of U.S. elementary schools"; Clever/ClassLink rostering; AI tutor | None |
| **Code.org CS Discoveries / Game Lab** (code.org) | Grades 6-10 (CSD); Game Lab ages 12-18 | Game Lab = "Build animations and games with Javascript… code with blocks or text" (p5.play under the hood, not stated on page) | Project-based ("What will you create?"), remixing: "share your app in seconds", "remix them and make them your own"; Hour of Code | Free ("The free curriculum…"); devices/kits cost extra; CSD being succeeded by "AI Discoveries" for 2026-27 | Nonprofit, teacher PD, standards; team projects in Design Process unit | Footer only: "Built on GitHub from Microsoft" (not curriculum) |
| **MakeCode Arcade** (arcade.makecode.com) | Beginners/learners (no age stated); CS Intro 1-3 courses | Blocks, JavaScript (Static TypeScript), Python | Retro handheld games, hardware targets, skillmaps, multiplayer, "Publishing games" | Free; open-source PXT | **Has real GitHub integration**: makecode.com/github — "easily and freely host your programs and collaborate on them with friends", covers commit, history, fork, diff, release; "GitHub can be used to create and collect assignments from students"; GitHub Pages publishing. No pull requests mentioned | Yes (commits/forks/releases, not PR review) |
| **Hedy** (hedy.org, for comparison) | "kids aged 10 and up" | Hedy → Python over 18 levels | Gradual syntax; teacher-authored adventures | Free, open source | 47 languages | None |

Git/GitHub-for-kids check (WebSearch + fetches): no mainstream kids' coding game teaches Git. The only things found: **Codingal "GIT for Kids"** (live online 45-60 min classes, "Grade 1-12" but "Appropriate for Middle School & High School", 6 modules/36 lessons, "using GITHub to publish and share projects", no pull-request mention, price not public, page calls Git "Global Information Tracker" and mixes in HTML/CSS); **GitSetGo** (iPhone RPG, 30 missions, aimed at professionals); **Oh My Git!** and **Learn Git Branching** (adult/dev audience, single-player remotes); a UCLouvain researcher workshop using a Git serious game. **MakeCode Arcade** is the only kids' product with real GitHub commits/forks. Nothing found that teaches pull requests, code review, or multi-person collaboration to kids. The belief "almost none do" is confirmed.

---

## 4. Patterns worth borrowing (as design patterns, not content)

1. **Declarative goals + event-driven checker (CodeCombat).** Goals are data (`killThangs`, `getToLocations`, `linesOfCode`, `hiddenGoal`, `optional`, `howMany`, `worldEndsAfter`) and a `GoalManager` folds world events into per-goal `status` + `keyFrame`. For a Git game: goals like `branchExists`, `commitCountOnBranch`, `fileContentAtRef`, `prMerged`, `reviewApproved`, `conflictResolved`, each a small predicate over repo/remote state, with `hidden`/`optional` flags and a "key event" for the victory cut.
2. **Simulate-then-scrub playback with a watchdog worker (CodeCombat).** Running the student's program to completion off-thread and then letting them scrub time makes failures legible and infinite loops survivable (`Angel` 7.5 s watchdog). Analogue: record every git command's before/after DAG and let the kid scrub the timeline (LGB already animates per-command).
3. **Bash `[setup]`/`[win]` levels against a real tool (Oh My Git!).** A level is a text file: setup script + comment-headed win predicates, each comment becoming a visible objective; `check_win` reruns after every command. Trivially authorable, diffable, and testable in CI. Keep `git`'s real behaviour and sandbox only the environment (`HOME`, `gitconfig`, `core.editor` → in-game editor over loopback socket).
4. **Card → terminal ramp with a CLI badge (Oh My Git!).** Drag-and-drop cards that *emit the real command text* into a visible terminal, placeholders filled by what you drop them on, and a gold badge for finishing without cards. This is the cleanest GUI→CLI bridge seen; add a "typed it yourself" streak.
5. **Hash-agnostic goal comparison with explicit modes (LGB).** `compareOnlyMainHashAgnostic`, `compareAllBranchesAndEnforceBranchCleanup`, `goalAsserts`. Any Git goal checker must compare *shape* (parents, branch tips, file content), not SHAs, and must say which refs matter.
6. **Grammar-encoded, level-specific error messages (Hedy).** Each level's grammar includes `error_*` productions for last level's syntax so the message is "in level 2, ask needs a variable" rather than "syntax error". For Git: catch `git comit`, `git push` before `commit`, `git checkout` of a non-existent branch, and say what the kid probably meant, in the level's vocabulary.
7. **Same adventure, retold per level (Hedy) / same map, new regions per XP (Codédex).** Content reuse that makes progress feel like growth: the parrot/haunted-house/restaurant story recurs with richer syntax each level. For Git: one evolving project (a game, a comic, a recipe book) that the kid keeps committing to across the whole curriculum, rather than disposable repos per level.
8. **Teacher/parent customization record (Hedy) and classroom paywall bypass (CodeCombat).** Hedy's `levels`, `opening_dates`, `sorted_adventures`, `level_thresholds.quiz` is a tiny, complete model for an adult gating the pace; CodeCombat's `me.isStudent()` exemption shows how to sell to the adult while keeping the kid's path uninterrupted.
9. **Level-as-JSON with in-product builder and import/export (LGB).** `build level`, `export tree`, `import level` make kids and teachers content authors; each level lazy-loads as its own chunk.
10. **Small, honest progression signals**: LGB's "best solution" star (command count vs reference), Oh My Git!'s per-objective checkmarks, Hedy's public-adventure "stars" = clone count. None of the OSS products needed gems to feel rewarding; Codédex/CodeCombat add XP/gems/heroes mainly to drive subscription.

## 5. Gaps a new product could own

- **Real multi-person Git: branches, PRs, review, conflicts with another human.** Every product's "remote" is a stub (`git fakeTeamwork`, sibling local repo, `fetch`/`pull` levels) and every commercial kids' product has zero Git. MakeCode only does solo commit/fork/release. A parent-child or sibling co-op where each player has a real clone, opens a PR, requests changes, and resolves a conflict is unoccupied territory.
- **Parent-child co-op as the core loop.** All parent plans are "up to 3 children" seats with a dashboard; none makes the parent a player. Git is inherently two-party (author/reviewer), which makes it the natural subject for a co-op game.
- **AI NPC collaborators.** CodeCombat's route table shows AI products (`/ai-junior`, `/hackstack`) bolted on as separate modes; Kodable has an "AI tutor". Nobody uses an AI teammate as a Git collaborator who opens PRs with bugs, reviews your PR, or creates merge conflicts on purpose. That gives single-player access to the collaboration gap above without needing a second human online.
- **Real local files and a real repo on the kid's machine** (Oh My Git! proves it is viable, including on Windows with a bundled git-bash), versus everything else being an in-browser sandbox. A product that leaves the kid with a real GitHub repo and a real portfolio at the end has an artifact value none of the sandboxes have.
- **Ages 8-12 on-ramp for Git.** LGB/Oh My Git! read as adult/dev tools (terminology, no story); Codingal is live-tutor classes. A character-driven, card-to-terminal Git game for upper-elementary is open.
- **Verification by real tool state, not simulation.** Borrow Oh My Git!'s `[win]` bash predicates but run them against GitHub too (PR state, review state, CI status via API) so "success" means a real merged PR.
- **Content authoring by families/teachers.** LGB's JSON levels and Hedy's teacher adventures show demand; a level format that is just "setup script + win predicates + dialogue" invites UGC.

## 6. What could not be verified

- Codédex homepage, pricing, FAQ, community and terms pages are client-rendered; WebFetch returned only `<title>`. The $12.99/mo Club price and the "XP to unlock regions / badges" mechanics come from search-engine snippets of codedex.io's own blog and a CSforAll listing (which returned 504 when fetched). Target age not confirmed.
- CodeMonkey home/parent pricing: `/pricing` and `/parents` 404; `app.codemonkey.com/plans` lists only school plans. Home prices quoted from third-party reviews are unverified.
- CodeCombat home pricing (`/premium` JS-rendered); ~$9.99/mo from an aggregator only. Actual level documents (goals, scripts, hints) are in their database, not the repo; mechanics were read from schemas, GoalManager and views, not from live level data.
- Hedy's current `HEDY_MAX_LEVEL` constant lives in `hedylang/src/hedy/__init__.py` (`HEDY_MAX_LEVEL = MAX_LEVEL`); value inferred as 18 from `for_teachers.py` comments and the 18 `grammars/level*.lark` files rather than read directly.
- Kodable did not state target ages beyond grade bands; Tynker/Kodable "coins/badges" were not visible on the pages fetched.
- MakeCode Arcade: skillmaps not on the about page (they exist in the editor); GitHub integration details came from makecode.com/github (generic MakeCode, not Arcade-specific).
- REA: `recover-javascript-sources`, `trace-application-feature`, `inspect-analysis-view` and `--fetch-source-maps` were not exercised. The oh-my-git and codecombat clones had Windows checkout errors for a few files with unusual names (`.godot/` cache files; one `@`-named SVG in `app/assets/images/ozaria/...`); none of the analyzed files were affected.
