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
        // Clear local storage token
        localStorage.removeItem('token');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize with no user if no token exists', async () => {
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

        // Since there is no token, authApi should not be called
        const spy = vi.spyOn(authApi, 'get');
        expect(spy).not.toHaveBeenCalled();
    });

    it('should fetch user data if a token exists in localStorage', async () => {
        localStorage.setItem('token', 'fake-jwt-token');

        // Mock a successful /api/auth/me response
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

        expect(spy).toHaveBeenCalledWith('/me');
    });

    it('should handle token expiration or invalidity correctly', async () => {
        localStorage.setItem('token', 'expired-token');

        // Mock a 401 Unauthorized response
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

        // The user should be null, and token removed (or in progress of removal)
        expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
});
