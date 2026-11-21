import React, { useEffect, useMemo, useState } from 'react';
import { Users, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Search, Smartphone, UserPlus, Pencil, ClipboardList, Briefcase } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Modal, Stat, Seg, initials } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { onTeam, boothsFor } from '../../lib/team.js';

// Field roles live in the team list (with booths); office roles and clients are logins only
const FIELD_ROLES = ['Surveyor', 'Supervisor'];
const OFFICE_ROLES = { Analyst: 'analyst', Admin: 'admin', Client: 'client' };
const ROLE_NOTE = {
  Surveyor: 'Phone app only. Works at the booths given below.',
  Supervisor: 'Watches fieldwork, reviews alerts and manages the team.',
  Analyst: 'Works on results, comparisons and the client report.',
  Admin: 'Full control of MSR Pulse. Give to very few people.',
  Client: 'Sees only their own surveys’ approved report and key results.',
};
import { CONST_BY_ID, BOOTH_BY_ID, GEO } from '../../data/geo.js';
import { downloadSurveyorTemplate, readSheet } from '../../lib/exporters.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function Team() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [con, setCon] = useState('');
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null); // person being added / edited
  const [editErr, setEditErr] = useState('');
  const survey = s.surveys?.find((x) => x.id === s.surveyId);
  const members = s.team?.members || null; // null = everyone works on this survey
  const canOffice = s.can('admin.access') && s.serverMode;
  const [office, setOffice] = useState([]);
  const loadOffice = () => { if (canOffice && !s.server?.offline) api('GET', '/api/users').then((u) => setOffice(u.filter((x) => ['admin', 'analyst', 'client'].includes(x.role)))).catch(() => {}); };
  useEffect(loadOffice, [canOffice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Survey team: who works on the open survey (and optional booths for this survey only)
  const setMode = (mode) => {
    if (mode === 'all') {
      if (members && !window.confirm('Let everyone in the team list work on this survey?')) return;
      s.update({ team: null });
      s.toast('Everyone in the team list can now work on this survey', 'success');
      return;
    }
    s.update({ team: { members: Object.fromEntries(s.surveyors.map((x) => [x.id, { boothIds: [] }])) } });
    s.toast('Now untick the people who should NOT work on this survey', 'info');
  };
  const toggleMember = (x) => {
    const m = { ...(members || {}) };
    if (m[x.id]) delete m[x.id]; else m[x.id] = { boothIds: [] };
    s.update({ team: { members: m } });
  };
  const nextId = (list, k = 0) => `SV-${String(list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + k + 1).padStart(3, '0')}`;
  const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const openNew = () => { setEditErr(''); setEdit({ isNew: true, name: '', phone: '', gender: 'Female', role: 'Surveyor', constituencyId: GEO.constituencies[0]?.id || '', boothIds: [], device: 'Android', status: 'Active', inSurvey: true, surveyBooths: [] }); };
  const openEdit = (x) => { setEditErr(''); setEdit({ ...x, phone: digits(x.phone), boothIds: [...(x.boothIds || [])], inSurvey: onTeam(s.team, x.id), surveyBooths: [...(members?.[x.id]?.boothIds || [])] }); };
  const openOffice = (u) => { setEditErr(''); setEdit({ office: true, phone: u.phone, name: u.name, role: Object.keys(OFFICE_ROLES).find((k) => OFFICE_ROLES[k] === u.role), active: u.active }); };
  const saveOffice = async () => {
    const e = edit;
    if (!e.name.trim()) return setEditErr('Enter the name');
    if (digits(e.phone).length !== 10) return setEditErr('Enter a 10-digit mobile number');
    try {
      if (e.isNew) await api('POST', '/api/users', { name: e.name.trim(), phone: digits(e.phone), role: OFFICE_ROLES[e.role] });
      else await api('PUT', `/api/users/${e.phone}`, { name: e.name.trim(), role: OFFICE_ROLES[e.role], active: e.active });
      s.toast(e.isNew ? `${e.name} can now sign in as ${e.role} with +91 ${digits(e.phone)}` : `${e.name} updated`, 'success');
      setEdit(null);
      loadOffice();
    } catch (err) { setEditErr(err.message); }
    return undefined;
  };
  const saveEdit = () => {
    const e = edit;
    if (OFFICE_ROLES[e.role]) return saveOffice();
    if (!e.name.trim()) return setEditErr('Enter the name');
    if (digits(e.phone).length !== 10) return setEditErr('Enter a 10-digit mobile number');
    if (office.some((u) => u.phone === digits(e.phone))) return setEditErr('This mobile number already has an office or client login');
    if (s.surveyors.some((x) => x.id !== e.id && digits(x.phone) === digits(e.phone))) return setEditErr('Another team member already uses this mobile number');
    if (e.role === 'Surveyor' && !e.boothIds.length) return setEditErr('Assign at least one booth to a surveyor');
    const rec = { id: e.id, name: e.name.trim(), phone: `+91 ${digits(e.phone)}`, gender: e.gender, role: e.role, constituencyId: e.constituencyId, boothIds: e.boothIds, device: e.device, status: e.status, joined: e.joined || new Date().toISOString().slice(0, 10) };
    const id = e.isNew ? nextId(s.surveyors) : e.id;
    s.update((st) => {
      const base = st.surveyors || s.surveyors;
      const next = e.isNew ? [...base, { ...rec, id }] : base.map((x) => (x.id === e.id ? { ...x, ...rec } : x));
      // This survey's team: add / remove the person, with booths for this survey only (empty = usual booths)
      let team = st.team;
      if (s.surveyId && (team?.members || !e.inSurvey)) {
        const m = { ...(team?.members || Object.fromEntries(base.map((x) => [x.id, { boothIds: [] }]))) };
        if (e.inSurvey) m[id] = { boothIds: e.surveyBooths || [] }; else delete m[id];
        team = { members: m };
      }
      return { surveyors: next, team };
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
  const onSurvey = s.surveyors.filter((x) => onTeam(s.team, x.id));

  return (
    <div>
      <PageHead eyebrow="Set up" icon={Users} title="Team & people" desc="Add everyone who uses MSR Pulse: surveyors and supervisors (with booths), analysts, admins and client logins. Choose who works on each survey. No limit on the number of surveyors or phones.">
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
      {s.surveyId && survey && (
        <Card style={{ marginBottom: 16 }} title={<span className="row"><ClipboardList size={16} />Team for this survey: {survey.title}</span>}
          sub="Surveyors only see a survey on their phone when they are on its team. People can be on several surveys at the same time; switch survey at the top to set up another one."
          right={<Seg value={members ? 'some' : 'all'} onChange={setMode} options={[{ value: 'all', label: 'Everyone' }, { value: 'some', label: 'Only selected people' }]} />}>
          <div className="row small">
            <Badge tone="teal">{plural(onSurvey.filter((x) => x.role === 'Surveyor').length, 'surveyor')}</Badge>
            <Badge tone="indigo">{plural(onSurvey.filter((x) => x.role === 'Supervisor').length, 'supervisor')}</Badge>
            <span className="muted">{members ? 'Tick or untick people in the list below. Use Edit to give someone different booths for this survey.' : 'Everyone in the team list below works on this survey at their usual booths.'}</span>
          </div>
        </Card>
      )}
      <Card flush title="Team" right={<>
        <div className="row nowrap" style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 10 }} className="faint" /><input className="input" style={{ paddingLeft: 30, width: 220 }} placeholder="Search name, ID, phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" style={{ width: 190 }} value={con} onChange={(e) => setCon(e.target.value)}><option value="">All constituencies</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
      </>}>
        <div className="table-wrap" style={{ maxHeight: 600 }}>
          <table className="t">
            <thead><tr>{s.surveyId && <th title="Works on the survey chosen at the top">This survey</th>}<th>Name</th><th>Role</th><th>Constituency</th><th>Booths</th><th>Device</th><th className="num">Interviews</th><th className="num">Avg. min</th><th className="num">Flagged</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((x) => {
                const st = stats[x.id] || { n: 0, flagged: 0, dur: 0 };
                const rate = st.n ? st.flagged / st.n : 0;
                return (
                  <tr key={x.id} style={{ opacity: onTeam(s.team, x.id) ? 1 : 0.55 }}>
                    {s.surveyId && <td>{members ? <input type="checkbox" checked={!!members[x.id]} onChange={() => toggleMember(x)} aria-label={`${x.name} works on this survey`} /> : <span className="tiny muted">all</span>}</td>}
                    <td><div className="row nowrap"><div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(x.name)}</div><div><div className="bold">{x.name}</div><div className="tiny muted">{x.id} · {x.phone}</div></div></div></td>
                    <td><Badge tone={x.role === 'Supervisor' ? 'indigo' : ''}>{x.role}</Badge></td>
                    <td>{CONST_BY_ID[x.constituencyId]?.name.en || '—'}</td>
                    <td className="small">{boothsFor(x, s.team).map((b) => BOOTH_BY_ID[b]?.short || b).join(', ') || '—'}{members?.[x.id]?.boothIds?.length ? <span className="badge blue" style={{ marginLeft: 6 }}>this survey</span> : null}{x.boothIds.some((b) => !BOOTH_BY_ID[b]) && <span className="badge red" style={{ marginLeft: 6 }} title="This booth is not in the current booth list. Correct it so the surveyor can work.">not in booth list</span>}</td>
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
      {canOffice && (
        <Card flush style={{ marginTop: 16 }} title={<span className="row"><Briefcase size={16} />Office staff & client logins</span>} sub="Admins, analysts and clients sign in with their mobile number. Add them with “Add person”.">
          <table className="t">
            <thead><tr><th>Name</th><th>Role</th><th>Mobile</th><th>Login</th><th /></tr></thead>
            <tbody>
              {office.length === 0 && <tr><td colSpan={5} className="small muted">No office or client logins yet.</td></tr>}
              {office.map((u) => (
                <tr key={u.phone} style={{ opacity: u.active ? 1 : 0.55 }}>
                  <td><div className="row nowrap"><div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(u.name)}</div><b>{u.name}</b></div></td>
                  <td><Badge tone={u.role === 'admin' ? 'navy' : u.role === 'client' ? 'amber' : 'indigo'}>{u.role[0].toUpperCase() + u.role.slice(1)}</Badge></td>
                  <td className="small">+91 {u.phone}</td>
                  <td><Badge tone={u.active ? 'green' : ''}>{u.active ? 'Can sign in' : 'Switched off'}</Badge></td>
                  <td><button className="btn ghost sm" onClick={() => openOffice(u)}><Pencil size={13} />Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {edit && (() => {
        const con = GEO.constituencies.find((c) => c.id === edit.constituencyId);
        const booths = GEO.booths.filter((b) => b.constituencyId === edit.constituencyId);
        return (
          <Modal title={edit.isNew ? 'Add a person' : `Edit ${edit.name}${edit.id ? ` · ${edit.id}` : ''}`} icon={edit.isNew ? UserPlus : Pencil} onClose={() => setEdit(null)}
            footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={saveEdit}>{edit.isNew ? `Add ${edit.role.toLowerCase()}` : 'Save changes'}</button></>}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="grid g2" style={{ gap: 10 }}>
                <div className="field"><label>Full name</label><input className="input" value={edit.name} autoFocus onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div className="field"><label>Mobile (used to sign in)</label><input className="input" inputMode="numeric" maxLength={10} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value.replace(/\D/g, '') })} placeholder="10 digits" /></div>
                <div className="field"><label>Role</label><select className="select" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                  {(edit.office ? [] : FIELD_ROLES).concat(canOffice && (edit.isNew || edit.office) ? Object.keys(OFFICE_ROLES) : []).map((r) => <option key={r}>{r}</option>)}
                </select><div className="tiny muted mt8">{ROLE_NOTE[edit.role]}</div></div>
                {!OFFICE_ROLES[edit.role] && <>
                <div className="field"><label>Gender</label><select className="select" value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}><option>Female</option><option>Male</option><option>Other</option></select></div>
                <div className="field"><label>Phone type</label><select className="select" value={edit.device} onChange={(e) => setEdit({ ...edit, device: e.target.value })}><option>Android</option><option>iPhone</option></select></div>
                <div className="field"><label>Status</label><select className="select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>Active</option><option>Invited</option><option>Inactive</option></select></div>
                </>}
                {OFFICE_ROLES[edit.role] && !edit.isNew && <div className="field"><label>Login</label><select className="select" value={edit.active ? 'on' : 'off'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'on' })}><option value="on">Can sign in</option><option value="off">Switched off</option></select></div>}
              </div>
              {!OFFICE_ROLES[edit.role] && <>
              <div className="field"><label>Constituency</label>
                <select className="select" value={edit.constituencyId} onChange={(e) => setEdit({ ...edit, constituencyId: e.target.value, boothIds: [] })}>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
              </div>
              <div className="field"><label>Booths assigned ({edit.boothIds.length}) {edit.role === 'Supervisor' ? '· optional for supervisors' : ''}</label>
                <div className="row" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {booths.map((b) => { const on = edit.boothIds.includes(b.id); return <button key={b.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setEdit({ ...edit, boothIds: on ? edit.boothIds.filter((x) => x !== b.id) : [...edit.boothIds, b.id] })}>{on ? '✓ ' : ''}{b.short || b.id}</button>; })}
                </div>
                <div className="tiny muted">The surveyor only sees these booths in {con?.name.en} on their phone.</div>
              </div>
              {s.surveyId && survey && (
                <div className="field" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
                  <label>Survey: {survey.title}</label>
                  <label className="check small"><input type="checkbox" checked={!!edit.inSurvey} onChange={(e) => setEdit({ ...edit, inSurvey: e.target.checked })} />Works on this survey</label>
                  {edit.inSurvey && edit.role === 'Surveyor' && (<>
                    <div className="tiny muted mt8">Booths for this survey only (leave all off to use the usual booths above):</div>
                    <div className="row mt8" style={{ maxHeight: 140, overflowY: 'auto' }}>
                      {GEO.booths.filter((b) => b.constituencyId === edit.constituencyId || (edit.surveyBooths || []).includes(b.id)).map((b) => { const on = (edit.surveyBooths || []).includes(b.id); return <button key={b.id} type="button" className={`chip ${on ? 'on' : ''}`} onClick={() => setEdit({ ...edit, surveyBooths: on ? edit.surveyBooths.filter((x) => x !== b.id) : [...(edit.surveyBooths || []), b.id] })}>{on ? '✓ ' : ''}{b.short || b.id}</button>; })}
                    </div>
                  </>)}
                </div>
              )}
              </>}
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
