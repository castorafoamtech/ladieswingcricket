// Auction engine: pure state mutations. Every function mutates `state` and returns an array of events.
import crypto from 'crypto';
import { playerBase, stepFor, nextBidAmount, teamStats, canBid } from './public/js/shared.js';
export { playerBase, stepFor, nextBidAmount, teamStats, canBid };

export const LEVELS = ['yes', 'sometimes', 'rarely', 'no'];

export function uid(prefix = 'id') {
  return prefix + '_' + crypto.randomBytes(5).toString('hex');
}

export function defaultSettings() {
  return {
    eventName: 'Ladies Wing Cricket Tournament',
    organiser: 'JITO Ladies Wing Bhavnagar',
    presentedBy: '',
    coSponsor: '',
    auctionVenue: '',
    date: '',
    time: '',
    venue: '',
    squadSize: 12,            // players per team
    purse: 1000000,           // default purse per team
    retainedPrice: 0,         // price charged to the purse for each team's retained player
    basePrice: 10000,
    // bid increments: while price < upTo, add `step`. upTo = null means "no limit".
    slabs: [
      { upTo: 50000, step: 5000 },
      { upTo: null, step: 10000 },
    ],
    maxBid: null,             // optional hard cap on a single player price
    enforcePurse: true,
    enforceReserve: true,     // keep base price for every remaining empty slot
    enforceSquad: true,
    sounds: true,
    startAt: '',
    auctionDate: '',
    sponsors: [],
    // players fixed to a place in the auction order: { m: mobile, at: 20 } or { m: mobile, from: 1, to: 14 }
    pins: [],
  };
}

export function defaultState() {
  return {
    settings: defaultSettings(),
    teams: [],
    players: [],
    auction: { phase: 'idle', queue: [], current: null, history: [], seq: 0, active: null },
    meta: { createdAt: Date.now(), updatedAt: Date.now() },
  };
}

const err = (m) => { const e = new Error(m); e.status = 400; throw e; };

export const getPlayer = (s, id) => s.players.find((p) => p.id === id);
export const getTeam = (s, id) => s.teams.find((t) => t.id === id);

// Fixed slots (1-based position in the whole auction order) come from settings.pins, matched on mobile number.
const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
export function seqLock(s, q) {
  try {
    const n = q.length;
    const done = s.players.filter((p) => p.status === 'sold' || p.status === 'unsold').length + (s.auction.current ? 1 : 0);
    const out = new Array(n).fill(null), used = new Set(), taken = new Set();
    const idOf = (m) => { const p = s.players.find((x) => last10(x.priv && x.priv.mobile) === m); return p && q.includes(p.id) ? p.id : null; };
    const put = (id, i) => { out[i] = id; used.add(id); taken.add(i); };
    const PIN_SLOTS = (s.settings.pins || []).map((x) => ({ m: last10(x.m), at: x.at ? Number(x.at) : null, from: Number(x.from) || 0, to: Number(x.to) || 0 })).filter((x) => x.m && (x.at || (x.from && x.to)));
    for (const sl of PIN_SLOTS) { if (sl.at == null) continue; const id = idOf(sl.m); const i = sl.at - 1 - done; if (id && i >= 0 && i < n && !taken.has(i)) put(id, i); }
    for (const sl of PIN_SLOTS) {
      if (sl.at != null) continue;
      const id = idOf(sl.m); if (!id || used.has(id)) continue;
      const lo = Math.max(0, sl.from - 1 - done), hi = Math.min(n - 1, sl.to - 1 - done);
      if (hi < lo) continue;
      const free = []; for (let i = lo; i <= hi; i++) if (!taken.has(i)) free.push(i);
      if (free.length) put(id, free[crypto.randomInt(0, free.length)]);
    }
    const others = q.filter((id) => !used.has(id)); let k = 0;
    for (let i = 0; i < n; i++) if (out[i] == null) out[i] = others[k++];
    return out;
  } catch { return q; }
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function recompute(s) {
  const c = s.auction.current;
  const last = c.bids[c.bids.length - 1];
  if (last) { c.price = last.amount; c.teamId = last.teamId; }
  else { c.price = playerBase(s, getPlayer(s, c.playerId)); c.teamId = null; }
}

function assertLive(s) {
  if (s.auction.phase === 'idle') err('Start the auction first');
  if (s.auction.phase === 'paused') err('Auction is paused');
  if (s.auction.phase === 'done') err('Auction is finished');
}

// One auction: every pending player goes into a single shuffled queue (pinned players keep their slot).
export function startAuction(s) {
  if (!s.teams.length) err('Add teams before starting');
  if (s.auction.phase === 'live' || s.auction.phase === 'paused') err('Auction is already running');
  if (s.auction.phase === 'done') err('Auction is finished. Use Reopen last or Reset.');
  const pool = s.players.filter((p) => p.status === 'pending');
  if (!pool.length) err('No pending players to auction');
  s.auction.queue = seqLock(s, shuffle(pool.map((p) => p.id)));
  s.auction.phase = 'live';
  s.auction.active = null;
  s.auction.current = null;
  return [{ type: 'phase', phase: 'live' }, { type: 'shuffle' }];
}

export function randomize(s) {
  s.auction.queue = seqLock(s, shuffle(s.auction.queue));
  return [{ type: 'shuffle' }];
}

export function pause(s) { s.auction.phase = 'paused'; return [{ type: 'phase', phase: 'paused' }]; }
export function resume(s) { s.auction.phase = 'live'; return [{ type: 'phase', phase: 'live' }]; }
export function finish(s) {
  if (s.auction.current) err('Resolve the current player first');
  s.auction.phase = 'done';
  return [{ type: 'phase', phase: 'done' }];
}

export function nextPlayer(s) {
  assertLive(s);
  if (s.auction.current) err('Mark the current player Sold or Unsold first');
  if (!s.auction.queue.length) err('No more players in the queue');
  const id = s.auction.queue.shift();
  const p = getPlayer(s, id);
  s.auction.current = { playerId: id, bids: [], price: playerBase(s, p), teamId: null, startedAt: Date.now() };
  return [{ type: 'next', playerId: id }];
}

export function placeBid(s, teamId) {
  assertLive(s);
  const c = s.auction.current;
  if (!c) err('No player on the block');
  const team = getTeam(s, teamId);
  if (!team) err('Unknown team');
  if (c.teamId === teamId) err('That team already holds the highest bid');
  const amount = nextBidAmount(s);
  const chk = canBid(s, team, amount);
  if (!chk.ok) err(`${team.name}: ${chk.reason}`);
  c.bids.push({ teamId, amount, ts: Date.now() });
  recompute(s);
  return [{ type: 'bid', teamId, amount, playerId: c.playerId }];
}

export function undoBid(s) {
  assertLive(s);
  const c = s.auction.current;
  if (!c || !c.bids.length) err('Nothing to undo');
  const b = c.bids.pop();
  recompute(s);
  return [{ type: 'undo', teamId: b.teamId, amount: b.amount }];
}

export function manualBid(s, teamId, amount) {
  assertLive(s);
  const c = s.auction.current;
  if (!c) err('No player on the block');
  const team = getTeam(s, teamId);
  if (!team) err('Unknown team');
  amount = Math.round(Number(amount));
  if (!(amount >= 0)) err('Enter a valid amount');
  c.bids.push({ teamId, amount, manual: true, ts: Date.now() });
  recompute(s);
  return [{ type: 'bid', teamId, amount, manual: true, playerId: c.playerId }];
}

export function markSold(s) {
  assertLive(s);
  const c = s.auction.current;
  if (!c) err('No player on the block');
  if (!c.teamId) err('No bids yet. Use Unsold or place a bid');
  const p = getPlayer(s, c.playerId);
  p.status = 'sold'; p.teamId = c.teamId; p.price = c.price; p.soldAt = Date.now();
  s.auction.history.push({ id: ++s.auction.seq, playerId: p.id, type: 'sold', teamId: c.teamId, price: c.price, bids: c.bids, ts: Date.now() });
  s.auction.current = null;
  return [{ type: 'sold', playerId: p.id, teamId: p.teamId, price: p.price }];
}

export function markUnsold(s) {
  assertLive(s);
  const c = s.auction.current;
  if (!c) err('No player on the block');
  const p = getPlayer(s, c.playerId);
  p.status = 'unsold'; p.teamId = null; p.price = null;
  s.auction.history.push({ id: ++s.auction.seq, playerId: p.id, type: 'unsold', bids: c.bids, ts: Date.now() });
  s.auction.current = null;
  return [{ type: 'unsold', playerId: p.id }];
}

// Re-open the last sold/unsold player (the "Back" button)
export function reopenLast(s) {
  assertLive(s);
  const h = s.auction.history[s.auction.history.length - 1];
  if (!h) err('Nothing to go back to');
  const c = s.auction.current;
  if (c) {
    if (c.bids.length) err('Resolve the current player (Sold / Unsold / Undo bids) before going back');
    s.auction.queue.unshift(c.playerId);
  }
  s.auction.history.pop();
  const p = getPlayer(s, h.playerId);
  p.status = 'pending'; p.teamId = null; p.price = null; delete p.soldAt;
  s.auction.current = { playerId: p.id, bids: h.bids || [], price: playerBase(s, p), teamId: null, startedAt: Date.now(), reopened: true };
  recompute(s);
  return [{ type: 'next', playerId: p.id, reopened: true }];
}

export function reauctionUnsold(s) {
  assertLive(s);
  const ids = s.players.filter((p) => p.status === 'unsold').map((p) => p.id);
  if (!ids.length) err('No unsold players');
  ids.forEach((id) => { getPlayer(s, id).status = 'pending'; });
  s.auction.queue = s.auction.queue.concat(shuffle(ids));
  return [{ type: 'shuffle' }];
}

export function resetAuction(s) {
  s.players.forEach((p) => {
    if (p.status !== 'retained') { p.status = 'pending'; p.teamId = null; p.price = null; delete p.soldAt; }
  });
  s.auction = { phase: 'idle', queue: [], current: null, history: [], seq: 0, active: null };
  return [{ type: 'reset' }];
}

// ---------- direct assignment / retention ----------
export function assignPlayer(s, playerId, teamId, price) {
  const p = getPlayer(s, playerId); const t = getTeam(s, teamId);
  if (!p || !t) err('Unknown player or team');
  if (s.auction.current && s.auction.current.playerId === playerId) err('That player is on the block now');
  s.auction.queue = s.auction.queue.filter((id) => id !== playerId);
  p.status = 'sold'; p.teamId = teamId; p.price = Math.max(0, Math.round(Number(price) || 0)); p.soldAt = Date.now();
  delete p.retainRole; delete p.pair;
  return [{ type: 'assign', playerId, teamId }];
}

export function unassignPlayer(s, playerId) {
  const p = getPlayer(s, playerId);
  if (!p) err('Unknown player');
  p.status = 'pending'; p.teamId = null; p.price = null; delete p.retainRole; delete p.pair; delete p.soldAt;
  if (s.auction.phase === 'live' && !(s.auction.current && s.auction.current.playerId === playerId)) {
    if (!s.auction.queue.includes(playerId)) s.auction.queue.push(playerId);
  }
  return [{ type: 'assign', playerId }];
}

export function setRetained(s, teamId, entries) {
  const t = getTeam(s, teamId);
  if (!t) err('Unknown team');
  // release previous retained players of this team
  s.players.forEach((p) => {
    if (p.teamId === teamId && p.status === 'retained') {
      p.status = 'pending'; p.teamId = null; p.price = null; delete p.retainRole; delete p.pair;
    }
  });
  const seen = new Set();
  for (const e of entries || []) {
    if (!e.playerId || seen.has(e.playerId)) continue;
    seen.add(e.playerId);
    const p = getPlayer(s, e.playerId);
    if (!p) continue;
    if (p.status === 'sold' && p.teamId && p.teamId !== teamId) err(`${p.name} already belongs to another team`);
    s.auction.queue = s.auction.queue.filter((id) => id !== p.id);
    p.status = 'retained'; p.teamId = teamId; p.price = Math.max(0, Math.round(Number(e.price) || 0));
    p.retainRole = 'owner';
  }
  return [{ type: 'retain', teamId }];
}
