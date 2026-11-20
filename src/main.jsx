import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './theme.css';
import App from './App.jsx';
import { StoreProvider } from './store.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
);

// Offline support + "Add to Home Screen" on iPhone / iPad / Android
// Not needed inside the installed Android/iPhone app, whose files are already on the phone.
const nativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if ('serviceWorker' in navigator && import.meta.env.PROD && !nativeApp) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      // Store every screen of the app on the device, so it opens later with no signal.
      const man = await (await fetch('./asset-manifest.json', { cache: 'no-store' })).json();
      const files = new Set(['./', './index.html', './manifest.webmanifest']);
      Object.values(man).forEach((e) => { files.add(`./${e.file}`); (e.css || []).forEach((c) => files.add(`./${c}`)); });
      const cache = await caches.open('msr-pulse-v2');
      await Promise.all([...files].map((f) => cache.match(f).then((hit) => hit || cache.add(f)).catch(() => {})));
    } catch { /* offline support is best-effort */ }
  });
}
