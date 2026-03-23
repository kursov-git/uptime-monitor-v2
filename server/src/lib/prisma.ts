import { PrismaClient } from '@prisma/client';
import { serverEnv } from './env';
import { logger } from './logger';

const prisma = new PrismaClient();
const prismaLogger = logger.child({ component: 'prisma-sqlite' });
let sqliteSessionInitPromise: Promise<void> | null = null;

function isSqliteDatabaseUrl(url: string): boolean {
    return url.startsWith('file:');
}

async function applySqliteSessionPragmas() {
    if (!isSqliteDatabaseUrl(serverEnv.databaseUrl)) {
        return;
    }

    try {
        const journalMode = await prisma.$queryRawUnsafe<Array<{ journal_mode?: string }>>('PRAGMA journal_mode = WAL');
        await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
        await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON');
        await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');

        prismaLogger.info({
            journalMode: journalMode?.[0]?.journal_mode ?? null,
            synchronous: 'NORMAL',
            busyTimeoutMs: 5000,
        }, 'Applied SQLite session pragmas');
    } catch (err) {
        prismaLogger.warn({ err }, 'Failed to apply SQLite session pragmas; continuing with default SQLite settings');
    }
}

export async function ensurePrismaSqliteTuned() {
    sqliteSessionInitPromise ??= applySqliteSessionPragmas();
    await sqliteSessionInitPromise;
}

export default prisma;
