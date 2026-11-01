import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript, jsonResponse } from './load-script.js';

let WikidataLabels;
beforeAll(() => {
  WikidataLabels = loadScript('wikidata_labels.js', ['WikidataLabels']).WikidataLabels;
});

beforeEach(() => {
  localStorage.clear();
  WikidataLabels._cache = null;
  WikidataLabels._pending = {};
});

const entity = (qid) => ({
  entities: { [qid]: { labels: { ar: { value: 'مسجد' }, en: { value: 'mosque' } }, descriptions: { en: { value: 'place of worship' } } } },
});

describe('WikidataLabels', () => {
  it('picks the requested language and falls back to the other', () => {
    const e = { ar: 'مسجد', en: '' };
    expect(WikidataLabels.label(e, 'ar')).toBe('مسجد');
    expect(WikidataLabels.label(e, 'en')).toBe('مسجد');
    expect(WikidataLabels.label(null, 'en')).toBe('');
  });

  it('falls back across description languages too', () => {
    expect(WikidataLabels.description({ descEn: 'x' }, 'ar')).toBe('x');
  });

  it('fetches once, caches in localStorage and serves repeats from cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(entity('Q32815')));
    vi.stubGlobal('fetch', fetchMock);
    const first = await WikidataLabels.fetch('Q32815');
    const second = await WikidataLabels.fetch('Q32815');
    expect(first).toEqual({ ar: 'مسجد', en: 'mosque', descAr: '', descEn: 'place of worship' });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem(WikidataLabels.STORAGE_KEY)).Q32815.en).toBe('mosque');
  });

  it('deduplicates concurrent requests for the same class', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(entity('Q1')));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([WikidataLabels.fetch('Q1'), WikidataLabels.fetch('Q1')]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('is an anonymous read (origin=*) limited to labels and descriptions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(entity('Q1')));
    vi.stubGlobal('fetch', fetchMock);
    await WikidataLabels.fetch('Q1');
    expect(fetchMock.mock.calls[0][0]).toContain('props=labels%7Cdescriptions');
    expect(fetchMock.mock.calls[0][0]).toContain('origin=*');
  });

  it('rejects for a missing entity and does not cache it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ entities: { Q9: { missing: '' } } })));
    await expect(WikidataLabels.fetch('Q9')).rejects.toThrow(/Unknown entity/);
    expect(WikidataLabels.get('Q9')).toBeNull();
    expect(WikidataLabels._pending.Q9).toBeUndefined();
  });

  it('rejects on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));
    await expect(WikidataLabels.fetch('Q2')).rejects.toThrow('HTTP 500');
  });

  it('recovers from a corrupt cache in localStorage', () => {
    localStorage.setItem(WikidataLabels.STORAGE_KEY, '{bad');
    expect(WikidataLabels.get('Q1')).toBeNull();
  });
});
