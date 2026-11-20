import React from 'react';
import { Scale, CheckCircle2, Lock, Server, Trash2, FileCheck2, KeyRound, Globe2, ShieldCheck, Clock } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { api } from '../../lib/api.js';
import { PageHead, Card, Badge, Stat } from '../../components/ui.jsx';

const DPDP = [
  ['Consent recorded for every respondent', 'Consent script read and audio-recorded before any question; refusals end the interview.'],
  ['Purpose limitation', 'Data is used only for the survey stated in the consent script.'],
  ['Data minimisation', 'Only name and optional mobile are collected as personal details, and they are hidden by default.'],
  ['Encryption', 'AES-256 at rest (MSR-owned AWS KMS keys), TLS 1.3 in transit, encrypted storage on phones.'],
  ['Scheduled deletion', 'Personal details are erased automatically after the retention period; answers are kept anonymously.'],
  ['Rights of respondents', 'Requests to see or erase data are handled through the privacy access log with a recorded reason.'],
  ['Breach readiness', 'Audit logs, alerts and an incident plan for notifying the Data Protection Board and CERT-In within the required time.'],
  ['Data stays in India', 'All storage, backups and AI processing run in AWS India regions (Hyderabad, with Mumbai as backup).'],
];

export default function Compliance() {
  const s = useStore();
  const jobs = [
    ['Round 1 (May 2026)', 'Personal details erased', '2026-11-08', 'Done'],
    ['Round 2 (Aug 2026)', 'Erase names & mobiles', new Date(Date.parse('2026-08-16') + s.retentionDays * 86400000).toISOString().slice(0, 10), 'Scheduled'],
    ['Round 3 (Nov 2026)', 'Erase names & mobiles', new Date(Date.parse('2026-11-18') + s.retentionDays * 86400000).toISOString().slice(0, 10), 'Scheduled'],
    ['Audio recordings, all rounds', 'Delete recordings', `${s.retentionDays} days after report approval`, 'Policy'],
  ];
  return (
    <div>
      <PageHead eyebrow="Settings" icon={Scale} title="Security, privacy & DPDP" desc="How MSR Pulse meets India’s Digital Personal Data Protection Act, where the data lives, and who owns it." />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Hosting" value="AWS India" hint="MSR’s own account · ap-south-2 + ap-south-1" icon={Server} />
        <Stat label="Encryption" value="AES-256" hint="MSR-owned KMS keys" tone="indigo" icon={KeyRound} />
        <Stat label="Consent recorded" value="100%" hint={`${s.interviews.length.toLocaleString('en-IN')} interviews`} tone="green" icon={FileCheck2} />
        <Stat label="Security audit" value="CERT-In" hint="Before launch, then every year" tone="amber" icon={ShieldCheck} />
      </div>
      <div className="grid g2">
        <Card title="DPDP Act checklist">
          <div className="stack" style={{ gap: 12 }}>
            {DPDP.map(([t, d]) => <div key={t} className="row nowrap" style={{ alignItems: 'flex-start' }}><CheckCircle2 size={17} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} /><div><div className="bold small">{t}</div><div className="small muted">{d}</div></div></div>)}
          </div>
        </Card>
        <div className="stack">
          <Card title={<span className="row"><Trash2 size={16} />Scheduled deletion of personal details</span>} right={<div className="row">{s.serverMode && s.can('settings.compliance') && <button className="btn sm" onClick={async () => { try { const r = await api('POST', '/api/admin/run-retention', {}); s.toast(r.erased ? `Erased personal details from ${r.erased} interviews` : 'Nothing older than the retention period', 'success'); if (r.erased) s.reload(); } catch (e) { s.toast(e.message, 'error'); } }}>Run deletion now</button>}<span className="small muted">Keep for</span><select className="select" style={{ width: 110 }} value={s.retentionDays} onChange={(e) => { s.update({ retentionDays: Number(e.target.value) }); s.log(`Retention period set to ${e.target.value} days`); }}>{[90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select></div>} flush>
            <table className="t">
              <thead><tr><th>Data</th><th>Action</th><th>Date</th><th /></tr></thead>
              <tbody>{jobs.map(([a, b, c, d]) => <tr key={a}><td className="bold small">{a}</td><td className="small">{b}</td><td className="small">{c}</td><td><Badge tone={d === 'Done' ? 'green' : d === 'Scheduled' ? 'blue' : ''}>{d}</Badge></td></tr>)}</tbody>
            </table>
          </Card>
          <Card title="Ownership">
            <div className="stack small" style={{ gap: 8 }}>
              {[[Globe2, 'Runs in MSR’s own AWS account, with all data kept in India'], [Lock, 'MSR owns its data, questionnaires, reports and the system itself'], [FileCheck2, 'Full source code handed over to MSR'], [ShieldCheck, 'MSR’s data, questionnaires, reports and name are never reused or shown without permission'], [Clock, 'No limit on the number of surveyors or phones']].map(([I, t]) => (
                <div key={t} className="row nowrap"><I size={15} color="#0d9488" style={{ flexShrink: 0 }} />{t}</div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
