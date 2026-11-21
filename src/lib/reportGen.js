// First draft of the client report. Every sentence is computed from the live data (nothing is pre-written about
// the findings); MSR analysts then edit the text and write the "MSR Advice" section themselves.
//
// Works for any questionnaire: it uses the questions marked in the builder as Main result, Top concerns, Rating,
// Service grid, Yes/No group, Gender, Age and Occupation (lib/roles.js). Sections whose questions are missing are left out.
import { GEO } from '../data/geo.js';
import { allQuestions, findQuestion } from '../data/questionnaire.js';
import { frequency, compareRounds, crosstab, fmtPct } from './analytics.js';
import { rolesOf, piiQuestions } from './roles.js';

const pp = (x) => (Math.abs(x) < 0.05 ? 'no change' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)} pts`);
// Answers that are not a real choice (undecided, won't say, other ...) are not counted as "leading"
const NON_CHOICE = /^(und|ns|dk|none|other|na|refused)$/i;
const NON_CHOICE_TEXT = /undecided|not decided|won.?t say|don.?t know|no answer|refused|none|other/i;
export const isRealChoice = (r) => !NON_CHOICE.test(String(r.key)) && !NON_CHOICE_TEXT.test(r.label || '');
const isUndecided = (r) => /^und$/i.test(String(r.key)) || /undecided|not decided/i.test(r.label || '');
const short = (q) => (q?.label.en || '').replace(/[?.]$/, '');

// The question the report leads with: the one marked "Main result", else the first single-choice question
export function mainQuestionId(qn) {
  const r = rolesOf(qn);
  if (r.main) return r.main;
  const pii = new Set(piiQuestions(qn));
  return allQuestions(qn).find((q) => q.type === 'single' && !q.endIf && !pii.has(q.id) && (q.options || []).length > 2)?.id || null;
}

export function generateReport(qn, cur, prev, quality, statuses) {
  const r = rolesOf(qn);
  const hasPrev = prev && prev.length > 0;
  const mainId = mainQuestionId(qn);
  const mainQ = findQuestion(qn, mainId);
  const sections = [];
  const flagged = Object.values(quality || {}).filter((x) => x.score >= 40).length;
  const rejected = Object.values(statuses || {}).filter((s) => s === 'Rejected').length;
  const dates = cur.map((i) => i.startedAt);
  const from = dates.length ? new Date(Math.min(...dates)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : '—';
  const to = dates.length ? new Date(Math.max(...dates)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  // ---------- main result ----------
  const vi = frequency(qn, mainId, cur);
  const cmp = (hasPrev && compareRounds(qn, mainId, cur, prev)) || [];
  const chg = (k) => cmp.find((x) => x.key === k)?.change ?? 0;
  const choices = (vi?.rows || []).filter(isRealChoice).sort((a, b) => b.pct - a.pct);
  const lead = choices[0];
  const second = choices[1];
  const und = (vi?.rows || []).find(isUndecided);

  // Gender gap and young respondents, for the leading answer
  const genderQ = findQuestion(qn, r.gender);
  const byGender = lead && genderQ ? crosstab(qn, r.gender, mainId, cur) : null;
  const female = genderQ?.options.find((o) => /^f/i.test(o.v) || /^(female|wom)/i.test(o.en));
  const male = genderQ?.options.find((o) => /^m/i.test(o.v) || /^(male|men|man)\b/i.test(o.en));
  const shareIn = (ct, rowKey, colKey) => ct?.rows.find((x) => x.key === rowKey)?.cells.find((c) => c.key === colKey)?.pct;
  const wA = female && shareIn(byGender, female.v, lead?.key);
  const mA = male && shareIn(byGender, male.v, lead?.key);
  const byAge = lead && r.age ? crosstab(qn, 'ageBand', mainId, cur) : null;
  const youth = byAge?.rows.find((x) => x.key === '18-25');
  const youthTop = youth ? youth.cells.map((c) => ({ ...c, label: vi.rows.find((x) => x.key === c.key)?.label })).filter(isRealChoice).sort((a, b) => b.pct - a.pct)[0] : null;
  const youthUnd = youth && und ? youth.cells.find((c) => c.key === und.key)?.pct : undefined;

  // Constituency snapshots
  const byCon = lead ? crosstab(qn, 'constituency', mainId, cur) : null;
  const label = (k) => vi?.rows.find((x) => x.key === k)?.label || k;
  const snapshots = (byCon?.rows || []).map((row) => {
    const sorted = row.cells.filter((c) => isRealChoice({ key: c.key, label: label(c.key) })).sort((a, b) => b.pct - a.pct);
    return sorted.length >= 2 ? { name: row.label, n: row.base, lead: sorted[0], second: sorted[1], margin: sorted[0].pct - sorted[1].pct } : null;
  }).filter(Boolean);
  const close = snapshots.filter((s) => s.margin < 5);

  // ---------- concerns, rating, services, yes/no group ----------
  const issuesF = frequency(qn, r.issues, cur);
  const issues = (issuesF?.rows || []).filter((x) => x.key !== 'OTHER' && x.count > 0).sort((a, b) => b.pct - a.pct);
  const topIssueAmong = (sub) => (frequency(qn, r.issues, sub)?.rows || []).filter((x) => x.key !== 'OTHER' && x.count > 0).sort((a, b) => b.pct - a.pct)[0];
  const ratingQ = findQuestion(qn, r.rating);
  const rating = frequency(qn, r.rating, cur);
  const ratingPrev = hasPrev ? frequency(qn, r.rating, prev) : null;
  const servicesQ = findQuestion(qn, r.services);
  const services = [...(frequency(qn, r.services, cur)?.gridRows || [])].filter((g) => g.dist.some((d) => d.count)).sort((a, b) => a.mean - b.mean);
  const schemeQ = findQuestion(qn, r.scheme);
  const yes = schemeQ?.options.find((o) => /^(y|yes)$/i.test(o.v) || /^yes/i.test(o.en));
  const no = schemeQ?.options.find((o) => /^(n|no)$/i.test(o.v) || /^no\b/i.test(o.en));
  const scheme = yes ? frequency(qn, r.scheme, cur)?.rows.find((x) => x.key === yes.v) : null;
  const bySch = yes && no && lead ? crosstab(qn, r.scheme, mainId, cur) : null;
  const benA = bySch ? shareIn(bySch, yes.v, lead.key) : undefined;
  const nonA = bySch ? shareIn(bySch, no.v, lead.key) : undefined;

  // ---------- sections ----------
  const summary = [];
  if (lead) {
    summary.push(`On “${short(mainQ)}”, ${lead.label} leads with ${fmtPct(lead.pct)}${second ? `, ahead of ${second.label} at ${fmtPct(second.pct)} — a margin of ${(lead.pct - second.pct).toFixed(1)} points` : ''}.`
      + (hasPrev && cmp.length ? ` Since the previous round, ${lead.label} has moved ${pp(chg(lead.key))}.` : '')
      + (und ? ` Undecided: ${fmtPct(und.pct)}${hasPrev && cmp.length ? ` (${pp(chg(und.key))})` : ''}.` : ''));
  }
  const drivers = [];
  if (wA !== undefined && mA !== undefined && Math.abs(wA - mA) >= 3) drivers.push(`${lead.label} does ${wA > mA ? 'better' : 'worse'} among women (${fmtPct(wA)}) than men (${fmtPct(mA)})`);
  // Each finding is a full sentence on its own, so it reads correctly whichever ones apply
  if (benA !== undefined && nonA !== undefined && Math.abs(benA - nonA) >= 3) drivers.push(`${lead.label} does ${benA > nonA ? 'better' : 'worse'} among respondents who answered “${yes.en}” to “${short(schemeQ)}” (${fmtPct(benA)}, against ${fmtPct(nonA)} among the rest)`);
  drivers.forEach((d) => summary.push(`${d}.`));
  if (issues.length >= 2) summary.push(`${issues[0].label} and ${issues[1].label.toLowerCase()} are the most-mentioned concerns.`);
  if (snapshots.length) summary.push(close.length ? `${close.length} of ${snapshots.length} constituencies ${close.length === 1 ? 'is' : 'are'} within a 5-point margin.` : `No constituency is within a 5-point margin.`);
  sections.push({ id: 'summary', title: 'Executive summary', source: 'ai', body: summary.join(' ') || `${cur.length.toLocaleString('en-IN')} interviews have been collected. Mark a “Main result” question in the questionnaire builder to get a written summary.` });

  const quotas = [r.gender && 'gender', r.age && 'age group', r.caste && 'caste category'].filter(Boolean);
  sections.push({
    id: 'method', title: 'Methodology & sample', source: 'ai',
    body: `Face-to-face interviews were conducted with ${cur.length.toLocaleString('en-IN')} adult respondents across ${new Set(cur.map((i) => i.boothId)).size} polling booths in ${new Set(cur.map((i) => i.mandalId)).size} mandals and ${new Set(cur.map((i) => i.constituencyId)).size} constituencies between ${from} and ${to}.${quotas.length ? ` Quotas were set at booth level for ${quotas.join(', ')}.` : ''}\n\n`
      + `Every interview was captured on the MSR Pulse field app with recorded consent, GPS location and timestamp. The automated quality checks flagged ${flagged} interviews (${fmtPct(cur.length ? (flagged / cur.length) * 100 : 0)}) on the day they were collected; after supervisor back-checks, ${rejected} interviews were rejected and excluded from this report.`,
  });

  if (lead) {
    const lines = choices.map((p) => `• ${p.label}: ${fmtPct(p.pct)}${hasPrev && cmp.length ? ` (${pp(chg(p.key))} vs previous round)` : ''}`);
    if (und) lines.push(`• ${und.label}: ${fmtPct(und.pct)}${hasPrev && cmp.length ? ` (${pp(chg(und.key))})` : ''}`);
    const extra = [];
    if (wA !== undefined && mA !== undefined) extra.push(`${lead.label}'s share is ${wA > mA ? 'higher' : 'lower'} among women (${fmtPct(wA)}) than men (${fmtPct(mA)}), a gap of ${Math.abs(wA - mA).toFixed(1)} points.`);
    if (youth) extra.push(`Among respondents aged 18–25, ${youthTop ? `${youthTop.label} leads with ${fmtPct(youthTop.pct)}` : 'no answer leads clearly'}${youthUnd !== undefined ? `, and ${fmtPct(youthUnd)} are undecided` : ''}.`);
    sections.push({ id: 'vote', title: short(mainQ) || 'Main result', source: 'ai', chart: 'vote', body: `${lines.join('\n')}${extra.length ? `\n\n${extra.join(' ')}` : ''}` });
  }

  if (issues.length) {
    const extra = [];
    const young = r.age ? cur.filter((i) => Number(i.answers[r.age]) <= 25) : [];
    const yTop = young.length >= 30 ? topIssueAmong(young) : null;
    if (yTop) extra.push(`Among respondents aged 18–25 the top concern is ${yTop.label.toLowerCase()} (${fmtPct(yTop.pct, 0)}).`);
    const occQ = findQuestion(qn, r.occupation);
    const farm = occQ?.options.find((o) => /farm/i.test(o.en));
    const farmers = farm ? cur.filter((i) => i.answers[r.occupation] === farm.v) : [];
    const fTop = farmers.length >= 30 ? topIssueAmong(farmers) : null;
    if (fTop) extra.push(`Among ${farm.en.toLowerCase()}s it is ${fTop.label.toLowerCase()} (${fmtPct(fTop.pct, 0)}).`);
    // Where the top concern is mentioned most, compared with the overall share
    const where = GEO.constituencies.map((c) => {
      const sub = cur.filter((i) => i.constituencyId === c.id);
      const row = sub.length >= 30 ? frequency(qn, r.issues, sub)?.rows.find((x) => x.key === issues[0].key) : null;
      return row ? { name: c.name.en, pct: row.pct } : null;
    }).filter(Boolean).sort((a, b) => b.pct - a.pct);
    if (where.length >= 2 && where[0].pct - issues[0].pct >= 5) extra.push(`${issues[0].label} is mentioned most in ${where[0].name} (${fmtPct(where[0].pct, 0)}, against ${fmtPct(issues[0].pct, 0)} overall).`);
    sections.push({
      id: 'issues', title: short(findQuestion(qn, r.issues)) || 'Public issues', source: 'ai', chart: 'issues',
      body: `The most-mentioned answers are ${issues.slice(0, 5).map((x) => `${x.label.toLowerCase()} (${fmtPct(x.pct, 0)})`).join(', ')}.${extra.length ? ` ${extra.join(' ')}` : ''}`,
    });
  }

  const gov = [];
  if (rating) gov.push(`“${short(ratingQ)}”: average ${rating.mean.toFixed(1)}${ratingQ.max ? ` out of ${ratingQ.max}` : ''}${ratingPrev?.base ? ` (previous round: ${ratingPrev.mean.toFixed(1)})` : ''}.`);
  if (services.length >= 2) {
    const top = servicesQ.cols?.length || 5;
    const best = services[services.length - 1];
    gov.push(`${best.label} is rated best (${fmtPct(best.goodPct, 0)} give it one of the top two ratings). The lowest rated are ${services[0].label.toLowerCase()} (average ${services[0].mean.toFixed(2)}/${top}) and ${services[1].label.toLowerCase()} (${services[1].mean.toFixed(2)}/${top}).`);
  }
  if (scheme) {
    gov.push(`${fmtPct(scheme.pct, 0)} answered “${yes.en}” to “${short(schemeQ)}”.${benA !== undefined && nonA !== undefined ? ` Among them, ${lead.label}'s share is ${fmtPct(benA)}, against ${fmtPct(nonA)} among the rest — a difference of ${(benA - nonA).toFixed(1)} points.` : ''}`);
  }
  if (gov.length) sections.push({ id: 'gov', title: 'Ratings & key groups', source: 'ai', chart: services.length ? 'services' : undefined, body: gov.join('\n\n') });

  if (snapshots.length) {
    sections.push({
      id: 'seats', title: 'Constituency snapshots', source: 'ai', chart: 'seats',
      body: snapshots.map((s) => `• ${s.name} (n=${s.n}): ${label(s.lead.key)} ${fmtPct(s.lead.pct)} vs ${label(s.second.key)} ${fmtPct(s.second.pct)} — ${s.margin < 5 ? 'too close to call' : s.margin < 10 ? `leaning ${label(s.lead.key)}` : `clear lead for ${label(s.lead.key)}`}`).join('\n'),
    });
  }

  sections.push({
    id: 'advice', title: 'MSR strategic advice', source: 'msr', body: '',
    placeholder: 'MSR analysts write their recommendations here: priorities, messaging, constituencies to focus on, and risks. This section is never machine-written.',
  });
  return sections;
}
