# MSR Pulse — Project Handoff

> **For any AI assistant or developer picking this up** (Claude, ChatGPT, Gemini, Copilot, a human).
> Read this file first. It explains what exists, what is done, what is left, and the rules to follow.
> Open other files only when a task needs them. Update the "Status" and "Remaining work" sections after notable changes.
>
> Last updated: **2026-11-20**

---

## 1. Working with the owner (important)

- The owner is building this for a client (MSR) and is **new to AWS and cloud hosting**. Explain each AWS/deployment step in
  plain language **before** doing it, suggest better options when they exist, and flag costs and risks.
- **Confirm before** anything costly, irreversible, or affecting the shared test site (deleting resources, resetting data, changing instance size).
- **Never ask for or paste AWS access keys or passwords.** AWS sign-in is done by the owner in the browser (`aws login`).
- The test site is used by the owner's friends in different places — **never press "Reset" or wipe data** on it.
- Real respondent data must **only** ever go to MSR's own AWS account in India (see §7). The current account holds sample data only.
- The owner reports bugs as numbered lists. Fix all of them, test, then deploy (see §6) and report back in simple language.

---

## 2. What the product is

**MSR Pulse** — an end-to-end survey platform for MSR (Micro Studies and Research Organisation, Telangana, India),
replacing their use of GoSurvey. One system from questionnaire to client report.

- Questionnaire questions and answers are shown in **Telugu + English**; everything else in the UI is **English only**.
- **5 roles**, each with its own simplified screens (same colour theme):
  | Role | Who | Main screens |
  |---|---|---|
  | admin | MSR management (few) | Everything: surveys, questionnaire builder, targets, team, access, insights, add-ons, settings |
  | supervisor | Field supervisors (few) | Live map, alerts/review queue, daily digest, targets, team, results |
  | analyst | MSR analysts (few) | Results, roll-up, compare rounds, ask-a-question, reports, builder |
  | surveyor | Field staff (many) | Phone app only: start interview, consent, questions, send, own progress |
  | client | Paying customer (many) | Client portal: own surveys' results and approved report only |
- **Login:** mobile number + 6-digit OTP. No public role picker. Demo accounts appear only behind
  "Try a demo account (test site only)" when the server runs in demo mode with sample data.
- **Multi-survey, multi-client:** each survey has its own questionnaire, targets, interviews, reviews and report.
  Survey status: Draft → Live → Closed. Surveyors see only Live surveys; clients see only their own.

---

## 3. Technology and code map

| Part | Tech |
|---|---|
| Web app | React 18 + Vite 5, react-router (HashRouter), Recharts (charts), Leaflet + OpenStreetMap (maps), SheetJS (Excel), jsPDF (PDF), lucide-react (icons) |
| Offline | PWA service worker `public/sw.js` (caches app files; never caches `/api` or `/download`) + local cache and outbox in `src/store.jsx` |
| Server | Node.js 24 + Express, built-in `node:sqlite` database, HMAC JWT sessions, Server-Sent Events (`/api/live`) for real-time updates |
| AI | Anthropic SDK, model `claude-opus-5-5`, for report drafting and "ask a question"; falls back to a built-in generator when no API key |
| Android app | Capacitor 7 wrapping the same web app, appId `in.msr.pulse.field` |
| Hosting | AWS: EC2 + Docker + Caddy (HTTPS), S3 for releases/backups, KMS encryption, SSM Parameter Store for settings |

```
src/
  store.jsx                 all app state, server sync, offline cache, outbox, survey switching, permissions (MODULES)
  lib/api.js                server address, connect/detect server, stage (test-site) password header
  lib/roles.js              QUESTION ROLES: which question is Gender/Age/Caste/Occupation/Name/Mobile/Main result/... (q.role,
                            set in the builder's "Used for"); falls back to the starter ids (q_gender, q_vote_intent...). Use
                            R('gender') / A(interview,'gender') / rolesOf(qn) - NEVER hard-code question ids in screens.
  lib/outbox.js             phone outbox in IndexedDB (save first, delete only after server confirms), unique interview ids
  lib/quality.js            fake-interview detection rules (0-100 risk score); assessAll(list, questionnaire)
  lib/analytics.js, nlq.js, reportGen.js, exporters.js (Excel/PDF), privacy.js (PII masking), audio.js
  data/questionnaire.js     SAMPLE_QUESTIONNAIRE, question types, isVisible (skip logic), describeRule
  data/geo.js               booth list registry: setGeo() fills GEO / *_BY_ID in place; geoFromRows() reads the Excel upload;
                            sample list = 6 constituencies, 18 mandals, 72 booths (test sites only; production starts empty)
  data/generate.js          sample interview / surveyor generator (demo data)
  components/Layout.jsx     role menus, survey switcher, shells for surveyor/client
  components/QuestionRenderer.jsx  renders every question type incl. GPS and photo; validateAnswer
  components/ui.jsx, charts.jsx, InterviewReview.jsx
  pages/Login.jsx           phone+OTP login, server connect, demo accounts, APK download
  pages/field/FieldApp.jsx  surveyor app (mode "app") and admin phone preview (mode "preview")
  pages/admin/              Surveys, Builder (questionnaire), Booths (booth list upload), Targets, Team (surveyors), PeopleLogins, Access
  pages/live/               LiveMap, Alerts (review queue), Digest
  pages/insights/           Results, Rollup, Compare, Ask, Report
  pages/addons/             Privacy lock, Checker (AI interview checker), Import (Round 1), Api (public API + webhooks)
  pages/settings/           Compliance (DPDP retention), Delivery
  pages/homes/              SupervisorHome, AnalystHome;  ClientPortal.jsx;  Overview.jsx
server/
  index.js                  starts the server
  app.js                    ALL API routes (auth, surveys, state, interviews, users, AI, admin, live SSE, /api/v1, APK download)
  db.js                     schema, migrations, seed (sample or production), SURVEY_KEYS (per-survey settings)
  permissions.js            role defaults, STATE_RULES (who may change what), READABLE
  auth.js, sms.js (console or webhook SMS gateway), ai.js, backup.js
  test/api.test.js, test/surveys.test.js, test/booths-roles.test.js, test/teams.test.js   36 automated tests (node --test)
deploy/aws/msr-pulse-aws.yaml   CloudFormation template for the whole AWS setup
deploy/aws/update-live-site.ps1 upload release + install on server (one step)
deploy/aws/remote.ps1           run a shell command on the server via AWS Systems Manager (no SSH)
deploy/Caddyfile                HTTPS reverse proxy
docs/DEPLOY-AWS.md, docs/MOBILE-APPS.md   step-by-step guides
tools/                          android-icons.mjs, fix-onedrive-assets.mjs, setup-android-tools.ps1,
                                browser-test/fixes.cjs (end-to-end browser check), eslint-undefined.json (undefined-name scan)
MSR-Pulse-Test-Checklist.xlsx   68 manual tests for testers
```

**Key data concepts**
- Booth list = shared setting `geo` (admins only; Set up > Booth list, Excel upload). `null` = sample booths (test sites),
  `{ empty: true }` = production before upload. Booth IDs are `<CONSTITUENCY CODE>-<booth no, 3 digits>`, e.g. `KNR-101`.
- Shared settings are key/value. Per-survey keys are stored as `survey:<surveyId>:<key>`; list in `SURVEY_KEYS` (db.js):
  `questionnaire, draftQuestionnaire, publishedVersion, targets, statuses, notes, report, reportStatus, reportHistory, round1Imported`.
- To add a new synced key: add it to `SURVEY_KEYS` (if per survey), `STATE_RULES` (permissions.js), and `SYNC_KEYS`/`SURVEY_SYNC` (store.jsx).
- Questionnaire = `{ id, version, groups: [{ id, title:{en,te}, questions:[{ id, type, label:{en,te}, options?, required?, showIf? ... }] }] }`.
  Skip logic `showIf = { q, op: eq|neq|in|nin|answered, value }`.
- Builder edits go to `draftQuestionnaire`; **Publish** copies it to `questionnaire` with version+1; phones get it over SSE.

**Server environment variables**
`DEMO_MODE=1` (fixed OTP 482913, demo accounts) · `STAGING_PASSWORD` (password gate for the test site) ·
`SEED_SAMPLE=0` + `ADMIN_PHONE` + `ADMIN_NAME` (production: empty system with one admin) · `DB_FILE` · `PORT` (8787) ·
`ANTHROPIC_API_KEY` (optional) · `SMS_PROVIDER=webhook` + `SMS_WEBHOOK_URL` + `SMS_WEBHOOK_TOKEN` (real SMS).

---

## 4. How to run, test and build (Windows PC of the owner)

Project folder: `C:\Users\akashreddy1\OneDrive\Desktop\MSR`

| Task | Command |
|---|---|
| Install | `npm install` |
| Automated tests (must pass) | `npm test` → 36 tests |
| Version control | git repo in the project folder (branch `main`). Commit after each change; `git log` shows history |
| Build web app | `npx vite build` (output `dist/`) |
| Local server with demo data | `DEMO_MODE=1 node server/index.js` → http://localhost:8787 (Git Bash syntax; delete `data/msr-pulse.db` for a fresh seed) |
| Dev mode with hot reload | `npm run dev` (Vite on 5173, proxies /api to 8787) |
| Undefined-name scan | `npx eslint@8 --no-eslintrc -c tools/eslint-undefined.json --resolve-plugins-relative-to <dir with eslint-plugin-react> src` |
| Browser end-to-end check | `cd tools/browser-test && npm install && node fixes.cjs` (server must be running on 8787 with a fresh DB) |
| Android APK | `build-android-apk.bat` → `MSR-Pulse.apk` (Java + Android SDK in `%USERPROFILE%\AndroidBuild`, no Android Studio) |
| Release zip | `make-release.bat` → runs tests, creates `msr-pulse-release.zip` (includes the APK) |

PC quirks: the project is in OneDrive (placeholder files break Gradle → `tools/fix-onedrive-assets.mjs`, already in the build script);
Windows Smart App Control blocks unsigned .exe tools; the zip must be made with Windows' own `C:\Windows\System32\tar.exe -a`
(Git Bash `tar` makes a tar file, not a zip — the server then fails to unzip).

---

## 5. AWS setup (current test deployment — owner's personal account)

- Account type: AWS "new AWS experience" (social sign-in, "projects"). It is locked to **one Region: ap-southeast-2 (Sydney)**.
  Free plan with $100 credit until 2027-05-18. AWS CLI profile: **`msr-pulse`**.
- AWS CLI path: `%LOCALAPPDATA%\Programs\Amazon\AWSCLIV2\aws.exe` (not on PATH).
- Sign-in expires after ~12 hours: run `aws login --profile msr-pulse --region ap-southeast-2`; the owner approves in the browser.
- AWS Agent Toolkit is set up (2026-11-21): the `aws-mcp` server in ~/.claude.json uses profile msr-pulse (works only while that sign-in is valid).
- Build quirk for AI tools: Claude Code sets NoDefaultCurrentDirectoryInExePath=1, which breaks the .bat scripts ('gradlew.bat not recognized'); run them with that variable removed.
- CloudFormation stack **`msr-pulse`** (template `deploy/aws/msr-pulse-aws.yaml`):
  - EC2 **t3.small** `i-00f5b84673c49f226`, Elastic IP 13.210.51.39, Docker container `msr-app`, Caddy HTTPS
  - Site: **https://13-210-51-39.sslip.io** (free HTTPS name via sslip.io), protected by a site password
  - S3 bucket `msr-pulse-bucket-mzalppajffls`: `release/` (new versions), `backups/` (nightly database backups, KMS-encrypted)
  - Settings in SSM Parameter Store `/msr-pulse/env/*`; site password is SecureString `/msr-pulse/env/STAGING_PASSWORD`
  - Access only through AWS Session Manager (no SSH port open)
  - Server jobs: `msr-deploy` every 5 min (installs a new release from S3), `msr-backup` nightly 21:30 UTC, `msr-go-live` (switch to production)
- Mode: **Testing** (sample data: ~2,237 interviews, demo accounts, password-protected).

---

## 6. How to ship a change

1. Make the code change. Run `npm test` and `npx vite build`; run the undefined-name scan.
2. If the surveyor/phone screens changed, rebuild the APK (`build-android-apk.bat`). The APK contains its own copy of the screens.
3. `make-release.bat` → `msr-pulse-release.zip`.
4. `.\deploy\aws\update-live-site.ps1` (PowerShell) → uploads to S3 and installs immediately. Ends with "MSR Pulse is running at …".
5. Tell testers: reload the website once; Android users reinstall the APK from the login page ("Download Android app").

---

## 7. Status — work DONE (as of 2026-11-19)

**Core platform**
- [x] Questionnaire builder: all question types (single, multiple, grid, cascade constituency→mandal→booth, text, number, date, GPS, photo),
      pages, Telugu+English, skip logic, live phone preview, draft → save → publish, versioning, publish checks
- [x] Surveyor app: works offline, consent screen read aloud (Telugu+English), real audio recording with permission, real GPS, photo,
      validation with clear errors, outbox that syncs when online, questionnaire version kept per interview
- [x] Multi-survey / multi-client, survey status Draft/Live/Closed, new survey from Blank / MSR starter / copy
- [x] Team: Excel upload + add/edit surveyors and supervisors, booth assignment, logins follow the team list
- [x] People & logins (admin creates staff/client logins), role permissions screen
- [x] Booth targets and quotas, live map, alerts and review queue, fake-interview detection (risk score), daily digest
- [x] Results, roll-up, compare with Round 1, ask-a-question, AI-assisted report with approval workflow, Excel/PDF export
- [x] Client portal (own surveys only), privacy lock (masks personal details), DPDP data retention job, audit log, public API + webhooks
- [x] Android APK, PWA for iPhone (add to home screen), test-site password, production install mode
- [x] AWS deployment with HTTPS, encrypted backups, auto-deploy, 23 automated tests, 68-item manual test checklist

**Latest fix round (2026-11-19, deployed):** server detection on slow mobile networks; mic permission before timer + honest
"NOT recording" state; error banner at top with scroll to the question; always real GPS (demo-only booth fallback); answers to
skipped questions not saved; empty pages skipped; new-survey form with inline client and start options; Edit questions / Details /
Dashboard actions; builder draft with Save/Publish/Discard and unsaved warning; publish blocked on missing Telugu, empty page or
no GPS question; continuous question numbering in preview; plain-language skip-logic editor; delete page; honest version history;
team add/edit with login handling.

**Round 2026-11-20 - deployed 2026-11-21:**
- Git repository created (baseline commit = 2026-11-19 handoff state). Fixed `.gitignore` (`data/` also hid `src/data/`).
- Real surveys now possible: booth list upload from Excel (Set up > Booth list, with checks and preview); question roles
  ("Used for" in the builder) used by quotas, targets, filters, fake-interview checks, privacy masking/reveal/retention,
  roll-up, compare, ask-the-data, AI prompt, public API and report. Screens no longer crash on a questionnaire without the
  sample questions. Production install starts with no booths (never the sample ones).
- Report draft: every sentence now computed from data (removed pre-written claims about Nalgonda/electricity/young voters).
- Phone outbox: IndexedDB, saved before sending, deleted only after the server confirms, retried every 30 s, one bad
  interview no longer blocks the rest, honest "not saved" screen if phone storage fails. Interview ids are now unique
  (old 6-digit ids could collide and the server silently dropped the second interview).
- One crashing screen no longer blanks the whole app (error boundary). Evening digest crash with a non-sample booth list fixed.

**Round 2026-11-21 c (owner's test report) - DEPLOYED 2026-11-21 05:27 UTC, app version 2026-11-21T05:26:**
- Root cause of "survey changes not reaching the Android app": the app had no server address built in; without one it silently ran
  in standalone demo mode (fake local data). Now build-android-apk.bat builds the address in (MSR_SERVER, default the test site;
  change it when moving to MSR's account), the app asks once for the test-site password, and an unconnected app shows a red warning.
- App version: each APK is stamped (VITE_APP_BUILD) and MSR-Pulse.apk.json is shipped beside it; /api/health returns apkBuild; older
  apps show "A newer version of the app is available · Download". The version is shown on the app's sign-in screen.
- Map "Access blocked": OpenStreetMap blocks tiles without a referrer; server Referrer-Policy is now strict-origin-when-cross-origin and
  tile layers set referrerPolicy. Map no longer draws over the phone menu (.leaflet-container isolation).
- Verified on a real Android 15 emulator (MSR_Pixel AVD in AndroidBuild) via WebView debugging: password prompt, live survey
  add/close, update banner, map tiles, menu. For production at scale use a map provider that allows it (e.g. Amazon Location Service).

**Round 2026-11-21 b (owner's reported problems) - DEPLOYED 2026-11-21 04:45 UTC with the APK; all three rounds below are live:**
- Survey teams: each survey has a per-survey setting `team` (null = everyone; else { members: { personId: { boothIds } } },
  empty boothIds = usual booths). Set on Team & people ("Team for this survey") or via the "Team" button on Surveys.
  Server: surveyors only see / load Live surveys they are on (`canSeeSurvey`); finished interviews are still accepted if
  the surveyor was removed later. Helpers in `src/lib/team.js` (onTeam, boothsFor).
- Phones follow survey changes live: start/close/team change broadcasts `surveys`; the phone refreshes and moves off a
  survey it may no longer use; also re-checks when the app returns to the foreground or gets signal. Loads are race-safe.
- API responses are sent `Cache-Control: no-store` and the app fetches with `cache: 'no-store'` (phones could show an old
  survey list from their browser cache - likely cause of "survey changed but not on the surveyor's phone").
- Several surveys at once: the surveyor home lists all their surveys (booths, done, waiting) - tap to switch; works offline
  for surveys opened on that phone before (cache `bySurvey`).
- "Add person" offers Surveyor, Supervisor, Analyst, Admin, Client (office roles create a login; listed under "Office staff
  & client logins" with edit / switch off; logins can be renamed). Menu "Surveyors & team" is now "Team & people".
- Tests: 36 (new server/test/teams.test.js).

**Round 2026-11-21 (client-review polish) - deployed 2026-11-21:**
- UI: dashboard "Needs your attention" list; alerts filter + "back-check all" per surveyor; over-quota shown purple "+n" on
  targets; clearer surveyor booth status (answer labels, not codes); long single-choice lists (>8) are a pick-list on phones;
  mobile-number question uses the phone keypad and checks 10 digits; client portal shows live fieldwork progress while the
  report is prepared (clients may now read booth targets); removed stale "EN/తె switch" and "Round 3" texts.
- Honesty for client review: simulated features carry a "Preview · not connected yet" note (recording checker, GoSurvey
  import, webhooks, digest delivery); Security & DPDP page shows "In place" vs "Before go-live" and the real deletion policy
  (no invented history); login footer, dashboard architecture card and API safeguards only claim what exists; fake API usage
  chart and fake app version "2.4.1" removed.
- Team page: no crash on an empty booth list; surveyors whose booth is not in the list get a red "not in booth list" badge.

**Demo-only / simulated parts (be honest with the client about these):**
- AI interview checker transcript on the review screen is simulated (no speech-to-text yet).
- "Demo feed" button streams generated interviews (test mode only).
- SMS is printed to the server log unless an SMS gateway is configured; demo OTP is 482913.
- Audio recordings stay on the phone (not uploaded to the server yet).
- Photos are recorded only as "taken / not taken"; the image is not uploaded.
- Evening digest "Send now" does not send anything yet (it says so); supervisors get the Excel back-check list.
- "Round 1/2" comparison data and the GoSurvey import are generated sample data.

---

## 8. Remaining work (in order)

0. **Done 2026-11-21:** all rounds shipped (APK rebuilt, deployed). Testers: reload the site once and reinstall the APK.
   Add checklist rows for: booth list upload, "Used for" marks, offline interview then back online.
1. **Testing week (now):** owner's friends test with `MSR-Pulse-Test-Checklist.xlsx`; fix reported bugs; redeploy.
2. **Go live with an empty system:** remove sample data (`msr-go-live` / `SEED_SAMPLE=0`, `DEMO_MODE` off); remove the site password only after real SMS logins work.
3. **Move to MSR's own AWS account in Mumbai (ap-south-1)** — client requirement: MSR owns code and data, data stays in India.
   Deploy the same CloudFormation template there; then decide whether to delete the Sydney test stack (ask the owner; the KMS key and
   bucket are set to Retain).
4. **Needed before real fieldwork:** Indian DLT-registered SMS gateway for OTP (plug into `server/sms.js` webhook), a proper domain name
   (e.g. pulse.msr…), CERT-In / security audit, release-signed APK (and Google Play listing if wanted), iPhone: PWA now, App Store later.
5. **Next upgrades (agreed list):** upload audio + photos to S3 (encrypted); send the evening digest for real (SMS/WhatsApp/email);
   server-side totals + pagination (today every interview is downloaded to the browser - fine for ~2,000, slow at 50,000+;
   consider Postgres/RDS in Mumbai); real GoSurvey import from files; Telugu speech-to-text for the interview checker;
   encrypt data on the phone; iOS native build.
6. At the end of the demo, ask the owner whether to keep or clean up the Sydney AWS resources (cost).

## 9. Known limits / watch-outs
- Sample geography (6 constituencies, 72 booths) is demo data; load MSR's real booth list (Set up > Booth list) before going live.
  The booth list is shared by all surveys. Surveyors/targets pointing at booths not in the list are flagged on upload.
- Survey rounds are still fixed as round 3 = current, 2 = previous, 1 = imported (data model), labels are generic now.
- The team list (`surveyors`) is shared by all surveys; each survey chooses its members and optional booths (`team`).
- Free sslip.io HTTPS name is fine for testing; use a real domain for production.
- t3.small is enough for testing; review size and cost before real fieldwork.
