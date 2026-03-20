/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from '../pages/DashboardPage';
import type { Monitor } from '../api';

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        isAdmin: true,
    }),
}));

function createMonitor(overrides: Partial<Monitor>): Monitor {
    return {
        id: crypto.randomUUID(),
        name: 'Monitor',
        serviceName: null,
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
        sslExpiryEnabled: false,
        sslExpiryThresholdDays: 14,
        isActive: true,
        isPublic: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastCheck: null,
        flappingState: null,
        ...overrides,
    };
}

describe('DashboardPage', () => {
    it('groups monitors by service name with standalone monitors last', () => {
        const monitors = [
            createMonitor({ name: 'Auth API', serviceName: 'Customer Portal' }),
            createMonitor({ name: 'Landing Page', serviceName: 'Website' }),
            createMonitor({ name: 'Checkout API', serviceName: 'Customer Portal' }),
            createMonitor({ name: 'Standalone Ping', serviceName: null }),
        ];

        render(
            <DashboardPage
                monitors={monitors}
                loading={false}
                onCreateMonitor={vi.fn()}
                onUpdateMonitor={vi.fn()}
                onDeleteMonitor={vi.fn()}
                onToggleMonitor={vi.fn()}
                onTogglePublicVisibility={vi.fn()}
            />
        );

        expect(screen.getByRole('heading', { name: 'Customer Portal' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Website' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Standalone Monitors' })).toBeInTheDocument();
        expect(screen.getByText('2 monitors')).toBeInTheDocument();
        expect(screen.getAllByText('1 monitor').length).toBe(2);
    });
});
