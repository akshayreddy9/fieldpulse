// Pulse Live fake-interview detection engine.
// Each rule adds weight to a 0-100 risk score with a human-readable reason.
import { BOOTH_BY_ID, distanceKm } from '../data/geo.js';
import { allQuestions } from '../data/questionnaire.js';
import { activeQuestionnaire, piiQuestions, A } from './roles.js';

export const RULES = [
  { id: 'SHORT', name: 'Too short', weight: 40, desc: 'Interview took under 45% of the median time for this questionnaire.' },
  { id: 'GPS_FAR', name: 'Away from booth', weight: 45, desc: 'GPS location is more than 1.5 km from the assigned booth.' },
  { id: 'DUPLICATE', name: 'Duplicate answers', weight: 35, desc: 'Answers match another interview by the same surveyor exactly.' },
  { id: 'NO_CONSENT', name: 'Consent line not read', weight: 40, desc: 'AI checker could not find the consent statement in the recording.' },
  { id: 'BURST', name: 'Back-to-back', weight: 20, desc: 'Started less than 4 minutes after the surveyor’s previous interview ended.' },
  { id: 'CLUSTER', name: 'Same spot', weight: 20, desc: '3 or more interviews by this surveyor from the same spot (within 20 m).' },
  { id: 'STRAIGHT', name: 'Straight-lining', weight: 15, desc: 'Every row of a rating grid (4 or more rows) has the same answer.' },
  { id: 'NIGHT', name: 'Odd hours', weight: 15, desc: 'Interview started before 7 AM or after 9 PM.' },
  { id: 'LOW_ACC', name: 'Weak GPS', weight: 10, desc: 'GPS accuracy worse than 100 m.' },
];
export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));
export const FLAG_THRESHOLD = 40;

// Questions whose answers are compared for "identical answer sets": everything the respondent answered, except
// personal details and things that are naturally the same for one surveyor (location, date, GPS, photo).
function compareSet(qn) {
  const skip = new Set(piiQuestions(qn));
  return allQuestions(qn).filter((q) => !skip.has(q.id) && !['cascade', 'gps', 'photo', 'date'].includes(q.type)).map((q) => q.id);
}
function signature(a, ids) {
  return JSON.stringify(ids.map((id) => a[id] ?? null));
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// qn: the survey's questionnaire (the server passes it; the browser uses the open survey's)
export function assessAll(interviews, qn = activeQuestionnaire()) {
  const ids = compareSet(qn);
  const grids = allQuestions(qn).filter((q) => q.type === 'grid' && (q.rows || []).length >= 4);
  const med = median(interviews.map((i) => i.durationSec)) || 900;
  const bySv = {};
  interviews.forEach((i) => { (bySv[i.surveyorId] ||= []).push(i); });
  const result = {};
  Object.values(bySv).forEach((list) => {
    list.sort((a, b) => a.startedAt - b.startedAt);
    const sigCount = {};
    const sigOf = new Map(list.map((i) => [i, signature(i.answers || {}, ids)]));
    list.forEach((i) => { const s = sigOf.get(i); sigCount[s] = (sigCount[s] || 0) + 1; });
    list.forEach((i, idx) => {
      const flags = [];
      const booth = BOOTH_BY_ID[i.boothId];
      if (i.durationSec < med * 0.45) flags.push({ id: 'SHORT', detail: `${Math.round(i.durationSec / 60)} min vs median ${Math.round(med / 60)} min` });
      const dist = booth ? distanceKm(i.gps, booth) : 0;
      if (dist > 1.5) flags.push({ id: 'GPS_FAR', detail: `${dist.toFixed(1)} km from ${booth.short}` });
      if (ids.length >= 3 && sigCount[sigOf.get(i)] > 1) flags.push({ id: 'DUPLICATE', detail: `${sigCount[sigOf.get(i)]} identical answer sets` });
      if (i.consent && i.consent.consentRead === false) flags.push({ id: 'NO_CONSENT', detail: 'Consent script not detected in audio' });
      const prev = list[idx - 1];
      if (prev) {
        const gapMin = (i.startedAt - (prev.startedAt + prev.durationSec * 1000)) / 60000;
        if (gapMin < 4) flags.push({ id: 'BURST', detail: `${Math.max(0, gapMin).toFixed(1)} min after ${prev.id}` });
      }
      const near = list.filter((j) => j !== i && distanceKm(j.gps, i.gps) < 0.02).length;
      if (near >= 3) flags.push({ id: 'CLUSTER', detail: `${near + 1} interviews at the same spot` });
      const flat = grids.find((q) => { const g = Object.values(i.answers?.[q.id] || {}); return g.length >= 4 && g.every((v) => v === g[0]); });
      if (flat) {
        const v = Object.values(i.answers[flat.id])[0];
        flags.push({ id: 'STRAIGHT', detail: `All rows of “${flat.label.en.slice(0, 40)}” answered “${flat.cols?.find((c) => c.v === v)?.en || v}”` });
      }
      const hr = Math.floor(((i.startedAt / 3600000) + 5.5) % 24);
      if (hr < 7 || hr >= 21) flags.push({ id: 'NIGHT', detail: `Started ${new Date(i.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` });
      if (i.gps.acc > 100) flags.push({ id: 'LOW_ACC', detail: `±${i.gps.acc} m` });
      const score = Math.min(100, flags.reduce((s, f) => s + RULE_BY_ID[f.id].weight, 0));
      result[i.id] = { score, flags, risk: score >= 60 ? 'High' : score >= FLAG_THRESHOLD ? 'Medium' : score > 0 ? 'Low' : 'Clean', distanceKm: dist };
    });
  });
  return result;
}

// Default review status from score (MSR reviewers can override)
export function autoStatus(q) {
  return q && q.score >= FLAG_THRESHOLD ? 'Flagged' : 'Accepted';
}

// Simulated AI interview checker transcript (Telugu + English) for the review screen.
export function buildTranscript(interview, qn) {
  const a = interview.answers;
  const lines = [];
  let t = 0;
  const push = (who, te, en, tag) => { lines.push({ t, who, te, en, tag }); t += 6 + Math.floor((en.length / 12)); };
  push('Surveyor', 'నమస్తే అండి.', 'Namaste.');
  if (interview.consent.consentRead) {
    push('Surveyor', qn.consentScript.te, qn.consentScript.en, 'consent');
    push('Respondent', 'సరే, అడగండి.', 'Okay, go ahead.', 'agree');
  } else {
    push('Surveyor', 'కొన్ని ప్రశ్నలు అడుగుతాను, సరేనా?', 'I will ask a few questions, okay?', 'consent-missing');
    push('Respondent', 'హా.', 'Yes.');
  }
  const age = A(interview, 'age', qn) ?? a.q_age;
  if (age !== undefined) {
    push('Surveyor', 'మీ వయస్సు ఎంత?', 'What is your age?');
    push('Respondent', `${age} సంవత్సరాలు.`, `${age} years.`);
  }
  push('Surveyor', 'మీ ప్రాంతంలో ప్రధాన సమస్యలు ఏమిటి?', 'What are the main problems in your area?');
  push('Respondent', 'ఉద్యోగాలు లేవు, ధరలు పెరిగిపోయాయి.', 'No jobs, prices have gone up.');
  push('Surveyor', 'ఈరోజు ఎన్నికలు జరిగితే ఏ పార్టీకి ఓటు వేస్తారు?', 'If elections were held today, which party would you vote for?');
  push('Respondent', '...ఆలోచించి చెబుతాను.', '...let me think.');
  push('Surveyor', 'సరే, ధన్యవాదాలు.', 'Okay, thank you.');
  return lines;
}
