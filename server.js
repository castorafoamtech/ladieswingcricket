import express from 'express';
import compression from 'compression';
import pg from 'pg';
import http from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as E from './engine.js';
import { parseCSV, sheetToCsvUrl, photoUrl, normalizeLevel, detectMapping } from './importer.js';
import { demoData } from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DEFAULT_PW = 'ladieswing2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_PW;
const SECRET = crypto.createHash('sha256').update('jito-ladies-cricket::' + ADMIN_PASSWORD).digest();
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const UPLOADS = path.join(DATA_DIR, 'uploads');
for (const d of [DATA_DIR, UPLOADS, path.join(UPLOADS, 'players'), path.join(UPLOADS, 'teams')]) fs.mkdirSync(d, { recursive: true });

// ---------------- persistence ----------------
// State lives in Postgres when DATABASE_URL is set (survives crashes, restarts and redeploys).
// A local file and the committed /seed folder are only fallbacks.
const SEED_DIR = path.join(__dirname, 'seed');
const EPOCH = process.env.STATE_EPOCH || '1';
const DB_URL = process.env.DATABASE_URL || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbStatus = { configured: !!DB_URL, ok: false, loadedFrom: 'seed', lastSave: 0, error: '' };
let pool = null; let dbWrite = false;
if (DB_URL) {
  try {
    const host = new URL(DB_URL).hostname;
    pool = new pg.Pool({ connectionString: DB_URL, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, ssl: host.includes('.') ? { rejectUnauthorized: false } : false });
    pool.on('error', (e) => { dbStatus.ok = false; dbStatus.error = e.message; });
  } catch (e) { dbStatus.error = e.message; console.error('DB config error:', e.message); }
}
async function dbLoad() {
  await pool.query('create table if not exists kv (k text primary key, v jsonb not null, epoch text, updated_at timestamptz default now())');
  await pool.query('create table if not exists snaps (id bigserial primary key, ts timestamptz default now(), note text, v jsonb not null)');
  const r = await pool.query("select v, epoch from kv where k = 'state'");
  if (!r.rows.length) return { none: true };
  if (r.rows[0].epoch !== EPOCH) return { none: true, stale: true };
  return { state: r.rows[0].v };
}
let state; let skipFile = false; let dbLoaded = !pool;
if (pool) {
  for (let i = 0; i < 6 && !dbLoaded; i++) {
    try {
      const r = await dbLoad(); dbLoaded = true; dbStatus.ok = true; dbStatus.error = '';
      if (r.state) { state = r.state; dbStatus.loadedFrom = 'database'; console.log('State restored from database'); }
      else if (r.stale) skipFile = true;
    } catch (e) { dbStatus.error = e.message; console.error('DB load failed (try ' + (i + 1) + '):', e.message); await sleep(4000); }
  }
  dbWrite = dbLoaded;
}
if (!state && !skipFile) { try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); dbStatus.loadedFrom = 'file'; } catch { /* none */ } }
if (!state) {
  // fresh disk (first boot / free hosting restart): start from the data committed in /seed
  try { state = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'state.json'), 'utf8')); console.log('Loaded seed data from /seed'); }
  catch { state = E.defaultState(); }
}
state.settings = { ...E.defaultSettings(), ...(state.settings || {}) };
state.auction = { ...E.defaultState().auction, ...(state.auction || {}) };
state.meta = state.meta || {};
state.settings.pins = Array.isArray(state.settings.pins) ? state.settings.pins : [];

// If the database was unreachable at boot, keep trying; never overwrite it with an empty/seed state meanwhile.
if (pool && !dbLoaded) {
  const t = setInterval(async () => {
    try {
      const r = await dbLoad(); dbStatus.ok = true; dbStatus.error = '';
      const fresh = !state.auction.history.length && state.auction.phase === 'idle';
      if (r.state && fresh) { state = r.state; state.settings = { ...E.defaultSettings(), ...(state.settings || {}) }; state.auction = { ...E.defaultState().auction, ...(state.auction || {}) }; pubCache.json = null; broadcast([{ type: 'restore' }]); dbStatus.loadedFrom = 'database'; }
      dbLoaded = true; dbWrite = true; clearInterval(t); flushDb();
    } catch (e) { dbStatus.error = e.message; }
  }, 10000);
}

let dbBusy = false; let dbDirty = false;
async function flushDb() {
  if (!pool || !dbWrite) return;
  if (dbBusy) { dbDirty = true; return; }
  dbBusy = true;
  try {
    do {
      dbDirty = false;
      await pool.query("insert into kv (k, v, epoch, updated_at) values ('state', $1::jsonb, $2, now()) on conflict (k) do update set v = excluded.v, epoch = excluded.epoch, updated_at = now()", [JSON.stringify(state), EPOCH]);
      dbStatus.ok = true; dbStatus.error = ''; dbStatus.lastSave = Date.now();
    } while (dbDirty);
  } catch (e) { dbStatus.ok = false; dbStatus.error = e.message; console.error('DB save failed:', e.message); dbDirty = false; setTimeout(flushDb, 3000); }
  finally { dbBusy = false; }
}
async function snapDb(note) {
  if (!pool || !dbWrite) return;
  try {
    await pool.query('insert into snaps (note, v) values ($1, $2::jsonb)', [note, JSON.stringify(state)]);
    await pool.query('delete from snaps where id < (select max(id) - 400 from snaps)');
  } catch (e) { console.error('snapshot failed:', e.message); }
}

let saveTimer = null;
function writeFileNow() {
  try {
    state.meta.updatedAt = Date.now();
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) { console.error('save failed', e.message); }
}
function save() {
  state.meta.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeFileNow, 250);
  flushDb();
}

// Cached public snapshot: built once per change, shared by every viewer and every poll
let pubCache = { json: null, t: 0 };
function publicJSON() {
  if (!pubCache.json || Date.now() - pubCache.t > 1500) { pubCache = { json: JSON.stringify(publicState()), t: Date.now() }; }
  return pubCache.json;
}
function auctionStats() {
  const sold = state.auction.history.filter((h) => h.type === 'sold');
  if (!sold.length) return null;
  const top = sold.slice().sort((a, b) => b.price - a.price).slice(0, 3).map((h) => ({ playerId: h.playerId, teamId: h.teamId, price: h.price }));
  let hot = sold[0]; for (const h of sold) if ((h.bids || []).length > (hot.bids || []).length) hot = h;
  return { sold: sold.length, total: sold.reduce((a, h) => a + h.price, 0), top, hot: { playerId: hot.playerId, n: (hot.bids || []).length } };
}

function publicState() {
  const a = state.auction;
  return {
    settings: state.settings,
    teams: [...state.teams].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    players: state.players.map(({ priv, ...pub }) => pub),
    auction: { phase: a.phase, current: a.current, history: a.history.slice(-40).map(({ bids, ...h }) => ({ ...h, nb: (bids || []).length })), queueCount: a.queue.length, seq: a.seq, total: a.history.length, active: null, stats: auctionStats() },
    meta: { updatedAt: Date.now() },
  };
}

// ---------------- http + ws ----------------
const app = express();
app.set('trust proxy', true);
app.use(compression({ threshold: 1024 }));
const server = http.createServer(app);
// permessage-deflate: each live update shrinks from ~14 KB to ~3 KB
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 6 }, serverNoContextTakeover: false, clientNoContextTakeover: true } });

function broadcast(events = []) {
  pubCache = { json: JSON.stringify(publicState()), t: Date.now() };
  const msg = Buffer.from('{"type":"state","state":' + pubCache.json + ',"events":' + JSON.stringify(events) + '}');
  for (const c of wss.clients) {
    if (c.readyState !== 1) continue;
    if (c.bufferedAmount > 4 * 1024 * 1024) { c.terminate(); continue; }
    try { c.send(msg, { binary: false }); } catch { /* client gone */ }
  }
}
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => {});
  ws.send('{"type":"state","state":' + publicJSON() + ',"events":[]}');
});
setInterval(() => {
  for (const c of wss.clients) { if (!c.isAlive) { c.terminate(); continue; } c.isAlive = false; c.ping(); }
}, 30000);

function commit(events = []) {
  save(); broadcast(events);
  if (events.some((e) => ['sold', 'unsold', 'phase', 'reset', 'restore'].includes(e.type))) snapDb(events[0].type);
}

app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));
app.use('/uploads', express.static(path.join(SEED_DIR, 'uploads'), { maxAge: '7d' }));
// Versioned asset URLs (/v/<build>/js/app.js) so every deploy busts phone caches
const BUILD = (process.env.RENDER_GIT_COMMIT || String(Date.now())).slice(0, 8);
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8').replaceAll('__V__', BUILD);
app.get(['/', '/index.html', '/admin', '/admin/*'], (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.type('html').send(INDEX_HTML); });
app.use((req, res, next) => { req.url = req.url.replace(/^\/v\/[a-z0-9]+(?=\/)/, ''); next(); });
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders: (res, p) => res.setHeader('Cache-Control', /\.(woff2|png|svg|jpe?g|webp)$/.test(p) ? 'public, max-age=604800' : (/\.(js|css)$/.test(p) ? 'public, max-age=31536000, immutable' : 'no-cache')),
}));

// ---------------- auth ----------------
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token || !token.includes('.')) return false;
  const [body, sig] = token.split('.');
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
const attempts = new Map();
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 10 * 60 * 1000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const given = Buffer.from(String(req.body.password || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  if (!(given.length === real.length && crypto.timingSafeEqual(given, real))) { a.n++; attempts.set(ip, a); return res.status(401).json({ error: 'Wrong password' }); }
  res.json({ token: sign({ exp: Date.now() + 30 * 24 * 3600 * 1000, n: 'Owner', r: 'owner' }), name: 'Owner', role: 'owner' });
});
function admin(req, res, next) {
  if (!verify(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Admin login required' });
  next();
}
app.get('/api/state', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('json').send(publicJSON()); });
const persistInfo = () => ({ ...dbStatus, phase: state.auction.phase, sold: state.players.filter((p) => p.status === 'sold').length });
app.get('/api/health', (req, res) => res.json({ ok: true, players: state.players.length, teams: state.teams.length, db: { configured: dbStatus.configured, ok: dbStatus.ok, lastSave: dbStatus.lastSave } }));
app.get('/api/admin/check', admin, (req, res) => res.json({ ok: true, name: 'Owner', role: 'owner', defaultPassword: ADMIN_PASSWORD === DEFAULT_PW, persist: persistInfo() }));

const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    if (res.headersSent) return;
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
    if (!e.status) console.error(e);
  }
};
const mutate = (fn) => wrap(async (req, res) => {
  const events = (await fn(req, res)) || [];
  commit(Array.isArray(events) ? events : []);
  return { ok: true };
});
const clean = (v) => String(v ?? '').trim();
app.get('/api/admin/snapshots', admin, wrap(async () => {
  if (!pool) return { snapshots: [] };
  const r = await pool.query("select id, ts, note, jsonb_array_length(v->'players') as players, (select count(*) from jsonb_array_elements(v->'players') p where p->>'status' = 'sold') as sold from snaps order by id desc limit 40");
  return { snapshots: r.rows };
}));
app.post('/api/admin/snapshots/:id/restore', admin, mutate(async (req) => {
  if (!pool) throw Object.assign(new Error('No database configured'), { status: 400 });
  const r = await pool.query('select v from snaps where id = $1', [Number(req.params.id)]);
  if (!r.rows.length) throw Object.assign(new Error('Snapshot not found'), { status: 404 });
  const b = r.rows[0].v;
  state = { ...E.defaultState(), ...b, settings: { ...E.defaultSettings(), ...(b.settings || {}) } };
  return [{ type: 'restore' }];
}));

// ---------------- uploads ----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(UPLOADS, req.params.kind === 'team' ? 'teams' : 'players')),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(8).toString('hex') + (path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg')),
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 }, fileFilter: (req, f, cb) => cb(null, /^image\//.test(f.mimetype)) });
app.post('/api/admin/upload/:kind', admin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image file required' });
  res.json({ url: `/uploads/${req.params.kind === 'team' ? 'teams' : 'players'}/${req.file.filename}` });
});

// ---------------- settings ----------------
app.put('/api/admin/settings', admin, mutate((req) => {
  const b = req.body || {};
  const s = state.settings;
  for (const k of ['eventName', 'presentedBy', 'coSponsor', 'auctionVenue', 'organiser', 'date', 'time', 'venue', 'startAt', 'auctionDate']) if (k in b) s[k] = clean(b[k]);
  for (const k of ['squadSize', 'purse', 'basePrice', 'retainedPrice']) if (k in b) s[k] = Math.max(0, Number(b[k]) || 0);
  if ('maxBid' in b) s.maxBid = Number(b.maxBid) > 0 ? Number(b.maxBid) : null;
  for (const k of ['enforcePurse', 'enforceReserve', 'enforceSquad', 'sounds']) if (k in b) s[k] = !!b[k];
  if (Array.isArray(b.slabs)) {
    const slabs = b.slabs.map((x) => ({ upTo: x.upTo === null || x.upTo === '' || x.upTo === undefined ? null : Number(x.upTo), step: Number(x.step) || 500 }))
      .filter((x) => x.upTo === null || x.upTo > 0);
    slabs.sort((a, c) => (a.upTo ?? Infinity) - (c.upTo ?? Infinity));
    if (!slabs.length || slabs[slabs.length - 1].upTo !== null) slabs.push({ upTo: null, step: slabs.length ? slabs[slabs.length - 1].step : 500 });
    s.slabs = slabs;
  }
  if (Array.isArray(b.sponsors)) s.sponsors = b.sponsors.map((x) => ({ role: clean(x.role), name: clean(x.name), logo: clean(x.logo) })).filter((x) => x.name);
  if (Array.isArray(b.pins)) s.pins = b.pins.map((x) => ({ m: clean(x.m), at: Number(x.at) > 0 ? Number(x.at) : null, from: Number(x.from) > 0 ? Number(x.from) : null, to: Number(x.to) > 0 ? Number(x.to) : null })).filter((x) => x.m && (x.at || (x.from && x.to)));
  return [{ type: 'settings' }];
}));

// ---------------- players ----------------
function newPlayer(b) {
  return {
    id: E.uid('p'), name: clean(b.name) || 'Unnamed Player', photo: photoUrl(b.photo),
    level: E.LEVELS.includes(b.level) ? b.level : normalizeLevel(b.level),
    basePrice: Number(b.basePrice) > 0 ? Number(b.basePrice) : null,
    extra: b.extra && typeof b.extra === 'object' ? b.extra : {},
    status: 'pending', teamId: null, price: null,
  };
}
// Team-wise squads with contact numbers (admin only) for sharing with owners after the auction
app.get('/api/admin/squads', admin, (req, res) => {
  const out = state.teams.map((t) => ({
    id: t.id, name: t.name, owner: t.owner || '',
    players: state.players.filter((p) => p.teamId === t.id && (p.status === 'sold' || p.status === 'retained'))
      .sort((a, b) => (a.status === 'retained' ? 0 : 1) - (b.status === 'retained' ? 0 : 1) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .map((p) => ({ name: p.name, mobile: (p.priv && p.priv.mobile) || '', retained: p.status === 'retained', price: p.price || 0 })),
  }));
  res.json({ teams: out, unassigned: state.players.filter((p) => !p.teamId).length });
});
// Contact numbers: admin only (never part of the public state)
app.get('/api/admin/contacts', admin, (req, res) => {
  const out = {};
  for (const p of state.players) if (p.priv && p.priv.mobile) out[p.id] = p.priv.mobile;
  res.json(out);
});
app.post('/api/admin/players', admin, mutate((req) => {
  const p = newPlayer(req.body || {});
  state.players.push(p);
  if (state.auction.phase === 'live') state.auction.queue.push(p.id);
  return [{ type: 'players' }];
}));
app.put('/api/admin/players/:id', admin, mutate((req) => {
  const p = E.getPlayer(state, req.params.id);
  if (!p) throw Object.assign(new Error('Unknown player'), { status: 404 });
  const b = req.body || {};
  if ('name' in b) p.name = clean(b.name) || p.name;
  if ('photo' in b) p.photo = photoUrl(b.photo);
  if ('level' in b && E.LEVELS.includes(b.level)) p.level = b.level;
  if ('basePrice' in b) p.basePrice = Number(b.basePrice) > 0 ? Number(b.basePrice) : null;
  if ('extra' in b && typeof b.extra === 'object') p.extra = b.extra;
  return [{ type: 'players' }];
}));
app.delete('/api/admin/players/:id', admin, mutate((req) => {
  if (state.auction.current && state.auction.current.playerId === req.params.id) throw Object.assign(new Error('That player is on the block now'), { status: 400 });
  state.players = state.players.filter((p) => p.id !== req.params.id);
  state.auction.queue = state.auction.queue.filter((id) => id !== req.params.id);
  return [{ type: 'players' }];
}));
app.post('/api/admin/players/:id/assign', admin, mutate((req) => E.assignPlayer(state, req.params.id, req.body.teamId, req.body.price)));
app.post('/api/admin/players/:id/unassign', admin, mutate((req) => E.unassignPlayer(state, req.params.id)));
app.post('/api/admin/players/bulk-delete', admin, mutate((req) => {
  const ids = new Set(req.body.ids || []);
  if (state.auction.current && ids.has(state.auction.current.playerId)) throw Object.assign(new Error('A selected player is on the block'), { status: 400 });
  state.players = state.players.filter((p) => !ids.has(p.id));
  state.auction.queue = state.auction.queue.filter((id) => !ids.has(id));
  return [{ type: 'players' }];
}));

// ---------------- import (Google Sheet / CSV) ----------------
const imports = new Map();
app.post('/api/admin/import/preview', admin, wrap(async (req, res) => {
  const { source, value } = req.body || {};
  let text = '';
  if (source === 'url') {
    const url = sheetToCsvUrl(value);
    if (!url) throw Object.assign(new Error('That does not look like a Google Sheets link'), { status: 400 });
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    text = await r.text();
    if (!r.ok || /^\s*<(!doctype|html)/i.test(text)) throw Object.assign(new Error('Could not read the sheet. In Google Sheets use Share > "Anyone with the link" (Viewer), then try again.'), { status: 400 });
  } else text = String(value || '');
  const rows = parseCSV(text);
  if (rows.length < 2) throw Object.assign(new Error('No data rows found'), { status: 400 });
  const headers = rows[0].map((h) => h.trim());
  const id = E.uid('imp');
  imports.set(id, { headers, rows: rows.slice(1) });
  if (imports.size > 6) imports.delete(imports.keys().next().value);
  res.json({ importId: id, headers, sample: rows.slice(1, 6), count: rows.length - 1, mapping: detectMapping(headers) });
}));
// Import rules (seed/import.json): sheet to auto-load, names to leave out, retained owners, pinned auction slots
let IMPORT_CFG = { sheetUrl: '', owners: {}, exclude: [], photoFocus: {}, retained: {}, rename: {}, pins: [] };
try { IMPORT_CFG = { ...IMPORT_CFG, ...JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'import.json'), 'utf8')) }; } catch { /* optional */ }
if (!state.settings.pins.length && (IMPORT_CFG.pins || []).length) state.settings.pins = IMPORT_CFG.pins;
// Teams and sponsors (seed/event.json) are loaded once, on a fresh start
try {
  const EV = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'event.json'), 'utf8'));
  if (!state.teams.length && Array.isArray(EV.teams)) {
    for (const x of EV.teams) state.teams.push({ id: E.uid('t'), name: x.name, short: x.short || '', color: x.color || '#FF4D8D', owner: x.owner || '', logo: x.logo || '', ownerPhoto: '', purse: null, squadSize: null, jersey: x.jersey || { primary: x.color, secondary: '#0F4233', pattern: 'solid' } });
  }
  // apply the event's rules once per seed version, only before the auction has started
  if (EV.settings && (state.meta.eventSeed || 0) < (EV.version || 1) && state.auction.phase === 'idle') {
    Object.assign(state.settings, EV.settings);
    state.meta.eventSeed = EV.version || 1;
  }
} catch { /* optional */ }

// Tidy form headers for display: "3. PLAYER ROLE " -> "Role"
const titleCase = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|[\s.(\/-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
function colLabel(h) {
  const t = String(h || '').replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\(.*?\)/g, '').trim();
  if (/role/i.test(t)) return 'Role';
  if (/right hand|left hand|batting/i.test(t)) return 'Batting';
  if (/player type|type/i.test(t)) return 'Player type';
  return titleCase(t);
}
function importRows(headers, rows, mapping, mode) {
  if (!(mapping.name >= 0)) throw Object.assign(new Error('Pick the Name column'), { status: 400 });
  if (mode === 'replace') {
    if (state.auction.phase !== 'idle') throw Object.assign(new Error('Replace is only allowed before the auction starts'), { status: 400 });
    state.players = [];
    state.auction.queue = [];
  }
  const PRIV = /mobile|phone|whatsapp|contact|receipt|payment|timestamp|e-?mail|address/i;
  const FILE = /upload|picture|photo/i;
  const phoneOf = (v) => String(v || '').replace(/\D/g, '').slice(0, 10);
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const keyOf = (n, ph) => norm(n) + '|' + ph;
  const excluded = new Set((IMPORT_CFG.exclude || []).map(norm));
    const have = new Set(state.players.map((p) => keyOf(p.name, phoneOf(p.priv && p.priv.mobile))));
  const tsOf = (pr) => { const e = pr && Object.entries(pr).find(([h]) => /timestamp/i.test(h)); return e ? String(e[1]) : ''; };
  const haveTs = new Set(state.players.filter((p) => tsOf(p.priv)).map((p) => tsOf(p.priv) + '|' + phoneOf(p.priv.mobile)));
  const mapped = new Set(Object.values(mapping).filter((v) => v >= 0));
  let added = 0; let skipped = 0;
  for (const r of rows) {
    let name = titleCase(clean(r[mapping.name]).replace(/\s+ji$/i, ''));
    if (!name) continue;
    if (excluded.has(norm(name))) { skipped++; continue; }
    const extra = {}; const priv = {};
    headers.forEach((h, i) => {
      if (mapped.has(i) || !h || !clean(r[i])) return;
      if (FILE.test(h)) return;
      if (PRIV.test(h)) { priv[h] = clean(r[i]); return; }
      const lab = colLabel(h); let val = titleCase(clean(r[i]));
      if (lab === 'Role' && /^both$/i.test(val)) val = 'All-rounder';
      extra[lab] = val;
    });
    const mob = Object.entries(priv).find(([h]) => /mobile|phone|whatsapp|contact/i.test(h));
    if (mob) priv.mobile = clean(mob[1]);
    const ren = (IMPORT_CFG.rename || {})[phoneOf(priv.mobile)];
    if (ren) name = ren;
    const key = keyOf(name, phoneOf(priv.mobile));
    if (have.has(key) || (tsOf(priv) && haveTs.has(tsOf(priv) + '|' + phoneOf(priv.mobile)))) { skipped++; continue; }
    if (mapping.category >= 0 && clean(r[mapping.category])) extra[headers[mapping.category]] = clean(r[mapping.category]);
    const p = newPlayer({
      name, photo: mapping.photo >= 0 ? r[mapping.photo] : '', level: mapping.level >= 0 ? r[mapping.level] : 'no',
      basePrice: mapping.basePrice >= 0 ? String(r[mapping.basePrice]).replace(/[^0-9.]/g, '') : null, extra,
    });
    const fy = (IMPORT_CFG.photoFocus || {})[norm(name)];
    if (fy !== undefined) p.focusY = Number(fy);
    if (Object.keys(priv).length) p.priv = priv;
    state.players.push(p); have.add(key);
    if (state.auction.phase === 'live') state.auction.queue.push(p.id);
    added++;
  }
  // One retained player (the owner) per team, free of cost
  const tc = (v) => v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  let retained = 0;
  for (const [teamName, playerName] of Object.entries(IMPORT_CFG.retained || {})) {
    const t = state.teams.find((x) => norm(x.name) === norm(teamName));
    const p = typeof playerName === 'object'
      ? state.players.find((x) => phoneOf(x.priv && x.priv.mobile) === phoneOf(playerName.mobile))
      : state.players.find((x) => norm(x.name) === norm(playerName));
    if (!t || !p) { console.log('Retained not applied:', teamName, '/', playerName); continue; }
    E.setRetained(state, t.id, [{ playerId: p.id, price: state.settings.retainedPrice || 0 }]);
    t.owner = (IMPORT_CFG.owners || {})[teamName] || tc(clean(p.name)); retained++;
  }
  return { added, skipped, retained };
}
app.post('/api/admin/import/commit', admin, mutate((req) => {
  const { importId, mapping = {}, mode = 'append' } = req.body || {};
  const imp = imports.get(importId);
  if (!imp) throw Object.assign(new Error('Import expired. Load the sheet again'), { status: 400 });
  const res = importRows(imp.headers, imp.rows, mapping, mode);
  imports.delete(importId);
  setTimeout(() => cacheAllPhotos(), 200);
  return [{ type: 'players', ...res }];
}));

// Read the registration sheet (seed/import.json sheetUrl) into rows
async function fetchConfigSheet() {
  const url = sheetToCsvUrl(IMPORT_CFG.sheetUrl);
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const text = await r.text();
  if (!r.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error('sheet not readable (' + r.status + ')');
  const rows = parseCSV(text);
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}
// Add only NEW form responses (existing players, edits and auction results are untouched)
app.post('/api/admin/import/sync', admin, wrap(async (req, res) => {
  if (!IMPORT_CFG.sheetUrl) throw Object.assign(new Error('No sheet configured'), { status: 400 });
  let sh;
  try { sh = await fetchConfigSheet(); } catch (e) { throw Object.assign(new Error(e.message + '. Check the sheet is shared "Anyone with the link".'), { status: 400 }); }
  const result = importRows(sh.headers, sh.rows, detectMapping(sh.headers), 'append');
  if (result.added) { commit([{ type: 'players', ...result }]); setTimeout(() => cacheAllPhotos(), 200); }
  res.json({ ok: true, ...result });
}));

// Load the registration sheet by itself when the app starts with no players (survives free-plan restarts)
async function bootImport(attempt = 1) {
  if (!IMPORT_CFG.sheetUrl || state.players.length || state.auction.phase !== 'idle') return;
  try {
    const sh = await fetchConfigSheet();
    const res = importRows(sh.headers, sh.rows, detectMapping(sh.headers), 'replace');
    console.log('Auto-imported players from sheet:', JSON.stringify(res));
    commit([{ type: 'players', ...res }]);
    cacheAllPhotos();
  } catch (e) {
    console.log('Auto-import failed (attempt ' + attempt + '):', e.message);
    if (attempt < 6) setTimeout(() => bootImport(attempt + 1), 30000 * attempt);
  }
}
// Keep picking up new form responses every 10 minutes until the auction starts
function autoSync() {
  if (!IMPORT_CFG.sheetUrl || state.auction.phase !== 'idle' || !state.players.length) return;
  fetchConfigSheet().then((sh) => {
    if (state.auction.phase !== 'idle') return;
    const res = importRows(sh.headers, sh.rows, detectMapping(sh.headers), 'append');
    if (res.added) { console.log('Auto-sync added', res.added, 'new players'); commit([{ type: 'players', ...res }]); cacheAllPhotos(); }
  }).catch((e) => console.log('Auto-sync skipped:', e.message));
}
setInterval(autoSync, 10 * 60 * 1000);

// Download remote photos (Drive etc.) once, so the big screen never waits on Google
let caching = false;
async function cacheAllPhotos() {
  if (caching) return;
  caching = true;
  try {
    for (const p of state.players) {
      if (/^\/uploads\/players\//.test(p.photo || '') && p.photoSrc && !fs.existsSync(path.join(UPLOADS, 'players', path.basename(p.photo))) && !fs.existsSync(path.join(SEED_DIR, 'uploads', 'players', path.basename(p.photo)))) p.photo = p.photoSrc;
    }
    const todo = state.players.filter((p) => /^https?:\/\//.test(p.photo || ''));
    let i = 0; let changed = 0;
    const worker = async () => {
      while (i < todo.length) {
        const p = todo[i++];
        try {
          const r = await fetch(p.photo, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
          const ct = r.headers.get('content-type') || '';
          if (!r.ok || !/^image\//.test(ct)) continue;
          const ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : ct.includes('gif') ? '.gif' : '.jpg';
          const file = `${p.id}${ext}`;
          fs.writeFileSync(path.join(UPLOADS, 'players', file), Buffer.from(await r.arrayBuffer()));
          p.photoSrc = p.photoSrc || p.photo; p.photo = `/uploads/players/${file}`; changed++;
        } catch { /* keep remote URL */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (changed) commit([{ type: 'players' }]);
  } finally { caching = false; }
}
app.post('/api/admin/photos/cache', admin, wrap(() => { cacheAllPhotos(); return { ok: true }; }));

// ---------------- teams ----------------
function applyTeam(t, b) {
  if ('name' in b) t.name = clean(b.name) || t.name;
  if ('short' in b) t.short = clean(b.short).slice(0, 4).toUpperCase();
  if ('owner' in b) t.owner = clean(b.owner);
  if ('color' in b) t.color = clean(b.color) || t.color;
  if ('logo' in b) t.logo = clean(b.logo);
  if ('ownerPhoto' in b) t.ownerPhoto = clean(b.ownerPhoto);
  if ('purse' in b) t.purse = b.purse === '' || b.purse === null ? null : Number(b.purse);
  if ('squadSize' in b) t.squadSize = b.squadSize === '' || b.squadSize === null ? null : Number(b.squadSize);
  if (b.jersey) t.jersey = { primary: clean(b.jersey.primary) || '#F5C400', secondary: clean(b.jersey.secondary) || '#0A2A66', pattern: ['solid', 'stripes', 'split', 'hoops', 'sash'].includes(b.jersey.pattern) ? b.jersey.pattern : 'solid' };
}
app.post('/api/admin/teams', admin, mutate((req) => {
  const b = req.body || {};
  const t = { id: E.uid('t'), name: 'New Team', short: '', color: '#F5C400', owner: '', logo: '', ownerPhoto: '', purse: null, squadSize: null, jersey: { primary: '#F5C400', secondary: '#0A2A66', pattern: 'solid' } };
  applyTeam(t, b);
  if (!t.short) t.short = t.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  state.teams.push(t);
  return [{ type: 'teams' }];
}));
app.put('/api/admin/teams/:id', admin, mutate((req) => {
  const t = E.getTeam(state, req.params.id);
  if (!t) throw Object.assign(new Error('Unknown team'), { status: 404 });
  applyTeam(t, req.body || {});
  return [{ type: 'teams' }];
}));
app.delete('/api/admin/teams/:id', admin, mutate((req) => {
  const id = req.params.id;
  if (state.auction.current && state.auction.current.teamId === id) throw Object.assign(new Error('That team holds the current bid'), { status: 400 });
  state.players.forEach((p) => { if (p.teamId === id) { p.status = 'pending'; p.teamId = null; p.price = null; delete p.retainRole; delete p.pair; if (state.auction.phase === 'live') state.auction.queue.push(p.id); } });
  state.teams = state.teams.filter((t) => t.id !== id);
  return [{ type: 'teams' }];
}));
app.put('/api/admin/teams/:id/retained', admin, mutate((req) => E.setRetained(state, req.params.id, req.body.entries)));

// ---------------- auction ----------------
const A = (fn) => mutate((req) => fn(state, req.body || {}));
app.post('/api/admin/auction/start', admin, A((s) => E.startAuction(s)));
app.post('/api/admin/auction/randomize', admin, A((s) => E.randomize(s)));
app.post('/api/admin/auction/next', admin, A((s) => E.nextPlayer(s)));
app.post('/api/admin/auction/bid', admin, A((s, b) => E.placeBid(s, b.teamId)));
app.post('/api/admin/auction/undo', admin, A((s) => E.undoBid(s)));
app.post('/api/admin/auction/manual', admin, A((s, b) => E.manualBid(s, b.teamId, b.amount)));
app.post('/api/admin/auction/sold', admin, A((s) => E.markSold(s)));
app.post('/api/admin/auction/unsold', admin, A((s) => E.markUnsold(s)));
app.post('/api/admin/auction/back', admin, A((s) => E.reopenLast(s)));
app.post('/api/admin/auction/reauction', admin, A((s) => E.reauctionUnsold(s)));
app.post('/api/admin/auction/pause', admin, A((s) => E.pause(s)));
app.post('/api/admin/auction/resume', admin, A((s) => E.resume(s)));
app.post('/api/admin/auction/finish', admin, A((s) => E.finish(s)));
app.post('/api/admin/auction/reset', admin, A((s) => E.resetAuction(s)));

// ---------------- data tools ----------------
app.get('/api/admin/export', admin, wrap((req, res) => {
  const copy = JSON.parse(JSON.stringify(state));
  copy.auction.queue = [];
  res.setHeader('Content-Disposition', 'attachment; filename="qpl-auction-backup.json"');
  res.json(copy);
}));
app.post('/api/admin/restore', admin, mutate((req) => {
  const b = req.body;
  if (!b || !Array.isArray(b.players) || !Array.isArray(b.teams)) throw Object.assign(new Error('Not a valid backup file'), { status: 400 });
  state = { ...E.defaultState(), ...b, settings: { ...E.defaultSettings(), ...(b.settings || {}) } };
  if (state.auction.phase === 'live') state.auction.queue = E.seqLock(state, E.shuffle(state.players.filter((p) => p.status === 'pending' && !(state.auction.current && state.auction.current.playerId === p.id)).map((p) => p.id)));
  else state.auction.queue = [];
  return [{ type: 'restore' }];
}));
app.post('/api/admin/demo', admin, mutate(() => {
  if (process.env.ALLOW_DEMO !== '1') throw Object.assign(new Error('Demo data is disabled on this server'), { status: 403 });
  const d = demoData(48);
  state = { ...E.defaultState(), settings: state.settings, players: d.players, teams: d.teams };
  return [{ type: 'restore' }];
}));
app.post('/api/admin/reset-all', admin, mutate((req) => {
  if (req.body.confirm !== 'RESET') throw Object.assign(new Error('Type RESET to confirm'), { status: 400 });
  if (state.players.some((p) => p.status === 'sold' || p.status === 'unsold')) throw Object.assign(new Error('The auction has results. Use Reset auction or restore a snapshot instead.'), { status: 400 });
  state = { ...E.defaultState(), settings: state.settings };
  return [{ type: 'restore' }];
}));
app.get('/api/admin/results.csv', admin, (req, res) => {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [['Player', 'Plays cricket', 'Status', 'Team', 'Price', 'Role'].map(q).join(',')];
  for (const p of state.players) {
    const t = E.getTeam(state, p.teamId);
    lines.push([p.name, p.level, p.status, t ? t.name : '', p.price ?? '', p.retainRole || ''].map(q).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="auction-results.csv"');
  res.send(lines.join('\n'));
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));
let closing = false;
async function shutdown(sig) {
  if (closing) return; closing = true;
  console.log('Shutting down on', sig, '- saving state');
  try { writeFileNow(); if (pool && dbWrite) await Promise.race([pool.query("insert into kv (k, v, epoch, updated_at) values ('state', $1::jsonb, $2, now()) on conflict (k) do update set v = excluded.v, epoch = excluded.epoch, updated_at = now()", [JSON.stringify(state), EPOCH]), sleep(4000)]); } catch { /* best effort */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Free hosting sleeps after 15 quiet minutes: ping our own public URL so it never does
const SELF = process.env.RENDER_EXTERNAL_URL;
if (SELF) setInterval(() => { fetch(SELF + '/api/health', { signal: AbortSignal.timeout(15000) }).catch(() => {}); }, 4 * 60 * 1000);
server.listen(PORT, () => {
  setTimeout(() => cacheAllPhotos(), 3000);
  setTimeout(() => bootImport(), 1500);
  console.log(`QPL Auction running on http://localhost:${PORT}`);
  if (ADMIN_PASSWORD === DEFAULT_PW) console.log('WARNING: using the default admin password. Set ADMIN_PASSWORD before going live.');
});
