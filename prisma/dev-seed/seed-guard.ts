// Guards for the development seeds and reset-database.sh. They write to whatever
// DATABASE_URL points at (seed.ts empties every table first, performance-seed.ts adds
// thousands of rows) and NODE_ENV only describes the operator's shell, so they also
// refuse a database that is not local or that already holds real data.
// ALLOW_PRODUCTION_SEED=true overrides every check.
//
// Run directly (reset-database.sh does, before `prisma migrate reset`) it checks the
// DATABASE_URL target and exits non-zero when it must not be wiped.

// Imported for its side effect too: @prisma/client loads .env into process.env, so
// DATABASE_URL below is the one the seed's PrismaClient and the Prisma CLI will use
import { PrismaClient } from '@prisma/client';

// Local hosts, and the names docker compose setups give the database service
const LOCAL_DATABASE_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres', 'postgresql', 'db', 'database'];

// Seed data stays far below this; more means real content (production holds ~86k questions)
const MAX_QUESTIONS = 1000;
const MAX_USERS = 50;

function overridden(): boolean {
  return process.env.ALLOW_PRODUCTION_SEED === 'true';
}

function refuse(reason: string): never {
  console.error(`Refusing to seed: ${reason} (set ALLOW_PRODUCTION_SEED=true to override)`);
  process.exit(1);
}

/** Host of a postgres URL, lowercased, IPv6 without brackets; undefined when there is none. */
export function databaseHost(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
    return host || undefined;
  } catch {
    return undefined;
  }
}

/** Before connecting: NODE_ENV must not be production and DATABASE_URL must be a local database. */
export function assertLocalDatabase(): void {
  if (overridden()) return;
  if (process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV is production');
  }
  const host = databaseHost(process.env.DATABASE_URL);
  if (!host || !LOCAL_DATABASE_HOSTS.includes(host)) {
    refuse(`DATABASE_URL host "${host ?? ''}" is not a local database (${LOCAL_DATABASE_HOSTS.join(', ')})`);
  }
}

// A missing database fails at connect with a PrismaClientInitializationError that
// carries neither `code` nor `errorCode` (Prisma 6), only this message
function isMissingDatabase(error: any): boolean {
  return (
    error?.code === 'P1003' ||
    error?.errorCode === 'P1003' ||
    (error?.name === 'PrismaClientInitializationError' &&
      /Database `[^`]+` does not exist/.test(String(error?.message ?? '')))
  );
}

// Count, with a missing table or database (not migrated or created yet) counting as empty
async function countOrZero(count: () => Promise<number>): Promise<number> {
  try {
    return await count();
  } catch (error: any) {
    if (error?.code === 'P2021' || isMissingDatabase(error)) return 0;
    throw error;
  }
}

/** Before writing: the database must not already hold real data. */
export async function assertNoRealData(prisma: PrismaClient): Promise<void> {
  if (overridden()) return;
  const questions = await countOrZero(() => prisma.question.count());
  const users = await countOrZero(() => prisma.user.count());
  if (questions > MAX_QUESTIONS || users > MAX_USERS) {
    refuse(
      `the database already holds ${questions} questions and ${users} users ` +
        `(seed data stays under ${MAX_QUESTIONS} questions and ${MAX_USERS} users)`
    );
  }
}

if (require.main === module) {
  if (overridden()) {
    console.warn('⚠️  ALLOW_PRODUCTION_SEED=true: the seed target is not checked');
  } else {
    assertLocalDatabase();
    const prisma = new PrismaClient();
    assertNoRealData(prisma)
      .then(() => console.log('✅ Seed target is a local database without real data'))
      .catch((error) => {
        console.error('Refusing to seed: could not check the database:', error?.message || error);
        process.exitCode = 1;
      })
      .finally(() => prisma.$disconnect());
  }
}
