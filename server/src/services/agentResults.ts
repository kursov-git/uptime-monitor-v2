import { PrismaClient, Prisma } from '@prisma/client';

export interface AgentResultInput {
    idempotencyKey: string;
    monitorId: string;
    timestamp: Date;
    isUp: boolean;
    responseTimeMs: number;
    statusCode: number | null;
    error: string | null;
}

export interface AgentResultFailure {
    idempotencyKey: string;
    reason: string;
}

interface PersistOutcome {
    acceptedCount: number;
    duplicateCount: number;
    failed: AgentResultFailure[];
}

type CheckResultCreateManyInput = Prisma.CheckResultCreateManyInput;

function splitEntries<T>(items: T[]): [T[], T[]] {
    const middle = Math.floor(items.length / 2);
    return [items.slice(0, middle), items.slice(middle)];
}

async function insertEntries(
    prisma: PrismaClient,
    entries: CheckResultCreateManyInput[]
): Promise<PersistOutcome> {
    if (entries.length === 0) {
        return { acceptedCount: 0, duplicateCount: 0, failed: [] };
    }

    try {
        await prisma.checkResult.createMany({ data: entries });
        return {
            acceptedCount: entries.length,
            duplicateCount: 0,
            failed: [],
        };
    } catch (err: any) {
        if (entries.length === 1) {
            if (err?.code === 'P2002') {
                return {
                    acceptedCount: 0,
                    duplicateCount: 1,
                    failed: [],
                };
            }

            return {
                acceptedCount: 0,
                duplicateCount: 0,
                failed: [{
                    idempotencyKey: entries[0].resultIdempotencyKey || 'unknown',
                    reason: 'DB_WRITE_FAILED',
                }],
            };
        }

        const [left, right] = splitEntries(entries);
        const leftResult = await insertEntries(prisma, left);
        const rightResult = await insertEntries(prisma, right);

        return {
            acceptedCount: leftResult.acceptedCount + rightResult.acceptedCount,
            duplicateCount: leftResult.duplicateCount + rightResult.duplicateCount,
            failed: [...leftResult.failed, ...rightResult.failed],
        };
    }
}

export async function persistAgentResults(
    prisma: PrismaClient,
    agentId: string,
    results: AgentResultInput[]
): Promise<PersistOutcome> {
    const failed: AgentResultFailure[] = [];
    const uniqueResults: AgentResultInput[] = [];
    const seenKeys = new Set<string>();
    let duplicateCount = 0;

    for (const result of results) {
        if (seenKeys.has(result.idempotencyKey)) {
            duplicateCount += 1;
            continue;
        }

        seenKeys.add(result.idempotencyKey);
        uniqueResults.push(result);
    }

    if (uniqueResults.length === 0) {
        return { acceptedCount: 0, duplicateCount, failed };
    }

    const existingKeys = await prisma.checkResult.findMany({
        where: {
            resultIdempotencyKey: {
                in: uniqueResults.map((item) => item.idempotencyKey),
            },
        },
        select: {
            resultIdempotencyKey: true,
        },
    });
    const existingKeySet = new Set(existingKeys.map((item) => item.resultIdempotencyKey).filter(Boolean));
    duplicateCount += existingKeySet.size;

    const pendingEntries: CheckResultCreateManyInput[] = uniqueResults
        .filter((item) => !existingKeySet.has(item.idempotencyKey))
        .map((item) => ({
            monitorId: item.monitorId,
            agentId,
            resultIdempotencyKey: item.idempotencyKey,
            timestamp: item.timestamp,
            isUp: item.isUp,
            responseTimeMs: item.responseTimeMs,
            statusCode: item.statusCode,
            error: item.error,
        }));

    const insertOutcome = await insertEntries(prisma, pendingEntries);

    return {
        acceptedCount: insertOutcome.acceptedCount,
        duplicateCount: duplicateCount + insertOutcome.duplicateCount,
        failed: [...failed, ...insertOutcome.failed],
    };
}
