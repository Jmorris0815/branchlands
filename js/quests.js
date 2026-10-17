// Real-world quest verification (GitHub public API) and the Ollama client.
const Quests = (() => {
  async function gh(path) {
    const r = await fetch("https://api.github.com" + path, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub said " + r.status + (r.status === 404 ? " (repo not found or private)" : r.status === 403 ? " (rate limit, try again in an hour)" : ""));
    return r.json();
  }
  // Returns {commits, prs, merged, branches} authored by `name` (login or git user.name, case-insensitive).
  async function checkGitHub(repo, name) {
    const n = (name || "").trim().toLowerCase();
    if (!repo || !repo.includes("/")) throw new Error("Set the family repo as owner/name in Settings.");
    const [commits, pulls, branches] = await Promise.all([gh(`/repos/${repo}/commits?per_page=100`), gh(`/repos/${repo}/pulls?state=all&per_page=100`), gh(`/repos/${repo}/branches?per_page=100`)]);
    const mine = c => !n || (c.commit.author && c.commit.author.name || "").toLowerCase() === n || (c.author && c.author.login || "").toLowerCase() === n;
    const myCommits = commits.filter(mine);
    const myPrs = pulls.filter(p => !n || (p.user && p.user.login || "").toLowerCase() === n);
    return { totalCommits: commits.length, commits: myCommits.map(c => ({ sha: c.sha.slice(0, 7), msg: c.commit.message.split("\n")[0], when: c.commit.author.date })),
      prs: myPrs.map(p => ({ n: p.number, title: p.title, merged: !!p.merged_at, state: p.state, url: p.html_url })),
      merged: myPrs.filter(p => p.merged_at).length, branches: branches.map(b => b.name) };
  }

  // ---- Ollama ----
  async function ollamaTags(endpoint) {
    const r = await fetch(endpoint.replace(/\/$/, "") + "/api/tags"); if (!r.ok) throw new Error("Ollama said " + r.status);
    const j = await r.json(); return (j.models || []).map(m => m.name);
  }
  async function ollamaChat(endpoint, model, messages) {
    const r = await fetch(endpoint.replace(/\/$/, "") + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, messages, stream: false, options: { num_predict: 160, temperature: 0.8 } }) });
    if (!r.ok) throw new Error("Ollama said " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json(); return j.message && j.message.content || "";
  }
  return { checkGitHub, ollamaTags, ollamaChat };
})();
window.Quests = Quests;
