import { store } from './store.js';
import { $, $$, esc, icon, inr, num, idx, counts, photoOf, pf, logoOf, jerseySVG, LEVEL, STATUS_LABEL, teamStats, nextBidAmount, playerBase, debounce, sleep } from './util.js';
import { sfx, countTo, popEl } from './fx.js';

export const levelBadge = (p) => {
  const lv = LEVEL[p.level] || LEVEL.no;
  return `<div class="level" style="--c:${lv.color}"><div><div class="lab">How often do you play cricket?</div><div class="val">${lv.label}</div></div><div class="dots">${[1, 2, 3, 4].map((n) => `<i class="${n <= lv.dots ? 'f' : ''}"></i>`).join('')}</div></div>`;
};

/* ======================= HOME ======================= */
export function stageHTML(state) {
  const a = state.auction; const { P, T } = idx(state);
  const c = a.current;
  if (c) {
    const p = P.get(c.playerId); const t = c.teamId ? T.get(c.teamId) : null;
    const done = state.players.filter((x) => x.status === 'sold' || x.status === 'unsold').length;
    const leftN = a.queueCount;
    const ex = Object.entries(p.extra || {}).slice(0, 3);
    return `<div class="tag"><i></i>On the block</div><div class="count">PLAYER ${done + 1} · ${leftN} IN QUEUE</div>
    <div class="stage-body">
      <div class="p-photo" id="sPhoto"><div class="no">#${done + 1}</div><div class="frame"><img src="${esc(photoOf(p))}" alt=""${pf(p)}><div class="shine"></div></div></div>
      <div class="p-info"><div class="name">${esc(p.name)}</div>
        <div class="row">${levelBadge(p)}</div>
        <div class="baseprice">Base price <b>${inr(playerBase(state, p))}</b></div>
        ${ex.length ? `<div class="extras">${ex.map(([k, v]) => `<span class="chip">${esc(k)}: ${esc(v)}</span>`).join('')}</div>` : ''}</div>
      <div class="bid-panel"><div class="lbl">${c.bids.length ? 'Current bid' : 'Opening price'}</div>
        <div class="bid-amount" id="sAmt">${inr(c.price)}</div>
        <div class="holder ${t ? '' : 'empty'}" id="sHolder" style="--tc:${t ? t.color : '#fff'}">${t ? `<img class="logo" src="${esc(logoOf(t))}" alt=""><div class="who"><small>Highest bidder</small><b>${esc(t.name)}</b></div>` : 'Waiting for first bid…'}</div>
        <div class="next-line"><span>Next bid</span><b>${inr(nextBidAmount(state))}</b></div>
        <div class="bid-log" id="sLog">${c.bids.slice(-4).reverse().map((b) => { const bt = T.get(b.teamId); return bt ? `<div class="b"><img src="${esc(logoOf(bt))}" alt=""><b>${esc(bt.name)}</b><span>${inr(b.amount)}</span></div>` : ''; }).join('')}</div>
      </div></div>`;
  }
  const ph = a.phase;
  const cnt = counts(state);
  let body;
  if (ph === 'done' || (cnt.pending === 0 && cnt.total > 0 && cnt.sold > 0)) {
    body = `<h3>Auction <em>complete</em></h3><p>${cnt.sold} players sold across ${state.teams.length} teams. See the final squads.</p><div class="row-gap" style="justify-content:center;margin-top:22px"><a class="btn" href="#/teams">${icon('teams')} View teams</a><a class="btn ghost" href="#/players">${icon('players')} All players</a></div>`;
  } else if (ph === 'live' || ph === 'paused') {
    body = `<div class="bounce-ball"></div><h3>${ph === 'paused' ? 'Auction <em>paused</em>' : 'Next player <em>loading…</em>'}</h3><p>${ph === 'paused' ? 'We will be back in a moment.' : 'Stay tuned. The next player is about to be revealed.'}</p>`;
  } else {
    body = `<div class="bounce-ball"></div><h3>Player auction <em>starts soon</em></h3><p>${cnt.total} players · ${state.teams.length} teams · live on this screen</p><div class="countdown" id="cd"></div>`;
  }
  return `<div class="tag"><i style="background:#667;animation:none"></i>${ph === 'done' ? 'Completed' : ph === 'paused' ? 'Paused' : 'Standby'}</div><div class="stage-msg"><div>${body}</div></div>`;
}

function statsHTML(state) {
  const c = counts(state);
  const items = [['Total players', c.total, '#6cb6ff', 'in the pool'], ['Sold', c.sold + c.retained, '#2fe38a', c.retained ? `${c.retained} retained` : 'to teams'], ['Pending', c.pending + c.onBlock, '#ffc53d', 'yet to come'], ['Unsold', c.unsold, '#ff4d5e', 'second round']];
  return items.map(([l, v, col, sub], i) => `<div class="stat glass" style="--c:${col}"><small>${l}</small><b class="mono" data-count="${v}" data-money="${i === 4 ? 1 : 0}">0</b><div class="sub">${sub}</div></div>`).join('');
}
const MEDAL = ['#ffc53d', '#cfd8e3', '#d98a4e'];
function highlightsHTML(state) {
  const { P, T } = idx(state);
  const st = state.auction.stats;
  if (!st || !st.sold) return '';
  const top = st.top.filter((h) => P.get(h.playerId));
  if (!top.length) return '';
  const total = st.total; const sold = { length: st.sold };
  const hot = { bids: new Array(st.hot.n), playerId: st.hot.playerId };
  const rows = state.teams.map((t) => ({ t, left: teamStats(state, t).purseLeft })).sort((x, y) => y.left - x.left);
  const cap = Math.max(state.settings.purse || 0, ...rows.map((r) => r.left), 1);
  const tile = (l, v, sub, col) => `<div class="stat glass" style="--c:${col}"><small>${l}</small><b class="mono hl-v">${v}</b><div class="sub">${sub}</div></div>`;
  return `<div class="sec-title"><h2>Auction <em>highlights</em></h2><div class="bar"></div></div>
  <div class="top3">${top.map((h, i) => { const p = P.get(h.playerId); const t = T.get(h.teamId); return `<div class="tp glass" data-pid="${p.id}" style="--m:${MEDAL[i]}"><div class="rk">#${i + 1}</div><div class="ph"><img src="${esc(photoOf(p))}" alt=""${pf(p)}></div><div class="in"><small>${i === 0 ? 'Most expensive' : i === 1 ? 'Second highest' : 'Third highest'}</small><b>${esc(p.name)}</b><div class="pr mono">${inr(h.price)}</div>${t ? `<div class="tm"><img src="${esc(logoOf(t))}" alt="">${esc(t.name)}</div>` : ''}</div></div>`; }).join('')}</div>
  <div class="stats hl">${tile('Average price', inr(total / sold.length), `across ${sold.length} player${sold.length > 1 ? 's' : ''} sold`, '#6cb6ff')}${tile('Hottest battle', `${(hot.bids || []).length} bids`, esc((P.get(hot.playerId) || {}).name || ''), '#ff4d5e')}</div>
  <div class="purses glass"><small>Purse left per team</small>${rows.map(({ t, left }) => `<div class="pu" style="--tc:${t.color}"><img src="${esc(logoOf(t))}" alt=""><b>${esc(t.name)}</b><div class="bar2"><i style="width:${Math.max(2, (left / cap) * 100)}%"></i></div><span class="mono">${inr(left)}</span></div>`).join('')}</div>`;
}
function runCounts(root) {
  $$('[data-count]', root).forEach((el) => countTo(el, el.dataset.count, el.dataset.money === '1' ? (n) => inr(n) : (n) => String(Math.round(n))));
}

export function teamCardHTML(state, t, leadId) {
  const st = teamStats(state, t);
  const pct = st.squadSize ? Math.min(100, (st.filled / st.squadSize) * 100) : 0;
  return `<a class="tcard glass ${leadId === t.id ? 'lead' : ''}" href="#/team/${t.id}" style="--tc:${t.color}" data-tid="${t.id}">
    <div class="head"><img class="logo" src="${esc(logoOf(t))}" alt=""><div><h3>${esc(t.name)}</h3><div class="owner">Owner · <b>${esc(t.owner || '—')}</b></div></div></div>
    <div class="tc-foot"><span class="chip">${st.filled} / ${st.squadSize} players</span><span class="chip">${inr(st.purseLeft)} left</span></div></a>`;
}

function recentHTML(state) {
  const { P, T } = idx(state);
  const rows = state.auction.history.filter((h) => h.type === 'sold' || h.type === 'unsold').slice(-8).reverse();
  if (!rows.length) return '';
  return `<div class="sec-title"><h2>Recent <em>results</em></h2><div class="bar"></div></div><div class="pgrid">${rows.map((h) => {
    const p = P.get(h.playerId); if (!p) return ''; const t = h.teamId ? T.get(h.teamId) : null;
    return `<div class="pcard ${p.status}" data-pid="${p.id}"><div class="ph"><img src="${esc(photoOf(p))}" alt=""${pf(p)}></div><div class="st"><span class="chip ${h.type}">${h.type === 'sold' ? 'Sold' : 'Unsold'}</span></div><div class="meta"><b>${esc(p.name)}</b><small>${t ? `<img src="${esc(logoOf(t))}" alt="">${esc(t.name)}<span class="pr">${inr(h.price)}</span>` : 'Unsold'}</small></div></div>`;
  }).join('')}</div>`;
}

export function homeView() {
  let box; let lastPid = null; let lastAmt = null; let lastTeam = null; let lastPhase = null; let cdTimer; let drumming = false;
  const header = (s) => {
    const st = s.settings;
    const sp = st.sponsors || [];
    return `<section class="hero"><div class="hero-brand"><img class="emblem" src="/assets/jito-ladies.png" alt="JITO Ladies"><div><small>${esc(st.organiser || 'JITO Ladies Wing Bhavnagar')}</small>${st.presentedBy && !sp.some((x) => /title/i.test(x.role) && x.logo) ? `<span>Presented by <b>${esc(st.presentedBy)}</b>${st.coSponsor ? ` · with ${esc(st.coSponsor)}` : ''}</span>` : ''}</div>${(() => { const t = sp.find((x) => /title/i.test(x.role) && x.logo); return t ? `<div class="title-sp"><small>Title sponsor</small><img src="${esc(t.logo)}" alt="${esc(t.name)}"></div>` : ''; })()}</div>
    <div class="hero-title"><div class="l1">${esc(st.eventName || 'Ladies Cricket Tournament')}</div><br><div class="l2"><span>Player Auction</span></div></div>
    <div class="event-chips">${st.auctionDate ? `<span class="chip on">${icon('gavel')}Auction · ${esc(st.auctionDate)}${st.auctionVenue ? ' · ' + esc(st.auctionVenue) : ''}</span>` : ''}${st.date ? `<span class="chip">${icon('cal')}Tournament · ${esc(st.date)}</span>` : ''}${st.time ? `<span class="chip">${icon('clock')}${esc(st.time)}</span>` : ''}${st.venue ? `<span class="chip">${icon('pin')}${esc(st.venue)}</span>` : ''}</div></section>`;
  };
  const wire = () => {
    box.onclick = (e) => { const c = e.target.closest('[data-pid]'); if (c) window.__openPlayer(c.dataset.pid, []); };
  };
  const startCd = (s) => {
    clearInterval(cdTimer);
    const el = $('#cd', box); if (!el || !s.settings.startAt) return;
    const tick = () => {
      let d = Math.max(0, new Date(s.settings.startAt) - Date.now()) / 1000;
      const parts = [['Days', Math.floor(d / 86400)], ['Hours', Math.floor(d % 86400 / 3600)], ['Mins', Math.floor(d % 3600 / 60)], ['Secs', Math.floor(d % 60)]];
      el.innerHTML = parts.map(([l, v]) => `<div><b>${String(v).padStart(2, '0')}</b><small>${l}</small></div>`).join('');
    };
    tick(); cdTimer = setInterval(tick, 1000);
  };
  const full = (s) => {
    const lead = s.auction.current && s.auction.current.teamId;
    box.innerHTML = `${header(s)}<div class="stage" id="stage">${stageHTML(s)}<div class="drum" id="drum"></div></div>
      <div class="stats" id="stats">${statsHTML(s)}</div>
      <div class="sec-title"><h2>The <em>teams</em></h2><div class="bar"></div><a class="chip" href="#/teams">All teams ${icon('next')}</a></div>
      <div class="team-grid" id="tgrid">${s.teams.map((t) => teamCardHTML(s, t, lead)).join('') || '<div class="empty-state glass"><b>No teams yet</b>Add teams from the admin panel.</div>'}</div>
      <div id="hl">${highlightsHTML(s)}</div>
      <div id="recent">${recentHTML(s)}</div>`;
    runCounts(box); startCd(s);
    const c = s.auction.current; lastPid = c && c.playerId; lastAmt = c && c.price; lastTeam = c && c.teamId; lastPhase = s.auction.phase;
  };
  async function reveal(s) {
    // slot-style name reel before showing the new player
    const stage = $('#stage', box); const drum = $('#drum', box); if (!stage || !drum) return;
    drumming = true; const names = s.players.filter((p) => p.status !== 'sold').map((p) => p.name); const { P } = idx(s);
    const target = P.get(s.auction.current.playerId);
    drum.classList.add('on'); drum.innerHTML = '<div><small>NEXT PLAYER</small><div class="reel" id="reel">…</div></div>';
    const reel = $('#reel', drum);
    for (let i = 0; i < 16; i++) { reel.textContent = names[(Math.random() * names.length) | 0] || '…'; await sleep(70 + i * 9); }
    reel.textContent = target.name; reel.classList.add('final'); await sleep(650);
    drum.classList.remove('on'); drumming = false;
  }
  function liveUpdate(s, events) {
    const c = s.auction.current;
    // statistics + team grid + recents are cheap, always refresh
    const sig = (x) => JSON.stringify([x.players.map((p) => p.status + p.teamId + p.price), x.teams.map((t) => t.id + t.name + t.logo + t.color + t.jersey?.primary)]);
    $('#stats', box).innerHTML = statsHTML(s); runCounts($('#stats', box));
    const lead = c && c.teamId;
    $('#tgrid', box).innerHTML = s.teams.map((t) => teamCardHTML(s, t, lead)).join('');
    $('#recent', box).innerHTML = recentHTML(s);
    const hl = $('#hl', box); if (hl) hl.innerHTML = highlightsHTML(s);
    if (drumming) return;
    const newPlayer = (c && c.playerId) !== lastPid;
    const phaseChanged = s.auction.phase !== lastPhase;
    if (newPlayer || phaseChanged || !c) {
      const isNext = c && events.some((e) => e.type === 'next');
      const render = () => { $('#stage', box).innerHTML = stageHTML(s) + '<div class="drum" id="drum"></div>'; startCd(s); };
      if (isNext) { reveal(s).then(() => { render(); }); } else render();
      lastPid = c && c.playerId; lastAmt = c && c.price; lastTeam = c && c.teamId; lastPhase = s.auction.phase;
      return;
    }
    // same player: partial update so animations are smooth
    const T = idx(s).T; const t = c.teamId ? T.get(c.teamId) : null;
    const amt = $('#sAmt', box);
    if (amt && c.price !== lastAmt) { amt.textContent = inr(c.price); popEl(amt); }
    if (c.teamId !== lastTeam || c.price !== lastAmt) {
      const h = $('#sHolder', box);
      if (h) {
        h.className = 'holder ' + (t ? 'slam' : 'empty'); h.style.setProperty('--tc', t ? t.color : '#fff');
        h.innerHTML = t ? `<img class="logo" src="${esc(logoOf(t))}" alt=""><div class="who"><small>Highest bidder</small><b>${esc(t.name)}</b></div>` : 'Waiting for first bid…';
      }
      const nl = $('.next-line b', box); if (nl) nl.textContent = inr(nextBidAmount(s));
      const lbl = $('.bid-panel .lbl', box); if (lbl) lbl.textContent = c.bids.length ? 'Current bid' : 'Opening price';
      const log = $('#sLog', box);
      if (log) log.innerHTML = c.bids.slice(-4).reverse().map((b) => { const bt = T.get(b.teamId); return bt ? `<div class="b"><img src="${esc(logoOf(bt))}" alt=""><b>${esc(bt.name)}</b><span>${inr(b.amount)}</span></div>` : ''; }).join('');
    }
    lastAmt = c.price; lastTeam = c.teamId;
  }
  return {
    mount(b, s) { box = b; full(s); wire(); },
    update(s, ev) { if (!box || !box.isConnected) return; if (ev.some((e) => e.type === 'restore' || e.type === 'settings' || e.type === 'teams')) { full(s); return; } liveUpdate(s, ev); },
    destroy() { clearInterval(cdTimer); },
  };
}

/* ======================= TEAMS ======================= */
export function teamsView() {
  const draw = (s) => `<div class="page-title"><h1>All <em>teams</em></h1><p>${s.teams.length} teams · tap a team to see its squad</p></div><div class="spacer"></div>
    <div class="team-grid">${s.teams.map((t) => teamCardHTML(s, t)).join('') || '<div class="empty-state glass"><b>No teams yet</b>Add teams from the admin panel.</div>'}</div>`;
  return { sig: (s) => JSON.stringify([s.teams, s.players.map((p) => p.teamId + p.status + p.price)]), mount(b, s) { b.innerHTML = draw(s); } };
}

/* ======================= TEAM PAGE ======================= */
export function teamView(id) {
  const draw = (s) => {
    const t = s.teams.find((x) => x.id === id);
    if (!t) return `<div class="empty-state"><b>Team not found</b><a class="btn" href="#/teams">Back to teams</a></div>`;
    const st = teamStats(s, t);
    const mine = s.players.filter((p) => p.teamId === t.id && (p.status === 'sold' || p.status === 'retained'));
    const ret = mine.filter((p) => p.status === 'retained');
    const bought = mine.filter((p) => p.status === 'sold').sort((a, b) => (b.price || 0) - (a.price || 0));
    const cell = (p, role) => p ? `<div class="pl" data-pid="${p.id}" style="cursor:pointer"><img src="${esc(photoOf(p))}" alt=""${pf(p)}><div><small>${role}</small><b>${esc(p.name)}</b></div></div>` : `<div class="pl"><div><small>${role}</small><b style="color:var(--muted)">To be picked</b></div></div>`;
    const empties = Array.from({ length: st.left }, (_, i) => `<div class="pcard" style="opacity:.55;cursor:default;animation:none"><div class="ph" style="display:grid;place-items:center"><span style="font-family:var(--head);font-size:70px;color:rgba(255,255,255,.25)">?</span></div><div class="meta"><b style="color:var(--muted)">Open slot</b></div></div>`).join('');
    return `<div class="team-hero" style="--tc:${t.color}"><div class="row"><img class="logo" src="${esc(logoOf(t))}" alt="">
      <div><div class="chip" style="margin-bottom:10px"><a href="#/teams">${icon('back')} Teams</a></div><h1>${esc(t.name)}</h1>
        <div class="owner-line">${t.ownerPhoto ? `<img src="${esc(t.ownerPhoto)}" alt="">` : ''}<div><small>Team owner</small><b>${esc(t.owner || '—')}</b></div></div></div></div>
      <div class="team-stats"><div><small>Squad</small><b>${st.filled}/${st.squadSize}</b></div><div><small>Total spent</small><b>${inr(st.spent)}</b></div><div><small>Top buy</small><b>${inr(st.top)}</b></div><div><small>Purse</small><b>${inr(st.spent + st.purseLeft)}</b></div></div>
      ${s.auction.phase === 'done' ? `<div class="jer-big">${jerseySVG(t)}</div>` : ''}</div>
    ${ret.length ? `<div class="sec-title"><h2>Retained <em>player</em></h2><div class="bar"></div></div><div class="pairs">${ret.map((p) => `<div class="pair">${cell(p, 'Owner · Retained')}</div>`).join('')}</div>` : ''}
    <div class="sec-title"><h2>The <em>squad</em></h2><div class="bar"></div></div>
    <div class="pgrid">${bought.map((p, i) => `<div class="pcard sold" data-pid="${p.id}" style="animation-delay:${i * 40}ms"><div class="ph"><img src="${esc(photoOf(p))}" alt=""${pf(p)}></div><div class="lv" style="--c:${(LEVEL[p.level] || LEVEL.no).color}"></div><div class="meta"><b>${esc(p.name)}</b><small>${esc((LEVEL[p.level] || LEVEL.no).long)}<span class="pr">${inr(p.price)}</span></small></div></div>`).join('')}${empties}</div>`;
  };
  let box; let ids;
  return {
    sig: (s) => JSON.stringify([s.teams.find((t) => t.id === id), s.players.filter((p) => p.teamId === id).map((p) => p.id + p.status + p.price + p.retainRole), s.settings.squadSize, s.settings.purse]),
    mount(b, s) {
      box = b; b.innerHTML = draw(s);
      b.onclick = (e) => { const c = e.target.closest('[data-pid]'); if (c) { const list = $$('[data-pid]', b).map((x) => x.dataset.pid); window.__openPlayer(c.dataset.pid, list); } };
    },
  };
}

/* ======================= PLAYERS ======================= */
const F = { q: '', status: 'all', level: 'all', team: 'all', sort: 'name', order: null };
export function playersView(openPlayer) {
  let box; let shuffleSeed = 0;
  const apply = (s) => {
    const { T } = idx(s);
    let list = s.players.slice();
    if (F.status !== 'all') list = list.filter((p) => (F.status === 'sold' ? p.status === 'sold' || p.status === 'retained' : p.status === F.status));
    if (F.level !== 'all') list = list.filter((p) => p.level === F.level);
    if (F.team !== 'all') list = list.filter((p) => p.teamId === F.team);
    if (F.q) list = list.filter((p) => p.name.toLowerCase().includes(F.q.toLowerCase()));
    const lvOrder = { yes: 0, sometimes: 1, rarely: 2, no: 3 };
    const cmp = { name: (a, b) => a.name.localeCompare(b.name), level: (a, b) => lvOrder[a.level] - lvOrder[b.level] || a.name.localeCompare(b.name), price: (a, b) => (b.price || 0) - (a.price || 0), recent: (a, b) => (b.soldAt || 0) - (a.soldAt || 0), team: (a, b) => (T.get(a.teamId)?.name || 'zzz').localeCompare(T.get(b.teamId)?.name || 'zzz') || a.name.localeCompare(b.name) };
    if (F.sort === 'random') { const seed = shuffleSeed; list = list.map((p) => [p, (Math.sin(seed + p.id.length * 131 + [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0)) * 10000) % 1]).sort((a, b) => a[1] - b[1]).map((x) => x[0]); }
    else list.sort(cmp[F.sort] || cmp.name);
    return list;
  };
  const cardsHTML = (s, list) => {
    const { T } = idx(s); const cur = s.auction.current && s.auction.current.playerId;
    if (!list.length) return `<div class="empty-state glass"><b>No players match</b>Try clearing the filters.</div>`;
    return `<div class="pgrid">${list.map((p, i) => {
      const t = p.teamId ? T.get(p.teamId) : null; const lv = LEVEL[p.level] || LEVEL.no; const live = cur === p.id;
      return `<div class="pcard ${p.status} ${live ? 'live' : ''}" data-pid="${p.id}" style="animation-delay:${Math.min(i, 20) * 25}ms"><div class="ph"><img loading="lazy" src="${esc(photoOf(p))}" alt=""${pf(p)}></div><div class="st"><span class="chip ${live ? 'on' : p.status}">${live ? 'On block' : STATUS_LABEL[p.status]}</span></div><div class="lv" style="--c:${lv.color}" title="${lv.long}"></div><div class="meta"><b>${esc(p.name)}</b><small>${t ? `<img src="${esc(logoOf(t))}" alt="">${esc(t.name)}${p.price != null ? `<span class="pr">${inr(p.price)}</span>` : ''}` : esc(lv.long)}</small></div></div>`;
    }).join('')}</div>`;
  };
  const shell = (s) => {
    const c = counts(s);
    const tab = (k, l, n) => `<button class="chip ${F.status === k ? 'on' : ''}" data-st="${k}">${l} <b>${n}</b></button>`;
    return `<div class="page-title"><h1>The <em>players</em></h1><p>Browse every player. Click a photo to open and flip through.</p></div>
    <div class="toolbar glass"><div class="grp">${tab('all', 'All', c.total)}${tab('pending', 'Pending', c.pending)}${tab('sold', 'Sold', c.sold + c.retained)}${tab('unsold', 'Unsold', c.unsold)}</div>
      <input class="input" id="fq" placeholder="Search name…" value="${esc(F.q)}">
      <select class="select" id="fl"><option value="all">How often: any</option>${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}" ${F.level === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <select class="select" id="ft"><option value="all">All teams</option>${s.teams.map((t) => `<option value="${t.id}" ${F.team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <select class="select" id="fs">${[['name', 'Sort: Name'], ['level', 'Sort: How often she plays'], ['price', 'Sort: Price'], ['recent', 'Sort: Recently sold'], ['team', 'Sort: Team'], ['random', 'Shuffle']].map(([k, l]) => `<option value="${k}" ${F.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="chip" id="fcount" style="margin-left:auto"></span></div><div id="plist"></div>`;
  };
  const paint = (s) => {
    const list = apply(s); $('#plist', box).innerHTML = cardsHTML(s, list); $('#fcount', box).textContent = list.length + ' shown'; box.__list = list.map((p) => p.id);
  };
  return {
    static: true,
    onState(s) { if (box && box.isConnected) { const q = $('#fq', box); const keep = q && document.activeElement === q; box.querySelectorAll('.toolbar [data-st] b').forEach(() => 0); const c = counts(s); $$('[data-st]', box).forEach((b) => { const k = b.dataset.st; b.querySelector('b').textContent = k === 'all' ? c.total : k === 'sold' ? c.sold + c.retained : c[k]; }); paint(s); } },
    mount(b, s) {
      box = b; b.innerHTML = shell(s); paint(s);
      b.onclick = (e) => {
        const st = e.target.closest('[data-st]'); if (st) { F.status = st.dataset.st; $$('[data-st]', b).forEach((x) => x.classList.toggle('on', x === st)); paint(store.state); return; }
        const c = e.target.closest('[data-pid]'); if (c) openPlayer(c.dataset.pid, b.__list);
      };
      $('#fq', b).oninput = debounce((e) => { F.q = e.target.value; paint(store.state); }, 120);
      $('#fl', b).onchange = (e) => { F.level = e.target.value; paint(store.state); };
      $('#ft', b).onchange = (e) => { F.team = e.target.value; paint(store.state); };
      $('#fs', b).onchange = (e) => { F.sort = e.target.value; shuffleSeed = Math.random() * 1e6; paint(store.state); };
    },
  };
}
