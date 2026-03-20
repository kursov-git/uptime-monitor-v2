/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MonitorCard from '../components/MonitorCard';
import type { Monitor } from '../api';

function createMonitor(): Monitor {
    return {
        id: 'monitor-1',
        name: 'Homepage',
        type: 'HTTP',
        url: 'https://example.com',
        dnsRecordType: 'A',
        method: 'GET',
        intervalSeconds: 60,
        timeoutSeconds: 30,
        expectedStatus: 200,
        expectedBody: null,
        requestBody: null,
        bodyAssertionType: 'NONE',
        bodyAssertionPath: null,
        headers: null,
        authMethod: 'NONE',
        authUrl: null,
        authPayload: null,
        authTokenRegex: null,
        sslExpiryEnabled: true,
        sslExpiryThresholdDays: 14,
        isActive: true,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheck: {
            id: 'check-1',
            monitorId: 'monitor-1',
            timestamp: new Date().toISOString(),
            isUp: true,
            responseTimeMs: 120,
            statusCode: 200,
            error: null,
            sslExpiresAt: '2026-06-10T12:00:00.000Z',
            sslDaysRemaining: 7,
            sslIssuer: 'Let\'s Encrypt E7',
            sslSubject: 'example.com',
        },
        flappingState: null,
    };
}

describe('MonitorCard', () => {
    it('shows history access for viewers while keeping write actions hidden', () => {
        const monitor = createMonitor();
        const onHistory = vi.fn();

        render(
            <MonitorCard
                monitor={monitor}
                isAdmin={false}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onToggle={vi.fn()}
                onTogglePublic={vi.fn()}
                onHistory={onHistory}
            />
        );

        const historyButton = screen.getByTitle('History');
        expect(historyButton).toBeInTheDocument();
        expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Pause')).not.toBeInTheDocument();

        fireEvent.click(historyButton);
        expect(onHistory).toHaveBeenCalledWith(monitor);
        expect(screen.getByText('SSL expires in 7 days')).toBeInTheDocument();
    });
});
