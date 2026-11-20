// AI features powered by Claude: the client-report first draft and "ask the data in plain English".
// Only aggregated statistics are sent to the model, never names, phone numbers or individual answers.
// If no Claude credentials are configured, or the model declines, callers fall back to the built-in logic.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { allQuestions, findQuestion } from '../src/data/questionnaire.js';
import { GEO } from '../src/data/geo.js';
import { dimensions } from '../src/lib/analytics.js';
import { rolesOf, piiQuestions, AGE_BANDS } from '../src/lib/roles.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
let client = null;

export function aiEnabled() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.AI_DISABLED !== '1';
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// One structured-output call with server-side refusal fallback. Returns parsed data, or null on refusal / bad output.
async function structured(schema, system, user, effort = 'medium') {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: zodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

const REPORT_SYSTEM = `You write sections of a client report for Micro Studies and Research Organisation (MSR), an Indian public-opinion research firm.
Write in clear, neutral, professional English for a client reading a survey report.
Use only the numbers that appear in the facts and the reference draft you are given; never invent, round differently, or estimate numbers.
Do not give strategic advice or recommendations: MSR's analysts write that section themselves.
Keep each section to one to three short paragraphs. Bullet lists (lines starting with "• ") are fine where the reference draft uses them.`;

const ReportSchema = z.object({
  sections: z.array(z.object({
    id: z.enum(['summary', 'method', 'vote', 'issues', 'gov', 'seats']),
    body: z.string(),
  })),
});

// draft: sections from the built-in generator (all numbers computed from the data). facts: extra aggregates.
export async function aiReportDraft(draft, facts) {
  const reference = draft.filter((s) => s.source === 'ai').map((s) => ({ id: s.id, title: s.title, body: s.body }));
  const out = await structured(ReportSchema, REPORT_SYSTEM,
    `Rewrite each section of this survey report so it reads as polished analysis for the client. Keep every number exactly as given, and do not add findings that are not in the draft.\n\n<facts>\n${JSON.stringify(facts)}\n</facts>\n\n<reference_draft>\n${JSON.stringify(reference)}\n</reference_draft>\n\nReturn one entry per section id in the draft: ${reference.map((s) => s.id).join(', ')}.`);
  if (!out) return null;
  const byId = Object.fromEntries(out.sections.map((s) => [s.id, s.body]));
  return draft.map((s) => (s.source === 'ai' && byId[s.id] ? { ...s, body: byId[s.id], model: MODEL } : s));
}

export async function aiParseQuestion(text, qn) {
  // Everything comes from this survey's questionnaire (question roles) and the current booth list
  const pii = new Set(piiQuestions(qn));
  const qs = allQuestions(qn).filter((q) => (q.type === 'single' || q.type === 'multiple' || q.type === 'grid' || q.type === 'number') && !pii.has(q.id) && !q.endIf);
  if (!qs.length) return null;
  const qids = qs.map((q) => q.id);
  const DIMS = dimensions(qn);
  const dims = ['none', 'round', ...DIMS.map((d) => d.key)];
  const r = rolesOf(qn);
  const optsOf = (role) => (findQuestion(qn, r[role])?.options || []).map((o) => o.v);
  const schema = z.object({
    qid: z.enum(qids),
    by: z.enum(dims),
    constituency: z.enum(['', ...GEO.constituencies.map((c) => c.id)]),
    mandal: z.enum(['', ...GEO.mandals.map((m) => m.id)]),
    gender: z.enum(['', ...optsOf('gender')]),
    ageBand: z.enum(['', ...(r.age ? AGE_BANDS : [])]),
    caste: z.enum(['', ...optsOf('caste')]),
    occupation: z.enum(['', ...optsOf('occupation')]),
  });
  const catalogue = {
    questions: qs.map((q) => ({ id: q.id, type: q.type, text: q.label.en })),
    breakdowns: { none: 'no breakdown', round: 'compare with the previous survey round', ...Object.fromEntries(DIMS.map((d) => [d.key, d.en])) },
    filter_values: Object.fromEntries(['gender', 'caste', 'occupation'].filter((k) => r[k]).map((k) => [k, (findQuestion(qn, r[k])?.options || []).map((o) => ({ value: o.v, text: o.en }))])),
    constituencies: GEO.constituencies.map((c) => ({ id: c.id, name: c.name.en, te: c.name.te })),
    mandals: GEO.mandals.map((m) => ({ id: m.id, name: m.name.en })),
  };
  const out = await structured(schema,
    'You translate a plain-language question about survey results (English or Telugu) into a query over a fixed survey. Pick the single best matching question, an optional breakdown, and filters. Use empty strings for filters that are not mentioned. Never use the same field as both question and breakdown.',
    `<catalogue>\n${JSON.stringify(catalogue)}\n</catalogue>\n\n<user_question>\n${text}\n</user_question>`, 'low');
  if (!out) return null;
  const filters = {};
  const notes = [];
  ['constituency', 'mandal', 'gender', 'ageBand', 'caste', 'occupation'].forEach((k) => { if (out[k]) { filters[k] = out[k]; notes.push(`${k}: ${out[k]}`); } });
  const by = out.by === 'none' || out.by === out.qid ? null : out.by;
  const type = qs.find((q) => q.id === out.qid)?.type;
  let chart = by ? 'stacked' : 'bar';
  if (type === 'grid') chart = by ? 'grouped' : 'bar';
  if (type === 'number' && by) chart = 'mean';
  if (by === 'round') chart = 'compare';
  return { qid: out.qid, by, filters, chart, notes, ai: true };
}
