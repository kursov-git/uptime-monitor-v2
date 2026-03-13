import { test, expect } from '@playwright/test';

test.describe('Dashboard Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'admin123');
        await page.getByTestId('login-submit').click();

        await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
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
