import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript, stubLocation, jsonResponse } from './load-script.js';

let OsmAuth;
beforeAll(() => {
  OsmAuth = loadScript('osm_oauth.js', ['OsmAuth']).OsmAuth;
});

let loc;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  OsmAuth.ENVIRONMENT = 'production';
});
afterEach(() => loc?.restore());

describe('OsmAuth.parseOsmRef', () => {
  it.each([
    ['n123', { type: 'node', id: '123' }],
    ['w9', { type: 'way', id: '9' }],
    ['r5', { type: 'relation', id: '5' }],
    ['node/123', { type: 'node', id: '123' }],
    ['Way/42', { type: 'way', id: '42' }],
    ['relation/7', { type: 'relation', id: '7' }],
    ['  N77  ', { type: 'node', id: '77' }],
    ['555', { type: 'node', id: '555' }],
  ])('parses %j', (input, expected) => {
    expect(OsmAuth.parseOsmRef(input)).toEqual(expected);
  });

  it.each([null, undefined, '', 'x12', 'node/', 'node/abc', 'planet/1', 'n12x'])('rejects %j', (input) => {
    expect(OsmAuth.parseOsmRef(input)).toBeNull();
  });
});

describe('OsmAuth.getUrls / getChangesetUrl', () => {
  it('points at production by default', () => {
    expect(OsmAuth.getUrls()).toMatchObject({
      authUrl: 'https://www.openstreetmap.org/oauth2/authorize',
      apiBase: 'https://api.openstreetmap.org',
    });
    expect(OsmAuth.getChangesetUrl(5)).toBe('https://www.openstreetmap.org/changeset/5');
  });

  it('points at the dev sandbox when ENVIRONMENT=dev', () => {
    OsmAuth.ENVIRONMENT = 'dev';
    expect(OsmAuth.getUrls().apiBase).toBe('https://master.apis.dev.openstreetmap.org');
    expect(OsmAuth.getChangesetUrl(5)).toBe('https://master.apis.dev.openstreetmap.org/changeset/5');
  });
});

describe('OsmAuth.getRedirectUri', () => {
  it.each([
    ['https://x.example/index.html', 'https://x.example/'],
    ['https://x.example/', 'https://x.example/'],
    ['https://x.example/app/index.html', 'https://x.example/app/'],
  ])('normalises %s', (url, expected) => {
    loc = stubLocation(url);
    expect(OsmAuth.getRedirectUri()).toBe(expected);
  });
});

describe('OsmAuth.startLogin', () => {
  it('builds an authorize URL with PKCE S256 and an osm_-prefixed state', async () => {
    loc = stubLocation('https://x.example/#country=sa');
    await OsmAuth.startLogin('client-1');

    const url = new URL(loc.assigned);
    expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.example/');
    expect(url.searchParams.get('scope')).toBe('read_prefs write_notes write_api');
    expect(url.searchParams.get('state')).toMatch(/^osm_[A-Za-z0-9\-._~]{32}$/);
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/);
  });

  it('stores verifier, state and the return hash for the callback', async () => {
    loc = stubLocation('https://x.example/#country=sa');
    await OsmAuth.startLogin();
    const state = new URL(loc.assigned).searchParams.get('state');
    expect(sessionStorage.getItem('osm_oauth_state')).toBe(state);
    expect(sessionStorage.getItem('osm_oauth_code_verifier')).toHaveLength(64);
    expect(sessionStorage.getItem('osm_oauth_return_hash')).toBe('#country=sa');
  });

  it('never puts the code verifier in the URL', async () => {
    loc = stubLocation('https://x.example/');
    await OsmAuth.startLogin();
    expect(loc.assigned).not.toContain(sessionStorage.getItem('osm_oauth_code_verifier'));
  });
});

describe('OsmAuth.handleCallback', () => {
  const callbackAt = (query, hash = '') => {
    loc = stubLocation(`https://x.example/${query}${hash}`);
  };

  it('does nothing without a code', async () => {
    callbackAt('');
    expect(await OsmAuth.handleCallback()).toBe(false);
  });

  it('ignores a Wikidata callback (wd_ state) and leaves OSM session data alone', async () => {
    sessionStorage.setItem('osm_oauth_state', 'osm_keep');
    callbackAt('?code=abc&state=wd_other');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await OsmAuth.handleCallback()).toBe(false);
    expect(sessionStorage.getItem('osm_oauth_state')).toBe('osm_keep');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a mismatched state without exchanging the code', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    sessionStorage.setItem('osm_oauth_state', 'osm_expected');
    sessionStorage.setItem('osm_oauth_code_verifier', 'v');
    callbackAt('?code=abc&state=osm_forged');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await OsmAuth.handleCallback()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('osm_access_token')).toBeNull();
  });

  it('exchanges the code, stores the token and consumes the one-time session data', async () => {
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    sessionStorage.setItem('osm_oauth_state', 'osm_good');
    sessionStorage.setItem('osm_oauth_code_verifier', 'verifier-1');
    sessionStorage.setItem('osm_oauth_return_hash', '#country=ae');
    callbackAt('?code=abc&state=osm_good');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'tok', scope: 'write_api' }))
      .mockResolvedValueOnce(jsonResponse({ user: { display_name: 'Mapper' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await OsmAuth.handleCallback()).toBe(true);

    const [tokenUrl, init] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://www.openstreetmap.org/oauth2/token');
    const body = new URLSearchParams(init.body);
    expect(body.get('code_verifier')).toBe('verifier-1');
    expect(body.get('grant_type')).toBe('authorization_code');

    expect(localStorage.getItem('osm_access_token')).toBe('tok');
    expect(OsmAuth.getUserName()).toBe('Mapper');
    expect(OsmAuth.isLoggedIn()).toBe(true);
    expect(sessionStorage.getItem('osm_oauth_state')).toBeNull();
    expect(sessionStorage.getItem('osm_oauth_code_verifier')).toBeNull();
    // Address bar is cleaned and the pre-login hash is restored.
    expect(replace.mock.calls[0][2]).toBe('https://x.example/#country=ae');
  });

  it('keeps the current hash over the saved one when both exist', async () => {
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sessionStorage.setItem('osm_oauth_state', 'osm_s');
    sessionStorage.setItem('osm_oauth_return_hash', '#old');
    callbackAt('?code=abc&state=osm_s', '#now');
    await OsmAuth.handleCallback();
    expect(replace.mock.calls[0][2]).toBe('https://x.example/#now');
  });

  it('returns false when the token endpoint rejects the code', async () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem('osm_oauth_state', 'osm_s');
    sessionStorage.setItem('osm_oauth_code_verifier', 'v');
    callbackAt('?code=abc&state=osm_s');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 400 })));
    expect(await OsmAuth.handleCallback()).toBe(false);
    expect(OsmAuth.isLoggedIn()).toBe(false);
  });

  it('logout clears the stored identity', () => {
    localStorage.setItem('osm_access_token', 't');
    localStorage.setItem('osm_user_name', 'u');
    OsmAuth.logout();
    expect(OsmAuth.isLoggedIn()).toBe(false);
    expect(OsmAuth.getUserName()).toBeNull();
  });
});

describe('OsmAuth.generateChangesetComment', () => {
  const it1 = { qid: 'Q1', nameAr: 'الخبر', nameEn: 'Al Khobar', osmRef: 'n5' };

  it('describes a single link with both names, the ref and the country', () => {
    expect(OsmAuth.generateChangesetComment([it1], 'sa')).toBe(
      'Link "الخبر (Al Khobar)" to Wikidata Q1 on n5 in Saudi Arabia #osm-wikidata-gcc'
    );
  });

  it('accepts a bare item and a QID without the Q prefix', () => {
    expect(OsmAuth.generateChangesetComment({ qid: '9', nameEn: 'X' }, 'om')).toBe(
      'Link "X" to Wikidata Q9 in Oman #osm-wikidata-gcc'
    );
  });

  it('lists up to three names for small batches', () => {
    const list = [1, 2, 3].map((n) => ({ qid: `Q${n}`, nameEn: `N${n}` }));
    expect(OsmAuth.generateChangesetComment(list, 'kw')).toBe(
      'Link 3 features ("N1", "N2", "N3") to Wikidata in Kuwait #osm-wikidata-gcc'
    );
  });

  it('summarises larger batches with a +N more suffix', () => {
    const list = Array.from({ length: 10 }, (_, n) => ({ qid: `Q${n}`, nameEn: `N${n}` }));
    expect(OsmAuth.generateChangesetComment(list, 'qa')).toBe(
      'Link 10 features (N0, N1, N2, +7 more) to Wikidata in Qatar #osm-wikidata-gcc'
    );
  });

  it('always carries the hashtag and falls back to GCC for an unknown country', () => {
    expect(OsmAuth.generateChangesetComment([it1], '')).toContain('in GCC #osm-wikidata-gcc');
  });
});

describe('OsmAuth._truncateTag', () => {
  it('leaves short values untouched', () => {
    expect(OsmAuth._truncateTag('abc')).toBe('abc');
  });

  it('cuts to 255 characters including the ellipsis', () => {
    const out = OsmAuth._truncateTag('a'.repeat(400));
    expect(Array.from(out)).toHaveLength(255);
    expect(out.endsWith('…')).toBe(true);
  });

  it('counts code points, not UTF-16 units, so emoji are not split', () => {
    const out = OsmAuth._truncateTag('😀'.repeat(300));
    expect(Array.from(out)).toHaveLength(255);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});
