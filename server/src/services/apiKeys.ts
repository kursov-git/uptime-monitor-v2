import crypto from 'crypto';
import prisma from '../lib/prisma';

function isLegacyPlaintextApiKey(storedKey: string): boolean {
    return storedKey.startsWith('um_');
}

export function hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
}

export async function authenticateApiKey(presentedKey: string) {
    const hashedKey = hashApiKey(presentedKey);

    const hashedMatch = await prisma.apiKey.findUnique({
        where: { key: hashedKey },
        include: { user: true },
    });
    if (hashedMatch) {
        return hashedMatch;
    }

    const legacyMatch = await prisma.apiKey.findUnique({
        where: { key: presentedKey },
        include: { user: true },
    });
    if (!legacyMatch) {
        return null;
    }

    await prisma.apiKey.update({
        where: { id: legacyMatch.id },
        data: { key: hashedKey },
    });

    return {
        ...legacyMatch,
        key: hashedKey,
    };
}

export async function backfillLegacyApiKeys(): Promise<number> {
    const legacyKeys = await prisma.apiKey.findMany({
        where: {
            key: {
                startsWith: 'um_',
            },
        },
        select: {
            id: true,
            key: true,
        },
    });

    for (const key of legacyKeys) {
        if (!isLegacyPlaintextApiKey(key.key)) {
            continue;
        }

        await prisma.apiKey.update({
            where: { id: key.id },
            data: { key: hashApiKey(key.key) },
        });
    }

    return legacyKeys.length;
}
