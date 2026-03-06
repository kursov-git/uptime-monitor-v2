import { FastifyReply } from 'fastify';

const MAX_SSE_CLIENTS = 100;
const HEARTBEAT_INTERVAL_MS = 30_000;

class SSEService {
    private clients: Set<FastifyReply> = new Set();
    private heartbeatTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.startHeartbeat();
    }

    addClient(client: FastifyReply): boolean {
        if (this.clients.size >= MAX_SSE_CLIENTS) {
            return false;
        }

        this.clients.add(client);

        client.raw.on('close', () => {
            this.clients.delete(client);
        });

        return true;
    }

    broadcast(event: string, data: any) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            try {
                client.raw.write(payload);
            } catch {
                this.clients.delete(client);
            }
        }
    }

    private startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            for (const client of this.clients) {
                try {
                    client.raw.write(':heartbeat\n\n');
                } catch {
                    this.clients.delete(client);
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
}

export const sseService = new SSEService();
