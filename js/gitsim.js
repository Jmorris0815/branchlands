// A tiny in-game Git. Real commit DAG, branches, merges WITH conflicts, and a
// simulated remote ("origin") for push/pull. Enough to teach the real workflow.

class GitSim {
  constructor() { this.reset(); }
  reset() {
    this.initialized = false;
    this.files = {}; this.staged = {};
    this.commits = {}; this.order = [];
    this.branches = {}; this.HEAD = { branch: "main", hash: null };
    this.merging = null;      // branch name while a conflicted merge is in progress
    this.remote = null;       // { main: hash } simulated origin
    this.lines = []; this.solved = false;
  }
  preset(name) {
    this.reset();
    if (name === "one-commit") {
      this.initialized = true; this.files = { "robot.py": "power = ON" }; this.staged = { ...this.files }; this.commitNow("robot boots");
    }
    if (name === "conflict") {
      this.initialized = true; this.files = { "lamp.py": "light = ON" }; this.staged = { ...this.files }; const base = this.commitNow("lamp works");
      this.branches.dad = base.hash; this.HEAD = { branch: "dad", hash: null };
      this.files = { "lamp.py": "light = BLUE" }; this.staged = { ...this.files }; this.commitNow("dad: blue lamp", "dad");
      this.HEAD = { branch: "main", hash: null }; this.files = { ...this.commits[base.hash].files }; this.staged = { ...this.files };
    }
    if (name === "remote") {
      this.initialized = true; this.files = { "robot.py": "power = ON" }; this.staged = { ...this.files }; const base = this.commitNow("robot boots");
      // Dad's commit lives only on origin
      const dad = { hash: this.hash(), msg: "dad: add hat", parents: [base.hash], files: { ...base.files, "hat.py": "style = TOP" }, n: this.order.length, author: "dad" };
      this.commits[dad.hash] = dad; this.order.push(dad.hash);
      this.remote = { main: dad.hash }; this.remoteSeed = dad.hash;
      // Our local commit
      this.files = { ...base.files, "wings.py": "flap = True" }; this.staged = { ...this.files }; const mine = this.commitNow("add wings");
      this.localSeed = mine.hash;
    }
  }
  hash() { let h = ""; const a = "0123456789abcdef"; for (let i = 0; i < 7; i++) h += a[Math.floor(Math.random() * 16)]; return this.commits[h] ? this.hash() : h; }
  headHash() { return this.HEAD.branch ? this.branches[this.HEAD.branch] || null : this.HEAD.hash; }
  headBranch() { return this.HEAD.branch; }
  headDetached() { return !this.HEAD.branch; }
  commitCount() { return this.order.length; }
  isAncestor(a, b) { const seen = new Set(), st = [b]; while (st.length) { const h = st.pop(); if (!h || seen.has(h)) continue; if (h === a) return true; seen.add(h); st.push(...this.commits[h].parents); } return false; }
  mergeBase(a, b) { const anc = new Set(); const st = [a]; while (st.length) { const h = st.pop(); if (!h || anc.has(h)) continue; anc.add(h); st.push(...this.commits[h].parents); } const q = [b], seen = new Set(); while (q.length) { const h = q.shift(); if (!h || seen.has(h)) continue; if (anc.has(h)) return h; seen.add(h); q.push(...this.commits[h].parents); } return null; }
  commitNow(msg, author) {
    const parent = this.headHash();
    const parents = parent ? [parent] : [];
    if (this.merging) { parents.push(this.branches[this.merging]); }
    const c = { hash: this.hash(), msg, parents, files: { ...this.staged }, n: this.order.length, author: author || "you" };
    this.commits[c.hash] = c; this.order.push(c.hash);
    if (this.HEAD.branch) this.branches[this.HEAD.branch] = c.hash; else this.HEAD.hash = c.hash;
    this.merging = null;
    return c;
  }
  out(s) { this.lines.push(s); }
  checkoutFiles() { const h = this.headHash(); this.files = h ? { ...this.commits[h].files } : {}; this.staged = { ...this.files }; }

  run(line) {
    this.lines = [];
    const argv = (line.match(/"[^"]*"|\S+/g) || []).map(s => s.replace(/^"|"$/g, ""));
    if (!argv.length) return this.lines;
    const [cmd, ...a] = argv;
    try {
      if (cmd === "help") {
        this.out("Commands you can use here:");
        ["git init", "git status", "git add <file> | git add .", "git commit -m \"message\"", "git log", "git diff", "git branch [name]", "git checkout <branch|hash>   (also: git switch)", "git merge <branch>", "git push / git pull   (when there is an origin)", "write <file> <text...>   (edit a file)", "ls", "cat <file>", "clear"].forEach(c => this.out("  " + c));
      }
      else if (cmd === "ls") this.out(Object.keys(this.files).join("  ") || "(empty folder)");
      else if (cmd === "cat") this.out(this.files[a[0]] !== undefined ? a[0] + ":\n" + this.files[a[0]] : "cat: no such file: " + a[0]);
      else if (cmd === "write") { if (a.length < 2) throw "usage: write <file> <text>"; this.files[a[0]] = a.slice(1).join(" "); this.out("wrote " + a[0] + "  →  " + this.files[a[0]]); }
      else if (cmd === "git") this.git(a);
      else this.out(cmd + ": command not found. Type help.");
    } catch (e) { this.out("error: " + e); }
    return this.lines;
  }

  git(a) {
    const sub = a[0];
    if (sub === "init") { if (this.initialized) { this.out("Reinitialized existing Git repository."); return; } this.initialized = true; this.out("Initialized empty Git repository. Your folder now has a memory."); return; }
    if (!this.initialized) throw "not a git repository. Run: git init";
    const head = this.headHash(); const committed = head ? this.commits[head].files : {};
    switch (sub) {
      case "status": {
        this.out(this.HEAD.branch ? "On branch " + this.HEAD.branch : "HEAD detached at " + this.HEAD.hash);
        if (this.remote && this.HEAD.branch === "main") {
          const ahead = this.order.filter(h => this.isAncestor(h, this.branches.main) && !this.isAncestor(h, this.remote.main)).length;
          const behind = this.order.filter(h => this.isAncestor(h, this.remote.main) && !this.isAncestor(h, this.branches.main)).length;
          if (ahead || behind) this.out("Your branch is " + (ahead ? "ahead of origin/main by " + ahead : "") + (ahead && behind ? " and " : "") + (behind ? "behind origin/main by " + behind : "") + " commit(s).");
          else this.out("Your branch is up to date with origin/main.");
        }
        if (this.merging) this.out("You have unmerged paths (merging '" + this.merging + "'). Fix the file, git add it, then git commit.");
        const staged = Object.keys(this.staged).filter(f => this.staged[f] !== committed[f]);
        const unstaged = Object.keys(this.files).filter(f => this.files[f] !== this.staged[f]);
        if (staged.length) this.out("Changes to be committed:  " + staged.join(", "));
        if (unstaged.length) this.out("Changes not staged:       " + unstaged.join(", ") + "   (use git add)");
        if (!staged.length && !unstaged.length && !this.merging) this.out("nothing to commit, working tree clean");
        break;
      }
      case "diff": {
        let any = false;
        for (const f of Object.keys(this.files)) {
          const before = this.staged[f] !== undefined ? this.staged[f] : committed[f];
          if (before === this.files[f]) continue; any = true;
          this.out("--- " + f); if (before !== undefined) this.out("- " + before); this.out("+ " + this.files[f]);
        }
        if (!any) this.out("(no unstaged changes)");
        break;
      }
      case "add": {
        if (!a[1]) throw "usage: git add <file> or git add .";
        const names = a[1] === "." ? Object.keys(this.files) : [a[1]];
        for (const n of names) { if (this.files[n] === undefined) throw "pathspec '" + n + "' did not match any files"; if (/<<<<<<</.test(this.files[n])) throw n + " still has conflict markers. Edit it first."; this.staged[n] = this.files[n]; }
        this.out("staged: " + names.join(", "));
        break;
      }
      case "commit": {
        const i = a.indexOf("-m"); if (i < 0 || !a[i + 1]) throw "usage: git commit -m \"message\"";
        if (!this.merging && JSON.stringify(this.staged) === JSON.stringify(committed)) throw "nothing to commit (did you git add?)";
        const c = this.commitNow(a[i + 1]);
        this.out("[" + (this.HEAD.branch || "detached") + " " + c.hash + "] " + c.msg + (c.parents.length === 2 ? "   (merge commit: two parents)" : ""));
        break;
      }
      case "log": {
        if (!this.order.length) { this.out("no commits yet"); break; }
        const reach = new Set(); const st = [head]; while (st.length) { const h = st.pop(); if (!h || reach.has(h)) continue; reach.add(h); st.push(...this.commits[h].parents); }
        const shown = a.includes("--all") ? [...this.order] : this.order.filter(h => reach.has(h));
        shown.reverse().forEach(h => {
          const c = this.commits[h]; const tags = Object.keys(this.branches).filter(b => this.branches[b] === h);
          if (this.remote && this.remote.main === h) tags.push("origin/main");
          this.out(h + "  " + c.msg + (c.author && c.author !== "you" ? "  [" + c.author + "]" : "") + (h === head ? "   <- HEAD" : "") + (tags.length ? "  (" + tags.join(", ") + ")" : ""));
        });
        if (!a.includes("--all") && shown.length < this.order.length) this.out("(other timelines exist: git log --all)");
        break;
      }
      case "branch": {
        if (!a[1]) { Object.keys(this.branches).forEach(b => this.out((b === this.HEAD.branch ? "* " : "  ") + b)); break; }
        if (this.branches[a[1]]) throw "branch '" + a[1] + "' already exists";
        if (!head) throw "make a commit first";
        this.branches[a[1]] = head; this.out("created branch " + a[1] + " (pointing at " + head + ")");
        break;
      }
      case "checkout": case "switch": {
        if (this.merging) throw "finish the merge first (fix, add, commit)";
        let target = a[1];
        if ((a[1] === "-b" || a[1] === "-c") && a[2]) { if (!head) throw "make a commit first"; this.branches[a[2]] = head; target = a[2]; }
        if (!target) throw "usage: git checkout <branch|hash>";
        if (this.branches[target]) { this.HEAD = { branch: target, hash: null }; this.out("Switched to branch '" + target + "'"); }
        else {
          const full = this.order.find(h => h.startsWith(target));
          if (!full) throw "no branch or commit named '" + target + "'";
          this.HEAD = { branch: null, hash: full }; this.out("HEAD is now at " + full + " (time travel!). Files restored from that commit.");
        }
        this.checkoutFiles();
        break;
      }
      case "merge": {
        const b = a[1]; if (!b || !this.branches[b]) throw "no branch named '" + b + "'";
        if (!this.HEAD.branch) throw "you're time-traveling (detached HEAD). checkout a branch first.";
        if (this.merging) throw "already merging. fix, add, commit.";
        this.mergeInto(this.branches[b], b);
        break;
      }
      case "push": {
        if (!this.remote) throw "no remote named origin (this repo isn't shared yet)";
        if (this.HEAD.branch !== "main") throw "switch to main first";
        if (this.isAncestor(this.remote.main, this.branches.main)) {
          if (this.remote.main === this.branches.main) { this.out("Everything up-to-date"); break; }
          this.remote.main = this.branches.main; this.out("Pushed. origin/main is now " + this.remote.main + ". Dad can see your work.");
        } else this.out("! [rejected] main -> main (fetch first)\nerror: origin/main has commits you don't have. Run: git pull");
        break;
      }
      case "pull": {
        if (!this.remote) throw "no remote named origin";
        if (this.HEAD.branch !== "main") throw "switch to main first";
        if (this.isAncestor(this.remote.main, this.branches.main)) { this.out("Already up to date."); break; }
        this.out("From origin: fetched " + this.remote.main);
        this.mergeInto(this.remote.main, "origin/main");
        break;
      }
      default: throw "git: '" + sub + "' is not a command here. Type help.";
    }
  }

  mergeInto(theirs, label) {
    const ours = this.headHash();
    if (this.isAncestor(theirs, ours)) { this.out("Already up to date."); return; }
    if (this.isAncestor(ours, theirs)) { this.branches[this.HEAD.branch] = theirs; this.checkoutFiles(); this.out("Fast-forward: " + this.HEAD.branch + " now points at " + theirs); return; }
    const base = this.mergeBase(ours, theirs); const bf = base ? this.commits[base].files : {};
    const of = this.commits[ours].files, tf = this.commits[theirs].files;
    const files = { ...of }; const conflicts = [];
    for (const f of new Set([...Object.keys(of), ...Object.keys(tf)])) {
      const o = of[f], t = tf[f], b = bf[f];
      if (o === t) continue;
      if (t === undefined || t === b) continue;          // they didn't change it
      if (o === undefined || o === b) { files[f] = t; continue; } // only they changed it
      conflicts.push(f); files[f] = "<<<<<<< HEAD\n" + o + "\n=======\n" + t + "\n>>>>>>> " + label;
    }
    if (conflicts.length) {
      this.files = files; this.staged = { ...of }; for (const f of conflicts) delete this.staged[f];
      // remember what we're merging; for origin/main create a temp branch pointer
      if (!this.branches[label]) this.branches[label] = theirs;
      this.merging = label;
      this.out("CONFLICT (content): both timelines changed " + conflicts.join(", "));
      this.out("Automatic merge failed. Open the file (cat), decide what's right, write it, git add it, git commit.");
      return;
    }
    const c = { hash: this.hash(), msg: "Merge " + label + " into " + this.HEAD.branch, parents: [ours, theirs], files, n: this.order.length, author: "you" };
    this.commits[c.hash] = c; this.order.push(c.hash); this.branches[this.HEAD.branch] = c.hash; this.checkoutFiles();
    this.out("Merge made: " + c.hash + "  (two timelines became one)");
  }

  // Draw the commit graph: time left->right, lanes by branch.
  drawGraph(canvas) {
    const ctx = canvas.getContext("2d");
    const n = Math.max(this.order.length, 1);
    canvas.width = Math.max(360, 76 * n + 70); canvas.height = 150;
    ctx.fillStyle = "#141b17"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!this.order.length) { ctx.fillStyle = "#8a9a90"; ctx.font = "13px sans-serif"; ctx.fillText(this.initialized ? "no commits yet" : "no repository yet (git init)", 12, 24); return; }
    const laneOf = {}; const pos = {}; const mainTip = this.branches.main;
    this.order.forEach((h, i) => {
      const onMain = mainTip ? this.isAncestor(h, mainTip) : true;
      const remoteOnly = !onMain && this.remote && this.isAncestor(h, this.remote.main);
      laneOf[h] = onMain ? 0 : remoteOnly ? 2 : 1;
      pos[h] = { x: 44 + i * 76, y: 44 + laneOf[h] * 40 };
    });
    ctx.lineWidth = 2;
    this.order.forEach(h => this.commits[h].parents.forEach(p => { if (!pos[p]) return; ctx.strokeStyle = "#6f8a7c"; ctx.beginPath(); ctx.moveTo(pos[p].x, pos[p].y); ctx.lineTo(pos[h].x, pos[h].y); ctx.stroke(); }));
    const head = this.headHash();
    this.order.forEach(h => {
      const { x, y } = pos[h]; const c = this.commits[h];
      ctx.fillStyle = laneOf[h] === 0 ? "#5fcf8f" : laneOf[h] === 1 ? "#f0b24a" : "#7fb3ff";
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      if (c.parents.length === 2) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke(); }
      if (h === head) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke(); }
      ctx.lineWidth = 2;
      ctx.fillStyle = "#dfe9e1"; ctx.font = "11px monospace"; ctx.textAlign = "center"; ctx.fillText(h, x, y + 24);
      const tags = Object.keys(this.branches).filter(b => this.branches[b] === h); if (this.remote && this.remote.main === h) tags.push("origin/main");
      if (tags.length) { ctx.fillStyle = "#ffd866"; ctx.font = "11px sans-serif"; ctx.fillText(tags.join(","), x, y - 16); }
    });
    ctx.textAlign = "left"; ctx.font = "12px sans-serif"; ctx.fillStyle = "#ff8";
    if (head && this.headDetached()) ctx.fillText("HEAD detached: you are visiting the past", 10, canvas.height - 8);
    else if (this.merging) ctx.fillText("merge in progress: resolve the conflict", 10, canvas.height - 8);
  }
}
window.GitSim = GitSim;
