// Talks to the MSR Pulse server. If no server is reachable the app runs in standalone (browser-only) mode.
const TOKEN_KEY = 'msr-pulse-token';
// Empty = same server that serves the app. Native iPhone/Android builds set VITE_API_BASE to the server address.
// A server address saved on the phone (Android/iPhone app) takes priority.
const SERVER_KEY = 'msr-pulse-server';
const saved = (() => { try { return localStorage.getItem(SERVER_KEY) || ''; } catch { return ''; } })();
export const API_BASE = (saved || (import.meta.env && import.meta.env.VITE_API_BASE) || '').replace(/\/+$/, '');

// Test-site password (only for private test sites); browsers use a cookie instead, the phone app sends this header.
const STAGE_KEY = 'msr-pulse-stage-key';
export const getStageKey = () => { try { return localStorage.getItem(STAGE_KEY) || ''; } catch { return ''; } };
const stageHeader = () => { const k = getStageKey(); return k ? { 'X-Stage-Key': k } : {}; };

// Check an address and remember it on this device. Returns the health info or throws.
// If the server is a private test site, pass its password as stageKey.
export async function connectServer(url, stageKey) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(base)) throw new Error('Enter the full address, e.g. http://192.168.1.3:8787');
  let h;
  try { const r = await fetch(`${base}/api/health`); h = await r.json(); } catch { throw new Error('Could not reach that address. Check the Wi-Fi and the address.'); }
  if (h?.mode !== 'server') throw new Error('That address is not an MSR Pulse server.');
  if (h.stage) {
    if (!stageKey) { const e = new Error('This is a private test site. Enter its password.'); e.needStage = true; throw e; }
    const r = await fetch(`${base}/api/me`, { headers: { 'X-Stage-Key': stageKey } });
    const body = await r.json().catch(() => ({}));
    if (r.status === 401 && body.stage) { const e = new Error('That test-site password is not right.'); e.needStage = true; throw e; }
    localStorage.setItem(STAGE_KEY, stageKey);
  }
  localStorage.setItem(SERVER_KEY, base);
  return h;
}
export function forgetServer() { try { localStorage.removeItem(SERVER_KEY); } catch { /* ignore */ } }

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      cache: 'no-store', // always ask the server: never show an old copy (e.g. of the survey list)
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...stageHeader() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No connection to the MSR Pulse server');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Server error ${res.status}`);
  return data;
}

// Mobile networks can be slow, so wait up to 8 seconds (a phone far from the server may need it).
export async function detectServer(timeoutMs = 8000) {
  try {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctl.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    const h = await res.json();
    return h?.mode === 'server' ? h : null;
  } catch {
    return null;
  }
}
