import { Prisma, type PrismaClient } from '@prisma/client';
import type { CheckResult, PublicStatusBucket, PublicStatusMonitor, PublicStatusResponse } from '@uptime-monitor/shared';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { FlappingService } from './flapping';

const publicStatusLogger = logger.child({ component: 'public-status' });

const HOUR_MS = 60 * 60 * 1000;
const HISTORY_BUCKETS = 24;
export const PUBLIC_STATUS_CACHE_TTL_MS = 5_000;

type PublicMonitorWithLatest = Prisma.MonitorGetPayload<{
    include: {
        checkResults: {
            orderBy: { timestamp: 'desc' };
            take: 1;
        };
    };
}>;

type PublicHistoryBucketAccumulator = {
    timestamp: string;
    totalChecks: number;
    upChecks: number;
    responseTimeTotalMs: number;
};

type PublicStatusAggregateRow = {
    monitorId: string;
    bucketStartMs: number | bigint;
    totalChecks: number | bigint;
    upChecks: number | bigint;
    responseTimeTotalMs: number | bigint | null;
};

type PublicStatusSummary = PublicStatusResponse['summary'];

export type PublicStatusCacheStatus = {
    ttlSec: number;
    hasSnapshot: boolean;
    lastBuildAt: string | null;
    lastBuildDurationMs: number | null;
    hitCount: number;
    missCount: number;
    staleServeCount: number;
    refreshInFlight: boolean;
    lastError: string | null;
};

type PublicStatusServiceOptions = {
    db?: PrismaClient;
    ttlMs?: number;
    now?: () => number;
    buildSnapshot?: (db: PrismaClient) => Promise<PublicStatusResponse>;
};

function toNumber(value: number | bigint | null | undefined): number {
    if (value === null || value === undefined) {
        return 0;
    }

    return typeof value === 'bigint' ? Number(value) : value;
}

function alignToHour(date: Date): Date {
    const aligned = new Date(date);
    aligned.setUTCMinutes(0, 0, 0);
    return aligned;
}

function createEmptyBucketSeries(startTime: Date): PublicHistoryBucketAccumulator[] {
    return Array.from({ length: HISTORY_BUCKETS }, (_, index) => ({
        timestamp: new Date(startTime.getTime() + index * HOUR_MS).toISOString(),
        totalChecks: 0,
        upChecks: 0,
        responseTimeTotalMs: 0,
    }));
}

function toPublicStatusBucket(bucket: PublicHistoryBucketAccumulator): PublicStatusBucket {
    return {
        timestamp: bucket.timestamp,
        totalChecks: bucket.totalChecks,
        upChecks: bucket.upChecks,
        uptimePercent: bucket.totalChecks > 0
            ? Number(((bucket.upChecks / bucket.totalChecks) * 100).toFixed(1))
            : null,
        avgResponseTimeMs: bucket.totalChecks > 0
            ? Math.round(bucket.responseTimeTotalMs / bucket.totalChecks)
            : null,
    };
}

function getPublicMonitorStatus(monitor: Pick<PublicMonitorWithLatest, 'isActive' | 'checkResults'>): PublicStatusMonitor['status'] {
    if (!monitor.isActive) {
        return 'paused';
    }

    const lastCheck = monitor.checkResults[0];
    if (!lastCheck) {
        return 'unknown';
    }

    return lastCheck.isUp ? 'up' : 'down';
}

function serializeLastCheck(result: PublicMonitorWithLatest['checkResults'][number] | undefined): CheckResult | null {
    if (!result) {
        return null;
    }

    return {
        id: result.id,
        monitorId: result.monitorId,
        timestamp: result.timestamp.toISOString(),
        isUp: result.isUp,
        responseTimeMs: result.responseTimeMs,
        statusCode: result.statusCode,
        error: result.error,
        sslExpiresAt: result.sslExpiresAt ? result.sslExpiresAt.toISOString() : null,
        sslDaysRemaining: result.sslDaysRemaining,
        sslIssuer: result.sslIssuer,
        sslSubject: result.sslSubject,
    };
}

async function fetchAggregatedPublicHistory(
    db: PrismaClient,
    monitorIds: string[],
    seriesStartMs: number,
): Promise<PublicStatusAggregateRow[]> {
    if (monitorIds.length === 0) {
        return [];
    }

    return db.$queryRaw<PublicStatusAggregateRow[]>(Prisma.sql`
        SELECT
            "monitorId" AS monitorId,
            CAST("timestamp" / ${HOUR_MS} AS INTEGER) * ${HOUR_MS} AS bucketStartMs,
            COUNT(*) AS totalChecks,
            SUM(CASE WHEN "isUp" = 1 THEN 1 ELSE 0 END) AS upChecks,
            SUM("responseTimeMs") AS responseTimeTotalMs
        FROM "CheckResult"
        WHERE "monitorId" IN (${Prisma.join(monitorIds)}) AND "timestamp" >= ${seriesStartMs}
        GROUP BY "monitorId", bucketStartMs
        ORDER BY bucketStartMs ASC
    `);
}

export async function buildPublicStatusSnapshot(db: PrismaClient = prisma): Promise<PublicStatusResponse> {
    const generatedAt = new Date();
    const alignedHour = alignToHour(generatedAt);
    const seriesStart = new Date(alignedHour.getTime() - (HISTORY_BUCKETS - 1) * HOUR_MS);
    const seriesStartMs = seriesStart.getTime();

    const monitors = await db.monitor.findMany({
        where: {
            isPublic: true,
        },
        include: {
            checkResults: {
                orderBy: { timestamp: 'desc' },
                take: 1,
            },
        },
        orderBy: [
            { isActive: 'desc' },
            { name: 'asc' },
        ],
    });

    const monitorIds = monitors.map((monitor) => monitor.id);
    const aggregatedRows = await fetchAggregatedPublicHistory(db, monitorIds, seriesStartMs);

    const historyByMonitorId = new Map<string, PublicHistoryBucketAccumulator[]>();
    const globalHistory = createEmptyBucketSeries(seriesStart);

    for (const monitor of monitors) {
        historyByMonitorId.set(monitor.id, createEmptyBucketSeries(seriesStart));
    }

    for (const row of aggregatedRows) {
        const bucketStartMs = toNumber(row.bucketStartMs);
        const bucketIndex = Math.floor((bucketStartMs - seriesStartMs) / HOUR_MS);
        if (bucketIndex < 0 || bucketIndex >= HISTORY_BUCKETS) {
            continue;
        }

        const monitorHistory = historyByMonitorId.get(row.monitorId);
        if (!monitorHistory) {
            continue;
        }

        const totalChecks = toNumber(row.totalChecks);
        const upChecks = toNumber(row.upChecks);
        const responseTimeTotalMs = toNumber(row.responseTimeTotalMs);

        const monitorBucket = monitorHistory[bucketIndex];
        monitorBucket.totalChecks = totalChecks;
        monitorBucket.upChecks = upChecks;
        monitorBucket.responseTimeTotalMs = responseTimeTotalMs;

        const globalBucket = globalHistory[bucketIndex];
        globalBucket.totalChecks += totalChecks;
        globalBucket.upChecks += upChecks;
        globalBucket.responseTimeTotalMs += responseTimeTotalMs;
    }

    const uptimeRows = monitors.map((monitor) => {
        const monitorHistory = historyByMonitorId.get(monitor.id) ?? createEmptyBucketSeries(seriesStart);
        const total24h = monitorHistory.reduce((sum, bucket) => sum + bucket.totalChecks, 0);
        const up24h = monitorHistory.reduce((sum, bucket) => sum + bucket.upChecks, 0);
        const state = FlappingService.getDiagnosticState(monitor.id);
        const status = getPublicMonitorStatus(monitor);

        return {
            id: monitor.id,
            name: monitor.name,
            serviceName: monitor.serviceName,
            type: monitor.type as PublicStatusMonitor['type'],
            url: monitor.url,
            dnsRecordType: monitor.dnsRecordType as PublicStatusMonitor['dnsRecordType'],
            method: monitor.method,
            isActive: monitor.isActive,
            status: state && status === 'down' ? 'down' : status,
            lastCheck: serializeLastCheck(monitor.checkResults[0]),
            uptimePercent24h: total24h > 0 ? ((up24h / total24h) * 100).toFixed(1) : '—',
            history24h: monitorHistory.map(toPublicStatusBucket),
        } satisfies PublicStatusMonitor;
    });

    const summary = uptimeRows.reduce<PublicStatusSummary>((acc, monitor) => {
        acc[monitor.status] += 1;
        return acc;
    }, {
        up: 0,
        down: 0,
        paused: 0,
        unknown: 0,
    });

    return {
        generatedAt: generatedAt.toISOString(),
        monitorCount: uptimeRows.length,
        summary,
        history24h: globalHistory.map(toPublicStatusBucket),
        monitors: uptimeRows,
    };
}

export class PublicStatusService {
    private readonly db: PrismaClient;
    private readonly ttlMs: number;
    private readonly now: () => number;
    private readonly buildSnapshotFn: (db: PrismaClient) => Promise<PublicStatusResponse>;
    private snapshot: PublicStatusResponse | null = null;
    private snapshotExpiresAtMs = 0;
    private refreshPromise: Promise<void> | null = null;
    private lastBuildAt: string | null = null;
    private lastBuildDurationMs: number | null = null;
    private hitCount = 0;
    private missCount = 0;
    private staleServeCount = 0;
    private lastError: string | null = null;

    constructor(options: PublicStatusServiceOptions = {}) {
        this.db = options.db ?? prisma;
        this.ttlMs = options.ttlMs ?? PUBLIC_STATUS_CACHE_TTL_MS;
        this.now = options.now ?? (() => Date.now());
        this.buildSnapshotFn = options.buildSnapshot ?? buildPublicStatusSnapshot;
    }

    async getSnapshot(): Promise<PublicStatusResponse> {
        const now = this.now();
        if (this.snapshot && now < this.snapshotExpiresAtMs) {
            this.hitCount += 1;
            return this.snapshot;
        }

        if (this.refreshPromise) {
            if (this.snapshot) {
                this.staleServeCount += 1;
                return this.snapshot;
            }

            this.missCount += 1;
            await this.refreshPromise;
            if (!this.snapshot) {
                throw new Error('Public status snapshot unavailable');
            }

            return this.snapshot;
        }

        this.refreshPromise = this.refreshSnapshot();

        if (this.snapshot) {
            this.staleServeCount += 1;
            void this.refreshPromise;
            return this.snapshot;
        }

        this.missCount += 1;
        await this.refreshPromise;
        if (!this.snapshot) {
            throw new Error('Public status snapshot unavailable');
        }

        return this.snapshot;
    }

    getStatus(): PublicStatusCacheStatus {
        return {
            ttlSec: Math.floor(this.ttlMs / 1000),
            hasSnapshot: this.snapshot !== null,
            lastBuildAt: this.lastBuildAt,
            lastBuildDurationMs: this.lastBuildDurationMs,
            hitCount: this.hitCount,
            missCount: this.missCount,
            staleServeCount: this.staleServeCount,
            refreshInFlight: this.refreshPromise !== null,
            lastError: this.lastError,
        };
    }

    reset() {
        this.snapshot = null;
        this.snapshotExpiresAtMs = 0;
        this.refreshPromise = null;
        this.lastBuildAt = null;
        this.lastBuildDurationMs = null;
        this.hitCount = 0;
        this.missCount = 0;
        this.staleServeCount = 0;
        this.lastError = null;
    }

    private async refreshSnapshot() {
        const startedAt = this.now();

        try {
            const snapshot = await this.buildSnapshotFn(this.db);
            this.snapshot = snapshot;
            this.snapshotExpiresAtMs = this.now() + this.ttlMs;
            this.lastBuildAt = snapshot.generatedAt;
            this.lastBuildDurationMs = this.now() - startedAt;
            this.lastError = null;
        } catch (err) {
            this.lastBuildDurationMs = this.now() - startedAt;
            this.lastError = err instanceof Error ? err.message : String(err);
            publicStatusLogger.error({ err }, 'Failed to refresh public status snapshot');
            throw err;
        } finally {
            this.refreshPromise = null;
        }
    }
}

export const publicStatusService = new PublicStatusService();
