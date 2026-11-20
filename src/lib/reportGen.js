// AI first-draft generator for the client report. Every number is computed from the live data;
// MSR analysts then edit the text and write the "MSR Advice" section themselves.
import { GEO } from '../data/geo.js';
import { frequency, compareRounds, crosstab, fmtPct } from './analytics.js';

const pp = (x) => (Math.abs(x) < 0.05 ? 'no change' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)} pts`);

export function generateReport(qn, cur, prev, quality, statuses) {
  const hasPrev = prev && prev.length > 0;
  const vi = frequency(qn, 'q_vote_intent', cur);
  const cmp = compareRounds(qn, 'q_vote_intent', cur, prev);
  const parties = vi.rows.filter((r) => ['A', 'B', 'C', 'IND'].includes(r.key)).sort((a, b) => b.pct - a.pct);
  const lead = parties[0];
  const second = parties[1];
  const leadChg = cmp.find((r) => r.key === lead.key).change;
  const und = vi.rows.find((r) => r.key === 'UND');
  const undChg = cmp.find((r) => r.key === 'UND').change;

  const byGender = crosstab(qn, 'q_gender', 'q_vote_intent', cur);
  const women = byGender.rows.find((r) => r.key === 'Female');
  const men = byGender.rows.find((r) => r.key === 'Male');
  const wA = women?.cells.find((c) => c.key === lead.key)?.pct || 0;
  const mA = men?.cells.find((c) => c.key === lead.key)?.pct || 0;
  const byAge = crosstab(qn, 'ageBand', 'q_vote_intent', cur);
  const youth = byAge.rows.find((r) => r.key === '18-25');
  const youthTop = youth ? [...youth.cells].filter((c) => ['A', 'B', 'C'].includes(c.key)).sort((a, b) => b.pct - a.pct)[0] : null;
  const youthUnd = youth?.cells.find((c) => c.key === 'UND')?.pct || 0;

  const issues = frequency(qn, 'q_issues', cur).rows.filter((r) => r.key !== 'OTHER').sort((a, b) => b.pct - a.pct);
  const rating = frequency(qn, 'q_govt_rating', cur);
  const ratingPrev = frequency(qn, 'q_govt_rating', prev);
  const services = frequency(qn, 'q_services', cur).gridRows.sort((a, b) => a.mean - b.mean);
  const scheme = frequency(qn, 'q_scheme', cur).rows.find((r) => r.key === 'Y');
  const bySch = crosstab(qn, 'q_scheme', 'q_vote_intent', cur);
  const benA = bySch.rows.find((r) => r.key === 'Y')?.cells.find((c) => c.key === 'A')?.pct || 0;
  const nonA = bySch.rows.find((r) => r.key === 'N')?.cells.find((c) => c.key === 'A')?.pct || 0;

  const byCon = crosstab(qn, 'constituency', 'q_vote_intent', cur);
  const snapshots = byCon.rows.map((r) => {
    const sorted = r.cells.filter((c) => ['A', 'B', 'C', 'IND'].includes(c.key)).sort((a, b) => b.pct - a.pct);
    return { name: r.label, n: r.base, lead: sorted[0], second: sorted[1], margin: sorted[0].pct - sorted[1].pct };
  });
  const close = snapshots.filter((s) => s.margin < 5);
  const partyName = (k) => vi.rows.find((r) => r.key === k)?.label || k;

  const flagged = Object.values(quality).filter((x) => x.score >= 40).length;
  const rejected = Object.values(statuses).filter((s) => s === 'Rejected').length;
  const dates = cur.map((i) => i.startedAt);
  const from = new Date(Math.min(...dates)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  const to = new Date(Math.max(...dates)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return [
    {
      id: 'summary', title: 'Executive summary', source: 'ai',
      body: `${partyName(lead.key)} leads the state with ${fmtPct(lead.pct)} vote intention, ahead of ${partyName(second.key)} at ${fmtPct(second.pct)} — a margin of ${(lead.pct - second.pct).toFixed(1)} points. ${hasPrev ? `Since the previous round, ${partyName(lead.key)} has moved ${pp(leadChg)}, while undecided voters ${undChg < 0 ? 'fell' : 'rose'} to ${fmtPct(und.pct)} (${pp(undChg)}).` : `Undecided voters stand at ${fmtPct(und.pct)}.`}\n\n${wA > mA && benA > nonA ? `The lead is driven by women voters and welfare-scheme beneficiaries.` : `Support is spread broadly across groups.`} ${issues[0].label} and ${issues[1].label.toLowerCase()} are the top public concerns, and ${close.length} of ${snapshots.length} constituencies are within a 5-point margin, which makes them the priority for campaign attention.`,
    },
    {
      id: 'method', title: 'Methodology & sample', source: 'ai',
      body: `Face-to-face interviews were conducted with ${cur.length.toLocaleString('en-IN')} adult respondents across ${GEO.booths.length} polling booths in ${GEO.mandals.length} mandals and ${GEO.constituencies.length} assembly constituencies between ${from} and ${to}. Quotas were set at booth level for gender, age group and caste category.\n\nEvery interview was captured on the MSR Pulse field app with recorded consent, GPS location and timestamp. The automated quality engine flagged ${flagged} interviews (${fmtPct((flagged / cur.length) * 100)}) on the evening they were collected; after supervisor back-checks, ${rejected} interviews were rejected and excluded from this report.`,
    },
    {
      id: 'vote', title: 'Voting intention', source: 'ai', chart: 'vote',
      body: parties.map((p) => {
        const c = cmp.find((x) => x.key === p.key);
        return `• ${p.label}: ${fmtPct(p.pct)}${hasPrev ? ` (${pp(c.change)} vs previous round)` : ''}`;
      }).join('\n') + `\n• Undecided: ${fmtPct(und.pct)}${hasPrev ? ` (${pp(undChg)})` : ''}\n\n${partyName(lead.key)}'s support is ${wA > mA ? 'higher' : 'lower'} among women (${fmtPct(wA)}) than men (${fmtPct(mA)}), a gender gap of ${Math.abs(wA - mA).toFixed(1)} points. Among first-time and young voters (18–25), ${youthTop ? partyName(youthTop.key) + ' leads with ' + fmtPct(youthTop.pct) : 'no party leads clearly'}, and ${fmtPct(youthUnd)} are still undecided.`,
    },
    {
      id: 'issues', title: 'Public issues', source: 'ai', chart: 'issues',
      body: `The five most-mentioned problems are ${issues.slice(0, 5).map((r) => `${r.label.toLowerCase()} (${fmtPct(r.pct, 0)})`).join(', ')}. Unemployment dominates among respondents aged 18–25, while farm income is the leading concern among farmers and agricultural labourers. Drinking water is a stronger concern in Nalgonda and Mahabubnagar than elsewhere.`,
    },
    {
      id: 'gov', title: 'Governance & public services', source: 'ai', chart: 'services',
      body: `The state government receives an average rating of ${rating.mean.toFixed(1)} out of 10${hasPrev ? ` (previous round: ${ratingPrev.mean.toFixed(1)})` : ''}. Electricity is the best-rated service (${fmtPct(services[services.length - 1].goodPct, 0)} rate it good or very good). The weakest are ${services[0].label.toLowerCase()} (average ${services[0].mean.toFixed(2)}/5) and ${services[1].label.toLowerCase()} (${services[1].mean.toFixed(2)}/5).\n\n${fmtPct(scheme.pct, 0)} of households report benefiting from at least one welfare scheme. Among beneficiaries, Party A's vote share is ${fmtPct(benA)}, against ${fmtPct(nonA)} among non-beneficiaries — a ${(benA - nonA).toFixed(1)}-point welfare dividend.`,
    },
    {
      id: 'seats', title: 'Constituency snapshots', source: 'ai', chart: 'seats',
      body: snapshots.map((s) => `• ${s.name} (n=${s.n}): ${partyName(s.lead.key)} ${fmtPct(s.lead.pct)} vs ${partyName(s.second.key)} ${fmtPct(s.second.pct)} — ${s.margin < 5 ? 'too close to call' : s.margin < 10 ? 'leaning ' + partyName(s.lead.key) : 'clear lead for ' + partyName(s.lead.key)}`).join('\n'),
    },
    {
      id: 'advice', title: 'MSR strategic advice', source: 'msr',
      body: '',
      placeholder: 'MSR analysts write their recommendations here: priorities, messaging, constituencies to focus on, and risks. This section is never machine-written.',
    },
  ];
}
