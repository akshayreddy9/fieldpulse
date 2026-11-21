# MSR Pulse — Short Handoff (read this first)

Last updated: **2026-11-21** · Full detail (code map, AWS, history, commands): `docs/HANDOFF-FULL.md`. Open it only when a task needs it.

## Status
- **The client (MSR) cancelled the project on 2026-11-21.** The product is feature-complete for a demo: about 88% of features, about 73% overall.
- The code is on git branch `main` (clean). Tests: `npm test` (41 pass).
- Deliverables made:
  - `docs/MSR-Pulse-System-Overview.pdf` (34-page client guide);
  - `MSR-Pulse-Test-Checklist-v2.xlsx` (105 tests).
- Owner decision pending: what to do with the AWS test site (keep, stop or delete) and whether to reuse the product (see "Reuse ideas").

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

## AWS (still running, costs money)
- **Account:** profile `msr-pulse`, Region ap-southeast-2. CloudFormation stack `msr-pulse`.
  - EC2 t3.small `i-00f5b84673c49f226`, Elastic IP 13.210.51.39.
  - S3 bucket `msr-pulse-bucket-mzalppajffls`, KMS key, SSM `/msr-pulse/env/*`.
- **Site:** https://13-210-51-39.sslip.io (password-gated).
- **Cost:** about $20–25/month, paid from the free-plan credit ($100, until 2027-05-18).
- **Sign-in:** `"$LOCALAPPDATA/Programs/Amazon/AWSCLIV2/aws.exe" login --profile msr-pulse --region ap-southeast-2` (the owner approves in the browser).
- **Options for the owner:**
  - Stop the EC2 instance: compute cost stops, but you still pay about $3.6/month for the Elastic IP plus a little for the disk.
  - Delete the stack: everything goes, and the code stays on the PC. Empty the S3 bucket first.
  - Keep the site as a portfolio demo.

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
