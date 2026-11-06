import { test, expect } from '@playwright/test';
import { guardPage, openApp } from './helpers.js';

// The production CSP has no style-src 'unsafe-inline', so any style="…" in
// rendered markup is blocked (and reported). These tests render the
// template-heavy panels and check the CSS classes that replaced inline styles.

test.describe('CSP styles (no unsafe-inline)', () => {
  test('reverse inspector action cards render without CSP violations', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await openApp(page, { lang: 'en', mode: 'reverse' });

    for (const target of ['wikidata', 'osm']) {
      const found = await page.evaluate((t) => {
        const item = filteredReverseItems.find((it) => it.suggested_fix && it.suggested_fix.target === t);
        if (item) selectReverseItem(item, null, true);
        return Boolean(item);
      }, target);
      if (!found) continue;
      const card = page.locator('#inspector-content .reverse-action-card');
      await expect(card).toBeVisible();
      // The row/button classes must actually lay the buttons out side by side.
      const row = card.locator('.rv-btn-row').first();
      await expect(row).toHaveCSS('display', 'flex');
      if (target === 'osm') {
        await expect(card).toHaveClass(/reverse-action-card--osm/);
        await expect(card.locator('.reverse-action-header')).toHaveCSS('color', 'rgb(255, 51, 102)');
      }
    }
    await expect(page.locator('#inspector-content .rv-external-links .rv-btn-row')).toHaveCSS('display', 'flex');

    expect(guard.seen.pageErrors).toEqual([]);
    expect(await guard.collectCsp()).toEqual([]);
  });

  test('About shows per-country progress sparklines from data/progress.json', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });
    await page.locator('#btn-about-modal').click();
    const rows = page.locator('#about-progress tbody tr');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('#about-progress tr[data-cc="sa"] .progress-country')).toHaveText('Saudi Arabia');
    await expect(page.locator('#about-progress tr[data-cc="sa"] svg.progress-spark polyline')).toHaveCount(2);

    expect(guard.seen.pageErrors).toEqual([]);
    expect(guard.seen.failedSameOrigin).toEqual([]);
    expect(await guard.collectCsp()).toEqual([]);
  });

  test('map marker colours come from CSS classes', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await openApp(page, { lang: 'en', mode: 'forward' });

    // Zoom in far enough that individual (unclustered) markers render.
    await page.evaluate(() => {
      const item = filteredItems.find((it) => it[4] === 2) || filteredItems[0];
      MapController.getMap().setView([item[1], item[2]], 18, { animate: false });
    });
    const dot = page.locator('.poi-marker .marker-dot').first();
    await expect(dot).toBeAttached();
    const bg = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgb(153, 153, 153)');

    expect(guard.seen.pageErrors).toEqual([]);
    expect(await guard.collectCsp()).toEqual([]);
  });
});
