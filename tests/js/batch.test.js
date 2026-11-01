import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './load-script.js';

let BatchManager, WikidataEdit;
beforeAll(() => {
  loadScript('translations.js', ['TRANSLATIONS']);
  BatchManager = loadScript('batch_manager.js', ['BatchManager']).BatchManager;
  loadScript('wikidata_auth.js', ['WikidataAuth']);
  WikidataEdit = loadScript('wikidata_edit.js', ['WikidataEdit']).WikidataEdit;
});

beforeEach(() => {
  localStorage.clear();
  globalThis.currentLang = 'en';
  globalThis.currentCountry = 'sa';
  document.body.innerHTML = '<span class="batch-counter"></span><button id="floating-batch-btn" style="display:none"></button>';
});

const tuple = (qid, ref = 'n1') => [qid, 24.5, 46.5, 5, 1, 'اسم', 'Name', '', ref];

describe('BatchManager staging queue', () => {
  it('stages an item with the candidate reference and country', () => {
    expect(BatchManager.add(tuple(10), 'w77', '', {}, 'ae')).toBe(true);
    const [it] = BatchManager.getStagedItems();
    expect(it).toMatchObject({ qid: 'Q10', osmRef: 'w77', country: 'ae', lat: 24.5, lon: 46.5 });
  });

  it('refuses a duplicate QID', () => {
    BatchManager.add(tuple(10));
    expect(BatchManager.add(tuple(10))).toBe(false);
    expect(BatchManager.count()).toBe(1);
  });

  it('refuses an item without any OSM reference and tells the user', () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    expect(BatchManager.add(tuple(11, ''))).toBe(false);
    expect(alertMock).toHaveBeenCalledOnce();
    expect(BatchManager.count()).toBe(0);
  });

  it('isStaged and remove accept QIDs with or without the Q prefix', () => {
    BatchManager.add(tuple(12));
    expect(BatchManager.isStaged('12')).toBe(true);
    expect(BatchManager.isStaged('Q12')).toBe(true);
    BatchManager.remove('12');
    expect(BatchManager.isStaged('Q12')).toBe(false);
  });

  it('updates the badge and floating button as the queue changes', () => {
    BatchManager.add(tuple(13));
    expect(document.querySelector('.batch-counter').innerText).toBe(1);
    expect(document.getElementById('floating-batch-btn').style.display).toBe('flex');
    BatchManager.clear();
    expect(document.getElementById('floating-batch-btn').style.display).toBe('none');
  });

  it('broadcasts osm-batch-updated on every save', () => {
    const listener = vi.fn();
    window.addEventListener('osm-batch-updated', listener);
    BatchManager.add(tuple(14));
    window.removeEventListener('osm-batch-updated', listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('survives corrupt JSON in localStorage', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(BatchManager.STORAGE_KEY, '{not json');
    expect(BatchManager.getStagedItems()).toEqual([]);
  });
});

describe('WikidataEdit.addBatchOsmBacklinks', () => {
  let addOne;
  beforeEach(() => {
    vi.useFakeTimers();
    addOne = vi.spyOn(WikidataEdit, 'addOsmBacklink').mockResolvedValue({ success: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeItems = (n) => Array.from({ length: n }, (_, i) => ({ qid: `Q${i + 1}`, osm_type: 'node', osm_id: i + 1 }));

  it('returns an empty summary without a batch id for no items', async () => {
    expect(await WikidataEdit.addBatchOsmBacklinks([])).toEqual({ total: 0, successful: 0, failed: 0, batchId: null });
  });

  it('processes at most 25 items', async () => {
    const run = WikidataEdit.addBatchOsmBacklinks(makeItems(40));
    await vi.runAllTimersAsync();
    const summary = await run;
    expect(summary.total).toBe(25);
    expect(addOne).toHaveBeenCalledTimes(25);
  });

  it('waits 600 ms between edits and not after the last one', async () => {
    const run = WikidataEdit.addBatchOsmBacklinks(makeItems(3));
    await vi.advanceTimersByTimeAsync(0);
    expect(addOne).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(599);
    expect(addOne).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(addOne).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(600);
    expect(addOne).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    expect((await run).successful).toBe(3);
  });

  it('shares one EditGroups batch id across the whole run', async () => {
    const run = WikidataEdit.addBatchOsmBacklinks(makeItems(3));
    await vi.runAllTimersAsync();
    const { batchId } = await run;
    expect(batchId).toMatch(/^[0-9a-f]{8}$/);
    expect(addOne.mock.calls.every((c) => c[3] === batchId)).toBe(true);
  });

  it('counts failures and keeps going', async () => {
    addOne.mockRejectedValueOnce(new Error('boom'));
    const run = WikidataEdit.addBatchOsmBacklinks(makeItems(3));
    await vi.runAllTimersAsync();
    expect(await run).toMatchObject({ total: 3, successful: 2, failed: 1 });
  });

  it('reports progress after every item', async () => {
    const onProgress = vi.fn();
    const run = WikidataEdit.addBatchOsmBacklinks(makeItems(2), onProgress);
    await vi.runAllTimersAsync();
    await run;
    expect(onProgress.mock.calls.map((c) => c.slice(0, 4))).toEqual([
      [1, 2, 1, 0],
      [2, 2, 2, 0],
    ]);
  });

  it('stops when cancelBatch() is called', async () => {
    const run = WikidataEdit.addBatchOsmBacklinks(makeItems(5));
    await vi.advanceTimersByTimeAsync(0);
    WikidataEdit.cancelBatch();
    await vi.runAllTimersAsync();
    const summary = await run;
    expect(summary.cancelled).toBe(true);
    expect(addOne).toHaveBeenCalledTimes(1);
  });
});
