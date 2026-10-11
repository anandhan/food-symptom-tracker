export type DatabaseHostKind = 'neon' | 'local' | 'unknown';

export function isNeonHostedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith('neon.tech') ||
      host.endsWith('neon.build') ||
      host.includes('vercel-storage.com') ||
      host.includes('neon.database')
    );
  } catch {
    return /neon\.tech|vercel-storage\.com|neon\.build/i.test(url);
  }
}

export function isPooledDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host.includes('-pooler') ||
      host.includes('pooler.') ||
      parsed.searchParams.get('pgbouncer') === 'true' ||
      parsed.port === '6543'
    );
  } catch {
    return /pooler|pgbouncer=true|:6543/i.test(url);
  }
}

/** Rewrite a Neon/Vercel Postgres URL to the pooled host and Prisma-safe params. */
export function toNeonPooledUrl(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (!host.includes('-pooler') && !host.includes('pooler.')) {
    const firstDot = host.indexOf('.');
    if (firstDot > 0) {
      parsed.hostname = `${host.slice(0, firstDot)}-pooler${host.slice(firstDot)}`;
    }
  }
  if (!parsed.searchParams.has('pgbouncer')) {
    parsed.searchParams.set('pgbouncer', 'true');
  }
  if (!parsed.searchParams.has('connect_timeout')) {
    parsed.searchParams.set('connect_timeout', '15');
  }
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '1');
  }
  if (!parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }
  return parsed.toString();
}

/**
 * Runtime URL for Prisma Client.
 * Prefers POSTGRES_PRISMA_URL when callers pass it in. If DATABASE_URL is a
 * Neon/Vercel unpooled host, rewrite it to the pooler and add pgbouncer=true.
 */
export function resolveRuntimeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    if (isNeonHostedUrl(raw) && !isPooledDatabaseUrl(raw)) {
      return toNeonPooledUrl(raw);
    }
    if (isNeonHostedUrl(raw)) {
      const parsed = new URL(raw);
      if (!parsed.searchParams.has('pgbouncer')) {
        parsed.searchParams.set('pgbouncer', 'true');
      }
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '1');
      }
      return parsed.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

export function getDatabaseConnectionInfo(
  raw = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL
) {
  const resolved = resolveRuntimeDatabaseUrl(raw);
  return {
    configured: Boolean(raw),
    hostKind: (!raw
      ? 'unknown'
      : isNeonHostedUrl(raw)
        ? 'neon'
        : 'local') as DatabaseHostKind,
    pooled: Boolean(resolved && isPooledDatabaseUrl(resolved)),
    usingAdapter: Boolean(resolved && isNeonHostedUrl(resolved)),
  };
}
