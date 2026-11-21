import React, { useMemo, useState } from 'react';
import { MoonStar, Download, Mail, MessageCircle, Send, PhoneCall, Clock } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Risk, Stat, fmtClock } from '../../components/ui.jsx';
import { RULE_BY_ID, FLAG_THRESHOLD } from '../../lib/quality.js';
import { BOOTH_BY_ID, CONST_BY_ID, GEO } from '../../data/geo.js';
import { istDay, latestDay } from '../../lib/analytics.js';
import { exportTableExcel } from '../../lib/exporters.js';

export default function Digest() {
  const s = useStore();
  const days = useMemo(() => [...new Set(s.interviews.map((i) => istDay(i.startedAt)))].sort().reverse(), [s.interviews]);
  const [day, setDay] = useState(latestDay(s.interviews));
  const [sendTime, setSendTime] = useState('19:00');
  const todays = s.interviews.filter((i) => istDay(i.startedAt) === day);
  const score = (i) => s.quality[i.id]?.score || 0;
  const flagged = todays.filter((i) => score(i) >= FLAG_THRESHOLD).sort((a, b) => score(b) - score(a));
  const byCon = GEO.constituencies.map((c) => ({ c, list: flagged.filter((i) => i.constituencyId === c.id), total: todays.filter((i) => i.constituencyId === c.id).length }));
  const supervisors = s.surveyors.filter((x) => x.role === 'Supervisor');
  // Message preview: the constituency with the most flagged interviews that day
  const sample = [...byCon].sort((a, b) => b.list.length - a.list.length || b.total - a.total)[0];

  const exportList = () => exportTableExcel('Back-check list', ['Interview', 'Risk score', 'Reasons', 'Surveyor', 'Booth', 'Constituency', 'Time', 'Respondent code', 'Status'],
    flagged.map((i) => [i.id, score(i), (s.quality[i.id]?.flags || []).map((f) => RULE_BY_ID[f.id].name).join(', '), i.surveyorId, BOOTH_BY_ID[i.boothId]?.short, CONST_BY_ID[i.constituencyId]?.name.en, fmtClock(i.startedAt), i.id.replace('INT', 'R'), s.statusOf(i.id)]),
    `Back-check-list-${day}.xlsx`);

  return (
    <div>
      <PageHead eyebrow="Fieldwork" icon={MoonStar} title="Evening summary" desc="Every evening, each supervisor gets the list of that day’s flagged interviews for their area, so back-checks focus only on suspicious interviews instead of random re-visits.">
        <select className="select" style={{ width: 180 }} value={day} onChange={(e) => setDay(e.target.value)}>{days.map((d) => <option key={d} value={d}>{new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}</select>
        <button className="btn" onClick={exportList}><Download size={15} />Back-check list (Excel)</button>
        {/* Automatic SMS / WhatsApp / email delivery is not connected yet: say so instead of pretending */}
        <button className="btn primary" onClick={() => s.toast('Automatic sending by SMS, WhatsApp or email is not set up yet. Download the back-check list (Excel) and share it with the supervisors.', 'info')}><Send size={15} />Send now</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Interviews this day" value={todays.length} />
        <Stat label="Flagged for back-check" value={flagged.length} tone="red" hint={`${((flagged.length / (todays.length || 1)) * 100).toFixed(1)}% of the day`} />
        <Stat label="Back-checks saved" value={`~${Math.max(0, Math.round(todays.length * 0.2) - flagged.length)}`} tone="green" hint="vs. checking a random 20%" />
        <Stat label="Planned send time" value={sendTime} tone="indigo" icon={Clock} hint="Automatic sending not connected yet" />
      </div>
      <div className="grid g-2-1">
        <Card title="Digest by constituency" flush>
          {byCon.map(({ c, list, total }) => (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
              <div className="row" style={{ padding: '12px 18px' }}>
                <b>{c.name.en}</b><span className="small muted">{total} interviews · supervisor {supervisors.find((x) => x.constituencyId === c.id)?.name}</span>
                <div className="spacer" /><Badge tone={list.length ? 'red' : 'green'}>{list.length ? `${list.length} to back-check` : 'All clear'}</Badge>
              </div>
              {list.length > 0 && (
                <table className="t" style={{ marginBottom: 6 }}>
                  <tbody>{list.map((i) => (
                    <tr key={i.id}><td style={{ width: 54 }}><Risk q={s.quality[i.id]} /></td><td className="bold small">{i.id}</td><td className="small">{i.surveyorId} · {BOOTH_BY_ID[i.boothId]?.short}</td><td className="small muted">{fmtClock(i.startedAt)}</td>
                      <td>{(s.quality[i.id]?.flags || []).map((f) =><Badge key={f.id} tone="red">{RULE_BY_ID[f.id].name}</Badge>)}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          ))}
        </Card>
        <div className="stack">
          <Card title="Delivery settings" sub="Preview: automatic sending is not connected yet">
            <div className="stack" style={{ gap: 12 }}>
              <div className="field"><label>Send every evening at</label><input className="input" type="time" value={sendTime} onChange={(e) => setSendTime(e.target.value)} /></div>
              <div className="row small"><MessageCircle size={15} color="#16a34a" />WhatsApp to each supervisor</div>
              <div className="row small"><Mail size={15} color="#2563eb" />Email to the MSR quality team</div>
              <div className="row small"><PhoneCall size={15} color="#d97706" />SMS summary to field coordinators</div>
            </div>
          </Card>
          <Card title="Message preview" sub="What a supervisor receives">
            <div style={{ background: '#e7f8ee', borderRadius: 14, padding: 14, fontSize: 13, lineHeight: 1.6, border: '1px solid #c6ecd5' }}>
              <b>MSR Pulse · Evening digest</b><br />
              {sample ? (<>
                {day ? new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''} · {sample.c.name.en}<br />
                {sample.total} interviews, <b>{sample.list.length} flagged</b><br />
                {sample.list.slice(0, 3).map((i) => <span key={i.id}>• {i.id} ({i.surveyorId}): {(s.quality[i.id]?.flags || []).map((f) => RULE_BY_ID[f.id].name.toLowerCase()).join(', ')}<br /></span>)}
                Please back-check by 12 noon tomorrow. Tap to open the list in MSR Pulse.
              </>) : 'No booth list yet.'}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
