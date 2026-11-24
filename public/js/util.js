import { teamStats, nextBidAmount, canBid, stepFor, playerBase } from './shared.js';
export { teamStats, nextBidAmount, canBid, stepFor, playerBase };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const nf = new Intl.NumberFormat('en-IN');
export const inr = (n) => (n === null || n === undefined || n === '' ? '—' : '₹' + nf.format(Math.round(Number(n))));
export const num = (n) => nf.format(Math.round(Number(n) || 0));
export function inrShort(n) {
  n = Number(n) || 0;
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + 'Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L';
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '₹' + n;
}

export const LEVEL = {
  yes: { label: 'PLAYS OFTEN', long: 'Plays often (with kids)', color: '#2fe38a', dots: 4 },
  sometimes: { label: 'MONTH / YEAR', long: 'Once a month / year', color: '#ffc53d', dots: 3 },
  rarely: { label: 'IN CHILDHOOD', long: 'Played in childhood', color: '#ff8a3d', dots: 2 },
  no: { label: 'FIRST TIME', long: 'Playing for the first time', color: '#6cb6ff', dots: 1 },
};
export const STATUS_LABEL = { pending: 'Pending', sold: 'Sold', unsold: 'Unsold', retained: 'Retained' };

/* ---------- icons ---------- */
const P = {
  more: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
  fixtures: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 17h3"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5Z"/>',
  rules: '<path d="M6 3.5h9l3.5 3.5v13.5H6V3.5Z"/><path d="M14.5 3.5V7H18M9 12h6M9 15.5h6"/>',
  desk: '<rect x="3" y="4.5" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16.5V20"/><path d="m8.5 10.5 2.2 2.2 4.8-4.6"/>',
  admins: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.8 3.1-6 7-6s7 2.2 7 6"/><path d="m17.5 4 .8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.5.8.3-1.7L15 5.9l1.7-.3.8-1.6Z"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  teams: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3 20c0-3.4 2.7-5.5 6-5.5s6 2.1 6 5.5"/><path d="M15.5 14.8c3 0 5.5 1.7 5.5 4.7"/>',
  players: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  league: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lock: '<rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  gavel: '<path d="m14 5 5 5"/><path d="m11.5 7.5 5 5-4 4-5-5 4-4Z"/><path d="m4 20 6-6"/><path d="M3 21h8"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  shuffle: '<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c1.6 0 2.7-.9 3.6-2.2M21 7h-3.5c-1.6 0-2.8.9-3.7 2.2"/><path d="m18.5 4 2.5 3-2.5 3M18.5 14l2.5 3-2.5 3"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  dash: '<rect x="3.5" y="3.5" width="7" height="9" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="15.5" width="7" height="5" rx="2"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l9-11h-6.5L13 3Z"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/>',
  dl: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
};
export const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

/* ---------- generated art ---------- */
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const svgUri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
const avCache = new Map();
export function avatar(name) {
  if (avCache.has(name)) return avCache.get(name);
  const h = hash(name); const a = h % 360; const b = (a + 40) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 460"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},65%,38%)"/><stop offset="1" stop-color="hsl(${b},70%,20%)"/></linearGradient></defs><rect width="400" height="460" fill="url(#g)"/><circle cx="200" cy="170" r="74" fill="rgba(255,255,255,.22)"/><path d="M60 460c0-96 62-150 140-150s140 54 140 150Z" fill="rgba(255,255,255,.22)"/><text x="200" y="395" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="92" fill="rgba(255,255,255,.9)" letter-spacing="4">${esc(initials(name))}</text></svg>`;
  const u = svgUri(svg); avCache.set(name, u); return u;
}
export const pf = (p) => (p && Number.isFinite(Number(p.focusY)) && p.focusY !== null ? ` style="object-position:50% ${Number(p.focusY)}%"` : '');
export const photoOf = (p) => (p && p.photo) || avatar(p ? p.name : '?');
export function teamLogoArt(t) {
  const c = t.color || '#e6f514';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#061a45"/></linearGradient></defs><path d="M100 10 176 36v62c0 46-30 78-76 94C54 176 24 144 24 98V36Z" fill="url(#g)" stroke="#fff" stroke-width="7"/><path d="M100 28 160 48v50c0 36-22 62-60 76-38-14-60-40-60-76V48Z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/><text x="100" y="122" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-size="${(t.short || '').length > 2 ? 62 : 78}" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="2" letter-spacing="2">${esc(t.short || initials(t.name))}</text></svg>`;
  return svgUri(svg);
}
export const logoOf = (t) => (t && t.logo) || (t ? teamLogoArt(t) : '');
export const imgFallback = "this.onerror=null;this.src=''";

let jid = 0;
export function jerseySVG(t, cls = '') {
  const j = t.jersey || { primary: t.color || '#e6f514', secondary: '#0a2a66', pattern: 'solid' };
  const id = 'jc' + (++jid);
  const a = j.primary, b = j.secondary;
  const body = 'M40 8 22 16 4 38l18 14 10-8v64q0 4 4 4h48q4 0 4-4V44l10 8 18-14L98 16 80 8Q70 24 60 24T40 8Z';
  let pat = '';
  if (j.pattern === 'stripes') pat = [0, 1, 2, 3, 4].map((i) => `<rect x="${4 + i * 24}" y="0" width="12" height="120" fill="${b}"/>`).join('');
  if (j.pattern === 'hoops') pat = [0, 1, 2, 3].map((i) => `<rect x="0" y="${28 + i * 24}" width="120" height="11" fill="${b}"/>`).join('');
  if (j.pattern === 'split') pat = `<rect x="60" y="0" width="60" height="120" fill="${b}"/>`;
  if (j.pattern === 'sash') pat = `<path d="M0 30 120 100v-26L0 4Z" fill="${b}"/>`;
  return `<svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true"><defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="120" height="120" fill="${a}"/>${pat}<path d="M40 8Q50 26 60 26T80 8l-8-2Q66 16 60 16T48 6Z" fill="rgba(0,0,0,.35)"/></g><path d="${body}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
}

/* ---------- lookups ---------- */
export function idx(state) {
  const P = new Map(state.players.map((p) => [p.id, p]));
  const T = new Map(state.teams.map((t) => [t.id, t]));
  return { P, T };
}
export function counts(state) {
  const c = { total: state.players.length, sold: 0, pending: 0, unsold: 0, retained: 0 };
  state.players.forEach((p) => { c[p.status] = (c[p.status] || 0) + 1; });
  const cur = state.auction.current ? 1 : 0;
  c.onBlock = cur;
  return c;
}

export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function seededShuffle(arr, seed) {
  const a = arr.slice(); let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
