import { FastifyReply } from 'fastify';

const MAX_SSE_CLIENTS = 200;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_EVENT_LOG = 1000;

type AgentEvent = {
    id: number;
    event: string;
    data: any;
    createdAt: number;
};

type AgentClient = {
    reply: FastifyReply;
    agentId: string;
};

class AgentSSEService {
    private clients: Set<AgentClient> = new Set();
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private events: AgentEvent[] = [];
    private cursor = 0;
    private totalAccepted = 0;
    private totalRejected = 0;
    private totalDisconnected = 0;
    private failedWrites = 0;
    private lastHeartbeatAt: string | null = null;
    private lastPublishedAt: string | null = null;

    constructor() {
        this.startHeartbeat();
    }

    addClient(client: FastifyReply, agentId: string): boolean {
        if (this.clients.size >= MAX_SSE_CLIENTS) {
            this.totalRejected += 1;
            return false;
        }

        const wrapper: AgentClient = { reply: client, agentId };
        this.clients.add(wrapper);
        this.totalAccepted += 1;
        client.raw.on('close', () => {
            if (this.clients.delete(wrapper)) {
                this.totalDisconnected += 1;
            }
        });

        return true;
    }

    removeClient(reply: FastifyReply) {
        for (const c of this.clients) {
            if (c.reply === reply) {
                if (this.clients.delete(c)) {
                    this.totalDisconnected += 1;
                }
                break;
            }
        }
    }

    publish(event: string, data: any) {
        const id = ++this.cursor;
        const payload: AgentEvent = {
            id,
            event,
            data,
            createdAt: Date.now(),
        };
        this.lastPublishedAt = new Date(payload.createdAt).toISOString();

        this.events.push(payload);
        if (this.events.length > MAX_EVENT_LOG) {
            this.events = this.events.slice(-MAX_EVENT_LOG);
        }

        this.broadcast(payload);
    }

    replaySince(agentId: string, lastEventId: number): { stale: boolean; replayed: number } {
        if (this.events.length === 0) {
            return { stale: false, replayed: 0 };
        }

        const oldest = this.events[0].id;
        if (lastEventId < oldest - 1) {
            return { stale: true, replayed: 0 };
        }

        const replay = this.events.filter((e) => e.id > lastEventId && this.matchesAgent(e, agentId));
        return { stale: false, replayed: replay.length };
    }

    replayToClient(reply: FastifyReply, agentId: string, lastEventId: number) {
        const replay = this.events.filter((e) => e.id > lastEventId && this.matchesAgent(e, agentId));
        for (const evt of replay) {
            this.write(reply, evt);
        }
    }

    private matchesAgent(evt: AgentEvent, agentId: string): boolean {
        const targetAgentId = evt.data?.agentId as string | undefined;
        return !targetAgentId || targetAgentId === agentId;
    }

    private broadcast(evt: AgentEvent) {
        for (const client of this.clients) {
            if (!this.matchesAgent(evt, client.agentId)) continue;
            this.write(client.reply, evt);
        }
    }

    private write(reply: FastifyReply, evt: AgentEvent) {
        try {
            reply.raw.write(`id: ${evt.id}\nevent: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
        } catch {
            this.failedWrites += 1;
            this.removeClient(reply);
        }
    }

    private startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.lastHeartbeatAt = new Date().toISOString();
            for (const client of this.clients) {
                try {
                    client.reply.raw.write(':heartbeat\n\n');
                } catch {
                    this.failedWrites += 1;
                    if (this.clients.delete(client)) {
                        this.totalDisconnected += 1;
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

    getStatus() {
        return {
            currentClients: this.clients.size,
            maxClients: MAX_SSE_CLIENTS,
            totalAccepted: this.totalAccepted,
            totalRejected: this.totalRejected,
            totalDisconnected: this.totalDisconnected,
            failedWrites: this.failedWrites,
            eventLogSize: this.events.length,
            lastEventId: this.cursor,
            lastHeartbeatAt: this.lastHeartbeatAt,
            lastPublishedAt: this.lastPublishedAt,
        };
    }
}

export const agentSseService = new AgentSSEService();
