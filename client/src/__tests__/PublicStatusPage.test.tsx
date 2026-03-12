/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

        vi.spyOn(publicApi, 'get').mockResolvedValueOnce({
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
        } as any);

        render(<PublicStatusPage />);

        await waitFor(() => {
            expect(screen.getByText('Homepage')).toBeInTheDocument();
        });

        expect(screen.getByText('Public service health')).toBeInTheDocument();
        expect(screen.getByText('24h Uptime')).toBeInTheDocument();
        expect(screen.getByText('95.8%')).toBeInTheDocument();
        expect(screen.getByText('Operational')).toBeInTheDocument();
    });
});
