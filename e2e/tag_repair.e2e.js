import { test, expect } from '@playwright/test';
import { guardPage, openApp } from './helpers.js';

// Reverse-mode tag repair: the live element is shown as a diff, the changeset comment can be
// edited, and nothing is written until the mapper confirms. api.openstreetmap.org is stubbed;
// the real OSM API is never contacted.

const OSM_API = /^https:\/\/api\.openstreetmap\.org\//;

async function setup(page, baseURL, { liveValue } = {}) {
  const guard = await guardPage(page, baseURL);
  await page.addInitScript(() => {
    localStorage.setItem('osm_access_token', 'TEST-TOKEN');
    localStorage.setItem('osm_user_name', 'E2E Mapper');
  });
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uid: 3, display_name: 'E2E Mapper', can_import: false }) })
  );

  const osm = { reads: [], writes: [], changesetBody: null, updateBody: null, item: null };
  await page.route(OSM_API, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET') {
      osm.reads.push(url.pathname);
      const m = url.pathname.match(/^\/api\/0\.6\/(node|way|relation)\/(\d+)$/);
      if (m && osm.item) {
        const value = liveValue === undefined ? osm.item.qid : liveValue;
        const wd = value === null ? '' : `<tag k="wikidata" v="${value}"/>`;
        const body = `<?xml version="1.0" encoding="UTF-8"?><osm version="0.6"><${m[1]} id="${m[2]}" version="4" lat="24" lon="46"><tag k="name" v="Test place"/>${wd}</${m[1]}></osm>`;
        return route.fulfill({ status: 200, contentType: 'application/xml', body });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 3, display_name: 'E2E Mapper' } }) });
    }
    osm.writes.push(`${req.method()} ${url.pathname}`);
    if (url.pathname.endsWith('/changeset/create')) {
      osm.changesetBody = req.postData();
      return route.fulfill({ status: 200, contentType: 'text/plain', body: '777' });
    }
    if (url.pathname.endsWith('/close')) return route.fulfill({ status: 200, body: '' });
    osm.updateBody = req.postData();
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '5' });
  });

  await openApp(page, { lang: 'en', mode: 'reverse' });
  osm.item = await page.evaluate(() => {
    const item = filteredReverseItems.find((it) => it.suggested_fix && it.suggested_fix.action === 'migrate_tag');
    selectReverseItem(item, null, true);
    return { qid: item.qid, toTag: item.suggested_fix.to_tag, osmType: item.osm_type, osmId: item.osm_id };
  });
  return { guard, osm };
}

test.describe('reverse tag repair', () => {
  test('shows the live diff, publishes with the edited comment', async ({ page, baseURL }) => {
    const { guard, osm } = await setup(page, baseURL);
    await page.locator('#btn-osm-repair-tag').click();

    const modal = page.locator('#tag-repair-modal');
    await expect(modal).toBeVisible();
    expect(osm.writes).toEqual([]); // nothing written before confirmation

    await expect(modal.locator('tr.diff-delete[data-key="wikidata"] .diff-before')).toHaveText(osm.item.qid);
    await expect(modal.locator(`tr.diff-add[data-key="${osm.item.toTag}"] .diff-after`)).toHaveText(osm.item.qid);
    await expect(modal.locator('tr.diff-same[data-key="name"]')).toBeVisible();
    await expect(page.locator('#tag-repair-stale')).toBeHidden();

    await page.locator('#tag-repair-comment').fill('Move parent-region QID to is_in:wikidata (e2e)');
    await page.locator('#btn-confirm-tag-repair').click();
    await expect(modal).toBeHidden();

    expect(osm.writes.map((w) => w.replace(/\d+/g, 'N'))).toEqual([
      'PUT /api/N.N/changeset/create',
      `PUT /api/N.N/${{ n: 'node', w: 'way', r: 'relation' }[osm.item.osmType]}/N`,
      'PUT /api/N.N/changeset/N/close',
    ]);
    expect(osm.changesetBody).toContain('v="Move parent-region QID to is_in:wikidata (e2e)"');
    expect(osm.updateBody).toContain('version="4"');
    expect(osm.updateBody).not.toContain('k="wikidata"');
    await expect(page.locator('#inspector-content .done-state a[href$="/changeset/777"]')).toBeVisible();

    expect(guard.seen.pageErrors).toEqual([]);
    expect(await guard.collectCsp()).toEqual([]);
  });

  test('blocks the repair when the element changed since the scan', async ({ page, baseURL }) => {
    const { osm } = await setup(page, baseURL, { liveValue: 'Q1' });
    await page.locator('#btn-osm-repair-tag').click();

    await expect(page.locator('#tag-repair-stale')).toBeVisible();
    await expect(page.locator('#tag-repair-stale')).toContainText('"Q1"');
    await expect(page.locator('#btn-confirm-tag-repair')).toBeDisabled();
    await page.locator('#btn-cancel-tag-repair').click();
    await expect(page.locator('#tag-repair-modal')).toBeHidden();
    expect(osm.writes).toEqual([]);
  });

  test('Escape cancels without writing', async ({ page, baseURL }) => {
    const { osm } = await setup(page, baseURL);
    await page.locator('#btn-osm-repair-tag').click();
    await expect(page.locator('#tag-repair-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#tag-repair-modal')).toBeHidden();
    expect(osm.writes).toEqual([]);
  });
});
