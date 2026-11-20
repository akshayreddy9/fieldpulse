import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, PhoneCall, Filter, ShieldAlert, Users } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Risk, StatusBadge, Tabs, Stat, Empty, fmtTime } from '../../components/ui.jsx';
import InterviewReview from '../../components/InterviewReview.jsx';
import { RULES, RULE_BY_ID, FLAG_THRESHOLD } from '../../lib/quality.js';
import { BOOTH_BY_ID, GEO } from '../../data/geo.js';

export default function Alerts() {
  const s = useStore();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('Flagged');
  const [rule, setRule] = useState('');
  const [con, setCon] = useState('');
  const [sel, setSel] = useState(params.get('id') || null);

  const flaggedAll = useMemo(() => s.interviews.filter((i) => (s.quality[i.id]?.score || 0) >= FLAG_THRESHOLD || s.statuses[i.id]), [s.interviews, s.quality, s.statuses]);
  const counts = useMemo(() => {
    const c = { Flagged: 0, 'Back-check': 0, Rejected: 0, Accepted: 0 };
    flaggedAll.forEach((i) => { const st = s.statusOf(i.id); c[st] = (c[st] || 0) + 1; });
    return c;
  }, [flaggedAll, s.statusOf]);
  const list = flaggedAll
    .filter((i) => s.statusOf(i.id) === tab)
    .filter((i) => !rule || s.quality[i.id].flags.some((f) => f.id === rule))
    .filter((i) => !con || i.constituencyId === con)
    .sort((a, b) => s.quality[b.id].score - s.quality[a.id].score || b.startedAt - a.startedAt);
  const selected = s.interviews.find((i) => i.id === sel) || list[0];

  const bySurveyor = useMemo(() => {
    const m = {};
    s.interviews.forEach((i) => {
      const x = (m[i.surveyorId] ||= { id: i.surveyorId, n: 0, f: 0, rules: {} });
      x.n++;
      if (s.quality[i.id].score >= FLAG_THRESHOLD) { x.f++; s.quality[i.id].flags.forEach((f) => { x.rules[f.id] = (x.rules[f.id] || 0) + 1; }); }
    });
    return Object.values(m).filter((x) => x.f >= 3).sort((a, b) => b.f / b.n - a.f / a.n).slice(0, 8);
  }, [s.interviews, s.quality]);

  const bulk = () => {
    const ids = list.filter((i) => s.quality[i.id].risk === 'High').map((i) => i.id);
    if (!ids.length) return;
    s.update((x) => ({ statuses: { ...x.statuses, ...Object.fromEntries(ids.map((id) => [id, 'Back-check'])) } }));
    s.log(`Sent ${ids.length} high-risk interviews for back-check`);
    s.toast(`${ids.length} high-risk interviews sent to back-check team`, 'success');
  };

  return (
    <div>
      <PageHead eyebrow="Fieldwork" icon={AlertOctagon} title="Alerts to review" desc="Every interview is scored by 9 automatic checks the moment it syncs. Review flagged interviews here, listen to the recording, and decide: accept, back-check or reject. Rejected interviews are removed from results automatically.">
        <button className="btn" onClick={bulk} disabled={tab !== 'Flagged'}><PhoneCall size={15} />Send all high-risk to back-check</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Awaiting review" value={counts.Flagged || 0} tone="red" icon={ShieldAlert} />
        <Stat label="In back-check" value={counts['Back-check'] || 0} tone="amber" icon={PhoneCall} />
        <Stat label="Rejected" value={counts.Rejected || 0} tone="indigo" hint="Excluded from results" />
        <Stat label="Flag rate" value={`${((flaggedAll.length / s.interviews.length) * 100).toFixed(1)}%`} tone="blue" hint={`${flaggedAll.length} of ${s.interviews.length.toLocaleString('en-IN')} interviews`} />
      </div>
      <Tabs value={tab} onChange={(v) => { setTab(v); setSel(null); }} tabs={[
        { key: 'Flagged', label: 'Awaiting review', count: counts.Flagged || 0 },
        { key: 'Back-check', label: 'Back-check', count: counts['Back-check'] || 0 },
        { key: 'Rejected', label: 'Rejected', count: counts.Rejected || 0 },
        { key: 'Accepted', label: 'Cleared', count: counts.Accepted || 0 },
      ]} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)' }}>
        <div className="stack">
          <Card flush title={`${list.length} interviews`} right={<>
            <Filter size={14} className="muted" />
            <select className="select" style={{ width: 170 }} value={rule} onChange={(e) => setRule(e.target.value)}><option value="">All reasons</option>{RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <select className="select" style={{ width: 150 }} value={con} onChange={(e) => setCon(e.target.value)}><option value="">All areas</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
          </>}>
            <div className="scroll-y" style={{ maxHeight: 640 }}>
              {list.length === 0 && <Empty icon={AlertOctagon} title="Nothing here">No interviews in this list.</Empty>}
              {list.map((i) => (
                <div key={i.id} className="list-item click" style={{ background: selected?.id === i.id ? '#eefaf8' : undefined }} onClick={() => setSel(i.id)}>
                  <Risk q={s.quality[i.id]} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row nowrap"><span className="bold small">{i.id}</span><span className="tiny muted">{i.surveyorId} · {BOOTH_BY_ID[i.boothId].short}, {i.constituencyId}</span></div>
                    <div className="row" style={{ gap: 4, marginTop: 3 }}>{s.quality[i.id].flags.map((f) => <Badge key={f.id} tone="red">{RULE_BY_ID[f.id].name}</Badge>)}</div>
                  </div>
                  <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{fmtTime(i.startedAt)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card flush title={<span className="row"><Users size={16} />Surveyors with repeated flags</span>} sub="Patterns matter more than single alerts">
            <table className="t">
              <thead><tr><th>Surveyor</th><th className="num">Flagged</th><th>Main reasons</th></tr></thead>
              <tbody>{bySurveyor.map((x) => (
                <tr key={x.id} className="click" onClick={() => { setTab('Flagged'); setRule(''); }}>
                  <td><b>{s.surveyors.find((v) => v.id === x.id)?.name}</b> <span className="tiny muted">{x.id}</span></td>
                  <td className="num"><b style={{ color: 'var(--red)' }}>{x.f}</b>/{x.n}</td>
                  <td>{Object.entries(x.rules).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r, n]) => <Badge key={r} tone="amber">{RULE_BY_ID[r].name} ×{n}</Badge>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
        <Card title="Review" right={selected && <StatusBadge s={s.statusOf(selected.id)} />}>
          {selected ? <InterviewReview interview={selected} /> : <Empty icon={AlertOctagon} title="Select an interview">Choose an interview on the left to review it.</Empty>}
        </Card>
      </div>
      <style>{`@media (max-width: 1100px){ .content .grid[style*="1.15fr"]{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  );
}
