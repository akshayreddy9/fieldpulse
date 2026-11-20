import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE_QUESTIONNAIRE } from './data/questionnaire.js';
import { generateInterviews, generateSurveyors, simulateInterview } from './data/generate.js';
import { assessAll, autoStatus } from './lib/quality.js';
import { BOOTH_BY_ID } from './data/geo.js';
import { api, detectServer, getToken, setToken, API_BASE, getStageKey } from './lib/api.js';

const KEY = 'msr-pulse-demo-v1';
// Interviews waiting to sync are always kept on the device, so closing the app offline never loses them.
const OUTBOX_KEY = 'msr-pulse-outbox';
// Last server session, so the field app can start with no signal.
const CACHE_KEY = 'msr-pulse-offline-cache';
const SURVEY_SEL_KEY = 'msr-pulse-survey';
// Settings that belong to one survey (the rest are shared by all surveys)
const SURVEY_SYNC = ['questionnaire', 'draftQuestionnaire', 'publishedVersion', 'targets', 'statuses', 'notes', 'report', 'reportStatus', 'reportHistory'];
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeJson = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const ROLES = {
  admin: { label: 'MSR Admin', who: 'Akhila Rao', desc: 'Full control: questionnaires, teams, quality, reports' },
  supervisor: { label: 'Field Supervisor', who: 'Narsimha Goud', desc: 'Live monitoring, alerts and back-checks' },
  analyst: { label: 'MSR Analyst', who: 'Sneha Varma', desc: 'Results, comparisons and client reports' },
  surveyor: { label: 'Surveyor', who: 'Ravi Kumar', desc: 'Pulse Field app only' },
  client: { label: 'Client', who: 'Deccan Policy Foundation', desc: 'Sees only their own approved results' },
};

export const MODULES = [
  ['overview', 'Overview'], ['admin.builder', 'Questionnaire builder'], ['admin.targets', 'Booth targets'], ['admin.team', 'Surveyors & team'],
  ['admin.access', 'Access control'], ['field', 'Pulse Field app'], ['live.map', 'Live map & progress'], ['live.alerts', 'Fake-interview alerts'],
  ['live.digest', 'Evening digest'], ['insights.results', 'Results'], ['insights.rollup', 'Roll-up totals'], ['insights.compare', 'Compare & trends'],
  ['insights.ask', 'Ask the data'], ['insights.reports', 'Report studio'], ['addons.privacy', 'Privacy lock'], ['addons.checker', 'AI interview checker'],
  ['addons.import', 'GoSurvey import'], ['addons.api', 'API & integrations'], ['settings.compliance', 'Security & DPDP'], ['settings.delivery', 'Delivery & support'],
  ['client.portal', 'Client portal'], ['pii.reveal', 'Reveal personal details (with reason)'],
];

const ALL = Object.fromEntries(MODULES.map(([k]) => [k, true]));
const only = (keys) => Object.fromEntries(MODULES.map(([k]) => [k, keys.includes(k)]));

export const DEFAULT_PERMISSIONS = {
  admin: { ...ALL, 'client.portal': true },
  supervisor: only(['overview', 'field', 'live.map', 'live.alerts', 'live.digest', 'admin.targets', 'admin.team', 'insights.results', 'insights.rollup', 'addons.checker']),
  analyst: only(['overview', 'admin.builder', 'live.map', 'insights.results', 'insights.rollup', 'insights.compare', 'insights.ask', 'insights.reports', 'addons.import', 'client.portal']),
  surveyor: only(['field']),
  client: only(['client.portal']),
};

function initial() {
  return {
    user: null,
    surveys: [],
    surveyId: 'TSP-R3',
    lang: 'en',
    questionnaire: SAMPLE_QUESTIONNAIRE,
    publishedVersion: SAMPLE_QUESTIONNAIRE.version,
    surveyors: null,
    targets: {},
    extraInterviews: [],
    statuses: {},
    notes: {},
    report: null,
    reportStatus: 'Not started',
    reportHistory: [],
    accessLog: [],
    audit: [
      { t: Date.now() - 86400000 * 5, who: 'Akhila Rao', what: 'Published questionnaire TSP-R3 v7' },
      { t: Date.now() - 86400000 * 5 + 600000, who: 'Akhila Rao', what: 'Uploaded 78 team members from Excel' },
    ],
    privacyLock: true,
    round1Imported: false,
    apiKeys: [{ id: 'key_live_7Hq2', name: 'Client dashboard (DPF)', scopes: ['results:read'], created: '2026-11-02', lastUsed: '2026-11-18 16:42', status: 'Active' }],
    webhooks: [{ id: 'wh_1', url: 'https://hooks.example.org/msr/pulse', events: ['report.approved'], status: 'Active' }],
    peakMonths: ['2026-11', '2026-12', '2027-03'],
    permissions: DEFAULT_PERMISSIONS,
    liveSim: false,
    outbox: [],
    deviceOnline: true,
    retentionDays: 180,
  };
}

function load() {
  let st;
  try {
    const raw = localStorage.getItem(KEY);
    st = raw ? { ...initial(), ...JSON.parse(raw) } : initial();
  } catch {
    st = initial();
  }
  st.lang = 'en'; // screens are English; questions and answers show Telugu + English together
  const box = readJson(OUTBOX_KEY);
  if (Array.isArray(box)) st.outbox = box;
  // Direct demo links: ?as=admin | supervisor | analyst | surveyor | client
  try {
    const as = new URLSearchParams(window.location.search).get('as');
    if (as && ROLES[as]) st = { ...st, user: { role: as, name: ROLES[as].who, ...(as === 'surveyor' ? { surveyorId: 'SV-001' } : {}) } };
  } catch { /* ignore */ }
  return st;
}

const Ctx = createContext(null);

// Shared settings that are saved on the server (each change is checked against the user's role there).
const SYNC_KEYS = ['questionnaire', 'draftQuestionnaire', 'publishedVersion', 'targets', 'surveyors', 'permissions', 'statuses', 'notes', 'report', 'reportStatus',
  'reportHistory', 'privacyLock', 'webhooks', 'peakMonths', 'retentionDays'];

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [toasts, setToasts] = useState([]);
  const [server, setServer] = useState(null); // health info when an MSR Pulse server is reachable
  const [booting, setBooting] = useState(true);
  const [remote, setRemote] = useState({ r3: [], r2: [], r1: [] });
  const synced = useRef({});
  const seedRef = useRef(Date.now() % 1000000);
  const serverMode = !!server;

  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // ---------- server connection ----------
  const surveyRef = useRef(null);
  // Loads everything for one survey (the saved one, or the first the user may see)
  const loadAll = useCallback(async (want) => {
    const surveys = await api('GET', '/api/surveys');
    const saved = want || readJson(SURVEY_SEL_KEY);
    const sid = (surveys.find((x) => x.id === saved) || surveys.find((x) => x.status === 'Live') || surveys[0] || {}).id || null;
    const q = sid ? `survey=${encodeURIComponent(sid)}` : '';
    const st = await api('GET', `/api/state?${q}`);
    const [r3, r2, r1] = sid ? await Promise.all([
      api('GET', `/api/interviews?round=3&${q}`),
      api('GET', `/api/interviews?round=2&${q}`),
      st.round1Imported ? api('GET', `/api/interviews?round=1&${q}`) : Promise.resolve([]),
    ]) : [[], [], []];
    surveyRef.current = sid;
    writeJson(SURVEY_SEL_KEY, sid);
    synced.current = {};
    SYNC_KEYS.forEach((k) => { if (k in st) synced.current[k] = st[k]; });
    setState((s) => ({ ...s, ...st, surveys, surveyId: sid, extraInterviews: [] }));
    setRemote({ r3, r2, r1 });
    const keep = ['questionnaire', 'publishedVersion', 'targets', 'surveyors', 'permissions', 'privacyLock'];
    writeJson(CACHE_KEY, { ...(readJson(CACHE_KEY) || {}), state: { ...Object.fromEntries(keep.filter((k) => k in st).map((k) => [k, st[k]])), surveyId: sid, surveys }, r3: r3.length <= 500 ? r3 : [], at: Date.now() });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let h = await detectServer();
      if (!h && API_BASE) h = await detectServer(15000); // second, longer try for slow mobile networks
      if (!alive) return;
      const cache = readJson(CACHE_KEY);
      if (!h && API_BASE && !(getToken() && cache?.user && cache?.state)) {
        // Set up for a server but cannot reach it: wait for it (keeps retrying) instead of switching to the demo
        setServer({ mode: 'server', offline: true, unreachable: true, ai: false, demo: false });
      }
      if (!h && getToken() && cache?.user && cache?.state) {
        // No signal: start from the last session on this phone; interviews go to the outbox until the server is reachable.
        setServer({ mode: 'server', offline: true, ai: false, demo: false });
        SYNC_KEYS.forEach((k) => { if (k in cache.state) synced.current[k] = cache.state[k]; });
        surveyRef.current = cache.state.surveyId || null;
        setState((s) => ({ ...s, ...cache.state, user: cache.user, deviceOnline: false }));
        setRemote({ r3: cache.r3 || [], r2: [], r1: [] });
      }
      if (h) {
        setServer(h);
        setState((s) => ({ ...s, user: null }));
        if (getToken()) {
          try {
            const { user } = await api('GET', '/api/me');
            await loadAll();
            setState((s) => ({ ...s, user }));
          } catch { setToken(null); }
        }
      }
      if (alive) setBooting(false);
    })();
    return () => { alive = false; };
  }, [loadAll]);

  // Live updates from the server (other users' changes, new interviews from the field)
  useEffect(() => {
    if (!serverMode || !state.user || !getToken()) return undefined;
    const es = new EventSource(`${API_BASE}/api/live?token=${encodeURIComponent(getToken())}${getStageKey() ? `&stage=${encodeURIComponent(getStageKey())}` : ''}`);
    es.addEventListener('interview', (e) => {
      const rec = JSON.parse(e.data);
      if ((rec.surveyId || 'TSP-R3') !== surveyRef.current) return; // another survey
      setRemote((r) => (r.r3.some((i) => i.id === rec.id) ? { ...r, r3: r.r3.map((i) => (i.id === rec.id ? rec : i)) } : { ...r, r3: [...r.r3, rec] }));
    });
    es.addEventListener('state', (e) => {
      const { key, value, survey } = JSON.parse(e.data);
      if (survey && survey !== surveyRef.current) return; // another survey
      synced.current[key] = value;
      setState((s) => ({ ...s, [key]: value }));
      if (key === 'privacyLock') loadAll();
    });
    es.addEventListener('audit', (e) => { const a = JSON.parse(e.data); setState((s) => ({ ...s, audit: [a, ...s.audit].slice(0, 300) })); });
    es.addEventListener('access', (e) => { const a = JSON.parse(e.data); setState((s) => ({ ...s, accessLog: [a, ...s.accessLog.filter((x) => x.t !== a.t)].slice(0, 500) })); });
    es.addEventListener('surveys', () => { api('GET', '/api/surveys').then((surveys) => setState((s) => ({ ...s, surveys }))).catch(() => {}); });
    es.addEventListener('reset', () => { loadAll(); toast('Data was reset by an admin', 'info'); });
    return () => es.close();
  }, [serverMode, state.user, loadAll, toast]);

  // Push local changes of shared settings to the server
  useEffect(() => {
    if (!serverMode || !state.user) return;
    SYNC_KEYS.forEach((k) => {
      // Only settings this user received from the server (i.e. may read) are pushed back; the server checks write rights.
      if (!(k in synced.current) || state[k] === synced.current[k] || state[k] === undefined) return;
      synced.current[k] = state[k];
      const q = SURVEY_SYNC.includes(k) && surveyRef.current ? `?survey=${encodeURIComponent(surveyRef.current)}` : '';
      api('PUT', `/api/state/${k}${q}`, { value: state[k] }).then(() => { if (k === 'privacyLock') loadAll(); }).catch((e) => toast(e.message, 'error'));
    });
  }, [serverMode, state, toast, loadAll]);

  // Always keep the outbox and (in server mode) the signed-in user on the device
  useEffect(() => { writeJson(OUTBOX_KEY, state.outbox || []); }, [state.outbox]);
  useEffect(() => {
    if (serverMode && state.user && !server?.offline) writeJson(CACHE_KEY, { ...(readJson(CACHE_KEY) || {}), user: state.user });
  }, [serverMode, state.user, server]);

  // Started offline: keep checking for the server; when it is back, reload and send waiting interviews.
  useEffect(() => {
    if (!server?.offline) return undefined;
    let stop = false;
    const tryNow = async () => {
      const h = await detectServer();
      if (!h || stop) return;
      stop = true;
      try { await loadAll(); } catch { /* keep cached data */ }
      setServer(h);
      setState((s) => ({ ...s, deviceOnline: true }));
      toast('Back online. Connected to MSR Pulse.', 'success');
    };
    window.addEventListener('online', tryNow);
    const id = setInterval(tryNow, 15000);
    return () => { stop = true; window.removeEventListener('online', tryNow); clearInterval(id); };
  }, [server, loadAll, toast]);

  // Standalone mode keeps its data in this browser
  useEffect(() => {
    if (serverMode || booting) return undefined;
    const id = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked: still works */ }
    }, 300);
    return () => clearTimeout(id);
  }, [state, serverMode, booting]);

  // ---------- data ----------
  const surveyors = useMemo(() => state.surveyors || generateSurveyors(), [state.surveyors]);
  const seeded = useMemo(() => (serverMode || booting ? [] : generateInterviews(3, generateSurveyors())), [serverMode, booting]);
  const localR2 = useMemo(() => (serverMode || booting ? [] : generateInterviews(2, generateSurveyors())), [serverMode, booting]);
  const round2 = serverMode ? remote.r2 : localR2;
  const localR1 = useMemo(() => (!serverMode && state.round1Imported ? generateInterviews(1, generateSurveyors()) : []), [serverMode, state.round1Imported]);
  const round1 = serverMode ? remote.r1 : localR1;
  const interviews = useMemo(() => (serverMode
    ? [...remote.r3, ...state.extraInterviews.filter((x) => !remote.r3.some((i) => i.id === x.id))]
    : [...seeded, ...state.extraInterviews]), [serverMode, remote.r3, seeded, state.extraInterviews]);
  const quality = useMemo(() => assessAll(interviews), [interviews]);
  const statusOf = useCallback((id) => state.statuses[id] || autoStatus(quality[id]), [state.statuses, quality]);
  const valid = useMemo(() => interviews.filter((i) => statusOf(i.id) !== 'Rejected'), [interviews, statusOf]);

  const update = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);

  const log = useCallback((what) => {
    if (serverMode) { api('POST', '/api/audit', { what }).catch(() => {}); return; }
    setState((s) => ({ ...s, audit: [{ t: Date.now(), who: s.user ? s.user.name : 'System', what }, ...s.audit].slice(0, 300) }));
  }, [serverMode]);

  // Send interviews to the server; if that fails (no signal), keep them in the phone's outbox.
  const pushInterviews = useCallback(async (recs) => {
    setState((s) => ({ ...s, extraInterviews: [...s.extraInterviews, ...recs] }));
    if (!serverMode) return true;
    try {
      await api('POST', '/api/interviews', { interviews: recs });
      return true;
    } catch (e) {
      setState((s) => ({ ...s, extraInterviews: s.extraInterviews.filter((x) => !recs.some((r) => r.id === x.id)), outbox: [...s.outbox, ...recs] }));
      if (e.status === 0) toast('No connection. Interview saved on this phone and will sync later.', 'info');
      else toast(e.message, 'error');
      return false;
    }
  }, [serverMode, toast]);
  const addInterview = useCallback((rec) => pushInterviews([{ ...rec, surveyId: rec.surveyId || surveyRef.current || 'TSP-R3' }]), [pushInterviews]);

  const outboxRef = useRef(state.outbox);
  outboxRef.current = state.outbox;
  const syncOutbox = useCallback(async () => {
    const box = outboxRef.current || [];
    if (!box.length) return 0;
    setState((s) => ({ ...s, outbox: s.outbox.filter((x) => !box.some((b) => b.id === x.id)) }));
    const ok = await pushInterviews(box.map((r) => ({ ...r, syncedAt: Date.now() })));
    if (ok) toast(`${box.length} saved interview${box.length > 1 ? 's' : ''} synced`, 'success');
    return box.length;
  }, [pushInterviews, toast]);

  // Live feed simulation: new interviews arrive every few seconds while switched on
  useEffect(() => {
    if (!state.liveSim) return undefined;
    const id = setInterval(() => {
      seedRef.current += 1;
      const rec = simulateInterview(seedRef.current * 7919, surveyors);
      addInterview(rec);
      toast(`New interview synced · ${BOOTH_BY_ID[rec.boothId].short}, ${rec.surveyorId}`, 'live');
    }, 4500);
    return () => clearInterval(id);
  }, [state.liveSim, surveyors, addInterview, toast]);

  const can = useCallback((mod) => !!(state.user && state.permissions[state.user.role]?.[mod]), [state.user, state.permissions]);

  // ---------- auth ----------
  const requestCode = useCallback((phone) => api('POST', '/api/auth/otp', { phone }), []);
  const verifyCode = useCallback(async (phone, code) => {
    const r = await api('POST', '/api/auth/verify', { phone, code });
    setToken(r.token);
    await loadAll();
    setState((s) => ({ ...s, user: r.user }));
    return r.user;
  }, [loadAll]);
  const logout = useCallback(() => {
    if (serverMode) { setToken(null); writeJson(CACHE_KEY, null); }
    setState((s) => ({ ...s, user: null, liveSim: false }));
  }, [serverMode]);

  const revealPii = useCallback(async (interviewId, kind, reason, localValue) => {
    if (!serverMode) {
      setState((s) => ({ ...s, accessLog: [{ t: Date.now(), who: s.user?.name || 'Unknown', role: s.user?.role, field: kind === 'phone' ? 'Mobile number' : 'Respondent name', interviewId, reason }, ...s.accessLog].slice(0, 500) }));
      return localValue;
    }
    const r = await api('POST', '/api/pii/reveal', { interviewId, field: kind, reason });
    setState((s) => ({ ...s, accessLog: [r.entry, ...s.accessLog.filter((x) => x.t !== r.entry.t)].slice(0, 500) }));
    return r.value;
  }, [serverMode]);

  const setRound1 = useCallback(async (on) => {
    if (serverMode) {
      await api('POST', '/api/admin/import-round1', { on, surveyId: surveyRef.current });
      const r1 = on ? await api('GET', `/api/interviews?round=1&survey=${encodeURIComponent(surveyRef.current)}`) : [];
      setRemote((r) => ({ ...r, r1 }));
    }
    setState((s) => ({ ...s, round1Imported: on }));
  }, [serverMode]);

  const createApiKey = useCallback(async (name, scopes) => {
    if (!serverMode) {
      const secret = `msrp_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
      const key = { id: `key_live_${secret.slice(-4)}`, name: name || 'Untitled', scopes, created: new Date().toISOString().slice(0, 10), lastUsed: '—', status: 'Active' };
      setState((s) => ({ ...s, apiKeys: [...s.apiKeys, key] }));
      return secret;
    }
    const r = await api('POST', '/api/keys', { name, scopes });
    setState((s) => ({ ...s, apiKeys: [...s.apiKeys, r.key] }));
    return r.secret;
  }, [serverMode]);
  const revokeApiKey = useCallback(async (id) => {
    if (serverMode) await api('POST', `/api/keys/${id}/revoke`);
    setState((s) => ({ ...s, apiKeys: s.apiKeys.map((x) => (x.id === id ? { ...x, status: 'Revoked' } : x)) }));
  }, [serverMode]);

  const aiReportDraft = useCallback(async () => (serverMode ? api('POST', '/api/ai/report-draft', { surveyId: surveyRef.current }) : null), [serverMode]);
  const aiAsk = useCallback(async (text) => (serverMode && server?.ai ? api('POST', '/api/ai/ask', { text, surveyId: surveyRef.current }) : null), [serverMode, server]);

  // ---------- surveys ----------
  const selectSurvey = useCallback(async (id) => { setState((s) => ({ ...s, liveSim: false })); await loadAll(id); }, [loadAll]);
  const createSurvey = useCallback(async (body) => { const sv = await api('POST', '/api/surveys', body); await loadAll(sv.id); return sv; }, [loadAll]);
  const updateSurvey = useCallback(async (id, patch) => {
    const sv = await api('PUT', `/api/surveys/${id}`, patch);
    if (id === surveyRef.current) await loadAll(id);
    else setState((s) => ({ ...s, surveys: s.surveys.map((x) => (x.id === id ? sv : x)) }));
    return sv;
  }, [loadAll]);

  const reset = useCallback(async () => {
    if (serverMode) {
      try { await api('POST', '/api/admin/reset'); await loadAll(); toast('Server data reset', 'success'); } catch (e) { toast(e.message, 'error'); }
      return;
    }
    localStorage.removeItem(KEY);
    setState((s) => ({ ...initial(), user: s.user }));
    toast('Demo data reset', 'success');
  }, [serverMode, loadAll, toast]);

  const value = {
    ...state, update, toast, toasts, log, can, server, serverMode, booting,
    surveyors, interviews, valid, quality, statusOf, round2, round1, addInterview, syncOutbox,
    requestCode, verifyCode, logout, revealPii, setRound1, selectSurvey, createSurvey, updateSurvey, createApiKey, revokeApiKey, aiReportDraft, aiAsk, reset, reload: loadAll,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  return useContext(Ctx);
}
