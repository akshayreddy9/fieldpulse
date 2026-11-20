// OneDrive can turn the empty cordova*.js files that Capacitor writes into cloud placeholders,
// which Gradle cannot read ("not a regular file"). Re-create them as small real files.
import fs from 'node:fs';
const dir = 'android/app/src/main/assets/public';
for (const f of ['cordova.js', 'cordova_plugins.js']) {
  const p = `${dir}/${f}`;
  try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
  fs.writeFileSync(p, `// ${f}: not used by MSR Pulse (Capacitor compatibility file)\n`);
}
console.log('Android asset placeholders refreshed');
