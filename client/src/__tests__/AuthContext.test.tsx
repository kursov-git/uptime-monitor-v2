/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const LoginComponent = () => {
    const { user, login } = useAuth();

    return (
        <div>
            <button onClick={() => void login('login_user', 'secret123')}>Login</button>
            <div data-testid="login-user">{user ? user.username : 'null'}</div>
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

    it('should accept the cookie-only login response without a token field', async () => {
        vi.spyOn(authApi, 'get').mockRejectedValueOnce({
            response: { status: 401 }
        });
        const postSpy = vi.spyOn(authApi, 'post').mockResolvedValueOnce({
            data: {
                user: { id: '2', username: 'login_user', role: 'VIEWER' }
            }
        } as any);

        render(
            <AuthProvider>
                <LoginComponent />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(postSpy).not.toHaveBeenCalled();
        });

        fireEvent.click(screen.getByText('Login'));

        await waitFor(() => {
            expect(postSpy).toHaveBeenCalledWith('/login', {
                username: 'login_user',
                password: 'secret123',
            });
            expect(screen.getByTestId('login-user')).toHaveTextContent('login_user');
        });
    });
});
