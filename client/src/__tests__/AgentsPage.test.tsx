/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AgentsPage from '../pages/AgentsPage';
import { agentsApi } from '../api';

describe('AgentsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders online status and normalized last seen IP/location metadata', async () => {
        vi.spyOn(agentsApi, 'get').mockResolvedValueOnce({
            data: [
                {
                    id: 'agent-1',
                    name: 'cloudruvm1',
                    status: 'ONLINE',
                    agentVersion: '1.0.0',
                    heartbeatIntervalSec: 30,
                    offlineAfterSec: 90,
                    lastSeen: '2026-03-12T18:00:00.000Z',
                    lastSeenIp: '203.0.113.10',
                    lastSeenCountry: 'RU',
                    lastSeenCity: 'Moscow',
                    revokedAt: null,
                    createdAt: '2026-03-12T17:00:00.000Z',
                    updatedAt: '2026-03-12T18:00:00.000Z',
                    _count: {
                        monitors: 2,
                    },
                },
                {
                    id: 'agent-2',
                    name: 'ruvdskzn',
                    status: 'ONLINE',
                    agentVersion: '1.0.0',
                    heartbeatIntervalSec: 30,
                    offlineAfterSec: 90,
                    lastSeen: '2026-03-12T18:02:00.000Z',
                    lastSeenIp: '203.0.113.11',
                    lastSeenCountry: 'RU',
                    lastSeenCity: "Kazan'",
                    revokedAt: null,
                    createdAt: '2026-03-12T17:02:00.000Z',
                    updatedAt: '2026-03-12T18:02:00.000Z',
                    _count: {
                        monitors: 1,
                    },
                },
            ],
        } as any);

        render(<AgentsPage />);

        await waitFor(() => {
            expect(screen.getByText('cloudruvm1')).toBeInTheDocument();
        });

        expect(screen.getAllByText('ONLINE')).toHaveLength(2);
        expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
        expect(screen.getByText(/Россия, Москва|Russia, Москва|Россия, Moscow|Russia, Moscow/)).toBeInTheDocument();
        expect(screen.getByText(/Россия, Казань|Russia, Казань/)).toBeInTheDocument();
    });
});
