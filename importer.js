// CSV parsing, Google Sheet / Drive helpers, column auto-detection
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function sheetToCsvUrl(url) {
  const u = String(url || '').trim();
  if (/^https?:\/\/docs\.google\.com\/spreadsheets\/d\/e\//.test(u)) {
    return u.includes('output=csv') ? u : u.replace(/\/pubhtml.*$/, '/pub?output=csv');
  }
  const m = u.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const g = u.match(/[#?&]gid=(\d+)/);
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${g ? '&gid=' + g[1] : ''}`;
}

export function driveId(url) {
  const u = String(url || '');
  let m = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) m = u.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*id=([a-zA-Z0-9_-]+)/);
  if (!m) m = u.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Return the best direct image URL for a pasted link
export function photoUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  const id = driveId(u);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w500`;
  return u;
}

// "How often do you play cricket?" answers -> 4 levels
export function normalizeLevel(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return 'no';
  if (/first time|never|new to|^no\b/.test(s)) return 'no';
  if (/childhood|rare|seldom|hardly|used to/.test(s)) return 'rarely';
  if (/month|year|some|occasion|ocassion|once/.test(s)) return 'sometimes';
  if (/often|regular|kids|daily|weekly|always|frequent|^y/.test(s)) return 'yes';
  return 'no';
}

export function detectMapping(headers) {
  const find = (...res) => {
    for (const re of res) {
      const i = headers.findIndex((h) => re.test(String(h).toLowerCase()));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    name: find(/^(player\s*)?name$/, /full\s*name/, /name/),
    photo: find(/photo/, /image/, /picture/, /pic\b/, /selfie/),
    level: find(/how often/, /regular/, /play.*(regular|often|frequen)/, /often/, /frequen/, /level/, /experience/),
    basePrice: find(/base\s*price/, /base/),
    category: find(/categor/, /gender/, /group/),
  };
}
