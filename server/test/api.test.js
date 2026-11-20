// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { BOOTH_BY_ID } from '../../src/data/geo.js';

process.env.NODE_ENV = 'test';
process.env.AI_DISABLED = '1';
let server;
let base;

before(async () => {
  const { app } = createApp({ dbFile: ':memory:' });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (method, path, body, token) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const tokens = {};
const login = async (phone) => {
  if (tokens[phone]) return tokens[phone];
  await call('POST', '/api/auth/otp', { phone });
  const r = await call('POST', '/api/auth/verify', { phone, code: '482913' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  tokens[phone] = r.body.token;
  return r.body.token;
};
const ADMIN = '9848012345'; const ANALYST = '9848012347'; const SURVEYOR = '9848012348'; const CLIENT = '9848012349';

test('health reports server mode', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.body.mode, 'server');
  assert.ok(r.body.interviews > 2000);
});

test('unknown numbers get the same answer and no code', async () => {
  const r = await call('POST', '/api/auth/otp', { phone: '9000000001' });
  assert.equal(r.status, 200);
  assert.equal(r.body.devCode, undefined);
});

test('wrong codes are rejected and attempts are limited', async () => {
  const SUP = '9848012346';
  await call('POST', '/api/auth/otp', { phone: SUP });
  for (let k = 0; k < 5; k++) assert.equal((await call('POST', '/api/auth/verify', { phone: SUP, code: '000000' })).status, 401);
  assert.equal((await call('POST', '/api/auth/verify', { phone: SUP, code: '482913' })).status, 429);
  assert.equal((await call('POST', '/api/auth/otp', { phone: SUP })).status, 429, 'cannot immediately request a new code');
});

test('requests without a valid token are refused', async () => {
  assert.equal((await call('GET', '/api/interviews')).status, 401);
  const t = await login(ADMIN);
  assert.equal((await call('GET', '/api/interviews', null, `${t.slice(0, -3)}abc`)).status, 401);
});

test('personal details leave the server only as codes while the privacy lock is on', async () => {
  const r = await call('GET', '/api/interviews?round=3', null, await login(ADMIN));
  assert.ok(r.body.length > 2000);
  assert.ok(r.body.every((i) => !i.answers.q_name || i.answers.q_name.startsWith('R-')));
});

test('surveyors see and submit only their own interviews', async () => {
  const t = await login(SURVEYOR);
  const mine = await call('GET', '/api/interviews?round=3', null, t);
  assert.ok(mine.body.length > 0 && mine.body.every((i) => i.surveyorId === 'SV-001'));
  const booth = BOOTH_BY_ID['WGW-101'];
  const rec = { id: 'INT-TEST-1', surveyorId: 'SV-050', boothId: booth.id, startedAt: Date.now() - 900000, durationSec: 900, gps: { lat: booth.lat + 0.08, lng: booth.lng, acc: 8 }, consent: { agreed: true, consentRead: true, recordingSec: 910 }, answers: { q_gender: 'Female', q_age: 30, q_caste: 'BC', q_services: { roads: '3', water: '2' } } };
  const r = await call('POST', '/api/interviews', { interviews: [rec] }, t);
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 1);
  assert.ok(r.body.quality['INT-TEST-1'].flags.some((f) => f.id === 'GPS_FAR'), 'far-away interview is flagged');
  assert.ok(r.body.quality['INT-TEST-1'].score >= 40);
  const all = await call('GET', '/api/interviews?round=3', null, await login(ADMIN));
  assert.equal(all.body.find((i) => i.id === 'INT-TEST-1').surveyorId, 'SV-001', 'server sets the surveyor from the login, not the request');
});

test('interviews without consent are refused', async () => {
  const booth = BOOTH_BY_ID['WGW-101'];
  const r = await call('POST', '/api/interviews', { interviews: [{ id: 'X1', boothId: booth.id, startedAt: Date.now(), gps: { lat: 1, lng: 1 }, answers: {}, consent: { agreed: false } }] }, await login(SURVEYOR));
  assert.equal(r.status, 400);
});

test('clients cannot change data and only see an approved report', async () => {
  const t = await login(CLIENT);
  assert.equal((await call('PUT', '/api/state/statuses', { value: { 'INT-00001': 'Rejected' } }, t)).status, 403);
  const st = await call('GET', '/api/state', null, t);
  assert.equal(st.body.report, null);
  assert.equal(st.body.audit, undefined);
  assert.equal((await call('POST', '/api/interviews', { interviews: [] }, t)).status, 403);
});

test('revealing a personal detail needs permission and a reason, and is logged', async () => {
  const analyst = await login(ANALYST);
  assert.equal((await call('POST', '/api/pii/reveal', { interviewId: 'INT-00001', field: 'name', reason: 'test' }, analyst)).status, 403);
  const admin = await login(ADMIN);
  assert.equal((await call('POST', '/api/pii/reveal', { interviewId: 'INT-00001', field: 'name', reason: '' }, admin)).status, 400);
  const r = await call('POST', '/api/pii/reveal', { interviewId: 'INT-00001', field: 'name', reason: 'Back-check call' }, admin);
  assert.equal(r.status, 200);
  assert.ok(r.body.value && !r.body.value.startsWith('R-'));
  const st = await call('GET', '/api/state', null, admin);
  assert.equal(st.body.accessLog[0].reason, 'Back-check call');
});

test('review decisions merge and admins cannot lock themselves out', async () => {
  const admin = await login(ADMIN);
  await call('PUT', '/api/state/statuses', { value: { 'INT-00001': 'Rejected' } }, admin);
  await call('PUT', '/api/state/statuses', { value: { 'INT-00002': 'Back-check' } }, admin);
  const st = await call('GET', '/api/state', null, admin);
  assert.equal(st.body.statuses['INT-00001'], 'Rejected');
  assert.equal(st.body.statuses['INT-00002'], 'Back-check');
  const perms = st.body.permissions;
  assert.equal((await call('PUT', '/api/state/permissions', { value: { ...perms, admin: { ...perms.admin, 'admin.access': false } } }, admin)).status, 400);
});

test('public API works with a key, never returns personal data, and stops after revoking', async () => {
  const admin = await login(ADMIN);
  const k = await call('POST', '/api/keys', { name: 'Test', scopes: ['results:read'] }, admin);
  const get = (secret) => fetch(`${base}/api/v1/surveys/TSP-R3/results?question=q_vote_intent&level=constituency`, { headers: { Authorization: `Bearer ${secret}` } });
  const ok = await get(k.body.secret);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.results.length, 6);
  assert.equal((await fetch(`${base}/api/v1/surveys/TSP-R3/results?question=q_name`, { headers: { Authorization: `Bearer ${k.body.secret}` } })).status, 404);
  await call('POST', `/api/keys/${k.body.key.id}/revoke`, null, admin);
  assert.equal((await get(k.body.secret)).status, 401);
});

test('personal details are erased after the retention period', async () => {
  const admin = await login(ADMIN);
  await call('PUT', '/api/state/privacyLock', { value: false }, admin);
  await call('PUT', '/api/state/retentionDays', { value: 90 }, admin);
  const r = await call('POST', '/api/admin/run-retention', {}, admin);
  assert.ok(r.body.erased > 1000, 'August round is older than 90 days');
  const r2 = await call('GET', '/api/interviews?round=2', null, admin);
  assert.ok(r2.body.every((i) => !i.answers.q_name && !i.answers.q_phone && i.piiErased));
  assert.ok(r2.body.every((i) => i.answers.q_vote_intent), 'anonymous answers are kept');
  const r3 = await call('GET', '/api/interviews?round=3', null, admin);
  assert.ok(r3.body.some((i) => i.answers.q_name && !i.answers.q_name.startsWith('R-')), 'recent round untouched; lock off shows names');
  await call('PUT', '/api/state/privacyLock', { value: true }, admin);
  await call('PUT', '/api/state/retentionDays', { value: 180 }, admin);
});

test('report draft falls back to the built-in writer without AI credentials', async () => {
  const r = await call('POST', '/api/ai/report-draft', {}, await login(ADMIN));
  assert.equal(r.status, 200);
  assert.equal(r.body.ai, false);
  assert.equal(r.body.sections.length, 7);
});

test('test-site password keeps a public test site private', async () => {
  process.env.STAGING_PASSWORD = 'friends-only-123';
  const { app: gated } = createApp({ dbFile: ':memory:' });
  delete process.env.STAGING_PASSWORD;
  const srv = await new Promise((r) => { const x = gated.listen(0, () => r(x)); });
  const g = `http://127.0.0.1:${srv.address().port}`;
  try {
    const health = await (await fetch(`${g}/api/health`)).json();
    assert.equal(health.stage, true, 'health stays open so apps can find the server');
    const page = await fetch(`${g}/`);
    assert.equal(page.status, 401);
    assert.match(await page.text(), /Test-site password/);
    assert.equal((await fetch(`${g}/api/auth/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '9848012345' }) })).status, 401, 'no sign-in without the password');
    const wrong = await fetch(`${g}/__stage`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=guess' });
    assert.equal(wrong.headers.get('set-cookie'), null);
    const right = await fetch(`${g}/__stage`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=friends-only-123' });
    const cookie = right.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${g}/api/auth/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ phone: '9848012345' }) })).status, 200, 'browser with the cookie can sign in');
    assert.equal((await fetch(`${g}/api/me`, { headers: { 'X-Stage-Key': 'friends-only-123' } })).status, 401, 'phone app with the key passes the gate (then needs its own login)');
    const body = await (await fetch(`${g}/api/me`, { headers: { 'X-Stage-Key': 'friends-only-123' } })).json();
    assert.equal(body.stage, undefined);
  } finally { srv.close(); }
});

test('only the admin creates logins; the role comes from the mobile number', async () => {
  const admin = await login(ADMIN);
  assert.equal((await call('POST', '/api/users', { name: 'X', phone: '9000000077', role: 'admin' }, await login(ANALYST))).status, 403, 'analyst cannot create logins');
  const r = await call('POST', '/api/users', { name: 'Sunrise Trust', phone: '9000000077', role: 'client' }, admin);
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/api/users', { name: 'Dup', phone: '9000000077', role: 'client' }, admin)).status, 409);
  await call('POST', '/api/auth/otp', { phone: '9000000077' });
  const v = await call('POST', '/api/auth/verify', { phone: '9000000077', code: '482913' });
  assert.equal(v.body.user.role, 'client', 'new number signs in as a client');
  // switching a login off blocks it immediately, even with a valid session
  await call('PUT', '/api/users/9000000077', { active: false }, admin);
  assert.equal((await call('GET', '/api/me', null, v.body.token)).status, 401);
  // the last admin cannot be removed
  assert.equal((await call('PUT', `/api/users/${ADMIN}`, { active: false }, admin)).status, 400);
});

test('surveyors uploaded from Excel get a login automatically', async () => {
  const admin = await login(ADMIN);
  const st = await call('GET', '/api/state', null, admin);
  const added = { id: 'SV-900', name: 'New Surveyor', phone: '+91 9000000088', gender: 'Female', role: 'Surveyor', constituencyId: 'KNR', boothIds: ['KNR-101'], device: 'Android', status: 'Invited' };
  await call('PUT', '/api/state/surveyors', { value: [...st.body.surveyors, added] }, admin);
  await call('POST', '/api/auth/otp', { phone: '9000000088' });
  const v = await call('POST', '/api/auth/verify', { phone: '9000000088', code: '482913' });
  assert.equal(v.status, 200);
  assert.equal(v.body.user.role, 'surveyor');
  assert.equal(v.body.user.surveyorId, 'SV-900');
});
