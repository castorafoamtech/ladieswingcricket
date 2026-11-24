// Freeze the current players/teams/settings (+ photos & logos) into ./seed so they ship with the code.
// Usage: DATA_DIR=./data node scripts/make-seed.js    (then commit & push the seed folder)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const SEED = path.join(root, 'seed');
const st = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8'));
st.auction = { phase: 'idle', queue: [], current: null, history: [], seq: 0 };
st.players.forEach((p) => { if (p.status !== 'retained') { p.status = 'pending'; p.teamId = null; p.price = null; delete p.soldAt; } });
fs.rmSync(SEED, { recursive: true, force: true });
fs.mkdirSync(SEED, { recursive: true });
fs.writeFileSync(path.join(SEED, 'state.json'), JSON.stringify(st, null, 1));
if (fs.existsSync(path.join(DATA, 'uploads'))) fs.cpSync(path.join(DATA, 'uploads'), path.join(SEED, 'uploads'), { recursive: true });
console.log(`Seed written: ${st.players.length} players, ${st.teams.length} teams`);
