import { expect, type Locator, type Page } from '@playwright/test';

export function monitorCard(page: Page, monitorName: string): Locator {
    return page.getByTestId('monitor-card').filter({ hasText: monitorName }).first();
}

export async function createHttpMonitor(page: Page, monitorName: string, url: string) {
    await page.getByTestId('new-monitor-button').click();
    await page.getByTestId('monitor-name-input').fill(monitorName);
    await page.getByTestId('monitor-url-input').fill(url);
    await page.getByTestId('monitor-form-submit').click();
    await expect(monitorCard(page, monitorName)).toBeVisible({ timeout: 10000 });
}

export async function openDeleteMonitorModal(card: Locator) {
    await card.getByTestId('monitor-delete-button').click();
}

export async function confirmDeleteMonitor(page: Page) {
    await expect(page.getByTestId('delete-monitor-modal')).toBeVisible();
    await page.getByTestId('delete-monitor-confirm').click();
}
