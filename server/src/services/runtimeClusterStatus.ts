import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServerRole } from '../lib/serverRoles';
import { serverEnv } from '../lib/env';
import { logger } from '../lib/logger';

const runtimeClusterLogger = logger.child({ component: 'runtime-cluster-status' });

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_STALE_AFTER_MS = 20_000;

type RuntimeSnapshot = {
    version: 1;
    updatedAt: string;
    startedAt: string;
    hostname: string;
    pid: number;
    serverRole: ServerRole;
    runtime: {
        agentApiEnabled: boolean;
        agentSseEnabled: boolean;
        builtinWorkerEnabled: boolean;
    };
    services: {
        worker: {
            running: boolean;
            scheduledMonitors: number;
            syncLoopActive: boolean;
            lastRefreshAt: string | null;
            lastRefreshDurationMs: number | null;
            lastRefreshError: string | null;
            lastCheckCompletedAt: string | null;
            lastCheckMonitorId: string | null;
            lastCheckMonitorName: string | null;
            lastCheckError: string | null;
        };
        retention: {
            running: boolean;
            lastRunAt: string | null;
            lastDurationMs: number | null;
            lastRetentionDays: number | null;
            lastDeletedCheckResults: number;
            lastDeletedAuditLogs: number;
            lastDeletedNotificationHistory: number;
            lastDeleteBatchCount: number;
            lastBusyRetryCount: number;
            lastError: string | null;
        };
        agentOfflineMonitor: {
            running: boolean;
            lastRunAt: string | null;
            lastDurationMs: number | null;
            lastMarkedOfflineCount: number;
            lastError: string | null;
        };
    };
    caches: {
        publicStatus: {
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
    };
};

type SnapshotFactory = () => Omit<RuntimeSnapshot, 'version' | 'updatedAt' | 'startedAt' | 'hostname' | 'pid'>;

type ClusterRoleStatus = {
    present: boolean;
    fresh: boolean;
    sourceRole: ServerRole | null;
    updatedAt: string | null;
    startedAt: string | null;
    hostname: string | null;
    pid: number | null;
    runtime: RuntimeSnapshot['runtime'] | null;
    status: RuntimeSnapshot['services']['worker'] | RuntimeSnapshot['services']['retention'] | RuntimeSnapshot['services']['agentOfflineMonitor'] | null;
};

type ClusterApiStatus = {
    present: boolean;
    fresh: boolean;
    sourceRole: ServerRole | null;
    updatedAt: string | null;
    startedAt: string | null;
    hostname: string | null;
    pid: number | null;
    runtime: RuntimeSnapshot['runtime'] | null;
    caches: RuntimeSnapshot['caches'] | null;
};

export type RuntimeClusterStatus = {
    api: ClusterApiStatus;
    worker: ClusterRoleStatus;
    retention: ClusterRoleStatus;
    agentOfflineMonitor: ClusterRoleStatus;
};

function getRuntimeStatusDir() {
    if (serverEnv.databaseUrl.startsWith('file:/data/')) {
        return '/data/runtime-status';
    }

    return path.join(os.tmpdir(), 'uptime-monitor-runtime-status');
}

function getSnapshotFile(role: ServerRole) {
    return path.join(getRuntimeStatusDir(), `${role}.json`);
}

function createEmptyApiStatus(): ClusterApiStatus {
    return {
        present: false,
        fresh: false,
        sourceRole: null,
        updatedAt: null,
        startedAt: null,
        hostname: null,
        pid: null,
        runtime: null,
        caches: null,
    };
}

function createEmptyRoleStatus(): ClusterRoleStatus {
    return {
        present: false,
        fresh: false,
        sourceRole: null,
        updatedAt: null,
        startedAt: null,
        hostname: null,
        pid: null,
        runtime: null,
        status: null,
    };
}

function isFresh(updatedAt: string, nowMs: number) {
    return nowMs - new Date(updatedAt).getTime() <= HEARTBEAT_STALE_AFTER_MS;
}

function toApiStatus(snapshot: RuntimeSnapshot, nowMs: number): ClusterApiStatus {
    return {
        present: true,
        fresh: isFresh(snapshot.updatedAt, nowMs),
        sourceRole: snapshot.serverRole,
        updatedAt: snapshot.updatedAt,
        startedAt: snapshot.startedAt,
        hostname: snapshot.hostname,
        pid: snapshot.pid,
        runtime: snapshot.runtime,
        caches: snapshot.caches,
    };
}

function toRoleStatus(
    snapshot: RuntimeSnapshot,
    role: 'worker' | 'retention' | 'agentOfflineMonitor',
    nowMs: number,
): ClusterRoleStatus {
    return {
        present: true,
        fresh: isFresh(snapshot.updatedAt, nowMs),
        sourceRole: snapshot.serverRole,
        updatedAt: snapshot.updatedAt,
        startedAt: snapshot.startedAt,
        hostname: snapshot.hostname,
        pid: snapshot.pid,
        runtime: snapshot.runtime,
        status: snapshot.services[role],
    };
}

async function readSnapshotFile(filePath: string): Promise<RuntimeSnapshot | null> {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw) as RuntimeSnapshot;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return null;
        }

        runtimeClusterLogger.warn({ err, filePath }, 'Failed to read runtime status snapshot');
        return null;
    }
}

export async function getRuntimeClusterStatus(): Promise<RuntimeClusterStatus> {
    const nowMs = Date.now();
    const [allSnapshot, apiSnapshot, workerSnapshot, retentionSnapshot, offlineSnapshot] = await Promise.all([
        readSnapshotFile(getSnapshotFile('all')),
        readSnapshotFile(getSnapshotFile('api')),
        readSnapshotFile(getSnapshotFile('worker')),
        readSnapshotFile(getSnapshotFile('retention')),
        readSnapshotFile(getSnapshotFile('agent-offline-monitor')),
    ]);

    return {
        api: apiSnapshot ? toApiStatus(apiSnapshot, nowMs) : allSnapshot ? toApiStatus(allSnapshot, nowMs) : createEmptyApiStatus(),
        worker: workerSnapshot
            ? toRoleStatus(workerSnapshot, 'worker', nowMs)
            : allSnapshot
                ? toRoleStatus(allSnapshot, 'worker', nowMs)
                : createEmptyRoleStatus(),
        retention: retentionSnapshot
            ? toRoleStatus(retentionSnapshot, 'retention', nowMs)
            : allSnapshot
                ? toRoleStatus(allSnapshot, 'retention', nowMs)
                : createEmptyRoleStatus(),
        agentOfflineMonitor: offlineSnapshot
            ? toRoleStatus(offlineSnapshot, 'agentOfflineMonitor', nowMs)
            : allSnapshot
                ? toRoleStatus(allSnapshot, 'agentOfflineMonitor', nowMs)
                : createEmptyRoleStatus(),
    };
}

export class RuntimeStatusPublisher {
    private readonly snapshotFactory: SnapshotFactory;
    private readonly role: ServerRole;
    private readonly startedAt: string;
    private readonly hostname: string;
    private timer: NodeJS.Timeout | null = null;

    constructor(role: ServerRole, snapshotFactory: SnapshotFactory) {
        this.role = role;
        this.snapshotFactory = snapshotFactory;
        this.startedAt = new Date().toISOString();
        this.hostname = os.hostname();
    }

    async start() {
        await this.writeSnapshot();
        if (this.timer) {
            return;
        }

        this.timer = setInterval(() => {
            this.writeSnapshot().catch((err) => {
                runtimeClusterLogger.warn({ err, role: this.role }, 'Failed to publish runtime status heartbeat');
            });
        }, HEARTBEAT_INTERVAL_MS);
    }

    async stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        try {
            await fs.rm(getSnapshotFile(this.role), { force: true });
        } catch (err) {
            runtimeClusterLogger.warn({ err, role: this.role }, 'Failed to remove runtime status heartbeat file');
        }
    }

    private async writeSnapshot() {
        const snapshot: RuntimeSnapshot = {
            version: 1,
            updatedAt: new Date().toISOString(),
            startedAt: this.startedAt,
            hostname: this.hostname,
            pid: process.pid,
            ...this.snapshotFactory(),
        };

        const dir = getRuntimeStatusDir();
        const file = getSnapshotFile(this.role);
        const tmpFile = `${file}.tmp`;

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(tmpFile, JSON.stringify(snapshot), 'utf8');
        await fs.rename(tmpFile, file);
    }
}
