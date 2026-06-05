# Personal EC2 t3.micro Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 마음정산 production API server to the user's personal AWS account on a single EC2 `t3.micro` instance with the lowest practical monthly cost.

**Architecture:** Keep the existing architecture: Apps-in-Toss static CSR bundle calls a public HTTPS API domain, and one Next.js 16 Node server runs behind Nginx and PM2. Only the compute host, SSH target, deployment script, and server runtime setup change; the existing PostgreSQL database and application code remain unchanged.

**Tech Stack:** AWS EC2 `t3.micro` x86_64, Ubuntu 24.04 LTS, Node.js 22, Next.js 16 App Router, Prisma 6, PM2, Nginx, Certbot, existing Postgres/Supabase connection strings.

---

## Fixed Assumptions

- AWS personal account is already created.
- Compute target is EC2 `t3.micro`.
- Region should be `ap-northeast-2` if Korean user latency is preferred.
- OS image should be Ubuntu 24.04 LTS x86_64.
- Storage should be gp3 EBS `20GB` minimum.
- The production domain remains `maeum-jungsan.duckdns.org`.
- The existing database is not migrated in this phase.
- The existing AIT client bundle is not rebuilt unless the API domain changes.
- Remote app directory remains `$HOME/maeum-jungsan-aws`.
- PM2 process name remains `maeum-jungsan`.
- App port remains `3000`.
- New SSH alias should be `maeum-jungsan-personal`.

## t3.micro Constraints

`t3.micro` has 1GiB memory, so runtime is acceptable but server-side builds can be tight. The plan therefore requires:

- 2GB swap before `npm install` and `npm run build:next`.
- Nginx and PM2 only; no Docker, no local database, no extra monitoring agents.
- Old server retained for 24-48 hours after cutover.
- If `npm run build:next` fails from OOM twice, stop and choose one fallback:
  - temporarily resize to `t3.small`, build, then resize back only if runtime memory is stable; or
  - change deployment to build artifact upload in a separate plan.

## File And System Scope

**Repository files modified:**
- Modify: `scripts/deploy.sh`

**Repository files not expected to change:**
- `app/api/**`
- `src/lib/prisma.ts`
- `prisma/schema.prisma`
- `next.config.ts`, unless the API domain changes

**Server files created or modified:**
- Create: `/etc/nginx/sites-available/maeum-jungsan`
- Create symlink: `/etc/nginx/sites-enabled/maeum-jungsan`
- Create: `$HOME/maeum-jungsan-aws/.env`
- Create directory: `$HOME/maeum-jungsan-aws/certs`
- Create PM2 process: `maeum-jungsan`

**Local machine configuration:**
- Modify: `$HOME/.ssh/config`

## Task 1: Capture Current Production Baseline

**Purpose:** Make rollback possible before provisioning the new EC2 instance.

- [x] **Step 1: Record current repository revision**

Run locally:

```bash
git status --short
git rev-parse HEAD
git log -1 --oneline
```

Expected:
- `git rev-parse HEAD` prints the exact commit to deploy.
- `git status --short` does not show unexpected app changes.

- [x] **Step 2: Verify current production health**

Run locally:

```bash
curl --silent --show-error --fail https://maeum-jungsan.duckdns.org/api/health
```

Expected:
- Command exits `0`.
- Response contains `"ok":true`.

- [x] **Step 3: Back up current server `.env` and PM2 metadata**

Run locally:

```bash
ssh kmuproj-maeum-jungsan 'cd $HOME/maeum-jungsan-aws && cp .env .env.backup-2026-05-18 && pm2 save && pm2 describe maeum-jungsan > pm2.describe-2026-05-18.txt'
```

Expected:
- Old server contains `.env.backup-2026-05-18`.
- Old server contains `pm2.describe-2026-05-18.txt`.

- [x] **Step 4: Confirm secret and certificate paths**

Run locally:

```bash
ssh kmuproj-maeum-jungsan 'cd $HOME/maeum-jungsan-aws && ls -la .env certs 2>/dev/null && grep -E "^(DATABASE_URL|DIRECT_URL|JWT_SECRET|TOSS_DECRYPT_KEY|TOSS_DECRYPT_AAD|TOSS_CALLBACK_SECRET|CRON_SECRET|GEMINI_API_KEY|RESEND_API_KEY|TOSS_MSG_TEMPLATE_CODE|NEXT_PUBLIC_API_URL|MTLS_CERT_DIR|TOSS_MTLS_CERT_PATH|TOSS_MTLS_KEY_PATH)=" .env | sed "s/=.*/=REDACTED/"'
```

Expected:
- Required env key names are present.
- mTLS cert/key files are under `certs` or explicit `TOSS_MTLS_*` paths are present.

## Task 2: Create EC2 t3.micro In The Personal Account

**Purpose:** Provision the low-cost compute host with stable public addressing.

- [ ] **Step 1: Launch EC2 instance**

Create an EC2 instance with:

```text
Name: maeum-jungsan-api
Instance type: t3.micro
AMI: Ubuntu Server 24.04 LTS x86_64
Storage: 20GB gp3
Public IP: enabled
IAM role: none required for this migration
```

Expected:
- Instance state is `running`.
- A public IPv4 address is assigned.

- [ ] **Step 2: Allocate and associate Elastic IP**

Allocate one Elastic IP in the personal account and associate it to `maeum-jungsan-api`.

Expected:
- The EC2 instance keeps the same public IPv4 after stop/start.
- There are no unused Elastic IPs left allocated.

- [ ] **Step 3: Configure security group**

Allow inbound:

```text
SSH  TCP 22   developer-current-public-ip/32
HTTP TCP 80   0.0.0.0/0
HTTPS TCP 443 0.0.0.0/0
```

Do not allow:

```text
TCP 3000 from 0.0.0.0/0
PostgreSQL 5432 from 0.0.0.0/0
```

Expected:
- SSH is reachable only from the developer IP.
- Nginx can serve HTTP/HTTPS publicly after Task 7.

- [ ] **Step 4: Add local SSH alias**

On the local machine, set these shell variables to the actual values from the EC2 console and local key path:

```bash
NEW_EC2_ELASTIC_IP='203.0.113.10'
PERSONAL_EC2_KEY_PATH="$HOME/.ssh/maeum-jungsan-personal.pem"
```

Then append the SSH alias:

```bash
printf '\nHost maeum-jungsan-personal\n  HostName %s\n  User ubuntu\n  IdentityFile %s\n  IdentitiesOnly yes\n' "$NEW_EC2_ELASTIC_IP" "$PERSONAL_EC2_KEY_PATH" >> "$HOME/.ssh/config"
chmod 600 "$HOME/.ssh/config"
```

Verify:

```bash
ssh maeum-jungsan-personal 'hostname && whoami && uname -m'
```

Expected:
- Output includes `ubuntu`.
- `uname -m` prints `x86_64`.

## Task 3: Prepare t3.micro Runtime

**Purpose:** Install only the required packages and add swap before memory-heavy work.

- [ ] **Step 1: Update OS and install base packages**

Run on the new EC2:

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates build-essential nginx certbot python3-certbot-nginx
```

Expected:
- Command exits successfully.
- `nginx -v` works.
- `certbot --version` works.

- [ ] **Step 2: Install Node.js 22**

Run on the new EC2:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

Expected:
- `node -v` prints `v22.x.x`.
- `npm -v` prints a version.

- [ ] **Step 3: Install PM2**

Run on the new EC2:

```bash
sudo npm install -g pm2
pm2 -v
```

Expected:
- `pm2 -v` prints a version.

- [ ] **Step 4: Add 2GB swap**

Run on the new EC2:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

Expected:
- `free -h` shows around `2.0G` swap.

- [ ] **Step 5: Set conservative journal retention**

Run on the new EC2:

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\nRuntimeMaxUse=100M\n' | sudo tee /etc/systemd/journald.conf.d/maeum-jungsan.conf
sudo systemctl restart systemd-journald
```

Expected:
- Journald logs do not grow unbounded on the 20GB disk.

## Task 4: Move Application Files And Secrets

**Purpose:** Reproduce the current production app on the new EC2.

- [ ] **Step 1: Clone the repository**

Run locally to read the repository URL from the current workspace and clone it on the new EC2:

```bash
REPO_URL="$(git config --get remote.origin.url)"
ssh maeum-jungsan-personal "cd \$HOME && git clone '$REPO_URL' maeum-jungsan-aws && cd maeum-jungsan-aws && git checkout main"
```

Expected:
- `$HOME/maeum-jungsan-aws/package.json` exists.

- [ ] **Step 2: Copy production `.env`**

Run locally:

```bash
ssh kmuproj-maeum-jungsan 'cd $HOME/maeum-jungsan-aws && cat .env' > .tmp-maeum-prod.env
scp .tmp-maeum-prod.env maeum-jungsan-personal:'$HOME/maeum-jungsan-aws/.env'
rm .tmp-maeum-prod.env
ssh maeum-jungsan-personal 'chmod 600 $HOME/maeum-jungsan-aws/.env'
```

Expected:
- New EC2 has `$HOME/maeum-jungsan-aws/.env`.
- Permission is `600`.

- [ ] **Step 3: Copy Toss mTLS certificates**

Run locally:

```bash
ssh maeum-jungsan-personal 'mkdir -p $HOME/maeum-jungsan-aws/certs && chmod 700 $HOME/maeum-jungsan-aws/certs'
scp kmuproj-maeum-jungsan:'$HOME/maeum-jungsan-aws/certs/*' maeum-jungsan-personal:'$HOME/maeum-jungsan-aws/certs/'
ssh maeum-jungsan-personal 'chmod 600 $HOME/maeum-jungsan-aws/certs/*'
```

Expected:
- New EC2 has the Toss private key and certificate files.

- [ ] **Step 4: Validate required env names without printing values**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
grep -E "^(DATABASE_URL|DIRECT_URL|JWT_SECRET|TOSS_DECRYPT_KEY|TOSS_DECRYPT_AAD|TOSS_CALLBACK_SECRET|CRON_SECRET|GEMINI_API_KEY|RESEND_API_KEY)=" .env | sed 's/=.*/=REDACTED/'
```

Expected:
- All listed required keys print once.

## Task 5: Install, Generate Prisma, And Build

**Purpose:** Prove `t3.micro` can build and run the current server.

- [ ] **Step 1: Install dependencies**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
npm install --legacy-peer-deps
```

Expected:
- Install completes.
- `postinstall` runs `prisma generate` or can be rerun manually.

- [ ] **Step 2: Generate Prisma client with env loaded**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
npx prisma generate
```

Expected:
- Prisma client generation succeeds.

- [ ] **Step 3: Apply current manual migrations**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
npx prisma db execute --file prisma/manual-migrations/2026-05-11_add_event_import_fingerprint.sql --url "$DIRECT_URL"
npx prisma db execute --file prisma/manual-migrations/2026-05-11_clear_generated_import_memos.sql --url "$DIRECT_URL"
npx prisma db execute --file prisma/manual-migrations/2026-05-15_add_user_session_version.sql --url "$DIRECT_URL"
npx prisma db execute --file prisma/manual-migrations/2026-05-15_add_payment_order.sql --url "$DIRECT_URL"
```

Expected:
- All commands exit successfully.

- [ ] **Step 4: Verify DB connectivity**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
node -e 'const { PrismaClient } = require("@prisma/client"); const p = new PrismaClient(); p.$queryRaw`SELECT 1`.then(r => { console.log("db ok", r); return p.$disconnect(); }).catch(e => { console.error(e); process.exit(1); });'
```

Expected:
- Output includes `db ok`.

- [ ] **Step 5: Build Next.js server**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
npm run build:next
```

Expected:
- Build completes successfully.

- [ ] **Step 6: Handle t3.micro build OOM if it occurs**

Only if Step 5 fails with out-of-memory or process killed:

```bash
free -h
dmesg -T | tail -50
```

Expected:
- If OOM is confirmed, do not keep retrying indefinitely.
- Temporarily resize the EC2 instance to `t3.small`, rerun Step 5, then decide whether to keep `t3.small` or create a separate build-artifact deployment plan.

## Task 6: Start App With PM2

**Purpose:** Run the Next.js production server locally on port `3000`.

- [ ] **Step 1: Start PM2 process**

Run on the new EC2:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
pm2 start npm --name maeum-jungsan -- start
pm2 save
```

Expected:
- `pm2 list` shows `maeum-jungsan` as `online`.

- [ ] **Step 2: Register PM2 startup**

Run on the new EC2:

```bash
pm2 startup systemd -u "$USER" --hp "$HOME"
```

Then run the command PM2 prints with `sudo`.

Expected:
- PM2 process will restart after EC2 reboot.

- [ ] **Step 3: Verify local health**

Run on the new EC2:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/api/health
```

Expected:
- Response contains `"ok":true`.

## Task 7: Configure Nginx And TLS

**Purpose:** Serve the app through HTTPS on the production domain.

- [ ] **Step 1: Create Nginx site**

Create `/etc/nginx/sites-available/maeum-jungsan` on the new EC2:

```nginx
server {
  listen 80;
  server_name maeum-jungsan.duckdns.org;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

- [ ] **Step 2: Enable Nginx site**

Run on the new EC2:

```bash
sudo ln -sf /etc/nginx/sites-available/maeum-jungsan /etc/nginx/sites-enabled/maeum-jungsan
sudo nginx -t
sudo systemctl reload nginx
```

Expected:
- `nginx -t` succeeds.

- [ ] **Step 3: Point DuckDNS to the new Elastic IP**

Update `maeum-jungsan.duckdns.org` to the new Elastic IP.

Verify locally:

```bash
dig +short maeum-jungsan.duckdns.org
```

Expected:
- Output eventually prints the new Elastic IP.

- [ ] **Step 4: Issue TLS certificate**

Run on the new EC2 after DNS resolves:

```bash
sudo certbot --nginx -d maeum-jungsan.duckdns.org
sudo nginx -t
sudo systemctl reload nginx
```

Expected:
- Certbot succeeds.
- HTTPS certificate is valid.

## Task 8: Production Smoke Test

**Purpose:** Confirm the new EC2 is production-ready before retiring the old host.

- [ ] **Step 1: Verify public health**

Run locally:

```bash
curl --silent --show-error --fail https://maeum-jungsan.duckdns.org/api/health
```

Expected:
- Response contains `"ok":true`.

- [ ] **Step 2: Verify cron endpoints**

Run locally with `CRON_SECRET` loaded from a secure local source:

```bash
curl --silent --show-error --fail -H "Authorization: Bearer $CRON_SECRET" https://maeum-jungsan.duckdns.org/api/cron/expire-grants
curl --silent --show-error -H "Authorization: Bearer $CRON_SECRET" https://maeum-jungsan.duckdns.org/api/cron/event-reminder
```

Expected:
- `expire-grants` returns `"ok":true`.
- `event-reminder` returns `"ok":true` or the known no-template response if template config is absent.

- [ ] **Step 3: Manually test critical app flows**

Test:

```text
1. Toss login
2. /api/auth/me
3. Text analysis
4. Image analysis
5. URL analysis
6. CSV import
7. CSV export download
8. ICS export download/open
9. Credits read, nonce issue, redeem path
10. Logout
```

Expected:
- No critical flow returns HTTP `500`.
- No repeated auth failure occurs after login.

- [ ] **Step 4: Inspect logs**

Run on the new EC2:

```bash
pm2 logs maeum-jungsan --lines 150 --nostream
sudo tail -n 150 /var/log/nginx/error.log
free -h
df -h
```

Expected:
- No required env validation failure.
- No repeated Prisma connection failures.
- No mTLS certificate file missing errors.
- Memory has swap available and process is stable.
- Disk usage is below 70%.

## Task 9: Update Deployment Script For t3.micro Host

**Purpose:** Make future deployments target the personal EC2 instead of the old EC2.

- [ ] **Step 1: Modify `scripts/deploy.sh` host**

In `scripts/deploy.sh`, change:

```bash
EC2_HOST=kmuproj-maeum-jungsan
```

to:

```bash
EC2_HOST=maeum-jungsan-personal
```

Keep:

```bash
EC2_DIR='$HOME/maeum-jungsan-aws'
HEALTH_URL="https://maeum-jungsan.duckdns.org/api/health"
```

unchanged if the domain remains the same.

- [ ] **Step 2: Verify the remote git strategy**

Run locally:

```bash
ssh maeum-jungsan-personal 'cd $HOME/maeum-jungsan-aws && git remote -v && git status --short'
```

Expected:
- `origin` points to a repository the new EC2 can pull from.
- Working tree on the new EC2 is clean before scripted deploy.

- [ ] **Step 3: Run one deploy to the new EC2**

Run locally:

```bash
bash scripts/deploy.sh
```

Expected:
- Remote `git pull`, `npm install`, migrations, `npm run build:next`, and `pm2 restart` complete.
- Health check returns HTTP `200`.

## Task 10: Rollback Window And Cost Cleanup

**Purpose:** Keep the old server available briefly, then remove duplicate costs.

- [ ] **Step 1: Keep the old server running for 24-48 hours**

Do not stop the old EC2 immediately after DNS cutover.

Expected:
- DNS can be pointed back to the old IP if the new `t3.micro` becomes unstable.

- [ ] **Step 2: Monitor the new t3.micro**

Run on the new EC2 during the first day:

```bash
pm2 list
pm2 logs maeum-jungsan --lines 100 --nostream
free -h
df -h
uptime
```

Expected:
- PM2 restart count is stable.
- Swap is not constantly exhausted.
- Disk has enough free space.

- [ ] **Step 3: Roll back if critical production flow fails**

Rollback:

```text
1. Point maeum-jungsan.duckdns.org back to the old server public IP.
2. Wait until dig +short maeum-jungsan.duckdns.org shows the old IP.
3. Confirm https://maeum-jungsan.duckdns.org/api/health returns ok.
4. Debug the new EC2 only after production traffic is restored.
```

- [ ] **Step 4: Decommission old compute and unused IPs**

After 24-48 stable hours:

```bash
ssh kmuproj-maeum-jungsan 'pm2 stop maeum-jungsan && pm2 save'
```

Then in AWS console:

```text
1. Stop or terminate the old EC2 instance.
2. Release unused Elastic IPs.
3. Delete old unattached EBS volumes if any.
4. Confirm Billing > Cost Explorer no longer shows duplicate compute/IP usage.
```

Expected:
- Only the personal `t3.micro` remains active for this app.

## Completion Criteria

Migration is complete only when:

- `https://maeum-jungsan.duckdns.org/api/health` returns HTTP `200`.
- `pm2 list` on the new EC2 shows `maeum-jungsan` online.
- Nginx TLS is valid for `maeum-jungsan.duckdns.org`.
- Toss login works.
- AI text/image/URL analysis works.
- CSV and ICS export work.
- Cron endpoints work with `CRON_SECRET`.
- `scripts/deploy.sh` deploys to `maeum-jungsan-personal`.
- Old server rollback window has passed.
- Old compute, unused Elastic IPs, and unattached volumes are removed.
