import React, { useState } from 'react';
import { Building2, FileDown, Lock, BarChart3, FileText, CalendarClock, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store.jsx';
import { PageHead, Card, Badge, Stat, Empty, Tabs } from '../components/ui.jsx';
import { QuestionResult } from './insights/Results.jsx';
import { useReportCharts, ReportChart } from './insights/Report.jsx';
import { exportReportPdf } from '../lib/exporters.js';
import { GEO } from '../data/geo.js';
import { findQuestion, allQuestions } from '../data/questionnaire.js';
import { freqRows } from '../lib/analytics.js';
import { mainQuestionId, isRealChoice } from '../lib/reportGen.js';
import { rolesOf, piiQuestions } from '../lib/roles.js';

export default function ClientPortal() {
  const s = useStore();
  const charts = useReportCharts();
  const [tab, setTab] = useState('report');
  const sent = s.reportStatus === 'Sent to client' && s.report;
  const isClient = s.user.role === 'client';
  const qn = s.questionnaire;
  const mainId = mainQuestionId(qn);
  const lead = freqRows(qn, mainId, s.valid).filter(isRealChoice).sort((a, b) => b.pct - a.pct)[0];
  // Key results: the marked headline questions, or else the first few non-personal questions
  const r = rolesOf(qn);
  const pii = new Set(piiQuestions(qn));
  const marked = [mainId, r.second, r.issues, r.services].filter(Boolean);
  const keyIds = [...new Set(marked.length >= 2 ? marked : [...marked, ...allQuestions(qn).filter((q) => !pii.has(q.id) && ['single', 'multiple', 'grid', 'number'].includes(q.type) && !q.endIf).map((q) => q.id)])].slice(0, 4);
  if (s.serverMode && !s.surveyId) {
    return <div className="shell-body"><PageHead eyebrow="Welcome" icon={Building2} title={`Hello, ${s.user.name}`} desc="Your surveys with Micro Studies and Research will appear here as soon as MSR sets them up." /><Card><Empty icon={CalendarClock} title="No surveys yet">MSR has not linked a survey to your account yet.</Empty></Card></div>;
  }
  const TABS = [{ key: 'report', label: 'Your report', icon: FileText }, { key: 'results', label: 'Key results', icon: BarChart3 }, { key: 'past', label: 'All surveys', icon: CalendarClock }];
  const content = (
    <div>
      <PageHead eyebrow={isClient ? 'Welcome' : 'Client view · exactly what the client sees'} icon={Building2} title={isClient ? `Hello, ${s.questionnaire.client}` : s.questionnaire.client} desc="Your survey results from Micro Studies and Research. Only results MSR has approved are shown. Respondents’ personal details are never visible.">
        {sent && <button className="btn primary" onClick={() => exportReportPdf({ qn: s.questionnaire, sections: s.report, charts, status: 'Final', meta: { client: s.questionnaire.client, n: s.valid.length, booths: GEO.booths.length } })}><FileDown size={15} />Download report PDF</button>}
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Survey" value={({ Live: 'In the field', Closed: 'Completed', Draft: 'Being prepared' })[(s.surveys.find((x) => x.id === s.surveyId) || {}).status || 'Live']} hint={s.questionnaire.title.en} icon={CalendarClock} />
        <Stat label="Interviews completed" value={s.valid.length.toLocaleString('en-IN')} tone="green" hint="Quality-checked" />
        <Stat label="Coverage" value={`${GEO.constituencies.length} seats`} tone="blue" hint={`${GEO.booths.length} booths`} />
        <Stat label="Report" value={sent ? 'Ready' : 'In preparation'} tone={sent ? 'green' : 'amber'} icon={FileText} />
      </div>
      {!isClient && <Tabs value={tab} onChange={setTab} tabs={TABS} />}
      {tab === 'report' && (sent ? (
        <div className="report-doc">
          <div className="row"><Badge tone="green"><CheckCircle2 size={11} />Approved by MSR</Badge></div>
          <h1 style={{ fontSize: 26, marginTop: 10 }}>{s.questionnaire.title.en}</h1>
          {s.report.map((sec, k) => (
            <section key={sec.id}><h2>{k + 1}. {sec.title}</h2><div className="body">{sec.body}</div>
              {sec.chart && <div className="mt12"><ReportChart id={sec.chart} charts={charts} /></div>}</section>
          ))}
        </div>
      ) : (
        <Card><Empty icon={Lock} title="Your report is being prepared">MSR is finalising the Round 3 report. It will appear here as soon as it is approved{!isClient && ' (Report studio → Approve → Send to client)'}.</Empty></Card>
      ))}
      {tab === 'results' && (
        <>
          {lead && <div className="callout teal small" style={{ marginBottom: 16 }}><BarChart3 size={15} />Headline: {lead.label} leads with {lead.pct.toFixed(1)}% on “{findQuestion(qn, mainId).label.en}”. Live figures, updated as fieldwork continues.</div>}
          <div className="grid g2">
            {keyIds.map((id) => <QuestionResult key={id} qn={qn} q={findQuestion(qn, id)} list={s.valid} lang={s.lang} />)}
          </div>
          {!keyIds.length && <Card><Empty icon={BarChart3} title="No results yet">Results appear here as interviews come in.</Empty></Card>}
        </>
      )}
      {tab === 'past' && s.serverMode && (
        <Card flush>
          <table className="t">
            <thead><tr><th>Survey</th><th>Status</th><th className="num">Interviews</th><th /></tr></thead>
            <tbody>{s.surveys.map((x) => (
              <tr key={x.id} className={x.id === s.surveyId ? 'sel' : ''}><td className="bold">{x.title}</td><td><Badge tone={x.status === 'Live' ? 'green' : x.status === 'Closed' ? '' : 'amber'}>{x.status === 'Live' ? 'Fieldwork running' : x.status === 'Closed' ? 'Completed' : 'Being prepared'}</Badge></td><td className="num">{x.interviews.toLocaleString('en-IN')}</td>
                <td className="right-align">{x.id === s.surveyId ? <span className="small muted">Showing now</span> : <button className="btn sm" onClick={() => { s.selectSurvey(x.id); setTab('report'); }}>Open</button>}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      {tab === 'past' && !s.serverMode && (
        <Card flush>
          <table className="t">
            <thead><tr><th>Survey</th><th>Fieldwork</th><th className="num">Interviews</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td className="bold">{qn.title.en}</td><td>Current round</td><td className="num">{s.valid.length.toLocaleString('en-IN')}</td><td><Badge tone={sent ? 'green' : 'amber'}>{sent ? 'Report ready' : 'In progress'}</Badge></td></tr>
              {s.round2.length > 0 && <tr><td className="bold">Previous round</td><td>—</td><td className="num">{s.round2.length.toLocaleString('en-IN')}</td><td><Badge tone="green">Report ready</Badge></td></tr>}
              {s.round1.length > 0 && <tr><td className="bold">Earlier round</td><td>—</td><td className="num">{s.round1.length.toLocaleString('en-IN')}</td><td><Badge>Imported from GoSurvey</Badge></td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
  if (!isClient) return content;
  return (
    <>
      <div className="client-tabs"><div className="inner">{TABS.map((t) => <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}><t.icon size={15} />{t.label}</button>)}</div></div>
      <div className="shell-body">{content}</div>
    </>
  );
}
