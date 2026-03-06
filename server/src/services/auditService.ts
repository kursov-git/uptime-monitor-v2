import prisma from '../lib/prisma';

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
        console.error('Failed to log audit action:', err);
    }
}
