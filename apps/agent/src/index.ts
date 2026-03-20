import crypto from 'crypto';
import { performCheck } from '@uptime-monitor/checker';
import { CURRENT_AGENT_VERSION } from '@uptime-monitor/shared';
import { agentEnv } from './config';

type AgentJob = {
    monitorId: string;
    type: 'HTTP' | 'TCP' | 'DNS';
    url: string;
    dnsRecordType?: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS';
    method: string;
    intervalSeconds: number;
    timeoutMs: number;
    expectedStatus: number;
    expectedBody: string | null;
    requestBody?: string | null;
    bodyAssertionType?: string | null;
    bodyAssertionPath?: string | null;
    headers?: string | null;
    authMethod?: string;
    authUrl?: string | null;
    authPayloadEncrypted?: string | null;
    authTokenRegex?: string | null;
    sslExpiryEnabled?: boolean;
    sslExpiryThresholdDays?: number;
    keyVersion?: number;
    version?: number;
};

type BufferedSslMeta = {
    expiresAt?: string | null;
    daysRemaining?: number | null;
    issuer?: string | null;
    subject?: string | null;
};

type BufferedResult = {
    idempotencyKey: string;
    monitorId: string;
    checkedAt: string;
    isUp: boolean;
    responseTimeMs: number;
    statusCode?: number | null;
    error?: string | null;
    meta?: {
        ssl?: BufferedSslMeta;
    };
};

const MAIN_SERVER_URL = agentEnv.mainServerUrl;
const AGENT_TOKEN = agentEnv.agentToken;
const AGENT_HTTP_TIMEOUT_MS = agentEnv.httpTimeoutMs;
const AGENT_BUFFER_MAX = agentEnv.bufferMax;
const AGENT_RESULT_MAX_BATCH = agentEnv.resultMaxBatch;
const AGENT_MAX_CONCURRENCY = agentEnv.maxConcurrency;
const ALLOW_PRIVATE_MONITOR_TARGETS = agentEnv.allowPrivateMonitorTargets;

class AgentRuntime {
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
        if (this.inFlightChecks >= AGENT_MAX_CONCURRENCY) {
            console.warn(`Concurrency cap reached (${AGENT_MAX_CONCURRENCY}), skipping cycle for ${monitorId}`);
            return;
        }

        this.inFlightChecks += 1;
        try {
            const authPayload = decryptAgentPayload(job.authPayloadEncrypted || null, job.keyVersion || 1);

            const result = await performCheck({
                type: job.type,
                url: job.url,
                dnsRecordType: job.dnsRecordType || 'A',
                method: job.method,
                timeoutSeconds: Math.ceil(job.timeoutMs / 1000),
                expectedStatus: job.expectedStatus,
                expectedBody: job.expectedBody,
                requestBody: job.requestBody || null,
                bodyAssertionType: job.bodyAssertionType || 'AUTO',
                bodyAssertionPath: job.bodyAssertionPath || null,
                headers: job.headers || null,
                authMethod: job.authMethod || 'NONE',
                authUrl: job.authUrl || null,
                authPayload,
                authTokenRegex: job.authTokenRegex || null,
                sslExpiryEnabled: job.sslExpiryEnabled || false,
                sslExpiryThresholdDays: job.sslExpiryThresholdDays || 14,
                allowPrivateTargets: ALLOW_PRIVATE_MONITOR_TARGETS,
            });

            this.enqueue({
                idempotencyKey: buildIdempotencyKey(job.monitorId),
                monitorId: job.monitorId,
                checkedAt: new Date().toISOString(),
                isUp: result.isUp,
                responseTimeMs: result.responseTimeMs,
                statusCode: result.statusCode,
                error: result.error,
                meta: result.ssl ? {
                    ssl: {
                        expiresAt: result.ssl.expiresAt,
                        daysRemaining: result.ssl.daysRemaining,
                        issuer: result.ssl.issuer,
                        subject: result.ssl.subject,
                    },
                } : undefined,
            });

            await this.flushResults();
        } catch (err) {
            console.error(`Check failed for monitor ${monitorId}:`, err);
        } finally {
            this.inFlightChecks -= 1;
        }
    }

    private enqueue(result: BufferedResult) {
        this.queue.push(result);
        if (this.queue.length > AGENT_BUFFER_MAX) {
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
                const batch = this.queue.slice(0, AGENT_RESULT_MAX_BATCH);
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
            } catch (err) {
                console.warn('SSE connection lost, reconnecting...', err instanceof Error ? err.message : err);
                await sleep(2000);
            }
        }
    }

    private async consumeSse() {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${AGENT_TOKEN}`,
            Accept: 'text/event-stream',
        };
        if (this.lastEventId > 0) {
            headers['Last-Event-ID'] = String(this.lastEventId);
        }

        const res = await fetch(`${MAIN_SERVER_URL}/api/agent/stream`, {
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
        if (!raw || raw.startsWith(':')) return;

        let event = 'message';
        let data = '';

        for (const line of raw.split('\n')) {
            if (line.startsWith('id:')) {
                const parsed = Number.parseInt(line.slice(3).trim(), 10);
                if (!Number.isNaN(parsed)) {
                    this.lastEventId = parsed;
                }
            } else if (line.startsWith('event:')) {
                event = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                data += line.slice(5).trim();
            }
        }

        if (!data) return;

        let payload: any = null;
        try {
            payload = JSON.parse(data);
        } catch {
            return;
        }

        if (event === 'monitor.upsert' || event === 'monitor.delete') {
            await this.bootstrapJobs();
            return;
        }

        if (event === 'agent.command' && payload?.command === 'RESYNC_JOBS') {
            await this.bootstrapJobs();
        }
    }

    private async requestJson<T>(method: string, path: string, body?: any): Promise<T> {
        const res = await fetch(`${MAIN_SERVER_URL}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${AGENT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(AGENT_HTTP_TIMEOUT_MS),
        });

        const text = await res.text();
        const payload = text ? JSON.parse(text) : {};

        if (!res.ok) {
            throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(payload)}`);
        }

        return payload as T;
    }
}

function buildIdempotencyKey(monitorId: string): string {
    return `${monitorId}:${Date.now()}:${crypto.randomUUID()}`;
}

function getKeyForVersion(version: number): Buffer | null {
    const specific = process.env[`ENCRYPTION_KEY_${version}`];
    const fallback = process.env.ENCRYPTION_KEY;
    const keyHex = specific || fallback;
    if (!keyHex) return null;

    try {
        return Buffer.from(keyHex, 'hex');
    } catch {
        return null;
    }
}

function decryptAgentPayload(ciphertext: string | null, keyVersion: number): string | null {
    if (!ciphertext) return null;
    if (!ciphertext.startsWith('enc:')) return ciphertext;

    const key = getKeyForVersion(keyVersion);
    if (!key) return ciphertext;

    const parts = ciphertext.split(':');
    if (parts.length !== 4) return ciphertext;

    const [, ivHex, authTagHex, encryptedHex] = parts;
    try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return ciphertext;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

new AgentRuntime().start().catch((err) => {
    console.error('Failed to start agent runtime:', err);
    process.exit(1);
});
