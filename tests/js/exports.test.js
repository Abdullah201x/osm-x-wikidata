import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript } from './load-script.js';

let MappingTools;
beforeAll(() => {
  loadScript('translations.js', ['TRANSLATIONS']);
  loadScript('osm_oauth.js', ['OsmAuth']);
  loadScript('tag_generator.js', ['TagGenerator']);
  MappingTools = loadScript('tools.js', ['MappingTools']).MappingTools;
});

let download;
beforeEach(() => {
  download = vi.spyOn(MappingTools, '_downloadFile').mockImplementation(() => {});
});

// [0:qid, 1:lat, 2:lon, 3:cat, 4:status, 5:name_ar, 6:name_en, 7:p31, 8:osm_ref, 9:cand, 10:image, 11:wiki_ar, 12:website, 13:dissolved]
const items = [
  [111, 24.7, 46.7, 6, 0, 'مسجد "النور"', 'Al Noor, Mosque', 'Q32815', '', 'cand', '', '', 'https://a.example', ''],
  [222, 21.5, 39.2, 5, 2, '', 'Jeddah Fort', '', 'w42', '', '', '', '', '1950'],
];

describe('QuickStatements', () => {
  it.each([
    ['n123', 'P11693', '123'],
    ['node/123', 'P11693', '123'],
    ['w456', 'P10689', '456'],
    ['way/456', 'P10689', '456'],
    ['r789', 'P402', '789'],
    ['relation/789', 'P402', '789'],
  ])('maps %s to %s with the bare numeric id', (ref, prop, id) => {
    expect(MappingTools.getQuickStatements('Q1', ref)).toBe(`Q1\t${prop}\t"${id}"`);
  });

  it('emits an empty-value command when the reference is unusable', () => {
    expect(MappingTools.getQuickStatements('Q1', '')).toBe('Q1|P11693|""');
    expect(MappingTools.getQuickStatements('Q1', 'garbage')).toBe('Q1|P11693|""');
  });

  it('batch export only includes missing_backlink fixes that target wikidata', () => {
    const out = MappingTools.generateQuickStatementsBatch([
      { kind: 'missing_backlink', qid: 'Q1', suggested_fix: { target: 'wikidata', property: 'P11693', value: '10' } },
      { kind: 'missing_backlink', qid: 'Q2', suggested_fix: { target: 'wikidata', property: 'P10689', value: '20' } },
      { kind: 'broken_tag', qid: 'Q3', suggested_fix: { target: 'osm', property: 'wikidata', value: 'Q9' } },
      { kind: 'missing_backlink', qid: 'Q4', suggested_fix: { target: 'wikidata', property: 'P402' } },
      { kind: 'missing_backlink', qid: 'Q5' },
    ]);
    expect(out).toBe('Q1\tP11693\t"10"\nQ2\tP10689\t"20"');
  });

  it('batch export of nothing is an empty string', () => {
    expect(MappingTools.generateQuickStatementsBatch([])).toBe('');
  });
});

describe('CSV export', () => {
  const run = () => {
    MappingTools.exportCsv(items, 'SA');
    const [filename, content, mime] = download.mock.calls[0];
    return { filename, content, mime };
  };

  it('names the file after the lowercase country code', () => {
    expect(run().filename).toBe('osm_wikidata_sa.csv');
  });

  it('starts with a UTF-8 BOM so Excel reads Arabic', () => {
    expect(run().content.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes the header row and one row per item', () => {
    const lines = run().content.slice(1).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('QID,Latitude,Longitude')).toBe(true);
    expect(lines[1].startsWith('Q111,24.7,46.7,6,0,')).toBe(true);
  });

  it('doubles embedded quotes and keeps commas inside quoted cells', () => {
    const row = run().content.slice(1).split('\n')[1];
    expect(row).toContain('"مسجد ""النور"""');
    expect(row).toContain('"Al Noor, Mosque"');
  });
});

describe('MapRoulette export', () => {
  const run = () => {
    MappingTools.exportMapRoulette(items, 'SA');
    const [filename, content, mime] = download.mock.calls[0];
    return { filename, geo: JSON.parse(content), mime };
  };

  it('produces a FeatureCollection with one Point per item', () => {
    const { geo } = run();
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features).toHaveLength(2);
    expect(geo.features.every((f) => f.type === 'Feature' && f.geometry.type === 'Point')).toBe(true);
  });

  it('writes coordinates in GeoJSON [lon, lat] order', () => {
    expect(run().geo.features[0].geometry.coordinates).toEqual([46.7, 24.7]);
  });

  it('translates status codes into labels', () => {
    const f = run().geo.features;
    expect(f[0].properties.status).toBe('Missing in OSM');
    expect(f[1].properties.status).toBe('Linked');
  });

  it('writes an instruction that names the feature and the wikidata tag', () => {
    expect(run().geo.features[1].properties.instruction).toContain('Jeddah Fort');
    expect(run().geo.features[1].properties.instruction).toContain('wikidata=Q222');
  });

  it('uses the geo+json MIME type and a lowercase filename', () => {
    const { filename, mime } = run();
    expect(filename).toBe('maproulette_sa_tasks.geojson');
    expect(mime).toBe('application/geo+json');
  });
});

describe('JOSM presets export', () => {
  it('escapes XML special characters in item names', () => {
    MappingTools.exportJosmPresets(items, 'sa');
    const xml = download.mock.calls[0][1];
    expect(xml).toContain('&quot;النور&quot;');
    expect(xml).not.toContain('"النور"');
    expect(xml).toContain('<key key="wikidata" value="Q111"/>');
  });

  it('groups by category with a readable group name', () => {
    MappingTools.exportJosmPresets(items, 'sa');
    const xml = download.mock.calls[0][1];
    expect(xml).toContain('<group name="Places of Worship">');
    expect(xml).toContain('<group name="Tourism and Commercial">');
  });
});

describe('Overpass query and search links', () => {
  it('escapes double quotes in the feature name', () => {
    const q = MappingTools.generateOverpassQuery([1, 24, 46, 6, 0, 'a"b', ''], { amenity: 'x' });
    expect(q).toContain('nwr["name"="a\\"b"]');
  });

  it('builds a bbox around the item and highlights the linked QID', () => {
    const q = MappingTools.generateOverpassQuery([123, 24, 46, 6, 0, 'n', ''], { tourism: 'hotel' });
    expect(q).toContain('[bbox:23.9800,45.9800,24.0200,46.0200]');
    expect(q).toContain('"wikidata"="Q123"');
    expect(q).toContain('nwr["tourism"="hotel"]');
  });

  it('URL-encodes search terms', () => {
    expect(MappingTools.getWikidataSearchUrl('a b&c')).toBe('https://www.wikidata.org/w/index.php?search=a%20b%26c');
    expect(MappingTools.getGoogleSearchUrl('x y')).toContain('q=x%20y');
  });

  it('builds the iD editor deep link', () => {
    expect(MappingTools.getIdEditorUrl(24.5, 46.5)).toBe('https://www.openstreetmap.org/edit?editor=id#map=19/24.5/46.5');
  });
});

describe('JOSM remote control', () => {
  beforeEach(() => {
    globalThis.currentLang = 'en';
  });

  it('selects the element in load_and_zoom using the long type name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    await MappingTools.josmLoadAndZoom(24, 46, 'n99');
    expect(fetchMock.mock.calls[0][0]).toContain('http://127.0.0.1:8111/load_and_zoom?');
    expect(fetchMock.mock.calls[0][0]).toContain('&select=node99');
  });

  it('passes the wikidata tag and the OSM object URL to add_tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    await MappingTools.josmAddTags('w5', 'Q7');
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('add_tags?tags=wikidata%3DQ7');
    expect(url).toContain(encodeURIComponent('https://www.openstreetmap.org/way/5'));
  });

  it('alerts and resolves false when JOSM is not running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    expect(await MappingTools.josmLoadAndZoom(24, 46)).toBe(false);
    expect(alertMock).toHaveBeenCalledOnce();
  });
});
