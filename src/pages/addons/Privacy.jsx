import React from 'react';
import { Lock, Unlock, Eye, Download, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Toggle, PII, Badge, Stat, Empty, fmtTime } from '../../components/ui.jsx';
import { BOOTH_BY_ID } from '../../data/geo.js';
import { exportTableExcel } from '../../lib/exporters.js';
import { R, piiQuestions } from '../../lib/roles.js';

export default function Privacy() {
  const s = useStore();
  const sample = s.interviews.slice(-8).reverse();
  const nameId = R('name');
  const phoneId = R('phone');
  const protectedCount = piiQuestions(s.questionnaire).length;
  return (
    <div>
      <PageHead eyebrow="Add-ons" icon={Lock} title="Extra privacy lock" desc="Names and phone numbers are replaced by codes everywhere: screens, exports and reports. Seeing a real value needs a reason, and every look is recorded permanently.">
        <button className="btn" onClick={() => exportTableExcel('Access log', ['Time', 'Person', 'Role', 'Interview', 'Field', 'Reason'], s.accessLog.map((a) => [fmtTime(a.t), a.who, a.role, a.interviewId, a.field, a.reason]), 'MSR-Pulse-Privacy-Access-Log.xlsx')}><Download size={15} />Export access log</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Card><div className="row"><div style={{ flex: 1 }}><div className="small muted bold">Privacy lock</div><div className="bold" style={{ fontSize: 22, marginTop: 4 }}>{s.privacyLock ? 'On' : 'Off'}</div></div>
          <Toggle on={s.privacyLock} onChange={(v) => { s.update({ privacyLock: v }); s.log(`Privacy lock turned ${v ? 'on' : 'off'}`); }} /></div></Card>
        <Stat label="Values revealed (all time)" value={s.accessLog.length} icon={Eye} tone="amber" />
        <Stat label="Personal fields protected" value={protectedCount} hint="Questions marked as personal details" tone="blue" icon={ShieldCheck} />
        <Stat label="Respondents protected" value={s.interviews.length.toLocaleString('en-IN')} tone="green" />
      </div>
      <div className="grid g2">
        <Card title="How respondents appear" sub="Click the eye icon to request a reveal" flush>
          <table className="t">
            <thead><tr><th>Interview</th><th>Respondent</th><th>Mobile</th><th>Booth</th></tr></thead>
            <tbody>{sample.map((i) => (
              <tr key={i.id}><td className="bold small">{i.id}</td><td><PII value={nameId && i.answers[nameId]} interviewId={i.id} question={nameId} /></td><td><PII value={phoneId && i.answers[phoneId]} kind="phone" interviewId={i.id} question={phoneId} /></td><td className="small">{BOOTH_BY_ID[i.boothId]?.short || i.boothId}</td></tr>
            ))}</tbody>
          </table>
          {!s.privacyLock && <div className="callout amber small" style={{ margin: 12 }}><Unlock size={15} />Lock is off: personal details are visible to everyone with access.</div>}
        </Card>
        <Card title="Privacy access log" sub="Who saw what, when and why — cannot be edited or deleted" flush>
          {s.accessLog.length === 0 ? <Empty icon={Eye} title="No values revealed yet">Reveal a name on the left to see it recorded here.</Empty> : (
            <div className="scroll-y" style={{ maxHeight: 420 }}>
              {s.accessLog.map((a, k) => (
                <div key={k} className="list-item">
                  <div className="avatar" style={{ width: 30, height: 30, background: '#f59e0b' }}><Eye size={14} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="small"><b>{a.who}</b> viewed <b>{a.field}</b> of {a.interviewId}</div>
                    <div className="tiny muted">Reason: “{a.reason}” · {fmtTime(a.t)}</div>
                  </div>
                  <Badge tone="amber">{a.role}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
