/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotificationHistoryPage from '../pages/NotificationHistoryPage';
import { apiClient } from '../api';

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
        vi.spyOn(apiClient, 'get')
            .mockResolvedValueOnce({
                data: {
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
                    },
                },
            } as any)
            .mockResolvedValueOnce({
                data: [
                    { id: 'monitor-1', name: 'Auth API' },
                ],
            } as any);

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
