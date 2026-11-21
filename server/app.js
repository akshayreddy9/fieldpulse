// MSR Pulse API. All access rules are enforced here, not only in the browser.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, getKv, setKv, listInterviews, insertInterviews, seed, normalisePhone, FIRST_SURVEY, SURVEY_KEYS, getS, setS, SURVEY_DEFAULTS, getSurvey, listSurveys } from './db.js';
import { requestOtp, verifyOtp, verifyToken, hashKey, demoMode } from './auth.js';
import { STATE_RULES, READABLE } from './permissions.js';
import { aiEnabled, aiReportDraft, aiParseQuestion } from './ai.js';
import { assessAll, autoStatus } from '../src/lib/quality.js';
import { codeFor } from '../src/lib/privacy.js';
import { generateInterviews } from '../src/data/generate.js';
import { generateReport } from '../src/lib/reportGen.js';
import { frequency, crosstab, applyFilters } from '../src/lib/analytics.js';
import { BOOTH_BY_ID, setGeo, validateGeo } from '../src/data/geo.js';
import { findQuestion, SAMPLE_QUESTIONNAIRE } from '../src/data/questionnaire.js';
import { piiQuestions, piiKind, R } from '../src/lib/roles.js';
import { mainQuestionId } from '../src/lib/reportGen.js';
import { onTeam, boothsFor } from '../src/lib/team.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const APK = path.join(here, '..', 'MSR-Pulse.apk');
const MAX_BATCH = 500;

// A new survey can start from this: location + consent first, an empty page to fill, and the verification page (date, GPS, photo) last.
function blankQuestionnaire() {
  const g1 = JSON.parse(JSON.stringify(SAMPLE_QUESTIONNAIRE.groups[0]));
  const last = JSON.parse(JSON.stringify(SAMPLE_QUESTIONNAIRE.groups[SAMPLE_QUESTIONNAIRE.groups.length - 1]));
  last.id = 'g3';
  return { ...SAMPLE_QUESTIONNAIRE, groups: [g1, { id: 'g2', title: { en: 'Questions', te: 'ప్రశ్నలు' }, questions: [] }, last] };
}

export function createApp({ dbFile = process.env.DB_FILE || path.join(here, '..', 'data', 'msr-pulse.db') } = {}) {
  const db = openDb(dbFile);
  // Booth list: the uploaded one (kv "geo"), else the sample list on test sites; production starts empty
  setGeo(getKv(db, 'geo'));
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Other sites only learn the site name, never the page (OpenStreetMap blocks map tiles requested without it)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // API answers must never come from a phone's cache (e.g. an old survey list after a survey was changed)
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // The native iPhone/Android apps (Capacitor) call the API from their own origin.
  const allowed = new Set((process.env.CORS_ORIGINS || 'capacitor://localhost,https://localhost,ionic://localhost').split(',').map((x) => x.trim()));
  app.use((req, res, next) => {
    const o = req.headers.origin;
    if (o && allowed.has(o)) {
      res.setHeader('Access-Control-Allow-Origin', o);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Stage-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    return next();
  });

  // ---------- Test-site password (set STAGING_PASSWORD) ----------
  // Keeps a test site on the internet private: only people with the password can open it.
  const STAGE = process.env.STAGING_PASSWORD || '';
  const stageToken = STAGE ? crypto.createHmac('sha256', getKv(db, 'jwtSecret')).update(`stage:${STAGE}`).digest('hex') : '';
  const sameText = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const stageOk = (req) => {
    if (!STAGE) return true;
    const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('msr_stage='));
    if (cookie && sameText(cookie.slice(10), stageToken)) return true;
    const key = req.headers['x-stage-key'] || req.query.stage;
    return !!key && sameText(key, STAGE);
  };
  if (STAGE) {
    app.use(express.urlencoded({ extended: false }));
    app.post('/__stage', (req, res) => {
      if (!sameText(req.body?.password || '', STAGE)) return res.redirect(303, '/?wrong=1');
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.setHeader('Set-Cookie', `msr_stage=${stageToken}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
      return res.redirect(303, '/');
    });
    app.use((req, res, next) => {
      // Open: health check (so apps can find the server) and the API for other software (has its own keys)
      if (req.path === '/api/health' || req.path.startsWith('/api/v1/') || req.method === 'OPTIONS') return next();
      if (stageOk(req)) return next();
      if (req.path.startsWith('/api/') || req.path.startsWith('/download/')) return res.status(401).json({ error: 'Test-site password required', stage: true });
      res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MSR Pulse · Test site</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:linear-gradient(135deg,#0f2342,#0d9488);color:#0f172a}
.box{background:#fff;border-radius:18px;padding:28px;width:min(360px,calc(100vw - 32px));box-shadow:0 20px 60px rgba(0,0,0,.25)}h1{font-size:20px;margin:0 0 4px}p{color:#64748b;margin:0 0 18px;font-size:14px}
input{width:100%;box-sizing:border-box;height:46px;border:1px solid #e3e8f0;border-radius:10px;padding:0 12px;font-size:16px}button{margin-top:12px;width:100%;height:46px;border:0;border-radius:10px;background:#0d9488;color:#fff;font-weight:700;font-size:15px}
.err{color:#e11d48;font-size:13px;margin-top:8px}</style></head><body><form class="box" method="post" action="/__stage">
<h1>MSR Pulse · Test site</h1><p>This is a private test site. Enter the password you were given.</p>
<input type="password" name="password" placeholder="Test-site password" autofocus autocomplete="current-password">
${req.query.wrong ? '<div class="err">That password is not right.</div>' : ''}<button type="submit">Open</button></form></body></html>`);
    });
  }

  // ---------- caches ----------
  const qualityCache = new Map();
  const round3 = (sid) => listInterviews(db, 3, sid);
  // Each survey is checked with its own questionnaire (its duplicate-answer and grid questions)
  const qnOf = (sid) => getS(db, sid, 'questionnaire') || SAMPLE_QUESTIONNAIRE;
  const quality = (sid) => { if (!qualityCache.has(sid)) qualityCache.set(sid, assessAll(round3(sid), qnOf(sid))); return qualityCache.get(sid); };
  const invalidate = (sid) => { if (sid) qualityCache.delete(sid); else qualityCache.clear(); piiCache.clear(); };
  // Personal-detail questions per survey: those marked private, plus the name/mobile roles, plus the starter ids
  const piiCache = new Map();
  const piiOf = (sid) => {
    if (!piiCache.has(sid)) {
      const qn = qnOf(sid);
      const ids = new Set([...piiQuestions(qn), 'q_name', 'q_phone']);
      piiCache.set(sid, { ids: [...ids], kind: (id) => piiKind(qn, id), photos: (qn.groups || []).flatMap((g) => g.questions).filter((q) => q.type === 'photo').map((q) => q.id).concat('q_photo') });
    }
    return piiCache.get(sid);
  };

  // ---------- helpers ----------
  const perms = () => getKv(db, 'permissions');
  const can = (user, mod) => !!perms()[user.role]?.[mod];
  const audit = (who, what) => {
    const t = Date.now();
    db.prepare('INSERT INTO audit (t, who, what) VALUES (?,?,?)').run(t, who, what);
    broadcast('audit', { t, who, what }, (u) => u.role === 'admin' || u.role === 'supervisor');
  };
  const auth = (req, res, next) => {
    const h = req.headers.authorization || '';
    const user = verifyToken(db, h.startsWith('Bearer ') ? h.slice(7) : req.query.token);
    if (!user) return res.status(401).json({ error: 'Please sign in again' });
    req.user = user;
    return next();
  };
  const need = (mod) => (req, res, next) => (can(req.user, mod) ? next() : res.status(403).json({ error: 'Your role does not allow this' }));

  // Personal details leave the server only as codes, unless the privacy lock is off and the role may see them.
  const present = (i, user) => {
    const mask = getKv(db, 'privacyLock') || user.role === 'client' || user.role === 'surveyor' && i.surveyorId !== user.surveyorId;
    if (!mask) return i;
    const a = { ...i.answers };
    const p = piiOf(i.surveyId || FIRST_SURVEY);
    p.ids.forEach((id) => { if (a[id] !== undefined && a[id] !== '') a[id] = codeFor(a[id], p.kind(id)); });
    p.photos.forEach((id) => { if (typeof a[id] === 'string') a[id] = true; });
    return { ...i, answers: a, piiMasked: true };
  };
  const visible = (i, user) => user.role !== 'surveyor' || i.surveyorId === user.surveyorId;

  // Who may see which survey: MSR staff see all; clients only their own; surveyors only live surveys.
  const STAFF = ['admin', 'supervisor', 'analyst'];
// Surveyors see only Live surveys whose team they are on (no team set = everyone)
  const canSeeSurvey = (user, sv) => !!sv && (STAFF.includes(user.role) || (user.role === 'client' && sv.client_phone === user.phone)
    || (user.role === 'surveyor' && sv.status === 'Live' && onTeam(getS(db, sv.id, 'team'), user.surveyorId)));
  const surveyView = (sv, user) => {
    const team = getS(db, sv.id, 'team');
    const out = { id: sv.id, title: sv.title, clientName: sv.client_name, clientPhone: sv.client_phone, status: sv.status, created: sv.created,
      interviews: db.prepare('SELECT COUNT(*) n FROM interviews WHERE survey_id = ? AND round = 3').get(sv.id).n,
      teamSize: team?.members ? Object.keys(team.members).length : null };
    if (user?.role === 'surveyor') {
      // The surveyor's own booths and interview count in this survey, for their phone's survey list
      const me = (getKv(db, 'surveyors') || []).find((x) => x.id === user.surveyorId);
      out.myBooths = boothsFor(me, team);
      out.myInterviews = db.prepare('SELECT COUNT(*) n FROM interviews WHERE survey_id = ? AND round = 3 AND surveyor_id = ?').get(sv.id, user.surveyorId || '').n;
    }
    return out;
  };
  // Resolves ?survey= (or the first survey the user may see). Sends 403/404 and returns null when not allowed.
  const pickSurvey = (req, res, required = true) => {
    const want = req.query.survey || req.body?.surveyId;
    if (want) {
      const sv = getSurvey(db, want);
      if (!sv) { res.status(404).json({ error: 'Survey not found' }); return null; }
      if (!canSeeSurvey(req.user, sv)) { res.status(403).json({ error: 'You do not have access to this survey' }); return null; }
      return sv;
    }
    const all = listSurveys(db).filter((x) => canSeeSurvey(req.user, x));
    const sv = all.find((x) => x.status === 'Live') || all[0] || null;
    if (!sv && required) { res.status(404).json({ error: 'No survey available' }); return null; }
    return sv;
  };

  // ---------- live updates (Server-Sent Events) ----------
  const clients = new Set();
  function broadcast(event, data, filter = () => true) {
    clients.forEach((c) => {
      if (!filter(c.user)) return;
      const payload = typeof data === 'function' ? data(c.user) : data;
      if (payload === undefined) return;
      c.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    });
  }
  setInterval(() => clients.forEach((c) => c.res.write(': ping\n\n')), 25000).unref();

  // ---------- public ----------
  // Build stamp of the Android app this server offers (so older apps can tell users to update)
  const apkBuild = () => { try { return JSON.parse(fs.readFileSync(`${APK}.json`, 'utf8')).build || null; } catch { return null; } };
  app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'server', ai: aiEnabled(), demo: demoMode(), apk: fs.existsSync(APK), apkBuild: apkBuild(), stage: !!STAGE, sample: getKv(db, 'installMode') !== 'production', interviews: db.prepare('SELECT COUNT(*) n FROM interviews WHERE round = 3').get().n }));

  app.post('/api/auth/otp', async (req, res) => {
    try {
      const r = await requestOtp(db, req.body?.phone);
      res.status(r.status).json(r.body);
    } catch (e) {
      res.status(502).json({ error: `Could not send SMS: ${e.message}` });
    }
  });
  app.post('/api/auth/verify', (req, res) => {
    const r = verifyOtp(db, req.body?.phone, req.body?.code);
    if (r.status === 200) audit(r.body.user.name, `Signed in (${r.body.user.role})`);
    res.status(r.status).json(r.body);
  });

  // ---------- signed-in ----------
  app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

  app.get('/api/surveys', auth, (req, res) => {
    res.json(listSurveys(db).filter((x) => canSeeSurvey(req.user, x)).map((x) => surveyView(x, req.user)));
  });
  // New survey (admin): copies a questionnaire to start from, starts as Draft
  app.post('/api/surveys', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can create surveys' });
    const title = String(req.body?.title || '').trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: 'Enter a survey name' });
    const client = req.body?.clientPhone ? db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'client'").get(normalisePhone(req.body.clientPhone)) : null;
    if (req.body?.clientPhone && !client) return res.status(400).json({ error: 'Choose a client login' });
    const choice = req.body?.copyFrom || 'starter';
    const from = choice === 'blank' || choice === 'starter' ? null : getSurvey(db, choice);
    const id = 'S-' + Date.now().toString(36).toUpperCase();
    // Start from a copy of an existing questionnaire, or the standard MSR starter questionnaire on a new installation
    const base = JSON.parse(JSON.stringify(from ? (getS(db, from.id, 'draftQuestionnaire') || getS(db, from.id, 'questionnaire')) : choice === 'blank' ? blankQuestionnaire() : SAMPLE_QUESTIONNAIRE));
    const qn = { ...base, id, title: { en: title, te: '' }, client: client ? client.name : '', round: 1, status: 'Draft', version: 1 };
    db.prepare('INSERT INTO surveys (id, title, client_phone, client_name, status, created) VALUES (?,?,?,?,?,?)').run(id, title, client?.phone || null, client?.name || null, 'Draft', Date.now());
    Object.entries(SURVEY_DEFAULTS(qn)).forEach(([k, v]) => setS(db, id, k, v));
    audit(req.user.name, 'Created survey "' + title + '"' + (client ? ' for ' + client.name : ''));
    broadcast('surveys', {});
    return res.json(surveyView(getSurvey(db, id)));
  });
  app.put('/api/surveys/:id', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can change surveys' });
    const sv = getSurvey(db, req.params.id);
    if (!sv) return res.status(404).json({ error: 'Survey not found' });
    const title = req.body?.title ? String(req.body.title).trim().slice(0, 120) : sv.title;
    const status = ['Draft', 'Live', 'Closed'].includes(req.body?.status) ? req.body.status : sv.status;
    let client = { phone: sv.client_phone, name: sv.client_name };
    if (req.body?.clientPhone !== undefined) {
      const u = req.body.clientPhone ? db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'client'").get(normalisePhone(req.body.clientPhone)) : null;
      if (req.body.clientPhone && !u) return res.status(400).json({ error: 'Choose a client login' });
      client = { phone: u?.phone || null, name: u?.name || null };
    }
    db.prepare('UPDATE surveys SET title = ?, status = ?, client_phone = ?, client_name = ? WHERE id = ?').run(title, status, client.phone, client.name, sv.id);
    const qn = getS(db, sv.id, 'questionnaire');
    if (qn) setS(db, sv.id, 'questionnaire', { ...qn, title: { ...qn.title, en: title }, client: client.name || '', status });
    audit(req.user.name, 'Survey "' + title + '": ' + status + (client.name ? ' · client ' + client.name : ''));
    broadcast('surveys', {});
    return res.json(surveyView(getSurvey(db, sv.id)));
  });

  app.get('/api/state', auth, (req, res) => {
    const sv = pickSurvey(req, res, false);
    if (res.headersSent) return undefined;
    const keys = READABLE[req.user.role] || Object.keys(STATE_RULES);
    const state = Object.fromEntries(keys.filter((k) => !SURVEY_KEYS.includes(k) || sv).map((k) => [k, SURVEY_KEYS.includes(k) ? getS(db, sv.id, k) : getKv(db, k)]));
    state.surveyId = sv ? sv.id : null;
    if (req.user.role === 'client' && state.reportStatus !== 'Sent to client') state.report = null;
    if (!READABLE[req.user.role]) {
      state.audit = db.prepare('SELECT t, who, what FROM audit ORDER BY id DESC LIMIT 300').all();
      state.accessLog = db.prepare('SELECT t, who, role, interview_id AS interviewId, field, reason FROM access_log ORDER BY id DESC LIMIT 500').all();
      state.apiKeys = db.prepare('SELECT id, name, scopes, created, last_used AS lastUsed, status FROM api_keys').all().map((k) => ({ ...k, scopes: JSON.parse(k.scopes) }));
    }
    return res.json(state);
  });

  app.put('/api/state/:key', auth, (req, res) => {
    const rule = STATE_RULES[req.params.key];
    if (!rule) return res.status(404).json({ error: 'Unknown setting' });
    if (!can(req.user, rule.perm)) return res.status(403).json({ error: 'Your role does not allow this change' });
    const perSurvey = SURVEY_KEYS.includes(req.params.key);
    const sv = perSurvey ? pickSurvey(req, res) : null;
    if (perSurvey && !sv) return undefined;
    let value = req.body?.value;
    if (req.params.key === 'permissions' && !value?.admin?.['admin.access']) return res.status(400).json({ error: 'Admins must keep access control' });
    if (req.params.key === 'geo') {
      const problem = validateGeo(value);
      if (problem) return res.status(400).json({ error: problem });
      if (value === null && getKv(db, 'installMode') === 'production') return res.status(400).json({ error: 'A production site cannot go back to the sample booth list' });
    }
    const current = perSurvey ? getS(db, sv.id, req.params.key) : getKv(db, req.params.key);
    if (rule.merge) value = { ...(current || {}), ...(value || {}) };
    if (perSurvey) setS(db, sv.id, req.params.key, value); else setKv(db, req.params.key, value);
    // Surveyors and supervisors uploaded from Excel automatically get a login with their mobile number
    if (req.params.key === 'surveyors' && Array.isArray(value)) {
      const up = db.prepare("INSERT INTO users (phone, name, role, surveyor_id, active) VALUES (?,?,?,?,1) ON CONFLICT(phone) DO UPDATE SET name = excluded.name, surveyor_id = excluded.surveyor_id WHERE users.role IN ('surveyor','supervisor')");
      // Only react to real changes, so logins switched off elsewhere (People & logins) stay as they are
      const prevById = new Map((Array.isArray(current) ? current : []).map((x) => [x.id, x]));
      const setActive = db.prepare("UPDATE users SET active = ? WHERE phone = ? AND role IN ('surveyor','supervisor')");
      value.forEach((x) => {
        const phone = normalisePhone(x.phone);
        if (phone.length !== 10) return;
        const isSup = x.role === 'Supervisor';
        const prev = prevById.get(x.id);
        up.run(phone, String(x.name || '').slice(0, 80), isSup ? 'supervisor' : 'surveyor', isSup ? null : x.id);
        const oldPhone = prev ? normalisePhone(prev.phone) : '';
        if (oldPhone && oldPhone !== phone) setActive.run(0, oldPhone); // mobile number changed: old number stops working
        if (!prev || prev.status !== x.status || oldPhone !== phone) setActive.run(x.status === 'Inactive' ? 0 : 1, phone);
      });
    }
    if (['statuses', 'notes', 'questionnaire'].includes(req.params.key)) invalidate(sv?.id);
    // A team change adds or removes the survey from surveyors' phones right away
    if (req.params.key === 'team') {
      const n = value?.members ? Object.keys(value.members).length : null;
      audit(req.user.name, `Survey "${sv.title}": team set to ${n === null ? 'everyone' : `${n} people`}`);
      broadcast('surveys', {});
    }
    if (req.params.key === 'geo') {
      setGeo(value);
      invalidate();
      audit(req.user.name, value ? `Loaded booth list: ${value.constituencies.length} constituencies, ${value.mandals.length} mandals, ${value.booths.length} booths` : 'Switched to the sample booth list');
    }
    broadcast('state', { key: req.params.key, value, by: req.user.name, survey: sv?.id || null }, (u) => u.phone !== req.user.phone && (!READABLE[u.role] || READABLE[u.role].includes(req.params.key)));
    return res.json({ ok: true });
  });

  app.get('/api/interviews', auth, (req, res) => {
    const sv = pickSurvey(req, res, false);
    if (res.headersSent) return undefined;
    if (!sv) return res.json([]);
    const round = Number(req.query.round || 3);
    if (round === 1 && !getS(db, sv.id, 'round1Imported')) return res.json([]);
    if (req.user.role === 'surveyor' && round !== 3) return res.json([]);
    return res.json(listInterviews(db, round, sv.id).filter((i) => visible(i, req.user)).map((i) => present(i, req.user)));
  });

  app.post('/api/interviews', auth, need('field'), (req, res) => {
    const list = Array.isArray(req.body?.interviews) ? req.body.interviews.slice(0, MAX_BATCH) : [];
    const clean = [];
    for (const i of list) {
      const booth = BOOTH_BY_ID[i?.boothId];
      if (i?.id && i.boothId && !booth) return res.status(400).json({ error: `Interview ${i.id}: booth ${i.boothId} is not in the booth list` });
      if (!i?.id || !booth || !i.answers || typeof i.startedAt !== 'number' || !i.gps) return res.status(400).json({ error: `Interview ${i?.id || '?'} is incomplete` });
      if (!i.consent?.agreed) return res.status(400).json({ error: `Interview ${i.id} has no recorded consent` });
      const sv = getSurvey(db, i.surveyId || FIRST_SURVEY);
      // Interviews already done are accepted even if the surveyor was later taken off this survey's team
      const mayAdd = sv && (canSeeSurvey(req.user, sv) || (req.user.role === 'surveyor' && sv.status === 'Live'));
      if (!mayAdd) return res.status(403).json({ error: 'Interview ' + i.id + ': survey not available' });
      if (sv.status === 'Closed') return res.status(400).json({ error: 'Survey "' + sv.title + '" is closed' });
      const surveyorId = req.user.role === 'surveyor' ? req.user.surveyorId : i.surveyorId;
      clean.push({ ...i, surveyId: sv.id, id: String(i.id).slice(0, 40), round: 3, surveyorId, mandalId: booth.mandalId, constituencyId: booth.constituencyId, syncedAt: Date.now(), receivedBy: req.user.phone });
    }
    const added = insertInterviews(db, clean);
    const sids = [...new Set(clean.map((i) => i.surveyId))];
    sids.forEach((x) => invalidate(x));
    const qual = {};
    sids.forEach((x) => { const q = quality(x); clean.filter((i) => i.surveyId === x).forEach((i) => { qual[i.id] = q[i.id]; }); });
    clean.forEach((i) => broadcast('interview', (u) => (visible(i, u) && canSeeSurvey(u, getSurvey(db, i.surveyId)) ? present(i, u) : undefined)));
    return res.json({ added, quality: qual });
  });

  app.post('/api/audit', auth, (req, res) => {
    const what = String(req.body?.what || '').slice(0, 300);
    if (what) audit(req.user.name, what);
    res.json({ ok: true });
  });

  app.post('/api/pii/reveal', auth, need('pii.reveal'), (req, res) => {
    const { interviewId, field, question, reason } = req.body || {};
    if (!reason || String(reason).trim().length < 3) return res.status(400).json({ error: 'A reason is required' });
    const row = db.prepare('SELECT data, survey_id FROM interviews WHERE id = ?').get(interviewId);
    if (!row) return res.status(404).json({ error: 'Interview not found' });
    const i = JSON.parse(row.data);
    const qn = qnOf(row.survey_id);
    // Only personal-detail questions can be revealed this way; default to the survey's name / mobile question
    const p = piiOf(row.survey_id);
    const key = question ? String(question) : (field === 'phone' ? (R('phone', qn) || 'q_phone') : (R('name', qn) || 'q_name'));
    if (!p.ids.includes(key)) return res.status(400).json({ error: 'That is not a personal-detail question' });
    const label = findQuestion(qn, key)?.label.en || (p.kind(key) === 'phone' ? 'Mobile number' : 'Respondent name');
    const entry = { t: Date.now(), who: req.user.name, role: req.user.role, interviewId, field: label.slice(0, 80), reason: String(reason).slice(0, 300) };
    db.prepare('INSERT INTO access_log (t, who, role, interview_id, field, reason) VALUES (?,?,?,?,?,?)').run(entry.t, entry.who, entry.role, entry.interviewId, entry.field, entry.reason);
    broadcast('access', entry, (u) => u.role === 'admin');
    res.json({ value: i.answers[key] || '', entry });
  });

  app.post('/api/keys', auth, need('addons.api'), (req, res) => {
    const name = String(req.body?.name || 'Untitled').slice(0, 80);
    const scopes = (req.body?.scopes || []).filter((s) => ['results:read', 'interviews:read', 'reports:read', 'rollup:read'].includes(s));
    const secret = `msrp_live_${crypto.randomBytes(18).toString('base64url')}`;
    const id = `key_live_${secret.slice(-4)}`;
    const key = { id, name, scopes, created: new Date().toISOString().slice(0, 10), lastUsed: '—', status: 'Active' };
    db.prepare('INSERT INTO api_keys (id, name, hash, scopes, created, last_used, status) VALUES (?,?,?,?,?,?,?)').run(id, name, hashKey(secret), JSON.stringify(scopes), key.created, key.lastUsed, 'Active');
    audit(req.user.name, `Created API key “${name}” (${scopes.join(', ')})`);
    res.json({ key, secret });
  });
  app.post('/api/keys/:id/revoke', auth, need('addons.api'), (req, res) => {
    db.prepare("UPDATE api_keys SET status = 'Revoked' WHERE id = ?").run(req.params.id);
    audit(req.user.name, `Revoked API key ${req.params.id}`);
    res.json({ ok: true });
  });

  // ---------- People & logins (admin) ----------
  // Only people added here (or uploaded as surveyors) can sign in. The role decides what they see.
  const ROLE_LIST = ['admin', 'supervisor', 'analyst', 'surveyor', 'client'];
  const userRow = (u) => ({ phone: u.phone, name: u.name, role: u.role, surveyorId: u.surveyor_id, active: !!u.active });
  app.get('/api/users', auth, need('admin.access'), (req, res) => {
    res.json(db.prepare('SELECT * FROM users ORDER BY CASE role WHEN \'admin\' THEN 1 WHEN \'supervisor\' THEN 2 WHEN \'analyst\' THEN 3 WHEN \'client\' THEN 4 ELSE 5 END, name').all().map(userRow));
  });
  app.post('/api/users', auth, need('admin.access'), (req, res) => {
    const phone = normalisePhone(req.body?.phone);
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const role = req.body?.role;
    if (phone.length !== 10) return res.status(400).json({ error: 'Enter a 10-digit mobile number' });
    if (!name) return res.status(400).json({ error: 'Enter a name' });
    if (!ROLE_LIST.includes(role)) return res.status(400).json({ error: 'Choose a role' });
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) return res.status(409).json({ error: 'This mobile number already has a login' });
    db.prepare('INSERT INTO users (phone, name, role, surveyor_id, active) VALUES (?,?,?,?,1)').run(phone, name, role, role === 'surveyor' ? (req.body?.surveyorId || null) : null);
    audit(req.user.name, `Added login: ${name} (${role})`);
    res.json(userRow(db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)));
  });
  app.put('/api/users/:phone', auth, need('admin.access'), (req, res) => {
    const phone = normalisePhone(req.params.phone);
    const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!u) return res.status(404).json({ error: 'Login not found' });
    const active = req.body?.active === undefined ? !!u.active : !!req.body.active;
    const role = req.body?.role && ROLE_LIST.includes(req.body.role) ? req.body.role : u.role;
    if (phone === req.user.phone && (!active || role !== 'admin')) return res.status(400).json({ error: 'You cannot remove your own admin access' });
    if (u.role === 'admin' && (!active || role !== 'admin') && db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1").get().n <= 1) return res.status(400).json({ error: 'At least one admin must remain' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : u.name;
    if (!name) return res.status(400).json({ error: 'Enter a name' });
    db.prepare('UPDATE users SET active = ?, role = ?, name = ? WHERE phone = ?').run(active ? 1 : 0, role, name, phone);
    audit(req.user.name, `${active ? 'Updated' : 'Switched off'} login: ${name} (${role})`);
    res.json(userRow(db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)));
  });

  // ---------- AI ----------
  const validRound3 = (sid) => {
    const st = getS(db, sid, 'statuses') || {};
    const q = quality(sid);
    return round3(sid).filter((i) => (st[i.id] || autoStatus(q[i.id])) !== 'Rejected');
  };
  app.post('/api/ai/report-draft', auth, need('insights.reports'), async (req, res) => {
    const sv = pickSurvey(req, res);
    if (!sv) return undefined;
    const qn = getS(db, sv.id, 'questionnaire');
    const cur = validRound3(sv.id);
    if (!cur.length) return res.status(400).json({ error: 'This survey has no interviews yet' });
    const draft = generateReport(qn, cur, listInterviews(db, 2, sv.id), quality(sv.id), getS(db, sv.id, 'statuses') || {});
    if (!aiEnabled()) return res.json({ sections: draft, ai: false });
    try {
      const facts = { client: qn.client, survey: qn.title.en, interviews: cur.length };
      const sections = await aiReportDraft(draft, facts);
      res.json({ sections: sections || draft, ai: !!sections });
    } catch (e) {
      console.error('[ai] report draft failed:', e.message);
      res.json({ sections: draft, ai: false, warning: 'AI unavailable, built-in draft used' });
    }
  });
  app.post('/api/ai/ask', auth, need('insights.ask'), async (req, res) => {
    if (!aiEnabled()) return res.status(503).json({ error: 'AI not configured' });
    try {
      const sv = pickSurvey(req, res);
      if (!sv) return undefined;
      const parsed = await aiParseQuestion(String(req.body?.text || '').slice(0, 500), getS(db, sv.id, 'questionnaire'));
      if (!parsed) return res.status(422).json({ error: 'Could not understand the question' });
      res.json(parsed);
    } catch (e) {
      console.error('[ai] ask failed:', e.message);
      res.status(503).json({ error: 'AI unavailable' });
    }
  });

  // ---------- admin ----------
  app.post('/api/admin/reset', auth, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    if (!demoMode() || getKv(db, 'installMode') === 'production') return res.status(403).json({ error: 'Reset is only available on demo sites' });
    seed(db);
    setGeo(getKv(db, 'geo'));
    invalidate();
    broadcast('reset', {});
    res.json({ ok: true });
  });
  app.post('/api/admin/import-round1', auth, need('addons.import'), (req, res) => {
    const sv = pickSurvey(req, res);
    if (!sv) return undefined;
    const on = !!req.body?.on;
    db.prepare('DELETE FROM interviews WHERE round = 1 AND survey_id = ?').run(sv.id);
    if (on) insertInterviews(db, generateInterviews(1, getKv(db, 'surveyors')).map((i) => ({ ...i, surveyId: sv.id })));
    setS(db, sv.id, 'round1Imported', on);
    audit(req.user.name, on ? 'Imported Round 1 (May 2026) from GoSurvey' : 'Removed Round 1 import');
    res.json({ ok: true });
  });

  // ---------- DPDP: scheduled deletion of personal details ----------
  // Names and phone numbers older than the retention period are erased; anonymous answers are kept for analysis.
  function runRetention(by = 'System (scheduled)') {
    const days = Number(getKv(db, 'retentionDays') || 180);
    const cutoff = Date.now() - days * 86400000;
    const rows = db.prepare('SELECT id, data, survey_id FROM interviews WHERE started_at < ?').all(cutoff);
    const upd = db.prepare('UPDATE interviews SET data = ? WHERE id = ?');
    let erased = 0;
    db.exec('BEGIN');
    rows.forEach((r) => {
      const i = JSON.parse(r.data);
      const p = piiOf(r.survey_id);
      if (i.piiErased && !p.ids.some((id) => i.answers[id] !== undefined) && !p.photos.some((id) => typeof i.answers[id] === 'string')) return;
      p.ids.forEach((id) => { delete i.answers[id]; });
      p.photos.forEach((id) => { if (typeof i.answers[id] === 'string') i.answers[id] = true; });
      i.piiErased = new Date().toISOString().slice(0, 10);
      upd.run(JSON.stringify(i), r.id);
      erased++;
    });
    db.exec('COMMIT');
    if (erased) { audit(by, `Erased personal details from ${erased} interviews older than ${days} days (DPDP retention)`); invalidate(); }
    return { erased, days };
  }
  runRetention();
  setInterval(() => runRetention(), 6 * 3600000).unref();
  app.post('/api/admin/run-retention', auth, need('settings.compliance'), (req, res) => res.json(runRetention(req.user.name)));

  // ---------- live stream ----------
  app.get('/api/live', auth, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const c = { res, user: req.user };
    clients.add(c);
    req.on('close', () => clients.delete(c));
  });

  // ---------- public API for other software (API key) ----------
  const apiKeyAuth = (scope) => (req, res, next) => {
    const h = req.headers.authorization || '';
    const secret = h.startsWith('Bearer ') ? h.slice(7) : '';
    const row = secret && db.prepare("SELECT * FROM api_keys WHERE hash = ? AND status = 'Active'").get(hashKey(secret));
    if (!row) return res.status(401).json({ error: 'Invalid or revoked API key' });
    if (!JSON.parse(row.scopes).includes(scope)) return res.status(403).json({ error: `Key lacks scope ${scope}` });
    db.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').run(new Date().toISOString().slice(0, 16).replace('T', ' '), row.id);
    return next();
  };
  app.get('/api/v1/surveys/:sid/results', apiKeyAuth('results:read'), (req, res) => {
    const sv = getSurvey(db, req.params.sid);
    if (!sv) return res.status(404).json({ error: 'Unknown survey' });
    const qn = getS(db, sv.id, 'questionnaire');
    const qid = req.query.question || mainQuestionId(qn);
    const q = qid && findQuestion(qn, qid);
    if (!q || piiOf(sv.id).ids.includes(qid)) return res.status(404).json({ error: 'Unknown question' });
    const level = ['constituency', 'mandal'].includes(req.query.level) ? req.query.level : 'state';
    const list = applyFilters(validRound3(sv.id), {});
    const out = { survey: qn.id, question: qid, label: q.label.en, base: list.length, level, personal_data: 'never included' };
    if (level === 'state') {
      const f = frequency(qn, qid, list);
      out.results = (f.rows || []).map((r) => ({ answer: r.key, label: r.label, pct: Number(r.pct.toFixed(1)), count: r.count }));
    } else {
      const ct = crosstab(qn, level, qid, list);
      out.results = ct.rows.map((r) => ({ area: r.label, base: r.base, ...Object.fromEntries(r.cells.map((c) => [c.key, Number(c.pct.toFixed(1))])) }));
    }
    res.json(out);
  });

  // ---------- Android app download ----------
  app.get('/download/MSR-Pulse.apk', (req, res) => {
    if (!fs.existsSync(APK)) return res.status(404).send('The Android app has not been built yet. Run build-android-apk.bat on the server computer.');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    return res.download(APK, 'MSR-Pulse.apk');
  });

  // ---------- the web app ----------
  const dist = path.join(here, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

  return { app, db };
}
