import { FastifyReply } from 'fastify';

const MAX_SSE_CLIENTS = 100;
const HEARTBEAT_INTERVAL_MS = 30_000;

class SSEService {
    private clients: Set<FastifyReply> = new Set();
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private totalAccepted = 0;
    private totalRejected = 0;
    private totalDisconnected = 0;
    private failedWrites = 0;
    private lastAcceptedAt: string | null = null;
    private lastRejectedAt: string | null = null;
    private lastDisconnectedAt: string | null = null;
    private lastHeartbeatAt: string | null = null;
    private lastBroadcastAt: string | null = null;

    constructor() {
        this.startHeartbeat();
    }

    addClient(client: FastifyReply): boolean {
        if (this.clients.size >= MAX_SSE_CLIENTS) {
            this.totalRejected += 1;
            this.lastRejectedAt = new Date().toISOString();
            return false;
        }

        this.clients.add(client);
        this.totalAccepted += 1;
        this.lastAcceptedAt = new Date().toISOString();

        client.raw.on('close', () => {
            if (this.clients.delete(client)) {
                this.totalDisconnected += 1;
                this.lastDisconnectedAt = new Date().toISOString();
            }
        });

        return true;
    }

    broadcast(event: string, data: any) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        this.lastBroadcastAt = new Date().toISOString();
        for (const client of this.clients) {
            try {
                client.raw.write(payload);
            } catch {
                this.failedWrites += 1;
                if (this.clients.delete(client)) {
                    this.totalDisconnected += 1;
                    this.lastDisconnectedAt = new Date().toISOString();
                }
            }
        }
    }

    private startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.lastHeartbeatAt = new Date().toISOString();
            for (const client of this.clients) {
                try {
                    client.raw.write(':heartbeat\n\n');
                } catch {
                    this.failedWrites += 1;
                    if (this.clients.delete(client)) {
                        this.totalDisconnected += 1;
                        this.lastDisconnectedAt = new Date().toISOString();
                    }
                }
            }
        }, HEARTBEAT_INTERVAL_MS);
    }

    stop() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    get clientCount(): number {
        return this.clients.size;
    }

    getStatus() {
        return {
            currentClients: this.clients.size,
            maxClients: MAX_SSE_CLIENTS,
            totalAccepted: this.totalAccepted,
            totalRejected: this.totalRejected,
            totalDisconnected: this.totalDisconnected,
            failedWrites: this.failedWrites,
            lastAcceptedAt: this.lastAcceptedAt,
            lastRejectedAt: this.lastRejectedAt,
            lastDisconnectedAt: this.lastDisconnectedAt,
            lastHeartbeatAt: this.lastHeartbeatAt,
            lastBroadcastAt: this.lastBroadcastAt,
        };
    }
}

export const sseService = new SSEService();
