// Pure helpers for JSON/CSV export and import validation

export interface ExportPayload {
  version: string;
  exportedAt: string;
  user: unknown;
  entries: unknown[];
  weeklyReports: unknown[];
}

export function buildExportPayload(input: {
  user: unknown;
  entries: unknown[];
  weeklyReports: unknown[];
  exportedAt?: string;
}): ExportPayload {
  return {
    version: '1.0',
    exportedAt: input.exportedAt || new Date().toISOString(),
    user: input.user,
    entries: input.entries,
    weeklyReports: input.weeklyReports,
  };
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map(csvEscape).join(',');
  const body = rows.map((row) => row.map(csvEscape).join(','));
  return [headerLine, ...body].join('\n');
}

export interface ImportValidation {
  ok: boolean;
  error?: string;
  entryCount: number;
}

export function validateImportData(data: unknown): ImportValidation {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Import data must be an object', entryCount: 0 };
  }
  const payload = data as { version?: string; entries?: unknown };
  if (!payload.version) {
    return { ok: false, error: 'Missing version field', entryCount: 0 };
  }
  if (!Array.isArray(payload.entries)) {
    return { ok: false, error: 'entries must be an array', entryCount: 0 };
  }
  return { ok: true, entryCount: payload.entries.length };
}
