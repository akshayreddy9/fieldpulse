import React, { useMemo, useState } from 'react';
import { AppUpdateBanner } from './AppVersion.jsx';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileEdit, Target, Users, ShieldCheck, Smartphone, Map, AlertOctagon, MoonStar, BarChart3, Network,
  GitCompareArrows, Sparkles, FileText, Building2, Lock, AudioLines, DatabaseZap, Plug, Scale, CalendarCheck2, Menu, LogOut,
  Radio, RotateCcw, Sun, LineChart, Wifi, WifiOff, CloudUpload, ClipboardList, MapPinned,
} from 'lucide-react';
import { useStore, ROLES } from '../store.jsx';
import { Toasts, initials } from './ui.jsx';

// Home screen label per login
const HOME = {
  admin: { label: 'Dashboard', icon: LayoutDashboard },
  supervisor: { label: 'Today', icon: Sun },
  analyst: { label: 'Overview', icon: LineChart },
};

// Menu groups in plain English. Each item only appears if the user's role allows it.
export const NAV = [
  { title: 'Set up', items: [
    { to: '/admin/surveys', mod: 'admin.access', label: 'Surveys', icon: ClipboardList, adminOnly: true },
    { to: '/admin/builder', mod: 'admin.builder', label: 'Questionnaire', icon: FileEdit },
    { to: '/admin/booths', mod: 'admin.access', label: 'Booth list', icon: MapPinned, adminOnly: true },
    { to: '/admin/targets', mod: 'admin.targets', label: 'Booth targets', icon: Target },
    { to: '/admin/team', mod: 'admin.team', label: 'Team & people', icon: Users },
    { to: '/admin/access', mod: 'admin.access', label: 'Who can see what', icon: ShieldCheck },
  ] },
  { title: 'Fieldwork', items: [
    { to: '/live', mod: 'live.map', label: 'Live map', icon: Map },
    { to: '/live/alerts', mod: 'live.alerts', label: 'Alerts to review', icon: AlertOctagon, badge: 'alerts' },
    { to: '/live/digest', mod: 'live.digest', label: 'Evening summary', icon: MoonStar },
    { to: '/addons/checker', mod: 'addons.checker', label: 'Recording checker', icon: AudioLines },
    { to: '/field', mod: 'field', label: 'Field app preview', icon: Smartphone, adminOnly: true },
  ] },
  { title: 'Results & reports', items: [
    { to: '/insights/results', mod: 'insights.results', label: 'Results', icon: BarChart3 },
    { to: '/insights/rollup', mod: 'insights.rollup', label: 'Booth → state totals', icon: Network },
    { to: '/insights/compare', mod: 'insights.compare', label: 'Compare & trends', icon: GitCompareArrows },
    { to: '/insights/ask', mod: 'insights.ask', label: 'Ask the data', icon: Sparkles },
    { to: '/insights/report', mod: 'insights.reports', label: 'Client report', icon: FileText },
    { to: '/client', mod: 'client.portal', label: 'Client view', icon: Building2 },
  ] },
  { title: 'Add-ons', items: [
    { to: '/addons/privacy', mod: 'addons.privacy', label: 'Privacy lock', icon: Lock },
    { to: '/addons/import', mod: 'addons.import', label: 'GoSurvey import', icon: DatabaseZap },
    { to: '/addons/api', mod: 'addons.api', label: 'Connect other software', icon: Plug },
  ] },
  { title: 'Settings', items: [
    { to: '/settings/compliance', mod: 'settings.compliance', label: 'Security & DPDP', icon: Scale },
    { to: '/settings/delivery', mod: 'settings.delivery', label: 'Delivery & support', icon: CalendarCheck2 },
  ] },
];

// Pages that work without any survey (setting up a brand-new installation)
const NO_SURVEY_OK = ['/admin/surveys', '/admin/access', '/admin/team', '/settings/compliance', '/settings/delivery', '/addons/privacy', '/addons/api'];
function NoSurvey() {
  const s = useStore();
  const nav = useNavigate();
  const admin = s.user.role === 'admin';
  return (
    <div className="welcome" style={{ maxWidth: 760 }}>
      <h2>Welcome to MSR Pulse</h2>
      <p>{admin ? 'There are no surveys yet. Start by adding your team and clients, then create the first survey.' : 'There is no survey yet. Your MSR admin will create one.'}</p>
      {admin && <div className="row mt16">
        <button className="btn" style={{ background: '#fff' }} onClick={() => nav('/admin/access')}>1 · Add staff & client logins</button>
        <button className="btn" style={{ background: '#fff' }} onClick={() => nav('/admin/team')}>2 · Upload surveyors</button>
        <button className="btn" style={{ background: '#fff' }} onClick={() => nav('/admin/surveys')}>3 · Create the first survey</button>
      </div>}
    </div>
  );
}

function SurveyStatus() {
  const s = useStore();
  const st = (s.surveys.find((x) => x.id === s.surveyId) || {}).status || 'Live';
  if (st === 'Live') return <span className="badge green hide-sm"><span className="dot pulse" /> Fieldwork live</span>;
  return <span className={`badge ${st === 'Draft' ? 'amber' : ''} hide-sm`}>{st === 'Draft' ? 'Draft · not started' : 'Closed'}</span>;
}

const Mark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64"><path d="M6 34h12l5-12 8 24 6-16 4 4h17" fill="none" stroke="#5eead4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function Layout({ children }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const pending = useMemo(() => s.interviews.filter((i) => s.statusOf(i.id) === 'Flagged').length, [s.interviews, s.statusOf]);
  const role = ROLES[s.user.role];
  const home = HOME[s.user.role] || HOME.admin;
  const isAdmin = s.user.role === 'admin';
  const demo = !(s.serverMode && !s.server?.demo);

  React.useEffect(() => { setOpen(false); }, [loc.pathname]);
  const signOut = () => { s.logout(); nav('/'); };

  return (
    <div className="app" data-role={s.user.role}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Mark /></div>
          <div>
            <div className="brand-name">MSR Pulse</div>
            <div className="brand-sub">Micro Studies and Research</div>
          </div>
        </div>
        <div className="role-card">
          <div className="avatar">{initials(s.user.name)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="who">{s.user.name}</div>
            <span className="role-pill">{role.label}</span>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-group" style={{ marginTop: 4 }}>
            <NavLink to="/" end><home.icon size={16} />{home.label}</NavLink>
          </div>
          {NAV.map((g) => {
            const items = g.items.filter((it) => s.can(it.mod) && (!it.adminOnly || isAdmin));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={g.title}>
                <div className="nav-title">{g.title}</div>
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === '/live'}>
                    <it.icon size={16} />{it.label}
                    {it.badge === 'alerts' && pending > 0 && <span className="count">{pending}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span className={`dot ${s.serverMode ? 'pulse' : ''}`} style={{ background: s.serverMode ? undefined : '#f59e0b' }} />
          <span>{s.serverMode ? 'Online' : 'Demo (this browser)'}</span>
          <button className="btn ghost sm signout" onClick={signOut}><LogOut size={14} />Sign out</button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn icon ghost menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={18} /></button>
          <div className="survey-pick">
            {s.serverMode && s.surveys.length > 1 ? (
              <select className="select survey-select" value={s.surveyId || ''} onChange={(e) => s.selectSurvey(e.target.value)} title="Switch survey">
                {s.surveys.map((x) => <option key={x.id} value={x.id}>{x.title}{x.clientName ? ` · ${x.clientName}` : ''}</option>)}
              </select>
            ) : <span className="t">{s.questionnaire.title.en}</span>}
            <SurveyStatus />
          </div>
          <div className="grow" />
          {isAdmin && demo && (
            <button className={`btn sm ${s.liveSim ? 'teal' : ''}`} onClick={() => { s.update({ liveSim: !s.liveSim }); s.toast(s.liveSim ? 'Demo feed paused' : 'Demo feed on: sample interviews will stream in', 'info'); }} title="Demo only: simulate interviews arriving from the field">
              <Radio size={14} /><span className="hide-sm">{s.liveSim ? 'Demo feed on' : 'Demo feed'}</span>
            </button>
          )}
          {s.privacyLock && (isAdmin || s.user.role === 'supervisor') && <span className="badge amber hide-sm" title="Names and phone numbers are hidden"><Lock size={11} />Privacy lock on</span>}
          {isAdmin && <button className="btn ghost icon sm hide-sm" title="Reset to the sample survey" onClick={() => window.confirm(s.serverMode ? 'Reset ALL data on the server back to the sample survey? This affects every user.' : 'Reset all demo changes?') && s.reset()}><RotateCcw size={15} /></button>}
          <button className="btn ghost icon sm menu-btn" title="Sign out" onClick={signOut}><LogOut size={16} /></button>
        </header>
        <AppUpdateBanner />
        <main className="content">{s.serverMode && !s.surveyId && !NO_SURVEY_OK.includes(loc.pathname) ? <NoSurvey /> : children}</main>
      </div>
      <Toasts />
    </div>
  );
}

// ---------- Surveyor: a simple phone app ----------
export function SurveyorShell({ children }) {
  const s = useStore();
  const nav = useNavigate();
  return (
    <div className="shell surveyor" data-role="surveyor">
      <header className="shell-bar">
        <div className="brand-mark" style={{ display: 'grid', placeItems: 'center' }}><Mark size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">MSR Pulse Field</div>
          <div className="sub">{s.questionnaire.title.en}</div>
        </div>
        {s.outbox.length > 0 && <span className="net-pill off"><CloudUpload size={12} />{s.outbox.length}</span>}
        <span className={`net-pill ${s.deviceOnline ? '' : 'off'}`}>{s.deviceOnline ? <Wifi size={12} /> : <WifiOff size={12} />}{s.deviceOnline ? 'Online' : 'Offline'}</span>
        <button className="btn icon sm" title="Sign out" onClick={() => { if (!s.outbox.length || window.confirm(`${s.outbox.length} interview(s) are still waiting to send. They stay saved on this phone. Sign out anyway?`)) { s.logout(); nav('/'); } }}><LogOut size={16} /></button>
      </header>
      <AppUpdateBanner />
      <div className="shell-body">{children}</div>
      <Toasts />
    </div>
  );
}

// ---------- Client: their own simple portal ----------
export function ClientShell({ children }) {
  const s = useStore();
  const nav = useNavigate();
  return (
    <div className="shell client" data-role="client">
      <header className="shell-bar">
        <div className="brand-mark" style={{ display: 'grid', placeItems: 'center' }}><Mark size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{s.user.name}</div>
          <div className="sub">Survey results from Micro Studies and Research</div>
        </div>
        <button className="btn sm" onClick={() => { s.logout(); nav('/'); }}><LogOut size={14} /><span className="hide-sm">Sign out</span></button>
      </header>
      {children}
      <Toasts />
    </div>
  );
}
