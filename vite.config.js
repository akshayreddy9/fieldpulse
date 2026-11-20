import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // During development, API calls go to the MSR Pulse server (npm run server)
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
  // vite preview = standalone demo (no API forwarding)
  preview: { port: 4173, proxy: {} },
  // asset-manifest.json lists every file so the app can store all screens for offline use
  build: { chunkSizeWarningLimit: 3000, manifest: 'asset-manifest.json' },
});
