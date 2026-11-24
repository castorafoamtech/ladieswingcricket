import { store, A, api, setToken, isAdmin, me } from './store.js';
import { $, $$, esc, icon, inr, num, idx, counts, photoOf, pf, logoOf, jerseySVG, LEVEL, STATUS_LABEL, teamStats, nextBidAmount, playerBase, stepFor, debounce } from './util.js';
import { toast, sfx } from './fx.js';
import { levelBadge } from './views-public.js';

const TABS_OWNER = [['', 'Auction', 'bolt'], ['players', 'Players', 'players'], ['teams', 'Teams', 'teams'], ['settings', 'Settings', 'gear'], ['data', 'Data', 'db']];
export const nav = (cur) => `<div class="admin-nav glass">${TABS_OWNER.map(([h, l, ic]) => `<a href="#/admin${h ? '/' + h : ''}" class="${cur === h ? 'on' : ''}">${icon(ic)}${l}</a>`).join('')}<span class="sp"></span><a href="#/" id="lg" style="color:var(--muted)">${icon('logout')}Sign out</a></div>`;
export const wireNav = (box) => { const lg = $('#lg', box); if (lg) lg.onclick = () => { setToken(''); }; };
export const run = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(okMsg, 'ok'); return r; } catch (e) { toast(e.message, 'err'); sfx.undo(); return null; } };

function modal(html, cls = '') {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal glass ${cls}" style="padding:24px;width:min(640px,100%)"><button class="icon-btn x" data-x>${icon('x')}</button>${html}</div>`;
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-x]')) close(); });
  document.body.appendChild(back);
  return { el: back, close };
}
function confirmBox(msg, label = 'Confirm') {
  return new Promise((res) => {
    const m = modal(`<h3 style="font-family:var(--head);font-weight:400;font-size:28px;text-transform:uppercase;margin-bottom:10px">Are you sure?</h3><p style="color:var(--muted);margin-bottom:18px">${esc(msg)}</p><div class="row-gap" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn red" id="ok">${label}</button></div>`);
    m.el.querySelector('#ok').onclick = () => { m.close(); res(true); };
    m.el.querySelector('[data-x]').addEventListener('click', () => res(false));
    m.el.addEventListener('click', (e) => { if (e.target === m.el) res(false); });
  });
}

/* ======================= LOGIN ======================= */
export function adminLogin(done) {
  return {
    static: true,
    mount(b) {
      b.innerHTML = `<div class="login-box glass"><div style="width:64px;height:64px;margin:0 auto 14px;border-radius:50%;background:var(--yellow);color:#06173b;display:grid;place-items:center">${icon('lock', '')}</div><h2>Admin sign in</h2><p>Enter the admin password to run the auction.</p>
        <input class="input" id="pw" type="password" placeholder="Password" autocomplete="current-password"><div class="spacer"></div><button class="btn lg" id="go" style="width:100%">Enter console</button></div>`;
      const go = async () => {
        const r = await run(() => api('/api/admin/login', { method: 'POST', body: { password: $('#pw', b).value } }));
        if (r && r.token) { setToken(r.token); location.hash = '#/admin'; done(); }
      };
      $('#go', b).onclick = go; $('#pw', b).onkeydown = (e) => { if (e.key === 'Enter') go(); };
    },
  };
}

/* ======================= CONSOLE ======================= */
export function consoleView() {
  let box; let keyH; let lastBid = null;
  const bid = async (teamId) => { const r = await run(() => A.post('/auction/bid', { teamId })); if (r) { const el = $(`[data-bid="${teamId}"]`, box); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } } };
  const miniHTML = (s) => {
    const a = s.auction; const c = a.current; const { P, T } = idx(s);
    if (!c) {
      const ph = a.phase;
      return `<div class="mini-empty"><div>${ph === 'idle' ? `<b>Auction not started</b><p>Add players &amp; teams, then start the auction.</p>` : ph === 'done' ? `<b>Auction finished</b>` : `<b>No player on the block</b><p>${a.queueCount} players waiting. Press Next player. You will not see who is next.</p>`}</div></div>`;
    }
    const p = P.get(c.playerId); const t = c.teamId ? T.get(c.teamId) : null;
    return `<div class="mini-stage"><div class="top"><div class="p-photo"><div class="frame"><img src="${esc(photoOf(p))}" alt=""${pf(p)}></div></div>
      <div style="min-width:0"><div class="name">${esc(p.name)}</div><div style="margin-top:8px">${levelBadge(p)}</div></div></div>
      <div class="bid-amount" style="font-size:72px">${inr(c.price)}</div>
      <div class="holder ${t ? '' : 'empty'}" style="--tc:${t ? t.color : '#fff'}">${t ? `<img class="logo" src="${esc(logoOf(t))}" alt=""><div class="who"><small>Highest bidder</small><b>${esc(t.name)}</b></div>` : 'No bids yet · base ' + inr(playerBase(s, p))}</div>
      <div class="next-line"><span>Next bid</span><b>${inr(nextBidAmount(s))}</b></div></div>`;
  };
  const padHTML = (s) => {
    const c = s.auction.current; const amt = c ? nextBidAmount(s) : null;
    return s.teams.map((t, i) => {
      const st = teamStats(s, t); const lead = c && c.teamId === t.id;
      let off = !c || lead; let note = `${st.left} left · ${inr(st.purseLeft)}`;
      if (c && !lead) { const chk = window.__canBid(s, t, amt); if (!chk.ok) { off = true; note = chk.reason; } }
      return `<div class="padbtn ${lead ? 'lead' : ''} ${off && !lead ? 'off' : ''}" data-bid="${t.id}" style="--tc:${t.color}"><span class="key">${i < 9 ? i + 1 : ''}</span><img src="${esc(logoOf(t))}" alt=""><b>${esc(t.name)}</b><div class="amt">${c ? inr(amt) : '—'}</div><small>${esc(note)}</small></div>`;
    }).join('');
  };
  const ctrlHTML = (s) => {
    const a = s.auction; const c = a.current; const ph = a.phase; const cnt = counts(s);
    const b = (id, cls, ic, l, dis) => `<button class="btn ${cls} ${dis ? 'dis' : ''}" id="${id}">${icon(ic)}${l}</button>`;
    const pend = s.players.filter((p) => p.status === 'pending').length; const actLeft = a.queueCount;
    if (ph === 'idle') return `<div class="ctl-row">${b('aStart', 'lg', 'play', `Start auction (${pend} players)`, !pend)}</div><p style="color:var(--muted);margin-top:10px">Players come up in a random order. Pinned players keep their fixed place.</p>`;
    if (ph === 'done') return `<div class="ctl-row">${b('aReopen', 'ghost', 'back', 'Reopen last', !a.history.length)}${b('aReset', 'red', 'trash', 'Reset auction', false)}</div>`;
    return `<div class="ctl-row">${b('aSold', 'green lg', 'gavel', 'Sold', !c || !c.teamId)}${b('aUnsold', 'red lg', 'ban', 'Unsold', !c)}</div>
    <div class="ctl-row">${b('aNext', 'lg', 'next', 'Next player', !!c || !actLeft)}${b('aUndo', 'ghost', 'undo', 'Undo bid', !c || !c.bids.length)}${b('aBack', 'ghost', 'back', 'Back', !!(c && c.bids.length) || !a.history.length)}</div>
    <div class="ctl-row">${b('aShuf', 'ghost sm', 'shuffle', 'Randomize', false)}${b('aPause', 'ghost sm', ph === 'paused' ? 'play' : 'pause', ph === 'paused' ? 'Resume' : 'Pause', false)}${b('aRe', 'ghost sm', 'shuffle', `Re-auction unsold (${s.players.filter((p) => p.status === 'unsold').length})`, !s.players.some((p) => p.status === 'unsold'))}${b('aFin', 'ghost sm', 'trophy', 'Finish', !!c)}</div>`;
  };
  const logHTML = (s) => {
    const { P, T } = idx(s);
    return s.auction.history.slice(-12).reverse().map((h) => { const p = P.get(h.playerId); const t = T.get(h.teamId); return p ? `<div class="li ${h.type}"><b>${h.type === 'sold' ? 'SOLD' : 'UNSOLD'}</b> ${esc(p.name)} ${t ? '→ ' + esc(t.name) : ''}<span class="t">${h.type === 'sold' ? inr(h.price) : ''}</span></div>` : ''; }).join('') || '<div class="li" style="color:var(--muted)">Nothing yet</div>';
  };
  const unsoldHTML = (s) => { const u = s.players.filter((p) => p.status === 'unsold'); return u.length ? u.map((p) => `<div class="li"><img src="${esc(photoOf(p))}" style="width:28px;height:28px;border-radius:8px;object-fit:cover" alt=""> ${esc(p.name)}<span class="t" style="font-size:13px;font-family:var(--label);color:var(--muted)">${LEVEL[p.level]?.label || ''}</span></div>`).join('') : '<div class="li" style="color:var(--muted)">No unsold players</div>'; };
  const paint = (s) => {
    const c = counts(s);
    $('#cMini', box).innerHTML = miniHTML(s); const pd = $('#cPad', box); pd.innerHTML = padHTML(s); pd.style.setProperty('--cols', s.teams.length <= 4 ? 2 : s.teams.length <= 6 ? 3 : 4); pd.style.setProperty('--rows', Math.ceil(s.teams.length / (s.teams.length <= 4 ? 2 : s.teams.length <= 6 ? 3 : 4))); $('#cCtl', box).innerHTML = ctrlHTML(s);
    $('#cLog', box).innerHTML = logHTML(s); $('#cUns', box).innerHTML = unsoldHTML(s);
    $('#cKv', box).innerHTML = `<div><small>Pending</small><b>${c.pending}</b></div><div><small>Sold</small><b>${c.sold + c.retained}</b></div><div><small>Unsold</small><b>${c.unsold}</b></div><div><small>Queue</small><b>${s.auction.queueCount}</b></div>`;
    const sel = $('#mTeam', box); if (sel && sel.options.length !== s.teams.length) sel.innerHTML = s.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  };
  const act = (path, msg) => run(() => A.post('/auction/' + path), msg);
  return {
    mount(b, s) {
      box = b; window.__canBid = window.__canBid || ((st, t, amt) => canBidLocal(st, t, amt));
      b.innerHTML = `${nav('')}<div class="console"><div><div class="panel glass"><h3 class="ph3">On the block</h3><div id="cMini"></div><div id="cCtl"></div></div>
        <div class="panel glass" style="margin-top:18px"><h3 class="ph3">Manual entry</h3><p style="color:var(--muted);font-size:13px">Set any price and team for the current player (overrides the slab).</p><div class="manual"><select class="select" id="mTeam">${s.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><input class="input" id="mAmt" type="number" min="0" placeholder="Amount ₹"><button class="btn" id="mGo">Set</button></div></div></div>
        <div><div class="panel glass"><h3 class="ph3">Tap a team to bid <span style="font-size:12px;color:var(--faint);letter-spacing:.1em">(keys 1-9 · S sold · U unsold · N next · Z undo)</span></h3><div class="pad" id="cPad"></div></div>
        <div class="panel glass" style="margin-top:18px"><div class="kv" id="cKv"></div><h3 class="ph3">Recent</h3><div class="log" id="cLog"></div><h3 class="ph3" style="margin-top:16px">Unsold list</h3><div class="log" id="cUns" style="max-height:180px"></div></div></div></div>`;
      wireNav(b); paint(s);
      b.onclick = (e) => {
        const pad = e.target.closest('[data-bid]'); if (pad) return bid(pad.dataset.bid);
        const id = e.target.closest('button')?.id; if (!id) return;
        const m = { aStart: () => run(() => A.post('/auction/start', {}), 'Auction started'), aSold: () => act('sold'), aUnsold: () => act('unsold'), aNext: () => act('next'), aUndo: () => act('undo'), aBack: () => act('back'), aShuf: () => act('randomize', 'Queue shuffled'), aPause: () => act(store.state.auction.phase === 'paused' ? 'resume' : 'pause'), aRe: () => act('reauction', 'Unsold players back in the queue'), aFin: () => act('finish'), aReopen: () => act('back'), aReset: async () => { if (await confirmBox('Reset the auction? All sold/unsold/retained results are cleared and every player becomes pending.', 'Reset')) act('reset', 'Auction reset'); }, mGo: () => run(() => A.post('/auction/manual', { teamId: $('#mTeam', b).value, amount: $('#mAmt', b).value }), 'Manual bid set') };
        if (m[id]) m[id]();
      };
      keyH = (e) => {
        if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey) return;
        const s2 = store.state; const k = e.key.toLowerCase();
        if (/^[1-9]$/.test(k) && s2.teams[+k - 1]) bid(s2.teams[+k - 1].id);
        else if (k === 's') act('sold'); else if (k === 'u') act('unsold'); else if (k === 'n') act('next'); else if (k === 'z') act('undo');
      };
      document.addEventListener('keydown', keyH);
    },
    update(s) { if (box && box.isConnected) paint(s); },
    destroy() { document.removeEventListener('keydown', keyH); },
  };
}
import { canBid as canBidLocal } from './shared.js';
window.__canBid = canBidLocal;

/* ======================= PLAYERS ======================= */
export function adminPlayersView() {
  let box; let q = ''; let st = 'all'; const sel = new Set();
  let contacts = {};
  const loadContacts = async (s) => { try { contacts = await api('/api/admin/contacts', { admin: true }); if (box && box.isConnected) paint(s || store.state); } catch { /* ignore */ } };
  const rowsHTML = (s) => {
    const { T } = idx(s);
    let list = s.players.filter((p) => (st === 'all' || p.status === st) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || String(contacts[p.id] || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '\u0000')));
    list = list.slice(0, 400);
    return list.map((p) => `<tr data-id="${p.id}"><td><input type="checkbox" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''}></td><td><label class="up-btn" title="Change photo"><img class="av" src="${esc(photoOf(p))}" alt=""${pf(p)}><input type="file" accept="image/*" data-photo="${p.id}"></label></td><td><b>${esc(p.name)}</b></td><td>${contacts[p.id] ? `<a href="tel:${esc(contacts[p.id].replace(/[^0-9+]/g, ''))}" style="color:inherit;white-space:nowrap">${esc(contacts[p.id])}</a>` : '—'}</td>
      <td><select class="select" data-lv="${p.id}" style="padding:6px 8px">${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}" ${p.level === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></td>
      <td><span class="chip ${p.status}">${STATUS_LABEL[p.status]}</span></td><td>${p.teamId ? esc(T.get(p.teamId)?.name || '') : '—'}</td><td>${p.price != null ? inr(p.price) : '—'}</td>
      <td><div class="acts"><button class="btn ghost sm" data-assign="${p.id}">${p.teamId ? 'Move' : 'Assign'}</button>${p.teamId ? `<button class="btn ghost sm" data-un="${p.id}">Release</button>` : ''}<button class="btn ghost sm" data-edit="${p.id}">${icon('edit')}</button><button class="btn red sm" data-del="${p.id}">${icon('trash')}</button></div></td></tr>`).join('');
  };
  const paint = (s) => { $('#tb', box).innerHTML = rowsHTML(s); const c = counts(s); $('#pc', box).textContent = `${c.total} players · ${c.pending} pending · ${c.sold + c.retained} sold · ${c.unsold} unsold`; $('#bd', box).classList.toggle('hide', !sel.size); $('#bd', box).textContent = `Delete selected (${sel.size})`; };
  const importWizard = () => {
    const m = modal(`<h3 style="font-family:var(--head);font-weight:400;font-size:30px;text-transform:uppercase;margin-bottom:12px">Import players</h3><div id="wz"></div>`, 'wiz'); m.el.querySelector('.modal').style.width = 'min(860px,100%)';
    const wz = m.el.querySelector('#wz'); let prev = null;
    const step1 = () => {
      wz.innerHTML = `<p style="color:var(--muted);margin-bottom:12px">Paste your Google Sheet link (share it as <b>Anyone with the link → Viewer</b>), or upload a CSV file.</p>
      <div class="field"><label>Google Sheet link</label><input class="input" id="wUrl" placeholder="https://docs.google.com/spreadsheets/d/…"></div><div class="spacer"></div>
      <div class="drop" id="wDrop">Or drop / choose a CSV file<input type="file" id="wFile" accept=".csv,text/csv" hidden></div><div class="spacer"></div>
      <div class="row-gap" style="justify-content:flex-end"><button class="btn" id="wLoad">Load sheet</button></div>`;
      $('#wDrop', wz).onclick = () => $('#wFile', wz).click();
      $('#wFile', wz).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const text = await f.text(); load('text', text); };
      $('#wLoad', wz).onclick = () => load('url', $('#wUrl', wz).value);
    };
    const load = async (source, value) => { const r = await run(() => A.post('/import/preview', { source, value })); if (r) { prev = r; step2(); } };
    const step2 = () => {
      const o = (i) => `<option value="-1">— none —</option>` + prev.headers.map((h, k) => `<option value="${k}" ${i === k ? 'selected' : ''}>${esc(h || 'Column ' + (k + 1))}</option>`).join('');
      const fields = [['name', 'Player name *'], ['photo', 'Photo (link)'], ['level', 'How often she plays cricket (regularly / sometimes / rarely / never)'], ['basePrice', 'Base price (optional)']];
      wz.innerHTML = `<p style="color:var(--muted)">${prev.count} rows found. Match your columns. Unmapped columns are kept as extra info.</p><div class="map-grid">${fields.map(([k, l]) => `<div class="field"><label>${l}</label><select class="select" data-map="${k}">${o(prev.mapping[k] ?? -1).replace(`value="${prev.mapping[k] ?? -1}"`, `value="${prev.mapping[k] ?? -1}" selected`)}</select></div>`).join('')}</div>
      <div class="table-wrap" style="max-height:200px"><table class="atable" style="min-width:0"><thead><tr>${prev.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${prev.sample.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c).slice(0, 40))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="spacer"></div>
      <div class="row-gap"><label class="switch"><input type="checkbox" id="wRep"> <span>Replace existing players (only before auction starts)</span></label><span style="flex:1"></span><button class="btn ghost" id="wBack">Back</button><button class="btn" id="wGo">Import ${prev.count} players</button></div>`;
      $('#wBack', wz).onclick = step1;
      $('#wGo', wz).onclick = async () => {
        const mapping = {}; $$('[data-map]', wz).forEach((s) => { mapping[s.dataset.map] = Number(s.value); });
        const r = await run(() => A.post('/import/commit', { importId: prev.importId, mapping, mode: $('#wRep', wz).checked ? 'replace' : 'append' }), 'Players imported. Photos are being cached…');
        if (r) m.close();
      };
    };
    step1();
  };
  const editModal = (p) => {
    const isNew = !p; p = p || { name: '', level: 'no', photo: '', basePrice: '' };
    const m = modal(`<h3 style="font-family:var(--head);font-weight:400;font-size:28px;text-transform:uppercase;margin-bottom:14px">${isNew ? 'Add player' : 'Edit player'}</h3><div class="form-grid"><div class="field"><label>Name</label><input class="input" id="eN" value="${esc(p.name)}"></div>
      <div class="field"><label>How often she plays</label><select class="select" id="eL">${Object.entries(LEVEL).map(([k, v]) => `<option value="${k}" ${p.level === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label>Base price override</label><input class="input" id="eB" type="number" value="${p.basePrice || ''}" placeholder="default"></div>
      <div class="field"><label>Photo link</label><input class="input" id="eP" value="${esc(p.photo || '')}" placeholder="https://… or Drive link"></div></div><div class="spacer"></div><div class="row-gap" style="justify-content:flex-end"><button class="btn" id="eS">Save</button></div>`);
    $('#eS', m.el).onclick = async () => { const body = { name: $('#eN', m.el).value, level: $('#eL', m.el).value, basePrice: $('#eB', m.el).value, photo: $('#eP', m.el).value }; const r = await run(() => isNew ? A.post('/players', body) : A.put('/players/' + p.id, body), 'Saved'); if (r) m.close(); };
  };
  const assignModal = (p) => {
    const s = store.state;
    const m = modal(`<h3 style="font-family:var(--head);font-weight:400;font-size:26px;text-transform:uppercase;margin-bottom:14px">Assign ${esc(p.name)}</h3><div class="form-grid"><div class="field"><label>Team</label><select class="select" id="aT">${s.teams.map((t) => `<option value="${t.id}" ${p.teamId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label>Price ₹</label><input class="input" id="aP" type="number" value="${p.price ?? playerBase(s, p)}"></div></div><div class="spacer"></div><div class="row-gap" style="justify-content:flex-end"><button class="btn" id="aS">Assign</button></div>`);
    $('#aS', m.el).onclick = async () => { const r = await run(() => A.post(`/players/${p.id}/assign`, { teamId: $('#aT', m.el).value, price: $('#aP', m.el).value }), 'Assigned'); if (r) m.close(); };
  };
  return {
    static: true,
    onState(s) { if (box && box.isConnected) { if (s.players.some((p) => !(p.id in contacts)) && s.players.length !== Object.keys(contacts).length) loadContacts(s); paint(s); } },
    mount(b, s) {
      box = b; loadContacts(s);
      b.innerHTML = `${nav('players')}<div class="page-title"><h1>Manage <em>players</em></h1><p id="pc"></p></div>
      <div class="toolbar glass"><button class="btn" id="bImp">${icon('upload')} Import from Google Sheet</button><button class="btn ghost" id="bAdd">${icon('plus')} Add player</button><button class="btn ghost" id="bSync">Sync new form entries</button><button class="btn ghost" id="bCache">Cache photos</button>
      <input class="input" id="sq" placeholder="Search…" style="width:200px"><select class="select" id="ss"><option value="all">All</option><option value="pending">Pending</option><option value="sold">Sold</option><option value="retained">Retained</option><option value="unsold">Unsold</option></select><button class="btn red sm hide" id="bd"></button></div>
      <div class="table-wrap"><table class="atable"><thead><tr><th></th><th>Photo</th><th>Name</th><th>Mobile</th><th>Plays cricket</th><th>Status</th><th>Team</th><th>Price</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
      wireNav(b); paint(s);
      $('#bImp', b).onclick = importWizard; $('#bAdd', b).onclick = () => editModal(null);
      $('#bSync', b).onclick = () => run(() => A.post('/import/sync'), 'Checked the form for new registrations');
      $('#bCache', b).onclick = () => run(() => A.post('/photos/cache'), 'Caching photos in the background');
      $('#sq', b).oninput = debounce((e) => { q = e.target.value; paint(store.state); }, 120);
      $('#ss', b).onchange = (e) => { st = e.target.value; paint(store.state); };
      $('#bd', b).onclick = async () => { if (await confirmBox(`Delete ${sel.size} players permanently?`, 'Delete')) { await run(() => A.post('/players/bulk-delete', { ids: [...sel] }), 'Deleted'); sel.clear(); paint(store.state); } };
      b.addEventListener('change', async (e) => {
        const t = e.target;
        if (t.dataset.sel) { t.checked ? sel.add(t.dataset.sel) : sel.delete(t.dataset.sel); paint(store.state); }
        if (t.dataset.lv) run(() => A.put('/players/' + t.dataset.lv, { level: t.value }));
        if (t.dataset.photo && t.files[0]) { const url = await run(() => A.upload('player', t.files[0])); if (url) run(() => A.put('/players/' + t.dataset.photo, { photo: url }), 'Photo updated'); }
      });
      b.addEventListener('click', async (e) => {
        const g = (k) => e.target.closest(`[data-${k}]`)?.dataset[k]; const s2 = store.state;
        if (g('edit')) editModal(s2.players.find((p) => p.id === g('edit')));
        if (g('assign')) assignModal(s2.players.find((p) => p.id === g('assign')));
        if (g('un')) run(() => A.post(`/players/${g('un')}/unassign`), 'Released back to pool');
        if (g('del')) { const p = s2.players.find((x) => x.id === g('del')); if (await confirmBox(`Delete ${p.name}?`, 'Delete')) run(() => A.del('/players/' + p.id), 'Deleted'); }
      });
    },
  };
}

/* ======================= TEAMS ======================= */
export function adminTeamsView() {
  let box;
  const retainedRows = (s, t) => {
    const mine = s.players.find((p) => p.teamId === t.id && p.status === 'retained');
    const avail = s.players.filter((p) => p.status === 'pending' || (p.status === 'retained' && p.teamId === t.id)).sort((a, b) => a.name.localeCompare(b.name));
    return `<select class="select" data-retone="${t.id}"><option value="">— none —</option>${avail.map((p) => `<option value="${p.id}" ${mine && mine.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  };
  const card = (s, t) => `<div class="te glass" data-t="${t.id}" style="border-top:4px solid ${t.color}">
    <div class="hd"><label class="up-btn" title="Upload logo"><img src="${esc(logoOf(t))}" alt=""><input type="file" accept="image/*" data-logo="${t.id}"></label><b>${esc(t.name)}</b><span style="flex:1"></span><button class="btn red sm" data-delt="${t.id}">${icon('trash')}</button></div>
    <div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="field"><label>Team name</label><input class="input" data-f="name" value="${esc(t.name)}"></div><div class="field"><label>Short code</label><input class="input" data-f="short" maxlength="4" value="${esc(t.short || '')}"></div>
      <div class="field"><label>Owner</label><input class="input" data-f="owner" value="${esc(t.owner || '')}"></div>
      <div class="field"><label>Owner photo</label><label class="btn ghost sm up-btn" style="width:100%">${icon('upload')} ${t.ownerPhoto ? 'Change' : 'Upload'}<input type="file" accept="image/*" data-oph="${t.id}"></label></div>
      <div class="field"><label>Purse override ₹</label><input class="input" type="number" data-f="purse" value="${t.purse ?? ''}" placeholder="default"></div><div class="field"><label>Squad size override</label><input class="input" type="number" data-f="squadSize" value="${t.squadSize ?? ''}" placeholder="default"></div>
    </div>
    <div class="jersey-ed"><div class="jv">${jerseySVG(t)}</div>
      <div class="field"><label>Team colour</label><input type="color" data-c="color" value="${t.color || '#f5c400'}"></div>
      <div class="field"><label>Jersey main</label><input type="color" data-c="primary" value="${t.jersey?.primary || '#f5c400'}"></div>
      <div class="field"><label>Jersey accent</label><input type="color" data-c="secondary" value="${t.jersey?.secondary || '#0a2a66'}"></div>
      <div class="field"><label>Pattern</label><select class="select" data-c="pattern">${['solid', 'stripes', 'hoops', 'split', 'sash'].map((x) => `<option ${t.jersey?.pattern === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <h3 class="ph3" style="margin-top:20px;font-family:var(--label);font-weight:800;letter-spacing:.24em;font-size:13px;color:var(--yellow);text-transform:uppercase">Retained player <span style="color:var(--faint);font-size:11px">the owner, free of cost</span></h3><div data-ret="${t.id}">${retainedRows(s, t)}</div>
    <div class="row-gap" style="margin-top:14px"><button class="btn sm" data-save="${t.id}">Save team</button><button class="btn ghost sm" data-saveret="${t.id}">Save retained player</button></div></div>`;
  const paint = (s) => { $('#tl', box).innerHTML = s.teams.map((t) => card(s, t)).join('') || '<div class="empty-state glass"><b>No teams</b>Add your first team.</div>'; };
  const readTeam = (el) => {
    const body = {}; $$('[data-f]', el).forEach((i) => { body[i.dataset.f] = i.value; });
    const j = {}; $$('[data-c]', el).forEach((i) => { j[i.dataset.c] = i.value; }); body.color = j.color; body.jersey = { primary: j.primary, secondary: j.secondary, pattern: j.pattern };
    return body;
  };
  return {
    static: true,
    onState(s) { if (!box || !box.isConnected) return; if (box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return; paint(s); },
    mount(b, s) {
      box = b;
      b.innerHTML = `${nav('teams')}<div class="page-title"><h1>Manage <em>teams</em></h1><p>Logos, owners, retained player and team colours</p></div><div class="toolbar glass"><button class="btn" id="tAdd">${icon('plus')} Add team</button><span class="chip">Squad size: <b>${s.settings.squadSize}</b> players (change in Settings)</span></div><div class="team-edit" id="tl"></div>`;
      wireNav(b); paint(s);
      $('#tAdd', b).onclick = () => run(() => A.post('/teams', { name: 'New Team' }), 'Team added');
      b.addEventListener('input', (e) => { const el = e.target.closest('.te'); if (el && e.target.dataset.c) { const t = { ...store.state.teams.find((x) => x.id === el.dataset.t), ...readTeam(el) }; el.querySelector('.jv').innerHTML = jerseySVG(t); } });
      b.addEventListener('change', async (e) => {
        const t = e.target; const el = t.closest('.te'); if (!el) return; const id = el.dataset.t;
        if (t.dataset.logo && t.files[0]) { const u = await run(() => A.upload('team', t.files[0])); if (u) run(() => A.put('/teams/' + id, { logo: u }), 'Logo updated'); }
        if (t.dataset.oph && t.files[0]) { const u = await run(() => A.upload('player', t.files[0])); if (u) run(() => A.put('/teams/' + id, { ownerPhoto: u }), 'Owner photo updated'); }
      });
      b.addEventListener('click', async (e) => {
        const g = (k) => e.target.closest(`[data-${k}]`)?.dataset[k];
        if (g('save')) { const el = e.target.closest('.te'); run(() => A.put('/teams/' + g('save'), readTeam(el)), 'Team saved'); }
        if (g('saveret')) {
          const el = e.target.closest('.te'); const entries = []; const c = $('[data-retone]', el).value; if (c) entries.push({ playerId: c, price: 0 });
          run(() => A.put(`/teams/${g('saveret')}/retained`, { entries }), 'Retained player saved');
        }
        if (g('delt')) { const t = store.state.teams.find((x) => x.id === g('delt')); if (await confirmBox(`Delete ${t.name}? Its players return to the pool.`, 'Delete')) run(() => A.del('/teams/' + t.id), 'Team deleted'); }
      });
    },
  };
}

/* ======================= SETTINGS ======================= */
export function adminSettingsView() {
  let box;
  const slabRow = (sl) => `<div class="slab"><span>Below ₹</span><input class="input" data-up type="number" value="${sl.upTo ?? ''}" placeholder="and above">${''}<span>bid step ₹</span><input class="input" data-step type="number" value="${sl.step}"><button class="btn ghost sm" data-rm>${icon('x')}</button></div>`;
  return {
    static: true,
    onState() {},
    mount(b, s) {
      box = b; const st = s.settings;
      const f = (k, l, t = 'text', h = '') => `<div class="field"><label>${l}</label><input class="input" data-k="${k}" type="${t}" value="${esc(st[k] ?? '')}">${h ? `<div class="hint">${h}</div>` : ''}</div>`;
      const sw = (k, l) => `<label class="switch"><input type="checkbox" data-sw="${k}" ${st[k] ? 'checked' : ''}><span>${l}</span></label>`;
      b.innerHTML = `${nav('settings')}<div class="page-title"><h1>Auction <em>settings</em></h1></div>
      <div class="panel glass" style="margin-top:20px"><h3 class="ph3">Money rules</h3><div class="form-grid">${f('squadSize', 'Squad size (players per team)', 'number', 'Players per team, listed individually')}${f('purse', 'Team purse ₹', 'number')}${f('retainedPrice', 'Retained player price ₹', 'number', 'Charged to the team purse')}${f('basePrice', 'Base price ₹', 'number')}${f('maxBid', 'Max bid cap ₹ (optional)', 'number')}</div>
        <h3 class="ph3" style="margin-top:20px">Bid increments (slabs)</h3><div class="slabs" id="slabs">${st.slabs.map(slabRow).join('')}</div><div class="row-gap" style="margin-top:12px"><button class="btn ghost sm" id="addSlab">${icon('plus')} Add slab</button></div>
        <p style="color:var(--muted);font-size:13px;margin-top:8px">Example: below ₹50,000 add ₹5,000, above that ₹10,000. Leave the last "Below" empty for the open-ended slab.</p>
        <h3 class="ph3" style="margin-top:20px">Enforcement</h3>${sw('enforcePurse', 'Block bids above a team’s purse')}${sw('enforceReserve', 'Keep base price reserve for remaining slots')}${sw('enforceSquad', 'Block bids when squad is full')}</div>
      <div class="panel glass" style="margin-top:18px"><h3 class="ph3">Event details</h3><div class="form-grid">${f('eventName', 'Event name')}${f('organiser', 'Organiser')}${f('presentedBy', 'Presented by')}${f('coSponsor', 'Co-sponsored by')}${f('date', 'Date')}${f('time', 'Time')}${f('venue', 'Venue')}${f('auctionDate', 'Auction date (display)')}${f('auctionVenue', 'Auction venue')}${f('startAt', 'Auction start (countdown)', 'text', 'e.g. 2026-11-20T18:00:00+05:30')}</div></div>
      <div class="panel glass" style="margin-top:18px"><h3 class="ph3">Pinned players (fixed auction position)</h3><div class="field"><label>One per line: player name | position (e.g. 20) or range (e.g. 1-14)</label><textarea class="textarea" id="pinText" rows="4" placeholder="Krupa Shah | 20&#10;Ami Shah | 1-14">${esc((st.pins || []).map((x) => x.m + ' | ' + (x.at ? x.at : x.from + '-' + x.to)).join('\n'))}</textarea><div class="hint">Matched on the player name as it appears in the app. A range places her at a random spot inside it. Applies when the auction starts or the queue is randomized.</div></div></div>
      <div class="panel glass" style="margin-top:18px"><h3 class="ph3">Sponsors (footer)</h3><div class="field"><label>One per line: Role | Name | Logo link (optional)</label><textarea class="textarea" id="spText" rows="4">${esc((st.sponsors || []).map((x) => x.role + ' | ' + x.name + (x.logo ? ' | ' + x.logo : '')).join('\n'))}</textarea></div></div>
      <div class="row-gap" style="margin-top:18px"><button class="btn lg" id="save">Save settings</button></div>`;
      wireNav(b);
      b.addEventListener('click', (e) => {
        if (e.target.closest('#addSlab')) $('#slabs', b).insertAdjacentHTML('beforeend', slabRow({ upTo: '', step: 500 }));
        const rm = e.target.closest('[data-rm]'); if (rm) rm.closest('.slab').remove();
        if (e.target.closest('#save')) {
          const body = {}; $$('[data-k]', b).forEach((i) => { body[i.dataset.k] = i.value; }); $$('[data-sw]', b).forEach((i) => { body[i.dataset.sw] = i.checked; });
          body.sponsors = $('#spText', b).value.split('\n').map((l) => { const [r, n, lg] = l.split('|').map((x) => (x || '').trim()); return n ? { role: r, name: n, logo: lg || '' } : { role: '', name: r, logo: '' }; }).filter((q) => q.name);
          body.pins = $('#pinText', b).value.split('\n').map((l) => { const [m, pos] = l.split('|').map((x) => x.trim()); if (!m || !pos) return null; const r = pos.match(/^(\d+)\s*[-–]\s*(\d+)$/); return r ? { m, from: +r[1], to: +r[2] } : { m, at: +pos }; }).filter(Boolean);
          body.slabs = $$('.slab', b).map((r) => ({ upTo: $('[data-up]', r).value, step: $('[data-step]', r).value }));
          run(() => A.put('/settings', body), 'Settings saved');
        }
      });
    },
  };
}

/* ======================= DATA ======================= */
export function adminDataView() {
  const squadTools = (box) => {
    let data = null;
    const fm = (m) => String(m || '').replace(/[^0-9+]/g, '') || '—';
    const waText = (tm) => `*${tm.name}* squad${tm.owner ? '\nOwner: ' + tm.owner : ''}\n\n` + tm.players.map((p, i) => `${i + 1}. ${p.name} – ${fm(p.mobile)}${p.retained ? ' (Retained)' : ''}`).join('\n') + `\n\nJITO Ladies Wing Bhavnagar · Cricket Tournament`;
    const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = (teams) => '﻿' + [['Team', 'Owner', 'Sr', 'Player', 'Mobile', 'Type', 'Price (Rs)'], ...teams.flatMap((tm) => tm.players.map((p, i) => [tm.name, tm.owner, i + 1, p.name, fm(p.mobile), p.retained ? 'Retained' : 'Auction', p.retained ? 0 : p.price]))].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const save = (text, name, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const printPDF = (teams) => {
      const pages = teams.map((tm) => `<section><div class="hd"><h1>${esc(tm.name)}</h1><p>${tm.owner ? 'Owner: <b>' + esc(tm.owner) + '</b> · ' : ''}${tm.players.length} players</p></div>
        <table><thead><tr><th>#</th><th>Player</th><th>Mobile</th><th>Type</th></tr></thead><tbody>${tm.players.map((p, i) => `<tr class="${p.retained ? 'r' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(fm(p.mobile))}</td><td>${p.retained ? 'Retained' : 'Auction'}</td></tr>`).join('')}</tbody></table>
        <footer>JITO Ladies Wing Bhavnagar · Cricket Tournament</footer></section>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Team squads</title><style>
        @page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#13204a;margin:0}section{page-break-after:always;min-height:250mm;position:relative}section:last-child{page-break-after:auto}
        .hd{background:#082463;color:#fff;padding:12px 16px;border-bottom:5px solid #dcf01c;-webkit-print-color-adjust:exact;print-color-adjust:exact}.hd h1{margin:0;font-size:26px;text-transform:uppercase;letter-spacing:.03em}.hd p{margin:4px 0 0;color:#dcf01c}
        table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}th{background:#eef3fc;text-align:left;padding:8px;border-bottom:2px solid #082463}td{padding:8px;border-bottom:1px solid #d9e1f2}tr.r td{background:#f7fbd9;font-weight:700}
        footer{position:absolute;bottom:0;left:0;right:0;font-size:11px;color:#5b6788;text-align:center}</style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); const w = window.open(url, '_blank'); if (!w) toast('Allow pop-ups for this site to print', 'err');
    };
    const row = (tm, i) => `<div class="li" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line,#ffffff22)"><div style="flex:1;min-width:160px"><b style="color:var(--text,inherit)">${esc(tm.name)}</b><div style="font-size:12px">${tm.owner ? esc(tm.owner) + ' · ' : ''}${tm.players.length} players</div></div>
      <button class="btn ghost sm" data-sq="copy" data-i="${i}">Copy text</button><button class="btn ghost sm" data-sq="wa" data-i="${i}">WhatsApp</button><button class="btn ghost sm" data-sq="csv" data-i="${i}">Excel / CSV</button><button class="btn ghost sm" data-sq="pdf" data-i="${i}">PDF</button></div>`;
    const render = () => {
      const el = $('#sqBody', box); if (!el) return;
      el.innerHTML = `<div class="row-gap" style="margin-bottom:8px"><button class="btn" data-sq="allcsv">All teams · Excel / CSV</button><button class="btn" data-sq="allpdf">All teams · PDF</button></div>${data.teams.map(row).join('') || 'No teams yet'}${data.unassigned ? `<p style="margin-top:10px;font-size:13px">${data.unassigned} players are not in any team yet (pending or unsold).</p>` : ''}`;
    };
    box.addEventListener('click', async (e) => {
      const bt = e.target.closest('[data-sq]'); if (!bt) return; const k = bt.dataset.sq; const tm = data && data.teams[+bt.dataset.i];
      if (k === 'copy') { try { await navigator.clipboard.writeText(waText(tm)); toast('Copied. Paste it in WhatsApp'); } catch { toast('Copy failed. Use the WhatsApp button', 'err'); } }
      else if (k === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(waText(tm)), '_blank');
      else if (k === 'csv') save(csv([tm]), slug(tm.name) + '-squad.csv', 'text/csv;charset=utf-8');
      else if (k === 'pdf') printPDF([tm]);
      else if (k === 'allcsv') save(csv(data.teams), 'all-team-squads.csv', 'text/csv;charset=utf-8');
      else if (k === 'allpdf') printPDF(data.teams);
    });
    api('/api/admin/squads', { admin: true }).then((d) => { data = d; render(); }).catch(() => { const el = $('#sqBody', box); if (el) el.textContent = 'Could not load squads'; });
  };

  const dl = async (path, name) => { const r = await fetch('/api/admin' + path, { headers: { 'x-admin-token': store.token } }); const bl = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = name; a.click(); };
  return {
    static: true, onState() {},
    mount(b) {
      b.innerHTML = `${nav('data')}<div class="page-title"><h1>Data &amp; <em>backup</em></h1></div>
      <div class="groups" style="margin-top:20px"><div class="panel glass"><h3 class="ph3">Backup</h3><p style="color:var(--muted);margin-bottom:14px">Download everything (players, teams, results) as a file, or restore from one.</p><div class="row-gap"><button class="btn" id="dB">${icon('dl')} Download backup</button><button class="btn ghost" id="dR">${icon('dl')} Results CSV</button><label class="btn ghost up-btn">${icon('upload')} Restore<input type="file" accept=".json" id="dU"></label></div></div>
      <div class="panel glass" style="grid-column:1/-1"><h3 class="ph3">Team squads with contact numbers</h3><p style="color:var(--muted);margin-bottom:14px">After the auction, share each team's players and mobile numbers with its owner. Copy as a WhatsApp message, or download / print as a PDF. Admin only.</p><div id="sqBody" style="color:var(--muted)">Loading…</div></div>
      <div class="panel glass"><h3 class="ph3">Server snapshots</h3><p style="color:var(--muted);margin-bottom:10px">The server saves a copy after every sale, unsold and start. Use this only if something goes wrong.</p><div id="snBody" style="color:var(--muted)">Loading…</div></div>
      <div class="panel glass"><h3 class="ph3" style="color:var(--red)">Danger zone</h3><p style="color:var(--muted);margin-bottom:14px">Erase all players, teams and results.</p><button class="btn red" id="dX">Reset everything</button></div></div>`;
      wireNav(b); squadTools(b);
      $('#dB', b).onclick = () => dl('/export', 'ladies-cricket-auction-backup.json'); $('#dR', b).onclick = () => dl('/results.csv', 'auction-results.csv');
      $('#dU', b).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (await confirmBox('Restore this backup? Current data is replaced.', 'Restore')) run(() => A.post('/restore', j), 'Restored'); } catch { toast('Not a valid backup file', 'err'); } };
      api('/api/admin/snapshots', { admin: true }).then(({ snapshots }) => {
        const el = $('#snBody', b); if (!el) return;
        el.innerHTML = snapshots.length ? snapshots.slice(0, 12).map((x) => `<div class="li" style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span>${new Date(x.ts).toLocaleTimeString()} · ${esc(x.note || '')} · <b>${x.sold} sold</b></span><button class="btn ghost sm" data-snap="${x.id}">Restore</button></div>`).join('') : 'No snapshots yet';
        el.onclick = async (e) => { const id = e.target.closest('[data-snap]')?.dataset.snap; if (id && await confirmBox('Restore the server to this snapshot? Current auction state is replaced.', 'Restore')) run(() => A.post('/snapshots/' + id + '/restore'), 'Snapshot restored'); };
      }).catch(() => { const el = $('#snBody', b); if (el) el.textContent = 'Not available (database not connected)'; });
      $('#dX', b).onclick = async () => { if (await confirmBox('This erases everything. Download a backup first.', 'Erase all')) run(() => A.post('/reset-all', { confirm: 'RESET' }), 'Everything reset'); };
    },
  };
}
