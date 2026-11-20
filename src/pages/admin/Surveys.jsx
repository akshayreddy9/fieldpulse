import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, ArrowRight, Pencil, PlayCircle, StopCircle, Info, FileEdit, UserPlus } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Modal } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

const STATUS_TONE = { Draft: 'amber', Live: 'green', Closed: '' };
const STATUS_HELP = {
  Draft: 'Being prepared. Surveyors cannot see it yet.',
  Live: 'Fieldwork is running. Surveyors can do interviews.',
  Closed: 'Fieldwork finished. No new interviews; results and reports stay available.',
};

export default function Surveys() {
  const s = useStore();
  const nav = useNavigate();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null); // { mode: 'new' | 'edit', id?, title, clientPhone, copyFrom, status }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadClients = () => api('GET', '/api/users').then((u) => setClients(u.filter((x) => x.role === 'client' && x.active))).catch(() => {});
  useEffect(() => { if (s.serverMode) loadClients(); }, [s.serverMode]);

  if (!s.serverMode) {
    return (
      <div>
        <PageHead eyebrow="Set up" icon={ClipboardList} title="Surveys" desc="Run several surveys for different clients at the same time." />
        <Card><div className="callout blue small"><Info size={15} />Multiple surveys and clients are managed on the MSR Pulse server. This offline demo shows one sample survey.</div></Card>
      </div>
    );
  }

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      let clientPhone = form.clientPhone;
      if (clientPhone === '__new') {
        const c = await api('POST', '/api/users', { name: form.newClientName, phone: form.newClientPhone, role: 'client' });
        clientPhone = c.phone;
        await loadClients();
        s.toast(`Client login created for ${c.name}. They sign in with +91 ${c.phone}.`, 'success');
      }
      if (form.mode === 'new') {
        const sv = await s.createSurvey({ title: form.title, clientPhone: clientPhone || undefined, copyFrom: form.copyFrom });
        s.toast(`Survey “${sv.title}” created as a draft. Now write its questions.`, 'success');
        nav('/admin/builder');
      } else {
        await s.updateSurvey(form.id, { title: form.title, clientPhone: clientPhone || '', status: form.status });
        s.toast('Survey updated', 'success');
      }
      setForm(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const setStatus = async (sv, status) => {
    if (status === 'Closed' && !window.confirm(`Close “${sv.title}”? Surveyors will no longer be able to send interviews to it.`)) return;
    try { await s.updateSurvey(sv.id, { status }); s.toast(`“${sv.title}” is now ${status}`, 'success'); } catch (e) { s.toast(e.message, 'error'); }
  };
  const open = async (sv, to = '/') => { await s.selectSurvey(sv.id); nav(to); };

  return (
    <div>
      <PageHead eyebrow="Set up" icon={ClipboardList} title="Surveys" desc="Each survey has its own questionnaire, booth targets, interviews, reviews and client report. Each client sees only their own surveys.">
        <button className="btn primary" onClick={() => setForm({ mode: 'new', title: '', clientPhone: '', copyFrom: 'starter', newClientName: '', newClientPhone: '' })}><Plus size={15} />New survey</button>
      </PageHead>
      <Card flush>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Survey</th><th>Client</th><th>Status</th><th className="num">Interviews</th><th>Created</th><th /></tr></thead>
            <tbody>
              {s.surveys.map((sv) => (
                <tr key={sv.id} className={sv.id === s.surveyId ? 'sel' : ''}>
                  <td><div className="bold">{sv.title}</div><div className="tiny muted mono">{sv.id}{sv.id === s.surveyId ? ' · open now' : ''}</div></td>
                  <td>{sv.clientName || <span className="faint">No client yet</span>}</td>
                  <td><Badge tone={STATUS_TONE[sv.status]}>{sv.status}</Badge></td>
                  <td className="num">{sv.interviews.toLocaleString('en-IN')}</td>
                  <td className="small muted">{new Date(sv.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="right-align">
                    <div className="row nowrap" style={{ justifyContent: 'flex-end', gap: 4 }}>
                      {sv.status === 'Draft' && <button className="btn sm" onClick={() => setStatus(sv, 'Live')}><PlayCircle size={14} />Start fieldwork</button>}
                      {sv.status === 'Live' && <button className="btn sm" onClick={() => setStatus(sv, 'Closed')}><StopCircle size={14} />Close</button>}
                      {sv.status === 'Closed' && <button className="btn sm" onClick={() => setStatus(sv, 'Live')}><PlayCircle size={14} />Reopen</button>}
                      <button className="btn sm" onClick={() => open(sv, '/admin/builder')} title="Change the questions, then publish them to the phones"><FileEdit size={14} />Edit questions</button>
                      <button className="btn ghost sm" onClick={() => setForm({ mode: 'edit', id: sv.id, title: sv.title, clientPhone: sv.clientPhone || '', status: sv.status, newClientName: '', newClientPhone: '' })} title="Name, client and status"><Pencil size={14} />Details</button>
                      <button className="btn ghost sm" onClick={() => open(sv)} title="Open this survey's dashboard">Dashboard<ArrowRight size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="callout blue small mt16"><Info size={15} style={{ flexShrink: 0 }} /><div><b>How a survey goes live:</b> 1. <b>New survey</b> (it starts as a Draft) → 2. <b>Edit questions</b>, then <b>Publish to field</b> → 3. <b>Start fieldwork</b>. Only Live surveys appear on surveyors' phones.</div></div>
      <div className="grid g3 mt16">
        {Object.entries(STATUS_HELP).map(([k, v]) => <div key={k} className="callout teal small" style={{ background: '#fff', border: '1px solid var(--line)', color: 'var(--ink-2)' }}><Badge tone={STATUS_TONE[k]}>{k}</Badge><div>{v}</div></div>)}
      </div>

      {form && (
        <Modal title={form.mode === 'new' ? 'New survey' : 'Edit survey'} icon={ClipboardList} onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !form.title.trim() || (form.clientPhone === '__new' && (!form.newClientName.trim() || form.newClientPhone.length !== 10))}>{form.mode === 'new' ? 'Create survey' : 'Save'}</button></>}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="field"><label>Survey name</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hyderabad Civic Issues Survey 2027" autoFocus /></div>
            <div className="field"><label>Client (who will see the results)</label>
              <select className="select" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}>
                <option value="">No client yet</option>
                {clients.map((c) => <option key={c.phone} value={c.phone}>{c.name} · +91 {c.phone}</option>)}
                <option value="__new">+ Add a new client…</option>
              </select>
              {form.clientPhone === '__new' ? (
                <div className="grid g2 mt8" style={{ gap: 8 }}>
                  <input className="input" placeholder="Client name (e.g. Telangana Times)" value={form.newClientName} onChange={(e) => setForm({ ...form, newClientName: e.target.value })} />
                  <input className="input" placeholder="Client mobile (10 digits)" inputMode="numeric" maxLength={10} value={form.newClientPhone} onChange={(e) => setForm({ ...form, newClientPhone: e.target.value.replace(/D/g, '') })} />
                  <div className="tiny muted" style={{ gridColumn: '1 / -1' }}><UserPlus size={12} /> A client login is created. The client signs in with this mobile number and sees only their own surveys.</div>
                </div>
              ) : <div className="tiny muted">The client sees results and the approved report for this survey only.</div>}
            </div>
            {form.mode === 'new' ? (
              <div className="field"><label>Start the questionnaire from</label>
                <select className="select" value={form.copyFrom} onChange={(e) => setForm({ ...form, copyFrom: e.target.value })}>
                  <option value="blank">Blank - only location & consent, I will add my own questions</option>
                  <option value="starter">MSR starter questionnaire (sample civic questions)</option>
                  {s.surveys.map((sv) => <option key={sv.id} value={sv.id}>A copy of “{sv.title}”</option>)}
                </select>
                <div className="tiny muted">You can change every question afterwards in the questionnaire builder.</div>
              </div>
            ) : (
              <div className="field"><label>Status</label>
                <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.keys(STATUS_HELP).map((k) => <option key={k}>{k}</option>)}
                </select>
                <div className="tiny muted">{STATUS_HELP[form.status]}</div>
              </div>
            )}
            {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
