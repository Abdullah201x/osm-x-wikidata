import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript, stubLocation, jsonResponse } from './load-script.js';

let WikidataAuth;
beforeAll(() => {
  WikidataAuth = loadScript('wikidata_auth.js', ['WikidataAuth']).WikidataAuth;
});

let loc;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  WikidataAuth.ENVIRONMENT = 'production';
  WikidataAuth._refreshPromise = null;
});
afterEach(() => loc?.restore());

describe('PKCE', () => {
  it('derives the RFC 7636 appendix B challenge (S256, base64url, no padding)', async () => {
    const challenge = await WikidataAuth.generateChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generates verifiers from the RFC 7636 unreserved alphabet at the requested length', () => {
    const v = WikidataAuth.generateRandomString(64);
    expect(v).toHaveLength(64);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('does not repeat verifiers', () => {
    expect(WikidataAuth.generateRandomString()).not.toBe(WikidataAuth.generateRandomString());
  });
});

describe('endpoints', () => {
  it('uses production Wikidata by default', () => {
    expect(WikidataAuth.getEndpoints()).toMatchObject({
      authUrl: 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize',
      wikidataApi: 'https://www.wikidata.org/w/api.php',
    });
  });

  it('switches only the Wikidata base for the test environment', () => {
    WikidataAuth.ENVIRONMENT = 'test';
    const e = WikidataAuth.getEndpoints();
    expect(e.wikidataApi).toBe('https://test.wikidata.org/w/api.php');
    expect(e.tokenUrl).toBe('https://meta.wikimedia.org/w/rest.php/oauth2/access_token');
  });

  it.each([
    ['https://x.example/', 'https://x.example/index.html'],
    ['https://x.example/index.html', 'https://x.example/index.html'],
    ['https://x.example/app', 'https://x.example/app/index.html'],
  ])('redirect URI for %s is exact (%s)', (url, expected) => {
    loc = stubLocation(url);
    expect(WikidataAuth.getRedirectUri()).toBe(expected);
  });
});

describe('startLogin', () => {
  it('builds an authorize URL with S256 PKCE and a wd_ state, and stores the secrets', async () => {
    loc = stubLocation('https://x.example/#mode=reverse');
    await WikidataAuth.startLogin('wd-client');

    const url = new URL(loc.assigned);
    expect(url.origin + url.pathname).toBe('https://meta.wikimedia.org/w/rest.php/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('wd-client');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('basic editpage');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.example/index.html');

    const state = url.searchParams.get('state');
    expect(state).toMatch(/^wd_/);
    expect(sessionStorage.getItem('wd_oauth_state')).toBe(state);
    expect(sessionStorage.getItem('wd_return_hash')).toBe('#mode=reverse');

    const verifier = sessionStorage.getItem('wd_code_verifier');
    expect(await WikidataAuth.generateChallenge(verifier)).toBe(url.searchParams.get('code_challenge'));
    expect(loc.assigned).not.toContain(verifier);
  });
});

describe('handleCallback', () => {
  const at = (query) => {
    loc = stubLocation(`https://x.example/index.html${query}`);
  };

  it('ignores callbacks that are not namespaced wd_ (they belong to OSM)', async () => {
    at('?code=abc&state=osm_x');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await WikidataAuth.handleCallback()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a callback with no state at all', async () => {
    at('?code=abc');
    expect(await WikidataAuth.handleCallback()).toBe(false);
  });

  it('rejects a forged wd_ state as CSRF without calling the token endpoint', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    sessionStorage.setItem('wd_oauth_state', 'wd_real');
    sessionStorage.setItem('wd_code_verifier', 'v');
    at('?code=abc&state=wd_forged');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await WikidataAuth.handleCallback()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('wd_access_token')).toBeNull();
    expect(sessionStorage.getItem('wd_oauth_state')).toBeNull();
  });

  it('exchanges the code with the stored verifier and saves tokens plus expiry', async () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    sessionStorage.setItem('wd_oauth_state', 'wd_ok');
    sessionStorage.setItem('wd_code_verifier', 'ver');
    sessionStorage.setItem('wd_return_hash', '#country=qa');
    at('?code=abc&state=wd_ok');

    const now = Date.now();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ username: 'Mapper', sub: '12' }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await WikidataAuth.handleCallback()).toBe(true);

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('code_verifier')).toBe('ver');
    expect(body.get('code')).toBe('abc');
    expect(localStorage.getItem('wd_access_token')).toBe('AT');
    expect(localStorage.getItem('wd_refresh_token')).toBe('RT');
    expect(Number(localStorage.getItem('wd_token_expires_at'))).toBeGreaterThanOrEqual(now + 3600_000);
    expect(WikidataAuth.getUser().username).toBe('Mapper');
  });
});

describe('token lifecycle', () => {
  const setSession = ({ access = 'AT', refresh = 'RT', expiresAt } = {}) => {
    if (access) localStorage.setItem('wd_access_token', access);
    if (refresh) localStorage.setItem('wd_refresh_token', refresh);
    if (expiresAt !== undefined) localStorage.setItem('wd_token_expires_at', String(expiresAt));
  };

  it('returns a still-valid token without any network call', async () => {
    setSession({ expiresAt: Date.now() + 3600_000 });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await WikidataAuth.ensureAccessToken()).toBe('AT');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes a minute early, so a token about to expire is renewed', async () => {
    setSession({ expiresAt: Date.now() + 30_000 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'NEW', refresh_token: 'RT2', expires_in: 14400 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await WikidataAuth.ensureAccessToken()).toBe('NEW');
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('RT');
    expect(localStorage.getItem('wd_refresh_token')).toBe('RT2');
  });

  it('shares one refresh request between concurrent callers', async () => {
    setSession({ expiresAt: Date.now() - 1000 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'NEW' }));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.all([WikidataAuth.ensureAccessToken(), WikidataAuth.ensureAccessToken(), WikidataAuth.ensureAccessToken()]);
    expect(results).toEqual(['NEW', 'NEW', 'NEW']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('logs out when the refresh grant is rejected (4xx)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setSession({ expiresAt: Date.now() - 1000 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 400 })));
    expect(await WikidataAuth.ensureAccessToken()).toBeNull();
    expect(WikidataAuth.isAuthenticated()).toBe(false);
  });

  it('keeps the session on a transient 5xx so the user can retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setSession({ expiresAt: Date.now() - 1000 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 503 })));
    expect(await WikidataAuth.ensureAccessToken()).toBeNull();
    expect(localStorage.getItem('wd_refresh_token')).toBe('RT');
  });

  it('logs out and returns null when expired with no refresh token', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setSession({ refresh: null, expiresAt: Date.now() - 1000 });
    expect(await WikidataAuth.ensureAccessToken()).toBeNull();
    expect(localStorage.getItem('wd_access_token')).toBeNull();
  });

  it('getAccessToken is null when expired but isAuthenticated stays true while a refresh token exists', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setSession({ expiresAt: Date.now() - 1000 });
    expect(WikidataAuth.getAccessToken()).toBeNull();
    expect(WikidataAuth.isAuthenticated()).toBe(true);
  });

  it('getUser tolerates corrupt stored JSON', () => {
    localStorage.setItem('wd_user_identity', '{oops');
    expect(WikidataAuth.getUser()).toBeNull();
  });
});
