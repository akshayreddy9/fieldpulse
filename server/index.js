// Start the MSR Pulse server: API + web app on one port.
import os from 'node:os';
import { createApp } from './app.js';
import { aiEnabled } from './ai.js';
import { demoMode } from './auth.js';

const PORT = Number(process.env.PORT || 8787);
const { app } = createApp();

app.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log('\n  MSR Pulse server is running\n');
  console.log(`  On this computer:   http://localhost:${PORT}`);
  lan.forEach((ip) => console.log(`  iPhone/iPad/phones: http://${ip}:${PORT}   (same Wi-Fi)`));
  console.log(`\n  AI (Claude):  ${aiEnabled() ? 'on' : 'off (set ANTHROPIC_API_KEY to enable; built-in drafting is used meanwhile)'}`);
  console.log(`  Login codes:  ${demoMode() ? 'demo mode, code 482913 (set DEMO_MODE=0 for real SMS codes)' : `real codes via ${process.env.SMS_PROVIDER || 'console'}`}`);
  console.log('\n  Keep this window open while using MSR Pulse. Press Ctrl+C to stop.\n');
});
