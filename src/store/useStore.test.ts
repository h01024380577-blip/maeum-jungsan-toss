import { describe, expect, it } from 'vitest';
import { useStore } from './useStore';

describe('useStore clearData', () => {
  it('clears auth-scoped data, credits, and analysis state', () => {
    useStore.setState({
      entries: [{
        id: 'entry-1',
        contactId: 'contact-1',
        eventType: 'wedding',
        type: 'EXPENSE',
        date: '2026-05-15',
        location: '서울',
        targetName: '김민수',
        amount: 100000,
        relation: '친구',
        isIncome: false,
        createdAt: Date.now(),
        userId: 'user-1',
      }],
      contacts: [{
        id: 'contact-1',
        name: '김민수',
        relation: '친구',
        userId: 'user-1',
      }],
      feedback: [{ original: {}, corrected: {}, timestamp: Date.now() }],
      tossUserId: 'user-1',
      tossUserName: '민수',
      notificationsEnabled: true,
      credits: {
        ai: { balance: 3, cap: 3, canWatchAd: true },
        csv: { balance: 2, cap: 3, canWatchAd: true },
        ad: {
          watchesRemaining: 4,
          dailyLimit: 10,
          resetAt: '2026-05-16T00:00:00.000Z',
        },
        loaded: true,
      },
      analysisResult: {
        data: { targetName: '김민수' },
        initialData: { targetName: '김민수' },
        showBottomSheet: true,
        isParsing: true,
        selectedImage: 'data:image/jpeg;base64,abc',
      },
    });

    useStore.getState().clearData();

    const state = useStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.contacts).toEqual([]);
    expect(state.feedback).toEqual([]);
    expect(state.tossUserId).toBeNull();
    expect(state.tossUserName).toBeNull();
    expect(state.notificationsEnabled).toBe(false);
    expect(state.credits).toEqual({
      ai: { balance: 0, cap: 3, canWatchAd: false },
      csv: { balance: 0, cap: 3, canWatchAd: false },
      ad: { watchesRemaining: 0, dailyLimit: 10, resetAt: null },
      loaded: false,
    });
    expect(state.analysisResult).toEqual({
      data: null,
      initialData: null,
      showBottomSheet: false,
      isParsing: false,
      selectedImage: null,
    });
  });
});
