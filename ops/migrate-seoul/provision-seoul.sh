#!/bin/bash
# 서울 리전 신규 EC2(Amazon Linux 2023) 프로비저닝
# 새 인스턴스에서 ec2-user로 실행. 기존 us-east-1 서버 구성과 동일하게 맞춘다:
#   node 22 / pm2 / nginx 리버스 프록시(:3000) / certbot
set -euo pipefail

REPO_URL=${REPO_URL:-}   # 비우면 레포는 수동으로 git push aws main (deploy.sh 방식)
APP_DIR="$HOME/maeum-jungsan-aws"
DOMAIN="maeum-jungsan.duckdns.org"

echo "==> 1/5 시스템 패키지"
sudo dnf install -y nginx git augeas-libs
sudo python3 -m venv /opt/certbot 2>/dev/null || true
sudo /opt/certbot/bin/pip install -q certbot certbot-nginx
sudo ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

echo "==> 2/5 node 22 + pm2"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo dnf install -y nodejs
fi
sudo npm install -g pm2

echo "==> 3/5 앱 디렉토리"
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  mkdir -p "$APP_DIR"
  if [ ! -d "$APP_DIR/.git" ]; then
    git init --initial-branch=main "$APP_DIR"
    git -C "$APP_DIR" config receive.denyCurrentBranch updateInstead
    echo "    레포가 비어 있음 — 로컬에서: git remote add aws-seoul ec2-user@<새IP>:$APP_DIR && git push aws-seoul main"
  fi
fi

echo "==> 4/5 nginx 리버스 프록시 (${DOMAIN} → :3000)"
sudo tee /etc/nginx/conf.d/maeum-jungsan.conf >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
NGINX
sudo systemctl enable --now nginx
sudo nginx -t && sudo systemctl reload nginx

echo "==> 5/5 안내"
cat <<'NEXT'
남은 수동 단계:
  1. 기존 서버에서 .env 복사 후 DATABASE_URL/DIRECT_URL을 서울 Supabase로 교체
       scp maeum-jungsan-personal:~/maeum-jungsan-aws/.env ./env.old  (로컬 경유)
  2. TLS 무중단 이식 (DNS 전환 전 HTTPS 동작):
       기존 서버 /etc/letsencrypt 의 live/archive/renewal(maeum-jungsan.duckdns.org)을
       새 서버 동일 경로로 복사 → nginx conf에 443 블록은 certbot이 만든 기존 형태 그대로 추가
       (또는 DNS 전환 직후 certbot --nginx -d maeum-jungsan.duckdns.org 재발급)
  3. 빌드 & 기동:
       cd ~/maeum-jungsan-aws && npm install --legacy-peer-deps && npm run build:next
       pm2 start npm --name maeum-jungsan -- start && pm2 save
       pm2 startup  # 출력된 sudo 명령 실행
  4. 검증: curl -sk https://127.0.0.1/api/health -H 'Host: maeum-jungsan.duckdns.org'
  5. duckdns에서 IP 전환
NEXT
