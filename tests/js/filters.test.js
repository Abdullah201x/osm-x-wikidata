import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp } from './app-harness.js';

let app;
beforeAll(() => {
  app = loadApp();
});

// [0:qid, 1:lat, 2:lon, 3:cat, 4:status, 5:name_ar, 6:name_en, 7:p31, 8:osm_ref, 9:cand, 10:image, 11:wiki_ar]
const DATA = [
  [1, 24, 46, 1, 0, 'الرياض', 'Riyadh', 'Q515', '', '', '', 'https://ar.wikipedia.org/wiki/x'],
  [2, 24, 46, 6, 0, 'مسجد النور', 'Al Noor Mosque', 'Q32815', '', '', 'img.jpg', ''],
  [3, 24, 46, 5, 1, 'فندق الشرق', 'Orient Hotel', '', 'n3', 'c', '', ''],
  [4, 24, 46, 5, 2, 'برج المملكة', 'Kingdom Tower', '', 'w4', '', 'img2.jpg', 'https://ar.wikipedia.org/wiki/y'],
  [5, 24, 46, 2, 0, 'قصر سابق', 'Former Palace', '', '', '', '', ''],
  [6, 24, 46, 2, 0, 'مبنى', 'Ruin', 'Q19860854', '', '', '', ''],
];

const ALL_CATS = new Set([1, 2, 3, 4, 5, 6]);
const run = (state = {}) => {
  app.__app.set({
    loadedDataset: { items: DATA },
    activeStatusFilter: 'all',
    activeCategoryFilters: ALL_CATS,
    searchQuery: '',
    filterHasWiki: false,
    filterHasPhoto: false,
    filterHideDemolished: false,
    filterHideMosques: false,
    filterHideLinked: false,
    ...state,
  });
  app.applyFilters();
  return app.__app.get().filteredItems.map((i) => i[0]);
};

beforeEach(() => {
  globalThis.LiveVerifier.getVerifiedCache.mockReturnValue({});
  globalThis.MapController.renderItems.mockClear();
});

describe('applyFilters', () => {
  it('shows everything with no filters', () => {
    expect(run()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each([
    [0, [1, 2, 5, 6]],
    [1, [3]],
    [2, [4]],
  ])('status filter %i', (status, expected) => {
    expect(run({ activeStatusFilter: status })).toEqual(expected);
  });

  it('category filter keeps only enabled categories', () => {
    expect(run({ activeCategoryFilters: new Set([5]) })).toEqual([3, 4]);
    expect(run({ activeCategoryFilters: new Set() })).toEqual([]);
  });

  it('hides demolished by name (ar/en) and by destroyed/former P31', () => {
    expect(run({ filterHideDemolished: true })).toEqual([1, 2, 3, 4]);
  });

  it('hides linked features', () => {
    expect(run({ filterHideLinked: true })).toEqual([1, 2, 3, 5, 6]);
  });

  it('has-Wikipedia and has-photo filters', () => {
    expect(run({ filterHasWiki: true })).toEqual([1, 4]);
    expect(run({ filterHasPhoto: true })).toEqual([2, 4]);
    expect(run({ filterHasWiki: true, filterHasPhoto: true })).toEqual([4]);
  });

  it('hide-mosques drops category 6 and the mosque P31', () => {
    expect(run({ filterHideMosques: true })).toEqual([1, 3, 4, 5, 6]);
  });

  it('search matches Arabic with spelling variants, English and QIDs', () => {
    expect(run({ searchQuery: 'الرياض' })).toEqual([1]);
    expect(run({ searchQuery: 'hotel' })).toEqual([3]);
    expect(run({ searchQuery: 'Q4' })).toEqual([4]);
  });

  it('combines filters with AND', () => {
    expect(run({ activeStatusFilter: 0, filterHideDemolished: true, filterHideMosques: true })).toEqual([1]);
  });

  it('treats a live-verified item as linked regardless of its dataset status', () => {
    globalThis.LiveVerifier.getVerifiedCache.mockReturnValue({ Q1: { osm_ref: 'n1' } });
    expect(run({ activeStatusFilter: 2 })).toEqual([1, 4]);
    expect(run({ filterHideLinked: true })).toEqual([2, 3, 5, 6]);
  });

  it('renders the filtered set on the map', () => {
    run({ activeStatusFilter: 1 });
    expect(globalThis.MapController.renderItems).toHaveBeenCalledOnce();
    expect(globalThis.MapController.renderItems.mock.calls[0][0].map((i) => i[0])).toEqual([3]);
  });

  it('updates the visible-count badge', () => {
    document.body.innerHTML = '<span id="visible-count"></span>';
    run({ activeStatusFilter: 0 });
    expect(document.getElementById('visible-count').innerText).toBe('4');
  });

  it('is a no-op before a dataset is loaded', () => {
    app.__app.set({ loadedDataset: null });
    expect(() => app.applyFilters()).not.toThrow();
    expect(globalThis.MapController.renderItems).not.toHaveBeenCalled();
  });
});
