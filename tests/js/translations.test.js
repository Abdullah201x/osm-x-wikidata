import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './load-script.js';

let T;
beforeAll(() => {
  T = loadScript('translations.js', ['TRANSLATIONS']).TRANSLATIONS;
});

describe('translations', () => {
  it('defines exactly the ar and en locales', () => {
    expect(Object.keys(T).sort()).toEqual(['ar', 'en']);
  });

  it('has identical key sets in ar and en', () => {
    const ar = Object.keys(T.ar);
    const en = Object.keys(T.en);
    expect(ar.filter((k) => !(k in T.en))).toEqual([]);
    expect(en.filter((k) => !(k in T.ar))).toEqual([]);
  });

  it.each(['ar', 'en'])('has no empty strings in %s', (lang) => {
    const empty = Object.entries(T[lang]).filter(([, v]) => typeof v === 'string' && v.trim() === '');
    expect(empty.map(([k]) => k)).toEqual([]);
  });

  it.each(['ar', 'en'])('has no undefined or null values in %s', (lang) => {
    const bad = Object.entries(T[lang]).filter(([, v]) => v === undefined || v === null);
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('keeps value types aligned between locales (string vs function vs object)', () => {
    const mismatched = Object.keys(T.ar).filter((k) => typeof T.ar[k] !== typeof T.en[k]);
    expect(mismatched).toEqual([]);
  });

  it('actually uses Arabic script in ar and Latin script in en for the title', () => {
    expect(T.ar.mainTitle).toMatch(/[؀-ۿ]/);
    expect(T.en.mainTitle).toMatch(/[A-Za-z]/);
  });

  it('keeps {placeholder} tokens consistent between locales', () => {
    const tokens = (s) => (typeof s === 'string' ? (s.match(/\{\w+\}/g) || []).sort().join(',') : '');
    const drift = Object.keys(T.ar).filter((k) => tokens(T.ar[k]) !== tokens(T.en[k]));
    expect(drift).toEqual([]);
  });
});
