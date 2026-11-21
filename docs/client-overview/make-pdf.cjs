const puppeteer = require('C:/Users/akashreddy1/OneDrive/Desktop/MSR/tools/browser-test/node_modules/puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  await p.goto('file:///' + path.join(__dirname, 'overview.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await p.evaluate(async () => { await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))); });
  const broken = await p.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
  if (broken.length) console.log('MISSING IMAGES:', broken.join(', '));
  await p.pdf({
    path: process.argv[2],
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#64748b;padding:0 16mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial"><span>MSR Pulse · System overview &amp; progress report · 21 Nov 2026</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
    preferCSSPageSize: false,
  });
  await b.close();
  console.log('PDF written');
})();
