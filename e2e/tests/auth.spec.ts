import { test, expect } from '@playwright/test';
import { ensureLoggedOut, loginAsAdmin } from './helpers/auth';

test.describe('@smoke Authentication', () => {
    test.beforeEach(async ({ page }) => {
        await ensureLoggedOut(page);
    });

    test('successfully logs in with valid credentials', async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
        await expect(page).toHaveURL('/');
    });

    test('shows error with invalid credentials', async ({ page }) => {
        await page.getByTestId('login-username').fill('wrong');
        await page.getByTestId('login-password').fill('password');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('login-submit')).toBeVisible();
    });

    test('successfully logs out', async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });

        await page.getByTestId('logout-button').click();

        await expect(page.getByTestId('login-submit')).toBeVisible();
    });
});
