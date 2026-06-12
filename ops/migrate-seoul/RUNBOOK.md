# 서울 리전(ap-northeast-2) 이전 런북

## 왜
- 현재 EC2(us-east-1, Ashburn)와 Supabase(aws-1-us-east-1)가 미국에 있어 한국 유저의 모든 API 왕복이 태평양을 건넘.
- 실측: 클라→서버 TLS 핸드셰이크 0.4~0.8s, EC2→토스 API TLS 0.39s. 첫 로그인 체인 2~3초.
- 서울 이전 시 전 구간이 수 ms~수십 ms로 단축.

## 전제
- 도메인 `maeum-jungsan.duckdns.org`는 유지 → AIT 번들의 `NEXT_PUBLIC_API_URL` 변경 불필요. 컷오버는 duckdns IP 변경뿐.
- 기존 us-east-1 EC2에는 finproof(:3001)도 함께 떠 있으므로 **인스턴스를 내리지 말 것**. 마음정산만 이전.
- 데이터 규모: User 411행 + Event/Transaction 수백 행 → pg_dump/restore 수 초.

## 사전 준비 (사용자 작업)
1. **AWS**: 서울 리전에 EC2 1대 생성
   - 리전 `ap-northeast-2`, Amazon Linux 2023, `t3.micro`(현재와 동일), 스토리지 16GB+
   - 보안그룹: 인바운드 22(내 IP), 80, 443(전체)
   - Elastic IP 할당 권장 (재부팅 시 IP 변동 방지)
   - 키페어: 기존 `maeum-jungsan.pem` 재사용 가능하면 동일 키 등록
2. **Supabase**: 서울 리전 신규 프로젝트 생성
   - Dashboard → New project → Region: `Northeast Asia (Seoul)`
   - 생성 후 Connect 화면에서 두 URL 확보:
     - Transaction pooler (port 6543) → 새 `DATABASE_URL`
     - Session pooler (port 5432) → 새 `DIRECT_URL`

## 이전 절차 (Claude가 실행 가능)
### 1. DB 이전 — `migrate-db.sh`
```bash
OLD_DIRECT_URL='<기존 .env의 DIRECT_URL>' NEW_DIRECT_URL='<새 서울 DIRECT_URL>' ./migrate-db.sh
```
- pg_dump(스키마+데이터) → 새 프로젝트 restore → 행 수 대조 검증까지 수행.
- 컷오버 직전에 한 번 더 실행해 증분 반영(전체 재적재 방식, 수 초).

### 2. 새 서버 프로비저닝 — `provision-seoul.sh`
```bash
scp provision-seoul.sh ec2-user@<새IP>:~ && ssh ec2-user@<새IP> ./provision-seoul.sh
```
- node 22 + pm2 + nginx + certbot 설치, 레포 clone, nginx 리버스 프록시 구성.

### 3. .env 이식
- 기존 서버 `~/maeum-jungsan-aws/.env` 복사 → `DATABASE_URL`/`DIRECT_URL`만 새 서울 Supabase 값으로 교체.

### 4. TLS 무중단 이식
- 기존 서버 `/etc/letsencrypt`(live/archive/renewal)를 새 서버로 복사 → DNS 전환 전에 HTTPS 즉시 동작.
- 전환 후 `certbot renew --dry-run`으로 갱신 경로 확인.

### 5. 빌드 & 기동
```bash
cd ~/maeum-jungsan-aws && npm install --legacy-peer-deps && npm run build:next
pm2 start npm --name maeum-jungsan -- start && pm2 save && pm2 startup
```

### 6. 검증 (DNS 전환 전)
```bash
curl -sk https://<새IP>/api/health -H 'Host: maeum-jungsan.duckdns.org'
# {"ok":true, db ok} 확인 + /api/auth/me 401 응답속도 확인
```

### 7. 컷오버
- duckdns.org 로그인 → `maeum-jungsan` 도메인 IP를 새 Elastic IP로 변경 (TTL 60s).
- 5분간 신규 서버 pm2 로그 모니터링, 헬스체크/로그인/기록저장 스모크.
- DB는 이미 신규를 바라보므로 전환 중 이중쓰기 없음. 전환 직전 `migrate-db.sh` 재실행으로 최신화.

### 8. 마무리
- 기존 서버에서 `pm2 stop maeum-jungsan` (finproof는 유지).
- 모니터링 1일 후 기존 프로세스 삭제. us-east-1 Supabase 프로젝트는 1주 보관 후 pause.

## 롤백
- duckdns IP를 기존 서버로 되돌리고 기존 pm2 재시작. DB를 되돌리려면 역방향 dump/restore (수 초).
