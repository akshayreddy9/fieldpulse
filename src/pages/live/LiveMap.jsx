import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { Map as MapIcon, Radio, Activity, AlertOctagon, Target, Clock } from 'lucide-react';
import { useStore } from '../../store.jsx';
import { PageHead, Card, Stat, Progress, Badge, Seg, fmtClock, StatusBadge } from '../../components/ui.jsx';
import { GEO, CONST_BY_ID, MANDAL_BY_ID, BOOTH_BY_ID, STATE } from '../../data/geo.js';
import { rollup, istDay, latestDay } from '../../lib/analytics.js';

const STATUS_COLOR = { Accepted: '#16a34a', Approved: '#16a34a', Flagged: '#e11d48', 'Back-check': '#f59e0b', Rejected: '#94a3b8' };

function Fit({ con }) {
  const map = useMap();
  useEffect(() => {
    const pts = GEO.booths.filter((b) => !con || b.constituencyId === con).map((b) => [b.lat, b.lng]);
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 12 });
  }, [con, map]);
  return null;
}

export default function LiveMap() {
  const s = useStore();
  const nav = useNavigate();
  const [con, setCon] = useState('');
  const [layer, setLayer] = useState('both');
  const [window_, setWindow] = useState('today');
  const today = latestDay(s.interviews);
  const shown = useMemo(() => s.interviews.filter((i) => (!con || i.constituencyId === con) && (window_ === 'all' || istDay(i.startedAt) === today)), [s.interviews, con, window_, today]);
  const ru = useMemo(() => rollup(s.valid, s.targets), [s.valid, s.targets]);
  const boothNodes = useMemo(() => Object.fromEntries(ru.children.flatMap((c) => c.children.flatMap((m) => m.children)).map((b) => [b.id, b])), [ru]);
  const feed = useMemo(() => [...s.interviews].sort((a, b) => b.syncedAt - a.syncedAt).slice(0, 14), [s.interviews]);
  const todayN = s.interviews.filter((i) => istDay(i.startedAt) === today);
  const flaggedToday = todayN.filter((i) => (s.quality[i.id]?.score || 0) >= 40).length;
  const activeSv = new Set(todayN.map((i) => i.surveyorId)).size;
  const slowest = Object.values(boothNodes).filter((b) => !con || b.id.startsWith(con)).sort((a, b) => a.pct - b.pct).slice(0, 8);

  return (
    <div>
      <PageHead eyebrow="Fieldwork" icon={MapIcon} title="Live map" desc="Every interview appears here the moment it syncs, coloured by its quality status. Booth rings show progress against quota.">
        <select className="select" style={{ width: 200 }} value={con} onChange={(e) => setCon(e.target.value)}><option value="">{STATE.name.en} (all)</option>{GEO.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}</select>
        {s.user.role === 'admin' && !(s.serverMode && !s.server?.demo) && <button className={`btn ${s.liveSim ? 'teal' : ''}`} onClick={() => s.update({ liveSim: !s.liveSim })}><Radio size={15} />{s.liveSim ? 'Demo feed on' : 'Demo feed'}</button>}
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Interviews today" value={todayN.length} icon={Activity} hint={new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} />
        <Stat label="Surveyors active today" value={activeSv} tone="blue" icon={Clock} hint={`of ${s.surveyors.filter((x) => x.role === 'Surveyor').length} in the field`} />
        <Stat label="Overall progress" value={`${ru.pct.toFixed(0)}%`} tone="green" icon={Target} hint={`${ru.n.toLocaleString('en-IN')} of ${ru.target.toLocaleString('en-IN')} interviews`} />
        <Stat label="Flagged today" value={flaggedToday} tone="red" icon={AlertOctagon} hint="Goes into tonight’s alert digest" />
      </div>
      <div className="grid g-2-1">
        <Card flush title="Map" right={<>
          <Seg value={window_} onChange={setWindow} options={[{ value: 'today', label: 'Today' }, { value: 'all', label: 'All days' }]} />
          <Seg value={layer} onChange={setLayer} options={[{ value: 'both', label: 'All' }, { value: 'int', label: 'Interviews' }, { value: 'booth', label: 'Booths' }]} />
        </>}>
          <div style={{ height: 520 }}>
            <MapContainer center={STATE.center} zoom={7} style={{ height: '100%' }} preferCanvas scrollWheelZoom>
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Fit con={con} />
              {layer !== 'booth' && shown.map((i) => {
                const st = s.statusOf(i.id);
                return (
                  <CircleMarker key={i.id} center={[i.gps.lat, i.gps.lng]} radius={i.live || i.fromFieldApp ? 7 : 4} pathOptions={{ color: '#fff', weight: 1, fillColor: STATUS_COLOR[st], fillOpacity: 0.9 }}>
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <b>{i.id}</b> <StatusBadge s={st} /><br />
                        {BOOTH_BY_ID[i.boothId]?.short}, {MANDAL_BY_ID[i.mandalId]?.name.en}<br />
                        {i.surveyorId} · {fmtClock(i.startedAt)} · {Math.round(i.durationSec / 60)} min<br />
                        {s.quality[i.id]?.flags.map((f) => <div key={f.id} style={{ color: '#be123c' }}>⚑ {f.detail}</div>)}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
              {layer !== 'int' && GEO.booths.filter((b) => !con || b.constituencyId === con).map((b) => {
                const n = boothNodes[b.id];
                const c = n.pct >= 90 ? '#16a34a' : n.pct >= 60 ? '#0d9488' : n.pct >= 35 ? '#f59e0b' : '#e11d48';
                return (
                  <CircleMarker key={b.id} center={[b.lat, b.lng]} radius={11} pathOptions={{ color: c, weight: 3, fillColor: '#fff', fillOpacity: 0.7 }}>
                    <Tooltip direction="top">{b.short} · {n.n}/{n.target} ({n.pct.toFixed(0)}%)</Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
          <div className="map-legend" style={{ padding: '10px 16px' }}>
            <span><i style={{ background: '#16a34a' }} />Accepted</span><span><i style={{ background: '#e11d48' }} />Flagged</span><span><i style={{ background: '#f59e0b' }} />Back-check</span><span><i style={{ background: '#94a3b8' }} />Rejected</span>
            <span><i style={{ background: '#fff', border: '3px solid #0d9488' }} />Booth (ring = progress)</span>
          </div>
        </Card>
        <Card flush title={<span className="row"><span className={`dot ${s.liveSim ? 'pulse' : ''}`} />Live feed</span>} sub="Latest synced interviews">
          <div className="scroll-y" style={{ maxHeight: 568 }}>
            {feed.map((i) => {
              const q = s.quality[i.id];
              return (
                <div key={i.id} className={`list-item live-feed-item ${s.can('live.alerts') ? 'click' : ''}`} onClick={() => s.can('live.alerts') && nav(`/live/alerts?id=${i.id}`)}>
                  <span className="dot" style={{ background: STATUS_COLOR[s.statusOf(i.id)], flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="small bold">{i.id} {i.fromFieldApp && <Badge tone="teal">field app</Badge>}</div>
                    <div className="tiny muted">{BOOTH_BY_ID[i.boothId]?.short}, {CONST_BY_ID[i.constituencyId]?.name.en} · {i.surveyorId}</div>
                    {q?.flags.length > 0 && <div className="tiny" style={{ color: 'var(--red)' }}>{q.flags.map((f) => f.detail).join(' · ')}</div>}
                  </div>
                  <span className="tiny muted">{fmtClock(i.syncedAt)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <div className="grid g2 mt16">
        <Card title="Progress by constituency">
          <div className="stack" style={{ gap: 12 }}>
            {ru.children.map((c) => (
              <div key={c.id}>
                <div className="row small"><b>{c.name.en}</b><div className="spacer" /><span className="num">{c.n} / {c.target}</span><Badge tone={c.pct >= 80 ? 'green' : c.pct >= 60 ? 'teal' : 'amber'}>{c.pct.toFixed(0)}%</Badge></div>
                <div className="mt8"><Progress value={c.pct} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Booths furthest behind" sub="Supervisors can redirect surveyors here today" flush>
          <table className="t">
            <thead><tr><th>Booth</th><th>Mandal</th><th>Progress</th><th className="num">Still needed</th></tr></thead>
            <tbody>{slowest.map((b) => (
              <tr key={b.id}><td className="bold">{b.short} <span className="tiny muted">{b.id}</span></td><td className="small">{MANDAL_BY_ID[BOOTH_BY_ID[b.id].mandalId].name.en}</td><td style={{ minWidth: 120 }}><Progress value={b.pct} sm /></td><td className="num bold">{Math.max(0, b.target - b.n)}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
