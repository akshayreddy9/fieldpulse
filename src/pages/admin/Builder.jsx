import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDot, ListChecks, Grid3x3, Type, Hash, CalendarDays, MapPin, Camera, HelpCircle } from 'lucide-react';
import { Plus, Trash2, ArrowUp, ArrowDown, Copy, GitBranch, Rocket, Eye, Languages, AlertTriangle, CheckCircle2, FileEdit, Smartphone, ChevronLeft, ChevronRight, History, Save, Undo2, RotateCcw, PlayCircle, Info } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Badge, Modal, Seg, Toggle } from '../../components/ui.jsx';
import QuestionRenderer from '../../components/QuestionRenderer.jsx';
import { QUESTION_TYPES, allQuestions, isVisible, describeRule } from '../../data/questionnaire.js';
import { ROLE_DEFS, ROLE_BY, rolesOf, roleOfQuestion, roleProblems } from '../../lib/roles.js';
import { GEO } from '../../data/geo.js';

const typeMeta = (t) => QUESTION_TYPES.find((x) => x.type === t);
const ICONS = { CircleDot, ListChecks, Grid3x3, GitBranch, Type, Hash, CalendarDays, MapPin, Camera };
const TypeIcon = ({ type, size = 16 }) => { const I = ICONS[typeMeta(type)?.icon] || HelpCircle; return <I size={size} />; };

function newQuestion(type, n) {
  const id = `q_new_${n}`;
  const base = { id, type, label: { en: 'New question', te: '' } };
  if (type === 'single' || type === 'multiple') return { ...base, options: [{ v: '1', en: 'Option 1', te: '' }, { v: '2', en: 'Option 2', te: '' }] };
  if (type === 'grid') return { ...base, rows: [{ v: 'r1', en: 'Item 1', te: '' }, { v: 'r2', en: 'Item 2', te: '' }], cols: [{ v: '1', en: 'Poor', te: 'అధ్వాన్నం' }, { v: '2', en: 'Average', te: 'సగటు' }, { v: '3', en: 'Good', te: 'బాగుంది' }] };
  if (type === 'number') return { ...base, min: 0, max: 100 };
  if (type === 'cascade') return { ...base, levels: ['constituency', 'mandal', 'booth'] };
  return base;
}

function issues(qn) {
  const out = [];
  qn.groups.forEach((g, gi) => { if (!g.questions.length) out.push({ q: null, msg: `Page ${gi + 1} “${g.title?.en}” has no questions: add some or delete the page` }); });
  qn.groups.forEach((g, gi) => { if (!g.title?.te) out.push({ q: g.questions[0]?.id, msg: `Telugu missing for the title of page ${gi + 1} “${g.title?.en}”` }); });
  if (!allQuestions(qn).length) out.push({ q: null, msg: 'The questionnaire has no questions' });
  if (!allQuestions(qn).some((x) => x.type === 'gps')) out.push({ q: null, msg: 'Add a “GPS location” question: every interview must record where it was done' });
  allQuestions(qn).forEach((q) => {
    if (!q.label.te) out.push({ q: q.id, msg: 'Telugu text missing' });
    (q.options || []).forEach((o) => { if (!o.te) out.push({ q: q.id, msg: `Telugu missing for option “${o.en}”` }); });
    (q.rows || []).forEach((o) => { if (!o.te) out.push({ q: q.id, msg: `Telugu missing for row “${o.en}”` }); });
    (q.cols || []).forEach((o) => { if (!o.te) out.push({ q: q.id, msg: `Telugu missing for column “${o.en}”` }); });
    if (!q.label.en?.trim()) out.push({ q: q.id, msg: 'English text missing' });
    if (q.showIf && !allQuestions(qn).some((x) => x.id === q.showIf.q)) out.push({ q: q.id, msg: 'Skip logic points to a deleted question' });
  });
  return [...out, ...roleProblems(qn)];
}

function OptionEditor({ list, onChange, label }) {
  const set = (k, field, v) => onChange(list.map((o, i) => (i === k ? { ...o, [field]: v } : o)));
  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack" style={{ gap: 6 }}>
        {list.map((o, k) => (
          <div key={k} className="row nowrap">
            <span className="mono faint" style={{ width: 44 }}>{o.v}</span>
            <input className="input" value={o.en} onChange={(e) => set(k, 'en', e.target.value)} placeholder="English" />
            <input className="input te" value={o.te} onChange={(e) => set(k, 'te', e.target.value)} placeholder="తెలుగు" style={{ borderColor: o.te ? undefined : '#fcd34d' }} />
            <button className="btn ghost icon sm" onClick={() => onChange(list.filter((_, i) => i !== k))} disabled={list.length <= 1}><Trash2 size={14} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...list, { v: String(list.length + 1), en: `Option ${list.length + 1}`, te: '' }])}><Plus size={14} />Add</button>
      </div>
    </div>
  );
}

// "Used for": tells MSR Pulse which question is Gender, Age, Caste, the main result, etc. (see lib/roles.js)
function RolePicker({ qn, q, onChange }) {
  const current = roleOfQuestion(qn, q.id);
  const fits = ROLE_DEFS.filter((d) => d.types.includes(q.type));
  if (!fits.length && !current) return null;
  const taken = rolesOf(qn);
  const implicit = current && !q.role; // found by the starter questionnaire's id, not marked yet
  return (
    <div className="field">
      <label>Used for</label>
      <select className="select" value={current || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Nothing special (just a question)</option>
        {fits.map((d) => <option key={d.role} value={d.role}>{d.label}{taken[d.role] && taken[d.role] !== q.id ? ' · now another question' : ''}</option>)}
      </select>
      <div className="tiny muted mt8">
        Booth quotas, filters, privacy, roll-ups, trends and the report find their questions through this.
        {implicit && ' Recognised automatically from the starter questionnaire.'}
        {current && ROLE_BY[current]?.pii && ' Personal detail: hidden by the privacy lock and erased after the retention period.'}
      </div>
    </div>
  );
}

export default function Builder() {
  const s = useStore();
  const live = s.questionnaire; // what the phones use right now
  const saved = s.draftQuestionnaire || live; // last saved draft (or the live version when there is no draft)
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const savedJson = JSON.stringify(saved);
  const [qn, setDraft] = useState(() => clone(saved));
  const baseRef = useRef(savedJson);
  // Switching survey, or another admin saving/publishing: reload when there are no unsaved edits here
  useEffect(() => {
    setDraft((cur) => (JSON.stringify(cur) === baseRef.current ? JSON.parse(savedJson) : cur));
    baseRef.current = savedJson;
  }, [savedJson]);
  useEffect(() => { setDraft(JSON.parse(savedJson)); setSel(null); setPans({}); setPpage(0); }, [s.surveyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const unsaved = JSON.stringify(qn) !== savedJson;
  const hasDraft = !!s.draftQuestionnaire || unsaved;
  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(null);
  const [ppage, setPpage] = useState(0);
  const [pans, setPans] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const qs = allQuestions(qn);
  const q = qs.find((x) => x.id === sel) || qs[0] || null;
  const gIndex = q ? qn.groups.findIndex((g) => g.questions.some((x) => x.id === q.id)) : 0;
  const problems = useMemo(() => issues(qn), [qn]);
  const survey = s.surveys?.find((x) => x.id === s.surveyId);

  const setQn = (fn) => setDraft((cur) => { const next = clone(cur); fn(next); return next; });
  const editQ = (patch) => setQn((n) => {
    n.groups.forEach((g) => { g.questions = g.questions.map((x) => (x.id === q.id ? { ...x, ...patch } : x)); });
  });
  const saveDraft = () => {
    s.update({ draftQuestionnaire: clone(qn) });
    s.toast('Draft saved. Phones keep using the published version until you press “Publish to field”.', 'success');
  };
  const discard = () => {
    if (!window.confirm('Throw away all changes since the last publish and go back to the version the phones use?')) return;
    s.update({ draftQuestionnaire: null });
    setDraft(clone(live));
    s.toast('Changes discarded', 'info');
  };
  const move = (dir) => setQn((n) => {
    const g = n.groups[gIndex];
    const i = g.questions.findIndex((x) => x.id === q.id);
    const j = i + dir;
    if (j < 0 || j >= g.questions.length) return;
    [g.questions[i], g.questions[j]] = [g.questions[j], g.questions[i]];
  });
  const remove = () => {
    const users = qs.filter((x) => x.showIf?.q === q.id);
    if (!window.confirm(`Delete question ${q.id}?${users.length ? `\n\n${users.length} question(s) use it in their skip logic; those rules will be removed too.` : ''}`)) return;
    setQn((n) => { n.groups.forEach((g) => { g.questions = g.questions.filter((x) => x.id !== q.id).map((x) => (x.showIf?.q === q.id ? { ...x, showIf: undefined } : x)); }); });
    setSel(qs.find((x) => x.id !== q.id)?.id || null);
  };
  const duplicate = () => {
    const id = `${q.id}_copy${Math.floor(Math.random() * 90 + 10)}`;
    setQn((n) => { const g = n.groups[gIndex]; const i = g.questions.findIndex((x) => x.id === q.id); g.questions.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(q)), id }); });
    setSel(id);
  };
  const add = (type) => {
    const nq = newQuestion(type, Date.now() % 10000);
    setQn((n) => { n.groups[adding].questions.push(nq); });
    setSel(nq.id);
    setAdding(null);
  };
  const removeGroup = (gi) => {
    const g = qn.groups[gi];
    if (qn.groups.length <= 1) return;
    if (g.questions.length && !window.confirm(`Delete page ${gi + 1} “${g.title.en}” and its ${g.questions.length} question(s)?`)) return;
    const gone = new Set(g.questions.map((x) => x.id));
    setQn((n) => { n.groups.splice(gi, 1); n.groups.forEach((gg) => { gg.questions = gg.questions.map((x) => (x.showIf && gone.has(x.showIf.q) ? { ...x, showIf: undefined } : x)); }); });
    setPpage(0);
  };
  const addGroup = () => setQn((n) => { n.groups.push({ id: `g${Date.now().toString(36)}`, title: { en: `Page ${n.groups.length + 1}`, te: `పేజీ ${n.groups.length + 1}` }, questions: [] }); });
  const publish = () => {
    if (problems.length) { s.toast(`Fix the ${problems.length} item(s) under “Checks before publishing” first. Telugu text is required for every question and option.`, 'error'); return; }
    const v = (live.version || 0) + 1;
    if (!window.confirm(`Publish version ${v} to all surveyor phones?\n\nPhones that are online get it within a few seconds; offline phones get it when they reconnect. Interviews already in progress finish on the old version.`)) return;
    const next = { ...clone(qn), version: v };
    s.update({ questionnaire: next, publishedVersion: v, draftQuestionnaire: null });
    setDraft(clone(next));
    s.log(`Published questionnaire ${qn.id} v${v}`);
    s.toast(`Version ${v} is live on the phones.${survey?.status === 'Draft' ? ' This survey is still a Draft: press “Start fieldwork” so surveyors can see it.' : ''}`, 'success');
  };
  const startFieldwork = async () => {
    if (hasDraft) { s.toast('Publish the questionnaire first, then start fieldwork.', 'error'); return; }
    try { await s.updateSurvey(survey.id, { status: 'Live' }); s.toast(`“${survey.title}” is Live. Surveyors can now do interviews.`, 'success'); } catch (e) { s.toast(e.message, 'error'); }
  };

  // Skip-logic editor
  const depCandidates = q ? qs.slice(0, qs.findIndex((x) => x.id === q.id)).filter((x) => x.type === 'single' && x.options?.length) : [];
  const rule = q?.showIf;
  const dep = rule && qs.find((x) => x.id === rule.q);

  // Preview
  const pg = qn.groups[Math.min(ppage, qn.groups.length - 1)];
  const visible = pg.questions.filter((x) => isVisible(x, pans));
  const allVisible = qs.filter((x) => isVisible(x, pans)); // numbering runs across pages, like on the phone

  return (
    <div>
      <PageHead eyebrow="Set up" icon={FileEdit} title="Questionnaire" desc="Build questionnaires in Telugu and English with every question type, pages, skip logic and a live phone preview. Replaces GoSurvey.">
        <button className="btn" onClick={() => setShowHistory(true)}><History size={15} />Versions</button>
        {survey && <Badge tone={{ Draft: 'amber', Live: 'green' }[survey.status] || ''}>Survey: {survey.status}</Badge>}
        <Badge tone={unsaved ? 'red' : hasDraft ? 'amber' : 'green'}>{unsaved ? 'Unsaved changes' : hasDraft ? 'Draft saved · not published' : `Phones use v${live.version}`}</Badge>
        {hasDraft && <button className="btn ghost" onClick={discard} title="Go back to the published version"><Undo2 size={15} />Discard</button>}
        <button className="btn" onClick={saveDraft} disabled={!unsaved}><Save size={15} />Save draft</button>
        <button className="btn primary" onClick={publish} disabled={!hasDraft} title={problems.length ? 'Fix the checks first' : ''}><Rocket size={15} />Publish to field</button>
        {survey?.status === 'Draft' && <button className="btn teal" onClick={startFieldwork}><PlayCircle size={15} />Start fieldwork</button>}
      </PageHead>
      <div className="callout blue small" style={{ marginBottom: 12 }}><Info size={15} style={{ flexShrink: 0 }} /><div>Changes here are a <b>draft</b>. <b>Save draft</b> keeps them safely; surveyors' phones only change when you press <b>Publish to field</b>.{problems.length ? <> Publishing is blocked until the <b>{problems.length}</b> item(s) under “Checks before publishing” are fixed.</> : null}</div></div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr) minmax(0, 400px)' }}>
        {/* Outline */}
        <Card title="Pages & questions" sub={`${qn.groups.length} pages · ${qs.length} questions`} flush right={<button className="btn sm" onClick={addGroup}><Plus size={14} />Page</button>} className="builder-outline">
          <div className="scroll-y" style={{ maxHeight: 'calc(100dvh - 260px)' }}>
            {qn.groups.map((g, gi) => (
              <div key={g.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-2)' }}>
                <div className="row nowrap" style={{ marginBottom: 6 }}>
                  <Badge tone="navy">Page {gi + 1}</Badge>
                  <input className="input" style={{ height: 28, border: 0, padding: 0, fontWeight: 700, background: 'transparent' }} value={g.title.en}
                    onChange={(e) => setQn((n) => { n.groups[gi].title.en = e.target.value; })} />
                  {qn.groups.length > 1 && <button className="btn ghost icon sm" title="Delete this page" onClick={() => removeGroup(gi)}><Trash2 size={13} /></button>}
                </div>
                <input className="input te" style={{ height: 28, marginBottom: 6, borderColor: g.title.te ? undefined : '#fcd34d' }} placeholder="పేజీ పేరు (Telugu page title)" value={g.title.te || ''}
                  onChange={(e) => setQn((n) => { n.groups[gi].title.te = e.target.value; })} />
                <div className="stack" style={{ gap: 6 }}>
                  {g.questions.map((x) => (
                    <div key={x.id} className={`q-card ${x.id === q?.id ? 'on' : ''}`} style={{ padding: '8px 10px' }} onClick={() => { setSel(x.id); setPpage(gi); }}>
                      <div className="q-type-ico" style={{ width: 26, height: 26 }}><TypeIcon type={x.type} size={13} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="small bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.label.en}</div>
                        <div className="row" style={{ gap: 4 }}>
                          <span className="tiny faint mono">{x.id}</span>
                          {x.showIf && <span className="logic-pill" style={{ padding: '0 5px', fontSize: 10 }}><GitBranch size={10} />logic</span>}
                          {x.pii && <span className="badge amber" style={{ padding: '0 5px', fontSize: 10 }}>PII</span>}
                          {roleOfQuestion(qn, x.id) && <span className="badge indigo" style={{ padding: '0 5px', fontSize: 10 }}>{roleOfQuestion(qn, x.id)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => setAdding(gi)}><Plus size={14} />Add question</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Editor */}
        {!q ? <Card><div className="empty small">No questions yet. Press <b>Add question</b> on a page to start.</div></Card> : (
        <div className="stack">
          <Card title={<span className="row"><span className="q-type-ico"><TypeIcon type={q.type} /></span>{typeMeta(q.type)?.en}<span className="mono faint" style={{ fontWeight: 400 }}>{q.id}</span></span>}
            right={<>
              <button className="btn ghost icon sm" title="Move up" onClick={() => move(-1)}><ArrowUp size={15} /></button>
              <button className="btn ghost icon sm" title="Move down" onClick={() => move(1)}><ArrowDown size={15} /></button>
              <button className="btn ghost icon sm" title="Duplicate" onClick={duplicate}><Copy size={15} /></button>
              <button className="btn ghost icon sm" title="Delete" onClick={remove}><Trash2 size={15} /></button>
            </>}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="grid g2" style={{ gap: 10 }}>
                <div className="field"><label>Question · English</label><textarea className="input" rows={3} value={q.label.en} onChange={(e) => editQ({ label: { ...q.label, en: e.target.value } })} /></div>
                <div className="field"><label>ప్రశ్న · Telugu</label><textarea className="input te" rows={3} value={q.label.te} onChange={(e) => editQ({ label: { ...q.label, te: e.target.value } })} style={{ borderColor: q.label.te ? undefined : '#fcd34d' }} /></div>
              </div>
              <div className="row" style={{ gap: 18 }}>
                <Toggle on={!!q.required} onChange={(v) => editQ({ required: v })} label="Required" />
                {(q.type === 'single' || q.type === 'multiple') && <Toggle on={!!q.allowOther} onChange={(v) => editQ({ allowOther: v })} label="Add “Other (specify)”" />}
                <Toggle on={!!q.pii} onChange={(v) => editQ({ pii: v })} label="Personal detail (privacy lock)" />
                {q.type === 'multiple' && <div className="row"><span className="small">Max answers</span><input className="input" type="number" style={{ width: 70 }} value={q.maxSelect || ''} onChange={(e) => editQ({ maxSelect: e.target.value ? Number(e.target.value) : undefined })} /></div>}
                {q.type === 'number' && <div className="row"><span className="small">Range</span><input className="input" type="number" style={{ width: 70 }} value={q.min ?? ''} onChange={(e) => editQ({ min: Number(e.target.value) })} /><span>–</span><input className="input" type="number" style={{ width: 70 }} value={q.max ?? ''} onChange={(e) => editQ({ max: Number(e.target.value) })} /></div>}
              </div>
              <RolePicker qn={qn} q={q} onChange={(role) => setQn((n) => {
                // One question per role: clear the role from any other question; name/mobile are always private
                n.groups.forEach((g) => { g.questions = g.questions.map((x) => {
                  // 'none' (not just empty) so a starter-questionnaire question is not picked up by its old id again
                  if (x.id === q.id) return { ...x, role: role || 'none', ...(role && ROLE_BY[role].pii ? { pii: true } : {}) };
                  return role && x.role === role ? { ...x, role: undefined } : x;
                }); });
              })} />
              {q.options && <OptionEditor label="Answer options (English · Telugu)" list={q.options} onChange={(options) => editQ({ options })} />}
              {q.type === 'grid' && <>
                <OptionEditor label="Grid rows" list={q.rows} onChange={(rows) => editQ({ rows })} />
                <OptionEditor label="Grid columns (scale)" list={q.cols} onChange={(cols) => editQ({ cols })} />
              </>}
              {q.type === 'cascade' && <div className="callout blue small"><GitBranch size={15} style={{ flexShrink: 0 }} />Cascading list: Constituency → Mandal → Booth. Each list shows only the items under the previous choice, and surveyors only see the booths assigned to them. Lists come from the booth list ({GEO.constituencies.length} constituencies, {GEO.mandals.length} mandals, {GEO.booths.length} booths{GEO.sample ? ', sample list' : ''}), managed under Set up › Booth list.</div>}
              {q.endIf && <div className="callout amber small"><AlertTriangle size={15} style={{ flexShrink: 0 }} />If the answer is “{q.options.find((o) => o.v === q.endIf)?.en}”, the interview ends here and only the refusal is recorded.</div>}
            </div>
          </Card>

          <Card title={<span className="row"><GitBranch size={16} />Skip logic · when is this question asked?</span>} sub="Ask this question only to some people, based on an earlier answer">
            {!rule ? (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row"><Badge tone="green">Always asked</Badge><span className="small muted">Every respondent sees this question.</span></div>
                {depCandidates.length ? (
                  <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { const d = depCandidates[depCandidates.length - 1]; editQ({ showIf: { q: d.id, op: 'eq', value: d.options[0].v } }); }}><Plus size={14} />Ask only when an earlier answer is…</button>
                ) : <div className="tiny muted">Skip logic needs an earlier single-choice question (above this one) to depend on.</div>}
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="small bold">Ask this question only if</div>
                <select className="select" value={rule.q} onChange={(e) => { const d = qs.find((x) => x.id === e.target.value); editQ({ showIf: { q: d.id, op: 'eq', value: d.options[0].v } }); }}>
                  {!dep && <option value={rule.q}>(deleted question {rule.q})</option>}
                  {depCandidates.map((d) => <option key={d.id} value={d.id}>Q{qs.indexOf(d) + 1} · {d.label.en.slice(0, 60)}</option>)}
                </select>
                <Seg value={['eq', 'in'].includes(rule.op) ? 'is' : ['neq', 'nin'].includes(rule.op) ? 'not' : 'answered'}
                  options={[{ value: 'is', label: 'answer is' }, { value: 'not', label: 'answer is NOT' }, { value: 'answered', label: 'has any answer' }]}
                  onChange={(m) => {
                    const vals = [].concat(rule.value ?? []).filter(Boolean);
                    const first = vals.length ? vals : [dep?.options?.[0]?.v];
                    if (m === 'answered') editQ({ showIf: { q: rule.q, op: 'answered' } });
                    else editQ({ showIf: { q: rule.q, op: m === 'is' ? (first.length > 1 ? 'in' : 'eq') : (first.length > 1 ? 'nin' : 'neq'), value: first.length > 1 ? first : first[0] } });
                  }} />
                {dep && rule.op !== 'answered' && (
                  <>
                    <div className="tiny muted">Tap one or more answers:</div>
                    <div className="row">
                      {dep.options.map((o) => {
                        const vals = [].concat(rule.value ?? []);
                        const on = vals.includes(o.v);
                        return <button key={o.v} className={`chip ${on ? 'on' : ''}`} onClick={() => {
                          let next = on ? vals.filter((v) => v !== o.v) : [...vals, o.v];
                          if (!next.length) next = [o.v];
                          const isNot = ['neq', 'nin'].includes(rule.op);
                          editQ({ showIf: { q: rule.q, op: next.length > 1 ? (isNot ? 'nin' : 'in') : (isNot ? 'neq' : 'eq'), value: next.length > 1 ? next : next[0] } });
                        }}>{on ? '✓ ' : ''}{o.en}</button>;
                      })}
                    </div>
                  </>
                )}
                <div className="callout teal small"><GitBranch size={15} style={{ flexShrink: 0 }} /><div><b>In plain words:</b> {describeRule(qn, rule).replace(/^Show only if/, 'This question is asked only if')}. Otherwise it is skipped and nothing is saved for it. Try it in the preview on the right.</div></div>
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => editQ({ showIf: undefined })}><Trash2 size={14} />Remove rule (always ask)</button>
              </div>
            )}
          </Card>

          <Card title="Checks before publishing" right={problems.length ? <Badge tone="amber">{problems.length} to fix</Badge> : <Badge tone="green">All good</Badge>}>
            {problems.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {problems.slice(0, 6).map((p, k) => (
                  <div key={k} className="row small" style={{ cursor: 'pointer' }} onClick={() => p.q && setSel(p.q)}><AlertTriangle size={14} color="#d97706" /><span className="mono">{p.q}</span>{p.msg}</div>
                ))}
              </div>
            ) : <div className="row small"><CheckCircle2 size={15} color="#16a34a" />Every question has Telugu and English text, and all skip logic is valid.</div>}
            {problems.length > 6 && <div className="tiny muted mt8">…and {problems.length - 6} more</div>}
          </Card>
        </div>
        )}

        {/* Preview */}
        <Card title={<span className="row"><Eye size={16} />Live preview</span>} sub="Exactly what surveyors see: Telugu and English together">
          <div className="phone" style={{ width: '100%', maxWidth: 360, height: 640, margin: '0 auto', borderRadius: 44, padding: 10 }}>
            <div className="phone-screen" style={{ borderRadius: 35 }}>
              <div className="phone-status"><span>9:41</span><span><Smartphone size={12} /></span></div>
              <div className="fa-head">
                <div style={{ minWidth: 0 }}>
                  <div className="tiny" style={{ color: 'rgba(255,255,255,.75)' }}>Page {Math.min(ppage, qn.groups.length - 1) + 1} of {qn.groups.length} · draft preview</div>
                  <div className="bold">{pg.title.en}</div>
                </div>
              </div>
              <div className="fa-body">
                {visible.map((x) => (
                  <div key={x.id} style={{ outline: x.id === q?.id ? '2px solid #2dd4bf' : 'none', borderRadius: 14 }}>
                    <QuestionRenderer q={x} index={allVisible.indexOf(x)} value={pans[x.id]} onChange={(v) => setPans({ ...pans, [x.id]: v })} other={pans[`${x.id}_other`]} onOther={(v) => setPans({ ...pans, [`${x.id}_other`]: v })} fallbackGps={{ lat: 18.43, lng: 79.12 }} />
                  </div>
                ))}
                {!visible.length && <div className="empty small">No questions on this page yet</div>}
                {pg.questions.length > visible.length && <div className="tiny muted" style={{ textAlign: 'center' }}><GitBranch size={11} /> {pg.questions.length - visible.length} question(s) hidden by skip logic</div>}
              </div>
              <div className="fa-foot">
                <button className="btn" disabled={ppage === 0} onClick={() => setPpage(ppage - 1)}><ChevronLeft size={15} /></button>
                <button className="btn teal" style={{ flex: 1 }} disabled={ppage >= qn.groups.length - 1} onClick={() => setPpage(ppage + 1)}>Next<ChevronRight size={15} /></button>
              </div>
            </div>
          </div>
          <div className="row mt12" style={{ justifyContent: 'center' }}>
            <span className="tiny muted row"><Languages size={12} />Answer here to test the skip logic</span>
            <button className="btn ghost sm" onClick={() => { setPans({}); setPpage(0); }}><RotateCcw size={13} />Clear answers</button>
          </div>
        </Card>
      </div>

      {adding !== null && (
        <Modal title="Add a question" onClose={() => setAdding(null)} icon={Plus}>
          <div className="grid g3" style={{ gap: 10 }}>
            {QUESTION_TYPES.map((t) => (
              <button key={t.type} className="type-tile" onClick={() => add(t.type)}>
                <span className="q-type-ico"><TypeIcon type={t.type} /></span>
                <span className="bold small">{t.en}</span>
              </button>
            ))}
          </div>
          <div className="tiny muted mt12">More question types can be added later without changing collected data.</div>
        </Modal>
      )}
      {showHistory && (
        <Modal title="Version history" onClose={() => setShowHistory(false)} icon={History}>
          <div className="timeline">
            {hasDraft && <div className="tl-item now"><div className="bold">Draft</div><div className="small muted">{unsaved ? 'Unsaved changes on this screen' : 'Saved, not yet published'}</div></div>}
            <div className={`tl-item ${hasDraft ? "done" : "now"}`}><div className="bold">Version {live.version}</div><div className="small muted">Published · used by surveyor phones now</div></div>
            {live.version > 1 && <div className="tl-item done"><div className="bold">Versions 1 to {live.version - 1}</div><div className="small muted">Earlier published versions</div></div>}
          </div>
          <div className="callout blue small mt8">Interviews always keep the version they were collected on, so earlier answers are never lost when the questionnaire changes.</div>
        </Modal>
      )}
      <style>{`@media (max-width: 1280px){ .content .grid[style*="400px"]{ grid-template-columns: minmax(0,260px) minmax(0,1fr) !important; } .content .grid[style*="400px"] > .card:last-child{ grid-column: 1 / -1; } }
      @media (max-width: 960px){ .content .grid[style*="400px"]{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  );
}
