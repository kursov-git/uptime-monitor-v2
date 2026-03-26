import { expect, type Page } from '@playwright/test';

async function waitForAuthSurface(page: Page) {
    const loginSubmit = page.getByTestId('login-submit');
    const appTitle = page.getByTestId('app-title');

    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await loginSubmit.isVisible().catch(() => false)) return 'login' as const;
        if (await appTitle.isVisible().catch(() => false)) return 'app' as const;
        await page.waitForTimeout(500);
    }

    throw new Error('Timed out waiting for login form or app shell');
}

export async function loginAsAdmin(page: Page) {
    await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('admin123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
}

export async function ensureLoggedIn(page: Page) {
    await page.goto('/');

    const surface = await waitForAuthSurface(page);
    if (surface === 'login') {
        await loginAsAdmin(page);
        return;
    }

    await expect(page.getByTestId('app-title')).toBeVisible({ timeout: 10000 });
}

export async function ensureLoggedOut(page: Page) {
    await page.goto('/');

    const surface = await waitForAuthSurface(page);
    if (surface === 'app') {
        await page.getByTestId('logout-button').click();
    }

    await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 10000 });
}
