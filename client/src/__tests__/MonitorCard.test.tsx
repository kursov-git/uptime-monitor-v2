/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MonitorCard from '../components/MonitorCard';
import type { Monitor } from '../api';

function createMonitor(): Monitor {
    return {
        id: 'monitor-1',
        name: 'Homepage',
        url: 'https://example.com',
        method: 'GET',
        intervalSeconds: 60,
        timeoutSeconds: 30,
        expectedStatus: 200,
        expectedBody: null,
        headers: null,
        authMethod: 'NONE',
        authUrl: null,
        authPayload: null,
        authTokenRegex: null,
        isActive: true,
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
    });
});
