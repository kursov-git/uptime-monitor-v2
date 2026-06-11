import { performCheck } from '@uptime-monitor/checker';
import { CURRENT_AGENT_VERSION } from '@uptime-monitor/shared';
import { readAgentEnv, type AgentEnv } from './config';
import {
    buildBufferedResult,
    buildCheckInput,
    calculateSseReconnectDelayMs,
    decryptAgentPayload,
    parseSseEvent,
    shouldResyncJobsFromSseEvent,
    type AgentJob,
    type ApiMethod,
    type BufferedResult,
    type JsonRequestBody,
} from './agentProtocol';

class AgentRuntime {
    private readonly config: AgentEnv;
    private jobs = new Map<string, AgentJob>();
    private timers = new Map<string, NodeJS.Timeout>();
    private queue: BufferedResult[] = [];
    private droppedResultsCounter = 0;
    private sending = false;
    private inFlightChecks = 0;
    private stopped = false;
    private heartbeatIntervalSec = 30;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private lastEventId = 0;
    private sseReconnectAttempts = 0;

    constructor(config: AgentEnv = readAgentEnv()) {
        this.config = config;
    }

    async start() {
        await this.bootstrapJobs();
        this.startHeartbeatLoop();
        this.startSseLoop().catch((err) => {
            console.error('SSE loop crashed:', err);
        });

        process.on('SIGINT', () => this.stop('SIGINT'));
        process.on('SIGTERM', () => this.stop('SIGTERM'));
    }

    private async stop(signal: string) {
        if (this.stopped) return;
        this.stopped = true;
        console.log(`Received ${signal}, stopping agent runtime...`);

        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();

        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        await this.flushResults();
        process.exit(0);
    }

    private async bootstrapJobs() {
        const data = await this.requestJson<{ heartbeatIntervalSec: number; jobs: AgentJob[] }>('GET', '/api/agent/jobs');
        this.heartbeatIntervalSec = data.heartbeatIntervalSec || this.heartbeatIntervalSec;
        this.replaceJobs(data.jobs || []);
    }

    private replaceJobs(nextJobs: AgentJob[]) {
        const nextIds = new Set(nextJobs.map((j) => j.monitorId));

        for (const monitorId of Array.from(this.jobs.keys())) {
            if (!nextIds.has(monitorId)) {
                this.jobs.delete(monitorId);
                const timer = this.timers.get(monitorId);
                if (timer) {
                    clearTimeout(timer);
                    this.timers.delete(monitorId);
                }
            }
        }

        for (const job of nextJobs) {
            this.jobs.set(job.monitorId, job);
            this.schedule(job.monitorId);
        }

        console.log(`Loaded ${this.jobs.size} jobs`);
    }

    private schedule(monitorId: string) {
        const job = this.jobs.get(monitorId);
        if (!job || this.stopped) return;

        const existing = this.timers.get(monitorId);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(async () => {
            await this.runCheck(monitorId);
            if (this.jobs.has(monitorId) && !this.stopped) {
                this.schedule(monitorId);
            }
        }, Math.max(1, Math.floor(job.intervalSeconds * 1000)));

        this.timers.set(monitorId, timer);
    }

    private async runCheck(monitorId: string) {
        const job = this.jobs.get(monitorId);
        if (!job) return;
        if (this.inFlightChecks >= this.config.maxConcurrency) {
            console.warn(`Concurrency cap reached (${this.config.maxConcurrency}), skipping cycle for ${monitorId}`);
            return;
        }

        this.inFlightChecks += 1;
        try {
            const authPayload = decryptAgentPayload(
                job.authPayloadEncrypted || null,
                job.keyVersion || 1,
                this.config,
            );

            const result = await performCheck(buildCheckInput(
                job,
                authPayload,
                this.config.allowPrivateMonitorTargets,
            ));

            this.enqueue(buildBufferedResult(job, result));

            await this.flushResults();
        } catch (err) {
            console.error(`Check failed for monitor ${monitorId}:`, err);
        } finally {
            this.inFlightChecks -= 1;
        }
    }

    private enqueue(result: BufferedResult) {
        this.queue.push(result);
        if (this.queue.length > this.config.bufferMax) {
            this.queue.shift();
            this.droppedResultsCounter += 1;
            console.warn(`Agent queue overflow: dropped oldest result (total dropped=${this.droppedResultsCounter})`);
        }
    }

    private async flushResults() {
        if (this.sending || this.queue.length === 0) return;
        this.sending = true;

        try {
            while (this.queue.length > 0) {
                const batch = this.queue.slice(0, this.config.resultMaxBatch);
                const res = await this.requestJson<{ acceptedCount: number; duplicateCount: number }>(
                    'POST',
                    '/api/agent/results',
                    { results: batch }
                );
                this.queue.splice(0, batch.length);
                if (res.duplicateCount > 0) {
                    console.log(`Deduped ${res.duplicateCount} duplicate results`);
                }
            }
        } catch (err) {
            console.warn('Flush failed, queue retained for retry');
        } finally {
            this.sending = false;
        }
    }

    private startHeartbeatLoop() {
        const loop = async () => {
            if (this.stopped) return;
            try {
                const res = await this.requestJson<{ heartbeatIntervalSec?: number; commands?: string[] }>(
                    'POST',
                    '/api/agent/heartbeat',
                    {
                        agentVersion: CURRENT_AGENT_VERSION,
                        queueSize: this.queue.length,
                        inFlightChecks: this.inFlightChecks,
                    }
                );
                if (typeof res.heartbeatIntervalSec === 'number' && res.heartbeatIntervalSec > 0) {
                    this.heartbeatIntervalSec = res.heartbeatIntervalSec;
                }
                if ((res.commands || []).includes('RESYNC_JOBS')) {
                    await this.bootstrapJobs();
                }
            } catch (err) {
                console.warn('Heartbeat failed:', err);
            } finally {
                this.heartbeatTimer = setTimeout(loop, this.heartbeatIntervalSec * 1000);
            }
        };

        this.heartbeatTimer = setTimeout(loop, this.heartbeatIntervalSec * 1000);
    }

    private async startSseLoop() {
        while (!this.stopped) {
            try {
                await this.consumeSse();
                this.sseReconnectAttempts = 0;
            } catch (err) {
                this.sseReconnectAttempts += 1;
                const delayMs = this.getSseReconnectDelayMs(this.sseReconnectAttempts);
                console.warn(
                    `SSE connection lost, reconnecting in ${delayMs}ms (attempt=${this.sseReconnectAttempts})...`,
                    err instanceof Error ? err.message : err
                );
                await sleep(delayMs);
            }
        }
    }

    private getSseReconnectDelayMs(attempt: number): number {
        return calculateSseReconnectDelayMs(attempt);
    }

    private async consumeSse() {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.config.agentToken}`,
            Accept: 'text/event-stream',
        };
        if (this.lastEventId > 0) {
            headers['Last-Event-ID'] = String(this.lastEventId);
        }

        const res = await fetch(`${this.config.mainServerUrl}/api/agent/stream`, {
            method: 'GET',
            headers,
        });

        if (!res.ok || !res.body) {
            throw new Error(`SSE failed with status ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!this.stopped) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let splitIndex = buffer.indexOf('\n\n');
            while (splitIndex !== -1) {
                const rawEvent = buffer.slice(0, splitIndex);
                buffer = buffer.slice(splitIndex + 2);
                await this.handleSseEvent(rawEvent);
                splitIndex = buffer.indexOf('\n\n');
            }
        }
    }

    private async handleSseEvent(raw: string) {
        const parsed = parseSseEvent(raw);
        if (!parsed) return;

        if (parsed.lastEventId !== null) {
            this.lastEventId = parsed.lastEventId;
        }

        if (shouldResyncJobsFromSseEvent(parsed.event, parsed.payload)) {
            await this.bootstrapJobs();
        }
    }

    private async requestJson<T>(method: ApiMethod, path: string, body?: JsonRequestBody): Promise<T> {
        const res = await fetch(`${this.config.mainServerUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.config.agentToken}`,
                'Content-Type': 'application/json',
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(this.config.httpTimeoutMs),
        });

        const text = await res.text();
        const payload = text ? JSON.parse(text) : {};

        if (!res.ok) {
            throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(payload)}`);
        }

        return payload as T;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startAgentRuntime() {
    return new AgentRuntime().start();
}

if (require.main === module) {
    startAgentRuntime().catch((err) => {
        console.error('Failed to start agent runtime:', err);
        process.exit(1);
    });
}
