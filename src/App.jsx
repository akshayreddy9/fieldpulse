import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useStore } from './store.jsx';
import Layout, { SurveyorShell, ClientShell } from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import { Empty } from './components/ui.jsx';

const Overview = lazy(() => import('./pages/Overview.jsx'));
const SupervisorHome = lazy(() => import('./pages/homes/SupervisorHome.jsx'));
const AnalystHome = lazy(() => import('./pages/homes/AnalystHome.jsx'));
const Builder = lazy(() => import('./pages/admin/Builder.jsx'));
const Surveys = lazy(() => import('./pages/admin/Surveys.jsx'));
const Targets = lazy(() => import('./pages/admin/Targets.jsx'));
const Team = lazy(() => import('./pages/admin/Team.jsx'));
const Access = lazy(() => import('./pages/admin/Access.jsx'));
const FieldApp = lazy(() => import('./pages/field/FieldApp.jsx'));
const LiveMap = lazy(() => import('./pages/live/LiveMap.jsx'));
const Alerts = lazy(() => import('./pages/live/Alerts.jsx'));
const Digest = lazy(() => import('./pages/live/Digest.jsx'));
const Results = lazy(() => import('./pages/insights/Results.jsx'));
const Rollup = lazy(() => import('./pages/insights/Rollup.jsx'));
const Compare = lazy(() => import('./pages/insights/Compare.jsx'));
const Ask = lazy(() => import('./pages/insights/Ask.jsx'));
const Report = lazy(() => import('./pages/insights/Report.jsx'));
const ClientPortal = lazy(() => import('./pages/ClientPortal.jsx'));
const Privacy = lazy(() => import('./pages/addons/Privacy.jsx'));
const Checker = lazy(() => import('./pages/addons/Checker.jsx'));
const Import = lazy(() => import('./pages/addons/Import.jsx'));
const Api = lazy(() => import('./pages/addons/Api.jsx'));
const Compliance = lazy(() => import('./pages/settings/Compliance.jsx'));
const Delivery = lazy(() => import('./pages/settings/Delivery.jsx'));

function Guard({ mod, children }) {
  const { can } = useStore();
  if (!can(mod)) return <Empty icon={ShieldOff} title="You don’t have access to this module">Your role does not include this screen. An MSR admin can change this under Access control.</Empty>;
  return children;
}

const ROUTES = [
  ['/admin/builder', 'admin.builder', Builder], ['/admin/surveys', 'admin.access', Surveys], ['/admin/targets', 'admin.targets', Targets],
  ['/admin/team', 'admin.team', Team], ['/admin/access', 'admin.access', Access], ['/field', 'field', FieldApp],
  ['/live', 'live.map', LiveMap], ['/live/alerts', 'live.alerts', Alerts], ['/live/digest', 'live.digest', Digest],
  ['/insights/results', 'insights.results', Results], ['/insights/rollup', 'insights.rollup', Rollup],
  ['/insights/compare', 'insights.compare', Compare], ['/insights/ask', 'insights.ask', Ask], ['/insights/report', 'insights.reports', Report],
  ['/client', 'client.portal', ClientPortal], ['/addons/privacy', 'addons.privacy', Privacy], ['/addons/checker', 'addons.checker', Checker],
  ['/addons/import', 'addons.import', Import], ['/addons/api', 'addons.api', Api], ['/settings/compliance', 'settings.compliance', Compliance],
  ['/settings/delivery', 'settings.delivery', Delivery],
];

export default function App() {
  const { user, booting } = useStore();
  if (booting) return <div className="empty" style={{ paddingTop: '30vh' }}><div className="bold">MSR Pulse</div><div className="small mt8">Connecting…</div></div>;
  if (!user) return <Login />;
  const loading = <div className="empty">Loading…</div>;
  // Surveyors get only their phone app
  if (user.role === 'surveyor') {
    return <SurveyorShell><Suspense fallback={loading}><FieldApp mode="app" /></Suspense></SurveyorShell>;
  }
  // Clients get only their portal
  if (user.role === 'client') {
    return <ClientShell><Suspense fallback={loading}><ClientPortal /></Suspense></ClientShell>;
  }
  const Home = user.role === 'supervisor' ? SupervisorHome : user.role === 'analyst' ? AnalystHome : Overview;
  return (
    <Layout>
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<Home />} />
          {ROUTES.map(([path, mod, C]) => (
            <Route key={path} path={path} element={<Guard mod={mod}><C /></Guard>} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
