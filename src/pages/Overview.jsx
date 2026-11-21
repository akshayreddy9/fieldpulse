import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from 'recharts';
import {
  FileEdit, Smartphone, Radar, BarChart3, FileText, ArrowRight, XCircle, CheckCircle2, Cloud, Database, Cpu, Lock, ShieldCheck,
  WifiOff, Server, Sparkles, Users, HardDrive, Activity, BellRing,
} from 'lucide-react';
import { useStore } from '../store.jsx';
import { Card, PageHead } from '../components/ui.jsx';
import { frequency, istDay, latestDay, rollup } from '../lib/analytics.js';
import { findQuestion } from '../data/questionnaire.js';
import { GEO } from '../data/geo.js';
import { mainQuestionId } from '../lib/reportGen.js';
import { onTeam, boothsFor } from '../lib/team.js';
import { colorFor } from '../components/charts.jsx';

const STEPS = [
  { n: '01', t: 'Set up', m: 'Pulse Admin', d: 'Bilingual questionnaire, skip logic, booth targets, surveyor upload', icon: FileEdit, to: '/admin/builder', c: ['#eef0ff', '#4f46e5'] },
  { n: '02', t: 'Interview', m: 'Pulse Field app', d: 'Android & iPhone, offline, consent recording, GPS + time', icon: Smartphone, to: '/field', c: ['#e6f7f5', '#0d9488'] },
  { n: '03', t: 'Check live', m: 'Pulse Live', d: 'Live map, booth progress, same-evening fake-interview alerts', icon: Radar, to: '/live', c: ['#fff6e5', '#d97706'] },
  { n: '04', t: 'Results', m: 'Pulse Insights', d: 'Auto totals booth → mandal → constituency → state', icon: BarChart3, to: '/insights/results', c: ['#edf3ff', '#2563eb'] },
  { n: '05', t: 'Report', m: 'Pulse Insights', d: 'AI first draft + MSR advice → branded PDF to the client', icon: FileText, to: '/insights/report', c: ['#ffeef2', '#e11d48'] },
];

const PROBLEMS = [
  ['Questionnaires built in GoSurvey, a separate tool', 'Questionnaire builder is part of MSR Pulse: Telugu + English, skip logic, preview, versioning'],
  ['Booth targets & fake interviews checked only after data returns → extra back-check rounds', 'Quotas tracked live per booth; 9 automatic quality checks flag suspicious interviews the same evening'],
  ['Totals merged by hand in Excel', 'Booth → mandal → constituency → state totals added up automatically, exportable to Excel'],
  ['Every client report written from scratch', 'AI writes the first draft from the data; MSR adds its advice; one click to a branded PDF'],
];

export default function Overview() {
  const s = useStore();
  const nav = useNavigate();
  const today = latestDay(s.interviews);
  const todayCount = s.interviews.filter((i) => istDay(i.startedAt) === today).length;
  const flaggedOpen = s.interviews.filter((i) => s.statusOf(i.id) === 'Flagged').length;
  const ru = useMemo(() => rollup(s.valid, s.targets), [s.valid, s.targets]);
  const boothsOnTrack = ru.children.flatMap((c) => c.children.flatMap((m) => m.children)).filter((b) => b.pct >= 75).length;
  const perDay = useMemo(() => {
    const m = {};
    s.interviews.forEach((i) => { const d = istDay(i.startedAt); m[d] = (m[d] || 0) + 1; });
    return Object.keys(m).sort().map((d) => ({ d: new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), n: m[d] }));
  }, [s.interviews]);
  const mainId = mainQuestionId(s.questionnaire);
  const vote = useMemo(() => frequency(s.questionnaire, mainId, s.valid)?.rows || [], [s.questionnaire, mainId, s.valid]);
  const survey = s.surveys?.find((x) => x.id === s.surveyId);
  const isToday = today === istDay(Date.now());

  // Things an admin should act on, most urgent first: [tone, text, link]
  const attention = useMemo(() => {
    const out = [];
    const booths = ru.children.flatMap((c) => c.children.flatMap((m) => m.children));
    const behind = booths.filter((b) => b.target && b.pct < 50).length;
    const team = s.surveyors.filter((x) => x.role === 'Surveyor' && x.status !== 'Inactive' && onTeam(s.team, x.id) && boothsFor(x, s.team).length);
    const activeToday = new Set(s.interviews.filter((i) => istDay(i.startedAt) === istDay(Date.now())).map((i) => i.surveyorId));
    const idle = team.filter((x) => !activeToday.has(x.id)).length;
    if (flaggedOpen) out.push(['red', <><b>{flaggedOpen}</b> flagged interviews are waiting for review</>, '/live/alerts']);
    if (behind) out.push(['amber', <><b>{behind}</b> booths are below 50% of their quota</>, '/admin/targets']);
    if (survey?.status === 'Live' && team.length && idle) out.push(['amber', <><b>{idle}</b> of {team.length} surveyors have not sent an interview today</>, '/live']);
    if (GEO.sample) out.push(['blue', <>The <b>sample booth list</b> is in use. Upload MSR’s real booth list before real fieldwork</>, '/admin/booths']);
    if (GEO.empty) out.push(['red', <>No booth list yet. Surveyors cannot start until it is uploaded</>, '/admin/booths']);
    if (s.draftQuestionnaire) out.push(['blue', <>The questionnaire has <b>unpublished changes</b></>, '/admin/builder']);
    if (!mainId) out.push(['blue', <>No question is marked as <b>Main result</b>. Mark one in the questionnaire builder for headline charts and the report</>, '/admin/builder']);
    if (survey?.status === 'Draft') out.push(['blue', <>This survey is still a <b>Draft</b>. Surveyors cannot see it until fieldwork starts</>, '/admin/surveys']);
    if (s.reportStatus === 'Approved') out.push(['blue', <>The client report is approved but <b>not sent</b> to the client yet</>, '/insights/report']);
    return out;
  }, [flaggedOpen, ru, s.surveyors, s.team, s.interviews, survey, s.draftQuestionnaire, mainId, s.reportStatus]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="hero">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tiny" style={{ color: '#5eead4', fontWeight: 700, letterSpacing: '.08em' }}>{({ Live: 'FIELDWORK LIVE', Draft: 'DRAFT SURVEY', Closed: 'CLOSED SURVEY' })[survey?.status] || 'SURVEY'}{s.questionnaire.client ? ` · ${s.questionnaire.client.toUpperCase()}` : ''}</div>
            <h2 className="mt8">{s.questionnaire.title.en}</h2>
            <p>{GEO.constituencies.length} constituencies · {GEO.mandals.length} mandals · {GEO.booths.length} booths · {s.surveyors.filter((x) => x.role === 'Surveyor' && onTeam(s.team, x.id)).length} surveyors in the field</p>
          </div>
          <button className="btn teal" onClick={() => nav('/live')}><Activity size={15} />Open live view</button>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="v">{s.interviews.length.toLocaleString('en-IN')}</div><div className="l">Interviews of {ru.target.toLocaleString('en-IN')} target ({ru.pct.toFixed(0)}%)</div></div>
          <div className="kpi"><div className="v">{isToday ? todayCount : 0}</div><div className="l">Collected today{!isToday && today ? ` (last fieldwork ${new Date(today).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${todayCount})` : ''}</div></div>
          <div className="kpi"><div className="v">{boothsOnTrack}/{GEO.booths.length}</div><div className="l">Booths at 75%+ of quota</div></div>
          <div className="kpi"><div className="v" style={{ color: flaggedOpen ? '#fda4af' : '#86efac' }}>{flaggedOpen}</div><div className="l">Flagged interviews awaiting review</div></div>
        </div>
      </div>

      <Card title={<span className="row"><BellRing size={16} />Needs your attention</span>} sub="Click an item to open it" flush>
        {attention.length === 0
          ? <div className="row small" style={{ padding: 16 }}><CheckCircle2 size={16} color="#16a34a" />All clear: nothing is waiting for you.</div>
          : attention.map(([tone, text, to]) => (
            <div key={text} className="list-item click" onClick={() => nav(to)}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: { red: '#e11d48', amber: '#f59e0b', blue: '#2563eb' }[tone], flexShrink: 0 }} />
              <div className="small" style={{ flex: 1 }}>{text}</div>
              <ArrowRight size={14} className="faint" />
            </div>
          ))}
      </Card>

      <div className="grid g-2-1">
        <Card title="Interviews collected per day" sub="All booths, this survey">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={perDay} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} /><stop offset="100%" stopColor="#14b8a6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#eef1f6" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="n" name="Interviews" stroke="#0d9488" strokeWidth={2.5} fill="url(#gA)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={`${findQuestion(s.questionnaire, mainId)?.label.en || 'Main result'} · state`} sub={`Base ${s.valid.length.toLocaleString('en-IN')} accepted interviews`}>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={vote} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={118} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 11, formatter: (v) => `${v.toFixed(1)}%`, fill: '#334155' }}>
                  {vote.map((r, k) => <Cell key={r.key} fill={colorFor(mainId, r.key, k)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div>
        <PageHead eyebrow="How MSR Pulse works" title="Five steps, one system" desc="Click a step to open it. An interview collected on a phone appears on the live map, in quality alerts, in results and in the client report within seconds of syncing." />
        <div className="flow-steps">
          {STEPS.map((st) => (
            <div key={st.n} className="flow-step" onClick={() => nav(st.to)}>
              <div className="ico" style={{ background: st.c[0], color: st.c[1] }}><st.icon size={20} /></div>
              <div className="n">STEP {st.n} · {st.m.toUpperCase()}</div>
              <h4>{st.t}</h4>
              <div className="small muted mt8">{st.d}</div>
              <div className="small bold mt12 row" style={{ color: st.c[1], gap: 4 }}>Open <ArrowRight size={13} /></div>
            </div>
          ))}
        </div>
      </div>

      <Card title="The problems MSR Pulse solves" sub="From the MSR requirements">
        <div className="stack" style={{ gap: 10 }}>
          {PROBLEMS.map(([before, after]) => (
            <div key={before} className="grid g2" style={{ gap: 10 }}>
              <div className="callout red"><XCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div><div className="tiny bold" style={{ opacity: 0.7 }}>TODAY</div>{before}</div></div>
              <div className="callout teal"><CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div><div className="tiny bold" style={{ opacity: 0.7 }}>WITH MSR PULSE</div>{after}</div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Architecture" sub="Green tags are working today; grey tags are planned before go-live">
        <div className="grid g4">
          {[
            // [icon, title, what it is, built today, comes at go-live]
            [Smartphone, 'Pulse Field app', 'Android app and iPhone web app from one codebase. Works fully offline; each interview stays in the phone’s database until the server confirms it.', ['Offline', 'Consent + GPS'], ['On-device encryption', 'iPhone App Store app']],
            [Cloud, 'Server', 'Containers on one AWS server with automatic HTTPS. Mobile number + SMS code login, role-based access checked on the server.', ['HTTPS', 'Role-based access'], ['MSR’s own AWS account, Mumbai', 'Real SMS gateway']],
            [Database, 'Data & backups', 'Encrypted database on an encrypted disk with an MSR-owned key; nightly encrypted backups. Personal details deleted on schedule.', ['KMS encryption', 'Nightly backups', 'Recordings & photos'], ['Recordings in S3, Mumbai']],
            [Cpu, 'Quality + AI', 'Nine quality checks score every interview as it syncs. AI drafts the report from totals only, never personal details.', ['Same-day flags', 'AI report draft'], ['Telugu transcription', 'Digest by SMS / email']],
          ].map(([I, t, d, built, later]) => (
            <div key={t} className="card" style={{ padding: 16, boxShadow: 'none' }}>
              <div className="q-type-ico"><I size={16} /></div>
              <div className="bold mt8">{t}</div>
              <div className="small muted mt8">{d}</div>
              <div className="row mt12">{built.map((x) => <span key={x} className="badge teal">{x}</span>)}{later.map((x) => <span key={x} className="badge" title="Planned for go-live">{x} · planned</span>)}</div>
            </div>
          ))}
        </div>
        <div className="row mt16 small muted" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 6 }}><WifiOff size={14} />Offline-first field app</span>
          <span className="row" style={{ gap: 6 }}><Lock size={14} />Encrypted at rest & in transit</span>
          <span className="row" style={{ gap: 6 }}><ShieldCheck size={14} />CERT-In audit before launch</span>
          <span className="row" style={{ gap: 6 }}><Users size={14} />No limit on surveyors or phones</span>
          <span className="row" style={{ gap: 6 }}><Server size={14} />MSR owns data, code & system</span>
          <span className="row" style={{ gap: 6 }}><HardDrive size={14} />Source code handed over</span>
          <span className="row" style={{ gap: 6 }}><Sparkles size={14} />AI never trains on MSR data</span>
        </div>
      </Card>
    </div>
  );
}
