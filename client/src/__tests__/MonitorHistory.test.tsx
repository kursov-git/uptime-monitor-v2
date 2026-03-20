/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MonitorHistory from '../pages/MonitorHistory';
import { apiClient, monitorsApi } from '../api';

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        isAdmin: true,
    }),
}));

describe('MonitorHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders redesigned monitor history detail view', async () => {
        vi.spyOn(monitorsApi, 'get')
            .mockResolvedValueOnce({
                data: {
                    id: 'monitor-1',
                    name: 'Auth API',
                    url: 'https://auth.example.com/health',
                    method: 'GET',
                    type: 'HTTP',
                    serviceName: 'Authentication',
                    isPublic: true,
                    intervalSeconds: 60,
                    sslExpiryEnabled: true,
                    sslExpiryThresholdDays: 14,
                    agentName: 'cloudruvm1',
                    isActive: true,
                    flappingState: null,
                    lastCheck: {
                        id: 'result-latest',
                        isUp: true,
                        responseTimeMs: 184,
                        statusCode: 200,
                        timestamp: '2026-03-20T11:40:00.000Z',
                        sslDaysRemaining: 23,
                        sslExpiresAt: '2026-04-12T00:00:00.000Z',
                        sslIssuer: 'Example CA',
                        sslSubject: 'auth.example.com',
                    },
                },
            } as any)
            .mockResolvedValueOnce({
                data: {
                    results: [
                        {
                            id: 'result-1',
                            isUp: true,
                            responseTimeMs: 184,
                            statusCode: 200,
                            error: null,
                            timestamp: '2026-03-20T11:40:00.000Z',
                        },
                    ],
                    total: 1,
                    limit: 50,
                    offset: 0,
                    overallUptimePercent: '99.95',
                    overallAvgResponseMs: 184,
                },
            } as any)
            .mockResolvedValueOnce({
                data: {
                    results: [
                        {
                            id: 'result-1',
                            isUp: true,
                            responseTimeMs: 184,
                            statusCode: 200,
                            error: null,
                            timestamp: '2026-03-20T11:40:00.000Z',
                        },
                    ],
                    total: 1,
                    limit: 1000,
                    offset: 0,
                },
            } as any);

        vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
            data: {
                history: [
                    {
                        id: 'notif-1',
                        channel: 'TELEGRAM',
                        status: 'SUCCESS',
                        error: null,
                        timestamp: '2026-03-20T11:41:00.000Z',
                    },
                ],
            },
        } as any);

        render(
            <MemoryRouter initialEntries={['/monitors/monitor-1/history']}>
                <Routes>
                    <Route path="/monitors/:id/history" element={<MonitorHistory onBack={vi.fn()} />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Monitor History' })).toBeInTheDocument();
        });

        expect(screen.getByRole('heading', { name: 'Auth API' })).toBeInTheDocument();
        expect(screen.getByText('Current status')).toBeInTheDocument();
        expect(screen.getByText('Public status')).toBeInTheDocument();
        expect(screen.getByText('Response Time')).toBeInTheDocument();
        expect(screen.getByText('Check Results')).toBeInTheDocument();
        expect(screen.getByText('Recent Notifications')).toBeInTheDocument();
        expect(screen.getByText('Authentication')).toBeInTheDocument();
        expect(screen.getAllByText('23 days left').length).toBeGreaterThan(0);
    });
});
