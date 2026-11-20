const puppeteer = require('puppeteer-core');
const B = 'http://localhost:8787';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const SH = __dirname + '/';
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [];
  const mk = async (w, h, mobile) => {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, isMobile: !!mobile, hasTouch: !!mobile });
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|tile\.openstreetmap|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    p.on('dialog', (d) => d.accept());
    return { p, ctx };
  };
  const clickText = async (p, sel, text) => {
    const ok = await p.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find(e => e.innerText.trim().includes(text) && !e.disabled); if (el) { el.click(); return true; } return false; }, sel, text);
    if (!ok) throw new Error('not found: ' + text); await wait(400);
  };
  const has = (p, text) => p.evaluate((t) => document.body.innerText.includes(t), text);
  const login = async (p, roleLabel) => {
    await p.goto(B + '/', { waitUntil: 'networkidle2' }); await wait(500);
    await clickText(p, 'button', 'Try a demo account');
    await clickText(p, '.role-choice', roleLabel);
    await wait(500);
    await clickText(p, 'button', 'Use demo code');
    await wait(2500);
  };
  const check = (name, ok) => console.log((ok ? 'PASS ' : 'FAIL ') + name);

  // ---------- Admin ----------
  const { p: a } = await mk(1440, 950);
  await login(a, 'MSR Admin');
  await a.goto(B + '/#/admin/surveys', { waitUntil: 'networkidle2' }); await wait(1500);
  check('survey actions: Edit questions button', await has(a, 'Edit questions'));
  await clickText(a, 'button', 'New survey');
  const opts = await a.evaluate(() => [...document.querySelectorAll('.modal select')].map(s => [...s.options].map(o => o.text)));
  check('new survey: start-from has Blank + Starter', opts.some(o => o.some(t => t.startsWith('Blank')) && o.some(t => t.includes('starter'))));
  check('new survey: client list has "+ Add a new client"', opts.some(o => o.some(t => t.includes('Add a new client'))));
  await a.type('.modal input', 'Fix Test Survey');
  await a.evaluate(() => { const ss = [...document.querySelectorAll('.modal select')]; const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); }; set(ss[0], '__new'); set(ss[1], 'blank'); });
  await wait(300);
  const ins = await a.$$('.modal input');
  await ins[1].type('Test Client Co'); await ins[2].type('9876501234');
  await clickText(a, '.modal button', 'Create survey'); await wait(2500);
  check('created survey opens builder', a.url().includes('/admin/builder'));
  check('blank survey shows Draft status + Start fieldwork', (await has(a, 'Survey: Draft')) && (await has(a, 'Start fieldwork')));
  // add a question on page 2, type English only
  await a.evaluate(() => { const btns = [...document.querySelectorAll('button')].filter(x => x.innerText.includes('Add question')); btns[1].click(); });
  await wait(400);
  await clickText(a, '.type-tile', 'Single');
  await wait(400);
  const ta = await a.$$('textarea');
  await ta[0].click({ clickCount: 3 }); await ta[0].type('Is the road near your house good?');
  await wait(300);
  await clickText(a, '.toggle, label, button', 'Required').catch(()=>console.log('  (no Required toggle found)'));
  check('editing shows "Unsaved changes"', await has(a, 'Unsaved changes'));
  const liveQ = await a.evaluate(async () => { const r = await fetch('/api/state?survey=' + JSON.parse(localStorage.getItem('msr-pulse-cache') || '{}')?.state?.surveyId, { headers: { Authorization: 'Bearer ' + localStorage.getItem('msr-pulse-token') } }); return r.ok ? (await r.json()) : null; });
  await clickText(a, 'button', 'Save draft'); await wait(1500);
  check('after save: "Draft saved · not published"', await has(a, 'Draft saved'));
  await clickText(a, 'button', 'Publish to field'); await wait(800);
  check('publish blocked without Telugu', await has(a, 'Fix the'));
  // fill Telugu for the question, its options and page title
  await ta[1].type('మీ ఇంటి దగ్గర రోడ్డు బాగుందా?');
  await a.evaluate(() => {
    const setv = (el, v) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    document.querySelectorAll('input.te').forEach((el) => { if (!el.value) setv(el, 'తెలుగు'); });
  });
  await wait(500);
  const allGood = await has(a, 'All good');
  check('checks all good after Telugu filled', allGood);
  if (!allGood) console.log(await a.evaluate(() => [...document.querySelectorAll('.card')].find(c => c.innerText.includes('Checks before'))?.innerText));
  await clickText(a, 'button', 'Publish to field'); await wait(2000);
  check('published: "Phones use v"', await has(a, 'Phones use v'));
  // preview numbering continuous: go to page 2 of preview
  await clickText(a, '.fa-foot button', 'Next'); await wait(400);
  const qnum = await a.evaluate(() => document.querySelector('.fa-body')?.innerText.slice(0, 60));
  console.log('  preview page 2 starts with:', JSON.stringify(qnum));
  await clickText(a, 'button', 'Start fieldwork'); await wait(1500);
  check('survey went Live', await has(a, 'Survey: Live'));
  // Team: add a person
  await a.goto(B + '/#/admin/team', { waitUntil: 'networkidle2' }); await wait(1500);
  await clickText(a, 'button', 'Add person');
  const tin = await a.$$('.modal input');
  await tin[0].type('Ravi Fixtest'); await tin[1].type('9000011111');
  await a.evaluate(() => { const c = document.querySelector('.modal .chip'); c && c.click(); });
  await wait(200);
  await clickText(a, '.modal button', 'Add person'); await wait(1500);
  check('team: new person in list', await has(a, 'Ravi Fixtest'));
  await a.screenshot({ path: SH + 'fix-team.png' });

  // ---------- Surveyor (mic allowed via fake device) ----------
  const { p: s } = await mk(390, 844, true);
  await login(s, 'Surveyor');
  await wait(1000);
  await s.screenshot({ path: SH + 'fix-sv-home.png' });
  const t = await s.evaluate(() => document.body.innerText);
  check('surveyor home shows booth (not "not assigned")', !/not assigned/i.test(t));
  try {
    await clickText(s, 'button', 'Start');
    await wait(2500);
    await s.screenshot({ path: SH + 'fix-sv-consent.png' });
    check('consent shows real recording state', await has(s, 'Recording with the phone microphone') || await has(s, 'Microphone is blocked'));
    console.log('  consent text:', (await s.evaluate(() => document.querySelector('.fa-body')?.innerText || '')).slice(0, 300).replace(/\n/g, ' | '));
    await clickText(s, 'button', 'Yes, agrees');
    await wait(800);
    await clickText(s, 'button', 'Next'); await wait(800); console.log('  on page:', await s.evaluate(()=>(document.querySelector('.fa-head')||document.body).innerText.split(String.fromCharCode(10)).join(' ').slice(0,80))); if (!(await has(s, 'Please complete'))) { await clickText(s, 'button', 'Next'); await wait(800); }
    await s.screenshot({ path: SH + 'fix-sv-error.png' });
    check('Next without answers shows top banner', await has(s, 'Please complete this question'));
  } catch (e) { console.log('surveyor flow error:', e.message); await s.screenshot({ path: SH + 'fix-sv-fail.png' }); }

  // Microphone blocked: separate browser without auto-allow
  const b2 = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx2 = await b2.createBrowserContext(); const d = await ctx2.newPage(); d.on('dialog', (x) => x.accept());
  await d.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await login(d, 'Surveyor'); await wait(800);
  await clickText(d, 'button', 'Start'); await wait(2500);
  await d.screenshot({ path: SH + 'fix-sv-mic-denied.png' });
  const dtext = await d.evaluate(() => document.body.innerText);
  check('mic blocked: no REC timer shown', !/REC d/.test(dtext));
  check('mic blocked: clear message + Try again', dtext.includes('Try again'));
  check('mic blocked: Yes-agrees disabled', await d.evaluate(() => [...document.querySelectorAll('button')].find(e => e.innerText.includes('Yes, agrees'))?.disabled === true));
  await b2.close();
  console.log('errors:', errs.slice(0, 8));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
