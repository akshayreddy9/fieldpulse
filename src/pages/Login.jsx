import React, { useRef, useState } from 'react';
import { ShieldCheck, Smartphone, ArrowRight, MessageSquareText, UserCog, Radar, LineChart, Building2, Footprints, Server, Download } from 'lucide-react';
import { useStore, ROLES } from '../store.jsx';
import { API_BASE, connectServer, forgetServer } from '../lib/api.js';

function ServerLink({ serverMode }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(API_BASE || 'http://');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [stagePw, setStagePw] = useState('');
  const [needStage, setNeedStage] = useState(false);
  const connect = async () => {
    setBusy(true); setErr('');
    try { await connectServer(url, stagePw); window.location.reload(); } catch (e) { setErr(e.message); setNeedStage(!!e.needStage); setBusy(false); }
  };
  if (serverMode && API_BASE) {
    return <div className="tiny muted mt16 row" style={{ justifyContent: 'center' }}><Server size={12} />Server: {API_BASE} · <button className="btn ghost sm" onClick={() => { forgetServer(); window.location.reload(); }}>Change</button></div>;
  }
  if (serverMode) return null;
  return (
    <div className="mt16">
      {!open ? <button className="btn ghost block" onClick={() => setOpen(true)}><Server size={15} />Connect to an MSR Pulse server</button> : (
        <div className="card" style={{ padding: 14, boxShadow: 'none' }}>
          <div className="field"><label>Server address (ask your supervisor)</label>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://….trycloudflare.com" /></div>
          {needStage && <div className="field mt12"><label>Test-site password</label><input className="input" type="password" value={stagePw} onChange={(e) => setStagePw(e.target.value)} autoFocus /></div>}
          {err && <div className="small mt8" style={{ color: 'var(--red)' }}>{err}</div>}
          <button className="btn teal block mt12" disabled={busy} onClick={connect}>{busy ? 'Checking…' : 'Connect'}</button>
        </div>
      )}
    </div>
  );
}

const ROLE_ICONS = { admin: UserCog, supervisor: Radar, analyst: LineChart, surveyor: Footprints, client: Building2 };
const ROLE_DOES = {
  admin: 'Sets up surveys, teams and settings. Sees everything.',
  supervisor: 'Watches fieldwork live and reviews suspicious interviews.',
  analyst: 'Studies the results and prepares the client report.',
  surveyor: 'Does interviews on the phone, even without internet.',
  client: 'Sees the approved report and key results.',
};
const DEMO_OTP = '482913';
const DEMO_PHONES = { admin: '98480 12345', supervisor: '98480 12346', analyst: '98480 12347', surveyor: '98480 12348', client: '98480 12349' };

export default function Login() {
  const { update, serverMode, requestCode, verifyCode, server } = useStore();
  const [devCode, setDevCode] = useState(DEMO_OTP);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [showDemo, setShowDemo] = useState(false);
  // Demo accounts are offered only on demo/test sites, never in production
  const demoAvailable = !serverMode || (!!server?.demo && server?.sample !== false);
  const [stage, setStage] = useState('pick');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState('');
  const refs = useRef([]);

  const setDigit = (k, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[k] = d;
    setOtp(next);
    setErr('');
    if (d && k < 5) refs.current[k + 1]?.focus();
  };
  const verify = async (code = otp.join('')) => {
    if (serverMode) {
      setBusy(true);
      try { await verifyCode(phone, code); } catch (e) { setErr(e.message); setBusy(false); }
      return;
    }
    if (code !== DEMO_OTP) { setErr('That code is not right. For the demo use 482913.'); return; }
    update({ user: { role, name: ROLES[role].who, ...(role === 'surveyor' ? { surveyorId: 'SV-001' } : {}) } });
  };
  const send = async (num = phone, demoRole = role) => {
    setErr('');
    if (serverMode) {
      setBusy(true);
      try { const r = await requestCode(num); setDevCode(r.devCode || ''); } catch (e) { setBusy(false); setErr(e.message); return; }
      setBusy(false);
    } else {
      // Offline demo (no server): the number must be one of the demo accounts
      const digits = num.replace(/\D/g, '').slice(-10);
      const k = Object.keys(DEMO_PHONES).find((x) => DEMO_PHONES[x].replace(/\D/g, '') === digits) || demoRole;
      if (!k) { setErr('This offline demo has no real accounts. Use one of the demo accounts below.'); setShowDemo(true); return; }
      setRole(k);
    }
    setStage('otp');
    setTimeout(() => refs.current[0]?.focus(), 50);
  };
  const demoSignIn = (k) => { setPhone(DEMO_PHONES[k]); setRole(k); send(DEMO_PHONES[k], k); };

  return (
    <div className="login">
      <div className="login-art">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark" style={{ width: 44, height: 44 }}>
            <svg width="26" height="26" viewBox="0 0 64 64"><path d="M6 34h12l5-12 8 24 6-16 4 4h17" fill="none" stroke="#5eead4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>MSR Pulse</div>
            <div style={{ color: '#89a0bb', fontSize: 12 }}>Micro Studies and Research Organisation</div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 40 }}>
          <h1>One system for the whole survey.<br /><span style={{ color: '#5eead4' }}>From questionnaire to client report.</span></h1>
          <p style={{ color: '#a9bad0', fontSize: 15, maxWidth: 520, marginTop: 14 }}>Build bilingual questionnaires, collect interviews offline with consent and GPS, catch fake interviews the same evening, and send AI-assisted reports.</p>
          <div className="flow">
            {[
              ['1', 'Set up', 'Questionnaire in Telugu & English, booth targets, team'],
              ['2', 'Interview', 'Android & iPhone app · offline · consent, recording, GPS'],
              ['3', 'Check live', 'Live map, booth progress, fake-interview alerts'],
              ['4', 'Results', 'Totals from booth up to state, comparisons, Excel'],
              ['5', 'Report', 'AI first draft + MSR advice → PDF to client'],
            ].map(([n, t, d]) => (
              <div key={n}><span className="n">{n}</span><div><div style={{ color: '#fff', fontWeight: 700 }}>{t}</div><div style={{ fontSize: 12.5, color: '#9fb2c9' }}>{d}</div></div></div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 32, fontSize: 12, color: '#6f86a3' }} className="row"><ShieldCheck size={14} /> {server?.sample || !serverMode ? 'Test site with sample data · real data will be kept in MSR’s own AWS account in India' : 'Hosted in MSR’s own AWS account in India · MSR owns all data & code'}</div>
      </div>

      <div className="login-form">
        <div className="box">
          {stage === 'pick' && (
            <>
              {server?.unreachable && (
                <div className="callout amber" style={{ marginBottom: 16 }}>
                  <div>
                    <b>Can't reach the MSR Pulse server.</b> Check the phone's internet connection. The app keeps trying by itself.
                    <div className="row mt8">
                      <button className="btn sm" onClick={() => window.location.reload()}>Try again now</button>
                      <button className="btn ghost sm" onClick={() => { forgetServer(); window.location.reload(); }}>Change server</button>
                    </div>
                  </div>
                </div>
              )}
              <h2 style={{ fontSize: 24, fontWeight: 800 }}>Sign in</h2>
              <p className="muted" style={{ marginTop: 4 }}>Enter your registered mobile number. We will send you a 6-digit code by SMS.</p>
              <form onSubmit={(e) => { e.preventDefault(); send(); }}>
                <div className="field mt16">
                  <label>Mobile number</label>
                  <div className="row nowrap">
                    <span className="input" style={{ width: 64, height: 50, display: 'grid', placeItems: 'center', background: '#f8fafc', fontWeight: 600 }}>+91</span>
                    <input className="input" style={{ height: 50, fontSize: 18, letterSpacing: '.04em' }} value={phone} onChange={(e) => { setPhone(e.target.value); setErr(''); }} inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" autoFocus />
                  </div>
                </div>
                {err && <div className="small mt8" style={{ color: 'var(--red)' }}>{err}</div>}
                <button type="submit" className="btn primary lg block mt16" style={{ height: 50 }} disabled={busy || phone.replace(/\D/g, '').length < 10}>
                  <MessageSquareText size={16} /> Send code
                </button>
              </form>
              <div className="tiny muted mt12" style={{ textAlign: 'center' }}>You will see only what your role needs. Not registered? Ask your MSR coordinator.</div>
              {demoAvailable && (
                <div className="mt16" style={{ borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
                  <button className="btn ghost sm block" onClick={() => setShowDemo(!showDemo)}>{showDemo ? 'Hide demo accounts' : 'Try a demo account (test site only)'}</button>
                  {showDemo && (
                    <div className="stack mt8" style={{ gap: 6 }}>
                      {Object.entries(ROLES).map(([k, r]) => {
                        const I = ROLE_ICONS[k];
                        return (
                          <button key={k} className="role-choice" style={{ '--rc': '#0d9488', '--rc-soft': '#e6f7f5', padding: '8px 12px' }} onClick={() => demoSignIn(k)}>
                            <div className="ic" style={{ width: 34, height: 34 }}><I size={16} /></div>
                            <div style={{ minWidth: 0, flex: 1 }}><div className="bold small">{r.label}</div><div className="tiny muted">{ROLE_DOES[k]}</div></div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <ServerLink serverMode={serverMode} />
              {server?.apk && !window.Capacitor && /Android/i.test(navigator.userAgent) && (
                <a className="btn block mt12" href={`${API_BASE}/download/MSR-Pulse.apk`} style={{ borderColor: '#86efac', color: '#15803d' }}><Download size={15} />Download the Android app</a>
              )}
            </>
          )}
          {stage === 'otp' && (
            <>
              <button className="btn ghost sm" onClick={() => setStage('pick')} style={{ marginLeft: -10 }}>← Back</button>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>Enter the 6-digit code</h2>
              <p className="muted" style={{ marginTop: 4 }}>Sent by SMS to +91 {phone}</p>
              {devCode ? <div className="callout blue mt16"><Smartphone size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div><b>Demo SMS:</b> “Your MSR Pulse login code is {devCode}. It expires in 5 minutes.”</div></div>
                : <div className="callout teal mt16"><Smartphone size={16} style={{ flexShrink: 0, marginTop: 2 }} /><div>If this number is registered with MSR Pulse, a code has been sent by SMS.</div></div>}
              <div className="otp mt16">
                {otp.map((d, k) => (
                  <input key={k} ref={(el) => { refs.current[k] = el; }} value={d} inputMode="numeric" autoComplete="one-time-code"
                    onChange={(e) => setDigit(k, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Backspace' && !d && k > 0) refs.current[k - 1]?.focus(); if (e.key === 'Enter') verify(); }} />
                ))}
              </div>
              {err && <div className="small mt8" style={{ color: 'var(--red)' }}>{err}</div>}
              <button className="btn primary lg block mt16" disabled={busy} onClick={() => verify()}>Verify & continue <ArrowRight size={16} /></button>
              {devCode && <button className="btn ghost block mt8" onClick={() => { setOtp(devCode.split('')); verify(devCode); }}>Use demo code</button>}
            </>
          )}
          <p className="tiny faint mt24" style={{ textAlign: 'center' }}>{serverMode ? `Connected to MSR Pulse server${server?.demo ? ' · demo data' : ''}` : 'Standalone demo · sample data only · no real respondents'}</p>
        </div>
      </div>
    </div>
  );
}
