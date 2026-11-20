// One-time SMS codes and signed session tokens (HMAC-SHA256), using only Node's crypto.
import crypto from 'node:crypto';
import { getKv, normalisePhone } from './db.js';
import { sendSms } from './sms.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TOKEN_TTL_S = 12 * 60 * 60;
export const DEMO_CODE = '482913';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function demoMode() {
  return process.env.DEMO_MODE !== '0';
}

export async function requestOtp(db, rawPhone) {
  const phone = normalisePhone(rawPhone);
  if (phone.length !== 10) return { status: 400, body: { error: 'Enter a 10-digit mobile number' } };
  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND active = 1').get(phone);
  // Same answer whether or not the number is registered, so numbers cannot be probed.
  if (!user) return { status: 200, body: { sent: true } };
  const prev = db.prepare('SELECT sent_at FROM otps WHERE phone = ?').get(phone);
  if (prev && Date.now() - prev.sent_at < OTP_RESEND_MS) return { status: 429, body: { error: 'Please wait 30 seconds before asking for a new code' } };
  const code = demoMode() ? DEMO_CODE : String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.prepare('INSERT INTO otps (phone, code_hash, expires, attempts, sent_at) VALUES (?,?,?,0,?) ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires, attempts=0, sent_at=excluded.sent_at')
    .run(phone, sha(`${phone}:${code}`), Date.now() + OTP_TTL_MS, Date.now());
  await sendSms(phone, `Your MSR Pulse login code is ${code}. It expires in 5 minutes. Do not share it.`);
  return { status: 200, body: { sent: true, ...(demoMode() ? { devCode: code } : {}) } };
}

export function verifyOtp(db, rawPhone, code) {
  const phone = normalisePhone(rawPhone);
  const row = db.prepare('SELECT * FROM otps WHERE phone = ?').get(phone);
  if (!row || row.expires < Date.now()) return { status: 401, body: { error: 'Code expired. Ask for a new one.' } };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { status: 429, body: { error: 'Too many wrong attempts. Ask for a new code.' } };
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha(`${phone}:${String(code).trim()}`)));
  if (!ok) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone);
    return { status: 401, body: { error: 'That code is not right.' } };
  }
  db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  const token = signToken(db, { sub: phone, role: user.role, name: user.name, sv: user.surveyor_id });
  return { status: 200, body: { token, user: { role: user.role, name: user.name, surveyorId: user.surveyor_id, phone } } };
}

export function signToken(db, claims) {
  const secret = getKv(db, 'jwtSecret');
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }));
  const sig = b64u(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

export function verifyToken(db, token) {
  if (!token) return null;
  const [head, body, sig] = String(token).split('.');
  if (!head || !body || !sig) return null;
  const expect = b64u(crypto.createHmac('sha256', getKv(db, 'jwtSecret')).update(`${head}.${body}`).digest());
  if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  const c = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (c.exp < Date.now() / 1000) return null;
  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND active = 1').get(c.sub);
  if (!user) return null;
  return { phone: user.phone, role: user.role, name: user.name, surveyorId: user.surveyor_id };
}

export function hashKey(secret) {
  return sha(secret);
}
