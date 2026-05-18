import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAdGroupId,
  getRewardedAdLoadStatus,
  preloadRewardedAd,
  resetRewardedAdPreloadForTests,
  showRewardedAd,
} from './ads';

const sdk = vi.hoisted(() => {
  const loadFullScreenAd = vi.fn();
  const showFullScreenAd = vi.fn();
  Object.assign(loadFullScreenAd, { isSupported: vi.fn(() => true) });
  Object.assign(showFullScreenAd, { isSupported: vi.fn(() => true) });
  return { loadFullScreenAd, showFullScreenAd };
});

vi.mock('@apps-in-toss/web-framework', () => sdk);

describe('getAdGroupId', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns configured reward ad group IDs', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: ' ai-live ',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: 'csv-live',
    };

    expect(getAdGroupId('AI_CREDIT')).toBe('ai-live');
    expect(getAdGroupId('CSV_CREDIT')).toBe('csv-live');
  });

  it('does not fall back to test ad IDs in production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: '',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: '',
    };

    expect(getAdGroupId('AI_CREDIT')).toBe('');
    expect(getAdGroupId('CSV_CREDIT')).toBe('');
  });

  it('keeps the Apps-in-Toss test ID fallback outside production', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      NEXT_PUBLIC_AD_GROUP_ID_AI_CREDIT: '',
      NEXT_PUBLIC_AD_GROUP_ID_CSV_CREDIT: '',
    };

    expect(getAdGroupId('AI_CREDIT')).toBe('ait-ad-test-rewarded-id');
    expect(getAdGroupId('CSV_CREDIT')).toBe('ait-ad-test-rewarded-id');
  });
});

describe('rewarded ad preload flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRewardedAdPreloadForTests();
    (globalThis as any).window = {};
    sdk.loadFullScreenAd.isSupported.mockReturnValue(true);
    sdk.showFullScreenAd.isSupported.mockReturnValue(true);
  });

  afterEach(() => {
    resetRewardedAdPreloadForTests();
    delete (globalThis as any).window;
  });

  it('requires an already loaded ad before showing', async () => {
    sdk.loadFullScreenAd.mockImplementation(({ onEvent }) => {
      onEvent({ type: 'loaded' });
      return vi.fn();
    });
    sdk.showFullScreenAd.mockImplementation(({ onEvent }) => {
      onEvent({ type: 'dismissed' });
      return vi.fn();
    });

    await expect(showRewardedAd('ad-1')).rejects.toThrow('ad_not_loaded');

    expect(sdk.loadFullScreenAd).not.toHaveBeenCalled();
    expect(sdk.showFullScreenAd).not.toHaveBeenCalled();
  });

  it('preloads once and then shows without loading on click', async () => {
    sdk.loadFullScreenAd.mockImplementation(({ onEvent }) => {
      onEvent({ type: 'loaded' });
      return vi.fn();
    });
    sdk.showFullScreenAd.mockImplementation(({ onEvent }) => {
      onEvent({ type: 'userEarnedReward', data: { unitType: 'credit', unitAmount: 1 } });
      onEvent({ type: 'dismissed' });
      return vi.fn();
    });

    await expect(preloadRewardedAd('ad-1')).resolves.toBe(true);
    expect(getRewardedAdLoadStatus('ad-1')).toBe('loaded');

    const outcome = await showRewardedAd('ad-1');

    expect(outcome).toEqual({ earnedReward: true, unitType: 'credit', unitAmount: 1 });
    expect(sdk.loadFullScreenAd).toHaveBeenCalledTimes(1);
    expect(sdk.showFullScreenAd).toHaveBeenCalledTimes(1);
  });
});
