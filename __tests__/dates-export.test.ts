import {
  addCalendarDays,
  calendarDateFromUnknown,
  formatCalendarDate,
  getCalendarDateInTimezone,
  getLocalCalendarDate,
  parseCalendarDate,
} from '../lib/dates';
import {
  buildExportPayload,
  csvEscape,
  rowsToCsv,
  validateImportData,
} from '../lib/export';

describe('Calendar date storage', () => {
  it('parses YYYY-MM-DD as UTC midnight', () => {
    const date = parseCalendarDate('2026-10-05');
    expect(date.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(formatCalendarDate(date)).toBe('2026-10-05');
  });

  it('does not shift the calendar day when formatting a stored date', () => {
    const stored = parseCalendarDate('2026-10-05');
    expect(formatCalendarDate(stored)).toBe('2026-10-05');
    expect(stored.getUTCHours()).toBe(0);
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseCalendarDate('10/05/2026')).toThrow(/Invalid calendar date/);
  });

  it('adds calendar days without local TZ conversion', () => {
    expect(addCalendarDays('2026-10-05', 1)).toBe('2026-10-06');
    expect(addCalendarDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('computes New York calendar date independently of UTC hour', () => {
    // 2026-10-06 03:00 UTC is still 2026-10-05 23:00 in America/New_York (EDT, UTC-4)
    const utcMorning = new Date('2026-10-06T03:00:00.000Z');
    expect(getCalendarDateInTimezone(utcMorning, 'America/New_York')).toBe('2026-10-05');
    expect(getCalendarDateInTimezone(utcMorning, 'UTC')).toBe('2026-10-06');
  });

  it('getLocalCalendarDate uses the runtime local wall clock', () => {
    const now = new Date(2026, 9, 5, 22, 30, 0);
    expect(getLocalCalendarDate(now)).toBe('2026-10-05');
  });

  it('treats extracted diary date Oct 5 as a mismatch against selected Oct 6', () => {
    expect(calendarDateFromUnknown('2026-10-05')).toBe('2026-10-05');
    expect(calendarDateFromUnknown('2026-10-05') === '2026-10-06').toBe(false);
  });
});

describe('Export / import helpers', () => {
  it('builds a versioned JSON export payload', () => {
    const payload = buildExportPayload({
      user: { id: 'u1', email: 'a@b.com' },
      entries: [{ date: '2026-10-01', meals: [{ foodItems: [{ rawText: 'Oats' }] }] }],
      weeklyReports: [],
      exportedAt: '2026-10-06T00:00:00.000Z',
    });
    expect(payload.version).toBe('1.0');
    expect(payload.entries).toHaveLength(1);
    expect(payload.exportedAt).toBe('2026-10-06T00:00:00.000Z');
  });

  it('escapes CSV fields that contain commas or quotes', () => {
    expect(csvEscape('Chicken, grilled')).toBe('"Chicken, grilled"');
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvEscape(null)).toBe('');
  });

  it('builds a CSV with one row per table line', () => {
    const csv = rowsToCsv(
      ['Date', 'Food', 'Notes'],
      [['2026-10-05', 'Dunkin\' Donuts - Latte', 'Felt okay']]
    );
    expect(csv.split('\n')[0]).toBe('Date,Food,Notes');
    expect(csv).toContain('2026-10-05');
    expect(csv).toContain('Dunkin\' Donuts - Latte');
  });

  it('validates import JSON and rejects missing version/entries', () => {
    expect(validateImportData(null).ok).toBe(false);
    expect(validateImportData({ entries: [] }).ok).toBe(false);
    expect(validateImportData({ version: '1.0' }).ok).toBe(false);
    const ok = validateImportData({ version: '1.0', entries: [{ date: '2026-10-01' }] });
    expect(ok.ok).toBe(true);
    expect(ok.entryCount).toBe(1);
  });
});
