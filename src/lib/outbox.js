// The phone's outbox: interviews that have not reached the server yet.
//
// Every finished interview is written here FIRST, and removed only after the server confirms it. So closing the app,
// losing signal or a crash mid-send can never lose an interview. Stored in IndexedDB (hundreds of MB available on
// phones) rather than localStorage (about 5 MB, and writes there fail silently when full). If IndexedDB is not
// available, localStorage is used, and any failure to save is reported to the caller so the surveyor is told.

const DB_NAME = 'msr-pulse';
const STORE = 'outbox';
const MEDIA = 'media'; // recordings and photos waiting to upload: { key: '<interview id>:<audio|photo>', id, kind, blob, type }
const LEGACY_KEY = 'msr-pulse-outbox'; // older app versions kept the outbox here

let dbPromise = null;
function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 2); } catch { resolve(null); return; }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
        if (!req.result.objectStoreNames.contains(MEDIA)) req.result.createObjectStore(MEDIA, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

const tx = (db, mode, fn, store = STORE) => new Promise((resolve, reject) => {
  const t = db.transaction(store, mode);
  const out = fn(t.objectStore(store));
  t.oncomplete = () => resolve(out?.result ?? out);
  t.onerror = () => reject(t.error || new Error('Phone storage error'));
  t.onabort = () => reject(t.error || new Error('Phone storage is full'));
});

const readLegacy = () => { try { const v = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLegacy = (list) => { localStorage.setItem(LEGACY_KEY, JSON.stringify(list)); }; // throws when full: callers report it

// All waiting interviews, oldest first. Moves anything left in the old localStorage outbox into IndexedDB.
export async function outboxAll() {
  const db = await openDb();
  if (!db) return readLegacy();
  const legacy = readLegacy();
  if (legacy.length) {
    await tx(db, 'readwrite', (s) => legacy.forEach((r) => s.put(r)));
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
  }
  const all = await tx(db, 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
}

// Saves interviews on the phone. Throws if they could not be saved.
export async function outboxPut(recs) {
  if (!recs.length) return;
  const db = await openDb();
  if (!db) {
    const list = readLegacy().filter((x) => !recs.some((r) => r.id === x.id));
    writeLegacy([...list, ...recs]);
    return;
  }
  await tx(db, 'readwrite', (s) => recs.forEach((r) => s.put(r)));
}

// Removes interviews the server has confirmed.
export async function outboxDelete(ids) {
  if (!ids.length) return;
  const db = await openDb();
  if (!db) { try { writeLegacy(readLegacy().filter((x) => !ids.includes(x.id))); } catch { /* still listed; resending is harmless */ } return; }
  await tx(db, 'readwrite', (s) => ids.forEach((id) => s.delete(id)));
}

// Asks the browser not to clear this app's storage when the phone is low on space (best effort).
export function askPersistentStorage() {
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* not supported */ }
}

// Interview ids must be unique across all phones: the server ignores a second interview with the same id.
export function newInterviewId(surveyorId) {
  const rand = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 10);
  return `INT-${String(surveyorId || 'X').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)}-${Date.now().toString(36)}-${rand}`.toUpperCase();
}

// ---------- Recordings and photos waiting to upload (kept on the phone until the server has them) ----------
// Without IndexedDB they are kept in memory only (lost if the app is closed before they upload).
const memMedia = new Map();
export async function mediaPut(id, kind, blob, type) {
  const rec = { key: `${id}:${kind}`, id, kind, blob, type: type || blob.type, at: Date.now() };
  const db = await openDb();
  if (!db) { memMedia.set(rec.key, rec); return; }
  await tx(db, 'readwrite', (st) => st.put(rec), MEDIA);
}
export async function mediaAll() {
  const db = await openDb();
  if (!db) return [...memMedia.values()];
  return (await tx(db, 'readonly', (st) => st.getAll(), MEDIA)) || [];
}
export async function mediaDelete(key) {
  memMedia.delete(key);
  const db = await openDb();
  if (db) await tx(db, 'readwrite', (st) => st.delete(key), MEDIA);
}
