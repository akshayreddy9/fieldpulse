import React from 'react';
import { Scale, CheckCircle2, Lock, Server, Trash2, FileCheck2, KeyRound, Globe2, ShieldCheck, Clock } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { api } from '../../lib/api.js';
import { PageHead, Card, Badge, Stat } from '../../components/ui.jsx';

// [item, how, status] - status 'done' = working today, 'golive' = before real fieldwork (honest for client review)
const DPDP = [
  ['Consent recorded for every respondent', 'Consent script read aloud before any question; the server refuses interviews without consent; refusals end the interview.', 'done'],
  ['Purpose limitation', 'Data is used only for the survey stated in the consent script.', 'done'],
  ['Data minimisation', 'Only the personal details marked in the questionnaire (e.g. name, optional mobile) are collected, and they are hidden by the privacy lock.', 'done'],
  ['Encryption on the server', 'Encrypted disk and nightly encrypted backups with an MSR-owned AWS KMS key; HTTPS for all traffic.', 'done'],
  ['Encryption on phones', 'Interviews waiting to be sent are encrypted on the phone itself.', 'golive'],
  ['Scheduled deletion', 'Personal details are erased automatically after the retention period; answers are kept anonymously.', 'done'],
  ['Rights of respondents', 'Every reveal of a personal detail needs a reason and is recorded in the privacy access log.', 'done'],
  ['Breach readiness', 'Audit log of every action is in place; a written incident plan for notifying the Data Protection Board and CERT-In is prepared at go-live.', 'golive'],
  ['Data stays in India', 'Real survey data is kept only in MSR’s own AWS account in Mumbai (ap-south-1). The AI report draft receives only totals, never personal details.', 'golive'],
  ['Independent security audit', 'CERT-In empanelled auditor before launch, then every year.', 'golive'],
];

export default function Compliance() {
  const s = useStore();
  const test = !s.serverMode || s.server?.sample;
  const [lastRun, setLastRun] = React.useState(null);
  // The real deletion policy (the server checks every 6 hours); no invented history
  const jobs = [
    ['Respondent names & mobile numbers', `Erased ${s.retentionDays} days after the interview`, 'Automatic, checked every 6 hours'],
    ['Other personal-detail questions', 'Erased together with names and mobiles', 'Automatic'],
    ['Photos', 'Only “photo taken / not taken” is kept on the server', 'Photo upload not built yet'],
    ['Audio recordings', 'Kept on the surveyor’s phone today', 'Upload + deletion policy planned'],
  ];
  return (
    <div>
      <PageHead eyebrow="Settings" icon={Scale} title="Security, privacy & DPDP" desc="How MSR Pulse meets India’s Digital Personal Data Protection Act, where the data lives, and who owns it." />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Hosting" value={test ? 'Test site' : 'AWS India'} hint={test ? 'Sample data only · real data goes to MSR’s own AWS account, Mumbai' : 'MSR’s own AWS account · Mumbai (ap-south-1)'} icon={Server} tone={test ? 'amber' : 'teal'} />
        <Stat label="Encryption" value="AES-256" hint="Server disk + backups, MSR-owned KMS key" tone="indigo" icon={KeyRound} />
        <Stat label="Consent recorded" value="100%" hint={`${s.interviews.length.toLocaleString('en-IN')} interviews`} tone="green" icon={FileCheck2} />
        <Stat label="Security audit" value="Planned" hint="CERT-In auditor before launch, then yearly" tone="amber" icon={ShieldCheck} />
      </div>
      <div className="grid g2">
        <Card title="DPDP Act checklist">
          <div className="stack" style={{ gap: 12 }}>
            {DPDP.map(([t, d, st]) => <div key={t} className="row nowrap" style={{ alignItems: 'flex-start' }}>{st === 'done' ? <CheckCircle2 size={17} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} /> : <Clock size={17} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />}<div style={{ flex: 1 }}><div className="bold small row" style={{ gap: 6 }}>{t}<Badge tone={st === 'done' ? 'green' : 'amber'}>{st === 'done' ? 'In place' : 'Before go-live'}</Badge></div><div className="small muted">{d}</div></div></div>)}
          </div>
        </Card>
        <div className="stack">
          <Card title={<span className="row"><Trash2 size={16} />Scheduled deletion of personal details</span>} right={<div className="row">{s.serverMode && s.can('settings.compliance') && <button className="btn sm" onClick={async () => { try { const r = await api('POST', '/api/admin/run-retention', {}); setLastRun({ ...r, at: Date.now() }); s.toast(r.erased ? `Erased personal details from ${r.erased} interviews` : 'Nothing older than the retention period', 'success'); if (r.erased) s.reload(); } catch (e) { s.toast(e.message, 'error'); } }}>Run deletion now</button>}<span className="small muted">Keep for</span><select className="select" style={{ width: 110 }} value={s.retentionDays} onChange={(e) => { s.update({ retentionDays: Number(e.target.value) }); s.log(`Retention period set to ${e.target.value} days`); }}>{[90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select></div>} flush>
            <table className="t">
              <thead><tr><th>Data</th><th>Rule</th><th>How</th></tr></thead>
              <tbody>{jobs.map(([a, b, c]) => <tr key={a}><td className="bold small">{a}</td><td className="small">{b}</td><td className="small muted">{c}</td></tr>)}</tbody>
            </table>
            {lastRun && <div className="small" style={{ padding: '10px 16px' }}>Last run just now: {lastRun.erased} interview(s) older than {lastRun.days} days cleaned.</div>}
          </Card>
          <Card title="Ownership">
            <div className="stack small" style={{ gap: 8 }}>
              {[[Globe2, test ? 'At go-live: runs in MSR’s own AWS account, with all data kept in India (this test site holds sample data only)' : 'Runs in MSR’s own AWS account, with all data kept in India'], [Lock, 'MSR owns its data, questionnaires, reports and the system itself'], [FileCheck2, 'Full source code handed over to MSR'], [ShieldCheck, 'MSR’s data, questionnaires, reports and name are never reused or shown without permission'], [Clock, 'No limit on the number of surveyors or phones']].map(([I, t]) => (
                <div key={t} className="row nowrap"><I size={15} color="#0d9488" style={{ flexShrink: 0 }} />{t}</div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
