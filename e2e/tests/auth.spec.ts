import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('successfully logs in with valid credentials', async ({ page }) => {
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'admin123');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
        await expect(page).toHaveURL('/');
    });

    test('shows error with invalid credentials', async ({ page }) => {
        await page.fill('input[type="text"]', 'wrong');
        await page.fill('input[type="password"]', 'password');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('login-submit')).toBeVisible();
    });

    test('successfully logs out', async ({ page }) => {
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'admin123');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });

        await page.getByTestId('logout-button').click();

        await expect(page.getByTestId('login-submit')).toBeVisible();
    });
});
