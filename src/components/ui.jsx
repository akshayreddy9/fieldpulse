import React, { useEffect, useState } from 'react';
import { X, Eye, Lock, CheckCircle2, AlertTriangle, Info, Radio } from 'lucide-react';
import { useStore } from '../store.jsx';
import { codeFor, maskPhone } from '../lib/privacy.js';

export function PageHead({ eyebrow, icon: Icon, title, desc, children }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{Icon && <Icon size={13} />}{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Card({ title, sub, right, children, flush, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || right) && (
        <div className="card-h">
          <div style={{ minWidth: 0 }}>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right && <div className="right">{right}</div>}
        </div>
      )}
      <div className={`card-b ${flush ? 'flush' : ''}`}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, delta, deltaUp, icon: Icon, tone = 'teal', hint }) {
  const tones = { teal: ['#e6f7f5', '#0d9488'], indigo: ['#eef0ff', '#4f46e5'], amber: ['#fff6e5', '#d97706'], red: ['#ffeef2', '#e11d48'], blue: ['#edf3ff', '#2563eb'], green: ['#eafaf0', '#16a34a'] };
  const [bg, fg] = tones[tone];
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && <div className={`delta ${deltaUp === undefined ? 'muted' : deltaUp ? 'up' : 'down'}`}>{delta}</div>}
      {hint && <div className="tiny muted">{hint}</div>}
      {Icon && <div className="icon" style={{ background: bg, color: fg }}><Icon size={18} /></div>}
    </div>
  );
}

export function Badge({ children, tone = '', className = '' }) {
  return <span className={`badge ${tone} ${className}`}>{children}</span>;
}

export function Progress({ value, tone, sm }) {
  const t = tone || (value >= 90 ? 'green' : value >= 60 ? '' : value >= 35 ? 'amber' : 'red');
  return <div className={`prog ${t} ${sm ? 'sm' : ''}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Modal({ title, onClose, children, footer, wide, icon: Icon }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-h">
          {Icon && <Icon size={18} className="muted" />}
          <h3>{title}</h3>
          <div className="spacer" />
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.icon && <t.icon size={14} />}{t.label}{t.count !== undefined && <Badge tone={value === t.key ? 'teal' : ''}>{t.count}</Badge>}
        </button>
      ))}
    </div>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <label className="check" style={{ gap: 10 }}>
      <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info, live: Radio };
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const I = icons[t.kind] || Info;
        return <div key={t.id} className={`toast ${t.kind}`}><I size={16} style={{ flexShrink: 0 }} />{t.msg}</div>;
      })}
    </div>
  );
}

const REASONS = ['Back-check call to respondent', 'Respondent asked for their data (DPDP request)', 'Investigating suspected fake interview', 'Client contractual requirement', 'Other'];

// Personal details: shown as codes when the privacy lock is on. Revealing needs a reason and is logged.
// question: the questionnaire question this value comes from (so any personal-detail question can be revealed)
export function PII({ value, kind = 'name', interviewId, question }) {
  const { privacyLock, can, toast, revealPii } = useStore();
  const [shown, setShown] = useState(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!shown) return undefined;
    const id = setTimeout(() => setShown(null), 30000);
    return () => clearTimeout(id);
  }, [shown]);
  if (!value) return <span className="faint">—</span>;
  const isCode = /^(R|PH)-[0-9A-Z]{6}$/.test(value);
  if (!privacyLock && !isCode) return <span>{value}</span>;
  if (shown) return <span className="pii"><span className="revealed">{shown}</span><span className="tiny faint">auto-hides in 30s</span></span>;
  const confirm = async () => {
    try {
      const real = await revealPii(interviewId, kind, reason === 'Other' ? note || 'Other' : reason, value, question);
      setAsking(false);
      setShown(real || '—');
      toast('Access recorded in the privacy log', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <span className="pii">
      <span className="code" title={kind === 'phone' && !isCode ? maskPhone(value) : 'Hidden by privacy lock'}>{isCode ? value : codeFor(value, kind)}</span>
      {can('pii.reveal') ? (
        <button className="btn ghost sm icon" style={{ width: 26, height: 26 }} title="Reveal (reason required)" onClick={(e) => { e.stopPropagation(); setAsking(true); }}><Eye size={14} /></button>
      ) : <Lock size={13} className="faint" />}
      {asking && (
        <Modal title="Reveal personal detail" icon={Lock} onClose={() => setAsking(false)}
          footer={<><button className="btn" onClick={() => setAsking(false)}>Cancel</button><button className="btn primary" onClick={confirm} disabled={reason === 'Other' && !note.trim()}>Reveal for 30 seconds</button></>}>
          <div className="callout amber"><Lock size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div>Extra privacy lock is on. Seeing the real {kind === 'phone' ? 'mobile number' : 'name'} for <b>{interviewId}</b> needs a reason. Your name, the time and the reason are recorded permanently in the privacy access log.</div></div>
          <div className="field mt16"><label>Reason</label>
            <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          {reason === 'Other' && <div className="field mt12"><label>Describe the reason</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} autoFocus /></div>}
        </Modal>
      )}
    </span>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={32} className="faint" />}
      <div className="bold mt8" style={{ color: 'var(--ink-2)' }}>{title}</div>
      <div className="small mt8">{children}</div>
    </div>
  );
}

export function Risk({ q }) {
  if (!q) return null;
  return <span className={`risk ${q.risk}`}>{q.score}</span>;
}

export function StatusBadge({ s }) {
  const tone = { Accepted: 'green', Approved: 'green', Flagged: 'red', 'Back-check': 'amber', Rejected: '' }[s] || '';
  return <Badge tone={tone}>{s}</Badge>;
}

export const fmtTime = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const fmtClock = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const initials = (n) => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
