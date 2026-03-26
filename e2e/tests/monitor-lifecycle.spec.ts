import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './helpers/auth';
import { confirmDeleteMonitor, createHttpMonitor, monitorCard, openDeleteMonitorModal } from './helpers/monitors';

test.describe('@smoke Monitor Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedIn(page);
    });

    test('creates, pauses, resumes and deletes a monitor', async ({ page }) => {
        const monitorName = `E2E Monitor ${Date.now()}`;

        await createHttpMonitor(page, monitorName, 'https://example.com/health');

        const card = monitorCard(page, monitorName);

        await card.getByTestId('monitor-execution-toggle').click();
        await expect(card.locator('.status-dot.paused')).toBeVisible({ timeout: 10000 });
        await expect(card.getByTestId('monitor-execution-toggle')).toHaveAttribute('title', 'Resume');

        await card.getByTestId('monitor-execution-toggle').click();
        await expect(card.locator('.status-dot.paused')).toHaveCount(0);
        await expect(card.getByTestId('monitor-execution-toggle')).toHaveAttribute('title', 'Pause');

        await openDeleteMonitorModal(card);
        await confirmDeleteMonitor(page);
        await expect(monitorCard(page, monitorName)).toHaveCount(0);
    });
});
