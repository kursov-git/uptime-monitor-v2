import { describe, expect, it } from 'vitest';
import {
    buildMonitorDownMessage,
    buildMonitorRecoveryMessage,
    buildMonitorSslExpiringMessage,
    buildMonitorSslRecoveryMessage,
    htmlToNotifierText,
} from '../services/notificationMessages';

const monitor = {
    id: 'monitor-1',
    name: 'Auth Gateway',
    url: 'https://example.com/auth',
};

describe('notificationMessages', () => {
    it('builds monitor down and recovery messages with links and escaping', () => {
        const down = buildMonitorDownMessage(
            monitor,
            'TLS <failure>',
            3,
            185,
            {
                executorLabel: 'cloudruvm1',
                statusCode: 503,
                responseTimeMs: 942,
                appBaseUrl: 'https://ping-agent.ru/',
            }
        );

        expect(down).toContain('Auth Gateway');
        expect(down).toContain('Check source: cloudruvm1');
        expect(down).toContain('HTTP status: 503');
        expect(down).toContain('Response time: 942ms');
        expect(down).toContain('TLS &lt;failure&gt;');
        expect(down).toContain('/monitors/monitor-1/history');

        const recovery = buildMonitorRecoveryMessage(monitor, 3, {
            executorLabel: 'cloudruvm1',
            responseTimeMs: 188,
            appBaseUrl: 'https://ping-agent.ru',
        });

        expect(recovery).toContain('recovered');
        expect(recovery).toContain('Response time: 188ms');
        expect(recovery).toContain('/monitors/monitor-1/history');
    });

    it('builds SSL expiry and recovery messages with certificate metadata', () => {
        const expiring = buildMonitorSslExpiringMessage(monitor, {
            appBaseUrl: 'https://ping-agent.ru',
            thresholdDays: 14,
            expiresAt: '2030-06-20T12:00:00.000Z',
            daysRemaining: 7,
            issuer: 'Example Issuer',
            subject: '*.example.com',
        });

        expect(expiring).toContain('SSL certificate is expiring soon');
        expect(expiring).toContain('Threshold: 14 days');
        expect(expiring).toContain('Days remaining: 7');
        expect(expiring).toContain('Issuer: Example Issuer');
        expect(expiring).toContain('Subject: *.example.com');

        const recovery = buildMonitorSslRecoveryMessage(monitor, {
            appBaseUrl: 'https://ping-agent.ru',
            thresholdDays: 14,
            expiresAt: '2030-07-20T12:00:00.000Z',
            daysRemaining: 37,
            issuer: 'Example Issuer',
            subject: '*.example.com',
        });

        expect(recovery).toContain('SSL certificate warning cleared');
        expect(recovery).toContain('Days remaining: 37');
    });

    it('converts notifier HTML into readable plain text', () => {
        const html = buildMonitorDownMessage(monitor, null, 2, 60, {
            appBaseUrl: 'https://ping-agent.ru',
        });

        const text = htmlToNotifierText(html);
        expect(text).toContain('**Auth Gateway** is DOWN');
        expect(text).toContain('Open monitor history: https://ping-agent.ru/monitors/monitor-1/history');
    });
});
