/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NotificationSettings from '../pages/NotificationSettings';
import { notificationsApi } from '../api';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => navigateMock,
}));

describe('NotificationSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders redesigned settings layout', async () => {
        vi.spyOn(notificationsApi, 'get').mockResolvedValueOnce({
            data: {
                id: 'settings-1',
                appBaseUrl: 'https://ping-agent.ru',
                telegramEnabled: true,
                telegramBotToken: 'token',
                telegramChatId: 'chat',
                zulipEnabled: false,
                zulipBotEmail: 'bot@example.com',
                zulipApiKey: 'key',
                zulipServerUrl: 'https://zulip.example.com',
                zulipStream: 'alerts',
                zulipTopic: 'uptime',
                flappingFailCount: 3,
                flappingIntervalSec: 120,
                retentionDays: 30,
            },
        } as any);

        render(<NotificationSettings />);

        await waitFor(() => {
            expect(screen.getByTestId('settings-page-title')).toHaveTextContent('Notification Settings');
        });

        expect(screen.getByText('Alert Links')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Telegram' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Zulip' })).toBeInTheDocument();
        expect(screen.getByText('Delivery Policy')).toBeInTheDocument();
        expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
});
