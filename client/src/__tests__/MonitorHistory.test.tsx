/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MonitorHistory from '../pages/MonitorHistory';
import { monitorsApi, notificationsApi } from '../api';
import type { CheckResult, Monitor, MonitorStatsResponse, NotificationHistoryResponse } from '../api';
import { mockAxiosResponse } from './testUtils';

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        isAdmin: true,
    }),
}));

function buildCheckResult(overrides: Partial<CheckResult> = {}): CheckResult {
    return {
        id: 'result-1',
        monitorId: 'monitor-1',
        timestamp: '2026-03-20T11:40:00.000Z',
        isUp: true,
        responseTimeMs: 184,
        statusCode: 200,
        error: null,
        ...overrides,
    };
}

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
    return {
        id: 'monitor-1',
        name: 'Auth API',
        serviceName: 'Authentication',
        type: 'HTTP',
        url: 'https://auth.example.com/health',
        dnsRecordType: 'A',
        agentId: null,
        agentName: 'cloudruvm1',
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
        isPublic: true,
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T11:40:00.000Z',
        lastCheck: buildCheckResult({ id: 'result-latest' }),
        flappingState: null,
        ...overrides,
    };
}

function buildStatsResponse(overrides: Partial<MonitorStatsResponse> = {}): MonitorStatsResponse {
    return {
        results: [buildCheckResult()],
        total: 1,
        limit: 50,
        offset: 0,
        overallUptimePercent: '99.95',
        overallAvgResponseMs: 184,
        ...overrides,
    };
}

describe('MonitorHistory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders redesigned monitor history detail view', async () => {
        vi.spyOn(monitorsApi, 'get')
            .mockResolvedValueOnce(mockAxiosResponse(buildMonitor({
                lastCheck: buildCheckResult({
                    id: 'result-latest',
                    sslDaysRemaining: 23,
                    sslExpiresAt: '2026-04-12T00:00:00.000Z',
                    sslIssuer: 'Example CA',
                    sslSubject: 'auth.example.com',
                }),
            })))
            .mockResolvedValueOnce(mockAxiosResponse(buildStatsResponse({
                results: [buildCheckResult({
                    sslDaysRemaining: 23,
                    sslExpiresAt: '2026-04-12T00:00:00.000Z',
                    sslIssuer: 'Example CA',
                    sslSubject: 'auth.example.com',
                })],
            })))
            .mockResolvedValueOnce(mockAxiosResponse(buildStatsResponse({
                limit: 1000,
                results: [buildCheckResult({
                    sslDaysRemaining: 23,
                    sslExpiresAt: '2026-04-12T00:00:00.000Z',
                    sslIssuer: 'Example CA',
                    sslSubject: 'auth.example.com',
                })],
            })));

        vi.spyOn(notificationsApi, 'get').mockResolvedValueOnce(mockAxiosResponse<NotificationHistoryResponse>({
            history: [
                {
                    id: 'notif-1',
                    monitorId: 'monitor-1',
                    channel: 'TELEGRAM',
                    status: 'SUCCESS',
                    error: null,
                    timestamp: '2026-03-20T11:41:00.000Z',
                },
            ],
            pagination: {
                total: 1,
                page: 1,
                limit: 5,
                totalPages: 1,
            },
        }));

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

    it('uses latest fetched stats when monitor detail lastCheck is missing', async () => {
        vi.spyOn(monitorsApi, 'get')
            .mockResolvedValueOnce(mockAxiosResponse(buildMonitor({ lastCheck: null })))
            .mockResolvedValueOnce(mockAxiosResponse(buildStatsResponse({
                results: [buildCheckResult({
                    sslDaysRemaining: 23,
                    sslExpiresAt: '2026-04-12T00:00:00.000Z',
                    sslIssuer: 'Example CA',
                    sslSubject: 'auth.example.com',
                })],
            })))
            .mockResolvedValueOnce(mockAxiosResponse(buildStatsResponse({
                limit: 1000,
                results: [buildCheckResult({
                    sslDaysRemaining: 23,
                    sslExpiresAt: '2026-04-12T00:00:00.000Z',
                    sslIssuer: 'Example CA',
                    sslSubject: 'auth.example.com',
                })],
            })));

        vi.spyOn(notificationsApi, 'get').mockResolvedValueOnce(mockAxiosResponse<NotificationHistoryResponse>({
            history: [],
            pagination: {
                total: 0,
                page: 1,
                limit: 5,
                totalPages: 0,
            },
        }));

        render(
            <MemoryRouter initialEntries={['/monitors/monitor-1/history']}>
                <Routes>
                    <Route path="/monitors/:id/history" element={<MonitorHistory onBack={vi.fn()} />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Current status')).toBeInTheDocument();
        });

        expect(screen.getByText('● Up')).toBeInTheDocument();
        expect(screen.getAllByText('184ms').length).toBeGreaterThan(0);
        expect(screen.getAllByText('23 days left').length).toBeGreaterThan(0);
        expect(screen.queryByText('Pending first HTTPS check')).not.toBeInTheDocument();
    });

    it('shows TLS handshake failure instead of pending SSL state when https checks fail before ssl metadata is collected', async () => {
        const tlsFailure = buildCheckResult({
            isUp: false,
            responseTimeMs: 8439,
            statusCode: null,
            error: 'write EPROTO 48A28787A57C0000:error:0A000410:SSL routines:ssl3_read_bytes:sslv3 alert handshake failure',
            timestamp: '2026-03-23T12:38:14.000Z',
            sslDaysRemaining: null,
            sslExpiresAt: null,
            sslIssuer: null,
            sslSubject: null,
        });

        vi.spyOn(monitorsApi, 'get')
            .mockResolvedValueOnce(mockAxiosResponse(buildMonitor({
                name: 'Auth BY',
                serviceName: 'Auth',
                url: 'https://auth.example.by',
                isPublic: false,
                lastCheck: null,
            })))
            .mockResolvedValueOnce(mockAxiosResponse(buildStatsResponse({
                results: [tlsFailure],
                overallUptimePercent: '0.0',
                overallAvgResponseMs: 8439,
            })))
            .mockResolvedValueOnce(mockAxiosResponse(buildStatsResponse({
                results: [tlsFailure],
                limit: 1000,
                overallUptimePercent: '0.0',
                overallAvgResponseMs: 8439,
            })));

        vi.spyOn(notificationsApi, 'get').mockResolvedValueOnce(mockAxiosResponse<NotificationHistoryResponse>({
            history: [],
            pagination: {
                total: 0,
                page: 1,
                limit: 5,
                totalPages: 0,
            },
        }));

        render(
            <MemoryRouter initialEntries={['/monitors/monitor-1/history']}>
                <Routes>
                    <Route path="/monitors/:id/history" element={<MonitorHistory onBack={vi.fn()} />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getAllByText('TLS handshake failed').length).toBeGreaterThan(0);
        });

        expect(screen.queryByText('Pending first HTTPS check')).not.toBeInTheDocument();
        expect(screen.getByText('Certificate details were not collected because the HTTPS handshake failed.')).toBeInTheDocument();
    });
});
