// Deterministic generator for surveyors and interviews (sample data for the demo).
import { mulberry32, pick, weighted, gauss } from './rng.js';
import { GEO, BOOTH_BY_ID, ageBand } from './geo.js';

const MALE = ['Ravi', 'Srinivas', 'Venkatesh', 'Naresh', 'Mahesh', 'Ramesh', 'Suresh', 'Prasad', 'Kiran', 'Rajesh', 'Anil', 'Praveen', 'Sai', 'Harish', 'Vamshi', 'Raju', 'Shiva', 'Krishna', 'Narsimha', 'Yadagiri', 'Imran', 'Salman'];
const FEMALE = ['Lakshmi', 'Swathi', 'Padma', 'Anusha', 'Divya', 'Kavitha', 'Manasa', 'Sravani', 'Bhavani', 'Sunitha', 'Rani', 'Sirisha', 'Mounika', 'Saritha', 'Renuka', 'Jyothi', 'Sandhya', 'Ayesha', 'Pushpa', 'Vani'];
const SURN = ['Reddy', 'Rao', 'Goud', 'Yadav', 'Naidu', 'Sharma', 'Chary', 'Varma', 'Kumar', 'Mudiraj', 'Shaik', 'Banoth', 'Gundu', 'Kurma', 'Bandi', 'Pagidi', 'Thota', 'Mekala'];

export const SURVEY_START = new Date('2026-11-13T00:00:00+05:30').getTime();
export const DAY = 86400000;
export const NOW = new Date('2026-11-18T17:45:00+05:30').getTime();

const BAD_PATTERNS = {
  'SV-007': ['short'],
  'SV-015': ['gps_far'],
  'SV-023': ['straight', 'short'],
  'SV-031': ['duplicate'],
  'SV-038': ['burst'],
  'SV-046': ['night'],
  'SV-052': ['no_consent'],
  'SV-061': ['cluster', 'burst'],
};

export function generateSurveyors() {
  const rnd = mulberry32(7);
  const list = [];
  GEO.booths.forEach((b, i) => {
    const female = rnd() < 0.45;
    const first = female ? pick(rnd, FEMALE) : pick(rnd, MALE);
    const id = `SV-${String(i + 1).padStart(3, '0')}`;
    list.push({
      id,
      name: `${first} ${pick(rnd, SURN)}`,
      phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`,
      gender: female ? 'Female' : 'Male',
      role: 'Surveyor',
      constituencyId: b.constituencyId,
      boothIds: [b.id],
      device: rnd() < 0.72 ? 'Android' : 'iPhone',
      status: 'Active',
      joined: '2026-10-28',
    });
  });
  list[0].name = 'Ravi Kumar';
  list[0].gender = 'Male';
  GEO.constituencies.forEach((c, i) => {
    list.push({
      id: `SP-${String(i + 1).padStart(2, '0')}`,
      name: `${pick(rnd, MALE)} ${pick(rnd, SURN)}`,
      phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`,
      gender: 'Male',
      role: 'Supervisor',
      constituencyId: c.id,
      boothIds: [],
      device: 'Android',
      status: 'Active',
      joined: '2026-10-20',
    });
  });
  return list;
}

export const BAD_SURVEYORS = BAD_PATTERNS;

const PARTY_BASE = {
  3: {
    WGW: { A: 36, B: 30, C: 18, IND: 4, UND: 9, NS: 3 },
    KNR: { A: 29, B: 27, C: 31, IND: 3, UND: 7, NS: 3 },
    NLG: { A: 41, B: 28, C: 14, IND: 5, UND: 9, NS: 3 },
    KMM: { A: 34, B: 32, C: 11, IND: 9, UND: 10, NS: 4 },
    SDP: { A: 27, B: 45, C: 15, IND: 2, UND: 8, NS: 3 },
    MBN: { A: 38, B: 26, C: 21, IND: 3, UND: 9, NS: 3 },
  },
};

function partyWeights(round, conId, d) {
  const base = { ...(PARTY_BASE[3][conId]) };
  if (round === 2) { base.A -= 3; base.B += 2; base.UND += 3; base.C -= 1; }
  if (round === 1) { base.A -= 6; base.B += 4; base.UND += 4; base.C += 1; }
  if (d.gender === 'Female') base.A += 5;
  if (d.scheme === 'Y') { base.A += 7; base.B -= 2; }
  if (d.ageBand === '18-25') { base.C += 7; base.UND += 3; base.A -= 3; }
  if (d.ageBand === '51+') base.A += 3;
  if (d.caste === 'SC' || d.caste === 'ST') base.A += 5;
  if (d.caste === 'OC') { base.C += 6; base.A -= 3; }
  if (d.caste === 'BC') base.B += 3;
  if (d.caste === 'Minority') { base.B += 5; base.C -= 6; }
  return base;
}

const SERVICE_MEAN = {
  WGW: { roads: 3.2, water: 3.0, power: 3.9, health: 2.8, school: 3.1 },
  KNR: { roads: 3.4, water: 3.3, power: 4.0, health: 3.0, school: 3.2 },
  NLG: { roads: 2.9, water: 2.3, power: 3.8, health: 2.6, school: 2.9 },
  KMM: { roads: 3.0, water: 3.1, power: 3.7, health: 2.7, school: 3.0 },
  SDP: { roads: 3.9, water: 3.7, power: 4.2, health: 3.3, school: 3.5 },
  MBN: { roads: 2.7, water: 2.6, power: 3.6, health: 2.4, school: 2.8 },
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function makeAnswers(rnd, round, booth, d) {
  const conId = booth.constituencyId;
  const a = {};
  a.q_loc = { constituency: conId, mandal: booth.mandalId, booth: booth.id };
  a.q_consent = 'Y';
  a.q_gender = d.gender;
  a.q_age = d.age;
  a.q_caste = d.caste;
  const young = d.age <= 25;
  a.q_occupation = weighted(rnd, {
    FARM: young ? 6 : 22, ALAB: 14, DWAGE: 12, PVT: young ? 16 : 10, GOVT: 4, BIZ: 9,
    HOME: d.gender === 'Female' ? 26 : 1, STU: young ? 22 : 0, UNEMP: young ? 12 : 4, OTHER: 2,
  });
  if (a.q_occupation === 'OTHER') a.q_occupation_other = pick(rnd, ['Auto driver', 'Weaver', 'Tailor', 'Toddy tapper', 'Fisherman']);
  // issues (up to 3)
  const iw = {
    JOBS: young ? 30 : 14, PRICE: 20, WATER: conId === 'NLG' || conId === 'MBN' ? 24 : 10, ROADS: conId === 'MBN' ? 18 : 11,
    AGRI: a.q_occupation === 'FARM' || a.q_occupation === 'ALAB' ? 28 : 8, HEALTH: 11, EDU: 8, HOUSE: 9, CORR: 7, OTHER: 1.5,
  };
  const n = 1 + Math.floor(rnd() * 3);
  const issues = new Set();
  while (issues.size < n) issues.add(weighted(rnd, iw));
  a.q_issues = [...issues];
  if (issues.has('OTHER')) a.q_issues_other = pick(rnd, ['Liquor shops', 'Street lights', 'Drainage', 'Bus service']);
  // services grid
  const sm = SERVICE_MEAN[conId];
  a.q_services = {};
  Object.keys(sm).forEach((k) => {
    const shift = round === 2 ? -0.15 : round === 1 ? -0.3 : 0;
    a.q_services[k] = String(clamp(Math.round(gauss(rnd, sm[k] + shift, 0.9)), 1, 5));
  });
  a.q_scheme = rnd() < (d.caste === 'OC' ? 0.45 : 0.72) ? 'Y' : 'N';
  if (a.q_scheme === 'Y') {
    const s = new Set();
    const k = 1 + Math.floor(rnd() * 3);
    while (s.size < k) s.add(weighted(rnd, { PEN: d.age > 55 ? 40 : 8, FARM: a.q_occupation === 'FARM' ? 35 : 6, HOUSE: 10, HEALTH: 16, RATION: 30 }));
    a.q_scheme_which = [...s];
  }
  a.q_voted_last = weighted(rnd, { Y: young ? 62 : 84, N: young ? 30 : 12, DK: 5 });
  a.q_vote_intent = weighted(rnd, partyWeights(round, conId, { ...d, scheme: a.q_scheme }));
  if (['A', 'B', 'C'].includes(a.q_vote_intent)) {
    a.q_vote_reason = weighted(rnd, { LEADER: 26, CAND: 16, WELF: a.q_vote_intent === 'A' ? 32 : 10, DEV: 20, COMM: 9, OTHER: 2 });
    if (a.q_vote_reason === 'OTHER') a.q_vote_reason_other = 'Family tradition';
  }
  if (a.q_vote_intent === 'UND') a.q_lean = weighted(rnd, { A: 28, B: 26, C: 22, NONE: 24 });
  const leaderMap = { A: 'LA', B: 'LB', C: 'LC' };
  a.q_leader = leaderMap[a.q_vote_intent] && rnd() < 0.82 ? leaderMap[a.q_vote_intent] : weighted(rnd, { LA: 38, LB: 32, LC: 24, OTHER: 6 });
  if (a.q_leader === 'OTHER') a.q_leader_other = 'Local MLA';
  let rating = gauss(rnd, a.q_vote_intent === 'A' ? 7.4 : a.q_vote_intent === 'B' || a.q_vote_intent === 'C' ? 4.6 : 5.8, 1.6);
  if (round === 2) rating -= 0.2;
  if (round === 1) rating -= 0.5;
  a.q_govt_rating = clamp(Math.round(rating), 1, 10);
  return a;
}

function makeDemo(rnd, booth) {
  const gender = rnd() < 0.505 ? 'Male' : rnd() < 0.995 ? 'Female' : 'Other';
  const age = clamp(Math.round(18 + Math.abs(gauss(rnd, 22, 15))), 18, 88);
  const stShare = { WGW: 6, KNR: 4, NLG: 10, KMM: 18, SDP: 5, MBN: 8 }[booth.constituencyId];
  const caste = weighted(rnd, { SC: 17, ST: stShare, BC: 50, OC: 18, Minority: booth.constituencyId === 'MBN' || booth.constituencyId === 'NLG' ? 11 : 7 });
  return { gender, age, ageBand: ageBand(age), caste };
}

function respondentName(rnd, gender) {
  const f = gender === 'Female' ? pick(rnd, FEMALE) : pick(rnd, MALE);
  return `${f} ${pick(rnd, SURN)}`;
}

function finalise(rec, rnd) {
  rec.answers.q_name = respondentName(rnd, rec.answers.q_gender);
  rec.answers.q_phone = rnd() < 0.7 ? `9${Math.floor(100000000 + rnd() * 899999999)}` : '';
  rec.answers.q_date = new Date(rec.startedAt).toISOString().slice(0, 10);
  rec.answers.q_gps = { lat: rec.gps.lat, lng: rec.gps.lng, acc: rec.gps.acc };
  rec.answers.q_photo = rnd() < 0.86;
}

// Achieved counts per booth (some booths are behind target on purpose)
function boothQuota(rnd, booth, round) {
  if (round !== 3) return 22 + Math.floor(rnd() * 8);
  const behind = ['KMM-105', 'KMM-110', 'MBN-111', 'NLG-103', 'WGW-109', 'MBN-104'];
  if (behind.includes(booth.id)) return 11 + Math.floor(rnd() * 8);
  return 25 + Math.floor(rnd() * 16);
}

export function generateInterviews(round = 3, surveyors = generateSurveyors()) {
  const rnd = mulberry32(round * 1000 + 11);
  const out = [];
  const startDay = round === 3 ? SURVEY_START : round === 2 ? new Date('2026-08-10T00:00:00+05:30').getTime() : new Date('2026-05-12T00:00:00+05:30').getTime();
  const days = 6;
  let counter = 0;
  GEO.booths.forEach((booth) => {
    const sv = surveyors.find((s) => s.boothIds.includes(booth.id));
    const patterns = round === 3 ? BAD_PATTERNS[sv.id] || [] : [];
    const n = boothQuota(rnd, booth, round);
    const perDay = Math.ceil(n / days);
    let made = 0;
    let lastAnswers = null;
    const home = { lat: booth.lat + 0.06 + rnd() * 0.04, lng: booth.lng - 0.07 };
    for (let day = 0; day < days && made < n; day++) {
      let t = startDay + day * DAY + (9.5 + rnd()) * 3600000;
      const nightStart = startDay + day * DAY + 21.7 * 3600000;
      for (let k = 0; k < perDay && made < n; k++) {
        const bad = patterns.length && rnd() < 0.62;
        const p = (name) => bad && patterns.includes(name);
        let start = p('night') ? nightStart + k * 14 * 60000 : t;
        let dur = Math.round(clamp(gauss(rnd, 15.5 * 60, 3.2 * 60), 8 * 60, 32 * 60));
        if (p('short')) dur = Math.round(200 + rnd() * 160);
        const gap = p('burst') ? 60 + rnd() * 90 : 6 * 60 + rnd() * 20 * 60;
        if (p('burst')) dur = Math.round(260 + rnd() * 120);
        t = start + (dur + gap) * 1000;
        if (round === 3 && start > NOW) continue;
        const d = makeDemo(rnd, booth);
        let answers = makeAnswers(rnd, round, booth, d);
        if (p('duplicate') && lastAnswers) answers = JSON.parse(JSON.stringify(lastAnswers));
        if (p('straight')) Object.keys(answers.q_services).forEach((k2) => { answers.q_services[k2] = '3'; });
        let gps = { lat: booth.lat + (rnd() - 0.5) * 0.008, lng: booth.lng + (rnd() - 0.5) * 0.008, acc: Math.round(5 + rnd() * 20) };
        if (p('gps_far')) gps = { lat: home.lat + (rnd() - 0.5) * 0.0004, lng: home.lng + (rnd() - 0.5) * 0.0004, acc: Math.round(8 + rnd() * 12) };
        if (p('cluster')) gps = { lat: booth.lat + 0.0012, lng: booth.lng - 0.0009, acc: 6 };
        if (rnd() < 0.015) gps.acc = Math.round(120 + rnd() * 200);
        counter++;
        const rec = {
          id: `${round === 3 ? 'INT' : 'R' + round}-${String(counter).padStart(5, '0')}`,
          round,
          surveyorId: sv.id,
          boothId: booth.id,
          mandalId: booth.mandalId,
          constituencyId: booth.constituencyId,
          startedAt: Math.round(start),
          durationSec: dur,
          gps,
          consent: { agreed: true, audio: true, consentRead: !p('no_consent'), recordingSec: dur + 20 },
          device: sv.device === 'iPhone' ? 'iOS 18.4 · Pulse 2.4.1' : 'Android 14 · Pulse 2.4.1',
          answers,
          source: round === 1 ? 'GoSurvey import' : 'Pulse Field app',
          syncedAt: Math.round(start + dur * 1000 + rnd() * 3600000),
        };
        finalise(rec, rnd);
        lastAnswers = answers;
        out.push(rec);
        made++;
      }
    }
  });
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

// Generate a single new interview for the live simulation.
export function simulateInterview(seed, surveyors, opts = {}) {
  const rnd = mulberry32(seed);
  const svList = surveyors.filter((s) => s.role === 'Surveyor');
  const sv = opts.surveyorId ? svList.find((s) => s.id === opts.surveyorId) : pick(rnd, svList);
  const booth = BOOTH_BY_ID[sv.boothIds[0]];
  const d = makeDemo(rnd, booth);
  const answers = makeAnswers(rnd, 3, booth, d);
  const suspicious = rnd() < 0.22;
  const kind = suspicious ? pick(rnd, ['short', 'gps_far', 'straight', 'no_consent']) : null;
  const dur = kind === 'short' ? Math.round(180 + rnd() * 120) : Math.round(clamp(gauss(rnd, 15 * 60, 3 * 60), 8 * 60, 30 * 60));
  if (kind === 'straight') Object.keys(answers.q_services).forEach((k) => { answers.q_services[k] = '4'; });
  const gps = kind === 'gps_far'
    ? { lat: booth.lat + 0.05 + rnd() * 0.03, lng: booth.lng + 0.04, acc: 9 }
    : { lat: booth.lat + (rnd() - 0.5) * 0.008, lng: booth.lng + (rnd() - 0.5) * 0.008, acc: Math.round(5 + rnd() * 15) };
  const now = opts.now || Date.now();
  const rec = {
    id: `INT-L${String(seed).slice(-6)}`,
    round: 3,
    surveyorId: sv.id,
    boothId: booth.id,
    mandalId: booth.mandalId,
    constituencyId: booth.constituencyId,
    startedAt: now - dur * 1000,
    durationSec: dur,
    gps,
    consent: { agreed: true, audio: true, consentRead: kind !== 'no_consent', recordingSec: dur + 15 },
    device: sv.device === 'iPhone' ? 'iOS 18.4 · Pulse 2.4.1' : 'Android 14 · Pulse 2.4.1',
    answers,
    source: 'Pulse Field app',
    syncedAt: now,
    live: true,
  };
  finalise(rec, rnd);
  return rec;
}
