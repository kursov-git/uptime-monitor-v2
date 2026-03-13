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

    it('renders sorted agent attention summary and normalized location metadata', async () => {
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
                {
                    id: 'agent-3',
                    name: 'euwest-old',
                    status: 'OFFLINE',
                    agentVersion: '0.9.0',
                    heartbeatIntervalSec: 30,
                    offlineAfterSec: 90,
                    lastSeen: '2026-03-12T17:30:00.000Z',
                    lastSeenIp: '203.0.113.12',
                    lastSeenCountry: 'DE',
                    lastSeenCity: null,
                    revokedAt: null,
                    createdAt: '2026-03-12T17:03:00.000Z',
                    updatedAt: '2026-03-12T18:03:00.000Z',
                    _count: {
                        monitors: 4,
                    },
                },
            ],
        } as any);

        render(<AgentsPage />);

        await waitFor(() => {
            expect(screen.getByText('cloudruvm1')).toBeInTheDocument();
        });

        expect(screen.getByText('Needs Attention')).toBeInTheDocument();
        expect(screen.getByTestId('agent-summary-total')).toHaveTextContent('3');
        expect(screen.getByTestId('agent-summary-online')).toHaveTextContent('2');
        expect(screen.getByTestId('agent-summary-attention')).toHaveTextContent('1');
        expect(screen.getByTestId('agent-summary-outdated')).toHaveTextContent('1');
        expect(screen.getAllByText('ONLINE')).toHaveLength(2);
        expect(screen.getByText('OFFLINE')).toBeInTheDocument();
        expect(screen.getByText('Update needed')).toBeInTheDocument();
        expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
        expect(screen.getByText(/Россия, Москва|Russia, Москва|Россия, Moscow|Russia, Moscow/)).toBeInTheDocument();
        expect(screen.getByText(/Россия, Казань|Russia, Казань/)).toBeInTheDocument();
        const headings = screen.getAllByText(/cloudruvm1|ruvdskzn|euwest-old/).map((entry) => entry.textContent);
        expect(headings[0]).toBe('euwest-old');
    });
});
