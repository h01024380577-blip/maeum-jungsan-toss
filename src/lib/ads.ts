/**
 * 앱인토스 리워드 광고 래퍼
 * - 토스앱 5.247.0 이상에서 지원 (인앱 광고 2.0 ver2)
 * - 화면 진입 시 preload → 사용자 클릭 시 show → 다음 preload 순서 강제
 */

const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id';

/**
 * 리워드 광고그룹 ID. AI 분석·CSV 대량입력 모두 단일 그룹을 공유한다.
 * (RewardType은 서버 측 권한 스코프로만 남고, 광고그룹은 하나다.)
 */
export function getAdGroupId(): string {
  const configured = process.env.NEXT_PUBLIC_AD_GROUP_ID_REWARDED;
  if (configured?.trim()) return configured.trim();
  return process.env.NODE_ENV === 'production' ? '' : TEST_REWARDED_AD_GROUP_ID;
}

/** 현재 환경에서 리워드 광고 사용 가능 여부. SSR/미지원 버전이면 false. */
let supportedCache: Promise<boolean> | null = null;
export function isRewardedAdSupported(): Promise<boolean> {
  if (supportedCache) return supportedCache;
  if (typeof window === 'undefined') return Promise.resolve(false);
  supportedCache = (async () => {
    try {
      const { loadFullScreenAd, showFullScreenAd } = await import(
        '@apps-in-toss/web-framework'
      );
      return (
        typeof loadFullScreenAd?.isSupported === 'function' &&
        loadFullScreenAd.isSupported() &&
        typeof showFullScreenAd?.isSupported === 'function' &&
        showFullScreenAd.isSupported()
      );
    } catch {
      return false;
    }
  })();
  return supportedCache;
}

export interface ShowRewardedAdOutcome {
  earnedReward: boolean;
  unitType?: string;
  unitAmount?: number;
}

export type RewardedAdLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'unsupported';

interface RewardedAdPreloadEntry {
  status: RewardedAdLoadStatus;
  promise?: Promise<boolean>;
  unregister?: () => void;
}

const preloadedAds = new Map<string, RewardedAdPreloadEntry>();

export function getRewardedAdLoadStatus(adGroupId: string): RewardedAdLoadStatus {
  return preloadedAds.get(adGroupId)?.status ?? 'idle';
}

export function resetRewardedAdPreloadForTests() {
  for (const entry of preloadedAds.values()) {
    try {
      entry.unregister?.();
    } catch {}
  }
  preloadedAds.clear();
  supportedCache = null;
}

export async function preloadRewardedAd(adGroupId: string): Promise<boolean> {
  if (!adGroupId.trim()) return false;

  const existing = preloadedAds.get(adGroupId);
  if (existing?.status === 'loaded') return true;
  if (existing?.status === 'loading' && existing.promise) return existing.promise;

  let loadFullScreenAd: any;
  let showFullScreenAd: any;
  try {
    ({ loadFullScreenAd, showFullScreenAd } = await import(
      '@apps-in-toss/web-framework'
    ));
  } catch {
    preloadedAds.set(adGroupId, { status: 'failed' });
    return false;
  }

  const supported =
    typeof window !== 'undefined' &&
    typeof loadFullScreenAd?.isSupported === 'function' &&
    loadFullScreenAd.isSupported() &&
    typeof showFullScreenAd?.isSupported === 'function' &&
    showFullScreenAd.isSupported();

  if (!supported) {
    preloadedAds.set(adGroupId, { status: 'unsupported' });
    return false;
  }

  let unregister: (() => void) | undefined;
  let resolvePromise: (loaded: boolean) => void = () => {};
  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });

  preloadedAds.set(adGroupId, { status: 'loading', promise, unregister });
  unregister = loadFullScreenAd({
    options: { adGroupId },
    onEvent: (event: { type: string }) => {
      if (event.type !== 'loaded') return;
      try {
        unregister?.();
      } catch {}
      preloadedAds.set(adGroupId, { status: 'loaded' });
      resolvePromise(true);
    },
    onError: () => {
      try {
        unregister?.();
      } catch {}
      preloadedAds.set(adGroupId, { status: 'failed' });
      resolvePromise(false);
    },
  });

  const entry = preloadedAds.get(adGroupId);
  if (entry?.status === 'loading') {
    entry.unregister = unregister;
  }
  return promise;
}

function startNextPreload(adGroupId: string) {
  preloadedAds.set(adGroupId, { status: 'idle' });
  void preloadRewardedAd(adGroupId);
}

/**
 * 미리 로드된 리워드 광고를 표시하고 리워드 획득 여부를 반환한다.
 * 버튼 클릭 시점에는 loadFullScreenAd를 호출하지 않는다.
 */
export async function showRewardedAd(adGroupId: string): Promise<ShowRewardedAdOutcome> {
  if (getRewardedAdLoadStatus(adGroupId) !== 'loaded') {
    throw new Error('ad_not_loaded');
  }

  preloadedAds.set(adGroupId, { status: 'idle' });

  const { showFullScreenAd } = await import(
    '@apps-in-toss/web-framework'
  );

  return await new Promise<ShowRewardedAdOutcome>((resolve, reject) => {
    let earnedReward = false;
    let rewardData: { unitType?: string; unitAmount?: number } = {};
    const unregister = showFullScreenAd({
      options: { adGroupId },
      onEvent: (event) => {
        switch (event.type) {
          case 'userEarnedReward':
            earnedReward = true;
            rewardData = {
              unitType: event.data?.unitType,
              unitAmount: event.data?.unitAmount,
            };
            break;
          case 'dismissed':
            resolve({ earnedReward, ...rewardData });
            try {
              unregister();
            } catch {}
            startNextPreload(adGroupId);
            break;
          case 'failedToShow':
            resolve({ earnedReward: false });
            try {
              unregister();
            } catch {}
            startNextPreload(adGroupId);
            break;
        }
      },
      onError: (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
        try {
          unregister();
        } catch {}
        startNextPreload(adGroupId);
      },
    });
  });
}

const TEST_INTERSTITIAL_AD_GROUP_ID = 'ait-ad-test-interstitial-id';

/**
 * 일반 저장 시 보여줄 전면 광고그룹 ID.
 * 전면형 그룹이 따로 설정되지 않았으면 리워드 그룹을 재사용한다(보상과 무관하게 저장은 진행).
 */
export function getSaveAdGroupId(): string {
  const configured = process.env.NEXT_PUBLIC_AD_GROUP_ID_INTERSTITIAL;
  if (configured?.trim()) return configured.trim();
  if (process.env.NODE_ENV !== 'production') return TEST_INTERSTITIAL_AD_GROUP_ID;
  return getAdGroupId();
}
