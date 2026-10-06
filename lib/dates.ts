// Calendar-date helpers. Entry dates are stored as UTC midnight of YYYY-MM-DD
// (a calendar date, not a local-wall-clock timestamp).

export const DEFAULT_TIMEZONE = 'America/New_York';

export function getConfiguredTimezone(): string {
  return process.env.TIMEZONE || DEFAULT_TIMEZONE;
}

/** Format a stored calendar Date as YYYY-MM-DD using UTC parts. */
export function formatCalendarDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD into a Date at UTC midnight. */
export function parseCalendarDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid calendar date: ${iso}`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Client/local wall clock → YYYY-MM-DD (uses the JS runtime's local TZ). */
export function getLocalCalendarDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Instant → YYYY-MM-DD in a named IANA timezone (for cron / reports). */
export function getCalendarDateInTimezone(
  now: Date,
  timeZone: string = getConfiguredTimezone()
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const lookup = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

export function addCalendarDays(iso: string, days: number): string {
  const date = parseCalendarDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatCalendarDate(date);
}

export function formatCalendarDateLong(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatCalendarDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
