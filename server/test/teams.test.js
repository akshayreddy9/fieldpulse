// Survey teams (who works on which survey) and adding every kind of person. Run with: npm test
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
const ADMIN = '9848012345'; const SURVEYOR = '9848012348'; // SV-001
const booth = BOOTH_BY_ID['WGW-101'];
const interview = (id, surveyId) => ({ id, surveyId, boothId: booth.id, startedAt: Date.now() - 900000, durationSec: 900, gps: { lat: booth.lat, lng: booth.lng, acc: 8 }, consent: { agreed: true, consentRead: true }, answers: { q_gender: 'Male', q_age: 40 } });

let second;
test('a surveyor can work on several live surveys at the same time', async () => {
  const admin = await login(ADMIN);
  second = (await call('POST', '/api/surveys', { title: 'Second survey' }, admin)).body.id;
  await call('PUT', `/api/surveys/${second}`, { status: 'Live' }, admin);
  const mine = await call('GET', '/api/surveys', null, await login(SURVEYOR));
  assert.deepEqual(mine.body.map((x) => x.id).sort(), ['TSP-R3', second].sort());
  assert.ok(mine.body.every((x) => Array.isArray(x.myBooths) && x.myBooths.length), 'each survey tells the phone the surveyor’s booths');
});

test('a survey team decides which surveys appear on a surveyor’s phone', async () => {
  const admin = await login(ADMIN);
  const surveyor = await login(SURVEYOR);
  // Team without SV-001
  assert.equal((await call('PUT', `/api/state/team?survey=${second}`, { value: { members: { 'SV-002': { boothIds: [] } } } }, admin)).status, 200);
  let mine = await call('GET', '/api/surveys', null, surveyor);
  assert.deepEqual(mine.body.map((x) => x.id), ['TSP-R3'], 'removed from the team: the survey disappears');
  assert.equal((await call('GET', `/api/state?survey=${second}`, null, surveyor)).status, 403);
  const adminView = (await call('GET', '/api/surveys', null, admin)).body.find((x) => x.id === second);
  assert.equal(adminView.teamSize, 1);
  // Interviews already done on that survey are still accepted
  const late = await call('POST', '/api/interviews', { interviews: [interview('INT-TEAM-LATE', second)] }, surveyor);
  assert.equal(late.status, 200, JSON.stringify(late.body));
  // Back on the team, with a different booth for this survey only
  await call('PUT', `/api/state/team?survey=${second}`, { value: { members: { 'SV-001': { boothIds: ['WGW-104'] } } } }, admin);
  mine = await call('GET', '/api/surveys', null, surveyor);
  const s2 = mine.body.find((x) => x.id === second);
  assert.deepEqual(s2.myBooths, ['WGW-104'], 'booths for this survey only');
  assert.notDeepEqual(mine.body.find((x) => x.id === 'TSP-R3').myBooths, ['WGW-104'], 'other surveys keep the usual booths');
  // Everyone again
  await call('PUT', `/api/state/team?survey=${second}`, { value: null }, admin);
  assert.equal((await call('GET', '/api/surveys', null, surveyor)).body.length, 2);
});

test('only people who manage the team can change a survey team', async () => {
  const analyst = await login('9848012347');
  assert.equal((await call('PUT', `/api/state/team?survey=${second}`, { value: null }, analyst)).status, 403);
});

test('admins can add analysts, admins and client logins, and rename them', async () => {
  const admin = await login(ADMIN);
  for (const [phone, role] of [['9000000201', 'analyst'], ['9000000202', 'admin'], ['9000000203', 'client'], ['9000000204', 'supervisor']]) {
    const r = await call('POST', '/api/users', { name: `New ${role}`, phone, role }, admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const ren = await call('PUT', '/api/users/9000000201', { name: 'Sneha R', role: 'analyst' }, admin);
  assert.equal(ren.body.name, 'Sneha R');
  const r = await call('POST', '/api/auth/otp', { phone: '9000000201' });
  assert.equal(r.status, 200, 'the new person can sign in');
});
