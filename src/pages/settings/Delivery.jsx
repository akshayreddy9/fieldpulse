import React from 'react';
import { CalendarCheck2, CheckCircle2, Circle, LifeBuoy, Zap, Cloud, Apple, Play, MessageSquare, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge } from '../../components/ui.jsx';

const MILESTONES = [
  ['Agreement signed', 'Scope and requirements agreed', 'Week 0', 'done'],
  ['Test survey', 'A survey of MSR’s choice is set up and tested on Android and iPhone', 'About 8 weeks', 'now'],
  ['First live survey', 'The first real survey runs live and its results are ready', 'After test survey', ''],
  ['Handover', 'Security audit passed, team trained, everything handed over including source code', 'About 4 months', ''],
];
const ACCOUNTS = [
  [Cloud, 'Amazon (AWS) account in MSR’s name', 'Hosting, storage, backups in India'],
  [Apple, 'Apple developer account', 'To publish the iPhone app'],
  [Play, 'Google Play developer account', 'To publish the Android app'],
  [MessageSquare, 'SMS service', 'Login codes and alerts'],
  [ShieldCheck, 'CERT-In approved auditor', 'Before launch, then yearly'],
];

function months() {
  const out = [];
  const d = new Date(2026, 10, 1);
  for (let k = 0; k < 12; k++) {
    const x = new Date(d.getFullYear(), d.getMonth() + k, 1);
    out.push({ key: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`, label: x.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) });
  }
  return out;
}

export default function Delivery() {
  const s = useStore();
  const flip = (k) => s.update((st) => ({ peakMonths: st.peakMonths.includes(k) ? st.peakMonths.filter((x) => x !== k) : [...st.peakMonths, k] }));
  return (
    <div>
      <PageHead eyebrow="Settings" icon={CalendarCheck2} title="Delivery & support" desc="Milestones that can be checked, the support plan after launch, and the accounts MSR needs." />
      <div className="grid g2">
        <Card title="Delivery milestones">
          <div className="timeline">
            {MILESTONES.map(([t, d, w, st]) => (
              <div key={t} className={`tl-item ${st}`}>
                <div className="row"><b>{t}</b><Badge tone={st === 'done' ? 'green' : st === 'now' ? 'teal' : ''}>{st === 'done' ? 'Done' : st === 'now' ? 'In progress' : w}</Badge></div>
                <div className="small muted">{d}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Accounts & services MSR needs">
          <div className="stack" style={{ gap: 10 }}>
            {ACCOUNTS.map(([I, t, d]) => <div key={t} className="row nowrap"><div className="q-type-ico"><I size={16} /></div><div><div className="bold small">{t}</div><div className="tiny muted">{d}</div></div></div>)}
          </div>
        </Card>
        <Card title={<span className="row"><LifeBuoy size={16} />Support after launch</span>}>
          <div className="grid g2" style={{ gap: 10 }}>
            <div className="card" style={{ padding: 14, boxShadow: 'none' }}><div className="bold">Normal months</div><div className="small muted mt8">Bug fixes, security updates and small changes. Reply by the next working day.</div></div>
            <div className="card" style={{ padding: 14, boxShadow: 'none', background: '#fff7ed', borderColor: '#fdba74' }}><div className="bold row"><Zap size={15} color="#ea580c" />Peak months</div><div className="small muted mt8">Everything above, plus a check before the survey starts and same-day help on field days.</div></div>
          </div>
          <div className="small muted mt12">New features are scoped separately.</div>
        </Card>
        <Card title="Peak months" sub="MSR chooses peak months and informs the team before the month starts. Click to toggle.">
          <div className="month-grid">
            {months().map((m) => (
              <div key={m.key} className={`month ${s.peakMonths.includes(m.key) ? 'peak' : ''}`} onClick={() => flip(m.key)}>
                {s.peakMonths.includes(m.key) ? <Zap size={13} /> : <Circle size={11} className="faint" />}<div className="small">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="row mt12 small"><CheckCircle2 size={14} color="#16a34a" />{s.peakMonths.length} peak months selected</div>
        </Card>
      </div>
    </div>
  );
}
