import { test, expect } from '@playwright/test';
import { guardPage, openApp } from './helpers.js';

// Wikidata -> OSM imports are limited to approved OSM users. Anonymous and non-approved visitors must
// get the import-free dataset and no import tooling. /api/v1/me is stubbed: no real OSM login happens.

const IMPORT_ONLY = ['#btn-export-mr', '#btn-export-josm-presets', '.status-filter-btn[data-status="0"]'];

/** Records same-origin /data/*.json requests and optionally stubs /api/v1/me. */
async function setup(page, baseURL, { token = false, me = null, storage = {} } = {}) {
  const guard = await guardPage(page, baseURL);
  const dataRequests = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith('/data/') && u.pathname.endsWith('.json')) dataRequests.push(u.pathname);
  });
  if (token || Object.keys(storage).length) {
    await page.addInitScript(
      ({ token, storage }) => {
        // Seed once per tab so a reload after logout does not log the user back in
        if (sessionStorage.getItem('__seeded')) return;
        sessionStorage.setItem('__seeded', '1');
        if (token) localStorage.setItem('osm_access_token', 'TEST-TOKEN');
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
      },
      { token, storage }
    );
  }
  const meCalls = [];
  if (me) {
    await page.route('**/api/v1/me', (route) => {
      meCalls.push(route.request().headers()['authorization']);
      return route.fulfill({ status: me.status ?? 200, contentType: 'application/json', body: JSON.stringify(me.body ?? {}) });
    });
  }
  return { guard, dataRequests, meCalls };
}

async function expectGated(page) {
  for (const sel of IMPORT_ONLY) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('#stat-missing-card')).toBeHidden();
  await expect(page.locator('#import-restricted-note')).toBeVisible();
}

test.describe('anonymous visitor', () => {
  test('loads the import-free dataset and sees no import tooling', async ({ page, baseURL }) => {
    const { dataRequests, meCalls } = await setup(page, baseURL);
    await openApp(page, { lang: 'en' });
    expect(dataRequests).toContain('/data/sa_linkable.json');
    expect(dataRequests).not.toContain('/data/sa.json');
    expect(meCalls).toEqual([]);
    await expectGated(page);
  });

  test('every country loads its linkable file only', async ({ page, baseURL }) => {
    const { dataRequests } = await setup(page, baseURL);
    await openApp(page, { lang: 'en' });
    for (const cc of ['ae', 'kw', 'qa', 'bh', 'om']) {
      await page.locator('#country-select').selectOption(cc);
      await expect.poll(() => dataRequests.includes(`/data/${cc}_linkable.json`)).toBe(true);
    }
    expect(dataRequests.filter((p) => /^\/data\/(sa|ae|kw|qa|bh|om)\.json$/.test(p))).toEqual([]);
  });

  test('stats do not reveal the missing count', async ({ page, baseURL }) => {
    await setup(page, baseURL);
    await openApp(page, { lang: 'en' });
    const total = Number((await page.locator('#stat-total-val').innerText()).replace(/,/g, ''));
    const cand = Number((await page.locator('#stat-candidates-val').innerText()).replace(/,/g, ''));
    const linked = Number((await page.locator('#stat-linked-val').innerText()).replace(/,/g, ''));
    expect(total).toBe(cand + linked);
  });

  test('reverse mode keeps its (public) back-link stat card and drops the import note', async ({ page, baseURL }) => {
    await setup(page, baseURL);
    await openApp(page, { lang: 'en', mode: 'reverse' });
    await expect(page.locator('#stat-missing-card')).toBeVisible();
    await expect(page.locator('#import-restricted-note')).toBeHidden();
  });

  test('editing localStorage does not unlock anything', async ({ page, baseURL }) => {
    const { dataRequests } = await setup(page, baseURL, {
      storage: { osm_can_import: 'true', can_import: 'true', osm_import_access: 'true' },
    });
    await openApp(page, { lang: 'en' });
    expect(dataRequests).not.toContain('/data/sa.json');
    await expectGated(page);
  });
});

test.describe('logged-in OSM user', () => {
  test('approved importer gets the full dataset and the import tooling', async ({ page, baseURL }) => {
    const { dataRequests, meCalls } = await setup(page, baseURL, {
      token: true,
      me: { body: { uid: 1, display_name: 'Importer', can_import: true } },
    });
    await openApp(page, { lang: 'en' });
    expect(meCalls).toEqual(['Bearer TEST-TOKEN']);
    expect(dataRequests).toContain('/data/sa.json');
    expect(dataRequests).not.toContain('/data/sa_linkable.json');
    for (const sel of IMPORT_ONLY) await expect(page.locator(sel)).toBeVisible();
    await expect(page.locator('#stat-missing-card')).toBeVisible();
    await expect(page.locator('#import-restricted-note')).toBeHidden();
  });

  test('a logged-in user who is not approved stays gated', async ({ page, baseURL }) => {
    const { dataRequests } = await setup(page, baseURL, {
      token: true,
      me: { body: { uid: 2, display_name: 'Mapper', can_import: false } },
    });
    await openApp(page, { lang: 'en' });
    expect(dataRequests).toContain('/data/sa_linkable.json');
    expect(dataRequests).not.toContain('/data/sa.json');
    await expectGated(page);
  });

  test('fails closed when the access check errors', async ({ page, baseURL }) => {
    const { dataRequests } = await setup(page, baseURL, { token: true, me: { status: 503, body: { detail: 'down' } } });
    await openApp(page, { lang: 'en' });
    expect(dataRequests).not.toContain('/data/sa.json');
    await expectGated(page);
  });

  test('a rejected OSM token (401) stays gated even if the body claims otherwise', async ({ page, baseURL }) => {
    const { dataRequests } = await setup(page, baseURL, { token: true, me: { status: 401, body: { can_import: true } } });
    await openApp(page, { lang: 'en' });
    expect(dataRequests).not.toContain('/data/sa.json');
    await expectGated(page);
  });

  test('an importer who logs out drops back to the import-free app', async ({ page, baseURL }) => {
    const { dataRequests } = await setup(page, baseURL, {
      token: true,
      me: { body: { uid: 1, display_name: 'Importer', can_import: true } },
    });
    await openApp(page, { lang: 'en' });
    await page.evaluate(() => localStorage.setItem('osm_user_name', 'Importer'));
    await page.reload();
    await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
    dataRequests.length = 0;
    await page.locator('#btn-osm-login').click(); // logout button once a user name is stored
    await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
    expect(dataRequests).toContain('/data/sa_linkable.json');
    expect(dataRequests).not.toContain('/data/sa.json');
    await expectGated(page);
  });
});
