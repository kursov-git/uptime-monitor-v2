import { test, expect } from '@playwright/test';

test.describe('Dashboard Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'admin123');
        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page.getByRole('heading', { name: 'Uptime Admin' })).toBeVisible({ timeout: 10000 });
    });

    test('navigates to settings and back without page reload', async ({ page }) => {
        await page.getByRole('link', { name: '⚙️ Settings' }).click();

        await expect(page.getByRole('heading', { name: 'Global Notification Settings' })).toBeVisible();
        await expect(page).toHaveURL('/settings');

        await page.getByRole('button', { name: '← Back to Dashboard' }).click();

        await expect(page.getByRole('heading', { name: 'Uptime Admin' })).toBeVisible();
        await expect(page).toHaveURL('/');
    });

    test('navigates to users management', async ({ page }) => {
        await page.getByRole('link', { name: '👥 Users' }).click();

        await expect(page.getByRole('heading', { name: '👥 User Management' })).toBeVisible();
        await expect(page).toHaveURL('/users');
    });

    test('navigates to audit log', async ({ page }) => {
        await page.getByRole('link', { name: '📋 Audit Log' }).click();

        await expect(page.getByRole('heading', { name: '📋 Audit Log' })).toBeVisible();
        await expect(page).toHaveURL('/audit');
    });
});
