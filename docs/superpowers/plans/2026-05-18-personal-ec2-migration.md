# Personal EC2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 마음정산 production Next.js API server from the current EC2 host to a low-cost personal compute instance while keeping the existing database, Toss integration, and AIT client flow intact.

**Architecture:** Keep the current split architecture: Apps-in-Toss static WebView bundle calls a public HTTPS API domain, and the API runs as a single Next.js 16 Node server behind Nginx and PM2. The migration changes the compute host and deployment configuration only; it does not move the PostgreSQL database or rewrite the app to serverless.

**Tech Stack:** Next.js 16 App Router, Node.js 22, Prisma 6, PM2, Nginx, Certbot, Ubuntu 24.04 LTS or Amazon Linux 2023, Lightsail/EC2, existing PostgreSQL connection strings.

---

## Migration Constants

Use these names unless there is a concrete reason to change them:

- SSH alias: `maeum-jungsan-personal`
- Remote app directory: `$HOME/maeum-jungsan-aws`
- App process name: `maeum-jungsan`
- App port: `3000`
- Production health URL: `https://maeum-jungsan.duckdns.org/api/health`
- Production domain: `maeum-jungsan.duckdns.org`
- Recommended compute: Lightsail `Small-2GB Linux with public IPv4` for first month, then downgrade to `Micro-1GB` after memory observation

## File And System Scope

**Repository files likely modified:**
- Modify: `scripts/deploy.sh`
- Optional modify: `next.config.ts` only if the API domain changes and `NEXT_PUBLIC_API_URL` needs an AIT rebuild path adjustment
- No changes expected: `app/api/**`, `src/lib/prisma.ts`, `prisma/schema.prisma`

**Server-only files created or modified:**
- Create: `/etc/nginx/sites-available/maeum-jungsan`
- Create symlink: `/etc/nginx/sites-enabled/maeum-jungsan`
- Create: `$HOME/maeum-jungsan-aws/.env`
- Create directory: `$HOME/maeum-jungsan-aws/certs`
- Create PM2 process: `maeum-jungsan`

**Local machine configuration:**
- Modify: `$HOME/.ssh/config`
- Optional modify: local git remote named `personal-ec2`

## Task 1: Freeze Current Production State

**Purpose:** Capture the current working production configuration before touching DNS or the old server.

- [ ] **Step 1: Record current git revision**

Run locally:

```bash
git status --short
git rev-parse HEAD
git log -1 --oneline
```

Expected:
- `git status --short` only shows known local scratch files or is clean.
- `git rev-parse HEAD` returns the commit that will be deployed to the new server.

- [ ] **Step 2: Verify current production health**

Run locally:

```bash
curl --silent --show-error https://maeum-jungsan.duckdns.org/api/health
```

Expected:
- JSON response with `"ok":true`.

- [ ] **Step 3: Back up current server runtime configuration**

Run locally against the current EC2 alias:

```bash
ssh kmuproj-maeum-jungsan 'cd $HOME/maeum-jungsan-aws && cp .env .env.backup-2026-05-18 && pm2 save && pm2 describe maeum-jungsan > pm2.describe-2026-05-18.txt'
```

Expected:
- `.env.backup-2026-05-18` exists on the old server.
- `pm2.describe-2026-05-18.txt` exists on the old server.

- [ ] **Step 4: Export current environment and certificate inventory**

Run locally:

```bash
ssh kmuproj-maeum-jungsan 'cd $HOME/maeum-jungsan-aws && ls -la .env certs 2>/dev/null && grep -E "^(DATABASE_URL|DIRECT_URL|JWT_SECRET|TOSS_DECRYPT_KEY|TOSS_DECRYPT_AAD|TOSS_CALLBACK_SECRET|CRON_SECRET|GEMINI_API_KEY|RESEND_API_KEY|TOSS_MSG_TEMPLATE_CODE|NEXT_PUBLIC_API_URL|MTLS_CERT_DIR|TOSS_MTLS_CERT_PATH|TOSS_MTLS_KEY_PATH)=" .env | sed "s/=.*/=<set>/"'
```

Expected:
- Required env key names are present.
- Toss mTLS cert/key file paths are visible or `MTLS_CERT_DIR` points to `certs`.

## Task 2: Provision The Personal Compute Instance

**Purpose:** Create a low-cost host sized for a small Next.js API server.

- [ ] **Step 1: Create the instance**

Create one of these:
- Recommended: Lightsail `Small-2GB Linux with public IPv4`
- Cost-minimum after validation: Lightsail `Micro-1GB Linux with public IPv4`
- EC2 alternative: `t4g.micro` or `t3.micro` with 20-30GB gp3 EBS

Expected:
- Instance has a static public IPv4 address.
- OS is Ubuntu 24.04 LTS or Amazon Linux 2023.

- [ ] **Step 2: Configure firewall/security group**

Allow:
- TCP `22` only from the developer IP.
- TCP `80` from `0.0.0.0/0`.
- TCP `443` from `0.0.0.0/0`.

Do not allow:
- TCP `3000` from public internet.

Expected:
- SSH works from the developer machine.
- Port `3000` is not publicly reachable.

- [ ] **Step 3: Add local SSH alias**

Add this to `$HOME/.ssh/config` on the developer machine:

```sshconfig
Host maeum-jungsan-personal
  HostName <new-static-ip-address>
  User ubuntu
  IdentityFile ~/.ssh/<personal-ec2-key>
  IdentitiesOnly yes
```

Expected:

```bash
ssh maeum-jungsan-personal 'hostname && whoami'
```

prints the new server hostname and `ubuntu`.

## Task 3: Prepare The Server Runtime

**Purpose:** Install runtime packages and make the small instance stable under Next.js builds.

- [ ] **Step 1: Update packages**

Run on the new server:

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates build-essential nginx certbot python3-certbot-nginx
```

Expected:
- Command exits successfully.
- `nginx -v` and `certbot --version` work.

- [ ] **Step 2: Install Node.js 22**

Run on the new server:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

Expected:
- `node -v` prints `v22.x.x`.

- [ ] **Step 3: Install PM2**

Run on the new server:

```bash
sudo npm install -g pm2
pm2 -v
```

Expected:
- `pm2 -v` prints a version.

- [ ] **Step 4: Add swap for small-memory builds**

Run on the new server:

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

## Task 4: Clone And Configure The App

**Purpose:** Put the same application and secrets on the new host without changing application behavior.

- [ ] **Step 1: Clone the repository**

Run on the new server:

```bash
cd $HOME
git clone <repository-git-url> maeum-jungsan-aws
cd maeum-jungsan-aws
git checkout main
```

Expected:
- `$HOME/maeum-jungsan-aws/package.json` exists.

- [ ] **Step 2: Copy `.env` from old server to new server**

Run locally:

```bash
ssh kmuproj-maeum-jungsan 'cd $HOME/maeum-jungsan-aws && cat .env' > .tmp-maeum-prod.env
scp .tmp-maeum-prod.env maeum-jungsan-personal:'$HOME/maeum-jungsan-aws/.env'
rm .tmp-maeum-prod.env
ssh maeum-jungsan-personal 'chmod 600 $HOME/maeum-jungsan-aws/.env'
```

Expected:
- New server has `$HOME/maeum-jungsan-aws/.env` with permission `600`.

- [ ] **Step 3: Copy Toss mTLS certificates**

Run locally:

```bash
ssh maeum-jungsan-personal 'mkdir -p $HOME/maeum-jungsan-aws/certs && chmod 700 $HOME/maeum-jungsan-aws/certs'
scp kmuproj-maeum-jungsan:'$HOME/maeum-jungsan-aws/certs/*' maeum-jungsan-personal:'$HOME/maeum-jungsan-aws/certs/'
ssh maeum-jungsan-personal 'chmod 600 $HOME/maeum-jungsan-aws/certs/*'
```

Expected:
- New server has the Toss private key and public certificate under `certs`.

- [ ] **Step 4: Install dependencies and generate Prisma client**

Run on the new server:

```bash
cd $HOME/maeum-jungsan-aws
npm install --legacy-peer-deps
set -a
. ./.env
set +a
npx prisma generate
```

Expected:
- `npx prisma generate` completes successfully.

## Task 5: Apply Database Migrations Safely

**Purpose:** Ensure the new server can apply existing idempotent manual migrations using `DIRECT_URL`.

- [ ] **Step 1: Apply current manual migrations**

Run on the new server:

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
- If a migration has already been applied, it exits without destructive changes because the current migration files are intended to be re-runnable.

- [ ] **Step 2: Verify DB connectivity**

Run on the new server:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRaw\`SELECT 1\`.then(r => { console.log('db ok', r); return p.\$disconnect(); }).catch(e => { console.error(e); process.exit(1); });"
```

Expected:
- Output includes `db ok`.

## Task 6: Build And Start The Next.js Server

**Purpose:** Bring the new server up on localhost before exposing it through Nginx.

- [ ] **Step 1: Build server bundle**

Run on the new server:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
npm run build:next
```

Expected:
- Build exits successfully.

- [ ] **Step 2: Start under PM2**

Run on the new server:

```bash
cd $HOME/maeum-jungsan-aws
set -a
. ./.env
set +a
pm2 start npm --name maeum-jungsan -- start
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME"
```

Expected:
- `pm2 list` shows `maeum-jungsan` as `online`.

- [ ] **Step 3: Verify local health**

Run on the new server:

```bash
curl --silent --show-error http://127.0.0.1:3000/api/health
```

Expected:
- JSON response with `"ok":true`.

## Task 7: Configure Nginx And TLS

**Purpose:** Expose the app over HTTPS with the production domain.

- [ ] **Step 1: Create Nginx site**

Create `/etc/nginx/sites-available/maeum-jungsan` on the new server:

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

Run on the new server:

```bash
sudo ln -sf /etc/nginx/sites-available/maeum-jungsan /etc/nginx/sites-enabled/maeum-jungsan
sudo nginx -t
sudo systemctl reload nginx
```

Expected:
- `nginx -t` reports syntax is OK.

- [ ] **Step 3: Point DNS to the new server**

Update `maeum-jungsan.duckdns.org` to the new static public IPv4 address.

Expected:

```bash
dig +short maeum-jungsan.duckdns.org
```

prints the new static public IPv4 address after DNS propagation.

- [ ] **Step 4: Issue TLS certificate**

Run on the new server:

```bash
sudo certbot --nginx -d maeum-jungsan.duckdns.org
sudo nginx -t
sudo systemctl reload nginx
```

Expected:
- Certbot completes successfully.
- `https://maeum-jungsan.duckdns.org/api/health` uses a valid certificate.

## Task 8: Run Production Smoke Tests

**Purpose:** Confirm the new server handles the app's critical paths before the old server is decommissioned.

- [ ] **Step 1: Verify public health**

Run locally:

```bash
curl --silent --show-error https://maeum-jungsan.duckdns.org/api/health
```

Expected:
- JSON response with `"ok":true`.

- [ ] **Step 2: Verify cron endpoints with internal auth**

Run locally after reading `CRON_SECRET` from the secure local secret store:

```bash
curl --silent --show-error -H "Authorization: Bearer $CRON_SECRET" https://maeum-jungsan.duckdns.org/api/cron/expire-grants
curl --silent --show-error -H "Authorization: Bearer $CRON_SECRET" https://maeum-jungsan.duckdns.org/api/cron/event-reminder
```

Expected:
- `expire-grants` returns JSON with `"ok":true`.
- `event-reminder` returns either `"ok":true` or `"reason":"no_template_configured"` if template config is intentionally absent.

- [ ] **Step 3: Verify user-facing app flows**

Test manually in Toss/dev browser:
- Toss login completes.
- `/api/auth/me` returns authenticated user.
- Text analysis works.
- Image analysis works.
- URL analysis works.
- CSV import inserts or skips records correctly.
- CSV export download URL returns a file.
- ICS export opens or downloads.
- Logout clears local state and server session.

Expected:
- No `500` responses in the browser network panel for the above flows.

- [ ] **Step 4: Inspect server logs**

Run on the new server:

```bash
pm2 logs maeum-jungsan --lines 100 --nostream
sudo tail -n 100 /var/log/nginx/error.log
```

Expected:
- No repeated Prisma connection failures.
- No missing env validation errors.
- No Toss mTLS file-not-found errors.

## Task 9: Update Deployment Automation

**Purpose:** Make future deploys target the personal server.

- [ ] **Step 1: Edit `scripts/deploy.sh` host constants**

Modify:

```bash
EC2_HOST=kmuproj-maeum-jungsan
EC2_DIR='$HOME/maeum-jungsan-aws'
```

to:

```bash
EC2_HOST=maeum-jungsan-personal
EC2_DIR='$HOME/maeum-jungsan-aws'
```

Keep:

```bash
HEALTH_URL="https://maeum-jungsan.duckdns.org/api/health"
```

unchanged if the production domain remains the same.

- [ ] **Step 2: Confirm remote git pull strategy**

Use one of these strategies and keep it consistent:

Strategy A, remote server pulls from GitHub:

```bash
ssh maeum-jungsan-personal 'cd $HOME/maeum-jungsan-aws && git remote -v && git pull origin main'
```

Strategy B, local machine pushes to a bare repo on the personal server:

```bash
git remote add personal-ec2 maeum-jungsan-personal:maeum-jungsan.git
git push personal-ec2 main
```

Expected:
- `scripts/deploy.sh` uses the strategy that is actually configured.

- [ ] **Step 3: Run deploy script against the new server**

Run locally:

```bash
bash scripts/deploy.sh
```

Expected:
- Remote install/build/restart completes.
- Health check returns HTTP `200`.
- AIT bundle rebuild is skipped unless client files changed.

## Task 10: Rollback And Decommission

**Purpose:** Keep rollback available until real traffic proves stable.

- [ ] **Step 1: Keep old server running for 24-48 hours**

Do not stop or terminate the old EC2 immediately after DNS cutover.

Expected:
- Old server remains available for emergency DNS rollback.

- [ ] **Step 2: Monitor new server**

Run on the new server during the first day:

```bash
pm2 monit
df -h
free -h
pm2 logs maeum-jungsan --lines 100 --nostream
```

Expected:
- Memory does not stay near 100%.
- Disk has more than 30% free space.
- PM2 restarts count remains stable.

- [ ] **Step 3: Roll back if critical flow fails**

Rollback procedure:

```text
1. Point maeum-jungsan.duckdns.org back to the old server public IP.
2. Wait for DNS propagation.
3. Confirm https://maeum-jungsan.duckdns.org/api/health returns ok from the old server.
4. Stop debugging the new server only after user-facing traffic is restored.
```

- [ ] **Step 4: Decommission old server after stable window**

After 24-48 hours with no critical errors:

```bash
ssh kmuproj-maeum-jungsan 'pm2 stop maeum-jungsan && pm2 save'
```

Then stop or terminate the old compute resource from the AWS console.

Expected:
- Only the personal server remains active.
- Billing no longer includes the old EC2 instance or unused Elastic IP.

## Verification Summary

Before declaring migration complete, all of these must be true:

- `https://maeum-jungsan.duckdns.org/api/health` returns HTTP `200`.
- `pm2 list` on the new server shows `maeum-jungsan` online.
- Nginx has no repeated upstream errors.
- Toss login works.
- AI text/image/URL analysis works.
- CSV/ICS export works.
- Cron endpoints work with `CRON_SECRET`.
- `scripts/deploy.sh` deploys to the new server and passes health check.
- Old server rollback path has been kept for at least 24 hours after cutover.
