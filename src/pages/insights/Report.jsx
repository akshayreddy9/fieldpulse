import React, { useMemo } from 'react';
import { FileText, Sparkles, FileDown, CheckCircle2, Send, RefreshCw, UserPen, Bot, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Empty, fmtTime } from '../../components/ui.jsx';
import { HBar, Stacked } from '../../components/charts.jsx';
import { generateReport } from '../../lib/reportGen.js';
import { frequency, crosstab } from '../../lib/analytics.js';
import { PARTY_COLORS } from '../../data/questionnaire.js';
import { exportReportPdf } from '../../lib/exporters.js';
import { GEO } from '../../data/geo.js';

export const STAGES = ['AI draft', 'MSR review', 'Approved', 'Sent to client'];

export function useReportCharts() {
  const s = useStore();
  return useMemo(() => {
    const qn = s.questionnaire;
    const vote = frequency(qn, 'q_vote_intent', s.valid).rows;
    const issues = frequency(qn, 'q_issues', s.valid).rows.filter((r) => r.key !== 'OTHER').sort((a, b) => b.pct - a.pct).slice(0, 6);
    const services = frequency(qn, 'q_services', s.valid).gridRows;
    const seats = crosstab(qn, 'constituency', 'q_vote_intent', s.valid);
    return {
      vote: { title: 'Vote intention (%)', rows: vote.map((r) => ({ key: r.key, label: r.label, value: r.pct, color: PARTY_COLORS[r.key] })) },
      issues: { title: 'Top problems mentioned (% of respondents)', rows: issues.map((r) => ({ key: r.key, label: r.label, value: r.pct, color: '#0d9488' })) },
      services: { title: 'Rated good or very good (%)', rows: services.map((g) => ({ key: g.key, label: g.label, value: g.goodPct, color: '#4f46e5' })) },
      seats: { title: 'Leading party share by constituency (%)', seats, rows: seats.rows.map((r) => { const top = [...r.cells].filter((c) => c.key !== 'UND' && c.key !== 'NS').sort((a, b) => b.pct - a.pct)[0]; return { key: r.key, label: `${r.label} (${top.key})`, value: top.pct, color: PARTY_COLORS[top.key] }; }) },
    };
  }, [s.questionnaire, s.valid]);
}

export function ReportChart({ id, charts }) {
  const c = charts[id];
  if (!c) return null;
  if (id === 'seats') return <Stacked rows={c.seats.rows} cols={c.seats.cols} qid="q_vote_intent" />;
  return <HBar rows={c.rows.map((r) => ({ ...r, pct: r.value }))} qid={id === 'vote' ? 'q_vote_intent' : ''} single={id === 'vote' ? undefined : c.rows[0]?.color} />;
}

export default function Report() {
  const s = useStore();
  const charts = useReportCharts();
  const sections = s.report;
  const stage = s.reportStatus;
  const stageIdx = STAGES.indexOf(stage);
  const advice = sections?.find((x) => x.id === 'advice');

  const [busy, setBusy] = React.useState(false);
  const generate = async () => {
    if (!s.valid.length) { s.toast('This survey has no interviews yet. The report can be written once fieldwork has started.', 'error'); return; }
    let fresh = generateReport(s.questionnaire, s.valid, s.round2, s.quality, s.statuses);
    let usedAi = false;
    if (s.serverMode) {
      setBusy(true);
      try { const r = await s.aiReportDraft(); if (r?.sections) { fresh = r.sections; usedAi = r.ai; } } catch (e) { s.toast(e.message, 'error'); }
      setBusy(false);
    }
    const merged = sections ? fresh.map((x) => (x.source === 'msr' ? sections.find((y) => y.id === x.id) || x : x)) : fresh;
    s.update((st) => ({ report: merged, reportStatus: 'AI draft', reportHistory: [{ t: Date.now(), who: st.user.name, what: `${sections ? 'Regenerated draft from latest data (MSR advice kept)' : 'First draft created'}${usedAi ? ' · written with Claude' : ''}` }, ...st.reportHistory] }));
    s.toast(usedAi ? 'Draft written with Claude from the live figures. Please review every section.' : 'First draft ready. Every number comes from the live data.', 'success');
  };
  const editSection = (id, body) => {
    if (sections.find((x) => x.id === id).body === body) return;
    s.update((st) => ({
      report: st.report.map((x) => (x.id === id ? { ...x, body, edited: x.source === 'ai' ? true : x.edited } : x)),
      reportStatus: st.reportStatus === 'AI draft' ? 'MSR review' : st.reportStatus === 'Approved' || st.reportStatus === 'Sent to client' ? 'MSR review' : st.reportStatus,
      reportHistory: [{ t: Date.now(), who: st.user.name, what: `Edited “${st.report.find((x) => x.id === id).title}”` }, ...st.reportHistory],
    }));
  };
  const advance = (to) => {
    if (to === 'Approved' && !advice?.body.trim()) { s.toast('Write the MSR strategic advice before approving', 'error'); return; }
    s.update((st) => ({ reportStatus: to, reportHistory: [{ t: Date.now(), who: st.user.name, what: `Status → ${to}` }, ...st.reportHistory] }));
    s.log(`Client report status → ${to}`);
    s.toast(to === 'Sent to client' ? 'Report published to the client portal and emailed as PDF' : `Report marked ${to}`, 'success');
  };
  const pdf = () => exportReportPdf({ qn: s.questionnaire, sections, charts, status: stage, meta: { client: s.questionnaire.client, n: s.valid.length, booths: GEO.booths.length } });

  if (!sections) {
    return (
      <div>
        <PageHead eyebrow="Results & reports" icon={FileText} title="Client report" desc="The AI writes the first draft of the client report from the survey data. MSR analysts edit it, add their own advice, approve it, and send a branded PDF." />
        <Card>
          <Empty icon={Sparkles} title="No report yet for this round">
            <p style={{ maxWidth: 460, margin: '0 auto 14px' }}>Create a first draft from {s.valid.length.toLocaleString('en-IN')} accepted interviews. It takes a few seconds; numbers are calculated, never guessed.</p>
            <button className="btn ai lg" onClick={generate} disabled={busy}><Sparkles size={16} />{busy ? 'Writing the draft…' : 'Write AI first draft'}</button>
            <div className="tiny muted mt12">{s.server?.ai ? 'Written by Claude from aggregated figures only; no personal data is sent.' : 'Built-in writer (Claude is not configured on this server).'}</div>
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead eyebrow="Results & reports" icon={FileText} title="Client report" desc="Click any paragraph to edit it. The “MSR strategic advice” section is written only by MSR. Approve, then send to the client portal and as PDF.">
        <button className="btn" disabled={busy} onClick={() => window.confirm('Rewrite the AI sections from the latest data? Your MSR advice is kept; edits to AI sections are replaced.') && generate()}><RefreshCw size={15} />{busy ? 'Writing…' : 'Refresh from latest data'}</button>
        <button className="btn primary" onClick={pdf}><FileDown size={15} />Download PDF</button>
      </PageHead>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 300px)' }}>
        <div className="report-doc">
          <div className="tiny bold" style={{ color: 'var(--teal)', letterSpacing: '.08em' }}>CLIENT REPORT · {s.questionnaire.client.toUpperCase()}</div>
          <h1 style={{ fontSize: 28, marginTop: 6 }}>{s.questionnaire.title.en}</h1>
          <div className="muted small mt8">Micro Studies and Research Organisation · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Base {s.valid.length.toLocaleString('en-IN')} interviews</div>
          {sections.map((sec, k) => (
            <section key={sec.id}>
              <h2>{k + 1}. {sec.title}
                {sec.source === 'ai' ? <Badge tone="indigo"><Bot size={11} />{sec.model ? 'Claude draft' : 'AI draft'}{sec.edited ? ' · edited by MSR' : ''}</Badge> : <Badge tone="teal"><UserPen size={11} />Written by MSR</Badge>}
              </h2>
              <div className={`body ${sec.source === 'msr' ? 'advice' : ''}`} contentEditable={s.can('insights.reports')} suppressContentEditableWarning data-placeholder={sec.placeholder}
                onBlur={(e) => editSection(sec.id, e.currentTarget.innerText)}>{sec.body}</div>
              {sec.chart && <div className="mt12" style={{ border: '1px solid var(--line-2)', borderRadius: 12, padding: 12 }}><div className="tiny bold muted" style={{ marginBottom: 6 }}>{charts[sec.chart].title}</div><ReportChart id={sec.chart} charts={charts} /></div>}
            </section>
          ))}
        </div>
        <div className="stack" style={{ position: 'sticky', top: 80, alignSelf: 'start' }}>
          <Card title="Approval">
            <div className="timeline">
              {STAGES.map((st, k) => <div key={st} className={`tl-item ${k < stageIdx ? 'done' : k === stageIdx ? 'now' : ''}`}><div className={k === stageIdx ? 'bold' : ''}>{st}</div></div>)}
            </div>
            {!advice?.body.trim() && <div className="callout amber small"><AlertTriangle size={15} style={{ flexShrink: 0 }} />MSR advice is still empty</div>}
            <div className="stack mt12" style={{ gap: 8 }}>
              {stageIdx < 1 && <button className="btn block" onClick={() => advance('MSR review')}><UserPen size={15} />Start MSR review</button>}
              {stageIdx < 2 && <button className="btn success block" onClick={() => advance('Approved')}><CheckCircle2 size={15} />Approve report</button>}
              {stageIdx === 2 && <button className="btn teal block" onClick={() => advance('Sent to client')}><Send size={15} />Send to client</button>}
              {stageIdx === 3 && <div className="callout teal small"><CheckCircle2 size={15} />Visible in the client portal</div>}
            </div>
          </Card>
          <Card title="History" flush>
            <div className="scroll-y" style={{ maxHeight: 280 }}>
              {s.reportHistory.map((h, k) => <div key={k} className="list-item" style={{ padding: '8px 16px' }}><div><div className="small">{h.what}</div><div className="tiny muted">{h.who} · {fmtTime(h.t)}</div></div></div>)}
            </div>
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 1100px){ .content .grid[style*="300px"]{ grid-template-columns: minmax(0,1fr) !important; } .content .grid[style*="300px"] .stack[style*="sticky"]{ position: static !important; } }`}</style>
    </div>
  );
}
