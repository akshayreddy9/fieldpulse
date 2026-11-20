# MSR Pulse on AWS: step by step

Everything is done in the AWS website (console). No command-line tools are needed.

**What gets created** (from one template, `deploy/aws/msr-pulse-aws.yaml`), in MSR's own AWS account, in an India region:

| Part | Detail |
|---|---|
| Server | 1 × EC2 `t3.small` running MSR Pulse in Docker. HTTPS certificate created and renewed automatically |
| Disk | 30 GB, **encrypted with an MSR-owned key** (KMS); kept even if the server is deleted |
| Backups | Every night at 03:00 IST to an encrypted S3 bucket; kept 90 days |
| Updates | Upload a new `msr-pulse-release.zip` to S3, and the server installs it within 5 minutes |
| Security | Only web ports open (no SSH). Admin access to the server through the browser (Session Manager) |
| Cost | About **US$25 per month** (≈ ₹2,100) for testing and early fieldwork |

---

## Part 1: One-time preparation (MSR)

1. **AWS account in MSR's name.** Turn on MFA (two-step login) for the root user. Create an IAM user with administrator rights for daily work, and use that user from now on.
2. In the top-right corner of the console, choose the region **Asia Pacific (Mumbai) ap-south-1** (or **Hyderabad ap-south-2**). All steps below happen in this region.
3. Recommended: **Billing → Budgets → Create budget** for US$40/month with an email alert.

## Part 2: Create the server (test week, with sample data)

1. Open **CloudFormation → Create stack → With new resources**.
2. Choose **Upload a template file**, and select `deploy/aws/msr-pulse-aws.yaml` from the MSR Pulse folder.
3. Stack name: `msr-pulse`. Parameters:
   - **Mode:** `Testing`
   - **SitePassword:** a password for testers, e.g. `msr-test-2026` (required in Testing mode)
   - **AdminPhone / AdminName:** MSR's real first admin (used later, when going live)
   - **DomainName:** leave empty for now (or e.g. `pulse.yourdomain.in`; see Part 6)
   - **InstanceType:** `t3.small`
4. Click Next twice, tick **"I acknowledge that AWS CloudFormation might create IAM resources"**, then **Submit**.
5. Wait until the status is **CREATE_COMPLETE** (about 5 minutes). Open the **Outputs** tab and note:
   - **ElasticIP**, e.g. `13.232.45.67`
   - **ReleaseUploadLocation**, the bucket name

## Part 3: Upload MSR Pulse

1. On the PC with the MSR Pulse folder, double-click **`make-release.bat`**. It runs all tests and creates `msr-pulse-release.zip`.
2. In the console, open **S3 → the bucket from the Outputs → Create folder** named `release`. Open the folder and **Upload** `msr-pulse-release.zip`.
3. Wait **about 10 minutes** (the first install builds the app).
4. Open **`https://` + the Elastic IP with dashes + `.sslip.io`**. For example, IP `13.232.45.67` becomes **https://13-232-45-67.sslip.io**.
5. You'll see the test-site password page. Enter the SitePassword, then use **"Try a demo account"**.

## Part 4: The test week

- Share the address and the site password with the testers. Everything works as in the demo, from any place, on laptops, Android and iPhone.
- The Android app: in the app, tap **Connect to an MSR Pulse server**, enter the address, then the site password.
- **Changes during the week:** change the code, run `make-release.bat`, upload the new zip to the same `release` folder (replace it). It goes live within 5 minutes.

## Part 5: Go live (after the test week)

**Before going live you need an SMS gateway.** In live mode, login codes are sent by SMS. In India this needs a DLT-registered sender ID and message template (MSG91, Twilio, Gupshup and others). Give the gateway details to the developer to connect. MSR Pulse sends `{to, message}` to a webhook address, and a small adapter may be needed for the chosen gateway.

1. **Add the SMS settings:** open **Systems Manager → Parameter Store → Create parameter**, type **SecureString**:
   - `/msr-pulse/env/SMS_WEBHOOK_URL`: the gateway address
   - `/msr-pulse/env/SMS_WEBHOOK_TOKEN`: the gateway key
   - optional `/msr-pulse/env/ANTHROPIC_API_KEY`: turns on Claude for report drafting
2. **CloudFormation → msr-pulse → Update → Use existing template.** Set **Mode = `Live`**, **SitePassword = empty**, then **Submit**.
3. **Systems Manager → Session Manager → Start session**, choose the server `msr-pulse-…`, then type:
   ```
   sudo msr-go-live
   ```
   Type **GO LIVE** when asked. This:
   - saves a final backup of all test data to S3 (folder `test-week-archive-<date>`);
   - removes the sample surveys, test interviews and demo logins;
   - restarts MSR Pulse **empty**.
4. Sign in with the **AdminPhone** (a real SMS code arrives). Then:
   1. **Who can see what → People & logins:** add staff and clients.
   2. **Surveyors & team:** upload the surveyor Excel file.
   3. **Surveys → New survey:** create the survey, edit the questionnaire, set targets, then **Start fieldwork**.

## Part 6: Own domain (recommended for live)

1. Buy a domain, e.g. `msrpulse.in`, from any registrar.
2. In the registrar's DNS settings, add an **A record**: name `pulse`, value = the **ElasticIP**.
3. **CloudFormation → Update → DomainName = `pulse.msrpulse.in`**.
4. Session Manager: `sudo msr-deploy --force`. The HTTPS certificate is created automatically.

## Backups and restore

- **Automatic:** every night to `s3://<bucket>/backups/`, kept 90 days (older versions 30 days).
- **Manual backup now:** Session Manager → `sudo msr-backup`
- **Restore:** download the `.db` file from S3, then (Session Manager):
  ```
  sudo docker stop msr-app
  sudo aws s3 cp s3://<bucket>/backups/<file>.db /srv/msr-data/msr-pulse.db
  sudo rm -f /srv/msr-data/msr-pulse.db-wal /srv/msr-data/msr-pulse.db-shm
  sudo chown 1000:1000 /srv/msr-data/msr-pulse.db && sudo docker start msr-app
  ```

## If something is not working

| Check | Session Manager command |
|---|---|
| Did the release install? | `sudo tail -30 /var/log/msr-deploy.log` |
| Is the app running? | `sudo docker ps` |
| App error messages | `sudo docker logs msr-app --tail 50` |
| HTTPS certificate problems | `sudo docker logs msr-caddy --tail 50` |
| Reinstall the current release | `sudo msr-deploy --force` |

## Removing everything (e.g. a personal demo account after moving to MSR's account)

Do this only after MSR's own installation is running.

1. **CloudFormation → msr-pulse → Delete.** This removes the server, fixed IP, firewall, settings and permissions.
2. Two things are deliberately kept so data is never lost by accident. Delete them yourself:
   - **S3** → the msr-pulse bucket → **Empty**, then **Delete**.
   - **EC2 → Volumes** → the 30 GB volume with status *available* → **Delete**.
3. **KMS → Customer managed keys** → the msr-pulse key → **Schedule key deletion** (7 days).
4. Check **Billing** the next day to confirm nothing is still running.

## Before real respondent data (from the requirements)

- Security audit by a **CERT-In empanelled auditor**.
- Team training.
- Confirm the retention period on **Security & DPDP**.
