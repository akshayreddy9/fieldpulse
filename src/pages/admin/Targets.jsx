import React, { useMemo, useState } from 'react';
import { Target, Pencil, Download, Upload } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Progress, Modal, Badge, Stat } from '../../components/ui.jsx';
import { GEO, CONST_BY_ID, MANDAL_BY_ID, defaultTargets } from '../../data/geo.js';
import { boothProgress } from '../../lib/analytics.js';
import { exportTableExcel, readSheet } from '../../lib/exporters.js';

const GROUPS = [
  ['gender', ['Male', 'Female']],
  ['age', ['18-25', '26-35', '36-50', '51+']],
  ['caste', ['SC', 'ST', 'BC', 'OC', 'Minority']],
];

function Cell({ done = 0, target }) {
  const pct = target ? done / target : 1;
  const color = pct >= 1 ? '#15803d' : pct >= 0.6 ? '#334155' : pct >= 0.35 ? '#b45309' : '#be123c';
  return <td className="num" style={{ color, fontWeight: 600 }}>{done}<span className="faint" style={{ fontWeight: 400 }}>/{target}</span></td>;
}

export default function Targets() {
  const s = useStore();
  const [con, setCon] = useState('KNR');
  const [edit, setEdit] = useState(null);
  const [applyMandal, setApplyMandal] = useState(false);
  const booths = GEO.booths.filter((b) => !con || b.constituencyId === con);
  const prog = useMemo(() => Object.fromEntries(GEO.booths.map((b) => [b.id, boothProgress(b.id, s.valid, s.targets)])), [s.valid, s.targets]);
  const totals = useMemo(() => {
    let t = 0; let d = 0; let behind = 0;
    GEO.booths.forEach((b) => { t += prog[b.id].target.total; d += Math.min(prog[b.id].done, prog[b.id].target.total); if (prog[b.id].pct < 50) behind++; });
    return { t, d, behind };
  }, [prog]);
  const tOf = (b) => s.targets[b.id] || defaultTargets(b);

  const save = () => {
    const sum = (o) => Object.values(o).reduce((a, x) => a + Number(x || 0), 0);
    const t = { ...edit.t, total: Number(edit.t.total) };
    const bad = GROUPS.filter(([k]) => sum(t[k]) !== t.total).map(([k]) => k);
    if (bad.length && !window.confirm(`The ${bad.join(', ')} split does not add up to the total of ${t.total}. Save anyway?`)) return;
    s.update((st) => {
      const next = { ...st.targets };
      const ids = applyMandal ? MANDAL_BY_ID[edit.b.mandalId].boothIds : [edit.b.id];
      ids.forEach((id) => { next[id] = JSON.parse(JSON.stringify(t)); });
      return { targets: next };
    });
    s.log(`Updated targets for ${applyMandal ? MANDAL_BY_ID[edit.b.mandalId].name.en + ' mandal' : edit.b.short + ' (' + edit.b.constituencyId + ')'}`);
    s.toast('Targets saved and sent to field phones', 'success');
    setEdit(null);
  };

  const exportT = () => exportTableExcel('Booth targets', ['Booth ID', 'Booth', 'Constituency', 'Mandal', 'Total', 'Male', 'Female', '18-25', '26-35', '36-50', '51+', 'SC', 'ST', 'BC', 'OC', 'Minority'],
    GEO.booths.map((b) => { const t = tOf(b); return [b.id, b.name.en, CONST_BY_ID[b.constituencyId].name.en, MANDAL_BY_ID[b.mandalId].name.en, t.total, t.gender.Male, t.gender.Female, ...Object.values(t.age), ...Object.values(t.caste)]; }), 'MSR-Pulse-Booth-Targets.xlsx');

  const importT = async (file) => {
    try {
      const rows = await readSheet(file);
      const next = {};
      rows.forEach((r) => {
        if (!r['Booth ID']) return;
        next[r['Booth ID']] = {
          total: Number(r.Total), gender: { Male: Number(r.Male), Female: Number(r.Female) },
          age: { '18-25': Number(r['18-25']), '26-35': Number(r['26-35']), '36-50': Number(r['36-50']), '51+': Number(r['51+']) },
          caste: { SC: Number(r.SC), ST: Number(r.ST), BC: Number(r.BC), OC: Number(r.OC), Minority: Number(r.Minority) },
        };
      });
      s.update((st) => ({ targets: { ...st.targets, ...next } }));
      s.toast(`Imported targets for ${Object.keys(next).length} booths`, 'success');
    } catch { s.toast('Could not read that file', 'error'); }
  };

  return (
    <div>
      <PageHead eyebrow="Set up" icon={Target} title="Booth targets" desc="Set interview quotas for every booth by gender, age group and caste category. The field app shows surveyors what is still needed, and Pulse Live tracks progress as interviews arrive.">
        <button className="btn" onClick={exportT}><Download size={15} />Export to Excel</button>
        <label className="btn" style={{ cursor: 'pointer' }}><Upload size={15} />Import from Excel<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && importT(e.target.files[0])} /></label>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Total target" value={totals.t.toLocaleString('en-IN')} icon={Target} />
        <Stat label="Counted towards quota" value={totals.d.toLocaleString('en-IN')} delta={`${((totals.d / totals.t) * 100).toFixed(0)}% complete`} tone="green" />
        <Stat label="Booths" value={GEO.booths.length} hint="6 constituencies · 18 mandals" tone="blue" />
        <Stat label="Booths below 50%" value={totals.behind} tone="red" hint="Need attention today" />
      </div>
      <Card title="Quotas by booth" sub="Achieved / target. Green = quota met, amber = behind, red = far behind."
        right={<select className="select" style={{ width: 200 }} value={con} onChange={(e) => setCon(e.target.value)}><option value="">All constituencies</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>} flush>
        <div className="table-wrap" style={{ maxHeight: 620 }}>
          <table className="t">
            <thead>
              <tr>
                <th>Booth</th><th>Progress</th><th className="num">Male</th><th className="num">Female</th>
                <th className="num">18-25</th><th className="num">26-35</th><th className="num">36-50</th><th className="num">51+</th>
                <th className="num">SC</th><th className="num">ST</th><th className="num">BC</th><th className="num">OC</th><th className="num">Min.</th><th />
              </tr>
            </thead>
            <tbody>
              {booths.map((b) => {
                const p = prog[b.id];
                const t = tOf(b);
                return (
                  <tr key={b.id}>
                    <td><div className="bold">{b.short} {s.targets[b.id] && <Badge tone="indigo">custom</Badge>}</div><div className="tiny muted">{MANDAL_BY_ID[b.mandalId].name.en} · {b.id}</div></td>
                    <td style={{ minWidth: 150 }}><div className="row nowrap"><div style={{ flex: 1 }}><Progress value={p.pct} sm /></div><span className="small num bold">{p.done}/{t.total}</span></div></td>
                    {GROUPS.map(([k, keys]) => keys.map((x) => <Cell key={k + x} done={p[k][x]} target={t[k][x]} />))}
                    <td><button className="btn ghost icon sm" onClick={() => setEdit({ b, t: JSON.parse(JSON.stringify(t)) })}><Pencil size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {edit && (
        <Modal title={`Targets · ${edit.b.short}, ${MANDAL_BY_ID[edit.b.mandalId].name.en}`} onClose={() => setEdit(null)} icon={Target}
          footer={<><label className="check small" style={{ marginRight: 'auto' }}><input type="checkbox" checked={applyMandal} onChange={(e) => setApplyMandal(e.target.checked)} />Apply to all booths in this mandal</label><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save targets</button></>}>
          <div className="field"><label>Total interviews</label><input className="input" type="number" value={edit.t.total} onChange={(e) => setEdit({ ...edit, t: { ...edit.t, total: e.target.value } })} /></div>
          {GROUPS.map(([k, keys]) => {
            const sum = keys.reduce((a, x) => a + Number(edit.t[k][x] || 0), 0);
            return (
              <div key={k} className="mt16">
                <div className="row"><span className="bold small" style={{ textTransform: 'capitalize' }}>{k === 'age' ? 'Age group' : k === 'caste' ? 'Caste category' : 'Gender'}</span><div className="spacer" /><Badge tone={sum === Number(edit.t.total) ? 'green' : 'amber'}>Sum {sum} / {edit.t.total}</Badge></div>
                <div className="grid mt8" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))`, gap: 8 }}>
                  {keys.map((x) => (
                    <div key={x} className="field"><label>{x}</label><input className="input" type="number" value={edit.t[k][x]} onChange={(e) => setEdit({ ...edit, t: { ...edit.t, [k]: { ...edit.t[k], [x]: Number(e.target.value) } } })} /></div>
                  ))}
                </div>
              </div>
            );
          })}
        </Modal>
      )}
    </div>
  );
}
