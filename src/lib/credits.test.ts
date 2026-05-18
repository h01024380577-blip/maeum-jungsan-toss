import { describe, it, expect } from 'vitest';
import {
  CREDITS_CONFIG,
  kstStartOfToday,
  looksLikeTossUserKey,
  normalizeGuestDeviceId,
} from './credits';

describe('credits config', () => {
  it('starts new users with 3 AI credits so reward ads are immediately available below cap', () => {
    expect(CREDITS_CONFIG.ai.welcome).toBe(3);
    expect(CREDITS_CONFIG.ai.welcome).toBeLessThan(CREDITS_CONFIG.ai.cap);
  });
});

describe('kstStartOfToday', () => {
  it('KST 00:00 이후 시각은 같은 KST 날짜의 00:00을 반환한다', () => {
    // 2026-04-23 09:30 KST = 2026-04-23 00:30 UTC
    const input = new Date('2026-04-23T00:30:00Z');
    const result = kstStartOfToday(input);
    // KST 2026-04-23 00:00 = UTC 2026-04-22 15:00
    expect(result.toISOString()).toBe('2026-04-22T15:00:00.000Z');
  });

  it('UTC 자정 직후(KST 오전 9시)도 같은 KST 날짜의 00:00을 반환한다', () => {
    // 2026-04-23 00:01 UTC = 2026-04-23 09:01 KST
    const input = new Date('2026-04-23T00:01:00Z');
    const result = kstStartOfToday(input);
    expect(result.toISOString()).toBe('2026-04-22T15:00:00.000Z');
  });

  it('UTC 14:59(KST 23:59)에는 당일 KST 00:00을 반환한다', () => {
    // 2026-04-22 14:59 UTC = 2026-04-22 23:59 KST
    const input = new Date('2026-04-22T14:59:00Z');
    const result = kstStartOfToday(input);
    // KST 2026-04-22 00:00 = UTC 2026-04-21 15:00
    expect(result.toISOString()).toBe('2026-04-21T15:00:00.000Z');
  });

  it('UTC 15:00(KST 자정) 직전과 직후는 다른 KST 날짜를 반환한다', () => {
    const justBefore = kstStartOfToday(new Date('2026-04-22T14:59:59Z'));
    const justAfter = kstStartOfToday(new Date('2026-04-22T15:00:00Z'));
    expect(justBefore.toISOString()).toBe('2026-04-21T15:00:00.000Z');
    expect(justAfter.toISOString()).toBe('2026-04-22T15:00:00.000Z');
    // 정확히 24시간 차이
    expect(justAfter.getTime() - justBefore.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('반환값의 밀리초는 0으로 초기화된다', () => {
    const result = kstStartOfToday(new Date('2026-04-23T05:23:45.678Z'));
    expect(result.getUTCMilliseconds()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCHours()).toBe(15);
  });
});

describe('guest identity helpers', () => {
  it('normalizes valid guest device ids', () => {
    expect(normalizeGuestDeviceId('  device-123  ')).toBe('device-123');
  });

  it('rejects empty or oversized guest device ids', () => {
    expect(normalizeGuestDeviceId('   ')).toBeNull();
    expect(normalizeGuestDeviceId('a'.repeat(192))).toBeNull();
  });

  it('detects numeric Toss user keys', () => {
    expect(looksLikeTossUserKey('123456789')).toBe(true);
    expect(looksLikeTossUserKey('device-123')).toBe(false);
    expect(looksLikeTossUserKey('6f3b7e18-1f95-49e4-bf9e-4377f2d0c0b4')).toBe(false);
  });
});
