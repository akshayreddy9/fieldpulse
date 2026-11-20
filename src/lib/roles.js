// Question roles: which question in a questionnaire plays which part.
//
// Booth quotas need to know which question is Gender / Age / Caste; the privacy lock needs the respondent's name and
// mobile; roll-ups, trends and the report need the "main result" question; and so on. Admins mark this in the
// questionnaire builder ("Used for"), stored as q.role. Questionnaires without marks fall back to the IDs used by
// the MSR starter questionnaire (q_gender, q_vote_intent, ...), so older surveys and data keep working.
import { allQuestions, SAMPLE_QUESTIONNAIRE } from '../data/questionnaire.js';

export const ROLE_DEFS = [
  { role: 'gender', label: 'Gender (booth quotas, filters)', types: ['single'], legacy: 'q_gender' },
  { role: 'age', label: 'Age in years (booth quotas)', types: ['number'], legacy: 'q_age' },
  { role: 'caste', label: 'Caste category (booth quotas, filters)', types: ['single'], legacy: 'q_caste' },
  { role: 'occupation', label: 'Occupation (filters)', types: ['single'], legacy: 'q_occupation' },
  { role: 'name', label: 'Respondent name (kept private)', types: ['text'], legacy: 'q_name', pii: true },
  { role: 'phone', label: 'Respondent mobile (kept private)', types: ['text', 'number'], legacy: 'q_phone', pii: true },
  { role: 'main', label: 'Main result (roll-up, trends, report headline)', types: ['single'], legacy: 'q_vote_intent' },
  { role: 'second', label: 'Second headline result (client portal)', types: ['single'], legacy: 'q_leader' },
  { role: 'issues', label: 'Top concerns (report)', types: ['multiple', 'single'], legacy: 'q_issues' },
  { role: 'rating', label: 'Overall rating number (report)', types: ['number'], legacy: 'q_govt_rating' },
  { role: 'services', label: 'Service ratings grid (report)', types: ['grid'], legacy: 'q_services' },
  { role: 'scheme', label: 'Yes / No group to compare (report)', types: ['single'], legacy: 'q_scheme' },
];
export const ROLE_BY = Object.fromEntries(ROLE_DEFS.map((d) => [d.role, d]));
export const AGE_BANDS = ['18-25', '26-35', '36-50', '51+'];

const cache = new WeakMap();
// { gender: 'q_gender' | null, age: ..., ... } for one questionnaire
export function rolesOf(qn) {
  if (!qn || typeof qn !== 'object') return Object.fromEntries(ROLE_DEFS.map((d) => [d.role, null]));
  if (cache.has(qn)) return cache.get(qn);
  const qs = allQuestions(qn);
  const out = {};
  ROLE_DEFS.forEach(({ role, legacy, types }) => {
    const marked = qs.find((q) => q.role === role);
    const old = !marked && qs.find((q) => q.id === legacy && !q.role && types.includes(q.type));
    out[role] = (marked || old)?.id || null;
  });
  cache.set(qn, out);
  return out;
}

// Which role (if any) a question plays in a questionnaire
export function roleOfQuestion(qn, qid) {
  const r = rolesOf(qn);
  return Object.keys(r).find((k) => r[k] === qid) || null;
}

// ---------- The questionnaire currently open in this app ----------
// The browser works on one survey at a time; the store sets it here so shared helpers (quotas, quality checks) can use it.
// The server serves many surveys, so it always passes the questionnaire explicitly instead.
let active = { qn: SAMPLE_QUESTIONNAIRE, roles: rolesOf(SAMPLE_QUESTIONNAIRE) };
export function setActiveQuestionnaire(qn) {
  if (!qn || qn === active.qn) return false;
  active = { qn, roles: rolesOf(qn) };
  return true;
}
export const activeQuestionnaire = () => active.qn;
// Question id for a role in the open questionnaire (or in qn when given)
export const R = (role, qn) => (qn ? rolesOf(qn) : active.roles)[role] || null;
// Answer for a role in an interview
export const A = (i, role, qn) => { const id = R(role, qn); return id ? i?.answers?.[id] : undefined; };

const questionFor = (role, qn = active.qn) => { const id = R(role, qn); return id ? allQuestions(qn).find((q) => q.id === id) : null; };
export { questionFor };

// Quota categories for booth targets: the options of the Gender and Caste questions ("Other" gender is not a quota group)
export function targetCategories(qn = active.qn) {
  const g = questionFor('gender', qn);
  const c = questionFor('caste', qn);
  return {
    gender: (g?.options || []).filter((o) => !/^other$/i.test(o.v) && !/^other\b/i.test(o.en || '')),
    age: R('age', qn) ? AGE_BANDS.map((v) => ({ v, en: v })) : [],
    caste: c?.options || [],
  };
}

// Personal-detail questions: those marked as private, plus the name / mobile roles
export function piiQuestions(qn) {
  const r = rolesOf(qn);
  const ids = new Set(qn ? allQuestions(qn).filter((q) => q.pii).map((q) => q.id) : []);
  if (r.name) ids.add(r.name);
  if (r.phone) ids.add(r.phone);
  return [...ids];
}
// 'phone' codes look like mobile numbers, everything else like names
export function piiKind(qn, qid) {
  const q = qn ? allQuestions(qn).find((x) => x.id === qid) : null;
  return R('phone', qn) === qid || q?.inputMode === 'tel' || /phone|mobile/i.test(qid) ? 'phone' : 'name';
}

// Problems with the role marks, shown in the builder's "Checks before publishing"
export function roleProblems(qn) {
  const out = [];
  const qs = allQuestions(qn);
  ROLE_DEFS.forEach(({ role, label, types }) => {
    const marked = qs.filter((q) => q.role === role);
    if (marked.length > 1) out.push({ q: marked[1].id, msg: `Only one question can be used for “${label}”` });
    marked.forEach((q) => { if (!types.includes(q.type)) out.push({ q: q.id, msg: `“${label}” must be a ${types.join(' or ')} question` }); });
  });
  return out;
}
