import { describe, expect, it } from 'vitest';
import type { EventEntry } from '@/src/store/useStore';
import {
  getCalendarDisplayEntries,
  shouldClearCalendarDateSelection,
} from './calendarDisplay';

function entry(id: string, date: string, createdAt = 0): EventEntry {
  return {
    id,
    contactId: '',
    eventType: 'wedding',
    type: 'EXPENSE',
    date,
    location: '',
    targetName: id,
    amount: 10000,
    relation: '',
    memo: '',
    isIncome: false,
    createdAt,
    userId: 'user-1',
  };
}

describe('calendarDisplay', () => {
  it('shows all events in the visible month when no date is selected', () => {
    const entries = [
      entry('jun-1', '2026-06-01'),
      entry('may-20', '2026-05-20', 2),
      entry('may-03', '2026-05-03', 1),
    ];

    const visible = getCalendarDisplayEntries(entries, {
      activeStartDate: new Date('2026-05-01T00:00:00'),
      selectedDate: null,
    });

    expect(visible.map((e) => e.id)).toEqual(['may-03', 'may-20']);
  });

  it('shows only the selected date events when a date is selected', () => {
    const entries = [
      entry('may-03', '2026-05-03'),
      entry('may-20-a', '2026-05-20', 2),
      entry('may-20-b', '2026-05-20', 1),
    ];

    const visible = getCalendarDisplayEntries(entries, {
      activeStartDate: new Date('2026-05-01T00:00:00'),
      selectedDate: new Date('2026-05-20T00:00:00'),
    });

    expect(visible.map((e) => e.id)).toEqual(['may-20-b', 'may-20-a']);
  });

  it('clears date selection when the visible calendar month changes', () => {
    expect(
      shouldClearCalendarDateSelection(
        new Date('2026-05-01T00:00:00'),
        new Date('2026-06-01T00:00:00')
      )
    ).toBe(true);
    expect(
      shouldClearCalendarDateSelection(
        new Date('2026-05-01T00:00:00'),
        new Date('2026-05-01T00:00:00')
      )
    ).toBe(false);
  });
});
