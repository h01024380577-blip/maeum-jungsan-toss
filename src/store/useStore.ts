import { create } from 'zustand';
import { apiFetch, clearAuthToken, registerCreditRefreshHook } from '@/src/lib/apiClient';

export type EventType = 'wedding' | 'funeral' | 'birthday' | 'other';
export type TransactionType = 'INCOME' | 'EXPENSE';
export type TransactionSource = 'MANUAL' | 'URL' | 'OCR' | 'SMS_PASTE' | 'CSV';

export interface Contact {
  id: string;
  name: string;
  phone?: string;
  kakaoId?: string;
  relation: string;
  avatar?: string;
  isFavorite?: boolean;
  userId: string;
}

export interface EventEntry {
  id: string;
  contactId: string;
  eventType: EventType;
  type: TransactionType;
  date: string;
  location: string;
  targetName: string;
  account?: string;
  amount: number;
  relation: string;
  recommendationReason?: string;
  customEventName?: string;
  memo?: string;
  isIncome: boolean;
  source?: TransactionSource;
  createdAt: number;
  userId: string;
}

export interface CreditSlot {
  balance: number;
  cap: number;
  canWatchAd: boolean;
}

export interface CreditsState {
  ai: CreditSlot;
  csv: CreditSlot;
  ad: {
    watchesRemaining: number;
    dailyLimit: number;
    resetAt: string | null;
  };
  loaded: boolean;
}

interface AppState {
  entries: EventEntry[];
  contacts: Contact[];
  feedback: any[];
  isLoaded: boolean;
  tossUserId: string | null;
  tossUserName: string | null;
  notificationsEnabled: boolean;
  credits: CreditsState;
  analysisResult: {
    data: Partial<EventEntry> | null;
    initialData: Partial<EventEntry> | null;
    showBottomSheet: boolean;
    isParsing: boolean;
    selectedImage: string | null;
  };
  loadFromSupabase: () => Promise<void>;
  addEntry: (entry: Omit<EventEntry, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  updateEntry: (id: string, entry: Partial<EventEntry>) => Promise<void>;
  addContact: (contact: Omit<Contact, 'id' | 'userId'>) => Promise<string>;
  updateContact: (id: string, contact: Partial<Contact>) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  syncContacts: (contacts: Omit<Contact, 'id' | 'userId'>[]) => Promise<{ inserted: number; skipped: number; attempted: number }>;
  addFeedback: (original: any, corrected: any) => void;
  bulkAddEntries: (entries: Omit<EventEntry, 'id' | 'createdAt' | 'userId'>[], options?: { creditToken?: string | null }) => Promise<{ inserted: number; skipped: number; attempted: number }>;
  refreshCredits: () => Promise<void>;
  clearData: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAnalysisResult: (result: Partial<AppState['analysisResult']>) => void;
  resetAnalysis: () => void;
}

const createInitialCredits = (): CreditsState => ({
  ai: { balance: 0, cap: 3, canWatchAd: false },
  csv: { balance: 0, cap: 3, canWatchAd: false },
  ad: { watchesRemaining: 0, dailyLimit: 10, resetAt: null },
  loaded: false,
});

const createInitialAnalysisResult = (): AppState['analysisResult'] => ({
  data: null,
  initialData: null,
  showBottomSheet: false,
  isParsing: false,
  selectedImage: null,
});


export const useStore = create<AppState>()((set, get) => ({
  entries: [],
  contacts: [],
  feedback: [],
  isLoaded: false,
  tossUserId: null,
  tossUserName: null,
  notificationsEnabled: false,
  credits: createInitialCredits(),
  analysisResult: createInitialAnalysisResult(),

  refreshCredits: async () => {
    try {
      const res = await apiFetch('/api/credits');
      if (!res.ok) return;
      const data = await res.json();
      set({
        credits: {
          ai: data.ai,
          csv: data.csv,
          ad: data.ad,
          loaded: true,
        },
      });
    } catch {
      // 네트워크 실패 시 기존 상태 유지
    }
  },

  // API Route 기반 데이터 로드 (로그인 상태에서만)
  loadFromSupabase: async () => {
    try {
      // 로그인 여부 먼저 확인
      const meRes = await apiFetch('/api/auth/me');
      if (!meRes.ok) {
        // 비로그인(게스트): 데이터 비우고 크레딧만 동기화
        set({ entries: [], contacts: [], tossUserId: null, tossUserName: null, notificationsEnabled: false, isLoaded: true });
        get().refreshCredits();
        return;
      }
      const me = await meRes.json();
      if (me.needsRelogin) {
        clearAuthToken();
        set({ entries: [], contacts: [], tossUserId: null, tossUserName: null, notificationsEnabled: false, isLoaded: true });
        return;
      }
      set({
        tossUserId: me.userId ?? null,
        tossUserName: me.name ?? null,
        notificationsEnabled: me.notificationsEnabled ?? false,
      });
      const [entriesRes, contactsRes] = await Promise.all([
        apiFetch('/api/entries').then(r => r.ok ? r.json() : { entries: [] }),
        apiFetch('/api/contacts').then(r => r.ok ? r.json() : { contacts: [] }),
      ]);
      set({
        entries: entriesRes.entries ?? [],
        contacts: contactsRes.contacts ?? [],
        isLoaded: true,
      });
      // 크레딧 상태는 독립적으로 로드 (실패해도 전체 실패 아님)
      get().refreshCredits();
    } catch {
      set({ isLoaded: true });
    }
  },

  addEntry: async (entry) => {
    const res = await apiFetch('/api/entries', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Entry 저장 실패');
    }
    const { entry: saved, contact: newContact } = await res.json();
    set(state => {
      // 새로 생성된 contact가 있고 아직 store에 없으면 추가
      const contacts = newContact && !state.contacts.find(c => c.id === newContact.id)
        ? [...state.contacts, newContact]
        : state.contacts;
      return { entries: [saved, ...state.entries], contacts };
    });
  },

  removeEntry: async (id) => {
    await apiFetch(`/api/entries?id=${id}`, { method: 'DELETE' });
    set(state => ({ entries: state.entries.filter(e => e.id !== id) }));
  },

  updateEntry: async (id, updatedFields) => {
    await apiFetch(`/api/entries?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      entries: state.entries.map(e => e.id === id ? { ...e, ...updatedFields } : e),
    }));
  },

  addContact: async (contact) => {
    const res = await apiFetch('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(contact),
    });
    if (!res.ok) throw new Error('Contact 저장 실패');
    const { contact: saved, id } = await res.json();
    set(state => ({ contacts: [...state.contacts, saved] }));
    return id;
  },

  updateContact: async (id, updatedFields) => {
    await apiFetch(`/api/contacts?id=${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updatedFields),
    });
    set(state => ({
      contacts: state.contacts.map(c => c.id === id ? { ...c, ...updatedFields } : c),
    }));
  },

  removeContact: async (id) => {
    await apiFetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
    set(state => ({ contacts: state.contacts.filter(c => c.id !== id) }));
  },

  syncContacts: async (newContacts) => {
    const existingNames = new Set(get().contacts.map(c => c.name));
    const toSend = newContacts.filter(c => !existingNames.has(c.name));
    if (toSend.length === 0) {
      return { inserted: 0, skipped: newContacts.length, attempted: newContacts.length };
    }
    const res = await apiFetch('/api/contacts/bulk', {
      method: 'POST',
      body: JSON.stringify({ contacts: toSend }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.reason || err.error || 'bulk_failed');
    }
    const json = await res.json();
    const inserted: Contact[] = json.contacts ?? [];
    if (inserted.length > 0) {
      set(state => ({ contacts: [...state.contacts, ...inserted] }));
    }
    return {
      inserted: json.inserted ?? inserted.length,
      skipped: (newContacts.length - toSend.length) + (json.skipped ?? 0),
      attempted: newContacts.length,
    };
  },

  bulkAddEntries: async (entries, options) => {
    const res = await apiFetch('/api/entries/bulk', {
      method: 'POST',
      body: JSON.stringify({ entries, creditToken: options?.creditToken ?? null }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // 402 no_credits는 호출자가 광고 유도 UI로 분기할 수 있도록 구조화된 에러
      const e = new Error(err.reason || err.error || 'bulk_failed') as Error & {
        status?: number;
        reason?: string;
      };
      e.status = res.status;
      e.reason = err.reason;
      throw e;
    }
    const json = await res.json();
    // 서버 insert 성공 후 entries/contacts 재로드
    const [entriesRes, contactsRes] = await Promise.all([
      apiFetch('/api/entries').then((r) => (r.ok ? r.json() : { entries: [] })),
      apiFetch('/api/contacts').then((r) => (r.ok ? r.json() : { contacts: [] })),
    ]);
    set({
      entries: entriesRes.entries ?? [],
      contacts: contactsRes.contacts ?? [],
    });
    // CSV 크레딧 차감 반영
    get().refreshCredits();
    return {
      inserted: json.inserted ?? 0,
      skipped: json.skipped ?? 0,
      attempted: json.attempted ?? entries.length,
    };
  },

  addFeedback: (original, corrected) =>
    set(state => ({
      feedback: [...state.feedback, { original, corrected, timestamp: Date.now() }],
    })),

  clearData: () => {
    clearAuthToken();
    set({
      entries: [],
      contacts: [],
      feedback: [],
      tossUserId: null,
      tossUserName: null,
      notificationsEnabled: false,
      credits: createInitialCredits(),
      analysisResult: createInitialAnalysisResult(),
      isLoaded: true,
    });
  },

  setNotificationsEnabled: (enabled: boolean) =>
    set({ notificationsEnabled: enabled }),

  setAnalysisResult: (result) =>
    set(state => ({
      analysisResult: { ...state.analysisResult, ...result },
    })),

  resetAnalysis: () =>
    set(() => ({
      analysisResult: createInitialAnalysisResult(),
    })),
}));

// 크레딧 영향 API 호출 후 자동 재동기화. apiClient가 적절한 경로 호출 시 트리거.
registerCreditRefreshHook(() => {
  useStore.getState().refreshCredits();
});
