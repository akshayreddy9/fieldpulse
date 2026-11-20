import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Network, GitCompareArrows, Sparkles, FileText, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Badge } from '../../components/ui.jsx';
import { HBar } from '../../components/charts.jsx';
import { compareRounds, crosstab, freqRows } from '../../lib/analytics.js';
import { mainQuestionId, isRealChoice } from '../../lib/reportGen.js';
import { R } from '../../lib/roles.js';
import { findQuestion } from '../../data/questionnaire.js';

export default function AnalystHome() {
  const s = useStore();
  const nav = useNavigate();
  const qn = s.questionnaire;
  // Headline = the question marked "Main result" in the builder; concerns = the one marked "Top concerns"
  const mainId = mainQuestionId(qn);
  const mainQ = findQuestion(qn, mainId);
  const issuesQ = findQuestion(qn, R('issues', qn));
  const vote = useMemo(() => freqRows(qn, mainId, s.valid), [qn, mainId, s.valid]);
  const cmp = useMemo(() => (mainId && compareRounds(qn, mainId, s.valid, s.round2)) || [], [qn, mainId, s.valid, s.round2]);
  const issues = useMemo(() => freqRows(qn, issuesQ?.id, s.valid).filter((r) => r.key !== 'OTHER' && r.count > 0).sort((a, b) => b.pct - a.pct).slice(0, 5), [qn, issuesQ, s.valid]);
  const seats = useMemo(() => (mainId ? crosstab(qn, 'constituency', mainId, s.valid) : { rows: [], cols: [] }), [qn, mainId, s.valid]);
  const lbl = (k) => vote.find((r) => r.key === k)?.label || k;
  const top2 = (r) => [...r.cells].filter((c) => isRealChoice({ key: c.key, label: lbl(c.key) })).sort((a, b) => b.pct - a.pct);
  const parties = vote.filter(isRealChoice).sort((a, b) => b.pct - a.pct);
  const lead = parties[0];
  const leadChange = lead ? cmp.find((r) => r.key === lead.key)?.change || 0 : 0;
  const close = seats.rows.filter((r) => { const x = top2(r); return x.length > 1 && x[0].pct - x[1].pct < 5; });

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
          <div className="kpi"><div className="v">{lead ? lead.label : '—'}</div><div className="l">Leading answer{mainQ ? ` · ${mainQ.label.en.slice(0, 40)}` : ''}</div></div>
          <div className="kpi"><div className="v">{lead ? `${lead.pct.toFixed(1)}%` : '—'}</div><div className="l">Its share</div></div>
          {s.round2.length > 0 && lead ?<div className="kpi"><div className="v row" style={{ gap: 4 }}>{leadChange >= 0 ? <ArrowUpRight size={22} /> : <ArrowDownRight size={22} />}{Math.abs(leadChange).toFixed(1)}</div><div className="l">Points since last round</div></div> : <div className="kpi"><div className="v">{s.valid.length.toLocaleString('en-IN')}</div><div className="l">Interviews so far</div></div>}
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
        <Card title={mainQ ? mainQ.label.en : 'Main result'} sub="State level, all accepted interviews">
          {vote.length ? <HBar rows={vote} qid={mainId} /> : <div className="empty small">Mark a question as “Main result” in the questionnaire builder to see it here.</div>}
        </Card>
        <Card title={issuesQ ? issuesQ.label.en : 'Top concerns'} sub="% of respondents">
          {issues.length ? <HBar rows={issues} single="#0d9488" /> : <div className="empty small">{issuesQ ? 'No answers yet.' : 'Mark a question as “Top concerns” in the questionnaire builder to see it here.'}</div>}
        </Card>
      </div>
      <Card title="Constituencies" flush>
        <table className="t">
          <thead><tr><th>Constituency</th><th className="num">Interviews</th><th>Leading</th><th className="num">Margin</th><th /></tr></thead>
          <tbody>{seats.rows.map((r) => {
            const x = top2(r);
            if (x.length < 2) return null;
            const m = x[0].pct - x[1].pct;
            return <tr key={r.key}><td className="bold">{r.label}</td><td className="num">{r.base}</td><td>{lbl(x[0].key)} · {x[0].pct.toFixed(1)}%</td><td className="num">{m.toFixed(1)} pts</td><td><Badge tone={m < 5 ? 'amber' : 'green'}>{m < 5 ? 'Too close to call' : 'Clear lead'}</Badge></td></tr>;
          })}</tbody>
        </table>
      </Card>
    </div>
  );
}
