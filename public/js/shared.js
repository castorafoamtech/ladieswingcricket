// Pure helpers shared by the server (engine.js) and the browser.
export function playerBase(s, p) {
  return Number(p && p.basePrice) > 0 ? Number(p.basePrice) : Number(s.settings.basePrice) || 0;
}
export function stepFor(settings, price) {
  const slabs = settings.slabs && settings.slabs.length ? settings.slabs : [{ upTo: null, step: 500 }];
  for (const sl of slabs) if (sl.upTo == null || price < Number(sl.upTo)) return Number(sl.step) || 500;
  return Number(slabs[slabs.length - 1].step) || 500;
}
export function nextBidAmount(s) {
  const c = s.auction.current;
  if (!c) return null;
  const p = s.players.find((x) => x.id === c.playerId);
  if (!c.bids.length) return playerBase(s, p);
  return c.price + stepFor(s.settings, c.price);
}
export function teamStats(s, team) {
  const mine = s.players.filter((p) => p.teamId === team.id && (p.status === 'sold' || p.status === 'retained'));
  const spent = mine.reduce((a, p) => a + (Number(p.price) || 0), 0);
  const squadSize = Number(team.squadSize) > 0 ? Number(team.squadSize) : (Number(s.settings.squadSize) > 0 ? Number(s.settings.squadSize) : (Number(s.settings.pairsPerTeam) * 2 || 16));
  const hasPurse = team.purse !== null && team.purse !== undefined && team.purse !== '' && Number(team.purse) >= 0;
  const purseTotal = hasPurse ? Number(team.purse) : Number(s.settings.purse);
  const filled = mine.length;
  const left = Math.max(0, squadSize - filled);
  const purseLeft = purseTotal - spent;
  const reserve = s.settings.enforceReserve ? Math.max(0, left - 1) * (Number(s.settings.basePrice) || 0) : 0;
  const maxBid = Math.max(0, purseLeft - reserve);
  const top = mine.reduce((a, p) => Math.max(a, Number(p.price) || 0), 0);
  return { spent, squadSize, purseTotal, filled, left, purseLeft, maxBid, top, retained: mine.filter((p) => p.status === 'retained').length, bought: mine.filter((p) => p.status === 'sold').length };
}
export function canBid(s, team, amount) {
  const st = teamStats(s, team);
  if (s.settings.enforceSquad && st.left <= 0) return { ok: false, reason: 'Squad full' };
  if (s.settings.enforcePurse && amount > st.maxBid) return { ok: false, reason: 'Purse limit' };
  if (s.settings.maxBid && amount > Number(s.settings.maxBid)) return { ok: false, reason: 'Max bid reached' };
  return { ok: true };
}
