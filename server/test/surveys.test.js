// Multiple surveys and clients are kept apart. Run with: npm test
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
const ADMIN = '9848012345'; const ANALYST = '9848012347'; const SURVEYOR = '9848012348'; const DPF = '9848012349'; const SUNRISE = '9000000123';
const booth = BOOTH_BY_ID['WGW-101'];
const interview = (id, surveyId) => ({ id, surveyId, boothId: booth.id, startedAt: Date.now() - 900000, durationSec: 900, gps: { lat: booth.lat, lng: booth.lng, acc: 8 }, consent: { agreed: true, consentRead: true }, answers: { q_gender: 'Male', q_age: 40, q_caste: 'OC', q_vote_intent: 'A' } });

let newId;
test('admin creates a second survey for a second client', async () => {
  const admin = await login(ADMIN);
  await call('POST', '/api/users', { name: 'Sunrise Trust', phone: SUNRISE, role: 'client' }, admin);
  assert.equal((await call('POST', '/api/surveys', { title: 'X', clientPhone: SUNRISE }, await login(ANALYST))).status, 403, 'only admins create surveys');
  const r = await call('POST', '/api/surveys', { title: 'Hyderabad Civic Survey', clientPhone: SUNRISE }, admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  newId = r.body.id;
  assert.equal(r.body.status, 'Draft');
  assert.equal(r.body.clientName, 'Sunrise Trust');
  const st = await call('GET', `/api/state?survey=${newId}`, null, admin);
  assert.equal(st.body.questionnaire.title.en, 'Hyderabad Civic Survey', 'starts from a copy of the questionnaire');
  assert.equal(st.body.report, null);
});

test('each client sees only their own surveys', async () => {
  const dpf = await login(DPF);
  const sunrise = await login(SUNRISE);
  const a = await call('GET', '/api/surveys', null, dpf);
  const b = await call('GET', '/api/surveys', null, sunrise);
  assert.deepEqual(a.body.map((x) => x.id), ['TSP-R3']);
  assert.deepEqual(b.body.map((x) => x.id), [newId]);
  assert.equal((await call('GET', `/api/interviews?survey=TSP-R3`, null, sunrise)).status, 403, 'Sunrise cannot read DPF interviews');
  assert.equal((await call('GET', `/api/state?survey=${newId}`, null, dpf)).status, 403, 'DPF cannot read the Sunrise survey');
  const own = await call('GET', '/api/state', null, sunrise);
  assert.equal(own.body.surveyId, newId, 'a client lands on their own survey by default');
});

test('surveyors can only send interviews to live surveys, and data stays per survey', async () => {
  const sv = await login(SURVEYOR);
  const admin = await login(ADMIN);
  assert.equal((await call('POST', '/api/interviews', { interviews: [interview('INT-NEW-1', newId)] }, sv)).status, 403, 'draft survey is not open to surveyors');
  await call('PUT', `/api/surveys/${newId}`, { status: 'Live' }, admin);
  assert.equal((await call('POST', '/api/interviews', { interviews: [interview('INT-NEW-1', newId)] }, sv)).status, 200);
  const inNew = await call('GET', `/api/interviews?survey=${newId}`, null, admin);
  const inOld = await call('GET', '/api/interviews?survey=TSP-R3', null, admin);
  assert.deepEqual(inNew.body.map((i) => i.id), ['INT-NEW-1']);
  assert.ok(!inOld.body.some((i) => i.id === 'INT-NEW-1'));
  await call('PUT', `/api/surveys/${newId}`, { status: 'Closed' }, admin);
  assert.equal((await call('POST', '/api/interviews', { interviews: [interview('INT-NEW-2', newId)] }, sv)).status, 403, 'closed surveys accept no new interviews');
});

test('reviews and reports are kept per survey', async () => {
  const admin = await login(ADMIN);
  await call('PUT', `/api/state/statuses?survey=${newId}`, { value: { 'INT-NEW-1': 'Rejected' } }, admin);
  const a = await call('GET', `/api/state?survey=${newId}`, null, admin);
  const b = await call('GET', '/api/state?survey=TSP-R3', null, admin);
  assert.equal(a.body.statuses['INT-NEW-1'], 'Rejected');
  assert.equal(b.body.statuses['INT-NEW-1'], undefined);
  await call('PUT', `/api/state/report?survey=${newId}`, { value: [{ id: 'summary', title: 'S', body: 'secret', source: 'ai' }] }, admin);
  await call('PUT', `/api/state/reportStatus?survey=${newId}`, { value: 'Sent to client' }, admin);
  const dpfState = await call('GET', '/api/state?survey=TSP-R3', null, await login(DPF));
  assert.equal(dpfState.body.report, null, 'DPF never receives another client’s report');
  const sunState = await call('GET', `/api/state?survey=${newId}`, null, await login(SUNRISE));
  assert.equal(sunState.body.report[0].body, 'secret');
});

test('a production installation starts empty with only the first admin', async () => {
  Object.assign(process.env, { SEED_SAMPLE: '0', ADMIN_PHONE: '9000011111', ADMIN_NAME: 'First Admin' });
  const { app: prod } = createApp({ dbFile: ':memory:' });
  delete process.env.SEED_SAMPLE; delete process.env.ADMIN_PHONE; delete process.env.ADMIN_NAME;
  const srv = await new Promise((r) => { const x = prod.listen(0, () => r(x)); });
  const p = `http://127.0.0.1:${srv.address().port}`;
  const post = (path, body, token) => fetch(p + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await (await fetch(`${p}/api/health`)).json()).interviews, 0, 'no sample interviews');
    assert.equal((await (await post('/api/auth/otp', { phone: '9848012345' })).json()).devCode, undefined, 'demo admin does not exist');
    await post('/api/auth/otp', { phone: '9000011111' });
    const v = await (await post('/api/auth/verify', { phone: '9000011111', code: '482913' })).json();
    assert.equal(v.user.role, 'admin');
    const list = await (await fetch(`${p}/api/surveys`, { headers: { Authorization: `Bearer ${v.token}` } })).json();
    assert.equal(list.length, 0, 'no surveys until the admin creates one');
    const created = await (await post('/api/surveys', { title: 'First Real Survey' }, v.token)).json();
    assert.equal(created.status, 'Draft');
    assert.equal((await post('/api/admin/reset', {}, v.token)).status, 403, 'production data can never be reset to sample data');
  } finally { srv.close(); }
});

test('editing the team keeps logins in step without switching off unrelated ones', async () => {
  const admin = await login(ADMIN);
  const st = await call('GET', '/api/state', null, admin);
  const team = st.body.surveyors;
  assert.ok(Array.isArray(team) && team.length);
  // Saving the list unchanged must not lock out the demo surveyor
  assert.equal((await call('PUT', '/api/state/surveyors', { value: team }, admin)).status, 200);
  tokens[SURVEYOR] = undefined;
  await login(SURVEYOR);
  // A new person gets a login; changing their number moves it; Inactive switches it off
  const p = { id: 'SV-900', name: 'Test Person', phone: '+91 9111100001', role: 'Surveyor', constituencyId: team[0].constituencyId, boothIds: team[0].boothIds, status: 'Active' };
  await call('PUT', '/api/state/surveyors', { value: [...team, p] }, admin);
  await login('9111100001');
  await call('PUT', '/api/state/surveyors', { value: [...team, { ...p, phone: '+91 9111100002' }] }, admin);
  await call('POST', '/api/auth/otp', { phone: '9111100001' });
  assert.notEqual((await call('POST', '/api/auth/verify', { phone: '9111100001', code: '482913' })).status, 200, 'old number stops working');
  await login('9111100002');
  await call('PUT', '/api/state/surveyors', { value: [...team, { ...p, phone: '+91 9111100002', status: 'Inactive' }] }, admin);
  await call('POST', '/api/auth/otp', { phone: '9111100002' });
  assert.notEqual((await call('POST', '/api/auth/verify', { phone: '9111100002', code: '482913' })).status, 200, 'inactive cannot sign in');
});

test('a new survey can start blank or from the MSR starter', async () => {
  const admin = await login(ADMIN);
  const blank = await call('POST', '/api/surveys', { title: 'Blank one', copyFrom: 'blank' }, admin);
  const qb = (await call('GET', `/api/state?survey=${blank.body.id}`, null, admin)).body.questionnaire;
  assert.equal(qb.groups.length, 3);
  assert.equal(qb.groups[1].questions.length, 0);
  assert.ok(qb.groups[2].questions.some((x) => x.type === 'gps'), 'blank survey still records GPS');
  const starter = await call('POST', '/api/surveys', { title: 'Starter one', copyFrom: 'starter' }, admin);
  const qs = (await call('GET', `/api/state?survey=${starter.body.id}`, null, admin)).body.questionnaire;
  assert.ok(qs.groups.flatMap((g) => g.questions).length > 10);
});
