import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript, jsonResponse } from './load-script.js';

let ImportAccess;
beforeAll(() => {
  ImportAccess = loadScript('import_access.js', ['ImportAccess']).ImportAccess;
});

beforeEach(() => {
  localStorage.clear();
  ImportAccess.reset();
  globalThis.OsmAuth = { ENVIRONMENT: 'production', isLoggedIn: () => !!localStorage.getItem('osm_access_token') };
  window.currentMode = undefined;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const login = () => localStorage.setItem('osm_access_token', 'TOK');

describe('datasetUrl', () => {
  it('serves the import-free dataset by default', () => {
    expect(ImportAccess.datasetUrl('sa')).toBe('data/sa_linkable.json');
  });

  it('serves the full dataset only once import access is granted', async () => {
    login();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ uid: 1, can_import: true })));
    await ImportAccess.check();
    expect(ImportAccess.datasetUrl('bh')).toBe('data/bh.json');
    ImportAccess.reset();
    expect(ImportAccess.datasetUrl('bh')).toBe('data/bh_linkable.json');
  });
});

describe('check', () => {
  it('does not call the backend when logged out', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await ImportAccess.check()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never grants access to sandbox (dev server) logins and skips the call', async () => {
    login();
    OsmAuth.ENVIRONMENT = 'dev';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await ImportAccess.check()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the OSM token as a bearer header to /api/v1/me', async () => {
    login();
    const fetchSpy = vi.fn(async () => jsonResponse({ uid: 9, can_import: true }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await ImportAccess.check()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/me', { headers: { Authorization: 'Bearer TOK' } });
  });

  it('is false for a logged-in user the backend does not approve', async () => {
    login();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ uid: 9, can_import: false })));
    expect(await ImportAccess.check()).toBe(false);
  });

  it('only trusts a literal true (not truthy strings)', async () => {
    login();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ can_import: 'true' })));
    expect(await ImportAccess.check()).toBe(false);
  });

  it('fails closed on backend errors and network failures', async () => {
    login();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'x' }, { status: 503 })));
    expect(await ImportAccess.check()).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await ImportAccess.check()).toBe(false);
  });

  it('a later failed check revokes earlier access', async () => {
    login();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ can_import: true })));
    expect(await ImportAccess.check()).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ can_import: true }, { status: 401 })));
    expect(await ImportAccess.check()).toBe(false);
    expect(ImportAccess.canImport()).toBe(false);
  });

  it('cannot be granted by editing browser storage', async () => {
    localStorage.setItem('osm_can_import', 'true');
    localStorage.setItem('can_import', 'true');
    expect(ImportAccess.canImport()).toBe(false);
    expect(ImportAccess.datasetUrl('sa')).toBe('data/sa_linkable.json');
  });
});

describe('applyUI', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="stat-missing-card"></div>
      <button id="a" data-import-only hidden></button>
      <button id="b" data-import-only hidden></button>
      <p id="import-restricted-note" hidden></p>`;
  });
  const hidden = (id) => document.getElementById(id).hidden;

  it('hides import-only controls, the missing card and shows the note for non-importers', () => {
    window.currentMode = 'forward';
    ImportAccess.applyUI();
    expect(hidden('a') && hidden('b')).toBe(true);
    expect(hidden('stat-missing-card')).toBe(true);
    expect(hidden('import-restricted-note')).toBe(false);
  });

  it('keeps the card visible in reverse mode (it shows missing back-links there) and drops the note', () => {
    window.currentMode = 'reverse';
    ImportAccess.applyUI();
    expect(hidden('stat-missing-card')).toBe(false);
    expect(hidden('import-restricted-note')).toBe(true);
    expect(hidden('a')).toBe(true); // exports stay importer-only in every mode
  });

  it('reveals everything for approved importers', async () => {
    login();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ can_import: true })));
    await ImportAccess.check();
    window.currentMode = 'forward';
    ImportAccess.applyUI();
    expect(hidden('a') || hidden('b') || hidden('stat-missing-card') || !hidden('import-restricted-note')).toBe(false);
  });
});
