import { store, subscribe, connect, loadInitial, isAdmin, isOwner, setToken, api } from './store.js';
import { $, $$, esc, icon, inr, idx, photoOf, pf, logoOf, LEVEL, STATUS_LABEL, sleep } from './util.js';
import { sfx, confetti, soundOn, setSound, toast } from './fx.js';
import { homeView, teamsView, teamView, playersView } from './views-public.js';
import { adminLogin, consoleView, adminPlayersView, adminTeamsView, adminSettingsView, adminDataView } from './views-admin.js';

/* ---------- background ---------- */
function buildBg() {
  const bg = $('#bg');
  let html = '<div class="pitch"></div><div class="beam b1"></div><div class="beam b2"></div><div class="beam b3"></div>';
  for (let i = 0; i < 8; i++) {
    const sz = 24 + Math.random() * 40;
    html += `<i class="ball" style="--s:${sz}px;--x:${Math.random() * 96}%;--d:${22 + Math.random() * 26}s;--dl:${-Math.random() * 40}s"></i>`;
  }
  bg.innerHTML = html;
}

/* ---------- layout ---------- */
const NAV = [['#/', 'Auction', 'gavel'], ['#/teams', 'Teams', 'teams'], ['#/players', 'Players', 'players']];
function layout() {
  $('#app').innerHTML = `
  <header class="top"><div class="wrap">
    <a class="brand" href="#/"><img class="emblem" src="/assets/jito-ladies.png" alt="JITO Ladies"><div><div class="t1">JITO Ladies Wing Bhavnagar</div><div class="t2">Ladies Cricket Tournament · Player Auction</div></div></a>
    <nav class="main">${NAV.map(([h, l]) => `<a href="${h}" data-nav="${h}">${l}</a>`).join('')}</nav>
    <div class="sp"></div>
    <a class="live-pill off" id="livePill" href="#/"><i></i><span>OFFLINE</span></a>
    <button class="icon-btn" id="btnSearch" title="Search player ( / )">${icon('search')}</button>
    <button class="icon-btn hide-m" id="btnSound" title="Sound">${icon('sound')}</button>
    <button class="icon-btn hide-m" id="btnFull" title="Fullscreen / big-screen mode">${icon('full')}</button>
  </div></header>
  <main><div class="wrap" id="view"></div></main>
  <footer class="site"><div class="wrap">
    <div class="sponsors" id="spons"></div>
    <div class="copyright"><span class="made">JITO Ladies Wing Bhavnagar · Ladies Cricket Tournament</span></div>
  </div></footer>
  <nav class="bottom-nav">${NAV.map(([h, l, ic]) => `<a href="${h}" data-nav="${h}">${icon(ic)}<span>${l}</span></a>`).join('')}</nav>`;
  $('#btnSound').innerHTML = icon(soundOn() ? 'sound' : 'mute');
  $('#btnSound').classList.toggle('on', soundOn());
  $('#btnSound').onclick = () => { setSound(!soundOn()); $('#btnSound').innerHTML = icon(soundOn() ? 'sound' : 'mute'); $('#btnSound').classList.toggle('on', soundOn()); };
  $('#btnFull').onclick = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.(); document.body.classList.add('kiosk'); }
    else { document.exitFullscreen?.(); }
  };
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('kiosk'); });
  $('#btnSearch').onclick = openSearch;
}

function sponsorsHTML(state) {
  const sp = (state && state.settings.sponsors) || [];
  return sp.map((x) => `<div class="spon"><small>${esc(x.role)}</small>${x.logo ? `<img src="${esc(x.logo)}" alt="${esc(x.name)}">` : `<div class="nm">${esc(x.name)}</div>`}</div>`).join('');
}
let spSig = '';
function liveBar(state) {
  let bar = $('#liveBar');
  const onHome = (location.hash || '#/') === '#/' || location.hash === '' || location.hash.startsWith('#/admin');
  const c = state && state.auction.current;
  if (!c || onHome) { if (bar) bar.remove(); return; }
  const { P, T } = idx(state); const p = P.get(c.playerId); const t = c.teamId ? T.get(c.teamId) : null; if (!p) return;
  if (!bar) { bar = document.createElement('a'); bar.id = 'liveBar'; bar.href = '#/'; document.body.appendChild(bar); }
  bar.innerHTML = `<i class="dot"></i><img src="${esc(photoOf(p))}" alt=""${pf(p)}><div class="lb-n"><small>LIVE NOW</small><b>${esc(p.name)}</b></div><div class="lb-p"><b>${inr(c.price)}</b><small>${t ? esc(t.name) : 'No bids yet'}</small></div>${t ? `<img class="lb-t" src="${esc(logoOf(t))}" alt="">` : ''}`;
}
function updateChrome(state) {
  const sg = JSON.stringify(state && state.settings.sponsors); const sb = $('#spons');
  if (sb && sg !== spSig) { spSig = sg; sb.innerHTML = sponsorsHTML(state); }
  const pill = $('#livePill'); if (!pill) return;
  const ph = state && state.auction ? state.auction.phase : 'idle';
  const kind = !store.connected ? 'off' : ph === 'live' ? 'live' : ph === 'paused' ? 'paused' : ph === 'done' ? 'done' : 'soon';
  pill.className = 'live-pill' + (kind === 'live' ? '' : kind === 'paused' ? ' paused' : ' off');
  pill.querySelector('span').textContent = { off: 'RECONNECTING', live: 'AUCTION LIVE', paused: 'PAUSED', done: 'COMPLETED', soon: 'STARTING SOON' }[kind];
  $$('[data-nav]').forEach((a) => {
    const h = a.dataset.nav; const cur = location.hash || '#/';
    a.classList.toggle('on', h === '#/' ? cur === '#/' || cur === '' : cur.startsWith(h));
  });
  document.body.classList.toggle('admin-mode', location.hash.startsWith('#/admin'));
  const lb = $('#liveBar'); if (lb) lb.remove();
}

/* ---------- router ---------- */
let current = null; let currentSig = null;
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  const state = store.state;
  let view;
  if (current && current.destroy) current.destroy();
  const first = parts[0] || '';
  if (first === '' || first === 'auction') view = homeView();
  else if (first === 'teams') view = teamsView();
  else if (first === 'team') view = teamView(parts[1]);
  else if (first === 'players') view = playersView(openPlayer);
  else if (first === 'admin') {
    if (!isAdmin()) view = adminLogin(() => route());
    else {
      const sub = parts[1] || '';
      view = sub === '' ? consoleView() : sub === 'players' ? adminPlayersView() : sub === 'teams' ? adminTeamsView() : sub === 'settings' ? adminSettingsView() : sub === 'data' ? adminDataView() : consoleView();
    }
  } else view = homeView();
  current = view; currentSig = null;
  const root = $('#view');
  root.innerHTML = '<div class="page-in"></div>';
  const box = root.firstChild;
  view.mount(box, state, { openPlayer, openTeam: (id) => (location.hash = '#/team/' + id) });
  if (view.sig) currentSig = view.sig(state);
  window.scrollTo({ top: 0 });
  updateChrome(state);
}

let fullBackupAt = 0; let fullBackupBusy = false; let storageChipAt = 0;
async function adminSafety(state) {
  if (!isAdmin() || !isOwner() || !state) return;
  const { A, api } = await import('./store.js');
  const bar = $('#restoreBar');
  const showBar = (html, onClick) => {
    if (bar) bar.remove();
    const d = document.createElement('div'); d.id = 'restoreBar'; d.className = 'big-note'; d.style.cssText = 'position:fixed;left:12px;right:12px;top:78px;z-index:80;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
    d.innerHTML = '<span style="flex:1">' + html + '</span><button class="btn sm" id="rsNow">Restore it</button>';
    document.body.appendChild(d); d.querySelector('#rsNow').onclick = async () => { try { await onClick(); d.remove(); toast('Restored', 'ok'); } catch (e) { toast(e.message, 'err'); } };
  };
  // 1) Full backup (including private fields) kept in this browser while the auction runs
  const seq = state.auction.seq || 0; const progress = state.auction.phase !== 'idle';
  let full = null; try { full = JSON.parse(localStorage.getItem('auctionFullBackup') || 'null'); } catch { /* ignore */ }
  if (full && progress === false && (full.seq || 0) > 0 && seq === 0 && state.players.some((p) => p.status === 'pending')) {
    showBar('The server lost the auction data (it restarted). This device has a full backup from <b>' + new Date(full.at).toLocaleTimeString() + '</b> with <b>' + full.sold + ' players sold</b>.', () => A.post('/restore', full.data));
  } else if (full && seq < (full.seq || 0) - 0 && state.auction.phase !== 'idle') {
    showBar('Server is behind this device\'s backup (' + seq + ' vs ' + full.seq + ' results). Restore the backup?', () => A.post('/restore', full.data));
  } else if (bar && !/^Server data is empty/.test(bar.textContent || '')) bar.remove();
  if (progress && !fullBackupBusy && Date.now() - fullBackupAt > 12000 && (!full || full.seq !== seq || Date.now() - full.at > 120000)) {
    fullBackupBusy = true;
    try {
      const data = await api('/api/admin/export', { admin: true });
      localStorage.setItem('auctionFullBackup', JSON.stringify({ at: Date.now(), seq, sold: data.players.filter((p) => p.status === 'sold').length, data }));
      fullBackupAt = Date.now();
    } catch { /* offline or storage full */ } finally { fullBackupBusy = false; }
  }
  // 2) Storage status chip (red when the database is not connected)
  if (Date.now() - storageChipAt > 20000) {
    storageChipAt = Date.now();
    try {
      const r = await api('/api/admin/check', { admin: true }); const p = r.persist || {};
      let chip = $('#storeChip');
      if (!chip) { chip = document.createElement('div'); chip.id = 'storeChip'; chip.style.cssText = 'position:fixed;left:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:90;padding:7px 12px;border-radius:999px;font:700 12px/1 var(--label,sans-serif);letter-spacing:.08em;backdrop-filter:blur(8px)'; document.body.appendChild(chip); }
      const good = p.configured && p.ok;
      if (good) { chip.remove(); return; }
      chip.style.background = good ? 'rgba(47,227,138,.18)' : 'rgba(255,77,94,.9)'; chip.style.color = good ? '#2fe38a' : '#fff';
      chip.textContent = good ? 'DATA SAFE · DATABASE SAVING' : (p.configured ? 'DATABASE ERROR · ' + (p.error || '').slice(0, 40) : 'DATABASE NOT CONNECTED · DATA NOT SAFE');
    } catch { /* ignore */ }
  }
}

function onState(state, events) {
  if (events && events.some((e) => e.type === 'reset' || e.type === 'restore')) { try { localStorage.removeItem('auctionFullBackup'); } catch { /* ignore */ } fullBackupAt = 0; }
  adminSafety(state);
  updateChrome(state);
  handleEvents(state, events);
  if (!current) return;
  if (current.static) { current.onState && current.onState(state, events); return; }
  if (current.update) { current.update(state, events); return; }
  if (current.sig) {
    const s = current.sig(state);
    if (s !== currentSig) { currentSig = s; current.mount($('#view .page-in'), state, { openPlayer }); }
  }
}

/* ---------- sold / unsold overlay ---------- */
let ovTimer;
function handleEvents(state, events) {
  for (const e of events) {
    if (e.type === 'sold' || e.type === 'unsold') showOverlay(state, e);
    if (e.type === 'bid') sfx.bid();
    if (e.type === 'undo') sfx.undo();
    if (e.type === 'next') { sfx.drum(); setTimeout(() => sfx.reveal(), 1900); }
    if (e.type === 'shuffle') sfx.drum();
  }
}
function showOverlay(state, e) {
  const { P, T } = idx(state);
  const p = P.get(e.playerId); if (!p) return;
  const t = e.teamId ? T.get(e.teamId) : null;
  const sold = e.type === 'sold';
  const oc = sold ? (t ? t.color : '#ff4d8d') : '#9bb5a8';
  const ov = $('#overlay');
  ov.style.setProperty('--oc', oc);
  ov.innerHTML = `<div class="shade"></div><div class="beams"></div><div class="ov-card">
    <div class="ov-stamp">${sold ? 'SOLD!' : 'UNSOLD'}</div>
    <div class="ov-main"><img class="ph" src="${esc(photoOf(p))}" alt=""${pf(p)}>
      <div><div class="nm">${esc(p.name)}</div>${sold ? `<div class="pr">${inr(e.price)}</div><div class="tm"><img src="${esc(logoOf(t))}" alt=""><b>${esc(t.name)}</b></div>` : '<div class="pr" style="color:#d6efe4;font-size:clamp(28px,5vw,56px)">Back in the pool later</div>'}</div></div></div>`;
  ov.classList.add('on');
  if (sold) { sfx.sold(); confetti([oc, '#ffffff', '#ff4d8d', '#1d6bff'], 260); setTimeout(() => confetti([oc, '#ffffff', '#ff4d8d'], 160, 1.2), 450); }
  else sfx.unsold();
  clearTimeout(ovTimer);
  const dur = location.hash.startsWith('#/admin') ? 2600 : 5600;
  ovTimer = setTimeout(hideOverlay, dur);
  ov.onclick = hideOverlay;
}
function hideOverlay() { const ov = $('#overlay'); ov.classList.remove('on'); ov.innerHTML = ''; }

/* ---------- player modal (with back / next) ---------- */
let modalKey;
export function openPlayer(id, list) {
  const state = store.state; const { P, T } = idx(state);
  list = list && list.length ? list : state.players.map((p) => p.id);
  let i = Math.max(0, list.indexOf(id));
  const back = document.createElement('div'); back.className = 'modal-back';
  const draw = () => {
    const s = store.state; const { P, T } = idx(s);
    const p = P.get(list[i]); if (!p) return;
    const t = p.teamId ? T.get(p.teamId) : null; const lv = LEVEL[p.level] || LEVEL.no;
    const ex = Object.entries(p.extra || {});
    back.innerHTML = `<div class="modal glass" role="dialog" aria-label="${esc(p.name)}"><button class="icon-btn x" data-x>${icon('x')}</button>
      <div class="pm"><div class="p-photo"><div class="frame"><img src="${esc(photoOf(p))}" alt=""${pf(p)}><div class="shine"></div></div></div>
      <div><div class="row" style="display:flex;gap:8px;margin-bottom:10px"><span class="chip ${p.status}">${STATUS_LABEL[p.status]}</span><span class="chip">${i + 1} / ${list.length}</span></div>
        <div class="nm">${esc(p.name)}</div>
        <div class="level" style="--c:${lv.color};margin-top:16px"><div><div class="lab">How often does she play cricket?</div><div class="val">${lv.label}</div></div><div class="dots">${[1, 2, 3, 4].map((n) => `<i class="${n <= lv.dots ? 'f' : ''}"></i>`).join('')}</div></div>
        <dl>
          ${s.settings.basePrice ? `<dt>Base price</dt><dd>${inr(p.basePrice || s.settings.basePrice)}</dd>` : ''}
          ${t ? `<dt>Team</dt><dd style="display:flex;align-items:center;gap:10px"><img src="${esc(logoOf(t))}" style="width:34px;height:34px;border-radius:10px;background:#fff;object-fit:contain" alt=""> ${esc(t.name)}</dd><dt>${p.status === 'retained' ? 'Retained' : 'Sold for'}</dt><dd style="font-family:var(--head);font-size:30px;color:var(--yellow);font-weight:400">${p.status === 'retained' && !p.price ? (p.retainRole === 'partner' ? 'Partner' : 'Captain') : inr(p.price)}</dd>` : ''}
          ${ex.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
        </dl>
        <div class="pm-nav"><button class="btn ghost" data-prev>${icon('back')} Back</button><button class="btn" data-next>Next ${icon('next')}</button></div>
      </div></div></div>`;
  };
  const close = () => { back.remove(); document.removeEventListener('keydown', modalKey); modalKey = null; };
  modalKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { i = (i + 1) % list.length; draw(); } if (e.key === 'ArrowLeft') { i = (i - 1 + list.length) % list.length; draw(); } };
  back.onclick = (e) => {
    if (e.target === back || e.target.closest('[data-x]')) return close();
    if (e.target.closest('[data-prev]')) { i = (i - 1 + list.length) % list.length; draw(); }
    if (e.target.closest('[data-next]')) { i = (i + 1) % list.length; draw(); }
  };
  document.addEventListener('keydown', modalKey);
  draw(); document.body.appendChild(back);
}

/* ---------- search ---------- */
function openSearch() {
  if ($('#searchBack')) return;
  const back = document.createElement('div'); back.className = 'modal-back'; back.id = 'searchBack';
  back.innerHTML = `<div class="modal glass search-modal"><div class="search-box">${icon('search')}<input id="q" placeholder="Search player name…" autocomplete="off"><button class="icon-btn" data-x>${icon('x')}</button></div><div class="search-results" id="sr"></div></div>`;
  document.body.appendChild(back);
  const inp = $('#q', back); const out = $('#sr', back);
  const close = () => { back.remove(); document.removeEventListener('keydown', esck); };
  const esck = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esck);
  back.onclick = (e) => { if (e.target === back || e.target.closest('[data-x]')) close(); const r = e.target.closest('[data-pid]'); if (r) { close(); openPlayer(r.dataset.pid, []); } };
  const run = () => {
    const s = store.state; const { T } = idx(s);
    const q = inp.value.trim().toLowerCase();
    if (!q) { out.innerHTML = `<div class="empty-state"><b>Find any player</b>See which team picked them and for how much.</div>`; return; }
    const hits = s.players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 40);
    out.innerHTML = hits.length ? hits.map((p) => {
      const t = p.teamId ? T.get(p.teamId) : null;
      const right = t ? `<div class="to"><div><b>${p.status === 'retained' && !p.price ? 'Retained' : inr(p.price)}</b><small>${esc(t.name)}</small></div><img src="${esc(logoOf(t))}" alt=""></div>` : `<div class="to"><span class="chip ${p.status}">${p.status === 'pending' ? 'Not auctioned yet' : STATUS_LABEL[p.status]}</span></div>`;
      return `<div class="sr" data-pid="${p.id}"><img class="ph" src="${esc(photoOf(p))}" alt=""${pf(p)}><div><div class="nm">${esc(p.name)}</div><span class="chip ${p.status}" style="font-size:11px;padding:2px 9px">${STATUS_LABEL[p.status]}</span></div>${right}</div>`;
    }).join('') : `<div class="empty-state"><b>No player found</b>Check the spelling.</div>`;
  };
  inp.oninput = run; run(); inp.focus();
}
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
});

/* ---------- boot ---------- */
function pathRoute() {
  const m = location.pathname.match(/^\/admin(\/.*)?$/);
  if (m) { const sub = (m[1] || '').replace(/\/$/, ''); history.replaceState(null, '', '/' + location.search); location.hash = '#/admin' + sub; }
}
async function boot() {
  pathRoute();
  buildBg();
  layout();
  const splash = $('#splash');
  setTimeout(() => splash.classList.add('out'), 1800); setTimeout(() => splash.remove(), 2500);
  try { await loadInitial(); } catch { store.state = { settings: {}, teams: [], players: [], auction: { phase: 'idle', current: null, history: [], queueCount: 0 }, }; }
  subscribe(onState);
  connect();
  window.addEventListener('hashchange', route);
  route();
  document.addEventListener('pointerdown', () => { /* unlock audio on first gesture */ sfx.tick && 0; }, { once: true });
}
window.__openPlayer = openPlayer;
boot();
