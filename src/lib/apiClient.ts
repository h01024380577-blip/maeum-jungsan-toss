/**
 * CSR 대응 API 클라이언트
 * - NEXT_PUBLIC_API_URL base (CSR 빌드 시 절대 URL, dev 시 '' 상대경로)
 * - Bearer 토큰 자동 첨부 (로그인 사용자)
 * - x-user-id 헤더 자동 첨부 (게스트)
 * - 크레딧 차감 API 호출 후 자동으로 store.refreshCredits() 호출
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const TOKEN_KEY = 'heartbook-auth-token';

// --- 크레딧 동기화 훅 (서버에서 크레딧이 변경되는 API 경로 목록) ---

/**
 * 이 경로들을 호출한 뒤에는 클라 store의 크레딧 상태를 반드시 재동기화해야 한다.
 * (서버는 차감했지만 클라 배지가 옛 값을 유지해 "차감 안 됨"으로 오인되던 버그 방지)
 */
const CREDIT_SYNC_PATHS = [
  '/api/parse-url',
  '/api/analyze',
  '/api/parse-deposit-image',
  '/api/entries/bulk',
  '/api/credits/ad-redeem',
  '/api/credits/ad-nonce',
];

let creditRefreshHook: (() => void) | null = null;

/** store 초기화 시 한 번 호출해 refreshCredits 함수를 등록. 순환 import 방지용. */
export function registerCreditRefreshHook(fn: () => void): void {
  creditRefreshHook = fn;
}

// --- Token 관리 ---

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
}

// --- Guest ID ---

async function getGuestId(): Promise<string> {
  try {
    const { getDeviceId } = await import('@apps-in-toss/web-framework');
    const deviceId = await getDeviceId();
    if (deviceId) return deviceId;
  } catch {}

  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('heartbook-device-id');
    if (stored) return stored;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('heartbook-device-id', id);
    return id;
  }
  return 'unknown';
}

// --- Fetch wrapper ---

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['x-user-id'] = await getGuestId();
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 크레딧 영향 경로를 호출한 뒤에는 서버-클라 잔고를 재동기화한다.
  // 성공/실패 무관하게 호출 (402/503 환불 케이스도 서버 잔고가 바뀔 수 있음).
  if (creditRefreshHook && CREDIT_SYNC_PATHS.some((p) => path.startsWith(p))) {
    try {
      creditRefreshHook();
    } catch {
      // store 훅 실패는 메인 흐름에 영향 주지 않음
    }
  }

  return res;
}
