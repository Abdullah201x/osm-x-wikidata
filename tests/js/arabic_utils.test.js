import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './load-script.js';

let ArabicUtils;
beforeAll(() => {
  ArabicUtils = loadScript('arabic_utils.js', ['ArabicUtils']).ArabicUtils;
});

describe('ArabicUtils.normalize', () => {
  it('returns an empty string for falsy input', () => {
    expect(ArabicUtils.normalize('')).toBe('');
    expect(ArabicUtils.normalize(null)).toBe('');
    expect(ArabicUtils.normalize(undefined)).toBe('');
  });

  it('unifies hamza forms of alef', () => {
    for (const a of ['أحمد', 'إحمد', 'آحمد']) {
      expect(ArabicUtils.normalize(a)).toBe(ArabicUtils.normalize('احمد'));
    }
  });

  it('unifies taa marbuta and haa', () => {
    expect(ArabicUtils.normalize('مدرسة')).toBe(ArabicUtils.normalize('مدرسه'));
  });

  it('unifies alef maqsura and yaa', () => {
    expect(ArabicUtils.normalize('مصطفى')).toBe(ArabicUtils.normalize('مصطفي'));
  });

  it('removes tashkeel and tatweel', () => {
    expect(ArabicUtils.normalize('مَسْجِد')).toBe(ArabicUtils.normalize('مسجد'));
    expect(ArabicUtils.normalize('مســجد')).toBe(ArabicUtils.normalize('مسجد'));
  });

  it('strips the definite article only when asked', () => {
    expect(ArabicUtils.normalize('الرياض', true)).toBe(ArabicUtils.normalize('رياض', true));
    expect(ArabicUtils.normalize('الرياض', false)).not.toBe(ArabicUtils.normalize('رياض', false));
  });

  it('lowercases Latin text', () => {
    expect(ArabicUtils.normalize('Riyadh')).toBe('riyadh');
  });
});

describe('ArabicUtils.stripNoise', () => {
  it('drops generic words and keeps the distinctive stem', () => {
    const out = ArabicUtils.stripNoise('hotel marriott');
    expect(out).toContain('marriott');
    expect(out).not.toContain('hotel');
  });

  it('falls back to the full name when every word is generic', () => {
    expect(ArabicUtils.stripNoise('hotel')).not.toBe('');
  });

  it('returns empty for empty input', () => {
    expect(ArabicUtils.stripNoise('')).toBe('');
  });
});

describe('ArabicUtils.matchesQuery (search filter)', () => {
  const item = [12345, 24.7, 46.7, 6, 0, 'جامع الراجحي', 'Al Rajhi Mosque'];

  it('matches everything on an empty or blank query', () => {
    expect(ArabicUtils.matchesQuery(item, '')).toBe(true);
    expect(ArabicUtils.matchesQuery(item, '   ')).toBe(true);
    expect(ArabicUtils.matchesQuery(item, undefined)).toBe(true);
  });

  it('matches by QID with and without the Q prefix', () => {
    expect(ArabicUtils.matchesQuery(item, 'Q12345')).toBe(true);
    expect(ArabicUtils.matchesQuery(item, 'q12345')).toBe(true);
    expect(ArabicUtils.matchesQuery(item, '12345')).toBe(true);
  });

  it('matches the English name case-insensitively', () => {
    expect(ArabicUtils.matchesQuery(item, 'rajhi')).toBe(true);
  });

  it('matches the Arabic name, including hamza and article variants', () => {
    expect(ArabicUtils.matchesQuery(item, 'الراجحي')).toBe(true);
    expect(ArabicUtils.matchesQuery(item, 'راجحي')).toBe(true);
  });

  it('rejects an unrelated query', () => {
    expect(ArabicUtils.matchesQuery(item, 'zzzz')).toBe(false);
    expect(ArabicUtils.matchesQuery(item, 'جدة')).toBe(false);
  });

  it('copes with items that have no names', () => {
    expect(ArabicUtils.matchesQuery([1, 0, 0, 1, 0], 'abc')).toBe(false);
  });
});
