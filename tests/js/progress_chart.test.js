import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadScript } from './load-script.js';

let ProgressChart;
let TRANSLATIONS;

beforeAll(() => {
  ({ TRANSLATIONS } = loadScript('translations.js', ['TRANSLATIONS']));
  ({ ProgressChart } = loadScript('progress_chart.js', ['ProgressChart']));
});

const row = (date, cc, linked, missing) => ({ date, cc, linked, candidates: 0, missing_backlink: missing, broken: 0, conflict: 0 });
const ROWS = [
  row('2026-11-01', 'sa', 100, 50),
  row('2026-11-01', 'bh', 10, 5),
  row('2026-11-02', 'sa', 110, 40),
  row('2026-11-03', 'sa', 125, 45),
];
const COUNTRIES = { SA: { name_en: 'Saudi Arabia', name_ar: 'السعودية' }, BH: { name_en: 'Bahrain', name_ar: 'البحرين' } };

describe('ProgressChart helpers', () => {
  it('groups rows per country, oldest first', () => {
    const g = ProgressChart.groupByCountry([ROWS[2], ROWS[0], ROWS[1], ROWS[3]]);
    expect(Object.keys(g).sort()).toEqual(['bh', 'sa']);
    expect(g.sa.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('scales sparkline points into the 96x24 box (min at the bottom, max at the top)', () => {
    expect(ProgressChart.sparkPoints([0, 10])).toBe('2.0,22.0 94.0,2.0');
    expect(ProgressChart.sparkPoints([5, 5, 5])).toBe('2.0,12.0 48.0,12.0 94.0,12.0');
    expect(ProgressChart.sparkPoints([7])).toBe('48.0,12.0');
    expect(ProgressChart.sparkPoints([])).toBe('');
  });
});

describe('ProgressChart.render', () => {
  let el;
  beforeEach(() => {
    document.body.innerHTML = '<div id="about-progress"></div>';
    el = document.getElementById('about-progress');
  });

  it('draws one row per country with linked rising (good) and back-links falling (good)', () => {
    ProgressChart.render(el, ROWS, { t: TRANSLATIONS.en, lang: 'en', countries: COUNTRIES });
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.dataset.cc)).toEqual(['bh', 'sa']);

    const sa = el.querySelector('tr[data-cc="sa"]');
    expect(sa.querySelector('.progress-country').textContent).toBe('Saudi Arabia');
    const linked = sa.querySelector('[data-field="linked"]');
    expect(linked.classList.contains('trend-good')).toBe(true);
    expect(linked.querySelector('.progress-val').textContent).toBe('125');
    expect(linked.querySelector('.progress-delta').textContent).toBe('+25');
    expect(linked.querySelectorAll('polyline')).toHaveLength(1);
    expect(linked.querySelector('svg').getAttribute('aria-label')).toBe('Linked in OSM: 100 → 110 → 125');

    const missing = sa.querySelector('[data-field="missing_backlink"]');
    expect(missing.classList.contains('trend-good')).toBe(true); // 50 -> 45: fewer missing back-links
    expect(missing.querySelector('.progress-delta').textContent).toBe('−5');

    // A single data point has no delta and a flat trend.
    const bh = el.querySelector('tr[data-cc="bh"] [data-field="linked"]');
    expect(bh.classList.contains('trend-flat')).toBe(true);
    expect(bh.querySelector('.progress-delta')).toBeNull();

    expect(el.querySelector('.progress-caption').textContent).toBe('2026-11-01 to 2026-11-03');
    // No inline styles: the CSP forbids them.
    expect(el.innerHTML).not.toContain('style=');
  });

  it('uses Arabic country names and digits in Arabic', () => {
    ProgressChart.render(el, ROWS, { t: TRANSLATIONS.ar, lang: 'ar', countries: COUNTRIES });
    expect(el.querySelector('tr[data-cc="sa"] .progress-country').textContent).toBe('السعودية');
    expect(el.querySelector('tr[data-cc="sa"] [data-field="linked"] .progress-val').textContent).toBe((125).toLocaleString('ar-SA'));
  });

  it('shows an empty note without rows', () => {
    ProgressChart.render(el, [], { t: TRANSLATIONS.en });
    expect(el.textContent).toBe(TRANSLATIONS.en.progressEmpty);
  });
});

describe('ProgressChart.show', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('explains when progress.json cannot be loaded', async () => {
    document.body.innerHTML = '<div id="about-progress"></div>';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await ProgressChart.show({ t: TRANSLATIONS.en, lang: 'en', countries: COUNTRIES });
    expect(document.getElementById('about-progress').textContent).toBe(TRANSLATIONS.en.progressUnavailable);
  });

  it('fetches once and renders', async () => {
    document.body.innerHTML = '<div id="about-progress"></div>';
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: 1, rows: ROWS }) }));
    vi.stubGlobal('fetch', fetchMock);
    await ProgressChart.show({ t: TRANSLATIONS.en, lang: 'en', countries: COUNTRIES });
    await ProgressChart.show({ t: TRANSLATIONS.en, lang: 'en', countries: COUNTRIES });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('#about-progress tbody tr')).toHaveLength(2);
  });
});
