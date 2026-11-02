import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript, jsonResponse } from './load-script.js';

let LiveVerifier;
beforeAll(() => {
  loadScript('arabic_utils.js', ['ArabicUtils']);
  LiveVerifier = loadScript('live_verify.js', ['LiveVerifier']).LiveVerifier;
});

// [0:qid, 1:lat, 2:lon, 3:cat, 4:status, 5:name_ar, 6:name_en]
const item = [851, 24.7, 46.7, 6, 0, 'مسجد النور', 'Al Noor Mosque'];

beforeEach(() => {
  localStorage.clear();
  LiveVerifier._cache = null;
});
afterEach(() => vi.unstubAllGlobals());

const overpass = (elements) => jsonResponse({ elements });

describe('calcDistanceM', () => {
  it('is zero for identical points and roughly 111 km per degree of latitude', () => {
    expect(LiveVerifier.calcDistanceM(24, 46, 24, 46)).toBe(0);
    expect(LiveVerifier.calcDistanceM(0, 0, 1, 0)).toBeGreaterThan(110000);
    expect(LiveVerifier.calcDistanceM(0, 0, 1, 0)).toBeLessThan(112000);
  });
});

describe('verified cache', () => {
  it('persists a verification and reads it back after the in-memory cache is dropped', () => {
    LiveVerifier.markVerifiedLocally('Q851', 'n1', 'Name');
    LiveVerifier._cache = null;
    expect(LiveVerifier.isLocallyVerified('Q851')).toMatchObject({ osm_ref: 'n1', name: 'Name' });
    expect(LiveVerifier.isLocallyVerified('Q1')).toBeNull();
  });

  it('recovers from corrupt localStorage', () => {
    localStorage.setItem('osm_wd_verified_qids', '{not json');
    expect(LiveVerifier.getVerifiedCache()).toEqual({});
  });
});

describe('verifyItemLive', () => {
  it('reports a direct wikidata tag match as linked and remembers it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => overpass([
      { type: 'node', id: 7, lat: 24.7, lon: 46.7, tags: { name: 'x', wikidata: 'Q851' } },
    ])));
    const res = await LiveVerifier.verifyItemLive(item);
    expect(res).toMatchObject({ status: 'linked', ref: 'n7', count_nearby: 1 });
    expect(LiveVerifier.isLocallyVerified('Q851')).toMatchObject({ osm_ref: 'n7' });
  });

  it('ranks an exact Arabic name match first as a candidate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => overpass([
      { type: 'node', id: 1, lat: 24.7003, lon: 46.7, tags: { name: 'مقهى', amenity: 'cafe' } },
      { type: 'way', id: 2, center: { lat: 24.7, lon: 46.7 }, tags: { name: 'مسجد النور', amenity: 'place_of_worship' } },
    ])));
    const res = await LiveVerifier.verifyItemLive(item);
    expect(res.status).toBe('candidate');
    expect(res.ref).toBe('w2');
    expect(res.candidates[0].matchedReason).toBe('Exact Arabic Name Match');
    expect(res.candidates[0].score).toBeLessThanOrEqual(1);
  });

  it('reports missing when nothing nearby resembles the item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => overpass([
      { type: 'node', id: 3, lat: 24.71, lon: 46.71, tags: { building: 'yes' } },
    ])));
    const res = await LiveVerifier.verifyItemLive(item);
    expect(res).toMatchObject({ status: 'missing', candidates: [], count_nearby: 1 });
  });

  it('falls through to the next mirror when one errors or returns non-OK', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(jsonResponse({}, { status: 504 }))
      .mockResolvedValueOnce(overpass([]));
    vi.stubGlobal('fetch', fetchMock);
    const res = await LiveVerifier.verifyItemLive(item);
    expect(res.status).toBe('missing');
    const hosts = fetchMock.mock.calls.map(([url]) => new URL(url).host);
    expect(hosts).toEqual(['overpass-api.de', 'overpass.kumi.systems', 'lz4.overpass-api.de']);
  });

  it('throws when every mirror fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(LiveVerifier.verifyItemLive(item)).rejects.toThrow(/did not respond/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
