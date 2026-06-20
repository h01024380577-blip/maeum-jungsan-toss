/**
 * CSR 대응 API 클라이언트
 * - NEXT_PUBLIC_API_URL base (CSR 빌드 시 절대 URL, dev 시 '' 상대경로)
 * - Bearer 토큰 자동 첨부 (로그인 사용자)
 * - x-user-id 헤더 자동 첨부 (게스트)
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const TOKEN_KEY = 'heartbook-auth-token';

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

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}
