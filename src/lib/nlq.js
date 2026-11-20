// "Ask in plain English" -> chart spec. A transparent intent parser that runs fully offline.
// When Claude is configured on the server, the same contract is filled by the model instead (server/ai.js).
//
// Works for any questionnaire: questions are found by their role (lib/roles.js), by keywords for well-known roles,
// and otherwise by matching words from each question's own English wording.
import { GEO } from '../data/geo.js';
import { allQuestions } from '../data/questionnaire.js';
import { rolesOf, piiQuestions, activeQuestionnaire } from './roles.js';

// Keywords for well-known roles (and a few starter-questionnaire questions, matched by id when present)
const ROLE_KEYWORDS = [
  ['id:q_lean', /\b(lean|leaning|swing|undecided)\b/],
  ['id:q_vote_reason', /\b(reason|why)\b/],
  ['second', /\b(cm|chief minister|leader|preferred cm)\b/],
  ['id:q_voted_last', /\b(voted last|last election|turnout)\b/],
  ['id:q_scheme_which', /\bwhich scheme|scheme types?|schemes? used\b/],
  ['scheme', /\b(scheme|welfare|beneficiar|benefit)/],
  ['rating', /\b(rating|rate the government|satisf|approval|government performance|govt)\b/],
  ['services', /\b(service|roads?|water|electricity|power|hospital|school)/],
  ['issues', /\b(issue|problem|concern|priorit)/],
  ['occupation', /\b(occupation|profession|work)\b/],
  ['main', /\b(vote|voting|party|parties|elect|support|lead|leading|winning|ahead)/],
];

const DIM_KEYWORDS = [
  ['round', /\b(last round|previous round|round 2|change|changed|trend|compared? (to|with) (last|previous)|since august|over time)\b/],
  ['role:gender', /\b(by|across|among|between) (gender|sex|men and women|women and men)|\bgender\b|\bmen vs women|women vs men/],
  ['ageBand', /\b(by|across) age|age group|\bage\b|young vs old|generation/],
  ['role:caste', /\b(by|across) caste|caste|community|social group/],
  ['mandal', /\bmandal(s|-wise| wise)?\b/],
  ['constituency', /\b(constituenc|seat|by area|by region|region|district|each place|where)/],
  ['role:occupation', /\b(by|across) (occupation|profession)|farmers vs/],
  ['role:scheme', /\b(by|among) (beneficiar|scheme)/],
];

const STOP = new Set(['what', 'which', 'your', 'you', 'the', 'this', 'that', 'with', 'from', 'have', 'does', 'how', 'would', 'about', 'there',
  'their', 'they', 'were', 'will', 'area', 'select', 'all', 'apply', 'any', 'for', 'and', 'are', 'did', 'today', 'into', 'most', 'many', 'much']);
const words = (t) => (String(t || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w));

function analysable(qn) {
  const pii = new Set(piiQuestions(qn));
  return allQuestions(qn).filter((q) => !pii.has(q.id) && ['single', 'multiple', 'grid', 'number'].includes(q.type) && !q.endIf);
}

export function suggestions(qn = activeQuestionnaire()) {
  const r = rolesOf(qn);
  if (r.main === 'q_vote_intent') {
    return ['Who is leading in each constituency?', 'Vote share among women by age group', 'How has vote intention changed since last round?',
      'Top issues for young voters', 'Government rating by caste', `Which services are rated worst in ${GEO.constituencies[2]?.name.en || 'each constituency'}?`,
      'Scheme beneficiaries by constituency', 'Preferred CM among farmers'];
  }
  const qs = analysable(qn);
  const main = qs.find((q) => q.id === r.main) || qs[0];
  if (!main) return [];
  const short = main.label.en.replace(/[?.]$/, '');
  return [
    `${short} in each constituency`,
    r.gender && `${short} by gender`,
    `${short}: change since last round`,
    ...qs.filter((q) => q !== main).slice(0, 3).map((q) => q.label.en.replace(/[?.]$/, '')),
  ].filter(Boolean);
}

export function parseQuestion(text, qn = activeQuestionnaire()) {
  const s = ` ${String(text).toLowerCase()} `;
  const r = rolesOf(qn);
  const qs = analysable(qn);
  const has = (id) => !!id && qs.some((q) => q.id === id);
  const resolve = (k) => (k.startsWith('id:') ? k.slice(3) : r[k]);

  // 1) well-known roles by keyword  2) words from the question wording  3) the main result question
  let qid = null;
  for (const [k, re] of ROLE_KEYWORDS) { const id = resolve(k); if (has(id) && re.test(s)) { qid = id; break; } }
  if (!qid) {
    const asked = new Set(words(s));
    let best = 0;
    qs.forEach((q) => {
      const score = [...new Set(words(`${q.label.en} ${(q.options || []).map((o) => o.en).join(' ')}`))].filter((w) => asked.has(w)).length;
      if (score > best) { best = score; qid = q.id; }
    });
  }
  if (!qid) qid = has(r.main) ? r.main : qs.find((q) => q.type === 'single')?.id || qs[0]?.id || null;

  let by = null;
  for (const [k, re] of DIM_KEYWORDS) {
    const key = k.startsWith('role:') ? r[k.slice(5)] : k;
    if (key && key !== qid && re.test(s) && (k !== 'ageBand' || r.age)) { by = key; break; }
  }
  if (!by && /\beach\b|\bevery\b/.test(s)) by = 'constituency';

  const filters = {};
  const notes = [];
  GEO.constituencies.forEach((c) => {
    if (s.includes(` ${c.name.en.toLowerCase()}`) || (c.name.te && s.includes(c.name.te))) { filters.constituency = c.id; notes.push(c.name.en); }
  });
  GEO.mandals.forEach((m) => {
    const n = m.name.en.toLowerCase();
    if (!filters.constituency && s.includes(` ${n}`) && !n.endsWith('urban')) { filters.mandal = m.id; notes.push(`${m.name.en} mandal`); }
  });
  const opts = (role) => allQuestions(qn).find((q) => q.id === r[role])?.options || [];
  if (r.gender && by !== r.gender) {
    const female = opts('gender').find((o) => /^(f|female|women|woman)$/i.test(o.v) || /^(female|woman|women)/i.test(o.en));
    const male = opts('gender').find((o) => /^(m|male|men|man)$/i.test(o.v) || /^(male|man|men)\b/i.test(o.en));
    if (female && /\b(women|female|ladies)\b/.test(s)) { filters.gender = female.v; notes.push('Women'); } else if (male && /\b(men|male)\b/.test(s)) { filters.gender = male.v; notes.push('Men'); }
  }
  if (r.age && by !== 'ageBand' && /\b(young|youth|first[- ]time|18-25|students?)\b/.test(s)) { filters.ageBand = '18-25'; notes.push('Age 18-25'); }
  if (r.age && by !== 'ageBand' && /\b(elderly|senior|old(er)? voters|51\+|above 50)\b/.test(s)) { filters.ageBand = '51+'; notes.push('Age 51+'); }
  if (r.caste && by !== r.caste) {
    const hit = opts('caste').find((o) => new RegExp(`\\b${String(o.v).toLowerCase().replace(/[^a-z0-9]/g, '')}s?\\b`).test(s) || (o.en.length > 2 && s.includes(` ${o.en.toLowerCase()}`)));
    if (hit) { filters.caste = hit.v; notes.push(hit.en); }
  }
  if (r.occupation && qid !== r.occupation && /\bfarmers?\b/.test(s)) {
    const farm = opts('occupation').find((o) => /farm/i.test(o.en));
    if (farm) { filters.occupation = farm.v; notes.push('Farmers'); }
  }

  const type = qs.find((q) => q.id === qid)?.type;
  let chart = by ? 'stacked' : 'bar';
  if (/\bpie|share of|split\b/.test(s) && !by) chart = 'pie';
  if (type === 'grid') chart = by ? 'grouped' : 'bar';
  if (by === 'round') chart = 'compare';
  if (type === 'number' && by) chart = 'mean';
  return { qid, by, filters, chart, notes };
}

// Kept for older imports
export const SUGGESTIONS = suggestions();
