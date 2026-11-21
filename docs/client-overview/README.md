# Client overview PDF

Source of docs/MSR-Pulse-System-Overview.pdf.

1. Start a fresh demo server: `DEMO_MODE=1 DB_FILE=<temp>/doc.db PORT=8787 AI_DISABLED=1 node server/index.js`
2. `node docs/client-overview/shots.cjs` (prints the interview id), then `node docs/client-overview/shot-review.cjs <interview id>`
3. Edit overview.html, then `node docs/client-overview/make-pdf.cjs docs/MSR-Pulse-System-Overview.pdf`

The scripts use puppeteer-core from tools/browser-test (run `npm install` there once) and Chrome.
