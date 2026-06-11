/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AuditLogPage from '../pages/AuditLogPage';
import { auditApi } from '../api';
import type { AuditLogResponse } from '../api';
import { mockAxiosResponse } from './testUtils';

describe('AuditLogPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders redesigned audit activity stream', async () => {
        const auditResponse: AuditLogResponse = {
            logs: [
                {
                    id: 'audit-1',
                    action: 'LOGIN',
                    details: '{"username":"admin"}',
                    userId: 'user-1',
                    user: { username: 'admin' },
                    ipAddress: '203.0.113.10',
                    timestamp: '2026-03-20T10:10:00.000Z',
                },
            ],
            total: 1,
            limit: 50,
            offset: 0,
        };

        vi.spyOn(auditApi, 'get').mockResolvedValueOnce(mockAxiosResponse(auditResponse));

        render(<AuditLogPage />);

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
        });

        expect(screen.getByText('Activity Stream')).toBeInTheDocument();
        expect(screen.getByText(/LOGIN/)).toBeInTheDocument();
        expect(screen.getByText('admin')).toBeInTheDocument();
    });
});
