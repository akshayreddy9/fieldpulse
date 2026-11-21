// Screenshots of every screen for the client overview PDF. Needs a fresh demo server on :8787.
const puppeteer = require('C:/Users/akashreddy1/OneDrive/Desktop/MSR/tools/browser-test/node_modules/puppeteer-core');
const fs = require('fs');
const B = 'http://localhost:8787';
const OUT = __dirname + '/img/';
const PHOTO = 'C:/Users/akashreddy1/OneDrive/Desktop/MSR/public/apple-touch-icon.png';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (p, sel, t) => p.evaluate((sel, t) => { const el = [...document.querySelectorAll(sel)].find((e) => e.innerText.trim().includes(t) && !e.disabled); if (el) el.click(); return !!el; }, sel, t);
const text = (p) => p.evaluate(() => document.body.innerText);

async function answerPage(p) {
  await p.evaluate(() => {
    const setVal = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    document.querySelectorAll('.fa-body .fa-card').forEach((card) => {
      const opts = [...card.querySelectorAll('.fa-opt')];
      if (opts.length && !opts.some((o) => o.classList.contains('on'))) opts[Math.min(1, opts.length - 1)].click();
      const sel = card.querySelector('select');
      if (sel && !sel.value && sel.options.length > 1) setVal(sel, sel.options[1].value);
      card.querySelectorAll('tbody tr').forEach((tr, k) => { const r = tr.querySelectorAll('input[type=radio]'); if (r.length && !tr.querySelector('input:checked')) r[(k + 2) % r.length].click(); });
      card.querySelectorAll('input.input').forEach((inp) => {
        if (inp.value) return;
        if (inp.type === 'tel') setVal(inp, '9876543210');
        else if (inp.type === 'number') { const lo = Number(inp.min || 1); const hi = Number(inp.max || lo + 10); setVal(inp, String(Math.min(hi, Math.max(lo, 34)))); }
        else if (inp.type === 'date') setVal(inp, new Date().toISOString().slice(0, 10));
        else setVal(inp, 'Lakshmi Devi');
      });
    });
  });
  await wait(400);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const mk = async (w, h, mobile) => { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 2 : 1.5 }); p.on('dialog', (d) => d.accept()); return { p, ctx }; };
  const login = async (p, role) => { await p.goto(B + '/', { waitUntil: 'networkidle2' }); await wait(500); await click(p, 'button', 'Try a demo account'); await wait(300); await click(p, '.role-choice', role); await wait(500); await click(p, 'button', 'Use demo code'); await wait(2500); };
  const shot = async (p, name, route, opts = {}) => { if (route) { await p.goto(B + '/#' + route, { waitUntil: 'networkidle2' }); await wait(opts.wait || 1800); } if (opts.before) await opts.before(p); await p.screenshot({ path: `${OUT}${name}.png`, fullPage: !!opts.full, ...(opts.clip ? { clip: opts.clip } : {}) }); console.log('shot', name); };

  // Login (desktop + phone)
  let { p } = await mk(1366, 800);
  await shot(p, 'login', null, { before: async (x) => { await x.goto(B + '/', { waitUntil: 'networkidle2' }); await wait(800); } });

  // ---- Surveyor phone: full interview with recording and photo ----
  const ph = await mk(390, 844, true);
  await ph.ctx.overridePermissions(B, ['geolocation', 'microphone']);
  await ph.p.setGeolocation({ latitude: 17.9952, longitude: 79.5601, accuracy: 9 });
  await login(ph.p, 'Surveyor');
  await shot(ph.p, 'phone-home');
  await click(ph.p, 'button', 'Start new interview'); await wait(3000);
  await shot(ph.p, 'phone-consent');
  await click(ph.p, 'button', 'Yes, agrees'); await wait(900);
  let pageNo = 0;
  for (; pageNo < 8; pageNo++) {
    await answerPage(ph.p);
    if (pageNo === 1) await shot(ph.p, 'phone-questions');
    if (await ph.p.$('input[type=file]')) { const f = await ph.p.$('input[type=file]'); await f.uploadFile(PHOTO); await wait(1500); }
    if (/Capture location/.test(await text(ph.p))) { await click(ph.p, 'button', 'Capture location'); await wait(2500); await shot(ph.p, 'phone-gps-photo'); }
    await wait(2500);
    if (/Finish & send/.test(await text(ph.p))) { await click(ph.p, 'button', 'Finish & send'); break; }
    await click(ph.p, 'button', 'Next'); await wait(900);
  }
  await wait(5000);
  await shot(ph.p, 'phone-sent');
  const id = ((await text(ph.p)).match(/INT-[A-Z0-9-]+/) || [])[0];
  console.log('interview', id);

  // ---- Admin screens ----
  ({ p } = await mk(1366, 800));
  await login(p, 'MSR Admin');
  await shot(p, 'dashboard', '/');
  await shot(p, 'surveys', '/admin/surveys');
  await shot(p, 'builder', '/admin/builder', { before: async (x) => { await click(x, '.q-card', 'Gender'); await wait(800); } });
  await shot(p, 'booths', '/admin/booths');
  await shot(p, 'targets', '/admin/targets');
  await shot(p, 'team', '/admin/team', { before: async (x) => { await x.evaluate(() => window.scrollTo(0, 0)); } });
  await shot(p, 'team-add', '/admin/team', { before: async (x) => { await click(x, 'button', 'Add person'); await wait(600); } });
  await shot(p, 'access', '/admin/access');
  await shot(p, 'livemap', '/live', { wait: 4000 });
  await shot(p, 'alerts', '/live/alerts', { wait: 3000 });
  await shot(p, 'review-media', `/live/alerts?id=${id}`, {
    wait: 3000,
    before: async (x) => {
      await click(x, 'button', 'Play recording'); await wait(2000);
      await click(x, 'button', 'Show photo'); await wait(1500);
      await x.evaluate(() => { const el = [...document.querySelectorAll('.tiny.bold.muted')].find((e) => e.innerText.includes('RECORDING')); el && el.scrollIntoView({ block: 'center' }); });
      await wait(800);
    },
  });
  await shot(p, 'digest', '/live/digest');
  await shot(p, 'checker', '/addons/checker');
  await shot(p, 'results', '/insights/results', { wait: 2500 });
  await shot(p, 'rollup', '/insights/rollup');
  await shot(p, 'compare', '/insights/compare');
  await shot(p, 'ask', '/insights/ask', { wait: 2500 });
  await shot(p, 'report', '/insights/report', {
    before: async (x) => {
      await click(x, 'button', 'Write AI first draft'); await wait(3500);
      // MSR writes its own advice (required before approval)
      await x.evaluate(() => { const el = document.querySelector('.body.advice'); if (el) { el.focus(); el.innerText = 'Sample MSR advice: focus field effort on the closest constituencies, and repeat the survey after the welfare announcement to measure its effect.'; el.blur(); } });
      await wait(800);
      await click(x, 'button', 'Start MSR review'); await wait(800);
      await click(x, 'button', 'Approve report'); await wait(800);
      await click(x, 'button', 'Send to client'); await wait(1500);
    },
  });
  await shot(p, 'privacy', '/addons/privacy');
  await shot(p, 'compliance', '/settings/compliance');
  await shot(p, 'api', '/addons/api');
  await shot(p, 'delivery', '/settings/delivery');

  // ---- Client ----
  const c = await mk(1366, 800);
  await login(c.p, 'Client');
  await shot(c.p, 'client-report');
  await click(c.p, 'button', 'Key results'); await wait(1500);
  await shot(c.p, 'client-results');

  // ---- Admin on a phone (menu over map) ----
  const am = await mk(390, 844, true);
  await login(am.p, 'MSR Admin');
  await shot(am.p, 'phone-admin', '/');

  await b.close();
  console.log('done');
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
