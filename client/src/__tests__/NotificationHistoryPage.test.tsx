/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotificationHistoryPage from '../pages/NotificationHistoryPage';
import { monitorsApi, notificationsApi } from '../api';
import type { Monitor, NotificationHistoryResponse } from '../api';
import { mockAxiosResponse } from './testUtils';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

describe('NotificationHistoryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders redesigned notification history page', async () => {
        const historyResponse: NotificationHistoryResponse = {
            history: [
                {
                    id: 'notif-1',
                    monitorId: 'monitor-1',
                    channel: 'TELEGRAM',
                    status: 'SUCCESS',
                    error: null,
                    timestamp: '2026-03-20T10:10:00.000Z',
                },
            ],
            pagination: {
                totalPages: 1,
                total: 1,
                page: 1,
                limit: 20,
            },
        };

        vi.spyOn(notificationsApi, 'get').mockResolvedValueOnce(mockAxiosResponse(historyResponse));
        const monitors: Monitor[] = [
            {
                id: 'monitor-1',
                name: 'Auth API',
                serviceName: 'Authentication',
                type: 'HTTP',
                url: 'https://auth.example.com/health',
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
                sslExpiryEnabled: false,
                sslExpiryThresholdDays: 14,
                isActive: true,
                isPublic: false,
                createdAt: '2026-03-20T10:00:00.000Z',
                updatedAt: '2026-03-20T10:00:00.000Z',
                lastCheck: null,
            },
        ];
        vi.spyOn(monitorsApi, 'get').mockResolvedValueOnce(mockAxiosResponse(monitors));

        render(
            <MemoryRouter initialEntries={['/settings/history?monitorId=monitor-1']}>
                <Routes>
                    <Route path="/settings/history" element={<NotificationHistoryPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Notification History' })).toBeInTheDocument();
        });

        expect(screen.getByText('Delivery Log')).toBeInTheDocument();
        expect(screen.getByText('Auth API')).toBeInTheDocument();
        expect(screen.getByText('TELEGRAM')).toBeInTheDocument();
        expect(screen.getByText('✓ SUCCESS')).toBeInTheDocument();
    });
});
