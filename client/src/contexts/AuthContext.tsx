import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, removeToken } from '../api';

interface AuthUser {
    id: string;
    username: string;
    role: 'ADMIN' | 'VIEWER';
}

interface AuthContextType {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isLoading: boolean;
    sessionExpired: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionExpired, setSessionExpired] = useState(false);

    const checkAuth = useCallback(async () => {
        try {
            const res = await authApi.get('/me', { skipAuthExpired: true });
            setUser(res.data);
        } catch {
            removeToken();
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAuth();

        const handleAuthExpired = () => {
            setSessionExpired(true);
            setUser(null);
            // Token is already removed by the interceptor
        };

        window.addEventListener('auth:expired', handleAuthExpired);
        return () => window.removeEventListener('auth:expired', handleAuthExpired);
    }, [checkAuth]);

    const login = async (username: string, password: string) => {
        const res = await authApi.post('/login', { username, password });
        setUser(res.data.user);
        setSessionExpired(false);
    };

    const logout = () => {
        authApi.post('/logout').catch(() => { });
        removeToken();
        setUser(null);
    };

    const clearSessionExpired = () => {
        setSessionExpired(false);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                isAdmin: user?.role === 'ADMIN',
                isLoading,
                sessionExpired,
                login,
                logout,
                clearSessionExpired,
            }}
        >
            {sessionExpired && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="card" style={{ maxWidth: 400, textAlign: 'center', color: '#111827' }}>
                        <h2 style={{ marginBottom: 16 }}>Session Expired</h2>
                        <p style={{ marginBottom: 24, color: '#4b5563' }}>Your session has expired. Please log in again to continue.</p>
                        <button className="btn btn-primary" onClick={clearSessionExpired} style={{ width: '100%' }}>
                            Go to Login
                        </button>
                    </div>
                </div>
            )}
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
}
