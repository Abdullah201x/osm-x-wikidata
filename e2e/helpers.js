import { expect } from '@playwright/test';

// 1x1 transparent PNG, served for every map tile request.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const TILE_HOSTS = /(^|\.)(arcgisonline\.com)$/;

/**
 * Wires a page for a compliance-grade smoke run:
 *  - every same-origin request is real (served by serve_ssl.py with the production CSP);
 *  - every cross-origin request is recorded and stubbed, never sent to the internet;
 *  - page errors, CSP violations and failed same-origin requests are collected.
 */
export async function guardPage(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const seen = { external: [], pageErrors: [], csp: [], failedSameOrigin: [] };

  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });

  await page.route(
    (url) => url.origin !== origin,
    (route) => {
      const req = route.request();
      const url = new URL(req.url());
      seen.external.push({ method: req.method(), url: req.url(), host: url.hostname });
      if (TILE_HOSTS.test(url.hostname)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      // Nothing else should be contacted during a smoke run; fail it loudly at the network layer.
      return route.abort('blockedbyclient');
    }
  );

  page.on('pageerror', (e) => seen.pageErrors.push(e.message));
  page.on('response', (res) => {
    if (new URL(res.url()).origin === origin && res.status() >= 400) {
      seen.failedSameOrigin.push(`${res.status()} ${res.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    if (new URL(req.url()).origin === origin) seen.failedSameOrigin.push(`failed ${req.url()}`);
  });

  return {
    seen,
    async collectCsp() {
      seen.csp = await page.evaluate(() => window.__csp || []);
      return seen.csp;
    },
  };
}

/** Opens the app in the given language/mode and waits until the dataset is on screen. */
export async function openApp(page, { lang = 'ar', mode = 'forward', country = 'sa' } = {}) {
  await page.addInitScript((l) => localStorage.setItem('osm_wd_lang', l), lang);
  const hash = mode === 'reverse' ? `#mode=reverse&country=${country}` : `#country=${country}`;
  await page.goto(`/${hash}`);
  await expect(page.locator('#visible-count')).toHaveText(/[1-9]/);
}

export async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
