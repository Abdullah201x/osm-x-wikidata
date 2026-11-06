import { test, expect } from '@playwright/test';
import { guardPage, openApp } from './helpers.js';

// Compliance: what the page is allowed to contact on its own.
// OSM tile policy: no requests to the volunteer-run tile servers. Wikimedia/OSM API policy:
// nothing is written, and Overpass is only queried on an explicit user click.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const OSM_OR_WIKI = /(^|\.)(openstreetmap\.org|wikidata\.org|wikimedia\.org|wikipedia\.org)$/;
const OVERPASS = /overpass/;

for (const mode of ['forward', 'reverse']) {
  test.describe(`${mode} mode`, () => {
    test('page load contacts only the approved tile CDN', async ({ page, baseURL }) => {
      const guard = await guardPage(page, baseURL);
      await openApp(page, { lang: 'en', mode });
      await page.waitForLoadState('networkidle');

      const hosts = [...new Set(guard.seen.external.map((r) => r.host))];
      for (const host of hosts) {
        expect(host, `unexpected third-party host ${host}`).toMatch(/(^|\.)(arcgisonline\.com)$/);
      }
    });

    test('never requests tile.openstreetmap.org', async ({ page, baseURL }) => {
      const guard = await guardPage(page, baseURL);
      await openApp(page, { lang: 'en', mode });
      for (const key of [']', ']', ']']) await page.keyboard.press(key);
      await page.waitForLoadState('networkidle');

      expect(guard.seen.external.filter((r) => /tile\.openstreetmap\.org/.test(r.host))).toEqual([]);
    });

    test('sends no write request to OSM or Wikimedia without a user action', async ({ page, baseURL }) => {
      const guard = await guardPage(page, baseURL);
      await openApp(page, { lang: 'en', mode });
      await page.waitForLoadState('networkidle');

      const writes = guard.seen.external.filter((r) => WRITE_METHODS.has(r.method) && OSM_OR_WIKI.test(r.host));
      expect(writes).toEqual([]);
    });

    test('does not query Overpass on page load', async ({ page, baseURL }) => {
      const guard = await guardPage(page, baseURL);
      await openApp(page, { lang: 'en', mode });
      await page.waitForLoadState('networkidle');

      expect(guard.seen.external.filter((r) => OVERPASS.test(r.host))).toEqual([]);
    });

    test('does not probe JOSM (127.0.0.1:8111) until asked', async ({ page, baseURL }) => {
      const guard = await guardPage(page, baseURL);
      await openApp(page, { lang: 'en', mode });
      await page.waitForLoadState('networkidle');

      expect(guard.seen.external.filter((r) => r.url.includes('127.0.0.1:8111'))).toEqual([]);
    });
  });
}

test('the stubbed browser really is isolated from the internet', async ({ page, baseURL }) => {
  const guard = await guardPage(page, baseURL);
  await page.goto('/');
  const result = await page.evaluate(() =>
    fetch('https://www.wikidata.org/w/api.php?action=query&format=json').then(
      () => 'reached',
      () => 'blocked'
    )
  );
  expect(result).toBe('blocked');
  expect(guard.seen.external.some((r) => r.host === 'www.wikidata.org')).toBe(true);
});
