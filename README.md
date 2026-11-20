# MSR Pulse

One system that runs a whole survey for Micro Studies and Research Organisation (MSR): questionnaire set-up, offline field interviews, live quality checks, results, and the client report.

It ships with a sample survey: 2,230 Round-3 interviews and 1,820 Round-2 interviews across 72 booths, 18 mandals and 6 constituencies in Telangana. No real respondents are included.

## Start it

| Where | How |
|---|---|
| **Windows** | Double-click `start-windows.bat`. The browser opens at http://localhost:8787 |
| **Mac** | Install Node.js LTS from nodejs.org once, then double-click `start-mac.command` (first time: right-click → Open) |
| **Android phones** | Same Wi-Fi as the computer: open the `iPhone/iPad/phones:` address in Chrome (⋮ → **Install app** / Add to Home screen). Or install the Android app: double-click `build-android-apk.bat` (needs Android Studio once) and share `MSR-Pulse.apk` |
| **iPhone / iPad** | Same Wi-Fi: open that address in Safari, then tap **Share → Add to Home Screen** |
| **Production (AWS, India)** | See [docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md) (Docker, encrypted storage, nightly S3 backups, HTTPS) |
| **Google Play / App Store** | See [docs/MOBILE-APPS.md](docs/MOBILE-APPS.md) |

### Demo sign-in

Pick a role on the login screen and enter code **482913** (demo mode).

| Role | Mobile number | Sees |
|---|---|---|
| MSR Admin | 98480 12345 | Everything |
| Field Supervisor | 98480 12346 | Live map, alerts, back-checks, team |
| MSR Analyst | 98480 12347 | Results, comparisons, reports (personal details hidden) |
| Surveyor | 98480 12348 | Field app only, own interviews only |
| Client | 98480 12349 | Only reports MSR has approved, no personal data |

Every surveyor in the team list can also sign in with their own number.

## Two ways it runs

- **Server mode** (`start-windows.bat`, `npm start`, Docker): the real system. Data is in a database on the server and is shared by everyone, live. Logins use one-time SMS codes. All access rules are enforced by the server.
- **Standalone mode** (opened from a plain web host, or `npm run dev` without the server): a self-contained demo that keeps its data in the browser. It is useful for showing the product anywhere without a server.

The app detects which mode it is in automatically. The sidebar footer shows which one is active.

## Suggested client walkthrough (10 minutes)

1. Sign in as **Admin** on a laptop and as **Surveyor** on an iPhone, both on the same server.
2. **How it works**: the five steps and the architecture overview.
3. **Questionnaire**: edit a question in English or Telugu, add skip logic, use the phone preview, and publish.
4. On the iPhone, fill in an interview in Telugu. On the laptop it appears on the **Live map** within a second.
5. **Alerts to review**: on the laptop's Field app page, switch on *Surveyor is at home* and submit. The interview is flagged *Away from booth*, with a map, the recording and the transcript. Accept, back-check or reject it.
6. **Booth → state totals**, **Compare & trends** (PDF), **Ask the data** (plain English).
7. **Client report**: *Write AI first draft*, add MSR's advice, approve, and *Send to client*. Then sign in as **Client** to see it.
8. **Privacy lock**: revealing a name needs a reason, and the server records it.

## Configuration

Copy `.env.example` to `.env`. Important settings:
- `DEMO_MODE=0`: real random login codes, sent by SMS through `SMS_PROVIDER=webhook`.
- `ANTHROPIC_API_KEY`: turns on Claude for report drafting and for "Ask the data". Only aggregated figures are sent. Without a key, the built-in writer and parser are used.
- `JWT_SECRET`, `DB_FILE`, `PORT`, `CORS_ORIGINS`.

## Development

```bash
npm install
npm run server     # API on :8787 (creates data/msr-pulse.db with the sample survey)
npm run dev        # web app on :5173 with hot reload, API calls go to :8787
npm test           # server tests: login, data scoping, privacy, consent, API keys, retention
npm run backup     # consistent copy of the database to data/backups
```

Project layout:
- `server/`: API, SMS-code login, permissions, live updates (Server-Sent Events), Claude integration, retention job, tests.
- `src/data`: questionnaire, geography and sample-data generator.
- `src/lib`: quality engine, analytics, report writer and exports. These are shared by the browser and the server.
- `src/pages`: one file per screen.

## What is still outside this codebase

These are items from the requirements that need MSR's accounts or people, not code:
- AWS account, domain and HTTPS certificate.
- A DLT-registered SMS gateway.
- Apple and Google developer accounts.
- The CERT-In audit.
- Team training.

The AI interview checker's speech-to-text currently shows sample transcripts. Live transcription of Telugu and English recordings needs a speech service chosen and run inside India, plus storage of recordings in S3.
