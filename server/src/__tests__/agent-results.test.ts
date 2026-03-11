import { describe, expect, it, beforeEach } from 'vitest';
import prisma from '../lib/prisma';
import { persistAgentResults } from '../services/agentResults';

describe('persistAgentResults', () => {
    beforeEach(async () => {
        await prisma.checkResult.deleteMany();
        await prisma.monitor.deleteMany();
        await prisma.agent.deleteMany();
    });

    it('writes results in batch while counting payload and database duplicates', async () => {
        const agent = await prisma.agent.create({
            data: {
                name: 'batch-agent',
                tokenHash: 'hash-batch-agent',
            },
        });

        const monitor = await prisma.monitor.create({
            data: {
                name: 'mon-1',
                url: 'https://example.com',
                agentId: agent.id,
            },
        });

        await prisma.checkResult.create({
            data: {
                monitorId: monitor.id,
                agentId: agent.id,
                resultIdempotencyKey: 'dup-in-db',
                isUp: true,
                responseTimeMs: 11,
            },
        });

        const result = await persistAgentResults(prisma, agent.id, [
            {
                idempotencyKey: 'new-a',
                monitorId: monitor.id,
                timestamp: new Date(),
                isUp: true,
                responseTimeMs: 25,
                statusCode: 200,
                error: null,
            },
            {
                idempotencyKey: 'new-a',
                monitorId: monitor.id,
                timestamp: new Date(),
                isUp: true,
                responseTimeMs: 25,
                statusCode: 200,
                error: null,
            },
            {
                idempotencyKey: 'dup-in-db',
                monitorId: monitor.id,
                timestamp: new Date(),
                isUp: false,
                responseTimeMs: 30,
                statusCode: 500,
                error: 'duplicate',
            },
        ]);

        expect(result.acceptedCount).toBe(1);
        expect(result.duplicateCount).toBe(2);
        expect(result.failed).toEqual([]);

        const rows = await prisma.checkResult.findMany({
            where: { monitorId: monitor.id },
            orderBy: { resultIdempotencyKey: 'asc' },
        });

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.resultIdempotencyKey)).toEqual(['dup-in-db', 'new-a']);
    });
});
