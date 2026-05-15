import https from 'https';
import fs from 'fs';

const TOSS_MESSENGER_BASE = 'https://apps-in-toss-api.toss.im';

/**
 * mTLS 인증서를 포함한 토스 메신저 API fetch 헬퍼
 * 인증서 파일이 없으면 plain fetch로 폴백 (샌드박스/로컬 개발용)
 */
export async function tossMessengerFetch(
  endpoint: string,
  options: { method: string; headers: Record<string, string>; body?: string }
): Promise<any> {
  const certPath = process.env.TOSS_MTLS_CERT_PATH?.trim();
  const keyPath = process.env.TOSS_MTLS_KEY_PATH?.trim();

  // 인증서 없으면 plain fetch 폴백 (샌드박스 환경)
  if (!certPath || !keyPath || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    const res = await fetch(`${TOSS_MESSENGER_BASE}${endpoint}`, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });
    return res.json();
  }

  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);

  return new Promise((resolve, reject) => {
    const url = new URL(`${TOSS_MESSENGER_BASE}${endpoint}`);
    const reqOptions: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: options.method,
      headers: options.headers,
      cert,
      key,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse error: ${data}`)); }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
