// Shared family world. A 6-letter family code joins two or more saves (Dad's PC, Bentley's phone, a second
// slot) into one world on Supabase: a shared market (everyone's sales move the same prices), a family
// leaderboard, trading goods between players, and real pull-request reviews: a 6-4 pull request goes to
// the other person, who approves it or asks for changes inside their own game.
// No accounts, no email: the code is the key, plus a per-player token kept in the save. Only game state
// (coins, levels, goods, review text) ever leaves the browser.

const Family = (() => {
  const $ = (id) => document.getElementById(id);
  const URL = "https://ymysieglenfdjdmfcnqy.supabase.co/functions/v1/bl-family";
  const KEY = "sb_publishable__1ZreqJVuK3QLU82LzAXEA_GaGATwKr";
  let save, api, last = null, timer = null, busy = false;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function init(s, a) {
    save = s; api = a; if (save.family === undefined) save.family = null;
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden && connected()) sync(); }, 60000);
    last = null; badge();
  }
  const connected = () => !!(save && save.family && save.family.token);

  async function call(action, body = {}) {
    const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + KEY }, body: JSON.stringify({ action, token: save.family && save.family.token, ...body }) });
    const j = await r.json().catch(() => ({ error: "The family server sent a reply I couldn't read." }));
    if (!r.ok || j.error) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  function snapshot() {
    const S = RPG.state;
    return { coins: S.coins, total: RPG.totalLevel(), missions: Object.keys(save.completed).length, stars: Object.values(save.completed).filter((c) => c.stars === 3).length, titles: S.titles, paint: S.paint, hat: S.cos.hat.on, name: save.settings.name,
      island: window.Home && Home.unlocked() ? Home.snapshot() : null, bosses: window.Bosses ? Bosses.snapshot() : null }; // island: so the family can sail over and look round (home.js)
  }
  async function create(familyName, playerName) { const j = await call("create", { family_name: familyName, player_name: playerName }); save.family = { code: j.code, token: j.token, playerId: j.player_id, name: j.family.name }; api.persist(); await sync(); return j; }
  async function join(code, playerName) { const j = await call("join", { code, player_name: playerName }); save.family = { code: j.code, token: j.token, playerId: j.player_id, name: j.family.name }; api.persist(); await sync(); return j; }
  async function leave() { try { await call("leave"); } catch (e) { } save.family = null; last = null; RPG.setExtraFlood(null); api.persist(); badge(); }

  async function sync() {
    if (!connected() || busy) return last;
    busy = true;
    try {
      const j = await call("sync", { snapshot: snapshot() }); last = j;
      RPG.setExtraFlood(j.flood);
      const paid = j.offers.filter((o) => o.status === "sold" && o.seller_id === j.me.id && !o.paid);
      if (paid.length) {
        const r = await call("claim_payouts"); let coins = 0; for (const o of r.paid) coins += o.price;
        if (coins) { RPG.addCoins(coins); api.toast(`<b>Family trade: +🪙 ${coins}</b>${r.paid.map((o) => `${esc(o.buyer_name)} bought ${o.qty} ${esc(o.good)}`).join("<br>")}`); }
        last.offers = j.offers.filter((o) => o.status === "open");
      }
      for (const rv of j.reviews) if (rv.author_id === j.me.id && rv.status !== "open" && !rv.seen) { api.onReview(rv); await call("review_seen", { id: rv.id }); rv.seen = true; }
      api.persist(); badge();
    } catch (e) { console.warn("family sync:", e.message); }
    busy = false; return last;
  }
  function badge() { const el = $("famBadge"); if (!el) return; const n = connected() && last ? inbox().length + offersForMe().length : 0; el.hidden = n === 0; el.textContent = "📬 " + n; }
  const others = () => (last ? last.players.filter((p) => p.id !== last.me.id) : []);
  const inbox = () => (last ? last.reviews.filter((r) => r.reviewer_id === last.me.id && r.status === "open") : []);
  const offersForMe = () => (last ? last.offers.filter((o) => o.status === "open" && o.seller_id !== last.me.id) : []);
  async function sold(good, qty, coins) { if (!connected()) return; try { await call("sold", { good, qty, coins }); } catch (e) { } }
  async function offer(good, qty, price) { const j = await call("offer", { good, qty, price }); await sync(); return j.offer; }
  async function cancelOffer(id) { const j = await call("cancel_offer", { id }); await sync(); return j; }
  async function buy(id) { const j = await call("buy", { id }); await sync(); return j.offer; }
  async function requestReview(level_id, title, body, code) { const j = await call("review_request", { level_id, title, body, code }); await sync(); return j.review; }
  async function decide(id, status, comment) { const j = await call("review_decide", { id, status, comment }); await sync(); return j.review; }
  const ago = (t) => { if (!t) return "–"; const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 2 ? "now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };

  // ---------- the Family tab in Harbor Town ----------
  function render() {
    const S = RPG.state;
    if (!connected()) return `<h3>Family world</h3><p class="muted">One code joins your saves into one world: the same market (everyone's sales move the prices), a family leaderboard, trading goods between you, and real pull-request reviews: a 6-4 pull request goes to the other person to approve inside their game.</p>
      <div class="cards"><div class="card famform"><b>Start a family</b><input id="famName" type="text" placeholder="Family name" maxlength="30"><input id="famMe" type="text" placeholder="Your name in the family" maxlength="20" value="${esc(save.settings.name)}"><button class="primary" data-fam="create">Create and get a code</button></div>
      <div class="card famform"><b>Join with a code</b><input id="famCode" type="text" placeholder="6-letter code" maxlength="6" autocapitalize="characters" spellcheck="false"><input id="famMe2" type="text" placeholder="Your name in the family" maxlength="20" value="${esc(save.settings.name)}"><button class="primary" data-fam="join">Join</button></div></div>
      <p class="muted">No account, no email. The code is the key: share it only with family.</p>`;
    if (!last) return `<h3>Family world</h3><p class="muted">Connecting…</p><button class="small" data-fam="refresh">Refresh</button>`;
    const meId = last.me.id;
    let h = `<h3>${esc(last.family.name)} · family code</h3><div class="famcode">${esc(last.family.code)}</div><div class="toolbar"><span class="muted">Give this code to family on another device or save slot.</span><span class="sp"></span><button class="small" data-fam="refresh">Refresh</button><button class="small danger" data-fam="leave">Leave family</button></div>`;
    h += `<h3>Family board</h3><div class="tablewrap"><table class="goods"><tr><th>Player</th><th>Total level</th><th>Coins</th><th>Missions</th><th>3★</th><th>Titles</th><th>Seen</th></tr>`;
    for (const p of [...last.players].sort((x, y) => ((y.snapshot || {}).total || 0) - ((x.snapshot || {}).total || 0))) { const s = p.snapshot || {}; h += `<tr><td>${p.id === meId ? "⭐ " : ""}${esc(p.name)}</td><td>${s.total ?? "–"}</td><td>🪙 ${s.coins ?? "–"}</td><td>${s.missions ?? "–"}/${LEVELS.length}</td><td>${s.stars ?? "–"}</td><td>${esc((s.titles || []).join(", ")) || "–"}${(s.bosses || []).map((id) => ({ kraken: " 🐙", golem: " ⚙️", tangle: " 🌀" }[id] || "")).join("")}${p.id !== meId && s.island && s.island.g ? ` <button class="small" data-fam="visit" data-id="${p.id}">🏝️ Visit</button>` : ""}</td><td class="muted">${ago(p.last_seen)}</td></tr>`; }
    h += `</table></div>`;
    const inb = inbox(), mine = last.reviews.filter((r) => r.author_id === meId);
    h += `<h3>Pull requests waiting for your review · ${inb.length}</h3>`;
    if (!inb.length) h += `<p class="muted">Nothing to review. When ${others().map((o) => esc(o.name)).join(" or ") || "someone in the family"} opens a pull request in mission 6-4, it lands here.</p>`;
    for (const r of inb) h += `<div class="qcard"><b>${esc(r.title)}</b> <span class="muted">by ${esc(r.author_name)} · mission ${esc(r.level_id)}</span><p>${esc(r.body)}</p><pre class="codebox">${esc(r.code)}</pre><textarea id="rc-${r.id}" placeholder="Your review comment: what's good, what to change, which line"></textarea><div class="toolbar"><button class="primary" data-fam="approve" data-id="${r.id}">✅ Approve</button><button data-fam="changes" data-id="${r.id}">✍️ Request changes</button></div></div>`;
    if (mine.length) h += `<h3>Your pull requests</h3>` + mine.slice(0, 6).map((r) => `<div class="qcard"><b>${esc(r.title)}</b> <span class="muted">→ ${esc(r.reviewer_name)}</span><div>${r.status === "open" ? "⏳ waiting for review" : r.status === "approved" ? "✅ approved" : "✍️ changes requested"}${r.comment ? ": <i>" + esc(r.comment) + "</i>" : ""}</div></div>`).join("");
    const goods = Object.keys(RPG.GOODS).filter((g) => RPG.have(g) > 0);
    h += `<h3>Trading post</h3><div class="cards"><div class="card famform"><b>Offer goods to your family</b><select id="ofGood">${goods.map((g) => `<option value="${g}">${RPG.GOODS[g].icon} ${RPG.GOODS[g].name} (${RPG.have(g)})</option>`).join("") || "<option value=''>nothing in your pack</option>"}</select><div class="row2"><input id="ofQty" type="number" min="1" value="1" title="how many"><input id="ofPrice" type="number" min="1" value="10" title="coins, total"></div><button class="primary" data-fam="offer" ${goods.length ? "" : "disabled"}>Post offer</button><span class="muted">Goods leave your pack now; the coins arrive when someone buys.</span></div></div>`;
    const open = last.offers.filter((o) => o.status === "open");
    if (open.length) { h += `<div class="cards">`; for (const o of open) { const mineO = o.seller_id === meId, G = RPG.GOODS[o.good]; h += `<div class="card"><div class="ct"><span class="big">${G ? G.icon : "📦"}</span> <b>${o.qty} ${esc(G ? G.name : o.good)}</b></div><div class="muted">${mineO ? "your offer" : "from " + esc(o.seller_name)} · 🪙 ${o.price}</div>${mineO ? `<button class="small" data-fam="cancel" data-id="${o.id}">Cancel</button>` : `<button class="small primary" data-fam="buy" data-id="${o.id}" ${S.coins < o.price ? "disabled" : ""}>Buy for 🪙 ${o.price}</button>`}</div>`; } h += `</div>`; }
    else h += `<p class="muted">No open offers.</p>`;
    return h;
  }
  async function click(b) {
    const a = b.dataset.fam; b.disabled = true;
    try {
      if (a === "create") await create($("famName").value.trim(), $("famMe").value.trim());
      else if (a === "join") await join($("famCode").value.trim().toUpperCase(), $("famMe2").value.trim());
      else if (a === "leave") { if (b.textContent !== "Really leave?") { b.textContent = "Really leave?"; b.disabled = false; return; } await leave(); }
      else if (a === "refresh") await sync();
      else if (a === "visit") { const p = last.players.find((x) => x.id === b.dataset.id); if (!p || !p.snapshot || !p.snapshot.island) throw new Error("Their island isn't here yet. They need to open the game once."); if (window.Hub && !Hub.active && $("townBack")) $("townBack").click(); // out of the menus and into the 3D world first
        if (!window.Hub || !Hub.visit(p.snapshot.island, p.name)) throw new Error("Go out to Harbor Town first, then sail over."); return; }
      else if (a === "offer") { const g = $("ofGood").value, q = Math.max(1, +$("ofQty").value | 0), p = Math.max(1, +$("ofPrice").value | 0); if (!g || RPG.have(g) < q) throw new Error("Not enough of that in your pack."); RPG.take(g, q); try { await offer(g, q, p); } catch (e) { RPG.add(g, q); throw e; } api.toast("Offer posted."); }
      else if (a === "cancel") { const o = last.offers.find((x) => x.id === b.dataset.id); const r = await cancelOffer(b.dataset.id); if (r.cancelled && o) { RPG.add(o.good, o.qty); api.toast("Offer cancelled; goods are back in your pack."); } }
      else if (a === "buy") { const o = last.offers.find((x) => x.id === b.dataset.id); if (!o) throw new Error("That offer is gone."); if (RPG.state.coins < o.price) throw new Error("Not enough coins."); if (RPG.have(o.good) + o.qty > RPG.cap()) throw new Error("No room in your pack for that."); const got = await buy(o.id); RPG.spend(got.price); RPG.add(got.good, got.qty); api.toast(`Bought ${got.qty} ${esc(got.good)} from ${esc(got.seller_name)}.`); }
      else if (a === "approve" || a === "changes") { const c = (($("rc-" + b.dataset.id) || {}).value || "").trim(); if (a === "changes" && !c) throw new Error("Say what should change, and on which line."); await decide(b.dataset.id, a === "approve" ? "approved" : "changes", c); RPG.addXp("review", 60); api.toast(a === "approve" ? "Approved. +60 Review XP" : "Changes requested. +60 Review XP"); }
    } catch (e) { api.toast("<b>Family</b>" + esc(e.message)); }
    RPG.renderTown("family");
  }

  return { init, connected, create, join, leave, sync, sold, offer, cancelOffer, buy, requestReview, decide, render, click, badge, others, inbox, get last() { return last; } };
})();
window.Family = Family;
