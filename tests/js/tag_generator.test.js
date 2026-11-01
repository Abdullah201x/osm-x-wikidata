import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './load-script.js';

let TagGenerator;
beforeAll(() => {
  TagGenerator = loadScript('tag_generator.js', ['TagGenerator']).TagGenerator;
});

// [0:qid, 1:lat, 2:lon, 3:cat, 4:status, 5:name_ar, 6:name_en, 7:p31, 8:osm_ref, 9:cand, 10:image, 11:wiki_ar, 12:website, 13:dissolved, 14:social]
const tuple = (over = {}) => {
  const base = [100, 24.5, 46.5, 5, 0, '', '', '', '', '', '', '', '', '', ''];
  for (const [i, v] of Object.entries(over)) base[i] = v;
  return base;
};

describe('TagGenerator.generateTags', () => {
  it('always sets wikidata=Q<number>', () => {
    expect(TagGenerator.generateTags(tuple()).wikidata).toBe('Q100');
  });

  it('uses Arabic as the default name and adds name:ar / name:en', () => {
    const tags = TagGenerator.generateTags(tuple({ 5: 'الخبر', 6: 'Al Khobar' }));
    expect(tags).toMatchObject({ name: 'الخبر', 'name:ar': 'الخبر', 'name:en': 'Al Khobar' });
  });

  it('falls back to the English name when there is no Arabic one', () => {
    const tags = TagGenerator.generateTags(tuple({ 6: 'Khobar' }));
    expect(tags.name).toBe('Khobar');
    expect(tags['name:ar']).toBeUndefined();
  });

  it('omits name:en when identical to the Arabic name', () => {
    expect(TagGenerator.generateTags(tuple({ 5: 'X', 6: 'X' }))['name:en']).toBeUndefined();
  });

  it('derives an ar: wikipedia tag from the article URL', () => {
    const tags = TagGenerator.generateTags(tuple({ 11: 'https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6' }));
    expect(tags.wikipedia).toBe('ar:الرياض');
  });

  it('ignores a malformed wikipedia URL instead of throwing', () => {
    expect(() => TagGenerator.generateTags(tuple({ 11: 'not a url' }))).not.toThrow();
    expect(TagGenerator.generateTags(tuple({ 11: 'not a url' })).wikipedia).toBeUndefined();
  });

  it('maps website and the pipe-separated social handles', () => {
    const tags = TagGenerator.generateTags(tuple({ 12: 'https://example.org', 14: 'tw||fb' }));
    expect(tags.website).toBe('https://example.org');
    expect(tags['contact:twitter']).toBe('tw');
    expect(tags['contact:instagram']).toBeUndefined();
    expect(tags['contact:facebook']).toBe('fb');
  });

  it('detects mosques from the Arabic name', () => {
    const tags = TagGenerator.generateTags(tuple({ 5: 'مسجد النور' }));
    expect(tags).toMatchObject({ amenity: 'place_of_worship', religion: 'muslim' });
  });

  it('does not mistake a university (جامعة) for a mosque (جامع)', () => {
    const tags = TagGenerator.generateTags(tuple({ 5: 'جامعة الملك سعود', 3: 4 }));
    expect(tags.amenity).toBe('university');
    expect(tags.religion).toBeUndefined();
  });

  it.each([
    ['National Bank', { amenity: 'bank' }],
    ['Fuel station', { amenity: 'fuel' }],
    ['City Hospital', { amenity: 'hospital' }],
    ['Central School', { amenity: 'school' }],
    ['Grand Hotel', { tourism: 'hotel' }],
    ['Red Castle', { historic: 'castle' }],
  ])('detects "%s" from the English name', (name, expected) => {
    expect(TagGenerator.generateTags(tuple({ 6: name }))).toMatchObject(expected);
  });

  it.each([
    [1, { place: 'village' }],
    [2, { historic: 'heritage' }],
    [3, { natural: 'feature' }],
    [4, { amenity: 'public_facility' }],
    [5, { tourism: 'attraction' }],
  ])('falls back on category %i when nothing else matches', (cat, expected) => {
    expect(TagGenerator.generateTags(tuple({ 3: cat, 6: 'Zzz' }))).toMatchObject(expected);
  });

  it('prefers the P31 ontology over name heuristics', () => {
    const [p31, mapped] = Object.entries(TagGenerator.ontology)[0];
    const tags = TagGenerator.generateTags(tuple({ 7: p31, 6: 'Some Hotel' }));
    expect(tags).toMatchObject(mapped);
    expect(tags.tourism).not.toBe('hotel');
  });

  it('turns an amenity into disused:amenity with an end_date for dissolved features', () => {
    const tags = TagGenerator.generateTags(tuple({ 6: 'Old Bank', 13: '1990' }));
    expect(tags.end_date).toBe('1990');
    expect(tags.amenity).toBeUndefined();
    expect(tags['disused:amenity']).toBe('bank');
    expect(tags.historic).toBe('ruins');
  });
});

describe('TagGenerator formatters', () => {
  const tags = { name: 'A&B', wikidata: 'Q1' };

  it('formatAsLines emits one key=value per line', () => {
    expect(TagGenerator.formatAsLines(tags)).toBe('name=A&B\nwikidata=Q1');
  });

  it('formatForJosmUrl percent-encodes values and joins with an encoded pipe', () => {
    expect(TagGenerator.formatForJosmUrl(tags)).toBe('name=A%26B%7Cwikidata=Q1');
  });

  it('formatAsOsmXml escapes XML special characters', () => {
    const xml = TagGenerator.formatAsOsmXml([1, 10, 20], { name: `A&B <"'>` });
    expect(xml).toContain(`lat='10' lon='20'`);
    expect(xml).toContain('A&amp;B &lt;&quot;&apos;&gt;');
    expect(xml).not.toContain('A&B');
  });
});
