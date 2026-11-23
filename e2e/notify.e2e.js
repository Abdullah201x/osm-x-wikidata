import { test, expect } from '@playwright/test';
import { guardPage } from './helpers.js';

// Honest feedback: a failed dataset load must say so (and offer Retry) instead of
// rendering an empty map that reads as "nothing to fix".
test.describe('load failures are surfaced, not silent', () => {
  test('reverse QA: failed load shows a persistent error with a working Retry', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await page.addInitScript(() => localStorage.setItem('osm_wd_lang', 'en'));

    let failing = true;
    const fail = (route) => (failing ? route.fulfill({ status: 503, body: 'down' }) : route.fallback());
    await page.route(/\/data\/reverse_sa\.json/, fail);
    await page.route(/\/api\/v1\/reverse/, fail);

    await page.goto('/#mode=reverse&country=sa');

    const toast = page.locator('#toast-region .toast--error');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('role', 'alert');
    await expect(toast).toContainText('Saudi Arabia');
    await expect(toast).toContainText('not because there is nothing to fix');

    failing = false;
    await toast.getByRole('button', { name: 'Retry' }).click();
    await expect(toast).toHaveCount(0);
    await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
  });

  test('country names follow the UI language', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await page.addInitScript(() => localStorage.setItem('osm_wd_lang', 'en'));
    await page.goto('/#country=sa');
    await expect(page.locator('#country-select option[value="om"]')).toHaveText('Oman (OM)');
  });
});
