import React, { useMemo, useState } from 'react';
import { Users, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Search, Smartphone, UserPlus, Pencil } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Modal, Stat, initials } from '../../components/ui.jsx';
import { CONST_BY_ID, BOOTH_BY_ID, GEO } from '../../data/geo.js';
import { downloadSurveyorTemplate, readSheet } from '../../lib/exporters.js';

export default function Team() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [con, setCon] = useState('');
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null); // person being added / edited
  const [editErr, setEditErr] = useState('');
  const nextId = (list, k = 0) => `SV-${String(list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + k + 1).padStart(3, '0')}`;
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const openNew = () => { setEditErr(''); setEdit({ isNew: true, name: '', phone: '', gender: 'Female', role: 'Surveyor', constituencyId: GEO.constituencies[0].id, boothIds: [], device: 'Android', status: 'Active' }); };
  const openEdit = (x) => { setEditErr(''); setEdit({ ...x, phone: digits(x.phone), boothIds: [...(x.boothIds || [])] }); };
  const saveEdit = () => {
    const e = edit;
    if (!e.name.trim()) return setEditErr('Enter the name');
    if (digits(e.phone).length !== 10) return setEditErr('Enter a 10-digit mobile number');
    if (s.surveyors.some((x) => x.id !== e.id && digits(x.phone) === digits(e.phone))) return setEditErr('Another team member already uses this mobile number');
    if (e.role === 'Surveyor' && !e.boothIds.length) return setEditErr('Assign at least one booth to a surveyor');
    const rec = { id: e.id, name: e.name.trim(), phone: `+91 ${digits(e.phone)}`, gender: e.gender, role: e.role, constituencyId: e.constituencyId, boothIds: e.boothIds, device: e.device, status: e.status, joined: e.joined || new Date().toISOString().slice(0, 10) };
    s.update((st) => {
      const base = st.surveyors || s.surveyors;
      if (e.isNew) return { surveyors: [...base, { ...rec, id: nextId(base) }] };
      return { surveyors: base.map((x) => (x.id === e.id ? { ...x, ...rec } : x)) };
    });
    s.log(`${e.isNew ? 'Added' : 'Updated'} team member ${rec.name}`);
    s.toast(e.isNew ? `${rec.name} added. They sign in on MSR Pulse with +91 ${digits(e.phone)}.` : `${rec.name} updated${e.status === 'Inactive' ? ' and their login is switched off' : ''}.`, 'success');
    setEdit(null);
  };
  const stats = useMemo(() => {
    const m = {};
    s.interviews.forEach((i) => {
      const x = (m[i.surveyorId] ||= { n: 0, flagged: 0, dur: 0, last: 0 });
      x.n++; x.dur += i.durationSec; x.last = Math.max(x.last, i.syncedAt);
      if ((s.quality[i.id]?.score || 0) >= 40) x.flagged++;
    });
    return m;
  }, [s.interviews, s.quality]);
  const list = s.surveyors.filter((x) => (!con || x.constituencyId === con) && (!q || `${x.name} ${x.id} ${x.phone}`.toLowerCase().includes(q.toLowerCase())));

  const onFile = async (file) => {
    try {
      const rows = await readSheet(file);
      const parsed = rows.map((r, k) => {
        const booths = String(r['Booth IDs (comma separated)'] || r.Booths || '').split(',').map((x) => x.trim()).filter(Boolean);
        const errors = [];
        if (!r.Name) errors.push('Name missing');
        if (!/^\d{10}$/.test(String(r.Mobile || '').replace(/\D/g, '').slice(-10))) errors.push('Mobile must be 10 digits');
        if (r['Constituency code'] && !CONST_BY_ID[r['Constituency code']]) errors.push('Unknown constituency');
        booths.forEach((b) => { if (!BOOTH_BY_ID[b]) errors.push(`Unknown booth ${b}`); });
        return { row: k + 2, name: r.Name, phone: String(r.Mobile || ''), gender: r.Gender || '', role: r.Role || 'Surveyor', con: r['Constituency code'] || '', booths, device: r.Device || 'Android', errors };
      });
      setPreview({ file: file.name, rows: parsed });
    } catch {
      s.toast('Could not read the file. Use the Excel template.', 'error');
    }
  };
  const commit = () => {
    const ok = preview.rows.filter((r) => !r.errors.length);
    s.update((st) => {
      const base = st.surveyors || s.surveyors;
      return { surveyors: [...base, ...ok.map((r, k) => ({ id: nextId(base, k), name: r.name, phone: `+91 ${r.phone.replace(/\D/g, '').slice(-10)}`, gender: r.gender, role: r.role, constituencyId: r.con, boothIds: r.booths, device: r.device, status: 'Invited', joined: new Date().toISOString().slice(0, 10) }))] };
    });
    s.log(`Uploaded ${ok.length} team members from ${preview.file}`);
    s.toast(`${ok.length} people added. Each gets an SMS invite to install Pulse Field.`, 'success');
    setPreview(null);
  };
  const svs = s.surveyors.filter((x) => x.role === 'Surveyor');

  return (
    <div>
      <PageHead eyebrow="Set up" icon={Users} title="Surveyors & team" desc="Upload the field team from Excel, assign booths, and see each surveyor’s work and quality record. No limit on the number of surveyors or phones.">
        <button className="btn" onClick={downloadSurveyorTemplate}><Download size={15} />Excel template</button>
        <button className="btn primary" onClick={openNew}><UserPlus size={15} />Add person</button>
        <label className="btn" style={{ cursor: 'pointer' }}><Upload size={15} />Upload from Excel<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }} /></label>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Surveyors" value={svs.length} icon={Users} />
        <Stat label="Supervisors" value={s.surveyors.filter((x) => x.role === 'Supervisor').length} tone="indigo" />
        <Stat label="iPhone / Android" value={`${svs.filter((x) => x.device === 'iPhone').length} / ${svs.filter((x) => x.device !== 'iPhone').length}`} tone="blue" icon={Smartphone} />
        <Stat label="With quality concerns" value={Object.values(stats).filter((x) => x.flagged / x.n > 0.25).length} tone="red" hint="> 25% of interviews flagged" />
      </div>
      <Card flush title="Team" right={<>
        <div className="row nowrap" style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 10 }} className="faint" /><input className="input" style={{ paddingLeft: 30, width: 220 }} placeholder="Search name, ID, phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" style={{ width: 190 }} value={con} onChange={(e) => setCon(e.target.value)}><option value="">All constituencies</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
      </>}>
        <div className="table-wrap" style={{ maxHeight: 600 }}>
          <table className="t">
            <thead><tr><th>Name</th><th>Role</th><th>Constituency</th><th>Booths</th><th>Device</th><th className="num">Interviews</th><th className="num">Avg. min</th><th className="num">Flagged</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((x) => {
                const st = stats[x.id] || { n: 0, flagged: 0, dur: 0 };
                const rate = st.n ? st.flagged / st.n : 0;
                return (
                  <tr key={x.id}>
                    <td><div className="row nowrap"><div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(x.name)}</div><div><div className="bold">{x.name}</div><div className="tiny muted">{x.id} · {x.phone}</div></div></div></td>
                    <td><Badge tone={x.role === 'Supervisor' ? 'indigo' : ''}>{x.role}</Badge></td>
                    <td>{CONST_BY_ID[x.constituencyId]?.name.en || '—'}</td>
                    <td className="small">{x.boothIds.map((b) => BOOTH_BY_ID[b]?.short || b).join(', ') || '—'}</td>
                    <td className="small">{x.device}</td>
                    <td className="num">{st.n || '—'}</td>
                    <td className="num">{st.n ? (st.dur / st.n / 60).toFixed(1) : '—'}</td>
                    <td className="num">{st.n ? <span style={{ color: rate > 0.25 ? 'var(--red)' : rate > 0.08 ? 'var(--amber)' : 'var(--muted)', fontWeight: 700 }}>{st.flagged} ({(rate * 100).toFixed(0)}%)</span> : '—'}</td>
                    <td><Badge tone={x.status === 'Active' ? 'green' : x.status === 'Inactive' ? '' : 'blue'}>{x.status}</Badge></td>
                    <td><button className="btn ghost sm" onClick={() => openEdit(x)}><Pencil size={13} />Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {edit && (() => {
        const con = GEO.constituencies.find((c) => c.id === edit.constituencyId);
        const booths = GEO.booths.filter((b) => b.constituencyId === edit.constituencyId);
        return (
          <Modal title={edit.isNew ? 'Add team member' : `Edit ${edit.name} · ${edit.id}`} icon={edit.isNew ? UserPlus : Pencil} onClose={() => setEdit(null)}
            footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={saveEdit}>{edit.isNew ? 'Add person' : 'Save changes'}</button></>}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="grid g2" style={{ gap: 10 }}>
                <div className="field"><label>Full name</label><input className="input" value={edit.name} autoFocus onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div className="field"><label>Mobile (used to sign in)</label><input className="input" inputMode="numeric" maxLength={10} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value.replace(/\D/g, '') })} placeholder="10 digits" /></div>
                <div className="field"><label>Role</label><select className="select" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option>Surveyor</option><option>Supervisor</option></select></div>
                <div className="field"><label>Gender</label><select className="select" value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}><option>Female</option><option>Male</option><option>Other</option></select></div>
                <div className="field"><label>Phone type</label><select className="select" value={edit.device} onChange={(e) => setEdit({ ...edit, device: e.target.value })}><option>Android</option><option>iPhone</option></select></div>
                <div className="field"><label>Status</label><select className="select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>Active</option><option>Invited</option><option>Inactive</option></select></div>
              </div>
              <div className="field"><label>Constituency</label>
                <select className="select" value={edit.constituencyId} onChange={(e) => setEdit({ ...edit, constituencyId: e.target.value, boothIds: [] })}>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
              </div>
              <div className="field"><label>Booths assigned ({edit.boothIds.length}) {edit.role === 'Supervisor' ? '· optional for supervisors' : ''}</label>
                <div className="row" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {booths.map((b) => { const on = edit.boothIds.includes(b.id); return <button key={b.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setEdit({ ...edit, boothIds: on ? edit.boothIds.filter((x) => x !== b.id) : [...edit.boothIds, b.id] })}>{on ? '✓ ' : ''}{b.short || b.id}</button>; })}
                </div>
                <div className="tiny muted">The surveyor only sees these booths in {con?.name.en} on their phone.</div>
              </div>
              {edit.status === 'Inactive' && <div className="callout amber small"><AlertTriangle size={15} style={{ flexShrink: 0 }} />Inactive people cannot sign in. Their past interviews are kept.</div>}
              {!edit.isNew && <div className="tiny muted">Changing the mobile number moves the login to the new number; the old number stops working.</div>}
              {editErr && <div className="small" style={{ color: 'var(--red)' }}>{editErr}</div>}
            </div>
          </Modal>
        );
      })()}
      {preview && (
        <Modal wide title={`Check upload · ${preview.file}`} icon={FileSpreadsheet} onClose={() => setPreview(null)}
          footer={<><span className="small muted" style={{ marginRight: 'auto' }}>{preview.rows.filter((r) => !r.errors.length).length} ready · {preview.rows.filter((r) => r.errors.length).length} with errors (skipped)</span><button className="btn" onClick={() => setPreview(null)}>Cancel</button><button className="btn primary" onClick={commit} disabled={!preview.rows.some((r) => !r.errors.length)}>Add {preview.rows.filter((r) => !r.errors.length).length} people</button></>}>
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Row</th><th>Name</th><th>Mobile</th><th>Role</th><th>Constituency</th><th>Booths</th><th>Check</th></tr></thead>
            <tbody>{preview.rows.map((r) => (
              <tr key={r.row}><td>{r.row}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.role}</td><td>{r.con}</td><td>{r.booths.join(', ')}</td>
                <td>{r.errors.length ? <span className="row small" style={{ color: 'var(--red)' }}><AlertTriangle size={13} />{r.errors.join('; ')}</span> : <span className="row small" style={{ color: 'var(--green)' }}><CheckCircle2 size={13} />OK</span>}</td></tr>
            ))}</tbody>
          </table></div>
        </Modal>
      )}
    </div>
  );
}
