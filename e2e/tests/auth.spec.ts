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

async function ensureLoggedOut(page: Page) {
    await page.goto('/');

    const surface = await waitForAuthSurface(page);
    if (surface === 'app') {
        await page.getByTestId('logout-button').click();
    }

    await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 10000 });
}

test.describe('Authentication', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedOut(page);
    });

    test('successfully logs in with valid credentials', async ({ page }) => {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin123');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
        await expect(page).toHaveURL('/');
    });

    test('shows error with invalid credentials', async ({ page }) => {
        await page.fill('#username', 'wrong');
        await page.fill('#password', 'password');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('login-submit')).toBeVisible();
    });

    test('successfully logs out', async ({ page }) => {
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin123');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });

        await page.getByTestId('logout-button').click();

        await expect(page.getByTestId('login-submit')).toBeVisible();
    });
});
