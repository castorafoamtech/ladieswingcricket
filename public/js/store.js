// Client state + live connection
export const store = {
  state: null,
  token: localStorage.getItem('adminToken') || '',
  connected: false,
  subs: new Set(),
};

export function subscribe(fn) { store.subs.add(fn); return () => store.subs.delete(fn); }
const notify = (events) => store.subs.forEach((fn) => { try { fn(store.state, events || []); } catch (e) { console.error(e); } });

export async function api(path, { method = 'GET', body, admin = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (admin || store.token) headers['x-admin-token'] = store.token;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) {
    if (res.status === 401 && admin) { setToken(''); location.hash = '#/admin'; }
    throw new Error((data && data.error) || 'Request failed');
  }
  return data;
}
export const A = {
  post: (p, body = {}) => api('/api/admin' + p, { method: 'POST', body, admin: true }),
  put: (p, body = {}) => api('/api/admin' + p, { method: 'PUT', body, admin: true }),
  del: (p) => api('/api/admin' + p, { method: 'DELETE', admin: true }),
  async upload(kind, file) {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/admin/upload/' + kind, { method: 'POST', headers: { 'x-admin-token': store.token }, body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Upload failed');
    return d.url;
  },
};
export function setToken(t) {
  store.token = t;
  if (t) localStorage.setItem('adminToken', t); else localStorage.removeItem('adminToken');
}
export const isAdmin = () => !!store.token;
export function me() { try { const b = store.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); const p = JSON.parse(atob(b)); return { name: p.n || 'Owner', role: p.r || 'owner' }; } catch { return { name: 'Owner', role: 'owner' }; } }
export const isOwner = () => isAdmin() && me().role === 'owner';

let ws; let retry = 0; let poll;
export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { retry = 0; store.connected = true; clearInterval(poll); notify([{ type: 'conn' }]); };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.type === 'state') { store.state = msg.state; notify(msg.events); }
  };
  ws.onclose = () => {
    store.connected = false; notify([{ type: 'conn' }]);
    clearInterval(poll);
    poll = setInterval(async () => { try { store.state = await api('/api/state'); notify([]); } catch { /* offline */ } }, 4000);
    setTimeout(connect, Math.min(8000, 800 * ++retry));
  };
  ws.onerror = () => ws.close();
}

export async function loadInitial() {
  store.state = await api('/api/state');
}

// Re-sync instantly when a phone wakes up or the network returns
async function resync() { try { store.state = await api('/api/state'); notify([]); } catch { /* offline */ } if (!store.connected && (!ws || ws.readyState > 1)) connect(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
window.addEventListener('online', resync);
window.addEventListener('focus', resync);
