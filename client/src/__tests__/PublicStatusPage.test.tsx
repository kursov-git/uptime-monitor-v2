/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PublicStatusPage from '../pages/PublicStatusPage';
import { publicApi } from '../api';

function buildHistory24h() {
    const start = Date.UTC(2026, 2, 12, 0, 0, 0);
    return Array.from({ length: 24 }, (_, index) => ({
        timestamp: new Date(start + index * 60 * 60 * 1000).toISOString(),
        totalChecks: 4,
        upChecks: index === 18 ? 3 : 4,
        uptimePercent: index === 18 ? 75 : 100,
        avgResponseTimeMs: 120 + index,
    }));
}

describe('PublicStatusPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        class ResizeObserverMock {
            observe() {}
            unobserve() {}
            disconnect() {}
        }

        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('renders public summary and availability chart sections', async () => {
        const history24h = buildHistory24h();

        vi.spyOn(publicApi, 'get')
            .mockResolvedValueOnce({
                data: {
                    generatedAt: '2026-03-12T23:45:00.000Z',
                    monitorCount: 1,
                    summary: {
                        up: 1,
                        down: 0,
                        paused: 0,
                        unknown: 0,
                    },
                    history24h,
                    monitors: [
                        {
                            id: 'monitor-1',
                            name: 'Homepage',
                            url: 'https://example.com',
                            method: 'GET',
                            isActive: true,
                            status: 'up',
                            uptimePercent24h: '95.8',
                            history24h,
                            lastCheck: {
                                id: 'check-1',
                                monitorId: 'monitor-1',
                                timestamp: '2026-03-12T23:40:00.000Z',
                                isUp: true,
                                responseTimeMs: 148,
                                statusCode: 200,
                                error: null,
                            },
                        },
                    ],
                },
            } as any)
            .mockResolvedValueOnce({
                data: {
                    monitorId: 'monitor-1',
                    monitorName: 'Homepage',
                    windowStart: history24h[18].timestamp,
                    windowEnd: new Date(new Date(history24h[18].timestamp).getTime() + 60 * 60 * 1000).toISOString(),
                    bucketSizeMinutes: 5,
                    totalChecks: 4,
                    upChecks: 3,
                    uptimePercent: 75,
                    history: Array.from({ length: 12 }, (_, index) => ({
                        timestamp: new Date(new Date(history24h[18].timestamp).getTime() + index * 5 * 60 * 1000).toISOString(),
                        totalChecks: index === 4 ? 1 : 0,
                        upChecks: index === 4 ? 0 : 0,
                        uptimePercent: index === 4 ? 0 : null,
                        avgResponseTimeMs: index === 4 ? 480 : null,
                    })),
                    failures: [
                        {
                            timestamp: new Date(new Date(history24h[18].timestamp).getTime() + 20 * 60 * 1000).toISOString(),
                            responseTimeMs: 480,
                            statusCode: 503,
                            error: 'Service unavailable',
                        },
                    ],
                },
            } as any);

        render(<PublicStatusPage />);

        await waitFor(() => {
            expect(screen.getByText('Homepage')).toBeInTheDocument();
        });

        expect(screen.getByText('All public systems operational')).toBeInTheDocument();
        expect(screen.getByText('Public service health')).toBeInTheDocument();
        expect(screen.getByText('Incident timeline')).toBeInTheDocument();
        expect(screen.getAllByText('1 impacted hour')).toHaveLength(2);
        expect(screen.getByText('Partial outage')).toBeInTheDocument();
        expect(screen.getByText('24h Uptime')).toBeInTheDocument();
        expect(screen.getByText('95.8%')).toBeInTheDocument();
        expect(screen.getAllByText('Operational').length).toBeGreaterThan(0);

        fireEvent.click(screen.getAllByRole('button', { name: /Chart drill down Homepage/i })[18]);

        await waitFor(() => {
            expect(screen.getByText('Selected hour')).toBeInTheDocument();
        });

        expect(screen.getByText('Failure timestamps')).toBeInTheDocument();
        expect(screen.getByText(/Service unavailable/)).toBeInTheDocument();
    });
});
