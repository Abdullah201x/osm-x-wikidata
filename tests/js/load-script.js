import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const jsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'js');

/**
 * Runs a production script from js/ unchanged, the way a classic <script> tag would,
 * and publishes the named top-level bindings (const/function) on globalThis so that
 * later scripts and tests see them as cross-file globals.
 *
 * Production files are plain browser scripts (no exports), so this is the only
 * seam needed to unit-test them without touching the shipped code.
 */
export function loadScript(file, names, tail = '') {
  const code = readFileSync(resolve(jsDir, file), 'utf8');
  const exported = new Function(`${code}\n;${tail}\nreturn { ${names.join(', ')} };`).call(globalThis);
  Object.assign(globalThis, exported);
  return exported;
}

/**
 * Replaces window.location with a plain object so tests can read the URL the code
 * would have navigated to (jsdom cannot navigate). Call the returned restore() after.
 */
export function stubLocation(url) {
  const u = new URL(url);
  const original = Object.getOwnPropertyDescriptor(window, 'location');
  const fake = {
    origin: u.origin,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    assigned: null,
    get href() {
      return u.href;
    },
    set href(v) {
      this.assigned = v;
    },
  };
  Object.defineProperty(window, 'location', { configurable: true, value: fake });
  fake.restore = () => Object.defineProperty(window, 'location', original);
  return fake;
}

/** A fetch Response stand-in; enough for the code under test (ok/status/headers/json/text). */
export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}
