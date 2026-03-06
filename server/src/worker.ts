import { PrismaClient, Monitor } from '@prisma/client';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { FlappingService } from './services/flapping';
import { sseService } from './services/sse';
import { decrypt } from './lib/crypto';

const RETRY_CONFIG = {
    retries: 3,
    retryDelay: (retryCount: number) => retryCount * 1000,
    retryCondition: (error: any) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            error.code === 'EAI_AGAIN' ||
            (error.message && error.message.includes('EAI_AGAIN')) ||
            error.code === 'ECONNRESET';
    }
};

export class CheckWorker {
    private prisma: PrismaClient;
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private syncInterval: NodeJS.Timeout | null = null;
    private flappingService: FlappingService;
    private running = false;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
        this.flappingService = new FlappingService(prisma);
    }

    async start() {
        this.running = true;
        console.log('🔄 CheckWorker starting...');

        // Load all active monitors and schedule them
        const monitors = await this.prisma.monitor.findMany({
            where: { isActive: true },
        });

        for (const monitor of monitors) {
            this.scheduleMonitor(monitor);
        }

        console.log(`📋 Scheduled ${monitors.length} monitors.`);

        // Sync with DB every 30s for new/removed monitors
        this.syncInterval = setInterval(() => this.refreshSchedule(), 30000);
    }

    stop() {
        this.running = false;
        console.log('⏹️  CheckWorker stopping...');

        // Clear all timers
        for (const [id, timer] of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    private scheduleMonitor(monitor: Monitor) {
        if (!this.running) return;

        const delayMs = monitor.intervalSeconds * 1000;

        const timer = setTimeout(async () => {
            if (!this.running) return;
            await this.performCheck(monitor);
            // Re-schedule after check completes
            // Re-fetch monitor to get latest settings
            try {
                const updated = await this.prisma.monitor.findUnique({
                    where: { id: monitor.id },
                });
                if (updated && updated.isActive && this.running) {
                    this.scheduleMonitor(updated);
                } else {
                    this.timers.delete(monitor.id);
                }
            } catch (err) {

                console.error(`Failed to fetch monitor ${monitor.id} for rescheduling`, err);
                this.timers.delete(monitor.id);
            }
        }, delayMs);

        this.timers.set(monitor.id, timer);
    }

    private async refreshSchedule() {
        if (!this.running) return;

        try {
            const activeMonitors = await this.prisma.monitor.findMany({
                where: { isActive: true },
            });

            const activeIds = new Set(activeMonitors.map(m => m.id));

            // Remove timers for monitors that are no longer active
            for (const [id, timer] of this.timers) {
                if (!activeIds.has(id)) {
                    clearTimeout(timer);
                    this.timers.delete(id);
                }
            }

            // Add timers for new monitors
            for (const monitor of activeMonitors) {
                if (!this.timers.has(monitor.id)) {
                    this.scheduleMonitor(monitor);
                }
            }
        } catch (err) {
            console.error('Error refreshing schedule:', err);
        }
    }

    private async performCheck(monitor: Monitor) {
        const startTime = Date.now();
        let isUp = false;
        let statusCode: number | null = null;
        let error: string | null = null;

        try {
            const headers: Record<string, string> = {};
            if (monitor.headers) {
                try {
                    Object.assign(headers, JSON.parse(monitor.headers));
                } catch {
                    // Invalid JSON, ignore
                }
            }

            const jar = new CookieJar();
            const client = wrapper(axios.create({
                jar,
                validateStatus: () => true
            }));

            axiosRetry(client, RETRY_CONFIG);

            // 1. Pre-flight Auth execution
            // Decrypt authPayload (may be AES-256-GCM encrypted)
            const authPayload = monitor.authPayload ? decrypt(monitor.authPayload) : monitor.authPayload;

            if (monitor.authMethod === 'BASIC' && authPayload) {
                let basicStr = authPayload;
                try {
                    const parsed = JSON.parse(authPayload);
                    if (parsed.username && parsed.password) {
                        basicStr = `${parsed.username}:${parsed.password}`;
                    }
                } catch {
                    // Keep as is
                }
                const b64 = Buffer.from(basicStr).toString('base64');
                headers['Authorization'] = `Basic ${b64}`;
            } else if ((monitor.authMethod === 'FORM_LOGIN' || monitor.authMethod === 'CSRF_FORM_LOGIN') && monitor.authUrl && authPayload) {
                // Perform login request
                let parsedPayload: any = authPayload;
                try { parsedPayload = JSON.parse(authPayload); } catch { }

                let authRes;

                if (monitor.authMethod === 'CSRF_FORM_LOGIN') {
                    // Step 1: GET to extract CSRF token and populate initial cookies in jar
                    const preAuthRes = await client({
                        method: 'GET',
                        url: monitor.authUrl,
                        timeout: monitor.timeoutSeconds * 1000,
                    });

                    let csrfToken = '';
                    const bodyStr = typeof preAuthRes.data === 'string'
                        ? preAuthRes.data
                        : JSON.stringify(preAuthRes.data);

                    const csrfMatch = /<input[^>]+name=["']csrfmiddlewaretoken["'][^>]+value=["']([^"']+)["']/i.exec(bodyStr);
                    if (csrfMatch && csrfMatch[1]) {
                        csrfToken = csrfMatch[1];
                    }

                    // Convert payload to URLSearchParams 
                    const params = new URLSearchParams();
                    if (csrfToken) {
                        params.append('csrfmiddlewaretoken', csrfToken);
                    }
                    if (typeof parsedPayload === 'object' && parsedPayload !== null) {
                        for (const [key, value] of Object.entries(parsedPayload)) {
                            params.append(key, String(value));
                        }
                    }

                    // Step 2: POST form data
                    authRes = await client({
                        method: 'POST',
                        url: monitor.authUrl,
                        data: params.toString(),
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': monitor.authUrl
                        },
                        maxRedirects: 0, // Catch the 302 or wait for 200
                        timeout: monitor.timeoutSeconds * 1000,
                    });
                    // Cookies are now automatically handled by jar
                } else {
                    // Standard FORM_LOGIN
                    // If it looks like urlencoded or user specifically wants it, we might need a branch.
                    // For now, let's keep it as is (many APIs expect JSON). But add basic support if parsed payload has only strings.

                    const isUrlEncoded = typeof parsedPayload === 'string' && parsedPayload.includes('=');

                    authRes = await client({
                        method: 'POST',
                        url: monitor.authUrl,
                        data: isUrlEncoded ? parsedPayload : parsedPayload,
                        headers: {
                            'Content-Type': isUrlEncoded ? 'application/x-www-form-urlencoded' : 'application/json'
                        },
                        timeout: monitor.timeoutSeconds * 1000,
                        maxRedirects: 0,
                    });
                    // Cookies are automatically handled by jar
                }

                // Any HTTP status between 200-399 is considered a successful login flow 
                // (e.g., 302 Redirect upon success is very common in CSRF form logins)
                if (authRes.status >= 200 && authRes.status < 400) {
                    // Extract Bearer token if regex is provided
                    if (monitor.authTokenRegex) {
                        const bodyStr = typeof authRes.data === 'string'
                            ? authRes.data
                            : JSON.stringify(authRes.data);

                        const match = new RegExp(monitor.authTokenRegex).exec(bodyStr);
                        if (match && match[1]) {
                            headers['Authorization'] = `Bearer ${match[1]}`;
                        }
                    }
                } else {
                    throw new Error(`Auth request failed with status ${authRes.status}`);
                }
            }

            // 2. Perform Main Request
            const response = await client({
                method: monitor.method as any,
                url: monitor.url,
                headers,
                timeout: monitor.timeoutSeconds * 1000,
                validateStatus: () => true, // Don't throw on non-2xx
            });

            statusCode = response.status;

            // Check status code
            if (response.status !== monitor.expectedStatus) {
                error = `Expected status ${monitor.expectedStatus}, got ${response.status}`;
                isUp = false;
            } else {
                isUp = true;
            }

            // Check body if expected
            if (isUp && monitor.expectedBody) {
                const bodyStr = typeof response.data === 'string'
                    ? response.data
                    : JSON.stringify(response.data);

                try {
                    const regex = new RegExp(monitor.expectedBody);
                    if (!regex.test(bodyStr)) {
                        isUp = false;
                        error = `Body does not match pattern: ${monitor.expectedBody}`;
                    }
                } catch {
                    // Not a valid regex, try substring match
                    if (!bodyStr.includes(monitor.expectedBody)) {
                        isUp = false;
                        error = `Body does not contain: ${monitor.expectedBody}`;
                    }
                }
            }

        } catch (err: any) {
            isUp = false;
            error = err.message || 'Unknown error';
        }

        const responseTimeMs = Date.now() - startTime;

        // Store result
        try {
            await this.prisma.checkResult.create({
                data: {
                    monitorId: monitor.id,
                    isUp,
                    responseTimeMs,
                    statusCode,
                    error,
                },
            });

            console.log(
                `${isUp ? '✅' : '❌'} ${monitor.name} (${monitor.url}) — ${responseTimeMs}ms` +
                (error ? ` — ${error}` : '')
            );

            // Handle flapping/notifications
            await this.flappingService.handleCheckResult(monitor, isUp, error);

            // Broadcast the latest state to any connected clients
            // To ensure the UI accurately reflects any potential state changes (like DOWN)
            const updatedMonitor = await this.prisma.monitor.findUnique({
                where: { id: monitor.id }
            });
            if (updatedMonitor) {
                sseService.broadcast('monitor_update', updatedMonitor);
            }

        } catch (err) {
            console.error(`Error saving check result for ${monitor.name}:`, err);
        }
    }
}
