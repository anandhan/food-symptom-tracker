// Utility functions for className merging

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities (calendar dates stored as UTC midnight)
import {
  calendarDateFromUnknown,
  formatCalendarDate,
  formatCalendarDateLong,
  formatCalendarDateShort,
  parseCalendarDate,
} from '@/lib/dates';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseCalendarDate(date.slice(0, 10)) : date;
  return formatCalendarDateLong(d);
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseCalendarDate(date.slice(0, 10)) : date;
  return formatCalendarDateShort(d);
}

export function formatDateISO(date: Date | string): string {
  const fromUnknown = calendarDateFromUnknown(date);
  if (fromUnknown) return fromUnknown;
  return formatCalendarDate(typeof date === 'string' ? new Date(date) : date);
}

export function parseDate(dateString: string): Date {
  return parseCalendarDate(dateString);
}
