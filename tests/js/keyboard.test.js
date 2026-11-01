import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadApp } from './app-harness.js';

let app;
beforeAll(() => {
  app = loadApp();
  app.setupKeyboardShortcuts();
});

const press = (key, target = window) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  document.body.innerHTML = `
    <div id="shortcuts-modal" class="modal-overlay" style="display:none"></div>
    <div id="other-modal" class="modal-overlay" style="display:flex"></div>
    <button class="basemap-btn active" data-bm="dark"></button>
    <button class="basemap-btn" data-bm="satellite"></button>
    <button class="basemap-btn" data-bm="streets"></button>
    <input id="q" />`;
  vi.clearAllMocks();
  app.__app.set({ currentMode: 'forward', selectedItem: null, selectedItemIndex: -1, filteredItems: [], filteredReverseItems: [] });
});

describe('global shortcuts', () => {
  it('? toggles the shortcuts modal', () => {
    press('?');
    expect(document.getElementById('shortcuts-modal').style.display).toBe('flex');
    press('?');
    expect(document.getElementById('shortcuts-modal').style.display).toBe('none');
  });

  it('Escape closes every open modal', () => {
    press('Escape');
    expect(document.getElementById('other-modal').style.display).toBe('none');
  });

  it('b opens the batch modal and h the history modal', () => {
    press('b');
    press('H');
    expect(globalThis.BatchManager.openModal).toHaveBeenCalledOnce();
    expect(globalThis.HistoryManager.openModal).toHaveBeenCalledOnce();
  });

  it('] and [ cycle the basemap forwards and backwards', () => {
    press(']');
    expect(globalThis.MapController.switchBasemap).toHaveBeenLastCalledWith('satellite');
    expect(document.querySelector('.basemap-btn.active').dataset.bm).toBe('satellite');
    press('[');
    expect(globalThis.MapController.switchBasemap).toHaveBeenLastCalledWith('dark');
    press('[');
    expect(globalThis.MapController.switchBasemap).toHaveBeenLastCalledWith('streets');
  });

  it('ignores shortcuts while typing in an input', () => {
    document.getElementById('q').focus();
    press('b');
    expect(globalThis.BatchManager.openModal).not.toHaveBeenCalled();
  });

  it('prevents the default browser action for handled keys only', () => {
    expect(press('b').defaultPrevented).toBe(true);
    expect(press('z').defaultPrevented).toBe(false);
  });
});

describe('forward mode item shortcuts', () => {
  const item = [123, 24.5, 46.5, 5, 1, 'ا', 'A', '', 'w9'];

  it('do nothing without a selected item', () => {
    press('j');
    expect(globalThis.MappingTools.josmLoadAndZoom).not.toHaveBeenCalled();
  });

  it('j sends the item to JOSM with its OSM ref', () => {
    app.__app.set({ selectedItem: item });
    press('j');
    expect(globalThis.MappingTools.josmLoadAndZoom).toHaveBeenCalledWith(24.5, 46.5, 'w9');
  });

  it('t pushes wikidata=Q.. via JOSM when a candidate ref exists', () => {
    app.__app.set({ selectedItem: item });
    press('t');
    expect(globalThis.MappingTools.josmAddTags).toHaveBeenCalledWith('w9', 'Q123');
  });

  it('t alerts instead of tagging when there is no candidate', () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    app.__app.set({ selectedItem: [123, 24.5, 46.5, 5, 0, 'ا', 'A', '', ''] });
    press('t');
    expect(globalThis.MappingTools.josmAddTags).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledOnce();
  });

  it('i opens the iD editor in a new tab', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    app.__app.set({ selectedItem: item });
    press('i');
    expect(open).toHaveBeenCalledWith('ID:24.5,46.5', '_blank');
  });

  it('l and o and v click their toolbar buttons when present', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="btn-direct-link"></button><button id="btn-overpass-turbo"></button><button id="btn-live-verify"></button>'
    );
    const clicks = [];
    for (const id of ['btn-direct-link', 'btn-overpass-turbo', 'btn-live-verify']) {
      document.getElementById(id).addEventListener('click', () => clicks.push(id));
    }
    app.__app.set({ selectedItem: item });
    press('l');
    press('o');
    press('v');
    expect(clicks).toEqual(['btn-direct-link', 'btn-overpass-turbo', 'btn-live-verify']);
  });
});

// Regression: these used undeclared variables (selectedReverseItem) and threw ReferenceError.
describe('reverse mode item shortcuts', () => {
  const rev = (id, qid) => ({
    osm_type: 'w',
    osm_id: id,
    qid,
    osm: { lat: 21.5, lon: 39.2 },
    wikidata: {},
  });
  const items = [rev(1, 'Q1'), rev(2, 'Q2'), rev(3, 'Q3')];

  beforeEach(() => {
    app.__app.set({ currentMode: 'reverse', filteredReverseItems: items, selectedItem: items[0], selectedItemIndex: 0 });
  });

  it('do nothing, without throwing, when nothing is selected', () => {
    app.__app.set({ selectedItem: null });
    expect(() => press('j')).not.toThrow();
    expect(globalThis.MappingTools.josmLoadAndZoom).not.toHaveBeenCalled();
  });

  it('j loads the OSM element (type+id ref) at its OSM coordinates', () => {
    press('j');
    expect(globalThis.MappingTools.josmLoadAndZoom).toHaveBeenCalledWith(21.5, 39.2, 'w1');
  });

  it('t adds the item QID, not the suggested back-link value, to the OSM element', () => {
    app.__app.set({ selectedItem: { ...items[0], suggested_fix: { target: 'wikidata', property: 'P10689', value: '1' } } });
    press('t');
    expect(globalThis.MappingTools.josmAddTags).toHaveBeenCalledWith('w1', 'Q1');
  });

  it('n and p walk the filtered reverse list and wrap around', () => {
    app.__app.set({ selectedItem: items[0], selectedItemIndex: 0 });
    press('n');
    expect(app.__app.get().selectedItem).toBe(items[1]);
    press('n');
    press('n');
    expect(app.__app.get().selectedItem).toBe(items[0]);
    press('p');
    expect(app.__app.get().selectedItem).toBe(items[2]);
  });
});

describe('URL hash in reverse mode', () => {
  it('records the selected reverse item QID', () => {
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    app.__app.set({ currentMode: 'reverse', selectedItem: { qid: 'Q42' } });
    app.updateUrlHash();
    expect(replace.mock.calls[0][2]).toContain('qid=Q42');
    expect(replace.mock.calls[0][2]).toContain('mode=reverse');
  });
});
