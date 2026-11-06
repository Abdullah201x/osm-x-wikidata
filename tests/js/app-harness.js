import { vi } from 'vitest';
import { loadScript } from './load-script.js';

/**
 * Loads the real js/app.js with its collaborators stubbed. app.js keeps its state in
 * top-level `let` bindings, so a tiny accessor is appended inside the same scope
 * (the shipped file is not modified).
 */
export function loadApp() {
  loadScript('translations.js', ['TRANSLATIONS']);
  loadScript('arabic_utils.js', ['ArabicUtils']);
  loadScript('tools.js', ['escapeHtml', 'safeUrl', 'commonsImageUrl']);
  loadScript('import_access.js', ['ImportAccess']);

  globalThis.MapController = {
    renderItems: vi.fn(),
    flyTo: vi.fn(),
    clearCandidatesFromMap: vi.fn(),
    switchBasemap: vi.fn(),
    BASEMAP_ORDER: ['dark', 'light', 'streets', 'topo', 'satellite'],
  };
  globalThis.LiveVerifier = { getVerifiedCache: vi.fn(() => ({})) };
  globalThis.MappingTools = {
    josmLoadAndZoom: vi.fn(),
    josmAddTags: vi.fn(),
    getIdEditorUrl: vi.fn((lat, lon) => `ID:${lat},${lon}`),
  };
  globalThis.BatchManager = { openModal: vi.fn() };
  globalThis.HistoryManager = { openModal: vi.fn() };

  const accessor = `
    const __app = {
      set(s) {
        if ('loadedDataset' in s) loadedDataset = s.loadedDataset;
        if ('activeStatusFilter' in s) activeStatusFilter = s.activeStatusFilter;
        if ('activeCategoryFilters' in s) activeCategoryFilters = s.activeCategoryFilters;
        if ('searchQuery' in s) searchQuery = s.searchQuery;
        if ('filterHasWiki' in s) filterHasWiki = s.filterHasWiki;
        if ('filterHasPhoto' in s) filterHasPhoto = s.filterHasPhoto;
        if ('filterHideDemolished' in s) filterHideDemolished = s.filterHideDemolished;
        if ('filterHideMosques' in s) filterHideMosques = s.filterHideMosques;
        if ('filterHideLinked' in s) filterHideLinked = s.filterHideLinked;
        if ('currentMode' in s) currentMode = s.currentMode;
        if ('filteredReverseItems' in s) filteredReverseItems = s.filteredReverseItems;
        if ('filteredItems' in s) filteredItems = s.filteredItems;
        if ('selectedItem' in s) selectedItem = s.selectedItem;
        if ('selectedItemIndex' in s) selectedItemIndex = s.selectedItemIndex;
      },
      get() {
        return { filteredItems, selectedItem, selectedItemIndex, currentMode };
      },
    };`;
  return loadScript(
    'app.js',
    ['__app', 'applyFilters', 'setupKeyboardShortcuts', 'selectReverseItem', 'updateUrlHash'],
    accessor
  );
}
