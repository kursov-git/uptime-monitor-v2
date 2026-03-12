/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { authApi } from '../api';

const TestComponent = () => {
    const { user, isLoading } = useAuth();

    return (
        <div>
            <div data-testid="loading">{isLoading ? 'true' : 'false'}</div>
            <div data-testid="user">{user ? user.username : 'null'}</div>
            <div data-testid="role">{user ? user.role : 'none'}</div>
        </div>
    );
};

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize with no user if the auth cookie is absent or invalid', async () => {
        const spy = vi.spyOn(authApi, 'get').mockRejectedValueOnce({
            response: { status: 401 }
        });

        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        // It should briefly be loading, then transition to false
        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(spy).toHaveBeenCalledWith('/me', { skipAuthExpired: true });
    });

    it('should fetch user data if the server session cookie is valid', async () => {
        const spy = vi.spyOn(authApi, 'get').mockResolvedValueOnce({
            data: { id: '1', username: 'admin_test', role: 'ADMIN' }
        } as any);

        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        // It should eventually show the authenticated user
        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
            expect(screen.getByTestId('user')).toHaveTextContent('admin_test');
        });

        expect(screen.getByTestId('role')).toHaveTextContent('ADMIN');

        expect(spy).toHaveBeenCalledWith('/me', { skipAuthExpired: true });
    });

    it('should handle session expiration or invalidity correctly', async () => {
        vi.spyOn(authApi, 'get').mockRejectedValueOnce({
            response: { status: 401 }
        });

        render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });

        expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
});
