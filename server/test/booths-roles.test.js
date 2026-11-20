// Real booth lists and questionnaires that do not use the sample question ids. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { geoFromRows, BOOTH_BY_ID, GEO } from '../../src/data/geo.js';
import { rolesOf, targetCategories } from '../../src/lib/roles.js';
import { parseQuestion } from '../../src/lib/nlq.js';
import { generateReport } from '../../src/lib/reportGen.js';
import { assessAll } from '../../src/lib/quality.js';
import { newInterviewId } from '../../src/lib/outbox.js';
import { SAMPLE_QUESTIONNAIRE } from '../../src/data/questionnaire.js';

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
const ADMIN = '9848012345'; const SUPERVISOR = '9848012346'; const ANALYST = '9848012347'; const SURVEYOR = '9848012348';

const ROWS = [
  { 'Constituency code': 'nzb', Constituency: 'Nizamabad Urban', 'Constituency (Telugu)': 'నిజామాబాద్ అర్బన్', Mandal: 'Nizamabad North', 'Booth no': 7, 'Booth name': 'Govt School', Latitude: 18.672, Longitude: 78.094 },
  { 'Constituency code': 'NZB', Constituency: 'Nizamabad Urban', Mandal: 'Nizamabad North', 'Booth no': 8, Latitude: 18.676, Longitude: 78.1 },
  { 'Constituency code': 'NZB', Constituency: 'Nizamabad Urban', Mandal: 'Nizamabad South', 'Booth no': 21, Latitude: 18.66, Longitude: 78.09 },
  { 'Constituency code': 'ADB', Constituency: 'Adilabad', Mandal: 'Adilabad Rural', 'Booth no': 101, Latitude: 19.66, Longitude: 78.53 },
];

test('booth list from Excel rows: ids, mandals and clear errors', () => {
  const { geo, errors } = geoFromRows(ROWS);
  assert.deepEqual(errors, []);
  assert.deepEqual(geo.booths.map((b) => b.id), ['NZB-007', 'NZB-008', 'NZB-021', 'ADB-101']);
  assert.equal(geo.mandals.length, 3);
  assert.equal(geo.constituencies.find((c) => c.id === 'NZB').mandalIds.length, 2);
  const bad = geoFromRows([...ROWS, { 'Constituency code': 'NZB', Constituency: 'Nizamabad Urban', Mandal: 'X', 'Booth no': 7, Latitude: 18.6, Longitude: 78.1 }, { 'Constituency code': 'ADB', Constituency: 'Adilabad', Mandal: 'Y', 'Booth no': 'abc', Latitude: 1, Longitude: 2 }]);
  assert.equal(bad.geo, null, 'nothing is saved when there are errors');
  assert.ok(bad.errors.some((e) => /Row 6: booth 7 appears twice/.test(e)), bad.errors.join('\n'));
  assert.ok(bad.errors.some((e) => /Row 7: missing Booth no/.test(e)), bad.errors.join('\n'));
});

test('only admins can replace the booth list, and it is checked on the server', async () => {
  const { geo } = geoFromRows(ROWS);
  assert.equal((await call('PUT', '/api/state/geo', { value: geo }, await login(SUPERVISOR))).status, 403);
  const broken = { ...geo, booths: [...geo.booths, { ...geo.booths[0] }] };
  assert.equal((await call('PUT', '/api/state/geo', { value: broken }, await login(ADMIN))).status, 400, 'repeated booth id rejected');
  const r = await call('PUT', '/api/state/geo', { value: geo }, await login(ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const st = await call('GET', '/api/state', null, await login(SURVEYOR));
  assert.equal(st.body.geo.booths.length, 4, 'surveyor phones receive the booth list');
  assert.ok(BOOTH_BY_ID['NZB-007'] && !BOOTH_BY_ID['WGW-101'], 'server now uses the uploaded list');
  assert.equal(GEO.sample, false);
});

const blankInterview = (id, surveyId, boothId, answers, extra = {}) => {
  const b = BOOTH_BY_ID[boothId] || { lat: 17, lng: 78 };
  return { id, surveyId, boothId, startedAt: Date.now() - 900000, durationSec: 900, gps: { lat: b.lat, lng: b.lng, acc: 8 }, consent: { agreed: true, consentRead: true }, answers, ...extra };
};

// A questionnaire with none of the starter ids: the builder's "Used for" marks tell MSR Pulse what each question is
const o = (v, en) => ({ v, en, te: en });
const CUSTOM = {
  id: 'CUSTOM', version: 1, title: { en: 'Civic survey', te: 'సర్వే' }, client: '', consentScript: { en: 'Consent', te: 'అంగీకారం' },
  groups: [
    { id: 'p1', title: { en: 'Where', te: 'ఎక్కడ' }, questions: [{ id: 'where', type: 'cascade', label: { en: 'Booth', te: 'బూత్' } }] },
    { id: 'p2', title: { en: 'About you', te: 'మీ గురించి' }, questions: [
      { id: 'resp', type: 'text', role: 'name', pii: true, label: { en: 'Name', te: 'పేరు' } },
      { id: 'sex', type: 'single', role: 'gender', label: { en: 'Sex', te: 'లింగం' }, options: [o('M', 'Male'), o('F', 'Female')] },
      { id: 'yrs', type: 'number', role: 'age', min: 18, max: 99, label: { en: 'Age', te: 'వయస్సు' } },
      { id: 'pref', type: 'single', role: 'main', label: { en: 'Which water supplier do you prefer?', te: 'నీరు' }, options: [o('X', 'Municipal'), o('Y', 'Private tanker'), o('Z', 'Borewell')] },
      { id: 'streets', type: 'grid', label: { en: 'Rate the streets', te: 'వీధులు' }, rows: [o('a', 'Lights'), o('b', 'Drains'), o('c', 'Roads'), o('d', 'Garbage')], cols: [o('1', 'Bad'), o('2', 'OK'), o('3', 'Good')] },
    ] },
    { id: 'p3', title: { en: 'Check', te: 'తనిఖీ' }, questions: [{ id: 'loc', type: 'gps', label: { en: 'GPS', te: 'GPS' } }] },
  ],
};

test('question roles: marks win, starter ids are the fallback', () => {
  const r = rolesOf(CUSTOM);
  assert.equal(r.gender, 'sex');
  assert.equal(r.main, 'pref');
  assert.equal(r.caste, null);
  assert.equal(rolesOf(SAMPLE_QUESTIONNAIRE).main, 'q_vote_intent', 'old questionnaires keep working');
  const cats = targetCategories(CUSTOM);
  assert.deepEqual(cats.gender.map((x) => x.v), ['M', 'F'], 'booth quotas follow the gender question’s answers');
  assert.equal(cats.caste.length, 0);
});

let sid;
let firstId;
test('a survey with its own questionnaire collects, masks and reveals by role', async () => {
  const admin = await login(ADMIN);
  const sv = await call('POST', '/api/surveys', { title: 'Civic survey', copyFrom: 'blank' }, admin);
  sid = sv.body.id;
  assert.equal((await call('PUT', `/api/state/questionnaire?survey=${sid}`, { value: CUSTOM }, admin)).status, 200);
  await call('PUT', `/api/surveys/${sid}`, { status: 'Live' }, admin);
  const surveyor = await login(SURVEYOR);
  // Team list: SV-001 now works at a booth from the new list
  const team = (await call('GET', '/api/state', null, admin)).body.surveyors.map((x) => (x.id === 'SV-001' ? { ...x, boothIds: ['NZB-007'], constituencyId: 'NZB' } : x));
  await call('PUT', '/api/state/surveyors', { value: team }, admin);
  firstId = newInterviewId('SV-001');
  const list = [
    blankInterview(firstId, sid, 'NZB-007', { resp: 'Lakshmi Devi', sex: 'F', yrs: 34, pref: 'X', streets: { a: '1', b: '2', c: '3', d: '2' } }),
    blankInterview(newInterviewId('SV-001'), sid, 'NZB-007', { resp: 'Raju', sex: 'M', yrs: 51, pref: 'Y', streets: { a: '1', b: '1', c: '1', d: '1' } }),
  ];
  const r = await call('POST', '/api/interviews', { interviews: list }, surveyor);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, 2);
  assert.ok(r.body.quality[list[1].id].flags.some((f) => f.id === 'STRAIGHT'), 'straight-lining found on any rating grid');
  const old = await call('POST', '/api/interviews', { interviews: [blankInterview('INT-OLD-1', sid, 'WGW-101', { pref: 'X' })] }, surveyor);
  assert.equal(old.status, 400);
  assert.match(old.body.error, /not in the booth list/, 'clear message for a booth that is not in the list');

  const seen = await call('GET', `/api/interviews?survey=${sid}`, null, await login(ANALYST));
  const mine = seen.body.find((i) => i.id === firstId);
  assert.match(mine.answers.resp, /^R-[0-9A-Z]{6}$/, 'name question (marked by role) is masked by the privacy lock');
  assert.equal(mine.answers.pref, 'X', 'other answers are not touched');

  const rev = await call('POST', '/api/pii/reveal', { interviewId: firstId, question: 'resp', reason: 'Back-check call' }, admin);
  assert.equal(rev.status, 200, JSON.stringify(rev.body));
  assert.equal(rev.body.value, 'Lakshmi Devi');
  assert.equal(rev.body.entry.field, 'Name', 'access log names the question');
  assert.equal((await call('POST', '/api/pii/reveal', { interviewId: firstId, question: 'pref', reason: 'Back-check call' }, admin)).status, 400, 'only personal-detail questions can be revealed');
});

test('report draft works for a questionnaire without the sample questions', async () => {
  const r = await call('POST', '/api/ai/report-draft', { surveyId: sid }, await login(ANALYST));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const summary = r.body.sections.find((x) => x.id === 'summary').body;
  assert.match(summary, /Which water supplier do you prefer/);
  assert.ok(!r.body.sections.some((x) => /Party|Nalgonda|Electricity/.test(x.body)), 'no pre-written findings');
});

test('report and quality checks never invent findings for missing questions', () => {
  const list = [1, 2, 3].map((k) => ({ id: `I${k}`, surveyorId: 'S', boothId: 'NZB-007', mandalId: 'NZB-M1', constituencyId: 'NZB', startedAt: Date.now() - k * 3600000, durationSec: 900, gps: { lat: 18.672, lng: 78.094, acc: 5 }, consent: { consentRead: true }, answers: { pref: ['X', 'Y', 'X'][k - 1] } }));
  const q = assessAll(list, CUSTOM);
  assert.equal(Object.keys(q).length, 3);
  const sections = generateReport(CUSTOM, list, [], q, {});
  assert.deepEqual(sections.map((x) => x.id), ['summary', 'method', 'vote', 'seats', 'advice'], 'sections without data are left out');
});

test('ask in plain English uses the questionnaire’s own words', () => {
  const p = parseQuestion('Which supplier do women prefer?', CUSTOM);
  assert.equal(p.qid, 'pref');
  assert.equal(p.filters.gender, 'F');
  const q = parseQuestion('rate the streets by gender', CUSTOM);
  assert.equal(q.qid, 'streets');
  assert.equal(q.by, 'sex');
});

test('interview ids are unique across phones', () => {
  const ids = new Set(Array.from({ length: 5000 }, () => newInterviewId('SV-001')));
  assert.equal(ids.size, 5000);
  assert.ok([...ids][0].length <= 40, 'fits the server limit');
});

test('a production install starts without sample booths', async () => {
  const prev = { SEED_SAMPLE: process.env.SEED_SAMPLE, ADMIN_PHONE: process.env.ADMIN_PHONE };
  process.env.SEED_SAMPLE = '0';
  process.env.ADMIN_PHONE = '9000011111';
  try {
    createApp({ dbFile: ':memory:' });
    assert.equal(GEO.booths.length, 0, 'no booths until MSR uploads its list');
  } finally {
    process.env.SEED_SAMPLE = prev.SEED_SAMPLE ?? '';
    if (prev.SEED_SAMPLE === undefined) delete process.env.SEED_SAMPLE;
    if (prev.ADMIN_PHONE === undefined) delete process.env.ADMIN_PHONE; else process.env.ADMIN_PHONE = prev.ADMIN_PHONE;
  }
});
