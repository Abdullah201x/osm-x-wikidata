import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadScript } from './load-script.js';

let HistoryManager;
let osmHistory = [];
let wdHistory = [];

beforeAll(() => {
  loadScript('translations.js', ['TRANSLATIONS']);
  loadScript('tools.js', ['escapeHtml']);
  globalThis.OsmAuth = {
    getChangesetHistory: () => osmHistory,
    parseOsmRef: (ref) => {
      const m = String(ref).match(/^(node|way|relation)\/(\d+)$/);
      return m ? { type: m[1], id: m[2] } : null;
    },
  };
  globalThis.WikidataEdit = { getEditHistory: () => wdHistory };
  ({ HistoryManager } = loadScript('history_manager.js', ['HistoryManager']));
});

const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 11, 6, 15);

describe('HistoryManager.isRepairRecord', () => {
  it.each([
    [{ isRepair: true, comment: 'anything' }, true],
    [{ comment: 'Migrate wikidata tag to brand:wikidata=Q1 on node/1 #osm-wikidata-gcc' }, true],
    [{ comment: 'Remove invalid wikidata tag (Q9) from way/2 #osm-wikidata-gcc' }, true],
    [{ comment: 'Update brand:wikidata tag on node/3 (Q1 -> Q2) #osm-wikidata-gcc' }, true],
    [{ comment: 'Add wikidata=Q1 to node/1 #osm-wikidata-gcc' }, false],
    [{ isBatch: true, comment: 'Migrate wikidata tag to x' }, false],
    [null, false],
  ])('%j -> %s', (cs, expected) => {
    expect(HistoryManager.isRepairRecord(cs)).toBe(expected);
  });
});

describe('HistoryManager.computePace', () => {
  it('buckets the last 7 local days, oldest first, today last', () => {
    const pace = HistoryManager.computePace([], [], NOW);
    expect(pace.days.map((d) => d.key)).toEqual([
      '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
    ]);
    expect(pace.today.key).toBe('2026-11-06');
    expect(pace.today.total).toBe(0);
  });

  it('counts OSM elements per changeset and one per Wikidata statement', () => {
    const osm = [
      { timestamp: at(2026, 11, 6, 9), isBatch: true, itemCount: 25 },
      { timestamp: at(2026, 11, 6, 10), isBatch: false, items: [{}] },
      { timestamp: at(2026, 11, 4), isBatch: true, items: [{}, {}, {}] },
      { timestamp: at(2026, 10, 20), isBatch: true, itemCount: 99 }, // outside the window
    ];
    const wd = [
      { timestamp: at(2026, 11, 6, 8), batchId: 'b1' },
      { timestamp: at(2026, 11, 6, 8), batchId: 'b1' },
      { timestamp: at(2026, 11, 6, 9), batchId: 'b2' },
      { timestamp: at(2026, 11, 5) },
    ];
    const pace = HistoryManager.computePace(osm, wd, NOW);
    expect(pace.today).toMatchObject({ osm: 26, wd: 3, total: 29 });
    expect(pace.batchesToday).toBe(3); // one OSM batch + two Wikidata batches
    expect(pace.days.find((d) => d.key === '2026-11-04').total).toBe(3);
    expect(pace.days.find((d) => d.key === '2026-11-05').total).toBe(1);
    expect(pace.days.reduce((n, d) => n + d.total, 0)).toBe(33);
  });
});

describe('HistoryManager tabs and pace panel', () => {
  beforeEach(() => {
    const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.html'), 'utf8');
    const start = html.indexOf('<div id="history-page-modal"');
    const end = html.indexOf('<div id="loading-indicator"');
    document.body.innerHTML = html.slice(start, end);
    window.currentLang = 'en';
    const now = Date.now();
    osmHistory = [
      { changesetId: '1', changesetUrl: 'https://osm.org/changeset/1', timestamp: now, isBatch: false, itemCount: 1,
        comment: 'Link Q1', items: [{ name: 'Linked place', qid: 'Q1', osmRef: 'node/1' }] },
      { changesetId: '2', changesetUrl: 'https://osm.org/changeset/2', timestamp: now, isBatch: false, isRepair: true,
        repairType: 'migrate', itemCount: 1, comment: 'fix', items: [{ name: 'Repaired place', qid: 'Q2', osmRef: 'way/2' }] },
    ];
    wdHistory = [{ qid: 'Q3', property: 'P11693', osmType: 'node', osmId: '3', batchId: 'b', timestamp: now }];
    HistoryManager.activeTab = 'osm';
    HistoryManager.searchQuery = '';
    HistoryManager.activeFilter = 'all';
    HistoryManager.init();
  });

  const cards = () => [...document.querySelectorAll('#history-timeline-container .history-card')].map((c) => c.dataset.csid);

  it('the OSM tab hides repairs; the Reverse fixes tab shows only repairs', () => {
    HistoryManager.render();
    expect(cards()).toEqual(['1']);

    document.getElementById('btn-hist-tab-fixes').click();
    expect(HistoryManager.activeTab).toBe('fixes');
    expect(cards()).toEqual(['2']);
    expect(document.querySelector('.history-type-pill.repair').textContent).toContain('Repair (migrate)');
    expect(document.getElementById('btn-hist-tab-fixes').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('btn-hist-tab-osm').getAttribute('aria-selected')).toBe('false');

    document.getElementById('btn-hist-tab-wd').click();
    expect(HistoryManager.activeTab).toBe('wikidata');
    expect(document.getElementById('history-timeline-container').textContent).toContain('Q3');
  });

  it('renders today\'s count, a 7-bar chart and the batch-cap hint', () => {
    HistoryManager.render();
    expect(document.getElementById('history-pace-today-val').textContent).toBe('3');
    expect(document.getElementById('history-pace-breakdown').textContent).toContain('2 OSM elements');
    expect(document.getElementById('history-pace-breakdown').textContent).toContain('1 Wikidata statements');
    const bars = document.querySelectorAll('#history-pace-chart rect.pace-bar');
    expect(bars).toHaveLength(7);
    expect(bars[6].getAttribute('class')).toContain('is-today');
    expect(bars[6].dataset.total).toBe('3');
    expect(document.getElementById('history-pace-hint').textContent).toContain('capped at 25');
    expect(document.getElementById('history-pace').classList.contains('is-high')).toBe(false);
  });

  it('nudges a pause above the soft daily limit', () => {
    osmHistory.push({ changesetId: '3', timestamp: Date.now(), isBatch: true, itemCount: 120, items: [] });
    HistoryManager.render();
    expect(document.getElementById('history-pace').classList.contains('is-high')).toBe(true);
    expect(document.getElementById('history-pace-hint').textContent).toContain('123 edits today');
  });
});
