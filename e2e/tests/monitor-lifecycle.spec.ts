import { test, expect, type Page } from '@playwright/test';

async function waitForAuthSurface(page: Page) {
    const loginSubmit = page.getByTestId('login-submit');
    const appTitle = page.getByTestId('app-title');

    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await loginSubmit.isVisible().catch(() => false)) return 'login';
        if (await appTitle.isVisible().catch(() => false)) return 'app';
        await page.waitForTimeout(500);
    }

    throw new Error('Timed out waiting for login form or app shell');
}

async function ensureLoggedIn(page: Page) {
    await page.goto('/');

    const surface = await waitForAuthSurface(page);
    if (surface === 'login') {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin123');
        await page.getByTestId('login-submit').click();
    }

    await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
}

test.describe('Monitor Lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedIn(page);
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
        await expect(card.locator('.status-dot.paused')).toBeVisible({ timeout: 10000 });
        await expect(card.locator('button[title="Resume"]')).toBeVisible({ timeout: 10000 });

        await card.locator('button[title="Resume"]').click();
        await expect(card.locator('.status-dot.paused')).toHaveCount(0);
        await expect(card.locator('button[title="Pause"]')).toBeVisible({ timeout: 10000 });

        await card.locator('button[title="Delete"]').click();
        await expect(page.getByText('Delete monitor?')).toBeVisible();
        await page.getByRole('button', { name: 'Delete Monitor' }).click();
        await expect(page.locator('.monitor-card', { hasText: monitorName })).toHaveCount(0);
    });
});
