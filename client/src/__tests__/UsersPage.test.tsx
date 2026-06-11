/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UsersPage from '../pages/UsersPage';
import { usersApi } from '../api';
import type { UserDirectoryEntry } from '../api';
import { mockAxiosResponse } from './testUtils';

describe('UsersPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('confirm', vi.fn(() => true));
        vi.stubGlobal('alert', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('renders redesigned access directory', async () => {
        const users: UserDirectoryEntry[] = [
            {
                id: 'user-1',
                username: 'admin',
                role: 'ADMIN',
                createdAt: '2026-03-20T10:00:00.000Z',
                apiKey: {
                    id: 'key-1',
                    createdAt: '2026-03-20T10:00:00.000Z',
                    revokedAt: null,
                },
            },
            {
                id: 'user-2',
                username: 'viewer',
                role: 'VIEWER',
                createdAt: '2026-03-19T10:00:00.000Z',
                apiKey: null,
            },
        ];

        vi.spyOn(usersApi, 'get').mockResolvedValue(mockAxiosResponse(users));

        render(<UsersPage />);

        await waitFor(() => {
            expect(screen.getByText('admin')).toBeInTheDocument();
        });

        expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
        expect(screen.getByText('Access Directory')).toBeInTheDocument();
        expect(screen.getByText('viewer')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /\+ Create User/i })).toBeInTheDocument();
    });
});
