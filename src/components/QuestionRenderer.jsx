import React, { useState } from 'react';
import { Check, MapPin, Camera, Loader2 } from 'lucide-react';
import { GEO, MANDAL_BY_ID, BOOTH_BY_ID } from '../data/geo.js';

// Questions and answers are shown in Telugu and English together.
// Everything else on screen (buttons, hints, errors) is English.

function shrinkImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      const scale = 220 / Math.max(img.width, img.height);
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Telugu on top, English below (falls back to English only when there is no Telugu text)
export function Bi({ te, en, kind = 'opt' }) {
  return (
    <span className="txt">
      {te && <span className={`${kind}-te`}>{te}</span>}
      {(!te || en !== te) && <span className={te ? `${kind}-en` : `${kind}-te`} style={te ? undefined : { fontFamily: 'inherit' }}>{en}</span>}
    </span>
  );
}

const both = (x) => (x ? `${x.te ? `${x.te} · ` : ''}${x.en}` : '');

export default function QuestionRenderer({ q, value, onChange, other, onOther, allowedBooths, fallbackGps, index, realGps, allowDemoLocation }) {
  const [busy, setBusy] = useState(false);
  const [gpsErr, setGpsErr] = useState('');
  const opts = q.options || [];

  const header = (
    <div style={{ marginBottom: 8 }}>
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="q-num">{index !== undefined ? `Q${index + 1}` : 'Q'}</span>
        {q.required && <span className="tiny bold" style={{ color: 'var(--red)' }}>Required</span>}
        {q.type === 'multiple' && <span className="tiny muted">Choose {q.maxSelect ? `up to ${q.maxSelect}` : 'all that apply'}</span>}
      </div>
      {q.label.te && <div className="q-te">{q.label.te}</div>}
      <div className={q.label.te ? 'q-en' : 'q-te'} style={q.label.te ? undefined : { fontFamily: 'inherit' }}>{q.label.en}</div>
    </div>
  );

  if (q.type === 'single' || q.type === 'multiple') {
    const multi = q.type === 'multiple';
    const cur = multi ? value || [] : value;
    const toggle = (v) => {
      if (!multi) return onChange(v);
      const has = cur.includes(v);
      if (!has && q.maxSelect && cur.length >= q.maxSelect) return undefined;
      return onChange(has ? cur.filter((x) => x !== v) : [...cur, v]);
    };
    const all = [...opts, ...(q.allowOther ? [{ v: 'OTHER', en: 'Other (please specify)', te: 'ఇతర' }] : [])];
    const isOn = (v) => (multi ? cur.includes(v) : cur === v);
    return (
      <div className="fa-card">
        {header}
        {all.map((o) => (
          <button type="button" key={o.v} className={`fa-opt ${multi ? 'multi' : ''} ${isOn(o.v) ? 'on' : ''}`} onClick={() => toggle(o.v)}>
            <span className="box">{isOn(o.v) && <Check size={13} color="#fff" strokeWidth={3} />}</span>
            <Bi te={o.te} en={o.en} />
          </button>
        ))}
        {isOn('OTHER') && <input className="input mt8" placeholder="Please specify" value={other || ''} onChange={(e) => onOther && onOther(e.target.value)} />}
      </div>
    );
  }

  if (q.type === 'grid') {
    const cur = value || {};
    return (
      <div className="fa-card">
        {header}
        <table className="grid-q">
          <thead><tr><th />{q.cols.map((c) => <th key={c.v}><Bi te={c.te} en={c.en} /></th>)}</tr></thead>
          <tbody>
            {q.rows.map((r) => (
              <tr key={r.v}>
                <td><Bi te={r.te} en={r.en} /></td>
                {q.cols.map((c) => (
                  <td key={c.v}><input type="radio" name={`${q.id}-${r.v}`} checked={cur[r.v] === c.v} onChange={() => onChange({ ...cur, [r.v]: c.v })} aria-label={`${r.en}: ${c.en}`} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (q.type === 'cascade') {
    const cur = value || {};
    const cons = GEO.constituencies.filter((c) => !allowedBooths || allowedBooths.some((b) => BOOTH_BY_ID[b]?.constituencyId === c.id));
    const mans = cur.constituency ? GEO.mandals.filter((m) => m.constituencyId === cur.constituency && (!allowedBooths || allowedBooths.some((b) => BOOTH_BY_ID[b]?.mandalId === m.id))) : [];
    const booths = cur.mandal ? (MANDAL_BY_ID[cur.mandal]?.boothIds || []).filter((b) => !allowedBooths || allowedBooths.includes(b)) : [];
    return (
      <div className="fa-card">
        {header}
        <div className="stack" style={{ gap: 8 }}>
          <div className="field"><label>Constituency</label>
            <select className="select" value={cur.constituency || ''} onChange={(e) => onChange({ constituency: e.target.value })}>
              <option value="">Select…</option>{cons.map((c) => <option key={c.id} value={c.id}>{both(c.name)}</option>)}
            </select></div>
          <div className="field"><label>Mandal</label>
            <select className="select" value={cur.mandal || ''} disabled={!cur.constituency} onChange={(e) => onChange({ constituency: cur.constituency, mandal: e.target.value })}>
              <option value="">Select…</option>{mans.map((m) => <option key={m.id} value={m.id}>{both(m.name)}</option>)}
            </select></div>
          <div className="field"><label>Polling booth</label>
            <select className="select" value={cur.booth || ''} disabled={!cur.mandal} onChange={(e) => onChange({ ...cur, booth: e.target.value })}>
              <option value="">Select…</option>{booths.map((b) => <option key={b} value={b}>{BOOTH_BY_ID[b]?.name.en}</option>)}
            </select></div>
        </div>
      </div>
    );
  }

  if (q.type === 'gps') {
    const done = (pos) => { setBusy(false); onChange(pos); };
    const fake = () => {
      const f = fallbackGps || { lat: 17.385, lng: 78.4867 };
      done({ lat: f.lat + (Math.random() - 0.5) * 0.003, lng: f.lng + (Math.random() - 0.5) * 0.003, acc: Math.round(6 + Math.random() * 10), simulated: true, at: Date.now() });
    };
    const capture = () => {
      setBusy(true);
      setGpsErr('');
      if (realGps) {
        // Real fieldwork: the phone's own GPS, never a made-up location.
        if (!navigator.geolocation) { setBusy(false); setGpsErr('This phone has no GPS available.'); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), at: Date.now() }),
          (e) => { setBusy(false); setGpsErr(e.code === 1 ? 'Location permission is off. Allow location for MSR Pulse in the phone settings, then try again.' : 'Could not get a GPS fix. Move to open sky and try again.'); },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        );
        return;
      }
      // Demo mode: interviews are placed at the assigned booth so the quality checks stay realistic.
      setTimeout(fake, 900);
    };
    return (
      <div className="fa-card">
        {header}
        {value ? (
          <div className="callout teal" style={{ alignItems: 'center' }}><MapPin size={16} /><div className="small"><b>{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</b><br />Accuracy ±{value.acc} m · captured {new Date(value.at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></div>
        ) : null}
        {gpsErr && <div className="callout red small mt8"><div>{gpsErr}{allowDemoLocation && <div className="mt8"><button type="button" className="btn ghost sm" onClick={() => { setGpsErr(''); setBusy(true); setTimeout(fake, 300); }}>Use booth location (demo only)</button></div>}</div></div>}
        {value?.simulated && <div className="small muted mt8">Demo location near the booth - not a real GPS reading.</div>}
        <button type="button" className="btn block mt8" style={{ height: 44 }} onClick={capture} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <MapPin size={15} />}{busy ? 'Finding location…' : value ? 'Capture again' : 'Capture location'}
        </button>
      </div>
    );
  }

  if (q.type === 'photo') {
    return (
      <div className="fa-card">
        {header}
        {value && typeof value === 'string' && <img src={value} alt="Captured" style={{ width: '100%', borderRadius: 10, marginBottom: 8 }} />}
        {value === true && <div className="callout teal small">Photo attached</div>}
        <label className="btn block mt8" style={{ cursor: 'pointer', height: 44 }}>
          <Camera size={15} />{value ? 'Retake photo' : 'Take photo'}
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange((await shrinkImage(f)) || true); }} />
        </label>
      </div>
    );
  }

  const inputType = q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text';
  return (
    <div className="fa-card">
      {header}
      <input className="input" style={{ height: 46, fontSize: 16 }} type={inputType} inputMode={q.type === 'number' ? 'numeric' : q.inputMode} min={q.min} max={q.max}
        placeholder={q.type === 'number' ? `${q.min ?? ''}${q.max !== undefined ? ` – ${q.max}` : ''}` : 'Type the answer'}
        value={value ?? ''} onChange={(e) => onChange(q.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
    </div>
  );
}

export function validateAnswer(q, v) {
  const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  if (q.type === 'cascade') return v && v.booth ? null : 'Select constituency, mandal and booth';
  if (q.type === 'grid') return q.required && Object.keys(v || {}).length < q.rows.length ? 'Answer every row' : null;
  if (q.required && empty) return 'This question is required';
  if (q.type === 'number' && !empty && ((q.min !== undefined && v < q.min) || (q.max !== undefined && v > q.max))) return `Enter a number between ${q.min} and ${q.max}`;
  return null;
}
