/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        isAdmin: true,
        isLoading: false,
        user: { username: 'admin', role: 'ADMIN' },
        logout: vi.fn(),
    }),
}));

vi.mock('../hooks/useMonitors', () => ({
    useMonitors: () => ({
        monitors: [],
        loading: false,
        fetchMonitors: vi.fn(),
        createMonitor: vi.fn(),
        updateMonitor: vi.fn(),
        deleteMonitor: vi.fn(),
        toggleMonitor: vi.fn(),
        togglePublicVisibility: vi.fn(),
        handleSSEUpdate: vi.fn(),
    }),
}));

vi.mock('../pages/LoginPage', () => ({ default: () => <div>Login Page</div> }));
vi.mock('../pages/UsersPage', () => ({ default: () => <div>Users Page</div> }));
vi.mock('../pages/AuditLogPage', () => ({ default: () => <div>Audit Page</div> }));
vi.mock('../pages/NotificationSettings', () => ({ default: () => <div>Settings Page</div> }));
vi.mock('../pages/NotificationHistoryPage', () => ({ default: () => <div>Notification History</div> }));
vi.mock('../pages/MonitorHistory', () => ({ default: () => <div>Monitor History</div> }));
vi.mock('../pages/DashboardPage', () => ({
    default: () => <div>Dashboard Page</div>,
}));
vi.mock('../pages/AgentsPage', () => ({ default: () => <div>Agents Page</div> }));
vi.mock('../pages/PublicStatusPage', () => ({
    default: () => <div>Public Status Mock</div>,
}));

describe('App routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('EventSource', class {
            addEventListener() { }
            close() { }
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('navigates from dashboard to public status without crashing', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <App />
            </MemoryRouter>
        );

        expect(screen.getByText('Dashboard Page')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('link', { name: /Public Status/i }));

        await waitFor(() => {
            expect(screen.getByText('Public Status Mock')).toBeInTheDocument();
        });
    });
});
