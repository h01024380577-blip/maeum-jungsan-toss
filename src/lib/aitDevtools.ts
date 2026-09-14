/**
 * AIT Devtools 패널 로더 (dev 전용).
 *
 * `next.config.ts` 의 unplugin 은 `@apps-in-toss/web-framework` import 를 mock 으로
 * 갈아끼우는 역할만 맡기고, 패널 마운트는 여기서 직접 한다.
 * 플러그인의 자동 주입(entryPattern → 파일 맨 위에 import prepend)에 기대지 않는 이유:
 *   1. 기본 패턴이 Vite 식 main/index/entry/app.tsx 라 App Router 에서는 아무것도 안 잡힌다.
 *   2. 맨 위에 prepend 하므로 "use client" 가 있는 파일을 지정하면 빌드가 깨진다.
 *   3. 전용 빈 모듈을 만들어 지정해도 주입된 import 가 실제로 평가되지 않았다.
 *
 * 프로덕션에서는 `process.env.NODE_ENV` 가 'production' 으로 정적 치환되면서
 * 이 블록과 dynamic import 가 통째로 제거된다(빌드 산출물에서 검증됨).
 */
if (process.env.NODE_ENV !== 'production') {
  void import('@apps-in-toss/devtools/panel').catch((error) => {
    console.warn('[ait-devtools] 패널을 불러오지 못했어요:', error);
  });
}

export {};
