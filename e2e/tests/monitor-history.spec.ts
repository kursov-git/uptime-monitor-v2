import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './helpers/auth';
import { createHttpMonitor, monitorCard } from './helpers/monitors';

test.describe('@smoke Monitor History', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedIn(page);
    });

    test('opens monitor history and shows the main sections', async ({ page }) => {
        const monitorName = `History E2E ${Date.now()}`;

        await createHttpMonitor(page, monitorName, 'https://example.com/history');
        const card = monitorCard(page, monitorName);

        await card.getByTestId('monitor-history-button').click();

        await expect(page.getByRole('heading', { name: 'Monitor History' })).toBeVisible();
        await expect(page.getByRole('heading', { name: monitorName })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Response Time' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Check Results' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Recent Notifications' })).toBeVisible();
    });
});
