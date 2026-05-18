import { compareAsc, isSameDay, isSameMonth, parseISO } from 'date-fns';
import type { EventEntry } from '@/src/store/useStore';

function parseEntryDate(entry: EventEntry): Date | null {
  try {
    const parsed = parseISO(entry.date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function sortCalendarEntries(a: EventEntry, b: EventEntry): number {
  const aDate = parseEntryDate(a);
  const bDate = parseEntryDate(b);
  if (aDate && bDate) {
    const dateOrder = compareAsc(aDate, bDate);
    if (dateOrder !== 0) return dateOrder;
  }

  return a.createdAt - b.createdAt;
}

export function getEntriesForCalendarDate(entries: EventEntry[], date: Date): EventEntry[] {
  return entries
    .filter((entry) => {
      const entryDate = parseEntryDate(entry);
      return entryDate ? isSameDay(entryDate, date) : false;
    })
    .sort(sortCalendarEntries);
}

export function getEntriesForCalendarMonth(entries: EventEntry[], activeStartDate: Date): EventEntry[] {
  return entries
    .filter((entry) => {
      const entryDate = parseEntryDate(entry);
      return entryDate ? isSameMonth(entryDate, activeStartDate) : false;
    })
    .sort(sortCalendarEntries);
}

export function getCalendarDisplayEntries(
  entries: EventEntry[],
  selection: { activeStartDate: Date; selectedDate: Date | null }
): EventEntry[] {
  return selection.selectedDate
    ? getEntriesForCalendarDate(entries, selection.selectedDate)
    : getEntriesForCalendarMonth(entries, selection.activeStartDate);
}

export function shouldClearCalendarDateSelection(currentStartDate: Date, nextStartDate: Date): boolean {
  return !isSameMonth(currentStartDate, nextStartDate);
}
