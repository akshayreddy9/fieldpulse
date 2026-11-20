import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Search, Power } from 'lucide-react';
import { useStore, ROLES } from '../../store.jsx';
import { Card, Badge, Modal, initials } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

const ROLE_HELP = {
  admin: 'Full control of MSR Pulse. Give to very few people.',
  supervisor: 'Watches fieldwork and reviews alerts.',
  analyst: 'Works on results and the client report.',
  client: 'Sees only their approved report and key results.',
  surveyor: 'Phone app only. Usually added through the Excel upload on Surveyors & team.',
};

// Admin screen: who can sign in, with which role. Nobody else can sign in.
export default function PeopleLogins() {
  const s = useStore();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('staff');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', role: 'client' });
  const [err, setErr] = useState('');
  const load = () => api('GET', '/api/users').then(setUsers).catch((e) => s.toast(e.message, 'error'));
  useEffect(() => { if (s.serverMode && !s.server?.offline) load(); }, [s.serverMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => Object.fromEntries(Object.keys(ROLES).map((r) => [r, users.filter((u) => u.role === r && u.active).length])), [users]);
  const shown = users
    .filter((u) => (filter === 'staff' ? ['admin', 'supervisor', 'analyst'].includes(u.role) : filter === 'all' ? true : u.role === filter))
    .filter((u) => !q || `${u.name} ${u.phone}`.toLowerCase().includes(q.toLowerCase()));

  const add = async () => {
    setErr('');
    try {
      await api('POST', '/api/users', form);
      s.toast(`${form.name} can now sign in with +91 ${form.phone}`, 'success');
      setAdding(false);
      setForm({ name: '', phone: '', role: 'client' });
      load();
    } catch (e) { setErr(e.message); }
  };
  const toggle = async (u) => {
    if (u.active && !window.confirm(`Switch off the login for ${u.name}? They will be signed out immediately.`)) return;
    try { await api('PUT', `/api/users/${u.phone}`, { active: !u.active }); load(); } catch (e) { s.toast(e.message, 'error'); }
  };

  if (!s.serverMode) {
    return <Card title="People & logins"><div className="small muted">Logins are managed on the MSR Pulse server. This offline demo uses fixed demo accounts.</div></Card>;
  }

  return (
    <Card flush title="People & logins" sub="Only people listed here can sign in. Their role decides what they see."
      right={<button className="btn primary sm" onClick={() => setAdding(true)}><UserPlus size={14} />Add a login</button>}>
      <div className="row" style={{ padding: '12px 18px', gap: 6, borderBottom: '1px solid var(--line-2)' }}>
        {[['staff', `MSR staff (${counts.admin + counts.supervisor + counts.analyst})`], ['client', `Clients (${counts.client})`], ['surveyor', `Surveyors (${counts.surveyor})`], ['all', 'Everyone']].map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <div className="spacer" />
        <div className="row nowrap" style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 10 }} className="faint" /><input className="input" style={{ paddingLeft: 30, width: 200, height: 32 }} placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="t">
          <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.slice(0, 200).map((u) => (
              <tr key={u.phone} style={{ opacity: u.active ? 1 : 0.55 }}>
                <td><div className="row nowrap"><div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(u.name)}</div><b>{u.name}</b>{u.phone === s.user.phone && <Badge tone="teal">You</Badge>}</div></td>
                <td className="small">+91 {u.phone}</td>
                <td><Badge tone={u.role === 'admin' ? 'navy' : u.role === 'client' ? 'blue' : u.role === 'surveyor' ? '' : 'teal'}>{ROLES[u.role]?.label || u.role}</Badge></td>
                <td>{u.active ? <Badge tone="green">Can sign in</Badge> : <Badge>Switched off</Badge>}</td>
                <td className="right-align">{u.phone !== s.user.phone && <button className="btn ghost sm" onClick={() => toggle(u)}><Power size={13} />{u.active ? 'Switch off' : 'Switch on'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="empty small">Nobody here yet.</div>}
      </div>
      {adding && (
        <Modal title="Add a login" icon={UserPlus} onClose={() => setAdding(false)}
          footer={<><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" onClick={add} disabled={!form.name.trim() || form.phone.replace(/\D/g, '').length < 10}>Add login</button></>}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="field"><label>Name (person or client organisation)</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            <div className="field"><label>Mobile number (they sign in with this)</label><div className="row nowrap"><span className="input" style={{ width: 60, display: 'grid', placeItems: 'center', background: '#f8fafc' }}>+91</span><input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></div>
            <div className="field"><label>Role</label>
              <div className="stack" style={{ gap: 6 }}>
                {['client', 'analyst', 'supervisor', 'admin'].map((r) => (
                  <label key={r} className="check" style={{ alignItems: 'flex-start', padding: '8px 10px', border: `1.5px solid ${form.role === r ? 'var(--teal)' : 'var(--line)'}`, borderRadius: 10 }}>
                    <input type="radio" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} style={{ marginTop: 3 }} />
                    <span><b>{ROLES[r].label}</b><br /><span className="tiny muted">{ROLE_HELP[r]}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="tiny muted">Surveyors are added on <b>Surveyors & team</b> (Excel upload); each one gets a login automatically.</div>
            {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}
          </div>
        </Modal>
      )}
    </Card>
  );
}
