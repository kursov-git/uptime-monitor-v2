/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoginPage from '../pages/LoginPage';

const loginMock = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({
        login: loginMock,
    }),
}));

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders redesigned login shell', () => {
        render(<LoginPage />);

        expect(screen.getByTestId('login-title')).toHaveTextContent('Calm operator access for uptime and agent health.');
        expect(screen.getByRole('heading', { name: 'Ping Agent' })).toBeInTheDocument();
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
        expect(screen.getByText('Execution')).toBeInTheDocument();
        expect(screen.getByText('Public surface')).toBeInTheDocument();
        expect(screen.getByTestId('login-submit')).toBeInTheDocument();
    });
});
