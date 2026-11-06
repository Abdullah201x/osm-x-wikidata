import { test, expect } from '@playwright/test';
import { guardPage, openApp } from './helpers.js';

// Shareable item links: selecting an item writes qid (and the OSM element in reverse mode) to the
// URL hash, the 🔗 button copies that URL, and opening it selects the same item again.

async function captureClipboard(page) {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { window.__copied.push(text); } },
    });
  });
}

async function openHash(page, hash, lang = 'en') {
  await page.addInitScript((l) => localStorage.setItem('osm_wd_lang', l), lang);
  await page.goto(`/#${hash}`);
  await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
}

test.describe('shareable item links', () => {
  test('forward: selecting writes qid to the hash and 🔗 copies a link that reopens it', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await captureClipboard(page);
    await openApp(page, { lang: 'en' });

    const qid = await page.evaluate(() => {
      const item = filteredItems[0];
      selectItem(item, null, true);
      return `Q${item[0]}`;
    });
    await expect(page).toHaveURL(new RegExp(`#country=sa&qid=${qid}$`));

    await page.locator('#btn-copy-item-link').click();
    await expect(page.locator('#btn-copy-item-link')).toHaveText('✓');
    const [copied] = await page.evaluate(() => window.__copied);
    expect(copied).toBe(`${baseURL}/#country=sa&qid=${qid}`);

    // A fresh visit to the shared link selects the same item.
    const other = await page.context().newPage();
    await guardPage(other, baseURL);
    await other.addInitScript(() => localStorage.setItem('osm_wd_lang', 'en'));
    await other.goto(copied);
    await expect(other.locator('#visible-count')).toHaveText(/[1-9]/);
    await expect(other.locator('#btn-copy-item-link')).toBeVisible();
    expect(await other.evaluate(() => `Q${selectedItem[0]}`)).toBe(qid);
    await expect(other).toHaveURL(new RegExp(`qid=${qid}`));

    expect(guard.seen.pageErrors).toEqual([]);
    expect(await guard.collectCsp()).toEqual([]);
  });

  test('reverse: the link names the OSM element, so a shared QID opens the right one', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en', mode: 'reverse' });
    // Pick a QID that appears on more than one OSM element and share the second one.
    const target = await page.evaluate(() => {
      const byQid = new Map();
      for (const it of loadedReverseDataset.items) {
        if (!byQid.has(it.qid)) byQid.set(it.qid, []);
        byQid.get(it.qid).push(it);
      }
      const group = [...byQid.values()].find((g) => g.length > 1);
      const item = group[1];
      return { qid: item.qid, osm: `${item.osm_type}${item.osm_id}` };
    });

    const fresh = await page.context().newPage();
    await guardPage(fresh, baseURL);
    await openHash(fresh, `mode=reverse&country=sa&qid=${target.qid}&osm=${target.osm}`);
    await expect(fresh.locator('#btn-copy-item-link')).toBeVisible();
    expect(await fresh.evaluate(() => `${selectedItem.osm_type}${selectedItem.osm_id}`)).toBe(target.osm);
    await expect(fresh).toHaveURL(new RegExp(`qid=${target.qid}&osm=${target.osm}`));
  });

  test('anonymous deep link to an item outside the public dataset explains the restriction', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    await openHash(page, 'country=sa&qid=Q1');
    await expect(page.locator('.deep-link-notice h4')).toHaveText('Item not available');
    await expect(page.locator('.deep-link-notice p')).toContainText('Q1');
    expect(guard.seen.pageErrors).toEqual([]);
  });

  test('switching country drops the old selection from the URL', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });
    await page.evaluate(() => selectItem(filteredItems[0], null, true));
    await expect(page).toHaveURL(/qid=Q\d+/);
    await page.locator('#country-select').selectOption('qa');
    await expect(page).toHaveURL(/#country=qa$/);
  });
});
