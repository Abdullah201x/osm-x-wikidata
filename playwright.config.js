import { defineConfig } from '@playwright/test';

// Smoke tests against the static site served by `serve_ssl.py --http --csp`, which sends the
// exact Content-Security-Policy from deploy/Caddyfile.container. Locally they use the installed
// Chrome; in CI, Playwright's Chromium (`npx playwright install --with-deps chromium`).
// Third-party traffic (tiles, OSM, Wikidata, Overpass) is always stubbed by the specs themselves.
const PORT = 8765;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    // Phone-sized: the UI must still load and not overflow sideways.
    { name: 'mobile', testMatch: '**/ui.e2e.js', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: {
    command: `python serve_ssl.py --http --csp --quiet --port ${PORT}`,
    url: `http://localhost:${PORT}/healthz`,
    // Never reuse: a stray dev server on this port would not enforce the CSP.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
