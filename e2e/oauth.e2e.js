import { test, expect } from '@playwright/test';
import { guardPage, openApp } from './helpers.js';

// The login buttons must build correct PKCE authorize URLs. The navigation is intercepted
// and answered with a stub page, so the real OSM / Wikimedia servers are never contacted.

async function clickLogin(page, buttonId, authorizeUrl) {
  await page.route(authorizeUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
  const request = page.waitForRequest(authorizeUrl);
  await page.locator(buttonId).click();
  return new URL((await request).url());
}

test.describe('login buttons', () => {
  test('OSM: S256 PKCE, osm_ state, exact redirect, write scopes', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });

    const url = await clickLogin(page, '#btn-osm-login', /openstreetmap\.org\/oauth2\/authorize/);
    expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^osm_/);
    expect(url.searchParams.get('redirect_uri')).toBe(`${baseURL}/`);
    expect(url.searchParams.get('scope')).toBe('read_prefs write_notes write_api');
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.search).not.toContain('code_verifier');
  });

  test('Wikidata: S256 PKCE, wd_ state, exact index.html redirect, editpage scope', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });

    const url = await clickLogin(page, '#btn-wd-login', /meta\.wikimedia\.org\/w\/rest\.php\/oauth2\/authorize/);
    expect(url.origin + url.pathname).toBe('https://meta.wikimedia.org/w/rest.php/oauth2/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^wd_/);
    expect(url.searchParams.get('redirect_uri')).toBe(`${baseURL}/index.html`);
    expect(url.searchParams.get('scope')).toBe('basic editpage');
  });

  test('two logins never reuse the PKCE challenge or state', async ({ page, baseURL }) => {
    await guardPage(page, baseURL);
    await openApp(page, { lang: 'en' });

    const first = await clickLogin(page, '#btn-osm-login', /openstreetmap\.org\/oauth2\/authorize/);
    await openApp(page, { lang: 'en' });
    const second = await clickLogin(page, '#btn-osm-login', /openstreetmap\.org\/oauth2\/authorize/);
    expect(second.searchParams.get('state')).not.toBe(first.searchParams.get('state'));
    expect(second.searchParams.get('code_challenge')).not.toBe(first.searchParams.get('code_challenge'));
  });
});

test.describe('callback handling', () => {
  test('a forged Wikidata state is rejected without any token request', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    page.on('dialog', (d) => d.dismiss());
    await page.goto('/index.html?code=stolen&state=wd_forged');
    await page.waitForLoadState('networkidle');

    expect(await page.evaluate(() => localStorage.getItem('wd_access_token'))).toBeNull();
    expect(guard.seen.external.filter((r) => /access_token|oauth2\/token/.test(r.url))).toEqual([]);
    // The one-time code is stripped from the address bar.
    expect(page.url()).not.toContain('code=stolen');
  });

  test('a forged OSM state is rejected without any token request', async ({ page, baseURL }) => {
    const guard = await guardPage(page, baseURL);
    page.on('dialog', (d) => d.dismiss());
    await page.goto('/?code=stolen&state=osm_forged');
    await page.waitForLoadState('networkidle');

    expect(await page.evaluate(() => localStorage.getItem('osm_access_token'))).toBeNull();
    expect(guard.seen.external.filter((r) => /oauth2\/token/.test(r.url))).toEqual([]);
    expect(page.url()).not.toContain('code=stolen');
  });
});
