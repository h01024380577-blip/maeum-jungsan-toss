import { Analytics } from '@apps-in-toss/web-framework';

/**
 * 앱인토스 사용자분석(이벤트 로깅) 래퍼.
 *
 * - `@apps-in-toss/web-framework`(>= 2.7.0)가 제공하는 `Analytics` 객체를 감싼다.
 *   웹 SDK는 `screen` / `click` / `impression` 세 가지 명령형 API만 제공하고,
 *   별도의 `init` 호출은 필요 없다(페이지 이동 로그는 SDK가 자동 수집).
 * - 토스 WebView가 아닌 환경(EC2 SSR·일반 브라우저)에서는 no-op이 되거나
 *   throw 될 수 있으므로 항상 try/catch로 감싸 앱 흐름에 영향을 주지 않게 한다.
 * - 데이터는 라이브(출시) 환경에서만 수집되며, 콘솔 `분석 > 이벤트`에
 *   런칭 다음 날(+1일)부터 표시된다. (샌드박스·QR 테스트는 수집 안 됨)
 *
 * 콘솔에서 이벤트를 구분하는 이름은 `log_name`이다.
 */

type EventParams = Record<string, string | number | boolean | null | undefined>;

/** undefined 값은 전송하지 않도록 정리한다. */
function clean(params?: EventParams): EventParams | undefined {
  if (!params) return undefined;
  const out: EventParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function run(fn: () => Promise<void> | undefined) {
  if (typeof window === 'undefined') return; // SSR 가드
  try {
    void fn();
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // 분석 실패가 앱 동작을 막으면 안 되므로 삼킨다.
      console.warn('[analytics] 이벤트 전송 실패', e);
    }
  }
}

/** 화면 진입 이벤트. `logName`이 콘솔에 표시되는 화면 이름이 된다. */
export function trackScreen(logName: string, params?: EventParams) {
  run(() => Analytics.screen({ log_name: logName, ...clean(params) }));
}

/** 클릭/액션 이벤트. */
export function trackClick(logName: string, params?: EventParams) {
  run(() => Analytics.click({ log_name: logName, ...clean(params) }));
}

/** 요소 노출 이벤트. */
export function trackImpression(logName: string, params?: EventParams) {
  run(() => Analytics.impression({ log_name: logName, ...clean(params) }));
}
