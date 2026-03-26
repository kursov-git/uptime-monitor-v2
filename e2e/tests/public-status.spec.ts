import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './helpers/auth';
import { createHttpMonitor, monitorCard } from './helpers/monitors';

test.describe('@smoke Public Status', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedIn(page);
    });

    test('shows a published monitor on the public status page', async ({ page }) => {
        const monitorName = `Public E2E ${Date.now()}`;

        await createHttpMonitor(page, monitorName, 'https://example.com/status');
        const card = monitorCard(page, monitorName);

        await card.getByTestId('monitor-public-toggle').click();
        await expect(card.getByTestId('monitor-public-toggle')).toHaveAttribute('title', 'Remove from public status page');

        await page.goto('/status');

        await expect(page.getByRole('heading', { name: 'Ping Agent Status' })).toBeVisible();
        await expect(page.getByText(monitorName)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('Incident Timeline', { exact: true }).first()).toBeVisible();
    });
});
