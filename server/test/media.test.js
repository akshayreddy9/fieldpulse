// Interview recordings and photos: upload from the phone, review access, and automatic deletion. Run with: npm test
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

const call = async (method, path, body, token, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const res = await fetch(base + path, { method, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
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
const ADMIN = '9848012345'; const SUPERVISOR = '9848012346'; const SURVEYOR = '9848012348'; const CLIENT = '9848012349';
const booth = BOOTH_BY_ID['WGW-101'];
const interview = (id, daysAgo = 0) => ({ id, surveyId: 'TSP-R3', boothId: booth.id, startedAt: Date.now() - daysAgo * 86400000 - 900000, durationSec: 900, gps: { lat: booth.lat, lng: booth.lng, acc: 8 }, consent: { agreed: true, consentRead: true, audio: true }, answers: { q_gender: 'Female', q_age: 30 }, fromFieldApp: true });
const AUDIO = new Uint8Array(Buffer.from('fake-opus-audio-bytes-'.repeat(50)));
const PHOTO = new Uint8Array(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]));

test('the phone uploads the recording and photo after the interview', async () => {
  const sv = await login(SURVEYOR);
  assert.equal((await call('POST', '/api/interviews/INT-MEDIA-1/media/audio', AUDIO, sv, { 'Content-Type': 'audio/webm' })).status, 404, 'interview must be sent first');
  assert.equal((await call('POST', '/api/interviews', { interviews: [interview('INT-MEDIA-1')] }, sv)).status, 200);
  const up = await call('POST', '/api/interviews/INT-MEDIA-1/media/audio', AUDIO, sv, { 'Content-Type': 'audio/webm;codecs=opus' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.size, AUDIO.length);
  assert.equal((await call('POST', '/api/interviews/INT-MEDIA-1/media/photo', PHOTO, sv, { 'Content-Type': 'image/jpeg' })).status, 200);
  assert.equal((await call('POST', '/api/interviews/INT-MEDIA-1/media/photo', AUDIO, sv, { 'Content-Type': 'audio/webm' })).status, 400, 'a photo must be an image');
  assert.equal((await call('POST', '/api/interviews/INT-MEDIA-1/media/video', AUDIO, sv, { 'Content-Type': 'video/mp4' })).status, 400);
  // The interview now says it has a recording and photo, without revealing where files are stored
  const list = await call('GET', '/api/interviews?survey=TSP-R3', undefined, await login(ADMIN));
  const i = list.body.find((x) => x.id === 'INT-MEDIA-1');
  assert.equal(i.media.audio.type, 'audio/webm');
  assert.equal(i.media.photo.type, 'image/jpeg');
  assert.equal(i.media.audio.file, undefined, 'file names stay on the server');
});

test('another surveyor cannot attach files to someone else’s interview', async () => {
  const admin = await login(ADMIN);
  await call('POST', '/api/users', { name: 'Second Surveyor', phone: '9000000777', role: 'surveyor', surveyorId: 'SV-002' }, admin);
  const other = await login('9000000777');
  assert.equal((await call('POST', '/api/interviews/INT-MEDIA-1/media/audio', AUDIO, other, { 'Content-Type': 'audio/webm' })).status, 403);
});

test('reviewers can play the recording and see the photo; every opening is logged', async () => {
  const sup = await login(SUPERVISOR);
  const a = await call('GET', '/api/interviews/INT-MEDIA-1/media/audio', undefined, sup);
  assert.equal(a.status, 200);
  assert.match(a.type, /audio\/webm/);
  assert.deepEqual(new Uint8Array(a.body), AUDIO, 'the exact recording comes back');
  const p = await call('GET', '/api/interviews/INT-MEDIA-1/media/photo', undefined, await login(ADMIN));
  assert.equal(p.status, 200);
  assert.match(p.type, /image\/jpeg/);
  const st = await call('GET', '/api/state', undefined, await login(ADMIN));
  assert.ok(st.body.accessLog.some((e) => e.interviewId === 'INT-MEDIA-1' && e.field === 'Recording'), 'recording access is in the privacy log');
  assert.ok(st.body.accessLog.some((e) => e.interviewId === 'INT-MEDIA-1' && e.field === 'Photo'));
});

test('clients and surveyors cannot open recordings or photos', async () => {
  assert.equal((await call('GET', '/api/interviews/INT-MEDIA-1/media/audio', undefined, await login(CLIENT))).status, 403);
  assert.equal((await call('GET', '/api/interviews/INT-MEDIA-1/media/audio', undefined, await login(SURVEYOR))).status, 403);
});

test('recordings are deleted after the storage period, but kept while the interview is under review', async () => {
  const sv = await login(SURVEYOR);
  const admin = await login(ADMIN);
  await call('POST', '/api/interviews', { interviews: [interview('INT-OLD-OK', 40), interview('INT-OLD-REVIEW', 40)] }, sv);
  for (const id of ['INT-OLD-OK', 'INT-OLD-REVIEW']) await call('POST', `/api/interviews/${id}/media/audio`, AUDIO, sv, { 'Content-Type': 'audio/webm' });
  await call('PUT', '/api/state/statuses?survey=TSP-R3', { value: { 'INT-OLD-OK': 'Accepted', 'INT-OLD-REVIEW': 'Back-check' } }, admin);
  assert.equal((await call('PUT', '/api/state/mediaRetentionDays', { value: 30 }, admin)).status, 200);
  assert.equal((await call('PUT', '/api/state/mediaRetentionDays', { value: 30 }, await login(SUPERVISOR))).status, 403, 'only admins set the storage period');
  const r = await call('POST', '/api/admin/run-retention', {}, admin);
  assert.equal(r.body.mediaDays, 30);
  assert.equal(r.body.mediaDeleted, 1, JSON.stringify(r.body));
  assert.equal(r.body.mediaHeld, 1, 'the interview in back-check keeps its recording');
  const gone = await call('GET', '/api/interviews/INT-OLD-OK/media/audio', undefined, admin);
  assert.equal(gone.status, 404);
  assert.match(gone.body.error, /Deleted on/);
  assert.equal((await call('GET', '/api/interviews/INT-OLD-REVIEW/media/audio', undefined, admin)).status, 200);
  assert.equal((await call('GET', '/api/interviews/INT-MEDIA-1/media/audio', undefined, admin)).status, 200, 'recent recordings stay');
  const usage = await call('GET', '/api/admin/media-usage', undefined, admin);
  assert.equal(usage.status, 200);
  assert.ok(usage.body.files >= 3 && usage.body.bytes > 0);
});
