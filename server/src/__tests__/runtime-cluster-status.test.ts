import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRuntimeClusterStatus, RuntimeStatusPublisher } from '../services/runtimeClusterStatus';

const runtimeDir = path.join(os.tmpdir(), 'uptime-monitor-runtime-status');

describe('RuntimeClusterStatus', () => {
    beforeEach(async () => {
        await fs.rm(runtimeDir, { recursive: true, force: true });
    });

    afterEach(async () => {
        await fs.rm(runtimeDir, { recursive: true, force: true });
    });

    it('aggregates split runtime roles into one cluster status', async () => {
        const apiPublisher = new RuntimeStatusPublisher('api', () => ({
            serverRole: 'api',
            runtime: {
                agentApiEnabled: true,
                agentSseEnabled: true,
                builtinWorkerEnabled: false,
            },
            services: {
                worker: {
                    running: false,
                    scheduledMonitors: 0,
                    syncLoopActive: false,
                    lastRefreshAt: null,
                    lastRefreshDurationMs: null,
                    lastRefreshError: null,
                    lastCheckCompletedAt: null,
                    lastCheckMonitorId: null,
                    lastCheckMonitorName: null,
                    lastCheckError: null,
                },
                retention: {
                    running: false,
                    lastRunAt: null,
                    lastDurationMs: null,
                    lastRetentionDays: null,
                    lastDeletedCheckResults: 0,
                    lastDeletedAuditLogs: 0,
                    lastDeletedNotificationHistory: 0,
                    lastDeleteBatchCount: 0,
                    lastBusyRetryCount: 0,
                    lastError: null,
                },
                agentOfflineMonitor: {
                    running: false,
                    lastRunAt: null,
                    lastDurationMs: null,
                    lastMarkedOfflineCount: 0,
                    lastError: null,
                },
            },
            caches: {
                publicStatus: {
                    ttlSec: 5,
                    hasSnapshot: true,
                    lastBuildAt: '2026-04-20T00:00:00.000Z',
                    lastBuildDurationMs: 42,
                    hitCount: 1,
                    missCount: 1,
                    staleServeCount: 0,
                    refreshInFlight: false,
                    lastError: null,
                },
            },
        }));

        const workerPublisher = new RuntimeStatusPublisher('worker', () => ({
            serverRole: 'worker',
            runtime: {
                agentApiEnabled: true,
                agentSseEnabled: true,
                builtinWorkerEnabled: true,
            },
            services: {
                worker: {
                    running: true,
                    scheduledMonitors: 2,
                    syncLoopActive: true,
                    lastRefreshAt: '2026-04-20T00:00:01.000Z',
                    lastRefreshDurationMs: 12,
                    lastRefreshError: null,
                    lastCheckCompletedAt: '2026-04-20T00:00:02.000Z',
                    lastCheckMonitorId: null,
                    lastCheckMonitorName: 'Monitor A',
                    lastCheckError: null,
                },
                retention: {
                    running: false,
                    lastRunAt: null,
                    lastDurationMs: null,
                    lastRetentionDays: null,
                    lastDeletedCheckResults: 0,
                    lastDeletedAuditLogs: 0,
                    lastDeletedNotificationHistory: 0,
                    lastDeleteBatchCount: 0,
                    lastBusyRetryCount: 0,
                    lastError: null,
                },
                agentOfflineMonitor: {
                    running: false,
                    lastRunAt: null,
                    lastDurationMs: null,
                    lastMarkedOfflineCount: 0,
                    lastError: null,
                },
            },
            caches: {
                publicStatus: {
                    ttlSec: 5,
                    hasSnapshot: false,
                    lastBuildAt: null,
                    lastBuildDurationMs: null,
                    hitCount: 0,
                    missCount: 0,
                    staleServeCount: 0,
                    refreshInFlight: false,
                    lastError: null,
                },
            },
        }));

        await apiPublisher.start();
        await workerPublisher.start();

        const cluster = await getRuntimeClusterStatus();

        expect(cluster.api.present).toBe(true);
        expect(cluster.api.sourceRole).toBe('api');
        expect(cluster.api.runtime?.builtinWorkerEnabled).toBe(false);
        expect(cluster.worker.present).toBe(true);
        expect(cluster.worker.sourceRole).toBe('worker');
        expect(cluster.worker.status).toMatchObject({
            running: true,
            scheduledMonitors: 2,
            syncLoopActive: true,
            lastCheckMonitorName: 'Monitor A',
        });
        expect(cluster.retention.present).toBe(false);
        expect(cluster.agentOfflineMonitor.present).toBe(false);

        await apiPublisher.stop();
        await workerPublisher.stop();
    });
});
