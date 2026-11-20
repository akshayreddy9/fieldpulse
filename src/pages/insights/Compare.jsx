import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { GitCompareArrows, FileDown, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Tabs, Badge } from '../../components/ui.jsx';
import { Stacked, Grouped, colorFor } from '../../components/charts.jsx';
import { crosstab, compareRounds, DIMENSIONS, keyLabel, applyFilters, frequency } from '../../lib/analytics.js';
import { allQuestions } from '../../data/questionnaire.js';
import { exportComparePdf } from '../../lib/exporters.js';
import { Filters } from './Results.jsx';

function heat(p) {
  const a = Math.min(1, p / 60);
  return `rgba(13, 148, 136, ${0.06 + a * 0.75})`;
}

export default function Compare() {
  const s = useStore();
  const qn = s.questionnaire;
  const [tab, setTab] = useState('cross');
  const choiceQs = allQuestions(qn).filter((q) => (q.type === 'single' || q.type === 'multiple') && !q.pii && q.id !== 'q_consent');
  const [rowKey, setRowKey] = useState('q_gender');
  const [colKey, setColKey] = useState('q_vote_intent');
  const [rq, setRq] = useState('q_vote_intent');
  const [prevRound, setPrevRound] = useState('2');
  const [f, setF] = useState({});
  const list = useMemo(() => applyFilters(s.valid, f), [s.valid, f]);
  const prev = useMemo(() => applyFilters(prevRound === '1' ? s.round1 : s.round2, f), [prevRound, s.round1, s.round2, f]);
  const ct = useMemo(() => crosstab(qn, rowKey, colKey, list, s.lang), [qn, rowKey, colKey, list, s.lang]);
  const cmp = useMemo(() => compareRounds(qn, rq, list, prev, s.lang), [qn, rq, list, prev, s.lang]);
  const trend = useMemo(() => {
    const rounds = [...(s.round1.length ? [['May (R1)', s.round1]] : []), ['Aug (R2)', s.round2], ['Nov (R3)', s.valid]];
    return rounds.map(([label, l]) => ({ label, ...Object.fromEntries(frequency(qn, 'q_vote_intent', applyFilters(l, f)).rows.map((r) => [r.key, Number(r.pct.toFixed(1))])) }));
  }, [qn, s.round1, s.round2, s.valid, f]);
  const rowOptions = [...DIMENSIONS.map((d) => ({ key: d.key, label: `◆ ${d.en}` })), ...choiceQs.map((q) => ({ key: q.id, label: q.label.en }))];

  const pdfCross = () => exportComparePdf({
    title: `${keyLabel(qn, colKey)} by ${keyLabel(qn, rowKey)}`.slice(0, 90),
    subtitle: `${qn.title.en.replace('·', '-')} - Row percentages - Base ${list.length} interviews`,
    cols: ['', 'Base', ...ct.cols.map((c) => c.label)],
    table: ct.rows.map((r) => [r.label, r.base, ...r.cells.map((c) => `${c.pct.toFixed(1)}%`)]),
  });
  const pdfRound = () => exportComparePdf({
    title: `${keyLabel(qn, rq)}: Round 3 vs Round ${prevRound}`.slice(0, 90),
    subtitle: `${qn.title.en.replace('·', '-')} - Base R3 ${list.length}, R${prevRound} ${prev.length}`,
    cols: ['Answer', 'Round 3', `Round ${prevRound}`, 'Change (pts)'],
    table: cmp.map((r) => [r.label, `${r.now.toFixed(1)}%`, `${r.prev.toFixed(1)}%`, `${r.change >= 0 ? '+' : ''}${r.change.toFixed(1)}`]),
    chartRows: cmp.map((r, k) => ({ label: r.label, value: r.now, color: colorFor(rq, r.key, k) })),
  });

  return (
    <div>
      <PageHead eyebrow="Results & reports" icon={GitCompareArrows} title="Compare & trends" desc="Compare any question with any other, or with the previous round, and export the comparison as a PDF.">
        <button className="btn primary" onClick={tab === 'cross' ? pdfCross : pdfRound}><FileDown size={15} />Export PDF</button>
      </PageHead>
      <Card style={{ marginBottom: 16 }}><Filters f={f} setF={setF} /></Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'cross', label: 'Question × question' }, { key: 'round', label: 'This round vs last round' }, { key: 'trend', label: 'Trend across rounds' }]} />

      {tab === 'cross' && (
        <div className="stack">
          <Card>
            <div className="grid g2" style={{ gap: 10 }}>
              <div className="field"><label>Rows (break down by)</label><select className="select" value={rowKey} onChange={(e) => setRowKey(e.target.value)}>{rowOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
              <div className="field"><label>Columns (question)</label><select className="select" value={colKey} onChange={(e) => setColKey(e.target.value)}>{choiceQs.map((q) => <option key={q.id} value={q.id}>{q.label.en}</option>)}</select></div>
            </div>
          </Card>
          <div className="grid g2">
            <Card title={`${keyLabel(qn, colKey, s.lang)}`} sub={`by ${keyLabel(qn, rowKey, s.lang)} · row %`}>
              <Stacked rows={ct.rows} cols={ct.cols} qid={colKey} />
            </Card>
            <Card flush title="Cross-tab table" sub="Row percentages · darker = higher">
              <div className="table-wrap">
                <table className="t heat">
                  <thead><tr><th /><th className="num">Base</th>{ct.cols.map((c) => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
                  <tbody>{ct.rows.map((r) => (
                    <tr key={r.key}><td className="bold small">{r.label}</td><td className="num muted">{r.base}</td>
                      {r.cells.map((c) => <td key={c.key} className="cell" style={{ background: heat(c.pct), color: c.pct > 35 ? '#fff' : undefined }}>{c.pct.toFixed(1)}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'round' && !s.round2.length && !s.round1.length && (
        <Card><div className="empty"><GitCompareArrows size={30} className="faint" /><div className="bold mt8">No earlier round to compare with</div><div className="small">This survey has only one round so far. Comparisons appear once a previous round exists (or is imported from GoSurvey).</div></div></Card>
      )}
      {tab === 'round' && (s.round2.length > 0 || s.round1.length > 0) && (
        <div className="stack">
          <Card>
            <div className="grid g2" style={{ gap: 10 }}>
              <div className="field"><label>Question</label><select className="select" value={rq} onChange={(e) => setRq(e.target.value)}>{choiceQs.map((q) => <option key={q.id} value={q.id}>{q.label.en}</option>)}</select></div>
              <div className="field"><label>Compare with</label><select className="select" value={prevRound} onChange={(e) => setPrevRound(e.target.value)}><option value="2">Round 2 · August 2026 ({s.round2.length.toLocaleString('en-IN')})</option>{s.round1.length > 0 && <option value="1">Round 1 · May 2026 · GoSurvey import ({s.round1.length.toLocaleString('en-IN')})</option>}</select></div>
            </div>
          </Card>
          <div className="grid g-2-1">
            <Card title={keyLabel(qn, rq, s.lang)} sub={`Round 3 vs Round ${prevRound}`}>
              <Grouped data={cmp.map((r) => ({ label: r.label, now: Number(r.now.toFixed(1)), prev: Number(r.prev.toFixed(1)) }))} series={[{ key: 'prev', label: `Round ${prevRound}`, color: '#cbd5e1' }, { key: 'now', label: 'Round 3 (now)', color: '#0d9488' }]} height={300} fmt={(v) => `${v}%`} />
            </Card>
            <Card flush title="Change">
              <table className="t">
                <thead><tr><th>Answer</th><th className="num">Now</th><th className="num">Before</th><th className="num">Change</th></tr></thead>
                <tbody>{cmp.map((r) => {
                  const I = Math.abs(r.change) < 0.5 ? Minus : r.change > 0 ? ArrowUpRight : ArrowDownRight;
                  return <tr key={r.key}><td className="small bold">{r.label}</td><td className="num">{r.now.toFixed(1)}%</td><td className="num muted">{r.prev.toFixed(1)}%</td>
                    <td className="num"><span className={`row nowrap ${Math.abs(r.change) < 0.5 ? 'muted' : r.change > 0 ? 'up' : 'down'}`} style={{ justifyContent: 'flex-end', gap: 2, fontWeight: 700 }}><I size={14} />{r.change > 0 ? '+' : ''}{r.change.toFixed(1)}</span></td></tr>;
                })}</tbody>
              </table>
            </Card>
          </div>
        </div>
      )}

      {tab === 'trend' && (
        <Card title="Vote intention across rounds" sub={s.round1.length ? 'Round 1 was brought in from GoSurvey' : 'Import Round 1 from GoSurvey (add-on) to extend this trend'}>
          <div style={{ height: 340 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#eef1f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {['A', 'B', 'C', 'UND'].map((k) => <Line key={k} dataKey={k} name={k === 'UND' ? 'Undecided' : `Party ${k}`} stroke={colorFor('q_vote_intent', k)} strokeWidth={3} dot={{ r: 5 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {!s.round1.length && <div className="row mt8"><Badge tone="indigo">Tip</Badge><span className="small muted">Open “GoSurvey import” to bring in an older round.</span></div>}
        </Card>
      )}
    </div>
  );
}
