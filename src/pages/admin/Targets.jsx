import React, { useMemo, useState } from 'react';
import { Target, Pencil, Download, Upload, MapPin } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Progress, Modal, Badge, Stat } from '../../components/ui.jsx';
import { GEO, CONST_BY_ID, MANDAL_BY_ID, BOOTH_BY_ID, defaultTargets } from '../../data/geo.js';
import { boothProgress } from '../../lib/analytics.js';
import { exportTableExcel, readSheet } from '../../lib/exporters.js';
import { targetCategories } from '../../lib/roles.js';
import { Link } from 'react-router-dom';

const GROUP_LABEL = { gender: 'Gender', age: 'Age group', caste: 'Caste category' };

function Cell({ done = 0, target = 0 }) {
  const pct = target ? done / target : 1;
  const color = pct >= 1 ? '#15803d' : pct >= 0.6 ? '#334155' : pct >= 0.35 ? '#b45309' : '#be123c';
  return <td className="num" style={{ color, fontWeight: 600 }}>{done}<span className="faint" style={{ fontWeight: 400 }}>/{target}</span></td>;
}

export default function Targets() {
  const s = useStore();
  // Quota groups come from the questions marked Gender / Age / Caste in the questionnaire builder
  const cats = targetCategories(s.questionnaire);
  const GROUPS = ['gender', 'age', 'caste'].map((k) => [k, cats[k].map((o) => o.v), Object.fromEntries(cats[k].map((o) => [o.v, o.en]))]).filter(([, keys]) => keys.length);
  const [conPick, setCon] = useState(null);
  const con = conPick ?? GEO.constituencies[0]?.id ?? '';
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
    const bad = GROUPS.filter(([k]) => sum(t[k] || {}) !== t.total).map(([k]) => k);
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

  // Excel columns: one per quota group value (e.g. Male, Female, 18-25 ..., SC, ST ...)
  const colName = (k, x) => (GROUPS.some(([k2, keys]) => k2 !== k && keys.includes(x)) ? `${GROUP_LABEL[k]}: ${x}` : x);
  const qCols = GROUPS.flatMap(([k, keys]) => keys.map((x) => [k, x, colName(k, x)]));
  const exportT = () => exportTableExcel('Booth targets', ['Booth ID', 'Booth', 'Constituency', 'Mandal', 'Total', ...qCols.map((c) => c[2])],
    GEO.booths.map((b) => { const t = tOf(b); return [b.id, b.name.en, CONST_BY_ID[b.constituencyId]?.name.en, MANDAL_BY_ID[b.mandalId]?.name.en, t.total, ...qCols.map(([k, x]) => t[k]?.[x] ?? 0)]; }), 'MSR-Pulse-Booth-Targets.xlsx');

  const importT = async (file) => {
    try {
      const rows = await readSheet(file);
      const next = {};
      const unknown = new Set();
      rows.forEach((r) => {
        const id = String(r['Booth ID'] || '').trim();
        if (!id) return;
        if (!BOOTH_BY_ID[id]) { unknown.add(id); return; }
        const t = { total: Number(r.Total) || 0 };
        GROUPS.forEach(([k, keys]) => { t[k] = Object.fromEntries(keys.map((x) => [x, Number(r[colName(k, x)]) || 0])); });
        next[id] = t;
      });
      s.update((st) => ({ targets: { ...st.targets, ...next } }));
      s.toast(`Imported targets for ${Object.keys(next).length} booths${unknown.size ? `. Skipped ${unknown.size} booth ID(s) not in the booth list (e.g. ${[...unknown][0]})` : ''}`, unknown.size ? 'error' : 'success');
    } catch { s.toast('Could not read that file', 'error'); }
  };

  return (
    <div>
      <PageHead eyebrow="Set up" icon={Target} title="Booth targets" desc="Set interview quotas for every booth by gender, age group and caste category. The field app shows surveyors what is still needed, and Pulse Live tracks progress as interviews arrive.">
        <Link className="btn" to="/admin/booths"><MapPin size={15} />Booth list</Link>
        <button className="btn" onClick={exportT}><Download size={15} />Export to Excel</button>
        <label className="btn" style={{ cursor: 'pointer' }}><Upload size={15} />Import from Excel<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && importT(e.target.files[0])} /></label>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Total target" value={totals.t.toLocaleString('en-IN')} icon={Target} />
        <Stat label="Counted towards quota" value={totals.d.toLocaleString('en-IN')} delta={`${totals.t ? ((totals.d / totals.t) * 100).toFixed(0) : 0}% complete`} tone="green" />
        <Stat label="Booths" value={GEO.booths.length} hint={`${GEO.constituencies.length} constituencies · ${GEO.mandals.length} mandals`} tone="blue" />
        <Stat label="Booths below 50%" value={totals.behind} tone="red" hint="Need attention today" />
      </div>
      <Card title="Quotas by booth" sub="Achieved / target. Green = quota met, amber = behind, red = far behind."
        right={<select className="select" style={{ width: 200 }} value={con} onChange={(e) => setCon(e.target.value)}><option value="">All constituencies</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>} flush>
        <div className="table-wrap" style={{ maxHeight: 620 }}>
          <table className="t">
            <thead>
              <tr>
                <th>Booth</th><th>Progress</th>
                {GROUPS.map(([k, keys, names]) => keys.map((x) => <th key={k + x} className="num" title={GROUP_LABEL[k]}>{names[x].length > 9 ? `${names[x].slice(0, 8)}.` : names[x]}</th>))}
                <th />
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
                    {GROUPS.map(([k, keys]) => keys.map((x) => <Cell key={k + x} done={p[k][x]} target={t[k]?.[x]} />))}
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
          {GROUPS.map(([k, keys, names]) => {
            const sum = keys.reduce((a, x) => a + Number(edit.t[k]?.[x] || 0), 0);
            return (
              <div key={k} className="mt16">
                <div className="row"><span className="bold small">{GROUP_LABEL[k]}</span><div className="spacer" /><Badge tone={sum === Number(edit.t.total) ? 'green' : 'amber'}>Sum {sum} / {edit.t.total}</Badge></div>
                <div className="grid mt8" style={{ gridTemplateColumns: `repeat(${Math.min(keys.length, 5)}, minmax(0, 1fr))`, gap: 8 }}>
                  {keys.map((x) => (
                    <div key={x} className="field"><label>{names[x]}</label><input className="input" type="number" value={edit.t[k]?.[x] ?? 0} onChange={(e) => setEdit({ ...edit, t: { ...edit.t, [k]: { ...(edit.t[k] || {}), [x]: Number(e.target.value) } } })} /></div>
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
