import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useStore } from './useStore';
import { apiFetch, getAuthToken } from '@/src/lib/apiClient';

vi.mock('@/src/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  clearAuthToken: vi.fn(),
  getAuthToken: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedGetAuthToken = vi.mocked(getAuthToken);

describe('useStore loadFromSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 }),
    );
    useStore.setState({ isLoaded: false, entries: [], contacts: [], tossUserId: 'stale' });
  });

  it('skips /api/auth/me and loads immediately when no auth token (first entry)', async () => {
    mockedGetAuthToken.mockReturnValue(null);

    await useStore.getState().loadFromSupabase();

    const state = useStore.getState();
    expect(state.isLoaded).toBe(true);
    expect(state.tossUserId).toBeNull();
    expect(state.entries).toEqual([]);
    const calledPaths = mockedApiFetch.mock.calls.map(([url]) => String(url));
    expect(calledPaths.some((u) => u.includes('/api/auth/me'))).toBe(false);
  });

  it('still checks /api/auth/me when a token exists', async () => {
    mockedGetAuthToken.mockReturnValue('jwt-token');

    await useStore.getState().loadFromSupabase();

    const calledPaths = mockedApiFetch.mock.calls.map(([url]) => String(url));
    expect(calledPaths.some((u) => u.includes('/api/auth/me'))).toBe(true);
    expect(useStore.getState().isLoaded).toBe(true);
  });
});

describe('useStore clearData', () => {
  it('clears auth-scoped data and analysis state', () => {
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
    expect(state.analysisResult).toEqual({
      data: null,
      initialData: null,
      showBottomSheet: false,
      isParsing: false,
      selectedImage: null,
    });
  });
});
