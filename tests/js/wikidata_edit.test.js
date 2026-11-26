import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript, jsonResponse } from './load-script.js';

let WikidataEdit, WikidataAuth;
beforeAll(() => {
  WikidataAuth = loadScript('wikidata_auth.js', ['WikidataAuth']).WikidataAuth;
  WikidataEdit = loadScript('wikidata_edit.js', ['WikidataEdit']).WikidataEdit;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('wd_access_token', 'AT');
  localStorage.setItem('wd_token_expires_at', String(Date.now() + 3600_000));
  WikidataAuth.ENVIRONMENT = 'production';
  WikidataEdit._currentBatchId = null;
  vi.spyOn(WikidataEdit, '_sleep').mockResolvedValue();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const PREVIEW = { valid: true, status: 'will_add', baserevid: 4242, warnings: [] };

/** Routes fetch by URL; handlers may be a value or a function of (url, init). */
function routeFetch(routes) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    calls.push({ url, init });
    for (const [needle, handler] of routes) {
      if (url.includes(needle)) {
        const r = typeof handler === 'function' ? handler(url, init, calls) : handler;
        return r;
      }
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const okPreview = () => jsonResponse(PREVIEW);
const csrf = () => jsonResponse({ query: { tokens: { csrftoken: 'CSRF+\\' + 'x' } } });
const created = () => jsonResponse({ claim: { id: 'Q1$abc' }, success: 1 });
const writeCalls = (calls) => calls.filter((c) => c.init.method === 'POST' && c.url.includes('wikidata.org'));

describe('getCsrfToken', () => {
  it('uses crossorigin=1 (never origin=*) and sends the Bearer token', async () => {
    const calls = routeFetch([['meta=tokens', csrf]]);
    await WikidataEdit.getCsrfToken('AT');
    expect(calls[0].url).toContain('crossorigin=1');
    expect(calls[0].url).not.toContain('origin=*');
    expect(calls[0].init.headers.Authorization).toBe('Bearer AT');
  });

  it('rejects the anonymous "+\\" token', async () => {
    routeFetch([['meta=tokens', () => jsonResponse({ query: { tokens: { csrftoken: '+\\' } } })]]);
    await expect(WikidataEdit.getCsrfToken('AT')).rejects.toThrow(/anonymous CSRF/);
  });

  it('throws when not authenticated', async () => {
    localStorage.clear();
    await expect(WikidataEdit.getCsrfToken()).rejects.toThrow(/Not authenticated/);
  });
});

describe('addOsmBacklink request shape', () => {
  it('runs the preview before the write and attaches an OSM reference', async () => {
    const order = [];
    routeFetch([
      ['/api/v1/edits/preview', () => (order.push('preview'), okPreview())],
      ['meta=tokens', () => (order.push('csrf'), csrf())],
      ['crossorigin=1', (_url, init) => {
        const action = new URLSearchParams(init.body).get('action');
        order.push(action);
        return created();
      }],
    ]);
    const res = await WikidataEdit.addOsmBacklink('q1', 'node', 99);
    expect(order).toEqual(['preview', 'csrf', 'wbcreateclaim', 'wbsetreference']);
    expect(res.referenced).toBe(true);
  });

  it('attaches P248=Q936, P854 OSM URL, and P813 retrieved date via wbsetreference', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', 'node', 99);
    const refCall = writeCalls(calls).find((c) => new URLSearchParams(c.init.body).get('action') === 'wbsetreference');
    expect(refCall).toBeTruthy();
    const body = new URLSearchParams(refCall.init.body);
    expect(body.get('statement')).toBe('Q1$abc');
    const snaks = JSON.parse(body.get('snaks'));
    expect(snaks.P248[0].datavalue.value.id).toBe('Q936');
    expect(snaks.P854[0].datavalue.value).toBe('https://www.openstreetmap.org/node/99');
    expect(snaks.P813[0].datavalue.value.time).toMatch(/^\+\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    expect(snaks.P813[0].datavalue.value.precision).toBe(11);
  });

  it('passes through missingConstraints and osmCoords from preview', async () => {
    routeFetch([
      ['/api/v1/edits/preview', () => jsonResponse({
        ...PREVIEW,
        missing_constraints: ['P625', 'P131'],
        osm_coords: { lat: 24.7136, lon: 46.6753 },
      })],
      ['meta=tokens', csrf],
      ['crossorigin=1', created],
    ]);
    const res = await WikidataEdit.addOsmBacklink('Q1', 'node', 99);
    expect(res.missingConstraints).toEqual(['P625', 'P131']);
    expect(res.osmCoords).toEqual({ lat: 24.7136, lon: 46.6753 });
  });

  it('posts the dry-run to the backend with the property and numeric id', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', 'way', '55');
    expect(JSON.parse(calls[0].init.body)).toEqual({ qid: 'Q1', property: 'P10689', osm_type: 'way', osm_id: 55 });
  });

  it('sends maxlag, baserevid, token and a JSON-encoded string value as a form body', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', 'node', 99);

    const [write] = writeCalls(calls);
    expect(write.url).toBe('https://www.wikidata.org/w/api.php?crossorigin=1');
    expect(write.init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(write.init.headers.Authorization).toBe('Bearer AT');
    const body = new URLSearchParams(write.init.body);
    expect(body.get('action')).toBe('wbcreateclaim');
    expect(body.get('property')).toBe('P11693');
    expect(body.get('value')).toBe('"99"');
    expect(body.get('maxlag')).toBe('5');
    expect(body.get('baserevid')).toBe('4242');
    expect(body.get('token')).toBeTruthy();
    expect(body.has('crossorigin')).toBe(false);
  });

  it('puts the EditGroups batch link in the edit summary', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', 'node', 99, 'deadbeef');
    const summary = new URLSearchParams(writeCalls(calls)[0].init.body).get('summary');
    expect(summary).toContain('editgroups/b/CB/deadbeef');
  });

  it('prefers an explicit baserevid over the preview value', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', 'node', 99, null, { baserevid: 7 });
    expect(new URLSearchParams(writeCalls(calls)[0].init.body).get('baserevid')).toBe('7');
  });

  it.each([
    ['node', 'P11693'],
    ['way', 'P10689'],
    ['relation', 'P402'],
  ])('uses %s -> %s', async (type, prop) => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', type, 1);
    expect(new URLSearchParams(writeCalls(calls)[0].init.body).get('property')).toBe(prop);
  });

  it('rejects an unsupported OSM type before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(WikidataEdit.addOsmBacklink('Q1', 'area', 1)).rejects.toThrow(/Unsupported OSM type/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records history and marks the item resolved on success', async () => {
    routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
    const res = await WikidataEdit.addOsmBacklink('Q1', 'node', 99);
    expect(res).toMatchObject({ success: true, method: 'wbcreateclaim' });
    expect(WikidataEdit.getEditHistory()[0]).toMatchObject({ qid: 'Q1', property: 'P11693', osmId: '99' });
    expect(WikidataEdit.isReverseResolved('node99:Q1:missing_backlink')).toBe(true);
  });
});

describe('addOsmBacklink pre-flight gate', () => {
  it('writes nothing when the preview says the edit is invalid', async () => {
    const calls = routeFetch([
      ['/api/v1/edits/preview', () => jsonResponse({ valid: false, status: 'conflict', warnings: ['QID is a redirect'] })],
    ]);
    await expect(WikidataEdit.addOsmBacklink('Q1', 'node', 1)).rejects.toThrow('QID is a redirect');
    expect(writeCalls(calls)).toHaveLength(0);
    expect(calls.some((c) => c.url.includes('meta=tokens'))).toBe(false);
  });

  it('skips the write and records it as resolved when already linked', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', () => jsonResponse({ valid: true, status: 'already_linked' })]]);
    const res = await WikidataEdit.addOsmBacklink('Q1', 'node', 1);
    expect(res).toMatchObject({ success: true, skipped: true, method: 'already_linked' });
    expect(calls).toHaveLength(1);
    expect(WikidataEdit.isReverseResolved('node1:Q1:missing_backlink')).toBe(true);
  });

  it('refuses to write blind when the backend is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(WikidataEdit.addOsmBacklink('Q1', 'node', 1)).rejects.toThrow(/nothing was written/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('refuses to write on a preview HTTP error', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', () => jsonResponse({}, { status: 500 })]]);
    await expect(WikidataEdit.addOsmBacklink('Q1', 'node', 1)).rejects.toThrow(/Pre-flight check failed \(HTTP 500\)/);
    expect(writeCalls(calls)).toHaveLength(0);
  });

  it('retries a rate-limited preview and then proceeds', async () => {
    let n = 0;
    routeFetch([
      ['/api/v1/edits/preview', () => (++n < 3 ? jsonResponse({}, { status: 429, headers: { 'Retry-After': '2' } }) : okPreview())],
      ['meta=tokens', csrf],
      ['crossorigin=1', created],
    ]);
    const res = await WikidataEdit.addOsmBacklink('Q1', 'node', 1);
    expect(res.success).toBe(true);
    expect(n).toBe(3);
    expect(WikidataEdit._sleep).toHaveBeenCalledWith(2000);
  });

  it('skips the preview for the test.wikidata.org sandbox', async () => {
    WikidataAuth.ENVIRONMENT = 'test';
    const calls = routeFetch([['meta=tokens', csrf], ['crossorigin=1', created]]);
    await WikidataEdit.addOsmBacklink('Q1', 'node', 1);
    expect(calls.some((c) => c.url.includes('/api/v1/edits/preview'))).toBe(false);
    expect(calls.every((c) => !c.url.includes('www.wikidata.org'))).toBe(true);
    expect(new URLSearchParams(writeCalls(calls)[0].init.body).has('baserevid')).toBe(false);
  });
});

describe('maxlag and rate-limit handling', () => {
  const lagged = () => jsonResponse({ error: { code: 'maxlag', info: 'waiting for a database server' } });

  it('waits and retries on a maxlag error, then succeeds', async () => {
    let writes = 0;
    routeFetch([
      ['/api/v1/edits/preview', okPreview],
      ['meta=tokens', csrf],
      ['crossorigin=1', (_url, init) => {
        if (new URLSearchParams(init.body).get('action') === 'wbsetreference') return created();
        return ++writes < 3 ? lagged() : created();
      }],
    ]);
    const res = await WikidataEdit.addOsmBacklink('Q1', 'node', 1);
    expect(res.method).toBe('wbcreateclaim');
    expect(writes).toBe(3);
    expect(WikidataEdit._sleep.mock.calls.map((c) => c[0])).toEqual([5000, 10000]);
  });

  it('honours Retry-After on HTTP 429, capped at 60 s', async () => {
    let writes = 0;
    routeFetch([
      ['/api/v1/edits/preview', okPreview],
      ['meta=tokens', csrf],
      ['crossorigin=1', (_url, init) => {
        if (new URLSearchParams(init.body).get('action') === 'wbsetreference') return created();
        return ++writes < 2 ? jsonResponse({}, { status: 429, headers: { 'Retry-After': '999' } }) : created();
      }],
    ]);
    await WikidataEdit.addOsmBacklink('Q1', 'node', 1);
    expect(WikidataEdit._sleep).toHaveBeenCalledWith(60_000);
  });

  it('gives up with a busy error after 4 attempts and does not try the REST fallback', async () => {
    const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', lagged]]);
    const err = await WikidataEdit.addOsmBacklink('Q1', 'node', 1).catch((e) => e);
    expect(err.busy).toBe(true);
    expect(err.message).toMatch(/maxlag: waiting for a database server/);
    expect(calls.filter((c) => c.url.includes('crossorigin=1') && c.init.method === 'POST')).toHaveLength(4);
    expect(calls.some((c) => c.url.includes('/rest.php/wikibase'))).toBe(false);
  });

  it('sends maxlag=5 by default and the caller-supplied value for interactive edits', async () => {
    const sentMaxlag = async (options) => {
      const calls = routeFetch([['/api/v1/edits/preview', okPreview], ['meta=tokens', csrf], ['crossorigin=1', created]]);
      await WikidataEdit.addOsmBacklink('Q1', 'node', 1, null, options);
      return new URLSearchParams(writeCalls(calls)[0].init.body).get('maxlag');
    };
    expect(await sentMaxlag({})).toBe('5');
    expect(await sentMaxlag({ maxlag: WikidataEdit.MAXLAG_INTERACTIVE_SECONDS })).toBe('15');
  });

  it('reports the HTTP status and Retry-After when persistently rate-limited', async () => {
    routeFetch([
      ['/api/v1/edits/preview', okPreview],
      ['meta=tokens', csrf],
      ['crossorigin=1', () => jsonResponse({}, { status: 429, headers: { 'Retry-After': '30' } })],
    ]);
    const err = await WikidataEdit.addOsmBacklink('Q1', 'node', 1).catch((e) => e);
    expect(err.busy).toBe(true);
    expect(err.detail).toBe('HTTP 429, Retry-After 30s');
  });

  it('falls back to the REST API when wbcreateclaim returns an ordinary error', async () => {
    const calls = routeFetch([
      ['/api/v1/edits/preview', okPreview],
      ['meta=tokens', csrf],
      ['crossorigin=1', () => jsonResponse({ error: { code: 'badtoken', info: 'bad token' } })],
      ['/rest.php/wikibase/v1/entities/items/Q1/statements', () => jsonResponse({ id: 'Q1$rest' })],
    ]);
    const res = await WikidataEdit.addOsmBacklink('Q1', 'node', 1);
    expect(res.method).toBe('rest_v1');
    expect(res.referenced).toBe(true);
    const rest = calls.find((c) => c.url.includes('/rest.php/wikibase'));
    expect(rest.init.headers.Authorization).toBe('Bearer AT');
    const stmt = JSON.parse(rest.init.body).statement;
    expect(stmt.property).toEqual({ id: 'P11693' });
    expect(stmt.value).toEqual({ type: 'value', content: '1' });
    expect(stmt.references[0].parts[0]).toEqual({ property: { id: 'P248' }, value: { type: 'value', content: 'Q936' } });
    expect(stmt.references[0].parts[1]).toEqual({
      property: { id: 'P854' },
      value: { type: 'value', content: 'https://www.openstreetmap.org/node/1' },
    });
  });
});

describe('addCoordinateStatement (P625)', () => {
  it('writes a P625 globecoordinate claim and attaches an OSM reference', async () => {
    const calls = routeFetch([['meta=tokens', csrf], ['crossorigin=1', created]]);
    const res = await WikidataEdit.addCoordinateStatement('Q1', 24.7136, 46.6753, 'node', 99);
    expect(res.success).toBe(true);
    expect(res.referenced).toBe(true);
    const [claimCall, refCall] = writeCalls(calls);
    const claimBody = new URLSearchParams(claimCall.init.body);
    expect(claimBody.get('property')).toBe('P625');
    expect(JSON.parse(claimBody.get('value'))).toEqual({
      latitude: 24.7136,
      longitude: 46.6753,
      precision: 0.0001,
      globe: 'http://www.wikidata.org/entity/Q2',
    });
    const refBody = new URLSearchParams(refCall.init.body);
    expect(refBody.get('action')).toBe('wbsetreference');
  });

  it('rejects out-of-range coordinates before making any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(WikidataEdit.addCoordinateStatement('Q1', 99, 46, 'node', 1)).rejects.toThrow(/Invalid coordinates/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('attachReferenceToStatement, addAdminEntityStatement, and searchAdminEntities', () => {
  it('backfills an OSM reference onto an existing unreferenced statement', async () => {
    const calls = routeFetch([['meta=tokens', csrf], ['crossorigin=1', created]]);
    const res = await WikidataEdit.attachReferenceToStatement('Q1', 'Q1$existing', 'node', 1313924745);
    expect(res).toEqual({ success: true, statementId: 'Q1$existing' });
    const [refCall] = writeCalls(calls);
    const body = new URLSearchParams(refCall.init.body);
    expect(body.get('action')).toBe('wbsetreference');
    expect(body.get('statement')).toBe('Q1$existing');
    const snaks = JSON.parse(body.get('snaks'));
    expect(snaks.P248[0].datavalue.value.id).toBe('Q936');
    expect(snaks.P854[0].datavalue.value).toBe('https://www.openstreetmap.org/node/1313924745');
  });

  it('adds a P131 administrative entity statement and attaches an OSM reference', async () => {
    const calls = routeFetch([['meta=tokens', csrf], ['crossorigin=1', created]]);
    const res = await WikidataEdit.addAdminEntityStatement('Q1', 'Q3692', 'node', 99);
    expect(res).toMatchObject({ success: true, referenced: true, p131Qid: 'Q3692' });
    const [claimCall, refCall] = writeCalls(calls);
    const claimBody = new URLSearchParams(claimCall.init.body);
    expect(claimBody.get('property')).toBe('P131');
    expect(JSON.parse(claimBody.get('value'))).toEqual({
      'entity-type': 'item',
      'numeric-id': 3692,
      id: 'Q3692',
    });
    expect(new URLSearchParams(refCall.init.body).get('action')).toBe('wbsetreference');
  });

  it('rejects invalid P131 QIDs before making any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(WikidataEdit.addAdminEntityStatement('Q1', 'not-a-qid', 'node', 1)).rejects.toThrow(/Invalid administrative/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches Wikidata entities for the guided P131 picker', async () => {
    routeFetch([
      ['action=wbsearchentities', () => jsonResponse({
        search: [{ id: 'Q3692', label: 'Riyadh', description: 'capital city of Saudi Arabia' }],
      })],
    ]);
    const hits = await WikidataEdit.searchAdminEntities('Riyadh', 'en');
    expect(hits).toEqual([{ id: 'Q3692', label: 'Riyadh', description: 'capital city of Saudi Arabia' }]);
  });
});

describe('batch ids and resolved-state storage', () => {
  it('getBatchId is stable until reset, then changes', () => {
    const a = WikidataEdit.getBatchId();
    expect(WikidataEdit.getBatchId()).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(WikidataEdit.resetBatchId()).not.toBe(a);
  });

  it('mark / unmark round-trips', () => {
    WikidataEdit.markReverseResolved('k', { qid: 'Q1' });
    expect(WikidataEdit.isReverseResolved('k')).toBe(true);
    WikidataEdit.unmarkReverseResolved('k');
    expect(WikidataEdit.isReverseResolved('k')).toBe(false);
  });

  it('prunes entries resolved before the latest data pipeline run', () => {
    localStorage.setItem(
      'osm_wd_resolved_reverse',
      JSON.stringify({ old: { resolved_at: Date.parse('2026-01-01') }, fresh: { resolved_at: Date.parse('2026-06-01') } })
    );
    WikidataEdit.pruneOldResolved('2026-03-01T00:00:00Z');
    expect(Object.keys(WikidataEdit.getResolvedMap())).toEqual(['fresh']);
  });

  it('ignores a garbage pipeline timestamp', () => {
    WikidataEdit.markReverseResolved('k', {});
    WikidataEdit.pruneOldResolved('not-a-date');
    expect(WikidataEdit.isReverseResolved('k')).toBe(true);
  });

  it('caps the edit history at 300 entries, newest first', () => {
    for (let i = 0; i < 305; i++) WikidataEdit.logHistory({ n: i });
    const h = WikidataEdit.getEditHistory();
    expect(h).toHaveLength(300);
    expect(h[0].n).toBe(304);
  });
});
