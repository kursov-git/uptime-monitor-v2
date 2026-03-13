import { test, expect } from '@playwright/test';

test.describe('Monitor Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'admin123');
        await page.getByTestId('login-submit').click();
        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
    });

    test('creates, pauses, resumes and deletes a monitor', async ({ page }) => {
        const monitorName = `E2E Monitor ${Date.now()}`;

        await page.getByTestId('new-monitor-button').click();
        await page.locator('.form-group', { hasText: 'Name' }).first().locator('input').fill(monitorName);
        await page.locator('.form-group', { hasText: 'URL' }).first().locator('input').fill('https://example.com/health');
        await page.getByTestId('monitor-form-submit').click();

        const card = page.locator('.monitor-card', { hasText: monitorName }).first();
        await expect(card).toBeVisible({ timeout: 10000 });

        await card.locator('button[title="Pause"]').click();
        await expect(card.getByText('PAUSED')).toBeVisible({ timeout: 10000 });

        await card.locator('button[title="Resume"]').click();
        await expect(card.getByText('PAUSED')).toHaveCount(0);

        page.once('dialog', (dialog) => dialog.accept());
        await card.locator('button[title="Delete"]').click();
        await expect(page.locator('.monitor-card', { hasText: monitorName })).toHaveCount(0);
    });
});
