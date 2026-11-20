import React, { useState } from 'react';
import { Plug, KeyRound, Plus, Copy, Webhook, Trash2, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Modal } from '../../components/ui.jsx';
import { mainQuestionId } from '../../lib/reportGen.js';
import { findQuestion } from '../../data/questionnaire.js';
import { GEO } from '../../data/geo.js';

const SCOPES = ['results:read', 'interviews:read', 'reports:read', 'rollup:read'];
const usage = ['12', '13', '14', '15', '16', '17', '18'].map((d, k) => ({ d: `${d} Nov`, calls: [120, 340, 410, 380, 520, 610, 450][k] }));

export default function Api() {
  const s = useStore();
  const exampleQ = mainQuestionId(s.questionnaire) || 'QUESTION-ID';
  const exampleCols = (findQuestion(s.questionnaire, exampleQ)?.options || []).slice(0, 4).map((o, k) => `"${o.v}": ${[31.2, 27.5, 22.4, 9.8][k]}`).join(', ') || '"…": 0';
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['results:read']);
  const [newKey, setNewKey] = useState(null);
  const create = async () => {
    let secret;
    try { secret = await s.createApiKey(name || 'Untitled', scopes); } catch (e) { s.toast(e.message, 'error'); return; }
    if (!s.serverMode) s.log(`Created API key “${name || 'Untitled'}” (${scopes.join(', ')})`);
    setNewKey(secret);
    setOpen(false);
    setName('');
  };
  return (
    <div>
      <PageHead eyebrow="Add-ons" icon={Plug} title="Connect to other software" desc="A secure link so other systems (dashboards, the client’s BI tools) can pull results. Each key has limited permissions, can be revoked at any time, and every call is logged.">
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={15} />New API key</button>
      </PageHead>
      {newKey && <div className="callout teal" style={{ marginBottom: 16 }}><KeyRound size={16} style={{ flexShrink: 0 }} /><div style={{ flex: 1 }}>New key created. Copy it now; it will not be shown again.<div className="mono mt8">{newKey}</div></div><button className="btn sm" onClick={() => { navigator.clipboard?.writeText(newKey); s.toast('Copied', 'success'); }}><Copy size={13} />Copy</button></div>}
      <div className="grid g-2-1">
        <div className="stack">
          <Card flush title="API keys">
            <table className="t">
              <thead><tr><th>Name</th><th>Key</th><th>Permissions</th><th>Last used</th><th /></tr></thead>
              <tbody>{s.apiKeys.map((k) => (
                <tr key={k.id}><td className="bold">{k.name}</td><td className="mono">{k.id}••••</td><td>{k.scopes.map((x) => <Badge key={x} tone="indigo">{x}</Badge>)}</td><td className="small muted">{k.lastUsed}</td>
                  <td>{k.status === 'Active' ? <button className="btn danger sm" onClick={() => { s.revokeApiKey(k.id).catch((e) => s.toast(e.message, 'error')); if (!s.serverMode) s.log(`Revoked API key ${k.id}`); }}><Trash2 size={13} />Revoke</button> : <Badge>Revoked</Badge>}</td></tr>
              ))}</tbody>
            </table>
          </Card>
          <Card title="Example request">
            <div className="code-block">{`curl ${window.location.origin}/api/v1/surveys/${s.surveyId || 'SURVEY-ID'}/results?question=${exampleQ}&level=constituency \\
  -H "Authorization: Bearer msrp_live_••••••••"

{
  "survey": "${s.surveyId || 'SURVEY-ID'}",
  "question": "${exampleQ}",
  "base": ${s.valid.length},
  "level": "constituency",
  "results": [
    { "area": "${GEO.constituencies[0]?.name.en || 'Constituency'}", ${exampleCols} },
    ...
  ],
  "personal_data": "never included"
}`}</div>
            <div className="tiny muted mt8">Leave out <span className="mono">question</span> to get the survey's “Main result” question.</div>
          </Card>
        </div>
        <div className="stack">
          <Card title="Calls this week">
            <div style={{ height: 160 }}>
              <ResponsiveContainer><BarChart data={usage} margin={{ left: -20, right: 0, top: 6 }}><XAxis dataKey="d" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="calls" fill="#4f46e5" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
          </Card>
          <Card title={<span className="row"><Webhook size={16} />Webhooks</span>} sub="Push events to other systems">
            {s.webhooks.map((w) => <div key={w.id} className="small"><div className="mono">{w.url}</div><div className="row mt8">{w.events.map((e) => <Badge key={e} tone="teal">{e}</Badge>)}<Badge tone="green">{w.status}</Badge></div></div>)}
          </Card>
          <Card title={<span className="row"><ShieldCheck size={16} />Safeguards</span>}>
            <div className="stack small" style={{ gap: 6 }}>
              <div>• Personal details are never returned by the API</div><div>• Keys limited by permission and IP address</div><div>• Rate limits and full call log</div><div>• Hosted in India, TLS 1.3 only</div>
            </div>
          </Card>
        </div>
      </div>
      {open && (
        <Modal title="New API key" icon={KeyRound} onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={create} disabled={!scopes.length}>Create key</button></>}>
          <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client Power BI" autoFocus /></div>
          <div className="field mt12"><label>Permissions</label>
            <div className="row">{SCOPES.map((x) => <button key={x} className={`chip ${scopes.includes(x) ? 'on' : ''}`} onClick={() => setScopes(scopes.includes(x) ? scopes.filter((y) => y !== x) : [...scopes, x])}>{x}</button>)}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
