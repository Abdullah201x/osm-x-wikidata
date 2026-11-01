import { test, expect } from '@playwright/test';
import { guardPage, openApp, expectNoHorizontalOverflow } from './helpers.js';

const MODES = ['forward', 'reverse'];
const LANGS = [
  { lang: 'ar', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
];

// [opener, modal, closer]
const MODALS = [
  ['#btn-about-modal', '#about-modal', '#btn-close-about'],
  ['#btn-shortcuts-modal', '#shortcuts-modal', '#btn-close-shortcuts'],
  ['#btn-header-batch', '#batch-modal', '#btn-close-batch-modal'],
  ['#btn-header-history', '#history-page-modal', '#btn-close-history-modal'],
];

for (const mode of MODES) {
  for (const { lang, dir } of LANGS) {
    test.describe(`${mode} mode, ${lang}`, () => {
      test('loads cleanly: no page errors, CSP violations or failed same-origin requests', async ({ page, baseURL }) => {
        const guard = await guardPage(page, baseURL);
        await openApp(page, { lang, mode });
        await page.waitForLoadState('networkidle');

        expect(guard.seen.pageErrors).toEqual([]);
        expect(await guard.collectCsp()).toEqual([]);
        expect(guard.seen.failedSameOrigin).toEqual([]);
      });

      test('sets <html lang> and dir, and translates the chrome', async ({ page, baseURL }) => {
        await guardPage(page, baseURL);
        await openApp(page, { lang, mode });

        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(page.locator('html')).toHaveAttribute('dir', dir);
        const heading = await page.locator('h1').first().innerText();
        expect(/[؀-ۿ]/.test(heading)).toBe(lang === 'ar');
      });

      test('has no horizontal overflow', async ({ page, baseURL }) => {
        await guardPage(page, baseURL);
        await openApp(page, { lang, mode });
        await expectNoHorizontalOverflow(page);
      });

      test('renders map markers for the dataset', async ({ page, baseURL }) => {
        await guardPage(page, baseURL);
        await openApp(page, { lang, mode });
        await expect(page.locator('.leaflet-marker-icon, .leaflet-overlay-pane path').first()).toBeAttached();
      });

      test('opens and closes every modal', async ({ page, baseURL }) => {
        const guard = await guardPage(page, baseURL);
        await openApp(page, { lang, mode });

        for (const [opener, modal, closer] of MODALS) {
          await page.locator(opener).click();
          await expect(page.locator(modal)).toBeVisible();
          await page.locator(closer).click();
          await expect(page.locator(modal)).toBeHidden();
        }
        expect(guard.seen.pageErrors).toEqual([]);
        expect(await guard.collectCsp()).toEqual([]);
      });
    });
  }
}

test.describe('interactions', () => {
  test('the language button flips lang/dir and persists the choice', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'ar' });

    await page.locator('#btn-toggle-lang').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    expect(await page.evaluate(() => localStorage.getItem('osm_wd_lang'))).toBe('en');
  });

  test('switching to reverse mode loads the reverse dataset and updates the hash', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });

    await page.locator('#btn-mode-reverse').click();
    await expect(page.locator('#btn-mode-reverse')).toHaveClass(/active/);
    await expect(page).toHaveURL(/mode=reverse/);
    await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
    expect(guard.seen.pageErrors).toEqual([]);
  });

  // Regression: parseUrlHash() set the mode first, so switchMode() was a no-op and the page
  // stayed on the forward UI with no reverse data.
  test('a #mode=reverse deep link activates the reverse panel and button', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en', mode: 'reverse', country: 'bh' });

    await expect(page.locator('#btn-mode-reverse')).toHaveClass(/active/);
    await expect(page.locator('#btn-mode-forward')).not.toHaveClass(/active/);
    await expect(page.locator('#reverse-controls-panel')).toBeVisible();
    await expect(page.locator('#forward-controls-panel')).toBeHidden();
    await expect(page.locator('#country-select')).toHaveValue('bh');
  });

  test('Escape and ? shortcuts work from the keyboard', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });

    await page.keyboard.press('?');
    await expect(page.locator('#shortcuts-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcuts-modal')).toBeHidden();
  });

  test('every GCC country dataset loads', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });

    for (const cc of ['ae', 'kw', 'qa', 'om', 'bh', 'sa']) {
      await page.locator('#country-select').selectOption(cc);
      await expect(page).toHaveURL(new RegExp(`country=${cc}`));
      await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
    }
    expect(guard.seen.pageErrors).toEqual([]);
    expect(guard.seen.failedSameOrigin).toEqual([]);
  });
});
