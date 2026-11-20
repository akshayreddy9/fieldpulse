import React, { useMemo, useState } from 'react';
import { BarChart3, Download, Lock, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge } from '../../components/ui.jsx';
import { HBar, VBar, Stacked, SCALE5 } from '../../components/charts.jsx';
import { applyFilters, frequency } from '../../lib/analytics.js';
import { allQuestions } from '../../data/questionnaire.js';
import { GEO } from '../../data/geo.js';
import { exportResultsExcel } from '../../lib/exporters.js';
import { R, AGE_BANDS, questionFor } from '../../lib/roles.js';

export function Filters({ f, setF, compact }) {
  const genderQ = questionFor('gender');
  const casteQ = questionFor('caste');
  const mandals = GEO.mandals.filter((m) => !f.constituency || m.constituencyId === f.constituency);
  const set = (k, v) => setF({ ...f, [k]: v || undefined, ...(k === 'constituency' ? { mandal: undefined } : {}) });
  const active = Object.values(f).filter(Boolean).length;
  return (
    <div className="row" style={{ gap: 8 }}>
      {!compact && <SlidersHorizontal size={15} className="muted" />}
      <select className="select" style={{ width: 160 }} value={f.constituency || ''} onChange={(e) => set('constituency', e.target.value)}><option value="">All constituencies</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
      <select className="select" style={{ width: 160 }} value={f.mandal || ''} onChange={(e) => set('mandal', e.target.value)}><option value="">All mandals</option>{mandals.map((m) => <option key={m.id} value={m.id}>{m.name.en}</option>)}</select>
      {/* Profile filters come from the questions marked Gender / Age / Caste in the builder */}
      {genderQ && <select className="select" style={{ width: 120 }} value={f.gender || ''} onChange={(e) => set('gender', e.target.value)}><option value="">All genders</option>{genderQ.options.map((o) => <option key={o.v} value={o.v}>{o.en}</option>)}</select>}
      {R('age') && <select className="select" style={{ width: 120 }} value={f.ageBand || ''} onChange={(e) => set('ageBand', e.target.value)}><option value="">All ages</option>{AGE_BANDS.map((a) => <option key={a}>{a}</option>)}</select>}
      {casteQ && <select className="select" style={{ width: 130 }} value={f.caste || ''} onChange={(e) => set('caste', e.target.value)}><option value="">All castes</option>{casteQ.options.map((o) => <option key={o.v} value={o.v}>{o.en}</option>)}</select>}
      {active > 0 && <button className="btn ghost sm" onClick={() => setF({})}><X size={14} />Clear</button>}
    </div>
  );
}

export function QuestionResult({ qn, q, list, lang }) {
  const f = useMemo(() => frequency(qn, q.id, list, lang), [qn, q.id, list, lang]);
  if (!f) return null;
  const title = q.label[lang] || q.label.en;
  return (
    <Card title={<span>{q.label.en}{q.label.te && <span className="te" style={{ display: 'block', fontWeight: 500, fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{q.label.te}</span>}</span>} sub={<span>Answered by {f.base.toLocaleString('en-IN')} people{f.mean !== undefined ? ` · average ${f.mean.toFixed(1)}` : ''}</span>}
      right={<Badge>{q.type}</Badge>}>
      {q.pii ? <div className="callout amber small"><Lock size={15} />Personal detail. Not shown in results; protected by the privacy lock.</div>
        : f.type === 'grid' ? (
          <>
            <Stacked rows={f.gridRows.map((g) => ({ label: g.label, cells: g.dist.map((d) => ({ key: d.key, pct: d.pct })) }))} cols={q.cols.map((c) => ({ key: c.v, label: c[lang] || c.en }))} colors={SCALE5} />
            <div className="row mt8">{f.gridRows.map((g) => <Badge key={g.key} tone={g.mean >= 3.5 ? 'green' : g.mean >= 2.8 ? '' : 'red'}>{g.label}: {g.mean.toFixed(2)}/5</Badge>)}</div>
          </>
        ) : f.type === 'number' ? <VBar rows={f.rows} />
          : f.type === 'date' ? <VBar rows={f.rows} color="#4f46e5" />
            : f.type === 'text' ? <div className="small muted">{f.samples.length} text answers</div>
              : (
                <>
                  <HBar rows={f.rows.filter((r) => r.count > 0 || f.rows.length < 8)} qid={q.id} />
                  {f.others?.length > 0 && <div className="tiny muted mt8">“Other” answers: {[...new Set(f.others)].slice(0, 5).join(', ')}</div>}
                  {q.type === 'multiple' && <div className="tiny muted mt8">Multiple answers allowed, so percentages add up to more than 100%.</div>}
                </>
              )}
    </Card>
  );
}

export default function Results() {
  const s = useStore();
  const [f, setF] = useState({});
  const list = useMemo(() => applyFilters(s.valid, f), [s.valid, f]);
  const qs = allQuestions(s.questionnaire).filter((q) => q.type !== 'gps' || true);
  const groups = s.questionnaire.groups;
  const [g, setG] = useState('all');
  const shownQs = g === 'all' ? qs : groups.find((x) => x.id === g).questions;
  return (
    <div>
      <PageHead eyebrow="Results & reports" icon={BarChart3} title="Results for every question" desc={`Based on ${list.length.toLocaleString('en-IN')} accepted interviews (rejected interviews are excluded automatically). Filter by area or group; switch EN / తె at the top to see results in Telugu.`}>
        <button className="btn primary" onClick={() => { exportResultsExcel(s.questionnaire, list, { privacy: s.privacyLock }); s.log('Exported results to Excel'); }}><Download size={15} />Export to Excel</button>
      </PageHead>
      <Card className="no-print" style={{ marginBottom: 16 }}><Filters f={f} setF={setF} /></Card>
      <div className="tabs">
        <button className={g === 'all' ? 'on' : ''} onClick={() => setG('all')}>All questions</button>
        {groups.map((x) => <button key={x.id} className={g === x.id ? 'on' : ''} onClick={() => setG(x.id)}>{x.title.en}</button>)}
      </div>
      <div className="grid g2">
        {shownQs.map((q) => <QuestionResult key={q.id} qn={s.questionnaire} q={q} list={list} lang={s.lang} />)}
      </div>
    </div>
  );
}
