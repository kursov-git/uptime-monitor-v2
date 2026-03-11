import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

const auditLogger = logger.child({ component: 'audit-service' });

export async function logAction(
    action: string,
    userId?: string | null,
    details?: object,
    ip?: string
): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action,
                userId: userId || null,
                details: details ? JSON.stringify(details) : null,
                ipAddress: ip || null,
            },
        });
    } catch (err) {
        auditLogger.error({ err, action, userId: userId ?? null }, 'Failed to log audit action');
    }
}
