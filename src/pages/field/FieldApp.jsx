import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Smartphone, Wifi, WifiOff, CloudUpload, Mic, MapPin, Clock, ChevronLeft, ChevronRight, CheckCircle2, Play,
  UserCheck, XCircle, Target, AlertTriangle, RefreshCw, Battery, Signal, ShieldCheck, Info, X, Home, ListChecks, Languages,
} from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Toggle, Badge, Progress, fmtClock, initials } from '../../components/ui.jsx';
import QuestionRenderer, { validateAnswer } from '../../components/QuestionRenderer.jsx';
import { GEO, BOOTH_BY_ID, MANDAL_BY_ID, CONST_BY_ID, ageBand, defaultTargets } from '../../data/geo.js';
import { isVisible } from '../../data/questionnaire.js';
import { boothProgress, istDay } from '../../lib/analytics.js';
import { AUDIO } from '../../lib/audio.js';
import { A, R, targetCategories } from '../../lib/roles.js';
import { newInterviewId } from '../../lib/outbox.js';

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// mode = "app"     → the surveyor's own phone app (full screen, no demo tools)
// mode = "preview" → admin view on a laptop: phone frame + demo switches
// Shown instead of the app when there is nothing to work on yet
export default function FieldApp(props) {
  const s = useStore();
  const team = s.surveyors.filter((x) => x.role === 'Surveyor' && x.boothIds?.length);
  const isSurveyor = s.user.role === 'surveyor';
  const me = isSurveyor ? team.find((x) => x.id === s.user.surveyorId) : team[0];
  let msg = null;
  if (!GEO.booths.length) msg = ['No booth list yet', isSurveyor ? 'MSR has not loaded the booth list yet. Ask your supervisor.' : 'Upload the booth list first: Set up > Booth list.'];
  else if (s.serverMode && !s.surveyId) msg =['No survey is running right now', isSurveyor ? 'When MSR starts fieldwork for a survey, it will appear here.' : 'Create a survey and start its fieldwork first.'];
  else if (!me) msg = isSurveyor ? ['Your booth is not set up yet', 'Ask your supervisor to add you, with your booth, in the surveyor list.'] : ['No surveyors yet', 'Upload the surveyor list from Excel on Surveyors & team.'];
  else if (isSurveyor && !me.boothIds.some((b) => BOOTH_BY_ID[b])) msg = ['Your booth is not in the booth list', `Booth ${me.boothIds[0]} is not in MSR's booth list. Ask your supervisor to correct your booth in the surveyor list.`];
  if (msg) return <div className="fapp" style={{ display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}><div><Smartphone size={34} className="faint" /><h3 style={{ marginTop: 10 }}>{msg[0]}</h3><p className="muted small">{msg[1]}</p></div></div>;
  return <FieldAppInner {...props} />;
}

function FieldAppInner({ mode = 'preview' }) {
  const s = useStore();
  const app = mode === 'app';
  const surveyorsOnly = s.surveyors.filter((x) => x.role === 'Surveyor');
  const [svId, setSvId] = useState((s.user.role === 'surveyor' && s.user.surveyorId) || surveyorsOnly[0].id);
  const demo = !(s.serverMode && !s.server?.demo);

  // Follow the phone's real internet connection, and sync automatically when it returns
  useEffect(() => {
    const on = () => s.update({ deviceOnline: true });
    const off = () => s.update({ deviceOnline: false });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    if (!navigator.onLine) off();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hasWaiting = s.outbox.length > 0;
  useEffect(() => {
    if (!s.deviceOnline || !hasWaiting) return undefined;
    const first = setTimeout(() => { s.syncOutbox(); }, 800);
    // Keep trying while interviews are waiting (weak signal, server restarting): no need to restart the app
    const again = setInterval(() => { s.syncOutbox(); }, 30000);
    return () => { clearTimeout(first); clearInterval(again); };
  }, [s.deviceOnline, hasWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const sv = surveyorsOnly.find((x) => x.id === svId) || surveyorsOnly[0];
  const boothId = sv.boothIds.find((b) => BOOTH_BY_ID[b]) || sv.boothIds[0];
  const booth = BOOTH_BY_ID[boothId] || GEO.booths[0];
  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState('home');
  const [page, setPage] = useState(0);
  const [ans, setAns] = useState({});
  const [err, setErr] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [realDuration, setRealDuration] = useState(true);
  const [atHome, setAtHome] = useState(false);
  const [skipConsent, setSkipConsent] = useState(false);
  const [lastId, setLastId] = useState(null);
  const [recMode, setRecMode] = useState('asking');
  const recRef = useRef(null);
  const chunks = useRef([]);
  const bodyRef = useRef(null);
  const [qnSnap, setQnSnap] = useState(null);
  const qn = qnSnap || s.questionnaire;
  const [errQ, setErrQ] = useState(null);
  const [saveResult, setSaveResult] = useState('sent');

  const prog = useMemo(() => boothProgress(boothId, s.valid, s.targets), [boothId, s.valid, s.targets]);
  const mineAll = useMemo(() => [...s.interviews.filter((i) => i.surveyorId === sv.id), ...s.outbox.filter((i) => i.surveyorId === sv.id)].sort((a, b) => b.startedAt - a.startedAt), [s.interviews, s.outbox, sv.id]);
  const today = istDay(Date.now());
  const todayCount = mineAll.filter((i) => istDay(i.startedAt) === today).length;

  useEffect(() => {
    if ((screen !== 'consent' && screen !== 'survey') || recMode !== 'real') return undefined;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [screen, startedAt, recMode]);
  useEffect(() => { bodyRef.current?.scrollTo?.(0, 0); window.scrollTo(0, 0); }, [page, screen]);

  // recMode: 'asking' (waiting for permission) | 'real' (recording) | 'denied' | 'unavailable' | 'skipped' (demo only)
  const startRecording = async () => {
    setRecMode('asking');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setRecMode('unavailable'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.start();
      recRef.current = mr;
      setStartedAt(Date.now());
      setElapsed(0);
      setRecMode('real');
    } catch {
      setRecMode('denied');
    }
  };
  const stopRecording = () => new Promise((resolve) => {
    const mr = recRef.current;
    if (!mr) return resolve(null);
    mr.onstop = () => { mr.stream.getTracks().forEach((x) => x.stop()); resolve(URL.createObjectURL(new Blob(chunks.current, { type: mr.mimeType }))); };
    mr.stop();
    recRef.current = null;
    return undefined;
  });

  const begin = () => {
    // Start with the surveyor's booth filled in (cascade question), and the starter questionnaire's consent/date answers when present
    const qs0 = s.questionnaire.groups.flatMap((g) => g.questions);
    const pre = {};
    qs0.filter((x) => x.type === 'cascade').forEach((x) => { pre[x.id] = { constituency: booth.constituencyId, mandal: booth.mandalId, booth: booth.id }; });
    if (qs0.some((x) => x.id === 'q_consent')) pre.q_consent = 'Y';
    if (qs0.some((x) => x.id === 'q_date' && x.type === 'date')) pre.q_date = new Date().toISOString().slice(0, 10);
    setAns(pre);
    setQnSnap(s.questionnaire);
    setPage(0); setErr(''); setErrQ(null); setStartedAt(Date.now()); setElapsed(0); setScreen('consent');
    startRecording();
  };
  const cancel = () => { if (window.confirm('Stop this interview? The answers will be discarded.')) { stopRecording(); setQnSnap(null); setScreen('home'); } };

  const visibleOn = (gi) => qn.groups[gi].questions.filter((q) => isVisible(q, ans));
  const numberOf = (q) => qn.groups.flatMap((g) => g.questions).filter((x) => isVisible(x, ans)).findIndex((x) => x.id === q.id);
  // Pages with nothing to ask (empty, or every question skipped by logic) are jumped over
  const nextPage = (from) => { for (let i = from + 1; i < qn.groups.length; i++) if (visibleOn(i).length) return i; return -1; };
  const prevPage = (from) => { for (let i = from - 1; i >= 0; i--) if (visibleOn(i).length) return i; return -1; };
  const next = async () => {
    for (const q of visibleOn(page)) {
      const e = validateAnswer(q, ans[q.id]);
      if (e) {
        setErr(`Q${numberOf(q) + 1} · ${q.label.en}: ${e}`);
        setErrQ(q.id);
        setTimeout(() => document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        return;
      }
    }
    setErr(''); setErrQ(null);
    const np = nextPage(page);
    if (np >= 0) { setPage(np); window.scrollTo?.(0, 0); return; }
    const audioUrl = await stopRecording();
    // Demo switches only apply in demo mode. Real fieldwork always records the true time, location and consent.
    const realSecs = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const dur = demo && realDuration && !app ? 840 + Math.floor(Math.random() * 300) : (demo && app ? Math.max(realSecs, 840 + Math.floor(Math.random() * 300)) : realSecs);
    const allQs = qn.groups.flatMap((g) => g.questions);
    const locQ = allQs.find((x) => x.type === 'cascade');
    const loc = BOOTH_BY_ID[locQ && ans[locQ.id]?.booth] || booth;
    const gpsQ = allQs.find((x) => x.type === 'gps');
    const gpsAns = gpsQ ? ans[gpsQ.id] : null;
    if (!(demo && atHome && !app) && !gpsAns) { setErr('Capture the GPS location before sending (last page).'); return; }
    const gps = demo && atHome && !app ? { lat: loc.lat + 0.07, lng: loc.lng - 0.05, acc: 8 } : gpsAns;
    const shown = new Set(qn.groups.flatMap((g) => g.questions).filter((q) => isVisible(q, ans)).map((q) => q.id));
    const kept = Object.fromEntries(Object.entries(ans).filter(([k]) => shown.has(k) || shown.has(k.replace(/_other$/, ''))));
    const id = newInterviewId(sv.id); // unique across all phones (the server ignores a repeated id)
    const rec = {
      id, round: 3, surveyId: s.surveyId || 'TSP-R3', surveyorId: sv.id, boothId: loc.id, mandalId: loc.mandalId, constituencyId: loc.constituencyId,
      startedAt: Date.now() - dur * 1000, durationSec: dur, gps,
      consent: { agreed: true, audio: recMode === 'real', consentRead: !(demo && skipConsent && !app), recordingSec: recMode === 'real' ? dur + 10 : 0 },
      device: /iPhone|iPad|Mac/.test(navigator.userAgent) ? 'iOS · MSR Pulse 1.0' : 'Android · MSR Pulse 1.0',
      // Photos are recorded as taken / not taken (the image itself is not uploaded yet)
      answers: {
        ...kept,
        ...Object.fromEntries(allQs.filter((x) => x.type === 'photo' && shown.has(x.id)).map((x) => [x.id, !!ans[x.id]])),
        ...(gpsQ ? { [gpsQ.id]: { lat: gps.lat, lng: gps.lng, acc: gps.acc } } : {}),
      },
      source: 'Pulse Field app', syncedAt: Date.now(), fromFieldApp: true,
    };
    if (audioUrl) AUDIO.set(id, audioUrl);
    setLastId(id);
    // Saved on the phone first, then sent; it stays on the phone until the server confirms it
    const result = await s.addInterview(rec, { offline: !s.deviceOnline });
    if (result === 'sent') s.toast('Interview sent to MSR Pulse', 'success');
    setSaveResult(result);
    setQnSnap(null);
    setScreen('done');
  };
  const decline = async () => { await stopRecording(); setQnSnap(null); s.toast('Refusal noted. No answers were stored.', 'info'); setScreen('home'); };

  const tg = s.targets[boothId] || defaultTargets(booth);
  const quotaWarn = (() => {
    const w = [];
    const g = A({ answers: ans }, 'gender');
    const age = A({ answers: ans }, 'age');
    const c = A({ answers: ans }, 'caste');
    const label = (group, k) => targetCategories(qn)[group].find((o) => o.v === k)?.en || k;
    if (g && tg.gender?.[g] !== undefined && (prog.gender[g] || 0) >= tg.gender[g]) w.push(label('gender', g));
    if (age >= 18) { const ab = ageBand(age); if (tg.age?.[ab] !== undefined && (prog.age[ab] || 0) >= tg.age[ab]) w.push(`age ${ab}`); }
    if (c && tg.caste?.[c] !== undefined && (prog.caste[c] || 0) >= tg.caste[c]) w.push(label('caste', c));
    return w;
  })();
  // The quota warning shows on the page that asks the quota questions
  const quotaPage = qn.groups.findIndex((g) => g.questions.some((x) => [R('gender'), R('age'), R('caste')].includes(x.id)));
  // Shown with the answer's wording (e.g. "Female"), not its code (e.g. "F")
  const cats = targetCategories(qn);
  const nameOf = (group, k) => cats[group].find((o) => o.v === k)?.en || k;
  const needs = [
    ...Object.entries(tg.gender || {}).map(([k, v]) => [nameOf('gender', k), v - (prog.gender[k] || 0)]),
    ...Object.entries(tg.age || {}).map(([k, v]) => [`Age ${k}`, v - (prog.age[k] || 0)]),
    ...Object.entries(tg.caste || {}).map(([k, v]) => [nameOf('caste', k), v - (prog.caste[k] || 0)]),
  ].filter(([, v]) => v > 0);
  const savedOnline = saveResult === 'sent' && !s.outbox.some((o) => o.id === lastId);

  const InterviewRow = ({ i }) => {
    const pending = s.outbox.some((o) => o.id === i.id);
    const qq = s.quality[i.id];
    const flagged = qq && qq.score >= 40;
    return (
      <div className="fa-card row nowrap" style={{ padding: '11px 13px', marginBottom: 8 }}>
        <div className="avatar" style={{ width: 34, height: 34, fontSize: 11, background: /^f/i.test(A(i, 'gender') || '') ? '#db2777' : '#2563eb' }}>{String(A(i, 'gender') || '?')[0]}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold small">{[A(i, 'gender'), A(i, 'age') !== undefined ? `${A(i, 'age')} yrs` : null, A(i, 'caste')].filter(Boolean).join(' · ') || 'Interview'}</div>
          <div className="tiny muted">{fmtClock(i.startedAt)} · {Math.max(1, Math.round(i.durationSec / 60))} min · {i.id}</div>
        </div>
        {pending ? <Badge tone="amber"><CloudUpload size={11} />Waiting</Badge> : flagged ? <Badge tone="red">Under review</Badge> : <Badge tone="green"><CheckCircle2 size={11} />Sent</Badge>}
      </div>
    );
  };

  const Body = (
    <div className="fapp">
      {/* ---------------- Home ---------------- */}
      {screen === 'home' && (
        <>
          {!s.deviceOnline && <div className="small" style={{ background: '#fef3c7', color: '#92400e', padding: '9px 16px', display: 'flex', gap: 8, alignItems: 'center' }}><WifiOff size={15} />No internet. Interviews are saved on this phone and sent later.</div>}
          <div className="fa-body">
            {tab === 'home' ? (
              <div className="stack" style={{ gap: 12 }}>
                <div className="greet">
                  <div className="avatar">{initials(sv.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="small muted">{greeting()},</div>
                    <div className="bold" style={{ fontSize: 18 }}>{sv.name}</div>
                    <div className="tiny muted">Surveyor {sv.id}</div>
                  </div>
                </div>
                {s.serverMode && s.surveys.length > 1 && (
                  <div className="fa-card" style={{ marginBottom: 0 }}>
                    <div className="tiny bold muted">SURVEY YOU ARE WORKING ON</div>
                    <select className="select mt8" style={{ height: 44 }} value={s.surveyId || ''} onChange={(e) => s.selectSurvey(e.target.value)}>
                      {s.surveys.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                    </select>
                  </div>
                )}
                <div className="stat-row">
                  <div className="stat-mini"><div className="v">{todayCount}</div><div className="l">Done today</div></div>
                  <div className="stat-mini"><div className="v">{prog.done}</div><div className="l">At this booth</div></div>
                  <div className="stat-mini"><div className="v" style={{ color: s.outbox.length ? '#b45309' : undefined }}>{s.outbox.length}</div><div className="l">Waiting to send</div></div>
                </div>
                <div className="fa-card" style={{ marginBottom: 0 }}>
                  <div className="tiny bold muted">YOUR BOOTH</div>
                  <div className="bold" style={{ fontSize: 16, marginTop: 2 }}>{booth.name.en}</div>
                  <div className="small muted">{MANDAL_BY_ID[booth.mandalId].name.en} mandal · {CONST_BY_ID[booth.constituencyId].name.en}</div>
                  <div className="row mt12 nowrap"><div style={{ flex: 1 }}><Progress value={prog.pct} tone="green" /></div><span className="bold small">{prog.done} of {tg.total}</span></div>
                </div>
                {/* One clear instruction: what to do next at this booth */}
                {needs.length > 0 && prog.done < tg.total && (
                  <div className="fa-card" style={{ marginBottom: 0 }}>
                    <div className="tiny bold muted row" style={{ gap: 5 }}><Target size={12} />STILL NEEDED AT THIS BOOTH</div>
                    <div className="row mt8" style={{ gap: 6 }}>{needs.map(([k, v]) => <span key={k} className="badge amber">{k}: {v} more</span>)}</div>
                  </div>
                )}
                {needs.length > 0 && prog.done >= tg.total && (
                  <div className="callout amber small" style={{ alignItems: 'flex-start' }}>
                    <Target size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <b>Booth total reached ({prog.done} of {tg.total}).</b> Some groups are still short, so only interview people from these groups, and check with your supervisor first:
                      <div className="row mt8" style={{ gap: 6 }}>{needs.map(([k, v]) => <span key={k} className="badge amber">{k}: {v} more</span>)}</div>
                    </div>
                  </div>
                )}
                {needs.length === 0 && <div className="callout teal small"><CheckCircle2 size={15} />This booth is complete. Ask your supervisor before doing more interviews here.</div>}
                <button className="big-start" onClick={begin}><Play size={22} fill="#fff" />Start new interview</button>
                {s.outbox.length > 0 && (
                  <div className="fa-card row" style={{ borderColor: '#fcd34d', background: '#fffbeb', marginBottom: 0 }}>
                    <CloudUpload size={18} color="#b45309" />
                    <div style={{ flex: 1 }}><div className="bold small">{s.outbox.length} interview{s.outbox.length > 1 ? 's' : ''} waiting to send</div><div className="tiny muted">{s.deviceOnline ? 'Sending now…' : 'Will send automatically when internet returns'}</div></div>
                    {s.deviceOnline && <button className="btn sm" onClick={() => s.syncOutbox()}><RefreshCw size={13} />Send</button>}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="bold" style={{ fontSize: 17, marginBottom: 4 }}>My interviews</div>
                <div className="small muted" style={{ marginBottom: 12 }}>{mineAll.length} in total · {todayCount} today</div>
                {mineAll.slice(0, 50).map((i) => <InterviewRow key={i.id} i={i} />)}
                {!mineAll.length && <div className="empty small">No interviews yet.</div>}
              </div>
            )}
          </div>
          <div className="bottom-nav">
            <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}><Home size={20} />Home</button>
            <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}><ListChecks size={20} />My interviews</button>
          </div>
        </>
      )}

      {/* ---------------- Interview header ---------------- */}
      {(screen === 'consent' || screen === 'survey') && (
        <div className="fa-head" style={{ flexWrap: 'wrap', rowGap: 8, padding: '12px 14px' }}>
          <button className="btn ghost icon sm" style={{ color: '#fff' }} onClick={cancel} aria-label="Stop interview"><X size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tiny" style={{ color: 'rgba(255,255,255,.75)' }}>{screen === 'consent' ? 'Before you start' : `Step ${page + 1} of ${qn.groups.length}`}</div>
            <div className="bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{screen === 'consent' ? 'Consent' : qn.groups[page].title.en}</div>
          </div>
          {recMode === 'real' ? <span className="rec"><i />REC {mmss(elapsed)}</span> : <span className="rec" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>{recMode === 'asking' ? 'Waiting for microphone…' : recMode === 'skipped' ? 'Not recording (demo)' : 'NOT recording'}</span>}
          {screen === 'survey' && <div style={{ width: '100%' }}><div className="prog sm" style={{ background: 'rgba(255,255,255,.2)' }}><span style={{ width: `${((page + 1) / qn.groups.length) * 100}%`, background: '#fff' }} /></div></div>}
        </div>
      )}

      {/* ---------------- Consent ---------------- */}
      {screen === 'consent' && (
        <>
          <div className="fa-body" ref={bodyRef}>
            <div className="fa-card consent-box" style={{ borderColor: '#99f6e4' }}>
              <div className="tiny bold" style={{ color: '#0f766e', marginBottom: 6 }}>READ THIS ALOUD TO THE RESPONDENT</div>
              <p className="q-te" style={{ fontWeight: 500, fontSize: 16 }}>{qn.consentScript.te}</p>
              <p className="q-en" style={{ marginTop: 10, fontSize: 13.5 }}>{qn.consentScript.en}</p>
            </div>
            <div className="fa-card stack small" style={{ gap: 9 }}>
              <div className="row nowrap"><Mic size={16} color={recMode === 'real' ? '#e11d48' : '#94a3b8'} /><span>{{ asking: 'Asking for microphone permission… tap Allow on the phone', real: 'Recording with the phone microphone', denied: 'Microphone is blocked - not recording', unavailable: 'This device cannot record audio here', skipped: 'Not recording (demo only)' }[recMode] || 'Preparing…'}</span></div>
              <div className="row nowrap"><MapPin size={16} color="#0d9488" /><span>Your GPS location is captured on the last step</span></div>
              {recMode === 'real' && <div className="row nowrap"><Clock size={16} color="#2563eb" /><span>Recording started at {fmtClock(startedAt)}</span></div>}
            </div>
            {(recMode === 'denied' || recMode === 'unavailable') && (
              <div className="callout red small">
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <b>Every interview must be recorded with consent.</b> {recMode === 'denied' ? 'Allow the microphone for MSR Pulse: phone Settings > Apps > MSR Pulse > Permissions > Microphone > Allow. Then tap Try again.' : 'Open MSR Pulse in the app or on the secure (https) site to record.'}
                  <div className="row mt8">
                    <button className="btn sm" onClick={startRecording}>Try again</button>
                    {(demo || !app) && <button className="btn ghost sm" onClick={() => { setStartedAt(Date.now()); setRecMode('skipped'); }}>Continue without recording ({app ? 'demo' : 'preview'} only)</button>}
                  </div>
                </div>
              </div>
            )}
            <div className="small muted" style={{ textAlign: 'center' }}>Does the respondent agree to take part?</div>
          </div>
          <div className="fa-foot">
            <button className="btn danger" style={{ height: 50 }} onClick={decline}><XCircle size={16} />No</button>
            <button className="btn" style={{ flex: 1, height: 50, background: '#0d9488', borderColor: '#0d9488', color: '#fff', fontSize: 15 }} disabled={!['real', 'skipped'].includes(recMode)} onClick={() => setScreen('survey')}><UserCheck size={17} />Yes, agrees · start</button>
          </div>
        </>
      )}

      {/* ---------------- Questions ---------------- */}
      {screen === 'survey' && (
        <>
          <div className="fa-body" ref={bodyRef}>
            {err && (
              <div className="callout red small" style={{ position: 'sticky', top: 0, zIndex: 3, boxShadow: '0 6px 18px rgba(225,29,72,.18)', marginBottom: 10 }} role="alert">
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /><div style={{ flex: 1 }}><b>Please complete this question</b><br />{err}</div>
                <button className="btn ghost icon sm" onClick={() => { setErr(''); setErrQ(null); }} aria-label="Close"><X size={14} /></button>
              </div>
            )}
            {visibleOn(page).map((q) => (
              <div key={q.id} id={`q-${q.id}`} style={errQ === q.id ? { borderRadius: 16, boxShadow: '0 0 0 2.5px #e11d48' } : undefined}>
                <QuestionRenderer q={q} index={numberOf(q)} value={ans[q.id]} allowedBooths={sv.boothIds}
                  onChange={(v) => { setAns((a) => ({ ...a, [q.id]: v })); if (errQ === q.id) { setErr(''); setErrQ(null); } }}
                  other={ans[`${q.id}_other`]} onOther={(v) => setAns((a) => ({ ...a, [`${q.id}_other`]: v }))}
                  fallbackGps={booth} realGps={app || !demo} allowDemoLocation={demo} />
              </div>
            ))}
            {page === quotaPage && quotaWarn.length > 0 && (
              <div className="callout amber small"><AlertTriangle size={15} style={{ flexShrink: 0 }} /><div>Target already met at this booth for <b>{quotaWarn.join(', ')}</b>. Continue only if your supervisor agrees.</div></div>
            )}
          </div>
          <div className="fa-foot">
            <button className="btn" style={{ height: 50, width: 56 }} disabled={prevPage(page) < 0} onClick={() => { const pp = prevPage(page); if (pp >= 0) { setPage(pp); setErr(''); setErrQ(null); } }} aria-label="Back"><ChevronLeft size={18} /></button>
            <button className="btn" style={{ flex: 1, height: 50, background: '#0d9488', borderColor: '#0d9488', color: '#fff', fontSize: 15 }} onClick={next}>
              {nextPage(page) < 0 ? <><CheckCircle2 size={17} />Finish & send</> : <>Next<ChevronRight size={17} /></>}
            </button>
          </div>
        </>
      )}

      {/* ---------------- Done ---------------- */}
      {screen === 'done' && (
        <div className="fa-body" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: savedOnline ? '#dcfce7' : '#fef3c7', display: 'grid', placeItems: 'center', margin: '0 auto' }}>
              {savedOnline ? <CheckCircle2 size={44} color="#16a34a" /> : <CloudUpload size={40} color="#b45309" />}
            </div>
            <h2 style={{ marginTop: 16, fontSize: 22 }}>{savedOnline ? 'Interview sent' : saveResult === 'unsaved' ? 'Not saved on this phone' : 'Interview saved'}</h2>
            <p className="muted" style={{ maxWidth: 290, margin: '8px auto' }}>
              {savedOnline ? 'It has reached MSR Pulse and been checked. Thank you!'
                : saveResult === 'unsaved' ? 'This phone could not store the interview (storage may be full). Do NOT close the app. Connect to the internet and tap Send on the home screen, or call your supervisor.'
                  : 'It is safely saved on this phone and will be sent automatically when internet returns. You can close the app.'}
            </p>
            <div className="mono tiny muted">{lastId}</div>
            {AUDIO.get(lastId) && <audio controls src={AUDIO.get(lastId)} style={{ width: 260, marginTop: 10 }} />}
            <div className="stack mt16" style={{ gap: 8 }}>
              <button className="big-start" style={{ height: 54, fontSize: 16 }} onClick={begin}><Play size={18} fill="#fff" />Start next interview</button>
              <button className="btn block" style={{ height: 46 }} onClick={() => { setTab('home'); setScreen('home'); }}>Back to home</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (app) return Body;

  // ---------------- Admin preview on a laptop ----------------
  return (
    <div>
      <PageHead eyebrow="Fieldwork" icon={Smartphone} title="Field app preview" desc="This is exactly what surveyors see on their Android or iPhone. Use the demo switches to show the client how fake interviews are caught." />
      <div className="phone-stage">
        <div className="phone">
          <div className="phone-screen">
            <div className="phone-status">
              <span>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span className="row" style={{ gap: 5 }}>{s.deviceOnline ? <Signal size={13} /> : <span className="tiny" style={{ color: 'var(--red)' }}>No signal</span>}{s.deviceOnline ? <Wifi size={13} /> : <WifiOff size={13} />}<Battery size={15} /></span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>{Body}</div>
          </div>
        </div>
        <div className="stack" style={{ width: 360, maxWidth: '100%' }}>
          <Card title="Demo controls" sub="Simulate real field conditions">
            <div className="stack" style={{ gap: 14 }}>
              <div className="field"><label>Show the app as surveyor</label>
                <select className="select" value={svId} onChange={(e) => { setSvId(e.target.value); setScreen('home'); }}>
                  {surveyorsOnly.map((x) => <option key={x.id} value={x.id}>{x.name} · {BOOTH_BY_ID[x.boothIds[0]]?.short || x.boothIds[0]}, {CONST_BY_ID[x.constituencyId]?.name.en || x.constituencyId}</option>)}
                </select>
              </div>
              <div className="row"><Toggle on={s.deviceOnline} onChange={(v) => s.update({ deviceOnline: v })} label={s.deviceOnline ? 'Phone has internet' : 'Phone is offline'} /></div>
              {demo ? (<>
                <div className="divider" style={{ margin: 0 }} />
                <div className="tiny bold muted">TRY THE FAKE-INTERVIEW CHECKS</div>
                <Toggle on={realDuration} onChange={setRealDuration} label="Count as a normal 15-minute interview" />
                <Toggle on={atHome} onChange={setAtHome} label="Surveyor is at home, 8 km away (GPS check)" />
                <Toggle on={skipConsent} onChange={setSkipConsent} label="Consent line not read (AI checker)" />
                <div className="callout blue small"><Info size={15} style={{ flexShrink: 0, marginTop: 2 }} /><div>Switch one on, submit an interview, then open <b>Fake-interview alerts</b>. It will be flagged with the exact reason.</div></div>
              </>) : <div className="callout teal small"><Info size={15} style={{ flexShrink: 0, marginTop: 2 }} /><div>Production mode: real time, real GPS and real consent are always recorded.</div></div>}
            </div>
          </Card>
          <Card title="What surveyors get">
            <div className="stack small" style={{ gap: 9 }}>
              {[[WifiOff, 'Works with no internet; sends automatically later'], [ShieldCheck, 'Consent recorded before any question'], [Mic, 'Audio recording of every interview'], [MapPin, 'GPS and time on every interview'], [Languages, 'Questions in Telugu and English together'], [Smartphone, 'Same app on Android and iPhone']].map(([I, x]) => (
                <div key={x} className="row nowrap"><I size={15} color="#0d9488" style={{ flexShrink: 0 }} />{x}</div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
