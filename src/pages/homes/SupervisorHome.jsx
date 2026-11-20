import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, Map, MoonStar, Users, ArrowRight, CheckCircle2, UserX } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { Card, Risk, Badge, Progress, fmtClock } from '../../components/ui.jsx';
import { rollup, istDay, latestDay } from '../../lib/analytics.js';
import { RULE_BY_ID, FLAG_THRESHOLD } from '../../lib/quality.js';
import { BOOTH_BY_ID, MANDAL_BY_ID, CONST_BY_ID } from '../../data/geo.js';

export default function SupervisorHome() {
  const s = useStore();
  const nav = useNavigate();
  const go = (to, mod) => s.can(mod) && nav(to);
  const today = latestDay(s.interviews);
  const todays = s.interviews.filter((i) => istDay(i.startedAt) === today);
  const toReview = s.interviews.filter((i) => s.statusOf(i.id) === 'Flagged').sort((a, b) => s.quality[b.id].score - s.quality[a.id].score);
  const ru = useMemo(() => rollup(s.valid, s.targets), [s.valid, s.targets]);
  const booths = ru.children.flatMap((c) => c.children.flatMap((m) => m.children));
  const behind = [...booths].sort((a, b) => a.pct - b.pct).slice(0, 6);
  const team = s.surveyors.filter((x) => x.role === 'Surveyor');
  const activeIds = new Set(todays.map((i) => i.surveyorId));
  const notActive = team.filter((x) => !activeIds.has(x.id)).slice(0, 6);
  const first = s.user.name.split(' ')[0];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="welcome">
        <div className="small" style={{ opacity: 0.8 }}>{new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h2 className="mt8">Good day, {first}. Here is today in the field.</h2>
        <p>Review flagged interviews, help booths that are behind, and check on surveyors who have not started.</p>
        <div className="kpis">
          <div className="kpi"><div className="v">{todays.length}</div><div className="l">Interviews today</div></div>
          <div className="kpi"><div className="v">{activeIds.size}/{team.length}</div><div className="l">Surveyors working today</div></div>
          <div className="kpi"><div className="v" style={{ color: toReview.length ? '#fecaca' : '#bbf7d0' }}>{toReview.length}</div><div className="l">Alerts waiting for you</div></div>
          <div className="kpi"><div className="v">{ru.pct.toFixed(0)}%</div><div className="l">Of all targets done</div></div>
        </div>
      </div>

      <div className="grid g3">
        {[
          [AlertOctagon, 'Review alerts', `${toReview.length} interviews need a decision`, '/live/alerts', 'live.alerts'],
          [Map, 'Live map', 'See every interview as it arrives', '/live', 'live.map'],
          [MoonStar, 'Evening summary', 'Tonight’s back-check list', '/live/digest', 'live.digest'],
        ].filter((x) => s.can(x[4])).map(([I, t, d, to, mod]) => (
          <button key={to} className="action-tile" onClick={() => go(to, mod)}>
            <div className="page-icon"><I size={19} /></div>
            <div style={{ flex: 1 }}><div className="t">{t}</div><div className="d">{d}</div></div>
            <ArrowRight size={16} className="faint" />
          </button>
        ))}
      </div>

      <div className="grid g2">
        <Card title="Needs your attention" sub="Highest-risk interviews first" flush right={s.can('live.alerts') && <button className="btn sm" onClick={() => nav('/live/alerts')}>Open all</button>}>
          {toReview.length === 0 ? <div className="empty"><CheckCircle2 size={28} color="#16a34a" /><div className="bold mt8">All clear</div><div className="small">No interviews are waiting for review.</div></div> : toReview.slice(0, 6).map((i) => (
            <div key={i.id} className={`list-item ${s.can('live.alerts') ? 'click' : ''}`} onClick={() => go(`/live/alerts?id=${i.id}`, 'live.alerts')}>
              <Risk q={s.quality[i.id]} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small bold">{s.surveyors.find((x) => x.id === i.surveyorId)?.name} · {BOOTH_BY_ID[i.boothId]?.short}</div>
                <div className="tiny muted">{s.quality[i.id].flags.map((f) => RULE_BY_ID[f.id].name).join(' · ')}</div>
              </div>
              <span className="tiny muted">{fmtClock(i.startedAt)}</span>
            </div>
          ))}
        </Card>
        <Card title="Booths furthest behind" sub="Send surveyors here next" flush>
          {behind.map((b) => (
            <div key={b.id} className="list-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small bold">{b.short} · {MANDAL_BY_ID[BOOTH_BY_ID[b.id].mandalId].name.en}</div>
                <div className="mt8"><Progress value={b.pct} sm /></div>
              </div>
              <div className="right-align"><div className="bold">{Math.max(0, b.target - b.n)}</div><div className="tiny muted">still needed</div></div>
            </div>
          ))}
        </Card>
      </div>

      <Card title={<span className="row"><UserX size={16} />Surveyors not started today</span>} sub={`${team.length - activeIds.size} of ${team.length}`} flush right={s.can('admin.team') && <button className="btn sm" onClick={() => nav('/admin/team')}><Users size={14} />Team</button>}>
        {notActive.length === 0 ? <div className="empty small">Everyone has started work today.</div> : (
          <table className="t">
            <thead><tr><th>Surveyor</th><th>Booth</th><th>Phone</th><th /></tr></thead>
            <tbody>{notActive.map((x) => (
              <tr key={x.id}><td className="bold">{x.name}</td><td className="small">{BOOTH_BY_ID[x.boothIds[0]]?.short}, {CONST_BY_ID[x.constituencyId]?.name.en}</td><td className="small">{x.phone}</td><td><Badge tone="amber">Not started</Badge></td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
