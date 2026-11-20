import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Network, GitCompareArrows, Sparkles, FileText, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Badge } from '../../components/ui.jsx';
import { HBar } from '../../components/charts.jsx';
import { frequency, compareRounds, crosstab } from '../../lib/analytics.js';

export default function AnalystHome() {
  const s = useStore();
  const nav = useNavigate();
  const qn = s.questionnaire;
  const vote = useMemo(() => frequency(qn, 'q_vote_intent', s.valid).rows, [qn, s.valid]);
  const cmp = useMemo(() => compareRounds(qn, 'q_vote_intent', s.valid, s.round2), [qn, s.valid, s.round2]);
  const issues = useMemo(() => frequency(qn, 'q_issues', s.valid).rows.filter((r) => r.key !== 'OTHER').sort((a, b) => b.pct - a.pct).slice(0, 5), [qn, s.valid]);
  const seats = useMemo(() => crosstab(qn, 'constituency', 'q_vote_intent', s.valid), [qn, s.valid]);
  const parties = vote.filter((r) => ['A', 'B', 'C'].includes(r.key)).sort((a, b) => b.pct - a.pct);
  const lead = parties[0];
  const leadChange = cmp.find((r) => r.key === lead.key)?.change || 0;
  const close = seats.rows.filter((r) => { const x = [...r.cells].filter((c) => ['A', 'B', 'C'].includes(c.key)).sort((a, b) => b.pct - a.pct); return x[0].pct - x[1].pct < 5; });

  const tiles = [
    [BarChart3, 'Results', 'Every question, with filters and Excel', '/insights/results', 'insights.results'],
    [Network, 'Booth → state totals', 'Added up automatically', '/insights/rollup', 'insights.rollup'],
    [GitCompareArrows, 'Compare & trends', 'Question vs question, this round vs last', '/insights/compare', 'insights.compare'],
    [Sparkles, 'Ask the data', 'Type a question, get a chart', '/insights/ask', 'insights.ask'],
    [FileText, 'Client report', `Status: ${s.reportStatus}`, '/insights/report', 'insights.reports'],
  ].filter((x) => s.can(x[4]));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="welcome">
        <div className="small" style={{ opacity: 0.8 }}>{qn.title.en} · {qn.client}</div>
        <h2 className="mt8">Hello {s.user.name.split(' ')[0]}. Here are the headline results.</h2>
        <p>Based on {s.valid.length.toLocaleString('en-IN')} quality-checked interviews. Figures update as fieldwork continues.</p>
        <div className="kpis">
          <div className="kpi"><div className="v">{lead.label}</div><div className="l">Leading party</div></div>
          <div className="kpi"><div className="v">{lead.pct.toFixed(1)}%</div><div className="l">Its vote share</div></div>
          {s.round2.length > 0 ? <div className="kpi"><div className="v row" style={{ gap: 4 }}>{leadChange >= 0 ? <ArrowUpRight size={22} /> : <ArrowDownRight size={22} />}{Math.abs(leadChange).toFixed(1)}</div><div className="l">Points since last round</div></div> : <div className="kpi"><div className="v">{s.valid.length.toLocaleString('en-IN')}</div><div className="l">Interviews so far</div></div>}
          <div className="kpi"><div className="v">{close.length}</div><div className="l">Constituencies too close to call</div></div>
        </div>
      </div>

      <div className="grid g3">
        {tiles.map(([I, t, d, to]) => (
          <button key={to} className="action-tile" onClick={() => nav(to)}>
            <div className="page-icon"><I size={19} /></div>
            <div style={{ flex: 1 }}><div className="t">{t}</div><div className="d">{d}</div></div>
            <ArrowRight size={16} className="faint" />
          </button>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Vote intention" sub="State level, all accepted interviews">
          <HBar rows={vote} qid="q_vote_intent" />
        </Card>
        <Card title="Top problems people mention" sub="% of respondents">
          <HBar rows={issues} single="#0d9488" />
        </Card>
      </div>
      <Card title="Constituencies" flush>
        <table className="t">
          <thead><tr><th>Constituency</th><th className="num">Interviews</th><th>Leading</th><th className="num">Margin</th><th /></tr></thead>
          <tbody>{seats.rows.map((r) => {
            const x = [...r.cells].filter((c) => ['A', 'B', 'C'].includes(c.key)).sort((a, b) => b.pct - a.pct);
            const m = x[0].pct - x[1].pct;
            return <tr key={r.key}><td className="bold">{r.label}</td><td className="num">{r.base}</td><td>Party {x[0].key} · {x[0].pct.toFixed(1)}%</td><td className="num">{m.toFixed(1)} pts</td><td><Badge tone={m < 5 ? 'amber' : 'green'}>{m < 5 ? 'Too close to call' : 'Clear lead'}</Badge></td></tr>;
          })}</tbody>
        </table>
      </Card>
    </div>
  );
}
