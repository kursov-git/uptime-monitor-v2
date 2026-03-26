import { test, expect } from '@playwright/test';
import { ensureLoggedIn } from './helpers/auth';

test.describe('@smoke Dashboard Navigation', () => {
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
