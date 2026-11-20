// "Ask in plain English" -> chart spec. A transparent intent parser that runs fully offline.
// In production the same contract is served by an LLM hosted in MSR's AWS account (data stays in India).
import { GEO } from '../data/geo.js';

const Q_KEYWORDS = [
  ['q_lean', /\b(lean|leaning|swing|undecided)\b/],
  ['q_vote_reason', /\b(reason|why)\b/],
  ['q_leader', /\b(cm|chief minister|leader|preferred cm)\b/],
  ['q_voted_last', /\b(voted last|last election|turnout)\b/],
  ['q_scheme_which', /\bwhich scheme|scheme types?|schemes? used\b/],
  ['q_scheme', /\b(scheme|welfare|beneficiar|benefit)/],
  ['q_govt_rating', /\b(rating|rate the government|satisf|approval|government performance|govt)\b/],
  ['q_services', /\b(service|roads?|water|electricity|power|hospital|school)/],
  ['q_issues', /\b(issue|problem|concern|priorit)/],
  ['q_occupation', /\b(occupation|profession|work)\b/],
  ['q_vote_intent', /\b(vote|voting|party|parties|elect|support|lead|winning|ahead)/],
];

const DIM_KEYWORDS = [
  ['round', /\b(last round|previous round|round 2|change|trend|compared? (to|with) (last|previous)|since august|over time)\b/],
  ['q_gender', /\b(by|across|among|between) (gender|sex|men and women|women and men)|\bgender\b|\bmen vs women|women vs men/],
  ['ageBand', /\b(by|across) age|age group|\bage\b|young vs old|generation/],
  ['q_caste', /\b(by|across) caste|caste|community|social group/],
  ['mandal', /\bmandal(s|-wise| wise)?\b/],
  ['constituency', /\b(constituenc|seat|by area|by region|region|district|each place|where)/],
  ['q_occupation', /\b(by|across) (occupation|profession)|farmers vs/],
  ['q_scheme', /\b(by|among) (beneficiar|scheme)/],
];

export const SUGGESTIONS = [
  'Who is leading in each constituency?',
  'Vote share among women by age group',
  'How has vote intention changed since last round?',
  'Top issues for young voters',
  'Government rating by caste',
  'Which services are rated worst in Nalgonda?',
  'Scheme beneficiaries by constituency',
  'Preferred CM among farmers',
];

export function parseQuestion(text) {
  const s = ` ${text.toLowerCase()} `;
  let qid = (Q_KEYWORDS.find(([, re]) => re.test(s)) || ['q_vote_intent'])[0];
  let by = null;
  for (const [k, re] of DIM_KEYWORDS) {
    if (re.test(s) && k !== qid) { by = k; break; }
  }
  if (!by && /\beach\b|\bevery\b/.test(s)) by = 'constituency';
  const filters = {};
  const notes = [];
  GEO.constituencies.forEach((c) => {
    if (s.includes(c.name.en.toLowerCase()) || s.includes(c.name.te)) { filters.constituency = c.id; notes.push(c.name.en); }
  });
  GEO.mandals.forEach((m) => {
    const n = m.name.en.toLowerCase();
    if (!filters.constituency && s.includes(n) && !n.endsWith('urban')) { filters.mandal = m.id; notes.push(m.name.en + ' mandal'); }
  });
  if (by !== 'q_gender') {
    if (/\b(women|female|ladies)\b/.test(s)) { filters.gender = 'Female'; notes.push('Women'); }
    else if (/\b(men|male)\b/.test(s)) { filters.gender = 'Male'; notes.push('Men'); }
  }
  if (by !== 'ageBand' && /\b(young|youth|first[- ]time|18-25|students?)\b/.test(s)) { filters.ageBand = '18-25'; notes.push('Age 18-25'); }
  if (by !== 'ageBand' && /\b(elderly|senior|old(er)? voters|51\+|above 50)\b/.test(s)) { filters.ageBand = '51+'; notes.push('Age 51+'); }
  if (by !== 'q_caste') {
    const cm = s.match(/\b(sc|st|bc|oc|minority|minorities)\b/);
    if (cm) { const v = { sc: 'SC', st: 'ST', bc: 'BC', oc: 'OC', minority: 'Minority', minorities: 'Minority' }[cm[1]]; filters.caste = v; notes.push(v); }
  }
  if (/\bfarmers?\b/.test(s) && qid !== 'q_occupation') { filters.occupation = 'FARM'; notes.push('Farmers'); }
  let chart = by ? 'stacked' : 'bar';
  if (/\bpie|share of|split\b/.test(s) && !by) chart = 'pie';
  if (qid === 'q_services') chart = by ? 'grouped' : 'bar';
  if (by === 'round') chart = 'compare';
  if (qid === 'q_govt_rating' && by) chart = 'mean';
  return { qid, by, filters, chart, notes };
}
