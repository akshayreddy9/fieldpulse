// MSR Pulse database (SQLite via Node's built-in node:sqlite; no native build tools needed).
// Production: the same tables on an encrypted volume, backed up nightly to S3 in India (see docs/DEPLOY-AWS.md).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SAMPLE_QUESTIONNAIRE } from '../src/data/questionnaire.js';
import { generateInterviews, generateSurveyors } from '../src/data/generate.js';
import { DEFAULT_PERMISSIONS_SERVER } from './permissions.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (phone TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, surveyor_id TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY, round INTEGER NOT NULL, surveyor_id TEXT NOT NULL, booth_id TEXT NOT NULL, mandal_id TEXT NOT NULL,
  constituency_id TEXT NOT NULL, started_at INTEGER NOT NULL, synced_at INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_int_round ON interviews(round);
CREATE INDEX IF NOT EXISTS idx_int_sv ON interviews(surveyor_id);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, who TEXT NOT NULL, what TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, who TEXT NOT NULL, role TEXT, interview_id TEXT, field TEXT, reason TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS surveys (id TEXT PRIMARY KEY, title TEXT NOT NULL, client_phone TEXT, client_name TEXT, status TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL, scopes TEXT NOT NULL, created TEXT NOT NULL, last_used TEXT, status TEXT NOT NULL);
`;

export const DEMO_USERS = [
  ['9848012345', 'Akhila Rao', 'admin', null],
  ['9848012346', 'Narsimha Goud', 'supervisor', null],
  ['9848012347', 'Sneha Varma', 'analyst', null],
  ['9848012348', 'Ravi Kumar', 'surveyor', 'SV-001'],
  ['9848012349', 'Deccan Policy Foundation', 'client', null],
];

export function normalisePhone(p) {
  return String(p || '').replace(/\D/g, '').slice(-10);
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  if (!db.prepare('SELECT 1 FROM kv WHERE key = ?').get('seeded')) seed(db);
  return db;
}

// ---------- Surveys: each survey has its own questionnaire, targets, reviews and report ----------
export const FIRST_SURVEY = 'TSP-R3';
export const SURVEY_KEYS = ['questionnaire', 'draftQuestionnaire', 'publishedVersion', 'targets', 'statuses', 'notes', 'report', 'reportStatus', 'reportHistory', 'round1Imported'];
const sKey = (sid, k) => `survey:${sid}:${k}`;
export const getS = (db, sid, k, fallback = null) => getKv(db, sKey(sid, k), fallback);
export const setS = (db, sid, k, v) => setKv(db, sKey(sid, k), v);
export const SURVEY_DEFAULTS = (qn) => ({ questionnaire: qn, draftQuestionnaire: null, publishedVersion: qn.version, targets: {}, statuses: {}, notes: {}, report: null, reportStatus: 'Not started', reportHistory: [], round1Imported: false });
export function getSurvey(db, sid) { return db.prepare('SELECT * FROM surveys WHERE id = ?').get(sid) || null; }
export function listSurveys(db) { return db.prepare('SELECT * FROM surveys ORDER BY created DESC').all(); }

// Upgrades a database created before multiple surveys existed (keeps all data).
function migrate(db) {
  const cols = db.prepare('PRAGMA table_info(interviews)').all().map((c) => c.name);
  if (!cols.includes('survey_id')) db.exec(`ALTER TABLE interviews ADD COLUMN survey_id TEXT NOT NULL DEFAULT '${FIRST_SURVEY}'`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_int_survey ON interviews(survey_id, round)');
  const seeded = db.prepare('SELECT 1 FROM kv WHERE key = ?').get('seeded');
  if (seeded && !db.prepare('SELECT 1 FROM surveys').get()) {
    const qn = getKv(db, 'questionnaire') || SAMPLE_QUESTIONNAIRE;
    db.prepare('INSERT INTO surveys (id, title, client_phone, client_name, status, created) VALUES (?,?,?,?,?,?)').run(FIRST_SURVEY, qn.title.en, '9848012349', qn.client || 'Deccan Policy Foundation', 'Live', Date.now() - 20 * 86400000);
    SURVEY_KEYS.forEach((k) => { const v = getKv(db, k); if (v !== null) setS(db, FIRST_SURVEY, k, v); db.prepare('DELETE FROM kv WHERE key = ?').run(k); });
  }
}

// Settings shared by all surveys
const DEFAULT_STATE = () => ({
  privacyLock: true,
  webhooks: [{ id: 'wh_1', url: 'https://hooks.example.org/msr/pulse', events: ['report.approved'], status: 'Active' }],
  peakMonths: ['2026-11', '2026-12', '2027-03'],
  permissions: DEFAULT_PERMISSIONS_SERVER,
  retentionDays: 180,
});

function insertInterviews(db, list) {
  const st = db.prepare('INSERT OR IGNORE INTO interviews (id, round, surveyor_id, booth_id, mandal_id, constituency_id, started_at, synced_at, data, survey_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  let n = 0;
  db.exec('BEGIN');
  try {
    list.forEach((i) => { n += st.run(i.id, i.round, i.surveyorId, i.boothId, i.mandalId, i.constituencyId, i.startedAt, i.syncedAt || Date.now(), JSON.stringify(i), i.surveyId || FIRST_SURVEY).changes; });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return n;
}
export { insertInterviews };

export function seed(db) {
  db.exec('BEGIN');
  db.exec('DELETE FROM kv; DELETE FROM users; DELETE FROM interviews; DELETE FROM audit; DELETE FROM access_log; DELETE FROM api_keys; DELETE FROM otps; DELETE FROM surveys;');
  db.exec('COMMIT');
  if (process.env.SEED_SAMPLE === '0') return seedProduction(db);
  const surveyors = generateSurveyors();
  const state = { ...DEFAULT_STATE(), surveyors };
  Object.entries(state).forEach(([k, v]) => setKv(db, k, v));
  db.prepare('INSERT INTO surveys (id, title, client_phone, client_name, status, created) VALUES (?,?,?,?,?,?)').run(FIRST_SURVEY, SAMPLE_QUESTIONNAIRE.title.en, '9848012349', SAMPLE_QUESTIONNAIRE.client, 'Live', Date.now() - 20 * 86400000);
  Object.entries(SURVEY_DEFAULTS(SAMPLE_QUESTIONNAIRE)).forEach(([k, v]) => setS(db, FIRST_SURVEY, k, v));
  setKv(db, 'jwtSecret', process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'));
  const addUser = db.prepare('INSERT OR REPLACE INTO users (phone, name, role, surveyor_id) VALUES (?,?,?,?)');
  surveyors.forEach((s) => addUser.run(normalisePhone(s.phone), s.name, s.role === 'Supervisor' ? 'supervisor' : 'surveyor', s.role === 'Supervisor' ? null : s.id));
  DEMO_USERS.forEach((u) => addUser.run(...u));
  insertInterviews(db, generateInterviews(3, surveyors));
  insertInterviews(db, generateInterviews(2, surveyors));
  const now = Date.now();
  db.prepare('INSERT INTO audit (t, who, what) VALUES (?,?,?)').run(now - 86400000 * 5, 'Akhila Rao', 'Published questionnaire TSP-R3 v7');
  db.prepare('INSERT INTO audit (t, who, what) VALUES (?,?,?)').run(now - 86400000 * 5 + 600000, 'Akhila Rao', `Uploaded ${surveyors.length} team members from Excel`);
  db.prepare('INSERT INTO api_keys (id, name, hash, scopes, created, last_used, status) VALUES (?,?,?,?,?,?,?)')
    .run('key_live_7Hq2', 'Client dashboard (DPF)', crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex'), JSON.stringify(['results:read']), '2026-11-02', '2026-11-18 16:42', 'Active');
  setKv(db, 'seeded', now);
}

// Production start: no sample data, no demo accounts. Only the first admin (ADMIN_PHONE, ADMIN_NAME) can sign in;
// they add surveys, surveyors, staff and clients from inside MSR Pulse.
function seedProduction(db) {
  const phone = normalisePhone(process.env.ADMIN_PHONE);
  if (phone.length !== 10) throw new Error('Production start needs ADMIN_PHONE (the first admin\'s 10-digit mobile number)');
  Object.entries(DEFAULT_STATE()).forEach(([k, v]) => setKv(db, k, v));
  setKv(db, 'surveyors', []);
  setKv(db, 'webhooks', []);
  setKv(db, 'geo', { empty: true }); // no sample booths: MSR uploads its booth list (Set up > Booth list)
  setKv(db, 'jwtSecret', process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'));
  db.prepare('INSERT INTO users (phone, name, role, surveyor_id) VALUES (?,?,?,NULL)').run(phone, String(process.env.ADMIN_NAME || 'MSR Admin').slice(0, 80), 'admin');
  db.prepare('INSERT INTO audit (t, who, what) VALUES (?,?,?)').run(Date.now(), 'System', 'MSR Pulse installed (production, empty)');
  setKv(db, 'installMode', 'production'); // permanent: this database can never be reset to sample data
  setKv(db, 'seeded', Date.now());
}

export function getKv(db, key, fallback = null) {
  const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return r ? JSON.parse(r.value) : fallback;
}
export function setKv(db, key, value) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

export function listInterviews(db, round, sid = FIRST_SURVEY) {
  return db.prepare('SELECT data, survey_id FROM interviews WHERE round = ? AND survey_id = ? ORDER BY started_at').all(round, sid).map((r) => ({ ...JSON.parse(r.data), surveyId: r.survey_id }));
}
