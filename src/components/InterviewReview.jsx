import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Tooltip } from 'react-leaflet';
import { CheckCircle2, PhoneCall, XCircle, Play, Pause, AudioLines, MapPin, Clock, User, Smartphone, Sparkles, ShieldAlert } from 'lucide-react';
import { useStore } from '../store.jsx';
import { Badge, PII, Risk, StatusBadge, fmtTime } from './ui.jsx';
import { BOOTH_BY_ID, MANDAL_BY_ID, CONST_BY_ID } from '../data/geo.js';
import { RULE_BY_ID, buildTranscript } from '../lib/quality.js';
import { allQuestions, optionLabel } from '../data/questionnaire.js';
import { AUDIO } from '../lib/audio.js';
import { mulberry32 } from '../data/rng.js';
import { piiQuestions, piiKind } from '../lib/roles.js';

function answerText(q, v) {
  if (v === undefined || v === '' || v === null) return '—';
  if (q.type === 'single') return optionLabel(q, v);
  if (q.type === 'multiple') return v.map((x) => optionLabel(q, x)).join(', ');
  if (q.type === 'grid') return q.rows.map((r) => `${r.en} ${v[r.v] || '-'}`).join(' · ');
  if (q.type === 'cascade') return `${CONST_BY_ID[v.constituency]?.name.en} › ${MANDAL_BY_ID[v.mandal]?.name.en} › ${BOOTH_BY_ID[v.booth]?.short}`;
  if (q.type === 'gps') return `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)} ±${v.acc}m`;
  if (q.type === 'photo') return v ? 'Attached' : 'No photo';
  return String(v);
}

export function AudioPlayer({ interview, transcript }) {
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const real = AUDIO.get(interview.id);
  const audioRef = useRef(null);
  const total = interview.consent.recordingSec;
  const bars = useMemo(() => { const r = mulberry32(interview.id.length * 977 + interview.durationSec); return Array.from({ length: 90 }, () => 0.2 + r() * 0.8); }, [interview.id, interview.durationSec]);
  const consentEnd = interview.consent.consentRead ? 0.12 : 0;
  useEffect(() => {
    if (!playing || real) return undefined;
    const id = setInterval(() => setPos((p) => { if (p >= 1) { setPlaying(false); return 1; } return p + 0.004; }), 60);
    return () => clearInterval(id);
  }, [playing, real]);
  const toggle = () => {
    if (real && audioRef.current) { if (playing) audioRef.current.pause(); else audioRef.current.play(); }
    setPlaying(!playing);
  };
  const tsec = Math.floor(pos * total);
  return (
    <div>
      <div className="row nowrap">
        <button className="btn icon teal" onClick={toggle} style={{ borderRadius: '50%' }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <div className="waveform" style={{ flex: 1 }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width); }}>
          {bars.map((h, k) => <span key={k} className={`${k / bars.length < consentEnd ? 'consent' : ''} ${k / bars.length <= pos ? 'played' : ''}`} style={{ height: `${h * 100}%` }} />)}
        </div>
        <span className="mono small">{String(Math.floor(tsec / 60)).padStart(2, '0')}:{String(tsec % 60).padStart(2, '0')} / {Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}</span>
      </div>
      {real && <audio ref={audioRef} src={real} onTimeUpdate={(e) => setPos(e.target.currentTime / (e.target.duration || 1))} onEnded={() => setPlaying(false)} style={{ display: 'none' }} />}
      <div className="tiny muted mt8">{real ? 'Real recording captured on this device during the demo.' : 'Recording stored encrypted in S3 (Mumbai/Hyderabad). Waveform shown; green = consent segment.'}</div>
      {transcript && (
        <div className="mt12" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {transcript.map((l, k) => (
            <div key={k} className={`transcript-line ${l.tag === 'consent' ? 'consent' : l.tag === 'consent-missing' ? 'consent-missing' : ''}`}>
              <span className="mono tiny muted">{String(Math.floor(l.t / 60)).padStart(2, '0')}:{String(l.t % 60).padStart(2, '0')}</span>
              <div>
                <div className="tiny bold muted">{l.who}{l.tag === 'consent' && <Badge tone="green" className="ml">Consent line detected</Badge>}{l.tag === 'consent-missing' && <Badge tone="red">Consent line missing</Badge>}</div>
                <div className="te">{l.te}</div>
                <div className="small muted">{l.en}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InterviewReview({ interview: i, showTranscript = true }) {
  const s = useStore();
  const piiIds = piiQuestions(s.questionnaire);
  const q = s.quality[i.id];
  const status = s.statusOf(i.id);
  const booth = BOOTH_BY_ID[i.boothId];
  const sv = s.surveyors.find((x) => x.id === i.surveyorId);
  const [note, setNote] = useState(s.notes[i.id] || '');
  useEffect(() => setNote(s.notes[i.id] || ''), [i.id, s.notes]);
  const transcript = useMemo(() => buildTranscript(i, s.questionnaire), [i, s.questionnaire]);

  const decide = (st) => {
    s.update((x) => ({ statuses: { ...x.statuses, [i.id]: st }, notes: { ...x.notes, [i.id]: note } }));
    s.log(`${st === 'Accepted' ? 'Accepted' : st === 'Rejected' ? 'Rejected' : 'Sent for back-check'} ${i.id}${note ? ` — “${note}”` : ''}`);
    s.toast(`${i.id} marked ${st}`, st === 'Rejected' ? 'error' : 'success');
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <Risk q={q} />
        <div>
          <div className="bold" style={{ fontSize: 16 }}>{i.id}</div>
          <div className="tiny muted">{booth.name.en} · {CONST_BY_ID[i.constituencyId]?.name.en}</div>
        </div>
        <div className="spacer" />
        <StatusBadge s={status} />
      </div>

      <div className="grid g2" style={{ gap: 8 }}>
        <div className="row nowrap small"><User size={14} className="muted" />{sv?.name} · {i.surveyorId}</div>
        <div className="row nowrap small"><Clock size={14} className="muted" />{fmtTime(i.startedAt)} · {Math.round(i.durationSec / 60)} min</div>
        <div className="row nowrap small"><MapPin size={14} className="muted" />{q.distanceKm.toFixed(2)} km from booth · ±{i.gps.acc} m</div>
        <div className="row nowrap small"><Smartphone size={14} className="muted" />{i.device}</div>
      </div>

      {q.flags.length > 0 ? (
        <div className="stack" style={{ gap: 6 }}>
          {q.flags.map((f) => (
            <div key={f.id} className="callout red" style={{ padding: '9px 12px' }}>
              <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}><b>{RULE_BY_ID[f.id].name}</b> · {f.detail}<div className="tiny" style={{ opacity: 0.8 }}>{RULE_BY_ID[f.id].desc}</div></div>
              <span className="badge red">+{RULE_BY_ID[f.id].weight}</span>
            </div>
          ))}
        </div>
      ) : <div className="callout teal small"><CheckCircle2 size={15} />No quality concerns found by the 9 automatic checks.</div>}

      <div style={{ height: 190, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
        <MapContainer key={i.id} bounds={[[booth.lat, booth.lng], [i.gps.lat, i.gps.lng]]} boundsOptions={{ padding: [40, 40], maxZoom: 15 }} style={{ height: '100%' }} scrollWheelZoom={false}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Circle center={[booth.lat, booth.lng]} radius={1500} pathOptions={{ color: '#0d9488', weight: 1, fillOpacity: 0.06 }} />
          <CircleMarker center={[booth.lat, booth.lng]} radius={8} pathOptions={{ color: '#0d9488', fillColor: '#fff', fillOpacity: 1, weight: 3 }}><Tooltip permanent direction="top">{booth.short}</Tooltip></CircleMarker>
          <Polyline positions={[[booth.lat, booth.lng], [i.gps.lat, i.gps.lng]]} pathOptions={{ color: q.distanceKm > 1.5 ? '#e11d48' : '#94a3b8', dashArray: '4 6' }} />
          <CircleMarker center={[i.gps.lat, i.gps.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: q.distanceKm > 1.5 ? '#e11d48' : '#16a34a', fillOpacity: 1 }}><Tooltip direction="bottom">Interview</Tooltip></CircleMarker>
        </MapContainer>
      </div>

      <div>
        <div className="row tiny bold muted" style={{ marginBottom: 6 }}><AudioLines size={13} />RECORDING {showTranscript && <><Sparkles size={12} style={{ color: 'var(--indigo)' }} />AI TRANSCRIPT (TELUGU + ENGLISH)</>}</div>
        <AudioPlayer interview={i} transcript={showTranscript ? transcript : null} />
      </div>

      <details>
        <summary className="small bold" style={{ cursor: 'pointer' }}>All answers ({allQuestions(s.questionnaire).length} questions)</summary>
        <table className="t mt8">
          <tbody>
            {allQuestions(s.questionnaire).map((qq) => (
              <tr key={qq.id}><td className="small muted" style={{ width: '45%' }}>{qq.label.en}</td>
                <td className="small">{piiIds.includes(qq.id) ? <PII value={i.answers[qq.id]} kind={piiKind(s.questionnaire, qq.id)} interviewId={i.id} question={qq.id} /> : answerText(qq, i.answers[qq.id])}</td></tr>
            ))}
          </tbody>
        </table>
      </details>

      {s.can('live.alerts') && <>
      <div className="field"><label>Reviewer note</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called respondent, confirmed interview took place" /></div>
      <div className="row">
        <button className="btn success" onClick={() => decide('Accepted')}><CheckCircle2 size={15} />Accept</button>
        <button className="btn" style={{ borderColor: '#fcd34d', color: '#b45309' }} onClick={() => decide('Back-check')}><PhoneCall size={15} />Send for back-check</button>
        <button className="btn danger" onClick={() => decide('Rejected')}><XCircle size={15} />Reject</button>
      </div>
      </>}
    </div>
  );
}
