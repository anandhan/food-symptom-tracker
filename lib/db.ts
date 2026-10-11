// Prisma client singleton. Neon/Vercel Postgres uses the serverless adapter
// and a pooled URL; local Postgres uses the standard engine.

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';
import {
  getDatabaseConnectionInfo,
  isNeonHostedUrl,
  resolveRuntimeDatabaseUrl,
} from './db-url';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = resolveRuntimeDatabaseUrl(
    process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL
  );
  const log =
    process.env.NODE_ENV === 'development' ? (['query', 'error', 'warn'] as const) : (['error'] as const);

  if (url && isNeonHostedUrl(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url, max: 1 });
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter, log: [...log] });
  }

  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: [...log],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export { getDatabaseConnectionInfo, resolveRuntimeDatabaseUrl, isNeonHostedUrl };

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
