# MSR Pulse — Short Handoff (read this first)

Last updated: **2026-11-21** · Full detail (code map, AWS, history, commands): `docs/HANDOFF-FULL.md`. Open it only when a task needs it.

## Status
- **The client (MSR) cancelled the project on 2026-11-21.** The product is feature-complete for a demo: about 88% of features, about 73% overall.
- The code is on git branch `main` (clean). Tests: `npm test` (41 pass).
- Deliverables made:
  - `docs/MSR-Pulse-System-Overview.pdf` (34-page client guide);
  - `MSR-Pulse-Test-Checklist-v2.xlsx` (105 tests).

## Rules (owner)
- The owner is new to AWS (help level HIGH): explain every step in plain language first.
- Confirm before anything costly, irreversible or affecting the live site. Never ask for AWS keys or passwords.
- Never reset or wipe the test site. Deploy only when the owner explicitly says so.
- No real respondent data goes into this account (Sydney). Real data only in an India-Region account.
- Don't put the test-site password in documents.

## What it is (one paragraph)
Survey platform for field opinion polls (Telangana).
- **Roles:** admin, supervisor, analyst, surveyor (phone app) and client.
- **Questions:** questionnaire builder in Telugu and English with skip logic and "Used for" question roles.
- **Field app:** offline Android/PWA app with consent, audio recording, GPS and photo; IndexedDB outbox.
- **Survey management:** several surveys at once, a team per survey, booth list from Excel, quotas and targets.
- **Monitoring:** live map, fake-interview risk scores and review queue, evening digest.
- **Results and reports:** results, roll-up, comparison, ask-a-question, AI report with approval, client portal.
- **Data protection:** privacy masking, DPDP retention, recording/photo storage with an admin-set deletion period, public API and webhooks.

**Stack:** React 18 + Vite, Node 24 Express + node:sqlite, SSE, Capacitor 7 Android, AWS EC2 + Docker + Caddy.

## AWS: ALL DELETED (2026-11-21)
- **Deleted:**
  - stack `msr-pulse`;
  - by hand: the retained disk, S3 bucket and SSM password.
- The KMS key is scheduled for deletion on 2026-11-28. The test site is gone.
- Nothing billable is left in ap-southeast-2 or us-east-1.
- **To bring it back:** deploy `deploy/aws/msr-pulse-aws.yaml` again (see docs/DEPLOY-AWS.md). The database starts fresh.
- **Sign-in, if needed:** `aws login --profile msr-pulse --region ap-southeast-2`

## GitHub
- Public repo: https://github.com/akshayreddy9/fieldpulse (branch main only; commit email = GitHub noreply). The README brands it "FieldPulse"; the app screens still say MSR Pulse (owner: don't rename and no licence for now).
- Old local branches (app-connect-fixes, client-overview-pdf, real-survey-fixes, recordings-photos) still carry the owner's Gmail address. Don't push them.

## Ship a change (only if work resumes)
1. `npm test`
2. `build-android-apk.bat` (needed only if phone screens changed)
3. `make-release.bat`
4. `.\deploy\aws\update-live-site.ps1`
5. Check `/api/health`.

**Build quirk:** run the .bat files as `env -u NoDefaultCurrentDirectoryInExePath cmd.exe //c "<bat>"` from Bash.

## Reuse ideas (discussed 2026-11-21)
1. **Sell to other clients:** research firms, political consultants, NGOs, CSR teams and government departments in Telugu states.
   - It is already multi-client; replace the MSR branding.
2. **White-label SaaS:**
   - sign-up per organisation and per-interview pricing;
   - move to an India Region (Mumbai);
   - add a DLT SMS provider and a real domain.
3. **Portfolio / case study:**
   - keep the demo site;
   - use the client PDF plus screenshots;
   - put the code on GitHub (private, or public after removing secrets and sample data).
4. **Other field-data uses:** health and ASHA visits, agri surveys, retail audits, customer feedback, election booth monitoring.
   - The engine is generic: builder, offline app, GPS, photo and QA.
5. **Open-source the offline outbox and fake-interview detection** as small libraries.
