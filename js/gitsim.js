// A tiny in-game Git. Enough to teach: init, add, commit, log, branch,
// checkout, merge. Commits form a real DAG so "time travel" is real.

class GitSim {
  constructor() { this.reset(); }
  reset() {
    this.initialized = false;
    this.files = {};          // working directory
    this.staged = {};
    this.commits = {};        // hash -> {hash, msg, parents:[], files:{}, n}
    this.order = [];          // hashes in creation order
    this.branches = {};       // name -> hash
    this.HEAD = { branch: "main", hash: null };
    this.lines = [];
  }
  preset(name) {
    this.reset();
    if (name === "one-commit") {
      this.initialized = true;
      this.files = { "robot.py": "power = ON" };
      this.staged = { ...this.files };
      this.commitNow("robot boots");
    }
  }
  hash() { let h = ""; const a = "0123456789abcdef"; for (let i = 0; i < 7; i++) h += a[Math.floor(Math.random() * 16)]; return this.commits[h] ? this.hash() : h; }
  headHash() { return this.HEAD.branch ? this.branches[this.HEAD.branch] || null : this.HEAD.hash; }
  headBranch() { return this.HEAD.branch; }
  headDetached() { return !this.HEAD.branch; }
  commitCount() { return this.order.length; }
  isAncestor(a, b) { // is commit a an ancestor of (or equal to) b?
    const seen = new Set(), stack = [b];
    while (stack.length) { const h = stack.pop(); if (!h || seen.has(h)) continue; if (h === a) return true; seen.add(h); stack.push(...this.commits[h].parents); }
    return false;
  }
  commitNow(msg) {
    const parent = this.headHash();
    const c = { hash: this.hash(), msg, parents: parent ? [parent] : [], files: { ...this.staged }, n: this.order.length };
    this.commits[c.hash] = c; this.order.push(c.hash);
    if (this.HEAD.branch) this.branches[this.HEAD.branch] = c.hash; else this.HEAD.hash = c.hash;
    return c;
  }
  out(s) { this.lines.push(s); }

  run(line) {
    this.lines = [];
    const argv = (line.match(/"[^"]*"|\S+/g) || []).map(s => s.replace(/^"|"$/g, ""));
    if (!argv.length) return this.lines;
    const [cmd, ...a] = argv;
    try {
      if (cmd === "help") {
        this.out("Commands you can use here:");
        ["git init", "git status", "git add <file> | git add .", "git commit -m \"message\"", "git log", "git branch [name]", "git checkout <branch|hash>", "git merge <branch>", "write <file> <text...>   (edit a file)", "ls", "cat <file>", "clear"].forEach(c => this.out("  " + c));
      }
      else if (cmd === "ls") this.out(Object.keys(this.files).join("  ") || "(empty folder)");
      else if (cmd === "cat") this.out(this.files[a[0]] !== undefined ? a[0] + ": " + this.files[a[0]] : "cat: no such file: " + a[0]);
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
    switch (sub) {
      case "status": {
        this.out(this.HEAD.branch ? "On branch " + this.HEAD.branch : "HEAD detached at " + this.HEAD.hash);
        const head = this.headHash(); const committed = head ? this.commits[head].files : {};
        const staged = Object.keys(this.staged).filter(f => this.staged[f] !== committed[f]);
        const unstaged = Object.keys(this.files).filter(f => this.files[f] !== this.staged[f]);
        if (staged.length) this.out("Changes to be committed:  " + staged.join(", "));
        if (unstaged.length) this.out("Changes not staged:       " + unstaged.join(", ") + "   (use git add)");
        if (!staged.length && !unstaged.length) this.out("nothing to commit, working tree clean");
        break;
      }
      case "add": {
        if (!a[1]) throw "usage: git add <file> or git add .";
        const names = a[1] === "." ? Object.keys(this.files) : [a[1]];
        for (const n of names) { if (this.files[n] === undefined) throw "pathspec '" + n + "' did not match any files"; this.staged[n] = this.files[n]; }
        this.out("staged: " + names.join(", "));
        break;
      }
      case "commit": {
        const i = a.indexOf("-m"); if (i < 0 || !a[i + 1]) throw "usage: git commit -m \"message\"";
        const head = this.headHash(); const committed = head ? this.commits[head].files : {};
        if (JSON.stringify(this.staged) === JSON.stringify(committed)) throw "nothing to commit (did you git add?)";
        const c = this.commitNow(a[i + 1]);
        this.out("[" + (this.HEAD.branch || "detached") + " " + c.hash + "] " + c.msg);
        break;
      }
      case "log": {
        if (!this.order.length) { this.out("no commits yet"); break; }
        const head = this.headHash();
        [...this.order].reverse().forEach(h => {
          const c = this.commits[h]; const tags = Object.keys(this.branches).filter(b => this.branches[b] === h);
          this.out(h + "  " + c.msg + (h === head ? "   <- HEAD" : "") + (tags.length ? "  (" + tags.join(", ") + ")" : ""));
        });
        break;
      }
      case "branch": {
        if (!a[1]) { Object.keys(this.branches).forEach(b => this.out((b === this.HEAD.branch ? "* " : "  ") + b)); break; }
        if (this.branches[a[1]]) throw "branch '" + a[1] + "' already exists";
        if (!this.headHash()) throw "make a commit first";
        this.branches[a[1]] = this.headHash(); this.out("created branch " + a[1]);
        break;
      }
      case "checkout": case "switch": {
        let target = a[1];
        if ((a[1] === "-b" || a[1] === "-c") && a[2]) { if (!this.headHash()) throw "make a commit first"; this.branches[a[2]] = this.headHash(); target = a[2]; }
        if (!target) throw "usage: git checkout <branch|hash>";
        if (this.branches[target]) { this.HEAD = { branch: target, hash: null }; this.out("Switched to branch '" + target + "'"); }
        else {
          const full = this.order.find(h => h.startsWith(target));
          if (!full) throw "no branch or commit named '" + target + "'";
          this.HEAD = { branch: null, hash: full }; this.out("HEAD is now at " + full + " (time travel!). Files restored from that commit.");
        }
        this.files = { ...this.commits[this.headHash()].files }; this.staged = { ...this.files };
        break;
      }
      case "merge": {
        const b = a[1]; if (!b || !this.branches[b]) throw "no branch named '" + b + "'";
        if (!this.HEAD.branch) throw "you're time-traveling (detached HEAD). checkout a branch first.";
        const ours = this.headHash(), theirs = this.branches[b];
        if (this.isAncestor(theirs, ours)) { this.out("Already up to date."); break; }
        if (this.isAncestor(ours, theirs)) { this.branches[this.HEAD.branch] = theirs; this.out("Fast-forward: " + this.HEAD.branch + " now points at " + theirs); }
        else {
          const files = { ...this.commits[ours].files, ...this.commits[theirs].files };
          const c = { hash: this.hash(), msg: "Merge branch '" + b + "'", parents: [ours, theirs], files, n: this.order.length };
          this.commits[c.hash] = c; this.order.push(c.hash); this.branches[this.HEAD.branch] = c.hash;
          this.out("Merge made: " + c.hash + "  (two timelines became one)");
        }
        this.files = { ...this.commits[this.headHash()].files }; this.staged = { ...this.files };
        break;
      }
      default: throw "git: '" + sub + "' is not a command here. Type help.";
    }
  }

  // Draw the commit graph on a canvas: lanes per branch, time left->right.
  drawGraph(canvas) {
    const ctx = canvas.getContext("2d");
    const n = Math.max(this.order.length, 1);
    canvas.width = Math.max(320, 70 * n + 60); canvas.height = 130;
    ctx.fillStyle = "#1e1e2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!this.order.length) { ctx.fillStyle = "#888"; ctx.font = "13px sans-serif"; ctx.fillText(this.initialized ? "no commits yet" : "no repository yet (git init)", 12, 24); return; }
    // lane assignment: main lane 0; a commit whose first parent is on a different branch tip goes to lane 1
    const lane = {}; const pos = {};
    this.order.forEach((h, i) => {
      const c = this.commits[h];
      const onMain = this.isAncestor(h, this.branches.main || "");
      lane[h] = onMain ? 0 : 1;
      pos[h] = { x: 40 + i * 70, y: 40 + lane[h] * 50 };
    });
    ctx.lineWidth = 2;
    this.order.forEach(h => this.commits[h].parents.forEach(p => { if (!pos[p]) return; ctx.strokeStyle = "#8aa"; ctx.beginPath(); ctx.moveTo(pos[p].x, pos[p].y); ctx.lineTo(pos[h].x, pos[h].y); ctx.stroke(); }));
    const head = this.headHash();
    this.order.forEach(h => {
      const { x, y } = pos[h];
      ctx.fillStyle = lane[h] ? "#f0a050" : "#5ad0a0"; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      if (h === head) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 2; }
      ctx.fillStyle = "#ddd"; ctx.font = "11px monospace"; ctx.textAlign = "center"; ctx.fillText(h, x, y + 24);
      const tags = Object.keys(this.branches).filter(b => this.branches[b] === h);
      if (tags.length) { ctx.fillStyle = "#ffd866"; ctx.fillText(tags.join(","), x, y - 16); }
    });
    if (head && this.headDetached()) { ctx.fillStyle = "#ff8"; ctx.textAlign = "left"; ctx.font = "12px sans-serif"; ctx.fillText("HEAD detached: you are visiting the past", 10, canvas.height - 8); }
  }
}
window.GitSim = GitSim;
