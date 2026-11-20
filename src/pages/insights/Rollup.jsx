import React, { useMemo, useState } from 'react';
import { Network, ChevronRight, ChevronDown, Download, Sigma } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Progress, Badge, Seg } from '../../components/ui.jsx';
import { rollup } from '../../lib/analytics.js';
import { findQuestion } from '../../data/questionnaire.js';
import { colorFor } from '../../components/charts.jsx';
import { exportTableExcel } from '../../lib/exporters.js';

const METRICS = [
  { value: 'q_vote_intent', label: 'Vote intention' },
  { value: 'q_leader', label: 'Preferred CM' },
  { value: 'q_scheme', label: 'Scheme beneficiary' },
];

function ShareBar({ share, keys, qid }) {
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', minWidth: 140, background: '#eef1f6' }}>
      {keys.map((k, i) => <span key={k} title={`${k}: ${(share[k] || 0).toFixed(1)}%`} style={{ width: `${share[k] || 0}%`, background: colorFor(qid, k, i) }} />)}
    </div>
  );
}

export default function Rollup() {
  const s = useStore();
  const [metric, setMetric] = useState('q_vote_intent');
  const [open, setOpen] = useState({ TS: true, KNR: true });
  const tree = useMemo(() => rollup(s.valid, s.targets, metric), [s.valid, s.targets, metric]);
  const q = findQuestion(s.questionnaire, metric);
  const keys = q.options.map((o) => o.v).concat(q.allowOther ? ['OTHER'] : []);
  const show = keys.slice(0, 4);

  const rows = [];
  const walk = (n, depth) => {
    rows.push({ n, depth });
    if (n.children && open[n.id]) n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(tree, 0);

  const exportAll = () => {
    const out = [];
    const rec = (n, path) => {
      out.push([n.level, path, n.n, n.target, Number(n.pct.toFixed(1)), ...keys.map((k) => Number((n.share[k] || 0).toFixed(1)))]);
      (n.children || []).forEach((c) => rec(c, `${path} > ${c.short || c.name.en}`));
    };
    rec(tree, 'Telangana');
    exportTableExcel('Roll-up', ['Level', 'Area', 'Interviews', 'Target', '% complete', ...keys.map((k) => `${q.options.find((o) => o.v === k)?.en || k} %`)], out, `MSR-Pulse-Rollup-${metric}.xlsx`);
  };

  return (
    <div>
      <PageHead eyebrow="Results & reports" icon={Network} title="Totals from booth up to state" desc="Booth results add up automatically to mandal, constituency and state. No more merging Excel files by hand: totals update the moment an interview is accepted or rejected.">
        <Seg value={metric} onChange={setMetric} options={METRICS} />
        <button className="btn primary" onClick={exportAll}><Download size={15} />Export all levels</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {tree.children.map((c) => {
          const top = Object.entries(c.share).filter(([k]) => show.includes(k)).sort((a, b) => b[1] - a[1]);
          return (
            <Card key={c.id}>
              <div className="row"><b>{c.name.en}</b><div className="spacer" /><Badge>{c.n}</Badge></div>
              <div className="mt8"><ShareBar share={c.share} keys={keys} qid={metric} /></div>
              {top.length >= 2 ? <div className="small mt8">Leading: <b style={{ color: colorFor(metric, top[0][0], keys.indexOf(top[0][0])) }}>{q.options.find((o) => o.v === top[0][0])?.en}</b> {top[0][1].toFixed(1)}% · margin {(top[0][1] - top[1][1]).toFixed(1)} pts</div> : <div className="small mt8 muted">No interviews yet</div>}
            </Card>
          );
        }).slice(0, 4)}
      </div>
      <Card flush title={<span className="row"><Sigma size={16} />Roll-up table</span>} sub="Click a row to open the level below" right={<><button className="btn sm" onClick={() => { const all = {}; const r = (n) => { all[n.id] = true; (n.children || []).forEach((c) => { if (c.children) r(c); }); }; r(tree); setOpen(all); }}>Expand all</button><button className="btn sm" onClick={() => setOpen({ TS: true })}>Collapse</button></>}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Area</th><th className="num">Interviews</th><th className="num">Target</th><th>Progress</th>{show.map((k) => <th key={k} className="num">{q.options.find((o) => o.v === k)?.en}</th>)}<th>Share</th></tr></thead>
            <tbody>
              {rows.map(({ n, depth }) => {
                const has = !!n.children;
                return (
                  <tr key={n.id} className={has ? 'click' : ''} onClick={() => has && setOpen({ ...open, [n.id]: !open[n.id] })} style={{ background: depth === 0 ? '#f8fafc' : undefined }}>
                    <td style={{ paddingLeft: 14 + depth * 22 }}>
                      <div className="row nowrap">
                        {has ? (open[n.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span style={{ width: 15 }} />}
                        <span className={depth < 2 ? 'bold' : ''}>{depth === 0 ? 'Telangana (state)' : n.short || n.name.en}</span>
                        <Badge tone={['navy', 'indigo', 'teal', ''][depth]}>{n.level}</Badge>
                      </div>
                    </td>
                    <td className="num bold">{n.n.toLocaleString('en-IN')}</td>
                    <td className="num muted">{n.target.toLocaleString('en-IN')}</td>
                    <td style={{ minWidth: 120 }}><div className="row nowrap"><div style={{ flex: 1 }}><Progress value={n.pct} sm /></div><span className="tiny num">{n.pct.toFixed(0)}%</span></div></td>
                    {show.map((k) => <td key={k} className="num">{(n.share[k] || 0).toFixed(1)}%</td>)}
                    <td><ShareBar share={n.share} keys={keys} qid={metric} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
