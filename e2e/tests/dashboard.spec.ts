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

test.describe('Dashboard Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedIn(page);
    });

    test('navigates to settings and back without page reload', async ({ page }) => {
        await page.getByTestId('nav-settings').click();

        await expect(page.getByTestId('settings-page-title')).toBeVisible();
        await expect(page).toHaveURL('/settings');

        await page.getByTestId('settings-back-button').click();

        await expect(page.getByTestId('app-title')).toBeVisible();
        await expect(page).toHaveURL('/');
    });

    test('navigates to users management', async ({ page }) => {
        await page.getByTestId('nav-users').click();

        await expect(page.getByTestId('users-page-title')).toBeVisible();
        await expect(page).toHaveURL('/users');
    });

    test('navigates to audit log', async ({ page }) => {
        await page.getByTestId('nav-audit').click();

        await expect(page.getByTestId('audit-page-title')).toBeVisible();
        await expect(page).toHaveURL('/audit');
    });
});
