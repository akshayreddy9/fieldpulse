import React from 'react';
import { Download } from 'lucide-react';
import { useStore } from '../store.jsx';
import { API_BASE, getStageKey } from '../lib/api.js';

// Version of THIS copy of the app: set when the Android app is built (build-android-apk.bat), e.g. "2026-11-21T10:09".
export const APP_BUILD = (import.meta.env && import.meta.env.VITE_APP_BUILD) || '';
export const isNativeApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const label = (b) => (b ? b.replace('T', ' ') : 'web');

// Inside the Android app: if the server offers a newer app than this one, say so with a download link.
// Testers and surveyors then always know whether they have the latest app.
export function AppUpdateBanner() {
  const { server } = useStore();
  if (!isNativeApp() || !server?.apkBuild || !APP_BUILD || server.apkBuild <= APP_BUILD) return null;
  const stage = getStageKey();
  const url = `${API_BASE}/download/MSR-Pulse.apk${stage ? `?stage=${encodeURIComponent(stage)}` : ''}`;
  return (
    <div className="callout amber small" style={{ margin: 10, alignItems: 'center' }}>
      <Download size={16} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}><b>A newer version of the app is available</b> ({label(server.apkBuild)}). You have {label(APP_BUILD)}. Interviews on this phone are kept when you update.</div>
      <a className="btn sm" href={url} target="_blank" rel="noreferrer">Download</a>
    </div>
  );
}

// Small "App version" line so testers can check which app they have
export function AppVersionLine() {
  if (!isNativeApp()) return null;
  return <div className="tiny muted" style={{ textAlign: 'center', padding: '6px 0' }}>App version {label(APP_BUILD)}</div>;
}
